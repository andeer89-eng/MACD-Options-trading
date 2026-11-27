import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { JournalEntry } from './tradeJournal.ts';
import {
  evaluateDrawdownCircuitBreaker,
  evaluatePreTradeDiscipline,
} from './circuitBreakerEngine.ts';

function makeClosedTrade(overrides: Partial<JournalEntry>): JournalEntry {
  return {
    id: `t-${Math.random().toString(36).slice(2, 8)}`,
    symbol: 'NVDA',
    setupType: 'BULLISH_TRIPLE',
    timeframe: '1d',
    status: 'CLOSED_LOSS',
    entryDate: '2026-11-24T15:00:00Z',
    exitDate: '2026-11-25T18:00:00Z',
    entryPrice: 100,
    exitPrice: 95,
    stopLoss: 95,
    targetPrice: 110,
    quantity: 10,
    realizedPnL: -50,
    notes: '',
    tags: [],
    executionRating: 4,
    createdAt: Date.parse('2026-11-24T15:00:00Z'),
    ...overrides,
  };
}

describe('Drawdown Circuit Breaker & Pre-Trade Discipline Gate', () => {
  it('triggers HALTED when daily, weekly, or monthly drawdown breaches limits', () => {
    const now = new Date('2026-11-25T19:00:00Z'); // 14:00 ET Nov 25 2026
    // Capital $2,000: -$45 same-day loss = 2.25% >= 2.0% limit
    const report = evaluateDrawdownCircuitBreaker(
      [makeClosedTrade({ exitDate: '2026-11-25T17:00:00Z', realizedPnL: -45 })],
      2000,
      now
    );
    assert.equal(report.status, 'HALTED');
    assert.equal(report.allowNewTrades, false);
    assert.equal(report.dailyDrawdownPct, 2.25);

    // Weekly breach (>= 5.0% = -$110 across prior day + today)
    const weeklyHalt = evaluateDrawdownCircuitBreaker(
      [
        makeClosedTrade({ exitDate: '2026-11-23T18:00:00Z', realizedPnL: -80 }),
        makeClosedTrade({ exitDate: '2026-11-24T18:00:00Z', realizedPnL: -30 }),
      ],
      2000,
      now
    );
    assert.equal(weeklyHalt.status, 'HALTED');
    assert.equal(weeklyHalt.weeklyDrawdownPct, 5.5);
  });

  it('activates 24h COOLDOWN after 2 consecutive losing trades and clears after cooldown expires', () => {
    const nowActive = new Date('2026-11-25T20:00:00Z');
    const losses = [
      makeClosedTrade({ exitDate: '2026-11-24T18:00:00Z', realizedPnL: -15 }),
      makeClosedTrade({ exitDate: '2026-11-25T14:00:00Z', realizedPnL: -15 }),
    ];
    const activeCb = evaluateDrawdownCircuitBreaker(losses, 10000, nowActive);
    assert.equal(activeCb.status, 'COOLDOWN');
    assert.equal(activeCb.cooldownActive, true);
    assert.equal(activeCb.consecutiveLosses, 2);
    assert.ok(activeCb.cooldownRemainingHours > 17);

    // After 25 hours -> cooldown expires cleanly
    const nowExpired = new Date('2026-11-26T16:00:00Z');
    const expiredCb = evaluateDrawdownCircuitBreaker(losses, 10000, nowExpired);
    assert.equal(expiredCb.cooldownActive, false);
    assert.equal(expiredCb.allowNewTrades, true);
  });

  it('evaluates Pre-Trade Discipline Gate (GO vs NO_GO)', () => {
    const okCb = evaluateDrawdownCircuitBreaker([], 10000, new Date('2026-11-25T16:00:00Z'));
    const go = evaluatePreTradeDiscipline({
      direction: 'long',
      entryPrice: 100,
      stopPrice: 95,
      targetPrice: 112,
      plannedRiskUsd: 100,
      maxRiskBudgetUsd: 100,
      regimeName: 'Risk-on',
      circuitBreaker: okCb,
    });
    assert.equal(go.verdict, 'GO');
    assert.equal(go.passedCount, 5);

    const noGo = evaluatePreTradeDiscipline({
      direction: 'long',
      entryPrice: 100,
      stopPrice: 105, // invalid stop on wrong side
      targetPrice: 112,
      plannedRiskUsd: 100,
      maxRiskBudgetUsd: 100,
      regimeName: 'Risk-off',
      circuitBreaker: okCb,
    });
    assert.equal(noGo.verdict, 'NO_GO');
  });
});
