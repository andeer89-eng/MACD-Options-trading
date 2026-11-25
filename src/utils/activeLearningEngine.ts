/**
 * Active Memory & Continual Learning Engine for Automated Portfolio Management
 * Starts clean with neutral 1.0x weights and zero fabricated seed trade episodes.
 * Learns strictly from real executed/closed user & bot trades, conditioned on the
 * immutable Market Health & Structural Regime snapshot captured at order entry.
 */

import type { MarketHealthReport } from './marketHealthEngine';
import type { MarketStructuralSummary } from './marketStructuralContext';
import {
  backfillEntryMarketContextFromHistory,
  buildEntryMarketContextFromReport,
  formatEntryMarketContextBadge,
  formatStructuralRegimeLabel,
  formatVixBucketLabel,
  lookupEntryMarketContextSnapshot,
  type EntryMarketContext,
} from './entryMarketContext';
import type { JournalEntry } from './tradeJournal';

export interface TradeEpisode {
  id: string;
  timestamp: string;
  symbol: string;
  companyName: string;
  setupType: string;
  direction: 'BULLISH' | 'BEARISH';
  assetMode?: 'EQUITY' | 'OPTIONS';
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  pnlPercent: number;
  realizedR?: number | null;
  outcome: 'WIN' | 'LOSS' | 'BREAKEVEN';
  qualityScore: number;
  atrPercent: number;
  durationDays?: number;
  sourceLotId?: string;
  entryMarketContext?: EntryMarketContext | null;
  reflectionCritique: string;
  learnedRule: string;
  synapticWeightDelta: number;
}

export interface SetupPerformanceStat {
  tradesCount: number;
  winsCount: number;
  lossesCount: number;
  winRate: number;
  totalPnL: number;
  currentWeightMultiplier: number; // 0.40x to 1.60x
  confidenceRating: 'HIGH' | 'MODERATE' | 'LOW' | 'CAUTIONARY';
}

export type RegimeStatAxis =
  | 'SENTIMENT'
  | 'VIX'
  | 'TERM_STRUCTURE'
  | 'STRUCTURAL'
  | 'SENTIMENT_X_SETUP';

export interface RegimePerformanceStat {
  regimeKey: string;
  axis: RegimeStatAxis;
  label: string;
  assetMode: 'EQUITY' | 'OPTIONS';
  tradesCount: number;
  effectiveN: number; // Time-decayed effective sample count
  winsCount: number;
  lossesCount: number;
  winRate: number;
  avgRealizedR: number | null;
  expectancyDollars: number;
  totalPnL: number;
  rawPerformanceFactor: number;
  shrunkMultiplier: number; // Empirical Bayes shrinkage toward 1.0x (prior K=8), bounded [0.55, 1.45]
  recommendedMinQualityDelta: number; // -4..+10 added to base quality gate
  recommendedAtrStopDelta: number; // -0.10..+0.25 added to ATR stop multiple
  sampleSufficient: boolean; // tradesCount >= 10
  confidenceRating: 'HIGH' | 'MODERATE' | 'LOW_SAMPLE' | 'CAUTIONARY';
}

export interface ActiveMemoryState {
  version: string;
  episodes: TradeEpisode[];
  learnedRules: string[];
  setupWeights: Record<string, SetupPerformanceStat>;
  symbolStats: Record<string, { wins: number; losses: number; winRate: number; weightMultiplier: number }>;
  regimeStats?: Record<string, RegimePerformanceStat>;
  ingestedLotIds?: string[];
  calibratedMinQualityScore: number;
  calibratedAtrStopMultiple: number;
  riskMultiplier: number;
  learningIterations: number;
  lastUpdated: string;
}

const MEMORY_STORAGE_KEY = 'trullas_active_learning_memory_v2';
const DEFAULT_PRIOR_K = 8;
const DEFAULT_HALF_LIFE_EPISODES = 40;
let episodeSeq = 0;

function clamp(val: number, min: number, max: number): number {
  if (!Number.isFinite(val)) return min;
  return Math.max(min, Math.min(max, val));
}

export function normalizeSetupName(rawSetup: string): string {
  return String(rawSetup || 'BULLISH TRIPLE')
    .toUpperCase()
    .replace(/_/g, ' ')
    .trim();
}

export function computeEpisodeRealizedR(params: {
  pnl: number;
  pnlPercent: number;
  atrPercent: number;
  initialRiskDollars?: number | null;
}): number | null {
  if (
    typeof params.initialRiskDollars === 'number' &&
    Number.isFinite(params.initialRiskDollars) &&
    params.initialRiskDollars > 0.5
  ) {
    return Number(clamp(params.pnl / params.initialRiskDollars, -5, 8).toFixed(2));
  }
  const safeAtr = Math.max(0.8, Number(params.atrPercent) || 2.0);
  // Proxy initial stop distance at 1.25x ATR% when explicit risk dollars weren't recorded
  const impliedRiskPct = safeAtr * 1.25;
  if (Number.isFinite(params.pnlPercent) && impliedRiskPct > 0) {
    return Number(clamp(params.pnlPercent / impliedRiskPct, -5, 8).toFixed(2));
  }
  return null;
}

/**
 * Computes time-decayed Empirical Bayes Shrinkage regime statistics across
 * Sentiment, VIX level, VIX Term Structure, Structural Zone, and Sentiment x Setup.
 * Never overfits small samples (prior K=8 pulls shrunkMultiplier tightly toward 1.00x).
 */
export function recomputeRegimeMatrix(
  episodes: TradeEpisode[],
  options?: {
    priorK?: number;
    halfLifeEpisodes?: number;
    assetMode?: 'EQUITY' | 'OPTIONS';
  }
): Record<string, RegimePerformanceStat> {
  const priorK = options?.priorK ?? DEFAULT_PRIOR_K;
  const halfLife = options?.halfLifeEpisodes ?? DEFAULT_HALF_LIFE_EPISODES;
  const targetMode = options?.assetMode;

  const filtered = (episodes || []).filter((ep) => {
    if (!ep.entryMarketContext) return false;
    if (targetMode && (ep.assetMode || ep.entryMarketContext.assetMode || 'EQUITY') !== targetMode) {
      return false;
    }
    return true;
  });

  if (filtered.length === 0) return {};

  interface BucketAcc {
    regimeKey: string;
    axis: RegimeStatAxis;
    label: string;
    assetMode: 'EQUITY' | 'OPTIONS';
    tradesCount: number;
    effectiveN: number;
    winsCount: number;
    lossesCount: number;
    weightedWinSum: number;
    weightedRSum: number;
    weightedRWeight: number;
    rSimpleSum: number;
    rSimpleCount: number;
    totalPnL: number;
  }

  const buckets = new Map<string, BucketAcc>();

  // `episodes` are stored newest-first in ActiveMemoryState; idx=0 is most recent
  filtered.forEach((ep, idx) => {
    const ctx = ep.entryMarketContext!;
    const mode: 'EQUITY' | 'OPTIONS' = ep.assetMode || ctx.assetMode || 'EQUITY';
    const decayWeight = Math.pow(0.5, idx / Math.max(5, halfLife));
    const isWin = ep.outcome === 'WIN';
    const isLoss = ep.outcome === 'LOSS';
    const realizedR =
      typeof ep.realizedR === 'number' && Number.isFinite(ep.realizedR)
        ? ep.realizedR
        : computeEpisodeRealizedR({
            pnl: ep.pnl,
            pnlPercent: ep.pnlPercent,
            atrPercent: ep.atrPercent,
            initialRiskDollars: ctx.initialRiskDollars,
          });

    const axes: Array<{ key: string; axis: RegimeStatAxis; label: string }> = [
      {
        key: `${mode}|SENT|${ctx.sentimentLabel}`,
        axis: 'SENTIMENT',
        label: ctx.sentimentLabel,
      },
      {
        key: `${mode}|VIX|${ctx.vixBucket}`,
        axis: 'VIX',
        label: formatVixBucketLabel(ctx.vixBucket),
      },
    ];

    if (ctx.vixTermStructure && ctx.vixTermStructure !== 'UNAVAILABLE') {
      axes.push({
        key: `${mode}|TERM|${ctx.vixTermStructure}`,
        axis: 'TERM_STRUCTURE',
        label: `VIX ${ctx.vixTermStructure}`,
      });
    }

    const struct = ctx.symbolStructuralRegime || ctx.spyStructuralRegime;
    if (struct) {
      axes.push({
        key: `${mode}|STRUCT|${struct}`,
        axis: 'STRUCTURAL',
        label: formatStructuralRegimeLabel(struct),
      });
    }

    const normSetup = normalizeSetupName(ep.setupType);
    axes.push({
      key: `${mode}|COMBO|${ctx.sentimentLabel}|${normSetup}`,
      axis: 'SENTIMENT_X_SETUP',
      label: `${ctx.sentimentLabel} × ${normSetup}`,
    });

    for (const item of axes) {
      const acc = buckets.get(item.key) || {
        regimeKey: item.key,
        axis: item.axis,
        label: item.label,
        assetMode: mode,
        tradesCount: 0,
        effectiveN: 0,
        winsCount: 0,
        lossesCount: 0,
        weightedWinSum: 0,
        weightedRSum: 0,
        weightedRWeight: 0,
        rSimpleSum: 0,
        rSimpleCount: 0,
        totalPnL: 0,
      };

      acc.tradesCount += 1;
      acc.effectiveN += decayWeight;
      if (isWin) {
        acc.winsCount += 1;
        acc.weightedWinSum += decayWeight;
      } else if (isLoss) {
        acc.lossesCount += 1;
      } else {
        acc.weightedWinSum += 0.5 * decayWeight;
      }
      if (realizedR !== null && Number.isFinite(realizedR)) {
        acc.weightedRSum += realizedR * decayWeight;
        acc.weightedRWeight += decayWeight;
        acc.rSimpleSum += realizedR;
        acc.rSimpleCount += 1;
      }
      acc.totalPnL += ep.pnl;
      buckets.set(item.key, acc);
    }
  });

  const stats: Record<string, RegimePerformanceStat> = {};

  for (const [key, acc] of buckets.entries()) {
    const winRate = acc.tradesCount > 0 ? Number(((acc.winsCount / acc.tradesCount) * 100).toFixed(1)) : 0;
    const weightedWinRate = acc.effectiveN > 0 ? acc.weightedWinSum / acc.effectiveN : 0.5;
    const weightedAvgR = acc.weightedRWeight > 0 ? acc.weightedRSum / acc.weightedRWeight : 0;
    const avgRealizedR = acc.rSimpleCount > 0 ? Number((acc.rSimpleSum / acc.rSimpleCount).toFixed(2)) : null;

    // Performance factor combines win-rate edge above 50% and realized R expectancy
    const winEdge = (weightedWinRate - 0.5) * 0.7;
    const rEdge = clamp(weightedAvgR * 0.25, -0.45, 0.5);
    const rawPerformanceFactor = Number(clamp(1.0 + winEdge + rEdge, 0.4, 1.65).toFixed(3));

    // Empirical Bayes shrinkage toward neutral 1.0x using time-decayed effectiveN
    const shrunkRaw = (acc.effectiveN * rawPerformanceFactor + priorK * 1.0) / (acc.effectiveN + priorK);
    const shrunkMultiplier = Number(clamp(shrunkRaw, 0.55, 1.45).toFixed(2));

    // Recommended quality & ATR stop deltas stay conservative when sample is small
    const sampleTrust = Math.min(1, acc.effectiveN / 10);
    let recommendedMinQualityDelta = 0;
    let recommendedAtrStopDelta = 0;

    if (acc.tradesCount >= 3) {
      if (shrunkMultiplier < 0.94) {
        recommendedMinQualityDelta = Math.round(clamp((1.0 - shrunkMultiplier) * 28 * sampleTrust, 1, 10));
      } else if (shrunkMultiplier > 1.08 && acc.tradesCount >= 6) {
        recommendedMinQualityDelta = -Math.round(clamp((shrunkMultiplier - 1.0) * 12 * sampleTrust, 1, 4));
      }

      if ((key.includes('Fear') || key.includes('ELEVATED_VIX') || key.includes('CRISIS_VIX')) && winRate < 55) {
        recommendedAtrStopDelta = Number(clamp(0.15 * sampleTrust, 0.05, 0.25).toFixed(2));
      } else if (key.includes('LOW_VIX') && avgRealizedR !== null && avgRealizedR > 0.6) {
        recommendedAtrStopDelta = Number(clamp(-0.08 * sampleTrust, -0.1, 0).toFixed(2));
      }
    }

    const sampleSufficient = acc.tradesCount >= 10;
    let confidenceRating: RegimePerformanceStat['confidenceRating'] = 'LOW_SAMPLE';
    if (acc.tradesCount >= 5) {
      if (shrunkMultiplier >= 1.12 && winRate >= 58) confidenceRating = 'HIGH';
      else if (shrunkMultiplier <= 0.88 || (avgRealizedR !== null && avgRealizedR < -0.25))
        confidenceRating = 'CAUTIONARY';
      else confidenceRating = 'MODERATE';
    }

    stats[key] = {
      regimeKey: key,
      axis: acc.axis,
      label: acc.label,
      assetMode: acc.assetMode,
      tradesCount: acc.tradesCount,
      effectiveN: Number(acc.effectiveN.toFixed(2)),
      winsCount: acc.winsCount,
      lossesCount: acc.lossesCount,
      winRate,
      avgRealizedR,
      expectancyDollars: acc.tradesCount > 0 ? Number((acc.totalPnL / acc.tradesCount).toFixed(2)) : 0,
      totalPnL: Number(acc.totalPnL.toFixed(2)),
      rawPerformanceFactor,
      shrunkMultiplier,
      recommendedMinQualityDelta,
      recommendedAtrStopDelta,
      sampleSufficient,
      confidenceRating,
    };
  }

  return stats;
}

export function initDefaultActiveMemory(): ActiveMemoryState {
  const neutralStat = (): SetupPerformanceStat => ({
    tradesCount: 0,
    winsCount: 0,
    lossesCount: 0,
    winRate: 0,
    totalPnL: 0,
    currentWeightMultiplier: 1.0,
    confidenceRating: 'MODERATE',
  });

  return {
    version: '2.0.0',
    episodes: [],
    learnedRules: [],
    setupWeights: {
      'BULLISH TRIPLE': neutralStat(),
      'BEARISH TRIPLE': neutralStat(),
      'BULLISH DOUBLE': neutralStat(),
      'BEARISH DOUBLE': neutralStat(),
    },
    symbolStats: {},
    regimeStats: {},
    ingestedLotIds: [],
    calibratedMinQualityScore: 70,
    calibratedAtrStopMultiple: 1.25,
    riskMultiplier: 1.0,
    learningIterations: 0,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Load Active Memory from LocalStorage or initialize clean neutral baseline
 */
export function loadActiveMemoryState(): ActiveMemoryState {
  if (typeof window === 'undefined') return initDefaultActiveMemory();
  try {
    const raw = localStorage.getItem(MEMORY_STORAGE_KEY);
    if (!raw) {
      const def = initDefaultActiveMemory();
      localStorage.setItem(MEMORY_STORAGE_KEY, JSON.stringify(def));
      return def;
    }
    const parsed = JSON.parse(raw) as ActiveMemoryState;
    if (parsed && Array.isArray(parsed.episodes) && parsed.setupWeights) {
      const seenIds = new Set<string>();
      parsed.episodes = parsed.episodes.map((ep, idx) => {
        let epId = ep.id;
        if (!epId || seenIds.has(epId)) {
          epId = `${epId || 'ep'}-${idx}-${Date.now()}`;
        }
        seenIds.add(epId);
        return { ...ep, id: epId };
      });
      if (!parsed.regimeStats) {
        parsed.regimeStats = recomputeRegimeMatrix(parsed.episodes);
      }
      if (!Array.isArray(parsed.ingestedLotIds)) {
        parsed.ingestedLotIds = parsed.episodes
          .map((e) => e.sourceLotId)
          .filter((id): id is string => typeof id === 'string' && id.length > 0);
      }
      return parsed;
    }
  } catch (err) {
    console.error('Failed to load active memory state:', err);
  }
  return initDefaultActiveMemory();
}

export function saveActiveMemoryState(state: ActiveMemoryState): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(MEMORY_STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error('Failed to save active memory state:', err);
  }
}

export function resetActiveMemoryState(): ActiveMemoryState {
  const state = initDefaultActiveMemory();
  saveActiveMemoryState(state);
  return state;
}

/**
 * Generate an automated post-trade critique based on actual closed trade telemetry + entry market regime
 */
export function generateTradeReflection(
  symbol: string,
  setupType: string,
  direction: 'BULLISH' | 'BEARISH',
  pnl: number,
  pnlPercent: number,
  qualityScore: number,
  atrPercent: number,
  exitReason: string,
  entryMarketContext?: EntryMarketContext | null,
  realizedR?: number | null
): { critique: string; rule: string; deltaWeight: number } {
  const isWin = pnl > 0;
  const isBigWin = pnlPercent >= 5.0 || (typeof realizedR === 'number' && realizedR >= 1.5);
  const isStopOut = exitReason.toUpperCase().includes('STOP') || pnl < 0;
  const ctxTag = entryMarketContext ? ` [Entry: ${formatEntryMarketContextBadge(entryMarketContext)}]` : '';
  const rTag =
    typeof realizedR === 'number' && Number.isFinite(realizedR)
      ? `, ${realizedR >= 0 ? '+' : ''}${realizedR.toFixed(2)}R`
      : '';

  if (isWin) {
    const critique = `${symbol} ${setupType} (${direction}) delivered positive expectancy (+${pnlPercent.toFixed(1)}%, +$${pnl.toFixed(2)}${rTag}). Entry criteria at quality score ${qualityScore}% and ATR ${atrPercent.toFixed(2)}% validated Trullàs Fibonacci impulse.${ctxTag}`;
    const rule = entryMarketContext
      ? `[${entryMarketContext.sentimentLabel}] ${setupType} on ${symbol} validated edge (${rTag ? `${realizedR!.toFixed(2)}R` : `+${pnlPercent.toFixed(1)}%`}). Reinforce ${entryMarketContext.sentimentLabel} allocation.`
      : isBigWin
      ? `Setup Pattern [${setupType}] on ${symbol} exhibited strong edge (>5% return). Sizing multiplier raised based on realized outcome.`
      : `Scale-out discipline on ${symbol} locked realized gains while reducing downside risk.`;
    const deltaWeight = isBigWin ? +0.15 : +0.08;
    return { critique, rule, deltaWeight };
  } else if (isStopOut) {
    const critique = `${symbol} ${setupType} stopped out with loss (-${Math.abs(pnlPercent).toFixed(1)}%, -$${Math.abs(pnl).toFixed(2)}${rTag}). Exit enforced per risk constraint (ATR ${atrPercent.toFixed(2)}%).${ctxTag}`;
    const rule = entryMarketContext
      ? `[${entryMarketContext.sentimentLabel}] Throttle ${setupType} exposure in ${entryMarketContext.sentimentLabel} (${entryMarketContext.vix !== null ? `VIX ${entryMarketContext.vix.toFixed(1)}` : 'N/A'}) and tighten quality filter.`
      : `Throttle ${setupType} allocation on ${symbol} by -15% and widen ATR stop cushion to reduce whipsaws.`;
    const deltaWeight = -0.15;
    return { critique, rule, deltaWeight };
  } else {
    const critique = `${symbol} trade closed near breakeven ($${pnl.toFixed(2)}${rTag}). Setup lacked follow-through beyond entry.${ctxTag}`;
    const rule = entryMarketContext
      ? `[${entryMarketContext.sentimentLabel}] Require stronger volume confirmation for ${setupType} in ${entryMarketContext.sentimentLabel} chop.`
      : `Require stronger volume confirmation for ${setupType} to filter range-bound chop.`;
    return { critique, rule, deltaWeight: 0.0 };
  }
}

function deriveRegimeComparisonInsights(regimeStats: Record<string, RegimePerformanceStat>): string[] {
  const sentimentRows = Object.values(regimeStats)
    .filter((r) => r.axis === 'SENTIMENT' && r.tradesCount >= 2)
    .sort((a, b) => b.shrunkMultiplier - a.shrunkMultiplier);

  if (sentimentRows.length < 2) return [];
  const best = sentimentRows[0];
  const worst = sentimentRows[sentimentRows.length - 1];
  if (best.regimeKey === worst.regimeKey) return [];

  const insights: string[] = [];
  if (best.shrunkMultiplier > 1.02) {
    insights.push(
      `Regime Edge (${best.assetMode}): Strongest expectancy in ${best.label} (${best.winRate}% WR, ${best.avgRealizedR !== null ? `${best.avgRealizedR >= 0 ? '+' : ''}${best.avgRealizedR}R` : `$${best.expectancyDollars}`}, n=${best.tradesCount} -> ${best.shrunkMultiplier}x).`
    );
  }
  if (worst.shrunkMultiplier < 0.98) {
    insights.push(
      `Regime Caution (${worst.assetMode}): Weakest expectancy in ${worst.label} (${worst.winRate}% WR, ${worst.avgRealizedR !== null ? `${worst.avgRealizedR >= 0 ? '+' : ''}${worst.avgRealizedR}R` : `$${worst.expectancyDollars}`}, n=${worst.tradesCount} -> ${worst.shrunkMultiplier}x, Quality +${worst.recommendedMinQualityDelta}%).`
    );
  }
  return insights;
}

/**
 * Online Learning step: Ingests a closed trade, creates an episodic memory entry,
 * updates Bayesian setup multipliers + Market-Regime Matrix, and recalibrates thresholds.
 */
export function ingestTradeEpisode(
  currentState: ActiveMemoryState,
  trade: {
    symbol: string;
    companyName?: string;
    setupType: string;
    direction: 'BULLISH' | 'BEARISH';
    assetMode?: 'EQUITY' | 'OPTIONS';
    entryPrice: number;
    exitPrice: number;
    pnl: number;
    pnlPercent: number;
    qualityScore?: number;
    atrPercent?: number;
    durationDays?: number;
    exitReason: string;
    entryMarketContext?: EntryMarketContext | null;
    initialRiskDollars?: number | null;
    sourceLotId?: string;
    timestamp?: string;
  }
): { updatedState: ActiveMemoryState; newEpisode: TradeEpisode; skippedDuplicate?: boolean } {
  const existingLotIds = Array.isArray(currentState.ingestedLotIds) ? currentState.ingestedLotIds : [];
  if (trade.sourceLotId && existingLotIds.includes(trade.sourceLotId)) {
    const existingEp = currentState.episodes.find((e) => e.sourceLotId === trade.sourceLotId) || currentState.episodes[0];
    return { updatedState: currentState, newEpisode: existingEp, skippedDuplicate: true };
  }

  const normSetup = normalizeSetupName(trade.setupType);
  const quality = trade.qualityScore || 70;
  const atrPct = trade.atrPercent || 2.0;
  const outcome: 'WIN' | 'LOSS' | 'BREAKEVEN' =
    trade.pnl > 1.0 ? 'WIN' : trade.pnl < -1.0 ? 'LOSS' : 'BREAKEVEN';

  const realizedR = computeEpisodeRealizedR({
    pnl: trade.pnl,
    pnlPercent: trade.pnlPercent,
    atrPercent: atrPct,
    initialRiskDollars: trade.initialRiskDollars ?? trade.entryMarketContext?.initialRiskDollars,
  });

  const { critique, rule, deltaWeight } = generateTradeReflection(
    trade.symbol,
    normSetup,
    trade.direction,
    trade.pnl,
    trade.pnlPercent,
    quality,
    atrPct,
    trade.exitReason,
    trade.entryMarketContext,
    realizedR
  );

  episodeSeq += 1;
  const newEpisode: TradeEpisode = {
    id: `ep-${Date.now()}-${episodeSeq}-${trade.symbol}`,
    timestamp: trade.timestamp || new Date().toISOString().replace('T', ' ').slice(0, 16),
    symbol: trade.symbol,
    companyName: trade.companyName || trade.symbol,
    setupType: normSetup,
    direction: trade.direction,
    assetMode: trade.assetMode || trade.entryMarketContext?.assetMode || 'EQUITY',
    entryPrice: trade.entryPrice,
    exitPrice: trade.exitPrice,
    pnl: Number(trade.pnl.toFixed(2)),
    pnlPercent: Number(trade.pnlPercent.toFixed(2)),
    realizedR,
    outcome,
    qualityScore: quality,
    atrPercent: atrPct,
    durationDays: trade.durationDays,
    sourceLotId: trade.sourceLotId,
    entryMarketContext: trade.entryMarketContext ?? null,
    reflectionCritique: critique,
    learnedRule: rule,
    synapticWeightDelta: deltaWeight,
  };

  const currentSetupStat = currentState.setupWeights[normSetup] || {
    tradesCount: 0,
    winsCount: 0,
    lossesCount: 0,
    winRate: 0,
    totalPnL: 0,
    currentWeightMultiplier: 1.0,
    confidenceRating: 'MODERATE',
  };

  const newTradesCount = currentSetupStat.tradesCount + 1;
  const newWinsCount = currentSetupStat.winsCount + (outcome === 'WIN' ? 1 : 0);
  const newLossesCount = currentSetupStat.lossesCount + (outcome === 'LOSS' ? 1 : 0);
  const newWinRate = Number(((newWinsCount / newTradesCount) * 100).toFixed(1));
  const newTotalPnL = Number((currentSetupStat.totalPnL + trade.pnl).toFixed(2));

  let newMultiplier = currentSetupStat.currentWeightMultiplier + deltaWeight;
  newMultiplier = Math.max(0.4, Math.min(1.6, Number(newMultiplier.toFixed(2))));

  let confidenceRating: SetupPerformanceStat['confidenceRating'] = 'MODERATE';
  if (newTradesCount >= 2) {
    if (newWinRate >= 70) confidenceRating = 'HIGH';
    else if (newWinRate <= 40) confidenceRating = 'CAUTIONARY';
    else confidenceRating = 'MODERATE';
  }

  const updatedSetupWeights = {
    ...currentState.setupWeights,
    [normSetup]: {
      tradesCount: newTradesCount,
      winsCount: newWinsCount,
      lossesCount: newLossesCount,
      winRate: newWinRate,
      totalPnL: newTotalPnL,
      currentWeightMultiplier: newMultiplier,
      confidenceRating,
    },
  };

  const currentSym = currentState.symbolStats[trade.symbol] || {
    wins: 0,
    losses: 0,
    winRate: 0,
    weightMultiplier: 1.0,
  };
  const symWins = currentSym.wins + (outcome === 'WIN' ? 1 : 0);
  const symLosses = currentSym.losses + (outcome === 'LOSS' ? 1 : 0);
  const symTotal = symWins + symLosses;
  const symWinRate = symTotal > 0 ? Number(((symWins / symTotal) * 100).toFixed(1)) : 0;
  let symMultiplier = currentSym.weightMultiplier + deltaWeight;
  symMultiplier = Math.max(0.5, Math.min(1.5, Number(symMultiplier.toFixed(2))));

  const updatedSymbolStats = {
    ...currentState.symbolStats,
    [trade.symbol]: {
      wins: symWins,
      losses: symLosses,
      winRate: symWinRate,
      weightMultiplier: symMultiplier,
    },
  };

  let calibratedMinQuality = currentState.calibratedMinQualityScore;
  let calibratedAtrMultiple = currentState.calibratedAtrStopMultiple;
  let riskMult = currentState.riskMultiplier;

  if (outcome === 'LOSS') {
    calibratedMinQuality = Math.min(80, calibratedMinQuality + 1);
    calibratedAtrMultiple = Math.min(1.6, Number((calibratedAtrMultiple + 0.05).toFixed(2)));
    riskMult = Math.max(0.75, Number((riskMult - 0.05).toFixed(2)));
  } else if (outcome === 'WIN') {
    calibratedMinQuality = Math.max(68, calibratedMinQuality - 0.5);
    riskMult = Math.min(1.25, Number((riskMult + 0.04).toFixed(2)));
  }

  const nextEpisodes = [newEpisode, ...currentState.episodes].slice(0, 120);
  const nextRegimeStats = recomputeRegimeMatrix(nextEpisodes);
  const regimeInsights = deriveRegimeComparisonInsights(nextRegimeStats);

  const existingRules = currentState.learnedRules.filter(
    (r) => !r.includes(normSetup) && !r.startsWith('Regime Edge') && !r.startsWith('Regime Caution')
  );
  const updatedRules = [...regimeInsights, rule, ...existingRules].slice(0, 10);

  const nextIngestedLotIds = trade.sourceLotId
    ? [...existingLotIds, trade.sourceLotId].slice(-300)
    : existingLotIds;

  const updatedState: ActiveMemoryState = {
    ...currentState,
    episodes: nextEpisodes,
    learnedRules: updatedRules,
    setupWeights: updatedSetupWeights,
    symbolStats: updatedSymbolStats,
    regimeStats: nextRegimeStats,
    ingestedLotIds: nextIngestedLotIds,
    calibratedMinQualityScore: Number(calibratedMinQuality.toFixed(0)),
    calibratedAtrStopMultiple: calibratedAtrMultiple,
    riskMultiplier: riskMult,
    learningIterations: currentState.learningIterations + 1,
    lastUpdated: new Date().toISOString(),
  };

  return { updatedState, newEpisode };
}

/**
 * Automatically ingests newly closed Alpaca Paper / Journal lots into ActiveMemoryState,
 * attaching stored EntryMarketContext snapshots or deterministic 1M MarketHealth backfill.
 * Pure & deduplicated by `entry.id`.
 */
export function syncClosedJournalEntriesToActiveMemory(
  currentState: ActiveMemoryState,
  entries: JournalEntry[],
  marketHealth?: MarketHealthReport | null
): { updatedState: ActiveMemoryState; ingestedCount: number } {
  const closed = (entries || [])
    .filter((e) => e.status !== 'OPEN' && e.exitPrice !== undefined && e.realizedPnL !== undefined)
    .slice()
    .sort((a, b) => (a.exitDate || a.entryDate).localeCompare(b.exitDate || b.entryDate));

  const alreadyIngested = new Set(currentState.ingestedLotIds || []);
  let state = currentState;
  let ingestedCount = 0;

  for (const entry of closed) {
    if (alreadyIngested.has(entry.id)) continue;

    const isOption = entry.tags?.includes('Alpaca Options') || entry.symbol.length > 10;
    const assetMode: 'EQUITY' | 'OPTIONS' = isOption ? 'OPTIONS' : 'EQUITY';
    const openOrderTag = entry.tags?.find((t) => t.startsWith('alpaca-order:'))?.slice('alpaca-order:'.length);
    const riskPerUnit = Math.abs((entry.entryPrice || 0) - (entry.stopLoss || 0));
    const multiplier = isOption ? 100 : 1;
    const initialRiskDollars =
      riskPerUnit > 0 && entry.quantity > 0 ? Number((riskPerUnit * entry.quantity * multiplier).toFixed(2)) : null;

    let ctx: EntryMarketContext | null =
      entry.entryMarketContext ||
      lookupEntryMarketContextSnapshot({
        orderId: openOrderTag,
        symbol: entry.symbol,
        entryDate: entry.entryDate,
      });

    if (!ctx && marketHealth) {
      ctx = backfillEntryMarketContextFromHistory(entry.entryDate, marketHealth, {
        initialRiskDollars,
        assetMode,
      });
    }

    const direction: 'BULLISH' | 'BEARISH' = entry.setupType.includes('BEAR') ? 'BEARISH' : 'BULLISH';
    const { updatedState, skippedDuplicate } = ingestTradeEpisode(state, {
      symbol: entry.symbol,
      companyName: entry.companyName || entry.symbol,
      setupType: entry.setupType,
      direction,
      assetMode,
      entryPrice: entry.entryPrice,
      exitPrice: entry.exitPrice!,
      pnl: entry.realizedPnL || 0,
      pnlPercent: entry.pnlPercent || 0,
      qualityScore: entry.executionRating >= 5 ? 82 : 74,
      atrPercent: 2.2,
      durationDays: entry.tradeDurationDays,
      exitReason: entry.notes || `Closed ${entry.status}`,
      entryMarketContext: ctx,
      initialRiskDollars: ctx?.initialRiskDollars ?? initialRiskDollars,
      sourceLotId: entry.id,
      timestamp: `${entry.exitDate || entry.entryDate} 16:00`,
    });

    state = updatedState;
    if (!skippedDuplicate) {
      alreadyIngested.add(entry.id);
      ingestedCount += 1;
    }
  }

  return { updatedState: state, ingestedCount };
}

export interface MemoryQueryRegimeBreakdown {
  sentimentLabel: string;
  sentimentMultiplier: number;
  vixMultiplier: number;
  structuralMultiplier: number;
  comboMultiplier: number;
  effectiveMinQualityScore: number;
  regimeSampleCount: number;
  crashDefenseOverrideBlocked: boolean;
}

export function queryMemoryForSetup(
  state: ActiveMemoryState,
  symbol: string,
  setupType: string,
  qualityScore: number,
  currentMarketHealth?: MarketHealthReport | null,
  opts?: {
    assetMode?: 'EQUITY' | 'OPTIONS';
    symbolStructural?: MarketStructuralSummary | null;
  }
): {
  isApproved: boolean;
  sizingMultiplier: number;
  recommendedAtrStop: number;
  effectiveMinQualityScore: number;
  matchingEpisodes: TradeEpisode[];
  auditRationale: string;
  regimeBreakdown?: MemoryQueryRegimeBreakdown;
} {
  const normSetup = normalizeSetupName(setupType);
  const setupStat = state.setupWeights[normSetup];
  const symStat = state.symbolStats[symbol];
  const assetMode = opts?.assetMode || 'EQUITY';

  const setupMult = setupStat ? setupStat.currentWeightMultiplier : 1.0;
  const symMult = symStat ? symStat.weightMultiplier : 1.0;

  let regimeSentimentMult = 1.0;
  let regimeVixMult = 1.0;
  let structuralMult = 1.0;
  let comboMult = 1.0;
  let qualityDelta = 0;
  let atrDelta = 0;
  let regimeSampleCount = 0;
  let crashDefenseOverrideBlocked = false;
  let sentimentLabel = 'N/A';

  if (currentMarketHealth?.current) {
    const liveCtx = buildEntryMarketContextFromReport(currentMarketHealth, {
      symbolStructural: opts?.symbolStructural,
      assetMode,
    });

    if (liveCtx) {
      sentimentLabel = liveCtx.sentimentLabel;
      // Hard safety guardrail: Crash Defense can NEVER be overridden by active learning
      if (liveCtx.safetyStatus === 'CRASH_DEFENSE' || !currentMarketHealth.current.allowNewEntries) {
        crashDefenseOverrideBlocked = true;
      }

      const regMap = state.regimeStats || {};
      const sentStat = regMap[`${assetMode}|SENT|${liveCtx.sentimentLabel}`];
      const vixStat = regMap[`${assetMode}|VIX|${liveCtx.vixBucket}`];
      const structKey = liveCtx.symbolStructuralRegime || liveCtx.spyStructuralRegime;
      const structStat = structKey ? regMap[`${assetMode}|STRUCT|${structKey}`] : undefined;
      const comboStat = regMap[`${assetMode}|COMBO|${liveCtx.sentimentLabel}|${normSetup}`];

      if (sentStat) {
        regimeSentimentMult = sentStat.shrunkMultiplier;
        qualityDelta += sentStat.recommendedMinQualityDelta;
        atrDelta += sentStat.recommendedAtrStopDelta;
        regimeSampleCount = sentStat.tradesCount;
      }
      if (vixStat) {
        regimeVixMult = vixStat.shrunkMultiplier;
        atrDelta = Math.max(atrDelta, vixStat.recommendedAtrStopDelta);
      }
      if (structStat) {
        structuralMult = structStat.shrunkMultiplier;
      }
      if (comboStat && comboStat.tradesCount >= 3) {
        comboMult = comboStat.shrunkMultiplier;
      }
    }
  }

  const effectiveMinQualityScore = Math.round(clamp(state.calibratedMinQualityScore + qualityDelta, 64, 85));
  const recommendedAtrStop = Number(clamp(state.calibratedAtrStopMultiple + atrDelta, 1.0, 1.8).toFixed(2));

  // Blend setup, symbol, global risk, and Bayesian-shrunk regime multipliers safely
  const regimeComposite =
    regimeSentimentMult *
    (0.5 + 0.5 * regimeVixMult) *
    (0.5 + 0.5 * structuralMult) *
    (0.5 + 0.5 * comboMult);
  const rawCombined = setupMult * symMult * state.riskMultiplier * regimeComposite;
  const combinedMultiplier = Number(clamp(rawCombined, 0.45, 1.55).toFixed(2));

  const isQualityPass = !crashDefenseOverrideBlocked && qualityScore >= effectiveMinQualityScore;
  const isThrottled = setupStat && setupStat.confidenceRating === 'CAUTIONARY';

  const matchingEpisodes = state.episodes.filter(
    (ep) => ep.symbol === symbol || ep.setupType === normSetup
  );

  let auditRationale = '';
  if (crashDefenseOverrideBlocked) {
    auditRationale = `[Market Health Hard Veto]: CRASH_DEFENSE active (${sentimentLabel}). Adaptive memory cannot override crash protection.`;
  } else if (!isQualityPass) {
    auditRationale = `[Active Memory Guard]: Quality score ${qualityScore}% is below adaptive threshold of ${effectiveMinQualityScore}%${qualityDelta !== 0 ? ` (${sentimentLabel} delta ${qualityDelta > 0 ? `+${qualityDelta}` : qualityDelta}%)` : ''}. Order skipped.`;
  } else if (isThrottled || regimeSentimentMult < 0.92) {
    auditRationale = `[Active Memory Caution]: ${normSetup} in ${sentimentLabel} scaled to ${combinedMultiplier}x (regime ${regimeSentimentMult}x, n=${regimeSampleCount}, min Q ${effectiveMinQualityScore}%).`;
  } else {
    auditRationale = `[Active Memory Synapse]: ${normSetup} validated (${combinedMultiplier}x weight${currentMarketHealth ? `, ${sentimentLabel} ${regimeSentimentMult}x` : ''}, ${recommendedAtrStop}x ATR stop).`;
  }

  return {
    isApproved: isQualityPass,
    sizingMultiplier: combinedMultiplier,
    recommendedAtrStop,
    effectiveMinQualityScore,
    matchingEpisodes,
    auditRationale,
    regimeBreakdown: currentMarketHealth
      ? {
          sentimentLabel,
          sentimentMultiplier: regimeSentimentMult,
          vixMultiplier: regimeVixMult,
          structuralMultiplier: structuralMult,
          comboMultiplier: comboMult,
          effectiveMinQualityScore,
          regimeSampleCount,
          crashDefenseOverrideBlocked,
        }
      : undefined,
  };
}

export function exportActiveMemoryJSON(state: ActiveMemoryState): string {
  return JSON.stringify(state, null, 2);
}
