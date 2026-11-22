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

export interface DeflatedSharpeAudit {
  trialsTested: number;
  observedTradeSharpe: number;
  benchmarkNullSharpe: number;
  deflatedSharpeProb: number; // 0..1
  deflatedSharpePct: number;  // 0..100
  returnSkewness: number;
  returnKurtosis: number;
  sampleTrades: number;
  isStatisticallySignificant: boolean; // DSR >= 0.90 and n >= 5
  overfitRisk: 'LOW' | 'MODERATE' | 'HIGH';
  summary: string;
}

export interface WalkForwardReport {
  available: boolean;
  inSampleCandles: number;
  outOfSampleCandles: number;
  splitDate: string;
  inSampleBestParams: ParameterCombination;
  inSampleSharpe: number;
  inSampleNetPnl: number;
  inSampleTrades: number;
  outOfSampleSharpe: number;
  outOfSampleNetPnl: number;
  outOfSampleWinRatePct: number;
  outOfSampleTrades: number;
  baselineOosSharpe: number;
  oosDegradationPct: number;
  passedOutOfSample: boolean;
  note: string;
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
  deflatedSharpe: DeflatedSharpeAudit;
  walkForward: WalkForwardReport;
  recommendedThresholds: {
    minQualityScore: number;
    rsiOversold: number;
    rsiOverbought: number;
    targetMode: 'tranches' | 'tp1' | 'tp2';
    rationale: string;
  };
}

/**
 * Standard normal CDF Φ(x) via Abramowitz & Stegun 7.1.26 erf approximation.
 */
export function normalCdf(x: number): number {
  if (!Number.isFinite(x)) return x > 0 ? 1 : 0;
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * absX);
  const erf =
    1 -
    (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t) *
      Math.exp(-absX * absX);
  return Math.max(0, Math.min(1, 0.5 * (1 + sign * erf)));
}

/**
 * Inverse standard normal CDF Φ^{-1}(p) (Peter J. Acklam rational approximation).
 */
export function inverseNormalCdf(p: number): number {
  const clamped = Math.max(1e-9, Math.min(1 - 1e-9, p));
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.38357751867269e2, -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416,
  ];

  const pLow = 0.02425;
  const pHigh = 1 - pLow;

  if (clamped < pLow) {
    const q = Math.sqrt(-2 * Math.log(clamped));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
  if (clamped <= pHigh) {
    const q = clamped - 0.5;
    const r = q * q;
    return (
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    );
  }
  const q = Math.sqrt(-2 * Math.log(1 - clamped));
  return -(
    (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  );
}

/**
 * Computes Bailey & López de Prado (2014) Deflated Sharpe Ratio (DSR)
 * adjusting for non-normality (skewness, kurtosis) and multiple-testing trials N.
 */
export function computeDeflatedSharpeRatio(params: {
  trades: Array<{ status?: string; netPnl: number }>;
  initialBalance: number;
  trialPerTradeSharpes: number[];
  outOfSamplePassed?: boolean;
  outOfSampleAvailable?: boolean;
}): DeflatedSharpeAudit {
  const closed = params.trades.filter((t) => t.status !== 'open');
  const n = closed.length;
  const trialsTested = Math.max(1, params.trialPerTradeSharpes.length);

  if (n < 3 || params.initialBalance <= 0) {
    return {
      trialsTested,
      observedTradeSharpe: 0,
      benchmarkNullSharpe: 0,
      deflatedSharpeProb: 0,
      deflatedSharpePct: 0,
      returnSkewness: 0,
      returnKurtosis: 3,
      sampleTrades: n,
      isStatisticallySignificant: false,
      overfitRisk: 'HIGH',
      summary: `Insufficient closed trades (n=${n}) for statistical DSR confidence across ${trialsTested} grid trials.`,
    };
  }

  const returns = closed.map((t) => (Number(t.netPnl) || 0) / params.initialBalance);
  const mean = returns.reduce((s, r) => s + r, 0) / n;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (n - 1);
  const std = Math.max(Math.sqrt(variance), 1e-6);
  const observedSr = mean / std;

  // Sample skewness and non-excess kurtosis
  const m3 = returns.reduce((s, r) => s + ((r - mean) / std) ** 3, 0) / n;
  const m4 = returns.reduce((s, r) => s + ((r - mean) / std) ** 4, 0) / n;

  // Expected max SR under null given cross-trial Sharpe variance
  const srMean =
    params.trialPerTradeSharpes.reduce((s, v) => s + v, 0) / trialsTested;
  const srVar =
    trialsTested > 1
      ? params.trialPerTradeSharpes.reduce((s, v) => s + (v - srMean) ** 2, 0) /
        (trialsTested - 1)
      : 0;
  const srStd = Math.sqrt(Math.max(0, srVar));

  const EULER_MASCHERONI = 0.5772156649;
  const sr0 =
    trialsTested > 1 && srStd > 0
      ? srStd *
        ((1 - EULER_MASCHERONI) * inverseNormalCdf(1 - 1 / trialsTested) +
          EULER_MASCHERONI * inverseNormalCdf(1 - 1 / (trialsTested * Math.E)))
      : 0;

  const denomVar = Math.max(0.1, 1 - m3 * observedSr + ((m4 - 1) / 4) * observedSr * observedSr);
  const zStat = ((observedSr - sr0) * Math.sqrt(Math.max(1, n - 1))) / Math.sqrt(denomVar);
  const prob = normalCdf(zStat);
  const pct = Number((prob * 100).toFixed(1));
  const isStatisticallySignificant = prob >= 0.9 && n >= 5;

  let overfitRisk: 'LOW' | 'MODERATE' | 'HIGH' = 'MODERATE';
  if (prob >= 0.7 && n >= 5 && (!params.outOfSampleAvailable || params.outOfSamplePassed !== false)) {
    overfitRisk = 'LOW';
  } else if (prob < 0.45 || (params.outOfSampleAvailable && params.outOfSamplePassed === false && prob < 0.85)) {
    overfitRisk = 'HIGH';
  }

  return {
    trialsTested,
    observedTradeSharpe: Number(observedSr.toFixed(3)),
    benchmarkNullSharpe: Number(sr0.toFixed(3)),
    deflatedSharpeProb: Number(prob.toFixed(4)),
    deflatedSharpePct: pct,
    returnSkewness: Number(m3.toFixed(2)),
    returnKurtosis: Number(m4.toFixed(2)),
    sampleTrades: n,
    isStatisticallySignificant,
    overfitRisk,
    summary: `DSR ${pct}% across N=${trialsTested} trials (n=${n} trades, skew=${m3.toFixed(2)}, SR₀=${sr0.toFixed(2)}). Overfit risk: ${overfitRisk}.`,
  };
}

function computePerTradeSharpe(
  trades: Array<{ status?: string; netPnl: number }>,
  initialBalance: number
): number {
  const closed = trades.filter((t) => t.status !== 'open');
  if (closed.length < 2 || initialBalance <= 0) return 0;
  const returns = closed.map((t) => (Number(t.netPnl) || 0) / initialBalance);
  const mean = returns.reduce((s, r) => s + r, 0) / closed.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (closed.length - 1);
  const std = Math.max(Math.sqrt(variance), 0.002);
  return mean / std;
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
 * Evaluates a chronological 70% In-Sample / 30% Out-of-Sample Walk-Forward split
 * so optimal parameters discovered on the IS window are validated blindly on OOS bars.
 */
export function evaluateWalkForwardSplit(
  candles: Candle[],
  baseConfig: BacktestConfig
): WalkForwardReport {
  const minQualityScores = [50, 60, 70, 75, 80, 85];
  const rsiPairs = [
    { oversold: 25, overbought: 75 },
    { oversold: 30, overbought: 70 },
    { oversold: 35, overbought: 65 },
  ];
  const targetModes: Array<'tranches' | 'tp1' | 'tp2'> = ['tranches', 'tp1', 'tp2'];

  const fallbackParams: ParameterCombination = {
    minQualityScore: baseConfig.minQualityScore,
    rsiOversoldThreshold: 30,
    rsiOverboughtThreshold: 70,
    targetMode: baseConfig.targetMode,
  };

  if (candles.length < 90) {
    return {
      available: false,
      inSampleCandles: candles.length,
      outOfSampleCandles: 0,
      splitDate: candles[candles.length - 1]?.dateStr || '',
      inSampleBestParams: fallbackParams,
      inSampleSharpe: 0,
      inSampleNetPnl: 0,
      inSampleTrades: 0,
      outOfSampleSharpe: 0,
      outOfSampleNetPnl: 0,
      outOfSampleWinRatePct: 0,
      outOfSampleTrades: 0,
      baselineOosSharpe: 0,
      oosDegradationPct: 0,
      passedOutOfSample: false,
      note: 'Requires at least 90 bars for a 70/30 In-Sample vs Out-of-Sample Walk-Forward split.',
    };
  }

  const splitIdx = Math.floor(candles.length * 0.7);
  const isCandles = candles.slice(0, splitIdx);
  // Include 30 warmup bars from the end of IS only for indicator continuity? No: runBacktest detects setups cleanly per slice; to avoid look-ahead, slice strictly from splitIdx!
  const oosCandles = candles.slice(splitIdx);
  const splitDate = oosCandles[0]?.dateStr || candles[splitIdx]?.dateStr || '';

  const isSpanDays = Math.max(
    30,
    (isCandles[isCandles.length - 1].timestamp - isCandles[0].timestamp) / 86400000
  );
  const oosSpanDays = Math.max(
    30,
    (oosCandles[oosCandles.length - 1].timestamp - oosCandles[0].timestamp) / 86400000
  );

  let bestIsParams = fallbackParams;
  let bestIsSharpe = -Infinity;
  let bestIsNetPnl = 0;
  let bestIsTrades = 0;

  for (const qScore of minQualityScores) {
    for (const rsiPair of rsiPairs) {
      for (const tMode of targetModes) {
        const res = runBacktest(isCandles, {
          ...baseConfig,
          minQualityScore: qScore,
          targetMode: tMode,
          rsiFilter: { oversold: rsiPair.oversold, overbought: rsiPair.overbought },
        });
        const sh = computePortfolioSharpe(res.trades, baseConfig.initialBalance, isSpanDays);
        if (
          sh > bestIsSharpe ||
          (sh === bestIsSharpe && res.metrics.netPnl > bestIsNetPnl)
        ) {
          bestIsSharpe = sh;
          bestIsNetPnl = res.metrics.netPnl;
          bestIsTrades = res.metrics.closedTrades;
          bestIsParams = {
            minQualityScore: qScore,
            rsiOversoldThreshold: rsiPair.oversold,
            rsiOverboughtThreshold: rsiPair.overbought,
            targetMode: tMode,
          };
        }
      }
    }
  }

  if (!Number.isFinite(bestIsSharpe)) bestIsSharpe = 0;

  const oosRes = runBacktest(oosCandles, {
    ...baseConfig,
    minQualityScore: bestIsParams.minQualityScore,
    targetMode: bestIsParams.targetMode,
    rsiFilter: {
      oversold: bestIsParams.rsiOversoldThreshold,
      overbought: bestIsParams.rsiOverboughtThreshold,
    },
  });
  const oosSharpe = computePortfolioSharpe(oosRes.trades, baseConfig.initialBalance, oosSpanDays);

  const baseOosRes = runBacktest(oosCandles, baseConfig);
  const baselineOosSharpe = computePortfolioSharpe(
    baseOosRes.trades,
    baseConfig.initialBalance,
    oosSpanDays
  );

  const oosDegradationPct =
    bestIsSharpe > 0.05
      ? Number((((bestIsSharpe - oosSharpe) / bestIsSharpe) * 100).toFixed(1))
      : 0;

  const passedOutOfSample =
    oosRes.metrics.closedTrades > 0 &&
    oosSharpe > 0 &&
    oosRes.metrics.netPnl > 0 &&
    (oosSharpe >= baselineOosSharpe || oosSharpe >= 0.5);

  return {
    available: true,
    inSampleCandles: isCandles.length,
    outOfSampleCandles: oosCandles.length,
    splitDate,
    inSampleBestParams: bestIsParams,
    inSampleSharpe: bestIsSharpe,
    inSampleNetPnl: Number(bestIsNetPnl.toFixed(2)),
    inSampleTrades: bestIsTrades,
    outOfSampleSharpe: oosSharpe,
    outOfSampleNetPnl: Number(oosRes.metrics.netPnl.toFixed(2)),
    outOfSampleWinRatePct: Number(((oosRes.metrics.winRate ?? 0) * 100).toFixed(1)),
    outOfSampleTrades: oosRes.metrics.closedTrades,
    baselineOosSharpe,
    oosDegradationPct,
    passedOutOfSample,
    note: `Trained on ${isCandles.length} bars, tested blindly on ${oosCandles.length} OOS bars from ${splitDate} (OOS Sharpe ${oosSharpe.toFixed(2)} vs Baseline OOS ${baselineOosSharpe.toFixed(2)}).`,
  };
}

/**
 * Runs grid search optimization across Quality Scores, RSI Extremes, and Target Modes
 * to find the parameter set that maximizes the Sharpe Ratio, audited by Walk-Forward OOS & DSR.
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
  const trialPerTradeSharpes: number[] = [];
  let bestTradesList = baselineResult.trades;
  let bestKey = '';
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
  trialPerTradeSharpes.push(computePerTradeSharpe(baselineResult.trades, baseConfig.initialBalance));

  const tradesByConfigKey = new Map<string, typeof baselineResult.trades>();
  const baselineKey = `${baseConfig.minQualityScore}|30|70|${baseConfig.targetMode}`;
  tradesByConfigKey.set(baselineKey, baselineResult.trades);

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
        trialPerTradeSharpes.push(computePerTradeSharpe(result.trades, testConfig.initialBalance));
        const key = `${qScore}|${rsiPair.oversold}|${rsiPair.overbought}|${tMode}`;
        tradesByConfigKey.set(key, result.trades);

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

  bestKey = `${bestCandidate.params.minQualityScore}|${bestCandidate.params.rsiOversoldThreshold}|${bestCandidate.params.rsiOverboughtThreshold}|${bestCandidate.params.targetMode}`;
  bestTradesList = tradesByConfigKey.get(bestKey) || baselineResult.trades;

  // 3. Walk-Forward OOS & Deflated Sharpe Ratio (DSR) Overfitting Audit
  const walkForward = evaluateWalkForwardSplit(candles, baseConfig);
  const deflatedSharpe = computeDeflatedSharpeRatio({
    trades: bestTradesList,
    initialBalance: baseConfig.initialBalance,
    trialPerTradeSharpes,
    outOfSampleAvailable: walkForward.available,
    outOfSamplePassed: walkForward.passedOutOfSample,
  });

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

  const wfSuffix = walkForward.available
    ? ` Walk-Forward 70/30 OOS Sharpe: ${walkForward.outOfSampleSharpe.toFixed(2)} (DSR ${deflatedSharpe.deflatedSharpePct}%, Overfit Risk: ${deflatedSharpe.overfitRisk}).`
    : ` DSR ${deflatedSharpe.deflatedSharpePct}% across ${deflatedSharpe.trialsTested} trials (Overfit Risk: ${deflatedSharpe.overfitRisk}).`;

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
    deflatedSharpe,
    walkForward,
    recommendedThresholds: {
      minQualityScore: bestCandidate.params.minQualityScore,
      rsiOversold: bestCandidate.params.rsiOversoldThreshold,
      rsiOverbought: bestCandidate.params.rsiOverboughtThreshold,
      targetMode: bestCandidate.params.targetMode,
      rationale: `Filtering MACD divergence setups with Min Quality Score ≥ ${bestCandidate.params.minQualityScore}% and RSI extremes (${bestCandidate.params.rsiOversoldThreshold}/${bestCandidate.params.rsiOverboughtThreshold}) achieves a real portfolio Sharpe ratio of ${bestCandidate.sharpeRatio.toFixed(2)} across ${bestCandidate.tradeCount} trade(s) ${drawdownNote}.${wfSuffix}`,
    },
  };
}
