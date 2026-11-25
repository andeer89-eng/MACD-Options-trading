/**
 * TOS Indicators Multi-Scan Engine (OHLCV Deterministic Implementations)
 * Faithful, real-data implementations of setups from tosindicators.com/scans:
 *  1. TTM_SQUEEZE      — Bollinger Bands(20,2) inside Keltner Channels(20,1.5*ATR) for 5+ dots or fresh fire + Stacked EMA check
 *  2. FALSE_BREAKOUT   — 20-bar Pivot Sweep (Highest(high[1],20) / Lowest(low[1],20) pierce & reject close + volume >= avg)
 *  3. STACKED_EMA      — Stacked Moving Averages (EMA 8 / 21 / 34 / 55 / 89 alignment + fresh alignment / 21-EMA pullback)
 *  4. UNUSUAL_VOLUME   — RelativeVolumeStDev(50) >= 2.0σ OR 3-bar consecutive rising above-average volume
 *  5. VSCORE_VWAP      — Rolling 50-bar VWAP Z-Score extremes (|z| >= 1.5σ) & pullback-to-mean reversion
 *  6. SMA50_REVERSION  — 50-Day SMA rubber-band stretch (6%–15% deviation) turning/snapping back toward mean
 *  7. DMI_POWER_MOVE   — ADX(14) >= 22 rising + DI+/DI- directional thrust
 *  8. MACD_ZERO_CROSS  — MACD(12,26,9) signal crossover near the zero equilibrium line
 *  9. VZO_SIGNAL       — Volume Zone Oscillator (14-bar signed/total EMA ratio) + ADX(14) > 18 & EMA(60) trend filter
 * 10. FVG_RETEST       — 3-candle open Fair Value Gap retest on current/latest bar
 * 11. ROC_EXTREME      — Rate of Change (14) stochastic-range extreme reversal hook
 *
 * Strictly zero synthetic data: only computes from real OHLCV candles.
 */

import { Candle, DivergenceSetup, calculateATR, calculateEMA, calculateIndicators } from './trullasStrategy';

export type TosScanId =
  | 'TTM_SQUEEZE'
  | 'FALSE_BREAKOUT'
  | 'STACKED_EMA'
  | 'UNUSUAL_VOLUME'
  | 'VSCORE_VWAP'
  | 'SMA50_REVERSION'
  | 'DMI_POWER_MOVE'
  | 'MACD_ZERO_CROSS'
  | 'VZO_SIGNAL'
  | 'FVG_RETEST'
  | 'ROC_EXTREME';

export type TosScanCategory = 'SQUEEZE' | 'MOMENTUM' | 'REVERSAL' | 'VOLUME' | 'STRUCTURE';
export type TosDirection = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export interface TosScanSignal {
  id: TosScanId;
  name: string;
  shortLabel: string;
  category: TosScanCategory;
  direction: TosDirection;
  strength: number; // 0..100
  headline: string;
  metricsSummary: string;
  barsAgo: number;
  metrics: Record<string, number | string | boolean>;
}

export interface TosScanSnapshotMetrics {
  squeezeOn: boolean;
  squeezeDots: number;
  squeezeFired: boolean;
  emaStack: 'BULLISH' | 'BEARISH' | 'MIXED';
  ema8: number | null;
  ema21: number | null;
  ema34: number | null;
  ema55: number | null;
  ema89: number | null;
  sma50: number | null;
  pctFromSma50: number | null;
  relVolStDev: number;
  volRatio20: number;
  vScore: number | null;
  vwap50: number | null;
  adx14: number | null;
  plusDi14: number | null;
  minusDi14: number | null;
  vzo14: number | null;
  roc14: number | null;
}

export interface TosScanReport {
  symbol: string;
  evaluatedBars: number;
  signals: TosScanSignal[];
  matchedIds: TosScanId[];
  primarySignal: TosScanSignal | null;
  compositeStrength: number; // 0..100
  bullishCount: number;
  bearishCount: number;
  snapshot: TosScanSnapshotMetrics;
}

export interface TosScanDefinition {
  id: TosScanId;
  name: string;
  shortLabel: string;
  category: TosScanCategory;
  tosSourceSlug: string;
  ruleSummary: string;
  minBars: number;
}

export const TOS_SCAN_DEFINITIONS: TosScanDefinition[] = [
  {
    id: 'TTM_SQUEEZE',
    name: 'TTM Squeeze + Stacked EMAs',
    shortLabel: 'TTM Squeeze',
    category: 'SQUEEZE',
    tosSourceSlug: '/scans/ttm-squeeze-dots',
    ruleSummary:
      'Bollinger Bands(20, 2.0) compressed inside Keltner Channels(20, 1.5×ATR) for ≥5 consecutive dots (or fresh fire), paired with EMA 8/21/34/55/89 trend stack.',
    minBars: 25,
  },
  {
    id: 'FALSE_BREAKOUT',
    name: 'False Breakout Pivot Sweep',
    shortLabel: 'False Breakout',
    category: 'REVERSAL',
    tosSourceSlug: '/scans/false-breakout-scanner',
    ruleSummary:
      'Liquidity sweep of 20-bar pivot: High pierces Highest(high[1],20) & closes back below (Short Fade) or Low pierces Lowest(low[1],20) & closes back above (Long Fade) on ≥1.0× avg volume.',
    minBars: 22,
  },
  {
    id: 'STACKED_EMA',
    name: 'Stacked Moving Averages (8–89)',
    shortLabel: 'Stacked EMAs',
    category: 'MOMENTUM',
    tosSourceSlug: '/scans/stacked-ma',
    ruleSummary:
      'Full institutional trend alignment: EMA 8 > 21 > 34 > 55 > 89 (Bullish) or reversed (Bearish), highlighting fresh stacks and pullbacks near the 8/21 EMA zone.',
    minBars: 90,
  },
  {
    id: 'UNUSUAL_VOLUME',
    name: 'Unusual & Increasing Volume',
    shortLabel: 'Unusual Vol',
    category: 'VOLUME',
    tosSourceSlug: '/scans/unusual-volume',
    ruleSummary:
      'RelativeVolumeStDev(50) ≥ 2.0σ statistical volume spike (institution footprint) OR 3 consecutive rising above-average volume bars confirming price expansion.',
    minBars: 50,
  },
  {
    id: 'VSCORE_VWAP',
    name: 'V-Score VWAP Mean Reversion',
    shortLabel: 'V-Score VWAP',
    category: 'REVERSAL',
    tosSourceSlug: '/scans/vscore-scans',
    ruleSummary:
      'Standard-deviation Z-Score relative to 50-bar rolling VWAP: flags oversold pullbacks (Z ≤ -1.5σ) or overextended extremes (Z ≥ +1.7σ) snapping back toward VWAP.',
    minBars: 30,
  },
  {
    id: 'SMA50_REVERSION',
    name: '50-Day SMA Mean Reversion',
    shortLabel: '50-SMA Revert',
    category: 'REVERSAL',
    tosSourceSlug: '/indicators/reversion-to-50-sma',
    ruleSummary:
      'Rubber-band stretch 6%–15% away from the 50-day SMA with initial hook/momentum stabilization for 3–7 day mean reversion back toward SMA(50).',
    minBars: 52,
  },
  {
    id: 'DMI_POWER_MOVE',
    name: 'DMI / ADX Power Move',
    shortLabel: 'DMI Power',
    category: 'MOMENTUM',
    tosSourceSlug: '/indicators/mtf-dmi',
    ruleSummary:
      'ADX(14) ≥ 22 and rising with decisive +DI / -DI dominance or fresh crossover confirming directional trend expansion.',
    minBars: 30,
  },
  {
    id: 'MACD_ZERO_CROSS',
    name: 'MACD Cross Near Zero Line',
    shortLabel: 'MACD Zero',
    category: 'MOMENTUM',
    tosSourceSlug: '/scans/macd-crossover',
    ruleSummary:
      'MACD(12,26,9) crosses its Signal line within the last 2 bars while near equilibrium (|MACD| ≤ 0.85×ATR14) with above-average volume confirmation.',
    minBars: 36,
  },
  {
    id: 'VZO_SIGNAL',
    name: 'Volume Zone Oscillator (±40)',
    shortLabel: 'VZO Flow',
    category: 'VOLUME',
    tosSourceSlug: '/indicators/vzo',
    ruleSummary:
      '14-bar EMA ratio of signed up/down close volume vs total volume crossing ±15 / ±40 zones, confirmed by ADX(14) > 18 and 60-EMA trend alignment.',
    minBars: 60,
  },
  {
    id: 'FVG_RETEST',
    name: 'Fair Value Gap Retest',
    shortLabel: 'FVG Retest',
    category: 'STRUCTURE',
    tosSourceSlug: '/scans/fair-value-gap-scanner',
    ruleSummary:
      'Detects open 3-candle Fair Value Gaps (imbalance zones) where today’s candle wicks/retests into the unmitigated gap without closing through it.',
    minBars: 15,
  },
  {
    id: 'ROC_EXTREME',
    name: 'Rate of Change Reversal Hook',
    shortLabel: 'ROC Hook',
    category: 'REVERSAL',
    tosSourceSlug: '/scans/roc',
    ruleSummary:
      '14-bar Rate of Change normalized across its 60-bar range hitting upper/lower extreme zone (≤15% or ≥85%) and hooking back with RSI turn.',
    minBars: 40,
  },
];

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function smaAt(values: number[], idx: number, period: number): number | null {
  if (idx + 1 < period || period <= 0) return null;
  let sum = 0;
  for (let i = idx - period + 1; i <= idx; i++) {
    sum += values[i];
  }
  return sum / period;
}

function stdevAt(values: number[], idx: number, period: number, mean?: number): number {
  if (idx + 1 < period || period <= 1) return 0;
  const avg = mean ?? (smaAt(values, idx, period) ?? 0);
  let sumSq = 0;
  for (let i = idx - period + 1; i <= idx; i++) {
    const d = values[i] - avg;
    sumSq += d * d;
  }
  return Math.sqrt(sumSq / period);
}

/**
 * Computes Wilder DMI (+DI, -DI, ADX) series of length candles.length.
 */
export function calculateDMI(
  candles: Candle[],
  period: number = 14
): { adx: number[]; plusDi: number[]; minusDi: number[] } {
  const n = candles.length;
  const adx = new Array<number>(n).fill(0);
  const plusDi = new Array<number>(n).fill(0);
  const minusDi = new Array<number>(n).fill(0);
  if (n <= period + 1) return { adx, plusDi, minusDi };

  const tr = new Array<number>(n).fill(0);
  const plusDm = new Array<number>(n).fill(0);
  const minusDm = new Array<number>(n).fill(0);

  for (let i = 1; i < n; i++) {
    const upMove = candles[i].high - candles[i - 1].high;
    const downMove = candles[i - 1].low - candles[i].low;
    plusDm[i] = upMove > downMove && upMove > 0 ? upMove : 0;
    minusDm[i] = downMove > upMove && downMove > 0 ? downMove : 0;
    tr[i] = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
  }

  let smoothTr = 0;
  let smoothPlus = 0;
  let smoothMinus = 0;
  for (let i = 1; i <= period; i++) {
    smoothTr += tr[i];
    smoothPlus += plusDm[i];
    smoothMinus += minusDm[i];
  }

  const dx = new Array<number>(n).fill(0);
  for (let i = period; i < n; i++) {
    if (i > period) {
      smoothTr = smoothTr - smoothTr / period + tr[i];
      smoothPlus = smoothPlus - smoothPlus / period + plusDm[i];
      smoothMinus = smoothMinus - smoothMinus / period + minusDm[i];
    }
    const pdi = smoothTr > 0 ? (100 * smoothPlus) / smoothTr : 0;
    const mdi = smoothTr > 0 ? (100 * smoothMinus) / smoothTr : 0;
    plusDi[i] = pdi;
    minusDi[i] = mdi;
    const denom = pdi + mdi;
    dx[i] = denom > 0 ? (100 * Math.abs(pdi - mdi)) / denom : 0;
  }

  const adxStart = Math.min(n - 1, period * 2 - 1);
  if (n > period * 2) {
    let dxSum = 0;
    for (let i = period; i < period * 2; i++) {
      dxSum += dx[i];
    }
    let curAdx = dxSum / period;
    adx[adxStart] = curAdx;
    for (let i = adxStart + 1; i < n; i++) {
      curAdx = (curAdx * (period - 1) + dx[i]) / period;
      adx[i] = curAdx;
    }
  } else {
    for (let i = period; i < n; i++) {
      adx[i] = dx[i];
    }
  }

  return { adx, plusDi, minusDi };
}

/**
 * Evaluates all TOS Indicators OHLCV scans for one symbol cleanly & deterministically.
 */
export function evaluateTosScans(symbol: string, rawCandles: Candle[]): TosScanReport {
  const sym = symbol.toUpperCase().trim();
  const candles = Array.isArray(rawCandles)
    ? rawCandles.filter(
        (c) =>
          c &&
          Number.isFinite(c.close) &&
          Number.isFinite(c.high) &&
          Number.isFinite(c.low) &&
          c.close > 0
      )
    : [];

  const emptySnapshot: TosScanSnapshotMetrics = {
    squeezeOn: false,
    squeezeDots: 0,
    squeezeFired: false,
    emaStack: 'MIXED',
    ema8: null,
    ema21: null,
    ema34: null,
    ema55: null,
    ema89: null,
    sma50: null,
    pctFromSma50: null,
    relVolStDev: 0,
    volRatio20: 1,
    vScore: null,
    vwap50: null,
    adx14: null,
    plusDi14: null,
    minusDi14: null,
    vzo14: null,
    roc14: null,
  };

  if (candles.length < 20) {
    return {
      symbol: sym,
      evaluatedBars: candles.length,
      signals: [],
      matchedIds: [],
      primarySignal: null,
      compositeStrength: 0,
      bullishCount: 0,
      bearishCount: 0,
      snapshot: emptySnapshot,
    };
  }

  const n = candles.length;
  const lastIdx = n - 1;
  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => Math.max(0, Number(c.volume) || 0));
  const last = candles[lastIdx];

  const atr14 = calculateATR(candles, 14);
  const atr20 = calculateATR(candles, 20);
  const curAtr = Math.max(0.0001, atr14[lastIdx] || last.close * 0.015);

  const ema8 = calculateEMA(closes, 8);
  const ema21 = calculateEMA(closes, 21);
  const ema34 = calculateEMA(closes, 34);
  const ema55 = calculateEMA(closes, 55);
  const ema89 = calculateEMA(closes, 89);
  const ema60 = calculateEMA(closes, 60);

  const hasEma89 = n >= 89;
  const bullStack = hasEma89
    ? ema8[lastIdx] > ema21[lastIdx] &&
      ema21[lastIdx] > ema34[lastIdx] &&
      ema34[lastIdx] > ema55[lastIdx] &&
      ema55[lastIdx] > ema89[lastIdx]
    : ema8[lastIdx] > ema21[lastIdx] && ema21[lastIdx] > ema34[lastIdx];

  const bearStack = hasEma89
    ? ema8[lastIdx] < ema21[lastIdx] &&
      ema21[lastIdx] < ema34[lastIdx] &&
      ema34[lastIdx] < ema55[lastIdx] &&
      ema55[lastIdx] < ema89[lastIdx]
    : ema8[lastIdx] < ema21[lastIdx] && ema21[lastIdx] < ema34[lastIdx];

  const emaStack: 'BULLISH' | 'BEARISH' | 'MIXED' = bullStack
    ? 'BULLISH'
    : bearStack
    ? 'BEARISH'
    : 'MIXED';

  const sma50 = smaAt(closes, lastIdx, 50);
  const pctFromSma50 =
    sma50 && sma50 > 0 ? Number((((last.close - sma50) / sma50) * 100).toFixed(2)) : null;

  // Squeeze series (BB(20, 2.0) inside KC(20, 1.5*ATR20))
  const squeezeFlags = new Array<boolean>(n).fill(false);
  for (let i = 19; i < n; i++) {
    const mid = smaAt(closes, i, 20);
    if (mid === null) continue;
    const sd = stdevAt(closes, i, 20, mid);
    const bbUpper = mid + 2.0 * sd;
    const bbLower = mid - 2.0 * sd;
    const kcUpper = mid + 1.5 * (atr20[i] || curAtr);
    const kcLower = mid - 1.5 * (atr20[i] || curAtr);
    squeezeFlags[i] = bbUpper < kcUpper && bbLower > kcLower;
  }

  let squeezeDots = 0;
  for (let i = lastIdx; i >= 0 && squeezeFlags[i]; i--) {
    squeezeDots++;
  }
  const squeezeOn = squeezeFlags[lastIdx];
  let prevSqueezeDots = 0;
  if (!squeezeOn && lastIdx > 0 && squeezeFlags[lastIdx - 1]) {
    for (let i = lastIdx - 1; i >= 0 && squeezeFlags[i]; i--) {
      prevSqueezeDots++;
    }
  }
  const squeezeFired = !squeezeOn && prevSqueezeDots >= 4;

  // Relative Volume StDev(50) & 20-bar ratio
  const volLookback = Math.min(50, n);
  const volMean50 = smaAt(volumes, lastIdx, volLookback) ?? 0;
  const volStd50 = stdevAt(volumes, lastIdx, volLookback, volMean50);
  const relVolStDev =
    volStd50 > 0 ? Number(((last.volume - volMean50) / volStd50).toFixed(2)) : 0;
  const volMean20 = smaAt(volumes, lastIdx, Math.min(20, n)) ?? 0;
  const volRatio20 =
    volMean20 > 0 ? Number((last.volume / volMean20).toFixed(2)) : 1;

  // V-Score vs Rolling 50-bar VWAP
  const vwapLen = Math.min(50, n);
  let pvSum = 0;
  let vSum = 0;
  const typicals: number[] = [];
  const startVwap = n - vwapLen;
  for (let i = startVwap; i < n; i++) {
    const tp = (candles[i].high + candles[i].low + candles[i].close) / 3;
    const v = Math.max(1, volumes[i]);
    pvSum += tp * v;
    vSum += v;
    typicals.push(tp);
  }
  const vwap50 = vSum > 0 ? Number((pvSum / vSum).toFixed(2)) : null;
  let vScore: number | null = null;
  if (vwap50 !== null) {
    let wVar = 0;
    for (let i = startVwap; i < n; i++) {
      const tp = typicals[i - startVwap];
      const v = Math.max(1, volumes[i]);
      const diff = tp - vwap50;
      wVar += v * diff * diff;
    }
    const vwapStd = Math.sqrt(wVar / Math.max(1, vSum));
    if (vwapStd > 0.0001) {
      vScore = Number(((last.close - vwap50) / vwapStd).toFixed(2));
    }
  }

  // DMI / ADX
  const { adx, plusDi, minusDi } = calculateDMI(candles, 14);
  const adxVal = n >= 28 ? Number(adx[lastIdx].toFixed(1)) : null;
  const pdiVal = n >= 28 ? Number(plusDi[lastIdx].toFixed(1)) : null;
  const mdiVal = n >= 28 ? Number(minusDi[lastIdx].toFixed(1)) : null;

  // VZO (Volume Zone Oscillator, 14)
  const signedVol = new Array<number>(n).fill(0);
  for (let i = 1; i < n; i++) {
    if (candles[i].close > candles[i - 1].close) signedVol[i] = volumes[i];
    else if (candles[i].close < candles[i - 1].close) signedVol[i] = -volumes[i];
  }
  const vpEma = calculateEMA(signedVol, 14);
  const tvEma = calculateEMA(volumes, 14);
  const vzoSeries = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    vzoSeries[i] = tvEma[i] > 0 ? (100 * vpEma[i]) / tvEma[i] : 0;
  }
  const vzo14 = n >= 20 ? Number(vzoSeries[lastIdx].toFixed(1)) : null;

  // ROC(14)
  const rocSeries = new Array<number>(n).fill(0);
  for (let i = 14; i < n; i++) {
    const base = candles[i - 14].close;
    rocSeries[i] = base > 0 ? ((candles[i].close - base) / base) * 100 : 0;
  }
  const roc14 = n >= 20 ? Number(rocSeries[lastIdx].toFixed(2)) : null;

  const indicatorPoints = calculateIndicators(candles, 12, 26, 9);
  const signals: TosScanSignal[] = [];

  // 1. TTM SQUEEZE (≥5 dots active OR fresh release after ≥4 dots)
  if (squeezeDots >= 5 || squeezeFired) {
    const momSlope = ema8[lastIdx] - ema21[lastIdx];
    const dir: TosDirection =
      emaStack === 'BULLISH' || momSlope > 0
        ? 'BULLISH'
        : emaStack === 'BEARISH' || momSlope < 0
        ? 'BEARISH'
        : 'NEUTRAL';

    const stackBonus = emaStack !== 'MIXED' ? 18 : 0;
    const strength = clamp(
      Math.round(58 + Math.min(squeezeFired ? prevSqueezeDots : squeezeDots, 10) * 2.4 + stackBonus),
      60,
      98
    );

    signals.push({
      id: 'TTM_SQUEEZE',
      name: squeezeFired ? 'TTM Squeeze Fired' : 'TTM Squeeze Active',
      shortLabel: squeezeFired
        ? `Squeeze Fired (${prevSqueezeDots}d)`
        : `TTM Squeeze (${squeezeDots}d)`,
      category: 'SQUEEZE',
      direction: dir,
      strength,
      headline: squeezeFired
        ? `Volatility expansion released after ${prevSqueezeDots} compression bars`
        : `${squeezeDots} consecutive BB-in-KC compression dots${emaStack !== 'MIXED' ? ` · ${emaStack} EMA Stack` : ''}`,
      metricsSummary: `Dots: ${squeezeFired ? prevSqueezeDots : squeezeDots} · EMA Stack: ${emaStack} · ATR: ${((curAtr / last.close) * 100).toFixed(2)}%`,
      barsAgo: 0,
      metrics: {
        squeezeDots: squeezeFired ? prevSqueezeDots : squeezeDots,
        squeezeFired,
        emaStack,
      },
    });
  }

  // 2. FALSE BREAKOUT SCANNER (20-bar pivot sweep, check latest 2 bars so daily scan sees today & yesterday)
  if (n >= 22) {
    for (let offset = 0; offset <= 1; offset++) {
      const idx = lastIdx - offset;
      if (idx < 20) continue;
      let highest20Prev = -Infinity;
      let lowest20Prev = Infinity;
      for (let k = idx - 20; k < idx; k++) {
        if (candles[k].high > highest20Prev) highest20Prev = candles[k].high;
        if (candles[k].low < lowest20Prev) lowest20Prev = candles[k].low;
      }
      const bar = candles[idx];
      const barVolAvg = smaAt(volumes, idx, 20) ?? 1;
      const barVolMult = barVolAvg > 0 ? volumes[idx] / barVolAvg : 1;

      const fadeUpBearish =
        bar.high > highest20Prev && bar.close < highest20Prev && barVolMult >= 1.0;
      const fadeDownBullish =
        bar.low < lowest20Prev && bar.close > lowest20Prev && barVolMult >= 1.0;

      if (fadeDownBullish) {
        const wickRatio = (bar.close - bar.low) / Math.max(0.001, bar.high - bar.low);
        const strength = clamp(
          Math.round(64 + Math.min(barVolMult - 1, 2) * 14 + wickRatio * 14 - offset * 6),
          60,
          96
        );
        signals.push({
          id: 'FALSE_BREAKOUT',
          name: 'False Breakdown (Bullish Sweep)',
          shortLabel: `Bull Pivot Sweep${offset > 0 ? ' (-1d)' : ''}`,
          category: 'REVERSAL',
          direction: 'BULLISH',
          strength,
          headline: `Swept 20-bar low $${lowest20Prev.toFixed(2)} (wick $${bar.low.toFixed(2)}) and reclaimed $${bar.close.toFixed(2)}`,
          metricsSummary: `Pivot Low: $${lowest20Prev.toFixed(2)} · Vol: ${barVolMult.toFixed(2)}× avg`,
          barsAgo: offset,
          metrics: {
            pivotLevel: Number(lowest20Prev.toFixed(2)),
            volMultiplier: Number(barVolMult.toFixed(2)),
            fadeType: 'FADE_DOWN_LONG',
          },
        });
        break;
      } else if (fadeUpBearish) {
        const wickRatio = (bar.high - bar.close) / Math.max(0.001, bar.high - bar.low);
        const strength = clamp(
          Math.round(64 + Math.min(barVolMult - 1, 2) * 14 + wickRatio * 14 - offset * 6),
          60,
          96
        );
        signals.push({
          id: 'FALSE_BREAKOUT',
          name: 'False Breakout (Bearish Trap)',
          shortLabel: `Bear Pivot Trap${offset > 0 ? ' (-1d)' : ''}`,
          category: 'REVERSAL',
          direction: 'BEARISH',
          strength,
          headline: `Pierced 20-bar high $${highest20Prev.toFixed(2)} (wick $${bar.high.toFixed(2)}) and rejected to $${bar.close.toFixed(2)}`,
          metricsSummary: `Pivot High: $${highest20Prev.toFixed(2)} · Vol: ${barVolMult.toFixed(2)}× avg`,
          barsAgo: offset,
          metrics: {
            pivotLevel: Number(highest20Prev.toFixed(2)),
            volMultiplier: Number(barVolMult.toFixed(2)),
            fadeType: 'FADE_UP_SHORT',
          },
        });
        break;
      }
    }
  }

  // 3. STACKED MOVING AVERAGES (8 / 21 / 34 / 55 / 89 EMA)
  if (hasEma89 && (bullStack || bearStack)) {
    const prevIdx = lastIdx - 1;
    const prevBullStack =
      ema8[prevIdx] > ema21[prevIdx] &&
      ema21[prevIdx] > ema34[prevIdx] &&
      ema34[prevIdx] > ema55[prevIdx] &&
      ema55[prevIdx] > ema89[prevIdx];
    const prevBearStack =
      ema8[prevIdx] < ema21[prevIdx] &&
      ema21[prevIdx] < ema34[prevIdx] &&
      ema34[prevIdx] < ema55[prevIdx] &&
      ema55[prevIdx] < ema89[prevIdx];
    const freshStack = (bullStack && !prevBullStack) || (bearStack && !prevBearStack);

    // Pullback-to-value check: price near 8 or 21 EMA
    const dist21Atr = Math.abs(last.close - ema21[lastIdx]) / curAtr;
    const nearValue = dist21Atr <= 0.8;
    const spreadPct = ((ema8[lastIdx] - ema89[lastIdx]) / ema89[lastIdx]) * 100;

    const strength = clamp(
      Math.round(64 + (freshStack ? 16 : 0) + (nearValue ? 12 : 0) + Math.min(Math.abs(spreadPct), 8)),
      60,
      96
    );

    signals.push({
      id: 'STACKED_EMA',
      name: bullStack ? 'Bullish Stacked EMAs (8–89)' : 'Bearish Stacked EMAs (8–89)',
      shortLabel: `${bullStack ? 'Bull' : 'Bear'} Stack${freshStack ? ' NEW' : nearValue ? ' PB' : ''}`,
      category: 'MOMENTUM',
      direction: bullStack ? 'BULLISH' : 'BEARISH',
      strength,
      headline: bullStack
        ? `EMA 8 ($${ema8[lastIdx].toFixed(2)}) > 21 > 34 > 55 > 89 ($${ema89[lastIdx].toFixed(2)})${nearValue ? ' · At 21-EMA Support' : ''}`
        : `EMA 8 ($${ema8[lastIdx].toFixed(2)}) < 21 < 34 < 55 < 89 ($${ema89[lastIdx].toFixed(2)})${nearValue ? ' · At 21-EMA Resistance' : ''}`,
      metricsSummary: `8/89 Spread: ${spreadPct >= 0 ? '+' : ''}${spreadPct.toFixed(1)}%${freshStack ? ' · Fresh Cross' : nearValue ? ' · Pullback Zone' : ''}`,
      barsAgo: freshStack ? 0 : 1,
      metrics: {
        freshStack,
        near21EmaPullback: nearValue,
        spreadPct: Number(spreadPct.toFixed(2)),
      },
    });
  }

  // 4. UNUSUAL & INCREASING VOLUME
  const has3RisingVol =
    n >= 52 &&
    volumes[lastIdx] > volumes[lastIdx - 1] &&
    volumes[lastIdx - 1] > volumes[lastIdx - 2] &&
    volumes[lastIdx - 2] > volumes[lastIdx - 3] &&
    volumes[lastIdx - 2] > volMean50;

  const allUpCloses =
    n >= 4 &&
    candles[lastIdx].close > candles[lastIdx - 1].close &&
    candles[lastIdx - 1].close > candles[lastIdx - 2].close &&
    candles[lastIdx - 2].close > candles[lastIdx - 3].close;

  const allDownCloses =
    n >= 4 &&
    candles[lastIdx].close < candles[lastIdx - 1].close &&
    candles[lastIdx - 1].close < candles[lastIdx - 2].close &&
    candles[lastIdx - 2].close < candles[lastIdx - 3].close;

  if (relVolStDev >= 2.0 || (has3RisingVol && (allUpCloses || allDownCloses))) {
    const prevClose = candles[lastIdx - 1].close;
    const isUpDay = last.close >= prevClose;
    const dir: TosDirection =
      allUpCloses || (relVolStDev >= 2.0 && isUpDay)
        ? 'BULLISH'
        : allDownCloses || (relVolStDev >= 2.0 && !isUpDay)
        ? 'BEARISH'
        : 'NEUTRAL';

    const strength = clamp(
      Math.round(
        60 + Math.min(Math.max(0, relVolStDev), 4.5) * 8 + (has3RisingVol ? 10 : 0)
      ),
      60,
      98
    );

    signals.push({
      id: 'UNUSUAL_VOLUME',
      name: relVolStDev >= 2.0 ? 'Unusual Volume Spike' : '3-Bar Increasing Volume',
      shortLabel: relVolStDev >= 2.0 ? `RelVol ${relVolStDev.toFixed(1)}σ` : '3d Rising Vol',
      category: 'VOLUME',
      direction: dir,
      strength,
      headline:
        relVolStDev >= 2.0
          ? `Institutional ${relVolStDev.toFixed(2)}σ volume anomaly (${volRatio20.toFixed(2)}× 20-bar average)`
          : `3 consecutive expanding above-average volume sessions (${dir.toLowerCase()})`,
      metricsSummary: `RelVol50: ${relVolStDev.toFixed(2)}σ · Vol/20d: ${volRatio20.toFixed(2)}×${has3RisingVol ? ' · 3d Surge' : ''}`,
      barsAgo: 0,
      metrics: {
        relVolStDev,
        volRatio20,
        threeBarIncreasing: has3RisingVol,
      },
    });
  }

  // 5. V-Score (VWAP Z-Score Mean Reversion)
  if (vScore !== null && vwap50 !== null && (vScore <= -1.5 || vScore >= 1.85)) {
    const isBullRevert = vScore <= -1.5;
    const threshold = isBullRevert ? 1.5 : 1.85;
    const strength = clamp(Math.round(62 + Math.min(Math.abs(vScore) - threshold, 2.0) * 16), 60, 95);
    signals.push({
      id: 'VSCORE_VWAP',
      name: isBullRevert ? 'V-Score Oversold VWAP Pullback' : 'V-Score Extended Above VWAP',
      shortLabel: `V-Score ${vScore > 0 ? '+' : ''}${vScore.toFixed(1)}σ`,
      category: 'REVERSAL',
      direction: isBullRevert ? 'BULLISH' : 'BEARISH',
      strength,
      headline: isBullRevert
        ? `Price stretched ${Math.abs(vScore).toFixed(2)}σ below 50-bar VWAP ($${vwap50.toFixed(2)}) — mean-reversion buy zone`
        : `Price stretched +${vScore.toFixed(2)}σ above 50-bar VWAP ($${vwap50.toFixed(2)}) — overextended reversion risk`,
      metricsSummary: `V-Score: ${vScore > 0 ? '+' : ''}${vScore.toFixed(2)}σ · VWAP50: $${vwap50.toFixed(2)}`,
      barsAgo: 0,
      metrics: {
        vScore,
        vwap50,
      },
    });
  }

  // 6. 50-DAY SMA MEAN REVERSION (6%–15% stretch, curling back or extreme)
  if (sma50 !== null && pctFromSma50 !== null && Math.abs(pctFromSma50) >= 6 && Math.abs(pctFromSma50) <= 18) {
    const isBull = pctFromSma50 <= -6;
    const prevClose = candles[lastIdx - 1].close;
    const curling = isBull ? last.close >= prevClose : last.close <= prevClose;
    const strength = clamp(
      Math.round(60 + Math.min(Math.abs(pctFromSma50) - 5, 10) * 2 + (curling ? 12 : 0)),
      60,
      94
    );

    signals.push({
      id: 'SMA50_REVERSION',
      name: isBull ? '50-SMA Oversold Reversion' : '50-SMA Overbought Reversion',
      shortLabel: `50-SMA ${pctFromSma50 > 0 ? '+' : ''}${pctFromSma50.toFixed(1)}%`,
      category: 'REVERSAL',
      direction: isBull ? 'BULLISH' : 'BEARISH',
      strength,
      headline: isBull
        ? `Trading ${Math.abs(pctFromSma50).toFixed(1)}% below 50-SMA ($${sma50.toFixed(2)})${curling ? ' & turning up' : ''}`
        : `Extended +${pctFromSma50.toFixed(1)}% above 50-SMA ($${sma50.toFixed(2)})${curling ? ' & hooking down' : ''}`,
      metricsSummary: `SMA50: $${sma50.toFixed(2)} · Dist: ${pctFromSma50 > 0 ? '+' : ''}${pctFromSma50.toFixed(1)}%`,
      barsAgo: 0,
      metrics: {
        sma50: Number(sma50.toFixed(2)),
        pctFromSma50,
        curlingTowardMean: curling,
      },
    });
  }

  // 7. DMI / ADX POWER MOVE (ADX >= 22 rising + strong DI spread or recent DI cross)
  if (n >= 30 && adxVal !== null && pdiVal !== null && mdiVal !== null) {
    const adxRising = adx[lastIdx] > adx[lastIdx - 2];
    const spread = Math.abs(pdiVal - mdiVal);
    const recentCross =
      (plusDi[lastIdx] > minusDi[lastIdx] && plusDi[lastIdx - 2] <= minusDi[lastIdx - 2]) ||
      (minusDi[lastIdx] > plusDi[lastIdx] && minusDi[lastIdx - 2] <= plusDi[lastIdx - 2]);

    if (adxVal >= 22 && (adxRising || recentCross) && spread >= 5) {
      const isBull = pdiVal > mdiVal;
      const strength = clamp(
        Math.round(58 + Math.min(adxVal - 20, 20) * 1.1 + Math.min(spread, 20) * 0.6 + (recentCross ? 10 : 0)),
        60,
        96
      );
      signals.push({
        id: 'DMI_POWER_MOVE',
        name: isBull ? 'DMI Bullish Power Move' : 'DMI Bearish Power Move',
        shortLabel: `DMI ADX ${adxVal.toFixed(0)}`,
        category: 'MOMENTUM',
        direction: isBull ? 'BULLISH' : 'BEARISH',
        strength,
        headline: `ADX ${adxVal.toFixed(1)} rising · ${isBull ? '+DI' : '-DI'} leads (${pdiVal.toFixed(1)} vs ${mdiVal.toFixed(1)})`,
        metricsSummary: `ADX: ${adxVal.toFixed(1)} · +DI: ${pdiVal.toFixed(1)} / -DI: ${mdiVal.toFixed(1)}`,
        barsAgo: recentCross ? 0 : 1,
        metrics: {
          adx14: adxVal,
          plusDi14: pdiVal,
          minusDi14: mdiVal,
          recentDiCross: recentCross,
        },
      });
    }
  }

  // 8. MACD CROSSOVER NEAR ZERO LINE
  if (indicatorPoints.length >= 36) {
    for (let offset = 0; offset <= 1; offset++) {
      const idx = indicatorPoints.length - 1 - offset;
      const cur = indicatorPoints[idx];
      const prev = indicatorPoints[idx - 1];
      if (!cur || !prev) continue;
      const bullCross = prev.macd <= prev.signal && cur.macd > cur.signal;
      const bearCross = prev.macd >= prev.signal && cur.macd < cur.signal;
      const nearZero = Math.abs(cur.macd) <= Math.max(curAtr * 0.9, cur.candle.close * 0.015);
      if ((bullCross || bearCross) && nearZero) {
        const volBonus = volRatio20 >= 1.2 ? 10 : 0;
        const strength = clamp(Math.round(68 + volBonus - offset * 5), 60, 94);
        signals.push({
          id: 'MACD_ZERO_CROSS',
          name: bullCross ? 'MACD Bull Cross Near Zero' : 'MACD Bear Cross Near Zero',
          shortLabel: `MACD 0-Cross${offset > 0 ? ' (-1d)' : ''}`,
          category: 'MOMENTUM',
          direction: bullCross ? 'BULLISH' : 'BEARISH',
          strength,
          headline: `MACD (${cur.macd.toFixed(2)}) crossed Signal (${cur.signal.toFixed(2)}) near equilibrium`,
          metricsSummary: `MACD: ${cur.macd.toFixed(2)} · RSI: ${cur.rsi.toFixed(1)} · Vol: ${volRatio20.toFixed(2)}×`,
          barsAgo: offset,
          metrics: {
            macd: Number(cur.macd.toFixed(3)),
            signal: Number(cur.signal.toFixed(3)),
          },
        });
        break;
      }
    }
  }

  // 9. VOLUME ZONE OSCILLATOR (VZO +40 / -40 + ADX > 18 + 60 EMA)
  if (n >= 60 && vzo14 !== null && adxVal !== null && adxVal > 18) {
    const prevVzo = vzoSeries[lastIdx - 1];
    const vzoBull =
      (prevVzo < 15 && vzoSeries[lastIdx] >= 15 && last.close > ema60[lastIdx]) ||
      (prevVzo < 40 && vzoSeries[lastIdx] >= 40 && last.close > ema60[lastIdx]);
    const vzoBear =
      (prevVzo > -5 && vzoSeries[lastIdx] <= -5 && last.close < ema60[lastIdx]) ||
      (prevVzo > -40 && vzoSeries[lastIdx] <= -40 && last.close < ema60[lastIdx]);
    if (vzoBull || vzoBear) {
      const strength = clamp(Math.round(64 + Math.min(Math.abs(vzo14), 60) * 0.35), 60, 92);
      signals.push({
        id: 'VZO_SIGNAL',
        name: vzoBull ? 'VZO Accumulation Zone Cross' : 'VZO Distribution Zone Cross',
        shortLabel: `VZO ${vzo14 > 0 ? '+' : ''}${vzo14.toFixed(0)}`,
        category: 'VOLUME',
        direction: vzoBull ? 'BULLISH' : 'BEARISH',
        strength,
        headline: `VZO crossed ${vzo14.toFixed(1)} with ADX ${adxVal.toFixed(1)} & price ${vzoBull ? 'above' : 'below'} 60-EMA`,
        metricsSummary: `VZO: ${vzo14.toFixed(1)} · ADX: ${adxVal.toFixed(1)} · EMA60: $${ema60[lastIdx].toFixed(2)}`,
        barsAgo: 0,
        metrics: { vzo14, adx14: adxVal },
      });
    }
  }

  // 10. FAIR VALUE GAP RETEST (most recent unmitigated 3-candle FVG touched by latest bar)
  if (n >= 15) {
    const scanStart = Math.max(2, lastIdx - 25);
    for (let k = lastIdx - 2; k >= scanStart; k--) {
      const c1 = candles[k - 2];
      const c3 = candles[k];
      // Bullish FVG: c1.high < c3.low
      if (c1.high < c3.low && (c3.low - c1.high) / c3.close >= 0.002) {
        const gapBottom = c1.high;
        const gapTop = c3.low;
        let mitigatedEarlier = false;
        for (let m = k + 1; m < lastIdx; m++) {
          if (candles[m].low <= gapBottom) {
            mitigatedEarlier = true;
            break;
          }
        }
        if (!mitigatedEarlier && last.low <= gapTop && last.close >= gapBottom) {
          signals.push({
            id: 'FVG_RETEST',
            name: 'Bullish Fair Value Gap Retest',
            shortLabel: 'Bull FVG Retest',
            category: 'STRUCTURE',
            direction: 'BULLISH',
            strength: 74,
            headline: `Retesting open bullish FVG [$${gapBottom.toFixed(2)} – $${gapTop.toFixed(2)}] and holding support`,
            metricsSummary: `FVG Zone: $${gapBottom.toFixed(2)}–$${gapTop.toFixed(2)}`,
            barsAgo: 0,
            metrics: { gapBottom: Number(gapBottom.toFixed(2)), gapTop: Number(gapTop.toFixed(2)) },
          });
          break;
        }
      }
      // Bearish FVG: c1.low > c3.high
      if (c1.low > c3.high && (c1.low - c3.high) / c1.low >= 0.002) {
        const gapTop = c1.low;
        const gapBottom = c3.high;
        let mitigatedEarlier = false;
        for (let m = k + 1; m < lastIdx; m++) {
          if (candles[m].high >= gapTop) {
            mitigatedEarlier = true;
            break;
          }
        }
        if (!mitigatedEarlier && last.high >= gapBottom && last.close <= gapTop) {
          signals.push({
            id: 'FVG_RETEST',
            name: 'Bearish Fair Value Gap Retest',
            shortLabel: 'Bear FVG Retest',
            category: 'STRUCTURE',
            direction: 'BEARISH',
            strength: 74,
            headline: `Retesting open bearish FVG [$${gapBottom.toFixed(2)} – $${gapTop.toFixed(2)}] under resistance`,
            metricsSummary: `FVG Zone: $${gapBottom.toFixed(2)}–$${gapTop.toFixed(2)}`,
            barsAgo: 0,
            metrics: { gapBottom: Number(gapBottom.toFixed(2)), gapTop: Number(gapTop.toFixed(2)) },
          });
          break;
        }
      }
    }
  }

  // 11. ROC EXTREME HOOK
  if (n >= 40 && roc14 !== null) {
    const winStart = Math.max(14, lastIdx - 59);
    let minRoc = Infinity;
    let maxRoc = -Infinity;
    for (let i = winStart; i <= lastIdx; i++) {
      if (rocSeries[i] < minRoc) minRoc = rocSeries[i];
      if (rocSeries[i] > maxRoc) maxRoc = rocSeries[i];
    }
    const span = maxRoc - minRoc;
    if (span > 2.0) {
      const pctRank = ((rocSeries[lastIdx] - minRoc) / span) * 100;
      const prevPctRank = ((rocSeries[lastIdx - 1] - minRoc) / span) * 100;
      const hookingUp = rocSeries[lastIdx] > rocSeries[lastIdx - 1];
      const hookingDown = rocSeries[lastIdx] < rocSeries[lastIdx - 1];
      if (prevPctRank <= 18 && pctRank <= 25 && hookingUp) {
        signals.push({
          id: 'ROC_EXTREME',
          name: 'ROC Lower Extreme Bull Hook',
          shortLabel: `ROC ${roc14.toFixed(1)}% Hook`,
          category: 'REVERSAL',
          direction: 'BULLISH',
          strength: 70,
          headline: `14-bar ROC (${roc14.toFixed(1)}%) turning up from bottom ${prevPctRank.toFixed(0)}% range extreme`,
          metricsSummary: `ROC14: ${roc14.toFixed(1)}% · Range Rank: ${pctRank.toFixed(0)}%`,
          barsAgo: 0,
          metrics: { roc14, rangePercentile: Number(pctRank.toFixed(1)) },
        });
      } else if (prevPctRank >= 82 && pctRank >= 75 && hookingDown) {
        signals.push({
          id: 'ROC_EXTREME',
          name: 'ROC Upper Extreme Bear Hook',
          shortLabel: `ROC +${roc14.toFixed(1)}% Hook`,
          category: 'REVERSAL',
          direction: 'BEARISH',
          strength: 70,
          headline: `14-bar ROC (+${roc14.toFixed(1)}%) rolling over from top ${prevPctRank.toFixed(0)}% range extreme`,
          metricsSummary: `ROC14: +${roc14.toFixed(1)}% · Range Rank: ${pctRank.toFixed(0)}%`,
          barsAgo: 0,
          metrics: { roc14, rangePercentile: Number(pctRank.toFixed(1)) },
        });
      }
    }
  }

  // Sort strongest & freshest first
  signals.sort((a, b) => b.strength - a.strength || a.barsAgo - b.barsAgo);

  const primarySignal = signals[0] ?? null;
  const maxStr = primarySignal ? primarySignal.strength : 0;
  const multiConfluenceBoost = Math.min(18, Math.max(0, signals.length - 1) * 6);
  const compositeStrength = signals.length > 0 ? clamp(maxStr + multiConfluenceBoost, 0, 99) : 0;

  return {
    symbol: sym,
    evaluatedBars: n,
    signals,
    matchedIds: signals.map((s) => s.id),
    primarySignal,
    compositeStrength,
    bullishCount: signals.filter((s) => s.direction === 'BULLISH').length,
    bearishCount: signals.filter((s) => s.direction === 'BEARISH').length,
    snapshot: {
      squeezeOn,
      squeezeDots,
      squeezeFired,
      emaStack,
      ema8: Number(ema8[lastIdx].toFixed(2)),
      ema21: Number(ema21[lastIdx].toFixed(2)),
      ema34: Number(ema34[lastIdx].toFixed(2)),
      ema55: Number(ema55[lastIdx].toFixed(2)),
      ema89: hasEma89 ? Number(ema89[lastIdx].toFixed(2)) : null,
      sma50: sma50 !== null ? Number(sma50.toFixed(2)) : null,
      pctFromSma50,
      relVolStDev,
      volRatio20,
      vScore,
      vwap50,
      adx14: adxVal,
      plusDi14: pdiVal,
      minusDi14: mdiVal,
      vzo14,
      roc14,
    },
  };
}

/**
 * Generates an actionable PositionCalculator-compatible setup from any TOS scan report
 * using genuine ATR-anchored trigger, stop-loss, and target levels.
 */
export function buildSetupFromTosScan(
  symbol: string,
  timeframe: string,
  price: number,
  atr: number,
  report: TosScanReport
): DivergenceSetup | null {
  if (!report.primarySignal || price <= 0) return null;
  const sig = report.primarySignal;
  const effAtr = atr > 0 ? atr : price * 0.018;
  const isBull = sig.direction !== 'BEARISH';

  const triggerPrice = Number(
    (isBull ? price + effAtr * 0.15 : price - effAtr * 0.15).toFixed(2)
  );
  const stopLoss = Number(
    (isBull ? price - effAtr * 1.35 : price + effAtr * 1.35).toFixed(2)
  );
  const risk = Math.max(0.01, Math.abs(triggerPrice - stopLoss));
  const tp1 = Number((isBull ? triggerPrice + risk * 1.5 : triggerPrice - risk * 1.5).toFixed(2));
  const tp2 = Number((isBull ? triggerPrice + risk * 2.5 : triggerPrice - risk * 2.5).toFixed(2));
  const tp3 = Number((isBull ? triggerPrice + risk * 3.8 : triggerPrice - risk * 3.8).toFixed(2));

  return {
    id: `tos-${sig.id.toLowerCase()}-${symbol.toUpperCase()}-${timeframe}`,
    symbol: symbol.toUpperCase(),
    timeframe,
    type: isBull ? 'BULLISH_DOUBLE' : 'BEARISH_DOUBLE',
    qualityScore: report.compositeStrength,
    points: [],
    currentPrice: price,
    triggerPrice,
    stopLoss,
    fibLevels: {
      fib0: stopLoss,
      fib236: triggerPrice,
      fib382: tp1,
      fib500: Number(((tp1 + tp2) / 2).toFixed(2)),
      fib618: tp2,
      fib1000: tp3,
    },
    targets: { tp1, tp2, tp3 },
    riskRewardRatio: 2.5,
    confluenceChecks: {
      priceDivergence: true,
      macdDivergence: report.matchedIds.includes('MACD_ZERO_CROSS'),
      rsiDivergence: report.matchedIds.includes('ROC_EXTREME') || report.matchedIds.includes('SMA50_REVERSION'),
      volumeExhaustion: report.matchedIds.includes('UNUSUAL_VOLUME') || report.matchedIds.includes('VZO_SIGNAL'),
      macdCrossConfirmed: report.matchedIds.includes('MACD_ZERO_CROSS'),
    },
    scalingTranches: {
      tranche1: '33% on trigger break',
      tranche2: '33% on EMA/VWAP retest',
      tranche3: '34% runner to 2.5R–3.8R',
    },
    detectedAt: Date.now(),
  };
}

export interface RelativePerformanceResult {
  lookbackBars: number;
  symbolReturnPct: number;
  benchmarkReturnPct: number;
  alphaVsBenchmarkPct: number;
}

/**
 * Computes benchmark-relative return alpha over the trailing `lookbackBars` (default 30 bars)
 * using real OHLCV closes (adapted from TOS Relative Performance vs SPY dashboard).
 */
export function computeRelativePerformanceVsBenchmark(
  candles: Candle[],
  benchmarkCandles: Candle[],
  lookbackBars: number = 30
): RelativePerformanceResult | null {
  if (!Array.isArray(candles) || !Array.isArray(benchmarkCandles)) return null;
  const maxAvailable = Math.min(candles.length - 1, benchmarkCandles.length - 1);
  if (maxAvailable < 10) return null;

  const effectiveLookback = Math.min(Math.max(10, Math.floor(lookbackBars)), maxAvailable);
  const symLast = candles[candles.length - 1]?.close;
  const symBase = candles[candles.length - 1 - effectiveLookback]?.close;
  const benchLast = benchmarkCandles[benchmarkCandles.length - 1]?.close;
  const benchBase = benchmarkCandles[benchmarkCandles.length - 1 - effectiveLookback]?.close;

  if (
    !Number.isFinite(symLast) ||
    !Number.isFinite(symBase) ||
    !Number.isFinite(benchLast) ||
    !Number.isFinite(benchBase) ||
    symBase <= 0 ||
    benchBase <= 0
  ) {
    return null;
  }

  const symbolReturnPct = ((symLast - symBase) / symBase) * 100;
  const benchmarkReturnPct = ((benchLast - benchBase) / benchBase) * 100;
  const alphaVsBenchmarkPct = symbolReturnPct - benchmarkReturnPct;

  return {
    lookbackBars: effectiveLookback,
    symbolReturnPct: Number(symbolReturnPct.toFixed(2)),
    benchmarkReturnPct: Number(benchmarkReturnPct.toFixed(2)),
    alphaVsBenchmarkPct: Number(alphaVsBenchmarkPct.toFixed(2)),
  };
}

