import test from 'node:test';
import assert from 'node:assert/strict';
import { Candle } from './trullasStrategy.ts';
import { POLICIES } from './trullasOutcomeEngine.ts';
import {
  evaluateSymbolShadowAudit,
  buildShadowAuditReport,
} from './shadowAudit.ts';

function buildSyntheticOscillatingCandles(count: number): Candle[] {
  const candles: Candle[] = [];
  let price = 100;
  const startMs = new Date('2025-01-02').getTime();

  for (let i = 0; i < count; i++) {
    // Smooth deterministic multi-wave cycle to generate swings and divergences
    const wave = Math.sin(i * 0.35) * 3.5 + Math.cos(i * 0.12) * 2.0;
    const open = Number(price.toFixed(2));
    const close = Number(Math.max(20, 100 + wave + (i % 19 === 0 ? -2.5 : 0)).toFixed(2));
    const high = Number((Math.max(open, close) + 1.4).toFixed(2));
    const low = Number((Math.min(open, close) - 1.4).toFixed(2));
    const d = new Date(startMs + i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    candles.push({
      timestamp: startMs + i * 86400000,
      dateStr: d,
      open,
      high,
      low,
      close,
      volume: 1000000 - (i % 5) * 120000,
    });
    price = close;
  }
  return candles;
}

test('evaluateSymbolShadowAudit runs deterministically with zero Math.random and produces finite baseline comparison', () => {
  const candles = buildSyntheticOscillatingCandles(160);
  const runA = evaluateSymbolShadowAudit('SPY', candles, POLICIES.X1_fixed_v1);
  const runB = evaluateSymbolShadowAudit('SPY', candles, POLICIES.X1_fixed_v1);

  assert.deepEqual(runA, runB);
  assert.ok(runA.baselineR.length > 0, 'Expected baseline trades across 160 bars');
  for (const r of runA.baselineR) {
    assert.ok(Number.isFinite(r));
  }
});

test('buildShadowAuditReport hides profitFactor when n < 10 and calculates alpha honestly', () => {
  const shortCandles = buildSyntheticOscillatingCandles(55);
  const report = buildShadowAuditReport({ TEST: shortCandles }, 'X2_trail_v1');

  assert.equal(report.policyName, 'X2_trail_v1');
  assert.equal(report.roundTripBps, 10);
  assert.equal(report.totalBarsScanned, 55);
  if (report.metrics.n < 10) {
    assert.equal(report.metrics.profitFactor, null);
  }
  assert.equal(
    report.metrics.alphaOverBaselineR,
    Number((report.metrics.meanR - report.metrics.baselineMeanR).toFixed(3))
  );
  assert.ok(report.caveat.includes('survivorship bias'));
});
