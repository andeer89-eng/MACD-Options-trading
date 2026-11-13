import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateJournalStats,
  exportJournalToCSV,
  JournalEntry,
} from './tradeJournal.ts';

const TEST_FIXTURE_ENTRIES: JournalEntry[] = [
  {
    id: 'test-1',
    symbol: 'NVDA',
    companyName: 'NVIDIA Corporation',
    setupType: 'BULLISH_TRIPLE',
    timeframe: '1d',
    status: 'CLOSED_WIN',
    entryDate: '2026-10-14',
    exitDate: '2026-10-24',
    entryPrice: 124.5,
    exitPrice: 138.2,
    stopLoss: 120.0,
    targetPrice: 138.0,
    quantity: 150,
    realizedPnL: 2055.0,
    pnlPercent: 11.0,
    notes: 'Entered Tranche 1 at 23.6% trigger breakout.',
    tags: ['Followed 4-Pillars'],
    executionRating: 5,
    createdAt: 1760400000000,
  },
  {
    id: 'test-2',
    symbol: 'AAPL',
    companyName: 'Apple Inc.',
    setupType: 'BULLISH_DOUBLE',
    timeframe: '1d',
    status: 'CLOSED_WIN',
    entryDate: '2026-10-18',
    exitDate: '2026-10-28',
    entryPrice: 222.0,
    exitPrice: 231.5,
    stopLoss: 218.0,
    targetPrice: 232.0,
    quantity: 100,
    realizedPnL: 950.0,
    pnlPercent: 4.28,
    notes: 'Took profit at Target 1.',
    tags: ['TP1 Hit'],
    executionRating: 4,
    createdAt: 1760745600000,
  },
  {
    id: 'test-3',
    symbol: 'TSLA',
    companyName: 'Tesla, Inc.',
    setupType: 'BEARISH_TRIPLE',
    timeframe: '1d',
    status: 'CLOSED_LOSS',
    entryDate: '2026-10-20',
    exitDate: '2026-10-22',
    entryPrice: 252.0,
    exitPrice: 258.5,
    stopLoss: 258.0,
    targetPrice: 238.0,
    quantity: 80,
    realizedPnL: -520.0,
    pnlPercent: -2.58,
    notes: 'Respected hard stop.',
    tags: ['Respected Stop Loss'],
    executionRating: 4,
    createdAt: 1760918400000,
  },
  {
    id: 'test-4',
    symbol: 'MSFT',
    companyName: 'Microsoft Corporation',
    setupType: 'BULLISH_TRIPLE',
    timeframe: '1d',
    status: 'OPEN',
    entryDate: '2026-10-30',
    entryPrice: 422.0,
    stopLoss: 414.0,
    targetPrice: 438.0,
    quantity: 50,
    notes: 'Active setup.',
    tags: ['Active'],
    executionRating: 5,
    createdAt: 1761782400000,
  },
];

test('calculateJournalStats computes win rate and P&L metrics accurately', () => {
  const stats = calculateJournalStats(TEST_FIXTURE_ENTRIES);

  assert.equal(stats.totalTrades, 4);
  assert.equal(stats.openTrades, 1);
  assert.equal(stats.closedTrades, 3);
  assert.equal(stats.winningTrades, 2);
  assert.equal(stats.losingTrades, 1);
  assert.equal(stats.winRatePct, 66.7);
  assert.equal(stats.totalRealizedPnL, 2485.0);
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
  const csv = exportJournalToCSV(TEST_FIXTURE_ENTRIES);
  const lines = csv.split('\r\n');

  assert.ok(lines.length >= 5, 'Should contain header + 4 rows');
  const header = lines[0];
  assert.ok(header.includes('"Trade ID"'));
  assert.ok(header.includes('"Symbol"'));
  assert.ok(header.includes('"Realized P&L ($)"'));
  assert.ok(header.includes('"Risk/Reward Ratio"'));
  assert.ok(header.includes('"Performance & Audit Notes"'));

  const nvdaRow = lines.find((l) => l.includes('"NVDA"'));
  assert.ok(nvdaRow, 'NVDA row should exist');
  assert.ok(nvdaRow?.includes('"NVIDIA Corporation"'));
  assert.ok(nvdaRow?.includes('"BULLISH_TRIPLE"'));
  assert.ok(nvdaRow?.includes('"2055.00"'));
  assert.ok(nvdaRow?.includes('"11.00%"'));

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
