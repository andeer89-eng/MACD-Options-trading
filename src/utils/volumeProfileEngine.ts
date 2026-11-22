import type { Candle, DivergenceSetup, IndicatorPoint } from './trullasStrategy';
import type { NadarayaWatsonResult, SmartMoneyConceptsResult } from './luxalgoIndicators';

export interface VolumeProfileBin {
  index: number;
  bottom: number;
  top: number;
  mid: number;
  volume: number;
  buyVolume: number;
  sellVolume: number;
  delta: number;
  pctOfTotal: number;
  pctOfMax: number;
  isPoc: boolean;
  inValueArea: boolean;
  nodeType: 'POC' | 'HVN' | 'LVN' | 'NORMAL';
}

export interface VolumeProfileResult {
  bins: VolumeProfileBin[];
  poc: number;
  vah: number;
  val: number;
  pocVolume: number;
  totalVolume: number;
  valueAreaVolumePct: number;
  rangeHigh: number;
  rangeLow: number;
  hvnLevels: number[];
  lvnLevels: number[];
  developingPoc: Array<{ time: number; poc: number }>;
  barCount: number;
}

export interface VolumeProfileOptions {
  rows?: number;
  valueAreaPct?: number;
  lookbackBars?: number;
}

/**
 * Compute Visible-Range / Session Volume Profile (POC, VAH, VAL, HVN, LVN)
 * modeled on TradingView VRVP & Market Profile 70% Value Area accumulation.
 */
export function computeVolumeProfile(
  candles: Candle[],
  options: VolumeProfileOptions = {}
): VolumeProfileResult | null {
  if (!Array.isArray(candles) || candles.length === 0) return null;

  const validCandles = candles.filter(
    (c) =>
      c &&
      Number.isFinite(c.high) &&
      Number.isFinite(c.low) &&
      Number.isFinite(c.close) &&
      c.high > 0 &&
      c.low > 0
  );
  if (validCandles.length === 0) return null;

  const sliced =
    options.lookbackBars && options.lookbackBars > 0 && validCandles.length > options.lookbackBars
      ? validCandles.slice(-options.lookbackBars)
      : validCandles;

  const rows = Math.max(12, Math.min(96, Math.round(options.rows ?? 48)));
  const targetVaRatio = Math.max(0.5, Math.min(0.9, options.valueAreaPct ?? 0.7));

  let rangeLow = Infinity;
  let rangeHigh = -Infinity;
  for (const c of sliced) {
    if (c.low < rangeLow) rangeLow = c.low;
    if (c.high > rangeHigh) rangeHigh = c.high;
  }

  if (!Number.isFinite(rangeLow) || !Number.isFinite(rangeHigh)) return null;
  if (rangeHigh <= rangeLow) {
    const pad = Math.max(0.01, rangeLow * 0.005);
    rangeLow -= pad;
    rangeHigh += pad;
  }

  const binHeight = (rangeHigh - rangeLow) / rows;
  const buyVols = new Float64Array(rows);
  const sellVols = new Float64Array(rows);

  for (const c of sliced) {
    const barVol = Number.isFinite(c.volume) && c.volume > 0 ? c.volume : 1;
    const span = Math.max(1e-9, c.high - c.low);
    const closePos = Math.max(0, Math.min(1, (c.close - c.low) / span));
    // Directionally split candle volume using close position + open-close impulse bias
    const bodyBias = c.close >= c.open ? 0.58 : 0.42;
    const buyRatio = Math.max(0.15, Math.min(0.85, closePos * 0.65 + bodyBias * 0.35));

    const startBin = Math.max(0, Math.min(rows - 1, Math.floor((c.low - rangeLow) / binHeight)));
    const endBin = Math.max(startBin, Math.min(rows - 1, Math.floor((c.high - rangeLow - 1e-9) / binHeight)));
    const binSpan = endBin - startBin + 1;

    const volPerBin = barVol / binSpan;
    const buyPerBin = volPerBin * buyRatio;
    const sellPerBin = volPerBin * (1 - buyRatio);

    for (let b = startBin; b <= endBin; b++) {
      buyVols[b] += buyPerBin;
      sellVols[b] += sellPerBin;
    }
  }

  let totalVolume = 0;
  let pocIdx = 0;
  let maxVol = -1;
  const totals = new Float64Array(rows);

  for (let i = 0; i < rows; i++) {
    const v = buyVols[i] + sellVols[i];
    totals[i] = v;
    totalVolume += v;
    if (v > maxVol) {
      maxVol = v;
      pocIdx = i;
    }
  }

  if (totalVolume <= 0 || maxVol <= 0) return null;

  // Value Area (70% by volume) expanding symmetrically outward from POC
  const inVa = new Uint8Array(rows);
  inVa[pocIdx] = 1;
  let vaVolume = totals[pocIdx];
  let upIdx = pocIdx + 1;
  let dnIdx = pocIdx - 1;
  const targetVol = totalVolume * targetVaRatio;

  while (vaVolume < targetVol && (upIdx < rows || dnIdx >= 0)) {
    const upStep = (upIdx < rows ? totals[upIdx] : 0) + (upIdx + 1 < rows ? totals[upIdx + 1] : 0);
    const dnStep = (dnIdx >= 0 ? totals[dnIdx] : 0) + (dnIdx - 1 >= 0 ? totals[dnIdx - 1] : 0);

    if (upIdx >= rows && dnIdx < 0) break;

    if (upIdx < rows && (dnIdx < 0 || upStep >= dnStep)) {
      inVa[upIdx] = 1;
      vaVolume += totals[upIdx];
      upIdx++;
      if (vaVolume < targetVol && upIdx < rows && totals[upIdx] > 0) {
        inVa[upIdx] = 1;
        vaVolume += totals[upIdx];
        upIdx++;
      }
    } else if (dnIdx >= 0) {
      inVa[dnIdx] = 1;
      vaVolume += totals[dnIdx];
      dnIdx--;
      if (vaVolume < targetVol && dnIdx >= 0 && totals[dnIdx] > 0) {
        inVa[dnIdx] = 1;
        vaVolume += totals[dnIdx];
        dnIdx--;
      }
    }
  }

  let valIdx = pocIdx;
  let vahIdx = pocIdx;
  for (let i = 0; i < rows; i++) {
    if (inVa[i]) {
      valIdx = i;
      break;
    }
  }
  for (let i = rows - 1; i >= 0; i--) {
    if (inVa[i]) {
      vahIdx = i;
      break;
    }
  }

  const meanBinVol = totalVolume / rows;
  const hvnLevels: number[] = [];
  const lvnLevels: number[] = [];

  const bins: VolumeProfileBin[] = [];
  for (let i = 0; i < rows; i++) {
    const bottom = rangeLow + i * binHeight;
    const top = bottom + binHeight;
    const mid = (bottom + top) / 2;
    const vol = totals[i];
    const prevVol = i > 0 ? totals[i - 1] : vol;
    const nextVol = i < rows - 1 ? totals[i + 1] : vol;

    let nodeType: VolumeProfileBin['nodeType'] = 'NORMAL';
    if (i === pocIdx) {
      nodeType = 'POC';
    } else if (vol >= meanBinVol * 1.35 && vol >= prevVol && vol >= nextVol) {
      nodeType = 'HVN';
      hvnLevels.push(Number(mid.toFixed(2)));
    } else if (i > 2 && i < rows - 3 && vol > 0 && vol <= meanBinVol * 0.45 && vol <= prevVol && vol <= nextVol) {
      nodeType = 'LVN';
      lvnLevels.push(Number(mid.toFixed(2)));
    }

    bins.push({
      index: i,
      bottom: Number(bottom.toFixed(4)),
      top: Number(top.toFixed(4)),
      mid: Number(mid.toFixed(2)),
      volume: Math.round(vol),
      buyVolume: Math.round(buyVols[i]),
      sellVolume: Math.round(sellVols[i]),
      delta: Math.round(buyVols[i] - sellVols[i]),
      pctOfTotal: Number(((vol / totalVolume) * 100).toFixed(2)),
      pctOfMax: Number(((vol / maxVol) * 100).toFixed(2)),
      isPoc: i === pocIdx,
      inValueArea: Boolean(inVa[i]),
      nodeType,
    });
  }

  // Rolling Developing POC trajectory (bucketed across active slice)
  const developingPoc: Array<{ time: number; poc: number }> = [];
  const runningBins = new Float64Array(rows);
  let curPocIdx = pocIdx;
  let curMax = 0;
  for (let idx = 0; idx < sliced.length; idx++) {
    const c = sliced[idx];
    const barVol = Number.isFinite(c.volume) && c.volume > 0 ? c.volume : 1;
    const startBin = Math.max(0, Math.min(rows - 1, Math.floor((c.low - rangeLow) / binHeight)));
    const endBin = Math.max(startBin, Math.min(rows - 1, Math.floor((c.high - rangeLow - 1e-9) / binHeight)));
    const perBin = barVol / (endBin - startBin + 1);
    for (let b = startBin; b <= endBin; b++) {
      runningBins[b] += perBin;
      if (runningBins[b] > curMax) {
        curMax = runningBins[b];
        curPocIdx = b;
      }
    }
    const timeSec = c.timestamp > 1e12 ? Math.floor(c.timestamp / 1000) : c.timestamp;
    developingPoc.push({
      time: timeSec,
      poc: Number((rangeLow + (curPocIdx + 0.5) * binHeight).toFixed(2)),
    });
  }

  const poc = Number((rangeLow + (pocIdx + 0.5) * binHeight).toFixed(2));
  const vah = Number((rangeLow + (vahIdx + 1) * binHeight).toFixed(2));
  const val = Number((rangeLow + valIdx * binHeight).toFixed(2));

  return {
    bins,
    poc,
    vah,
    val,
    pocVolume: Math.round(maxVol),
    totalVolume: Math.round(totalVolume),
    valueAreaVolumePct: Number(((vaVolume / totalVolume) * 100).toFixed(1)),
    rangeHigh: Number(rangeHigh.toFixed(2)),
    rangeLow: Number(rangeLow.toFixed(2)),
    hvnLevels,
    lvnLevels,
    developingPoc,
    barCount: sliced.length,
  };
}

export type ValueAreaPosition =
  | 'ABOVE_VAH'
  | 'UPPER_VA'
  | 'AT_POC'
  | 'LOWER_VA'
  | 'BELOW_VAL';

export interface ChartPocReading {
  symbol: string;
  timeframe: string;
  spotPrice: number;
  poc: number;
  vah: number;
  val: number;
  pocDistancePct: number;
  valueAreaWidthPct: number;
  vaPosition: ValueAreaPosition;
  vaPositionLabel: string;
  bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  archetype: string;
  nearestHvnSupport: number | null;
  nearestHvnResistance: number | null;
  nearestLvnVacuum: number | null;
  nweState: 'LOWER_DEMAND' | 'UPPER_SUPPLY' | 'INSIDE_ENVELOPE' | 'UNAVAILABLE';
  smcZone: 'DISCOUNT' | 'PREMIUM' | 'EQUILIBRIUM' | 'UNAVAILABLE';
  activeBullishObs: number;
  activeBearishObs: number;
  activeFvgs: number;
  rsi: number | null;
  macdHistogram: number | null;
  primaryMagnet: { price: number; label: string };
  invalidation: { price: number; label: string };
  thesisBullets: string[];
}

export function analyzeChartWithPoc(params: {
  symbol: string;
  timeframe: string;
  candles: Candle[];
  profile: VolumeProfileResult | null;
  indicatorPoints?: IndicatorPoint[];
  activeSetup?: DivergenceSetup | null;
  nwe?: NadarayaWatsonResult | null;
  smc?: SmartMoneyConceptsResult | null;
}): ChartPocReading | null {
  const { symbol, timeframe, candles, profile, indicatorPoints, activeSetup, nwe, smc } = params;
  if (!profile || candles.length === 0) return null;

  const lastCandle = candles[candles.length - 1];
  const spotPrice = Number(lastCandle.close.toFixed(2));
  const { poc, vah, val, hvnLevels, lvnLevels } = profile;

  const pocDistancePct = poc > 0 ? Number((((spotPrice - poc) / poc) * 100).toFixed(2)) : 0;
  const valueAreaWidthPct = val > 0 ? Number((((vah - val) / val) * 100).toFixed(2)) : 0;
  const pocTolerance = Math.max(0.01, (vah - val) * 0.08);

  let vaPosition: ValueAreaPosition;
  let vaPositionLabel: string;
  if (spotPrice > vah) {
    vaPosition = 'ABOVE_VAH';
    vaPositionLabel = 'Above Value Area High (Breakout Acceptance)';
  } else if (spotPrice < val) {
    vaPosition = 'BELOW_VAL';
    vaPositionLabel = 'Below Value Area Low (Markdown / Discount)';
  } else if (Math.abs(spotPrice - poc) <= pocTolerance) {
    vaPosition = 'AT_POC';
    vaPositionLabel = 'At Point of Control (High-Liquidity Balance)';
  } else if (spotPrice > poc) {
    vaPosition = 'UPPER_VA';
    vaPositionLabel = 'Upper Value Area (POC -> VAH Rotation)';
  } else {
    vaPosition = 'LOWER_VA';
    vaPositionLabel = 'Lower Value Area (VAL -> POC Rotation)';
  }

  const hvnBelow = hvnLevels.filter((p) => p < spotPrice * 0.997).sort((a, b) => b - a);
  const hvnAbove = hvnLevels.filter((p) => p > spotPrice * 1.003).sort((a, b) => a - b);
  const nearestHvnSupport = hvnBelow[0] ?? (val < spotPrice ? val : null);
  const nearestHvnResistance = hvnAbove[0] ?? (vah > spotPrice ? vah : null);

  let nearestLvnVacuum: number | null = null;
  if (lvnLevels.length > 0) {
    nearestLvnVacuum = [...lvnLevels].sort(
      (a, b) => Math.abs(a - spotPrice) - Math.abs(b - spotPrice)
    )[0];
  }

  const lastInd = indicatorPoints && indicatorPoints.length > 0 ? indicatorPoints[indicatorPoints.length - 1] : null;
  const rsi = lastInd && Number.isFinite(lastInd.rsi) ? Number(lastInd.rsi.toFixed(1)) : null;
  const macdHistogram =
    lastInd && Number.isFinite(lastInd.histogram) ? Number(lastInd.histogram.toFixed(3)) : null;

  let nweState: ChartPocReading['nweState'] = 'UNAVAILABLE';
  if (nwe && nwe.upper.length > 0 && nwe.lower.length > 0) {
    const up = nwe.upper[nwe.upper.length - 1];
    const lo = nwe.lower[nwe.lower.length - 1];
    if (spotPrice <= lo * 1.01) nweState = 'LOWER_DEMAND';
    else if (spotPrice >= up * 0.99) nweState = 'UPPER_SUPPLY';
    else nweState = 'INSIDE_ENVELOPE';
  }

  const smcZone: ChartPocReading['smcZone'] = smc?.premiumDiscountZone?.currentZone ?? 'UNAVAILABLE';
  const activeBullishObs = smc ? smc.activeOrderBlocks.filter((o) => o.type === 'BULLISH_OB').length : 0;
  const activeBearishObs = smc ? smc.activeOrderBlocks.filter((o) => o.type === 'BEARISH_OB').length : 0;
  const activeFvgs = smc ? smc.activeFVGs.length : 0;

  let bias: ChartPocReading['bias'] = 'NEUTRAL';
  let archetype = 'Value Area Equilibrium Rotation';
  let primaryMagnet = { price: poc, label: 'Point of Control (POC)' };
  let invalidation = { price: val, label: 'Value Area Low (VAL)' };

  if (vaPosition === 'ABOVE_VAH') {
    bias = 'BULLISH';
    archetype = 'Imbalance Markup Above Value Area';
    primaryMagnet = nearestHvnResistance
      ? { price: nearestHvnResistance, label: 'Upper HVN Shelf' }
      : { price: Number((vah + (vah - poc) * 0.618).toFixed(2)), label: 'VAH Extension (0.618 VA)' };
    invalidation = { price: vah, label: 'Re-Acceptance Below VAH' };
  } else if (vaPosition === 'BELOW_VAL') {
    bias = activeSetup?.type.includes('BULL') || nweState === 'LOWER_DEMAND' ? 'NEUTRAL' : 'BEARISH';
    archetype =
      activeSetup?.type.includes('BULL') || nweState === 'LOWER_DEMAND'
        ? 'Failed Breakdown / Reclaim Watch'
        : 'Markdown Below Value Area';
    primaryMagnet =
      activeSetup?.type.includes('BULL') || nweState === 'LOWER_DEMAND'
        ? { price: val, label: 'VAL Reclaim Trigger' }
        : { price: Number(Math.max(0.01, val - (poc - val) * 0.618).toFixed(2)), label: 'VAL Downside Extension' };
    invalidation =
      activeSetup?.type.includes('BULL')
        ? { price: Number(activeSetup.stopLoss.toFixed(2)), label: 'Setup Structure Stop' }
        : { price: val, label: 'Close Above VAL' };
  } else if (vaPosition === 'LOWER_VA') {
    bias = spotPrice > val && (macdHistogram ?? 0) >= 0 ? 'BULLISH' : 'NEUTRAL';
    archetype = '80% Value Area Rotation Toward POC';
    primaryMagnet = { price: poc, label: 'POC Balance Magnet' };
    invalidation = { price: val, label: 'Loss of VAL Support' };
  } else if (vaPosition === 'UPPER_VA') {
    bias = (macdHistogram ?? 0) >= 0 ? 'BULLISH' : 'NEUTRAL';
    archetype = 'Upper Value Drift Toward VAH';
    primaryMagnet = { price: vah, label: 'VAH Breakout Ceiling' };
    invalidation = { price: poc, label: 'Break Below POC' };
  } else {
    bias = activeSetup?.type.includes('BULL') ? 'BULLISH' : activeSetup?.type.includes('BEAR') ? 'BEARISH' : 'NEUTRAL';
    archetype = 'Coiling at High-Volume POC Node';
    primaryMagnet =
      bias === 'BEARISH'
        ? { price: val, label: 'VAL Lower Boundary' }
        : { price: vah, label: 'VAH Upper Boundary' };
    invalidation = { price: bias === 'BEARISH' ? vah : val, label: bias === 'BEARISH' ? 'VAH Break' : 'VAL Break' };
  }

  const thesisBullets: string[] = [];
  thesisBullets.push(
    `Spot ($${spotPrice.toFixed(2)}) trades ${pocDistancePct >= 0 ? `+${pocDistancePct}% above` : `${Math.abs(pocDistancePct)}% below`} POC ($${poc.toFixed(2)}); 70% Value Area spans $${val.toFixed(2)}–$${vah.toFixed(2)} (${valueAreaWidthPct}% width).`
  );

  if (nearestLvnVacuum !== null) {
    const lvnDir = nearestLvnVacuum > spotPrice ? 'above' : 'below';
    thesisBullets.push(
      `Nearest LVN liquidity vacuum sits ${lvnDir} at $${nearestLvnVacuum.toFixed(2)} — price moves rapidly through thin-volume pockets once cleared.`
    );
  }

  if (activeSetup) {
    thesisBullets.push(
      `Active ${activeSetup.type.replace('_', ' ')} setup (Score ${activeSetup.qualityScore}%, R:R 1:${activeSetup.riskRewardRatio}) targets $${activeSetup.targets.tp1.toFixed(2)} / $${activeSetup.targets.tp2.toFixed(2)} against $${activeSetup.stopLoss.toFixed(2)} stop.`
    );
  } else if (smc) {
    thesisBullets.push(
      `SMC places price in ${smcZone} with ${activeBullishObs} bullish / ${activeBearishObs} bearish active Order Blocks and ${activeFvgs} open Fair Value Gaps.`
    );
  }

  if (rsi !== null) {
    const rsiDesc = rsi >= 70 ? 'Overbought' : rsi <= 30 ? 'Oversold' : rsi >= 52 ? 'Bullish Momentum' : rsi <= 48 ? 'Soft Momentum' : 'Neutral';
    thesisBullets.push(
      `RSI(14) reads ${rsi} (${rsiDesc})${macdHistogram !== null ? ` with MACD histogram ${macdHistogram >= 0 ? '+' : ''}${macdHistogram}` : ''}${nweState !== 'UNAVAILABLE' ? ` inside NWE (${nweState.replace('_', ' ')})` : ''}.`
    );
  }

  return {
    symbol,
    timeframe,
    spotPrice,
    poc,
    vah,
    val,
    pocDistancePct,
    valueAreaWidthPct,
    vaPosition,
    vaPositionLabel,
    bias,
    archetype,
    nearestHvnSupport,
    nearestHvnResistance,
    nearestLvnVacuum,
    nweState,
    smcZone,
    activeBullishObs,
    activeBearishObs,
    activeFvgs,
    rsi,
    macdHistogram,
    primaryMagnet,
    invalidation,
    thesisBullets: thesisBullets.slice(0, 4),
  };
}
