import test from 'node:test';
import assert from 'node:assert/strict';
import { computeVolumeProfile, analyzeChartWithPoc } from './volumeProfileEngine';
import type { Candle } from './trullasStrategy';

function makeBar(day: number, low: number, high: number, close: number, volume: number): Candle {
  const ts = Date.UTC(2026, 0, day + 1);
  return {
    timestamp: ts,
    dateStr: new Date(ts).toISOString().split('T')[0],
    open: (low + high) / 2,
    high,
    low,
    close,
    volume,
  };
}

test('computeVolumeProfile returns null on empty input', () => {
  assert.equal(computeVolumeProfile([]), null);
});

test('computeVolumeProfile identifies exact POC around heaviest volume cluster and satisfies VAL <= POC <= VAH', () => {
  const candles: Candle[] = [
    makeBar(1, 95, 98, 97, 100_000),
    makeBar(2, 100, 102, 101, 2_500_000),
    makeBar(3, 100.2, 101.8, 101.2, 2_800_000),
    makeBar(4, 100.5, 101.5, 101.0, 3_000_000),
    makeBar(5, 108, 112, 111, 150_000),
  ];

  const vp = computeVolumeProfile(candles, { rows: 32, valueAreaPct: 0.7 });
  assert.ok(vp, 'Expected valid volume profile');
  assert.ok(vp.val <= vp.poc, `Expected VAL (${vp.val}) <= POC (${vp.poc})`);
  assert.ok(vp.poc <= vp.vah, `Expected POC (${vp.poc}) <= VAH (${vp.vah})`);
  assert.ok(vp.poc >= 99.8 && vp.poc <= 102.2, `Expected POC near 101, got ${vp.poc}`);
  assert.ok(vp.valueAreaVolumePct >= 68, `Expected ~70% value area capture, got ${vp.valueAreaVolumePct}%`);
  assert.equal(vp.developingPoc.length, candles.length);
});

test('analyzeChartWithPoc classifies ABOVE_VAH breakout and provides structural magnet & invalidation', () => {
  const candles: Candle[] = [
    makeBar(1, 99, 101, 100, 2_000_000),
    makeBar(2, 99.5, 101.5, 100.8, 2_400_000),
    makeBar(3, 100, 102, 101.5, 1_800_000),
    makeBar(4, 106, 110, 109.5, 350_000),
  ];

  const profile = computeVolumeProfile(candles, { rows: 30, valueAreaPct: 0.7 });
  const reading = analyzeChartWithPoc({
    symbol: 'AAPL',
    timeframe: '1d',
    candles,
    profile,
  });

  assert.ok(reading);
  assert.equal(reading.vaPosition, 'ABOVE_VAH');
  assert.equal(reading.bias, 'BULLISH');
  assert.ok(reading.pocDistancePct > 0);
  assert.ok(reading.thesisBullets.length >= 1);
  assert.equal(reading.invalidation.price, profile!.vah);
});
