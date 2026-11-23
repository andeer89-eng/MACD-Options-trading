/**
 * Real-Data Market Health, Fear & Greed (0-100), VIX Regime & Net Volume Flow Engine
 *
 * Strictly deterministic — computes every daily score from real historical OHLCV bars:
 * 1. SPY Trend & Momentum (vs 50D / 125D SMA & 20D rate of change)
 * 2. VIX Level & Volatility Term Structure (^VIX vs ^VIX3M contango/backwardation + VIX spike)
 * 3. Real Dollar Volume Net Buying vs Net Selling Flow (CLV + Up/Down dollar flow across SPY, QQQ, IWM & 11 SPDR ETFs)
 * 4. Market Breadth & Safe-Haven Demand (% of SPDR sectors above 20D SMA + SPY vs TLT 20D relative flow)
 */

import type { Candle } from './trullasStrategy.ts';
import {
  analyzeMarketStructuralContext,
  type MarketStructuralSummary,
} from './marketStructuralContext.ts';

export type SentimentLabel =
  | 'Extreme Fear'
  | 'Fear'
  | 'Neutral'
  | 'Greed'
  | 'Extreme Greed';

export type MarketSafetyStatus = 'SAFE_RISK_ON' | 'CAUTIOUS' | 'CRASH_DEFENSE';

export interface MarketHealthDailyPoint {
  date: string;
  sentimentScore: number; // 0..100
  label: SentimentLabel;
  vix: number | null;
  vix3m: number | null;
  vixTermRatio: number | null; // vix3m / vix (> 1 = contango, < 1 = backwardation)
  spyClose: number;
  spyChangePct: number;
  buyingVolumeBillions: number;
  sellingVolumeBillions: number;
  netFlowBillions: number;
  netFlowRatioPct: number; // -100..+100
  breadthPct: number; // 0..100
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
  universeCount: number;
  current: {
    score: number;
    label: SentimentLabel;
    safetyStatus: MarketSafetyStatus;
    allowNewEntries: boolean;
    sizeMultiplier: number; // 1.0 | 0.5 | 0
    vix: number | null;
    vix3m: number | null;
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
}

export interface MarketHealthInputs {
  spyCandles: Candle[];
  vixCandles: Candle[];
  vix3mCandles?: Candle[];
  tltCandles?: Candle[];
  flowBenchmarkCandles: Record<string, Candle[]>; // SPY, QQQ, IWM + 11 SPDR Sector ETFs
  sectorEtfs?: Record<string, Candle[]>;
  spyWeeklyCandles?: Candle[];
  qqqWeeklyCandles?: Candle[];
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

function computeDateMap(candles: Candle[] | undefined): Map<string, { candle: Candle; prevClose: number | null; sma20: number | null }> {
  const map = new Map<string, { candle: Candle; prevClose: number | null; sma20: number | null }>();
  if (!Array.isArray(candles) || candles.length === 0) return map;
  const closes = candles.map((c) => c.close);
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    if (!c.dateStr || !Number.isFinite(c.close) || c.close <= 0) continue;
    const prevClose = i > 0 ? candles[i - 1].close : null;
    const sma20 = computeSmaAt(closes, i, 20);
    map.set(c.dateStr, { candle: c, prevClose, sma20 });
  }
  return map;
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
  const tltMap = computeDateMap(inputs.tltCandles);

  const flowKeys = Object.keys(inputs.flowBenchmarkCandles || {});
  const flowMaps = flowKeys.map((k) => computeDateMap(inputs.flowBenchmarkCandles[k]));

  const sectorSource = inputs.sectorEtfs && Object.keys(inputs.sectorEtfs).length > 0
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

    // 1. SPY Momentum Score (0-100): distance vs 50D & 125D SMA + 20D return
    const sma50 = computeSmaAt(spyCloses, i, 50) ?? bar.close;
    const sma125 = computeSmaAt(spyCloses, i, 125) ?? sma50;
    const vsSma50Pct = sma50 > 0 ? ((bar.close - sma50) / sma50) * 100 : 0;
    const vsSma125Pct = sma125 > 0 ? ((bar.close - sma125) / sma125) * 100 : 0;
    const idx20 = Math.max(0, i - 20);
    const ret20Pct = spy[idx20].close > 0 ? ((bar.close - spy[idx20].close) / spy[idx20].close) * 100 : 0;
    const momentumScore = Math.round(
      clamp(50 + vsSma50Pct * 4.5 + vsSma125Pct * 2.5 + ret20Pct * 2.0, 2, 98)
    );

    // 2. VIX + Term Structure Score (0-100)
    const vixEntry = vixMap.get(bar.dateStr);
    const vix3mEntry = vix3mMap.get(bar.dateStr);
    const vixVal = vixEntry?.candle.close ?? null;
    const vix3mVal = vix3mEntry?.candle.close ?? null;
    const vixTermRatio =
      typeof vixVal === 'number' && vixVal > 0 && typeof vix3mVal === 'number' && vix3mVal > 0
        ? Number((vix3mVal / vixVal).toFixed(3))
        : null;

    let vixScore = 50;
    if (typeof vixVal === 'number') {
      // VIX 12 -> ~92, VIX 18 -> ~71, VIX 22 -> ~57, VIX 30 -> ~29, VIX 38 -> ~4
      const baseVix = clamp(100 - (vixVal - 10) * 3.4, 2, 96);
      let termAdj = 0;
      if (vixTermRatio !== null) {
        if (vixTermRatio >= 1.06) termAdj = 8;
        else if (vixTermRatio >= 1.0) termAdj = 4;
        else if (vixTermRatio < 0.96) termAdj = -16;
        else termAdj = -7;
      }
      vixScore = Math.round(clamp(baseVix + termAdj, 2, 98));
    }

    // 3. Real Dollar Volume Flow (Buying vs Selling)
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

    // 4. Market Breadth & Safe-Haven Demand
    let sectorAbove20 = 0;
    let sectorAdvancing = 0;
    let sectorCount = 0;
    for (const sm of sectorMaps) {
      const hit = sm.get(bar.dateStr);
      if (!hit) continue;
      sectorCount++;
      if (hit.sma20 !== null && hit.candle.close >= hit.sma20) sectorAbove20++;
      if (hit.prevClose !== null && hit.candle.close >= hit.prevClose) sectorAdvancing++;
    }
    const breadthPct =
      sectorCount > 0
        ? Math.round(((sectorAbove20 * 0.65 + sectorAdvancing * 0.35) / sectorCount) * 100)
        : 50;

    // Safe-haven spread: SPY 20D return minus TLT (20Y Treasury) 20D return
    let safeHavenAdj = 0;
    const tltNow = tltMap.get(bar.dateStr)?.candle.close;
    const tlt20 = tltMap.get(spy[idx20].dateStr)?.candle.close;
    if (typeof tltNow === 'number' && typeof tlt20 === 'number' && tlt20 > 0) {
      const tltRet20 = ((tltNow - tlt20) / tlt20) * 100;
      safeHavenAdj = clamp((ret20Pct - tltRet20) * 1.5, -18, 18);
    }

    const breadthScore = Math.round(clamp(breadthPct + safeHavenAdj, 2, 98));

    // Rolling 5-day average net flow ratio smooths single-day noise in the composite volume component
    let rollingNetFlowSum = netFlowBillions;
    let rollingTotalVolSum = totalVolBillions;
    for (let look = 1; look <= 4 && dailySeries.length - look >= 0; look++) {
      const prevPt = dailySeries[dailySeries.length - look];
      rollingNetFlowSum += prevPt.netFlowBillions;
      rollingTotalVolSum += prevPt.buyingVolumeBillions + prevPt.sellingVolumeBillions;
    }
    const rollingNetRatioPct =
      rollingTotalVolSum > 0 ? (rollingNetFlowSum / rollingTotalVolSum) * 100 : netFlowRatioPct;

    const volumeScore = Math.round(
      clamp(50 + netFlowRatioPct * 0.65 + rollingNetRatioPct * 0.85, 2, 98)
    );

    const sentimentScore = Math.round(
      clamp(
        momentumScore * 0.25 + vixScore * 0.25 + volumeScore * 0.25 + breadthScore * 0.25,
        0,
        100
      )
    );

    dailySeries.push({
      date: bar.dateStr,
      sentimentScore,
      label: classifySentimentLabel(sentimentScore),
      vix: vixVal !== null ? Number(vixVal.toFixed(2)) : null,
      vix3m: vix3mVal !== null ? Number(vix3mVal.toFixed(2)) : null,
      vixTermRatio,
      spyClose: Number(bar.close.toFixed(2)),
      spyChangePct: Number(spyChangePct.toFixed(2)),
      buyingVolumeBillions: Number(buyingVolumeBillions.toFixed(2)),
      sellingVolumeBillions: Number(sellingVolumeBillions.toFixed(2)),
      netFlowBillions: Number(netFlowBillions.toFixed(2)),
      netFlowRatioPct,
      breadthPct,
      momentumScore,
      vixScore,
      volumeScore,
      breadthScore,
    });
  }

  const latest = dailySeries[dailySeries.length - 1];
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

  return {
    isLive: true,
    asOf: latest.date,
    dataSource: `Yahoo Finance Real OHLCV (${flowKeys.length} Benchmarks & SPDR Sectors + ^VIX / ^VIX3M / TLT)`,
    universeCount: flowKeys.length,
    current: {
      score: latest.sentimentScore,
      label: latest.label,
      safetyStatus: safety.safetyStatus,
      allowNewEntries: safety.allowNewEntries,
      sizeMultiplier: safety.sizeMultiplier,
      vix: latest.vix,
      vix3m: latest.vix3m,
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
  };
}
