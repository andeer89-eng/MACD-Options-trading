import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  simulateExit,
  computePath,
  clusterStats,
  summarize,
  t95,
  POLICIES,
  Bar,
  SignalInput,
} from './trullasOutcomeEngine.ts';

describe('Trullas Outcome Engine Parity & Determinism', () => {
  it('t95 returns exact student t-values', () => {
    assert.strictEqual(t95(1), 6.314);
    assert.strictEqual(t95(10), 1.812);
    assert.strictEqual(t95(30), 1.697);
    assert.strictEqual(t95(50), 1.684);
    assert.strictEqual(t95(100), 1.671);
    assert.strictEqual(t95(200), 1.658);
  });

  it('summarize hides Profit Factor when n < 10', () => {
    const fewTrades = [1.5, -1.0, 2.0, -0.8];
    const s = summarize(fewTrades);
    assert.strictEqual(s.n, 4);
    assert.strictEqual(s.pf, null); // PF must be null below n=10 per Rule 1

    const tenTrades = [1.0, 1.0, 1.0, 1.0, 1.0, -0.5, -0.5, -0.5, -0.5, -0.5];
    const s10 = summarize(tenTrades);
    assert.strictEqual(s10.n, 10);
    assert.strictEqual(s10.pf, 2.0); // 5.0 / 2.5 = 2.0
  });

  it('clusterStats calculates exact cluster SE and CI90', () => {
    const vals = [1.0, 2.0, -1.0, -0.5];
    const days = ['2026-11-01', '2026-11-01', '2026-11-02', '2026-11-02'];
    const cs = clusterStats(vals, days);
    assert.strictEqual(cs.n, 4);
    assert.strictEqual(cs.nEff, 2);
    assert.ok(isFinite(cs.mean));
    assert.ok(isFinite(cs.se));
    assert.ok(isFinite(cs.lo));
    assert.ok(isFinite(cs.hi));
  });

  it('simulateExit resolves SL before TP if hit on the same bar', () => {
    const sig: SignalInput = {
      direction: 'long',
      entry: 100,
      stop: 95,
      atr: 3,
      tp1Price: 110,
    };

    // Bar 0 opens at 100, drops to 90 (hits SL) and surges to 115 (hits TP) on the same bar
    const bars: Bar[] = [
      { o: 100, h: 115, l: 90, c: 105 },
    ];

    const res = simulateExit(sig, bars, POLICIES.X1_fixed_v1);
    assert.strictEqual(res.status, 'closed');
    assert.strictEqual(res.exitReasonSql, 'sl');
    assert.strictEqual(res.ambiguous, true);
    assert.strictEqual(res.exitPrice, 95);
  });
});
