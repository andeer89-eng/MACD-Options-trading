import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { optimizeStrategyParameters } from './strategyOptimizer';
import { Candle } from './trullasStrategy';
import { BacktestConfig } from './backtestEngine';

describe('Strategy Optimizer Unit Tests', () => {
  test('optimizeStrategyParameters evaluates grid and returns top candidates and recommendations', () => {
    const dummyCandles: Candle[] = [];
    const now = Date.now();
    for (let i = 120; i >= 0; i--) {
      const price = 150 + Math.sin(i / 6) * 15;
      dummyCandles.push({
        timestamp: now - i * 86400000,
        dateStr: new Date(now - i * 86400000).toISOString().split('T')[0],
        open: price - 1,
        high: price + 2,
        low: price - 2,
        close: price,
        volume: 2000000,
      });
    }

    const config: BacktestConfig = {
      symbol: 'NVDA',
      timeframe: '1d',
      range: '6mo',
      initialBalance: 100000,
      riskPerTradePct: 1.0,
      targetMode: 'tranches',
      minQualityScore: 60,
    };

    const report = optimizeStrategyParameters(dummyCandles, config);

    assert.strictEqual(report.symbol, 'NVDA');
    assert.ok(report.topCandidates.length === 5, 'Returns top 5 candidate parameters');
    assert.ok(report.optimalCandidate.sharpeRatio >= report.baselineMetrics.sharpeRatio, 'Optimal candidate improves or equals baseline Sharpe');
    assert.ok(report.recommendedThresholds.minQualityScore >= 50, 'Provides recommended min quality score');
    assert.ok(report.parameterSensitivitySurface.length > 0, 'Generates sensitivity surface data');
  });
});
