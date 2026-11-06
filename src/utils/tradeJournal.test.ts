import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateJournalStats,
  exportJournalToCSV,
  SEED_JOURNAL_ENTRIES,
  JournalEntry,
} from './tradeJournal.ts';

test('calculateJournalStats computes win rate and P&L metrics accurately', () => {
  const stats = calculateJournalStats(SEED_JOURNAL_ENTRIES);

  assert.equal(stats.totalTrades, 4);
  assert.equal(stats.openTrades, 1);
  assert.equal(stats.closedTrades, 3);
  assert.equal(stats.winningTrades, 2);
  assert.equal(stats.losingTrades, 1);
  assert.equal(stats.winRatePct, 66.7);
  assert.equal(stats.totalRealizedPnL, 2485.0); // 2055 + 950 - 520
  assert.ok(stats.profitFactor > 1.0);
  assert.equal(stats.bestTradePnL, 2055.0);
  assert.equal(stats.worstTradePnL, -520.0);
});

test('calculateJournalStats handles empty closed trades list without dividing by zero', () => {
  const emptyList: JournalEntry[] = [];
  const stats = calculateJournalStats(emptyList);

  assert.equal(stats.totalTrades, 0);
  assert.equal(stats.winRatePct, 0);
  assert.equal(stats.totalRealizedPnL, 0);
  assert.equal(stats.profitFactor, 0);
});

test('exportJournalToCSV generates compliant CSV with audit headers and escaped values', () => {
  const csv = exportJournalToCSV(SEED_JOURNAL_ENTRIES);
  const lines = csv.split('\r\n');

  // Verify header line
  assert.ok(lines.length >= 5, 'Should contain header + 4 rows');
  const header = lines[0];
  assert.ok(header.includes('"Trade ID"'));
  assert.ok(header.includes('"Symbol"'));
  assert.ok(header.includes('"Realized P&L ($)"'));
  assert.ok(header.includes('"Risk/Reward Ratio"'));
  assert.ok(header.includes('"Performance & Audit Notes"'));

  // Verify row 1 (NVDA)
  const nvdaRow = lines.find((l) => l.includes('"NVDA"'));
  assert.ok(nvdaRow, 'NVDA row should exist');
  assert.ok(nvdaRow?.includes('"NVIDIA Corporation"'));
  assert.ok(nvdaRow?.includes('"BULLISH_TRIPLE"'));
  assert.ok(nvdaRow?.includes('"2055.00"'));
  assert.ok(nvdaRow?.includes('"11.00%"'));

  // Verify row 4 (MSFT open position)
  const msftRow = lines.find((l) => l.includes('"MSFT"'));
  assert.ok(msftRow, 'MSFT row should exist');
  assert.ok(msftRow?.includes('"OPEN"'));
});

test('exportJournalToCSV handles commas, quotes, and empty entries gracefully', () => {
  const emptyCsv = exportJournalToCSV([]);
  assert.ok(emptyCsv.startsWith('"Trade ID"'));
  assert.equal(emptyCsv.split('\r\n').length, 1);

  const trickyEntry: JournalEntry = {
    id: 'test-1',
    symbol: 'XYZ',
    setupType: 'BULLISH_DOUBLE',
    timeframe: '4h',
    status: 'CLOSED_WIN',
    entryDate: '2026-11-01',
    entryPrice: 100,
    stopLoss: 95,
    targetPrice: 115,
    quantity: 10,
    notes: 'Note with "quotes", commas, and\nnewlines',
    tags: ['Tag 1', 'Tag 2'],
    executionRating: 5,
    createdAt: Date.now(),
  };

  const csv = exportJournalToCSV([trickyEntry]);
  assert.ok(csv.includes('""quotes""'), 'Quotes should be doubled for CSV compliance');
});
