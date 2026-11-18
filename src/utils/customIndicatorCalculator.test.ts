import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateSuperTrend,
  calculateTrendCloudPro,
  calculateMatrixAIPro,
  calculateAGAIGAvwap,
  calculateApexCore,
  calculateBuyingChecklistPro,
  calculateCustomIndicatorById,
} from './customIndicatorCalculator.ts';
import type { Candle } from './trullasStrategy.ts';

function makeSeries(count: number, startPrice: number, step: number = 0.5): Candle[] {
  return Array.from({ length: count }, (_, i) => {
    const close = startPrice + i * step;
    const ts = 1_700_000_000_000 + i * 86_400_000;
    return {
      timestamp: ts,
      dateStr: new Date(ts).toISOString().slice(0, 10),
      open: close - step * 0.4,
      high: close + Math.abs(startPrice) * 0.02,
      low: close - Math.abs(startPrice) * 0.02,
      close,
      volume: 100_000 + (i === count - 10 ? 500_000 : i * 1_000),
    };
  });
}

describe('customIndicatorCalculator edge cases & behavioral contracts', () => {
  it('guards SuperTrend period <= 0 without emitting NaN', () => {
    const candles = makeSeries(25, 100, 1);
    const st = calculateSuperTrend(candles, 0, 3);
    assert.equal(st.plots.length, 1);
    for (const pt of st.plots[0].points) {
      assert.ok(Number.isFinite(pt.value), `SuperTrend point must be finite, got ${pt.value}`);
    }
    assert.ok(!st.summaryValue?.includes('NaN'));
  });

  it('keeps AGAIG AVWAP lower envelope positive on sub-dollar assets', () => {
    const subDollarCandles = makeSeries(20, 0.25, 0.002);
    const avwap = calculateAGAIGAvwap(subDollarCandles);
    assert.equal(avwap.plots.length, 3);
    const lowerBand = avwap.plots[2].points;
    assert.ok(lowerBand.length > 0);
    for (const pt of lowerBand) {
      assert.ok(pt.value > 0, `lower AVWAP band for $0.25 asset must stay > 0, got ${pt.value}`);
    }
  });

  it('preserves sub-dollar precision in SuperTrend & TrendCloud Pro instead of truncating to 0.00', () => {
    const microCandles = makeSeries(20, 0.0045, 0.0001);
    const st = calculateSuperTrend(microCandles);
    const tc = calculateTrendCloudPro(microCandles);

    assert.ok(st.plots[0].points.every((p) => p.value > 0), 'SuperTrend values must not collapse to 0');
    assert.ok(tc.plots[0].points.every((p) => p.value > 0), 'TrendCloud fast EMA must not collapse to 0');
  });

  it('computes bounded Matrix AI Pro, Apex Core, Buying Checklist Pro and returns null for unknown IDs', () => {
    const candles = makeSeries(20, 150, 0.8);

    const matrix = calculateMatrixAIPro(candles);
    assert.equal(matrix.plots.length, 1);
    assert.ok(matrix.plots[0].points.every((p) => p.value >= -100 && p.value <= 100));

    const apex = calculateApexCore(candles);
    assert.equal(apex.plots[0].points.length, 20);

    const checklist = calculateBuyingChecklistPro(candles);
    assert.ok(checklist.plots[0].points.every((p) => p.value >= 20 && p.value <= 100));

    assert.equal(calculateCustomIndicatorById('unknown-indicator-xyz', candles), null);
    assert.deepEqual(calculateSuperTrend([]).plots, []);
  });
});
