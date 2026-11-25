import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initDefaultActiveMemory,
  ingestTradeEpisode,
  queryMemoryForSetup,
  exportActiveMemoryJSON,
  generateTradeReflection,
  recomputeRegimeMatrix,
  syncClosedJournalEntriesToActiveMemory,
} from './activeLearningEngine.ts';
import { buildEntryMarketContextFromReport } from './entryMarketContext.ts';
import type { MarketHealthReport } from './marketHealthEngine.ts';
import type { JournalEntry } from './tradeJournal.ts';

function makeTestMarketHealth(overrides?: {
  score?: number;
  label?: MarketHealthReport['current']['label'];
  safetyStatus?: MarketHealthReport['current']['safetyStatus'];
  allowNewEntries?: boolean;
  vix?: number;
  vixTermStructure?: MarketHealthReport['current']['vixTermStructure'];
}): MarketHealthReport {
  const score = overrides?.score ?? 54;
  const label = overrides?.label ?? 'Neutral';
  const safetyStatus = overrides?.safetyStatus ?? 'SAFE_RISK_ON';
  const allowNewEntries = overrides?.allowNewEntries ?? true;
  const vix = overrides?.vix ?? 17.5;
  const vixTermStructure = overrides?.vixTermStructure ?? 'CONTANGO';
  return {
    isLive: true,
    asOf: '2026-11-22',
    dataSource: 'Test',
    universeCount: 14,
    current: {
      score,
      label,
      safetyStatus,
      allowNewEntries,
      sizeMultiplier: safetyStatus === 'CRASH_DEFENSE' ? 0 : safetyStatus === 'CAUTIOUS' ? 0.5 : 1,
      vix,
      vix3m: vixTermStructure === 'BACKWARDATION' ? vix - 2 : vix + 2,
      vixTermStructure,
      spyPrice: 590,
      spyChangePct: 0.2,
      spy5dReturnPct: 0.9,
      netVolumeTodayBillions: 1.5,
      buyingVolumeTodayBillions: 14,
      sellingVolumeTodayBillions: 12.5,
      netVolume1MBillions: 4.5,
      buyingVolume1MBillions: 110,
      sellingVolume1MBillions: 105.5,
      buySellRatio1M: 1.04,
      breadthPct: 58,
      momentumScore: score,
      vixScore: score,
      volumeScore: score,
      breadthScore: score,
      reasons: ['Test regime'],
    },
    snapshots: {
      now: { date: '2026-11-22', score, label, vix, netFlowBillions: 1.5 },
      previousClose: null,
      oneWeekAgo: null,
      oneMonthAgo: null,
      oneYearAgo: null,
    },
    history1M: [],
    history1YCount: 252,
  };
}

test('initDefaultActiveMemory creates clean neutral baseline with zero fake seed episodes', () => {
  const memory = initDefaultActiveMemory();

  assert.equal(typeof memory.version, 'string');
  assert.equal(memory.episodes.length, 0);
  assert.equal(memory.learnedRules.length, 0);
  assert.equal(memory.setupWeights['BULLISH TRIPLE'].currentWeightMultiplier, 1.0);
  assert.equal(memory.setupWeights['BEARISH TRIPLE'].currentWeightMultiplier, 1.0);
  assert.equal(memory.calibratedMinQualityScore, 70);
  assert.equal(memory.calibratedAtrStopMultiple, 1.25);
});

test('generateTradeReflection creates constructive critique for wins and losses', () => {
  const winReflect = generateTradeReflection(
    'NVDA',
    'BULLISH TRIPLE',
    'BULLISH',
    150.0,
    8.5,
    82,
    2.5,
    'Target 2 reached'
  );
  assert.ok(winReflect.deltaWeight > 0);
  assert.ok(winReflect.critique.includes('positive expectancy'));
  assert.ok(winReflect.rule.includes('BULLISH TRIPLE'));

  const lossReflect = generateTradeReflection(
    'TSLA',
    'BEARISH TRIPLE',
    'BEARISH',
    -300.0,
    -3.2,
    68,
    4.2,
    'STOP LOSS TRIGGERED'
  );
  assert.ok(lossReflect.deltaWeight < 0);
  assert.ok(lossReflect.critique.includes('loss'));
  assert.ok(lossReflect.rule.includes('Throttle'));
});

test('ingesting a winning trade adapts setup multiplier upward and stores episode', () => {
  const initial = initDefaultActiveMemory();
  const prevMultiplier = initial.setupWeights['BULLISH TRIPLE'].currentWeightMultiplier;

  const { updatedState, newEpisode } = ingestTradeEpisode(initial, {
    symbol: 'AMD',
    setupType: 'BULLISH TRIPLE',
    direction: 'BULLISH',
    entryPrice: 150.0,
    exitPrice: 162.0,
    pnl: 240.0,
    pnlPercent: 8.0,
    qualityScore: 85,
    atrPercent: 2.2,
    exitReason: 'Target 2 reached',
  });

  assert.equal(updatedState.episodes.length, 1);
  assert.equal(newEpisode.outcome, 'WIN');
  assert.ok(updatedState.setupWeights['BULLISH TRIPLE'].currentWeightMultiplier > prevMultiplier);
  assert.equal(updatedState.episodes[0].symbol, 'AMD');
});

test('ingesting a losing trade throttles multiplier and elevates quality threshold', () => {
  const initial = initDefaultActiveMemory();
  const prevMinQuality = initial.calibratedMinQualityScore;
  const prevAtrStop = initial.calibratedAtrStopMultiple;

  const { updatedState, newEpisode } = ingestTradeEpisode(initial, {
    symbol: 'COIN',
    setupType: 'BULLISH DOUBLE',
    direction: 'BULLISH',
    entryPrice: 200.0,
    exitPrice: 190.0,
    pnl: -100.0,
    pnlPercent: -5.0,
    qualityScore: 65,
    atrPercent: 3.8,
    exitReason: 'STOP LOSS TRIGGERED',
  });

  assert.equal(newEpisode.outcome, 'LOSS');
  assert.ok(updatedState.calibratedMinQualityScore >= prevMinQuality);
  assert.ok(updatedState.calibratedAtrStopMultiple >= prevAtrStop);
});

test('queryMemoryForSetup gates low-quality candidates and boosts winning history setups', () => {
  let memory = initDefaultActiveMemory();
  memory = ingestTradeEpisode(memory, {
    symbol: 'NVDA',
    setupType: 'BULLISH TRIPLE',
    direction: 'BULLISH',
    entryPrice: 120,
    exitPrice: 132,
    pnl: 200,
    pnlPercent: 10,
    qualityScore: 85,
    atrPercent: 2.4,
    exitReason: 'TP2',
  }).updatedState;

  const lowQualityQuery = queryMemoryForSetup(memory, 'XYZ', 'BULLISH TRIPLE', 60);
  assert.equal(lowQualityQuery.isApproved, false);
  assert.ok(lowQualityQuery.auditRationale.includes('below adaptive threshold'));

  const highQualityQuery = queryMemoryForSetup(memory, 'NVDA', 'BULLISH TRIPLE', 85);
  assert.equal(highQualityQuery.isApproved, true);
  assert.ok(highQualityQuery.sizingMultiplier > 1.0);
  assert.ok(highQualityQuery.matchingEpisodes.length > 0);
});

test('exportActiveMemoryJSON outputs valid parseable JSON', () => {
  const memory = initDefaultActiveMemory();
  const jsonStr = exportActiveMemoryJSON(memory);
  const parsed = JSON.parse(jsonStr);
  assert.equal(parsed.version, '2.0.0');
  assert.ok(Array.isArray(parsed.episodes));
});

test('recomputeRegimeMatrix applies Empirical Bayes shrinkage (prior K=8), separates EQUITY/OPTIONS, and enforces sampleSufficient at n>=10', () => {
  let memory = initDefaultActiveMemory();
  const fearReport = makeTestMarketHealth({ score: 36, label: 'Fear', safetyStatus: 'CAUTIOUS', vix: 24.5 });
  const neutralReport = makeTestMarketHealth({ score: 55, label: 'Neutral', safetyStatus: 'SAFE_RISK_ON', vix: 17.0 });
  const fearCtx = buildEntryMarketContextFromReport(fearReport, { initialRiskDollars: 100, assetMode: 'EQUITY' });
  const neutralCtx = buildEntryMarketContextFromReport(neutralReport, { initialRiskDollars: 100, assetMode: 'EQUITY' });
  const optCtx = buildEntryMarketContextFromReport(fearReport, { initialRiskDollars: 100, assetMode: 'OPTIONS' });

  // 1 tiny sample in Neutral -> shrinkage K=8 must pull multiplier tightly near 1.00x (not extreme)
  memory = ingestTradeEpisode(memory, {
    symbol: 'MSFT',
    setupType: 'BULLISH TRIPLE',
    direction: 'BULLISH',
    assetMode: 'EQUITY',
    entryPrice: 400,
    exitPrice: 420,
    pnl: 250,
    pnlPercent: 5,
    qualityScore: 84,
    atrPercent: 2.0,
    exitReason: 'TP2',
    entryMarketContext: neutralCtx,
    initialRiskDollars: 100,
  }).updatedState;

  const tinyNeutral = memory.regimeStats?.['EQUITY|SENT|Neutral'];
  assert.ok(tinyNeutral);
  assert.equal(tinyNeutral.tradesCount, 1);
  assert.equal(tinyNeutral.sampleSufficient, false);
  assert.ok(tinyNeutral.shrunkMultiplier > 1.0 && tinyNeutral.shrunkMultiplier < 1.12, `Expected gentle shrinkage near 1.0x, got ${tinyNeutral.shrunkMultiplier}`);

  // 12 losing Equity trades in Fear -> crosses n>=10, throttles multiplier & raises quality gate
  for (let i = 0; i < 12; i++) {
    memory = ingestTradeEpisode(memory, {
      symbol: `SYM${i}`,
      setupType: 'BULLISH TRIPLE',
      direction: 'BULLISH',
      assetMode: 'EQUITY',
      entryPrice: 100,
      exitPrice: 95,
      pnl: -120,
      pnlPercent: -5,
      qualityScore: 74,
      atrPercent: 2.5,
      exitReason: 'STOP LOSS',
      entryMarketContext: fearCtx,
      initialRiskDollars: 100,
    }).updatedState;
  }

  // Also add 2 winning OPTIONS episodes in Fear -> must stay isolated from EQUITY Fear bucket
  for (let i = 0; i < 2; i++) {
    memory = ingestTradeEpisode(memory, {
      symbol: 'SPY',
      setupType: 'CSP WHEEL',
      direction: 'BULLISH',
      assetMode: 'OPTIONS',
      entryPrice: 2.5,
      exitPrice: 0.5,
      pnl: 200,
      pnlPercent: 80,
      qualityScore: 85,
      atrPercent: 2.0,
      exitReason: 'TP',
      entryMarketContext: optCtx,
      initialRiskDollars: 100,
    }).updatedState;
  }

  const eqFear = memory.regimeStats?.['EQUITY|SENT|Fear'];
  const optFear = memory.regimeStats?.['OPTIONS|SENT|Fear'];
  assert.ok(eqFear && optFear);
  assert.equal(eqFear.tradesCount, 12);
  assert.equal(eqFear.sampleSufficient, true);
  assert.ok(eqFear.shrunkMultiplier < 0.85);
  assert.ok(eqFear.recommendedMinQualityDelta > 0);
  assert.equal(optFear.tradesCount, 2);
  assert.ok(optFear.shrunkMultiplier > 1.0);

  // Querying in Fear must elevate effectiveMinQualityScore, while CRASH_DEFENSE remains an unbreakable hard veto
  const fearQuery = queryMemoryForSetup(memory, 'AAPL', 'BULLISH TRIPLE', 75, fearReport, { assetMode: 'EQUITY' });
  assert.ok(fearQuery.effectiveMinQualityScore > 75);
  assert.equal(fearQuery.isApproved, false);

  const crashReport = makeTestMarketHealth({
    score: 20,
    label: 'Extreme Fear',
    safetyStatus: 'CRASH_DEFENSE',
    allowNewEntries: false,
    vix: 32,
    vixTermStructure: 'BACKWARDATION',
  });
  const crashQuery = queryMemoryForSetup(memory, 'NVDA', 'BULLISH TRIPLE', 99, crashReport, { assetMode: 'EQUITY' });
  assert.equal(crashQuery.isApproved, false);
  assert.equal(crashQuery.regimeBreakdown?.crashDefenseOverrideBlocked, true);

  // Direct pure call filtering by assetMode
  const eqOnly = recomputeRegimeMatrix(memory.episodes, { assetMode: 'EQUITY' });
  assert.equal(Object.values(eqOnly).every((r) => r.assetMode === 'EQUITY'), true);
});

test('syncClosedJournalEntriesToActiveMemory deduplicates by sourceLotId and attaches 1M MarketHealth backfill', () => {
  const memory = initDefaultActiveMemory();
  const report = makeTestMarketHealth({ score: 62, label: 'Greed', safetyStatus: 'SAFE_RISK_ON', vix: 15.2 });
  report.history1M = [
    {
      date: '2026-11-18',
      sentimentScore: 39,
      label: 'Fear',
      vix: 23.4,
      vix3m: 24.0,
      vixTermRatio: 1.03,
      spyClose: 582,
      spyChangePct: -0.6,
      buyingVolumeBillions: 11,
      sellingVolumeBillions: 13,
      netFlowBillions: -2.0,
      netFlowRatioPct: -8.3,
      breadthPct: 42,
      momentumScore: 38,
      vixScore: 40,
      volumeScore: 41,
      breadthScore: 42,
    },
  ];

  const entries: JournalEntry[] = [
    {
      id: 'alpaca_lot_ord-101',
      symbol: 'AAPL',
      setupType: 'BULLISH_TRIPLE',
      timeframe: '1d',
      status: 'CLOSED_WIN',
      entryDate: '2026-11-18',
      exitDate: '2026-11-21',
      entryPrice: 220,
      exitPrice: 232,
      stopLoss: 214,
      targetPrice: 232,
      quantity: 10,
      realizedPnL: 120,
      pnlPercent: 5.45,
      notes: 'Closed target hit',
      tags: ['Alpaca Paper', 'Alpaca Equity', 'alpaca-order:ord-101'],
      executionRating: 5,
      createdAt: 1000,
    },
    {
      id: 'alpaca_lot_open-102',
      symbol: 'NVDA',
      setupType: 'BULLISH_TRIPLE',
      timeframe: '1d',
      status: 'OPEN',
      entryDate: '2026-11-21',
      entryPrice: 140,
      stopLoss: 134,
      targetPrice: 152,
      quantity: 5,
      notes: 'Open',
      tags: ['Alpaca Paper', 'Alpaca Equity'],
      executionRating: 4,
      createdAt: 2000,
    },
  ];

  const first = syncClosedJournalEntriesToActiveMemory(memory, entries, report);
  assert.equal(first.ingestedCount, 1);
  assert.equal(first.updatedState.episodes.length, 1);
  assert.equal(first.updatedState.episodes[0].entryMarketContext?.sentimentLabel, 'Fear');
  assert.equal(first.updatedState.episodes[0].realizedR, 2); // $120 / ($6 * 10 = $60) = 2.0R

  // Second run must ingest 0 duplicates
  const second = syncClosedJournalEntriesToActiveMemory(first.updatedState, entries, report);
  assert.equal(second.ingestedCount, 0);
  assert.equal(second.updatedState.episodes.length, 1);
});
