import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeResidualEdgeOls,
  buildSignalPostmortemReport,
} from './signalPostmortemEngine.ts';
import type { Candle } from './trullasStrategy.ts';

function makeTrendCandles(len: number, slope: number): Candle[] {
  const baseMs = Date.UTC(2025, 0, 2, 14, 30, 0);
  const out: Candle[] = [];
  for (let i = 0; i < len; i++) {
    const close = 100 + i * slope + Math.sin(i * 0.45) * 3.2;
    const ts = baseMs + i * 86_400_000;
    out.push({
      timestamp: ts,
      dateStr: new Date(ts).toISOString().slice(0, 10),
      open: Number((close - 0.2).toFixed(2)),
      high: Number((close + 1.1).toFixed(2)),
      low: Number((close - 1.1).toFixed(2)),
      close: Number(close.toFixed(2)),
      volume: 2_000_000,
    });
  }
  return out;
}

describe('Signal Postmortem & Residual Edge OLS Engine', () => {
  it('computes exact OLS alpha, beta, t-stat and verdict on pure alpha + beta synthetic series', () => {
    const spyRet = [-3, -1, 0, 1, 2, 3, -2, 4, 1.5, -0.5, 2.5, 3.5];
    // y = 2.0 + 0.5 * x + tiny noise
    const stratRet = spyRet.map((x, idx) => 2.0 + 0.5 * x + (idx % 2 === 0 ? 0.15 : -0.15));

    const ols = computeResidualEdgeOls(stratRet, spyRet, 12);
    assert.equal(ols.sampleSize, 12);
    assert.ok(Math.abs(ols.alphaPerPeriodPct - 2.0) < 0.25);
    assert.ok(Math.abs(ols.beta - 0.5) < 0.1);
    assert.ok(ols.alphaTStat > 10);
    assert.equal(ols.verdict, 'GENUINE_ALPHA');
  });

  it('classifies beta-driven return stream when alpha intercept is near zero', () => {
    const spyRet = [-4, -2, 0, 2, 4, 6, 3, 1, -1, 5];
    const stratRet = spyRet.map((x, idx) => 1.2 * x + (idx % 2 === 0 ? 0.1 : -0.1));
    const ols = computeResidualEdgeOls(stratRet, spyRet, 12);
    assert.equal(ols.verdict, 'BETA_DRIVEN');
    assert.ok(ols.beta > 1.0);
  });

  it('runs +5d/+20d signal postmortem across multi-symbol OHLCV histories cleanly', () => {
    const spy = makeTrendCandles(160, 0.22);
    const nvda = makeTrendCandles(160, 0.35);
    const report = buildSignalPostmortemReport({ SPY: spy, NVDA: nvda });

    assert.equal(report.roundTripCostBps, 10);
    assert.ok(report.totalSignals >= 0);
    assert.equal(
      report.resolvedCount + report.pendingCount,
      report.totalSignals
    );
    assert.equal(
      report.truePositives + report.falsePositives + report.regimeMismatches,
      report.resolvedCount
    );
  });
});
