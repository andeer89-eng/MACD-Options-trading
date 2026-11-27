/* =====================================================================
   StageLedger — Unified Top-50 Market Leaders & Conviction Ranking Engine
   Single source of truth for:
   - Live Daily Watchlist (TodayView)
   - Confluence 360° Matrix candidate selection & scoring
   - Trade Action Zones high-conviction pipeline
   - Live Scanner badges

   Uses `evaluateCandidate360Confluence` (Confluence 360° 6-angle engine)
   as the canonical scoring function whenever OHLCV candles (>= 30 bars)
   are present, eliminating A+98 vs A82 divergence across views.
   Never emits signal-less baseline fallbacks or Grade C/D noise by default.
   ===================================================================== */

import { Candle, DivergenceSetup, filterActiveDivergences } from './trullasStrategy';
import { TosScanReport, TosScanSignal } from './tosScansEngine';
import { SP500_UNIVERSE } from '../data/sp500Universe';
import {
  Candidate360Confluence,
  evaluateCandidate360Confluence,
  HIGH_CONVICTION_MIN_SCORE,
  scoreToUnifiedConvictionGrade,
  UnifiedConvictionGrade,
} from './confluenceScoringEngine';

export { HIGH_CONVICTION_MIN_SCORE };
export type ConvictionGrade = UnifiedConvictionGrade;

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
  scoringSource: 'UNIFIED_360' | 'HEURISTIC_FALLBACK';
  legacyHeuristicScore: number;
  confluence360: Candidate360Confluence | null;
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
  sectorAlphaBySector?: Record<string, number> | Map<string, number>;
}

export interface DirectionalEvalOptions {
  sectorAlphaPct?: number | null;
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
  const mapped = scoreToUnifiedConvictionGrade(score);
  return { grade: mapped.grade, tier: mapped.tier };
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

export interface LegacyHeuristicInput {
  isLong: boolean;
  bestSetup: DivergenceSetup | null;
  hasTriple: boolean;
  hasDouble: boolean;
  matchingSetupCount: number;
  matchingTos: TosScanSignal[];
  opposingSetupCount: number;
  opposingTosCount: number;
  relAlpha: number | null;
  relVolStDev: number | null;
  atrPercent: number;
  isStagnant: boolean;
  stage: 1 | 2 | 3 | 4 | null;
}

/**
 * Legacy additive Watchlist heuristic (kept strictly for <30-candle fallback and
 * for Scoring Audit diagnostics to quantify legacy inflation vs Confluence 360°).
 */
export function computeLegacyWatchlistHeuristicScore(input: LegacyHeuristicInput): number {
  const {
    isLong,
    bestSetup,
    hasTriple,
    hasDouble,
    matchingSetupCount,
    matchingTos,
    opposingSetupCount,
    opposingTosCount,
    relAlpha,
    relVolStDev,
    atrPercent,
    isStagnant,
    stage,
  } = input;

  let divPatternPts = 0;
  if (bestSetup) {
    const q = Math.max(40, Math.min(100, Number(bestSetup.qualityScore) || 65));
    if (hasTriple) {
      divPatternPts = 34 + Math.round(Math.max(0, q - 50) * 0.22);
    } else if (hasDouble) {
      divPatternPts = 26 + Math.round(Math.max(0, q - 50) * 0.2);
    } else {
      divPatternPts = 22 + Math.round(Math.max(0, q - 50) * 0.18);
    }
  }

  let tosClusterPts = 0;
  if (matchingTos.length > 0) {
    const maxStrength = Math.max(40, Math.min(100, Number(matchingTos[0].strength) || 65));
    if (matchingTos.length >= 3) {
      tosClusterPts = 32 + Math.round(maxStrength * 0.13);
    } else if (matchingTos.length === 2) {
      tosClusterPts = 26 + Math.round(maxStrength * 0.13);
    } else {
      tosClusterPts = 17 + Math.round(maxStrength * 0.12);
    }
  }

  const basePatternPts = Math.max(divPatternPts, tosClusterPts);
  const dualEngineBonus =
    matchingSetupCount > 0 && matchingTos.length > 0
      ? matchingTos.length >= 2
        ? 13
        : 9
      : 0;

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

  let conflictPenalty = 0;
  if (opposingSetupCount > 0 && matchingSetupCount === 0) {
    conflictPenalty -= 8;
  } else if (opposingTosCount >= 2 && opposingTosCount > matchingTos.length && !hasTriple) {
    conflictPenalty -= 5;
  }

  const rawTotal =
    basePatternPts + dualEngineBonus + alphaPts + volLiquidityPts + stagePts + conflictPenalty;
  return Math.max(20, Math.min(100, Math.round(rawTotal)));
}

function resolveSectorAlpha(
  sector: string,
  sectorAlphaBySector?: Record<string, number> | Map<string, number>
): number | null {
  if (!sectorAlphaBySector || !sector) return null;
  if (sectorAlphaBySector instanceof Map) {
    const val = sectorAlphaBySector.get(sector);
    return typeof val === 'number' && Number.isFinite(val) ? val : null;
  }
  const val = sectorAlphaBySector[sector];
  return typeof val === 'number' && Number.isFinite(val) ? val : null;
}

/**
 * Evaluates a scanned ticker strictly for ONE direction ('long' = BULLISH or 'short' = BEARISH).
 * Returns null when the ticker has ZERO directional signals (prevents signal-less Grade C/D leakage).
 *
 * Uses `evaluateCandidate360Confluence` as canonical single source of truth whenever >= 30 bars exist.
 */
export function evaluateDirectionalLeader(
  rawItem: any,
  direction: 'long' | 'short',
  options?: DirectionalEvalOptions
): RankedMarketLeader | null {
  if (!rawItem) return null;
  const symbol = String(rawItem.symbol || '').toUpperCase().trim();
  if (!symbol) return null;

  const currentPrice = Number(rawItem.currentPrice ?? rawItem.price ?? 0);
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) return null;

  const isLong = direction === 'long';
  const dirUpper: 'BULLISH' | 'BEARISH' = isLong ? 'BULLISH' : 'BEARISH';
  const oppUpper: 'BULLISH' | 'BEARISH' = isLong ? 'BEARISH' : 'BULLISH';

  const candles: Candle[] | undefined = Array.isArray(rawItem.candles) ? rawItem.candles : undefined;
  const rawSetups: DivergenceSetup[] = Array.isArray(rawItem.setups) ? rawItem.setups : [];
  const setups: DivergenceSetup[] = filterActiveDivergences(rawSetups, candles, {
    spotPrice: currentPrice,
  });
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

  const relAlpha =
    typeof rawItem.relPerfVsSpyPct === 'number' && Number.isFinite(rawItem.relPerfVsSpyPct)
      ? rawItem.relPerfVsSpyPct
      : null;

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

  const { stage, label: stageLabel } = computeSimpleStageFromCandles(candles, currentPrice);

  const legacyHeuristicScore = computeLegacyWatchlistHeuristicScore({
    isLong,
    bestSetup,
    hasTriple,
    hasDouble,
    matchingSetupCount: matchingSetups.length,
    matchingTos,
    opposingSetupCount: opposingSetups.length,
    opposingTosCount: opposingTos.length,
    relAlpha,
    relVolStDev,
    atrPercent,
    isStagnant,
    stage,
  });

  const spMeta = SP500_MAP.get(symbol);
  const sector = rawItem.sector || spMeta?.sector || 'Equities';
  const companyName = rawItem.companyName || spMeta?.name || symbol;
  const universe: ('sp500' | 'ndx100')[] = [];
  if (SP500_MAP.has(symbol)) universe.push('sp500');
  if (NDX_CORE_SET.has(symbol)) universe.push('ndx100');
  if (universe.length === 0) universe.push('sp500');

  const getTosLabel = (sig: TosScanSignal) => sig.shortLabel || sig.name || sig.id;

  // Canonical 360° Confluence scoring whenever >= 30 real OHLCV bars exist
  const normalizedCandles: Candle[] | undefined =
    candles && candles.length >= 30
      ? candles
          .filter((c) => c && typeof c.close === 'number' && Number.isFinite(c.close) && c.close > 0)
          .map((c) => {
            const ts = Number(c.timestamp) || (c.dateStr ? Date.parse(c.dateStr) : Date.now());
            return {
              timestamp: ts,
              dateStr: c.dateStr || new Date(ts).toISOString().split('T')[0],
              open: Number(c.open ?? c.close),
              high: Number(c.high ?? c.close),
              low: Number(c.low ?? c.close),
              close: Number(c.close),
              volume: Number(c.volume) || 0,
            };
          })
      : undefined;

  const confluence360 =
    normalizedCandles && normalizedCandles.length >= 30
      ? evaluateCandidate360Confluence(symbol, normalizedCandles, dirUpper, {
          sectorAlphaPct: options?.sectorAlphaPct ?? null,
          relPerfVsSpyPct: relAlpha,
          relVolStDev,
          matchingSetup: bestSetup
            ? {
                type: bestSetup.type,
                qualityScore: bestSetup.qualityScore,
                timeframe: bestSetup.timeframe,
              }
            : null,
          tosSignals: matchingTos.map((s) => ({
            id: s.id,
            label: getTosLabel(s),
            direction: dirUpper,
            strength: s.strength,
          })),
          isStagnant,
          opposingSetupCount: opposingSetups.length,
          opposingTosCount: opposingTos.length,
        })
      : null;

  const score = confluence360 ? confluence360.overallScore : legacyHeuristicScore;
  const { grade, tier } = scoreToConvictionGrade(score);
  const scoringSource: RankedMarketLeader['scoringSource'] = confluence360
    ? 'UNIFIED_360'
    : 'HEURISTIC_FALLBACK';

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
    scoringSource,
    legacyHeuristicScore,
    confluence360,
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
    const sym = String(rawItem?.symbol || '').toUpperCase().trim();
    const spMeta = SP500_MAP.get(sym);
    const sector = rawItem?.sector || spMeta?.sector || 'Equities';
    const sectorAlphaPct = resolveSectorAlpha(sector, options.sectorAlphaBySector);

    const bull = evaluateDirectionalLeader(rawItem, 'long', { sectorAlphaPct });
    if (bull) {
      if (bull.score >= minScore) bullishQualified.push(bull);
      else excludedWeakBullish++;
    }

    const bear = evaluateDirectionalLeader(rawItem, 'short', { sectorAlphaPct });
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
