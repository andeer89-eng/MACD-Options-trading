import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Candle } from './trullasStrategy.ts';
import {
  preprocessPineScript,
  executePineScriptIndicator,
  pineColorToCss,
} from './pineScriptExecutor.ts';
import { BUILT_IN_INDICATORS, DEFAULT_CUSTOM_INDICATORS } from './indicatorLibrary.ts';

function makeCandles(count = 75, startPrice = 100): Candle[] {
  const start = 1_750_000_000_000;
  return Array.from({ length: count }, (_, i) => {
    const base = startPrice + Math.sin(i * 0.25) * (startPrice * 0.12) + i * (startPrice * 0.004);
    const open = base - startPrice * 0.005;
    const high = Math.max(open, base) + startPrice * 0.015;
    const low = Math.min(open, base) - startPrice * 0.015;
    return {
      timestamp: start + i * 86_400_000,
      dateStr: new Date(start + i * 86_400_000).toISOString().slice(0, 10),
      open: Number(open.toFixed(6)),
      high: Number(high.toFixed(6)),
      low: Number(low.toFixed(6)),
      close: Number(base.toFixed(6)),
      volume: 100_000 + i * 2_500,
    };
  });
}

describe('pineScriptExecutor universal TradingView runtime', () => {
  it('converts Pine hex colors with alpha and preserves strings during preprocessing', () => {
    assert.equal(pineColorToCss('#4CAF5033'), 'rgba(76, 175, 80, 0.20)');
    assert.equal(pineColorToCss('#F23645'), '#F23645');
    assert.equal(pineColorToCss('transparent'), 'rgba(0, 0, 0, 0)');

    const raw = `//@version=4
study("color.cyan study(keep me)", overlay=false)
// color.emerald in comment
e = ema(close, 14)
plot(e, "EMA", color=color.cyan)`;
    const prep = preprocessPineScript(raw);
    assert.ok(prep.includes('//@version=5'));
    assert.ok(prep.includes('indicator("color.cyan study(keep me)", overlay=false)'));
    assert.ok(prep.includes('ta.ema(close, 14)'));
    assert.ok(prep.includes('color.aqua'));
    // String literal & comment remain intact
    assert.ok(prep.includes('"color.cyan study(keep me)"'));
    assert.ok(prep.includes('// color.emerald in comment'));
  });

  it('executes rich v6 Pine scripts extracting multi-color plots, fills, shapes, hlines, boxes, labels & tables', async () => {
    const candles = makeCandles(70, 120);
    const pineCode = `//@version=6
indicator("Complete Suite", overlay=true)
fast = ta.ema(close, 9)
slow = ta.ema(close, 21)
p1 = plot(fast, "Fast", color=fast > slow ? color.emerald : color.rose, linewidth=2)
p2 = plot(slow, "Slow", color=color.sky)
fill(p1, p2, color=fast > slow ? color.new(color.green, 80) : color.new(color.red, 80))
plotshape(ta.crossover(fast, slow), "Cross Up", shape.triangleup, location.belowbar, color.lime, text="BUY")
bgcolor(fast > slow ? color.new(color.green, 92) : color.new(color.red, 92))
hline(125, "Pivot Level", color=color.gold)
if barstate.islast
    box.new(bar_index - 6, high + 2, bar_index, high, border_color=color.red, bgcolor=color.new(color.red, 85), text="RES")
    label.new(bar_index, high, "TIP", color=color.blue, textcolor=color.white)
    var t = table.new(position.top_right, 2, 1, border_color=color.blue, border_width=1)
    table.cell(t, 0, 0, "Trend", text_color=color.white)
    table.cell(t, 1, 0, fast > slow ? "BULL" : "BEAR", text_color=color.green)
`;

    const res = await executePineScriptIndicator(
      { id: 'custom-pine-suite', name: 'Complete Suite', overlay: false, pineCode },
      candles
    );

    assert.equal(res.ok, true, `Expected execution success, got error: ${res.error}`);
    assert.equal(res.overlay, true, 'Must honor overlay=true from indicator(...)');
    assert.ok(res.plots.length >= 2, 'Must extract numeric plots');

    const fastPlot = res.plots.find((p) => p.name === 'Fast');
    assert.ok(fastPlot && fastPlot.points.length > 20);
    const distinctColors = new Set(fastPlot.points.map((pt) => pt.color).filter(Boolean));
    assert.ok(distinctColors.size >= 2, 'Dynamic per-bar plot color switching must be preserved');

    assert.ok(res.fills.length >= 1 && res.fills[0].points.length > 10, 'Must extract fill clouds');
    assert.ok(res.shapes.length >= 1, 'Must extract plotshape triggers');
    assert.ok(res.hlines.length >= 1 && res.hlines[0].price === 125, 'Must extract hline');
    assert.ok(res.bgBands.length > 10, 'Must extract bgcolor bands');
    assert.ok(res.boxes.length >= 1 && res.boxes[0].text === 'RES', 'Must extract boxes');
    assert.ok(res.labels.length >= 1 && res.labels[0].text === 'TIP', 'Must extract labels');
    assert.ok(res.tables.length >= 1 && res.tables[0].cells[0][0].text === 'Trend', 'Must extract tables');
  });

  it('runs legacy //@version=4 study(...) oscillators cleanly in sub-pane mode', async () => {
    const candles = makeCandles(65, 50);
    const v4Code = `//@version=4
study("Legacy v4 RSI", overlay=false)
r = rsi(close, 14)
plot(r, "RSI", color=color.cyan, linewidth=2)
hline(70, "OB", color=color.red)
hline(30, "OS", color=color.green)
`;

    const res = await executePineScriptIndicator(
      { id: 'custom-pine-v4', name: 'Legacy v4 RSI', overlay: true, pineCode: v4Code },
      candles
    );

    assert.equal(res.ok, true, `v4 script failed: ${res.error}`);
    assert.equal(res.overlay, false);
    assert.equal(res.plots.length, 1);
    assert.ok(res.plots[0].points.every((p) => p.value >= 0 && p.value <= 100));
    assert.equal(res.hlines.length, 2);
  });

  it('extracts strategy() execution markers and returns explicit error on broken Pine code', async () => {
    const candles = makeCandles(60, 100);
    const stratCode = `//@version=6
strategy("MA Cross", overlay=true)
f = ta.ema(close, 5)
s = ta.ema(close, 18)
plot(f, "Fast", color=color.aqua)
plot(s, "Slow", color=color.orange)
if ta.crossover(f, s)
    strategy.entry("L", strategy.long)
if ta.crossunder(f, s)
    strategy.close("L")
`;

    const okRes = await executePineScriptIndicator(
      { id: 'custom-strat', name: 'MA Cross', overlay: true, pineCode: stratCode },
      candles
    );
    assert.equal(okRes.ok, true);
    assert.ok(okRes.plots.length >= 2);
    assert.ok(okRes.strategyTrades.length >= 1, 'Must emit strategy entry/exit markers');

    const badRes = await executePineScriptIndicator(
      { id: 'custom-bad', name: 'Broken', overlay: true, pineCode: '//@version=6\nindicator("Bad")\nx = ((' },
      candles
    );
    assert.equal(badRes.ok, false);
    assert.ok(badRes.error && badRes.error.length > 0);
  });

  it('executes every built-in and default custom indicator from indicatorLibrary without error', async () => {
    const candles = makeCandles(90, 180);
    const all = [...BUILT_IN_INDICATORS, ...DEFAULT_CUSTOM_INDICATORS];

    const trendCloud = all.find((i) => i.id === 'trendcloud-pro');
    const stPro = all.find((i) => i.id === 'supertrend-v9-pro');
    assert.equal(trendCloud?.overlay, true);
    assert.equal(stPro?.overlay, true);

    for (const ind of all) {
      const res = await executePineScriptIndicator(ind, candles, { symbol: 'AAPL', timeframe: '1d' });
      assert.equal(res.ok, true, `Indicator "${ind.id}" failed: ${res.error}`);
      assert.ok(
        res.plots.length > 0 || res.shapes.length > 0,
        `Indicator "${ind.id}" produced neither plots nor shapes`
      );
    }
  });
});

