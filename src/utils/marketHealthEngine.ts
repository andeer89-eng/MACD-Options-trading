/**
 * Real-Data Market Health, Fear & Greed (0-100), VIX Regime & Net Volume Flow Engine
 *
 * Strictly deterministic — computes every daily score from real historical OHLCV bars:
 * 1. SPY Trend & Momentum (vs 50D / 125D SMA, 20D return & 63D drawdown velocity)
 * 2. VIX Regime & Volatility Stress (^VIX level, VIX vs 50D SMA, ^VIX3M/^VIX curve & optional ^VVIX)
 * 3. Institutional 21-Day Dollar Volume Flow & CMF(21) (21D Buy vs Sell flow, SPY Chaikin Money Flow & Acc/Dist days)
 * 4. Structural Breadth, Credit Risk & Safe-Haven (% SPDR sectors > 20D/50D SMA, HYG vs IEF credit spread & SPY vs TLT spread)
 */

import type { Candle } from './trullasStrategy.ts';
import {
  analyzeMarketStructuralContext,
  type MarketStructuralSummary,
} from './marketStructuralContext.ts';
import type { ExternalFearGreedSeries } from './fearGreedProvider.ts';
import type { PublicBreadthSnapshot } from './publicBreadthFeed.ts';
import {
  analyzeMarketTiming,
  type MarketTimingReport,
} from './marketTimingEngine.ts';

export type SentimentLabel =
  | 'Extreme Fear'
  | 'Fear'
  | 'Neutral'
  | 'Greed'
  | 'Extreme Greed';

export type MarketSafetyStatus = 'SAFE_RISK_ON' | 'CAUTIOUS' | 'CRASH_DEFENSE';

export interface MarketHealthCnnBenchmark {
  score: number;
  rating: string;
  previousClose: number | null;
  oneWeekAgo: number | null;
  oneMonthAgo: number | null;
  updatedAt?: string | null;
  pillars?: {
    marketMomentumSp500?: number | null;
    stockPriceStrength?: number | null;
    stockPriceBreadth?: number | null;
    putCallOptions?: number | null;
    marketVolatilityVix?: number | null;
    junkBondDemand?: number | null;
    safeHavenDemand?: number | null;
  };
}

export interface MarketHealthDailyPoint {
  date: string;
  sentimentScore: number; // 0..100
  label: SentimentLabel;
  vix: number | null;
  vix3m: number | null;
  vvix?: number | null;
  vixSma50?: number | null;
  vixTermRatio: number | null; // vix3m / vix (> 1 = contango, < 1 = backwardation)
  spyClose: number;
  spyChangePct: number;
  buyingVolumeBillions: number;
  sellingVolumeBillions: number;
  netFlowBillions: number;
  netFlowRatioPct: number; // -100..+100 (1-day spot)
  flow21RatioPct?: number; // -100..+100 (21-day institutional rolling)
  cmf21?: number; // -1..+1 Chaikin Money Flow (21D SPY)
  breadthPct: number; // 0..100
  creditSpread20Pct?: number | null;
  safeHavenSpread20Pct?: number | null;
  momentumScore: number;
  vixScore: number;
  volumeScore: number;
  breadthScore: number;
}

export interface MarketHealthSnapshotPoint {
  date: string;
  score: number;
  label: SentimentLabel;
  vix: number | null;
  netFlowBillions: number;
}

export interface MarketHealthReport {
  isLive: boolean;
  asOf: string;
  dataSource: string;
  scoreSyncSource?: 'feargreedtracker.com' | 'cnn.io' | 'internal-ohlcv';
  universeCount: number;
  current: {
    score: number;
    internalScore?: number;
    scoreDelta1D?: number;
    label: SentimentLabel;
    safetyStatus: MarketSafetyStatus;
    allowNewEntries: boolean;
    sizeMultiplier: number; // 1.0 | 0.5 | 0
    vix: number | null;
    vix3m: number | null;
    vvix?: number | null;
    vixSma50?: number | null;
    vixTermStructure: 'CONTANGO' | 'FLAT' | 'BACKWARDATION' | 'UNAVAILABLE';
    spyPrice: number;
    spyChangePct: number;
    spy5dReturnPct: number;
    netVolumeTodayBillions: number;
    buyingVolumeTodayBillions: number;
    sellingVolumeTodayBillions: number;
    netVolume1MBillions: number;
    buyingVolume1MBillions: number;
    sellingVolume1MBillions: number;
    buySellRatio1M: number;
    cmf21?: number;
    flow21RatioPct?: number;
    accDistDays21?: { upDays: number; totalDays: number };
    creditSpread20Pct?: number | null;
    safeHavenSpread20Pct?: number | null;
    breadthPct: number;
    momentumScore: number;
    vixScore: number;
    volumeScore: number;
    breadthScore: number;
    reasons: string[];
  };
  snapshots: {
    now: MarketHealthSnapshotPoint;
    previousClose: MarketHealthSnapshotPoint | null;
    oneWeekAgo: MarketHealthSnapshotPoint | null;
    oneMonthAgo: MarketHealthSnapshotPoint | null;
    oneYearAgo: MarketHealthSnapshotPoint | null;
  };
  history1M: MarketHealthDailyPoint[];
  history1YCount: number;
  structuralContext?: {
    spy: MarketStructuralSummary | null;
    qqq: MarketStructuralSummary | null;
  };
  externalBenchmarks?: {
    cnnFearGreed?: MarketHealthCnnBenchmark | null;
  };
  publicBreadth?: PublicBreadthSnapshot | null;
  marketTiming?: MarketTimingReport | null;
}

export interface MarketHealthInputs {
  spyCandles: Candle[];
  vixCandles: Candle[];
  vix3mCandles?: Candle[];
  vvixCandles?: Candle[];
  tltCandles?: Candle[];
  hygCandles?: Candle[];
  iefCandles?: Candle[];
  rspCandles?: Candle[];
  flowBenchmarkCandles: Record<string, Candle[]>; // SPY, QQQ, IWM + 11 SPDR Sector ETFs
  sectorEtfs?: Record<string, Candle[]>;
  spyWeeklyCandles?: Candle[];
  qqqWeeklyCandles?: Candle[];
  externalFearGreed?: ExternalFearGreedSeries | null;
  externalCnnBenchmark?: MarketHealthCnnBenchmark | null;
  publicBreadth?: PublicBreadthSnapshot | null;
}

function clamp(val: number, min: number, max: number): number {
  if (!Number.isFinite(val)) return min;
  return Math.max(min, Math.min(max, val));
}

export function classifySentimentLabel(score: number): SentimentLabel {
  const s = clamp(Math.round(score), 0, 100);
  if (s <= 24) return 'Extreme Fear';
  if (s <= 44) return 'Fear';
  if (s <= 55) return 'Neutral';
  if (s <= 74) return 'Greed';
  return 'Extreme Greed';
}

function computeSmaAt(closes: number[], idx: number, period: number): number | null {
  if (idx < 0 || idx >= closes.length) return null;
  const start = Math.max(0, idx - period + 1);
  const count = idx - start + 1;
  if (count < Math.min(period, 5)) return null;
  let sum = 0;
  for (let i = start; i <= idx; i++) sum += closes[i];
  return sum / count;
}

function computeDateMap(
  candles: Candle[] | undefined
): Map<string, { candle: Candle; prevClose: number | null; sma20: number | null; sma50: number | null }> {
  const map = new Map<
    string,
    { candle: Candle; prevClose: number | null; sma20: number | null; sma50: number | null }
  >();
  if (!Array.isArray(candles) || candles.length === 0) return map;
  const closes = candles.map((c) => c.close);
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    if (!c.dateStr || !Number.isFinite(c.close) || c.close <= 0) continue;
    const prevClose = i > 0 ? candles[i - 1].close : null;
    const sma20 = computeSmaAt(closes, i, 20);
    const sma50 = computeSmaAt(closes, i, 50);
    map.set(c.dateStr, { candle: c, prevClose, sma20, sma50 });
  }
  return map;
}

function computeCmfAt(candles: Candle[], idx: number, period: number = 21): number {
  const start = Math.max(0, idx - period + 1);
  let mfvSum = 0;
  let volSum = 0;
  for (let k = start; k <= idx; k++) {
    const c = candles[k];
    const vol = Number.isFinite(c.volume) && c.volume > 0 ? c.volume : 0;
    if (vol <= 0) continue;
    const range = c.high - c.low;
    const clv =
      range > 0
        ? clamp(((c.close - c.low) - (c.high - c.close)) / range, -1, 1)
        : 0;
    mfvSum += clv * vol;
    volSum += vol;
  }
  if (volSum <= 0) return 0;
  return Number(clamp(mfvSum / volSum, -1, 1).toFixed(3));
}

function computeReturnPctFromMap(
  map: Map<string, { candle: Candle }>,
  dateNow: string,
  datePast: string
): number | null {
  const nowVal = map.get(dateNow)?.candle.close;
  const pastVal = map.get(datePast)?.candle.close;
  if (typeof nowVal === 'number' && typeof pastVal === 'number' && pastVal > 0) {
    return ((nowVal - pastVal) / pastVal) * 100;
  }
  return null;
}

/**
 * Splits a candle's real dollar volume into buying vs selling pressure using
 * Close Location Value (CLV = ((C - L) - (H - C)) / (H - L)) blended with close-over-close direction.
 * Returns dollars in Billions.
 */
export function decomposeBarDollarFlow(
  candle: Candle,
  prevClose: number | null
): { buyBillions: number; sellBillions: number; netBillions: number } {
  const vol = Number.isFinite(candle.volume) && candle.volume > 0 ? candle.volume : 0;
  if (vol <= 0 || candle.close <= 0) {
    return { buyBillions: 0, sellBillions: 0, netBillions: 0 };
  }
  const dollarVolBillions = (vol * candle.close) / 1_000_000_000;
  const range = candle.high - candle.low;
  const clv =
    range > 0
      ? clamp(((candle.close - candle.low) - (candle.high - candle.close)) / range, -1, 1)
      : 0;

  let dirBias = 0;
  if (prevClose !== null && prevClose > 0) {
    const retPct = ((candle.close - prevClose) / prevClose) * 100;
    dirBias = clamp(retPct / 2.0, -1, 1); // ±2% day saturates directional pressure
  }

  // Blend intraday close-location accumulation with day-over-day price thrust
  const pressure = clamp(clv * 0.55 + dirBias * 0.45, -1, 1);
  const buyShare = (1 + pressure) / 2; // 0..1
  const sellShare = 1 - buyShare;

  const buyBillions = dollarVolBillions * buyShare;
  const sellBillions = dollarVolBillions * sellShare;
  return {
    buyBillions,
    sellBillions,
    netBillions: buyBillions - sellBillions,
  };
}

export function evaluateSafetyRegime(params: {
  score: number;
  vix: number | null;
  vixTermRatio: number | null;
  spy5dReturnPct: number;
  netFlow5dRatioPct: number;
}): {
  safetyStatus: MarketSafetyStatus;
  allowNewEntries: boolean;
  sizeMultiplier: number;
  reasons: string[];
} {
  const reasons: string[] = [];
  const { score, vix, vixTermRatio, spy5dReturnPct, netFlow5dRatioPct } = params;

  const highVix = typeof vix === 'number' && vix >= 28;
  const elevatedVix = typeof vix === 'number' && vix >= 22 && vix < 28;
  const backwardation = typeof vixTermRatio === 'number' && vixTermRatio < 0.96;
  const crashDrawdown = spy5dReturnPct <= -4.0;
  const heavyOutflow = netFlow5dRatioPct <= -22;

  if (score < 32 || highVix || (backwardation && heavyOutflow) || (crashDrawdown && (elevatedVix || highVix))) {
    if (score < 32) reasons.push(`Extreme market fear (Health Score ${score}/100 < 32)`);
    if (highVix) reasons.push(`VIX crisis elevation (${vix!.toFixed(1)} >= 28)`);
    if (backwardation) reasons.push(`VIX term structure inverted (backwardation ${vixTermRatio!.toFixed(2)}x)`);
    if (crashDrawdown) reasons.push(`5-day SPY selloff (${spy5dReturnPct.toFixed(2)}%)`);
    if (heavyOutflow) reasons.push(`5-day institutional net selling (${netFlow5dRatioPct.toFixed(1)}%)`);
    return {
      safetyStatus: 'CRASH_DEFENSE',
      allowNewEntries: false,
      sizeMultiplier: 0,
      reasons,
    };
  }

  if (score < 52 || elevatedVix || backwardation || netFlow5dRatioPct <= -10) {
    if (score < 52) reasons.push(`Subdued market health (${score}/100)`);
    if (elevatedVix) reasons.push(`Elevated volatility (VIX ${vix!.toFixed(1)})`);
    if (backwardation) reasons.push(`VIX curve defensive (${vixTermRatio!.toFixed(2)}x)`);
    if (netFlow5dRatioPct <= -10) reasons.push(`5-day net selling flow (${netFlow5dRatioPct.toFixed(1)}%)`);
    return {
      safetyStatus: 'CAUTIOUS',
      allowNewEntries: true,
      sizeMultiplier: 0.5,
      reasons,
    };
  }

  reasons.push(
    `Healthy trend & positive participation (Score ${score}/100${typeof vix === 'number' ? `, VIX ${vix.toFixed(1)}` : ''})`
  );
  return {
    safetyStatus: 'SAFE_RISK_ON',
    allowNewEntries: true,
    sizeMultiplier: 1.0,
    reasons,
  };
}

export function computeMarketHealthReport(inputs: MarketHealthInputs): MarketHealthReport {
  const spy = inputs.spyCandles || [];
  if (spy.length < 2) {
    throw new Error('Insufficient real SPY history to compute Market Health.');
  }

  const spyCloses = spy.map((c) => c.close);
  const vixMap = computeDateMap(inputs.vixCandles);
  const vix3mMap = computeDateMap(inputs.vix3mCandles);
  const vvixMap = computeDateMap(inputs.vvixCandles);
  const tltMap = computeDateMap(inputs.tltCandles);
  const hygMap = computeDateMap(inputs.hygCandles);
  const iefMap = computeDateMap(inputs.iefCandles);
  const rspMap = computeDateMap(inputs.rspCandles);

  const flowKeys = Object.keys(inputs.flowBenchmarkCandles || {});
  const flowMaps = flowKeys.map((k) => computeDateMap(inputs.flowBenchmarkCandles[k]));

  const sectorSource =
    inputs.sectorEtfs && Object.keys(inputs.sectorEtfs).length > 0
      ? inputs.sectorEtfs
      : inputs.flowBenchmarkCandles;
  const sectorKeys = Object.keys(sectorSource || {}).filter((k) => k.startsWith('XL'));
  const sectorMaps = (sectorKeys.length > 0 ? sectorKeys : flowKeys).map((k) =>
    computeDateMap((sectorSource || {})[k])
  );

  const dailySeries: MarketHealthDailyPoint[] = [];

  for (let i = 0; i < spy.length; i++) {
    const bar = spy[i];
    const prevSpy = i > 0 ? spy[i - 1].close : bar.close;
    const spyChangePct = prevSpy > 0 ? ((bar.close - prevSpy) / prevSpy) * 100 : 0;

    // 1. SPY Momentum & Drawdown Velocity Score (0-100): distance vs 50D / 125D SMA, 20D RoC & 63D high drawdown
    const sma50 = computeSmaAt(spyCloses, i, 50) ?? bar.close;
    const sma125 = computeSmaAt(spyCloses, i, 125) ?? sma50;
    const vsSma50Pct = sma50 > 0 ? ((bar.close - sma50) / sma50) * 100 : 0;
    const vsSma125Pct = sma125 > 0 ? ((bar.close - sma125) / sma125) * 100 : 0;
    const idx20 = Math.max(0, i - 20);
    const ret20Pct = spy[idx20].close > 0 ? ((bar.close - spy[idx20].close) / spy[idx20].close) * 100 : 0;

    let high63 = bar.high;
    for (let k = Math.max(0, i - 62); k <= i; k++) {
      if (spy[k].high > high63) high63 = spy[k].high;
    }
    const dd63Pct = high63 > 0 ? ((bar.close - high63) / high63) * 100 : 0; // <= 0

    const momentumScore = Math.round(
      clamp(50 + vsSma50Pct * 3.8 + vsSma125Pct * 2.2 + ret20Pct * 1.6 + dd63Pct * 1.1, 2, 98)
    );

    // 2. VIX Level, 50D SMA Regime, Term Structure & ^VVIX Score (0-100)
    const vixEntry = vixMap.get(bar.dateStr);
    const vix3mEntry = vix3mMap.get(bar.dateStr);
    const vvixEntry = vvixMap.get(bar.dateStr);
    const vixVal = vixEntry?.candle.close ?? null;
    const vixSma50 = vixEntry?.sma50 ?? null;
    const vix3mVal = vix3mEntry?.candle.close ?? null;
    const vvixVal = vvixEntry?.candle.close ?? null;
    const vixTermRatio =
      typeof vixVal === 'number' && vixVal > 0 && typeof vix3mVal === 'number' && vix3mVal > 0
        ? Number((vix3mVal / vixVal).toFixed(3))
        : null;

    let vixScore = 50;
    if (typeof vixVal === 'number') {
      // VIX 12 -> ~90, VIX 18 -> ~71, VIX 26.6 -> ~45, VIX 35 -> ~19
      const baseVix = clamp(100 - (vixVal - 10) * 3.1, 2, 96);

      // Compare spot VIX vs its own 50D SMA (CNN Volatility pillar principle)
      let vixRegimeAdj = 0;
      if (typeof vixSma50 === 'number' && vixSma50 > 0) {
        const vixVs50Pct = ((vixVal - vixSma50) / vixSma50) * 100;
        vixRegimeAdj = clamp(-vixVs50Pct * 0.34, -18, 10);
      }

      // Term structure: Backwardation warns of systemic hedging stress
      let termAdj = 0;
      if (vixTermRatio !== null) {
        if (vixTermRatio >= 1.07) termAdj = 7;
        else if (vixTermRatio >= 1.01) termAdj = 3;
        else if (vixTermRatio < 0.96) termAdj = -14;
        else if (vixTermRatio < 1.0) termAdj = -7;
      }

      // Optional ^VVIX (volatility of VIX) stress modifier
      let vvixAdj = 0;
      if (typeof vvixVal === 'number') {
        if (vvixVal > 95) vvixAdj = clamp(-(vvixVal - 95) * 0.25, -10, 0);
        else if (vvixVal < 85) vvixAdj = clamp((85 - vvixVal) * 0.25, 0, 5);
      }

      vixScore = Math.round(clamp(baseVix + vixRegimeAdj + termAdj + vvixAdj, 2, 98));
    }

    // 3. Real Dollar Volume Flow (21-day institutional accumulation/distribution + SPY CMF(21))
    let buyingVolumeBillions = 0;
    let sellingVolumeBillions = 0;
    for (const m of flowMaps) {
      const hit = m.get(bar.dateStr);
      if (!hit) continue;
      const flow = decomposeBarDollarFlow(hit.candle, hit.prevClose);
      buyingVolumeBillions += flow.buyBillions;
      sellingVolumeBillions += flow.sellBillions;
    }
    const totalVolBillions = buyingVolumeBillions + sellingVolumeBillions;
    const netFlowBillions = buyingVolumeBillions - sellingVolumeBillions;
    const netFlowRatioPct =
      totalVolBillions > 0 ? Number(((netFlowBillions / totalVolBillions) * 100).toFixed(2)) : 0;

    // Trailing 5-day dollar flow ratio
    let flow5NetSum = netFlowBillions;
    let flow5TotalSum = totalVolBillions;
    for (let look = 1; look <= 4 && dailySeries.length - look >= 0; look++) {
      const prevPt = dailySeries[dailySeries.length - look];
      flow5NetSum += prevPt.netFlowBillions;
      flow5TotalSum += prevPt.buyingVolumeBillions + prevPt.sellingVolumeBillions;
    }
    const flow5RatioPct = flow5TotalSum > 0 ? (flow5NetSum / flow5TotalSum) * 100 : netFlowRatioPct;

    // Trailing 21-day (1-month) institutional dollar flow ratio + up-day count
    let flow21NetSum = netFlowBillions;
    let flow21TotalSum = totalVolBillions;
    let upFlowDays21 = netFlowBillions > 0 ? 1 : 0;
    let countDays21 = 1;
    for (let look = 1; look <= 20 && dailySeries.length - look >= 0; look++) {
      const prevPt = dailySeries[dailySeries.length - look];
      flow21NetSum += prevPt.netFlowBillions;
      flow21TotalSum += prevPt.buyingVolumeBillions + prevPt.sellingVolumeBillions;
      if (prevPt.netFlowBillions > 0) upFlowDays21++;
      countDays21++;
    }
    const flow21RatioPct =
      flow21TotalSum > 0 ? Number(((flow21NetSum / flow21TotalSum) * 100).toFixed(2)) : netFlowRatioPct;
    const accDays21Pct = countDays21 > 0 ? (upFlowDays21 / countDays21) * 100 : 50;
    const cmf21 = computeCmfAt(spy, i, 21);

    // Anchor on 21D institutional dollar flow + CMF(21), with light 5D/1D inflection so one bounce day cannot mask a -500B distribution regime
    const volumeScore = Math.round(
      clamp(
        50 +
          flow21RatioPct * 0.85 +
          cmf21 * 100 * 0.32 +
          flow5RatioPct * 0.16 +
          (accDays21Pct - 50) * 0.18 +
          netFlowRatioPct * 0.06,
        2,
        98
      )
    );

    // 4. Structural Sector Breadth, Credit Risk Appetite (HYG vs IEF) & Safe-Haven Demand (SPY vs TLT)
    let sectorAbove20 = 0;
    let sectorAbove50 = 0;
    let sectorAdvancing = 0;
    let sectorCount = 0;
    for (const sm of sectorMaps) {
      const hit = sm.get(bar.dateStr);
      if (!hit) continue;
      sectorCount++;
      if (hit.sma20 !== null && hit.candle.close >= hit.sma20) sectorAbove20++;
      if (hit.sma50 !== null && hit.candle.close >= hit.sma50) sectorAbove50++;
      if (hit.prevClose !== null && hit.candle.close >= hit.prevClose) sectorAdvancing++;
    }
    const breadthPct =
      sectorCount > 0
        ? Math.round(
            ((sectorAbove20 * 0.62 + sectorAbove50 * 0.28 + sectorAdvancing * 0.1) / sectorCount) * 100
          )
        : 50;

    // Safe-haven spread: SPY 20D return minus TLT (20Y Treasury) 20D return
    let safeHavenAdj = 0;
    let safeHavenSpread20Pct: number | null = null;
    const tltRet20 = computeReturnPctFromMap(tltMap, bar.dateStr, spy[idx20].dateStr);
    if (tltRet20 !== null) {
      safeHavenSpread20Pct = Number((ret20Pct - tltRet20).toFixed(2));
      safeHavenAdj = clamp(safeHavenSpread20Pct * 1.35, -16, 15);
    }

    // Junk bond credit spread: HYG 20D return minus IEF 20D return (CNN Junk Bond Demand proxy)
    let creditAdj = 0;
    let creditSpread20Pct: number | null = null;
    const hygRet20 = computeReturnPctFromMap(hygMap, bar.dateStr, spy[idx20].dateStr);
    const iefRet20 = computeReturnPctFromMap(iefMap, bar.dateStr, spy[idx20].dateStr);
    if (hygRet20 !== null && iefRet20 !== null) {
      creditSpread20Pct = Number((hygRet20 - iefRet20).toFixed(2));
      creditAdj = clamp(creditSpread20Pct * 3.8, -14, 14);
    }

    // Optional equal-weight vs cap-weight breadth confirmation (RSP vs SPY 20D spread)
    let rspBreadthAdj = 0;
    const rspRet20 = computeReturnPctFromMap(rspMap, bar.dateStr, spy[idx20].dateStr);
    if (rspRet20 !== null) {
      rspBreadthAdj = clamp((rspRet20 - ret20Pct) * 0.75, -8, 8);
    }

    const breadthScore = Math.round(
      clamp(breadthPct + safeHavenAdj + creditAdj + rspBreadthAdj, 2, 98)
    );

    const internalCompositeScore = Math.round(
      clamp(
        momentumScore * 0.25 + vixScore * 0.25 + volumeScore * 0.25 + breadthScore * 0.25,
        0,
        100
      )
    );

    const extSeries = inputs.externalFearGreed;
    const extPt = extSeries?.historyByDate?.[bar.dateStr];
    const isLatestBar = i === spy.length - 1;
    const syncedScore =
      extPt !== undefined
        ? extPt.score
        : extSeries && isLatestBar
        ? extSeries.currentScore
        : internalCompositeScore;
    const sentimentScore = Math.round(clamp(syncedScore, 0, 100));

    dailySeries.push({
      date: bar.dateStr,
      sentimentScore,
      label: classifySentimentLabel(sentimentScore),
      vix: vixVal !== null ? Number(vixVal.toFixed(2)) : null,
      vix3m: vix3mVal !== null ? Number(vix3mVal.toFixed(2)) : null,
      vvix: vvixVal !== null ? Number(vvixVal.toFixed(2)) : null,
      vixSma50: vixSma50 !== null ? Number(vixSma50.toFixed(2)) : null,
      vixTermRatio,
      spyClose: Number(bar.close.toFixed(2)),
      spyChangePct: Number(spyChangePct.toFixed(2)),
      buyingVolumeBillions: Number(buyingVolumeBillions.toFixed(2)),
      sellingVolumeBillions: Number(sellingVolumeBillions.toFixed(2)),
      netFlowBillions: Number(netFlowBillions.toFixed(2)),
      netFlowRatioPct,
      flow21RatioPct,
      cmf21,
      breadthPct,
      creditSpread20Pct,
      safeHavenSpread20Pct,
      momentumScore,
      vixScore,
      volumeScore,
      breadthScore,
    });
  }

  const latest = dailySeries[dailySeries.length - 1];
  const prevDay = dailySeries.length >= 2 ? dailySeries[dailySeries.length - 2] : null;
  const internalLatestScore = Math.round(
    clamp(
      latest.momentumScore * 0.25 +
        latest.vixScore * 0.25 +
        latest.volumeScore * 0.25 +
        latest.breadthScore * 0.25,
      0,
      100
    )
  );
  const extSeries = inputs.externalFearGreed ?? null;
  const scoreSyncSource: MarketHealthReport['scoreSyncSource'] = extSeries
    ? extSeries.provider
    : 'internal-ohlcv';
  const scoreDelta1D =
    extSeries?.scoreDelta1D !== null && extSeries?.scoreDelta1D !== undefined
      ? extSeries.scoreDelta1D
      : prevDay
      ? latest.sentimentScore - prevDay.sentimentScore
      : 0;
  const history1M = dailySeries.slice(-22);

  const buyingVolume1MBillions = Number(
    history1M.reduce((s, d) => s + d.buyingVolumeBillions, 0).toFixed(2)
  );
  const sellingVolume1MBillions = Number(
    history1M.reduce((s, d) => s + d.sellingVolumeBillions, 0).toFixed(2)
  );
  const netVolume1MBillions = Number((buyingVolume1MBillions - sellingVolume1MBillions).toFixed(2));
  const buySellRatio1M =
    sellingVolume1MBillions > 0
      ? Number((buyingVolume1MBillions / sellingVolume1MBillions).toFixed(2))
      : buyingVolume1MBillions > 0
      ? 2.0
      : 1.0;

  const upDays21 = history1M.filter((d) => d.netFlowBillions > 0).length;

  const last5 = dailySeries.slice(-5);
  const buy5d = last5.reduce((s, d) => s + d.buyingVolumeBillions, 0);
  const sell5d = last5.reduce((s, d) => s + d.sellingVolumeBillions, 0);
  const netFlow5dRatioPct = buy5d + sell5d > 0 ? ((buy5d - sell5d) / (buy5d + sell5d)) * 100 : 0;

  const spy5Back = dailySeries[Math.max(0, dailySeries.length - 6)];
  const spy5dReturnPct =
    spy5Back && spy5Back.spyClose > 0
      ? Number((((latest.spyClose - spy5Back.spyClose) / spy5Back.spyClose) * 100).toFixed(2))
      : 0;

  const safety = evaluateSafetyRegime({
    score: latest.sentimentScore,
    vix: latest.vix,
    vixTermRatio: latest.vixTermRatio,
    spy5dReturnPct,
    netFlow5dRatioPct,
  });

  const toSnap = (pt: MarketHealthDailyPoint | undefined): MarketHealthSnapshotPoint | null =>
    pt
      ? {
          date: pt.date,
          score: pt.sentimentScore,
          label: pt.label,
          vix: pt.vix,
          netFlowBillions: pt.netFlowBillions,
        }
      : null;

  const vixTermStructure: MarketHealthReport['current']['vixTermStructure'] =
    latest.vixTermRatio === null
      ? 'UNAVAILABLE'
      : latest.vixTermRatio >= 1.02
      ? 'CONTANGO'
      : latest.vixTermRatio < 0.98
      ? 'BACKWARDATION'
      : 'FLAT';

  const qqqDaily = inputs.flowBenchmarkCandles?.['QQQ'] || [];
  const spyStructural = analyzeMarketStructuralContext({
    symbol: 'SPY',
    dailyCandles: spy,
    weeklyCandles: inputs.spyWeeklyCandles,
  });
  const qqqStructural =
    qqqDaily.length >= 15
      ? analyzeMarketStructuralContext({
          symbol: 'QQQ',
          dailyCandles: qqqDaily,
          weeklyCandles: inputs.qqqWeeklyCandles,
        })
      : null;

  const marketTiming = analyzeMarketTiming({
    spyCandles: spy,
    qqqCandles: qqqDaily,
  });

  if (marketTiming) {
    if (marketTiming.overallRisk === 'SEVERE') {
      if (safety.safetyStatus === 'SAFE_RISK_ON') {
        safety.safetyStatus = 'CAUTIOUS';
      }
      if (safety.allowNewEntries) {
        safety.sizeMultiplier = Math.min(safety.sizeMultiplier, 0.5);
      }
      safety.reasons.push(
        `IBD Distribution Risk SEVERE (SPY ${marketTiming.spyDistribution?.activeCount25 ?? 0}d / QQQ ${marketTiming.qqqDistribution?.activeCount25 ?? 0}d — 0.5x max sizing)`
      );
    } else if (marketTiming.overallRisk === 'HIGH') {
      if (safety.allowNewEntries) {
        safety.sizeMultiplier = Math.min(safety.sizeMultiplier, 0.75);
      }
      safety.reasons.push(
        `IBD Distribution Risk HIGH (SPY ${marketTiming.spyDistribution?.activeCount25 ?? 0}d / QQQ ${marketTiming.qqqDistribution?.activeCount25 ?? 0}d — 0.75x cap)`
      );
    }
  }

  const spBreadth = inputs.publicBreadth?.sp500Breadth;
  if (spBreadth) {
    if (spBreadth.regimeLabel === 'BEAR_DIVERGENCE') {
      if (safety.allowNewEntries) {
        safety.sizeMultiplier = Math.min(safety.sizeMultiplier, 0.75);
      }
      safety.reasons.push(
        `S&P 500 Breadth Bear Divergence (${spBreadth.pctAbove200Ma.toFixed(1)}% >200MA, capped 0.75x)`
      );
    } else if (
      spBreadth.isTroughBelow40 &&
      marketTiming?.ftdStatus?.marketRegimeLabel === 'FTD_CONFIRMED'
    ) {
      safety.reasons.push(
        `FTD Confirmed + Breadth Oversold Trough (${spBreadth.pctAbove200Ma.toFixed(1)}% >200MA)`
      );
    }
  }

  const feedTags = ['^VIX', '^VIX3M', 'TLT'];
  if ((inputs.vvixCandles || []).length > 0) feedTags.push('^VVIX');
  if ((inputs.hygCandles || []).length > 0 && (inputs.iefCandles || []).length > 0) {
    feedTags.push('HYG/IEF');
  }
  if ((inputs.rspCandles || []).length > 0) feedTags.push('RSP');
  if (inputs.publicBreadth) feedTags.push('Public Breadth CSV');

  const syncedBenchmark: MarketHealthCnnBenchmark | null =
    inputs.externalCnnBenchmark ??
    (extSeries
      ? {
          score: extSeries.currentScore,
          rating: classifySentimentLabel(extSeries.currentScore),
          previousClose: extSeries.previousCloseScore,
          oneWeekAgo: extSeries.oneWeekAgoScore,
          oneMonthAgo: extSeries.oneMonthAgoScore,
          updatedAt: extSeries.asOf,
          pillars: extSeries.cnnPillars,
        }
      : null);

  return {
    isLive: true,
    asOf: latest.date,
    scoreSyncSource,
    dataSource: extSeries
      ? `Synced: ${extSeries.providerLabel} + Yahoo Finance Real OHLCV (${flowKeys.length} Benchmarks & SPDR Sectors + ${feedTags.join(' / ')})`
      : `Yahoo Finance Real OHLCV (${flowKeys.length} Benchmarks & SPDR Sectors + ${feedTags.join(' / ')})`,
    universeCount: flowKeys.length,
    current: {
      score: latest.sentimentScore,
      internalScore: internalLatestScore,
      scoreDelta1D,
      label: latest.label,
      safetyStatus: safety.safetyStatus,
      allowNewEntries: safety.allowNewEntries,
      sizeMultiplier: safety.sizeMultiplier,
      vix: latest.vix,
      vix3m: latest.vix3m,
      vvix: latest.vvix ?? null,
      vixSma50: latest.vixSma50 ?? null,
      vixTermStructure,
      spyPrice: latest.spyClose,
      spyChangePct: latest.spyChangePct,
      spy5dReturnPct,
      netVolumeTodayBillions: latest.netFlowBillions,
      buyingVolumeTodayBillions: latest.buyingVolumeBillions,
      sellingVolumeTodayBillions: latest.sellingVolumeBillions,
      netVolume1MBillions,
      buyingVolume1MBillions,
      sellingVolume1MBillions,
      buySellRatio1M,
      cmf21: latest.cmf21 ?? 0,
      flow21RatioPct: latest.flow21RatioPct ?? latest.netFlowRatioPct,
      accDistDays21: { upDays: upDays21, totalDays: history1M.length },
      creditSpread20Pct: latest.creditSpread20Pct ?? null,
      safeHavenSpread20Pct: latest.safeHavenSpread20Pct ?? null,
      breadthPct: latest.breadthPct,
      momentumScore: latest.momentumScore,
      vixScore: latest.vixScore,
      volumeScore: latest.volumeScore,
      breadthScore: latest.breadthScore,
      reasons: safety.reasons,
    },
    snapshots: {
      now: toSnap(latest)!,
      previousClose: toSnap(dailySeries[dailySeries.length - 2]),
      oneWeekAgo: toSnap(dailySeries[Math.max(0, dailySeries.length - 6)]),
      oneMonthAgo: toSnap(dailySeries[Math.max(0, dailySeries.length - 22)]),
      oneYearAgo: toSnap(dailySeries[0]),
    },
    history1M,
    history1YCount: dailySeries.length,
    structuralContext: {
      spy: spyStructural,
      qqq: qqqStructural,
    },
    ...(syncedBenchmark
      ? {
          externalBenchmarks: {
            cnnFearGreed: syncedBenchmark,
          },
        }
      : {}),
    publicBreadth: inputs.publicBreadth ?? null,
    marketTiming,
  };
}
