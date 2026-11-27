import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  acquirePortfolioCycleLock,
  evaluatePortfolioRisk,
  evaluateShortPutOrderRisk,
  type PortfolioEquityPoint,
} from './portfolioRiskEngine.ts';

const now = new Date('2026-11-27T20:00:00.000Z');
const fetchedAt = now.toISOString();
function history(currentEquity = 100_000): PortfolioEquityPoint[] {
  return Array.from({ length: 40 }, (_, index) => ({
    timestamp: Math.floor((now.getTime() - (39 - index) * 86_400_000) / 1000),
    equity: currentEquity,
  }));
}
function baseParams(overrides: Partial<Parameters<typeof evaluatePortfolioRisk>[0]> = {}) {
  return {
    account: {
      equity: 100_000,
      day_pnl_pct: 0,
      status: 'ACTIVE',
      trading_blocked: false,
      account_blocked: false,
      trade_suspended_by_user: false,
    },
    positions: [],
    openOrders: [],
    equityHistory: history(),
    fetchedAt,
    now,
    ...overrides,
  };
}

describe('portfolioRiskEngine', () => {
  it('blocks new entries at the daily broker equity loss limit', () => {
    const report = evaluatePortfolioRisk(baseParams({
      account: { ...baseParams().account!, day_pnl_pct: -2.1 },
    }));
    assert.equal(report.allowNewEntries, false);
    assert.equal(report.status, 'HALTED');
    assert.ok(report.reasons.some((reason) => reason.includes('Daily drawdown')));
  });

  it('blocks when weekly or monthly equity baselines breach their limits', () => {
    const points = history(100_000);
    const weekCutoff = Math.floor((now.getTime() - 7 * 86_400_000) / 1000);
    const monthCutoff = Math.floor((now.getTime() - 30 * 86_400_000) / 1000);
    points.forEach((point) => {
      if (point.timestamp <= weekCutoff) point.equity = 105_500;
      if (point.timestamp <= monthCutoff) point.equity = 109_000;
    });
    const report = evaluatePortfolioRisk(baseParams({ equityHistory: points }));
    assert.equal(report.allowNewEntries, false);
    assert.ok((report.weeklyDrawdownPct ?? 0) >= 5);
    assert.ok((report.monthlyDrawdownPct ?? 0) >= 8);
  });

  it('fails closed if rolling equity history is missing or stale', () => {
    const report = evaluatePortfolioRisk(baseParams({ equityHistory: [] }));
    assert.equal(report.allowNewEntries, false);
    assert.equal(report.status, 'DATA_INVALID');
    assert.ok(report.reasons.some((reason) => reason.includes('Weekly equity baseline unavailable')));
  });

  it('caps short-put collateral at 50% of equity, including pending short puts', () => {
    const report = evaluatePortfolioRisk(baseParams({
      positions: [{
        symbol: 'SPY261218P00560000',
        asset_class: 'us_option',
        qty: -1,
        side: 'short',
        market_value: -250,
      }],
      openOrders: [{
        symbol: 'QQQ261218P00400000',
        asset_class: 'us_option',
        side: 'sell',
        qty: 1,
        status: 'accepted',
      }],
    }));
    assert.equal(report.shortPutCollateralUsd, 96_000);
    assert.equal(report.allowNewEntries, false);
    assert.ok(report.reasons.some((reason) => reason.includes('Cash-secured put collateral')));
  });

  it('limits worst-case risk of each new short put to 1% of equity', () => {
    const rejected = evaluateShortPutOrderRisk({
      symbol: 'SPY261218P00560000',
      contracts: 1,
      premiumPerShare: 2.5,
      equity: 100_000,
    });
    assert.equal(rejected.allowed, false);
    assert.equal(rejected.maxLossUsd, 55_750);
    const accepted = evaluateShortPutOrderRisk({
      symbol: 'XYZ261218P00005000',
      contracts: 1,
      premiumPerShare: 0.1,
      equity: 100_000,
    });
    assert.equal(accepted.allowed, true);
  });

  it('shares a single cycle lock across equity and options automation and releases it once', () => {
    const release = acquirePortfolioCycleLock('equity');
    assert.equal(typeof release, 'function');
    assert.equal(acquirePortfolioCycleLock('options'), null);
    release?.();
    const next = acquirePortfolioCycleLock('options');
    assert.equal(typeof next, 'function');
    next?.();
  });
});
