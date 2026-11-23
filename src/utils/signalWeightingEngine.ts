/**
 * Signal Weighting Engine
 * Calculates rolling correlation between asset price action and MACD divergence signals,
 * and computes genuine empirical historical setup accuracy from real candlestick data or logged trades.
 */

import { Candle, DivergenceSetup, calculateIndicators, detectDivergences } from './trullasStrategy';

export interface EmpiricalExcursionQuantiles {
  analogCount: number; // HR-N: count of resolved/evaluated real historical analog setups
  sampleSufficient: boolean; // True only when analogCount >= 10
  winRatePct: number;
  mfeP50Pct: number; // Median Max Favorable Excursion (%) over forward 25-bar window
  mfeP80Pct: number; // 80th percentile Max Favorable Excursion (%)
  maeP50Pct: number; // Median Max Adverse Excursion (%, positive magnitude)
  maeP80Pct: number; // 80th percentile Max Adverse Excursion (%, positive magnitude)
  medianNetReturnPct: number; // Median 25-bar forward net return (%)
  tp1TargetPct: number | null;
  stopDistancePct: number | null;
  tp1WithinMfeP80: boolean | null; // True if planned TP1 fits inside historical MFE p80
  slOutsideMaeP50: boolean | null; // True if stop distance >= median historical adverse noise
}

export interface SignalWeightingResult {
  symbol: string;
  confidenceScore: number; // 0 - 100%
  rollingCorrelation: number; // Pearson r between -1.0 and +1.0
  historicalAccuracyPct: number; // Empirical win rate % across real setup history
  totalHistoricalSignals: number;
  hasHistoricalSample: boolean;
  signalGrade: 'A+' | 'A' | 'B' | 'C' | 'D';
  breakdown: {
    rollingCorrelationScore: number; // 0-30 pts
    rawQualityScore: number; // 0-35 pts
    historicalWinRateScore: number; // 0-20 pts
    confluenceExhaustionScore: number; // 0-15 pts
  };
  recommendation: 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'CAUTION' | 'AVOID';
  excursionQuantiles: EmpiricalExcursionQuantiles;
}

function linearQuantile(sortedAsc: number[], q: number): number {
  if (sortedAsc.length === 0) return 0;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const clamped = Math.max(0, Math.min(1, q));
  const pos = (sortedAsc.length - 1) * clamped;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const weight = pos - lo;
  return sortedAsc[lo] * (1 - weight) + sortedAsc[hi] * weight;
}

/**
 * Calculates Pearson Correlation Coefficient (r) between two equal-length numerical arrays
 */
export function calculatePearsonCorrelation(x: number[], y: number[]): number {
  if (x.length < 3 || x.length !== y.length) return 0;

  const n = x.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  let sumY2 = 0;

  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
    sumXY += x[i] * y[i];
    sumX2 += x[i] * x[i];
    sumY2 += y[i] * y[i];
  }

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

  if (denominator === 0) return 0;
  const r = numerator / denominator;
  return Number.isNaN(r) ? 0 : Math.max(-1, Math.min(1, r));
}

/**
 * Calculates N-period rolling correlation between Price closes and MACD Histogram values
 */
export function calculateRollingPriceMacdCorrelation(candles: Candle[], windowSize: number = 30): number {
  if (!candles || candles.length < Math.max(10, Math.min(windowSize, candles.length))) {
    return 0;
  }
  const effectiveWindow = Math.min(windowSize, candles.length);
  if (effectiveWindow < 10) return 0;

  const indicators = calculateIndicators(candles);
  const recentSlice = indicators.slice(-effectiveWindow);

  const prices = recentSlice.map((p) => p.candle.close);
  const macdHistograms = recentSlice.map((p) => p.histogram);

  return calculatePearsonCorrelation(prices, macdHistograms);
}

/**
 * Computes empirical historical setup win-rate strictly from real historical OHLCV bars
 * (forward bar evaluation after each detected divergence setup) and/or real closed trade logs.
 * Never fabricates win-rates via lookup tables or character hashes.
 */
export function computeEmpiricalHistoricalAccuracy(
  candles: Candle[],
  symbol: string,
  timeframe: string = '1d',
  recordedStats?: { wins: number; total: number }
): { winRate: number; totalSignals: number; hasHistory: boolean } {
  let wins = recordedStats ? Math.max(0, recordedStats.wins) : 0;
  let total = recordedStats ? Math.max(0, recordedStats.total) : 0;

  if (candles && candles.length >= 35) {
    const indicators = calculateIndicators(candles);
    const setups = detectDivergences(symbol, timeframe, indicators);
    for (const s of setups) {
      const lastPoint = s.points[s.points.length - 1];
      if (!lastPoint) continue;
      const startIdx = lastPoint.index + 1;
      if (startIdx >= candles.length - 1) continue;

      const isBull = s.type.startsWith('BULLISH');
      let resolved: 'win' | 'loss' | null = null;
      const endIdx = Math.min(candles.length - 1, startIdx + 25);

      for (let k = startIdx; k <= endIdx; k++) {
        const bar = candles[k];
        if (isBull) {
          if (bar.low <= s.stopLoss) {
            resolved = 'loss';
            break;
          }
          if (bar.high >= s.targets.tp1) {
            resolved = 'win';
            break;
          }
        } else {
          if (bar.high >= s.stopLoss) {
            resolved = 'loss';
            break;
          }
          if (bar.low <= s.targets.tp1) {
            resolved = 'win';
            break;
          }
        }
      }

      if (resolved) {
        total += 1;
        if (resolved === 'win') wins += 1;
      }
    }
  }

  if (total === 0) {
    return { winRate: 0, totalSignals: 0, hasHistory: false };
  }

  return {
    winRate: Number(((wins / total) * 100).toFixed(1)),
    totalSignals: total,
    hasHistory: true,
  };
}

/**
 * Computes empirical MFE / MAE excursion quantiles (p50, p80) across real historical analog setups
 * strictly capped at `asOfBarIndex` (anti-lookahead) and excluding the current setup at `excludeFromIndex`.
 */
export function computeEmpiricalExcursionQuantiles(
  candles: Candle[],
  symbol: string,
  timeframe: string = '1d',
  options: {
    direction?: 'BULLISH' | 'BEARISH';
    asOfBarIndex?: number;
    excludeFromIndex?: number;
    currentTriggerPrice?: number;
    currentStopLoss?: number;
    currentTp1?: number;
  } = {}
): EmpiricalExcursionQuantiles {
  const maxIdx =
    typeof options.asOfBarIndex === 'number'
      ? Math.min(candles.length - 1, Math.max(0, options.asOfBarIndex))
      : candles.length - 1;

  const slicedCandles = maxIdx < candles.length - 1 ? candles.slice(0, maxIdx + 1) : candles;

  const trigger = options.currentTriggerPrice;
  const sl = options.currentStopLoss;
  const tp1 = options.currentTp1;
  const dir = options.direction;

  let tp1TargetPct: number | null = null;
  let stopDistancePct: number | null = null;
  if (typeof trigger === 'number' && trigger > 0) {
    if (typeof tp1 === 'number' && tp1 > 0) {
      const rawTp = dir === 'BEARISH' ? ((trigger - tp1) / trigger) * 100 : ((tp1 - trigger) / trigger) * 100;
      tp1TargetPct = Number(Math.max(0, rawTp).toFixed(2));
    }
    if (typeof sl === 'number' && sl > 0) {
      const rawSl = dir === 'BEARISH' ? ((sl - trigger) / trigger) * 100 : ((trigger - sl) / trigger) * 100;
      stopDistancePct = Number(Math.max(0, rawSl).toFixed(2));
    }
  }

  const emptyResult: EmpiricalExcursionQuantiles = {
    analogCount: 0,
    sampleSufficient: false,
    winRatePct: 0,
    mfeP50Pct: 0,
    mfeP80Pct: 0,
    maeP50Pct: 0,
    maeP80Pct: 0,
    medianNetReturnPct: 0,
    tp1TargetPct,
    stopDistancePct,
    tp1WithinMfeP80: null,
    slOutsideMaeP50: null,
  };

  if (!slicedCandles || slicedCandles.length < 35) {
    return emptyResult;
  }

  const indicators = calculateIndicators(slicedCandles);
  const setups = detectDivergences(symbol, timeframe, indicators);

  const mfeSamples: number[] = [];
  const maeSamples: number[] = [];
  const netReturnSamples: number[] = [];
  let wins = 0;
  let resolvedCount = 0;

  for (const s of setups) {
    const isBull = s.type.startsWith('BULLISH');
    if (options.direction === 'BULLISH' && !isBull) continue;
    if (options.direction === 'BEARISH' && isBull) continue;

    const lastPoint = s.points[s.points.length - 1];
    if (!lastPoint) continue;
    if (typeof options.excludeFromIndex === 'number' && lastPoint.index >= options.excludeFromIndex) {
      continue;
    }

    const startIdx = lastPoint.index + 1;
    if (startIdx >= slicedCandles.length - 1) continue;

    const entryRef = s.triggerPrice > 0 ? s.triggerPrice : s.currentPrice;
    if (!(entryRef > 0)) continue;

    const endIdx = Math.min(slicedCandles.length - 1, startIdx + 25);
    let maxFav = 0;
    let maxAdv = 0;
    let outcome: 'win' | 'loss' | null = null;

    for (let k = startIdx; k <= endIdx; k++) {
      const bar = slicedCandles[k];
      const favPct = isBull
        ? ((bar.high - entryRef) / entryRef) * 100
        : ((entryRef - bar.low) / entryRef) * 100;
      const advPct = isBull
        ? ((entryRef - bar.low) / entryRef) * 100
        : ((bar.high - entryRef) / entryRef) * 100;

      if (favPct > maxFav) maxFav = favPct;
      if (advPct > maxAdv) maxAdv = advPct;

      if (!outcome) {
        if (isBull) {
          if (bar.low <= s.stopLoss) outcome = 'loss';
          else if (bar.high >= s.targets.tp1) outcome = 'win';
        } else {
          if (bar.high >= s.stopLoss) outcome = 'loss';
          else if (bar.low <= s.targets.tp1) outcome = 'win';
        }
      }
    }

    const endClose = slicedCandles[endIdx].close;
    const netRetPct = isBull
      ? ((endClose - entryRef) / entryRef) * 100
      : ((entryRef - endClose) / entryRef) * 100;

    mfeSamples.push(Number(maxFav.toFixed(2)));
    maeSamples.push(Number(maxAdv.toFixed(2)));
    netReturnSamples.push(Number(netRetPct.toFixed(2)));
    if (outcome) {
      resolvedCount += 1;
      if (outcome === 'win') wins += 1;
    }
  }

  const analogCount = mfeSamples.length;
  if (analogCount === 0) return emptyResult;

  const sortedMfe = [...mfeSamples].sort((a, b) => a - b);
  const sortedMae = [...maeSamples].sort((a, b) => a - b);
  const sortedNet = [...netReturnSamples].sort((a, b) => a - b);

  const mfeP50Pct = Number(linearQuantile(sortedMfe, 0.5).toFixed(2));
  const mfeP80Pct = Number(linearQuantile(sortedMfe, 0.8).toFixed(2));
  const maeP50Pct = Number(linearQuantile(sortedMae, 0.5).toFixed(2));
  const maeP80Pct = Number(linearQuantile(sortedMae, 0.8).toFixed(2));
  const medianNetReturnPct = Number(linearQuantile(sortedNet, 0.5).toFixed(2));

  return {
    analogCount,
    sampleSufficient: analogCount >= 10,
    winRatePct: resolvedCount > 0 ? Number(((wins / resolvedCount) * 100).toFixed(1)) : 0,
    mfeP50Pct,
    mfeP80Pct,
    maeP50Pct,
    maeP80Pct,
    medianNetReturnPct,
    tp1TargetPct,
    stopDistancePct,
    tp1WithinMfeP80: tp1TargetPct !== null ? tp1TargetPct <= mfeP80Pct : null,
    slOutsideMaeP50: stopDistancePct !== null ? stopDistancePct >= maeP50Pct : null,
  };
}

/**
 * Evaluates Signal Weighting and assigns confidence score to a setup using real candle telemetry
 */
export function evaluateSignalWeighting(
  setup: DivergenceSetup,
  candles: Candle[],
  recordedStats?: { wins: number; total: number }
): SignalWeightingResult {
  const symbol = setup.symbol;
  const rollingCorrelation = calculateRollingPriceMacdCorrelation(candles, 30);
  const {
    winRate: historicalAccuracyPct,
    totalSignals: totalHistoricalSignals,
    hasHistory: hasHistoricalSample,
  } = computeEmpiricalHistoricalAccuracy(candles, symbol, setup.timeframe, recordedStats);

  const setupTailIndex =
    setup.points && setup.points.length > 0 ? setup.points[setup.points.length - 1].index : undefined;
  const excursionQuantiles = computeEmpiricalExcursionQuantiles(candles, symbol, setup.timeframe, {
    direction: setup.type.startsWith('BULLISH') ? 'BULLISH' : 'BEARISH',
    excludeFromIndex: setupTailIndex,
    currentTriggerPrice: setup.triggerPrice,
    currentStopLoss: setup.stopLoss,
    currentTp1: setup.targets.tp1,
  });

  // 1. Rolling Correlation Score (0 to 30 pts)
  const correlationAbs = Math.abs(rollingCorrelation);
  const rollingCorrelationScore = Math.min(30, Number((correlationAbs * 30).toFixed(1)));

  // 2. Raw Divergence Quality Score (0 to 35 pts)
  const rawQualityScore = Number(((setup.qualityScore / 100) * 35).toFixed(1));

  // 3. Empirical Historical Win Rate Score (0 to 20 pts; 10 neutral pts if no prior closed episodes exist;
  //    Bayesian shrinkage toward 50% prior when sample n < 10 to prevent small-sample overfitting)
  let historicalWinRateScore = 10;
  if (hasHistoricalSample) {
    const shrinkageWeight = Math.min(1, totalHistoricalSignals / 10);
    const shrunkWinRate = 50 * (1 - shrinkageWeight) + historicalAccuracyPct * shrinkageWeight;
    historicalWinRateScore = Number(((shrunkWinRate / 100) * 20).toFixed(1));
  }

  // 4. Confluence & Volume Exhaustion Score (0 to 15 pts)
  let confluenceExhaustionScore = 0;
  if (setup.confluenceChecks.priceDivergence) confluenceExhaustionScore += 3;
  if (setup.confluenceChecks.macdDivergence) confluenceExhaustionScore += 3;
  if (setup.confluenceChecks.rsiDivergence) confluenceExhaustionScore += 3;
  if (setup.confluenceChecks.volumeExhaustion) confluenceExhaustionScore += 3;
  if (setup.confluenceChecks.macdCrossConfirmed) confluenceExhaustionScore += 3;

  const totalScore = Math.min(
    100,
    Math.round(rollingCorrelationScore + rawQualityScore + historicalWinRateScore + confluenceExhaustionScore)
  );

  let signalGrade: 'A+' | 'A' | 'B' | 'C' | 'D' = 'C';
  let recommendation: 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'CAUTION' | 'AVOID' = 'NEUTRAL';

  if (totalScore >= 88) {
    signalGrade = 'A+';
    recommendation = setup.type.startsWith('BULLISH') ? 'STRONG_BUY' : 'AVOID';
  } else if (totalScore >= 78) {
    signalGrade = 'A';
    recommendation = setup.type.startsWith('BULLISH') ? 'BUY' : 'CAUTION';
  } else if (totalScore >= 68) {
    signalGrade = 'B';
    recommendation = 'NEUTRAL';
  } else if (totalScore >= 55) {
    signalGrade = 'C';
    recommendation = 'CAUTION';
  } else {
    signalGrade = 'D';
    recommendation = 'AVOID';
  }

  return {
    symbol,
    confidenceScore: totalScore,
    rollingCorrelation: Number(rollingCorrelation.toFixed(2)),
    historicalAccuracyPct,
    totalHistoricalSignals,
    hasHistoricalSample,
    signalGrade,
    breakdown: {
      rollingCorrelationScore,
      rawQualityScore,
      historicalWinRateScore,
      confluenceExhaustionScore,
    },
    recommendation,
    excursionQuantiles,
  };
}
