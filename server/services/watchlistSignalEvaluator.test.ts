import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateWatchlistBreakout as evaluateWithEvidence, WATCHLIST_SIGNAL_RULE_VERSION } from './watchlistSignalEvaluator.ts';
import { buildWatchlistSignalMarketData } from './watchlistMarketData.ts';
import type { Candle, DivergenceSetup } from '../../src/utils/trullasStrategy.ts';

const base = Date.UTC(2026, 10, 1);
const setup = (type: DivergenceSetup['type'] = 'BULLISH_DOUBLE'): DivergenceSetup => ({
  id: 'TEST-SETUP',
  symbol: 'TEST',
  timeframe: '1d',
  type,
  qualityScore: 80,
  points: [{
    index: 0, type: type.startsWith('BULLISH') ? 'trough' : 'peak',
    price: 90, macd: 0, histogram: 0, rsi: 40, volume: 1000,
    timestamp: base, dateStr: '2026-11-01',
  }],
  currentPrice: 100,
  triggerPrice: type.startsWith('BULLISH') ? 105 : 95,
  stopLoss: type.startsWith('BULLISH') ? 95 : 105,
  fibLevels: { fib0: 90, fib236: 105, fib382: 110, fib500: 115, fib618: 120, fib1000: 125 },
  targets: { tp1: 110, tp2: 120, tp3: 125 },
  riskRewardRatio: 2,
  confluenceChecks: { priceDivergence: true, macdDivergence: true, rsiDivergence: true, volumeExhaustion: true, macdCrossConfirmed: true },
  scalingTranches: { tranche1: 'one', tranche2: 'two', tranche3: 'three' },
  detectedAt: base,
  confirmationTimestamp: base,
});
const bar = (day: number, open: number, high: number, low: number, close: number): Candle => ({
  timestamp: base + day * 86_400_000,
  dateStr: new Date(base + day * 86_400_000).toISOString().slice(0, 10),
  open, high, low, close, volume: 1000,
});
function evaluateWatchlistBreakout(setupValue: DivergenceSetup, candles: Candle[], evaluatedAt: number) {
  const last = candles[candles.length - 1];
  const padded = last.timestamp < evaluatedAt
    ? [...candles, {
        timestamp: evaluatedAt,
        dateStr: new Date(evaluatedAt).toISOString().slice(0, 10),
        open: last.close, high: last.close + 1, low: Math.max(0.01, last.close - 1),
        close: last.close, volume: 1000,
      }]
    : candles;
  const built = buildWatchlistSignalMarketData({
    symbol: setupValue.symbol,
    timeframe: setupValue.timeframe,
    range: '3mo',
    candles: padded,
    retrievedAt: evaluatedAt,
    feedMetadata: {
      isLiveFeed: true, source: 'Yahoo Finance v8 Chart API',
      exchange: 'NMS', exchangeTimezone: 'America/New_York', currency: 'USD',
    },
  });
  if (!built.ok) return { status: 'INVALID_INPUT' as const, ruleVersion: WATCHLIST_SIGNAL_RULE_VERSION, reason: built.reason };
  return evaluateWithEvidence(setupValue, built.evidence, evaluatedAt, 60_000);
}


test('bullish trigger requires a closed-candle close crossing above trigger', () => {
  const result = evaluateWatchlistBreakout(setup(), [bar(0, 99, 101, 98, 100), bar(1, 100, 106, 99, 105.5)], base + 2 * 86_400_000);
  assert.equal(result.status, 'TRIGGERED');
  if (result.status === 'TRIGGERED') {
    assert.equal(result.direction, 'BULLISH');
    assert.equal(result.ruleVersion, WATCHLIST_SIGNAL_RULE_VERSION);
    assert.equal(result.previousClose, 100);
    assert.equal(result.observedClose, 105.5);
  }
});

test('wick-only touch does not trigger', () => {
  const result = evaluateWatchlistBreakout(setup(), [bar(0, 99, 101, 98, 100), bar(1, 100, 106, 99, 104)], base + 2 * 86_400_000);
  assert.equal(result.status, 'NOT_TRIGGERED');
});

test('bearish trigger requires a close crossing below trigger', () => {
  const result = evaluateWatchlistBreakout(setup('BEARISH_DOUBLE'), [bar(0, 100, 102, 99, 100), bar(1, 100, 101, 94, 94.5)], base + 2 * 86_400_000);
  assert.equal(result.status, 'TRIGGERED');
  if (result.status === 'TRIGGERED') assert.equal(result.direction, 'BEARISH');
});

test('stop-loss touched before trigger invalidates setup', () => {
  const result = evaluateWatchlistBreakout(setup(), [bar(0, 99, 101, 98, 100), bar(1, 100, 101, 94, 96)], base + 2 * 86_400_000);
  assert.equal(result.status, 'INVALIDATED');
});

test('same candle touching stop and trigger is conservatively invalidated', () => {
  const result = evaluateWatchlistBreakout(setup(), [bar(0, 99, 101, 98, 100), bar(1, 100, 106, 94, 105.5)], base + 2 * 86_400_000);
  assert.equal(result.status, 'INVALIDATED');
  if (result.status === 'INVALIDATED') assert.match(result.reason, /ORDER_UNKNOWABLE/);
});


test('does not trigger on a breakout that occurred before the final pivot was confirmed', () => {
  const delayedSetup = { ...setup(), confirmationTimestamp: base + 2 * 86_400_000 };
  const result = evaluateWatchlistBreakout(
    delayedSetup,
    [
      bar(0, 99, 101, 98, 100),
      bar(1, 100, 106, 99, 105.5), // crossed before confirmation
      bar(2, 105, 106, 104, 105), // pivot becomes knowable only here
      bar(3, 105, 105.5, 103, 104), // no fresh cross
    ],
    base + 4 * 86_400_000
  );
  assert.equal(result.status, 'NOT_TRIGGERED');
});

test('rejects setups without an explicit pivot confirmation timestamp', () => {
  const { confirmationTimestamp: _ignored, ...unconfirmed } = setup();
  const result = evaluateWatchlistBreakout(unconfirmed as DivergenceSetup, [
    bar(0, 99, 101, 98, 100),
    bar(1, 100, 106, 99, 105.5),
  ], base + 2 * 86_400_000);
  assert.equal(result.status, 'INVALID_INPUT');
  if (result.status === 'INVALID_INPUT') assert.equal(result.reason, 'PIVOT_CONFIRMATION_TIMESTAMP_MISSING');
});

test('rejects unordered, malformed, future-dated and unanchored candle series', () => {
  assert.equal(evaluateWatchlistBreakout(setup(), [bar(0, 99, 101, 98, 100), bar(1, 100, 106, 99, 105)], base + 500).status, 'INVALID_INPUT');
  assert.equal(evaluateWatchlistBreakout(setup(), [bar(0, 99, 101, 98, 100), bar(0, 100, 106, 99, 105)], base + 2 * 86_400_000).status, 'INVALID_INPUT');
  assert.equal(evaluateWatchlistBreakout(setup(), [bar(1, 100, 106, 99, 105), bar(2, 105, 107, 104, 106)], base + 3 * 86_400_000).status, 'INVALID_INPUT');
});
