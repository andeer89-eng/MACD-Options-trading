import test from 'node:test';
import assert from 'node:assert/strict';
import type { Candle } from './trullasStrategy.ts';
import { calculateSuperKumoMpro } from './superKumoMpro.ts';

function makeTrendingCandles(count: number): Candle[] {
  const candles: Candle[] = [];
  const startTs = Date.UTC(2026, 0, 2);
  for (let i = 0; i < count; i++) {
    const ts = startTs + i * 86_400_000;
    const dateStr = new Date(ts).toISOString().slice(0, 10);
    // First 60 bars: downtrend/consolidation around 100->85; Next bars: strong uptrend 85->145 with a pullback
    let base: number;
    if (i < 40) {
      base = 110 - i * 0.6 + Math.sin(i * 0.4) * 1.5;
    } else if (i < 75) {
      base = 86 + (i - 40) * 1.45;
    } else if (i < 83) {
      base = 136 - (i - 75) * 1.4; // pullback
    } else {
      base = 125 + (i - 83) * 1.1;
    }
    const open = Number((base - 0.5).toFixed(2));
    const close = Number((base + (i >= 40 && !(i >= 75 && i < 83) ? 0.8 : -0.7)).toFixed(2));
    const high = Number((Math.max(open, close) + 1.1).toFixed(2));
    const low = Number((Math.min(open, close) - 1.1).toFixed(2));
    candles.push({
      timestamp: ts,
      dateStr,
      open,
      high,
      low,
      close,
      volume: 1_500_000 + (i % 7) * 150_000,
    });
  }
  return candles;
}

function makeRangeBoundCandles(count: number): Candle[] {
  const candles: Candle[] = [];
  const startTs = Date.UTC(2026, 2, 1);
  for (let i = 0; i < count; i++) {
    const ts = startTs + i * 86_400_000;
    const dateStr = new Date(ts).toISOString().slice(0, 10);
    const wave = Math.sin(i * 0.45) * 4.5;
    const close = Number((100 + wave).toFixed(2));
    const open = Number((100 + Math.sin((i - 1) * 0.45) * 4.5).toFixed(2));
    candles.push({
      timestamp: ts,
      dateStr,
      open,
      high: Number((Math.max(open, close) + 0.9).toFixed(2)),
      low: Number((Math.min(open, close) - 0.9).toFixed(2)),
      close,
      volume: 1_000_000,
    });
  }
  return candles;
}

test('calculateSuperKumoMpro computes Ichimoku Tenkan/Kijun, displaced Kumo, Supertrend flip, signals, and ratcheting trailStop', () => {
  const candles = makeTrendingCandles(110);
  const report = calculateSuperKumoMpro(candles);

  assert.equal(report.bars.length, candles.length);

  // Verify Tenkan(9) & Kijun(26) on the final bar match Donchian midpoints directly
  const last9 = candles.slice(-9);
  const expectedTenkan = Number(
    ((Math.max(...last9.map((c) => c.high)) + Math.min(...last9.map((c) => c.low))) / 2).toFixed(2)
  );
  const last26 = candles.slice(-26);
  const expectedKijun = Number(
    ((Math.max(...last26.map((c) => c.high)) + Math.min(...last26.map((c) => c.low))) / 2).toFixed(2)
  );

  const lastBar = report.bars[report.bars.length - 1];
  assert.equal(lastBar.tenkan, expectedTenkan);
  assert.equal(lastBar.kijun, expectedKijun);

  // Verify displaced Kumo at last bar equals SpanA/SpanB from index n-1-26
  const dispSource = report.bars[candles.length - 1 - 26];
  assert.equal(lastBar.kumoA, dispSource.spanA);
  assert.equal(lastBar.kumoB, dispSource.spanB);
  assert.equal(lastBar.kumoTop, Math.max(dispSource.spanA, dispSource.spanB));
  assert.equal(lastBar.kumoBot, Math.min(dispSource.spanA, dispSource.spanB));

  // Verify Supertrend & Dashboard trend reflect the strong uptrend at the end
  assert.equal(report.dashboard.trend, 'UP');
  assert.equal(lastBar.stDir, -1);
  assert.equal(report.dashboard.priceVsCloud, 'ABOVE');
  assert.ok(report.signals.length > 0, 'Expected directional signals on reversal + trend continuation');
  assert.ok(
    report.signals.some((s) => s.kind === 'EARLY_BUY' || s.kind === 'BUY' || s.kind === 'BUY_MORE'),
    'Expected bullish signal emission'
  );

  // Verify ratcheting long trailStop never decreases while staying in an uninterrupted long trade
  let prevLongTrail: number | null = null;
  for (let i = 1; i < report.bars.length; i++) {
    const cur = report.bars[i];
    const prev = report.bars[i - 1];
    if (cur.tradeDir === 1 && prev.tradeDir === 1 && cur.trailStop !== null && prev.trailStop !== null) {
      // Trail stop only resets on a new BUY/EARLY_BUY signal; otherwise it monotonically ratchets up
      const resetOnThisBar = report.signals.some(
        (s) => s.barIndex === i && (s.kind === 'BUY' || s.kind === 'BUY_MORE' || s.kind === 'EARLY_BUY')
      );
      if (!resetOnThisBar) {
        assert.ok(
          cur.trailStop >= prev.trailStop,
          `Long trailStop must ratchet up or hold: bar ${i} ${cur.trailStop} < ${prev.trailStop}`
        );
      }
      prevLongTrail = cur.trailStop;
    }
  }
  assert.ok(prevLongTrail !== null && prevLongTrail > 0, 'Expected active ratcheting long trail stop');
});

test('calculateSuperKumoMpro detects swing S/R zones on range-bound price action', () => {
  const rangeCandles = makeRangeBoundCandles(120);
  const report = calculateSuperKumoMpro(rangeCandles);

  assert.ok(report.zones.length >= 1, 'Expected detected S/R zones from repeated swing highs/lows');
  assert.ok(
    report.zones.some((z) => z.kind === 'S') || report.zones.some((z) => z.kind === 'R'),
    'Zones should be labeled S or R relative to spot close'
  );
  assert.ok(report.isChop === true, 'Expected ADX/flat-cloud chop filter to detect range-bound chop');
});
