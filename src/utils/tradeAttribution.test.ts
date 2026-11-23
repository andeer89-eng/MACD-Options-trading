import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeBacktestRuleAttribution,
  computeJournalRuleAttribution,
} from './tradeAttribution';
import { runBacktest } from './backtestEngine';
import type { Candle } from './trullasStrategy';
import type { JournalEntry } from './tradeJournal';

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
