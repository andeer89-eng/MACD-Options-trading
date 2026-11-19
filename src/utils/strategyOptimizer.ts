/**
 * Strategy Optimizer Engine
 * Grid-searches MACD divergence signal thresholds and RSI extreme levels
 * across historical candlestick data to maximize the Sharpe ratio of the portfolio.
 */

import { Candle } from './trullasStrategy';
import { runBacktest, BacktestConfig } from './backtestEngine';

export interface ParameterCombination {
  minQualityScore: number; // e.g. 50, 60, 70, 75, 80, 85
  rsiOversoldThreshold: number; // e.g. 25, 30, 35
  rsiOverboughtThreshold: number; // e.g. 65, 70, 75
  targetMode: 'tranches' | 'tp1' | 'tp2';
}

export interface OptimizationCandidate {
  params: ParameterCombination;
  tradeCount: number;
  winRatePct: number;
  totalNetPnl: number;
  sharpeRatio: number;
  maxDrawdownPct: number;
  profitFactor: number;
  luxAlgoEdgeScore: number;
}

export interface StrategyOptimizationReport {
  symbol: string;
  timeframe: string;
  range: string;
  baselineMetrics: {
    minQualityScore: number;
    sharpeRatio: number;
    winRatePct: number;
    totalNetPnl: number;
    maxDrawdownPct: number;
    tradeCount: number;
  };
  optimalCandidate: OptimizationCandidate;
  sharpeImprovementPct: number;
  topCandidates: OptimizationCandidate[];
  parameterSensitivitySurface: Array<{
    minQualityScore: number;
    rsiThresholdLabel: string;
    sharpeRatio: number;
  }>;
  recommendedThresholds: {
    minQualityScore: number;
    rsiOversold: number;
    rsiOverbought: number;
    targetMode: 'tranches' | 'tp1' | 'tp2';
    rationale: string;
  };
}

export function computePortfolioSharpe(
  trades: Array<{ status?: string; netPnl: number }>,
  initialBalance: number,
  spanDays: number = 365
): number {
  const closed = trades.filter((t) => t.status !== 'open');
  const n = closed.length;
  if (n === 0 || initialBalance <= 0) return 0;

  const returns = closed.map((t) => (Number(t.netPnl) || 0) / initialBalance);
  const mean = returns.reduce((sum, r) => sum + r, 0) / n;

  if (n === 1) {
    const conservative = (mean / 0.025) * Math.sqrt(1 / 4);
    return Number(Math.max(-3, Math.min(2.5, conservative)).toFixed(2));
  }

  const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (n - 1);
  const std = Math.sqrt(variance);
  const effectiveStd = Math.max(std, 0.005);

  const years = Math.max(30, spanDays) / 365.25;
  const tradesPerYear = n / years;
  const annualization = Math.sqrt(Math.min(52, Math.max(1, tradesPerYear)));
  const sampleConfidence = Math.sqrt(n / (n + 3));

  const rawSharpe = (mean / effectiveStd) * annualization * sampleConfidence;
  return Number(Math.max(-5, Math.min(8, rawSharpe)).toFixed(2));
}

/**
 * Runs grid search optimization across Quality Scores, RSI Extremes, and Target Modes
 * to find the parameter set that maximizes the Sharpe Ratio.
 */
export function optimizeStrategyParameters(
  candles: Candle[],
  baseConfig: BacktestConfig
): StrategyOptimizationReport {
  const spanDays =
    candles.length >= 2
      ? Math.max(30, (candles[candles.length - 1].timestamp - candles[0].timestamp) / 86400000)
      : 365;

  // 1. Run baseline simulation
  const baselineResult = runBacktest(candles, baseConfig);
  const baselineMetrics = baselineResult.metrics;
  const baselineSharpe = computePortfolioSharpe(
    baselineResult.trades,
    baseConfig.initialBalance,
    spanDays
  );
  const baselineMaxDd = baselineMetrics.maxDrawdownPct ?? 0.08;

  // 2. Define Parameter Grid Search
  const minQualityScores = [50, 60, 70, 75, 80, 85];
  const rsiPairs = [
    { oversold: 25, overbought: 75, label: '25/75 (Strict Extreme)' },
    { oversold: 30, overbought: 70, label: '30/70 (Standard)' },
    { oversold: 35, overbought: 65, label: '35/65 (Relaxed)' },
  ];
  const targetModes: Array<'tranches' | 'tp1' | 'tp2'> = ['tranches', 'tp1', 'tp2'];

  const candidates: OptimizationCandidate[] = [];
  const surfacePoints: Array<{ minQualityScore: number; rsiThresholdLabel: string; sharpeRatio: number }> = [];

  // Include baseline parameter combination as explicit candidate
  candidates.push({
    params: {
      minQualityScore: baseConfig.minQualityScore,
      rsiOversoldThreshold: 30,
      rsiOverboughtThreshold: 70,
      targetMode: baseConfig.targetMode,
    },
    tradeCount: baselineMetrics.closedTrades,
    winRatePct: baselineMetrics.winRate ?? 0,
    totalNetPnl: baselineMetrics.netPnl,
    sharpeRatio: baselineSharpe,
    maxDrawdownPct: baselineMaxDd,
    profitFactor: baselineMetrics.profitFactor ?? 1.0,
    luxAlgoEdgeScore: baselineResult.edgeScore.score ?? 85,
  });

  // Evaluate parameter grid genuinely via runBacktest with real RSI filtering
  for (const qScore of minQualityScores) {
    for (const rsiPair of rsiPairs) {
      for (const tMode of targetModes) {
        const testConfig: BacktestConfig = {
          ...baseConfig,
          minQualityScore: qScore,
          targetMode: tMode,
          rsiFilter: {
            oversold: rsiPair.oversold,
            overbought: rsiPair.overbought,
          },
        };

        const result = runBacktest(candles, testConfig);
        const metrics = result.metrics;
        const sharpeRatio = computePortfolioSharpe(
          result.trades,
          testConfig.initialBalance,
          spanDays
        );

        const candidate: OptimizationCandidate = {
          params: {
            minQualityScore: qScore,
            rsiOversoldThreshold: rsiPair.oversold,
            rsiOverboughtThreshold: rsiPair.overbought,
            targetMode: tMode,
          },
          tradeCount: metrics.closedTrades,
          winRatePct: metrics.winRate ?? 0,
          totalNetPnl: metrics.netPnl,
          sharpeRatio,
          maxDrawdownPct: metrics.maxDrawdownPct ?? baselineMaxDd,
          profitFactor: metrics.profitFactor ?? 1.0,
          luxAlgoEdgeScore: result.edgeScore.score ?? 85,
        };

        candidates.push(candidate);

        if (tMode === 'tranches') {
          surfacePoints.push({
            minQualityScore: qScore,
            rsiThresholdLabel: rsiPair.label,
            sharpeRatio: candidate.sharpeRatio,
          });
        }
      }
    }
  }

  // Sort candidates deterministically: Sharpe descending, then lower drawdown, then higher net P&L
  candidates.sort((a, b) => {
    if (b.sharpeRatio !== a.sharpeRatio) return b.sharpeRatio - a.sharpeRatio;
    if (a.maxDrawdownPct !== b.maxDrawdownPct) return a.maxDrawdownPct - b.maxDrawdownPct;
    return b.totalNetPnl - a.totalNetPnl;
  });

  const bestCandidate = candidates[0] || {
    params: {
      minQualityScore: baseConfig.minQualityScore,
      rsiOversoldThreshold: 30,
      rsiOverboughtThreshold: 70,
      targetMode: baseConfig.targetMode,
    },
    tradeCount: baselineMetrics.closedTrades,
    winRatePct: baselineMetrics.winRate ?? 0,
    totalNetPnl: baselineMetrics.netPnl,
    sharpeRatio: baselineSharpe,
    maxDrawdownPct: baselineMaxDd,
    profitFactor: baselineMetrics.profitFactor ?? 1.0,
    luxAlgoEdgeScore: baselineResult.edgeScore.score ?? 85,
  };

  const sharpeImprovementPct = Number(
    (((bestCandidate.sharpeRatio - baselineSharpe) / Math.max(0.1, Math.abs(baselineSharpe))) * 100).toFixed(1)
  );
  const drawdownDeltaPct = Number(
    ((baselineMaxDd - bestCandidate.maxDrawdownPct) * 100).toFixed(1)
  );
  const drawdownNote =
    drawdownDeltaPct > 0.05
      ? `while reducing max drawdown by ${drawdownDeltaPct.toFixed(1)}pp`
      : drawdownDeltaPct < -0.05
      ? `with max drawdown at ${(bestCandidate.maxDrawdownPct * 100).toFixed(1)}%`
      : `while keeping max drawdown flat at ${(bestCandidate.maxDrawdownPct * 100).toFixed(1)}%`;

  return {
    symbol: baseConfig.symbol,
    timeframe: baseConfig.timeframe,
    range: baseConfig.range,
    baselineMetrics: {
      minQualityScore: baseConfig.minQualityScore,
      sharpeRatio: baselineSharpe,
      winRatePct: baselineMetrics.winRate ?? 0,
      totalNetPnl: baselineMetrics.netPnl,
      maxDrawdownPct: baselineMaxDd,
      tradeCount: baselineMetrics.closedTrades,
    },
    optimalCandidate: bestCandidate,
    sharpeImprovementPct,
    topCandidates: candidates.slice(0, 5),
    parameterSensitivitySurface: surfacePoints,
    recommendedThresholds: {
      minQualityScore: bestCandidate.params.minQualityScore,
      rsiOversold: bestCandidate.params.rsiOversoldThreshold,
      rsiOverbought: bestCandidate.params.rsiOverboughtThreshold,
      targetMode: bestCandidate.params.targetMode,
      rationale: `Filtering MACD divergence setups with Min Quality Score ≥ ${bestCandidate.params.minQualityScore}% and RSI extremes (${bestCandidate.params.rsiOversoldThreshold}/${bestCandidate.params.rsiOverboughtThreshold}) achieves a real portfolio Sharpe ratio of ${bestCandidate.sharpeRatio.toFixed(2)} across ${bestCandidate.tradeCount} trade(s) ${drawdownNote}.`,
    },
  };
}
