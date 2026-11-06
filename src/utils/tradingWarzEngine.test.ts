import { test } from 'node:test';
import assert from 'node:assert';
import {
  isInsideBar,
  isOutsideBar,
  calculateFibonacciGoldenLevels,
  analyzeTradingWarzSetup,
  CandleOHLC,
} from './tradingWarzEngine.ts';

test('isInsideBar correctly identifies candle inside previous candle', () => {
  const motherBar: CandleOHLC = { open: 100, high: 105, low: 95, close: 102 };
  const insideCandle: CandleOHLC = { open: 98, high: 103, low: 97, close: 101 };
  const outsideCandle: CandleOHLC = { open: 94, high: 107, low: 93, close: 106 };

  assert.strictEqual(isInsideBar(insideCandle, motherBar), true);
  assert.strictEqual(isInsideBar(outsideCandle, motherBar), false);
});

test('isOutsideBar correctly identifies engulfing outside candle', () => {
  const prevBar: CandleOHLC = { open: 100, high: 103, low: 97, close: 101 };
  const outsideBar: CandleOHLC = { open: 96, high: 106, low: 94, close: 105 };

  assert.strictEqual(isOutsideBar(outsideBar, prevBar), true);
  assert.strictEqual(isOutsideBar(prevBar, outsideBar), false);
});

test('calculateFibonacciGoldenLevels computes accurate 50% and 61.8% Golden Zones', () => {
  const candles: CandleOHLC[] = [
    { open: 5000, high: 5050, low: 4950, close: 5000 },
    { open: 5000, high: 5500, low: 4900, close: 5450 },
    { open: 5450, high: 6000, low: 5400, close: 5900 }, // Swing high 6000, Swing low 4900, Range 1100
  ];

  const fibs = calculateFibonacciGoldenLevels(candles);
  assert.strictEqual(fibs.swingHigh, 6000);
  assert.strictEqual(fibs.swingLow, 4900);
  assert.strictEqual(fibs.range, 1100);

  // 50% = 6000 - 550 = 5450
  assert.strictEqual(fibs.fib500, 5450);
  // 61.8% = 6000 - 1100 * 0.618 = 6000 - 679.8 = 5320.2
  assert.strictEqual(fibs.fib618, 5320.2);
});

test('analyzeTradingWarzSetup detects The Holy Grail pattern (OBIB)', () => {
  const candles: CandleOHLC[] = [
    { open: 100, high: 102, low: 98, close: 101 },
    { open: 97, high: 106, low: 94, close: 104 }, // Outside Bar (shakes out both sides)
    { open: 99, high: 103, low: 96, close: 100 }, // Inside Bar (tight compression)
  ];

  const analysis = analyzeTradingWarzSetup(candles, 100);
  assert.strictEqual(analysis.pattern, 'HOLY_GRAIL_OBIB');
  assert.strictEqual(analysis.patternColor, 'yellow');
  assert.strictEqual(analysis.isHolyGrail, true);
  assert.ok(analysis.recommendedPutStrike < 100);
  assert.ok(analysis.probabilityOfProfitPercent >= 80);
});

test('analyzeTradingWarzSetup detects The Nirvana pattern (IBOB)', () => {
  const candles: CandleOHLC[] = [
    { open: 100, high: 105, low: 95, close: 102 },
    { open: 98, high: 103, low: 97, close: 101 }, // Inside Bar
    { open: 96, high: 108, low: 94, close: 107 }, // Outside Bar breaking out
  ];

  const analysis = analyzeTradingWarzSetup(candles, 107);
  assert.strictEqual(analysis.pattern, 'NIRVANA_IBOB');
  assert.strictEqual(analysis.patternColor, 'blue');
  assert.strictEqual(analysis.isNirvana, true);
});
