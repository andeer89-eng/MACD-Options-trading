import { describe, it } from 'node:test';
import assert from 'node:assert';
import { calculateLevels } from './masterPlanCore.ts';
import { computeLevelLadderGeometry } from './levelGeometry.ts';

describe('computeLevelLadderGeometry', () => {
  it('orders LONG levels left-to-right as invalidation < stop < entry < tp1 < tp2 within [2, 98]', () => {
    const levels = calculateLevels({
      symbol: 'AAPL',
      direction: 'long',
      currentPrice: 100,
      atr14: 2.5,
      recentBars: [
        { o: 99, h: 101, l: 97, c: 100 },
        { o: 100, h: 102, l: 98, c: 101 },
      ],
    });

    const geo = computeLevelLadderGeometry(levels, 100);
    assert.ok(geo.invalidationPct < geo.stopPct);
    assert.ok(geo.stopPct < geo.entryLeftPct);
    assert.ok(geo.entryLeftPct + geo.entryWidthPct <= geo.tp1Pct);
    assert.ok(geo.tp2Pct !== null && geo.tp1Pct < geo.tp2Pct);
    assert.ok(geo.invalidationPct >= 2 && geo.tp2Pct <= 98);
  });

  it('orders SHORT levels left-to-right as tp2 < tp1 < entry < stop < invalidation within [2, 98]', () => {
    const levels = calculateLevels({
      symbol: 'TECH',
      direction: 'short',
      currentPrice: 72.7,
      atr14: 1.5,
      recentBars: [
        { o: 73, h: 74, l: 72, c: 72.8 },
        { o: 72.8, h: 73.5, l: 72.2, c: 72.7 },
      ],
    });

    const geo = computeLevelLadderGeometry(levels, 72.7);
    assert.ok(geo.tp2Pct !== null && geo.tp2Pct < geo.tp1Pct);
    assert.ok(geo.tp1Pct < geo.entryLeftPct);
    assert.ok(geo.entryLeftPct < geo.stopPct);
    assert.ok(geo.stopPct < geo.invalidationPct);
    assert.ok(geo.tp2Pct >= 2 && geo.invalidationPct <= 98);
  });
});
