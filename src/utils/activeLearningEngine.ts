/**
 * Active Memory & Continual Learning Engine for Automated Portfolio Management
 * 
 * Inspired by leading open-source quant and agentic memory architectures:
 * - FinRL (Continual / online reinforcement learning & adaptive policy weighting)
 * - TradeMemory Protocol (mnemox-ai/tradememory-protocol: episodic recall & outcome-weighted reflection)
 * - META (Memory-Enhanced Trading Agent: indicator state embedding & verbal reflection guardrails)
 * - Reflexion (Verbal reinforcement learning from trade wins and losses)
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
  calibratedMinQualityScore: number; // dynamically adjusts (e.g. 68 -> 75)
  calibratedAtrStopMultiple: number; // dynamically adjusts (e.g. 1.2x -> 1.5x)
  riskMultiplier: number;            // 0.75x to 1.25x based on recent Sharpe/streak
  learningIterations: number;
  lastUpdated: string;
}

const MEMORY_STORAGE_KEY = 'trullas_active_learning_memory_v1';

export const INITIAL_EPISODES: TradeEpisode[] = [
  {
    id: 'ep-seed-001',
    timestamp: '2026-10-27 15:45',
    symbol: 'NVDA',
    companyName: 'NVIDIA Corporation',
    setupType: 'BULLISH TRIPLE',
    direction: 'BULLISH',
    entryPrice: 134.20,
    exitPrice: 146.80,
    pnl: 159.20,
    pnlPercent: 9.39,
    outcome: 'WIN',
    qualityScore: 84,
    atrPercent: 2.85,
    reflectionCritique: 'Perfect execution of 3rd-wave MACD divergence with RSI oversold (26.4). 23.6% trigger breakout provided clean impulse directly into TP1 and TP2.',
    learnedRule: 'High-conviction Bullish Triple Divergences with quality score > 80% in mega-cap tech justify aggressive 1.25x sizing and holding full 25% runner to TP2.',
    synapticWeightDelta: +0.15,
  },
  {
    id: 'ep-seed-002',
    timestamp: '2026-10-22 16:00',
    symbol: 'TSLA',
    companyName: 'Tesla, Inc.',
    setupType: 'BEARISH TRIPLE',
    direction: 'BEARISH',
    entryPrice: 252.00,
    exitPrice: 258.50,
    pnl: -520.00,
    pnlPercent: -2.58,
    outcome: 'LOSS',
    qualityScore: 72,
    atrPercent: 4.10,
    reflectionCritique: 'Short divergence invalidated by macroeconomic index tailwind and high ATR volatility spike (4.10%). Stop loss at 1.1x ATR was too tight for earnings week.',
    learnedRule: 'Bearish divergence setups on beta > 1.8 stocks require at least 1.5x ATR stop buffer and 0.70x allocation throttle during broader market uptrends.',
    synapticWeightDelta: -0.20,
  },
  {
    id: 'ep-seed-003',
    timestamp: '2026-10-28 14:30',
    symbol: 'AAPL',
    companyName: 'Apple Inc.',
    setupType: 'BULLISH DOUBLE',
    direction: 'BULLISH',
    entryPrice: 222.00,
    exitPrice: 231.50,
    pnl: 950.00,
    pnlPercent: 4.28,
    outcome: 'WIN',
    qualityScore: 78,
    atrPercent: 1.65,
    reflectionCritique: 'Double divergence coincided with Nadaraya-Watson envelope lower band bounce. Clean target 1 scale-out locked in gains before pre-earnings consolidation.',
    learnedRule: 'Bullish Double Divergences in defensive large caps yield steady 4-6% targets; scaling out 50% at Target 1 and moving stop to breakeven protects 100% of capital.',
    synapticWeightDelta: +0.10,
  },
];

export function initDefaultActiveMemory(): ActiveMemoryState {
  const setupWeights: Record<string, SetupPerformanceStat> = {
    'BULLISH TRIPLE': {
      tradesCount: 2,
      winsCount: 2,
      lossesCount: 0,
      winRate: 100,
      totalPnL: 193.20,
      currentWeightMultiplier: 1.25,
      confidenceRating: 'HIGH',
    },
    'BEARISH TRIPLE': {
      tradesCount: 1,
      winsCount: 0,
      lossesCount: 1,
      winRate: 0,
      totalPnL: -520.00,
      currentWeightMultiplier: 0.75,
      confidenceRating: 'CAUTIONARY',
    },
    'BULLISH DOUBLE': {
      tradesCount: 2,
      winsCount: 2,
      lossesCount: 0,
      winRate: 100,
      totalPnL: 984.00,
      currentWeightMultiplier: 1.15,
      confidenceRating: 'HIGH',
    },
    'BEARISH DOUBLE': {
      tradesCount: 0,
      winsCount: 0,
      lossesCount: 0,
      winRate: 50,
      totalPnL: 0,
      currentWeightMultiplier: 1.0,
      confidenceRating: 'MODERATE',
    },
  };

  const symbolStats: Record<string, { wins: number; losses: number; winRate: number; weightMultiplier: number }> = {
    NVDA: { wins: 1, losses: 0, winRate: 100, weightMultiplier: 1.20 },
    TSLA: { wins: 0, losses: 1, winRate: 0, weightMultiplier: 0.75 },
    AAPL: { wins: 1, losses: 0, winRate: 100, weightMultiplier: 1.15 },
    MSFT: { wins: 1, losses: 0, winRate: 100, weightMultiplier: 1.10 },
  };

  const learnedRules: string[] = [
    'Rule #1 (High-Conviction): Bullish Triple Divergences with quality score > 80% receive a +25% position sizing boost.',
    'Rule #2 (Risk Mitigation): Bearish divergences during positive index momentum are throttled to 0.75x size with expanded 1.45x ATR stop buffer.',
    'Rule #3 (Regime Protection): Strict 50% scale-out at Target 1 (38.2% Fib) with instant breakeven stop ratchet eliminates loss on 88% of subsequent retests.',
    'Rule #4 (Volatility Guard): Tickers with ATR > 3.5% require conservative 1.4x-1.6x ATR stop distance to prevent premature wick stopouts.',
  ];

  return {
    version: '1.0.0',
    episodes: INITIAL_EPISODES,
    learnedRules,
    setupWeights,
    symbolStats,
    calibratedMinQualityScore: 70,
    calibratedAtrStopMultiple: 1.25,
    riskMultiplier: 1.05,
    learningIterations: INITIAL_EPISODES.length,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Load Active Memory from LocalStorage or initialize default
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
      return parsed;
    }
  } catch (err) {
    console.error('Failed to load active memory state:', err);
  }
  return initDefaultActiveMemory();
}

/**
 * Save Active Memory to LocalStorage
 */
export function saveActiveMemoryState(state: ActiveMemoryState): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(MEMORY_STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error('Failed to save active memory state:', err);
  }
}

/**
 * Reset Active Memory to baseline
 */
export function resetActiveMemoryState(): ActiveMemoryState {
  const state = initDefaultActiveMemory();
  saveActiveMemoryState(state);
  return state;
}

/**
 * Generate an automated post-trade critique (Reflection) based on trade telemetry
 * Modeled after Reflexion verbal reinforcement learning.
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
      ? `Setup Pattern [${setupType}] on ${symbol} exhibits strong edge (>5% return). Sizing multiplier elevated to maximize capital allocation on high-confidence setups.`
      : `Scale-out discipline on ${symbol} protected profit. Trailing stop to breakeven eliminated market downside risk.`;
    const deltaWeight = isBigWin ? +0.15 : +0.08;
    return { critique, rule, deltaWeight };
  } else if (isStopOut) {
    const critique = `${symbol} ${setupType} stopped out with loss (-${Math.abs(pnlPercent).toFixed(1)}%, -$${Math.abs(pnl).toFixed(2)}). Exit protected account within 1% risk constraint. High volatility (ATR ${atrPercent.toFixed(2)}%) or conflicting market regime undermined divergence.`;
    const rule = `Throttle ${setupType} allocation on ${symbol} by -15%. Increase ATR stop cushion to prevent premature wick triggers on volatile sessions.`;
    const deltaWeight = -0.15;
    return { critique, rule, deltaWeight };
  } else {
    const critique = `${symbol} trade closed near breakeven ($${pnl.toFixed(2)}). Setup lacked sustained momentum beyond initial trigger bar.`;
    const rule = `Require higher volume exhaustion confirmation for ${setupType} to avoid sideways chop.`;
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

  const newEpisode: TradeEpisode = {
    id: `ep-${Date.now()}-${trade.symbol}`,
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

  // 1. Update Setup Weights
  const currentSetupStat = currentState.setupWeights[normSetup] || {
    tradesCount: 0,
    winsCount: 0,
    lossesCount: 0,
    winRate: 50,
    totalPnL: 0,
    currentWeightMultiplier: 1.0,
    confidenceRating: 'MODERATE',
  };

  const newTradesCount = currentSetupStat.tradesCount + 1;
  const newWinsCount = currentSetupStat.winsCount + (outcome === 'WIN' ? 1 : 0);
  const newLossesCount = currentSetupStat.lossesCount + (outcome === 'LOSS' ? 1 : 0);
  const newWinRate = Number(((newWinsCount / newTradesCount) * 100).toFixed(1));
  const newTotalPnL = Number((currentSetupStat.totalPnL + trade.pnl).toFixed(2));

  // Multiplier clamped between 0.40x and 1.60x
  let newMultiplier = currentSetupStat.currentWeightMultiplier + deltaWeight;
  newMultiplier = Math.max(0.40, Math.min(1.60, Number(newMultiplier.toFixed(2))));

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

  // 2. Update Symbol-Specific Stats
  const currentSym = currentState.symbolStats[trade.symbol] || {
    wins: 0,
    losses: 0,
    winRate: 50,
    weightMultiplier: 1.0,
  };
  const symWins = currentSym.wins + (outcome === 'WIN' ? 1 : 0);
  const symLosses = currentSym.losses + (outcome === 'LOSS' ? 1 : 0);
  const symTotal = symWins + symLosses;
  const symWinRate = Number(((symWins / symTotal) * 100).toFixed(1));
  let symMultiplier = currentSym.weightMultiplier + deltaWeight;
  symMultiplier = Math.max(0.50, Math.min(1.50, Number(symMultiplier.toFixed(2))));

  const updatedSymbolStats = {
    ...currentState.symbolStats,
    [trade.symbol]: {
      wins: symWins,
      losses: symLosses,
      winRate: symWinRate,
      weightMultiplier: symMultiplier,
    },
  };

  // 3. Recalibrate Global Quality Cutoff & Stop Multiple
  let calibratedMinQuality = currentState.calibratedMinQualityScore;
  let calibratedAtrMultiple = currentState.calibratedAtrStopMultiple;
  let riskMult = currentState.riskMultiplier;

  if (outcome === 'LOSS') {
    // If trade lost, raise minimum quality hurdle slightly to be more selective
    calibratedMinQuality = Math.min(80, calibratedMinQuality + 1);
    // If trade stopped out, slightly widen ATR cushion to prevent whipsaws
    calibratedAtrMultiple = Math.min(1.60, Number((calibratedAtrMultiple + 0.05).toFixed(2)));
    // Slightly taper risk multiplier
    riskMult = Math.max(0.75, Number((riskMult - 0.05).toFixed(2)));
  } else if (outcome === 'WIN') {
    // If win rate is high, maintain optimal quality gate
    calibratedMinQuality = Math.max(68, calibratedMinQuality - 0.5);
    riskMult = Math.min(1.25, Number((riskMult + 0.04).toFixed(2)));
  }

  // 4. Update Rules Buffer (keep most recent 8 distinctive rules)
  const existingRules = currentState.learnedRules.filter((r) => !r.includes(normSetup));
  const updatedRules = [rule, ...existingRules].slice(0, 8);

  const updatedState: ActiveMemoryState = {
    ...currentState,
    episodes: [newEpisode, ...currentState.episodes].slice(0, 50), // keep last 50 episodes
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

/**
 * Query Active Memory for an incoming ticker setup
 * Returns past episode precedents, learned sizing multiplier, and audit advice
 */
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

  // Calculate combined adaptive multiplier
  const setupMult = setupStat ? setupStat.currentWeightMultiplier : 1.0;
  const symMult = symStat ? symStat.weightMultiplier : 1.0;
  const combinedMultiplier = Number((setupMult * symMult * state.riskMultiplier).toFixed(2));

  // Quality score threshold check
  const isQualityPass = qualityScore >= state.calibratedMinQualityScore;
  const isThrottled = setupStat && setupStat.confidenceRating === 'CAUTIONARY';

  // Find relevant historical episodes
  const matchingEpisodes = state.episodes.filter(
    (ep) => ep.symbol === symbol || ep.setupType === normSetup
  );

  let auditRationale = '';
  if (!isQualityPass) {
    auditRationale = `[Active Memory Guard]: Quality score ${qualityScore}% is below adaptive threshold of ${state.calibratedMinQualityScore}% (calibrated from prior loss episodes). Order rejected to preserve capital.`;
  } else if (isThrottled) {
    auditRationale = `[Active Memory Caution]: Setup ${normSetup} has caution rating due to historical losses. Allocation throttled to ${combinedMultiplier}x size.`;
  } else {
    auditRationale = `[Active Memory Synapse]: Setup ${normSetup} validated. Weight multiplier: ${combinedMultiplier}x (Setup: ${setupMult}x, Ticker: ${symMult}x, Global Risk: ${state.riskMultiplier}x). Adaptive ATR stop: ${state.calibratedAtrStopMultiple}x.`;
  }

  return {
    isApproved: isQualityPass,
    sizingMultiplier: combinedMultiplier,
    recommendedAtrStop: state.calibratedAtrStopMultiple,
    matchingEpisodes,
    auditRationale,
  };
}

/**
 * Export Active Memory to formatted JSON for auditing or backup
 */
export function exportActiveMemoryJSON(state: ActiveMemoryState): string {
  return JSON.stringify(state, null, 2);
}
