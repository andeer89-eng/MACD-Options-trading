import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WATCHLIST_CLOSED_CANDLE_MAX_AGE_MS,
  validateWatchlistCandleFreshness,
} from './watchlistCandleFreshness.ts';

const now = Date.UTC(2026, 10, 27, 18, 0, 0);

test('closed-candle freshness policy defines every supported timeframe', () => {
  assert.deepEqual(Object.keys(WATCHLIST_CLOSED_CANDLE_MAX_AGE_MS), [
    '5m', '15m', '30m', '1h', '1d', '1wk',
  ]);
});

test('closed candle at the timeframe age boundary is accepted', () => {
  for (const [timeframe, maxAgeMs] of Object.entries(WATCHLIST_CLOSED_CANDLE_MAX_AGE_MS)) {
    assert.equal(validateWatchlistCandleFreshness({
      timeframe,
      lastClosedCandleTimestamp: now - maxAgeMs,
      evaluatedAt: now,
    }), null, timeframe);
  }
});

test('closed candle older than the timeframe age boundary is rejected', () => {
  for (const [timeframe, maxAgeMs] of Object.entries(WATCHLIST_CLOSED_CANDLE_MAX_AGE_MS)) {
    assert.equal(validateWatchlistCandleFreshness({
      timeframe,
      lastClosedCandleTimestamp: now - maxAgeMs - 1,
      evaluatedAt: now,
    }), 'STALE_CLOSED_CANDLE', timeframe);
  }
});

test('future, invalid and unsupported candle timestamps fail closed', () => {
  assert.equal(validateWatchlistCandleFreshness({
    timeframe: '1d', lastClosedCandleTimestamp: now + 1, evaluatedAt: now,
  }), 'CLOSED_CANDLE_TIMESTAMP_IN_FUTURE');
  assert.equal(validateWatchlistCandleFreshness({
    timeframe: '1d', lastClosedCandleTimestamp: Number.NaN, evaluatedAt: now,
  }), 'INVALID_CLOSED_CANDLE_TIMESTAMP');
  assert.equal(validateWatchlistCandleFreshness({
    timeframe: '2h', lastClosedCandleTimestamp: now - 1, evaluatedAt: now,
  }), 'UNSUPPORTED_CANDLE_FRESHNESS_TIMEFRAME');
});
