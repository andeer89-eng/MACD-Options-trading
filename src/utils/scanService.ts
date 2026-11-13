/* =====================================================================
   TRULLAS Master Plan v3 — Unified Scan Service (§8 Roadmap Item 5)
   Single scan engine + timeframe TTL cache.
   Strictly real upstream data — never fabricates $150 synthetic fallback prices.
   ===================================================================== */

import { Levels, calculateLevels, DataQuality, loadSettings } from './masterPlanCore';
import { DivergenceSetup } from './trullasStrategy';
import { SP500_UNIVERSE, getCompanyName } from '../data/sp500Universe';

export interface UnifiedScanResult {
  symbol: string;
  companyName: string;
  sector: string;
  timeframe: '1w' | '1d' | '1h';
  currentPrice: number;
  changePercent: number;
  volume: number;
  rsi: number;
  atr: number;
  atrPercent: number;
  setups: DivergenceSetup[];
  hasTripleDivergence: boolean;
  hasDoubleDivergence: boolean;
  stage: 1 | 2 | 3 | 4;
  stageName: 'Stage 1 Basing' | 'Stage 2 Advancing' | 'Stage 3 Topping' | 'Stage 4 Declining';
  levels: Levels;
  asOf: string;
  dataQuality: DataQuality;
  candleCount: number;
}

export interface ScanOptions {
  symbols?: string[];
  timeframe?: '1w' | '1d' | '1h';
  forceRefresh?: boolean;
}

interface CacheEntry {
  timestamp: number;
  data: UnifiedScanResult;
}

const TIMEFRAME_TTL_MS: Record<'1w' | '1d' | '1h', number> = {
  '1w': 15 * 60 * 1000,
  '1d': 5 * 60 * 1000,
  '1h': 60 * 1000,
};

class ScanService {
  private cache = new Map<string, CacheEntry>();
  private inFlightScans = new Map<string, Promise<UnifiedScanResult[]>>();
  private listeners = new Set<(results: UnifiedScanResult[]) => void>();

  /**
   * Deterministic stage calculation helper (Stan Weinstein Stage Analysis)
   */
  public computeStage(
    currentPrice: number,
    ma30: number,
    ma150: number
  ): { stage: 1 | 2 | 3 | 4; stageName: 'Stage 1 Basing' | 'Stage 2 Advancing' | 'Stage 3 Topping' | 'Stage 4 Declining' } {
    if (currentPrice > ma30 && ma30 > ma150) {
      return { stage: 2, stageName: 'Stage 2 Advancing' };
    }
    if (currentPrice < ma30 && ma30 < ma150) {
      return { stage: 4, stageName: 'Stage 4 Declining' };
    }
    if (currentPrice >= ma30 && ma30 <= ma150) {
      return { stage: 1, stageName: 'Stage 1 Basing' };
    }
    return { stage: 3, stageName: 'Stage 3 Topping' };
  }

  /**
   * Builds normalized UnifiedScanResult with deterministic Levels from real quote/candle fields.
   */
  public createNormalizedResult(raw: any, timeframe: '1w' | '1d' | '1h' = '1d'): UnifiedScanResult {
    const symbol = String(raw.symbol || '').toUpperCase().trim();
    const spItem = SP500_UNIVERSE.find((c) => c.symbol === symbol);
    const companyName = raw.companyName || spItem?.name || getCompanyName(symbol);
    const sector = raw.sector || spItem?.sector || 'Equities';
    const currentPrice = Number(raw.currentPrice ?? raw.price ?? 0);
    const atr = Number(raw.atr ?? 0);
    const atrPercent = Number(raw.atrPercent ?? (currentPrice > 0 && atr > 0 ? Number(((atr / currentPrice) * 100).toFixed(2)) : 0));
    const rsi = Number(raw.rsi ?? 50);
    const volume = Number(raw.volume ?? 0);
    const changePercent = Number(raw.changePercent ?? 0);
    const setups: DivergenceSetup[] = Array.isArray(raw.setups) ? raw.setups : [];

    // Compute real SMAs from provided candles if available, else use explicit raw ma30/ma150
    let ma30 = typeof raw.ma30 === 'number' && raw.ma30 > 0 ? raw.ma30 : currentPrice;
    let ma150 = typeof raw.ma150 === 'number' && raw.ma150 > 0 ? raw.ma150 : currentPrice;

    if (Array.isArray(raw.candles) && raw.candles.length > 0) {
      const closes: number[] = raw.candles.map((c: any) => Number(c.close ?? c.c ?? 0)).filter((v: number) => v > 0);
      if (closes.length >= 20) {
        const w30 = closes.slice(-Math.min(30, closes.length));
        ma30 = w30.reduce((a, b) => a + b, 0) / w30.length;
        const w150 = closes.slice(-Math.min(150, closes.length));
        ma150 = w150.reduce((a, b) => a + b, 0) / w150.length;
      }
    }

    const { stage, stageName } = this.computeStage(currentPrice, ma30, ma150);

    const direction = setups.some((s) => s.type.includes('BEAR')) ? 'short' : 'long';
    const recentBars = Array.isArray(raw.candles) && raw.candles.length > 0
      ? raw.candles.map((c: any) => ({
          o: Number(c.open ?? c.o ?? currentPrice),
          h: Number(c.high ?? c.h ?? currentPrice),
          l: Number(c.low ?? c.l ?? currentPrice),
          c: Number(c.close ?? c.c ?? currentPrice),
        }))
      : [{ o: currentPrice, h: currentPrice, l: currentPrice, c: currentPrice }];

    const settings = loadSettings();
    const effectiveAtr = atr > 0 ? atr : currentPrice * 0.015;
    const levels = calculateLevels({
      symbol,
      timeframe,
      direction,
      currentPrice,
      atr14: effectiveAtr,
      recentBars,
      dataQuality: settings.dataQuality,
      ma30,
      ma150,
    });

    return {
      symbol,
      companyName,
      sector,
      timeframe,
      currentPrice,
      changePercent,
      volume,
      rsi,
      atr,
      atrPercent,
      setups,
      hasTripleDivergence: setups.some((s) => s.type.includes('TRIPLE')),
      hasDoubleDivergence: setups.some((s) => s.type.includes('DOUBLE')),
      stage,
      stageName,
      levels,
      asOf: new Date().toISOString(),
      dataQuality: settings.dataQuality,
      candleCount: Number(raw.candleCount ?? (Array.isArray(raw.candles) ? raw.candles.length : 0)),
    };
  }

  /**
   * Scans a list of symbols with in-memory TTL caching and request deduplication.
   * Never fabricates synthetic entries if /api/scan fails.
   */
  public async scan(options: ScanOptions = {}): Promise<UnifiedScanResult[]> {
    const tf = options.timeframe || '1d';
    const rawSymbols = options.symbols && options.symbols.length > 0
      ? options.symbols
      : SP500_UNIVERSE.slice(0, 30).map((c) => c.symbol);
    const symbols = Array.from(new Set(rawSymbols.map((s) => s.toUpperCase().trim())));
    const now = Date.now();
    const ttl = TIMEFRAME_TTL_MS[tf];

    const missingSymbols: string[] = [];
    const resultsMap = new Map<string, UnifiedScanResult>();

    if (!options.forceRefresh) {
      for (const sym of symbols) {
        const key = `${sym}_${tf}`;
        const entry = this.cache.get(key);
        if (entry && now - entry.timestamp < ttl) {
          resultsMap.set(sym, entry.data);
        } else {
          missingSymbols.push(sym);
        }
      }
    } else {
      missingSymbols.push(...symbols);
    }

    if (missingSymbols.length === 0) {
      return symbols.map((s) => resultsMap.get(s)!).filter(Boolean);
    }

    const flightKey = `${missingSymbols.slice().sort().join(',')}_${tf}`;
    if (!this.inFlightScans.has(flightKey)) {
      const promise = (async () => {
        try {
          const res = await fetch('/api/scan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tickers: missingSymbols, timeframe: tf }),
          });

          if (!res.ok) {
            throw new Error(`Scan API responded with status ${res.status}`);
          }

          const json = await res.json();
          const items: UnifiedScanResult[] = [];

          for (const raw of json.results || []) {
            if (!raw || typeof raw.currentPrice !== 'number' || raw.currentPrice <= 0) continue;
            const normalized = this.createNormalizedResult(raw, tf);
            this.cache.set(`${normalized.symbol}_${tf}`, {
              timestamp: now,
              data: normalized,
            });
            resultsMap.set(normalized.symbol, normalized);
            items.push(normalized);
          }

          return items;
        } finally {
          this.inFlightScans.delete(flightKey);
        }
      })();

      this.inFlightScans.set(flightKey, promise);
    }

    try {
      const scanned = await this.inFlightScans.get(flightKey);
      if (scanned) {
        for (const item of scanned) {
          resultsMap.set(item.symbol, item);
        }
      }
    } catch (err) {
      console.error('[ScanService] Live market scan failed:', err);
      // Do NOT synthesize fake $150 data; propagate or return any genuinely cached entries
      if (resultsMap.size === 0) {
        throw err;
      }
    }

    const finalResults = symbols.map((s) => resultsMap.get(s)!).filter(Boolean);
    this.notifyListeners(finalResults);
    return finalResults;
  }

  public getCached(symbol: string, timeframe: '1w' | '1d' | '1h' = '1d'): UnifiedScanResult | null {
    const key = `${symbol.toUpperCase().trim()}_${timeframe}`;
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp >= TIMEFRAME_TTL_MS[timeframe]) return null;
    return entry.data;
  }

  public clearCache(): void {
    this.cache.clear();
  }

  public subscribe(cb: (results: UnifiedScanResult[]) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private notifyListeners(results: UnifiedScanResult[]) {
    this.listeners.forEach((cb) => {
      try {
        cb(results);
      } catch (e) {
        console.error('[ScanService Notification Error]:', e);
      }
    });
  }
}

export const scanService = new ScanService();
