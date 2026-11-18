import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Candle } from './trullasStrategy.ts';
import { calculateSuperTrendPro } from './superTrendPro.ts';

function makeWaveCandles(): Candle[] {
  const out: Candle[] = [];
  const startTs = 1_760_000_000_000;
  // Phase 1: downtrend 60 bars (120 -> 70)
  // Phase 2: strong uptrend 70 bars (70 -> 145)
  // Phase 3: sharp reversal downtrend 35 bars (145 -> 95)
  let price = 120;
  for (let i = 0; i < 165; i++) {
    if (i < 60) {
      price -= 0.85 + Math.sin(i * 0.4) * 0.6;
    } else if (i < 130) {
      price += 1.15 + Math.sin(i * 0.35) * 0.7;
    } else {
      price -= 1.45 + Math.cos(i * 0.45) * 0.8;
    }
    const open = price + (i < 60 || i >= 130 ? 0.6 : -0.6);
    const high = Math.max(open, price) + 1.4;
    const low = Math.min(open, price) - 1.4;
    const volume = i === 62 || i === 132 ? 2_800_000 : 850_000 + (i % 7) * 50_000;
    out.push({
      timestamp: startTs + i * 86_400_000,
      dateStr: new Date(startTs + i * 86_400_000).toISOString().slice(0, 10),
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(price.toFixed(2)),
      volume,
    });
  }
  return out;
}

describe('superTrendPro calculation engine', () => {
  it('handles empty candle array safely without throwing or emitting NaN', () => {
    const empty = calculateSuperTrendPro([], { symbol: 'SIVE', timeframe: '1d' });
    assert.equal(empty.series.length, 0);
    assert.equal(empty.signals.length, 0);
    assert.equal(empty.dashboard.symbol, 'SIVE');
    assert.equal(empty.dashboard.ema20, null);
    assert.equal(empty.dashboard.ema50, null);
    assert.equal(empty.dashboard.ema200, null);
  });

  it('switches trend between UPTREND and DOWNTREND and emits Buy/Sell signals', () => {
    const candles = makeWaveCandles();
    const report = calculateSuperTrendPro(candles, { symbol: 'SIVE', timeframe: '1d' });

    assert.equal(report.series.length, candles.length);
    const hasBull = report.series.some((p) => p.trend === 1);
    const hasBear = report.series.some((p) => p.trend === -1);
    assert.ok(hasBull, 'Must detect uptrend bars');
    assert.ok(hasBear, 'Must detect downtrend bars');

    const buySignals = report.signals.filter((s) => s.kind === 'BUY');
    const sellSignals = report.signals.filter((s) => s.kind === 'SELL');
    assert.ok(buySignals.length >= 1, 'Must emit at least one BUY signal on bullish flip');
    assert.ok(sellSignals.length >= 1, 'Must emit at least one SELL signal on bearish flip');

    // Final phase drops sharply -> dashboard should reflect DOWNTREND
    assert.equal(report.dashboard.isBull, false);
    assert.equal(report.dashboard.trendLabel, '▼ DOWNTREND');
    assert.ok(report.dashboard.ema20 !== null && Number.isFinite(report.dashboard.ema20));
    assert.ok(report.dashboard.ema50 !== null && Number.isFinite(report.dashboard.ema50));
    assert.ok(report.dashboard.ema200 !== null && Number.isFinite(report.dashboard.ema200));
    assert.ok(report.dashboard.rsi >= 0 && report.dashboard.rsi <= 100);
  });

  it('produces valid SUPPORT & RESISTANCE horizontal zones and MTF swing tags', () => {
    const candles = makeWaveCandles();
    const report = calculateSuperTrendPro(candles, { symbol: 'AAPL', timeframe: '1d' });

    assert.ok(report.resistanceZone, 'Must identify active RESISTANCE zone');
    assert.ok(report.supportZone, 'Must identify active SUPPORT zone');
    assert.ok(report.resistanceZone.top >= report.resistanceZone.bot);
    assert.ok(report.supportZone.top >= report.supportZone.bot);
    assert.ok(
      report.resistanceZone.bot > report.supportZone.top,
      'Resistance zone should sit above Support zone'
    );
    assert.ok(report.mtfTags.length >= 1, 'Must emit at least one MTF tag (1D/2D/1W/1M)');
  });

  it('preserves positive finite values on sub-dollar instruments and invalid ATR inputs', () => {
    const subDollar = makeWaveCandles().map((c) => ({
      ...c,
      open: c.open * 0.002,
      high: c.high * 0.002,
      low: c.low * 0.002,
      close: c.close * 0.002,
    }));
    const report = calculateSuperTrendPro(subDollar, { atrPeriod: 0, atrMult: 2.5 });
    assert.equal(report.series.length, subDollar.length);
    for (const pt of report.series) {
      assert.ok(Number.isFinite(pt.supertrend) && pt.supertrend > 0);
      assert.ok(Number.isFinite(pt.ema20) && pt.ema20 > 0);
      assert.ok(Number.isFinite(pt.ema200) && pt.ema200 > 0);
    }
  });
});
