import { Candle } from './trullasStrategy';

/**
 * LuxAlgo Nadaraya-Watson Envelope (Kernel Regression)
 * Implements non-parametric kernel regression using Gaussian / Rational Quadratic kernels
 * as open-sourced by LuxAlgo (Alex Grover) on TradingView & GitHub.
 */
export interface NadarayaWatsonResult {
  timestamps: number[];
  dates: string[];
  yhat: number[]; // Regression central curve
  upper: number[]; // Upper envelope band
  lower: number[]; // Lower envelope band
  bandwidth: number;
  multiplier: number;
  signals: {
    index: number;
    timestamp: number;
    date: string;
    type: 'BULLISH_REVERSAL' | 'BEARISH_REVERSAL';
    price: number;
    envelopePrice: number;
    description: string;
  }[];
}

/**
 * LuxAlgo Smart Money Concepts (SMC) Structure
 */
export interface OrderBlock {
  id: string;
  type: 'BULLISH_OB' | 'BEARISH_OB';
  topPrice: number;
  bottomPrice: number;
  formedIndex: number;
  timestamp: number;
  dateStr: string;
  volume: number;
  mitigated: boolean;
  mitigatedIndex?: number;
}

export interface FairValueGap {
  id: string;
  type: 'BULLISH_FVG' | 'BEARISH_FVG';
  topPrice: number;
  bottomPrice: number;
  midPrice: number;
  formedIndex: number;
  timestamp: number;
  mitigated: boolean;
  mitigatedIndex?: number;
}

export interface MarketStructureShift {
  index: number;
  timestamp: number;
  type: 'BOS_BULL' | 'BOS_BEAR' | 'CHOCH_BULL' | 'CHOCH_BEAR';
  price: number;
  label: string;
}

export interface SmartMoneyConceptsResult {
  orderBlocks: OrderBlock[];
  activeOrderBlocks: OrderBlock[];
  fairValueGaps: FairValueGap[];
  activeFVGs: FairValueGap[];
  structureShifts: MarketStructureShift[];
  premiumDiscountZone: {
    high: number;
    low: number;
    equilibrium: number;
    currentZone: 'PREMIUM' | 'DISCOUNT' | 'EQUILIBRIUM';
  };
}

/**
 * LuxAlgo Oscillator Matrix Point
 */
export interface OscillatorMatrixPoint {
  timestamp: number;
  date: string;
  fastWave: number; // Hyper-smoothed fast wave
  slowWave: number; // Baseline slow wave
  histogram: number;
  moneyFlow: number; // -100 to +100
  exhaustionLevel: 'OVERBOUGHT' | 'OVERSOLD' | 'NEUTRAL';
  reversalSignal?: 'BUY' | 'SELL';
}

/**
 * LuxAlgo + Trullàs Divergence Confluence Summary
 */
export interface LuxAlgoConfluenceReport {
  symbol: string;
  nwePosition: 'AT_LOWER_BAND' | 'AT_UPPER_BAND' | 'INSIDE_CHANNEL';
  nweDistancePct: number;
  nearestOrderBlock: OrderBlock | null;
  nearestFVG: FairValueGap | null;
  smcZone: 'PREMIUM' | 'DISCOUNT' | 'EQUILIBRIUM';
  oscillatorState: 'OVERBOUGHT' | 'OVERSOLD' | 'NEUTRAL';
  confluenceScore: number; // 0 - 100%
  confluenceFactors: string[];
}

/**
 * 1. Compute Nadaraya-Watson Envelope (NWE)
 * @param candles Historical candle series
 * @param h Kernel bandwidth (lookback smoothing window, default 8.0)
 * @param mult Volatility envelope multiplier (default 2.5)
 */
export function calculateNadarayaWatsonEnvelope(
  candles: Candle[],
  h: number = 8.0,
  mult: number = 2.5
): NadarayaWatsonResult {
  const n = candles.length;
  if (n < 5) {
    return {
      timestamps: [],
      dates: [],
      yhat: [],
      upper: [],
      lower: [],
      bandwidth: h,
      multiplier: mult,
      signals: [],
    };
  }

  const timestamps = candles.map((c) => c.timestamp);
  const dates = candles.map((c) => c.dateStr);
  const closes = candles.map((c) => c.close);
  const yhat: number[] = new Array(n).fill(0);
  const upper: number[] = new Array(n).fill(0);
  const lower: number[] = new Array(n).fill(0);

  // Pre-calculate weights for Rational Quadratic / Gaussian Kernel
  // Gaussian Kernel: K(u) = exp(-0.5 * (u/h)^2)
  const windowSize = Math.min(n, Math.max(10, Math.floor(h * 3.5)));
  const kernelWeights = new Float64Array(windowSize);
  for (let d = 0; d < windowSize; d++) {
    const u = d / h;
    kernelWeights[d] = Math.exp(-0.5 * u * u);
  }

  // Calculate kernel regression yhat
  for (let i = 0; i < n; i++) {
    let sumWeight = 0;
    let sumWeightedPrice = 0;
    const maxLookback = Math.min(i, windowSize - 1);

    for (let d = 0; d <= maxLookback; d++) {
      const w = kernelWeights[d];
      sumWeight += w;
      sumWeightedPrice += closes[i - d] * w;
    }

    yhat[i] = sumWeight > 0 ? Number((sumWeightedPrice / sumWeight).toFixed(2)) : closes[i];
  }

  // Compute dynamic mean absolute deviation envelope
  // In LuxAlgo TV script, envelope uses MA of absolute error: mae = sma(abs(close - yhat), window) * mult
  const errors = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    errors[i] = Math.abs(closes[i] - yhat[i]);
  }

  const envelopeLookback = Math.min(n, 20);
  for (let i = 0; i < n; i++) {
    const start = Math.max(0, i - envelopeLookback + 1);
    const count = i - start + 1;
    let sumErr = 0;
    for (let k = start; k <= i; k++) {
      sumErr += errors[k];
    }
    const mae = count > 0 ? sumErr / count : errors[i];
    const bandWidth = Number((mae * mult).toFixed(2));
    upper[i] = Number((yhat[i] + bandWidth).toFixed(2));
    lower[i] = Number((yhat[i] - bandWidth).toFixed(2));
  }

  // Detect Envelope Reversal Signals
  const signals: NadarayaWatsonResult['signals'] = [];
  for (let i = 2; i < n; i++) {
    const curr = candles[i];
    const prev = candles[i - 1];

    // Bullish Reversal: Previous low breached lower band, current close bounces back above
    if (prev.low <= lower[i - 1] && curr.close > lower[i] && curr.close > curr.open) {
      signals.push({
        index: i,
        timestamp: curr.timestamp,
        date: curr.dateStr,
        type: 'BULLISH_REVERSAL',
        price: curr.close,
        envelopePrice: lower[i],
        description: `LuxAlgo NWE Bullish Mean Reversion from $${lower[i]} lower band`,
      });
    }

    // Bearish Reversal: Previous high breached upper band, current close rejects back below
    if (prev.high >= upper[i - 1] && curr.close < upper[i] && curr.close < curr.open) {
      signals.push({
        index: i,
        timestamp: curr.timestamp,
        date: curr.dateStr,
        type: 'BEARISH_REVERSAL',
        price: curr.close,
        envelopePrice: upper[i],
        description: `LuxAlgo NWE Bearish Mean Reversion from $${upper[i]} upper band`,
      });
    }
  }

  return {
    timestamps,
    dates,
    yhat,
    upper,
    lower,
    bandwidth: h,
    multiplier: mult,
    signals,
  };
}

/**
 * 2. Compute LuxAlgo Smart Money Concepts (Order Blocks, FVGs, Structure)
 */
export function calculateSmartMoneyConcepts(candles: Candle[]): SmartMoneyConceptsResult {
  const n = candles.length;
  if (n < 10) {
    return {
      orderBlocks: [],
      activeOrderBlocks: [],
      fairValueGaps: [],
      activeFVGs: [],
      structureShifts: [],
      premiumDiscountZone: { high: 0, low: 0, equilibrium: 0, currentZone: 'EQUILIBRIUM' },
    };
  }

  const orderBlocks: OrderBlock[] = [];
  const fairValueGaps: FairValueGap[] = [];
  const structureShifts: MarketStructureShift[] = [];

  // Swing detection for BOS / CHoCH
  let lastSwingHigh = { price: 0, index: -1 };
  let lastSwingLow = { price: Infinity, index: -1 };
  let currentTrend: 'BULL' | 'BEAR' = 'BULL';

  // Find Fair Value Gaps (FVG)
  // Bullish FVG: Low of candle[i] > High of candle[i-2]
  // Bearish FVG: High of candle[i] < Low of candle[i-2]
  for (let i = 2; i < n; i++) {
    const c0 = candles[i - 2];
    const c1 = candles[i - 1];
    const c2 = candles[i];

    // Bullish FVG (Imbalance between bar 0 high and bar 2 low)
    if (c2.low > c0.high && c1.close > c1.open) {
      fairValueGaps.push({
        id: `fvg-bull-${i}`,
        type: 'BULLISH_FVG',
        topPrice: c2.low,
        bottomPrice: c0.high,
        midPrice: Number(((c2.low + c0.high) / 2).toFixed(2)),
        formedIndex: i - 1,
        timestamp: c1.timestamp,
        mitigated: false,
      });
    }

    // Bearish FVG (Imbalance between bar 0 low and bar 2 high)
    if (c2.high < c0.low && c1.close < c1.open) {
      fairValueGaps.push({
        id: `fvg-bear-${i}`,
        type: 'BEARISH_FVG',
        topPrice: c0.low,
        bottomPrice: c2.high,
        midPrice: Number(((c0.low + c2.high) / 2).toFixed(2)),
        formedIndex: i - 1,
        timestamp: c1.timestamp,
        mitigated: false,
      });
    }

    // Institutional Order Block Detection
    // Bullish OB: Last down candle before an explosive move that breaks previous high
    if (i >= 3) {
      const impulse = (c2.close - c1.open) / c1.open;
      if (impulse > 0.015 && c0.close < c0.open) {
        orderBlocks.push({
          id: `ob-bull-${i - 2}`,
          type: 'BULLISH_OB',
          topPrice: Math.max(c0.open, c0.close),
          bottomPrice: c0.low,
          formedIndex: i - 2,
          timestamp: c0.timestamp,
          dateStr: c0.dateStr,
          volume: c0.volume,
          mitigated: false,
        });
      }

      // Bearish OB: Last up candle before an explosive drop
      const impulseDrop = (c1.open - c2.close) / c1.open;
      if (impulseDrop > 0.015 && c0.close > c0.open) {
        orderBlocks.push({
          id: `ob-bear-${i - 2}`,
          type: 'BEARISH_OB',
          topPrice: c0.high,
          bottomPrice: Math.min(c0.open, c0.close),
          formedIndex: i - 2,
          timestamp: c0.timestamp,
          dateStr: c0.dateStr,
          volume: c0.volume,
          mitigated: false,
        });
      }
    }
  }

  // Check mitigation of Order Blocks & FVGs by subsequent price action
  for (let i = 0; i < n; i++) {
    const candle = candles[i];

    // Mitigate Order Blocks
    for (const ob of orderBlocks) {
      if (!ob.mitigated && i > ob.formedIndex + 1) {
        if (ob.type === 'BULLISH_OB' && candle.low <= ob.topPrice) {
          ob.mitigated = true;
          ob.mitigatedIndex = i;
        } else if (ob.type === 'BEARISH_OB' && candle.high >= ob.bottomPrice) {
          ob.mitigated = true;
          ob.mitigatedIndex = i;
        }
      }
    }

    // Mitigate FVGs
    for (const fvg of fairValueGaps) {
      if (!fvg.mitigated && i > fvg.formedIndex + 1) {
        if (fvg.type === 'BULLISH_FVG' && candle.low <= fvg.bottomPrice) {
          fvg.mitigated = true;
          fvg.mitigatedIndex = i;
        } else if (fvg.type === 'BEARISH_FVG' && candle.high >= fvg.topPrice) {
          fvg.mitigated = true;
          fvg.mitigatedIndex = i;
        }
      }
    }
  }

  // Detect Swing Highs / Lows and Structure Shifts (BOS / CHoCH)
  for (let i = 3; i < n - 3; i++) {
    const mid = candles[i];
    const isPeak =
      mid.high > candles[i - 1].high &&
      mid.high > candles[i - 2].high &&
      mid.high > candles[i + 1].high &&
      mid.high > candles[i + 2].high;

    const isTrough =
      mid.low < candles[i - 1].low &&
      mid.low < candles[i - 2].low &&
      mid.low < candles[i + 1].low &&
      mid.low < candles[i + 2].low;

    if (isPeak) {
      if (lastSwingHigh.price > 0 && mid.high > lastSwingHigh.price) {
        structureShifts.push({
          index: i,
          timestamp: mid.timestamp,
          type: currentTrend === 'BULL' ? 'BOS_BULL' : 'CHOCH_BULL',
          price: mid.high,
          label: currentTrend === 'BULL' ? 'BOS (Bullish)' : 'CHoCH (Bull Reversal)',
        });
        currentTrend = 'BULL';
      }
      lastSwingHigh = { price: mid.high, index: i };
    }

    if (isTrough) {
      if (lastSwingLow.price < Infinity && mid.low < lastSwingLow.price) {
        structureShifts.push({
          index: i,
          timestamp: mid.timestamp,
          type: currentTrend === 'BEAR' ? 'BOS_BEAR' : 'CHOCH_BEAR',
          price: mid.low,
          label: currentTrend === 'BEAR' ? 'BOS (Bearish)' : 'CHoCH (Bear Reversal)',
        });
        currentTrend = 'BEAR';
      }
      lastSwingLow = { price: mid.low, index: i };
    }
  }

  // Premium / Discount Zone based on recent range (last 50 candles)
  const recentRange = candles.slice(-50);
  const rangeHigh = Math.max(...recentRange.map((c) => c.high));
  const rangeLow = Math.min(...recentRange.map((c) => c.low));
  const equilibrium = Number(((rangeHigh + rangeLow) / 2).toFixed(2));
  const lastClose = candles[n - 1].close;

  let currentZone: 'PREMIUM' | 'DISCOUNT' | 'EQUILIBRIUM' = 'EQUILIBRIUM';
  if (lastClose > equilibrium + (rangeHigh - equilibrium) * 0.1) {
    currentZone = 'PREMIUM';
  } else if (lastClose < equilibrium - (equilibrium - rangeLow) * 0.1) {
    currentZone = 'DISCOUNT';
  }

  return {
    orderBlocks: orderBlocks.slice(-15),
    activeOrderBlocks: orderBlocks.filter((ob) => !ob.mitigated).slice(-8),
    fairValueGaps: fairValueGaps.slice(-20),
    activeFVGs: fairValueGaps.filter((f) => !f.mitigated).slice(-8),
    structureShifts: structureShifts.slice(-10),
    premiumDiscountZone: {
      high: rangeHigh,
      low: rangeLow,
      equilibrium,
      currentZone,
    },
  };
}

/**
 * 3. LuxAlgo Multi-Scale Oscillator Matrix
 */
export function calculateLuxAlgoOscillatorMatrix(candles: Candle[]): OscillatorMatrixPoint[] {
  const n = candles.length;
  if (n < 14) return [];

  // EMA helper
  const calcEMA = (data: number[], period: number) => {
    const k = 2 / (period + 1);
    const ema = new Float64Array(data.length);
    ema[0] = data[0];
    for (let i = 1; i < data.length; i++) {
      ema[i] = data[i] * k + ema[i - 1] * (1 - k);
    }
    return ema;
  };

  const closes = candles.map((c) => c.close);
  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);
  const rawMacd = closes.map((_, i) => ema12[i] - ema26[i]);
  const signal = calcEMA(Array.from(rawMacd), 9);
  const hist = rawMacd.map((m, i) => m - signal[i]);

  // Money Flow Index estimate
  const mfiRaw = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    const typPrice = (candles[i].high + candles[i].low + candles[i].close) / 3;
    const prevTyp = (candles[i - 1].high + candles[i - 1].low + candles[i - 1].close) / 3;
    const rawFlow = typPrice * candles[i].volume;
    mfiRaw[i] = typPrice > prevTyp ? rawFlow : -rawFlow;
  }
  const smoothedMFI = calcEMA(Array.from(mfiRaw), 14);

  const results: OscillatorMatrixPoint[] = [];

  for (let i = 0; i < n; i++) {
    const fastWave = Number((hist[i] * 1.5).toFixed(3));
    const slowWave = Number(rawMacd[i].toFixed(3));
    const histVal = Number(hist[i].toFixed(3));
    const normMfi = Math.max(-100, Math.min(100, Math.round(smoothedMFI[i] / 1e6)));

    let exhaustionLevel: 'OVERBOUGHT' | 'OVERSOLD' | 'NEUTRAL' = 'NEUTRAL';
    if (fastWave > 2.0 && histVal > 0) exhaustionLevel = 'OVERBOUGHT';
    if (fastWave < -2.0 && histVal < 0) exhaustionLevel = 'OVERSOLD';

    let reversalSignal: 'BUY' | 'SELL' | undefined = undefined;
    if (i > 1) {
      if (hist[i] > hist[i - 1] && hist[i - 1] <= hist[i - 2] && fastWave < -1.0) {
        reversalSignal = 'BUY';
      } else if (hist[i] < hist[i - 1] && hist[i - 1] >= hist[i - 2] && fastWave > 1.0) {
        reversalSignal = 'SELL';
      }
    }

    results.push({
      timestamp: candles[i].timestamp,
      date: candles[i].dateStr,
      fastWave,
      slowWave,
      histogram: histVal,
      moneyFlow: normMfi,
      exhaustionLevel,
      reversalSignal,
    });
  }

  return results;
}

/**
 * 4. Calculate Confluence between Trullàs Divergences and LuxAlgo SMC / NWE Indicators
 */
export function calculateLuxAlgoConfluence(
  symbol: string,
  candles: Candle[],
  divergenceType: string
): LuxAlgoConfluenceReport {
  const nwe = calculateNadarayaWatsonEnvelope(candles, 8.0, 2.5);
  const smc = calculateSmartMoneyConcepts(candles);
  const osc = calculateLuxAlgoOscillatorMatrix(candles);

  const lastCandle = candles[candles.length - 1];
  const lastNweUpper = nwe.upper[nwe.upper.length - 1] || lastCandle.close;
  const lastNweLower = nwe.lower[nwe.lower.length - 1] || lastCandle.close;
  const lastNweMid = nwe.yhat[nwe.yhat.length - 1] || lastCandle.close;

  // NWE proximity
  let nwePosition: 'AT_LOWER_BAND' | 'AT_UPPER_BAND' | 'INSIDE_CHANNEL' = 'INSIDE_CHANNEL';
  const distToLowerPct = Math.abs((lastCandle.close - lastNweLower) / lastCandle.close) * 100;
  const distToUpperPct = Math.abs((lastCandle.close - lastNweUpper) / lastCandle.close) * 100;

  if (lastCandle.close <= lastNweLower * 1.01 || distToLowerPct < 0.8) {
    nwePosition = 'AT_LOWER_BAND';
  } else if (lastCandle.close >= lastNweUpper * 0.99 || distToUpperPct < 0.8) {
    nwePosition = 'AT_UPPER_BAND';
  }

  // Find nearest active Order Block
  let nearestOB: OrderBlock | null = null;
  let minOBDist = Infinity;
  for (const ob of smc.activeOrderBlocks) {
    const dist = Math.abs(lastCandle.close - (ob.topPrice + ob.bottomPrice) / 2);
    if (dist < minOBDist) {
      minOBDist = dist;
      nearestOB = ob;
    }
  }

  // Find nearest active FVG
  let nearestFVG: FairValueGap | null = null;
  let minFVGDist = Infinity;
  for (const fvg of smc.activeFVGs) {
    const dist = Math.abs(lastCandle.close - fvg.midPrice);
    if (dist < minFVGDist) {
      minFVGDist = dist;
      nearestFVG = fvg;
    }
  }

  const lastOsc = osc[osc.length - 1] || { exhaustionLevel: 'NEUTRAL' };
  const isBull = divergenceType.toUpperCase().includes('BULL');

  // Compute Confluence Score
  let score = 50;
  const factors: string[] = [];

  // NWE alignment
  if (isBull && nwePosition === 'AT_LOWER_BAND') {
    score += 20;
    factors.push('LuxAlgo NWE: Rebound from oversold regression envelope bottom');
  } else if (!isBull && nwePosition === 'AT_UPPER_BAND') {
    score += 20;
    factors.push('LuxAlgo NWE: Exhaustion rejection at overbought regression envelope top');
  }

  // SMC Order Block alignment
  if (nearestOB) {
    if (isBull && nearestOB.type === 'BULLISH_OB') {
      score += 15;
      factors.push(`LuxAlgo SMC: Bouncing from institutional demand Order Block ($${nearestOB.bottomPrice.toFixed(2)} - $${nearestOB.topPrice.toFixed(2)})`);
    } else if (!isBull && nearestOB.type === 'BEARISH_OB') {
      score += 15;
      factors.push(`LuxAlgo SMC: Rejecting institutional supply Order Block ($${nearestOB.bottomPrice.toFixed(2)} - $${nearestOB.topPrice.toFixed(2)})`);
    }
  }

  // Premium / Discount alignment
  if (isBull && smc.premiumDiscountZone.currentZone === 'DISCOUNT') {
    score += 10;
    factors.push('LuxAlgo SMC: Located in institutional Discount Accumulation zone');
  } else if (!isBull && smc.premiumDiscountZone.currentZone === 'PREMIUM') {
    score += 10;
    factors.push('LuxAlgo SMC: Located in institutional Premium Distribution zone');
  }

  // Oscillator Matrix exhaustion
  if (isBull && lastOsc.exhaustionLevel === 'OVERSOLD') {
    score += 10;
    factors.push('LuxAlgo Matrix: Multi-oscillator exhaustion wave confirmed');
  } else if (!isBull && lastOsc.exhaustionLevel === 'OVERBOUGHT') {
    score += 10;
    factors.push('LuxAlgo Matrix: Multi-oscillator overbought peak confirmed');
  }

  return {
    symbol,
    nwePosition,
    nweDistancePct: Number((nwePosition === 'AT_LOWER_BAND' ? distToLowerPct : distToUpperPct).toFixed(2)),
    nearestOrderBlock: nearestOB,
    nearestFVG,
    smcZone: smc.premiumDiscountZone.currentZone,
    oscillatorState: lastOsc.exhaustionLevel,
    confluenceScore: Math.min(100, score),
    confluenceFactors: factors,
  };
}
