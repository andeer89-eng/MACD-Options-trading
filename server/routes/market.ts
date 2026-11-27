import { Router, Request, Response } from 'express';
import {
  calculateIndicators,
  detectDivergences,
  filterActiveDivergences,
  getLatestVolatilityMetrics,
  Candle,
} from '../../src/utils/trullasStrategy.ts';
import { SP500_UNIVERSE } from '../../src/data/sp500Universe.ts';
import { lookupGlobalCompany } from '../../src/data/globalTickers.ts';
import {
  GICS_SECTORS_METADATA,
  GicsSectorPerformance,
} from '../../src/utils/sectorMetrics.ts';
import {
  calculateNadarayaWatsonEnvelope,
  calculateSmartMoneyConcepts,
  calculateLuxAlgoOscillatorMatrix,
  calculateLuxAlgoConfluence,
} from '../../src/utils/luxalgoIndicators.ts';
import { evaluateTradeAdvice } from '../../src/utils/tradeActionEngine.ts';
import {
  evaluateTosScans,
  computeRelativePerformanceVsBenchmark,
} from '../../src/utils/tosScansEngine.ts';
import {
  TickerOptionsSummary,
  calculateHistoricalVol30dPct,
  summarizeCboeOptionsChain,
  createUnavailableTickerOptionsSummary,
} from '../../src/utils/cboeOptionsEngine.ts';
import {
  executePineScriptIndicator,
} from '../../src/utils/pineScriptExecutor.ts';
import { validatePineScriptHeader } from '../../src/utils/indicatorLibrary.ts';
import { deduplicateSymbols } from '../../src/utils/dataFetcher.ts';
import {
  HeatmapItem,
  KNOWN_MARKET_CAPS,
  CRYPTO_HEATMAP_UNIVERSE,
  getCustomTag,
  calculateHeatmapSummary,
  Timeframe as HeatmapTimeframe,
} from '../../src/utils/heatmapEngine.ts';
import {
  computeStageSummaryFromCandles,
  UniverseStageItem,
} from '../../src/utils/trendSpiderUniverse.ts';
import { CandleData } from '../../src/utils/trendSpiderEngine.ts';
import {
  MarketDataService,
  USER_AGENT,
  YahooSparkEntry,
  computeRsiFromCloses,
} from '../services/marketData.ts';

const VALID_SYMBOL_REGEX = /^[A-Za-z0-9.^=\-_]{1,20}$/;
const ALLOWED_TIMEFRAMES = new Set(['1m', '2m', '5m', '15m', '30m', '60m', '1h', '1d', '1wk', '1mo']);

export function createMarketRouter(marketData: MarketDataService): Router {
  const router = Router();

  // API 1: Candles & Indicators for a single symbol
  router.get('/api/candles', async (req: Request, res: Response) => {
    marketData.incrementApiRequests();
    const rawSymbol = req.query.symbol;
    if (typeof rawSymbol !== 'string' || !VALID_SYMBOL_REGEX.test(rawSymbol.trim())) {
      return res.status(400).json({ error: 'Invalid or missing symbol query parameter.' });
    }
    const symbol = rawSymbol.trim().toUpperCase();

    const rawTimeframe = req.query.timeframe;
    const timeframe = typeof rawTimeframe === 'string' && rawTimeframe.trim() ? rawTimeframe.trim() : '1d';
    if (!ALLOWED_TIMEFRAMES.has(timeframe)) {
      return res.status(400).json({ error: `Invalid timeframe "${timeframe}".` });
    }

    const range = (typeof req.query.range === 'string' && req.query.range.trim()) || '3mo';

    const [candles, sec] = await Promise.all([
      marketData.fetchYahooData(symbol, timeframe, range, 5),
      marketData.fetchSECFilings(symbol),
    ]);
    const indicatorPoints = candles.length > 0 ? calculateIndicators(candles) : [];
    const historicalDivergences =
      indicatorPoints.length > 0 ? detectDivergences(symbol, timeframe, indicatorPoints) : [];
    const divergences = filterActiveDivergences(historicalDivergences, candles);

    const feedMeta = marketData.lastFeedMetaMap.get(symbol.toUpperCase()) || {
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
      historicalDivergences,
      sec,
      feedMeta,
    });
  });

  // API 2: SEC Filings inspector
  router.get('/api/sec-filings', async (req: Request, res: Response) => {
    marketData.incrementApiRequests();
    const symbol = (req.query.symbol as string) || 'AAPL';
    const sec = await marketData.fetchSECFilings(symbol);
    res.json(sec);
  });

  // API 2.5: S&P 500 Universe Catalog
  router.get('/api/sp500-universe', (_req: Request, res: Response) => {
    res.json({
      count: SP500_UNIVERSE.length,
      companies: SP500_UNIVERSE,
    });
  });

  // API 2.55: Global Ticker & Company Profile Lookup
  router.get('/api/lookup-ticker', async (req: Request, res: Response) => {
    marketData.incrementApiRequests();
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

  // API 2.6: Live GICS Sector Performance Metrics (via SPDR ETFs + SPY relative strength)
  router.get('/api/sectors', async (req: Request, res: Response) => {
    marketData.incrementApiRequests();
    try {
      const now = Date.now();
      const force = req.query.refresh === 'true';
      const cached = marketData.getCachedSectors();
      if (!force && cached && now - cached.timestamp < 60_000) {
        return res.json({
          cached: true,
          timestamp: cached.timestamp,
          sectors: cached.data,
        });
      }

      const [spyCandles, ...etfCandlesList] = await Promise.all([
        marketData.fetchYahooData('SPY', '1d', '1mo', 2),
        ...GICS_SECTORS_METADATA.map((meta) => marketData.fetchYahooData(meta.etf, '1d', '1mo', 2)),
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

      marketData.setCachedSectors({ timestamp: now, data: sectorsData });
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

  // API 2.9: LuxAlgo Indicators Suite
  router.get('/api/luxalgo/indicators', async (req: Request, res: Response) => {
    marketData.incrementApiRequests();
    try {
      const symbol = (req.query.symbol as string) || 'AAPL';
      const timeframe = (req.query.timeframe as string) || '1d';
      const range = (req.query.range as string) || '6mo';
      const bandwidth = parseFloat(req.query.bandwidth as string) || 8.0;
      const multiplier = parseFloat(req.query.multiplier as string) || 2.5;

      const candles = await marketData.fetchYahooData(symbol, timeframe, range, 25);
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

  // API 2.95: LuxAlgo PineTS Pine Script Execution Engine (strictly live market bars)
  router.post('/api/luxalgo/pinets-run', async (req: Request, res: Response) => {
    marketData.incrementApiRequests();
    try {
      const {
        symbol = 'AAPL',
        timeframe = '1d',
        range = '6mo',
        pineCode = '//@version=5\nindicator("LuxAlgo NWE Confluence", overlay=true)\nplot(ta.ema(close, 20), color=color.blue)',
        candles: providedCandles,
      } = req.body || {};

      const header = validatePineScriptHeader(pineCode);
      const candles =
        Array.isArray(providedCandles) && providedCandles.length >= 25
          ? providedCandles
          : await marketData.fetchYahooData(String(symbol), String(timeframe), String(range), 25);

      if (!Array.isArray(candles) || candles.length < 25) {
        return res.status(503).json({
          symbol,
          syntaxValid: false,
          error: `Live market OHLCV data unavailable or insufficient bars for ${symbol} (${timeframe}).`,
        });
      }

      const execRes = await executePineScriptIndicator(
        { id: 'api-pinets-check', name: header.name, pineCode },
        candles,
        { symbol: String(symbol), timeframe: String(timeframe) }
      );

      res.json({
        symbol,
        candleCount: candles.length,
        syntaxValid: execRes.ok,
        overlay: execRes.overlay,
        name: execRes.name,
        version: header.version,
        runtime: 'pinets-0.13.1',
        transpiledPreview: execRes.ok
          ? `${execRes.plots.length} plot(s), ${execRes.fills.length} fill(s), ${execRes.shapes.length} shape(s), ${execRes.boxes.length} box(es), ${execRes.tables.length} table(s)`
          : '',
        error: execRes.error || null,
      });
    } catch (err: any) {
      res.status(500).json({ error: 'PineTS execution failed', message: err.message });
    }
  });

  // API 2.98: Parallel Worker Engine for Trade Action Zone across S&P 500
  router.post('/api/trade-advice', async (req: Request, res: Response) => {
    const scanStart = Date.now();
    marketData.incrementApiRequests();
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
              const cached = marketData.candleCache.get(cacheKey);

              if (cached && now - cached.timestamp < 120000) {
                candles = cached.candles;
                cachedHits++;
                marketData.recordCacheHit();
              } else {
                marketData.recordCacheMiss();
                candles = await marketData.fetchYahooData(sym, timeframe, '6mo', 20);
                if (candles.length >= 20) {
                  marketData.candleCache.set(cacheKey, { timestamp: now, candles });
                }
              }

              if (candles.length >= 20) {
                const indicators = calculateIndicators(candles);
                const setups = filterActiveDivergences(
                  detectDivergences(sym, timeframe, indicators),
                  candles
                );
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
      marketData.recordScanCompletion(durationMs, targetTickers.length, false);

      res.json({
        timeframe,
        totalEvaluated: targetTickers.length,
        count: adviceList.length,
        cachedHits,
        workerThreads: 1,
        concurrencyChunkSize: 50,
        advice: adviceList,
      });
    } catch (err: any) {
      console.error('[Trade Advice API Error]:', err);
      res.status(500).json({ error: 'Failed to compute trade advice', message: err.message });
    }
  });

  // API 2.99: Live CBOE Options Chain & Greeks Engine
  router.get('/api/cboe-options', async (req: Request, res: Response) => {
    marketData.incrementApiRequests();
    try {
      const symbol = ((req.query.symbol as string) || 'NVDA').toUpperCase().trim();
      const selectedExpiration = req.query.expiration as string | undefined;
      const forceRefresh = req.query.refresh === 'true';
      const spItem = SP500_UNIVERSE.find((c) => c.symbol.toUpperCase() === symbol);

      const [candles, cboeChain, marketOverview] = await Promise.all([
        marketData.fetchYahooData(symbol, '1d', '1y', 2),
        marketData.fetchCboeRawChain(symbol, forceRefresh),
        marketData.fetchLiveCboeData(forceRefresh),
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
  router.get('/api/cboe/market-overview', async (req: Request, res: Response) => {
    marketData.incrementApiRequests();
    try {
      const forceRefresh = req.query.refresh === 'true';
      const overview = await marketData.fetchLiveCboeData(forceRefresh);
      res.json({ marketOverview: overview });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to fetch CBOE overview', message: err.message });
    }
  });

  // API 2.9915: Real-Data Market Health, 1M Fear & Greed History, VIX Regime & Net Volume Flow
  router.get('/api/market-health', async (req: Request, res: Response) => {
    marketData.incrementApiRequests();
    try {
      const forceRefresh = req.query.refresh === 'true';
      const report = await marketData.fetchMarketHealthReport(forceRefresh);
      if (!report) {
        return res.status(503).json({
          error: 'Live SPY, ^VIX, and sector ETF OHLCV feeds are temporarily unavailable for Market Health calculation.',
        });
      }
      res.json(report);
    } catch (err: any) {
      res.status(503).json({
        error: 'Failed to compute live Market Health report.',
        message: err?.message,
      });
    }
  });

  // API 2.992: Multi-dimensional Live Market State Heatmap Endpoint
  router.get('/api/heatmap', async (req: Request, res: Response) => {
    marketData.incrementApiRequests();
    try {
      const timeframe = ((req.query.timeframe as HeatmapTimeframe) || '1D') as HeatmapTimeframe;
      const force = req.query.refresh === 'true';
      const range = timeframe === 'YTD' ? 'ytd' : '3mo';
      const cacheKey = `heatmap_${range}`;
      const now = Date.now();

      let items: HeatmapItem[] | undefined;
      const cached = !force ? marketData.heatmapCache.get(cacheKey) : undefined;
      if (cached) {
        items = cached.items;
        marketData.recordCacheHit();
      }

      if (!items) {
        marketData.recordCacheMiss();
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

        const [dailySparkMap, intradaySparkMap] = await Promise.all([
          marketData.fetchYahooSparkBatch(
            universeEntries.map((u) => u.symbol),
            range,
            '1d'
          ),
          marketData.fetchYahooSparkBatch(
            universeEntries.map((u) => u.symbol),
            '1d',
            '1m'
          ),
        ]);

        items = [];
        for (const meta of universeEntries) {
          const entry = dailySparkMap.get(meta.symbol);
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

          const chg1D = Number((((latestClose - prevClose) / prevClose) * 100).toFixed(2));
          const chg1W = Number((((latestClose - weekClose) / weekClose) * 100).toFixed(2));
          const chgPeriod = Number((((latestClose - startClose) / startClose) * 100).toFixed(2));

          let chg1m: number = 0;
          let chg15m: number = 0;
          const intraEntry = intradaySparkMap.get(meta.symbol);
          if (intraEntry && Array.isArray(intraEntry.close)) {
            const intraCloses = intraEntry.close.filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0);
            if (intraCloses.length >= 2) {
              const cur = intraCloses[intraCloses.length - 1];
              const prev1 = intraCloses[intraCloses.length - 2];
              const prev15 = intraCloses[Math.max(0, intraCloses.length - 16)];
              chg1m = Number((((cur - prev1) / prev1) * 100).toFixed(2));
              chg15m = Number((((cur - prev15) / prev15) * 100).toFixed(2));
            }
          }

          const rsi = computeRsiFromCloses(closes, 14);
          const marketCapM: number | null = KNOWN_MARKET_CAPS[meta.symbol] ?? null;

          const cachedDaily = marketData.candleCache.get(`${meta.symbol}_1d`);
          let volume24hM: number | null = null;
          let avgVolM: number | null = null;
          let rvol: number | null = null;

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

          const netDeltaFlowM: number | null = null;
          const squeezeRiskScore: number | null =
            rvol !== null && typeof chg1D === 'number'
              ? Number(
                  Math.max(0, Math.min(100, (chg1D > 3 ? 35 : 15) + Math.max(0, rsi - 50) * 0.8 + rvol * 10)).toFixed(0)
                )
              : null;

          let anomalyAlert: HeatmapItem['anomalyAlert'];
          if (rvol !== null && rvol >= 2.2) anomalyAlert = 'VOLUME_SPIKE';
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
              '1m': chg1m,
              '15m': chg15m,
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
            hasEarningsSoon: null,
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

        marketData.heatmapCache.set(cacheKey, { timestamp: now, items });
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

  // API 2.9925: Real Stan Weinstein 4-Stage Scan across S&P 500
  router.get('/api/stage-scan', async (req: Request, res: Response) => {
    marketData.incrementApiRequests();
    try {
      const force = req.query.refresh === 'true';
      const now = Date.now();
      const cached = marketData.getCachedStageScan();
      if (!force && cached && now - cached.timestamp < 120_000) {
        return res.json({
          cached: true,
          timestamp: new Date(cached.timestamp).toISOString(),
          count: cached.stages.length,
          stages: cached.stages,
        });
      }

      const symbols = ['SPY', ...SP500_UNIVERSE.map((c) => c.symbol)];
      const sparkMap = await marketData.fetchYahooSparkBatch(symbols, '2y', '1wk');

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

      marketData.setCachedStageScan({ timestamp: now, stages });
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

  // API 3: Multi-ticker scan with parallel chunking and caching
  router.post('/api/scan', async (req: Request, res: Response) => {
    const scanStart = Date.now();
    marketData.incrementApiRequests();
    const { tickers = SP500_UNIVERSE.map((c) => c.symbol), timeframe = '1d' } = req.body || {};
    const rawTickerList: string[] =
      Array.isArray(tickers) && tickers.length > 0 ? tickers : SP500_UNIVERSE.map((c) => c.symbol);
    const tickerList = deduplicateSymbols(rawTickerList);

    const results: any[] = [];
    const CHUNK_SIZE = 30;
    const now = Date.now();

    const scanRange =
      timeframe === '1d'
        ? '6mo'
        : timeframe === '1h'
        ? '3mo'
        : timeframe === '15m' || timeframe === '5m'
        ? '1mo'
        : '5d';

    // Fetch SPY benchmark once per scan batch for 30-bar Relative Performance (Alpha vs SPY)
    let spyBenchmarkCandles: Candle[] = [];
    try {
      const spyCacheKey = `SPY_${timeframe}_${scanRange}`;
      const spyCached = marketData.candleCache.get(spyCacheKey);
      if (spyCached && now - spyCached.timestamp < 120000) {
        spyBenchmarkCandles = spyCached.candles;
      } else {
        spyBenchmarkCandles = await marketData.fetchYahooData('SPY', timeframe, scanRange, 20);
        if (spyBenchmarkCandles.length >= 20) {
          marketData.candleCache.set(spyCacheKey, { timestamp: now, candles: spyBenchmarkCandles });
        }
      }
    } catch {
      spyBenchmarkCandles = [];
    }

    for (let i = 0; i < tickerList.length; i += CHUNK_SIZE) {
      const chunk = tickerList.slice(i, i + CHUNK_SIZE);
      const chunkResults = await Promise.all(
        chunk.map(async (sym) => {
          try {
            const cacheKey = `${sym}_${timeframe}_${scanRange}`;
            let candles: Candle[];
            const cached = marketData.candleCache.get(cacheKey);

            if (cached && now - cached.timestamp < 120000) {
              candles = cached.candles;
              marketData.recordCacheHit();
            } else {
              marketData.recordCacheMiss();
              candles = await marketData.fetchYahooData(sym, timeframe, scanRange, 20);
              if (candles.length >= 20) {
                marketData.candleCache.set(cacheKey, { timestamp: now, candles });
              }
            }

            if (candles.length >= 20) {
              const indicators = calculateIndicators(candles);
              const setups = filterActiveDivergences(
                detectDivergences(sym, timeframe, indicators),
                candles
              );
              const tosScans = evaluateTosScans(sym, candles);
              const relPerf =
                sym === 'SPY'
                  ? null
                  : computeRelativePerformanceVsBenchmark(candles, spyBenchmarkCandles, 30);
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
                tosScans,
                relPerfVsSpyPct: relPerf ? relPerf.alphaVsBenchmarkPct : null,
                return30dPct: relPerf ? relPerf.symbolReturnPct : null,
                sec: {
                  symbol: sym,
                  available: false,
                  cik: spItem?.cik || null,
                  note: 'Fetch on demand via /api/sec-filings',
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
    marketData.recordScanCompletion(duration, tickerList.length, true);

    res.json({
      timestamp: Date.now(),
      scannedCount: tickerList.length,
      durationMs: duration,
      results,
    });
  });

  return router;
}
