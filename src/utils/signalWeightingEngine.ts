/**
 * Signal Weighting Engine
 * Calculates rolling correlation between asset price action and MACD divergence signals,
 * and computes genuine empirical historical setup accuracy from real candlestick data or logged trades.
 */

import { Candle, DivergenceSetup, calculateIndicators, detectDivergences } from './trullasStrategy';

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

  // 1. Rolling Correlation Score (0 to 30 pts)
  const correlationAbs = Math.abs(rollingCorrelation);
  const rollingCorrelationScore = Math.min(30, Number((correlationAbs * 30).toFixed(1)));

  // 2. Raw Divergence Quality Score (0 to 35 pts)
  const rawQualityScore = Number(((setup.qualityScore / 100) * 35).toFixed(1));

  // 3. Empirical Historical Win Rate Score (0 to 20 pts; 10 neutral pts if no prior closed episodes exist)
  const historicalWinRateScore = hasHistoricalSample
    ? Number(((historicalAccuracyPct / 100) * 20).toFixed(1))
    : 10;

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
  };
}
