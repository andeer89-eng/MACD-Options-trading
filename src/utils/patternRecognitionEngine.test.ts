import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectChartPatterns } from './patternRecognitionEngine.ts';

function flatBars(count: number, price: number = 100) {
  return Array.from({ length: count }, () => ({
    high: price + 1,
    low: price - 1,
    close: price,
  }));
}

describe('detectChartPatterns', () => {
  it('detects Double Bottom within lookback and returns original indices', () => {
    const bars = flatBars(15, 110);
    // Swing trough at index 4
    bars[4] = { high: 103, low: 100, close: 101 };
    // Intervening peak at index 7
    bars[7] = { high: 118, low: 112, close: 116 };
    // Second trough at index 10 within 3% of 100
    bars[10] = { high: 104, low: 101, close: 102 };

    const patterns = detectChartPatterns(bars, 15);
    const db = patterns.find((p) => p.name === 'DOUBLE_BOTTOM');
    assert.ok(db, 'expected DOUBLE_BOTTOM to be detected');
    assert.equal(db.type, 'BULLISH');
    assert.equal(db.startIndex, 4);
    assert.equal(db.endIndex, 10);
    assert.ok(Number.isFinite(db.confidence) && db.confidence >= 50 && db.confidence <= 100);
  });

  it('ignores stale patterns older than the requested lookback window and preserves original indices', () => {
    const bars = flatBars(50, 100);
    // Place an old Double Top inside bars 2..12 (outside trailing lookback=25)
    bars[4] = { high: 120, low: 100, close: 118 };
    bars[7] = { high: 100, low: 92, close: 95 };
    bars[10] = { high: 119.5, low: 100, close: 116 };

    const withFullLookback = detectChartPatterns(bars, 50);
    assert.equal(withFullLookback.length, 1, 'sanity check: full 50-bar lookback finds the early DOUBLE_TOP');

    const oldExcluded = detectChartPatterns(bars, 25);
    assert.equal(oldExcluded.length, 0, 'stale pattern outside trailing 25-bar window must be ignored');

    // Now place a fresh Double Top inside trailing 25 bars (indices 30..40)
    bars[32] = { high: 120, low: 100, close: 118 };
    bars[35] = { high: 100, low: 92, close: 95 };
    bars[38] = { high: 119.5, low: 100, close: 116 };

    const recentIncluded = detectChartPatterns(bars, 25);
    const dt = recentIncluded.find((p) => p.name === 'DOUBLE_TOP');
    assert.ok(dt, 'expected recent DOUBLE_TOP inside lookback window');
    assert.equal(dt.startIndex, 32);
    assert.equal(dt.endIndex, 38);
  });

  it('guards non-positive swing prices without emitting NaN confidence', () => {
    const bars = flatBars(15, 10);
    bars[4] = { high: 10, low: 0, close: 2 };
    bars[7] = { high: 16, low: 12, close: 14 };
    bars[10] = { high: 10, low: 0.01, close: 2 };

    const patterns = detectChartPatterns(bars, 15);
    for (const p of patterns) {
      assert.ok(Number.isFinite(p.confidence), `confidence must be finite, got ${p.confidence}`);
    }
  });
});
