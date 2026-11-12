import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  openChart,
  getActiveChartTarget,
  subscribeChartTarget,
  generateDeterministicLevelsSnapshot,
  OpenChartParams,
} from './chartRouter';

describe('TRULLAS Unified Chart Router (Item 4 Acceptance Tests)', () => {
  it('updates active chart target and notifies subscribers', () => {
    let notifiedTarget: OpenChartParams | null = null;
    const unsubscribe = subscribeChartTarget((target) => {
      notifiedTarget = target;
    });

    openChart({
      symbol: 'MSFT',
      timeframe: '1d',
      source: 'watchlist',
    });

    assert.strictEqual(notifiedTarget?.symbol, 'MSFT');
    assert.strictEqual(notifiedTarget?.timeframe, '1d');
    assert.strictEqual(notifiedTarget?.source, 'watchlist');

    const active = getActiveChartTarget();
    assert.strictEqual(active.symbol, 'MSFT');

    unsubscribe();
  });

  it('produces identical Levels snapshot across chart, watchlist, and order inputs', () => {
    const bars = [
      { o: 100, h: 105, l: 98, c: 102 },
      { o: 102, h: 108, l: 101, c: 107 },
      { o: 107, h: 109, l: 104, c: 105 },
      { o: 105, h: 112, l: 105, c: 110 },
      { o: 110, h: 115, l: 108, c: 114 },
    ];

    // 1. Levels for Watchlist row
    const watchlistLevels = generateDeterministicLevelsSnapshot('NVDA', '1d', 114, 3.5, bars, 'long');

    // 2. Levels for Chart viewer
    const chartLevels = generateDeterministicLevelsSnapshot('NVDA', '1d', 114, 3.5, bars, 'long');

    // 3. Levels for Bot Order execution
    const orderLevels = generateDeterministicLevelsSnapshot('NVDA', '1d', 114, 3.5, bars, 'long');

    // Snapshot equality check: all 3 must have byte-for-byte identical levels
    assert.deepStrictEqual(watchlistLevels, chartLevels);
    assert.deepStrictEqual(chartLevels, orderLevels);

    // Verify key fields
    assert.strictEqual(watchlistLevels.symbol, 'NVDA');
    assert.strictEqual(watchlistLevels.timeframe, '1d');
    assert.strictEqual(watchlistLevels.direction, 'long');
    assert.strictEqual(watchlistLevels.entryZone.lo, chartLevels.entryZone.lo);
    assert.strictEqual(watchlistLevels.entryZone.hi, chartLevels.entryZone.hi);
    assert.strictEqual(watchlistLevels.trigger, chartLevels.trigger);
    assert.strictEqual(watchlistLevels.stop.price, chartLevels.stop.price);
    assert.strictEqual(watchlistLevels.targets[0].price, chartLevels.targets[0].price);
    assert.strictEqual(watchlistLevels.invalidation.price, chartLevels.invalidation.price);
  });
});
