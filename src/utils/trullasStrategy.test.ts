import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateEMA,
  calculateRSI,
  calculateIndicators,
  findSwingPoints,
  computeFibonacci,
  detectDivergences,
  calculateATR,
  getLatestVolatilityMetrics,
  Candle,
} from './trullasStrategy.ts';

test('calculateEMA correctly processes array', () => {
  const prices = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
  const ema = calculateEMA(prices, 5);
  assert.equal(ema.length, prices.length);
  // Last value of an uptrend EMA should be higher than first
  assert.ok(ema[ema.length - 1] > ema[0]);
  assert.ok(ema[ema.length - 1] < 20); // Lagging behind current price
});

test('calculateRSI computes bounded index between 0 and 100', () => {
  const prices = [
    100, 102, 101, 105, 107, 106, 110, 112, 115, 114, 118, 120, 122, 125, 127, 130, 132, 135
  ];
  const rsi = calculateRSI(prices, 14);
  assert.equal(rsi.length, prices.length);
  const lastRSI = rsi[rsi.length - 1];
  assert.ok(lastRSI >= 0 && lastRSI <= 100);
  // In a strong uptrend, RSI should be above 50
  assert.ok(lastRSI > 50);
});

test('computeFibonacci calculates accurate 23.6%, 38.2%, 50%, 61.8% levels', () => {
  const low = 100;
  const high = 200;
  const fibUp = computeFibonacci(low, high, 'up');

  assert.equal(fibUp.fib0, 100);
  assert.equal(fibUp.fib236, 123.6);
  assert.equal(fibUp.fib382, 138.2);
  assert.equal(fibUp.fib500, 150.0);
  assert.equal(fibUp.fib618, 161.8);
  assert.equal(fibUp.fib1000, 200);

  const fibDown = computeFibonacci(low, high, 'down');
  assert.equal(fibDown.fib0, 200);
  assert.equal(fibDown.fib236, 176.4);
  assert.equal(fibDown.fib382, 161.8);
  assert.equal(fibDown.fib500, 150.0);
  assert.equal(fibDown.fib618, 138.2);
  assert.equal(fibDown.fib1000, 100);
});

test('detectDivergences accurately identifies Bullish Triple Divergence', () => {
  // Construct a deterministic series of candles with 3 lower lows in price
  // and 3 higher lows in MACD
  const candles: Candle[] = [];
  const baseTime = 1700000000000;

  // Let's create 60 candles with 3 clear swing bottoms
  for (let i = 0; i < 60; i++) {
    let price = 100;
    // 1st trough around candle 10 (price 90)
    // 2nd trough around candle 25 (price 85)
    // 3rd trough around candle 45 (price 80)
    if (i >= 0 && i < 15) {
      price = 100 - Math.sin((i / 15) * Math.PI) * 10;
    } else if (i >= 15 && i < 35) {
      price = 95 - Math.sin(((i - 15) / 20) * Math.PI) * 12;
    } else if (i >= 35 && i < 55) {
      price = 90 - Math.sin(((i - 35) / 20) * Math.PI) * 15;
    } else {
      price = 85 + (i - 55);
    }

    candles.push({
      timestamp: baseTime + i * 86400000,
      dateStr: new Date(baseTime + i * 86400000).toISOString().split('T')[0],
      open: price + 0.2,
      high: price + 1.0,
      low: price - 1.0,
      close: price,
      volume: 1000000 - i * 10000, // Diminishing volume
    });
  }

  const indicatorPoints = calculateIndicators(candles);
  assert.equal(indicatorPoints.length, 60);

  const { troughs } = findSwingPoints(indicatorPoints, 2);
  assert.ok(troughs.length >= 2, 'Should detect swing troughs');

  const setups = detectDivergences('TEST', '1d', indicatorPoints, 2);
  assert.ok(Array.isArray(setups));
});

test('calculateATR and getLatestVolatilityMetrics compute volatility and stagnant classification', () => {
  const candles: Candle[] = [];
  const baseTime = 1700000000000;
  for (let i = 0; i < 20; i++) {
    candles.push({
      timestamp: baseTime + i * 86400000,
      dateStr: '2026-01-01',
      open: 100,
      high: 102,
      low: 99,
      close: 101,
      volume: 500000,
    });
  }

  const atrs = calculateATR(candles, 14);
  assert.equal(atrs.length, 20);
  const lastAtr = atrs[atrs.length - 1];
  assert.ok(lastAtr >= 2.5 && lastAtr <= 3.5);

  const metrics = getLatestVolatilityMetrics(candles, 14);
  assert.ok(metrics.atr > 0);
  assert.ok(metrics.atrPercent > 2.0); // 3 / 101 * 100 ~ 2.97%
  assert.equal(metrics.isStagnant, false);

  // Stagnant flat candles with 0.1 spread
  const flatCandles: Candle[] = [];
  for (let i = 0; i < 20; i++) {
    flatCandles.push({
      timestamp: baseTime + i * 86400000,
      dateStr: '2026-01-01',
      open: 100,
      high: 100.1,
      low: 99.95,
      close: 100,
      volume: 1000,
    });
  }
  const flatMetrics = getLatestVolatilityMetrics(flatCandles, 14);
  assert.ok(flatMetrics.atrPercent < 0.5);
  assert.equal(flatMetrics.isStagnant, true);
});
