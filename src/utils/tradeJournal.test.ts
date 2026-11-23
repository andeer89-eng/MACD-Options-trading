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

import {
  mergeJournalEntries,
  purgeLegacySeededDemoEntries,
  loadJournalEntries,
} from './tradeJournal.ts';

test('mergeJournalEntries unions remote entries with unseen local entries without data loss', () => {
  const localOnly: JournalEntry = {
    ...TEST_FIXTURE_ENTRIES[3],
    id: 'local-only-99',
    symbol: 'META',
  };
  const merged = mergeJournalEntries([TEST_FIXTURE_ENTRIES[0], localOnly], [
    { ...TEST_FIXTURE_ENTRIES[0], notes: 'Updated in cloud' },
    TEST_FIXTURE_ENTRIES[1],
  ]);

  assert.equal(merged.length, 3);
  assert.ok(merged.some((e) => e.id === 'local-only-99'), 'Local-only entry must be preserved');
  assert.equal(merged.find((e) => e.id === 'test-1')?.notes, 'Updated in cloud', 'Remote record wins for matching IDs');
  assert.ok(merged.some((e) => e.id === 'test-2'), 'Remote-only entry is included');
});

test('purgeLegacySeededDemoEntries removes pre-seeded Oct 2026 demo records while preserving Alpaca Paper and genuine manual trades', () => {
  const realAlpacaEntry: JournalEntry = {
    id: 'alpaca_lot_ord-mmm-1',
    symbol: 'MMM',
    setupType: 'BULLISH_TRIPLE',
    timeframe: '1d',
    status: 'OPEN',
    entryDate: '2026-11-20',
    entryPrice: 179.9,
    stopLoss: 172.7,
    targetPrice: 194.29,
    quantity: 2,
    notes: 'Alpaca Paper LONG 2 sh MMM',
    tags: ['Alpaca Paper', 'Alpaca Equity', 'alpaca-order:ord-mmm-1'],
    executionRating: 4,
    epochId: 'alpaca-paper',
    createdAt: 1763640000000,
  };
  const genuineManualEntry: JournalEntry = {
    id: 'journal-user-1',
    symbol: 'NVDA',
    setupType: 'BULLISH_TRIPLE',
    timeframe: '1d',
    status: 'CLOSED_WIN',
    entryDate: '2026-11-18',
    exitDate: '2026-11-20',
    entryPrice: 141.25,
    exitPrice: 149.8,
    stopLoss: 136.0,
    targetPrice: 150.0,
    quantity: 25,
    realizedPnL: 213.75,
    notes: 'Real user manual trade',
    tags: ['Manual'],
    executionRating: 5,
    createdAt: 1763500000000,
  };

  const { cleaned, removedIds } = purgeLegacySeededDemoEntries([
    ...TEST_FIXTURE_ENTRIES,
    realAlpacaEntry,
    genuineManualEntry,
  ]);

  assert.equal(removedIds.length, 4);
  assert.equal(cleaned.length, 2);
  assert.ok(cleaned.some((e) => e.id === 'alpaca_lot_ord-mmm-1'));
  assert.ok(cleaned.some((e) => e.id === 'journal-user-1'));

  // Verify loadJournalEntries cleans persisted localStorage automatically
  const store = new Map<string, string>();
  const prevWindow = (globalThis as any).window;
  const prevStorage = (globalThis as any).localStorage;
  try {
    const mockStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    };
    (globalThis as any).window = { localStorage: mockStorage };
    (globalThis as any).localStorage = mockStorage;
    store.set(
      'trullas_trade_journal_v1',
      JSON.stringify([...TEST_FIXTURE_ENTRIES, realAlpacaEntry])
    );
    const loaded = loadJournalEntries();
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0].symbol, 'MMM');
    const persistedAfterLoad = JSON.parse(store.get('trullas_trade_journal_v1') || '[]');
    assert.equal(persistedAfterLoad.length, 1);
  } finally {
    (globalThis as any).window = prevWindow;
    (globalThis as any).localStorage = prevStorage;
  }
});
