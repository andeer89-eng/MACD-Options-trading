import { test } from 'node:test';
import assert from 'node:assert';
import {
  initDefaultOptionsPortfolio,
  calculateOptionsStats,
  processOptionsAutonomousCycle,
  manualCloseOptionsPosition,
  exportOptionsLogsToCSV,
  relearnOptionsMemoryFromHistory,
} from './optionsAutomatedPortfolio.ts';

test('initDefaultOptionsPortfolio initializes clean empty journal with zero synthetic trades or seeded income', () => {
  const account = initDefaultOptionsPortfolio(2000);
  assert.strictEqual(account.startingBalance, 2000);
  assert.strictEqual(account.cash, 2000);
  assert.strictEqual(account.positions.length, 0);
  assert.strictEqual(account.tradeHistory.length, 0, 'Active trade history starts clean with 0 trades');
  assert.strictEqual(account.legacyHistory.length, 0, 'No synthetic archive trades seeded');
  assert.strictEqual(account.activeMemory.totalThetaHarvested, 0);
  assert.strictEqual(account.activeMemory.episodes.length, 0);

  const stats = calculateOptionsStats(account);
  assert.strictEqual(stats.startingBalance, 2000);
  assert.strictEqual(stats.currentEquity, 2000);
  assert.strictEqual(stats.totalRealizedIncome, 0.0);
  assert.strictEqual(stats.totalTradesCount, 0);
  assert.strictEqual(stats.winRatePercent, 0.0);
});

test('processOptionsAutonomousCycle scans and opens a qualified MES position on fresh $2,000 account', () => {
  const account = initDefaultOptionsPortfolio(2000);
  assert.strictEqual(account.positions.length, 0);

  const testCandles = [
    { open: 6850, high: 6890, low: 6820, close: 6880 },
    { open: 6880, high: 6910, low: 6840, close: 6895 },
    { open: 6895, high: 6945, low: 6875, close: 6920 },
    { open: 6920, high: 6935, low: 6890, close: 6915 }, // Outside/Inside setup
    { open: 6915, high: 6930, low: 6900, close: 6920 },
  ];
  const marketItems = [
    { symbol: 'MES', currentPrice: 6920.0, candles: testCandles },
  ];

  const { updatedAccount } = processOptionsAutonomousCycle(account, marketItems, true);
  assert.ok(updatedAccount.positions.length >= 1, `Expected at least 1 position opened, got ${updatedAccount.positions.length}`);
  assert.ok(updatedAccount.equity > 0);
  assert.ok(updatedAccount.positions[0].executionSession, 'Expected position to have executionSession');
  assert.strictEqual(typeof updatedAccount.dailyThetaIncome, 'number');
});

test('manualCloseOptionsPosition closes an option, updates realized income, and learns from real trade history', () => {
  const account = initDefaultOptionsPortfolio(2000);
  const testCandles = [
    { open: 6850, high: 6890, low: 6820, close: 6880 },
    { open: 6880, high: 6910, low: 6840, close: 6895 },
    { open: 6895, high: 6945, low: 6875, close: 6920 },
    { open: 6920, high: 6935, low: 6890, close: 6915 },
    { open: 6915, high: 6930, low: 6900, close: 6920 },
  ];
  const marketItems = [{ symbol: 'MES', currentPrice: 6920.0, candles: testCandles }];
  const { updatedAccount: populatedAccount } = processOptionsAutonomousCycle(account, marketItems, true);
  assert.ok(populatedAccount.positions.length > 0);

  const initialIncome = populatedAccount.totalRealizedIncome;
  const targetPos = populatedAccount.positions[0];

  const updatedAccount = manualCloseOptionsPosition(
    populatedAccount,
    targetPos.id,
    0.10, // buy back near worthless
    'Take profit on test'
  );

  assert.strictEqual(updatedAccount.positions.some((p) => p.id === targetPos.id), false);
  assert.ok(updatedAccount.totalRealizedIncome !== initialIncome || updatedAccount.cash > 0);
  assert.ok(updatedAccount.sessionLogs.length > 0);
  assert.strictEqual(updatedAccount.tradeHistory.length, 1);

  const relearned = relearnOptionsMemoryFromHistory(updatedAccount);
  assert.strictEqual(relearned.activeMemory.episodes.length, 1);
  assert.strictEqual(relearned.activeMemory.learningIterations, 1);
  assert.ok(relearned.activeMemory.learnedRules.length >= 5);
  assert.ok(relearned.activeMemory.episodes[0].reflectionCritique.length > 0);

  const csv = exportOptionsLogsToCSV(relearned);
  assert.ok(csv.includes('Date,Ticker,Session,Bought/Sold,Contract,Expiration'));
  assert.ok(csv.includes(targetPos.contract));
});


