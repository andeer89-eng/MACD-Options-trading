import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendShadowSignalsPure,
  backfillEntryMarketContextFromHistory,
  buildEntryMarketContextFromReport,
  classifyBlockReasonCategory,
  classifyVixBucket,
  evaluateShadowSignalsWithPrices,
} from './entryMarketContext';
import type { MarketHealthReport } from './marketHealthEngine';

function makeReport(overrides?: Partial<MarketHealthReport>): MarketHealthReport {
  return {
    isLive: true,
    asOf: '2026-11-21',
    dataSource: 'Test Feed',
    universeCount: 14,
    current: {
      score: 52,
      label: 'Neutral',
      safetyStatus: 'SAFE_RISK_ON',
      allowNewEntries: true,
      sizeMultiplier: 1.0,
      vix: 17.5,
      vix3m: 19.2,
      vixTermStructure: 'CONTANGO',
      spyPrice: 595,
      spyChangePct: 0.4,
      spy5dReturnPct: 1.1,
      netVolumeTodayBillions: 1.8,
      buyingVolumeTodayBillions: 15.2,
      sellingVolumeTodayBillions: 13.4,
      netVolume1MBillions: 6.5,
      buyingVolume1MBillions: 120,
      sellingVolume1MBillions: 113.5,
      buySellRatio1M: 1.06,
      breadthPct: 64,
      momentumScore: 55,
      vixScore: 60,
      volumeScore: 52,
      breadthScore: 58,
      reasons: ['Balanced breadth'],
    },
    snapshots: {
      now: { date: '2026-11-21', score: 52, label: 'Neutral', vix: 17.5, netFlowBillions: 1.8 },
      previousClose: null,
      oneWeekAgo: null,
      oneMonthAgo: null,
      oneYearAgo: null,
    },
    history1M: [
      {
        date: '2026-11-12',
        sentimentScore: 28,
        label: 'Extreme Fear',
        vix: 29.4,
        vix3m: 27.1,
        vixTermRatio: 0.92,
        spyClose: 572,
        spyChangePct: -1.8,
        buyingVolumeBillions: 10,
        sellingVolumeBillions: 17,
        netFlowBillions: -7.0,
        netFlowRatioPct: -25.9,
        breadthPct: 24,
        momentumScore: 20,
        vixScore: 22,
        volumeScore: 30,
        breadthScore: 25,
      },
      {
        date: '2026-11-18',
        sentimentScore: 41,
        label: 'Fear',
        vix: 23.1,
        vix3m: 23.8,
        vixTermRatio: 1.03,
        spyClose: 585,
        spyChangePct: 0.3,
        buyingVolumeBillions: 13,
        sellingVolumeBillions: 12,
        netFlowBillions: 1.0,
        netFlowRatioPct: 4.0,
        breadthPct: 48,
        momentumScore: 40,
        vixScore: 42,
        volumeScore: 44,
        breadthScore: 45,
      },
      {
        date: '2026-11-24',
        sentimentScore: 76,
        label: 'Extreme Greed',
        vix: 13.0,
        vix3m: 15.2,
        vixTermRatio: 1.17,
        spyClose: 610,
        spyChangePct: 1.2,
        buyingVolumeBillions: 20,
        sellingVolumeBillions: 11,
        netFlowBillions: 9.0,
        netFlowRatioPct: 29.0,
        breadthPct: 82,
        momentumScore: 80,
        vixScore: 85,
        volumeScore: 74,
        breadthScore: 78,
      },
    ],
    history1YCount: 252,
    ...overrides,
  };
}

test('classifyVixBucket buckets VIX ranges deterministically', () => {
  assert.equal(classifyVixBucket(13.5), 'LOW_VIX_<16');
  assert.equal(classifyVixBucket(18.2), 'NORMAL_VIX_16_22');
  assert.equal(classifyVixBucket(24.7), 'ELEVATED_VIX_22_28');
  assert.equal(classifyVixBucket(32.1), 'CRISIS_VIX_>28');
  assert.equal(classifyVixBucket(null), 'UNKNOWN');
});

test('buildEntryMarketContextFromReport captures immutable order-entry metrics', () => {
  const report = makeReport();
  const ctx = buildEntryMarketContextFromReport(report, {
    entryDate: '2026-11-21',
    initialRiskDollars: 450.129,
    assetMode: 'EQUITY',
    source: 'LIVE_ORDER',
  });
  assert.ok(ctx);
  assert.equal(ctx.sentimentLabel, 'Neutral');
  assert.equal(ctx.healthScore, 52);
  assert.equal(ctx.vixBucket, 'NORMAL_VIX_16_22');
  assert.equal(ctx.vixTermStructure, 'CONTANGO');
  assert.equal(ctx.initialRiskDollars, 450.13);
  assert.equal(ctx.assetMode, 'EQUITY');
});

test('backfillEntryMarketContextFromHistory uses same day or prior session within 5d with zero look-ahead', () => {
  const report = makeReport();

  // Exact match
  const exact = backfillEntryMarketContextFromHistory('2026-11-12', report);
  assert.ok(exact);
  assert.equal(exact.sentimentLabel, 'Extreme Fear');
  assert.equal(exact.vixTermStructure, 'BACKWARDATION');
  assert.equal(exact.safetyStatus, 'CRASH_DEFENSE');

  // Weekend / next trading day (2026-11-20 is 2 days after 2026-11-18, must NOT look ahead to 2026-11-24)
  const prior = backfillEntryMarketContextFromHistory('2026-11-20', report);
  assert.ok(prior);
  assert.equal(prior.entryDate, '2026-11-18');
  assert.equal(prior.sentimentLabel, 'Fear');
  assert.equal(prior.vixTermStructure, 'CONTANGO');

  // Before earliest history or >5 days gap returns null (no look-ahead into future 2026-11-12)
  const tooEarly = backfillEntryMarketContextFromHistory('2026-11-11', report);
  assert.equal(tooEarly, null);
});

test('Shadow signal ledger classifies block reasons, deduplicates by day/category, and evaluates counterfactual verdicts', () => {
  assert.equal(classifyBlockReasonCategory('Market Health Crash Defense active'), 'CRASH_DEFENSE');
  assert.equal(classifyBlockReasonCategory('Volume Gap Guard: LVN air pocket'), 'VOLUME_GAP');
  assert.equal(classifyBlockReasonCategory('Active Memory Guard: below threshold'), 'QUALITY_GATE');
  assert.equal(classifyBlockReasonCategory('Sector Exposure Within Cap'), 'SECTOR_CAP');

  const ctx = buildEntryMarketContextFromReport(makeReport());
  const firstAppend = appendShadowSignalsPure([], [
    {
      symbol: 'NVDA',
      setupType: 'BULLISH TRIPLE',
      assetMode: 'EQUITY',
      signalPrice: 140,
      blockReason: 'Market Health Crash Defense: Health 21/100',
      entryMarketContext: ctx,
      date: '2026-11-10',
    },
    {
      symbol: 'AAPL',
      setupType: 'BULLISH TRIPLE',
      assetMode: 'EQUITY',
      signalPrice: 220,
      blockReason: 'Active Memory Guard: Quality score 71% below 75%',
      entryMarketContext: ctx,
      date: '2026-11-10',
    },
  ]);

  // Duplicate same symbol/date/category must be ignored
  const secondAppend = appendShadowSignalsPure(firstAppend, [
    {
      symbol: 'NVDA',
      setupType: 'BULLISH TRIPLE',
      assetMode: 'EQUITY',
      signalPrice: 141,
      blockReason: 'Market Health Crash Defense: Health 20/100',
      entryMarketContext: ctx,
      date: '2026-11-10',
    },
  ]);
  assert.equal(secondAppend.length, 2);

  // Move createdAt 2 days into the past so evaluation horizon >= 1d passes
  const twoDaysAgoMs = Date.UTC(2026, 10, 20, 14, 0, 0);
  const evalNowMs = Date.UTC(2026, 10, 22, 16, 0, 0);
  const aged = secondAppend.map((r) => ({ ...r, createdAt: new Date(twoDaysAgoMs).toISOString() }));

  const evaluated = evaluateShadowSignalsWithPrices(
    aged,
    { NVDA: 132.0, AAPL: 229.0 }, // NVDA fell -5.71% -> SAVED_LOSS; AAPL rose +4.09% -> MISSED_GAIN
    evalNowMs
  );

  const nvda = evaluated.find((r) => r.symbol === 'NVDA');
  const aapl = evaluated.find((r) => r.symbol === 'AAPL');
  assert.equal(nvda?.verdict, 'SAVED_LOSS');
  assert.ok((nvda?.counterfactualReturnPct ?? 0) < -5);
  assert.equal(aapl?.verdict, 'MISSED_GAIN');
  assert.ok((aapl?.counterfactualReturnPct ?? 0) > 3.5);
});
