/**
 * David Trullàs Trading Strategy Engine
 * Core technical analysis calculations:
 * - Exponential Moving Average (EMA)
 * - MACD (12, 26, 9) & Histogram
 * - RSI (14)
 * - Swing Peak and Trough detection
 * - Triple & Double Divergence detection (MACD, RSI, Volume)
 * - Fibonacci Retracement Levels (23.6%, 38.2%, 50%, 61.8%, 100%)
 * - Trullas Position Sizing & Scaling (3 tranches, strict stop-loss, R:R calculation)
 */

export interface Candle {
  timestamp: number;
  dateStr: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IndicatorPoint {
  candle: Candle;
  ema12: number;
  ema26: number;
  macd: number;
  signal: number;
  histogram: number;
  rsi: number;
  atr?: number;
  atrPercent?: number;
}

export interface SwingPoint {
  index: number;
  type: 'peak' | 'trough';
  price: number;
  macd: number;
  histogram: number;
  rsi: number;
  volume: number;
  timestamp: number;
  dateStr: string;
}

export interface DivergenceSetup {
  id: string;
  symbol: string;
  timeframe: string;
  type: 'BULLISH_TRIPLE' | 'BEARISH_TRIPLE' | 'BULLISH_DOUBLE' | 'BEARISH_DOUBLE';
  qualityScore: number; // 0 - 100%
  points: SwingPoint[]; // 3 points for triple, 2 for double
  currentPrice: number;
  triggerPrice: number; // Breakout trigger / neckline
  stopLoss: number;
  fibLevels: {
    fib0: number;
    fib236: number;
    fib382: number; // Target 1
    fib500: number;
    fib618: number; // Target 2 (Golden pocket)
    fib1000: number; // Target 3 (Full retest)
  };
  targets: {
    tp1: number;
    tp2: number;
    tp3: number;
  };
  riskRewardRatio: number;
  confluenceChecks: {
    priceDivergence: boolean;
    macdDivergence: boolean;
    rsiDivergence: boolean;
    volumeExhaustion: boolean;
    macdCrossConfirmed: boolean;
  };
  scalingTranches: {
    tranche1: string; // 33% at trigger
    tranche2: string; // 33% at retest
    tranche3: string; // 34% at trend confirmation
  };
  detectedAt: number;
}

/**
 * Calculates Exponential Moving Average (EMA)
 */
export function calculateEMA(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const emaArray: number[] = new Array(values.length);

  // Initialize with Simple Moving Average of first 'period' values
  let sum = 0;
  const initialPeriod = Math.min(period, values.length);
  for (let i = 0; i < initialPeriod; i++) {
    sum += values[i];
  }
  let currentEma = sum / initialPeriod;

  for (let i = 0; i < initialPeriod; i++) {
    emaArray[i] = currentEma;
  }

  for (let i = initialPeriod; i < values.length; i++) {
    currentEma = values[i] * k + currentEma * (1 - k);
    emaArray[i] = currentEma;
  }

  return emaArray;
}

/**
 * Calculates RSI (Relative Strength Index)
 */
export function calculateRSI(closes: number[], period: number = 14): number[] {
  if (closes.length <= period) {
    return new Array(closes.length).fill(50);
  }

  const rsi: number[] = new Array(closes.length).fill(50);
  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  rsi[period] = 100 - 100 / (1 + rs);

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const currentGain = diff >= 0 ? diff : 0;
    const currentLoss = diff < 0 ? Math.abs(diff) : 0;

    avgGain = (avgGain * (period - 1) + currentGain) / period;
    avgLoss = (avgLoss * (period - 1) + currentLoss) / period;

    rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi[i] = 100 - 100 / (1 + rs);
  }

  return rsi;
}

/**
 * Calculates Average True Range (ATR)
 * TR = max(high - low, abs(high - prevClose), abs(low - prevClose))
 */
export function calculateATR(candles: Candle[], period: number = 14): number[] {
  if (!candles || candles.length === 0) return [];
  const n = candles.length;
  const tr: number[] = new Array(n);
  tr[0] = Math.max(0.001, candles[0].high - candles[0].low);

  for (let i = 1; i < n; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    tr[i] = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
  }

  const atr: number[] = new Array(n);
  const initialPeriod = Math.min(period, n);
  let sum = 0;
  for (let i = 0; i < initialPeriod; i++) {
    sum += tr[i];
  }
  let currentATR = sum / initialPeriod;
  for (let i = 0; i < initialPeriod; i++) {
    atr[i] = Number(currentATR.toFixed(3));
  }

  for (let i = initialPeriod; i < n; i++) {
    currentATR = (currentATR * (period - 1) + tr[i]) / period;
    atr[i] = Number(currentATR.toFixed(3));
  }

  return atr;
}

export function getLatestVolatilityMetrics(candles: Candle[], period: number = 14): {
  atr: number;
  atrPercent: number;
  isStagnant: boolean;
} {
  if (!candles || candles.length === 0) {
    return { atr: 0, atrPercent: 0, isStagnant: true };
  }
  const atrs = calculateATR(candles, period);
  const lastATR = atrs[atrs.length - 1] || 0;
  const lastClose = Math.max(0.01, candles[candles.length - 1].close);
  const atrPercent = Number(((lastATR / lastClose) * 100).toFixed(2));
  return {
    atr: lastATR,
    atrPercent,
    isStagnant: atrPercent < 1.0,
  };
}

/**
 * Calculates MACD (12, 26, 9) and all indicator points
 */
export function calculateIndicators(
  candles: Candle[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): IndicatorPoint[] {
  if (!candles || candles.length === 0) return [];

  const closes = candles.map((c) => c.close);
  const fastEMA = calculateEMA(closes, fastPeriod);
  const slowEMA = calculateEMA(closes, slowPeriod);

  const macdLine = fastEMA.map((fast, i) => fast - slowEMA[i]);
  const signalLine = calculateEMA(macdLine, signalPeriod);
  const rsi = calculateRSI(closes, 14);
  const atr = calculateATR(candles, 14);

  return candles.map((candle, i) => {
    const curAtr = atr[i] || 0;
    const curClose = Math.max(0.01, candle.close);
    const atrPercent = Number(((curAtr / curClose) * 100).toFixed(2));
    return {
      candle,
      ema12: fastEMA[i],
      ema26: slowEMA[i],
      macd: macdLine[i],
      signal: signalLine[i],
      histogram: macdLine[i] - signalLine[i],
      rsi: rsi[i],
      atr: curAtr,
      atrPercent,
    };
  });
}

/**
 * Finds local swing peaks and troughs in candlestick series
 */
export function findSwingPoints(
  indicatorPoints: IndicatorPoint[],
  lookback: number = 4
): { peaks: SwingPoint[]; troughs: SwingPoint[] } {
  const peaks: SwingPoint[] = [];
  const troughs: SwingPoint[] = [];

  const n = indicatorPoints.length;
  if (n < lookback * 2 + 1) return { peaks, troughs };

  for (let i = lookback; i < n - lookback; i++) {
    const current = indicatorPoints[i];
    const currentHigh = current.candle.high;
    const currentLow = current.candle.low;

    // Check Peak
    let isPeak = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j !== i && indicatorPoints[j].candle.high > currentHigh) {
        isPeak = false;
        break;
      }
    }

    if (isPeak) {
      peaks.push({
        index: i,
        type: 'peak',
        price: currentHigh,
        macd: current.macd,
        histogram: current.histogram,
        rsi: current.rsi,
        volume: current.candle.volume,
        timestamp: current.candle.timestamp,
        dateStr: current.candle.dateStr,
      });
    }

    // Check Trough
    let isTrough = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j !== i && indicatorPoints[j].candle.low < currentLow) {
        isTrough = false;
        break;
      }
    }

    if (isTrough) {
      troughs.push({
        index: i,
        type: 'trough',
        price: currentLow,
        macd: current.macd,
        histogram: current.histogram,
        rsi: current.rsi,
        volume: current.candle.volume,
        timestamp: current.candle.timestamp,
        dateStr: current.candle.dateStr,
      });
    }
  }

  return { peaks, troughs };
}

/**
 * Computes Fibonacci Retracements
 */
export function computeFibonacci(
  low: number,
  high: number,
  direction: 'up' | 'down'
) {
  const diff = high - low;
  if (direction === 'up') {
    // Retracement upwards from low to high
    return {
      fib0: low,
      fib236: low + diff * 0.236,
      fib382: low + diff * 0.382,
      fib500: low + diff * 0.5,
      fib618: low + diff * 0.618,
      fib1000: high,
    };
  } else {
    // Retracement downwards from high to low
    return {
      fib0: high,
      fib236: high - diff * 0.236,
      fib382: high - diff * 0.382,
      fib500: high - diff * 0.5,
      fib618: high - diff * 0.618,
      fib1000: low,
    };
  }
}

/**
 * Detects David Trullàs Triple & Double Divergences
 */
export function detectDivergences(
  symbol: string,
  timeframe: string,
  indicatorPoints: IndicatorPoint[],
  lookback: number = 3
): DivergenceSetup[] {
  if (indicatorPoints.length < 25) return [];

  const { peaks, troughs } = findSwingPoints(indicatorPoints, lookback);
  const setups: DivergenceSetup[] = [];
  const currentPrice = indicatorPoints[indicatorPoints.length - 1].candle.close;
  const lastPoint = indicatorPoints[indicatorPoints.length - 1];

  // 1. Detect Bullish Triple Divergences (3 consecutive troughs)
  if (troughs.length >= 3) {
    for (let i = 2; i < troughs.length; i++) {
      const p1 = troughs[i - 2];
      const p2 = troughs[i - 1];
      const p3 = troughs[i];

      // Criteria: Price prints 3 lower lows (or equal lows with slight variation)
      const priceLowerLows = p1.price >= p2.price && p2.price >= p3.price;
      // MACD line or histogram prints 3 higher lows (Triple Divergence!)
      const macdHigherLows =
        (p1.macd < p2.macd && p2.macd < p3.macd) ||
        (p1.histogram < p2.histogram && p2.histogram < p3.histogram);

      if (priceLowerLows && macdHigherLows) {
        // RSI confirmation
        const rsiDivergence = p1.rsi < p3.rsi;
        // Volume exhaustion (Volume decreasing or low at 3rd point)
        const volumeExhaustion = p3.volume <= p1.volume || p3.volume <= p2.volume;
        // MACD bullish cross confirmation
        const macdCross = lastPoint.macd >= lastPoint.signal;

        let qualityScore = 60; // Base for 3 points
        if (p1.macd < p2.macd && p2.macd < p3.macd) qualityScore += 15;
        if (rsiDivergence) qualityScore += 15;
        if (volumeExhaustion) qualityScore += 10;

        // Find intermediate peak between P1 and P3 for Fibonacci & neckline trigger
        let intermediateHigh = p1.price;
        for (let idx = p1.index; idx <= p3.index; idx++) {
          if (indicatorPoints[idx].candle.high > intermediateHigh) {
            intermediateHigh = indicatorPoints[idx].candle.high;
          }
        }

        const fib = computeFibonacci(p3.price, intermediateHigh, 'up');
        const stopLoss = Number((p3.price * 0.992).toFixed(2)); // Just below trough 3
        const triggerPrice = Number(fib.fib236.toFixed(2));
        const tp1 = Number(fib.fib382.toFixed(2));
        const tp2 = Number(fib.fib618.toFixed(2));
        const tp3 = Number(fib.fib1000.toFixed(2));

        const plannedRisk = Math.max(0.01, Math.abs(triggerPrice - stopLoss));
        const plannedReward = Math.max(0.01, Math.abs(tp2 - triggerPrice));
        const rrr = Number((plannedReward / plannedRisk).toFixed(2));

        setups.push({
          id: `${symbol}-BULL-3-${p3.timestamp}`,
          symbol,
          timeframe,
          type: 'BULLISH_TRIPLE',
          qualityScore: Math.min(100, qualityScore),
          points: [p1, p2, p3],
          currentPrice,
          triggerPrice,
          stopLoss,
          fibLevels: fib,
          targets: { tp1, tp2, tp3 },
          riskRewardRatio: rrr,
          confluenceChecks: {
            priceDivergence: priceLowerLows,
            macdDivergence: macdHigherLows,
            rsiDivergence,
            volumeExhaustion,
            macdCrossConfirmed: macdCross,
          },
          scalingTranches: {
            tranche1: '33% on break of 23.6% Fibonacci / neckline trigger',
            tranche2: '33% on retest pullback holding above Low #3',
            tranche3: '34% on MACD signal line zero-line crossover expansion',
          },
          detectedAt: p3.timestamp,
        });
      }
    }
  }

  // 2. Detect Bearish Triple Divergences (3 consecutive peaks)
  if (peaks.length >= 3) {
    for (let i = 2; i < peaks.length; i++) {
      const p1 = peaks[i - 2];
      const p2 = peaks[i - 1];
      const p3 = peaks[i];

      // Criteria: Price prints 3 higher highs
      const priceHigherHighs = p1.price <= p2.price && p2.price <= p3.price;
      // MACD line or histogram prints 3 lower highs
      const macdLowerHighs =
        (p1.macd > p2.macd && p2.macd > p3.macd) ||
        (p1.histogram > p2.histogram && p2.histogram > p3.histogram);

      if (priceHigherHighs && macdLowerHighs) {
        const rsiDivergence = p1.rsi > p3.rsi;
        const volumeExhaustion = p3.volume <= p1.volume || p3.volume <= p2.volume;
        const macdCross = lastPoint.macd <= lastPoint.signal;

        let qualityScore = 60;
        if (p1.macd > p2.macd && p2.macd > p3.macd) qualityScore += 15;
        if (rsiDivergence) qualityScore += 15;
        if (volumeExhaustion) qualityScore += 10;

        // Intermediate trough between P1 and P3
        let intermediateLow = p1.price;
        for (let idx = p1.index; idx <= p3.index; idx++) {
          if (indicatorPoints[idx].candle.low < intermediateLow) {
            intermediateLow = indicatorPoints[idx].candle.low;
          }
        }

        const fib = computeFibonacci(intermediateLow, p3.price, 'down');
        const stopLoss = Number((p3.price * 1.008).toFixed(2)); // Just above peak 3
        const triggerPrice = Number(fib.fib236.toFixed(2));
        const tp1 = Number(fib.fib382.toFixed(2));
        const tp2 = Number(fib.fib618.toFixed(2));
        const tp3 = Number(fib.fib1000.toFixed(2));

        const plannedRisk = Math.max(0.01, Math.abs(stopLoss - triggerPrice));
        const plannedReward = Math.max(0.01, Math.abs(triggerPrice - tp2));
        const rrr = Number((plannedReward / plannedRisk).toFixed(2));

        setups.push({
          id: `${symbol}-BEAR-3-${p3.timestamp}`,
          symbol,
          timeframe,
          type: 'BEARISH_TRIPLE',
          qualityScore: Math.min(100, qualityScore),
          points: [p1, p2, p3],
          currentPrice,
          triggerPrice,
          stopLoss,
          fibLevels: fib,
          targets: { tp1, tp2, tp3 },
          riskRewardRatio: rrr,
          confluenceChecks: {
            priceDivergence: priceHigherHighs,
            macdDivergence: macdLowerHighs,
            rsiDivergence,
            volumeExhaustion,
            macdCrossConfirmed: macdCross,
          },
          scalingTranches: {
            tranche1: '33% on break down below 23.6% Fib / intermediate support',
            tranche2: '33% on retest pullback rejected under High #3',
            tranche3: '34% on MACD zero-line breakdown confirmation',
          },
          detectedAt: p3.timestamp,
        });
      }
    }
  }

  // 3. Double Divergences across historical series
  if (troughs.length >= 2) {
    for (let i = 1; i < troughs.length; i++) {
      const p1 = troughs[i - 1];
      const p2 = troughs[i];
      // Only if not already part of a triple divergence at p2
      const alreadyInTriple = setups.some(
        (s) => s.points.length === 3 && s.points[2].index === p2.index
      );
      if (!alreadyInTriple && p1.price > p2.price && (p1.macd < p2.macd || p1.histogram < p2.histogram)) {
        let intermediateHigh = p1.price;
        for (let idx = p1.index; idx <= p2.index; idx++) {
          if (indicatorPoints[idx].candle.high > intermediateHigh) {
            intermediateHigh = indicatorPoints[idx].candle.high;
          }
        }
        const fib = computeFibonacci(p2.price, intermediateHigh, 'up');
        setups.push({
          id: `${symbol}-BULL-2-${p2.timestamp}`,
          symbol,
          timeframe,
          type: 'BULLISH_DOUBLE',
          qualityScore: 68,
          points: [p1, p2],
          currentPrice,
          triggerPrice: Number(fib.fib236.toFixed(2)),
          stopLoss: Number((p2.price * 0.993).toFixed(2)),
          fibLevels: fib,
          targets: {
            tp1: Number(fib.fib382.toFixed(2)),
            tp2: Number(fib.fib618.toFixed(2)),
            tp3: Number(fib.fib1000.toFixed(2)),
          },
          riskRewardRatio: 2.1,
          confluenceChecks: {
            priceDivergence: true,
            macdDivergence: true,
            rsiDivergence: p1.rsi < p2.rsi,
            volumeExhaustion: p2.volume <= p1.volume,
            macdCrossConfirmed: lastPoint.macd >= lastPoint.signal,
          },
          scalingTranches: {
            tranche1: '50% on neckline break',
            tranche2: '50% on Fib 38.2% expansion',
            tranche3: 'N/A (Standard double divergence)',
          },
          detectedAt: p2.timestamp,
        });
      }
    }
  }

  if (peaks.length >= 2) {
    for (let i = 1; i < peaks.length; i++) {
      const p1 = peaks[i - 1];
      const p2 = peaks[i];
      const alreadyInTriple = setups.some(
        (s) => s.points.length === 3 && s.points[2].index === p2.index
      );
      if (!alreadyInTriple && p1.price < p2.price && (p1.macd > p2.macd || p1.histogram > p2.histogram)) {
        let intermediateLow = p1.price;
        for (let idx = p1.index; idx <= p2.index; idx++) {
          if (indicatorPoints[idx].candle.low < intermediateLow) {
            intermediateLow = indicatorPoints[idx].candle.low;
          }
        }
        const fib = computeFibonacci(intermediateLow, p2.price, 'down');
        setups.push({
          id: `${symbol}-BEAR-2-${p2.timestamp}`,
          symbol,
          timeframe,
          type: 'BEARISH_DOUBLE',
          qualityScore: 68,
          points: [p1, p2],
          currentPrice,
          triggerPrice: Number(fib.fib236.toFixed(2)),
          stopLoss: Number((p2.price * 1.007).toFixed(2)),
          fibLevels: fib,
          targets: {
            tp1: Number(fib.fib382.toFixed(2)),
            tp2: Number(fib.fib618.toFixed(2)),
            tp3: Number(fib.fib1000.toFixed(2)),
          },
          riskRewardRatio: 2.1,
          confluenceChecks: {
            priceDivergence: true,
            macdDivergence: true,
            rsiDivergence: p1.rsi > p2.rsi,
            volumeExhaustion: p2.volume <= p1.volume,
            macdCrossConfirmed: lastPoint.macd <= lastPoint.signal,
          },
          scalingTranches: {
            tranche1: '50% on neckline break down',
            tranche2: '50% on Fib 38.2% expansion',
            tranche3: 'N/A (Standard double divergence)',
          },
          detectedAt: p2.timestamp,
        });
      }
    }
  }

  return setups;
}
