import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initDefaultPortfolio,
  calculatePortfolioStats,
  calculatePositionSize,
  processAutonomousCycle,
  manualCloseAutomatedPosition,
  calculateAdvancedAnalytics,
  PortfolioAccount,
  AutomatedPosition,
} from './automatedPortfolio';

function createAccountWithTestPositions(): PortfolioAccount {
  const account = initDefaultPortfolio(10000);
  const jpm: AutomatedPosition = {
    id: 'test-pos-jpm',
    symbol: 'JPM',
    companyName: 'JPMorgan Chase & Co.',
    sector: 'Financials',
    direction: 'BULLISH',
    setupType: 'BULLISH DOUBLE DIVERGENCE',
    entryDate: '2026-10-31',
    entryPrice: 236.4,
    currentPrice: 238.0,
    initialShares: 8,
    currentShares: 8,
    stopLoss: 231.85,
    trailingStop: 231.85,
    target1: 242.0,
    target2: 247.5,
    target1Hit: false,
    target2Hit: false,
    atr: 4.55,
    atrPercent: 1.92,
    qualityScore: 78,
    unrealizedPnL: 12.8,
    unrealizedPnLPercent: 0.68,
    trancheStage: 1,
    reasonOpened: 'Unit test position',
  };
  const msft: AutomatedPosition = {
    id: 'test-pos-msft',
    symbol: 'MSFT',
    companyName: 'Microsoft Corporation',
    sector: 'Information Technology',
    direction: 'BULLISH',
    setupType: 'BULLISH TRIPLE DIVERGENCE',
    entryDate: '2026-10-28',
    entryPrice: 420.0,
    currentPrice: 425.0,
    initialShares: 4,
    currentShares: 4,
    stopLoss: 410.0,
    trailingStop: 410.0,
    target1: 432.0,
    target2: 444.0,
    target1Hit: false,
    target2Hit: false,
    atr: 6.2,
    atrPercent: 1.48,
    qualityScore: 88,
    unrealizedPnL: 20.0,
    unrealizedPnLPercent: 1.19,
    trancheStage: 1,
    reasonOpened: 'Unit test position',
  };
  const invested = jpm.entryPrice * jpm.currentShares + msft.entryPrice * msft.currentShares;
  return {
    ...account,
    cash: Number((10000 - invested).toFixed(2)),
    positions: [jpm, msft],
  };
}

test('initDefaultPortfolio starts clean with $10,000 baseline and zero fabricated positions or trades', () => {
  const account = initDefaultPortfolio(10000);
  assert.equal(account.startingBalance, 10000);
  assert.equal(account.cash, 10000);
  assert.equal(account.positions.length, 0);
  assert.equal(account.tradeHistory.length, 0);
  assert.equal(account.isAutoPilotActive, true);
});

test('calculatePositionSize strictly enforces 1% risk rule', () => {
  const result = calculatePositionSize(10000, 1.0, 400.0, 390.0, 8000);
  assert.equal(result.shares, 10);
  assert.equal(result.riskAmountDollars, 100);
  assert.equal(result.totalCost, 4000);
});

test('calculatePortfolioStats calculates metrics cleanly for empty and populated portfolios', () => {
  const empty = initDefaultPortfolio(10000);
  const emptyStats = calculatePortfolioStats(empty);
  assert.equal(emptyStats.currentEquity, 10000);
  assert.equal(emptyStats.closedTradesCount, 0);
  assert.equal(emptyStats.sharpeRatio, 0);

  const account = createAccountWithTestPositions();
  const stats = calculatePortfolioStats(account);
  assert.equal(stats.openPositionsCount, 2);
  assert.ok(stats.currentEquity > 0);
});

test('manualCloseAutomatedPosition correctly handles 50% partial exit and logs reason', () => {
  const account = createAccountWithTestPositions();
  const posToClose = account.positions[0];
  const initialShares = posToClose.currentShares;
  const exitPrice = posToClose.entryPrice + 10.0;

  const updatedAccount = manualCloseAutomatedPosition(
    account,
    posToClose.id,
    exitPrice,
    0.5,
    'Manual profit taking at resistance'
  );

  const updatedPos = updatedAccount.positions.find((p) => p.id === posToClose.id);
  assert.ok(updatedPos);
  assert.equal(updatedPos.currentShares, Math.ceil(initialShares / 2));

  const latestLog = updatedAccount.tradeHistory[0];
  assert.equal(latestLog.action, 'PARTIAL_EXIT');
  assert.ok(latestLog.realizedPnL! > 0);
  assert.ok(latestLog.reason.includes('Manual profit taking at resistance'));
});

test('manualCloseAutomatedPosition correctly handles 100% full exit', () => {
  const account = createAccountWithTestPositions();
  const posToClose = account.positions[1];
  const updatedAccount = manualCloseAutomatedPosition(
    account,
    posToClose.id,
    posToClose.entryPrice + 5.0,
    1.0,
    'Full position closed'
  );

  assert.equal(updatedAccount.positions.find((p) => p.id === posToClose.id), undefined);
  assert.equal(updatedAccount.tradeHistory[0].action, 'FULL_EXIT');
  assert.ok(updatedAccount.tradeHistory[0].realizedPnL! > 0);
});

test('processAutonomousCycle triggers Target 1 partial profit, breakeven trailing stop, and active memory learning', () => {
  const account = createAccountWithTestPositions();
  const targetPos = account.positions.find((p) => p.symbol === 'JPM')!;

  const { updatedAccount, actionsTaken } = processAutonomousCycle(account, [
    { symbol: 'JPM', currentPrice: 243.5, setups: [] },
  ]);
  const updatedJpm = updatedAccount.positions.find((p) => p.symbol === 'JPM');

  assert.ok(updatedJpm);
  assert.equal(updatedJpm.target1Hit, true);
  assert.equal(updatedJpm.trailingStop, targetPos.entryPrice);

  const target1Log = actionsTaken.find((a) => a.action === 'PARTIAL_EXIT' && a.symbol === 'JPM');
  assert.ok(target1Log);
  assert.ok(target1Log.reason.includes('TARGET 1 ACHIEVED'));

  assert.ok(updatedAccount.activeMemory);
  assert.equal(updatedAccount.activeMemory.learningIterations, 1);
  assert.equal(updatedAccount.activeMemory.episodes[0].symbol, 'JPM');
  assert.equal(updatedAccount.activeMemory.episodes[0].outcome, 'WIN');
});

test('calculateAdvancedAnalytics computes real equity curve without fake floor constants', () => {
  let account = createAccountWithTestPositions();
  account = manualCloseAutomatedPosition(account, 'test-pos-jpm', 245.0, 1.0, 'Exit 1');
  account = manualCloseAutomatedPosition(account, 'test-pos-msft', 415.0, 1.0, 'Exit 2');

  const analytics = calculateAdvancedAnalytics(account, 2.5);
  assert.ok(analytics.equityCurve.length >= 2);
  assert.equal(analytics.startingBalance, 10000);
  assert.equal(analytics.sp500BenchmarkReturnPercent, 2.5);
  assert.ok(analytics.totalTrades === 2);
});
