/**
 * Active Memory & Continual Learning Engine for Automated Portfolio Management
 * Starts clean with neutral 1.0x weights and zero fabricated seed trade episodes.
 * Learns strictly from real executed/closed user & bot trades.
 */

export interface TradeEpisode {
  id: string;
  timestamp: string;
  symbol: string;
  companyName: string;
  setupType: string;
  direction: 'BULLISH' | 'BEARISH';
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  pnlPercent: number;
  outcome: 'WIN' | 'LOSS' | 'BREAKEVEN';
  qualityScore: number;
  atrPercent: number;
  durationDays?: number;
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

export interface ActiveMemoryState {
  version: string;
  episodes: TradeEpisode[];
  learnedRules: string[];
  setupWeights: Record<string, SetupPerformanceStat>;
  symbolStats: Record<string, { wins: number; losses: number; winRate: number; weightMultiplier: number }>;
  calibratedMinQualityScore: number;
  calibratedAtrStopMultiple: number;
  riskMultiplier: number;
  learningIterations: number;
  lastUpdated: string;
}

const MEMORY_STORAGE_KEY = 'trullas_active_learning_memory_v2';
let episodeSeq = 0;

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
 * Generate an automated post-trade critique based on actual closed trade telemetry
 */
export function generateTradeReflection(
  symbol: string,
  setupType: string,
  direction: 'BULLISH' | 'BEARISH',
  pnl: number,
  pnlPercent: number,
  qualityScore: number,
  atrPercent: number,
  exitReason: string
): { critique: string; rule: string; deltaWeight: number } {
  const isWin = pnl > 0;
  const isBigWin = pnlPercent >= 5.0;
  const isStopOut = exitReason.toUpperCase().includes('STOP') || pnl < 0;

  if (isWin) {
    const critique = `${symbol} ${setupType} (${direction}) delivered positive expectancy (+${pnlPercent.toFixed(1)}%, +$${pnl.toFixed(2)}). Entry criteria at quality score ${qualityScore}% and ATR ${atrPercent.toFixed(2)}% validated Trullàs Fibonacci impulse.`;
    const rule = isBigWin
      ? `Setup Pattern [${setupType}] on ${symbol} exhibited strong edge (>5% return). Sizing multiplier raised based on realized outcome.`
      : `Scale-out discipline on ${symbol} locked realized gains while reducing downside risk.`;
    const deltaWeight = isBigWin ? +0.15 : +0.08;
    return { critique, rule, deltaWeight };
  } else if (isStopOut) {
    const critique = `${symbol} ${setupType} stopped out with loss (-${Math.abs(pnlPercent).toFixed(1)}%, -$${Math.abs(pnl).toFixed(2)}). Exit enforced per risk constraint (ATR ${atrPercent.toFixed(2)}%).`;
    const rule = `Throttle ${setupType} allocation on ${symbol} by -15% and widen ATR stop cushion to reduce whipsaws.`;
    const deltaWeight = -0.15;
    return { critique, rule, deltaWeight };
  } else {
    const critique = `${symbol} trade closed near breakeven ($${pnl.toFixed(2)}). Setup lacked follow-through beyond entry.`;
    const rule = `Require stronger volume confirmation for ${setupType} to filter range-bound chop.`;
    return { critique, rule, deltaWeight: 0.0 };
  }
}

/**
 * Online Learning step: Ingests a closed trade, creates an episodic memory entry,
 * updates Bayesian setup multipliers, recalibrates quality threshold and ATR multiples.
 */
export function ingestTradeEpisode(
  currentState: ActiveMemoryState,
  trade: {
    symbol: string;
    companyName?: string;
    setupType: string;
    direction: 'BULLISH' | 'BEARISH';
    entryPrice: number;
    exitPrice: number;
    pnl: number;
    pnlPercent: number;
    qualityScore?: number;
    atrPercent?: number;
    exitReason: string;
  }
): { updatedState: ActiveMemoryState; newEpisode: TradeEpisode } {
  const normSetup = trade.setupType.toUpperCase().trim();
  const quality = trade.qualityScore || 70;
  const atrPct = trade.atrPercent || 2.0;
  const outcome: 'WIN' | 'LOSS' | 'BREAKEVEN' =
    trade.pnl > 1.0 ? 'WIN' : trade.pnl < -1.0 ? 'LOSS' : 'BREAKEVEN';

  const { critique, rule, deltaWeight } = generateTradeReflection(
    trade.symbol,
    normSetup,
    trade.direction,
    trade.pnl,
    trade.pnlPercent,
    quality,
    atrPct,
    trade.exitReason
  );

  episodeSeq += 1;
  const newEpisode: TradeEpisode = {
    id: `ep-${Date.now()}-${episodeSeq}-${trade.symbol}`,
    timestamp: new Date().toISOString().replace('T', ' ').slice(0, 16),
    symbol: trade.symbol,
    companyName: trade.companyName || trade.symbol,
    setupType: normSetup,
    direction: trade.direction,
    entryPrice: trade.entryPrice,
    exitPrice: trade.exitPrice,
    pnl: Number(trade.pnl.toFixed(2)),
    pnlPercent: Number(trade.pnlPercent.toFixed(2)),
    outcome,
    qualityScore: quality,
    atrPercent: atrPct,
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

  const existingRules = currentState.learnedRules.filter((r) => !r.includes(normSetup));
  const updatedRules = [rule, ...existingRules].slice(0, 8);

  const updatedState: ActiveMemoryState = {
    ...currentState,
    episodes: [newEpisode, ...currentState.episodes].slice(0, 50),
    learnedRules: updatedRules,
    setupWeights: updatedSetupWeights,
    symbolStats: updatedSymbolStats,
    calibratedMinQualityScore: Number(calibratedMinQuality.toFixed(0)),
    calibratedAtrStopMultiple: calibratedAtrMultiple,
    riskMultiplier: riskMult,
    learningIterations: currentState.learningIterations + 1,
    lastUpdated: new Date().toISOString(),
  };

  return { updatedState, newEpisode };
}

export function queryMemoryForSetup(
  state: ActiveMemoryState,
  symbol: string,
  setupType: string,
  qualityScore: number
): {
  isApproved: boolean;
  sizingMultiplier: number;
  recommendedAtrStop: number;
  matchingEpisodes: TradeEpisode[];
  auditRationale: string;
} {
  const normSetup = setupType.toUpperCase().trim();
  const setupStat = state.setupWeights[normSetup];
  const symStat = state.symbolStats[symbol];

  const setupMult = setupStat ? setupStat.currentWeightMultiplier : 1.0;
  const symMult = symStat ? symStat.weightMultiplier : 1.0;
  const combinedMultiplier = Number((setupMult * symMult * state.riskMultiplier).toFixed(2));

  const isQualityPass = qualityScore >= state.calibratedMinQualityScore;
  const isThrottled = setupStat && setupStat.confidenceRating === 'CAUTIONARY';

  const matchingEpisodes = state.episodes.filter(
    (ep) => ep.symbol === symbol || ep.setupType === normSetup
  );

  let auditRationale = '';
  if (!isQualityPass) {
    auditRationale = `[Active Memory Guard]: Quality score ${qualityScore}% is below adaptive threshold of ${state.calibratedMinQualityScore}%. Order skipped.`;
  } else if (isThrottled) {
    auditRationale = `[Active Memory Caution]: Setup ${normSetup} has caution rating from prior losses. Allocation scaled to ${combinedMultiplier}x.`;
  } else {
    auditRationale = `[Active Memory Synapse]: Setup ${normSetup} validated (${combinedMultiplier}x weight, ${state.calibratedAtrStopMultiple}x ATR stop).`;
  }

  return {
    isApproved: isQualityPass,
    sizingMultiplier: combinedMultiplier,
    recommendedAtrStop: state.calibratedAtrStopMultiple,
    matchingEpisodes,
    auditRationale,
  };
}

export function exportActiveMemoryJSON(state: ActiveMemoryState): string {
  return JSON.stringify(state, null, 2);
}
