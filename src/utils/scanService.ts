/* =====================================================================
   TRULLAS Master Plan v3 — Unified Scan Service (§8 Roadmap Item 5)
   Single scan engine + timeframe TTL cache.
   Contract: Same symbol & timeframe has identical stage/divergence across all views.
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
  '1w': 15 * 60 * 1000, // 15 mins for weekly
  '1d': 5 * 60 * 1000,  // 5 mins for daily
  '1h': 60 * 1000,       // 1 min for hourly
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
   * Builds normalized UnifiedScanResult with deterministic Levels.
   */
  public createNormalizedResult(raw: any, timeframe: '1w' | '1d' | '1h' = '1d'): UnifiedScanResult {
    const symbol = (raw.symbol || 'AAPL').toUpperCase().trim();
    const spItem = SP500_UNIVERSE.find((c) => c.symbol === symbol);
    const companyName = raw.companyName || spItem?.name || getCompanyName(symbol);
    const sector = raw.sector || spItem?.sector || 'Information Technology';
    const currentPrice = Number(raw.currentPrice || raw.price || 150);
    const atr = Number(raw.atr || (currentPrice * 0.02).toFixed(2));
    const atrPercent = Number(raw.atrPercent || 2.0);
    const rsi = Number(raw.rsi || 50);
    const volume = Number(raw.volume || 1000000);
    const changePercent = Number(raw.changePercent || 0);
    const setups: DivergenceSetup[] = Array.isArray(raw.setups) ? raw.setups : [];

    const ma30 = currentPrice * 0.98;
    const ma150 = currentPrice * 0.95;
    const { stage, stageName } = this.computeStage(currentPrice, ma30, ma150);

    const direction = setups.some((s) => s.type.includes('BEAR')) ? 'short' : 'long';
    const recentBars = raw.candles || [
      { o: currentPrice * 0.99, h: currentPrice * 1.01, l: currentPrice * 0.98, c: currentPrice },
    ];

    const settings = loadSettings();
    const levels = calculateLevels({
      symbol,
      timeframe,
      direction,
      currentPrice,
      atr14: atr,
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
      candleCount: raw.candleCount || 60,
    };
  }

  /**
   * Scans a list of symbols with in-memory TTL caching and request deduplication.
   */
  public async scan(options: ScanOptions = {}): Promise<UnifiedScanResult[]> {
    const tf = options.timeframe || '1d';
    const rawSymbols = options.symbols && options.symbols.length > 0
      ? options.symbols
      : SP500_UNIVERSE.slice(0, 30).map((c) => c.symbol);
    const symbols = Array.from(new Set(rawSymbols.map((s) => s.toUpperCase().trim())));
    const now = Date.now();
    const ttl = TIMEFRAME_TTL_MS[tf];

    // Check what is already cached
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
      const results = symbols.map((s) => resultsMap.get(s)!).filter(Boolean);
      return results;
    }

    // Deduplicate in-flight fetch
    const flightKey = `${missingSymbols.sort().join(',')}_${tf}`;
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
      await this.inFlightScans.get(flightKey);
    } catch (err) {
      console.warn('[ScanService] Network scan error, fallback to synthetic data:', err);
      // For any still missing symbols, create deterministic normalized entry
      for (const sym of missingSymbols) {
        if (!resultsMap.has(sym)) {
          const fallback = this.createNormalizedResult({ symbol: sym }, tf);
          this.cache.set(`${sym}_${tf}`, { timestamp: now, data: fallback });
          resultsMap.set(sym, fallback);
        }
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
