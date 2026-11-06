import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initDefaultPortfolio,
  calculatePortfolioStats,
  calculatePositionSize,
  processAutonomousCycle,
  manualCloseAutomatedPosition,
  calculateAdvancedAnalytics,
} from './automatedPortfolio';


test('initDefaultPortfolio starts with $10,000 baseline and valid equity', () => {
  const account = initDefaultPortfolio(10000);
  assert.equal(account.startingBalance, 10000);
  assert.ok(account.cash > 0, 'Cash should be positive');
  assert.ok(account.positions.length > 0, 'Should have initial active positions');
  assert.ok(account.tradeHistory.length > 0, 'Should have initial trade audit logs');
  assert.equal(account.isAutoPilotActive, true);
});

test('calculatePositionSize strictly enforces 1% risk rule', () => {
  const equity = 10000;
  const riskPercent = 1.0; // 1% = $100 risk
  const entryPrice = 400.0;
  const stopLoss = 390.0; // Stop distance = $10
  const cashAvailable = 8000;

  const result = calculatePositionSize(equity, riskPercent, entryPrice, stopLoss, cashAvailable);

  // Stop distance is 10, Risk is 100 -> shares = 100 / 10 = 10 shares
  assert.equal(result.shares, 10);
  assert.equal(result.riskAmountDollars, 100);
  assert.equal(result.totalCost, 4000);
});

test('calculatePortfolioStats calculates metrics correctly', () => {
  const account = initDefaultPortfolio(10000);
  const stats = calculatePortfolioStats(account);

  assert.equal(stats.startingBalance, 10000);
  assert.ok(stats.currentEquity > 0);
  assert.ok(stats.winRatePercent >= 0 && stats.winRatePercent <= 100);
  assert.ok(stats.profitFactor >= 0);
  assert.ok(stats.openPositionsCount === account.positions.length);
});

test('manualCloseAutomatedPosition correctly handles 50% partial exit and logs reason', () => {
  const account = initDefaultPortfolio(10000);
  const posToClose = account.positions[0];
  const initialShares = posToClose.currentShares;
  const exitPrice = posToClose.entryPrice + 10.0; // Profit of $10/share

  const updatedAccount = manualCloseAutomatedPosition(
    account,
    posToClose.id,
    exitPrice,
    0.5,
    'Manual profit taking at resistance'
  );

  const updatedPos = updatedAccount.positions.find((p) => p.id === posToClose.id);
  assert.ok(updatedPos, 'Position should still exist with remaining shares');
  assert.equal(updatedPos.currentShares, Math.ceil(initialShares / 2));

  const latestLog = updatedAccount.tradeHistory[0];
  assert.equal(latestLog.action, 'PARTIAL_EXIT');
  assert.ok(latestLog.realizedPnL! > 0, 'Realized PnL should be positive');
  assert.ok(latestLog.reason.includes('Manual profit taking at resistance'));
});

test('manualCloseAutomatedPosition correctly handles 100% full exit', () => {
  const account = initDefaultPortfolio(10000);
  const posToClose = account.positions[1];
  const exitPrice = posToClose.entryPrice + 5.0;

  const updatedAccount = manualCloseAutomatedPosition(
    account,
    posToClose.id,
    exitPrice,
    1.0,
    'Full position closed'
  );

  const remaining = updatedAccount.positions.find((p) => p.id === posToClose.id);
  assert.equal(remaining, undefined, 'Position should be fully removed from open list');

  const latestLog = updatedAccount.tradeHistory[0];
  assert.equal(latestLog.action, 'FULL_EXIT');
  assert.ok(latestLog.realizedPnL! > 0);
});

test('processAutonomousCycle triggers Target 1 partial profit and breakeven trailing stop', () => {
  const account = initDefaultPortfolio(10000);
  // Pick JPM which has target1 = 242.0 and target1Hit = false
  const targetPos = account.positions.find((p) => p.symbol === 'JPM')!;
  assert.equal(targetPos.target1Hit, false);

  const mockMarket = [
    {
      symbol: 'JPM',
      currentPrice: 243.5, // Exceeds target1 ($242.00)
      setups: [],
    },
  ];

  const { updatedAccount, actionsTaken } = processAutonomousCycle(account, mockMarket);
  const updatedJpm = updatedAccount.positions.find((p) => p.symbol === 'JPM');

  assert.ok(updatedJpm, 'JPM should still have remaining half of shares');
  assert.equal(updatedJpm.target1Hit, true, 'target1Hit should be flagged true');
  assert.equal(updatedJpm.trailingStop, targetPos.entryPrice, 'Trailing stop should move to breakeven');

  const target1Log = actionsTaken.find((a) => a.action === 'PARTIAL_EXIT' && a.symbol === 'JPM');
  assert.ok(target1Log, 'Should have logged Target 1 partial exit');
  assert.ok(target1Log.reason.includes('TARGET 1 ACHIEVED'));
});

test('processAutonomousCycle auto-learns and updates active memory from trade outcomes', () => {
  const account = initDefaultPortfolio(10000);
  const initialIterations = account.activeMemory?.learningIterations || 0;

  const mockMarket = [
    {
      symbol: 'JPM',
      currentPrice: 245.0, // Triggers Target 1
      setups: [],
    },
  ];

  const { updatedAccount } = processAutonomousCycle(account, mockMarket);
  assert.ok(updatedAccount.activeMemory, 'Active memory should exist');
  assert.ok(
    updatedAccount.activeMemory.learningIterations > initialIterations,
    'Learning iterations should increment after trade scale-out'
  );
  assert.equal(updatedAccount.activeMemory.episodes[0].symbol, 'JPM');
  assert.equal(updatedAccount.activeMemory.episodes[0].outcome, 'WIN');
});

test('calculateAdvancedAnalytics computes Sharpe ratio, Sortino ratio, drawdown, and equity curve correctly', () => {
  const account = initDefaultPortfolio(10000);
  const analytics = calculateAdvancedAnalytics(account);


  assert.ok(analytics.sharpeRatio > 0, 'Sharpe ratio should be positive');
  assert.ok(analytics.sortinoRatio > 0, 'Sortino ratio should be positive');
  assert.ok(analytics.calmarRatio > 0, 'Calmar ratio should be positive');
  assert.ok(analytics.maxDrawdownPercent >= 0, 'Max drawdown percent should be non-negative');
  assert.ok(analytics.equityCurve.length >= 2, 'Equity curve should contain at least deposit and current points');
  assert.equal(analytics.startingBalance, 10000);
  assert.ok(analytics.currentEquity > 0);
  assert.ok(analytics.sp500BenchmarkReturnPercent > 0);
});

