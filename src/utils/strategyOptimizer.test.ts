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

    // Regression: rationale must reflect the actual optimal Sharpe rather than a hardcoded 2.15 string
    const expectedSharpeStr = report.optimalCandidate.sharpeRatio.toFixed(2);
    assert.ok(
      report.recommendedThresholds.rationale.includes(expectedSharpeStr),
      `Expected rationale "${report.recommendedThresholds.rationale}" to contain actual Sharpe "${expectedSharpeStr}"`
    );

    // Regression: grid points with fewer or no trades are not artificially forced up to baselineSharpe
    const minSurfaceSharpe = Math.min(...report.parameterSensitivitySurface.map((p) => p.sharpeRatio));
    assert.ok(Number.isFinite(minSurfaceSharpe), 'Sensitivity surface values must be finite');

    // Regression: Sharpe must be computed from actual closed-trade return distribution, never inflated > 10 by extreme profitFactor / $2 fee losses
    assert.ok(
      report.optimalCandidate.sharpeRatio <= 10 && report.optimalCandidate.sharpeRatio >= -10,
      `Expected realistic Sharpe in [-10, 10], got ${report.optimalCandidate.sharpeRatio}`
    );
  });

  test('optimizeStrategyParameters never inflates Sharpe on near-zero-loss trending series', () => {
    const trendCandles: Candle[] = [];
    const baseTs = Date.UTC(2025, 0, 1);
    for (let i = 0; i < 250; i++) {
      // Gentle uptrend with 3 clean pullbacks that trigger wins and minimal losses
      const wave = Math.sin(i / 8) * 6;
      const close = 100 + i * 0.25 + wave;
      trendCandles.push({
        timestamp: baseTs + i * 86400000,
        dateStr: new Date(baseTs + i * 86400000).toISOString().split('T')[0],
        open: close - 0.6,
        high: close + 1.5,
        low: close - 1.5,
        close,
        volume: 3000000,
      });
    }

    const report = optimizeStrategyParameters(trendCandles, {
      symbol: 'AAPL',
      timeframe: '1d',
      range: '1y',
      initialBalance: 10000,
      riskPerTradePct: 1.5,
      targetMode: 'tranches',
      minQualityScore: 60,
    });

    for (const cand of report.topCandidates) {
      assert.ok(
        Number.isFinite(cand.sharpeRatio) && cand.sharpeRatio <= 8 && cand.sharpeRatio >= -5,
        `Candidate Sharpe ${cand.sharpeRatio} out of realistic statistical bounds [-5, 8]`
      );
    }
  });

  test('computePortfolioSharpe calculates statistical return-based Sharpe instead of profitFactor * winRate', async () => {
    const mod = await import('./strategyOptimizer');
    assert.equal(typeof (mod as any).computePortfolioSharpe, 'function', 'computePortfolioSharpe should be exported');
    const computePortfolioSharpe = (mod as any).computePortfolioSharpe;

    const trades = [
      { status: 'win', netPnl: 112.48 },
      { status: 'breakeven', netPnl: 0 },
      { status: 'win', netPnl: 199.9 },
      { status: 'win', netPnl: 153.3 },
      { status: 'win', netPnl: 106.04 },
      { status: 'open', netPnl: -9999 },
    ];
    const sharpe = computePortfolioSharpe(trades, 10000, 365);
    assert.ok(
      Number.isFinite(sharpe) && sharpe > 0.5 && sharpe <= 6.0,
      `Expected realistic return-based Sharpe in (0.5, 6.0], got ${sharpe}`
    );

    const zeroTradesSharpe = computePortfolioSharpe([], 10000, 365);
    assert.equal(zeroTradesSharpe, 0);
  });
});
