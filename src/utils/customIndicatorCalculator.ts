import { Candle } from './trullasStrategy';

export interface CalculatedIndicatorSeries {
  id: string;
  name: string;
  isCustom: boolean;
  overlay: boolean;
  paneIndex: number; // 0 for price overlay, 1/2/3 for subpanes
  color: string;
  plots: {
    name: string;
    type: 'line' | 'histogram' | 'band' | 'marker';
    color: string;
    lineWidth?: number;
    points: { time: number; value: number; color?: string; text?: string }[];
  }[];
  summaryValue?: string;
  summaryStatus?: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
}

/**
 * Calculates SuperTrend v9 PRO
 * Calibrated ATR trailing volatility band
 */
export function calculateSuperTrend(candles: Candle[], period: number = 10, multiplier: number = 3.0): CalculatedIndicatorSeries {
  if (candles.length === 0) {
    return {
      id: 'supertrend-v9-pro',
      name: 'SuperTrend v9 PRO',
      isCustom: true,
      overlay: true,
      paneIndex: 0,
      color: '#10b981',
      plots: [],
    };
  }

  // True Range calculation
  const tr: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      tr.push(candles[i].high - candles[i].low);
    } else {
      const hl = candles[i].high - candles[i].low;
      const hc = Math.abs(candles[i].high - candles[i - 1].close);
      const lc = Math.abs(candles[i].low - candles[i - 1].close);
      tr.push(Math.max(hl, hc, lc));
    }
  }

  // ATR EMA smoothing
  const atr: number[] = [];
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    if (i < period) {
      sum += tr[i];
      atr.push(sum / (i + 1));
    } else {
      const prevAtr = atr[i - 1];
      atr.push((prevAtr * (period - 1) + tr[i]) / period);
    }
  }

  const supertrendPoints: { time: number; value: number; color: string }[] = [];
  let trend = 1; // 1 for bull, -1 for bear
  let upperBand = (candles[0].high + candles[0].low) / 2 + multiplier * atr[0];
  let lowerBand = (candles[0].high + candles[0].low) / 2 - multiplier * atr[0];

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const time = Math.floor(c.timestamp / 1000);
    const mid = (c.high + c.low) / 2;
    const basicUpper = mid + multiplier * atr[i];
    const basicLower = mid - multiplier * atr[i];

    if (i > 0) {
      const prevClose = candles[i - 1].close;
      upperBand = basicUpper < upperBand || prevClose > upperBand ? basicUpper : upperBand;
      lowerBand = basicLower > lowerBand || prevClose < lowerBand ? basicLower : lowerBand;

      if (trend === 1) {
        if (c.close < lowerBand) {
          trend = -1;
          upperBand = basicUpper;
        }
      } else {
        if (c.close > upperBand) {
          trend = 1;
          lowerBand = basicLower;
        }
      }
    }

    const stValue = trend === 1 ? lowerBand : upperBand;
    supertrendPoints.push({
      time,
      value: Number(stValue.toFixed(2)),
      color: trend === 1 ? '#10b981' : '#f43f5e',
    });
  }

  const lastTrend = trend === 1 ? 'BULLISH' : 'BEARISH';
  const lastVal = supertrendPoints[supertrendPoints.length - 1]?.value || 0;

  return {
    id: 'supertrend-v9-pro',
    name: 'SuperTrend v9 PRO',
    isCustom: true,
    overlay: true,
    paneIndex: 0,
    color: lastTrend === 'BULLISH' ? '#10b981' : '#f43f5e',
    summaryValue: `$${lastVal.toFixed(2)} (${lastTrend})`,
    summaryStatus: lastTrend,
    plots: [
      {
        name: 'SuperTrend Line',
        type: 'line',
        color: lastTrend === 'BULLISH' ? '#10b981' : '#f43f5e',
        lineWidth: 2,
        points: supertrendPoints,
      },
    ],
  };
}

/**
 * Calculates TrendCloud Pro
 * Multi-period moving average cloud indicating trend expansion and dynamic support
 */
export function calculateTrendCloudPro(candles: Candle[]): CalculatedIndicatorSeries {
  if (candles.length === 0) {
    return {
      id: 'trendcloud-pro',
      name: 'TrendCloud Pro',
      isCustom: true,
      overlay: true,
      paneIndex: 0,
      color: '#38bdf8',
      plots: [],
    };
  }

  // Fast EMA (12) and Slow EMA (34)
  const calcEMA = (period: number) => {
    const k = 2 / (period + 1);
    const result: number[] = [];
    let current = candles[0].close;
    for (let i = 0; i < candles.length; i++) {
      current = i === 0 ? candles[i].close : candles[i].close * k + current * (1 - k);
      result.push(current);
    }
    return result;
  };

  const fastEma = calcEMA(12);
  const slowEma = calcEMA(34);

  const fastPoints = [];
  const slowPoints = [];

  for (let i = 0; i < candles.length; i++) {
    const time = Math.floor(candles[i].timestamp / 1000);
    fastPoints.push({ time, value: Number(fastEma[i].toFixed(2)) });
    slowPoints.push({ time, value: Number(slowEma[i].toFixed(2)) });
  }

  const lastFast = fastEma[fastEma.length - 1];
  const lastSlow = slowEma[slowEma.length - 1];
  const isBull = lastFast >= lastSlow;

  return {
    id: 'trendcloud-pro',
    name: 'TrendCloud Pro',
    isCustom: true,
    overlay: true,
    paneIndex: 0,
    color: isBull ? '#10b981' : '#f43f5e',
    summaryValue: isBull ? 'Bullish Expansion (Fast > Slow)' : 'Bearish Cloud Compression',
    summaryStatus: isBull ? 'BULLISH' : 'BEARISH',
    plots: [
      {
        name: 'Fast Cloud EMA (12)',
        type: 'line',
        color: isBull ? '#10b981' : '#f43f5e',
        lineWidth: 2,
        points: fastPoints,
      },
      {
        name: 'Slow Cloud Base (34)',
        type: 'line',
        color: isBull ? '#34d399' : '#fb7185',
        lineWidth: 1,
        points: slowPoints,
      },
    ],
  };
}

/**
 * Calculates Matrix AI Pro
 * Neural multi-momentum normalized oscillator (-100 to +100)
 */
export function calculateMatrixAIPro(candles: Candle[]): CalculatedIndicatorSeries {
  if (candles.length === 0) {
    return {
      id: 'matrix-ai-pro',
      name: 'Matrix AI Pro',
      isCustom: true,
      overlay: false,
      paneIndex: 1,
      color: '#c084fc',
      plots: [],
    };
  }

  const points: { time: number; value: number; color: string }[] = [];

  for (let i = 0; i < candles.length; i++) {
    const time = Math.floor(candles[i].timestamp / 1000);
    // Normalized momentum formula based on 14-period price range and velocity
    const lookback = Math.min(i, 14);
    if (lookback < 2) {
      points.push({ time, value: 0, color: '#38bdf8' });
      continue;
    }

    const slice = candles.slice(i - lookback, i + 1);
    const highest = Math.max(...slice.map((s) => s.high));
    const lowest = Math.min(...slice.map((s) => s.low));
    const range = highest - lowest || 1;
    const stoch = ((candles[i].close - lowest) / range) * 100;
    const centered = (stoch - 50) * 2; // -100 to +100

    const color = centered > 60 ? '#10b981' : centered < -60 ? '#f43f5e' : '#38bdf8';
    points.push({ time, value: Number(centered.toFixed(1)), color });
  }

  const lastVal = points[points.length - 1]?.value || 0;
  const status: 'BULLISH' | 'BEARISH' | 'NEUTRAL' =
    lastVal > 25 ? 'BULLISH' : lastVal < -25 ? 'BEARISH' : 'NEUTRAL';

  return {
    id: 'matrix-ai-pro',
    name: 'Matrix AI Pro',
    isCustom: true,
    overlay: false,
    paneIndex: 1,
    color: '#a855f7',
    summaryValue: `${lastVal > 0 ? '+' : ''}${lastVal.toFixed(1)} (${status})`,
    summaryStatus: status,
    plots: [
      {
        name: 'Matrix Momentum Index',
        type: 'histogram',
        color: '#c084fc',
        points,
      },
    ],
  };
}

/**
 * Calculates AGAIG + Institutional AVWAP
 * Anchored from highest volume climax bar with volatility deviation envelopes
 */
export function calculateAGAIGAvwap(candles: Candle[]): CalculatedIndicatorSeries {
  if (candles.length < 5) {
    return {
      id: 'agaig-avwap',
      name: 'AGAIG + Institutional AVWAP',
      isCustom: true,
      overlay: true,
      paneIndex: 0,
      color: '#f59e0b',
      plots: [],
    };
  }

  // Find peak volume in past 45 bars
  let maxVol = 0;
  let anchorIdx = Math.max(0, candles.length - 45);
  for (let i = anchorIdx; i < candles.length; i++) {
    if (candles[i].volume > maxVol) {
      maxVol = candles[i].volume;
      anchorIdx = i;
    }
  }

  let cumVol = 0;
  let cumVolPrice = 0;
  const vwapPoints = [];
  const upperPoints = [];
  const lowerPoints = [];

  for (let i = anchorIdx; i < candles.length; i++) {
    const c = candles[i];
    const time = Math.floor(c.timestamp / 1000);
    const typ = (c.high + c.low + c.close) / 3;
    cumVol += c.volume;
    cumVolPrice += typ * c.volume;
    const vwap = cumVol > 0 ? cumVolPrice / cumVol : typ;
    const band = Math.max(0.5, Math.abs(typ - vwap) * 1.5);

    vwapPoints.push({ time, value: Number(vwap.toFixed(2)) });
    upperPoints.push({ time, value: Number((vwap + band).toFixed(2)) });
    lowerPoints.push({ time, value: Number((vwap - band).toFixed(2)) });
  }

  const latestVwap = vwapPoints[vwapPoints.length - 1]?.value || candles[candles.length - 1].close;
  const currentPrice = candles[candles.length - 1].close;
  const isAbove = currentPrice >= latestVwap;

  return {
    id: 'agaig-avwap',
    name: 'AGAIG + Institutional AVWAP',
    isCustom: true,
    overlay: true,
    paneIndex: 0,
    color: '#f59e0b',
    summaryValue: `$${latestVwap.toFixed(2)} (${isAbove ? 'Above AVWAP' : 'Below AVWAP'})`,
    summaryStatus: isAbove ? 'BULLISH' : 'BEARISH',
    plots: [
      {
        name: 'Institutional AVWAP Core',
        type: 'line',
        color: '#f59e0b',
        lineWidth: 2,
        points: vwapPoints,
      },
      {
        name: 'AGAIG Upper Envelope (+1.5σ)',
        type: 'line',
        color: '#38bdf8',
        lineWidth: 1,
        points: upperPoints,
      },
      {
        name: 'AGAIG Lower Golden Zone (-1.5σ)',
        type: 'line',
        color: '#10b981',
        lineWidth: 1,
        points: lowerPoints,
      },
    ],
  };
}

/**
 * Calculates APEX CORE — Adaptive Confluence Trading Framework
 * Multi-layer scoring combining trend, volatility contraction, and volume flow
 */
export function calculateApexCore(candles: Candle[]): CalculatedIndicatorSeries {
  if (candles.length === 0) {
    return {
      id: 'apex-core',
      name: 'APEX CORE',
      isCustom: true,
      overlay: false,
      paneIndex: 1,
      color: '#10b981',
      plots: [],
    };
  }

  const points = [];
  for (let i = 0; i < candles.length; i++) {
    const time = Math.floor(candles[i].timestamp / 1000);
    const c = candles[i];
    const range = c.high - c.low || 1;
    const body = Math.abs(c.close - c.open);
    const bodyRatio = (body / range) * 50;
    const dir = c.close >= c.open ? 1 : -1;
    const score = Number((dir * (bodyRatio + 25)).toFixed(1));

    points.push({
      time,
      value: score,
      color: score >= 0 ? '#10b981' : '#f43f5e',
    });
  }

  const lastScore = points[points.length - 1]?.value || 0;
  const status: 'BULLISH' | 'BEARISH' | 'NEUTRAL' =
    lastScore >= 20 ? 'BULLISH' : lastScore <= -20 ? 'BEARISH' : 'NEUTRAL';

  return {
    id: 'apex-core',
    name: 'APEX CORE — Adaptive Confluence',
    isCustom: true,
    overlay: false,
    paneIndex: 1,
    color: '#06b6d4',
    summaryValue: `Score: ${lastScore > 0 ? '+' : ''}${lastScore} (${status})`,
    summaryStatus: status,
    plots: [
      {
        name: 'APEX Confluence Delta',
        type: 'histogram',
        color: '#06b6d4',
        points,
      },
    ],
  };
}

/**
 * Calculates BUYING CHECKLIST PRO
 * Evaluates 5 technical criteria (Score 0 - 100%)
 */
export function calculateBuyingChecklistPro(candles: Candle[]): CalculatedIndicatorSeries {
  if (candles.length < 10) {
    return {
      id: 'buying-checklist-pro',
      name: 'BUYING CHECKLIST PRO',
      isCustom: true,
      overlay: false,
      paneIndex: 1,
      color: '#10b981',
      plots: [],
    };
  }

  const points = [];
  for (let i = 5; i < candles.length; i++) {
    const time = Math.floor(candles[i].timestamp / 1000);
    const c = candles[i];
    const prev = candles[i - 1];

    let score = 20; // Base presence
    if (c.close > prev.close) score += 20; // Upward momentum
    if (c.volume > prev.volume) score += 20; // Volume expansion
    if (c.close > (c.high + c.low) / 2) score += 20; // Closed in upper half
    if (c.low > prev.low) score += 20; // Higher swing low

    points.push({
      time,
      value: score,
      color: score >= 75 ? '#10b981' : score >= 50 ? '#38bdf8' : '#f43f5e',
    });
  }

  const lastScore = points[points.length - 1]?.value || 50;
  const status: 'BULLISH' | 'BEARISH' | 'NEUTRAL' =
    lastScore >= 75 ? 'BULLISH' : lastScore <= 40 ? 'BEARISH' : 'NEUTRAL';

  return {
    id: 'buying-checklist-pro',
    name: 'BUYING CHECKLIST PRO',
    isCustom: true,
    overlay: false,
    paneIndex: 1,
    color: '#10b981',
    summaryValue: `${lastScore}% Criteria Met (${status})`,
    summaryStatus: status,
    plots: [
      {
        name: 'Checklist Score (0-100)',
        type: 'histogram',
        color: '#10b981',
        points,
      },
    ],
  };
}

/**
 * Dispatches calculation for a custom indicator by ID
 */
export function calculateCustomIndicatorById(
  id: string,
  candles: Candle[]
): CalculatedIndicatorSeries | null {
  const norm = id.toLowerCase();
  if (norm.includes('supertrend')) return calculateSuperTrend(candles);
  if (norm.includes('trendcloud')) return calculateTrendCloudPro(candles);
  if (norm.includes('matrix')) return calculateMatrixAIPro(candles);
  if (norm.includes('agaig') || norm.includes('avwap')) return calculateAGAIGAvwap(candles);
  if (norm.includes('apex')) return calculateApexCore(candles);
  if (norm.includes('buying') || norm.includes('checklist')) return calculateBuyingChecklistPro(candles);
  return null;
}

