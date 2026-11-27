import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateWatchlistBreakout, WATCHLIST_SIGNAL_RULE_VERSION } from './watchlistSignalEvaluator.ts';
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
});
const bar = (day: number, open: number, high: number, low: number, close: number): Candle => ({
  timestamp: base + day * 86_400_000,
  dateStr: new Date(base + day * 86_400_000).toISOString().slice(0, 10),
  open, high, low, close, volume: 1000,
});

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

test('rejects unordered, malformed, future-dated and unanchored candle series', () => {
  assert.equal(evaluateWatchlistBreakout(setup(), [bar(0, 99, 101, 98, 100), bar(1, 100, 106, 99, 105)], base + 500).status, 'INVALID_INPUT');
  assert.equal(evaluateWatchlistBreakout(setup(), [bar(0, 99, 101, 98, 100), bar(0, 100, 106, 99, 105)], base + 2 * 86_400_000).status, 'INVALID_INPUT');
  assert.equal(evaluateWatchlistBreakout(setup(), [bar(1, 100, 106, 99, 105), bar(2, 105, 107, 104, 106)], base + 3 * 86_400_000).status, 'INVALID_INPUT');
});
