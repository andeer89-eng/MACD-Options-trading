import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Candle } from './trullasStrategy.ts';
import {
  analyzeIndexDistributionDays,
  analyzeIndexFollowThroughDay,
  analyzeMarketTiming,
} from './marketTimingEngine.ts';

function makeBarSeries(
  specs: Array<{ close: number; high?: number; low?: number; volume?: number }>,
  startDate = '2026-09-01'
): Candle[] {
  const baseMs = Date.parse(`${startDate}T14:30:00Z`);
  return specs.map((s, idx) => {
    const ts = baseMs + idx * 86_400_000;
    const prev = idx > 0 ? specs[idx - 1].close : s.close;
    const high = s.high ?? Math.max(prev, s.close) * 1.004;
    const low = s.low ?? Math.min(prev, s.close) * 0.996;
    return {
      timestamp: ts,
      dateStr: new Date(ts).toISOString().slice(0, 10),
      open: Number(prev.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(s.close.toFixed(2)),
      volume: s.volume ?? 50_000_000,
    };
  });
}

describe('IBD Distribution Day & Follow-Through Day Timing Engine', () => {
  it('counts active distribution days (-0.2%+ on higher volume) and escalates risk level', () => {
    const specs: Array<{ close: number; high?: number; low?: number; volume?: number }> = [];
    let px = 500;
    for (let i = 0; i < 45; i++) {
      px += 0.4;
      specs.push({ close: px, volume: 40_000_000 });
    }
    // Inject 5 distribution days in last 10 sessions without +5% recovery
    for (let k = 0; k < 5; k++) {
      px = px * 0.994; // -0.6%
      specs.push({ close: px, volume: 65_000_000 + k * 2_000_000 });
      px = px * 1.001; // minor pause, lower volume
      specs.push({ close: px, volume: 35_000_000 });
    }

    const candles = makeBarSeries(specs);
    const res = analyzeIndexDistributionDays('SPY', candles, 25);
    assert.ok(res);
    assert.equal(res.activeCount25, 5);
    assert.ok(res.riskLevel === 'HIGH' || res.riskLevel === 'SEVERE');
  });

  it('expires distribution days after a +5% rally above the DD close', () => {
    const specs: Array<{ close: number; high?: number; low?: number; volume?: number }> = [];
    let px = 500;
    for (let i = 0; i < 30; i++) {
      specs.push({ close: px, volume: 40_000_000 });
    }
    // 1 DD at 495
    specs.push({ close: 495, volume: 70_000_000 });
    // Rally +5.5% above 495 -> 522.22 invalidates that DD
    for (let i = 0; i < 5; i++) {
      px = 500 + i * 6;
      specs.push({ close: px, high: px + 1, volume: 45_000_000 });
    }
    const candles = makeBarSeries(specs);
    const res = analyzeIndexDistributionDays('QQQ', candles, 25);
    assert.ok(res);
    assert.equal(res.activeCount25, 0);
    assert.equal(res.riskLevel, 'NORMAL');
  });

  it('detects a valid Follow-Through Day on Day 4-10 after a >=3% correction', () => {
    const specs: Array<{ close: number; high?: number; low?: number; volume?: number }> = [];
    // Steady uptrend to 520 over 35 bars
    for (let i = 0; i < 35; i++) {
      specs.push({ close: 500 + i * 0.6, volume: 40_000_000 });
    }
    // Pullback >= 5% down to 492
    specs.push({ close: 512, low: 510, volume: 55_000_000 });
    specs.push({ close: 502, low: 500, volume: 60_000_000 });
    specs.push({ close: 493, low: 491, volume: 62_000_000 }); // trough
    // Day 1 bounce
    specs.push({ close: 496, low: 492.5, volume: 48_000_000 });
    // Day 2 & 3 hold above Day 1 low
    specs.push({ close: 495.5, low: 493.5, volume: 42_000_000 });
    specs.push({ close: 497.0, low: 494.0, volume: 41_000_000 });
    // Day 4 FTD: +1.9% on higher volume than Day 3!
    specs.push({ close: 506.5, low: 497.0, high: 507.2, volume: 68_000_000 });

    const candles = makeBarSeries(specs);
    const timing = analyzeMarketTiming({ spyCandles: candles, qqqCandles: candles });
    assert.ok(timing);
    assert.equal(timing.ftdStatus.spy?.state, 'FTD_CONFIRMED');
    assert.equal(timing.ftdStatus.spy?.latestFtd?.rallyDay, 4);
    assert.equal(timing.ftdStatus.spy?.latestFtd?.quality, 'STRONG');
  });
});
