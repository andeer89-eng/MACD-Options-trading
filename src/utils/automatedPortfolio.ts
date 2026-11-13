/**
 * Pure Logic Engine for the Automated Virtual Portfolio Manager
 * Follows David Trullàs 4-Pillars Trading Strategy with zero synthetic seed positions,
 * zero fabricated Sharpe/Drawdown floors, and real CBOE confluence when live chain data is passed.
 */

import {
  ActiveMemoryState,
  initDefaultActiveMemory,
  loadActiveMemoryState,
  saveActiveMemoryState,
  ingestTradeEpisode,
  queryMemoryForSetup,
} from './activeLearningEngine.ts';
import { TickerOptionsSummary } from './cboeOptionsEngine.ts';
import { getTradeExecutionRegime, MarketRegimeType } from './marketSession.ts';

export interface CboeDecisionConfluence {
  overallScore: number | null;
  gexRegime: string;
  gammaAtm: number | null;
  thetaDailyAtm: number | null;
  putCallRatio: number | null;
  maxPainStrike: number | null;
  isOptionsApproved: boolean;
  confluenceRationale: string;
}

export interface AutomatedPosition {
  id: string;
  symbol: string;
  companyName: string;
  sector?: string;
  direction: 'BULLISH' | 'BEARISH';
  setupType: string;
  entryDate: string;
  entryPrice: number;
  currentPrice: number;
  initialShares: number;
  currentShares: number;
  stopLoss: number;
  trailingStop: number;
  target1: number;
  target2: number;
  target1Hit: boolean;
  target2Hit: boolean;
  atr: number;
  atrPercent: number;
  qualityScore: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  trancheStage: 1 | 2 | 3;
  reasonOpened: string;
  cboeConfluence?: CboeDecisionConfluence;
  executionSession?: MarketRegimeType;
}

export interface AutomatedTradeLog {
  id: string;
  timestamp: string;
  positionId: string;
  symbol: string;
  action: 'OPEN' | 'TRANCHE_SCALE' | 'PARTIAL_EXIT' | 'FULL_EXIT' | 'STOP_LOSS';
  shares: number;
  price: number;
  realizedPnL?: number;
  realizedPnLPercent?: number;
  reason: string;
  session?: MarketRegimeType;
}

export interface PortfolioAccount {
  startingBalance: number;
  cash: number;
  equity: number;
  realizedPnL: number;
  unrealizedPnL: number;
  positions: AutomatedPosition[];
  tradeHistory: AutomatedTradeLog[];
  isAutoPilotActive: boolean;
  riskPerTradePercent: number;
  maxOpenPositions: number;
  lastUpdated: string;
  activeMemory?: ActiveMemoryState;
}

export interface PortfolioStats {
  startingBalance: number;
  currentEquity: number;
  cashBalance: number;
  totalReturnDollars: number;
  totalReturnPercent: number;
  realizedPnL: number;
  unrealizedPnL: number;
  openPositionsCount: number;
  closedTradesCount: number;
  winningTradesCount: number;
  losingTradesCount: number;
  winRatePercent: number;
  profitFactor: number;
  averageWin: number;
  averageLoss: number;
  maxDrawdownPercent: number;
  sharpeRatio: number;
  expectancy: number;
}

const STORAGE_KEY = 'trullas_automated_portfolio_v2';

/**
 * Initializes clean starting portfolio with requested capital and ZERO fake pre-seeded positions or trades.
 */
export function initDefaultPortfolio(initialCapital: number = 10000): PortfolioAccount {
  return {
    startingBalance: initialCapital,
    cash: Number(initialCapital.toFixed(2)),
    equity: Number(initialCapital.toFixed(2)),
    realizedPnL: 0,
    unrealizedPnL: 0,
    positions: [],
    tradeHistory: [],
    isAutoPilotActive: true,
    riskPerTradePercent: 1.0,
    maxOpenPositions: 5,
    lastUpdated: new Date().toISOString(),
    activeMemory: initDefaultActiveMemory(),
  };
}

function computeEquityMetricsFromHistory(account: PortfolioAccount) {
  const startingBalance = account.startingBalance || 10000;
  const currentInvested = account.positions.reduce(
    (sum, pos) => sum + pos.currentShares * pos.currentPrice,
    0
  );
  const unrealizedPnL = account.positions.reduce((sum, pos) => sum + pos.unrealizedPnL, 0);
  const currentEquity = account.cash + currentInvested;

  const sortedLogs = [...account.tradeHistory].reverse();
  let cumulativeRealized = 0;
  let peakEquity = startingBalance;
  let maxDrawdownDollars = 0;
  let maxDrawdownPercent = 0;

  for (let i = 0; i < sortedLogs.length; i++) {
    const log = sortedLogs[i];
    if (log.realizedPnL !== undefined && log.realizedPnL !== 0) {
      cumulativeRealized += log.realizedPnL;
    }
    const markEquity = startingBalance + cumulativeRealized + (i === sortedLogs.length - 1 ? unrealizedPnL : 0);
    if (markEquity > peakEquity) peakEquity = markEquity;
    const ddDollars = Math.min(0, markEquity - peakEquity);
    const ddPct = peakEquity > 0 ? Math.min(0, (ddDollars / peakEquity) * 100) : 0;
    if (Math.abs(ddDollars) > Math.abs(maxDrawdownDollars)) maxDrawdownDollars = ddDollars;
    if (Math.abs(ddPct) > Math.abs(maxDrawdownPercent)) maxDrawdownPercent = ddPct;
  }

  if (currentEquity > peakEquity) peakEquity = currentEquity;
  const curDdDollars = Math.min(0, currentEquity - peakEquity);
  const curDdPct = peakEquity > 0 ? Math.min(0, (curDdDollars / peakEquity) * 100) : 0;
  if (Math.abs(curDdDollars) > Math.abs(maxDrawdownDollars)) maxDrawdownDollars = curDdDollars;
  if (Math.abs(curDdPct) > Math.abs(maxDrawdownPercent)) maxDrawdownPercent = curDdPct;

  const exitLogs = account.tradeHistory.filter((l) => l.realizedPnL !== undefined && l.realizedPnL !== 0);
  const tradeReturnsPct = exitLogs.map((l) => l.realizedPnLPercent ?? (l.realizedPnL! / startingBalance) * 100);

  let annualizedVolatility = 0;
  let downsideVolatility = 0;
  let sharpeRatio = 0;
  let sortinoRatio = 0;

  if (tradeReturnsPct.length >= 2) {
    const meanReturn = tradeReturnsPct.reduce((a, b) => a + b, 0) / tradeReturnsPct.length;
    const variance =
      tradeReturnsPct.reduce((acc, v) => acc + Math.pow(v - meanReturn, 2), 0) / (tradeReturnsPct.length - 1);
    const sampleStd = Math.sqrt(variance);
    annualizedVolatility = sampleStd * Math.sqrt(252);

    const negativeReturns = tradeReturnsPct.filter((r) => r < 0);
    if (negativeReturns.length > 0) {
      const downVar = negativeReturns.reduce((acc, v) => acc + v * v, 0) / negativeReturns.length;
      downsideVolatility = Math.sqrt(downVar) * Math.sqrt(252);
    }

    const totalReturnPct = ((currentEquity - startingBalance) / startingBalance) * 100;
    const excessReturn = totalReturnPct - 4.5;
    if (annualizedVolatility > 0) {
      sharpeRatio = Number((excessReturn / annualizedVolatility).toFixed(2));
    }
    if (downsideVolatility > 0) {
      sortinoRatio = Number((excessReturn / downsideVolatility).toFixed(2));
    }
  }

  return {
    currentInvested,
    unrealizedPnL,
    currentEquity,
    peakEquity,
    maxDrawdownDollars: Math.abs(maxDrawdownDollars),
    maxDrawdownPercent: Math.abs(maxDrawdownPercent),
    annualizedVolatility,
    downsideVolatility,
    sharpeRatio,
    sortinoRatio,
  };
}

/**
 * Calculates complete portfolio performance stats and risk metrics strictly from actual trades.
 */
export function calculatePortfolioStats(account: PortfolioAccount): PortfolioStats {
  const m = computeEquityMetricsFromHistory(account);
  const totalReturnDollars = m.currentEquity - account.startingBalance;
  const totalReturnPercent = account.startingBalance > 0 ? (totalReturnDollars / account.startingBalance) * 100 : 0;

  const exitLogs = account.tradeHistory.filter(
    (log) => log.realizedPnL !== undefined && log.realizedPnL !== 0
  );

  let winningTradesCount = 0;
  let losingTradesCount = 0;
  let grossWins = 0;
  let grossLosses = 0;

  exitLogs.forEach((log) => {
    const pnl = log.realizedPnL || 0;
    if (pnl > 0) {
      winningTradesCount++;
      grossWins += pnl;
    } else if (pnl < 0) {
      losingTradesCount++;
      grossLosses += Math.abs(pnl);
    }
  });

  const closedTradesCount = winningTradesCount + losingTradesCount;
  const winRatePercent = closedTradesCount > 0 ? (winningTradesCount / closedTradesCount) * 100 : 0;
  const profitFactor = grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? 99.0 : 0.0;
  const averageWin = winningTradesCount > 0 ? grossWins / winningTradesCount : 0;
  const averageLoss = losingTradesCount > 0 ? grossLosses / losingTradesCount : 0;

  const winProb = winRatePercent / 100;
  const lossProb = 1 - winProb;
  const expectancy = closedTradesCount > 0 ? winProb * averageWin - lossProb * averageLoss : 0;

  return {
    startingBalance: account.startingBalance,
    currentEquity: Number(m.currentEquity.toFixed(2)),
    cashBalance: Number(account.cash.toFixed(2)),
    totalReturnDollars: Number(totalReturnDollars.toFixed(2)),
    totalReturnPercent: Number(totalReturnPercent.toFixed(2)),
    realizedPnL: Number(account.realizedPnL.toFixed(2)),
    unrealizedPnL: Number(m.unrealizedPnL.toFixed(2)),
    openPositionsCount: account.positions.length,
    closedTradesCount,
    winningTradesCount,
    losingTradesCount,
    winRatePercent: Number(winRatePercent.toFixed(1)),
    profitFactor: Number(profitFactor.toFixed(2)),
    averageWin: Number(averageWin.toFixed(2)),
    averageLoss: Number(averageLoss.toFixed(2)),
    maxDrawdownPercent: Number(m.maxDrawdownPercent.toFixed(2)),
    sharpeRatio: m.sharpeRatio,
    expectancy: Number(expectancy.toFixed(2)),
  };
}

/**
 * Evaluates live CBOE Options chain confluence if real CBOE chain summary is provided;
 * otherwise explicitly reports unavailable without fabricating Greeks or P/C ratios.
 */
export function evaluateCboeOptionsConfluence(
  symbol: string,
  _price: number,
  direction: 'BULLISH' | 'BEARISH',
  cboeSummary?: TickerOptionsSummary | null
): CboeDecisionConfluence {
  if (!cboeSummary || !cboeSummary.chainAvailable) {
    return {
      overallScore: null,
      gexRegime: 'CBOE Chain Unavailable',
      gammaAtm: null,
      thetaDailyAtm: null,
      putCallRatio: null,
      maxPainStrike: null,
      isOptionsApproved: true, // Do not block equity execution solely because CBOE chain isn't loaded
      confluenceRationale: `[CBOE Options Feed]: No live CBOE option chain loaded for ${symbol}; position evaluated purely on equity price/technical rules.`,
    };
  }

  const isBull = direction === 'BULLISH';
  const gex = cboeSummary.totalGexMillions ?? 0;
  const gexRegime = gex >= 0 ? `Long Gamma (+$${gex.toFixed(1)}M)` : `Short Gamma (-$${Math.abs(gex).toFixed(1)}M)`;
  const pc = cboeSummary.putCallRatio;
  const gammaAtm = cboeSummary.averageGreeks.gammaAtm;
  const thetaAtm = cboeSummary.averageGreeks.thetaDailyAtm;
  const maxPain = cboeSummary.maxPainStrike;

  let overallScore = 60;
  if (gex >= 0) overallScore += 15;
  if (pc !== null && (isBull ? pc < 0.88 : pc > 1.12)) overallScore += 15;
  if (gammaAtm !== null && gammaAtm >= 0.01) overallScore += 10;

  overallScore = Math.min(100, Math.max(40, overallScore));
  const isOptionsApproved = overallScore >= 55;

  return {
    overallScore,
    gexRegime,
    gammaAtm,
    thetaDailyAtm: thetaAtm,
    putCallRatio: pc,
    maxPainStrike: maxPain,
    isOptionsApproved,
    confluenceRationale: `[Live CBOE Flow: ${overallScore}%]: ${gexRegime}${pc !== null ? `, P/C ${pc}` : ''}${maxPain !== null ? `, Max Pain $${maxPain.toFixed(2)}` : ''}.`,
  };
}

export interface EquityPoint {
  id: string;
  date: string;
  label: string;
  equity: number;
  cash: number;
  invested: number;
  peakEquity: number;
  drawdownPercent: number;
  drawdownDollars: number;
  event: string;
}

export interface AdvancedPerformanceAnalytics {
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  maxDrawdownPercent: number;
  maxDrawdownDollars: number;
  currentDrawdownPercent: number;
  peakEquity: number;
  currentEquity: number;
  startingBalance: number;
  totalReturnPercent: number;
  totalReturnDollars: number;
  annualizedReturnPercent: number;
  annualizedVolatilityPercent: number;
  downsideVolatilityPercent: number;
  valueAtRisk95Percent: number;
  profitFactor: number;
  winRatePercent: number;
  expectancyDollars: number;
  totalTrades: number;
  sp500BenchmarkReturnPercent: number | null;
  alphaVsBenchmarkPercent: number | null;
  equityCurve: EquityPoint[];
}

export function calculateAdvancedAnalytics(
  account: PortfolioAccount,
  benchmarkReturnPct: number | null = null
): AdvancedPerformanceAnalytics {
  const stats = calculatePortfolioStats(account);
  const m = computeEquityMetricsFromHistory(account);
  const startingBalance = account.startingBalance || 10000;
  const currentEquity = stats.currentEquity;
  const totalReturnDollars = stats.totalReturnDollars;
  const totalReturnPercent = stats.totalReturnPercent;

  const sortedLogs = [...account.tradeHistory].reverse();

  let cumulativeRealized = 0;
  let peakEquity = startingBalance;
  let maxDrawdownDollars = 0;
  let maxDrawdownPercent = 0;

  const curve: EquityPoint[] = [
    {
      id: 'point-start',
      date: account.lastUpdated ? account.lastUpdated.slice(0, 10) : new Date().toISOString().slice(0, 10),
      label: 'Deposit',
      equity: startingBalance,
      cash: startingBalance,
      invested: 0,
      peakEquity: startingBalance,
      drawdownPercent: 0,
      drawdownDollars: 0,
      event: `Initial $${startingBalance.toLocaleString()} Virtual Portfolio Provisioned`,
    },
  ];

  sortedLogs.forEach((log, index) => {
    if (log.realizedPnL !== undefined && log.realizedPnL !== 0) {
      cumulativeRealized += log.realizedPnL;
    }
    const markEquity = startingBalance + cumulativeRealized + (index === sortedLogs.length - 1 ? stats.unrealizedPnL : 0);
    if (markEquity > peakEquity) peakEquity = markEquity;

    const ddDollars = Math.min(0, markEquity - peakEquity);
    const ddPct = peakEquity > 0 ? Math.min(0, (ddDollars / peakEquity) * 100) : 0;

    if (Math.abs(ddDollars) > Math.abs(maxDrawdownDollars)) maxDrawdownDollars = ddDollars;
    if (Math.abs(ddPct) > Math.abs(maxDrawdownPercent)) maxDrawdownPercent = ddPct;

    curve.push({
      id: `point-${log.id}`,
      date: log.timestamp,
      label: `${log.action} ${log.symbol}`,
      equity: Number(markEquity.toFixed(2)),
      cash: Number(account.cash.toFixed(2)),
      invested: Number(Math.max(0, markEquity - account.cash).toFixed(2)),
      peakEquity: Number(peakEquity.toFixed(2)),
      drawdownPercent: Number(ddPct.toFixed(2)),
      drawdownDollars: Number(ddDollars.toFixed(2)),
      event: `${log.action} ${log.shares} shares ${log.symbol} @ $${log.price.toFixed(2)}${log.realizedPnL ? ` (P&L: ${log.realizedPnL >= 0 ? '+' : ''}$${log.realizedPnL.toFixed(2)})` : ''}`,
    });
  });

  if (curve.length === 1 || curve[curve.length - 1].equity !== currentEquity) {
    if (currentEquity > peakEquity) peakEquity = currentEquity;
    const currentDdDollars = Math.min(0, currentEquity - peakEquity);
    const currentDdPct = peakEquity > 0 ? Math.min(0, (currentDdDollars / peakEquity) * 100) : 0;
    if (Math.abs(currentDdDollars) > Math.abs(maxDrawdownDollars)) maxDrawdownDollars = currentDdDollars;
    if (Math.abs(currentDdPct) > Math.abs(maxDrawdownPercent)) maxDrawdownPercent = currentDdPct;

    curve.push({
      id: 'point-current',
      date: 'Live Mark',
      label: 'Current Equity',
      equity: Number(currentEquity.toFixed(2)),
      cash: Number(account.cash.toFixed(2)),
      invested: Number(Math.max(0, currentEquity - account.cash).toFixed(2)),
      peakEquity: Number(peakEquity.toFixed(2)),
      drawdownPercent: Number(currentDdPct.toFixed(2)),
      drawdownDollars: Number(currentDdDollars.toFixed(2)),
      event: `Mark-to-market equity $${currentEquity.toFixed(2)} (${stats.openPositionsCount} open positions)`,
    });
  }

  const currentDrawdownPercent = peakEquity > 0 ? Math.min(0, ((currentEquity - peakEquity) / peakEquity) * 100) : 0;
  const absMaxDD = Math.abs(maxDrawdownPercent);
  const calmarRatio = absMaxDD > 0 ? Number((totalReturnPercent / absMaxDD).toFixed(2)) : 0;
  const dailyVol = m.annualizedVolatility / Math.sqrt(252) / 100;
  const valueAtRisk95Percent = m.annualizedVolatility > 0 ? Number((currentEquity * dailyVol * 1.645).toFixed(2)) : 0;

  const alphaVsBenchmarkPercent =
    typeof benchmarkReturnPct === 'number' && Number.isFinite(benchmarkReturnPct)
      ? Number((totalReturnPercent - benchmarkReturnPct).toFixed(2))
      : null;

  return {
    sharpeRatio: m.sharpeRatio,
    sortinoRatio: m.sortinoRatio,
    calmarRatio,
    maxDrawdownPercent: Number(absMaxDD.toFixed(2)),
    maxDrawdownDollars: Number(Math.abs(maxDrawdownDollars).toFixed(2)),
    currentDrawdownPercent: Number(currentDrawdownPercent.toFixed(2)),
    peakEquity: Number(peakEquity.toFixed(2)),
    currentEquity: Number(currentEquity.toFixed(2)),
    startingBalance,
    totalReturnPercent: Number(totalReturnPercent.toFixed(2)),
    totalReturnDollars: Number(totalReturnDollars.toFixed(2)),
    annualizedReturnPercent: Number(totalReturnPercent.toFixed(2)),
    annualizedVolatilityPercent: Number(m.annualizedVolatility.toFixed(2)),
    downsideVolatilityPercent: Number(m.downsideVolatility.toFixed(2)),
    valueAtRisk95Percent,
    profitFactor: stats.profitFactor,
    winRatePercent: stats.winRatePercent,
    expectancyDollars: stats.expectancy,
    totalTrades: stats.closedTradesCount,
    sp500BenchmarkReturnPercent: benchmarkReturnPct,
    alphaVsBenchmarkPercent,
    equityCurve: curve,
  };
}

export function calculatePositionSize(
  equity: number,
  riskPercent: number,
  entryPrice: number,
  stopLossPrice: number,
  cashAvailable: number,
  maxAllocationPercent: number = 0.5
): { shares: number; riskAmountDollars: number; totalCost: number } {
  const riskAmountDollars = equity * (riskPercent / 100);
  const stopDistance = Math.abs(entryPrice - stopLossPrice);

  if (stopDistance <= 0.001 || entryPrice <= 0) {
    return { shares: 0, riskAmountDollars, totalCost: 0 };
  }

  let shares = Math.floor(riskAmountDollars / stopDistance);
  const maxAllowedCost = Math.min(cashAvailable, equity * maxAllocationPercent);
  if (shares * entryPrice > maxAllowedCost) {
    shares = Math.floor(maxAllowedCost / entryPrice);
  }

  shares = Math.max(0, shares);
  const totalCost = shares * entryPrice;

  return { shares, riskAmountDollars, totalCost };
}

export function processAutonomousCycle(
  account: PortfolioAccount,
  marketItems: Array<{
    symbol: string;
    companyName?: string;
    sector?: string;
    currentPrice: number;
    atr?: number;
    atrPercent?: number;
    setups: any[];
    candleCount?: number;
    cboeSummary?: TickerOptionsSummary | null;
  }>,
  allowExtendedHours: boolean = true
): { updatedAccount: PortfolioAccount; actionsTaken: AutomatedTradeLog[] } {
  if (!account.isAutoPilotActive) {
    return { updatedAccount: account, actionsTaken: [] };
  }

  let updatedCash = account.cash;
  let updatedRealizedPnL = account.realizedPnL;
  const updatedPositions: AutomatedPosition[] = [];
  const newLogs: AutomatedTradeLog[] = [];
  const now = new Date();
  const timestampStr = `${now.toISOString().slice(0, 10)} ${now.toTimeString().slice(0, 5)}`;

  let activeMemory: ActiveMemoryState = account.activeMemory
    ? { ...account.activeMemory }
    : loadActiveMemoryState();

  for (const pos of account.positions) {
    const marketInfo = marketItems.find((m) => m.symbol === pos.symbol);
    const currentPrice = marketInfo ? marketInfo.currentPrice : pos.currentPrice;

    const isBull = pos.direction === 'BULLISH';
    const unrealizedPnL = isBull
      ? (currentPrice - pos.entryPrice) * pos.currentShares
      : (pos.entryPrice - currentPrice) * pos.currentShares;
    const unrealizedPnLPercent = isBull
      ? ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100
      : ((pos.entryPrice - currentPrice) / pos.entryPrice) * 100;

    const posCopy: AutomatedPosition = {
      ...pos,
      currentPrice,
      unrealizedPnL: Number(unrealizedPnL.toFixed(2)),
      unrealizedPnLPercent: Number(unrealizedPnLPercent.toFixed(2)),
    };

    const stopLossHit = isBull ? currentPrice <= posCopy.trailingStop : currentPrice >= posCopy.trailingStop;
    if (stopLossHit) {
      const realizedPnL = isBull
        ? (posCopy.trailingStop - pos.entryPrice) * pos.currentShares
        : (pos.entryPrice - posCopy.trailingStop) * pos.currentShares;
      const realizedPct = isBull
        ? ((posCopy.trailingStop - pos.entryPrice) / pos.entryPrice) * 100
        : ((pos.entryPrice - posCopy.trailingStop) / pos.entryPrice) * 100;

      updatedCash += posCopy.currentShares * posCopy.trailingStop;
      updatedRealizedPnL += realizedPnL;

      if (activeMemory) {
        activeMemory = ingestTradeEpisode(activeMemory, {
          symbol: pos.symbol,
          companyName: pos.companyName,
          setupType: pos.setupType,
          direction: pos.direction,
          entryPrice: pos.entryPrice,
          exitPrice: posCopy.trailingStop,
          pnl: Number(realizedPnL.toFixed(2)),
          pnlPercent: Number(realizedPct.toFixed(2)),
          qualityScore: pos.qualityScore,
          atrPercent: pos.atrPercent,
          exitReason: `STOP LOSS TRIGGERED at $${posCopy.trailingStop.toFixed(2)}`,
        }).updatedState;
      }

      const posRegime = getTradeExecutionRegime(pos.symbol, now).regime;
      newLogs.push({
        id: `log-stop-${Date.now()}-${pos.symbol}`,
        timestamp: timestampStr,
        positionId: pos.id,
        symbol: pos.symbol,
        action: 'STOP_LOSS',
        shares: posCopy.currentShares,
        price: posCopy.trailingStop,
        realizedPnL: Number(realizedPnL.toFixed(2)),
        realizedPnLPercent: Number(realizedPct.toFixed(2)),
        session: posRegime,
        reason: `STOP LOSS TRIGGERED [${posRegime}] at $${posCopy.trailingStop.toFixed(2)} (${realizedPct.toFixed(2)}%). Realized P&L: ${realizedPnL >= 0 ? '+' : ''}$${realizedPnL.toFixed(2)}.`,
      });
      continue;
    }

    const target1HitCondition = isBull ? currentPrice >= pos.target1 : currentPrice <= pos.target1;
    if (target1HitCondition && !posCopy.target1Hit && posCopy.currentShares > 1) {
      const sharesToExit = Math.floor(posCopy.currentShares * 0.5);
      const remainingShares = posCopy.currentShares - sharesToExit;
      const pnl = isBull
        ? (pos.target1 - pos.entryPrice) * sharesToExit
        : (pos.entryPrice - pos.target1) * sharesToExit;
      const pnlPct = isBull
        ? ((pos.target1 - pos.entryPrice) / pos.entryPrice) * 100
        : ((pos.entryPrice - pos.target1) / pos.entryPrice) * 100;

      updatedCash += sharesToExit * pos.target1;
      updatedRealizedPnL += pnl;
      posCopy.currentShares = remainingShares;
      posCopy.target1Hit = true;
      posCopy.trailingStop = pos.entryPrice;

      if (activeMemory) {
        activeMemory = ingestTradeEpisode(activeMemory, {
          symbol: pos.symbol,
          companyName: pos.companyName,
          setupType: pos.setupType,
          direction: pos.direction,
          entryPrice: pos.entryPrice,
          exitPrice: pos.target1,
          pnl: Number(pnl.toFixed(2)),
          pnlPercent: Number(pnlPct.toFixed(2)),
          qualityScore: pos.qualityScore,
          atrPercent: pos.atrPercent,
          exitReason: `TARGET 1 ACHIEVED at $${pos.target1.toFixed(2)} (50% scale-out)`,
        }).updatedState;
      }

      const posRegime = getTradeExecutionRegime(pos.symbol, now).regime;
      newLogs.push({
        id: `log-t1-${Date.now()}-${pos.symbol}`,
        timestamp: timestampStr,
        positionId: pos.id,
        symbol: pos.symbol,
        action: 'PARTIAL_EXIT',
        shares: sharesToExit,
        price: pos.target1,
        realizedPnL: Number(pnl.toFixed(2)),
        realizedPnLPercent: Number(pnlPct.toFixed(2)),
        session: posRegime,
        reason: `TARGET 1 ACHIEVED [${posRegime}] at $${pos.target1.toFixed(2)}. Scaled out 50% (${sharesToExit} shares) +$${pnl.toFixed(2)}. Stop moved to breakeven ($${pos.entryPrice.toFixed(2)}).`,
      });
    }

    const target2HitCondition = isBull ? currentPrice >= pos.target2 : currentPrice <= pos.target2;
    if (target2HitCondition && !posCopy.target2Hit && posCopy.currentShares > 0) {
      const pnl = isBull
        ? (pos.target2 - pos.entryPrice) * posCopy.currentShares
        : (pos.entryPrice - pos.target2) * posCopy.currentShares;
      const pnlPct = isBull
        ? ((pos.target2 - pos.entryPrice) / pos.entryPrice) * 100
        : ((pos.entryPrice - pos.target2) / pos.entryPrice) * 100;

      updatedCash += posCopy.currentShares * pos.target2;
      updatedRealizedPnL += pnl;

      if (activeMemory) {
        activeMemory = ingestTradeEpisode(activeMemory, {
          symbol: pos.symbol,
          companyName: pos.companyName,
          setupType: pos.setupType,
          direction: pos.direction,
          entryPrice: pos.entryPrice,
          exitPrice: pos.target2,
          pnl: Number(pnl.toFixed(2)),
          pnlPercent: Number(pnlPct.toFixed(2)),
          qualityScore: pos.qualityScore,
          atrPercent: pos.atrPercent,
          exitReason: `TARGET 2 REACHED at $${pos.target2.toFixed(2)} (Full profit target)`,
        }).updatedState;
      }

      const posRegime = getTradeExecutionRegime(pos.symbol, now).regime;
      newLogs.push({
        id: `log-t2-${Date.now()}-${pos.symbol}`,
        timestamp: timestampStr,
        positionId: pos.id,
        symbol: pos.symbol,
        action: 'FULL_EXIT',
        shares: posCopy.currentShares,
        price: pos.target2,
        realizedPnL: Number(pnl.toFixed(2)),
        realizedPnLPercent: Number(pnlPct.toFixed(2)),
        session: posRegime,
        reason: `TARGET 2 REACHED [${posRegime}] at $${pos.target2.toFixed(2)}. Closed remaining ${posCopy.currentShares} shares (+$${pnl.toFixed(2)}).`,
      });
      continue;
    }

    updatedPositions.push(posCopy);
  }

  const openSymbols = new Set(updatedPositions.map((p) => p.symbol));
  const currentEquity =
    updatedCash +
    updatedPositions.reduce((sum, p) => sum + p.currentShares * p.currentPrice, 0);

  if (updatedPositions.length < account.maxOpenPositions && updatedCash > 100) {
    for (const item of marketItems) {
      if (openSymbols.has(item.symbol)) continue;
      if (updatedPositions.length >= account.maxOpenPositions) break;
      if (!item.currentPrice || item.currentPrice <= 0) continue;

      const symRegime = getTradeExecutionRegime(item.symbol, now);
      if (!symRegime.isOpen && !allowExtendedHours) continue;

      const mainSetup = item.setups?.[0];
      if (!mainSetup) continue;

      const rawQualityScore = mainSetup.qualityScore || 65;
      const atrPct = item.atrPercent !== undefined ? item.atrPercent : 2.0;

      const memoryQuery = queryMemoryForSetup(
        activeMemory,
        item.symbol,
        mainSetup.type,
        rawQualityScore
      );

      if (memoryQuery.isApproved && atrPct >= 1.0) {
        const isBull = mainSetup.type.includes('BULLISH');
        const entryPrice = item.currentPrice;
        const atr = item.atr && item.atr > 0 ? item.atr : entryPrice * (atrPct / 100);

        const stopDistance = memoryQuery.recommendedAtrStop * atr;
        const stopLoss = isBull
          ? Math.max(0.1, Number((entryPrice - stopDistance).toFixed(2)))
          : Number((entryPrice + stopDistance).toFixed(2));

        const target1 = isBull
          ? Number((entryPrice + stopDistance * 1.5).toFixed(2))
          : Number((entryPrice - stopDistance * 1.5).toFixed(2));
        const target2 = isBull
          ? Number((entryPrice + stopDistance * 2.8).toFixed(2))
          : Number((entryPrice - stopDistance * 2.8).toFixed(2));

        const baseSizing = calculatePositionSize(
          currentEquity,
          account.riskPerTradePercent,
          entryPrice,
          stopLoss,
          updatedCash
        );

        const adjustedShares = Math.floor(baseSizing.shares * memoryQuery.sizingMultiplier);
        const totalCost = adjustedShares * entryPrice;

        if (adjustedShares > 0 && totalCost <= updatedCash) {
          updatedCash -= totalCost;
          openSymbols.add(item.symbol);

          const cboeConfluence = evaluateCboeOptionsConfluence(
            item.symbol,
            entryPrice,
            isBull ? 'BULLISH' : 'BEARISH',
            item.cboeSummary
          );

          const newPosition: AutomatedPosition = {
            id: `auto-pos-${Date.now()}-${item.symbol}`,
            symbol: item.symbol,
            companyName: item.companyName || item.symbol,
            sector: item.sector,
            direction: isBull ? 'BULLISH' : 'BEARISH',
            setupType: mainSetup.type.replace('_', ' '),
            entryDate: now.toISOString().slice(0, 10),
            entryPrice,
            currentPrice: entryPrice,
            initialShares: adjustedShares,
            currentShares: adjustedShares,
            stopLoss,
            trailingStop: stopLoss,
            target1,
            target2,
            target1Hit: false,
            target2Hit: false,
            atr: Number(atr.toFixed(2)),
            atrPercent: Number(atrPct.toFixed(2)),
            qualityScore: rawQualityScore,
            unrealizedPnL: 0,
            unrealizedPnLPercent: 0,
            trancheStage: 1,
            reasonOpened: `Trullàs 4-Pillars ${mainSetup.type.replace('_', ' ')} [${symRegime.regime}] (${rawQualityScore}% score). ATR $${atr.toFixed(2)} (${atrPct.toFixed(2)}%). ${cboeConfluence.confluenceRationale} Sized for ${account.riskPerTradePercent}% risk (${adjustedShares} shares @ $${entryPrice.toFixed(2)}). Stop $${stopLoss.toFixed(2)}. ${memoryQuery.auditRationale}`,
            cboeConfluence,
            executionSession: symRegime.regime,
          };

          updatedPositions.push(newPosition);

          newLogs.push({
            id: `log-open-${Date.now()}-${item.symbol}`,
            timestamp: timestampStr,
            positionId: newPosition.id,
            symbol: item.symbol,
            action: 'OPEN',
            shares: adjustedShares,
            price: entryPrice,
            session: symRegime.regime,
            reason: `OPENED [${symRegime.regime}] ${adjustedShares} shares @ $${entryPrice.toFixed(2)}: ${newPosition.reasonOpened}`,
          });
        }
      }
    }
  }

  const finalEquity =
    updatedCash +
    updatedPositions.reduce((sum, p) => sum + p.currentShares * p.currentPrice, 0);

  const updatedAccount: PortfolioAccount = {
    ...account,
    cash: Number(updatedCash.toFixed(2)),
    equity: Number(finalEquity.toFixed(2)),
    realizedPnL: Number(updatedRealizedPnL.toFixed(2)),
    unrealizedPnL: Number(
      updatedPositions.reduce((sum, p) => sum + p.unrealizedPnL, 0).toFixed(2)
    ),
    positions: updatedPositions,
    tradeHistory: [...newLogs, ...account.tradeHistory],
    lastUpdated: now.toISOString(),
    activeMemory,
  };

  saveAutomatedPortfolio(updatedAccount);
  saveActiveMemoryState(activeMemory);
  return { updatedAccount, actionsTaken: newLogs };
}

export function manualCloseAutomatedPosition(
  account: PortfolioAccount,
  positionId: string,
  exitPrice: number,
  fractionToClose: number = 1.0,
  reason: string = 'User Manual Override Exit'
): PortfolioAccount {
  const targetPos = account.positions.find((p) => p.id === positionId);
  if (!targetPos) return account;

  const sharesToClose =
    fractionToClose >= 1.0
      ? targetPos.currentShares
      : Math.max(1, Math.floor(targetPos.currentShares * fractionToClose));

  const isBull = targetPos.direction === 'BULLISH';
  const pnl = isBull
    ? (exitPrice - targetPos.entryPrice) * sharesToClose
    : (targetPos.entryPrice - exitPrice) * sharesToClose;
  const pnlPct = isBull
    ? ((exitPrice - targetPos.entryPrice) / targetPos.entryPrice) * 100
    : ((targetPos.entryPrice - exitPrice) / targetPos.entryPrice) * 100;

  const proceeds = sharesToClose * exitPrice;
  const updatedCash = account.cash + proceeds;
  const updatedRealizedPnL = account.realizedPnL + pnl;

  const now = new Date();
  const timestampStr = `${now.toISOString().slice(0, 10)} ${now.toTimeString().slice(0, 5)}`;

  const log: AutomatedTradeLog = {
    id: `log-manual-${Date.now()}-${targetPos.symbol}`,
    timestamp: timestampStr,
    positionId: targetPos.id,
    symbol: targetPos.symbol,
    action: fractionToClose >= 1.0 ? 'FULL_EXIT' : 'PARTIAL_EXIT',
    shares: sharesToClose,
    price: exitPrice,
    realizedPnL: Number(pnl.toFixed(2)),
    realizedPnLPercent: Number(pnlPct.toFixed(2)),
    reason: `${fractionToClose >= 1.0 ? 'MANUAL FULL EXIT' : 'MANUAL PARTIAL EXIT'} ${sharesToClose} shares @ $${exitPrice.toFixed(2)} (${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%). Reason: ${reason}`,
  };

  const remainingPositions =
    sharesToClose >= targetPos.currentShares
      ? account.positions.filter((p) => p.id !== positionId)
      : account.positions.map((p) =>
          p.id === positionId
            ? {
                ...p,
                currentShares: p.currentShares - sharesToClose,
                unrealizedPnL: Number(
                  (
                    (isBull ? exitPrice - p.entryPrice : p.entryPrice - exitPrice) *
                    (p.currentShares - sharesToClose)
                  ).toFixed(2)
                ),
              }
            : p
        );

  let activeMemory = account.activeMemory ? { ...account.activeMemory } : loadActiveMemoryState();
  if (activeMemory) {
    activeMemory = ingestTradeEpisode(activeMemory, {
      symbol: targetPos.symbol,
      companyName: targetPos.companyName,
      setupType: targetPos.setupType,
      direction: targetPos.direction,
      entryPrice: targetPos.entryPrice,
      exitPrice,
      pnl: Number(pnl.toFixed(2)),
      pnlPercent: Number(pnlPct.toFixed(2)),
      qualityScore: targetPos.qualityScore,
      atrPercent: targetPos.atrPercent,
      exitReason: reason,
    }).updatedState;
    saveActiveMemoryState(activeMemory);
  }

  const equity =
    updatedCash +
    remainingPositions.reduce((sum, p) => sum + p.currentShares * p.currentPrice, 0);

  const updatedAccount: PortfolioAccount = {
    ...account,
    cash: Number(updatedCash.toFixed(2)),
    equity: Number(equity.toFixed(2)),
    realizedPnL: Number(updatedRealizedPnL.toFixed(2)),
    unrealizedPnL: Number(remainingPositions.reduce((s, p) => s + p.unrealizedPnL, 0).toFixed(2)),
    positions: remainingPositions,
    tradeHistory: [log, ...account.tradeHistory],
    lastUpdated: now.toISOString(),
    activeMemory,
  };

  saveAutomatedPortfolio(updatedAccount);
  return updatedAccount;
}

export function loadAutomatedPortfolio(): PortfolioAccount {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.cash === 'number' && Array.isArray(parsed.positions)) {
          if (!parsed.activeMemory) {
            parsed.activeMemory = loadActiveMemoryState();
          }
          return parsed;
        }
      }
    }
  } catch (err) {
    console.error('Failed to parse automated portfolio from localStorage', err);
  }
  return initDefaultPortfolio(10000);
}

export function saveAutomatedPortfolio(account: PortfolioAccount): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(account));
    }
  } catch (err) {
    console.error('Failed to save automated portfolio to localStorage', err);
  }
}

export function resetAutomatedPortfolio(initialCapital: number = 10000): PortfolioAccount {
  const account = initDefaultPortfolio(initialCapital);
  saveAutomatedPortfolio(account);
  return account;
}

export function exportAutomatedLogsToCSV(account: PortfolioAccount): string {
  const headers = [
    'Log ID',
    'Timestamp',
    'Position ID',
    'Symbol',
    'Action',
    'Shares',
    'Execution Price ($)',
    'Realized P&L ($)',
    'Return (%)',
    'Audit Reason & Strategy Trigger',
  ];

  const escapeCell = (v: any) => {
    if (v === undefined || v === null) return '""';
    return `"${String(v).replace(/"/g, '""')}"`;
  };

  const rows = account.tradeHistory.map((log) =>
    [
      escapeCell(log.id),
      escapeCell(log.timestamp),
      escapeCell(log.positionId),
      escapeCell(log.symbol),
      escapeCell(log.action),
      escapeCell(log.shares),
      escapeCell(log.price.toFixed(2)),
      escapeCell(log.realizedPnL !== undefined ? log.realizedPnL.toFixed(2) : ''),
      escapeCell(log.realizedPnLPercent !== undefined ? `${log.realizedPnLPercent.toFixed(2)}%` : ''),
      escapeCell(log.reason),
    ].join(',')
  );

  return [headers.map((h) => `"${h}"`).join(','), ...rows].join('\r\n');
}
