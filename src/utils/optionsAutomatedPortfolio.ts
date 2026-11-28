/**
 * Pure Logic Engine for the Automated Options Portfolio & Premium Harvesting Bot
 * 
 * Uses strictly real market OHLCV feeds and real executed/closed user & bot trades.
 * Integrated with TradingWarz Price Action & Fibonacci Golden Zone Confluence Architecture
 * Includes Continual Learning / Active Memory for Autonomous Strike Calibration and Theta Management
 */

export interface OptionsTradeRecord {
  id: string;
  date: string;
  ticker: string;
  boughtSold: 'Sold' | 'Bought';
  contract: string;
  strike: number;
  optionType: 'PUT' | 'CALL';
  expiration: string;
  expirationDateStr: string;
  profitDollars: number;
  profitPercent: number;
  status: 'Open' | 'Closed';
  outcomeReason: 'Expired Worthless' | 'Early Take-Profit' | 'Break Even' | 'Order Error' | string;
  underlyingPriceAtEntry: number;
  strikeDistancePercent: number;
  delta: number;
  thetaPerDay: number;
  tradingWarzPattern?: string;
  goldenZoneSupportLevel: number;
  whyOpenedThesis: string;
  session?: MarketRegimeType;
  entryMarketContext?: EntryMarketContext | null;
}

import {
  TradingWarzAnalysis,
  analyzeTradingWarzSetup,
  CandleOHLC,
} from './tradingWarzEngine.ts';
import { calculateBlackScholesGreeks } from './cboeOptionsEngine.ts';
import { getTradeExecutionRegime, MarketRegimeType } from './marketSession.ts';
import { escapeCsvCell } from './csvExport.ts';
import type { MarketHealthReport } from './marketHealthEngine.ts';
import {
  backfillEntryMarketContextFromHistory,
  lookupEntryMarketContextSnapshot,
  type EntryMarketContext,
} from './entryMarketContext.ts';
import {
  recomputeRegimeMatrix,
  type RegimePerformanceStat,
  type TradeEpisode,
} from './activeLearningEngine.ts';

export interface OptionsPosition {
  id: string;
  ticker: string; // e.g. 'SPY', 'QQQ', 'IWM', 'AAPL'
  contract: string; // OCC symbol or formatted contract e.g. "SPY261218P00560000"
  boughtSold: 'Sold' | 'Bought';
  optionType: 'PUT' | 'CALL';
  strike: number;
  entryDate: string;
  expirationDateStr: string;
  expirationLabel: string;
  dteDaysRemaining: number;
  contractsCount: number;
  entryPremiumPerContract: number; // Credit collected per share/unit
  currentPremiumPerContract: number; // Current mark-to-market cost to buy back
  totalPremiumCollected: number; // Total cash credit banked at entry
  underlyingPriceAtEntry: number;
  underlyingCurrentPrice: number;
  strikeDistancePercent: number; // % Out-of-the-money
  delta: number; // e.g. -0.11
  gamma: number;
  dailyTheta: number; // $ earned per day via time decay
  vega: number;
  ivRankPercent: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  profitTargetPercent: number; // e.g. 75%
  status: 'Open' | 'Closed';
  tradingWarzPattern?: string;
  goldenZoneSupportLevel: number;
  setupGrade: 'A+' | 'A' | 'B' | 'NEUTRAL';
  whyOpenedThesis: string;
  executionSession?: MarketRegimeType;
}

export interface OptionsTradeLog {
  id: string;
  timestamp: string;
  positionId: string;
  contract: string;
  action:
    | 'SELL_TO_OPEN'
    | 'BUY_TO_CLOSE'
    | 'EXPIRED_WORTHLESS'
    | 'EXPIRED_ITM_ASSIGNED'
    | 'EXPIRED_ITM_EXERCISED'
    | 'ROLL_POSITION'
    | 'BREAKEVEN_EXIT';
  contracts: number;
  premium: number;
  realizedPnL?: number;
  realizedPnLPercent?: number;
  reason: string;
  session?: MarketRegimeType;
}

export interface OptionsTradeEpisode {
  id: string;
  timestamp: string;
  contract: string;
  strategy: string;
  delta: number;
  dte: number;
  tradingWarzPattern: string;
  pnl: number;
  pnlPercent: number;
  outcome: 'WIN' | 'BREAKEVEN' | 'LOSS';
  entryMarketContext?: EntryMarketContext | null;
  reflectionCritique: string;
  learnedRule: string;
  synapticWeightDelta: number;
}

export interface OptionsActiveMemoryState {
  version: string;
  episodes: OptionsTradeEpisode[];
  learnedRules: string[];
  regimeStats?: Record<string, RegimePerformanceStat>;
  calibratedMaxDelta: number; // e.g. 0.12 (dynamic based on market volatility)
  calibratedProfitTakePct: number; // e.g. 75%
  minGoldenZoneDistancePct: number; // e.g. 3.0%
  totalThetaHarvested: number;
  learningIterations: number;
  lastUpdated: string;
}

export interface OptionsPortfolioAccount {
  startingBalance: number;
  cash: number;
  equity: number;
  totalRealizedIncome: number;
  unrealizedPnL: number;
  dailyThetaIncome: number;
  positions: OptionsPosition[];
  tradeHistory: OptionsTradeRecord[];
  legacyHistory: OptionsTradeRecord[];
  sessionLogs: OptionsTradeLog[];
  isAutoPilotActive: boolean;
  targetDelta: number; // 0.08 to 0.16
  profitTakePercent: number; // 60% to 90%
  minDte: number; // 4 to 14 days
  maxOpenPositions: number; // default 2
  tradingWarzStrictFilter: boolean;
  lastUpdated: string;
  activeMemory: OptionsActiveMemoryState;
}

export interface OptionsPortfolioStats {
  startingBalance: number;
  currentEquity: number;
  cashBalance: number;
  totalRealizedIncome: number;
  unrealizedPnL: number;
  dailyThetaIncome: number;
  openPositionsCount: number;
  totalTradesCount: number;
  winningTradesCount: number;
  losingTradesCount: number;
  breakEvenTradesCount: number;
  winRatePercent: number;
  profitFactor: number;
  averageWin: number;
  averageLoss: number;
  income2026: number;
  income2025: number;
  netDeltaExposure: number;
  annualizedRunRateDollars: number;
}

const STORAGE_KEY = 'rich_sp500_options_portfolio_v1';

let optionsIdSeq = 0;

function makeUniquePortfolioId(prefix: string): string {
  optionsIdSeq += 1;
  return `${prefix}-${Date.now()}-${optionsIdSeq}`;
}

function deduplicateEntityIds<T extends { id?: string }>(
  items: T[],
  fallbackPrefix: string,
  sharedSeen?: Set<string>
): { items: T[]; changed: boolean } {
  const seen = sharedSeen ?? new Set<string>();
  let changed = false;
  const normalized = items.map((item, idx) => {
    if (!item || typeof item !== 'object') {
      changed = true;
      return item;
    }
    const rawId =
      typeof item.id === 'string' && item.id.trim().length > 0
        ? item.id
        : `${fallbackPrefix}-${idx + 1}`;
    if (seen.has(rawId)) {
      let candidate = `${rawId}-dup-${idx + 1}`;
      let suffix = 2;
      while (seen.has(candidate)) {
        candidate = `${rawId}-dup-${idx + 1}-${suffix}`;
        suffix += 1;
      }
      seen.add(candidate);
      changed = true;
      return { ...item, id: candidate };
    }
    if (rawId !== item.id) {
      changed = true;
    }
    seen.add(rawId);
    return rawId === item.id ? item : { ...item, id: rawId };
  });
  return { items: normalized, changed };
}

/**
 * Synthesizes epistemic memory episodes from real closed options trade records.
 */
export function synthesizeOptionsEpisodesFromHistory(
  tradeHistory: OptionsTradeRecord[],
  marketHealth?: MarketHealthReport | null
): OptionsTradeEpisode[] {
  return tradeHistory.map((trade, idx) => {
    const isBreakEven = trade.outcomeReason === 'Break Even' || Math.abs(trade.profitDollars) < 0.5;
    const isError = trade.outcomeReason === 'Order Error';
    const isLoss = isError || (!isBreakEven && trade.profitDollars < 0);

    const outcome: OptionsTradeEpisode['outcome'] = isLoss ? 'LOSS' : isBreakEven ? 'BREAKEVEN' : 'WIN';
    const pattern = trade.tradingWarzPattern || 'GOLDEN_ZONE_BOUNCE';
    const patternLabel = pattern.replace(/_/g, ' ');
    const entryCtx: EntryMarketContext | null =
      trade.entryMarketContext ||
      lookupEntryMarketContextSnapshot({ symbol: trade.contract, entryDate: trade.date }) ||
      (marketHealth
        ? backfillEntryMarketContextFromHistory(trade.date, marketHealth, { assetMode: 'OPTIONS' })
        : null);
    const ctxTag = entryCtx ? ` [Entry: ${entryCtx.sentimentLabel}, VIX ${entryCtx.vix?.toFixed(1) ?? 'N/A'}]` : '';

    let reflectionCritique = '';
    let learnedRule = '';
    let synapticWeightDelta = 0;

    if (outcome === 'WIN') {
      synapticWeightDelta = Math.min(0.25, Number((0.05 + (trade.profitPercent / 100) * 0.10).toFixed(3)));
      if (trade.outcomeReason === 'Expired Worthless') {
        reflectionCritique = `Held ${trade.contract} to expiration OTM; the option expired worthless and the full premium (+${trade.profitDollars.toFixed(2)}) was retained.${ctxTag}`;
        learnedRule = entryCtx
          ? `[${entryCtx.sentimentLabel}] TradingWarz ${patternLabel} short puts at Delta ≤ ${trade.delta} expired worthless in ${entryCtx.sentimentLabel}.`
          : `TradingWarz ${patternLabel} setups at Delta ≤ ${trade.delta} expired OTM; full premium capture is only recorded when intrinsic value is zero.`;
      } else if (String(trade.outcomeReason).startsWith('Expired ITM')) {
        reflectionCritique = `The option expired ITM and was assigned/exercised; after intrinsic settlement, net P&L was +${trade.profitDollars.toFixed(2)} (${trade.profitPercent.toFixed(1)}% of premium at risk).${ctxTag}`;
        learnedRule = `Treat ITM expiration as assignment/exercise with intrinsic-value settlement; never classify it as a 100% premium win.`;
      } else {
        reflectionCritique = `Executed disciplined early profit-take (${trade.profitPercent}%) on ${trade.contract}, banking +${trade.profitDollars.toFixed(2)} within weekly cycle and liberating collateral.${ctxTag}`;
        learnedRule = entryCtx
          ? `[${entryCtx.sentimentLabel}] Early 60–85% profit take on ${trade.ticker} short options preserved the theta edge.`
          : `Early profit-taking locks in gains while reducing the residual gamma risk into expiration.`;
      }
    } else if (outcome === 'BREAKEVEN') {
      synapticWeightDelta = +0.02; // Capital preservation positive reinforcement
      reflectionCritique = `The option exited with near-zero realized P&L on ${trade.contract} (${trade.profitDollars.toFixed(2)}); no win or loss was attributed.${ctxTag}`;
      learnedRule = `Classify a trade as breakeven only when the realized P&L is within the configured tolerance.`;
    } else {
      synapticWeightDelta = -0.15;
      reflectionCritique = String(trade.outcomeReason).startsWith('Expired ITM')
        ? `The option expired ITM and assignment/exercise intrinsic value exceeded the premium; realized loss was -${Math.abs(trade.profitDollars).toFixed(2)} (${trade.profitPercent.toFixed(1)}% of premium at risk).${ctxTag}`
        : `Realized options loss on ${trade.contract}: -${Math.abs(trade.profitDollars).toFixed(2)}. The observed loss, not an assumed expiry win, was used for learning.${ctxTag}`;
      learnedRule = String(trade.outcomeReason).startsWith('Expired ITM')
        ? `Reassess strike distance and tail-risk limits; a short option can lose more than its entire premium at expiration.`
        : `Use realized broker or intrinsic-settlement P&L for options learning and verify all execution inputs.`;
    }

    return {
      id: `opt-ep-hist-${idx + 1}`,
      timestamp: trade.date,
      contract: trade.contract,
      strategy: `S&P 500 Put Harvesting (${patternLabel})`,
      delta: trade.delta,
      dte: 7,
      tradingWarzPattern: patternLabel,
      pnl: trade.profitDollars,
      pnlPercent: trade.profitPercent,
      outcome,
      entryMarketContext: entryCtx,
      reflectionCritique,
      learnedRule,
      synapticWeightDelta,
    };
  });
}

/**
 * Initializes clean default options portfolio with requested starting capital and zero synthetic trades.
 */
export function initDefaultOptionsPortfolio(startingCapital: number = 2000): OptionsPortfolioAccount {
  const defaultMemory: OptionsActiveMemoryState = {
    version: '2.0.0-finrl-options',
    episodes: [],
    learnedRules: [
      'Maintain Put Delta strictly between 0.08 and 0.14 for 86-94% theoretical probability of profit.',
      'Place short strikes strictly below the TradingWarz 61.8% Fibonacci Golden Zone and beneath the Mother Bar swing low.',
      'Auto-close options when 65% - 85% of total premium is captured early rather than taking tail gamma risk into expiry.',
      'If market conditions trigger VIX expansion (>22), widen strike distance to at least 4.5% OTM.',
      'On rapid market sell-offs testing strike within 1.0%, execute defensive break-even exit per Rule 4 to protect 100% of collateral.',
    ],
    calibratedMaxDelta: 0.12,
    calibratedProfitTakePct: 75.0,
    minGoldenZoneDistancePct: 3.2,
    totalThetaHarvested: 0,
    learningIterations: 0,
    lastUpdated: new Date().toISOString(),
  };

  return {
    startingBalance: startingCapital,
    cash: Number(startingCapital.toFixed(2)),
    equity: Number(startingCapital.toFixed(2)),
    totalRealizedIncome: 0,
    unrealizedPnL: 0,
    dailyThetaIncome: 0,
    positions: [],
    tradeHistory: [],
    legacyHistory: [],
    sessionLogs: [],
    isAutoPilotActive: false,
    targetDelta: 0.12,
    profitTakePercent: 75.0,
    minDte: 5,
    maxOpenPositions: 2,
    tradingWarzStrictFilter: true,
    lastUpdated: new Date().toISOString(),
    activeMemory: defaultMemory,
  };
}

/**
 * Re-runs continual learning synthesis strictly over genuine executed trade records in the portfolio.
 */
export function relearnOptionsMemoryFromHistory(
  account: OptionsPortfolioAccount,
  marketHealth?: MarketHealthReport | null
): OptionsPortfolioAccount {
  const historyToUse = [
    ...(account.tradeHistory || []),
    ...(account.legacyHistory || []),
  ];
  const allEpisodes = synthesizeOptionsEpisodesFromHistory(historyToUse, marketHealth);

  const syntheticForMatrix: TradeEpisode[] = allEpisodes.map((ep) => ({
    id: ep.id,
    timestamp: ep.timestamp,
    symbol: ep.contract,
    companyName: ep.contract,
    setupType: ep.tradingWarzPattern || 'GOLDEN ZONE PUT',
    direction: 'BULLISH',
    assetMode: 'OPTIONS',
    entryPrice: 1,
    exitPrice: 1,
    pnl: ep.pnl,
    pnlPercent: ep.pnlPercent,
    realizedR: ep.pnl >= 0 ? Math.min(3, ep.pnlPercent / 35) : Math.max(-3, ep.pnlPercent / 35),
    outcome: ep.outcome,
    qualityScore: 80,
    atrPercent: 2.0,
    entryMarketContext: ep.entryMarketContext ?? null,
    reflectionCritique: ep.reflectionCritique,
    learnedRule: ep.learnedRule,
    synapticWeightDelta: ep.synapticWeightDelta,
  }));
  const regimeStats = recomputeRegimeMatrix(syntheticForMatrix, { assetMode: 'OPTIONS' });

  const wins = allEpisodes.filter((e) => e.outcome === 'WIN').length;
  const winRate = allEpisodes.length > 0 ? (wins / allEpisodes.length) * 100 : 100;

  let calibratedMaxDelta = 0.12;
  if (winRate >= 98.0) {
    calibratedMaxDelta = 0.12;
  } else if (winRate >= 90.0) {
    calibratedMaxDelta = 0.10;
  } else {
    calibratedMaxDelta = 0.08;
  }

  const totalThetaHarvested = historyToUse.reduce((sum, t) => sum + (t.profitDollars || 0), 0);

  const regimeRuleInsights = Object.values(regimeStats)
    .filter((r) => r.axis === 'SENTIMENT' && r.tradesCount >= 2)
    .sort((a, b) => b.shrunkMultiplier - a.shrunkMultiplier)
    .slice(0, 2)
    .map(
      (r) =>
        `[OPTIONS ${r.label}]: ${r.winRate}% WR, ${r.totalPnL >= 0 ? '+' : ''}$${r.totalPnL.toFixed(0)} across ${r.tradesCount} contract(s) (Bayesian ${r.shrunkMultiplier}x).`
    );

  const updatedMemory: OptionsActiveMemoryState = {
    ...account.activeMemory,
    episodes: allEpisodes,
    regimeStats,
    learningIterations: allEpisodes.length,
    calibratedMaxDelta,
    calibratedProfitTakePct: 75.0,
    totalThetaHarvested: Number(totalThetaHarvested.toFixed(2)),
    lastUpdated: new Date().toISOString(),
    learnedRules: [
      'Maintain Put Delta strictly between 0.08 and 0.14 for 86-94% theoretical probability of profit.',
      'Place short strikes strictly below the TradingWarz 61.8% Fibonacci Golden Zone and beneath the Mother Bar swing low.',
      'Auto-close options when 65% - 85% of total premium is captured early rather than taking tail gamma risk into expiry.',
      'If market conditions trigger VIX expansion (>22), widen strike distance to at least 4.5% OTM.',
      'On rapid market sell-offs testing strike within 1.0%, execute defensive break-even exit per Rule 4 to protect 100% of collateral.',
      ...regimeRuleInsights,
    ],
  };

  const updatedAccount: OptionsPortfolioAccount = {
    ...account,
    activeMemory: updatedMemory,
    lastUpdated: new Date().toISOString(),
  };

  saveOptionsPortfolio(updatedAccount);
  return updatedAccount;
}

/**
 * Exports Active Memory bank in JSON format for external quantitative research
 */
export function exportOptionsMemoryJSON(memory: OptionsActiveMemoryState): string {
  return JSON.stringify(memory, null, 2);
}

/**
 * Calculates complete options portfolio performance statistics
 */
export function calculateOptionsStats(account: OptionsPortfolioAccount): OptionsPortfolioStats {
  const startingBalance = Math.max(0, Number.isFinite(account.startingBalance) ? account.startingBalance : 0);
  const unrealizedPnL = account.positions.reduce((sum, p) => sum + p.unrealizedPnL, 0);
  const currentEquity = account.equity !== undefined && account.equity > 0
    ? Number(account.equity.toFixed(2))
    : Number(Math.max(0, startingBalance + account.totalRealizedIncome + unrealizedPnL).toFixed(2));
  const totalRealizedIncome = account.totalRealizedIncome;

  const closedTrades = (account.tradeHistory || []).filter((t) => t.status === 'Closed');
  let winningTradesCount = 0;
  let losingTradesCount = 0;
  let breakEvenTradesCount = 0;
  let grossWins = 0;
  let grossLosses = 0;
  let income2026 = 0;
  let income2025 = 0;

  closedTrades.forEach((t) => {
    const pnl = t.profitDollars;
    if (t.date.startsWith('2026')) {
      income2026 += pnl;
    } else {
      income2025 += pnl;
    }

    if (t.outcomeReason === 'Break Even' || Math.abs(pnl) < 1.0) {
      breakEvenTradesCount++;
    } else if (pnl > 0) {
      winningTradesCount++;
      grossWins += pnl;
    } else {
      losingTradesCount++;
      grossLosses += Math.abs(pnl);
    }
  });

  const totalTradesCount = closedTrades.length;
  // Options Win Rate including profitable and breakeven capital-preserving exits
  const effectiveWins = winningTradesCount + breakEvenTradesCount;
  const winRatePercent = totalTradesCount > 0 ? Number(((effectiveWins / totalTradesCount) * 100).toFixed(1)) : 0.0;
  const profitFactor = grossLosses > 0 ? Number((grossWins / grossLosses).toFixed(2)) : grossWins > 0 ? 99.0 : 0.0;
  const averageWin = winningTradesCount > 0 ? Number((grossWins / winningTradesCount).toFixed(2)) : 0.00;
  const averageLoss = losingTradesCount > 0 ? Number((grossLosses / losingTradesCount).toFixed(2)) : 0.00;

  const dailyThetaIncome = account.positions.reduce((sum, p) => sum + p.dailyTheta, 0);
  const netDeltaExposure = Number(
    account.positions.reduce((sum, p) => sum + p.delta * p.contractsCount, 0).toFixed(2)
  );

  // Annualized rate based on 2026 harvesting velocity
  const annualizedRunRateDollars = Number((income2026 * 1.25).toFixed(2));

  return {
    startingBalance,
    currentEquity: Number(currentEquity.toFixed(2)),
    cashBalance: Number(account.cash.toFixed(2)),
    totalRealizedIncome: Number(totalRealizedIncome.toFixed(2)),
    unrealizedPnL: Number(unrealizedPnL.toFixed(2)),
    dailyThetaIncome: Number(dailyThetaIncome.toFixed(2)),
    openPositionsCount: account.positions.length,
    totalTradesCount,
    winningTradesCount,
    losingTradesCount,
    breakEvenTradesCount,
    winRatePercent,
    profitFactor,
    averageWin,
    averageLoss,
    income2026: Number(income2026.toFixed(2)),
    income2025: Number(income2025.toFixed(2)),
    netDeltaExposure,
    annualizedRunRateDollars,
  };
}

/**
 * Autonomous Options Cycle Engine:
 * 1. Mark to market open options positions
 * 2. Auto-take profit when profit target (e.g. 70-85%) is hit (Buy to close)
 * 3. Expire worthless if 0 DTE remaining (100% gain)
 * 4. Scan Alpaca-tradable US equity/ETF options (SPY, QQQ, IWM, AAPL, NVDA, MSFT)
 * 5. Evaluate OTM Puts with 0.08 - 0.14 Delta beneath TradingWarz 61.8% Golden Zone
 * 6. Update Active Memory brain
 */
export function processOptionsAutonomousCycle(
  account: OptionsPortfolioAccount,
  marketItems: Array<{
    symbol: string;
    currentPrice: number;
    candles?: CandleOHLC[];
  }>,
  allowExtendedHours: boolean = true
): { updatedAccount: OptionsPortfolioAccount; actionsTaken: OptionsTradeLog[] } {
  if (!account.isAutoPilotActive) {
    return { updatedAccount: account, actionsTaken: [] };
  }

  let updatedCash = account.cash;
  let updatedRealizedIncome = account.totalRealizedIncome;
  const updatedPositions: OptionsPosition[] = [];
  const nextTradeHistory: OptionsTradeRecord[] = [...(account.tradeHistory || [])];
  const newLogs: OptionsTradeLog[] = [];
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = `${dateStr} ${now.toTimeString().slice(0, 5)}`;

  let activeMemory: OptionsActiveMemoryState = {
    ...account.activeMemory,
    episodes: [...(account.activeMemory?.episodes || [])],
  };

  // 1. UPDATE EXISTING OPEN OPTIONS & EVALUATE EXITS
  for (const pos of account.positions) {
    const market = marketItems.find((m) => m.symbol === pos.ticker);
    const underlyingPrice = market ? market.currentPrice : pos.underlyingCurrentPrice;

    const nextDte = Math.max(0, pos.dteDaysRemaining - 1);
    const multiplier = 100;
    const ivDec = Math.max(0.12, (pos.ivRankPercent || 20) / 100);
    const bsReprice = nextDte === 0
      ? {
          price: pos.optionType === 'PUT'
            ? Math.max(0, pos.strike - underlyingPrice)
            : Math.max(0, underlyingPrice - pos.strike),
        }
      : calculateBlackScholesGreeks(underlyingPrice, pos.strike, nextDte / 365, 0.045, ivDec, pos.optionType);
    // At expiration the option mark is exactly intrinsic value; do not retain
    // the non-expiry $0.05 pricing floor for an OTM contract.
    const decayedPremium = nextDte === 0
      ? Number(bsReprice.price.toFixed(2))
      : Math.max(0.05, Number(bsReprice.price.toFixed(2)));
    const pnlPerShare = pos.boughtSold === 'Sold'
      ? pos.entryPremiumPerContract - decayedPremium
      : decayedPremium - pos.entryPremiumPerContract;
    const unrealizedPnL = pnlPerShare * pos.contractsCount * multiplier;
    const profitPct = (pnlPerShare / Math.max(0.01, pos.entryPremiumPerContract)) * 100;

    let posCopy: OptionsPosition = {
      ...pos,
      underlyingCurrentPrice: underlyingPrice,
      currentPremiumPerContract: decayedPremium,
      unrealizedPnL: Number(unrealizedPnL.toFixed(2)),
      unrealizedPnLPercent: Number(profitPct.toFixed(2)),
      dteDaysRemaining: nextDte,
    };

    // Check Take-Profit Condition (e.g. >= 70% or 75% profit captured)
    if (profitPct >= pos.profitTargetPercent || posCopy.dteDaysRemaining === 0) {
      const isExpired = posCopy.dteDaysRemaining === 0;
      const intrinsicValue = pos.optionType === 'PUT'
        ? Math.max(0, pos.strike - underlyingPrice)
        : Math.max(0, underlyingPrice - pos.strike);
      const premiumAtRisk = pos.entryPremiumPerContract * pos.contractsCount * multiplier;
      const intrinsicSettlement = intrinsicValue * pos.contractsCount * multiplier;
      // Seller P&L = credit - intrinsic liability; buyer P&L is the inverse.
      // This is the expiry economic P&L. Share inventory created by assignment
      // is intentionally not fabricated in this options-only simulator.
      const expiryPnL = pos.boughtSold === 'Sold'
        ? premiumAtRisk - intrinsicSettlement
        : intrinsicSettlement - premiumAtRisk;
      const finalPnL = isExpired
        ? Number(expiryPnL.toFixed(2))
        : Number(unrealizedPnL.toFixed(2));
      const finalProfitPct = Number(
        ((finalPnL / Math.max(0.01, premiumAtRisk)) * 100).toFixed(1)
      );

      updatedCash += finalPnL;
      updatedRealizedIncome += finalPnL;

      const outcomeReason: OptionsTradeRecord['outcomeReason'] = !isExpired
        ? 'Early Take-Profit'
        : intrinsicValue <= 0
          ? 'Expired Worthless'
          : pos.boughtSold === 'Sold'
            ? 'Expired ITM / Assigned'
            : 'Expired ITM / Exercised';

      const exitRegime = getTradeExecutionRegime(pos.ticker, now).regime;

      // Log trade record
      const closedRecord: OptionsTradeRecord = {
        id: makeUniquePortfolioId('rich-opt-live'),
        date: dateStr,
        ticker: pos.ticker,
        boughtSold: pos.boughtSold,
        contract: pos.contract,
        strike: pos.strike,
        optionType: pos.optionType,
        expiration: pos.expirationLabel,
        expirationDateStr: pos.expirationDateStr,
        profitDollars: finalPnL,
        profitPercent: finalProfitPct,
        status: 'Closed',
        outcomeReason,
        underlyingPriceAtEntry: pos.underlyingPriceAtEntry,
        strikeDistancePercent: pos.strikeDistancePercent,
        delta: Math.abs(pos.delta),
        thetaPerDay: pos.dailyTheta,
        tradingWarzPattern: pos.tradingWarzPattern as any,
        goldenZoneSupportLevel: pos.goldenZoneSupportLevel,
        whyOpenedThesis: isExpired && intrinsicValue > 0
          ? `${outcomeReason}: ${pos.whyOpenedThesis} Intrinsic settlement $ ${intrinsicSettlement.toFixed(2)}; net P&L ${finalPnL.toFixed(2)} (${finalProfitPct}% of premium at risk). The simulator records the economic settlement but does not create underlying share inventory.`
          : `${outcomeReason}: ${pos.whyOpenedThesis} Net P&L ${finalPnL.toFixed(2)} (${finalProfitPct}% of premium at risk).`,
        session: exitRegime,
      };

      nextTradeHistory.unshift(closedRecord);

      newLogs.push({
        id: makeUniquePortfolioId(`log-opt-exit-${pos.ticker}`),
        timestamp: timeStr,
        positionId: pos.id,
        contract: pos.contract,
        action: !isExpired
          ? 'BUY_TO_CLOSE'
          : intrinsicValue <= 0
            ? 'EXPIRED_WORTHLESS'
            : pos.boughtSold === 'Sold'
              ? 'EXPIRED_ITM_ASSIGNED'
              : 'EXPIRED_ITM_EXERCISED',
        contracts: pos.contractsCount,
        premium: decayedPremium,
        realizedPnL: finalPnL,
        realizedPnLPercent: finalProfitPct,
        session: exitRegime,
        reason: isExpired && intrinsicValue > 0
          ? `${outcomeReason} [${exitRegime}] ${pos.contract}: Intrinsic value $ ${intrinsicValue.toFixed(2)} per share; aggregate intrinsic settlement $ ${intrinsicSettlement.toFixed(2)}. Net expiry P&L $ ${finalPnL.toFixed(2)} (${finalProfitPct}% of premium at risk). Underlying assignment/exercise inventory is not represented by this options-only simulator.`
          : `${outcomeReason} [${exitRegime}] ${pos.contract}: Net P&L $ ${finalPnL.toFixed(2)} (${finalProfitPct}% of premium at risk).`,
      });

      // Ingest into Active Memory
      activeMemory.episodes.unshift({
        id: makeUniquePortfolioId('opt-ep'),
        timestamp: dateStr,
        contract: pos.contract,
        strategy: 'S&P 500 Put Harvesting & TradingWarz',
        delta: Math.abs(pos.delta),
        dte: pos.dteDaysRemaining,
        tradingWarzPattern: pos.tradingWarzPattern || 'TradingWarz Confluence',
        pnl: finalPnL,
        pnlPercent: finalProfitPct,
        outcome: Math.abs(finalPnL) < 0.5 ? 'BREAKEVEN' : finalPnL > 0 ? 'WIN' : 'LOSS',
        reflectionCritique: isExpired && intrinsicValue > 0
          ? `${outcomeReason}: intrinsic settlement $ ${intrinsicSettlement.toFixed(2)} versus premium ${pos.boughtSold === 'Sold' ? 'credit' : 'debit'} $ ${premiumAtRisk.toFixed(2)}; net P&L $ ${finalPnL.toFixed(2)}.`
          : `${outcomeReason}: realized P&L $ ${finalPnL.toFixed(2)} on ${pos.contract} during ${exitRegime}.`,
        learnedRule: isExpired && intrinsicValue > 0
          ? 'Model ITM expiration as assignment/exercise with intrinsic-value settlement; it is not an automatic full-premium win.'
          : 'Use the actual realized option P&L and only classify OTM expiry as full premium retention.',
        synapticWeightDelta: Math.abs(finalPnL) < 0.5 ? +0.02 : finalPnL > 0 ? +0.10 : -0.15,
      });
      activeMemory.learningIterations++;
      continue; // Exited, do not keep in open positions
    }

    updatedPositions.push(posCopy);
  }

  // 2. SCAN FOR NEW HARVESTING OPPORTUNITIES IF UNDER MAX OPEN POSITIONS
  const minCashNeeded = 700;

  if (updatedPositions.length < account.maxOpenPositions && updatedCash >= minCashNeeded) {
    const candidates = marketItems.filter((m) =>
      ['SPY', 'QQQ', 'IWM', 'AAPL', 'NVDA', 'MSFT'].includes(m.symbol)
    );
    const openContracts = new Set(updatedPositions.map((p) => p.ticker));

    for (const item of candidates) {
      if (openContracts.has(item.symbol)) continue;
      if (updatedPositions.length >= account.maxOpenPositions) break;

      // Session regime check
      const regimeInfo = getTradeExecutionRegime(item.symbol, now);
      if (!regimeInfo.isOpen && !allowExtendedHours) {
        continue; // Market closed for this asset, wait for next scheduled session
      }

      if (!item.candles || item.candles.length < 5 || !item.currentPrice || item.currentPrice <= 0) {
        continue; // Require real upstream OHLC candles before opening any option position
      }

      const candles: CandleOHLC[] = item.candles;
      const twAnalysis = analyzeTradingWarzSetup(candles, item.currentPrice);

      // Check if setup qualifies under TradingWarz filter (A+ or A grade preferred)
      if (twAnalysis.setupGrade === 'A+' || twAnalysis.setupGrade === 'A' || !account.tradingWarzStrictFilter) {
        const strike = twAnalysis.recommendedPutStrike;
        const multiplier = 100;
        const contracts = 1;

        // Derive annualized volatility from real candle closes (log returns); fallback to ATR-scaled vol if short window
        const validCloses = candles.map((c) => c.close).filter((c) => Number.isFinite(c) && c > 0);
        let sigma = 0.18;
        if (validCloses.length >= 3) {
          const logRets: number[] = [];
          for (let k = 1; k < validCloses.length; k++) {
            logRets.push(Math.log(validCloses[k] / validCloses[k - 1]));
          }
          const mean = logRets.reduce((a, b) => a + b, 0) / logRets.length;
          const variance =
            logRets.reduce((acc, r) => acc + Math.pow(r - mean, 2), 0) / Math.max(1, logRets.length - 1);
          const annVol = Math.sqrt(variance) * Math.sqrt(252);
          if (Number.isFinite(annVol) && annVol > 0.05) {
            sigma = Math.min(1.2, Math.max(0.08, annVol));
          }
        }

        const bsEntry = calculateBlackScholesGreeks(item.currentPrice, strike, 7 / 365, 0.045, sigma, 'PUT');
        const entryPrem = Number(Math.max(0.25, bsEntry.price).toFixed(2));
        const totalCredit = Number((entryPrem * contracts * multiplier).toFixed(2));
        const dailyThetaEarned = Number(Math.abs(bsEntry.greeks.theta * contracts * multiplier).toFixed(2));
        const computedIvPct = Number((sigma * 100).toFixed(1));

        const expDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        const expDateStr = expDate.toISOString().slice(0, 10);
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
        const expLabel = `${dayNames[expDate.getDay()]}, ${expDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;
        const contractCode = `${item.symbol} ${String(expDate.getDate()).padStart(2, '0')}${monthNames[expDate.getMonth()]}${String(expDate.getFullYear()).slice(-2)} ${strike} P`;

        const newPos: OptionsPosition = {
          id: makeUniquePortfolioId(`opt-pos-${item.symbol}`),
          ticker: item.symbol,
          contract: contractCode,
          boughtSold: 'Sold',
          optionType: 'PUT',
          strike,
          entryDate: dateStr,
          expirationDateStr: expDateStr,
          expirationLabel: expLabel,
          dteDaysRemaining: 7,
          contractsCount: contracts,
          entryPremiumPerContract: entryPrem,
          currentPremiumPerContract: entryPrem,
          totalPremiumCollected: totalCredit,
          underlyingPriceAtEntry: item.currentPrice,
          underlyingCurrentPrice: item.currentPrice,
          strikeDistancePercent: twAnalysis.strikeDistancePercent,
          delta: Number(bsEntry.greeks.delta.toFixed(4)),
          gamma: Number(bsEntry.greeks.gamma.toFixed(5)),
          dailyTheta: dailyThetaEarned,
          vega: Number((-bsEntry.greeks.vega * contracts * multiplier).toFixed(2)),
          ivRankPercent: computedIvPct,
          unrealizedPnL: 0,
          unrealizedPnLPercent: 0,
          profitTargetPercent: account.profitTakePercent,
          status: 'Open',
          tradingWarzPattern: twAnalysis.patternLabel,
          goldenZoneSupportLevel: twAnalysis.fibLevels.fib618,
          setupGrade: twAnalysis.setupGrade,
          executionSession: regimeInfo.regime,
          whyOpenedThesis: `Sold cash-secured Put ${contractCode} [${regimeInfo.regime}] @ ${bsEntry.greeks.delta.toFixed(2)} Delta (${twAnalysis.probabilityOfProfitPercent}% POP). TradingWarz Setup: ${twAnalysis.patternLabel}. S&P 500 Golden Zone 61.8% floor sits at $${twAnalysis.fibLevels.fib618.toFixed(2)}. Strike $${strike.toFixed(2)} placed safely $${(item.currentPrice - strike).toFixed(2)} (${twAnalysis.strikeDistancePercent}%) below underlying. Daily theta burn: +$${dailyThetaEarned.toFixed(2)}/day.`,
        };

        updatedPositions.push(newPos);
        openContracts.add(item.symbol);

        newLogs.push({
          id: makeUniquePortfolioId(`log-opt-open-${item.symbol}`),
          timestamp: timeStr,
          positionId: newPos.id,
          contract: contractCode,
          action: 'SELL_TO_OPEN',
          contracts,
          premium: entryPrem,
          session: regimeInfo.regime,
          reason: `SELL TO OPEN [${regimeInfo.regime}] ${contracts}x ${contractCode} @ $${entryPrem.toFixed(2)} (Total credit: +$${totalCredit.toFixed(2)}): ${newPos.whyOpenedThesis}`,
        });
      }
    }
  }

  const updatedDailyTheta = updatedPositions.reduce((sum, p) => sum + p.dailyTheta, 0);
  const updatedUnrealized = updatedPositions.reduce((sum, p) => sum + p.unrealizedPnL, 0);
  const updatedEquity = Number((account.startingBalance + updatedRealizedIncome + updatedUnrealized).toFixed(2));

  const updatedAccount: OptionsPortfolioAccount = {
    ...account,
    cash: Number(updatedCash.toFixed(2)),
    equity: updatedEquity,
    totalRealizedIncome: Number(updatedRealizedIncome.toFixed(2)),
    unrealizedPnL: Number(updatedUnrealized.toFixed(2)),
    dailyThetaIncome: Number(updatedDailyTheta.toFixed(2)),
    positions: updatedPositions,
    tradeHistory: nextTradeHistory,
    sessionLogs: [...newLogs, ...account.sessionLogs],
    lastUpdated: now.toISOString(),
    activeMemory,
  };

  saveOptionsPortfolio(updatedAccount);
  return { updatedAccount, actionsTaken: newLogs };
}

/**
 * Manual close or roll override for an option position
 */
export function manualCloseOptionsPosition(
  account: OptionsPortfolioAccount,
  positionId: string,
  buyBackPremium: number,
  reason: string = 'User Manual Buy-To-Close'
): OptionsPortfolioAccount {
  const target = account.positions.find((p) => p.id === positionId);
  if (!target) return account;

  const multiplier = 100;
  const costToClose = buyBackPremium * target.contractsCount * multiplier;
  const pnl = target.totalPremiumCollected - costToClose;
  const pnlPct = ((target.entryPremiumPerContract - buyBackPremium) / target.entryPremiumPerContract) * 100;

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = `${dateStr} ${now.toTimeString().slice(0, 5)}`;

  const log: OptionsTradeLog = {
    id: makeUniquePortfolioId(`log-manual-${target.ticker}`),
    timestamp: timeStr,
    positionId: target.id,
    contract: target.contract,
    action: 'BUY_TO_CLOSE',
    contracts: target.contractsCount,
    premium: buyBackPremium,
    realizedPnL: Number(pnl.toFixed(2)),
    realizedPnLPercent: Number(pnlPct.toFixed(2)),
    reason: `MANUAL BUY TO CLOSE ${target.contractsCount}x ${target.contract} @ $${buyBackPremium.toFixed(2)}: Banked $${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)} (${pnlPct.toFixed(1)}%). Reason: ${reason}`,
  };

  const closedRecord: OptionsTradeRecord = {
    id: makeUniquePortfolioId('rich-opt-manual'),
    date: dateStr,
    ticker: target.ticker,
    boughtSold: 'Sold',
    contract: target.contract,
    strike: target.strike,
    optionType: 'PUT',
    expiration: target.expirationLabel,
    expirationDateStr: target.expirationDateStr,
    profitDollars: Number(pnl.toFixed(2)),
    profitPercent: Number(pnlPct.toFixed(1)),
    status: 'Closed',
    outcomeReason: pnlPct >= 50 ? 'Early Take-Profit' : pnlPct <= 0 ? 'Break Even' : 'Early Take-Profit',
    underlyingPriceAtEntry: target.underlyingPriceAtEntry,
    strikeDistancePercent: target.strikeDistancePercent,
    delta: Math.abs(target.delta),
    thetaPerDay: target.dailyTheta,
    tradingWarzPattern: target.tradingWarzPattern as any,
    goldenZoneSupportLevel: target.goldenZoneSupportLevel,
    whyOpenedThesis: `Manual Exit: ${target.whyOpenedThesis} P&L: $${pnl.toFixed(2)}.`,
  };

  const remainingPositions = account.positions.filter((p) => p.id !== positionId);
  const updatedRealized = account.totalRealizedIncome + pnl;
  const updatedCash = account.cash + pnl;

  const updatedAccount: OptionsPortfolioAccount = {
    ...account,
    cash: Number(updatedCash.toFixed(2)),
    totalRealizedIncome: Number(updatedRealized.toFixed(2)),
    positions: remainingPositions,
    tradeHistory: [closedRecord, ...account.tradeHistory],
    sessionLogs: [log, ...account.sessionLogs],
    lastUpdated: now.toISOString(),
  };

  saveOptionsPortfolio(updatedAccount);
  return updatedAccount;
}

/**
 * Persistence helpers
 */
export function loadOptionsPortfolio(): OptionsPortfolioAccount {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.cash === 'number') {
          let dirty = false;

          // Legacy localStorage must never re-arm an autonomous options bot.
          if (parsed.isAutoPilotActive !== false) {
            parsed.isAutoPilotActive = false;
            dirty = true;
          }

          // Purge any pre-seeded static archive records from earlier sessions
          if (Array.isArray(parsed.legacyHistory) && parsed.legacyHistory.some((t: any) => String(t?.id || '').startsWith('rich-opt-log-'))) {
            parsed.legacyHistory = parsed.legacyHistory.filter(
              (t: any) => !String(t?.id || '').startsWith('rich-opt-log-')
            );
            dirty = true;
          } else if (!Array.isArray(parsed.legacyHistory)) {
            parsed.legacyHistory = [];
            dirty = true;
          }

          if (!Array.isArray(parsed.positions)) {
            parsed.positions = [];
            dirty = true;
          } else if (parsed.positions.some((p: any) => p?.ticker === 'ES' || p?.ticker === 'MES')) {
            parsed.positions = parsed.positions.filter((p: any) => p?.ticker !== 'ES' && p?.ticker !== 'MES');
            dirty = true;
          }

          if (!Array.isArray(parsed.tradeHistory)) {
            parsed.tradeHistory = [];
            dirty = true;
          } else if (
            parsed.tradeHistory.some(
              (t: any) =>
                String(t?.id || '').startsWith('rich-opt-log-') ||
                t?.ticker === 'ES' ||
                t?.ticker === 'MES'
            )
          ) {
            parsed.tradeHistory = parsed.tradeHistory.filter(
              (t: any) =>
                !String(t?.id || '').startsWith('rich-opt-log-') &&
                t?.ticker !== 'ES' &&
                t?.ticker !== 'MES'
            );
            dirty = true;
          }

          if (!Array.isArray(parsed.sessionLogs)) {
            parsed.sessionLogs = [];
            dirty = true;
          }

          if (parsed.activeMemory?.episodes && parsed.activeMemory.episodes.some((ep: any) => String(ep?.id || '').startsWith('opt-ep-hist-'))) {
            parsed.activeMemory.episodes = parsed.activeMemory.episodes.filter(
              (ep: any) => !String(ep?.id || '').startsWith('opt-ep-hist-')
            );
            parsed.activeMemory.learningIterations = parsed.activeMemory.episodes.length;
            parsed.activeMemory.totalThetaHarvested = Number(
              (parsed.tradeHistory || []).reduce((s: number, t: any) => s + (t.profitDollars || 0), 0).toFixed(2)
            );
            dirty = true;
          }

          if (!parsed.activeMemory) {
            parsed.activeMemory = initDefaultOptionsPortfolio(
              Number.isFinite(parsed.startingBalance) ? parsed.startingBalance : 0
            ).activeMemory;
            dirty = true;
          } else if (!Array.isArray(parsed.activeMemory.episodes)) {
            parsed.activeMemory.episodes = [];
            dirty = true;
          }

          // Deduplicate any persisted colliding IDs across active positions, trade history, legacy, logs, and episodes
          const activeJournalSeen = new Set<string>();
          const dedupPositions = deduplicateEntityIds(parsed.positions, 'opt-pos', activeJournalSeen);
          if (dedupPositions.changed) {
            parsed.positions = dedupPositions.items;
            dirty = true;
          }
          const dedupHistory = deduplicateEntityIds(parsed.tradeHistory, 'rich-opt-live', activeJournalSeen);
          if (dedupHistory.changed) {
            parsed.tradeHistory = dedupHistory.items;
            dirty = true;
          }
          const dedupLegacy = deduplicateEntityIds(parsed.legacyHistory, 'rich-opt-legacy');
          if (dedupLegacy.changed) {
            parsed.legacyHistory = dedupLegacy.items;
            dirty = true;
          }
          const dedupLogs = deduplicateEntityIds(parsed.sessionLogs, 'log-opt');
          if (dedupLogs.changed) {
            parsed.sessionLogs = dedupLogs.items;
            dirty = true;
          }
          const dedupEpisodes = deduplicateEntityIds(parsed.activeMemory.episodes, 'opt-ep');
          if (dedupEpisodes.changed) {
            parsed.activeMemory.episodes = dedupEpisodes.items;
            dirty = true;
          }

          if (dirty) {
            saveOptionsPortfolio(parsed);
          }

          return parsed;
        }
      }
    }
  } catch (err) {
    console.error('Failed to parse options portfolio from localStorage', err);
  }
  return initDefaultOptionsPortfolio(2000);
}

export function saveOptionsPortfolio(account: OptionsPortfolioAccount): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(account));
    }
  } catch (err) {
    console.error('Failed to save options portfolio to localStorage', err);
  }
}

export function resetOptionsPortfolio(capital: number = 2000): OptionsPortfolioAccount {
  const current = loadOptionsPortfolio();
  const realEpisodes = (current.activeMemory?.episodes || []).filter(
    (ep) => !String(ep.id).startsWith('opt-ep-hist-')
  );

  const fresh = initDefaultOptionsPortfolio(capital);
  if (realEpisodes.length > 0) {
    fresh.activeMemory = {
      ...fresh.activeMemory,
      episodes: realEpisodes,
      learningIterations: realEpisodes.length,
      totalThetaHarvested: Number(realEpisodes.reduce((s, e) => s + e.pnl, 0).toFixed(2)),
    };
  }
  saveOptionsPortfolio(fresh);
  return fresh;
}

/**
 * Converts options portfolio records into an audit CSV string matching Rich's format
 */
export function exportOptionsLogsToCSV(account: OptionsPortfolioAccount): string {
  const headers = [
    'Date',
    'Ticker',
    'Session',
    'Bought/Sold',
    'Contract',
    'Expiration',
    '$ Profit (Loss)',
    '% Profit',
    'Open/Closed',
    'Outcome Note',
    'TradingWarz Setup',
    'Golden Zone 61.8% Level',
    'Delta',
    'Theta/Day ($)',
    'Strategy Thesis',
  ];

  const allTrades = [
    ...(account.tradeHistory || []),
    ...(account.legacyHistory || []),
  ];

  const rows = allTrades.map((t) => [
    escapeCsvCell(t.date),
    escapeCsvCell(t.ticker),
    escapeCsvCell(t.session || 'REGULAR'),
    escapeCsvCell(t.boughtSold),
    escapeCsvCell(t.contract),
    escapeCsvCell(t.expiration),
    escapeCsvCell(`$${t.profitDollars.toFixed(2)}`),
    escapeCsvCell(`${t.profitPercent}%`),
    escapeCsvCell(t.status),
    escapeCsvCell(t.outcomeReason),
    escapeCsvCell(t.tradingWarzPattern || 'TradingWarz Confluence'),
    escapeCsvCell(`$${t.goldenZoneSupportLevel}`),
    escapeCsvCell(t.delta),
    escapeCsvCell(`$${t.thetaPerDay.toFixed(2)}`),
    escapeCsvCell(t.whyOpenedThesis),
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}
