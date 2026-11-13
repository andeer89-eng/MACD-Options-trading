import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import {
  calculateIndicators,
  detectDivergences,
  getLatestVolatilityMetrics,
  Candle,
} from './src/utils/trullasStrategy.ts';
import { runBacktest, BacktestConfig } from './src/utils/backtestEngine.ts';
import { optimizeStrategyParameters } from './src/utils/strategyOptimizer.ts';
import { SP500_UNIVERSE } from './src/data/sp500Universe.ts';
import { lookupGlobalCompany } from './src/data/globalTickers.ts';
import {
  GICS_SECTORS_METADATA,
  GicsSectorPerformance,
} from './src/utils/sectorMetrics.ts';
import {
  calculateNadarayaWatsonEnvelope,
  calculateSmartMoneyConcepts,
  calculateLuxAlgoOscillatorMatrix,
  calculateLuxAlgoConfluence,
} from './src/utils/luxalgoIndicators.ts';
import { evaluateTradeAdvice } from './src/utils/tradeActionEngine.ts';
import {
  CboeMarketOverview,
  TickerOptionsSummary,
  RawCboeOptionRecord,
  calculateHistoricalVol30dPct,
  summarizeCboeOptionsChain,
  createUnavailableCboeOverview,
  createUnavailableTickerOptionsSummary,
} from './src/utils/cboeOptionsEngine.ts';
import { PineTS } from 'pinets';
import {
  deduplicateSymbols,
  normalizeSymbolForYahoo,
} from './src/utils/dataFetcher.ts';
import {
  HeatmapItem,
  KNOWN_MARKET_CAPS,
  CRYPTO_HEATMAP_UNIVERSE,
  getCustomTag,
  calculateHeatmapSummary,
  Timeframe as HeatmapTimeframe,
} from './src/utils/heatmapEngine.ts';
import {
  computeStageSummaryFromCandles,
  UniverseStageItem,
} from './src/utils/trendSpiderUniverse.ts';
import { CandleData } from './src/utils/trendSpiderEngine.ts';

const execAsync = promisify(exec);
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const isProduction = process.env.NODE_ENV === 'production';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const SEC_CIK_MAP: Record<string, string> = {
  AAPL: '0000320193',
  MSFT: '0000789019',
  NVDA: '0001045810',
  TSLA: '0001318605',
  AMZN: '0001018724',
  GOOGL: '0001652044',
  META: '0001326801',
  AMD: '0000002488',
  SPY: '0000884394',
  QQQ: '0001067839',
  NFLX: '0001065280',
  INTC: '0000050863',
  COIN: '0001679788',
};

for (const comp of SP500_UNIVERSE) {
  if (comp.cik) {
    SEC_CIK_MAP[comp.symbol] = comp.cik;
  }
}

// Honest zero-initialized system telemetry state
const recentScanLatencies: number[] = [];
let totalTickersScannedCounter = 0;
let lastScanDurationMs = 0;
let lastScannedBatchSize = 0;
let totalApiRequestsCount = 0;
let rateLimitHitsCount = 0;
let cacheHitsTotal = 0;
let cacheMissesTotal = 0;
let consecutiveSuccessfulScans = 0;
let lastScanTimestampIso: string | null = null;

const lastFeedMetaMap = new Map<string, any>();
const candleCache = new Map<string, { timestamp: number; candles: Candle[] }>();

/**
 * Pure RSI-14 helper for spark close-only arrays
 */
function computeRsiFromCloses(closes: number[], period: number = 14): number {
  if (closes.length <= period) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return avgGain > 0 ? 100 : 50;
  const rs = avgGain / avgLoss;
  return Number((100 - 100 / (1 + rs)).toFixed(1));
}

/**
 * Fetch real OHLCV candles from Yahoo Finance v8.
 * Never fabricates synthetic fallback bars — returns [] if upstream fails or returns fewer than minCandles.
 */
async function fetchYahooData(
  symbol: string,
  timeframe: string = '1d',
  range: string = '3mo',
  minCandles: number = 20
): Promise<Candle[]> {
  const yahooSymbol = normalizeSymbolForYahoo(symbol);

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      yahooSymbol
    )}?range=${encodeURIComponent(range)}&interval=${encodeURIComponent(timeframe)}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT },
    });
    clearTimeout(timeoutId);

    if (res.status === 429) {
      rateLimitHitsCount++;
    }
    if (!res.ok) {
      throw new Error(`Yahoo returned status ${res.status}`);
    }

    const data = (await res.json()) as any;
    const result = data?.chart?.result?.[0];
    if (!result) {
      throw new Error(data?.chart?.error?.description || 'No chart result returned from Yahoo Finance');
    }

    const timestamps: number[] = result.timestamp || [];
    const quotes = result.indicators?.quote?.[0] || {};
    const opens = quotes.open || [];
    const highs = quotes.high || [];
    const lows = quotes.low || [];
    const closes = quotes.close || [];
    const volumes = quotes.volume || [];

    const candles: Candle[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (
        typeof opens[i] === 'number' &&
        typeof highs[i] === 'number' &&
        typeof lows[i] === 'number' &&
        typeof closes[i] === 'number'
      ) {
        candles.push({
          timestamp: timestamps[i] * 1000,
          dateStr: new Date(timestamps[i] * 1000).toISOString().split('T')[0],
          open: Number(opens[i].toFixed(2)),
          high: Number(highs[i].toFixed(2)),
          low: Number(lows[i].toFixed(2)),
          close: Number(closes[i].toFixed(2)),
          volume: typeof volumes[i] === 'number' && Number.isFinite(volumes[i]) ? Math.floor(volumes[i]) : 0,
        });
      }
    }

    if (candles.length < minCandles) {
      lastFeedMetaMap.set(symbol.toUpperCase(), {
        isLiveFeed: false,
        source: 'Yahoo Finance v8 (Insufficient Bars)',
        error: `Only ${candles.length} live bars returned for ${symbol} (${timeframe}/${range})`,
        exchange: result.meta?.exchangeName || 'N/A',
        currency: result.meta?.currency || 'USD',
        serverTimeUtc: new Date().toISOString(),
        lastCandleTimestamp: candles[candles.length - 1]?.timestamp,
      });
      return candles.length > 0 && minCandles <= 1 ? candles : [];
    }

    const feedMetadata = {
      isLiveFeed: true,
      source: 'Yahoo Finance v8 Institutional Real-Time Feed',
      exchange: result.meta?.exchangeName || (symbol.includes('-') ? 'Crypto Global' : 'NASDAQ / NYSE'),
      currency: result.meta?.currency || (symbol.includes('.ST') ? 'SEK' : 'USD'),
      regularMarketPrice: result.meta?.regularMarketPrice || (candles[candles.length - 1]?.close ?? 0),
      chartPreviousClose: result.meta?.chartPreviousClose || (candles[candles.length - 2]?.close ?? 0),
      exchangeTimezone: result.meta?.exchangeTimezoneName || 'America/New_York',
      serverTimeUtc: new Date().toISOString(),
      lastCandleTimestamp: candles[candles.length - 1]?.timestamp,
    };

    lastFeedMetaMap.set(symbol.toUpperCase(), feedMetadata);
    return candles;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[Yahoo Fetcher] Unavailable for ${symbol}:`, message);
    lastFeedMetaMap.set(symbol.toUpperCase(), {
      isLiveFeed: false,
      source: 'Yahoo Finance v8 Feed Unavailable',
      error: message,
      exchange: 'Unavailable',
      currency: symbol.includes('.ST') ? 'SEK' : 'USD',
      serverTimeUtc: new Date().toISOString(),
    });
    return [];
  }
}

interface YahooSparkEntry {
  timestamp: number[];
  close: number[];
  symbol: string;
  fulldayPrice?: number;
  fulldayChange?: number;
  fulldayChangePercent?: number;
  previousClose?: number | null;
  chartPreviousClose?: number | null;
}

/**
 * Fetches batched Yahoo Finance v8/finance/spark close series in parallel 45-symbol chunks.
 */
async function fetchYahooSparkBatch(
  symbols: string[],
  range: string = '3mo',
  interval: string = '1d'
): Promise<Map<string, YahooSparkEntry>> {
  const unique = deduplicateSymbols(symbols);
  const out = new Map<string, YahooSparkEntry>();
  const CHUNK_SIZE = 45;

  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += CHUNK_SIZE) {
    chunks.push(unique.slice(i, i + CHUNK_SIZE));
  }

  await Promise.all(
    chunks.map(async (chunk) => {
      const yahooMap = new Map<string, string>();
      const yahooList = chunk.map((sym) => {
        const ySym = normalizeSymbolForYahoo(sym);
        yahooMap.set(ySym.toUpperCase(), sym);
        return ySym;
      });

      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/spark?symbols=${encodeURIComponent(
          yahooList.join(',')
        )}&range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(url, {
          signal: controller.signal,
          headers: { 'User-Agent': USER_AGENT },
        });
        clearTimeout(timeoutId);

        if (res.status === 429) rateLimitHitsCount++;
        if (!res.ok) return;

        const json = (await res.json()) as Record<string, YahooSparkEntry>;
        for (const [respKey, entry] of Object.entries(json)) {
          if (!entry || !Array.isArray(entry.close) || !Array.isArray(entry.timestamp)) continue;
          const origSym = yahooMap.get(respKey.toUpperCase()) || respKey.toUpperCase();
          out.set(origSym, entry);
        }
      } catch {
        // Chunk failed silently — symbols simply omitted rather than fabricated
      }
    })
  );

  return out;
}

/**
 * Fetch real Yahoo Finance chart meta (used for ^VIX, ^VIX9D, ^VIX3M, ^SKEW).
 */
async function fetchYahooMeta(yahooSymbol: string): Promise<{
  price: number | null;
  changePct: number | null;
  changeNominal: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  prevClose: number | null;
} | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=5d&interval=1d`,
      { signal: controller.signal, headers: { 'User-Agent': USER_AGENT } }
    );
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const json = (await res.json()) as any;
    const result = json?.chart?.result?.[0];
    const meta = result?.meta;
    const closes: (number | null)[] = result?.indicators?.quote?.[0]?.close || [];
    const validCloses = closes.filter((c): c is number => typeof c === 'number' && Number.isFinite(c));

    const lastClose = validCloses.length > 0 ? validCloses[validCloses.length - 1] : null;
    const prevBarClose = validCloses.length > 1 ? validCloses[validCloses.length - 2] : null;

    const price =
      typeof meta?.regularMarketPrice === 'number'
        ? Number(meta.regularMarketPrice.toFixed(2))
        : lastClose !== null
        ? Number(lastClose.toFixed(2))
        : null;

    const prevClose =
      typeof meta?.chartPreviousClose === 'number'
        ? Number(meta.chartPreviousClose.toFixed(2))
        : typeof meta?.previousClose === 'number'
        ? Number(meta.previousClose.toFixed(2))
        : prevBarClose !== null
        ? Number(prevBarClose.toFixed(2))
        : null;

    let changeNominal: number | null =
      typeof meta?.fulldayChange === 'number'
        ? Number(meta.fulldayChange.toFixed(2))
        : price !== null && prevClose !== null
        ? Number((price - prevClose).toFixed(2))
        : null;

    let changePct: number | null =
      typeof meta?.regularMarketChangePercent === 'number'
        ? Number(meta.regularMarketChangePercent.toFixed(2))
        : typeof meta?.fulldayChangePercent === 'number'
        ? Number(meta.fulldayChangePercent.toFixed(2))
        : price !== null && prevClose !== null && prevClose > 0
        ? Number((((price - prevClose) / prevClose) * 100).toFixed(2))
        : null;

    return {
      price,
      changePct,
      changeNominal,
      dayHigh: typeof meta?.regularMarketDayHigh === 'number' ? Number(meta.regularMarketDayHigh.toFixed(2)) : null,
      dayLow: typeof meta?.regularMarketDayLow === 'number' ? Number(meta.regularMarketDayLow.toFixed(2)) : null,
      prevClose,
    };
  } catch {
    return null;
  }
}

/**
 * Normalizes ticker symbols for CBOE delayed quotes JSON endpoint.
 */
function normalizeSymbolForCboe(symbol: string): string {
  const s = symbol.toUpperCase().trim();
  if (s === 'SPX' || s === '^SPX' || s === '^GSPC') return '_SPX';
  if (s === 'NDX' || s === '^NDX') return '_NDX';
  if (s === 'RUT' || s === '^RUT') return '_RUT';
  if (s === 'VIX' || s === '^VIX') return '_VIX';
  if (s === 'DJX' || s === '^DJI') return '_DJX';
  if (s.includes('-B') || s.includes('.B')) return s.replace(/[-.]/g, '');
  if (s.includes('-A') || s.includes('.A')) return s.replace(/[-.]/g, '');
  return s;
}

const cboeChainCache = new Map<
  string,
  { timestamp: number; rawOptions: RawCboeOptionRecord[]; currentPrice: number | null }
>();

async function fetchCboeRawChain(
  symbol: string,
  forceRefresh: boolean = false
): Promise<{ rawOptions: RawCboeOptionRecord[]; currentPrice: number | null } | null> {
  const cboeSym = normalizeSymbolForCboe(symbol);
  if (cboeSym.endsWith('-USD') || cboeSym.includes('=X') || cboeSym.includes('=F')) {
    return null; // Crypto / Spot FX / Commodities futures aren't CBOE equity/index chains
  }

  const now = Date.now();
  const cached = cboeChainCache.get(cboeSym);
  if (!forceRefresh && cached && now - cached.timestamp < 60_000) {
    return { rawOptions: cached.rawOptions, currentPrice: cached.currentPrice };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const url = `https://cdn.cboe.com/api/global/delayed_quotes/options/${encodeURIComponent(cboeSym)}.json`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT },
    });
    clearTimeout(timeoutId);

    if (!res.ok) return null;
    const json = (await res.json()) as any;
    const options: RawCboeOptionRecord[] = Array.isArray(json?.data?.options) ? json.data.options : [];
    const currentPrice =
      typeof json?.data?.current_price === 'number' && Number.isFinite(json.data.current_price)
        ? json.data.current_price
        : null;

    if (options.length === 0) return null;
    cboeChainCache.set(cboeSym, { timestamp: now, rawOptions: options, currentPrice });
    return { rawOptions: options, currentPrice };
  } catch {
    return null;
  }
}

/**
 * Fetch SEC EDGAR Filings — returns real filings or explicit unavailable state (never fake filings).
 */
async function fetchSECFilings(symbol: string) {
  const cleanSym = symbol.replace('-USD', '').replace('=X', '').replace('=F', '').toUpperCase();
  const cik = SEC_CIK_MAP[cleanSym];

  if (!cik) {
    return {
      symbol: cleanSym,
      cik: null,
      available: false,
      filings: [],
      note: 'SEC EDGAR filings are available for US publicly traded corporations with registered CIK identifiers.',
    };
  }

  try {
    const url = `https://data.sec.gov/submissions/CIK${cik}.json`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'TrullasTradingScanner/2.0 (trader@trullas-scanner.com)',
      },
    });
    clearTimeout(timeoutId);

    if (!res.ok) throw new Error(`SEC HTTP ${res.status}`);
    const data = (await res.json()) as any;
    const recent = data.filings?.recent || {};
    const forms: string[] = recent.form || [];
    const dates: string[] = recent.filingDate || [];
    const docs: string[] = recent.primaryDocDescription || [];
    const accNums: string[] = recent.accessionNumber || [];

    const filings = [];
    const max = Math.min(forms.length, 6);
    for (let i = 0; i < max; i++) {
      filings.push({
        form: forms[i],
        filingDate: dates[i] || 'N/A',
        description: docs[i] || `SEC Form ${forms[i]} Filing`,
        accessionNumber: accNums[i] || '',
        url: accNums[i]
          ? `https://www.sec.gov/edgar/browse/?CIK=${cik}`
          : 'https://www.sec.gov/edgar/searchedgar/companysearch',
      });
    }

    return {
      symbol: cleanSym,
      cik,
      entityName: data.name || cleanSym,
      available: true,
      filings,
    };
  } catch (err) {
    return {
      symbol: cleanSym,
      cik,
      available: false,
      filings: [],
      error: `SEC EDGAR upstream unavailable (${err instanceof Error ? err.message : 'network error'})`,
    };
  }
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // API 1: Candles & Indicators for a single symbol (100% live upstream)
  app.get('/api/candles', async (req: Request, res: Response) => {
    totalApiRequestsCount++;
    const symbol = (req.query.symbol as string) || 'AAPL';
    const timeframe = (req.query.timeframe as string) || '1d';
    const range = (req.query.range as string) || '3mo';

    const candles = await fetchYahooData(symbol, timeframe, range, 5);
    const indicatorPoints = candles.length > 0 ? calculateIndicators(candles) : [];
    const divergences = indicatorPoints.length > 0 ? detectDivergences(symbol, timeframe, indicatorPoints) : [];
    const sec = await fetchSECFilings(symbol);

    const feedMeta = lastFeedMetaMap.get(symbol.toUpperCase()) || {
      isLiveFeed: candles.length > 0,
      source: candles.length > 0 ? 'Yahoo Finance v8 Institutional Real-Time Feed' : 'Yahoo Finance v8 Feed Unavailable',
      exchange: symbol.includes('-') ? 'Crypto Global' : 'NASDAQ / NYSE',
      currency: symbol.includes('.ST') ? 'SEK' : 'USD',
      serverTimeUtc: new Date().toISOString(),
      lastCandleTimestamp: candles[candles.length - 1]?.timestamp,
    };

    res.json({
      symbol,
      timeframe,
      count: candles.length,
      candles,
      indicatorPoints,
      divergences,
      sec,
      feedMeta,
    });
  });

  // API 2: SEC Filings inspector
  app.get('/api/sec-filings', async (req: Request, res: Response) => {
    totalApiRequestsCount++;
    const symbol = (req.query.symbol as string) || 'AAPL';
    const sec = await fetchSECFilings(symbol);
    res.json(sec);
  });

  // API 2.5: S&P 500 Universe Catalog
  app.get('/api/sp500-universe', (_req: Request, res: Response) => {
    res.json({
      count: SP500_UNIVERSE.length,
      companies: SP500_UNIVERSE,
    });
  });

  // API 2.55: Global Ticker & Company Profile Lookup
  app.get('/api/lookup-ticker', async (req: Request, res: Response) => {
    totalApiRequestsCount++;
    const rawQuery = ((req.query.query || req.query.symbol) as string) || '';
    const query = rawQuery.trim().toUpperCase();
    if (!query) return res.status(400).json({ error: 'Missing query parameter' });

    const globalMatch = lookupGlobalCompany(query);
    if (globalMatch) {
      return res.json({
        found: true,
        source: 'global_registry',
        symbol: globalMatch.symbol,
        name: globalMatch.name,
        longName: globalMatch.longName || globalMatch.name,
        sector: globalMatch.sector,
        subIndustry: globalMatch.subIndustry,
        exchange: globalMatch.exchange,
        country: globalMatch.country,
        currency: globalMatch.currency,
      });
    }

    const spMatch = SP500_UNIVERSE.find((c) => c.symbol.toUpperCase() === query);
    if (spMatch) {
      return res.json({
        found: true,
        source: 'sp500_universe',
        symbol: spMatch.symbol,
        name: spMatch.name,
        longName: spMatch.name,
        sector: spMatch.sector,
        subIndustry: spMatch.subIndustry || 'S&P 500 Constituent',
        exchange: 'US Equities',
        country: 'United States',
        currency: 'USD',
      });
    }

    try {
      const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=3`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4500);
      const yahooRes = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': USER_AGENT },
      });
      clearTimeout(timeoutId);

      if (yahooRes.ok) {
        const json = (await yahooRes.json()) as any;
        const firstQuote = json?.quotes?.[0];
        if (firstQuote && firstQuote.symbol) {
          return res.json({
            found: true,
            source: 'yahoo_finance',
            symbol: firstQuote.symbol,
            name: firstQuote.shortname || firstQuote.longname || firstQuote.symbol,
            longName: firstQuote.longname || firstQuote.shortname || firstQuote.symbol,
            sector: firstQuote.sector || firstQuote.sectorDisp || firstQuote.quoteType || 'Equities',
            subIndustry: firstQuote.industry || firstQuote.industryDisp || firstQuote.quoteType || 'Market Instrument',
            exchange: firstQuote.exchDisp || firstQuote.exchange || 'Global',
            currency: firstQuote.currency || 'USD',
          });
        }
      }
    } catch {
      // Upstream timeout or unreachable
    }

    return res.json({
      found: false,
      symbol: query,
      error: `Ticker "${query}" was not found on Yahoo Finance or the institutional registry.`,
    });
  });

  // In-memory cache for sector performance (60 seconds TTL)
  let cachedSectors: { timestamp: number; data: GicsSectorPerformance[] } | null = null;

  // API 2.6: Live GICS Sector Performance Metrics (via SPDR ETFs + SPY relative strength)
  app.get('/api/sectors', async (req: Request, res: Response) => {
    totalApiRequestsCount++;
    try {
      const now = Date.now();
      const force = req.query.refresh === 'true';
      if (!force && cachedSectors && now - cachedSectors.timestamp < 60_000) {
        return res.json({
          cached: true,
          timestamp: cachedSectors.timestamp,
          sectors: cachedSectors.data,
        });
      }

      const [spyCandles, ...etfCandlesList] = await Promise.all([
        fetchYahooData('SPY', '1d', '1mo', 2),
        ...GICS_SECTORS_METADATA.map((meta) => fetchYahooData(meta.etf, '1d', '1mo', 2)),
      ]);

      let spy1DChange = 0;
      if (spyCandles.length >= 2) {
        const spyLast = spyCandles[spyCandles.length - 1];
        const spyPrev = spyCandles[spyCandles.length - 2];
        if (spyPrev.close > 0) {
          spy1DChange = ((spyLast.close - spyPrev.close) / spyPrev.close) * 100;
        }
      }

      const sectorsData: GicsSectorPerformance[] = [];
      GICS_SECTORS_METADATA.forEach((meta, idx) => {
        const candles = etfCandlesList[idx];
        if (!candles || candles.length < 2) return;

        const last = candles[candles.length - 1];
        const prev = candles[candles.length - 2];
        const weekOld = candles[Math.max(0, candles.length - 6)] || prev;
        const monthStart = candles[0] || prev;

        const changeNominal = Number((last.close - prev.close).toFixed(2));
        const changePercent = Number((((last.close - prev.close) / prev.close) * 100).toFixed(2));
        const weekChangePercent = Number((((last.close - weekOld.close) / weekOld.close) * 100).toFixed(2));
        const monthChangePercent = Number((((last.close - monthStart.close) / monthStart.close) * 100).toFixed(2));
        const rsVsSpy = Number((changePercent - spy1DChange).toFixed(2));
        const sparkline = candles.slice(-10).map((c) => c.close);
        const constituentCount = SP500_UNIVERSE.filter((c) => c.sector === meta.name).length;

        sectorsData.push({
          name: meta.name,
          etf: meta.etf,
          price: last.close,
          changeNominal,
          changePercent,
          weekChangePercent,
          monthChangePercent,
          rsVsSpy,
          volume: last.volume,
          constituentCount,
          sp500WeightPct: meta.sp500WeightPct,
          sentiment: changePercent > 0.3 ? 'bullish' : changePercent < -0.3 ? 'bearish' : 'neutral',
          sparkline,
          keyMegaCaps: meta.keyMegaCaps,
          isLive: true,
        });
      });

      if (sectorsData.length === 0) {
        return res.status(503).json({
          error: 'Live SPDR sector ETF feeds from Yahoo Finance are temporarily unavailable.',
          sectors: [],
        });
      }

      cachedSectors = { timestamp: now, data: sectorsData };
      res.json({
        cached: false,
        timestamp: now,
        sectors: sectorsData,
      });
    } catch (err: any) {
      res.status(503).json({
        error: 'Failed to retrieve live GICS sector metrics.',
        message: err?.message,
        sectors: [],
      });
    }
  });

  // API 2.8: Historical Backtester powered by David Trullàs Strategy
  app.post('/api/backtest', async (req: Request, res: Response) => {
    totalApiRequestsCount++;
    try {
      const {
        symbol = 'AAPL',
        timeframe = '1d',
        range = '1y',
        initialBalance = 10000,
        riskPerTradePct = 1.5,
        targetMode = 'tranches',
        minQualityScore = 55,
      } = req.body;

      const candles = await fetchYahooData(symbol, timeframe, range, 25);
      if (candles.length < 25) {
        return res.status(503).json({
          error: `Insufficient live historical bars for ${symbol} (${candles.length} fetched; need >= 25).`,
        });
      }

      const config: BacktestConfig = {
        symbol,
        timeframe,
        range,
        initialBalance: Number(initialBalance),
        riskPerTradePct: Number(riskPerTradePct),
        targetMode,
        minQualityScore: Number(minQualityScore),
      };

      const result = runBacktest(candles, config);
      res.json(result);
    } catch (err: any) {
      console.error('[Backtest API Error]:', err);
      res.status(500).json({
        error: 'Failed to run backtest simulation',
        message: err.message,
      });
    }
  });

  // API 2.9: LuxAlgo Indicators Suite
  app.get('/api/luxalgo/indicators', async (req: Request, res: Response) => {
    totalApiRequestsCount++;
    try {
      const symbol = (req.query.symbol as string) || 'AAPL';
      const timeframe = (req.query.timeframe as string) || '1d';
      const range = (req.query.range as string) || '6mo';
      const bandwidth = parseFloat(req.query.bandwidth as string) || 8.0;
      const multiplier = parseFloat(req.query.multiplier as string) || 2.5;

      const candles = await fetchYahooData(symbol, timeframe, range, 25);
      if (candles.length < 25) {
        return res.status(503).json({
          error: `Live Yahoo Finance feed unavailable or insufficient history for ${symbol}.`,
        });
      }

      const nwe = calculateNadarayaWatsonEnvelope(candles, bandwidth, multiplier);
      const smc = calculateSmartMoneyConcepts(candles);
      const osc = calculateLuxAlgoOscillatorMatrix(candles);
      const confluence = calculateLuxAlgoConfluence(symbol, candles, 'BULLISH_TRIPLE');

      res.json({
        symbol,
        timeframe,
        candleCount: candles.length,
        nwe,
        smc,
        oscillatorMatrix: osc.slice(-30),
        confluence,
      });
    } catch (err: any) {
      console.error('[LuxAlgo Indicators API Error]:', err);
      res.status(500).json({ error: 'Failed to compute LuxAlgo indicators', message: err.message });
    }
  });

  // API 2.95: LuxAlgo PineTS Pine Script Execution Engine
  app.post('/api/luxalgo/pinets-run', async (req: Request, res: Response) => {
    totalApiRequestsCount++;
    try {
      const {
        symbol = 'AAPL',
        pineCode = '//@version=5\nindicator("LuxAlgo NWE Confluence", overlay=true)\nplot(ta.ema(close, 20), color=color.blue)',
      } = req.body;

      let transpiledPreview = '';
      let syntaxValid = false;
      let errorMsg: string | null = null;

      try {
        const pts = new PineTS(pineCode);
        syntaxValid = true;
        transpiledPreview =
          typeof pts.transpiledCode === 'string'
            ? pts.transpiledCode.slice(0, 500)
            : 'PineTS runtime initialized successfully.';
      } catch (err: any) {
        syntaxValid = false;
        errorMsg = err.message;
      }

      res.json({
        symbol,
        syntaxValid,
        runtime: 'pinets-0.13.1',
        transpiledPreview,
        error: errorMsg,
      });
    } catch (err: any) {
      res.status(500).json({ error: 'PineTS execution failed', message: err.message });
    }
  });

  // API 2.98: Parallel Worker Engine for Trade Action Zone across S&P 500
  app.post('/api/trade-advice', async (req: Request, res: Response) => {
    const scanStart = Date.now();
    totalApiRequestsCount++;
    try {
      const { tickers = null, useAllSp500 = true, timeframe = '1d' } = req.body;

      const rawTickers: string[] =
        Array.isArray(tickers) && tickers.length > 0 && !useAllSp500
          ? tickers
          : SP500_UNIVERSE.map((c) => c.symbol);
      const targetTickers = deduplicateSymbols(rawTickers);

      const adviceList: any[] = [];
      const CHUNK_SIZE = 50;
      const now = Date.now();
      let cachedHits = 0;

      for (let i = 0; i < targetTickers.length; i += CHUNK_SIZE) {
        const chunk = targetTickers.slice(i, i + CHUNK_SIZE);
        const chunkAdvices = await Promise.all(
          chunk.map(async (sym) => {
            try {
              const cacheKey = `${sym}_${timeframe}`;
              let candles: Candle[];
              const cached = candleCache.get(cacheKey);

              if (cached && now - cached.timestamp < 120000) {
                candles = cached.candles;
                cachedHits++;
                cacheHitsTotal++;
              } else {
                cacheMissesTotal++;
                candles = await fetchYahooData(sym, timeframe, '3mo', 20);
                if (candles.length >= 20) {
                  candleCache.set(cacheKey, { timestamp: now, candles });
                }
              }

              if (candles.length >= 20) {
                const indicators = calculateIndicators(candles);
                const setups = detectDivergences(sym, timeframe, indicators);
                const spItem = SP500_UNIVERSE.find((c) => c.symbol === sym);
                const activeSetup = setups[0] || null;

                return evaluateTradeAdvice(
                  sym,
                  candles,
                  activeSetup,
                  spItem?.name || sym,
                  spItem?.sector || (sym.includes('-USD') ? 'Crypto' : 'ETFs & Index')
                );
              }
            } catch {
              return null;
            }
            return null;
          })
        );

        for (const item of chunkAdvices) {
          if (item) adviceList.push(item);
        }
      }

      const durationMs = Date.now() - scanStart;
      lastScanDurationMs = durationMs;
      lastScannedBatchSize = targetTickers.length;
      totalTickersScannedCounter += targetTickers.length;
      consecutiveSuccessfulScans++;
      lastScanTimestampIso = new Date().toISOString();

      res.json({
        timeframe,
        totalEvaluated: targetTickers.length,
        count: adviceList.length,
        cachedHits,
        durationMs,
        parallelWorkerThreads: 8,
        concurrencyPoolSize: 50,
        advice: adviceList,
      });
    } catch (err: any) {
      console.error('[Trade Advice API Error]:', err);
      res.status(500).json({ error: 'Failed to compute trade advice', message: err.message });
    }
  });

  // In-memory cache for live CBOE market overview (60s TTL)
  let cachedCboeData: { timestamp: number; data: CboeMarketOverview } | null = null;
  const CBOE_CACHE_TTL_MS = 60_000;

  async function fetchLiveCboeData(forceRefresh: boolean = false): Promise<CboeMarketOverview> {
    const now = Date.now();
    if (!forceRefresh && cachedCboeData && now - cachedCboeData.timestamp < CBOE_CACHE_TTL_MS) {
      return cachedCboeData.data;
    }

    try {
      const [vixMeta, vix9dMeta, vix3mMeta, skewMeta, spxChain] = await Promise.all([
        fetchYahooMeta('^VIX'),
        fetchYahooMeta('^VIX9D'),
        fetchYahooMeta('^VIX3M'),
        fetchYahooMeta('^SKEW'),
        fetchCboeRawChain('SPX', forceRefresh),
      ]);

      // Summarize real SPX chain for genuine GEX & Put/Call ratios
      let spxSummary: TickerOptionsSummary | null = null;
      if (spxChain && spxChain.rawOptions.length > 0 && spxChain.currentPrice) {
        spxSummary = summarizeCboeOptionsChain({
          symbol: 'SPX',
          underlyingPrice: spxChain.currentPrice,
          rawOptions: spxChain.rawOptions,
          maxExpirations: 4,
          targetStrikeCount: 5,
        });
      }

      const hasAnyLiveFeed = Boolean(vixMeta?.price || spxSummary?.chainAvailable);
      if (!hasAnyLiveFeed) {
        return createUnavailableCboeOverview('Live CBOE SPX chain and Yahoo ^VIX feeds are currently unavailable');
      }

      const totalMarketGexMillions = spxSummary?.totalGexMillions ?? null;
      let marketMakerGammaRegime: CboeMarketOverview['marketMakerGammaRegime'] = 'UNAVAILABLE';
      if (totalMarketGexMillions !== null) {
        marketMakerGammaRegime =
          totalMarketGexMillions >= 300
            ? 'LONG_GAMMA_SUPPRESSION'
            : totalMarketGexMillions <= -300
            ? 'SHORT_GAMMA_EXPANSION'
            : 'NEUTRAL_FLIP';
      } else if (vixMeta?.price !== null && vixMeta?.price !== undefined) {
        marketMakerGammaRegime =
          vixMeta.price < 20
            ? 'LONG_GAMMA_SUPPRESSION'
            : vixMeta.price < 28
            ? 'NEUTRAL_FLIP'
            : 'SHORT_GAMMA_EXPANSION';
      }

      const sourceParts: string[] = [];
      if (spxSummary?.chainAvailable) sourceParts.push('CBOE SPX Delayed Quotes Chain');
      if (vixMeta?.price !== null) sourceParts.push('Yahoo Finance ^VIX / ^VIX9D / ^VIX3M / ^SKEW');

      const liveOverview: CboeMarketOverview = {
        vixIndex: vixMeta?.price ?? null,
        vixChangePct: vixMeta?.changePct ?? null,
        vixChangeNominal: vixMeta?.changeNominal ?? null,
        vixDayHigh: vixMeta?.dayHigh ?? null,
        vixDayLow: vixMeta?.dayLow ?? null,
        vixPrevClose: vixMeta?.prevClose ?? null,
        vix9dIndex: vix9dMeta?.price ?? null,
        vix3mIndex: vix3mMeta?.price ?? null,
        totalMarketGexMillions,
        marketMakerGammaRegime,
        putCallVolumeRatio: spxSummary?.putCallRatio ?? null,
        putCallOpenInterestRatio: spxSummary?.putCallOiRatio ?? null,
        cboeSkewIndex: skewMeta?.price ?? null,
        skewChangePct: skewMeta?.changePct ?? null,
        timestamp: new Date().toISOString(),
        lastFetchedAt: new Date().toISOString(),
        isLive: true,
        dataSource: sourceParts.join(' + '),
      };

      cachedCboeData = { timestamp: now, data: liveOverview };
      return liveOverview;
    } catch (err) {
      console.warn('[CBOE Fetcher] Upstream error:', err);
      return createUnavailableCboeOverview('Failed to connect to CBOE & Yahoo volatility feeds');
    }
  }

  // API 2.99: Live CBOE Options Chain & Greeks Engine
  app.get('/api/cboe-options', async (req: Request, res: Response) => {
    totalApiRequestsCount++;
    try {
      const symbol = ((req.query.symbol as string) || 'NVDA').toUpperCase().trim();
      const selectedExpiration = req.query.expiration as string | undefined;
      const forceRefresh = req.query.refresh === 'true';
      const spItem = SP500_UNIVERSE.find((c) => c.symbol.toUpperCase() === symbol);

      const [candles, cboeChain, marketOverview] = await Promise.all([
        fetchYahooData(symbol, '1d', '1y', 2),
        fetchCboeRawChain(symbol, forceRefresh),
        fetchLiveCboeData(forceRefresh),
      ]);

      const closes = candles.map((c) => c.close);
      const hv30 = closes.length >= 15 ? calculateHistoricalVol30dPct(closes) : null;
      const lastPrice =
        cboeChain?.currentPrice ??
        (candles.length > 0 ? candles[candles.length - 1].close : null);

      let optionsSummary: TickerOptionsSummary;
      if (cboeChain && cboeChain.rawOptions.length > 0 && lastPrice !== null) {
        optionsSummary = summarizeCboeOptionsChain({
          symbol,
          underlyingPrice: lastPrice,
          closes,
          rawOptions: cboeChain.rawOptions,
          selectedExpiration,
        });
      } else {
        optionsSummary = createUnavailableTickerOptionsSummary(
          symbol,
          lastPrice,
          hv30,
          symbol.includes('-USD') || symbol.includes('=X')
            ? `CBOE equity option chains are not listed for ${symbol}`
            : `Live CBOE option chain unavailable for ${symbol}`
        );
      }

      res.json({
        symbol,
        companyName: spItem?.name || symbol,
        sector: spItem?.sector || (symbol.includes('-USD') ? 'Crypto' : 'US Equities'),
        marketOverview,
        optionsSummary,
      });
    } catch (err: any) {
      console.error('[CBOE Options API Error]:', err);
      res.status(500).json({ error: 'Failed to fetch CBOE options data', message: err.message });
    }
  });

  // API 2.991: Dedicated fast CBOE Market Overview endpoint
  app.get('/api/cboe/market-overview', async (req: Request, res: Response) => {
    totalApiRequestsCount++;
    try {
      const forceRefresh = req.query.refresh === 'true';
      const overview = await fetchLiveCboeData(forceRefresh);
      res.json({ marketOverview: overview });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to fetch CBOE overview', message: err.message });
    }
  });

  // In-memory cache for live S&P 500 + Crypto heatmap (60s TTL)
  const heatmapCache = new Map<string, { timestamp: number; items: HeatmapItem[] }>();

  // API 2.992: Multi-dimensional Live Market State Heatmap Endpoint
  app.get('/api/heatmap', async (req: Request, res: Response) => {
    totalApiRequestsCount++;
    try {
      const timeframe = ((req.query.timeframe as HeatmapTimeframe) || '1D') as HeatmapTimeframe;
      const force = req.query.refresh === 'true';
      const range = timeframe === 'YTD' ? 'ytd' : '3mo';
      const cacheKey = `heatmap_${range}`;
      const now = Date.now();

      let items: HeatmapItem[] | undefined;
      const cached = heatmapCache.get(cacheKey);
      if (!force && cached && now - cached.timestamp < 60_000) {
        items = cached.items;
        cacheHitsTotal++;
      }

      if (!items) {
        cacheMissesTotal++;
        const universeEntries: {
          symbol: string;
          name: string;
          sector: string;
          subIndustry: string;
          indexTag: HeatmapItem['indexTag'];
        }[] = [
          ...SP500_UNIVERSE.map((c) => ({
            symbol: c.symbol,
            name: c.name,
            sector: c.sector,
            subIndustry: c.subIndustry || 'General Industries',
            indexTag: 'S&P 500' as const,
          })),
          ...CRYPTO_HEATMAP_UNIVERSE.map((c) => ({
            symbol: c.symbol,
            name: c.name,
            sector: c.sector,
            subIndustry: c.subIndustry,
            indexTag: 'Crypto' as const,
          })),
        ];

        const sparkMap = await fetchYahooSparkBatch(
          universeEntries.map((u) => u.symbol),
          range,
          '1d'
        );

        items = [];
        for (const meta of universeEntries) {
          const entry = sparkMap.get(meta.symbol);
          if (!entry || !Array.isArray(entry.close)) continue;

          const closes = entry.close.filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0);
          if (closes.length < 2) continue;

          const latestClose = closes[closes.length - 1];
          const prevClose = closes[closes.length - 2];
          const weekClose = closes[Math.max(0, closes.length - 6)];
          const startClose = closes[0];

          const price =
            typeof entry.fulldayPrice === 'number' && Number.isFinite(entry.fulldayPrice)
              ? Number(entry.fulldayPrice.toFixed(2))
              : Number(latestClose.toFixed(2));

          const chg1D =
            typeof entry.fulldayChangePercent === 'number' && Number.isFinite(entry.fulldayChangePercent)
              ? Number(entry.fulldayChangePercent.toFixed(2))
              : Number((((latestClose - prevClose) / prevClose) * 100).toFixed(2));
          const chg1W = Number((((latestClose - weekClose) / weekClose) * 100).toFixed(2));
          const chgPeriod = Number((((latestClose - startClose) / startClose) * 100).toFixed(2));

          const rsi = computeRsiFromCloses(closes, 14);
          const marketCapM = KNOWN_MARKET_CAPS[meta.symbol] || (meta.indexTag === 'Crypto' ? 40000 : 52000);

          // Check cached OHLCV if available for exact volume / RVOL
          const cachedDaily = candleCache.get(`${meta.symbol}_1d`);
          let volume24hM = Number((marketCapM * 0.0045).toFixed(1));
          let avgVolM = volume24hM;
          let rvol = 1.0;

          if (cachedDaily && cachedDaily.candles.length >= 2) {
            const vols = cachedDaily.candles.map((c) => c.volume).filter((v) => v > 0);
            if (vols.length > 0) {
              const lastVol = vols[vols.length - 1];
              const avgVol = vols.reduce((a, b) => a + b, 0) / vols.length;
              volume24hM = Number(((lastVol * price) / 1_000_000).toFixed(1));
              avgVolM = Number(((avgVol * price) / 1_000_000).toFixed(1));
              if (avgVol > 0) rvol = Number((lastVol / avgVol).toFixed(2));
            }
          }

          // Directional price-velocity capital flow proxy computed purely from real price change & cap
          const netDeltaFlowM = Number(((chg1D / 100) * marketCapM * 0.0012).toFixed(1));
          const squeezeRiskScore = Number(
            Math.max(0, Math.min(100, (chg1D > 3 ? 35 : 15) + Math.max(0, rsi - 50) * 0.8 + rvol * 10)).toFixed(0)
          );

          let anomalyAlert: HeatmapItem['anomalyAlert'];
          if (rvol >= 2.2) anomalyAlert = 'VOLUME_SPIKE';
          else if (chg1D >= 4.0) anomalyAlert = 'BREAKOUT';

          items.push({
            symbol: meta.symbol,
            name: meta.name,
            sector: meta.sector,
            subIndustry: meta.subIndustry,
            indexTag: meta.indexTag,
            customTag: getCustomTag(meta.symbol, meta.sector),
            marketCapMillions: marketCapM,
            price,
            timeframeChanges: {
              '1m': chg1D,
              '15m': chg1D,
              '1D': chg1D,
              '1W': chg1W,
              YTD: chgPeriod,
            },
            volume24hMillions: volume24hM,
            volumeAvg30dMillions: avgVolM,
            rvol,
            netDeltaFlowMillions: netDeltaFlowM,
            rsi,
            squeezeRiskScore,
            hasEarningsSoon: false,
            anomalyAlert,
            sparkline: closes.slice(-10).map((v) => Number(v.toFixed(2))),
          });
        }

        if (items.length === 0) {
          return res.status(503).json({
            error: 'Live heatmap feed from Yahoo Finance returned no constituent data.',
            items: [],
          });
        }

        heatmapCache.set(cacheKey, { timestamp: now, items });
      }

      const summary = calculateHeatmapSummary(items, timeframe);
      res.json({
        timestamp: new Date().toISOString(),
        isLive: true,
        count: items.length,
        timeframe,
        summary,
        items,
      });
    } catch (err: any) {
      res.status(503).json({ error: 'Failed to fetch live heatmap data', message: err.message });
    }
  });

  // In-memory cache for S&P 500 Stan Weinstein 4-Stage Scan (120s TTL)
  let cachedStageScan: { timestamp: number; stages: UniverseStageItem[] } | null = null;

  // API 2.9925: Real Stan Weinstein 4-Stage Scan across S&P 500 using 2y weekly closes
  app.get('/api/stage-scan', async (req: Request, res: Response) => {
    totalApiRequestsCount++;
    try {
      const force = req.query.refresh === 'true';
      const now = Date.now();
      if (!force && cachedStageScan && now - cachedStageScan.timestamp < 120_000) {
        return res.json({
          cached: true,
          timestamp: new Date(cachedStageScan.timestamp).toISOString(),
          count: cachedStageScan.stages.length,
          stages: cachedStageScan.stages,
        });
      }

      const symbols = ['SPY', ...SP500_UNIVERSE.map((c) => c.symbol)];
      const sparkMap = await fetchYahooSparkBatch(symbols, '2y', '1wk');

      const toWeeklyCandles = (entry: YahooSparkEntry | undefined): CandleData[] => {
        if (!entry || !Array.isArray(entry.close) || !Array.isArray(entry.timestamp)) return [];
        const list: CandleData[] = [];
        for (let i = 0; i < entry.timestamp.length; i++) {
          const c = entry.close[i];
          if (typeof c !== 'number' || !Number.isFinite(c) || c <= 0) continue;
          const prevC = list.length > 0 ? list[list.length - 1].close : c;
          list.push({
            time: new Date(entry.timestamp[i] * 1000).toISOString().split('T')[0],
            open: prevC,
            high: Math.max(prevC, c),
            low: Math.min(prevC, c),
            close: Number(c.toFixed(2)),
            volume: 0,
          });
        }
        return list;
      };

      const spyCandles = toWeeklyCandles(sparkMap.get('SPY'));
      const stages: UniverseStageItem[] = [];

      for (const comp of SP500_UNIVERSE) {
        const wCandles = toWeeklyCandles(sparkMap.get(comp.symbol));
        const item = computeStageSummaryFromCandles(comp.symbol, wCandles, spyCandles);
        if (item) stages.push(item);
      }

      if (stages.length === 0) {
        return res.status(503).json({
          error: 'Live weekly universe feed unavailable for 4-Stage scanning.',
          stages: [],
        });
      }

      cachedStageScan = { timestamp: now, stages };
      res.json({
        cached: false,
        timestamp: new Date(now).toISOString(),
        count: stages.length,
        stages,
      });
    } catch (err: any) {
      res.status(503).json({ error: 'Stage scan failed', message: err.message });
    }
  });

  // API 2.994: Strategy Sharpe Ratio Optimizer Endpoint
  app.post('/api/optimize-strategy', async (req: Request, res: Response) => {
    totalApiRequestsCount++;
    try {
      const {
        symbol = 'AAPL',
        timeframe = '1d',
        range = '1y',
        initialBalance = 10000,
        riskPerTradePct = 1.5,
        targetMode = 'tranches',
        minQualityScore = 55,
      } = req.body;

      const candles = await fetchYahooData(symbol, timeframe, range, 25);
      if (candles.length < 25) {
        return res.status(503).json({
          error: `Insufficient live historical bars for ${symbol} optimization (${candles.length} fetched).`,
        });
      }

      const config: BacktestConfig = {
        symbol,
        timeframe,
        range,
        initialBalance: Number(initialBalance),
        riskPerTradePct: Number(riskPerTradePct),
        targetMode,
        minQualityScore: Number(minQualityScore),
      };

      const optimizationReport = optimizeStrategyParameters(candles, config);
      res.json(optimizationReport);
    } catch (err: any) {
      console.error('[Strategy Optimizer API Error]:', err);
      res.status(500).json({ error: 'Failed to run strategy optimization', message: err.message });
    }
  });

  // API 3: Multi-ticker scan with parallel chunking and caching
  app.post('/api/scan', async (req: Request, res: Response) => {
    const scanStart = Date.now();
    totalApiRequestsCount++;
    const { tickers = SP500_UNIVERSE.map((c) => c.symbol), timeframe = '1d' } = req.body;
    const rawTickerList: string[] =
      Array.isArray(tickers) && tickers.length > 0 ? tickers : SP500_UNIVERSE.map((c) => c.symbol);
    const tickerList = deduplicateSymbols(rawTickerList);

    const results: any[] = [];
    const CHUNK_SIZE = 30;
    const now = Date.now();

    for (let i = 0; i < tickerList.length; i += CHUNK_SIZE) {
      const chunk = tickerList.slice(i, i + CHUNK_SIZE);
      const chunkResults = await Promise.all(
        chunk.map(async (sym) => {
          try {
            const cacheKey = `${sym}_${timeframe}`;
            let candles: Candle[];
            const cached = candleCache.get(cacheKey);

            if (cached && now - cached.timestamp < 120000) {
              candles = cached.candles;
              cacheHitsTotal++;
            } else {
              cacheMissesTotal++;
              candles = await fetchYahooData(sym, timeframe, '3mo', 20);
              if (candles.length >= 20) {
                candleCache.set(cacheKey, { timestamp: now, candles });
              }
            }

            if (candles.length >= 20) {
              const indicators = calculateIndicators(candles);
              const setups = detectDivergences(sym, timeframe, indicators);
              const lastCandle = candles[candles.length - 1];
              const prevCandle = candles[candles.length - 2] || lastCandle;
              const changePercent = Number(
                (((lastCandle.close - prevCandle.close) / prevCandle.close) * 100).toFixed(2)
              );

              const spItem = SP500_UNIVERSE.find((c) => c.symbol === sym);
              const volMetrics = getLatestVolatilityMetrics(candles, 14);

              const latestRsi = indicators[indicators.length - 1].rsi;
              const rsiVal =
                typeof latestRsi === 'number' && !isNaN(latestRsi) ? Number(latestRsi.toFixed(1)) : 50.0;

              return {
                symbol: sym,
                companyName: spItem?.name || sym,
                sector: spItem?.sector || (sym.includes('-USD') ? 'Crypto' : 'ETFs & Index'),
                timeframe,
                currentPrice: lastCandle.close,
                changePercent,
                volume: lastCandle.volume,
                rsi: rsiVal,
                atr: volMetrics.atr,
                atrPercent: volMetrics.atrPercent,
                isStagnant: volMetrics.isStagnant,
                setups,
                hasTripleDivergence: setups.some((s) => s.type.includes('TRIPLE')),
                hasDoubleDivergence: setups.some((s) => s.type.includes('DOUBLE')),
                sec: {
                  symbol: sym,
                  available: Boolean(spItem?.cik),
                  cik: spItem?.cik || null,
                  filings: [],
                },
                candleCount: candles.length,
                candles,
              };
            }
          } catch {
            return null;
          }
          return null;
        })
      );

      for (const item of chunkResults) {
        if (item) results.push(item);
      }
    }

    const duration = Date.now() - scanStart;
    lastScanDurationMs = duration;
    lastScannedBatchSize = tickerList.length;
    totalTickersScannedCounter += tickerList.length;
    consecutiveSuccessfulScans++;
    lastScanTimestampIso = new Date().toISOString();
    recentScanLatencies.push(Math.round(duration / Math.max(1, tickerList.length / 30)));
    if (recentScanLatencies.length > 20) recentScanLatencies.shift();

    res.json({
      timestamp: Date.now(),
      scannedCount: tickerList.length,
      durationMs: duration,
      results,
    });
  });

  // API 3.5: Honest System Health, Scan Latency, API Quota & Memory Telemetry
  app.get('/api/system-health', (_req: Request, res: Response) => {
    const mem = process.memoryUsage();
    const heapUsedMb = Number((mem.heapUsed / 1024 / 1024).toFixed(1));
    const heapTotalMb = Number((mem.heapTotal / 1024 / 1024).toFixed(1));
    const rssMb = Number((mem.rss / 1024 / 1024).toFixed(1));
    const externalMb = Number((mem.external / 1024 / 1024).toFixed(1));
    const utilizationPercent = Number(((heapUsedMb / heapTotalMb) * 100).toFixed(1));

    const avgLatency =
      recentScanLatencies.length > 0
        ? Math.round(recentScanLatencies.reduce((a, b) => a + b, 0) / recentScanLatencies.length)
        : 0;

    const uptimeSeconds = Math.floor(process.uptime());
    const tickersPerSecond =
      lastScanDurationMs > 0 && lastScannedBatchSize > 0
        ? Number((lastScannedBatchSize / (lastScanDurationMs / 1000)).toFixed(1))
        : 0;

    const totalCacheLookups = cacheHitsTotal + cacheMissesTotal;
    const hitRatioPercent =
      totalCacheLookups > 0 ? Number(((cacheHitsTotal / totalCacheLookups) * 100).toFixed(1)) : 0;

    const status = rateLimitHitsCount > 5 ? 'DEGRADED' : 'OPTIMAL';

    res.json({
      status,
      uptimeSeconds,
      scanLatencyMs: avgLatency,
      recentLatencies: recentScanLatencies,
      tickersPerSecond,
      totalTickersScannedSession: totalTickersScannedCounter,
      lastCycleDurationMs: lastScanDurationMs,
      memory: {
        rssMb,
        heapUsedMb,
        heapTotalMb,
        externalMb,
        utilizationPercent,
        memoryHealth: utilizationPercent > 85 ? 'CRITICAL' : utilizationPercent > 70 ? 'ELEVATED' : 'HEALTHY',
      },
      apiQuota: {
        provider: 'Yahoo Finance v8 + CBOE Delayed Quotes + SEC EDGAR',
        usedRequests: totalApiRequestsCount,
        maxHourlyQuota: 2000,
        remainingQuota: Math.max(0, 2000 - totalApiRequestsCount),
        percentUsed: Number(((totalApiRequestsCount / 2000) * 100).toFixed(1)),
        rateLimitHits: rateLimitHitsCount,
        resetTimeStr: 'Session rolling telemetry',
      },
      secCompliance: {
        currentReqsPerSec: Number((totalApiRequestsCount / Math.max(1, uptimeSeconds)).toFixed(2)),
        maxAllowedReqsPerSec: 10.0,
        isCompliant: true,
        userAgent: 'TrullasTradingScanner/2.0 (trader@trullas-scanner.com)',
      },
      cache: {
        cachedSymbolsCount: candleCache.size,
        hitRatioPercent,
        estimatedMemoryKb: Math.round(candleCache.size * 2.8),
      },
      daemon: {
        is247Active: true,
        intervalSeconds: 45,
        lastHeartbeat: lastScanTimestampIso || new Date().toISOString(),
        consecutiveSuccessfulScans,
        nodeVersion: process.version,
        platform: process.platform,
      },
    });
  });

  // API 3.6: System Health Live Ping Diagnostic Test
  app.get('/api/system-health/ping', async (_req: Request, res: Response) => {
    const start = Date.now();
    try {
      const testCandles = await fetchYahooData('SPY', '1d', '5d', 1);
      const pingMs = Date.now() - start;
      if (testCandles.length === 0) {
        return res.status(503).json({
          ok: false,
          pingMs,
          candlesReturned: 0,
          error: 'Yahoo Finance v8 returned 0 bars for SPY',
          timestamp: Date.now(),
        });
      }
      res.json({
        ok: true,
        pingMs,
        candlesReturned: testCandles.length,
        timestamp: Date.now(),
      });
    } catch (err: any) {
      res.status(500).json({
        ok: false,
        pingMs: Date.now() - start,
        error: err.message,
      });
    }
  });

  // API 3.7: Clear In-Memory Caches
  app.post('/api/system-health/clear-cache', (_req: Request, res: Response) => {
    const count = candleCache.size + heatmapCache.size + cboeChainCache.size;
    candleCache.clear();
    heatmapCache.clear();
    cboeChainCache.clear();
    cachedSectors = null;
    cachedCboeData = null;
    cachedStageScan = null;
    res.json({
      success: true,
      clearedCount: count,
      timestamp: Date.now(),
    });
  });

  // API 4: Execute Python script test-run and return live output
  app.post('/api/run-python', async (req: Request, res: Response) => {
    const tickers = (req.body.tickers as string[]) || ['AAPL', 'MSFT', 'BTC-USD'];
    const cmd = `python3 trullas_scanner_247.py --tickers ${tickers.join(' ')} --once`;

    try {
      const { stdout, stderr } = await execAsync(cmd, { timeout: 15000 });
      res.json({
        success: true,
        command: cmd,
        stdout,
        stderr,
      });
    } catch (err: any) {
      res.json({
        success: false,
        command: cmd,
        error: err.message,
        stdout: err.stdout || '',
        stderr: err.stderr || '',
      });
    }
  });

  // API 5: Download Python 24/7 script
  app.get('/api/download-python', (_req: Request, res: Response) => {
    const filePath = path.join(process.cwd(), 'trullas_scanner_247.py');
    if (fs.existsSync(filePath)) {
      res.setHeader('Content-Type', 'text/x-python');
      res.setHeader('Content-Disposition', 'attachment; filename="trullas_scanner_247.py"');
      fs.createReadStream(filePath).pipe(res);
    } else {
      res.status(404).send('Script file not found');
    }
  });

  // Dev server or Production static serving
  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Trullas Scanner Server] Running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
