/**
 * Conservative age limits for the newest closed candle, measured at evaluation time.
 *
 * These are fail-closed operational limits, not exchange calendars. In particular,
 * holidays and sessions with no recent provider bar can cause a rejection; callers
 * must not widen the limits automatically to compensate.
 */
export const WATCHLIST_CLOSED_CANDLE_MAX_AGE_MS: Readonly<Record<string, number>> = Object.freeze({
  '5m': 20 * 60_000,
  '15m': 45 * 60_000,
  '30m': 90 * 60_000,
  '1h': 3 * 60 * 60_000,
  '1d': 5 * 24 * 60 * 60_000,
  '1wk': 10 * 24 * 60 * 60_000,
});

export type WatchlistCandleFreshnessInput = {
  timeframe: string;
  lastClosedCandleTimestamp: number;
  evaluatedAt: number;
};

/**
 * Returns a stable failure reason when the closed candle is too old or invalid.
 * All timestamps are Unix milliseconds, matching the server market-data contract.
 */
export function validateWatchlistCandleFreshness(
  input: WatchlistCandleFreshnessInput
): string | null {
  const maxAgeMs = WATCHLIST_CLOSED_CANDLE_MAX_AGE_MS[input.timeframe];
  if (!maxAgeMs) return 'UNSUPPORTED_CANDLE_FRESHNESS_TIMEFRAME';
  if (
    !Number.isFinite(input.lastClosedCandleTimestamp) ||
    input.lastClosedCandleTimestamp <= 0 ||
    !Number.isFinite(input.evaluatedAt) ||
    input.evaluatedAt <= 0
  ) return 'INVALID_CLOSED_CANDLE_TIMESTAMP';
  if (input.lastClosedCandleTimestamp > input.evaluatedAt) {
    return 'CLOSED_CANDLE_TIMESTAMP_IN_FUTURE';
  }
  if (input.evaluatedAt - input.lastClosedCandleTimestamp > maxAgeMs) {
    return 'STALE_CLOSED_CANDLE';
  }
  return null;
}
