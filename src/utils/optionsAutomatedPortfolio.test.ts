import { test } from 'node:test';
import assert from 'node:assert';
import {
  initDefaultOptionsPortfolio,
  calculateOptionsStats,
  processOptionsAutonomousCycle,
  manualCloseOptionsPosition,
  exportOptionsLogsToCSV,
  relearnOptionsMemoryFromHistory,
  loadOptionsPortfolio,
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

test('processOptionsAutonomousCycle does not mutate input account arrays and issues unique IDs on same-tick multi-exit', () => {
  const base = initDefaultOptionsPortfolio(2000);
  const sharedExpiringPos = (ticker: string, contract: string, strike: number) => ({
    id: `opt-pos-${ticker}-1`,
    ticker,
    contract,
    boughtSold: 'Sold' as const,
    optionType: 'PUT' as const,
    strike,
    entryDate: '2026-11-10',
    expirationDateStr: '2026-11-17',
    expirationLabel: 'Tuesday, November 17, 2026',
    dteDaysRemaining: 1, // Decays to 0 DTE in cycle -> triggers simultaneous expiry
    contractsCount: 1,
    entryPremiumPerContract: 2.5,
    currentPremiumPerContract: 1.0,
    totalPremiumCollected: 12.5,
    underlyingPriceAtEntry: strike + 200,
    underlyingCurrentPrice: strike + 250,
    strikeDistancePercent: 4.0,
    delta: -0.09,
    gamma: 0.001,
    dailyTheta: 1.5,
    vega: -0.5,
    ivRankPercent: 18,
    unrealizedPnL: 7.5,
    unrealizedPnLPercent: 60,
    profitTargetPercent: 75,
    status: 'Open' as const,
    tradingWarzPattern: 'Inside Bar',
    goldenZoneSupportLevel: strike + 40,
    setupGrade: 'A+' as const,
    whyOpenedThesis: 'Test position',
  });

  const inputAccount = {
    ...base,
    positions: [
      sharedExpiringPos('MES', 'MES 17NOV26 6700 P', 6700),
      sharedExpiringPos('SPY', 'SPY 17NOV26 570 P', 570),
    ],
  };

  const originalHistoryRef = inputAccount.tradeHistory;
  const originalEpisodesRef = inputAccount.activeMemory.episodes;

  const { updatedAccount } = processOptionsAutonomousCycle(
    inputAccount,
    [
      { symbol: 'MES', currentPrice: 6950 },
      { symbol: 'SPY', currentPrice: 595 },
    ],
    true
  );

  // Input arrays must remain completely untouched
  assert.strictEqual(originalHistoryRef.length, 0);
  assert.strictEqual(originalEpisodesRef.length, 0);

  // Both positions closed cleanly with strictly unique IDs across history, episodes, and logs
  assert.strictEqual(updatedAccount.tradeHistory.length, 2);
  const tradeIds = new Set(updatedAccount.tradeHistory.map((t) => t.id));
  assert.strictEqual(tradeIds.size, 2, 'Closed trade IDs must be strictly unique');

  const episodeIds = new Set(updatedAccount.activeMemory.episodes.map((e) => e.id));
  assert.strictEqual(episodeIds.size, 2, 'Active memory episode IDs must be strictly unique');

  const logIds = new Set(updatedAccount.sessionLogs.map((l) => l.id));
  assert.strictEqual(logIds.size, updatedAccount.sessionLogs.length, 'Session log IDs must be strictly unique');
});

test('loadOptionsPortfolio repairs persisted duplicate IDs (e.g. rich-opt-live-1794587680533) in localStorage', () => {
  const storageMap = new Map<string, string>();
  const prevWindow = (globalThis as any).window;
  (globalThis as any).window = {
    localStorage: {
      getItem: (k: string) => storageMap.get(k) ?? null,
      setItem: (k: string, v: string) => {
        storageMap.set(k, v);
      },
    },
  };

  try {
    const seed = initDefaultOptionsPortfolio(2000);
    const dupId = 'rich-opt-live-1794587680533';
    seed.tradeHistory = [
      {
        id: dupId,
        date: '2026-11-18',
        ticker: 'MES',
        boughtSold: 'Sold',
        contract: 'MES 18NOV26 6700 P',
        strike: 6700,
        optionType: 'PUT',
        expiration: 'Nov 18, 2026',
        expirationDateStr: '2026-11-18',
        profitDollars: 24.5,
        profitPercent: 80,
        status: 'Closed',
        outcomeReason: 'Early Take-Profit',
        underlyingPriceAtEntry: 6900,
        strikeDistancePercent: 2.9,
        delta: 0.1,
        thetaPerDay: 1.8,
        tradingWarzPattern: 'INSIDE_BAR',
        goldenZoneSupportLevel: 6740,
        whyOpenedThesis: 'Trade 1',
      },
      {
        id: dupId,
        date: '2026-11-18',
        ticker: 'SPY',
        boughtSold: 'Sold',
        contract: 'SPY 18NOV26 570 P',
        strike: 570,
        optionType: 'PUT',
        expiration: 'Nov 18, 2026',
        expirationDateStr: '2026-11-18',
        profitDollars: 18.0,
        profitPercent: 76,
        status: 'Closed',
        outcomeReason: 'Early Take-Profit',
        underlyingPriceAtEntry: 590,
        strikeDistancePercent: 3.4,
        delta: 0.11,
        thetaPerDay: 1.2,
        tradingWarzPattern: 'HOLY_GRAIL_OBIB',
        goldenZoneSupportLevel: 575,
        whyOpenedThesis: 'Trade 2',
      },
    ];
    storageMap.set('rich_sp500_options_portfolio_v1', JSON.stringify(seed));

    const loaded = loadOptionsPortfolio();
    assert.strictEqual(loaded.tradeHistory.length, 2, 'All trades preserved after repair');
    const uniqueIds = new Set(loaded.tradeHistory.map((t) => t.id));
    assert.strictEqual(uniqueIds.size, 2, 'Duplicate IDs must be repaired to unique values on load');

    // Persisted JSON should also be repaired
    const savedRaw = storageMap.get('rich_sp500_options_portfolio_v1');
    assert.ok(savedRaw);
    const savedParsed = JSON.parse(savedRaw);
    assert.strictEqual(new Set(savedParsed.tradeHistory.map((t: any) => t.id)).size, 2);
  } finally {
    (globalThis as any).window = prevWindow;
  }
});

