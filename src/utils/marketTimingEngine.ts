/**
 * Institutional Market Timing Engine:
 *  1. IBD Distribution Day Monitor (William O'Neil / Investor's Business Daily rules)
 *     - Distribution day: close <= prevClose * (1 - 0.002) AND volume > prevVolume
 *     - Active window: 25 trading sessions, OR invalidated if post-DD high rallies >= +5% above DD close
 *     - Tracked on SPY (S&P 500) & QQQ (Nasdaq-100)
 *  2. Follow-Through Day (FTD) Bottom Detector
 *     - Detects >= 3% pullback off rolling high
 *     - Tracks Rally Attempt Day 1 (first up/rebound hold day off swing low)
 *     - Qualifying FTD on Day 4..15: close gain >= +1.25% (Strong >= +1.7%) on higher volume than prev session
 *     - Rally attempt invalidates immediately if intraday low < Day 1 low
 */

import type { Candle } from './trullasStrategy.ts';

export type DistributionRiskLevel = 'NORMAL' | 'CAUTION' | 'HIGH' | 'SEVERE';

export interface DistributionDayEvent {
  date: string;
  dropPct: number;
  close: number;
  volumeRatioVsPrev: number;
  ageTradingDays: number;
  isStall: boolean;
}

export interface IndexDistributionSummary {
  symbol: string;
  close: number;
  pctFromSma50: number | null;
  pctFromEma21: number | null;
  activeCount25: number;
  countLast15: number;
  countLast5: number;
  riskLevel: DistributionRiskLevel;
  activeDays: DistributionDayEvent[];
}

export type FtdState =
  | 'CONFIRMED_UPTREND'
  | 'PULLBACK_NO_RALLY'
  | 'RALLY_ATTEMPT'
  | 'FTD_CONFIRMED'
  | 'RALLY_FAILED';

export interface FollowThroughDayEvent {
  date: string;
  rallyDay: number;
  gainPct: number;
  volumeRatioVsPrev: number;
  quality: 'STRONG' | 'QUALIFIED' | 'LATE';
}

export interface IndexFtdSummary {
  symbol: string;
  state: FtdState;
  correctionDepthPct: number;
  swingHighDate: string | null;
  swingLowDate: string | null;
  day1Date: string | null;
  day1Low: number | null;
  rallyDayCount: number;
  latestFtd: FollowThroughDayEvent | null;
  summary: string;
}

export interface MarketTimingReport {
  asOf: string;
  overallRisk: DistributionRiskLevel;
  exposureGuidance: string;
  spyDistribution: IndexDistributionSummary | null;
  qqqDistribution: IndexDistributionSummary | null;
  ftdStatus: {
    marketRegimeLabel: 'CONFIRMED_UPTREND' | 'FTD_CONFIRMED' | 'RALLY_ATTEMPT' | 'CORRECTION_UNDER_PRESSURE';
    spy: IndexFtdSummary | null;
    qqq: IndexFtdSummary | null;
    summary: string;
  };
}

function smaAt(candles: Candle[], idx: number, period: number): number | null {
  if (idx + 1 < period) return null;
  let sum = 0;
  for (let i = idx - period + 1; i <= idx; i++) sum += candles[i].close;
  return sum / period;
}

function emaLast(candles: Candle[], period: number): number | null {
  if (candles.length < period) return null;
  const k = 2 / (period + 1);
  let ema = 0;
  for (let i = 0; i < period; i++) ema += candles[i].close;
  ema /= period;
  for (let i = period; i < candles.length; i++) {
    ema = candles[i].close * k + ema * (1 - k);
  }
  return ema;
}

export function analyzeIndexDistributionDays(
  symbol: string,
  candles: Candle[],
  windowDays: number = 25
): IndexDistributionSummary | null {
  if (!Array.isArray(candles) || candles.length < 10) return null;
  const n = candles.length;
  const lastIdx = n - 1;
  const startIdx = Math.max(1, n - windowDays);
  const activeDays: DistributionDayEvent[] = [];

  for (let i = startIdx; i <= lastIdx; i++) {
    const cur = candles[i];
    const prev = candles[i - 1];
    if (!cur || !prev || prev.close <= 0 || cur.volume <= 0 || prev.volume <= 0) continue;

    const dropPct = ((cur.close - prev.close) / prev.close) * 100;
    const volHigher = cur.volume > prev.volume;

    // Standard IBD distribution day: <= -0.2% drop on higher volume
    if (dropPct <= -0.2 && volHigher) {
      // Check +5% post-event invalidation (if any subsequent bar high >= 1.05 * cur.close)
      let invalidated = false;
      for (let j = i + 1; j <= lastIdx; j++) {
        if (candles[j].high >= cur.close * 1.05) {
          invalidated = true;
          break;
        }
      }
      if (!invalidated) {
        activeDays.push({
          date: cur.dateStr,
          dropPct: Number(dropPct.toFixed(2)),
          close: Number(cur.close.toFixed(2)),
          volumeRatioVsPrev: Number((cur.volume / prev.volume).toFixed(2)),
          ageTradingDays: lastIdx - i,
          isStall: false,
        });
      }
    }
  }

  const activeCount25 = activeDays.length;
  const countLast15 = activeDays.filter((d) => d.ageTradingDays < 15).length;
  const countLast5 = activeDays.filter((d) => d.ageTradingDays < 5).length;

  const sma50 = smaAt(candles, lastIdx, 50);
  const ema21 = emaLast(candles, 21);
  const lastClose = candles[lastIdx].close;
  const pctFromSma50 =
    sma50 !== null && sma50 > 0 ? Number((((lastClose - sma50) / sma50) * 100).toFixed(2)) : null;
  const pctFromEma21 =
    ema21 !== null && ema21 > 0 ? Number((((lastClose - ema21) / ema21) * 100).toFixed(2)) : null;

  const belowKeyMa =
    (pctFromSma50 !== null && pctFromSma50 < 0) || (pctFromEma21 !== null && pctFromEma21 < -1.0);

  let riskLevel: DistributionRiskLevel = 'NORMAL';
  if (activeCount25 >= 6 || countLast15 >= 4 || (belowKeyMa && activeCount25 >= 5)) {
    riskLevel = 'SEVERE';
  } else if (activeCount25 >= 5 || countLast15 >= 3 || countLast5 >= 2) {
    riskLevel = 'HIGH';
  } else if (activeCount25 >= 3 || (belowKeyMa && activeCount25 >= 2)) {
    riskLevel = 'CAUTION';
  }

  return {
    symbol: symbol.toUpperCase(),
    close: Number(lastClose.toFixed(2)),
    pctFromSma50,
    pctFromEma21,
    activeCount25,
    countLast15,
    countLast5,
    riskLevel,
    activeDays: activeDays.sort((a, b) => b.date.localeCompare(a.date)),
  };
}

export function analyzeIndexFollowThroughDay(
  symbol: string,
  candles: Candle[],
  minCorrectionPct: number = 3.0
): IndexFtdSummary | null {
  if (!Array.isArray(candles) || candles.length < 30) return null;
  const lookback = Math.min(candles.length, 90);
  const slice = candles.slice(-lookback);

  // Find trailing swing high in recent 65 bars (excluding today)
  let peakIdx = 0;
  for (let i = 0; i < slice.length - 1; i++) {
    if (slice[i].high > slice[peakIdx].high) peakIdx = i;
  }
  const peakHigh = slice[peakIdx].high;

  // Find lowest low since that peak
  let troughIdx = peakIdx;
  for (let i = peakIdx; i < slice.length; i++) {
    if (slice[i].low < slice[troughIdx].low) troughIdx = i;
  }
  const troughLow = slice[troughIdx].low;
  const correctionDepthPct = peakHigh > 0 ? ((peakHigh - troughLow) / peakHigh) * 100 : 0;

  // If no meaningful correction happened or price recovered above peak
  const last = slice[slice.length - 1];
  const sma50 = smaAt(slice, slice.length - 1, Math.min(50, slice.length));
  if (correctionDepthPct < minCorrectionPct || (last.close >= peakHigh * 0.995 && (!sma50 || last.close > sma50))) {
    return {
      symbol: symbol.toUpperCase(),
      state: 'CONFIRMED_UPTREND',
      correctionDepthPct: Number(correctionDepthPct.toFixed(2)),
      swingHighDate: slice[peakIdx].dateStr,
      swingLowDate: slice[troughIdx].dateStr,
      day1Date: null,
      day1Low: null,
      rallyDayCount: 0,
      latestFtd: null,
      summary: `${symbol.toUpperCase()} near highs (-${correctionDepthPct.toFixed(1)}% off swing peak) — no FTD bottom reset active.`,
    };
  }

  // Track Rally Attempt starting from troughIdx:
  // Day 1 is the first bar at or after troughIdx whose close > prevClose OR closes in top 50% of its range without undercutting troughLow
  let day1Idx: number | null = null;
  let day1Low: number | null = null;
  let latestFtd: FollowThroughDayEvent | null = null;
  let rallyFailed = false;

  for (let i = Math.max(1, troughIdx); i < slice.length; i++) {
    const bar = slice[i];
    const prev = slice[i - 1];

    if (day1Idx === null) {
      const range = bar.high - bar.low;
      const topHalfClose = range > 0 && bar.close >= bar.low + range * 0.5;
      const isUpDay = bar.close > prev.close;
      if (isUpDay || (i === troughIdx && topHalfClose)) {
        day1Idx = i;
        day1Low = Math.min(bar.low, troughLow);
        rallyFailed = false;
        latestFtd = null;
      }
      continue;
    }

    // Check Rally Attempt invalidation: intraday undercut below Day 1 low
    if (day1Low !== null && bar.low < day1Low) {
      day1Idx = null;
      day1Low = null;
      latestFtd = null;
      rallyFailed = true;
      continue;
    }

    const rallyDay = i - day1Idx + 1;
    const gainPct = prev.close > 0 ? ((bar.close - prev.close) / prev.close) * 100 : 0;
    const volRatio = prev.volume > 0 ? bar.volume / prev.volume : 0;

    if (rallyDay >= 4 && rallyDay <= 15 && gainPct >= 1.25 && bar.volume > prev.volume) {
      const quality: FollowThroughDayEvent['quality'] =
        rallyDay <= 10 ? (gainPct >= 1.7 ? 'STRONG' : 'QUALIFIED') : 'LATE';
      if (!latestFtd) {
        latestFtd = {
          date: bar.dateStr,
          rallyDay,
          gainPct: Number(gainPct.toFixed(2)),
          volumeRatioVsPrev: Number(volRatio.toFixed(2)),
          quality,
        };
      }
    }
  }

  if (latestFtd) {
    return {
      symbol: symbol.toUpperCase(),
      state: 'FTD_CONFIRMED',
      correctionDepthPct: Number(correctionDepthPct.toFixed(2)),
      swingHighDate: slice[peakIdx].dateStr,
      swingLowDate: slice[troughIdx].dateStr,
      day1Date: day1Idx !== null ? slice[day1Idx].dateStr : null,
      day1Low: day1Low !== null ? Number(day1Low.toFixed(2)) : null,
      rallyDayCount: day1Idx !== null ? slice.length - 1 - day1Idx + 1 : 0,
      latestFtd,
      summary: `${symbol.toUpperCase()} ${latestFtd.quality} FTD confirmed Day ${latestFtd.rallyDay} (${latestFtd.date}, +${latestFtd.gainPct}% on ${latestFtd.volumeRatioVsPrev}x vol).`,
    };
  }

  if (day1Idx !== null) {
    const rallyDayCount = slice.length - 1 - day1Idx + 1;
    return {
      symbol: symbol.toUpperCase(),
      state: 'RALLY_ATTEMPT',
      correctionDepthPct: Number(correctionDepthPct.toFixed(2)),
      swingHighDate: slice[peakIdx].dateStr,
      swingLowDate: slice[troughIdx].dateStr,
      day1Date: slice[day1Idx].dateStr,
      day1Low: day1Low !== null ? Number(day1Low.toFixed(2)) : null,
      rallyDayCount,
      latestFtd: null,
      summary: `${symbol.toUpperCase()} Rally Attempt Day ${rallyDayCount} off ${slice[troughIdx].dateStr} (-${correctionDepthPct.toFixed(1)}% pullback); awaiting +1.25% higher-vol FTD (Days 4–10).`,
    };
  }

  return {
    symbol: symbol.toUpperCase(),
    state: rallyFailed ? 'RALLY_FAILED' : 'PULLBACK_NO_RALLY',
    correctionDepthPct: Number(correctionDepthPct.toFixed(2)),
    swingHighDate: slice[peakIdx].dateStr,
    swingLowDate: slice[troughIdx].dateStr,
    day1Date: null,
    day1Low: null,
    rallyDayCount: 0,
    latestFtd: null,
    summary: `${symbol.toUpperCase()} in -${correctionDepthPct.toFixed(1)}% pullback without active Rally Attempt low held.`,
  };
}

const RISK_RANK: Record<DistributionRiskLevel, number> = {
  NORMAL: 0,
  CAUTION: 1,
  HIGH: 2,
  SEVERE: 3,
};

export function analyzeMarketTiming(params: {
  spyCandles: Candle[];
  qqqCandles?: Candle[];
}): MarketTimingReport | null {
  const { spyCandles, qqqCandles = [] } = params;
  if (!Array.isArray(spyCandles) || spyCandles.length < 10) return null;

  const spyDist = analyzeIndexDistributionDays('SPY', spyCandles);
  const qqqDist = qqqCandles.length >= 10 ? analyzeIndexDistributionDays('QQQ', qqqCandles) : null;

  const spyFtd = analyzeIndexFollowThroughDay('SPY', spyCandles);
  const qqqFtd = qqqCandles.length >= 30 ? analyzeIndexFollowThroughDay('QQQ', qqqCandles) : null;

  const spyRank = spyDist ? RISK_RANK[spyDist.riskLevel] : 0;
  const qqqRank = qqqDist ? RISK_RANK[qqqDist.riskLevel] : 0;
  const maxRank = Math.max(spyRank, qqqRank);
  const overallRisk: DistributionRiskLevel =
    maxRank === 3 ? 'SEVERE' : maxRank === 2 ? 'HIGH' : maxRank === 1 ? 'CAUTION' : 'NORMAL';

  const exposureGuidance =
    overallRisk === 'SEVERE'
      ? 'Heavy institutional distribution — raise cash / tighten stops (0–25% equity exposure).'
      : overallRisk === 'HIGH'
      ? 'Elevated distribution pressure — trim weak longs, favor only top RS/breakouts (25–50% exposure).'
      : overallRisk === 'CAUTION'
      ? 'Moderate distribution count — selective entries, monitor 21EMA/50SMA support (50–75% exposure).'
      : 'Low distribution cluster — healthy institutional sponsorship (75–100% exposure allowed).';

  let marketRegimeLabel: MarketTimingReport['ftdStatus']['marketRegimeLabel'] = 'CONFIRMED_UPTREND';
  if (spyFtd?.state === 'FTD_CONFIRMED' || qqqFtd?.state === 'FTD_CONFIRMED') {
    marketRegimeLabel = 'FTD_CONFIRMED';
  } else if (spyFtd?.state === 'RALLY_ATTEMPT' || qqqFtd?.state === 'RALLY_ATTEMPT') {
    marketRegimeLabel = 'RALLY_ATTEMPT';
  } else if (
    spyFtd?.state === 'PULLBACK_NO_RALLY' ||
    spyFtd?.state === 'RALLY_FAILED' ||
    overallRisk === 'SEVERE'
  ) {
    marketRegimeLabel = 'CORRECTION_UNDER_PRESSURE';
  }

  const ftdSummary = [spyFtd?.summary, qqqFtd?.summary].filter(Boolean).join(' | ');

  return {
    asOf: spyCandles[spyCandles.length - 1].dateStr,
    overallRisk,
    exposureGuidance,
    spyDistribution: spyDist,
    qqqDistribution: qqqDist,
    ftdStatus: {
      marketRegimeLabel,
      spy: spyFtd,
      qqq: qqqFtd,
      summary: ftdSummary || 'Normal index trend context.',
    },
  };
}
