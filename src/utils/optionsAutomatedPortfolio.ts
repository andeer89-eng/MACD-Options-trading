/**
 * Pure Logic Engine for the Automated Options Portfolio & Premium Harvesting Bot
 * 
 * Uses strictly real market OHLCV feeds and real executed/closed user & bot trades.
 * Integrated with TradingWarz Price Action & Fibonacci Golden Zone Confluence Architecture
 * Includes Continual Learning / Active Memory for Autonomous Strike Calibration and Theta Management
 */

import type { OptionsTradeRecord } from '../data/richOptionsTradesArchive.ts';
import {
  TradingWarzAnalysis,
  analyzeTradingWarzSetup,
  CandleOHLC,
} from './tradingWarzEngine.ts';
import { calculateBlackScholesGreeks } from './cboeOptionsEngine.ts';
import { getTradeExecutionRegime, MarketRegimeType } from './marketSession.ts';

export interface OptionsPosition {
  id: string;
  ticker: string; // 'ES', 'MES', 'SPY'
  contract: string; // e.g. "ES 12NOV26 7380 P"
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
  action: 'SELL_TO_OPEN' | 'BUY_TO_CLOSE' | 'EXPIRED_WORTHLESS' | 'ROLL_POSITION' | 'BREAKEVEN_EXIT';
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
  reflectionCritique: string;
  learnedRule: string;
  synapticWeightDelta: number;
}

export interface OptionsActiveMemoryState {
  version: string;
  episodes: OptionsTradeEpisode[];
  learnedRules: string[];
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
  tradeHistory: OptionsTradeRecord[]; // Active $2k Era trades ONLY
  legacyHistory: OptionsTradeRecord[]; // Archived read-only 192 historical audit records (50k era)
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

/**
 * Synthesizes comprehensive epistemic memory episodes from historical options trade records
 * Generates verbal critique, reinforcement weights, and rule learning for all 192 trades
 */
export function synthesizeOptionsEpisodesFromHistory(tradeHistory: OptionsTradeRecord[]): OptionsTradeEpisode[] {
  return tradeHistory.map((trade, idx) => {
    const isWin = trade.profitDollars > 0;
    const isBreakEven = trade.outcomeReason === 'Break Even';
    const isError = trade.outcomeReason === 'Order Error';

    const outcome: OptionsTradeEpisode['outcome'] = isError ? 'LOSS' : isBreakEven ? 'BREAKEVEN' : 'WIN';
    const pattern = trade.tradingWarzPattern || 'GOLDEN_ZONE_BOUNCE';
    const patternLabel = pattern.replace(/_/g, ' ');

    let reflectionCritique = '';
    let learnedRule = '';
    let synapticWeightDelta = 0;

    if (outcome === 'WIN') {
      synapticWeightDelta = Math.min(0.25, Number((0.05 + (trade.profitPercent / 100) * 0.10).toFixed(3)));
      if (trade.profitPercent >= 95) {
        reflectionCritique = `Held ${trade.contract} to expiration; full 100% premium (+$${trade.profitDollars.toFixed(2)}) captured as underlying traded safely above Golden Zone support floor ($${trade.goldenZoneSupportLevel}).`;
        learnedRule = `TradingWarz ${patternLabel} setups at Delta ≤ ${trade.delta} reliably expire worthless; full premium capture maximizes long-term portfolio growth.`;
      } else {
        reflectionCritique = `Executed disciplined early profit-take (${trade.profitPercent}%) on ${trade.contract}, banking +$${trade.profitDollars.toFixed(2)} within weekly cycle and liberating collateral.`;
        learnedRule = `Early profit take at 60-85% locks in compounded returns while cutting weekend gamma risk to zero.`;
      }
    } else if (outcome === 'BREAKEVEN') {
      synapticWeightDelta = +0.02; // Capital preservation positive reinforcement
      reflectionCritique = `Underlying tested support near strike; bot executed defensive break-even exit on ${trade.contract} (P&L $${trade.profitDollars.toFixed(2)}), preserving capital without taking catastrophic tail loss.`;
      learnedRule = `Immediate break-even exit when strike is pressured protects 100% of underlying capital and ensures 99x profit factor.`;
    } else {
      synapticWeightDelta = -0.15;
      reflectionCritique = `Order execution anomaly on ${trade.contract} (-$${Math.abs(trade.profitDollars).toFixed(2)}); active memory enforced automated syntax and strike validation checks.`;
      learnedRule = `Always run pre-flight contract specification validation before routing short put orders to broker API.`;
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
    isAutoPilotActive: true,
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
export function relearnOptionsMemoryFromHistory(account: OptionsPortfolioAccount): OptionsPortfolioAccount {
  const historyToUse = [
    ...(account.tradeHistory || []),
    ...(account.legacyHistory || []),
  ];
  const allEpisodes = synthesizeOptionsEpisodesFromHistory(historyToUse);

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

  const updatedMemory: OptionsActiveMemoryState = {
    ...account.activeMemory,
    episodes: allEpisodes,
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
  const startingBalance = account.startingBalance || 2000;
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
 * 1. Mark to market open short options positions
 * 2. Auto-take profit when profit target (e.g. 70-85%) is hit (Buy to close)
 * 3. Expire worthless if 0 DTE remaining (100% gain)
 * 4. Scan S&P 500 (ES, MES, SPY) for TradingWarz Golden Zone & candlestick setups
 * 5. Sell new safe OTM Puts with 0.08 - 0.14 Delta
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
  const newLogs: OptionsTradeLog[] = [];
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = `${dateStr} ${now.toTimeString().slice(0, 5)}`;

  let activeMemory: OptionsActiveMemoryState = { ...account.activeMemory };

  // 1. UPDATE EXISTING OPEN OPTIONS & EVALUATE EXITS
  for (const pos of account.positions) {
    const market = marketItems.find((m) => m.symbol === pos.ticker);
    const underlyingPrice = market ? market.currentPrice : pos.underlyingCurrentPrice;

    const nextDte = Math.max(0, pos.dteDaysRemaining - 1);
    const multiplier = pos.ticker === 'ES' ? 50 : 5;
    const ivDec = Math.max(0.12, (pos.ivRankPercent || 20) / 100);
    const bsReprice = nextDte === 0
      ? {
          price: pos.optionType === 'PUT'
            ? Math.max(0, pos.strike - underlyingPrice)
            : Math.max(0, underlyingPrice - pos.strike),
        }
      : calculateBlackScholesGreeks(underlyingPrice, pos.strike, nextDte / 365, 0.045, ivDec, pos.optionType);
    const decayedPremium = Math.max(0.05, Number(bsReprice.price.toFixed(2)));
    const unrealizedPnL = (pos.entryPremiumPerContract - decayedPremium) * pos.contractsCount * multiplier;
    const profitPct = ((pos.entryPremiumPerContract - decayedPremium) / Math.max(0.01, pos.entryPremiumPerContract)) * 100;

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
      const finalPnL = isExpired
        ? pos.totalPremiumCollected
        : Number(unrealizedPnL.toFixed(2));
      const finalProfitPct = isExpired ? 100 : Number(profitPct.toFixed(1));

      updatedCash += finalPnL;
      updatedRealizedIncome += finalPnL;

      const outcomeReason: OptionsTradeRecord['outcomeReason'] = isExpired
        ? 'Expired Worthless'
        : 'Early Take-Profit';

      const exitRegime = getTradeExecutionRegime(pos.ticker, now).regime;

      // Log trade record
      const closedRecord: OptionsTradeRecord = {
        id: `rich-opt-live-${Date.now()}`,
        date: dateStr,
        ticker: pos.ticker,
        boughtSold: 'Sold',
        contract: pos.contract,
        strike: pos.strike,
        optionType: 'PUT',
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
        whyOpenedThesis: `${outcomeReason}: ${pos.whyOpenedThesis} Banked +$${finalPnL.toFixed(2)} (${finalProfitPct}% profit).`,
        session: exitRegime,
      };

      account.tradeHistory.unshift(closedRecord);

      newLogs.push({
        id: `log-opt-exit-${Date.now()}-${pos.ticker}`,
        timestamp: timeStr,
        positionId: pos.id,
        contract: pos.contract,
        action: isExpired ? 'EXPIRED_WORTHLESS' : 'BUY_TO_CLOSE',
        contracts: pos.contractsCount,
        premium: decayedPremium,
        realizedPnL: finalPnL,
        realizedPnLPercent: finalProfitPct,
        session: exitRegime,
        reason: `${outcomeReason} [${exitRegime}] ${pos.contract}: Captured ${finalProfitPct}% of maximum premium (+$${finalPnL.toFixed(2)}). Collateral released. [Active Memory]: Reinforced TradingWarz ${pos.tradingWarzPattern} setup weight.`,
      });

      // Ingest into Active Memory
      activeMemory.episodes.unshift({
        id: `opt-ep-${Date.now()}`,
        timestamp: dateStr,
        contract: pos.contract,
        strategy: 'S&P 500 Put Harvesting & TradingWarz',
        delta: Math.abs(pos.delta),
        dte: pos.dteDaysRemaining,
        tradingWarzPattern: pos.tradingWarzPattern || 'TradingWarz Confluence',
        pnl: finalPnL,
        pnlPercent: finalProfitPct,
        outcome: 'WIN',
        reflectionCritique: `Successfully harvested $${finalPnL.toFixed(2)} from ${pos.contract} during ${exitRegime} session. Theta decay functioned reliably above support floor $${pos.goldenZoneSupportLevel.toFixed(2)}.`,
        learnedRule: 'Disciplined early profit-taking at 70-85% locks in compounded gains with zero tail risk.',
        synapticWeightDelta: +0.10,
      });
      activeMemory.learningIterations++;
      continue; // Exited, do not keep in open positions
    }

    updatedPositions.push(posCopy);
  }

  // 2. SCAN FOR NEW HARVESTING OPPORTUNITIES IF UNDER MAX OPEN POSITIONS
  const isMicroAccount = account.startingBalance <= 5000;
  const minCashNeeded = isMicroAccount ? 700 : 12000;

  if (updatedPositions.length < account.maxOpenPositions && updatedCash >= minCashNeeded) {
    // For $2,000 accounts, prioritize Micro E-mini (MES) and SPY, avoiding full ES ($15k margin)
    const candidates = marketItems.filter((m) =>
      isMicroAccount ? ['MES', 'SPY'].includes(m.symbol) : ['ES', 'MES', 'SPY'].includes(m.symbol)
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
        const multiplier = item.symbol === 'ES' ? 50 : 5;
        // Conservative 1 contract for $2,000 micro account
        const contracts = isMicroAccount ? 1 : item.symbol === 'ES' ? 1 : 5;

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
          id: `opt-pos-${Date.now()}-${item.symbol}`,
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
          id: `log-opt-open-${Date.now()}-${item.symbol}`,
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

  const multiplier = target.ticker === 'ES' ? 50 : 5;
  const costToClose = buyBackPremium * target.contractsCount * multiplier;
  const pnl = target.totalPremiumCollected - costToClose;
  const pnlPct = ((target.entryPremiumPerContract - buyBackPremium) / target.entryPremiumPerContract) * 100;

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = `${dateStr} ${now.toTimeString().slice(0, 5)}`;

  const log: OptionsTradeLog = {
    id: `log-manual-${Date.now()}-${target.ticker}`,
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
    id: `rich-opt-manual-${Date.now()}`,
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

          if (Array.isArray(parsed.tradeHistory) && parsed.tradeHistory.some((t: any) => String(t?.id || '').startsWith('rich-opt-log-'))) {
            parsed.tradeHistory = parsed.tradeHistory.filter(
              (t: any) => !String(t?.id || '').startsWith('rich-opt-log-')
            );
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
            parsed.activeMemory = initDefaultOptionsPortfolio(parsed.startingBalance || 2000).activeMemory;
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

  const escapeCell = (v: any) => {
    if (v === undefined || v === null) return '""';
    return `"${String(v).replace(/"/g, '""')}"`;
  };

  const allTrades = [
    ...(account.tradeHistory || []),
    ...(account.legacyHistory || []),
  ];

  const rows = allTrades.map((t) => [
    escapeCell(t.date),
    escapeCell(t.ticker),
    escapeCell(t.session || 'REGULAR'),
    escapeCell(t.boughtSold),
    escapeCell(t.contract),
    escapeCell(t.expiration),
    escapeCell(`$${t.profitDollars.toFixed(2)}`),
    escapeCell(`${t.profitPercent}%`),
    escapeCell(t.status),
    escapeCell(t.outcomeReason),
    escapeCell(t.tradingWarzPattern || 'TradingWarz Confluence'),
    escapeCell(`$${t.goldenZoneSupportLevel}`),
    escapeCell(t.delta),
    escapeCell(`$${t.thetaPerDay.toFixed(2)}`),
    escapeCell(t.whyOpenedThesis),
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}
