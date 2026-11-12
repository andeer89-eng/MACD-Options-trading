import { describe, it } from 'node:test';
import assert from 'node:assert';
import { scanService } from './scanService';

describe('TRULLAS Unified Scan Service (Item 5 Acceptance Tests)', () => {
  it('determines Stan Weinstein stages deterministically', () => {
    // Stage 2: Price > MA30 > MA150
    const s2 = scanService.computeStage(150, 140, 130);
    assert.strictEqual(s2.stage, 2);
    assert.strictEqual(s2.stageName, 'Stage 2 Advancing');

    // Stage 4: Price < MA30 < MA150
    const s4 = scanService.computeStage(100, 110, 120);
    assert.strictEqual(s4.stage, 4);
    assert.strictEqual(s4.stageName, 'Stage 4 Declining');

    // Stage 1: Price >= MA30, but MA30 <= MA150 (basing out)
    const s1 = scanService.computeStage(112, 110, 115);
    assert.strictEqual(s1.stage, 1);
    assert.strictEqual(s1.stageName, 'Stage 1 Basing');

    // Stage 3: Topping out
    const s3 = scanService.computeStage(135, 140, 120);
    assert.strictEqual(s3.stage, 3);
    assert.strictEqual(s3.stageName, 'Stage 3 Topping');
  });

  it('guarantees identical stage, divergence, and Levels contract across consumers', () => {
    const raw = {
      symbol: 'AAPL',
      currentPrice: 224.5,
      atr: 4.8,
      atrPercent: 2.1,
      rsi: 58.2,
      setups: [
        {
          id: 'div-aapl-1',
          symbol: 'AAPL',
          timeframe: '1d',
          type: 'BULLISH_TRIPLE',
          qualityScore: 88,
          currentPrice: 224.5,
          triggerPrice: 226.0,
          stopLoss: 218.0,
          targets: { tp1: 232.0, tp2: 238.0 },
          points: [],
          reasons: ['Triple divergence', 'MACD bullish'],
        },
      ],
    };

    // View A (e.g. LiveScanner) normalizes the data
    const viewA = scanService.createNormalizedResult(raw, '1d');

    // View B (e.g. TodayView) normalizes the data
    const viewB = scanService.createNormalizedResult(raw, '1d');

    // Contract test: identical stage, identical divergence setups, identical Levels
    assert.strictEqual(viewA.symbol, viewB.symbol);
    assert.strictEqual(viewA.stage, viewB.stage);
    assert.strictEqual(viewA.stageName, viewB.stageName);
    assert.strictEqual(viewA.hasTripleDivergence, true);
    assert.strictEqual(viewB.hasTripleDivergence, true);
    assert.strictEqual(viewA.levels.stop.price, viewB.levels.stop.price);
    assert.strictEqual(viewA.levels.trigger, viewB.levels.trigger);
    assert.strictEqual(viewA.levels.targets[0].price, viewB.levels.targets[0].price);
  });
});
