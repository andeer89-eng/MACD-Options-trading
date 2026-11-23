/**
 * Volume Spike & Change Detector Pro — Pure TypeScript Engine
 * Implements the full 408-line v6 Pine Script specification:
 *  - Buy vs Sell Volume split via intra-candle range position:
 *      buyVol  = V * (C - L) / max(H - L, 1e-9)
 *      sellVol = V * (H - C) / max(H - L, 1e-9)
 *  - Rolling SMA & Z-Score Volume Spike detection (> 2.0 sigma)
 *  - Churn / Absorption detection: isSpike && range < ATR(14) * 0.5
 *  - Cumulative Volume Delta (CVD)
 *  - Weekly & Monthly Rolling Volume & Delta Accumulators with WoW / MoM % change
 *  - MTF Sentiment Score (-10 .. +10): bar (+-4) + week (+-3) + month (+-3)
 */

import type { Candle } from './trullasStrategy';

export interface VolumeSpikeConfig {
  maLen?: number;
  spikeMult?: number;
  atrLen?: number;
  churnMult?: number;
}

export interface VolumeSpikeBar {
  time: number;
  totalVol: number;
  buyVol: number;
  sellVol: number;
  delta: number;
  buyPct: number;
  sellPct: number;
  volMA: number;
  zScore: number;
  isSpike: boolean;
  isBuyDom: boolean;
  isChurn: boolean;
  cvd: number;
}

export interface VolumeSpikeDashboard {
  totalVol: number;
  volMA: number;
  pctOfMa: number;
  zScore: number;
  isSpike: boolean;
  isChurn: boolean;
  recentChurn3Bars: boolean;
  buyVol: number;
  sellVol: number;
  buyPct: number;
  sellPct: number;
  barDelta: number;
  curWeekVol: number;
  prevWeekVol: number;
  weekVolChgPct: number | null;
  curWeekDelta: number;
  prevWeekDelta: number;
  weekDeltaChgPct: number | null;
  curMonthVol: number;
  prevMonthVol: number;
  monthVolChgPct: number | null;
  curMonthDelta: number;
  prevMonthDelta: number;
  monthDeltaChgPct: number | null;
  mtfSentimentScore: number; // -10 .. +10
  sentimentLabel: 'STRONG BULL' | 'BULL' | 'NEUTRAL' | 'BEAR' | 'STRONG BEAR';
}

export interface VolumeSpikeReport {
  bars: VolumeSpikeBar[];
  dashboard: VolumeSpikeDashboard;
}

function getIsoWeekKey(tsMs: number): string {
  const d = new Date(tsMs);
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function getMonthKey(tsMs: number): string {
  const d = new Date(tsMs);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function pctChange(curr: number, prev: number): number | null {
  if (!Number.isFinite(prev) || Math.abs(prev) < 1e-6) return null;
  return Number((((curr - prev) / Math.abs(prev)) * 100).toFixed(2));
}

function scoreLayerFromBuyPct(buyPct: number, maxPts: number): number {
  const dom = Math.max(buyPct, 100 - buyPct);
  const sign = buyPct >= 50 ? 1 : -1;
  if (maxPts === 4) {
    if (dom >= 70) return sign * 4;
    if (dom >= 60) return sign * 3;
    if (dom >= 55) return sign * 2;
    if (dom > 50.5) return sign * 1;
    return 0;
  }
  if (dom >= 65) return sign * 3;
  if (dom >= 56) return sign * 2;
  if (dom > 50.5) return sign * 1;
  return 0;
}

export function calculateVolumeSpikeDetector(
  candles: Candle[],
  cfg: VolumeSpikeConfig = {}
): VolumeSpikeReport {
  const maLen = cfg.maLen ?? 20;
  const spikeMult = cfg.spikeMult ?? 2.0;
  const atrLen = cfg.atrLen ?? 14;
  const churnMult = cfg.churnMult ?? 0.5;

  const n = candles.length;
  if (n === 0) {
    return {
      bars: [],
      dashboard: {
        totalVol: 0,
        volMA: 0,
        pctOfMa: 100,
        zScore: 0,
        isSpike: false,
        isChurn: false,
        recentChurn3Bars: false,
        buyVol: 0,
        sellVol: 0,
        buyPct: 50,
        sellPct: 50,
        barDelta: 0,
        curWeekVol: 0,
        prevWeekVol: 0,
        weekVolChgPct: null,
        curWeekDelta: 0,
        prevWeekDelta: 0,
        weekDeltaChgPct: null,
        curMonthVol: 0,
        prevMonthVol: 0,
        monthVolChgPct: null,
        curMonthDelta: 0,
        prevMonthDelta: 0,
        monthDeltaChgPct: null,
        mtfSentimentScore: 0,
        sentimentLabel: 'NEUTRAL',
      },
    };
  }

  // ATR(14) for churn detection
  const atrArr = new Array<number>(n).fill(0);
  let trSum = 0;
  for (let i = 0; i < n; i++) {
    const c = candles[i];
    const tr =
      i === 0
        ? Math.max(0, c.high - c.low)
        : Math.max(
            c.high - c.low,
            Math.abs(c.high - candles[i - 1].close),
            Math.abs(c.low - candles[i - 1].close)
          );
    if (i < atrLen) {
      trSum += tr;
      atrArr[i] = trSum / (i + 1);
    } else {
      atrArr[i] = (atrArr[i - 1] * (atrLen - 1) + tr) / atrLen;
    }
  }

  const bars: VolumeSpikeBar[] = [];
  let cvd = 0;

  // Weekly & Monthly rolling accumulators
  let curWeekKey = '';
  let curWeekVol = 0;
  let curWeekBuy = 0;
  let curWeekSell = 0;
  let curWeekDelta = 0;
  let prevWeekVol = 0;
  let prevWeekDelta = 0;

  let curMonthKey = '';
  let curMonthVol = 0;
  let curMonthBuy = 0;
  let curMonthSell = 0;
  let curMonthDelta = 0;
  let prevMonthVol = 0;
  let prevMonthDelta = 0;

  for (let i = 0; i < n; i++) {
    const c = candles[i];
    const totalVol = Number.isFinite(c.volume) && c.volume > 0 ? c.volume : 0;
    const rng = Math.max(c.high - c.low, 1e-9);
    const buyVol = c.high - c.low > 1e-9 ? (totalVol * (c.close - c.low)) / rng : totalVol * 0.5;
    const sellVol = totalVol - buyVol;
    const delta = buyVol - sellVol;
    const buyPct = totalVol > 0 ? (buyVol / totalVol) * 100 : 50;
    const sellPct = 100 - buyPct;
    cvd += delta;

    // Rolling Vol MA & StdDev
    const winStart = Math.max(0, i - maLen + 1);
    const winCount = i - winStart + 1;
    let sum = 0;
    for (let k = winStart; k <= i; k++) {
      sum += Math.max(0, candles[k].volume || 0);
    }
    const volMA = winCount > 0 ? sum / winCount : totalVol;
    let sqSum = 0;
    for (let k = winStart; k <= i; k++) {
      const diff = Math.max(0, candles[k].volume || 0) - volMA;
      sqSum += diff * diff;
    }
    const volStd = winCount > 1 ? Math.sqrt(sqSum / winCount) : 0;
    const zScore = volStd > 0 ? (totalVol - volMA) / volStd : 0;
    const isSpike = zScore > spikeMult;
    const isBuyDom = buyVol >= sellVol;
    const isChurn = isSpike && c.high - c.low < atrArr[i] * churnMult;

    bars.push({
      time: Math.floor(c.timestamp / 1000),
      totalVol,
      buyVol,
      sellVol,
      delta,
      buyPct: Number(buyPct.toFixed(1)),
      sellPct: Number(sellPct.toFixed(1)),
      volMA,
      zScore: Number(zScore.toFixed(2)),
      isSpike,
      isBuyDom,
      isChurn,
      cvd,
    });

    // Weekly rollover
    const wkKey = getIsoWeekKey(c.timestamp);
    if (curWeekKey === '') {
      curWeekKey = wkKey;
    } else if (wkKey !== curWeekKey) {
      prevWeekVol = curWeekVol;
      prevWeekDelta = curWeekDelta;
      curWeekKey = wkKey;
      curWeekVol = 0;
      curWeekBuy = 0;
      curWeekSell = 0;
      curWeekDelta = 0;
    }
    curWeekVol += totalVol;
    curWeekBuy += buyVol;
    curWeekSell += sellVol;
    curWeekDelta += delta;

    // Monthly rollover
    const moKey = getMonthKey(c.timestamp);
    if (curMonthKey === '') {
      curMonthKey = moKey;
    } else if (moKey !== curMonthKey) {
      prevMonthVol = curMonthVol;
      prevMonthDelta = curMonthDelta;
      curMonthKey = moKey;
      curMonthVol = 0;
      curMonthBuy = 0;
      curMonthSell = 0;
      curMonthDelta = 0;
    }
    curMonthVol += totalVol;
    curMonthBuy += buyVol;
    curMonthSell += sellVol;
    curMonthDelta += delta;
  }

  const last = bars[bars.length - 1];
  const recentChurn3Bars = bars.slice(-3).some((b) => b.isChurn);
  const weekBuyPct = curWeekVol > 0 ? (curWeekBuy / curWeekVol) * 100 : 50;
  const monthBuyPct = curMonthVol > 0 ? (curMonthBuy / curMonthVol) * 100 : 50;

  const barPts = scoreLayerFromBuyPct(last.buyPct, 4);
  const weekPts = scoreLayerFromBuyPct(weekBuyPct, 3);
  const monthPts = scoreLayerFromBuyPct(monthBuyPct, 3);
  const mtfSentimentScore = Math.max(-10, Math.min(10, barPts + weekPts + monthPts));

  const sentimentLabel: VolumeSpikeDashboard['sentimentLabel'] =
    mtfSentimentScore >= 6
      ? 'STRONG BULL'
      : mtfSentimentScore >= 2
        ? 'BULL'
        : mtfSentimentScore <= -6
          ? 'STRONG BEAR'
          : mtfSentimentScore <= -2
            ? 'BEAR'
            : 'NEUTRAL';

  return {
    bars,
    dashboard: {
      totalVol: last.totalVol,
      volMA: last.volMA,
      pctOfMa: last.volMA > 0 ? Math.round((last.totalVol / last.volMA) * 100) : 100,
      zScore: last.zScore,
      isSpike: last.isSpike,
      isChurn: last.isChurn,
      recentChurn3Bars,
      buyVol: last.buyVol,
      sellVol: last.sellVol,
      buyPct: last.buyPct,
      sellPct: last.sellPct,
      barDelta: last.delta,
      curWeekVol,
      prevWeekVol,
      weekVolChgPct: pctChange(curWeekVol, prevWeekVol),
      curWeekDelta,
      prevWeekDelta,
      weekDeltaChgPct: pctChange(curWeekDelta, prevWeekDelta),
      curMonthVol,
      prevMonthVol,
      monthVolChgPct: pctChange(curMonthVol, prevMonthVol),
      curMonthDelta,
      prevMonthDelta,
      monthDeltaChgPct: pctChange(curMonthDelta, prevMonthDelta),
      mtfSentimentScore,
      sentimentLabel,
    },
  };
}
