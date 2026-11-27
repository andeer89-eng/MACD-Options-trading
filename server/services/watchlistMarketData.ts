import { createHash } from 'node:crypto';
import type { Candle, DivergenceSetup } from '../../src/utils/trullasStrategy.ts';
import { normalizeSymbolForYahoo } from '../../src/utils/dataFetcher.ts';

export const WATCHLIST_MARKET_DATA_PROVIDER = 'YAHOO_FINANCE_CHART_V8' as const;
export const WATCHLIST_CANDLE_CLOSURE_POLICY = 'DROP_LATEST_RETURNED_BAR' as const;

export type WatchlistSignalMarketData = {
  provider: typeof WATCHLIST_MARKET_DATA_PROVIDER;
  providerLabel: 'Yahoo Finance Chart API v8';
  symbol: string;
  providerSymbol: string;
  timeframe: string;
  range: string;
  exchange: string;
  exchangeTimezone: string;
  currency: string;
  sourceUrl: string;
  retrievedAt: number;
  closurePolicy: typeof WATCHLIST_CANDLE_CLOSURE_POLICY;
  excludedLatestCandleTimestamp: number;
  candles: Candle[];
  normalizedPayloadSha256: string;
};

export type WatchlistMarketDataBuildResult =
  | { ok: true; evidence: WatchlistSignalMarketData }
  | { ok: false; reason: string };

/**
 * Build auditable market-data evidence from Yahoo chart candles.
 *
 * The provider does not expose a trustworthy per-candle finalization flag in
 * this integration. We therefore exclude the newest returned bar entirely.
 * The digest covers normalized OHLCV/date records, not Yahoo's original HTTP bytes.
 */
export function buildWatchlistSignalMarketData(input: {
  symbol: string;
  timeframe: string;
  range: string;
  candles: Candle[];
  retrievedAt: number;
  feedMetadata: {
    isLiveFeed?: boolean;
    source?: string;
    exchange?: string;
    exchangeTimezone?: string;
    currency?: string;
  } | null | undefined;
}): WatchlistMarketDataBuildResult {
  const symbol = input.symbol.trim().toUpperCase();
  const timeframe = input.timeframe.trim();
  const range = input.range.trim();
  const providerSymbol = normalizeSymbolForYahoo(symbol);
  const meta = input.feedMetadata;

  if (!symbol || !timeframe || !range) return { ok: false, reason: 'SYMBOL_TIMEFRAME_OR_RANGE_MISSING' };
  if (!Number.isFinite(input.retrievedAt) || input.retrievedAt <= 0) {
    return { ok: false, reason: 'INVALID_RETRIEVAL_TIMESTAMP' };
  }
  if (!meta || meta.isLiveFeed !== true || !String(meta.source || '').startsWith('Yahoo Finance v8')) {
    return { ok: false, reason: 'TRUSTED_YAHOO_FEED_METADATA_UNAVAILABLE' };
  }
  if (!Array.isArray(input.candles) || input.candles.length < 3) {
    return { ok: false, reason: 'INSUFFICIENT_CANDLES_TO_PROVE_PRIOR_BAR_CLOSURE' };
  }

  const ordered = [...input.candles];
  let priorTimestamp = 0;
  for (const candle of ordered) {
    if (
      !candle ||
      !Number.isFinite(candle.timestamp) ||
      candle.timestamp <= priorTimestamp ||
      candle.timestamp > input.retrievedAt ||
      ![candle.open, candle.high, candle.low, candle.close].every(
        value => Number.isFinite(value) && value > 0
      ) ||
      !Number.isFinite(candle.volume) || candle.volume < 0 ||
      typeof candle.dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(candle.dateStr) ||
      Number.isNaN(Date.parse(candle.dateStr)) || new Date(candle.timestamp).toISOString().slice(0, 10) !== candle.dateStr ||
      candle.high < Math.max(candle.open, candle.close, candle.low) ||
      candle.low > Math.min(candle.open, candle.close, candle.high)
    ) {
      return { ok: false, reason: 'INVALID_OR_NON_CHRONOLOGICAL_PROVIDER_CANDLES' };
    }
    priorTimestamp = candle.timestamp;
  }

  const excludedLatestCandleTimestamp = ordered[ordered.length - 1].timestamp;
  const candles = ordered.slice(0, -1).map(candle => ({ ...candle }));
  if (candles.length < 2) return { ok: false, reason: 'INSUFFICIENT_CLOSED_CANDLES' };

  const normalizedPayloadSha256 = createHash('sha256')
    .update(JSON.stringify(candles))
    .digest('hex');

  return {
    ok: true,
    evidence: {
      provider: WATCHLIST_MARKET_DATA_PROVIDER,
      providerLabel: 'Yahoo Finance Chart API v8',
      symbol,
      providerSymbol,
      timeframe,
      range,
      exchange: String(meta.exchange || 'UNKNOWN'),
      exchangeTimezone: String(meta.exchangeTimezone || 'UNKNOWN'),
      currency: String(meta.currency || 'UNKNOWN'),
      sourceUrl: `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(providerSymbol)}?range=${encodeURIComponent(range)}&interval=${encodeURIComponent(timeframe)}`,
      retrievedAt: input.retrievedAt,
      closurePolicy: WATCHLIST_CANDLE_CLOSURE_POLICY,
      excludedLatestCandleTimestamp,
      candles,
      normalizedPayloadSha256,
    },
  };
}

export function validateWatchlistSignalMarketData(
  evidence: WatchlistSignalMarketData,
  setup: DivergenceSetup,
  evaluatedAt: number,
  maxAgeMs: number
): string | null {
  if (!evidence || evidence.provider !== WATCHLIST_MARKET_DATA_PROVIDER) return 'UNSUPPORTED_MARKET_DATA_PROVIDER';
  if (evidence.symbol !== setup.symbol.trim().toUpperCase()) return 'MARKET_DATA_SYMBOL_MISMATCH';
  if (evidence.timeframe !== setup.timeframe) return 'MARKET_DATA_TIMEFRAME_MISMATCH';
  if (!evidence.providerSymbol || !evidence.range || !evidence.sourceUrl.startsWith('https://query1.finance.yahoo.com/v8/finance/chart/')) return 'INVALID_MARKET_DATA_SOURCE_REFERENCE';
  if (evidence.closurePolicy !== WATCHLIST_CANDLE_CLOSURE_POLICY) return 'UNSUPPORTED_CANDLE_CLOSURE_POLICY';
  if (!Number.isFinite(evidence.retrievedAt) || evidence.retrievedAt > evaluatedAt) return 'INVALID_MARKET_DATA_RETRIEVAL_TIME';
  if (!Number.isFinite(maxAgeMs) || maxAgeMs <= 0 || evaluatedAt - evidence.retrievedAt > maxAgeMs) {
    return 'STALE_MARKET_DATA_EVIDENCE';
  }
  if (!/^[a-f0-9]{64}$/.test(evidence.normalizedPayloadSha256)) return 'INVALID_MARKET_DATA_DIGEST';
  const digest = createHash('sha256').update(JSON.stringify(evidence.candles)).digest('hex');
  if (digest !== evidence.normalizedPayloadSha256) return 'MARKET_DATA_DIGEST_MISMATCH';
  if (evidence.candles.length < 2 || evidence.candles.some(c =>
    c.timestamp >= evidence.excludedLatestCandleTimestamp ||
    !Number.isFinite(c.volume) || c.volume < 0 ||
    typeof c.dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(c.dateStr) ||
    Number.isNaN(Date.parse(c.dateStr)) || new Date(c.timestamp).toISOString().slice(0, 10) !== c.dateStr
  )) {
    return 'CLOSED_CANDLE_BOUNDARY_INVALID';
  }
  return null;
}
