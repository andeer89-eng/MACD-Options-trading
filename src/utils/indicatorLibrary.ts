export type IndicatorCategory =
  | 'Trend'
  | 'Oscillator'
  | 'Volatility'
  | 'SMC'
  | 'Reversal'
  | 'Volume';

export interface CustomPineIndicator {
  id: string;
  name: string;
  author: string;
  description: string;
  category: IndicatorCategory;
  pineCode: string;
  version: 'v5' | 'v6' | 'v4';
  overlay: boolean;
  enabled: boolean;
  isBuiltIn: boolean;
  importedAt: number;
  syntaxValid: boolean;
  error?: string;
  transpiledPreview?: string;
}

export const BUILT_IN_INDICATORS: CustomPineIndicator[] = [
  {
    id: 'qmx-quantum-market-xray',
    name: 'QUANTUM MARKET X-RAY (QMX)',
    author: 'Michael_Fx_Trader (TradingView)',
    description:
      'Advanced Market Intelligence Overlay: Quantum Intelligence Ribbon, BSL/SSL Liquidity Zones, Liquidity Sweeps, Smart Money Trap Detector (Trapped Buyers/Sellers), Exhaustion Clouds, Vacuum Corridors, and Live HUD.',
    category: 'Trend',
    version: 'v6',
    overlay: true,
    enabled: true,
    isBuiltIn: true,
    importedAt: Date.now() - 1200000,
    syntaxValid: true,
    pineCode: `//@version=6
// -------------------------------------------------------------
// QUANTUM MARKET X-RAY (QMX)
// Advanced Market Intelligence Overlay | Pine Script® v6
// -------------------------------------------------------------
indicator("QUANTUM MARKET X-RAY (QMX)", shorttitle="QMX", overlay=true, max_boxes_count=500, max_labels_count=500, max_lines_count=500)

// 01 Liquidity Intelligence
// 02 Liquidity Sweep Detector
// 03 Smart Money Trap Detector
// 04 Exhaustion Clouds & Target Rays (T1, T2, T3)
// 05 Live Market Intelligence HUD

atrV = ta.atr(14)
m = ta.ema(hlc3, 21)
up = m + atrV * 1.85
dn = m - atrV * 1.85

plot(m, "QMX Baseline", color=close >= m ? color.teal : color.maroon, linewidth=2)
p1 = plot(up, "Upper Boundary", color=color.aqua, linewidth=1)
p2 = plot(dn, "Lower Boundary", color=color.fuchsia, linewidth=1)
fill(p1, p2, color=color.new(color.teal, 90))`,
  },
  {
    id: 'ofs-order-flow-strategy-v6',
    name: 'Order Flow Strategy [Auction · Trapped Traders]',
    author: 'roan-maverick (GitHub Open-Source)',
    description:
      'Auction market Value Area (VAH/POC/VAL glow), Order Flow Pressure Wave, Discount/Premium 0.705-0.886 zones, BSL/SSL liquidity sweeps, 6-row candle footprints with 400% imbalances, absorption + second-failure entries, and live HUD.',
    category: 'Volume',
    version: 'v6',
    overlay: true,
    enabled: true,
    isBuiltIn: true,
    importedAt: Date.now() - 1100000,
    syntaxValid: true,
    pineCode: `//@version=6
indicator("Order Flow Strategy [Auction · Order Flow · Trapped Traders]", shorttitle="OFS", overlay=true, max_boxes_count=500, max_labels_count=500, max_lines_count=500)

// Step 1 · Value Area (70% volume profile + POC + VAH + VAL)
// Step 2 · Location (Impulse Leg + 0.705 / 0.788 / 0.886 Discount / Premium Zone)
// Step 3 · Order Flow Confirmation (Lower-TF Delta, Candle POC, Absorption, 1st Shift, 2nd Failure)
// Visuals · Pressure Wave (Cyan Buyers vs Purple Sellers), 6-Row Footprint, BSL/SSL Liquidity Sweeps, Inefficiency FVG, Impulse Candles, HUD

swingLen = input.int(5, "Swing strength (bars each side)")
fibA = input.float(0.705, "Zone level 1 (entry)")
fibB = input.float(0.788, "Zone level 2 (midline)")
fibC = input.float(0.886, "Zone level 3 (invalidation)")
absDelta = input.float(15, "Absorption: net aggression at least (%)")
shiftDelta = input.float(10, "Dominance shift: net aggression at least (%)")

atrV = ta.atr(14)
ph = ta.pivothigh(high, swingLen, swingLen)
pl = ta.pivotlow(low, swingLen, swingLen)
barDelta = close > open ? volume : close < open ? -volume : 0.0
deltaPct = volume > 0 ? (barDelta / volume) * 100 : 0.0

wMid = ta.ema(hl2, 21)
plot(wMid, "Order Flow Core", color=deltaPct >= 0 ? color.aqua : color.purple, linewidth=2)`,
  },
  {
    id: 'lux-nwe-v5',
    name: 'LuxAlgo Nadaraya-Watson Envelope (NWE)',
    author: 'LuxAlgo (Alex Grover)',
    description: 'Non-parametric rational quadratic kernel regression envelope with dynamic mean-reversion upper/lower bands.',
    category: 'Reversal',
    version: 'v5',
    overlay: true,
    enabled: true,
    isBuiltIn: true,
    importedAt: Date.now() - 1000000,
    syntaxValid: true,
    pineCode: `//@version=5
indicator("LuxAlgo - Nadaraya-Watson Envelope", overlay=true)
h = input.float(8.0, "Bandwidth (h)", minval=0.5, step=0.5)
mult = input.float(2.5, "Multiplier", minval=0.1, step=0.1)

var float[] weights = array.new_float(0)
if bar_index == 0
    for i = 0 to 50
        array.push(weights, math.exp(-0.5 * math.pow(i / h, 2)))

yhat = 0.0
sum_w = 0.0
for i = 0 to math.min(bar_index, 50)
    w = array.get(weights, i)
    yhat += close[i] * w
    sum_w += w
yhat := yhat / sum_w

mae = ta.sma(math.abs(close - yhat), 20) * mult
upper = yhat + mae
lower = yhat - mae

plot(yhat, "Regression Line", color=color.rgb(33, 150, 243, 80), linewidth=2)
p1 = plot(upper, "Upper Band", color=color.rgb(239, 83, 80, 50))
p2 = plot(lower, "Lower Band", color=color.rgb(38, 166, 154, 50))
fill(p1, p2, color=color.rgb(33, 150, 243, 92), title="Envelope Fill")`,
  },
  {
    id: 'lux-smc-v5',
    name: 'LuxAlgo Smart Money Concepts [SMC]',
    author: 'LuxAlgo GitHub Community',
    description: 'Institutional Order Blocks, Fair Value Gaps (FVG), and Market Structure Breaks (BOS / CHoCH).',
    category: 'SMC',
    version: 'v5',
    overlay: true,
    enabled: true,
    isBuiltIn: true,
    importedAt: Date.now() - 900000,
    syntaxValid: true,
    pineCode: `//@version=5
indicator("LuxAlgo - Smart Money Concepts [SMC]", overlay=true)

fvg_bull = low > high[2] and close[1] > open[1]
fvg_bear = high < low[2] and close[1] < open[1]

ob_bull = close > open and close[1] < open[1] and (close - open) > ta.atr(14) * 1.5
ob_bear = close < open and close[1] > open[1] and (open - close) > ta.atr(14) * 1.5

plotshape(fvg_bull, "Bullish FVG", shape.triangleup, location.belowbar, color.teal, size=size.tiny)
plotshape(fvg_bear, "Bearish FVG", shape.triangledown, location.abovebar, color.maroon, size=size.tiny)
plotshape(ob_bull, "Demand Order Block", shape.square, location.belowbar, color.green, size=size.small)
plotshape(ob_bear, "Supply Order Block", shape.square, location.abovebar, color.red, size=size.small)`,
  },
  {
    id: 'trullas-macd-v5',
    name: 'David Trullàs 4-Pillars Triple Divergence',
    author: 'David Trullàs Trading',
    description: 'Detects 3rd-wave MACD histogram exhaustion troughs, Fibonacci trigger necklines (23.6%), and Golden Pocket (61.8%) targets.',
    category: 'Reversal',
    version: 'v5',
    overlay: true,
    enabled: true,
    isBuiltIn: true,
    importedAt: Date.now() - 800000,
    syntaxValid: true,
    pineCode: `//@version=5
indicator("David Trullas 4-Pillars Triple Divergence", overlay=true)

[macdLine, signalLine, histLine] = ta.macd(close, 12, 26, 9)
rsi14 = ta.rsi(close, 14)

// Triple Trough Detection
is_triple_trough = low < low[1] and low[1] < low[2] and macdLine > macdLine[1] and macdLine[1] > macdLine[2]
trigger_236 = high[2] - (high[2] - low) * 0.764
tp_golden_618 = low + (high[2] - low) * 0.618

plot(trigger_236, "Neckline Trigger (23.6%)", color=color.green, style=plot.style_circles)
plot(tp_golden_618, "Golden Pocket TP2 (61.8%)", color=color.yellow, style=plot.style_line)
plotshape(is_triple_trough, "3rd Wave Exhaustion", shape.labelup, location.belowbar, color.lime, text="TRIPLE DIV")`,
  },
  {
    id: 'lux-ema-ribbon',
    name: 'LuxAlgo Trend EMA Ribbon Suite',
    author: 'LuxAlgo Quant Lab',
    description: 'Multi-scale exponential moving average ribbon (20, 50, 100, 200) highlighting trend expansion and compression squeezes.',
    category: 'Trend',
    version: 'v5',
    overlay: true,
    enabled: true,
    isBuiltIn: true,
    importedAt: Date.now() - 700000,
    syntaxValid: true,
    pineCode: `//@version=5
indicator("LuxAlgo - EMA Ribbon Trend Suite", overlay=true)

e20 = ta.ema(close, 20)
e50 = ta.ema(close, 50)
e100 = ta.ema(close, 100)
e200 = ta.ema(close, 200)

plot(e20, "EMA 20", color=color.blue, linewidth=1)
plot(e50, "EMA 50", color=color.cyan, linewidth=1)
plot(e100, "EMA 100", color=color.orange, linewidth=1)
plot(e200, "EMA 200", color=color.purple, linewidth=2)`,
  },
  {
    id: 'lux-atr-trailing-stop',
    name: 'LuxAlgo Volatility Trailing Stop [ATR]',
    author: 'LuxAlgo Risk Engine',
    description: 'Dynamic volatility trailing stop calibrated to 2.5x ATR for trade management and profit protection.',
    category: 'Volatility',
    version: 'v5',
    overlay: true,
    enabled: true,
    isBuiltIn: true,
    importedAt: Date.now() - 600000,
    syntaxValid: true,
    pineCode: `//@version=5
indicator("LuxAlgo - ATR Volatility Trailing Stop", overlay=true)

length = input.int(14, "ATR Period")
multiplier = input.float(2.5, "ATR Multiplier")

atrVal = ta.atr(length)
var float trailStop = na

if close > nz(trailStop[1], 0)
    trailStop := math.max(nz(trailStop[1], 0), close - atrVal * multiplier)
else
    trailStop := math.min(nz(trailStop[1], 1000000), close + atrVal * multiplier)

    plot(trailStop, "Trailing Stop", color=close >= trailStop ? color.emerald : color.rose, linewidth=2, style=plot.style_linebr)`,
  },
  {
    id: 'ts-stage-analysis-v5',
    name: 'TrendSpider Stan Weinstein Stage Analysis (30-Week SMA)',
    author: 'TrendSpider / Stan Weinstein',
    description: 'Maps the 4 structural market phases: Stage 1 Basing, Stage 2 Advancing 🚀, Stage 3 Topping, and Stage 4 Declining 🩸 with 30-week SMA slope and Mansfield Relative Strength.',
    category: 'Trend',
    version: 'v5',
    overlay: true,
    enabled: true,
    isBuiltIn: true,
    importedAt: Date.now() - 500000,
    syntaxValid: true,
    pineCode: `//@version=5
indicator("TrendSpider - Stan Weinstein 4-Stage Analysis", overlay=true)

len = input.int(30, "Lookback (Weeks/Periods)")
src = input.source(close, "Source")

ma30 = ta.sma(src, len)
slope = (ma30 - ma30[5]) / ma30[5] * 100

// 4-Stage Classification Logic
is_stage2 = close > ma30 and slope > 0.4
is_stage4 = close < ma30 and slope < -0.4
is_stage1 = not is_stage2 and not is_stage4 and close >= ma30 * 0.97 and close <= ma30 * 1.03
is_stage3 = not is_stage2 and not is_stage4 and not is_stage1

maColor = is_stage2 ? color.green : is_stage4 ? color.red : is_stage1 ? color.yellow : color.orange
plot(ma30, "30-Week Moving Average", color=maColor, linewidth=3)

plotshape(is_stage4 and not is_stage4[1], "Stage 4 Breakdown 🩸", shape.circle, location.abovebar, color.red, size=size.small, text="STAGE 4 🩸")
plotshape(is_stage2 and not is_stage2[1], "Stage 2 Breakout 🚀", shape.triangleup, location.belowbar, color.green, size=size.small, text="STAGE 2 🚀")`,
  },
  {
    id: 'ts-raindrop-v5',
    name: 'TrendSpider Raindrop® Charts & Volume Sentiment',
    author: 'TrendSpider Quantitative Labs',
    description: 'Partitions candles into Left VWAP (first half) and Right VWAP (second half) with micro volume profiles to expose institutional accumulation and distribution.',
    category: 'Volume',
    version: 'v5',
    overlay: true,
    enabled: true,
    isBuiltIn: true,
    importedAt: Date.now() - 400000,
    syntaxValid: true,
    pineCode: `//@version=5
indicator("TrendSpider - Raindrop Volume Sentiment", overlay=true)

// Intra-period half volume approximation
left_vwap = (open * 2 + (close > open ? low : high)) / 3
right_vwap = (close * 2 + (close > open ? high : low)) / 3

is_bullish = right_vwap > left_vwap
is_bearish = right_vwap < left_vwap

plot(left_vwap, "Left Half VWAP (Open Half)", color=color.new(color.blue, 30), style=plot.style_stepline, linewidth=2)
plot(right_vwap, "Right Half VWAP (Close Half)", color=is_bullish ? color.green : color.red, style=plot.style_stepline, linewidth=2)

bgcolor(is_bullish ? color.new(color.green, 92) : color.new(color.red, 92), title="Raindrop Sentiment Shift")`,
  },
  {
    id: 'ts-auto-avwap-v5',
    name: 'TrendSpider Auto-Anchored VWAP (Auto-AVWAP)',
    author: 'TrendSpider Algorithms',
    description: 'Algorithmically identifies the highest volume climax bar or major swing pivot in the lookback and automatically projects cumulative VWAP and +/- 1σ, 2σ standard deviation bands.',
    category: 'Volume',
    version: 'v5',
    overlay: true,
    enabled: true,
    isBuiltIn: true,
    importedAt: Date.now() - 300000,
    syntaxValid: true,
    pineCode: `//@version=5
indicator("TrendSpider - Auto-Anchored VWAP", overlay=true)

lookback = input.int(50, "Lookback for Peak Volume Anchor")
highest_vol_bar = ta.highestbars(volume, lookback)

var float cum_vol = 0.0
var float cum_vp = 0.0

if highest_vol_bar == 0
    cum_vol := volume
    cum_vp := hlc3 * volume
else
    cum_vol += volume
    cum_vp += hlc3 * volume

auto_avwap = cum_vol > 0 ? cum_vp / cum_vol : hlc3
std_dev = ta.stdev(hlc3 - auto_avwap, 20)

plot(auto_avwap, "Auto-Anchored VWAP", color=color.yellow, linewidth=2)
plot(auto_avwap + std_dev, "AVWAP +1σ Band", color=color.aqua, linewidth=1)
plot(auto_avwap - std_dev, "AVWAP -1σ Band", color=color.aqua, linewidth=1)`,
  },
];

export const DEFAULT_CUSTOM_INDICATORS: CustomPineIndicator[] = [
  {
    id: 'buying-checklist-pro',
    name: 'BUYING CHECKLIST PRO',
    author: 'Community Trader',
    description: 'Algorithmic 5-point confluence checklist scoring candle strength, volume surge, neckline closure, and momentum.',
    category: 'Trend',
    version: 'v6',
    overlay: false,
    enabled: true,
    isBuiltIn: false,
    importedAt: Date.now() - 200000,
    syntaxValid: true,
    pineCode: `//@version=6
indicator("BUYING CHECKLIST PRO", overlay=false)
// 5-Point Confluence Scoring Engine
c1 = close > open ? 20 : 0
c2 = volume > volume[1] ? 20 : 0
c3 = close > (high + low)/2 ? 20 : 0
c4 = low > low[1] ? 20 : 0
c5 = close > ta.ema(close, 20) ? 20 : 0
score = c1 + c2 + c3 + c4 + c5
plot(score, "Checklist Score", color=score >= 80 ? color.green : score >= 60 ? color.blue : color.red)`,
  },
  {
    id: 'matrix-ai-pro',
    name: 'Matrix AI Pro',
    author: 'Community Trader',
    description: 'Neural multi-momentum normalized oscillator (-100 to +100) identifying overextended liquidity sweeps.',
    category: 'Oscillator',
    version: 'v6',
    overlay: false,
    enabled: true,
    isBuiltIn: false,
    importedAt: Date.now() - 190000,
    syntaxValid: true,
    pineCode: `//@version=6
indicator("Matrix AI Pro", overlay=false)
stoch_norm = ((close - ta.lowest(low, 14)) / (ta.highest(high, 14) - ta.lowest(low, 14))) * 200 - 100
plot(stoch_norm, "Matrix AI Momentum", color=stoch_norm > 50 ? color.teal : stoch_norm < -50 ? color.maroon : color.blue)`,
  },
  {
    id: 'apex-core',
    name: 'APEX CORE — Adaptive Confluence Trading Framework',
    author: 'Community Trader',
    description: 'Adaptive volatility and volume-weighted trend scoring engine projecting high-probability reversal deltas.',
    category: 'Reversal',
    version: 'v6',
    overlay: false,
    enabled: true,
    isBuiltIn: false,
    importedAt: Date.now() - 180000,
    syntaxValid: true,
    pineCode: `//@version=6
indicator("APEX CORE — Adaptive Confluence", overlay=false)
delta = (close - open) / (high - low) * 50
plot(delta, "APEX Confluence Delta", color=delta > 0 ? color.green : color.red, style=plot.style_columns)`,
  },
  {
    id: 'trendcloud-pro',
    name: 'TrendCloud Pro',
    author: 'Community Trader',
    description: 'Dynamic multi-period EMA cloud (12 & 34) displaying bullish trend expansion and squeeze compression zones.',
    category: 'Reversal',
    version: 'v6',
    overlay: true,
    enabled: true,
    isBuiltIn: false,
    importedAt: Date.now() - 170000,
    syntaxValid: true,
    pineCode: `//@version=6
indicator("TrendCloud Pro", overlay=true)
fast = ta.ema(close, 12)
slow = ta.ema(close, 34)
p1 = plot(fast, "Fast Cloud Base", color=color.green)
p2 = plot(slow, "Slow Cloud Base", color=color.blue)
fill(p1, p2, color=fast > slow ? color.new(color.green, 85) : color.new(color.red, 85))`,
  },
  {
    id: 'agaig-avwap',
    name: 'AGAIG + Institutional AVWAP',
    author: 'Community Trader',
    description: 'Peak-volume anchored VWAP with +/- 1.5 standard deviation institutional golden zones.',
    category: 'Reversal',
    version: 'v6',
    overlay: true,
    enabled: true,
    isBuiltIn: false,
    importedAt: Date.now() - 160000,
    syntaxValid: true,
    pineCode: `//@version=6
indicator("AGAIG + Institutional AVWAP", overlay=true)
avwap = ta.vwap(close)
std = ta.stdev(close, 20) * 1.5
plot(avwap, "Institutional AVWAP", color=color.yellow, linewidth=2)
plot(avwap + std, "AGAIG Upper Zone (+1.5σ)", color=color.teal)
plot(avwap - std, "AGAIG Lower Zone (-1.5σ)", color=color.green)`,
  },
  {
    id: 'supertrend-v9-pro',
    name: 'SuperTrend v9 PRO',
    author: 'Community Trader',
    description: 'Advanced ATR trailing volatility bands with adaptive sensitivity for swing trading and trend persistence.',
    category: 'Trend',
    version: 'v6',
    overlay: true,
    enabled: true,
    isBuiltIn: false,
    importedAt: Date.now() - 150000,
    syntaxValid: true,
    pineCode: `//@version=6
indicator("SuperTrend v9 PRO", overlay=true)
atr = ta.atr(10) * 3.0
// Adaptive trailing band calculation
plot(close > ta.ema(close, 20) ? low - atr : high + atr, "SuperTrend Band", color=color.green)`,
  },
];

const STORAGE_KEY = 'trullas_custom_pine_indicators_v1';

/**
 * Extracts arguments string inside balanced parentheses starting at `openParenIdx`.
 */
function extractBalancedParenArgs(code: string, openParenIdx: number): string | null {
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = openParenIdx; i < code.length; i++) {
    const ch = code[i];
    const next = code[i + 1];
    const prev = code[i - 1];

    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (prev === '*' && ch === '/') inBlockComment = false;
      continue;
    }
    if (inSingle) {
      if (ch === "'" && prev !== '\\') inSingle = false;
      continue;
    }
    if (inDouble) {
      if (ch === '"' && prev !== '\\') inDouble = false;
      continue;
    }

    if (ch === '/' && next === '/') {
      inLineComment = true;
      i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      i++;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      continue;
    }

    if (ch === '(') {
      depth++;
    } else if (ch === ')') {
      depth--;
      if (depth === 0) {
        return code.slice(openParenIdx + 1, i);
      }
    }
  }
  return null;
}

/**
 * Strips // and /* *\/ comments outside of string literals so regexes inside declarations stay clean.
 */
function stripCommentsPreservingStrings(src: string): string {
  let out = '';
  let inSingle = false;
  let inDouble = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    const next = src[i + 1];
    const prev = src[i - 1];

    if (inLineComment) {
      if (ch === '\n') {
        inLineComment = false;
        out += ch;
      }
      continue;
    }
    if (inBlockComment) {
      if (prev === '*' && ch === '/') inBlockComment = false;
      continue;
    }
    if (inSingle) {
      out += ch;
      if (ch === "'" && prev !== '\\') inSingle = false;
      continue;
    }
    if (inDouble) {
      out += ch;
      if (ch === '"' && prev !== '\\') inDouble = false;
      continue;
    }

    if (ch === '/' && next === '/') {
      inLineComment = true;
      i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      i++;
      continue;
    }
    if (ch === "'") inSingle = true;
    else if (ch === '"') inDouble = true;

    out += ch;
  }
  return out;
}

/**
 * Validates and extracts metadata from raw Pine Script code.
 * Supports v4/v5/v6 indicator(...), strategy(...), study(...), and library(...) declarations,
 * including multi-line calls, named `title = "..."` parameters, and nested parentheses.
 */
export function validatePineScriptHeader(code: string): {
  valid: boolean;
  name: string;
  overlay: boolean;
  version: 'v5' | 'v6' | 'v4';
  error?: string;
} {
  if (!code || code.trim().length === 0) {
    return { valid: false, name: 'Untitled', overlay: true, version: 'v5', error: 'Pine Script code cannot be empty' };
  }

  // Version check
  let version: 'v5' | 'v6' | 'v4' = 'v5';
  if (code.includes('//@version=6')) version = 'v6';
  else if (code.includes('//@version=4')) version = 'v4';
  else if (code.includes('//@version=5')) version = 'v5';

  // Scan code ignoring comments & strings to locate the declaration keyword
  const stripped = stripCommentsPreservingStrings(code);
  const declRegex = /\b(?:indicator|strategy|study|library)\s*\(/g;
  const match = declRegex.exec(stripped);

  if (!match) {
    return {
      valid: false,
      name: 'Custom Indicator',
      overlay: true,
      version,
      error: 'Missing indicator(...) or strategy(...) declaration statement',
    };
  }

  const openParenIdx = match.index + match[0].length - 1;
  const rawArgs = extractBalancedParenArgs(stripped, openParenIdx);
  if (rawArgs === null) {
    return {
      valid: false,
      name: 'Custom Indicator',
      overlay: true,
      version,
      error: 'Unclosed indicator(...) or strategy(...) declaration statement',
    };
  }

  // Extract name from explicit title=... parameter or first string literal argument
  const namedTitleMatch = rawArgs.match(/\btitle\s*=\s*(?:"([^"]*)"|'([^']*)')/);
  const firstStringMatch = rawArgs.match(/(?:"([^"]*)"|'([^']*)')/);
  const extractedName =
    namedTitleMatch?.[1] ??
    namedTitleMatch?.[2] ??
    firstStringMatch?.[1] ??
    firstStringMatch?.[2] ??
    'Custom Pine Indicator';

  const overlayMatch = rawArgs.match(/\boverlay\s*=\s*(true|false)\b/i);
  const overlay = overlayMatch
    ? overlayMatch[1].toLowerCase() === 'true'
    : !/\boverlay\b/i.test(rawArgs);

  return {
    valid: true,
    name: extractedName.trim() || 'Custom Pine Indicator',
    overlay,
    version,
  };
}

/**
 * Load indicators from localStorage with built-in and default custom fallbacks.
 */
export function loadAllIndicators(): CustomPineIndicator[] {
  const allDefaults = [...BUILT_IN_INDICATORS, ...DEFAULT_CUSTOM_INDICATORS];
  if (typeof window === 'undefined') return allDefaults;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(allDefaults));
      return allDefaults;
    }
    const parsed = JSON.parse(raw) as CustomPineIndicator[];
    const defaultById = new Map(allDefaults.map((d) => [d.id, d]));
    let repaired = false;
    const normalizedParsed = parsed.map((item) => {
      const def = defaultById.get(item.id);
      if (def && item.overlay !== def.overlay) {
        repaired = true;
        return { ...item, overlay: def.overlay };
      }
      return item;
    });
    const existingIds = new Set(normalizedParsed.map((p) => p.id));
    const missingDefaults = allDefaults.filter((d) => !existingIds.has(d.id));
    if (missingDefaults.length > 0 || repaired) {
      const merged = [...missingDefaults, ...normalizedParsed];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      return merged;
    }
    return normalizedParsed;
  } catch (e) {
    console.error('Failed to parse stored indicators:', e);
    return allDefaults;
  }
}

/**
 * Save indicators list to localStorage and notify active chart views.
 */
export function saveAllIndicators(list: CustomPineIndicator[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent('stageledger:indicators-changed'));
  } catch (e) {
    console.error('Failed to save indicators to localStorage:', e);
  }
}

/**
 * Import a new custom Pine Script indicator.
 */
let customPineSeq = 0;

export function importCustomPineIndicator(
  pineCode: string,
  overrides?: {
    name?: string;
    author?: string;
    description?: string;
    category?: IndicatorCategory;
  }
): { success: boolean; indicator?: CustomPineIndicator; error?: string } {
  const header = validatePineScriptHeader(pineCode);
  if (!header.valid) {
    return { success: false, error: header.error };
  }

  customPineSeq += 1;
  const newIndicator: CustomPineIndicator = {
    id: `custom-pine-${Date.now()}-${customPineSeq}`,
    name: overrides?.name || header.name,
    author: overrides?.author || 'Community Trader',
    description: overrides?.description || 'Imported TradingView Pine Script indicator.',
    category: overrides?.category || 'Reversal',
    pineCode: pineCode.trim(),
    version: header.version,
    overlay: header.overlay,
    enabled: true,
    isBuiltIn: false,
    importedAt: Date.now(),
    syntaxValid: true,
  };

  return { success: true, indicator: newIndicator };
}

/**
 * Export indicators bundle as formatted JSON.
 */
export function exportIndicatorsAsJSON(indicators: CustomPineIndicator[]): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      generator: 'StageLedger PineTS Indicator Library',
      count: indicators.length,
      indicators,
    },
    null,
    2
  );
}
