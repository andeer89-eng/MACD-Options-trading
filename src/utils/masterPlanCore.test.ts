import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  saveSettings,
  loadSettings,
  getRiskUsd,
  calculateLevels,
  canTrade,
  DEFAULT_SETTINGS,
} from './masterPlanCore.ts';

describe('TRULLAS Master Plan v3 Core Tests', () => {
  it('Settings dynamically recalibrates capital and risk without hardcoded constants', () => {
    // Initial default: $2,000 capital, 1.0% risk -> $20
    saveSettings({ simCapitalUsd: 2000, maxRiskPerTradePct: 1.0 });
    assert.strictEqual(getRiskUsd(), 20);

    // Acceptance criterion from prompt §1: change from $2,000 to $10,000 and 1% to 2%
    saveSettings({ simCapitalUsd: 10000, maxRiskPerTradePct: 2.0 });
    assert.strictEqual(getRiskUsd(), 200);

    // Reset back
    saveSettings(DEFAULT_SETTINGS);
    assert.strictEqual(getRiskUsd(), 20);
  });

  it('calculateLevels produces exact Levels object with proper Annex B schema', () => {
    const bars = [
      { o: 100, h: 102, l: 98, c: 101 },
      { o: 101, h: 103, l: 99, c: 102 },
      { o: 102, h: 104, l: 100, c: 103 },
    ];

    const levels = calculateLevels({
      symbol: 'AAPL',
      direction: 'long',
      currentPrice: 100,
      atr14: 2.5,
      recentBars: bars,
    });

    assert.strictEqual(levels.symbol, 'AAPL');
    assert.strictEqual(levels.direction, 'long');
    assert.ok(levels.stop.price < 100);
    assert.ok(levels.targets[0].price > 100);
    assert.strictEqual(levels.stopTooWide, false);
    assert.ok(levels.rr > 0);
  });

  it('canTrade executes the 10 checks and blocks when stop is too wide (>3x ATR)', () => {
    const bars = [{ o: 100, h: 102, l: 70, c: 100 }];
    const wideLevels = calculateLevels({
      symbol: 'TEST',
      direction: 'long',
      currentPrice: 100,
      atr14: 2.0, // 3x ATR is 6.0, but stop from low=70 will be ~30 away (>3x ATR)
      recentBars: bars,
    });

    assert.strictEqual(wideLevels.stopTooWide, true);

    const gate = canTrade({
      symbol: 'TEST',
      direction: 'long',
      setupScore: 80,
      levels: wideLevels,
      currentPrice: 100,
      marketOpenOverride: true,
      customSettings: {
        ...DEFAULT_SETTINGS,
        dataQuality: 'live',
        botStatus: 'armed',
      },
    });

    assert.strictEqual(gate.allow, false);
    const sizeFail = gate.fails.find((f) => f.shortName === 'size_min');
    assert.ok(sizeFail);
    assert.ok(sizeFail.detail.includes('Stop prea larg'));
  });

  it('canTrade allows valid setup when all 10 checks pass', () => {
    const bars = [
      { o: 100, h: 101, l: 99, c: 100 },
      { o: 100, h: 102, l: 99.2, c: 101 },
    ];
    const normalLevels = calculateLevels({
      symbol: 'NVDA',
      direction: 'long',
      currentPrice: 100,
      atr14: 2.0,
      recentBars: bars,
    });

    const gate = canTrade({
      symbol: 'NVDA',
      direction: 'long',
      setupScore: 85,
      levels: normalLevels,
      currentPrice: 100,
      marketOpenOverride: true,
      regimeScore: 75, // Risk-on
      customSettings: {
        ...DEFAULT_SETTINGS,
        simCapitalUsd: 5000,
        maxRiskPerTradePct: 2.0, // Max risk = $100
        dataQuality: 'live',
        botStatus: 'armed',
      },
    });

    assert.strictEqual(gate.allow, true);
    assert.strictEqual(gate.fails.length, 0);
    assert.ok(gate.suggestedQty >= 1);
  });
});
