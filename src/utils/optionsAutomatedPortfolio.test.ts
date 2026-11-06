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

test('initDefaultOptionsPortfolio loads 192 historical trades in legacyHistory and initializes fresh $2k active journal', () => {
  const account = initDefaultOptionsPortfolio(2000);
  assert.strictEqual(account.startingBalance, 2000);
  assert.strictEqual(account.cash, 2000);
  assert.strictEqual(account.positions.length, 0);
  assert.strictEqual(account.tradeHistory.length, 0, 'Active trade history starts clean with 0 trades');
  assert.ok(account.legacyHistory.length >= 192, `Expected at least 192 archived legacy trades, got ${account.legacyHistory.length}`);
  assert.strictEqual(account.activeMemory.totalThetaHarvested, 115008.44);

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

  const marketItems = [
    { symbol: 'MES', currentPrice: 6920.0 },
  ];

  const { updatedAccount, actionsTaken } = processOptionsAutonomousCycle(account, marketItems, true);
  assert.ok(updatedAccount.positions.length >= 1, `Expected at least 1 position opened, got ${updatedAccount.positions.length}`);
  assert.ok(updatedAccount.equity > 0);
  assert.ok(updatedAccount.positions[0].executionSession, 'Expected position to have executionSession');
  assert.strictEqual(typeof updatedAccount.dailyThetaIncome, 'number');
});

test('manualCloseOptionsPosition closes an option and updates realized income', () => {
  const account = initDefaultOptionsPortfolio(2000);
  // Add a test position
  const marketItems = [{ symbol: 'MES', currentPrice: 6920.0 }];
  const { updatedAccount: populatedAccount } = processOptionsAutonomousCycle(account, marketItems, true);
  assert.ok(populatedAccount.positions.length > 0);

  const initialIncome = populatedAccount.totalRealizedIncome;
  const targetPos = populatedAccount.positions[0];

  const updatedAccount = manualCloseOptionsPosition(
    populatedAccount,
    targetPos.id,
    5.0, // buy back at 5.0
    'Take profit on test'
  );

  assert.strictEqual(updatedAccount.positions.some((p) => p.id === targetPos.id), false);
  assert.ok(updatedAccount.totalRealizedIncome !== initialIncome || updatedAccount.cash > 0);
  assert.ok(updatedAccount.sessionLogs.length > 0);
});

test('exportOptionsLogsToCSV generates valid CSV matching Rich document columns including Session', () => {
  const account = initDefaultOptionsPortfolio(2000);
  const csv = exportOptionsLogsToCSV(account);

  assert.ok(csv.includes('Date,Ticker,Session,Bought/Sold,Contract,Expiration'));
  assert.ok(csv.includes('ES 05NOV26 7340 P'));
  assert.ok(csv.includes('MES 16MAY25 5650 P'));
});

test('activeMemory synthesizes 192+ episodes and relearnOptionsMemoryFromHistory recalculates policies', () => {
  const account = initDefaultOptionsPortfolio(50000);
  assert.ok(account.activeMemory.episodes.length >= 192, `Expected >= 192 episodes, got ${account.activeMemory.episodes.length}`);
  assert.strictEqual(account.activeMemory.learningIterations, account.activeMemory.episodes.length);
  assert.ok(account.activeMemory.learnedRules.length >= 5);

  // Check structure of first episode
  const ep1 = account.activeMemory.episodes[0];
  assert.ok(ep1.id);
  assert.ok(ep1.contract);
  assert.ok(ep1.reflectionCritique);
  assert.ok(ep1.learnedRule);

  // Test relearning
  const relearned = relearnOptionsMemoryFromHistory(account);
  assert.strictEqual(relearned.activeMemory.episodes.length, account.activeMemory.episodes.length);
  assert.strictEqual(relearned.activeMemory.calibratedMaxDelta, 0.12);
});

