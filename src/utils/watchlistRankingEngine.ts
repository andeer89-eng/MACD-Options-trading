/* =====================================================================
   StageLedger — Unified Top-50 Market Leaders & Conviction Ranking Engine
   Single source of truth for:
   - Live Daily Watchlist (TodayView)
   - Confluence 360° Matrix candidate selection
   - Trade Action Zones high-conviction pipeline

   Strictly uses real scan data (divergences, TOS multi-scan hits,
   30-bar SPY Alpha, ATR/RelVol, and SMA Stage structure).
   Never emits signal-less baseline fallbacks or Grade C/D noise by default.
   ===================================================================== */

import { Candle, DivergenceSetup } from './trullasStrategy';
import { TosScanReport, TosScanSignal } from './tosScansEngine';
import { SP500_UNIVERSE } from '../data/sp500Universe';

export type ConvictionGrade = 'A+' | 'A' | 'B' | 'C' | 'D';

export const HIGH_CONVICTION_MIN_SCORE = 68; // Grade B or higher (excludes Grade C <68 & Grade D <55)
export const MAX_WATCHLIST_LEADERS = 50;

export interface RankedMarketLeader {
  rank: number;
  symbol: string;
  companyName: string;
  sector: string;
  universe: ('sp500' | 'ndx100')[];
  direction: 'long' | 'short';
  score: number;
  grade: ConvictionGrade;
  tier: 'ELITE' | 'HIGH CONVICTION' | 'STRONG' | 'SPECULATIVE' | 'WEAK';
  primarySetup: string;
  hasDivergence: boolean;
  hasTripleDivergence: boolean;
  matchingDivergence: DivergenceSetup | null;
  matchingTosSignals: TosScanSignal[];
  signalCount: number;
  currentPrice: number;
  changePercent: number;
  atr: number;
  atrPercent: number;
  relPerfVsSpyPct: number | null;
  return30dPct: number | null;
  relVolStDev: number | null;
  stageLabel: string;
  why: string[];
  candles?: Candle[];
  rawItem: any;
}

export interface DualLeaderboardResult {
  bullish: RankedMarketLeader[];
  bearish: RankedMarketLeader[];
  totalEvaluated: number;
  excludedWeakBullish: number;
  excludedWeakBearish: number;
}

export interface LeaderboardBuildOptions {
  minScore?: number; // Default 68 (Grade B+). Pass 55 to include Grade C.
  maxItems?: number; // Default 50
}

export const NDX_CORE_SET = new Set([
  'NVDA', 'AAPL', 'MSFT', 'AMZN', 'META', 'GOOGL', 'GOOG', 'TSLA', 'AVGO',
  'COST', 'NFLX', 'AMD', 'ADBE', 'CSCO', 'PEP', 'TMUS', 'LIN', 'INTC', 'QCOM', 'INTU',
  'ISRG', 'TXN', 'AMGN', 'AMAT', 'BKNG', 'HON', 'PANW', 'LRCX', 'MU', 'ADP',
  'GILD', 'VRTX', 'SBUX', 'MELI', 'ADI', 'MDLZ', 'KLAC', 'REGN', 'SNPS', 'CDNS',
]);

const SP500_MAP = new Map(SP500_UNIVERSE.map((c) => [c.symbol.toUpperCase(), c]));

export function scoreToConvictionGrade(score: number): {
  grade: ConvictionGrade;
  tier: RankedMarketLeader['tier'];
} {
  if (score >= 88) return { grade: 'A+', tier: 'ELITE' };
  if (score >= 78) return { grade: 'A', tier: 'HIGH CONVICTION' };
  if (score >= 68) return { grade: 'B', tier: 'STRONG' };
  if (score >= 55) return { grade: 'C', tier: 'SPECULATIVE' };
  return { grade: 'D', tier: 'WEAK' };
}

function computeSimpleStageFromCandles(
  candles: Candle[] | undefined,
  currentPrice: number
): { stage: 1 | 2 | 3 | 4 | null; label: string } {
  if (!Array.isArray(candles) || candles.length < 20 || currentPrice <= 0) {
    return { stage: null, label: 'Unclassified' };
  }
  const closes = candles.map((c) => Number(c.close)).filter((v) => Number.isFinite(v) && v > 0);
  if (closes.length < 20) return { stage: null, label: 'Unclassified' };

  const w30 = closes.slice(-Math.min(30, closes.length));
  const ma30 = w30.reduce((a, b) => a + b, 0) / w30.length;
  const w150 = closes.slice(-Math.min(150, closes.length));
  const ma150 = w150.reduce((a, b) => a + b, 0) / w150.length;

  if (currentPrice > ma30 && ma30 >= ma150) return { stage: 2, label: 'Stage 2 Advancing' };
  if (currentPrice < ma30 && ma30 <= ma150) return { stage: 4, label: 'Stage 4 Declining' };
  if (currentPrice >= ma30 && ma30 < ma150) return { stage: 1, label: 'Stage 1 Basing' };
  return { stage: 3, label: 'Stage 3 Topping' };
}

/**
 * Evaluates a scanned ticker strictly for ONE direction ('long' = BULLISH or 'short' = BEARISH).
 * Returns null when the ticker has ZERO directional signals (prevents signal-less Grade C/D leakage).
 */
export function evaluateDirectionalLeader(
  rawItem: any,
  direction: 'long' | 'short'
): RankedMarketLeader | null {
  if (!rawItem) return null;
  const symbol = String(rawItem.symbol || '').toUpperCase().trim();
  if (!symbol) return null;

  const currentPrice = Number(rawItem.currentPrice ?? rawItem.price ?? 0);
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) return null;

  const isLong = direction === 'long';
  const dirUpper = isLong ? 'BULLISH' : 'BEARISH';
  const oppUpper = isLong ? 'BEARISH' : 'BULLISH';

  const setups: DivergenceSetup[] = Array.isArray(rawItem.setups) ? rawItem.setups : [];
  const matchingSetups = setups
    .filter((s) => typeof s?.type === 'string' && s.type.toUpperCase().includes(dirUpper))
    .sort((a, b) => (b.qualityScore || 0) - (a.qualityScore || 0));
  const opposingSetups = setups.filter(
    (s) => typeof s?.type === 'string' && s.type.toUpperCase().includes(oppUpper)
  );

  const tosReport: TosScanReport | undefined = rawItem.tosScans;
  const tosSignals: TosScanSignal[] = Array.isArray(tosReport?.signals) ? tosReport.signals : [];
  const matchingTos = tosSignals
    .filter((sig) => sig.direction === dirUpper)
    .sort((a, b) => (b.strength || 0) - (a.strength || 0));
  const opposingTos = tosSignals.filter((sig) => sig.direction === oppUpper);

  // Strict signal gate: never invent a fallback setup if neither divergence nor TOS signal exists
  if (matchingSetups.length === 0 && matchingTos.length === 0) {
    return null;
  }

  const bestSetup = matchingSetups[0] ?? null;
  const hasTriple = matchingSetups.some((s) => s.type.toUpperCase().includes('TRIPLE'));
  const hasDouble = matchingSetups.some((s) => s.type.toUpperCase().includes('DOUBLE'));

  // 1. Base Pattern Score (max 45)
  let divPatternPts = 0;
  if (bestSetup) {
    const q = Math.max(40, Math.min(100, Number(bestSetup.qualityScore) || 65));
    if (hasTriple) {
      divPatternPts = 34 + Math.round(Math.max(0, q - 50) * 0.22); // 34..45
    } else if (hasDouble) {
      divPatternPts = 26 + Math.round(Math.max(0, q - 50) * 0.2); // 26..36
    } else {
      divPatternPts = 22 + Math.round(Math.max(0, q - 50) * 0.18);
    }
  }

  let tosClusterPts = 0;
  if (matchingTos.length > 0) {
    const maxStrength = Math.max(40, Math.min(100, Number(matchingTos[0].strength) || 65));
    if (matchingTos.length >= 3) {
      tosClusterPts = 32 + Math.round(maxStrength * 0.13); // ~40..45
    } else if (matchingTos.length === 2) {
      tosClusterPts = 26 + Math.round(maxStrength * 0.13); // ~34..39
    } else {
      tosClusterPts = 17 + Math.round(maxStrength * 0.12); // ~24..29
    }
  }

  const basePatternPts = Math.max(divPatternPts, tosClusterPts);
  const dualEngineBonus =
    matchingSetups.length > 0 && matchingTos.length > 0
      ? matchingTos.length >= 2
        ? 13
        : 9
      : 0;

  // 2. Relative 30-Bar Alpha vs SPY (max 19)
  const relAlpha =
    typeof rawItem.relPerfVsSpyPct === 'number' && Number.isFinite(rawItem.relPerfVsSpyPct)
      ? rawItem.relPerfVsSpyPct
      : null;
  let alphaPts = 0;
  if (relAlpha !== null) {
    const directionalAlpha = isLong ? relAlpha : -relAlpha;
    if (directionalAlpha >= 15) alphaPts = 19;
    else if (directionalAlpha >= 8) alphaPts = 15;
    else if (directionalAlpha >= 3) alphaPts = 11;
    else if (directionalAlpha > 0) alphaPts = 6;
    else if (directionalAlpha >= -5) alphaPts = 2;
    else alphaPts = hasTriple ? -3 : -7;
  }

  // 3. Volume Surge & ATR Liquidity Quality (max 14)
  const atr = Number(rawItem.atr ?? 0) || Number((currentPrice * 0.018).toFixed(2));
  const atrPercent =
    Number(rawItem.atrPercent ?? 0) ||
    (currentPrice > 0 ? Number(((atr / currentPrice) * 100).toFixed(2)) : 0);
  const isStagnant = Boolean(rawItem.isStagnant) || atrPercent < 0.75;
  const relVolStDev =
    typeof tosReport?.snapshot?.relVolStDev === 'number' &&
    Number.isFinite(tosReport.snapshot.relVolStDev)
      ? tosReport.snapshot.relVolStDev
      : null;

  let volLiquidityPts = 0;
  if (relVolStDev !== null) {
    if (relVolStDev >= 2.0) volLiquidityPts += 8;
    else if (relVolStDev >= 1.25) volLiquidityPts += 4;
  }
  if (!isStagnant && atrPercent >= 1.0) {
    volLiquidityPts += 6;
  } else if (isStagnant) {
    volLiquidityPts -= 10;
  }

  // 4. Trend Stage Alignment (max 8)
  const candles: Candle[] | undefined = Array.isArray(rawItem.candles) ? rawItem.candles : undefined;
  const { stage, label: stageLabel } = computeSimpleStageFromCandles(candles, currentPrice);
  let stagePts = 0;
  if (stage !== null) {
    if (isLong) {
      if (stage === 2) stagePts = 8;
      else if (stage === 1) stagePts = hasTriple || hasDouble ? 6 : 3;
      else if (stage === 4 && !hasTriple) stagePts = -9;
    } else {
      if (stage === 4) stagePts = 8;
      else if (stage === 3) stagePts = hasTriple || hasDouble ? 6 : 3;
      else if (stage === 2 && !hasTriple) stagePts = -9;
    }
  }

  // 5. Opposing Signal Conflict Penalty
  let conflictPenalty = 0;
  if (opposingSetups.length > 0 && matchingSetups.length === 0) {
    conflictPenalty -= 8;
  } else if (opposingTos.length >= 2 && opposingTos.length > matchingTos.length && !hasTriple) {
    conflictPenalty -= 5;
  }

  const rawTotal =
    basePatternPts + dualEngineBonus + alphaPts + volLiquidityPts + stagePts + conflictPenalty;
  const score = Math.max(20, Math.min(100, Math.round(rawTotal)));
  const { grade, tier } = scoreToConvictionGrade(score);

  const spMeta = SP500_MAP.get(symbol);
  const sector = rawItem.sector || spMeta?.sector || 'Equities';
  const companyName = rawItem.companyName || spMeta?.name || symbol;
  const universe: ('sp500' | 'ndx100')[] = [];
  if (SP500_MAP.has(symbol)) universe.push('sp500');
  if (NDX_CORE_SET.has(symbol)) universe.push('ndx100');
  if (universe.length === 0) universe.push('sp500');

  // Primary Setup label
  const getTosLabel = (sig: TosScanSignal) => sig.shortLabel || sig.name || sig.id;
  const primarySetup = bestSetup
    ? `${bestSetup.type.replace(/_/g, ' ')}${matchingTos.length > 0 ? ` + ${getTosLabel(matchingTos[0])}` : ''}`
    : matchingTos
        .slice(0, 2)
        .map(getTosLabel)
        .join(' + ');

  const why: string[] = [];
  if (bestSetup) {
    why.push(
      `${bestSetup.type.replace(/_/g, ' ')} on ${bestSetup.timeframe} (Quality ${bestSetup.qualityScore})`
    );
  }
  if (matchingTos.length > 0) {
    why.push(
      `TOS Multi-Scan (${matchingTos.length}): ${matchingTos
        .slice(0, 3)
        .map(getTosLabel)
        .join(' · ')}`
    );
  }
  if (relAlpha !== null) {
    why.push(`30D Alpha vs SPY: ${relAlpha >= 0 ? '+' : ''}${relAlpha.toFixed(1)}%`);
  }
  if (relVolStDev !== null && relVolStDev >= 1.25) {
    why.push(`Relative Volume Surge: +${relVolStDev.toFixed(1)}σ`);
  }
  if (stage !== null) {
    why.push(`${stageLabel} · ATR ${atrPercent.toFixed(2)}%`);
  }

  return {
    rank: 0,
    symbol,
    companyName,
    sector,
    universe,
    direction,
    score,
    grade,
    tier,
    primarySetup,
    hasDivergence: matchingSetups.length > 0,
    hasTripleDivergence: hasTriple,
    matchingDivergence: bestSetup,
    matchingTosSignals: matchingTos,
    signalCount: matchingSetups.length + matchingTos.length,
    currentPrice,
    changePercent: Number(rawItem.changePercent ?? 0),
    atr,
    atrPercent,
    relPerfVsSpyPct: relAlpha,
    return30dPct:
      typeof rawItem.return30dPct === 'number' && Number.isFinite(rawItem.return30dPct)
        ? rawItem.return30dPct
        : null,
    relVolStDev,
    stageLabel,
    why,
    candles,
    rawItem,
  };
}

function compareLeaders(a: RankedMarketLeader, b: RankedMarketLeader): number {
  if (b.score !== a.score) return b.score - a.score;
  if (b.hasTripleDivergence !== a.hasTripleDivergence) return b.hasTripleDivergence ? 1 : -1;
  if (b.signalCount !== a.signalCount) return b.signalCount - a.signalCount;
  const aAlpha = a.relPerfVsSpyPct !== null ? (a.direction === 'long' ? a.relPerfVsSpyPct : -a.relPerfVsSpyPct) : -999;
  const bAlpha = b.relPerfVsSpyPct !== null ? (b.direction === 'long' ? b.relPerfVsSpyPct : -b.relPerfVsSpyPct) : -999;
  if (bAlpha !== aAlpha) return bAlpha - aAlpha;
  return a.symbol.localeCompare(b.symbol);
}

/**
 * Builds two clean, numbered leaderboards (Bullish Top 50 & Bearish Top 50)
 * excluding weak / Grade C-D setups by default (minScore = 68).
 */
export function buildDualMarketLeaderboards(
  scannerResults: any[],
  options: LeaderboardBuildOptions = {}
): DualLeaderboardResult {
  const minScore = options.minScore ?? HIGH_CONVICTION_MIN_SCORE;
  const maxItems = Math.max(1, Math.min(200, options.maxItems ?? MAX_WATCHLIST_LEADERS));

  if (!Array.isArray(scannerResults) || scannerResults.length === 0) {
    return {
      bullish: [],
      bearish: [],
      totalEvaluated: 0,
      excludedWeakBullish: 0,
      excludedWeakBearish: 0,
    };
  }

  const dedupedBySym = new Map<string, any>();
  for (const item of scannerResults) {
    const sym = String(item?.symbol || '').toUpperCase().trim();
    if (sym && !dedupedBySym.has(sym)) {
      dedupedBySym.set(sym, item);
    }
  }

  const bullishQualified: RankedMarketLeader[] = [];
  const bearishQualified: RankedMarketLeader[] = [];
  let excludedWeakBullish = 0;
  let excludedWeakBearish = 0;

  for (const rawItem of dedupedBySym.values()) {
    const bull = evaluateDirectionalLeader(rawItem, 'long');
    if (bull) {
      if (bull.score >= minScore) bullishQualified.push(bull);
      else excludedWeakBullish++;
    }

    const bear = evaluateDirectionalLeader(rawItem, 'short');
    if (bear) {
      if (bear.score >= minScore) bearishQualified.push(bear);
      else excludedWeakBearish++;
    }
  }

  bullishQualified.sort(compareLeaders);
  bearishQualified.sort(compareLeaders);

  const bullish = bullishQualified.slice(0, maxItems).map((item, idx) => ({
    ...item,
    rank: idx + 1,
  }));
  const bearish = bearishQualified.slice(0, maxItems).map((item, idx) => ({
    ...item,
    rank: idx + 1,
  }));

  return {
    bullish,
    bearish,
    totalEvaluated: dedupedBySym.size,
    excludedWeakBullish,
    excludedWeakBearish,
  };
}
