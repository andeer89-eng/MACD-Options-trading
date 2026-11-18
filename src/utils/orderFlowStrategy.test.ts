import test from 'node:test';
import assert from 'node:assert/strict';
import { Candle } from './trullasStrategy';
import { calculateOrderFlowStrategy, formatOfsK } from './orderFlowStrategy';

function buildSyntheticTrendAndPullback(): { candles: Candle[]; ltfCandles: Candle[] } {
  const start = Date.UTC(2026, 10, 15, 7, 0, 0);
  const candles: Candle[] = [];
  const ltfCandles: Candle[] = [];

  // Construct 90 5m bars: Stage up -> downtrend structure (lower highs/lower lows) -> rally into premium -> buyer absorption -> second failure short
  for (let i = 0; i < 90; i++) {
    const ts = start + i * 300_000;
    let base = 63200;
    if (i < 15) base = 63100 + i * 25; // Peak ~ 63450 around bar 14
    else if (i < 30) base = 63450 - (i - 15) * 45; // Drop to 62775
    else if (i < 42) base = 62775 + (i - 30) * 38; // Lower high ~ 63200
    else if (i < 60) base = 63200 - (i - 42) * 55; // Lower low ~ 62210
    else if (i < 75) base = 62210 + (i - 60) * 60; // Rally up into ~63110 premium zone
    else base = 63110 - (i - 75) * 42; // Sell-off to POC

    const isDown = (i >= 15 && i < 30) || (i >= 42 && i < 60) || i >= 78;
    const open = base;
    const close = isDown ? base - 28 : base + 24;
    const high = Math.max(open, close) + (i === 76 ? 65 : 18);
    const low = Math.min(open, close) - 18;
    const volume = i === 76 ? 3800 : 1400 + (i % 7) * 180;

    const dateStr = new Date(ts).toISOString().slice(0, 10);
    candles.push({ timestamp: ts, open, high, low, close, volume, dateStr });

    // Generate 5 lower-timeframe (1m) bars inside each 5m bar
    for (let m = 0; m < 5; m++) {
      const mTs = ts + m * 60_000;
      let mOpen = open + ((close - open) * m) / 5;
      let mClose = open + ((close - open) * (m + 1)) / 5;
      let mHigh = Math.max(mOpen, mClose) + 6;
      let mLow = Math.min(mOpen, mClose) - 6;
      let mVol = volume / 5;

      // On bar 76 (buyers absorbed at high wick), make top-wick 1m candle heavy buying while closing weak
      if (i === 76 && m === 2) {
        mOpen = high - 25;
        mClose = high - 5;
        mHigh = high;
        mLow = high - 28;
        mVol = volume * 0.65;
      }
      ltfCandles.push({
        timestamp: mTs,
        open: mOpen,
        high: mHigh,
        low: mLow,
        close: mClose,
        volume: mVol,
        dateStr: new Date(mTs).toISOString().slice(0, 10),
      });
    }
  }

  return { candles, ltfCandles };
}

test('calculateOrderFlowStrategy computes Pressure Wave, Value Area, Footprints, and Liquidity', () => {
  const { candles, ltfCandles } = buildSyntheticTrendAndPullback();
  const report = calculateOrderFlowStrategy(candles, ltfCandles, {
    symbol: 'BTC-USD',
    timeframe: '5m',
  });

  assert.equal(report.waves.length, candles.length);
  assert.ok(report.valueAreaSeries.length > 10);
  const lastVa = report.valueAreaSeries[report.valueAreaSeries.length - 1];
  assert.ok(lastVa.vaHigh >= lastVa.vaPOC && lastVa.vaPOC >= lastVa.vaLow, 'VAH >= POC >= VAL');

  assert.equal(report.footprints.length, 12, 'Renders footprint on last 12 bars');
  assert.equal(report.footprints[0].rows.length, 6, 'Splits each footprint bar into 6 rows');
  assert.equal(report.dashboard.usedLowerTimeframe, true, 'Uses provided lower-timeframe bars');
  assert.ok(report.liquidityZones.length > 0, 'Detects BSL/SSL liquidity zones');
});

test('calculateOrderFlowStrategy handles empty candles safely without NaNs', () => {
  const emptyReport = calculateOrderFlowStrategy([], [], { symbol: 'SPY', timeframe: '1d' });
  assert.equal(emptyReport.candles.length, 0);
  assert.equal(emptyReport.dashboard.structure, 0);
  assert.equal(emptyReport.dashboard.setupProgress, 0);
});

test('formatOfsK formats volume deltas cleanly', () => {
  assert.equal(formatOfsK(3600), '3.6K');
  assert.equal(formatOfsK(1_520_000), '1.5M');
  assert.equal(formatOfsK(214), '214');
});

