import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateHeikinAshi } from './heikinAshi.ts';
import type { Candle } from './trullasStrategy.ts';

describe('calculateHeikinAshi', () => {
  it('returns empty array for empty input', () => {
    assert.deepEqual(calculateHeikinAshi([]), []);
  });

  it('computes exact Heikin-Ashi values for standard equity candles (>= $10)', () => {
    const candles: Candle[] = [
      { timestamp: 1000, dateStr: '2026-11-17', open: 100, high: 110, low: 95, close: 105, volume: 1000 },
      { timestamp: 2000, dateStr: '2026-11-18', open: 106, high: 112, low: 104, close: 110, volume: 1200 },
    ];

    const ha = calculateHeikinAshi(candles);
    assert.equal(ha.length, 2);

    // Bar 0: haClose=(100+110+95+105)/4 = 102.5, haOpen=(100+105)/2 = 102.5
    assert.equal(ha[0].close, 102.5);
    assert.equal(ha[0].open, 102.5);
    assert.equal(ha[0].high, 110);
    assert.equal(ha[0].low, 95);

    // Bar 1: haClose=(106+112+104+110)/4 = 108, haOpen=(102.5+102.5)/2 = 102.5
    assert.equal(ha[1].close, 108);
    assert.equal(ha[1].open, 102.5);
    assert.equal(ha[1].high, 112);
    assert.equal(ha[1].low, 102.5);
  });

  it('preserves sub-dollar precision on low-priced assets without collapsing to 0.00', () => {
    const candles: Candle[] = [
      { timestamp: 1000, dateStr: '2026-11-17', open: 0.0041, high: 0.0045, low: 0.0040, close: 0.0044, volume: 500000 },
      { timestamp: 2000, dateStr: '2026-11-18', open: 0.0044, high: 0.0049, low: 0.0043, close: 0.0048, volume: 650000 },
    ];

    const ha = calculateHeikinAshi(candles);
    assert.equal(ha.length, 2);
    assert.ok(ha[0].close > 0.004, `expected ha[0].close > 0.004, got ${ha[0].close}`);
    assert.ok(ha[0].open > 0.004, `expected ha[0].open > 0.004, got ${ha[0].open}`);
    assert.ok(ha[1].close > ha[0].close, 'expected upward drift preserved across sub-dollar bars');
  });

  it('enforces haHigh >= max(open, close) and haLow <= min(open, close) across every bar', () => {
    const candles: Candle[] = [
      { timestamp: 1000, dateStr: '2026-11-16', open: 0.215, high: 0.228, low: 0.211, close: 0.224, volume: 100 },
      { timestamp: 2000, dateStr: '2026-11-17', open: 0.224, high: 0.229, low: 0.205, close: 0.208, volume: 120 },
      { timestamp: 3000, dateStr: '2026-11-18', open: 0.208, high: 0.232, low: 0.206, close: 0.230, volume: 140 },
    ];

    const ha = calculateHeikinAshi(candles);
    for (const bar of ha) {
      assert.ok(bar.high >= Math.max(bar.open, bar.close));
      assert.ok(bar.low <= Math.min(bar.open, bar.close));
    }
  });
});
