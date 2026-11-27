import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateEMA,
  calculateRSI,
  calculateIndicators,
  findSwingPoints,
  computeFibonacci,
  detectDivergences,
  isDivergenceActiveNow,
  filterActiveDivergences,
  calculateATR,
  getLatestVolatilityMetrics,
  Candle,
  DivergenceSetup,
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

test('detectDivergences returns setups sorted newest-first and computes dynamic double qualityScore/R:R', () => {
  const candles: Candle[] = [];
  const baseTime = 1700000000000;
  for (let i = 0; i < 120; i++) {
    let price = 100;
    if (i < 25) price = 105 - Math.sin((i / 25) * Math.PI) * 10;
    else if (i < 55) price = 102 - Math.sin(((i - 25) / 30) * Math.PI) * 14;
    else if (i < 85) price = 104 - Math.sin(((i - 55) / 30) * Math.PI) * 12;
    else price = 98 - Math.sin(((i - 85) / 35) * Math.PI) * 16;

    candles.push({
      timestamp: baseTime + i * 86400000,
      dateStr: new Date(baseTime + i * 86400000).toISOString().split('T')[0],
      open: price + 0.3,
      high: price + 1.4,
      low: price - 1.4,
      close: price,
      volume: 1_500_000 - i * 8000,
    });
  }
  const indicatorPoints = calculateIndicators(candles);
  const setups = detectDivergences('TEST', '1d', indicatorPoints, 2);

  for (let i = 1; i < setups.length; i++) {
    const prevIdx = setups[i - 1].points[setups[i - 1].points.length - 1].index;
    const currIdx = setups[i].points[setups[i].points.length - 1].index;
    assert.ok(prevIdx >= currIdx, `Expected newest-first ordering (${prevIdx} >= ${currIdx})`);
  }

  for (const s of setups) {
    assert.ok(s.qualityScore >= 50 && s.qualityScore <= 99);
    assert.ok(s.riskRewardRatio > 0 && Number.isFinite(s.riskRewardRatio));
  }
});

test('filterActiveDivergences excludes stopped-out bearish, TP2-completed bullish, and stale setups while keeping live setups', () => {
  const baseTime = Date.UTC(2026, 9, 1);
  const bars: Candle[] = Array.from({ length: 40 }, (_, i) => {
    const close = i < 10 ? 112 + i : i < 30 ? 122 + (i - 10) * 1.4 : 150 + (i - 30) * 0.5;
    return {
      timestamp: baseTime + i * 86_400_000,
      dateStr: new Date(baseTime + i * 86_400_000).toISOString().slice(0, 10),
      open: close - 0.5,
      high: close + 1.2,
      low: close - 1.2,
      close,
      volume: 2_000_000,
    };
  });
  const lastBar = bars[bars.length - 1]; // close = 154.5

  const makeMockSetup = (partial: Partial<DivergenceSetup> & { confirmIdx: number }): DivergenceSetup => ({
    id: partial.id || 'MOCK',
    symbol: 'DLTR',
    timeframe: '1d',
    type: partial.type || 'BULLISH_DOUBLE',
    qualityScore: partial.qualityScore ?? 78,
    points: [
      {
        index: partial.confirmIdx,
        timestamp: bars[partial.confirmIdx].timestamp,
        dateStr: bars[partial.confirmIdx].dateStr,
        type: (partial.type || 'BULLISH_DOUBLE').startsWith('BEARISH') ? 'peak' : 'trough',
        price: partial.stopLoss ?? 100,
        macd: 0,
        histogram: 0,
        rsi: 50,
        volume: 1_000_000,
      },
    ],
    currentPrice: lastBar.close,
    triggerPrice: partial.triggerPrice ?? 150,
    stopLoss: partial.stopLoss ?? 142,
    fibLevels: { fib0: 142, fib236: 150, fib382: 155, fib500: 158, fib618: 162, fib1000: 170 },
    targets: partial.targets ?? { tp1: 158, tp2: 164, tp3: 172 },
    riskRewardRatio: 1.75,
    confluenceChecks: {
      priceDivergence: true,
      macdDivergence: true,
      rsiDivergence: true,
      volumeExhaustion: true,
      macdCrossConfirmed: true,
    },
    scalingTranches: { tranche1: 't1', tranche2: 't2', tranche3: 't3' },
    detectedAt: bars[partial.confirmIdx].timestamp,
  });

  // 1. Stopped-out bearish setup (stopLoss 149.58 < current close 154.5)
  const stoppedBearish = makeMockSetup({
    id: 'DLTR-BEAR-STOPPED',
    type: 'BEARISH_DOUBLE',
    confirmIdx: 25,
    triggerPrice: 142.4,
    stopLoss: 149.58,
    targets: { tp1: 137.0, tp2: 132.46, tp3: 124.0 },
  });

  // 2. Old completed Oct bullish setup (TP2 = 114.99 already blown past at 154.5, >18% from trigger)
  const completedBullish = makeMockSetup({
    id: 'DLTR-BULL-COMPLETED',
    type: 'BULLISH_DOUBLE',
    confirmIdx: 1,
    triggerPrice: 112.6,
    stopLoss: 110.34,
    targets: { tp1: 113.51, tp2: 114.99, tp3: 117.39 },
  });

  // 3. Truly active recent bullish setup (confirmed 4 bars ago, SL unbroken, TP2 above current spot)
  const liveBullish = makeMockSetup({
    id: 'DLTR-BULL-ACTIVE',
    type: 'BULLISH_TRIPLE',
    confirmIdx: 35,
    triggerPrice: 151.0,
    stopLoss: 144.0,
    targets: { tp1: 158.0, tp2: 165.0, tp3: 174.0 },
  });

  assert.equal(isDivergenceActiveNow(stoppedBearish, bars), false);
  assert.equal(isDivergenceActiveNow(completedBullish, bars), false);
  assert.equal(isDivergenceActiveNow(liveBullish, bars), true);

  const filtered = filterActiveDivergences([stoppedBearish, completedBullish, liveBullish], bars);
  assert.deepEqual(
    filtered.map((s) => s.id),
    ['DLTR-BULL-ACTIVE']
  );
});

