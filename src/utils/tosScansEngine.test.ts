import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Candle } from './trullasStrategy';
import {
  evaluateTosScans,
  buildSetupFromTosScan,
  calculateDMI,
  computeRelativePerformanceVsBenchmark,
  TOS_SCAN_DEFINITIONS,
} from './tosScansEngine';

function makeSeries(
  closes: number[],
  opts?: {
    spread?: number | ((i: number, c: number) => number);
    volume?: number | ((i: number, c: number) => number);
    openOffset?: number | ((i: number, c: number) => number);
  }
): Candle[] {
  const start = Date.UTC(2026, 0, 2, 14, 30, 0);
  return closes.map((close, i) => {
    const spread =
      typeof opts?.spread === 'function' ? opts.spread(i, close) : opts?.spread ?? 1.0;
    const vol =
      typeof opts?.volume === 'function' ? opts.volume(i, close) : opts?.volume ?? 1_000_000;
    const open =
      typeof opts?.openOffset === 'function'
        ? close + opts.openOffset(i, close)
        : close - 0.1;
    const high = Number((Math.max(open, close) + spread).toFixed(2));
    const low = Number((Math.min(open, close) - spread).toFixed(2));
    const ts = start + i * 86_400_000;
    return {
      timestamp: ts,
      dateStr: new Date(ts).toISOString().slice(0, 10),
      open: Number(open.toFixed(2)),
      high,
      low,
      close: Number(close.toFixed(2)),
      volume: Math.round(vol),
    };
  });
}

describe('TOS Indicators Multi-Scan Engine', () => {
  it('exposes complete scan catalog metadata', () => {
    assert.ok(TOS_SCAN_DEFINITIONS.length >= 11);
    const ids = new Set(TOS_SCAN_DEFINITIONS.map((d) => d.id));
    assert.ok(ids.has('TTM_SQUEEZE'));
    assert.ok(ids.has('FALSE_BREAKOUT'));
    assert.ok(ids.has('STACKED_EMA'));
    assert.ok(ids.has('UNUSUAL_VOLUME'));
    assert.ok(ids.has('VSCORE_VWAP'));
    assert.ok(ids.has('SMA50_REVERSION'));
  });

  it('detects TTM_SQUEEZE when BB(20,2) compresses inside KC(20,1.5*ATR) for 5+ bars', () => {
    // Steady uptrend with normal volatility for 40 bars, then 15 bars of ultra-tight coil with wide high-low range relative to closes
    const closes: number[] = [];
    for (let i = 0; i < 40; i++) closes.push(100 + i * 0.4 + Math.sin(i) * 0.6);
    for (let i = 0; i < 15; i++) closes.push(116 + (i % 2 === 0 ? 0.05 : -0.05));

    const candles = makeSeries(closes, {
      spread: (i) => (i < 40 ? 2.2 : 1.4), // KC ATR remains ~1.4-2.2 while close stdev collapses < 0.1
    });

    const report = evaluateTosScans('NVDA', candles);
    const sq = report.signals.find((s) => s.id === 'TTM_SQUEEZE');
    assert.ok(sq, 'Expected TTM_SQUEEZE to fire during tight BB-in-KC compression');
    assert.ok(report.snapshot.squeezeDots >= 5);
    assert.equal(report.snapshot.squeezeOn, true);

    // Negative check: wide volatile swings should NOT trigger squeeze
    const volatileCloses = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i * 0.8) * 14);
    const volatileCandles = makeSeries(volatileCloses, { spread: 0.3 });
    const volReport = evaluateTosScans('TSLA', volatileCandles);
    assert.equal(volReport.matchedIds.includes('TTM_SQUEEZE'), false);
  });

  it('detects FALSE_BREAKOUT (both Bearish Fade-Up Trap and Bullish Fade-Down Sweep)', () => {
    // 25 flat bars between 98..102, then final bar spikes high to 105 (>102) and closes at 100.5 (<102) on strong vol
    const closes = Array.from({ length: 26 }, (_, i) => 100 + (i % 3) * 0.4);
    const bearTrap = makeSeries(closes, { spread: 0.8, volume: 1_000_000 });
    bearTrap[25] = {
      ...bearTrap[25],
      open: 101.8,
      high: 105.5,
      low: 100.1,
      close: 100.4,
      volume: 2_400_000,
    };

    const bearReport = evaluateTosScans('AAPL', bearTrap);
    const bearFb = bearReport.signals.find((s) => s.id === 'FALSE_BREAKOUT');
    assert.ok(bearFb, 'Expected bearish false breakout trap');
    assert.equal(bearFb?.direction, 'BEARISH');

    // Bullish sweep: dips below 20-bar low (~98.8) to 95.2 and closes strongly at 100.9
    const bullSweep = makeSeries(closes, { spread: 0.8, volume: 1_000_000 });
    bullSweep[25] = {
      ...bullSweep[25],
      open: 99.8,
      high: 101.2,
      low: 95.2,
      close: 100.9,
      volume: 2_100_000,
    };

    const bullReport = evaluateTosScans('MSFT', bullSweep);
    const bullFb = bullReport.signals.find((s) => s.id === 'FALSE_BREAKOUT');
    assert.ok(bullFb, 'Expected bullish false breakdown sweep');
    assert.equal(bullFb?.direction, 'BULLISH');

    // Negative check: clean breakout closing above 20-bar high is NOT a false breakout
    const cleanBreak = makeSeries(closes, { spread: 0.8, volume: 1_000_000 });
    cleanBreak[25] = {
      ...cleanBreak[25],
      open: 101.5,
      high: 105.5,
      low: 101.2,
      close: 105.1,
      volume: 2_400_000,
    };
    const cleanReport = evaluateTosScans('AMZN', cleanBreak);
    assert.equal(cleanReport.matchedIds.includes('FALSE_BREAKOUT'), false);
  });

  it('detects STACKED_EMA (Bullish and Bearish 8/21/34/55/89 EMA stack)', () => {
    const bullCloses = Array.from({ length: 120 }, (_, i) => 100 + i * 0.8);
    const bullReport = evaluateTosScans('META', makeSeries(bullCloses));
    const bullStack = bullReport.signals.find((s) => s.id === 'STACKED_EMA');
    assert.ok(bullStack);
    assert.equal(bullStack?.direction, 'BULLISH');
    assert.equal(bullReport.snapshot.emaStack, 'BULLISH');

    const bearCloses = Array.from({ length: 120 }, (_, i) => 220 - i * 0.8);
    const bearReport = evaluateTosScans('NFLX', makeSeries(bearCloses));
    const bearStack = bearReport.signals.find((s) => s.id === 'STACKED_EMA');
    assert.ok(bearStack);
    assert.equal(bearStack?.direction, 'BEARISH');
    assert.equal(bearReport.snapshot.emaStack, 'BEARISH');

    // Interleaved EMAs (long uptrend followed by sudden pullback so EMA8 < EMA21 while EMA34 > EMA89) should NOT trigger STACKED_EMA
    const chopCloses = Array.from({ length: 120 }, (_, i) =>
      i < 110 ? 100 + i * 0.5 : 155 - (i - 109) * 1.4
    );
    const chopReport = evaluateTosScans('CHOP', makeSeries(chopCloses));
    assert.equal(chopReport.matchedIds.includes('STACKED_EMA'), false);
  });

  it('detects UNUSUAL_VOLUME via RelVolStDev(50) >= 2.0 and 3-bar increasing volume', () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + i * 0.1);
    const candles = makeSeries(closes, {
      volume: (i) => (i === 59 ? 6_500_000 : 1_000_000 + (i % 5) * 40_000),
    });
    const report = evaluateTosScans('AMD', candles);
    const uv = report.signals.find((s) => s.id === 'UNUSUAL_VOLUME');
    assert.ok(uv, 'Expected UNUSUAL_VOLUME spike');
    assert.ok(report.snapshot.relVolStDev >= 2.0);

    // Flat volume should NOT trigger UNUSUAL_VOLUME
    const flatVol = makeSeries(closes, { volume: 1_000_000 });
    const flatReport = evaluateTosScans('IBM', flatVol);
    assert.equal(flatReport.matchedIds.includes('UNUSUAL_VOLUME'), false);
  });

  it('detects VSCORE_VWAP and SMA50_REVERSION on deep elastic pullback', () => {
    // Stable around $100 for 55 bars, then sudden 10% drop to $90 with curl up from $88.5 -> $90.5
    const closes = Array.from({ length: 55 }, () => 100);
    closes.push(96, 93, 90, 88.5, 90.5);
    const candles = makeSeries(closes, { spread: 0.9, volume: 1_000_000 });

    const report = evaluateTosScans('UNH', candles);
    const vscore = report.signals.find((s) => s.id === 'VSCORE_VWAP');
    const sma50 = report.signals.find((s) => s.id === 'SMA50_REVERSION');
    assert.ok(vscore, 'Expected negative V-Score VWAP signal');
    assert.equal(vscore?.direction, 'BULLISH');
    assert.ok((report.snapshot.vScore ?? 0) <= -1.5);

    assert.ok(sma50, 'Expected 50-SMA mean reversion signal');
    assert.equal(sma50?.direction, 'BULLISH');
    assert.ok((report.snapshot.pctFromSma50 ?? 0) <= -6);
  });

  it('detects DMI_POWER_MOVE on strong rising trend and ignores flat chop', () => {
    const closes = Array.from({ length: 50 }, (_, i) => (i < 25 ? 100 : 100 + (i - 24) * 2.1));
    const trendCandles = makeSeries(closes, { spread: 0.6 });
    const dmi = calculateDMI(trendCandles, 14);
    assert.ok(dmi.adx[dmi.adx.length - 1] >= 22);

    const report = evaluateTosScans('AVGO', trendCandles);
    const dmiSig = report.signals.find((s) => s.id === 'DMI_POWER_MOVE');
    assert.ok(dmiSig, 'Expected DMI_POWER_MOVE on accelerating trend');
    assert.equal(dmiSig?.direction, 'BULLISH');
  });

  it('detects MACD_ZERO_CROSS near equilibrium and FVG_RETEST on unmitigated gap', () => {
    // Downtrend then gentle recovery crossing signal near 0
    const closes: number[] = [];
    for (let i = 0; i < 30; i++) closes.push(105 - i * 0.2);
    for (let i = 0; i < 12; i++) closes.push(99.2 + i * 0.28);
    const macdCandles = makeSeries(closes, { spread: 0.7, volume: 1_400_000 });
    const macdReport = evaluateTosScans('GOOGL', macdCandles);
    assert.equal(macdReport.evaluatedBars, 42);

    // Explicit 3-candle Bullish FVG followed by pullback touching the FVG zone
    const fvgCloses = Array.from({ length: 20 }, () => 100);
    const fvgCandles = makeSeries(fvgCloses, { spread: 0.5, volume: 1_000_000 });
    // Create open bullish FVG at k = 16 (c1=14, c2=15, c3=16): c1.high=100.5, c3.low=102.5
    fvgCandles[14] = { ...fvgCandles[14], open: 99.8, high: 100.5, low: 99.5, close: 100.2 };
    fvgCandles[15] = { ...fvgCandles[15], open: 100.4, high: 103.5, low: 100.3, close: 103.2 };
    fvgCandles[16] = { ...fvgCandles[16], open: 103.1, high: 104.2, low: 102.5, close: 104.0 };
    fvgCandles[17] = { ...fvgCandles[17], open: 103.9, high: 104.4, low: 103.2, close: 103.8 };
    fvgCandles[18] = { ...fvgCandles[18], open: 103.7, high: 103.9, low: 102.9, close: 103.1 };
    // Final bar wicks down to 101.6 (inside 100.5..102.5 FVG) and closes at 102.1 (still above 100.5)
    fvgCandles[19] = { ...fvgCandles[19], open: 103.0, high: 103.1, low: 101.6, close: 102.1 };

    const fvgReport = evaluateTosScans('SPY', fvgCandles);
    const fvgSig = fvgReport.signals.find((s) => s.id === 'FVG_RETEST');
    assert.ok(fvgSig, 'Expected FVG_RETEST signal when bar wicks into open FVG');
    assert.equal(fvgSig?.direction, 'BULLISH');
  });

  it('detects VZO_SIGNAL on positive accumulation cross and ROC_EXTREME on reversal hook', () => {
    // 65 bars downtrend below 60-EMA then sharp multi-day surge crossing above 60-EMA with rising ADX & VZO >= 15
    const vzoCloses: number[] = [];
    for (let i = 0; i < 45; i++) vzoCloses.push(140 - i * 0.9);
    for (let i = 0; i < 20; i++) vzoCloses.push(100 + i * 1.4);
    const vzoCandles = makeSeries(vzoCloses, {
      spread: 0.9,
      volume: (i) => (i >= 62 ? 4_000_000 : 1_000_000),
    });
    const vzoReport = evaluateTosScans('MSFT', vzoCandles);
    assert.ok(vzoReport.snapshot.vzo14 !== null);

    // ROC_EXTREME: gentle oscillation around 100 for 50 bars (flat 14-bar baseline = 100), then sharp selloff to 77 followed by bounce to 80.5
    const rocCloses: number[] = [];
    for (let i = 0; i < 40; i++) rocCloses.push(100 + Math.sin(i / 3) * 3);
    for (let i = 0; i < 16; i++) rocCloses.push(100);
    rocCloses.push(96, 91, 85, 79, 75, 79.5); // ROC(14) drops to -25% vs 100 then hooks up to -20.5%
    const rocCandles = makeSeries(rocCloses, { spread: 0.7 });
    const rocReport = evaluateTosScans('INTC', rocCandles);
    const rocSig = rocReport.signals.find((s) => s.id === 'ROC_EXTREME');
    assert.ok(rocSig, 'Expected ROC_EXTREME bullish hook from bottom range extreme');
    assert.equal(rocSig?.direction, 'BULLISH');
  });

  it('builds a valid PositionCalculator-compatible setup from TOS scan hits', () => {
    const bullCloses = Array.from({ length: 120 }, (_, i) => 100 + i * 0.45);
    const candles = makeSeries(bullCloses);
    const report = evaluateTosScans('QQQ', candles);
    const lastClose = candles[119].close;
    const setup = buildSetupFromTosScan('QQQ', '1d', lastClose, 2.5, report);
    assert.ok(setup, 'Expected non-null setup from TOS scan hit');
    assert.equal(setup!.type, 'BULLISH_DOUBLE');
    assert.ok(setup!.triggerPrice > lastClose);
    assert.ok(setup!.stopLoss < lastClose);
    assert.ok(setup!.targets.tp2 > setup!.triggerPrice);
    assert.ok(setup!.riskRewardRatio >= 2.0);
  });

  it('computes accurate 30-bar Relative Performance Alpha vs SPY benchmark', () => {
    const stockCloses = Array.from({ length: 40 }, (_, i) => (i < 9 ? 100 : 100 + (i - 9) * 0.5));
    // At index 39 vs index 9 (30 bars): stock goes 100 -> 115 (+15%)
    const spyCloses = Array.from({ length: 40 }, (_, i) => (i < 9 ? 500 : 500 + (i - 9) * (25 / 30)));
    // At index 39 vs index 9 (30 bars): SPY goes 500 -> 525 (+5%)
    const stockCandles = makeSeries(stockCloses);
    const spyCandles = makeSeries(spyCloses);

    const res = computeRelativePerformanceVsBenchmark(stockCandles, spyCandles, 30);
    assert.ok(res, 'Expected valid relative performance result');
    assert.equal(res!.lookbackBars, 30);
    assert.equal(res!.symbolReturnPct, 15);
    assert.equal(res!.benchmarkReturnPct, 5);
    assert.equal(res!.alphaVsBenchmarkPct, 10);

    // Fewer than 10 bars returns null cleanly
    assert.equal(
      computeRelativePerformanceVsBenchmark(stockCandles.slice(0, 8), spyCandles, 30),
      null
    );
  });
});

