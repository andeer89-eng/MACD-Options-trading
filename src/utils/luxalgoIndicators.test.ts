import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateNadarayaWatsonEnvelope,
  calculateSmartMoneyConcepts,
  calculateLuxAlgoOscillatorMatrix,
  calculateLuxAlgoConfluence,
} from './luxalgoIndicators.ts';
import { Candle } from './trullasStrategy.ts';

// Generate synthetic candles for deterministic testing
function createMockCandles(count: number = 60, trend: 'bull' | 'bear' | 'range' = 'range'): Candle[] {
  const candles: Candle[] = [];
  let basePrice = 100;
  const now = Date.now();

  for (let i = 0; i < count; i++) {
    const delta =
      trend === 'bull'
        ? 0.5 + Math.sin(i / 5) * 1.5
        : trend === 'bear'
        ? -0.5 + Math.sin(i / 5) * 1.5
        : Math.sin(i / 4) * 3;

    basePrice += delta;
    const open = Number(basePrice.toFixed(2));
    const close = Number((basePrice + (i % 2 === 0 ? 0.8 : -0.8)).toFixed(2));
    const high = Number((Math.max(open, close) + 1.2).toFixed(2));
    const low = Number((Math.min(open, close) - 1.2).toFixed(2));
    const volume = 1000000 + ((i * 73856093) % 500000);

    candles.push({
      timestamp: now - (count - i) * 86400000,
      dateStr: new Date(now - (count - i) * 86400000).toISOString().split('T')[0],
      open,
      high,
      low,
      close,
      volume,
    });
  }

  return candles;
}

test('calculateNadarayaWatsonEnvelope computes envelope properly', () => {
  const candles = createMockCandles(50, 'range');
  const nwe = calculateNadarayaWatsonEnvelope(candles, 8.0, 2.5);

  assert.equal(nwe.yhat.length, candles.length);
  assert.equal(nwe.upper.length, candles.length);
  assert.equal(nwe.lower.length, candles.length);

  for (let i = 10; i < candles.length; i++) {
    assert.ok(nwe.upper[i] >= nwe.yhat[i], `Upper ${nwe.upper[i]} should be >= yhat ${nwe.yhat[i]}`);
    assert.ok(nwe.yhat[i] >= nwe.lower[i], `yhat ${nwe.yhat[i]} should be >= lower ${nwe.lower[i]}`);
  }
});

test('calculateSmartMoneyConcepts detects zones and structure', () => {
  const candles = createMockCandles(60, 'bull');
  const smc = calculateSmartMoneyConcepts(candles);

  assert.ok(Array.isArray(smc.orderBlocks));
  assert.ok(Array.isArray(smc.fairValueGaps));
  assert.ok(smc.premiumDiscountZone.equilibrium > 0);
  assert.ok(smc.premiumDiscountZone.high >= smc.premiumDiscountZone.low);
  assert.ok(['PREMIUM', 'DISCOUNT', 'EQUILIBRIUM'].includes(smc.premiumDiscountZone.currentZone));
});

test('calculateLuxAlgoOscillatorMatrix outputs bounded metrics', () => {
  const candles = createMockCandles(50, 'bull');
  const matrix = calculateLuxAlgoOscillatorMatrix(candles);

  assert.equal(matrix.length, candles.length);
  const last = matrix[matrix.length - 1];
  assert.ok(typeof last.fastWave === 'number');
  assert.ok(typeof last.slowWave === 'number');
  assert.ok(typeof last.moneyFlow === 'number');
  assert.ok(last.moneyFlow >= -100 && last.moneyFlow <= 100);
  assert.ok(['OVERBOUGHT', 'OVERSOLD', 'NEUTRAL'].includes(last.exhaustionLevel));
});

test('calculateLuxAlgoConfluence evaluates confluence factors and score', () => {
  const candles = createMockCandles(50, 'bull');
  const confluence = calculateLuxAlgoConfluence('AAPL', candles, 'BULLISH_TRIPLE');

  assert.equal(confluence.symbol, 'AAPL');
  assert.ok(confluence.confluenceScore >= 50 && confluence.confluenceScore <= 100);
  assert.ok(['AT_LOWER_BAND', 'AT_UPPER_BAND', 'INSIDE_CHANNEL'].includes(confluence.nwePosition));
  assert.ok(Array.isArray(confluence.confluenceFactors));
});
