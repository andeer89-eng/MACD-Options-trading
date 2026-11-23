import { BoundedTtlCache } from '../../src/utils/ttlCache.ts';
import { Candle } from '../../src/utils/trullasStrategy.ts';
import { SP500_UNIVERSE } from '../../src/data/sp500Universe.ts';
import { GicsSectorPerformance, GICS_SECTORS_METADATA } from '../../src/utils/sectorMetrics.ts';
import {
  computeMarketHealthReport,
  MarketHealthReport,
} from '../../src/utils/marketHealthEngine.ts';
import {
  CboeMarketOverview,
  TickerOptionsSummary,
  RawCboeOptionRecord,
  summarizeCboeOptionsChain,
  createUnavailableCboeOverview,
} from '../../src/utils/cboeOptionsEngine.ts';
import {
  deduplicateSymbols,
  normalizeSymbolForYahoo,
} from '../../src/utils/dataFetcher.ts';
import { HeatmapItem } from '../../src/utils/heatmapEngine.ts';
import { UniverseStageItem } from '../../src/utils/trendSpiderUniverse.ts';

export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export const SEC_CIK_MAP: Record<string, string> = {
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

export interface YahooSparkEntry {
  timestamp: number[];
  close: number[];
  symbol: string;
  fulldayPrice?: number;
  fulldayChange?: number;
  fulldayChangePercent?: number;
  previousClose?: number | null;
  chartPreviousClose?: number | null;
}

export function computeRsiFromCloses(closes: number[], period: number = 14): number {
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

export function normalizeSymbolForCboe(symbol: string): string {
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

export interface MarketDataServiceOptions {
  fetchYahooDataOverride?: (
    symbol: string,
    timeframe?: string,
    range?: string,
    minCandles?: number
  ) => Promise<Candle[]>;
  fetchSECFilingsOverride?: (symbol: string) => Promise<any>;
}

export function createMarketDataService(options: MarketDataServiceOptions = {}) {
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

  const lastFeedMetaMap = new BoundedTtlCache<string, any>({ maxEntries: 600, ttlMs: 300_000 });
  const candleCache = new BoundedTtlCache<string, { timestamp: number; candles: Candle[] }>({
    maxEntries: 600,
    ttlMs: 120_000,
  });
  const secCache = new BoundedTtlCache<string, any>({ maxEntries: 300, ttlMs: 300_000 });
  const cboeChainCache = new BoundedTtlCache<
    string,
    {
      timestamp: number;
      rawOptions: RawCboeOptionRecord[];
      currentPrice: number | null;
      sourceProvider: 'cboe' | 'yahoo_options';
    }
  >({ maxEntries: 200, ttlMs: 60_000 });
  const heatmapCache = new BoundedTtlCache<string, { timestamp: number; items: HeatmapItem[] }>({
    maxEntries: 12,
    ttlMs: 60_000,
  });

  let cachedSectors: { timestamp: number; data: GicsSectorPerformance[] } | null = null;
  let cachedCboeData: { timestamp: number; data: CboeMarketOverview } | null = null;
  let cachedStageScan: { timestamp: number; stages: UniverseStageItem[] } | null = null;
  let cachedMarketHealth: { timestamp: number; data: MarketHealthReport } | null = null;
  let yahooCrumbSession: { cookie: string; crumb: string; expiresAt: number } | null = null;
  const CBOE_CACHE_TTL_MS = 60_000;

  async function fetchYahooData(
    symbol: string,
    timeframe: string = '1d',
    range: string = '3mo',
    minCandles: number = 20
  ): Promise<Candle[]> {
    if (options.fetchYahooDataOverride) {
      return options.fetchYahooDataOverride(symbol, timeframe, range, minCandles);
    }
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

  async function fetchSingleSparkChunk(
    chunk: string[],
    range: string,
    interval: string
  ): Promise<Record<string, YahooSparkEntry>> {
    if (chunk.length === 0) return {};
    const yahooList = chunk.map((sym) => normalizeSymbolForYahoo(sym));

    const url = `https://query1.finance.yahoo.com/v8/finance/spark?symbols=${encodeURIComponent(
      yahooList.join(',')
    )}&range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 9000);

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': USER_AGENT },
      });
      clearTimeout(timeoutId);

      if (res.status === 429) rateLimitHitsCount++;
      if (res.status === 400 && chunk.length > 5) {
        const mid = Math.ceil(chunk.length / 2);
        const [left, right] = await Promise.all([
          fetchSingleSparkChunk(chunk.slice(0, mid), range, interval),
          fetchSingleSparkChunk(chunk.slice(mid), range, interval),
        ]);
        return { ...left, ...right };
      }
      if (!res.ok) return {};

      const json = (await res.json()) as Record<string, YahooSparkEntry>;
      return json || {};
    } catch {
      clearTimeout(timeoutId);
      return {};
    }
  }

  async function fetchYahooSparkBatch(
    symbols: string[],
    range: string = '3mo',
    interval: string = '1d'
  ): Promise<Map<string, YahooSparkEntry>> {
    const unique = deduplicateSymbols(symbols);
    const out = new Map<string, YahooSparkEntry>();
    const CHUNK_SIZE = 20;

    const chunks: string[][] = [];
    for (let i = 0; i < unique.length; i += CHUNK_SIZE) {
      chunks.push(unique.slice(i, i + CHUNK_SIZE));
    }

    const results = await Promise.all(
      chunks.map((chunk) => fetchSingleSparkChunk(chunk, range, interval))
    );

    const yahooToOrig = new Map<string, string>();
    for (const sym of unique) {
      yahooToOrig.set(normalizeSymbolForYahoo(sym).toUpperCase(), sym);
    }

    for (const batch of results) {
      for (const [respKey, entry] of Object.entries(batch)) {
        if (!entry || !Array.isArray(entry.close) || !Array.isArray(entry.timestamp)) continue;
        const origSym = yahooToOrig.get(respKey.toUpperCase()) || respKey.toUpperCase();
        out.set(origSym, entry);
      }
    }

    return out;
  }

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

      const changeNominal: number | null =
        typeof meta?.fulldayChange === 'number'
          ? Number(meta.fulldayChange.toFixed(2))
          : price !== null && prevClose !== null
          ? Number((price - prevClose).toFixed(2))
          : null;

      const changePct: number | null =
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

  async function getYahooCrumbSession(forceRefresh: boolean = false): Promise<{ cookie: string; crumb: string } | null> {
    const now = Date.now();
    if (!forceRefresh && yahooCrumbSession && yahooCrumbSession.expiresAt > now) {
      return { cookie: yahooCrumbSession.cookie, crumb: yahooCrumbSession.crumb };
    }
    try {
      const c1 = new AbortController();
      const t1 = setTimeout(() => c1.abort(), 5000);
      const r1 = await fetch('https://fc.yahoo.com', {
        signal: c1.signal,
        headers: { 'User-Agent': USER_AGENT },
      });
      clearTimeout(t1);
      const rawSetCookie = r1.headers.get('set-cookie') || '';
      const cookiePair = rawSetCookie.split(';')[0]?.trim();
      if (!cookiePair) return null;

      const c2 = new AbortController();
      const t2 = setTimeout(() => c2.abort(), 5000);
      const r2 = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
        signal: c2.signal,
        headers: { 'User-Agent': USER_AGENT, Cookie: cookiePair },
      });
      clearTimeout(t2);
      if (!r2.ok) return null;
      const crumb = (await r2.text()).trim();
      if (!crumb || crumb.startsWith('<')) return null;

      yahooCrumbSession = { cookie: cookiePair, crumb, expiresAt: now + 15 * 60_000 };
      return { cookie: cookiePair, crumb };
    } catch {
      return null;
    }
  }

  function mapYahooContractsToRecords(contracts: any[]): RawCboeOptionRecord[] {
    if (!Array.isArray(contracts)) return [];
    const mapped: RawCboeOptionRecord[] = [];
    for (const c of contracts) {
      if (!c || typeof c.contractSymbol !== 'string') continue;
      mapped.push({
        option: c.contractSymbol,
        bid: typeof c.bid === 'number' && Number.isFinite(c.bid) ? c.bid : undefined,
        ask: typeof c.ask === 'number' && Number.isFinite(c.ask) ? c.ask : undefined,
        last_trade_price:
          typeof c.lastPrice === 'number' && Number.isFinite(c.lastPrice) ? c.lastPrice : undefined,
        iv:
          typeof c.impliedVolatility === 'number' && Number.isFinite(c.impliedVolatility)
            ? c.impliedVolatility
            : undefined,
        volume: typeof c.volume === 'number' && Number.isFinite(c.volume) ? c.volume : undefined,
        open_interest:
          typeof c.openInterest === 'number' && Number.isFinite(c.openInterest)
            ? c.openInterest
            : undefined,
      });
    }
    return mapped;
  }

  async function fetchYahooOptionsChain(
    symbol: string,
    forceRefresh: boolean = false
  ): Promise<{
    rawOptions: RawCboeOptionRecord[];
    currentPrice: number | null;
    sourceProvider: 'yahoo_options';
  } | null> {
    const clean = symbol.trim().toUpperCase();
    const yahooOptSym =
      clean === 'SPX' || clean === '_SPX'
        ? '^SPX'
        : clean === 'NDX' || clean === '_NDX'
        ? '^NDX'
        : clean === 'RUT' || clean === '_RUT'
        ? '^RUT'
        : normalizeSymbolForYahoo(clean);

    let session = await getYahooCrumbSession(forceRefresh);
    if (!session) return null;

    const fetchExp = async (dateEpoch?: number, retryCrumb = true): Promise<any | null> => {
      const dateParam = dateEpoch ? `&date=${dateEpoch}` : '';
      const url = `https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(
        yahooOptSym
      )}?crumb=${encodeURIComponent(session!.crumb)}${dateParam}`;
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 6500);
      try {
        const r = await fetch(url, {
          signal: ctrl.signal,
          headers: { 'User-Agent': USER_AGENT, Cookie: session!.cookie },
        });
        clearTimeout(tid);
        if ((r.status === 401 || r.status === 403) && retryCrumb) {
          session = await getYahooCrumbSession(true);
          if (!session) return null;
          return fetchExp(dateEpoch, false);
        }
        if (!r.ok) return null;
        return await r.json();
      } catch {
        clearTimeout(tid);
        return null;
      }
    };

    const firstJson = await fetchExp();
    const result0 = firstJson?.optionChain?.result?.[0];
    if (!result0) return null;

    const currentPrice =
      typeof result0?.quote?.regularMarketPrice === 'number' &&
      Number.isFinite(result0.quote.regularMarketPrice)
        ? result0.quote.regularMarketPrice
        : null;

    const records: RawCboeOptionRecord[] = [];
    const opt0 = result0?.options?.[0];
    if (opt0) {
      records.push(...mapYahooContractsToRecords(opt0.calls));
      records.push(...mapYahooContractsToRecords(opt0.puts));
    }

    // Fetch up to 2 additional near-term expiration cycles for GEX/Put-Call depth & expiry selector
    const expDates: number[] = Array.isArray(result0?.expirationDates)
      ? result0.expirationDates.slice(1, 3)
      : [];
    if (expDates.length > 0) {
      const extraJsons = await Promise.all(expDates.map((d) => fetchExp(d, false)));
      for (const ej of extraJsons) {
        const optBlock = ej?.optionChain?.result?.[0]?.options?.[0];
        if (optBlock) {
          records.push(...mapYahooContractsToRecords(optBlock.calls));
          records.push(...mapYahooContractsToRecords(optBlock.puts));
        }
      }
    }

    if (records.length === 0) return null;
    return { rawOptions: records, currentPrice, sourceProvider: 'yahoo_options' };
  }

  async function fetchCboeRawChain(
    symbol: string,
    forceRefresh: boolean = false
  ): Promise<{
    rawOptions: RawCboeOptionRecord[];
    currentPrice: number | null;
    sourceProvider: 'cboe' | 'yahoo_options';
  } | null> {
    const cboeSym = normalizeSymbolForCboe(symbol);
    if (cboeSym.endsWith('-USD') || cboeSym.includes('=X') || cboeSym.includes('=F')) {
      return null;
    }

    const now = Date.now();
    const cached = !forceRefresh ? cboeChainCache.get(cboeSym) : undefined;
    if (cached) {
      return {
        rawOptions: cached.rawOptions,
        currentPrice: cached.currentPrice,
        sourceProvider: cached.sourceProvider,
      };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const url = `https://cdn.cboe.com/api/global/delayed_quotes/options/${encodeURIComponent(cboeSym)}.json`;
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': USER_AGENT },
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const json = (await res.json()) as any;
        const optionsList: RawCboeOptionRecord[] = Array.isArray(json?.data?.options)
          ? json.data.options
          : [];
        const currentPrice =
          typeof json?.data?.current_price === 'number' && Number.isFinite(json.data.current_price)
            ? json.data.current_price
            : null;

        if (optionsList.length > 0) {
          cboeChainCache.set(cboeSym, {
            timestamp: now,
            rawOptions: optionsList,
            currentPrice,
            sourceProvider: 'cboe',
          });
          return { rawOptions: optionsList, currentPrice, sourceProvider: 'cboe' };
        }
      }
    } catch {
      // Fallback to authenticated Yahoo Finance Options endpoint
    }

    const yahooChain = await fetchYahooOptionsChain(symbol, forceRefresh);
    if (yahooChain && yahooChain.rawOptions.length > 0) {
      cboeChainCache.set(cboeSym, {
        timestamp: now,
        rawOptions: yahooChain.rawOptions,
        currentPrice: yahooChain.currentPrice,
        sourceProvider: 'yahoo_options',
      });
      return yahooChain;
    }

    return null;
  }

  async function fetchSECFilings(symbol: string) {
    if (options.fetchSECFilingsOverride) {
      return options.fetchSECFilingsOverride(symbol);
    }
    const cleanSym = symbol.replace('-USD', '').replace('=X', '').replace('=F', '').toUpperCase();
    const cachedSec = secCache.get(cleanSym);
    if (cachedSec) return cachedSec;

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
      const reportDates: string[] = recent.reportDate || [];
      const acceptanceDates: string[] = recent.acceptanceDateTime || [];
      const docs: string[] = recent.primaryDocDescription || [];
      const accNums: string[] = recent.accessionNumber || [];

      const filings = [];
      const max = Math.min(forms.length, 30);
      for (let i = 0; i < max; i++) {
        filings.push({
          form: forms[i],
          filingDate: dates[i] || 'N/A',
          reportDate: reportDates[i] || dates[i] || 'N/A',
          acceptanceDateTime: acceptanceDates[i] || '',
          description: docs[i] || `SEC Form ${forms[i]} Filing`,
          accessionNumber: accNums[i] || '',
          url: accNums[i]
            ? `https://www.sec.gov/edgar/browse/?CIK=${cik}`
            : 'https://www.sec.gov/edgar/searchedgar/companysearch',
        });
      }

      const resultPayload = {
        symbol: cleanSym,
        cik,
        entityName: data.name || cleanSym,
        available: true,
        filings,
      };
      secCache.set(cleanSym, resultPayload);
      return resultPayload;
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
      if (spxSummary?.chainAvailable) {
        sourceParts.push(
          spxChain?.sourceProvider === 'cboe'
            ? 'CBOE SPX Delayed Quotes Chain'
            : 'Yahoo Finance Live SPX Options Chain'
        );
      }
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

    async function fetchMarketHealthReport(forceRefresh: boolean = false): Promise<MarketHealthReport | null> {
      const now = Date.now();
      if (!forceRefresh && cachedMarketHealth && now - cachedMarketHealth.timestamp < 60_000) {
        return cachedMarketHealth.data;
      }

      const sectorEtfs = GICS_SECTORS_METADATA.map((m) => m.etf);
      const benchmarkSymbols = ['SPY', 'QQQ', 'IWM'];
      const volSymbols = ['^VIX', '^VIX3M', 'TLT'];

      const allSymbols = [...benchmarkSymbols, ...volSymbols, ...sectorEtfs];
      const [results, spyWeeklyCandles, qqqWeeklyCandles] = await Promise.all([
        Promise.all(allSymbols.map((sym) => fetchYahooData(sym, '1d', '1y', 20))),
        fetchYahooData('SPY', '1wk', '2y', 10),
        fetchYahooData('QQQ', '1wk', '2y', 10),
      ]);

      const bySym = new Map<string, Candle[]>();
      allSymbols.forEach((sym, idx) => {
        bySym.set(sym, results[idx] || []);
      });

      const spyCandles = bySym.get('SPY') || [];
      const vixCandles = bySym.get('^VIX') || [];
      if (spyCandles.length < 20) {
        return null;
      }

      const flowBenchmarkCandles: Record<string, Candle[]> = {};
      const sectorMap: Record<string, Candle[]> = {};
      for (const b of benchmarkSymbols) {
        const list = bySym.get(b);
        if (list && list.length > 0) flowBenchmarkCandles[b] = list;
      }
      for (const secSym of sectorEtfs) {
        const list = bySym.get(secSym);
        if (list && list.length > 0) {
          flowBenchmarkCandles[secSym] = list;
          sectorMap[secSym] = list;
        }
      }

      const report = computeMarketHealthReport({
        spyCandles,
        vixCandles,
        vix3mCandles: bySym.get('^VIX3M') || [],
        tltCandles: bySym.get('TLT') || [],
        flowBenchmarkCandles,
        sectorEtfs: sectorMap,
        spyWeeklyCandles,
        qqqWeeklyCandles,
      });

      cachedMarketHealth = { timestamp: now, data: report };
      return report;
    }

  return {
    candleCache,
    heatmapCache,
    secCache,
    lastFeedMetaMap,
    incrementApiRequests() {
      totalApiRequestsCount++;
    },
    recordCacheHit() {
      cacheHitsTotal++;
    },
    recordCacheMiss() {
      cacheMissesTotal++;
    },
    recordScanCompletion(durationMs: number, batchSize: number, pushLatency: boolean = true) {
      lastScanDurationMs = durationMs;
      lastScannedBatchSize = batchSize;
      totalTickersScannedCounter += batchSize;
      consecutiveSuccessfulScans++;
      lastScanTimestampIso = new Date().toISOString();
      if (pushLatency) {
        recentScanLatencies.push(Math.round(durationMs / Math.max(1, batchSize / 30)));
        if (recentScanLatencies.length > 20) recentScanLatencies.shift();
      }
    },
    getCachedSectors() {
      return cachedSectors;
    },
    setCachedSectors(val: { timestamp: number; data: GicsSectorPerformance[] } | null) {
      cachedSectors = val;
    },
    getCachedStageScan() {
      return cachedStageScan;
    },
    setCachedStageScan(val: { timestamp: number; stages: UniverseStageItem[] } | null) {
      cachedStageScan = val;
    },
    clearAllCaches() {
      const count = candleCache.size + heatmapCache.size + cboeChainCache.size + secCache.size;
      candleCache.clear();
      heatmapCache.clear();
      cboeChainCache.clear();
      secCache.clear();
      lastFeedMetaMap.clear();
      cachedSectors = null;
      cachedCboeData = null;
      cachedStageScan = null;
      cachedMarketHealth = null;
      return count;
    },
    getTelemetry() {
      return {
        recentScanLatencies,
        totalTickersScannedCounter,
        lastScanDurationMs,
        lastScannedBatchSize,
        totalApiRequestsCount,
        rateLimitHitsCount,
        cacheHitsTotal,
        cacheMissesTotal,
        consecutiveSuccessfulScans,
        lastScanTimestampIso,
        cachedSymbolsCount: candleCache.size,
      };
    },
    fetchYahooData,
    fetchYahooSparkBatch,
    fetchYahooMeta,
    fetchCboeRawChain,
    fetchSECFilings,
    fetchLiveCboeData,
    fetchMarketHealthReport,
  };
}

export type MarketDataService = ReturnType<typeof createMarketDataService>;
