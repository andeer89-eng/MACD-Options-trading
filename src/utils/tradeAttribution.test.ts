import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeBacktestRuleAttribution,
  computeJournalRegimeAttribution,
  computeJournalRuleAttribution,
} from './tradeAttribution';
import { runBacktest } from './backtestEngine';
import type { Candle } from './trullasStrategy';
import type { JournalEntry } from './tradeJournal';
import type { MarketHealthReport } from './marketHealthEngine';

function generateOscillatingCandles(count: number = 180): Candle[] {
  const candles: Candle[] = [];
  const baseTs = Date.UTC(2025, 0, 1);
  for (let i = 0; i < count; i++) {
    const wave = Math.sin(i / 6) * 10;
    const trend = i * 0.18;
    const close = 140 + wave + trend;
    candles.push({
      timestamp: baseTs + i * 86400000,
      dateStr: new Date(baseTs + i * 86400000).toISOString().split('T')[0],
      open: Number((close - 0.6).toFixed(2)),
      high: Number((close + 2.1).toFixed(2)),
      low: Number((close - 2.0).toFixed(2)),
      close: Number(close.toFixed(2)),
      volume: 2_500_000 + (i % 5) * 200_000,
    });
  }
  return candles;
}

describe('Trade Attribution & Execution Cost Drag Tests', () => {
  it('computeBacktestRuleAttribution aggregates wins, expectancy, fee drag, and enforces n >= 10 sampleSufficient', () => {
    const rows = computeBacktestRuleAttribution([
      {
        status: 'win',
        setupType: 'BULLISH_TRIPLE',
        rulesFired: ['BULLISH_TRIPLE', 'MACD_DIV', 'VOL_EXHAUST'],
        grossPnl: 220,
        feeAndSlippageDollars: 10,
        netPnl: 210,
        realizedR: 1.8,
      },
      {
        status: 'loss',
        setupType: 'BULLISH_TRIPLE',
        rulesFired: ['BULLISH_TRIPLE', 'MACD_DIV'],
        grossPnl: -90,
        feeAndSlippageDollars: 10,
        netPnl: -100,
        realizedR: -1.0,
      },
      {
        status: 'open',
        setupType: 'BEARISH_DOUBLE',
        rulesFired: ['BEARISH_DOUBLE'],
        grossPnl: 500,
        feeAndSlippageDollars: 5,
        netPnl: 495,
        realizedR: 2.0,
      },
    ]);

    const bullRow = rows.find((r) => r.rule === 'BULLISH_TRIPLE');
    assert.ok(bullRow);
    assert.equal(bullRow.trades, 2);
    assert.equal(bullRow.wins, 1);
    assert.equal(bullRow.losses, 1);
    assert.equal(bullRow.winRatePct, 50);
    assert.equal(bullRow.grossPnl, 130);
    assert.equal(bullRow.feeDragDollars, 20);
    assert.equal(bullRow.netPnl, 110);
    assert.equal(bullRow.expectancyDollars, 55);
    assert.equal(bullRow.avgRealizedR, 0.4);
    assert.equal(bullRow.sampleSufficient, false);

    // Open trades must never leak into closed attribution
    assert.equal(rows.find((r) => r.rule === 'BEARISH_DOUBLE'), undefined);
  });

  it('computeJournalRuleAttribution aggregates closed journal setups and average MFE/MAE', () => {
    const entries: JournalEntry[] = [
      {
        id: 'j1',
        symbol: 'AAPL',
        setupType: 'BULLISH_TRIPLE',
        timeframe: '1d',
        status: 'CLOSED_WIN',
        entryDate: '2026-09-01',
        exitDate: '2026-09-10',
        entryPrice: 200,
        exitPrice: 212,
        stopLoss: 194,
        targetPrice: 212,
        quantity: 10,
        realizedPnL: 120,
        pnlPercent: 6,
        maxFavorableExcursionPct: 7.5,
        drawdownFromPeakPct: -1.2,
        notes: '',
        tags: [],
        executionRating: 5,
        createdAt: 1,
      },
      {
        id: 'j2',
        symbol: 'NVDA',
        setupType: 'BULLISH_TRIPLE',
        timeframe: '1d',
        status: 'CLOSED_LOSS',
        entryDate: '2026-09-15',
        exitDate: '2026-09-20',
        entryPrice: 120,
        exitPrice: 115,
        stopLoss: 115,
        targetPrice: 130,
        quantity: 20,
        realizedPnL: -100,
        pnlPercent: -4.17,
        maxFavorableExcursionPct: 1.5,
        drawdownFromPeakPct: -4.4,
        notes: '',
        tags: [],
        executionRating: 3,
        createdAt: 2,
      },
      {
        id: 'j3',
        symbol: 'MSFT',
        setupType: 'BREAKOUT',
        timeframe: '1d',
        status: 'OPEN',
        entryDate: '2026-10-01',
        entryPrice: 400,
        stopLoss: 390,
        targetPrice: 420,
        quantity: 5,
        notes: '',
        tags: [],
        executionRating: 4,
        createdAt: 3,
      },
    ];

    const summary = computeJournalRuleAttribution(entries);
    assert.equal(summary.closedTrades, 2);
    assert.equal(summary.wins, 1);
    assert.equal(summary.losses, 1);
    assert.equal(summary.winRatePct, 50);
    assert.equal(summary.totalNetPnl, 20);
    assert.equal(summary.avgMfePct, 4.5);
    assert.equal(summary.avgMaePct, 2.8);
    assert.equal(summary.bySetup.length, 1);
    assert.equal(summary.bySetup[0].rule, 'BULLISH_TRIPLE');
    assert.equal(summary.bySetup[0].avgRealizedR, 0.5);
  });

  it('computeJournalRegimeAttribution attributes closed entries by stored context & history1M backfill', () => {
    const marketHealth: MarketHealthReport = {
      isLive: true,
      asOf: '2026-11-22',
      dataSource: 'Test',
      universeCount: 14,
      current: {
        score: 54,
        label: 'Neutral',
        safetyStatus: 'SAFE_RISK_ON',
        allowNewEntries: true,
        sizeMultiplier: 1,
        vix: 17.2,
        vix3m: 19.0,
        vixTermStructure: 'CONTANGO',
        spyPrice: 590,
        spyChangePct: 0.2,
        spy5dReturnPct: 1.0,
        netVolumeTodayBillions: 1.2,
        buyingVolumeTodayBillions: 14,
        sellingVolumeTodayBillions: 12.8,
        netVolume1MBillions: 5,
        buyingVolume1MBillions: 110,
        sellingVolume1MBillions: 105,
        buySellRatio1M: 1.05,
        breadthPct: 60,
        momentumScore: 55,
        vixScore: 58,
        volumeScore: 52,
        breadthScore: 56,
        reasons: ['Neutral'],
      },
      snapshots: {
        now: { date: '2026-11-22', score: 54, label: 'Neutral', vix: 17.2, netFlowBillions: 1.2 },
        previousClose: null,
        oneWeekAgo: null,
        oneMonthAgo: null,
        oneYearAgo: null,
      },
      history1M: [
        {
          date: '2026-11-10',
          sentimentScore: 38,
          label: 'Fear',
          vix: 23.5,
          vix3m: 24.1,
          vixTermRatio: 1.03,
          spyClose: 575,
          spyChangePct: -0.9,
          buyingVolumeBillions: 10,
          sellingVolumeBillions: 13,
          netFlowBillions: -3.0,
          netFlowRatioPct: -13,
          breadthPct: 38,
          momentumScore: 36,
          vixScore: 40,
          volumeScore: 39,
          breadthScore: 38,
        },
      ],
      history1YCount: 252,
    };

    const entries: JournalEntry[] = [
      {
        id: 'r1',
        symbol: 'AAPL',
        setupType: 'BULLISH_TRIPLE',
        timeframe: '1d',
        status: 'CLOSED_WIN',
        entryDate: '2026-11-10',
        exitDate: '2026-11-14',
        entryPrice: 220,
        exitPrice: 232,
        stopLoss: 214,
        targetPrice: 232,
        quantity: 10,
        realizedPnL: 120,
        pnlPercent: 5.45,
        notes: '',
        tags: [],
        executionRating: 5,
        createdAt: 1,
      },
      {
        id: 'r2',
        symbol: 'NVDA',
        setupType: 'BULLISH_TRIPLE',
        timeframe: '1d',
        status: 'CLOSED_LOSS',
        entryDate: '2026-11-22',
        exitDate: '2026-11-23',
        entryPrice: 140,
        exitPrice: 135,
        stopLoss: 135,
        targetPrice: 150,
        quantity: 20,
        realizedPnL: -100,
        pnlPercent: -3.57,
        notes: '',
        tags: [],
        executionRating: 3,
        entryMarketContext: {
          capturedAt: '2026-11-22T14:30:00Z',
          entryDate: '2026-11-22',
          source: 'LIVE_ORDER',
          healthScore: 68,
          sentimentLabel: 'Greed',
          safetyStatus: 'SAFE_RISK_ON',
          vix: 14.8,
          vixBucket: 'LOW_VIX_<16',
          vixTermStructure: 'CONTANGO',
          netVolume1MBillions: 12.0,
          buySellRatio1M: 1.15,
          breadthPct: 75,
          spyStructuralRegime: 'ABOVE_VALUE_TREND',
          qqqStructuralRegime: 'ABOVE_VALUE_TREND',
          symbolStructuralRegime: null,
          initialRiskDollars: 100,
          assetMode: 'EQUITY',
        },
        createdAt: 2,
      },
    ];

    const rows = computeJournalRegimeAttribution(entries, marketHealth);
    const fearRow = rows.find((r) => r.regime === 'Fear');
    const greedRow = rows.find((r) => r.regime === 'Greed');
    assert.ok(fearRow);
    assert.ok(greedRow);
    assert.equal(fearRow.trades, 1);
    assert.equal(fearRow.avgVix, 23.5);
    assert.equal(fearRow.avgRealizedR, 2.0);
    assert.equal(fearRow.sampleSufficient, false);
    assert.equal(greedRow.trades, 1);
    assert.equal(greedRow.avgVix, 14.8);
    assert.equal(greedRow.avgRealizedR, -1.0);
  });

  it('runBacktest produces consistent grossPnl - feeAndSlippageDollars === netPnl and populates ruleAttribution', () => {
    const candles = generateOscillatingCandles(180);
    const result = runBacktest(candles, {
      symbol: 'AAPL',
      timeframe: '1d',
      range: '1y',
      initialBalance: 10000,
      riskPerTradePct: 1.5,
      targetMode: 'tranches',
      minQualityScore: 50,
    });

    assert.ok(Array.isArray(result.ruleAttribution));
    assert.ok(typeof result.grossTotalPnl === 'number');
    assert.ok(typeof result.totalFeeDragDollars === 'number');

    for (const t of result.trades) {
      assert.ok(Array.isArray(t.rulesFired) && t.rulesFired.length >= 2);
      assert.ok(t.feeAndSlippageDollars >= 0);
      assert.ok(Math.abs(t.grossPnl - t.feeAndSlippageDollars - t.netPnl) <= 0.02);
    }
  });
});
