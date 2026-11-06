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

test('initDefaultOptionsPortfolio loads 192 historical trades and calculates stats', () => {
  const account = initDefaultOptionsPortfolio(50000);
  assert.strictEqual(account.startingBalance, 50000);
  assert.ok(account.tradeHistory.length >= 192, `Expected at least 192 trades, got ${account.tradeHistory.length}`);
  assert.strictEqual(account.totalRealizedIncome, 115008.44);

  const stats = calculateOptionsStats(account);
  assert.strictEqual(stats.totalRealizedIncome, 115008.44);
  assert.ok(stats.winRatePercent >= 98.0, `Expected high win rate, got ${stats.winRatePercent}`);
  assert.ok(stats.income2026 > 70000, `Expected 2026 income > 70k, got ${stats.income2026}`);
  assert.ok(stats.income2025 > 40000, `Expected 2025 income > 40k, got ${stats.income2025}`);
});

test('processOptionsAutonomousCycle executes theta decay and takes profit on short puts', () => {
  const account = initDefaultOptionsPortfolio(50000);
  const initialOpenCount = account.positions.length;
  assert.ok(initialOpenCount > 0);

  const marketItems = [
    { symbol: 'ES', currentPrice: 7650.0 },
    { symbol: 'MES', currentPrice: 6920.0 },
  ];

  const { updatedAccount, actionsTaken } = processOptionsAutonomousCycle(account, marketItems);
  assert.ok(updatedAccount.positions.length >= 1);
  assert.ok(updatedAccount.equity > 0);
  assert.strictEqual(typeof updatedAccount.dailyThetaIncome, 'number');
});

test('manualCloseOptionsPosition closes an option and updates realized income', () => {
  const account = initDefaultOptionsPortfolio(50000);
  const initialIncome = account.totalRealizedIncome;
  const targetPos = account.positions[0];

  const updatedAccount = manualCloseOptionsPosition(
    account,
    targetPos.id,
    5.0, // buy back at 5.0
    'Take profit on test'
  );

  assert.strictEqual(updatedAccount.positions.some((p) => p.id === targetPos.id), false);
  assert.ok(updatedAccount.totalRealizedIncome > initialIncome);
  assert.ok(updatedAccount.sessionLogs.length > 0);
});

test('exportOptionsLogsToCSV generates valid CSV matching Rich document columns', () => {
  const account = initDefaultOptionsPortfolio(50000);
  const csv = exportOptionsLogsToCSV(account);

  assert.ok(csv.includes('Date,Ticker,Bought/Sold,Contract,Expiration'));
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

