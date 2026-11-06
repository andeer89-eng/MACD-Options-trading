import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePearsonCorrelation,
  calculateRollingPriceMacdCorrelation,
  getTickerHistoricalAccuracy,
  evaluateSignalWeighting,
} from './signalWeightingEngine';
import { Candle, DivergenceSetup } from './trullasStrategy';

describe('Signal Weighting Engine Unit Tests', () => {
  test('calculatePearsonCorrelation computes accurate correlation coefficient', () => {
    const x = [1, 2, 3, 4, 5];
    const y = [2, 4, 6, 8, 10];
    const perfectCorr = calculatePearsonCorrelation(x, y);
    assert.strictEqual(Math.round(perfectCorr * 100) / 100, 1.0);

    const inverseY = [10, 8, 6, 4, 2];
    const inverseCorr = calculatePearsonCorrelation(x, inverseY);
    assert.strictEqual(Math.round(inverseCorr * 100) / 100, -1.0);
  });

  test('getTickerHistoricalAccuracy returns valid win rate metrics for tickers', () => {
    const nvdaAcc = getTickerHistoricalAccuracy('NVDA');
    assert.ok(nvdaAcc.winRate > 70, 'NVDA win rate is high');
    assert.ok(nvdaAcc.totalSignals > 10, 'Has total signals sample size');

    const genericAcc = getTickerHistoricalAccuracy('XYZ_UNKNOWN');
    assert.ok(genericAcc.winRate >= 50 && genericAcc.winRate <= 95);
    assert.ok(genericAcc.totalSignals > 0);
  });

  test('evaluateSignalWeighting assigns confidence score and signal grade', () => {
    const dummyCandles: Candle[] = [];
    const now = Date.now();
    for (let i = 50; i >= 0; i--) {
      const price = 100 + Math.sin(i / 5) * 10;
      dummyCandles.push({
        timestamp: now - i * 86400000,
        dateStr: new Date(now - i * 86400000).toISOString().split('T')[0],
        open: price - 1,
        high: price + 2,
        low: price - 2,
        close: price,
        volume: 1000000,
      });
    }

    const dummySetup: DivergenceSetup = {
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
      detectedAt: Date.now(),
    };

    const weighted = evaluateSignalWeighting(dummySetup, dummyCandles);
    assert.strictEqual(weighted.symbol, 'NVDA');
    assert.ok(weighted.confidenceScore >= 50 && weighted.confidenceScore <= 100);
    assert.ok(['A+', 'A', 'B', 'C', 'D'].includes(weighted.signalGrade));
    assert.ok(weighted.historicalAccuracyPct > 0);
  });
});
