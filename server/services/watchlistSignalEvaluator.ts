import type { DivergenceSetup } from '../../src/utils/trullasStrategy.ts';
import { validateWatchlistSignalMarketData, type WatchlistSignalMarketData } from './watchlistMarketData.ts';

export const WATCHLIST_SIGNAL_RULE_VERSION = 'trullas-close-cross-v1';

export type WatchlistSignalEvaluation =
  | {
      status: 'TRIGGERED';
      ruleVersion: typeof WATCHLIST_SIGNAL_RULE_VERSION;
      direction: 'BULLISH' | 'BEARISH';
      threshold: number;
      previousClose: number;
      observedClose: number;
      triggerCandleTimestamp: number;
      evaluatedAt: number;
    }
  | {
      status: 'NOT_TRIGGERED' | 'INVALIDATED' | 'INVALID_INPUT';
      ruleVersion: typeof WATCHLIST_SIGNAL_RULE_VERSION;
      reason: string;
    };

type ClosedCandle = Pick<Candle, 'timestamp' | 'open' | 'high' | 'low' | 'close'>;

/**
 * Deterministic, read-only trigger evaluator.
 *
 * Contract: the caller must provide finalized/closed candles from one
 * authoritative feed, in strictly increasing timestamp order. This function
 * rejects future-dated or malformed bars, but cannot independently verify
 * that a provider has finalized a candle.
 *
 * A trigger requires a CLOSE crossing the strategy's existing Fibonacci
 * 23.6% trigger level. A wick touch is not sufficient. If the stop and trigger
 * are both touched in the same candle, ordering is unknowable from OHLC data,
 * so the setup is conservatively invalidated rather than triggered.
 */
export function evaluateWatchlistBreakout(
  setup: DivergenceSetup,
  closedCandles: ClosedCandle[],
  evaluatedAt: number
): WatchlistSignalEvaluation {
  const invalid = (reason: string): WatchlistSignalEvaluation => ({
    status: 'INVALID_INPUT',
    ruleVersion: WATCHLIST_SIGNAL_RULE_VERSION,
    reason,
  });

  if (!setup || typeof setup !== 'object' || !Array.isArray(setup.points) || setup.points.length === 0) {
    return invalid('SETUP_OR_CONFIRMATION_POINT_MISSING');
  }
  if (!Array.isArray(closedCandles) || closedCandles.length < 2) {
    return invalid('AT_LEAST_TWO_CLOSED_CANDLES_REQUIRED');
  }
  if (!Number.isFinite(evaluatedAt) || evaluatedAt <= 0) {
    return invalid('INVALID_EVALUATION_TIMESTAMP');
  }

  const provenanceError = validateWatchlistSignalMarketData(marketData, setup, evaluatedAt, maxMarketDataAgeMs);\n  if (provenanceError) return invalid(provenanceError);\n\n  const closedCandles = marketData.candles;\n  const bullish = setup.type === 'BULLISH_TRIPLE' || setup.type === 'BULLISH_DOUBLE';
  const bearish = setup.type === 'BEARISH_TRIPLE' || setup.type === 'BEARISH_DOUBLE';
  if (!bullish && !bearish) return invalid('UNSUPPORTED_SETUP_DIRECTION');

  const confirmationTimestamp = setup.confirmationTimestamp;
  if (typeof confirmationTimestamp !== 'number' || !Number.isFinite(confirmationTimestamp) || confirmationTimestamp <= 0) {
    return invalid('PIVOT_CONFIRMATION_TIMESTAMP_MISSING');
  }

  const threshold = setup.triggerPrice;
  const stopLoss = setup.stopLoss;
  if (!Number.isFinite(threshold) || threshold <= 0 || !Number.isFinite(stopLoss) || stopLoss <= 0) {
    return invalid('INVALID_TRIGGER_OR_STOP_LEVEL');
  }
  if ((bullish && stopLoss >= threshold) || (bearish && stopLoss <= threshold)) {
    return invalid('TRIGGER_AND_STOP_LEVELS_INCONSISTENT');
  }

  let previousTimestamp = 0;
  let confirmationIndex = -1;
  for (let index = 0; index < closedCandles.length; index++) {
    const candle = closedCandles[index];
    if (
      !candle ||
      !Number.isFinite(candle.timestamp) ||
      candle.timestamp <= previousTimestamp ||
      candle.timestamp > evaluatedAt ||
      ![candle.open, candle.high, candle.low, candle.close].every(value => Number.isFinite(value) && value > 0) ||
      candle.high < Math.max(candle.open, candle.close, candle.low) ||
      candle.low > Math.min(candle.open, candle.close, candle.high)
    ) {
      return invalid('CANDLE_SERIES_INVALID_OR_NOT_CHRONOLOGICAL');
    }
    previousTimestamp = candle.timestamp;
    if (candle.timestamp === confirmationTimestamp) {
      confirmationIndex = index;
    }
  }

  if (confirmationIndex < 0) return invalid('PIVOT_CONFIRMATION_CANDLE_NOT_IN_SERIES');
  if (confirmationIndex >= closedCandles.length - 1) {
    return { status: 'NOT_TRIGGERED', ruleVersion: WATCHLIST_SIGNAL_RULE_VERSION, reason: 'NO_POST_CONFIRMATION_CANDLE' };
  }

  for (let index = confirmationIndex + 1; index < closedCandles.length; index++) {
    const previous = closedCandles[index - 1];
    const current = closedCandles[index];
    const stopTouched = bullish ? current.low <= stopLoss : current.high >= stopLoss;
    const crossed = bullish
      ? previous.close < threshold && current.close >= threshold
      : previous.close > threshold && current.close <= threshold;

    if (stopTouched && crossed) {
      return {
        status: 'INVALIDATED',
        ruleVersion: WATCHLIST_SIGNAL_RULE_VERSION,
        reason: 'STOP_AND_TRIGGER_TOUCHED_IN_SAME_CANDLE_ORDER_UNKNOWABLE',
      };
    }
    if (stopTouched) {
      return {
        status: 'INVALIDATED',
        ruleVersion: WATCHLIST_SIGNAL_RULE_VERSION,
        reason: 'STOP_LOSS_TOUCHED_BEFORE_TRIGGER',
      };
    }
    if (crossed) {
      return {
        status: 'TRIGGERED',
        ruleVersion: WATCHLIST_SIGNAL_RULE_VERSION,
        direction: bullish ? 'BULLISH' : 'BEARISH',
        threshold,
        previousClose: previous.close,
        observedClose: current.close,
        triggerCandleTimestamp: current.timestamp,
        evaluatedAt,
      };
    }
  }

  return {
    status: 'NOT_TRIGGERED',
    ruleVersion: WATCHLIST_SIGNAL_RULE_VERSION,
    reason: 'NO_CLOSED_CANDLE_CLOSE_CROSS',
  };
}
