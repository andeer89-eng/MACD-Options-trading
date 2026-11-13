import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePearsonCorrelation,
  calculateRollingPriceMacdCorrelation,
  computeEmpiricalHistoricalAccuracy,
  evaluateSignalWeighting,
} from './signalWeightingEngine';
import { Candle, DivergenceSetup } from './trullasStrategy';

function buildDeterministicCandles(count: number): Candle[] {
  const candles: Candle[] = [];
  const baseTs = 1735689600000;
  for (let i = 0; i < count; i++) {
    const price = 120 + Math.sin(i / 4) * 12 + i * 0.15;
    candles.push({
      timestamp: baseTs + i * 86400000,
      dateStr: new Date(baseTs + i * 86400000).toISOString().split('T')[0],
      open: price - 0.8,
      high: price + 2.2,
      low: price - 2.1,
      close: price,
      volume: 1_200_000 + (i % 7) * 150_000,
    });
  }
  return candles;
}

describe('Signal Weighting Engine Unit Tests', () => {
  test('calculatePearsonCorrelation computes accurate correlation coefficient', () => {
    const x = [1, 2, 3, 4, 5];
    const y = [2, 4, 6, 8, 10];
    assert.strictEqual(Math.round(calculatePearsonCorrelation(x, y) * 100) / 100, 1.0);

    const inverseY = [10, 8, 6, 4, 2];
    assert.strictEqual(Math.round(calculatePearsonCorrelation(x, inverseY) * 100) / 100, -1.0);
  });

  test('calculateRollingPriceMacdCorrelation returns bounded Pearson r or 0 if insufficient bars', () => {
    assert.strictEqual(calculateRollingPriceMacdCorrelation([], 30), 0);
    const candles = buildDeterministicCandles(45);
    const r = calculateRollingPriceMacdCorrelation(candles, 30);
    assert.ok(r >= -1 && r <= 1);
  });

  test('computeEmpiricalHistoricalAccuracy derives real win rate without lookup fabrication', () => {
    const empty = computeEmpiricalHistoricalAccuracy([], 'NVDA', '1d');
    assert.strictEqual(empty.hasHistory, false);
    assert.strictEqual(empty.winRate, 0);
    assert.strictEqual(empty.totalSignals, 0);

    const withJournal = computeEmpiricalHistoricalAccuracy([], 'AAPL', '1d', { wins: 7, total: 10 });
    assert.strictEqual(withJournal.hasHistory, true);
    assert.strictEqual(withJournal.winRate, 70);
    assert.strictEqual(withJournal.totalSignals, 10);
  });

  test('evaluateSignalWeighting assigns confidence score and signal grade', () => {
    const candles = buildDeterministicCandles(65);
    const setup: DivergenceSetup = {
      id: 'test-1',
      symbol: 'NVDA',
      timeframe: '1d',
      type: 'BULLISH_TRIPLE',
      qualityScore: 85,
      points: [],
      currentPrice: 128.5,
      triggerPrice: 130.0,
      stopLoss: 124.0,
      fibLevels: { fib0: 120, fib236: 122, fib382: 125, fib500: 127, fib618: 130, fib1000: 135 },
      targets: { tp1: 132, tp2: 138, tp3: 145 },
      riskRewardRatio: 3.2,
      confluenceChecks: {
        priceDivergence: true,
        macdDivergence: true,
        rsiDivergence: true,
        volumeExhaustion: true,
        macdCrossConfirmed: true,
      },
      scalingTranches: { tranche1: '33%', tranche2: '33%', tranche3: '34%' },
      detectedAt: 1735689600000,
    };

    const weighted = evaluateSignalWeighting(setup, candles, { wins: 4, total: 5 });
    assert.strictEqual(weighted.symbol, 'NVDA');
    assert.ok(weighted.confidenceScore >= 50 && weighted.confidenceScore <= 100);
    assert.ok(['A+', 'A', 'B', 'C', 'D'].includes(weighted.signalGrade));
    assert.strictEqual(weighted.hasHistoricalSample, true);
    assert.ok(weighted.totalHistoricalSignals >= 5);
    assert.ok(weighted.historicalAccuracyPct >= 0 && weighted.historicalAccuracyPct <= 100);
  });
});
