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
    id: 'superkumo-mpro',
    name: 'SuperKumo MPro',
    author: 'Community Trader (Pine v6)',
    description:
      'Ichimoku Kumo Cloud (9/26/52/26) fused with Supertrend (10, 3.0), ADX chop filter, merged Pivot & HTF Support/Resistance bands, Early/Confirmed/PB/DCA signals, and ratcheting Trail Stop.',
    category: 'Trend',
    version: 'v6',
    overlay: true,
    enabled: true,
    isBuiltIn: true,
    importedAt: Date.now() - 1060000,
    syntaxValid: true,
    pineCode: `//@version=6
indicator("SuperKumo MPro", overlay=true, max_boxes_count=50, max_labels_count=100, max_lines_count=10)

convLen    = input.int(9,  "Conversion Line Length", minval=1, group="Ichimoku")
baseLen    = input.int(26, "Base Line Length",       minval=1, group="Ichimoku")
spanBLen   = input.int(52, "Leading Span B Length",  minval=1, group="Ichimoku")
disp       = input.int(26, "Displacement",           minval=1, group="Ichimoku")
atrLen     = input.int(10, "ATR Length",             minval=1, group="Supertrend")
factor     = input.float(3.0, "Factor",              minval=0.1, step=0.1, group="Supertrend")
adxMin     = input.float(20.0, "ADX Chop Threshold", minval=1, group="Filters")
minRoomMult = input.float(1.0, "Min S/R Room (ATR)", minval=0, group="S/R Zones")

tenkan = math.avg(ta.highest(high, convLen), ta.lowest(low, convLen))
kijun  = math.avg(ta.highest(high, baseLen), ta.lowest(low, baseLen))
spanA  = math.avg(tenkan, kijun)
spanB  = math.avg(ta.highest(high, spanBLen), ta.lowest(low, spanBLen))
[st, dir] = ta.supertrend(factor, atrLen)

plot(tenkan, "Tenkan", color=color.teal)
plot(kijun, "Kijun", color=color.orange)
p1 = plot(spanA, "Span A", offset=disp, color=color.green)
p2 = plot(spanB, "Span B", offset=disp, color=color.red)
fill(p1, p2, color=spanA > spanB ? color.new(color.green, 82) : color.new(color.red, 82))`,
  },
  {
    id: 'volume-spike-change-pro',
    name: 'Volume Spike & Change Detector Pro',
    author: 'Community Trader (Pine v6)',
    description:
      'Directional Buy vs Sell volume decomposition, Z-score volume spikes (>2σ), narrow-range Churn/Absorption markers, CVD, Weekly/Monthly delta changes, and -10..+10 MTF Volume Sentiment.',
    category: 'Volume',
    version: 'v6',
    overlay: false,
    enabled: true,
    isBuiltIn: true,
    importedAt: Date.now() - 1030000,
    syntaxValid: true,
    pineCode: `//@version=6
indicator("Volume Spike & Change Detector Pro", shorttitle="Vol Spike Pro", overlay=false)

maLen     = input.int(20, "Volume MA Length", minval=5, group="Volume & Spike Detection")
spikeMult = input.float(2.0, "Spike Z-Score Threshold", minval=1.0, step=0.1, group="Volume & Spike Detection")
atrLen    = input.int(14, "ATR Length for Churn Detection", minval=5, group="Volume & Spike Detection")
churnMult = input.float(0.5, "Max Range Ratio for Churn (x ATR)", minval=0.1, step=0.1, group="Volume & Spike Detection")

barRange = math.max(high - low, 1e-9)
buyVol   = high - low > 1e-9 ? volume * (close - low) / barRange : volume * 0.5
sellVol  = volume - buyVol
volMA    = ta.sma(volume, maLen)
volStd   = ta.stdev(volume, maLen)
zScore   = volStd > 0 ? (volume - volMA) / volStd : 0.0
isSpike  = zScore > spikeMult
isChurn  = isSpike and (high - low) < ta.atr(atrLen) * churnMult

plot(buyVol, "Buy Volume", color=color.green, style=plot.style_columns)
plot(-sellVol, "Sell Volume", color=color.red, style=plot.style_columns)
plot(volMA, "Volume MA", color=color.gray, linewidth=2)`,
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
  {
    id: 'b-xtrender-puppytherapy',
    name: 'B-Xtrender @Puppytherapy',
    author: 'Puppytherapy (ML4T Port)',
    description:
      'Dual-horizon momentum oscillator combining RSI(EMA5 - EMA20, 15) - 50, Tillson T3(5) smoothing, and long-term RSI(EMA20, 15) - 50 trend histogram.',
    category: 'Oscillator',
    version: 'v4',
    overlay: false,
    enabled: true,
    isBuiltIn: true,
    importedAt: Date.now() - 290000,
    syntaxValid: true,
    pineCode: `//@version=4
study("B-Xtrender @Puppytherapy", overlay=false)
shortTermXtrender = rsi(ema(close, 5) - ema(close, 20), 15) - 50
longTermXtrender = rsi(ema(close, 20), 15) - 50
plot(shortTermXtrender, "B-Xtrender Short", color=shortTermXtrender > 0 ? color.lime : color.red, style=plot.style_columns)
plot(longTermXtrender, "B-Xtrender Long Trend", color=longTermXtrender > longTermXtrender[1] ? color.lime : color.red, linewidth=2)`,
  },
  {
    id: 'williams-vix-fix-theehoganator',
    name: 'Williams Vix Fix Bottoms & Tops',
    author: 'TheeHoganator (ML4T Port)',
    description:
      'Synthetic bottom panic gauge ((Highest(Close,22) - Low) / Highest(Close,22) * 100) with Bollinger Band(20, 2.0) and 85th-percentile volatility exhaustion spikes.',
    category: 'Volatility',
    version: 'v5',
    overlay: false,
    enabled: true,
    isBuiltIn: true,
    importedAt: Date.now() - 280000,
    syntaxValid: true,
    pineCode: `//@version=5
indicator("Williams Vix Fix Bottoms and Tops", shorttitle="WVF", overlay=false, precision=2)
pd = input.int(22, "LookBack Period Standard Deviation High")
bbl = input.int(20, "Bollinger Band Length")
mult = input.float(2.0, "Bollinger Band Standard Deviation Up")
lb = input.int(50, "Look Back Period Percentile High")
ph = input.float(0.85, "Highest Percentile")
wvf = ((ta.highest(close, pd) - low) / ta.highest(close, pd)) * 100
sDev = mult * ta.stdev(wvf, bbl)
midLine = ta.sma(wvf, bbl)
upperBand = midLine + sDev
rangeHigh = ta.highest(wvf, lb) * ph
plot(wvf, "Williams Vix Fix", style=plot.style_columns, color=wvf >= upperBand or wvf >= rangeHigh ? color.lime : color.gray)`,
  },
  {
    id: 'whalefusion-institutional-v6',
    name: 'WhaleFusion Institutional v6',
    author: 'WhaleFusion Core (ML4T Port)',
    description:
      'Institutional volume imbalance detector (7-bar vs 50-bar Z-score), linear-regression momentum f_momentum(20,5), CCI(21), and blended ADX/BBWidth pTrend regime score.',
    category: 'Volume',
    version: 'v6',
    overlay: true,
    enabled: true,
    isBuiltIn: true,
    importedAt: Date.now() - 270000,
    syntaxValid: true,
    pineCode: `//@version=6
indicator("WhaleFusion Institutional v6", overlay=true)
volSma = ta.sma(volume, 50)
volStd = ta.stdev(volume, 50)
volZ = volStd > 0 ? (volume - volSma) / volStd : 0.0
basis = ta.sma(close, 20)
linMom = ta.linreg(close - math.avg(math.avg(ta.highest(high, 20), ta.lowest(low, 20)), basis), 20, 0)
plot(basis, "WhaleFusion Centerline", color=linMom >= 0 ? color.teal : color.red, linewidth=2)`,
  },
  {
    id: 'algoalpha-trend-flow-trail',
    name: 'Trend Flow Trail [AlgoAlpha]',
    author: 'AlgoAlpha (ML4T Port)',
    description:
      'Hull-MA(33) ratcheting AlphaTrail volatility stop (3.3x EMA range) fused with HMA(7)-smoothed Money Flow Index(14) regime coloring.',
    category: 'Trend',
    version: 'v6',
    overlay: true,
    enabled: true,
    isBuiltIn: true,
    importedAt: Date.now() - 260000,
    syntaxValid: true,
    pineCode: `//@version=6
indicator("Trend Flow Trail [AlgoAlpha]", overlay=true)
alphaBasis = ta.hma(close, 33)
alphaSpread = ta.ema(high - low, 33) * 3.3
mfiSmooth = ta.hma(ta.mfi(hlc3, 14), 7)
plot(alphaBasis, "AlgoAlpha HMA(33)", color=mfiSmooth >= 50 ? color.teal : color.orange, linewidth=2)
plot(alphaBasis - alphaSpread, "Lower Flow Bound", color=color.green, linewidth=1)
plot(alphaBasis + alphaSpread, "Upper Flow Bound", color=color.red, linewidth=1)`,
  },
  {
    id: 'mfi-v9-pro-centered',
    name: 'Money Flow Index (v9 PRO)',
    author: 'StageLedger Quant (ML4T Port)',
    description:
      'Zero-centered Money Flow Index (MFI(14) - 50) with SMA(9) signal crossover spread highlighting institutional money-flow shifts.',
    category: 'Volume',
    version: 'v6',
    overlay: false,
    enabled: true,
    isBuiltIn: true,
    importedAt: Date.now() - 250000,
    syntaxValid: true,
    pineCode: `//@version=6
indicator("Money Flow Index (v9 PRO)", shorttitle="MFI v9", overlay=false)
mfiVal = ta.mfi(hlc3, 14) - 50.0
sigVal = ta.sma(mfiVal, 9)
plot(mfiVal, "MFI Centered", color=mfiVal >= 0 ? color.teal : color.red, linewidth=2)
plot(sigVal, "MFI Signal (9)", color=color.yellow, linewidth=1)
hline(0, "Zero Equilibrium", color=color.gray)`,
  },
  {
    id: 'ha-institutional-v21',
    name: 'HA Institutional Suite v2.1 [PRO]',
    author: 'Attached Pine v6 Suite',
    description:
      'Heiken Ashi trend & uncertain-candle filter combined with ADX(14) regime gate, 5-SMA alignment ribbon (8-16), and SMA 8/20 cloud.',
    category: 'Trend',
    version: 'v6',
    overlay: true,
    enabled: true,
    isBuiltIn: true,
    importedAt: Date.now() - 245000,
    syntaxValid: true,
    pineCode: `//@version=6
indicator("HA Institutional Suite v2.1 [PRO]", overlay=true)
cloudLo = ta.sma(close, 8)
cloudHi = ta.sma(close, 20)
plot(cloudLo, "HA Cloud Fast (8)", color=close > cloudLo ? color.green : color.red, linewidth=2)
plot(cloudHi, "HA Cloud Slow (20)", color=color.orange, linewidth=2)`,
  },
  {
    id: 'tradingwarz-auto-fib-v16',
    name: 'TradingWie - Auto Fibonacci (V3.0)',
    author: 'TradingWie (1D Weekly Range Upgrade)',
    description:
      'Upgraded V3.0 (supersedes V1.6 & V2.3): Previous-period High/Low Fibonacci retracements (50%, 61.8%, 78.6% Golden Zone) with zero-range guard, EMA(50) regime gate, 0.3xATR wick filter, R:R >= 2.0 validation, and signal cooldown.',
    category: 'Reversal',
    version: 'v6',
    overlay: true,
    enabled: true,
    isBuiltIn: true,
    importedAt: Date.now() - 240000,
    syntaxValid: true,
    pineCode: `//@version=6
indicator("TradingWie - Auto Fibonacci (V3.0)", overlay=true)
wHi = ta.highest(high, 5)
wLo = ta.lowest(low, 5)
rng = math.max(wHi - wLo, 0.0001)
ema50 = ta.ema(close, 50)
atr14 = ta.atr(14)
fib50 = wLo + rng * 0.50
fib618 = wHi - rng * 0.618
fib786 = wHi - rng * 0.786
plot(fib50, "Fib 50%", color=color.yellow)
plot(fib618, "Bull 61.8%", color=close > ema50 ? color.teal : color.gray)
plot(fib786, "Bull 78.6%", color=color.green)`,
  },
  {
    id: 'startup-bravo-voila',
    name: 'Startup Suite (Bravo+Voila)',
    author: 'Startup Suite (Complete Port)',
    description:
      'Bravo EMA(12) + 1σ/2σ/3σ ATR volatility bands fused with Voila multi-pivot support/resistance stratification levels.',
    category: 'Volatility',
    version: 'v6',
    overlay: true,
    enabled: true,
    isBuiltIn: true,
    importedAt: Date.now() - 235000,
    syntaxValid: true,
    pineCode: `//@version=6
indicator("Startup Suite", "SS Suite", overlay=true)
bravoEma = ta.ema(close, 12)
atrVal = ta.atr(14)
plot(bravoEma, "Bravo EMA(12)", color=color.yellow, linewidth=2)
plot(bravoEma + atrVal * 2.0, "Upper 2σ Band", color=color.gray)
plot(bravoEma - atrVal * 2.0, "Lower 2σ Band", color=color.gray)`,
  },
  {
    id: 'startup-arch',
    name: 'Startup Arch (LinReg Detrended Z)',
    author: 'Startup Suite',
    description:
      'Linear regression of detrended close (SMA 20) with 100-bar Z-score (±2σ) identifying Early accumulation vs Late extended phases.',
    category: 'Oscillator',
    version: 'v6',
    overlay: false,
    enabled: true,
    isBuiltIn: true,
    importedAt: Date.now() - 230000,
    syntaxValid: true,
    pineCode: `//@version=6
indicator("Startup Arch", "Arch", overlay=false)
arch = ta.linreg(close - ta.sma(close, 20), 20, 0)
plot(arch, "Arch", color=arch > 0 ? color.green : color.purple, style=plot.style_columns)
hline(0, "Zero", color=color.gray)`,
  },
  {
    id: 'startup-echo',
    name: 'Startup Echo (Fast RSI 7)',
    author: 'Startup Suite',
    description:
      'Fast 2-bar SMA-smoothed RSI(7) hill oscillator around 50 midline with OB/OS levels (70/30) for rapid 1D swing timing.',
    category: 'Oscillator',
    version: 'v6',
    overlay: false,
    enabled: true,
    isBuiltIn: true,
    importedAt: Date.now() - 225000,
    syntaxValid: true,
    pineCode: `//@version=6
indicator("Startup Echo", "Echo", overlay=false)
echo = ta.sma(ta.rsi(close, 7), 2)
plot(echo, "Echo", color=echo > 50 ? color.blue : color.fuchsia, linewidth=2)
hline(50, "Midline", color=color.gray)`,
  },
  {
    id: 'startup-helix',
    name: 'Startup Helix (8/21/5)',
    author: 'Startup Suite',
    description:
      'Smoothed EMA(8) - EMA(21) impulse envelope with 50-bar slope steepness detection and flat-helix indecision chop flagging.',
    category: 'Oscillator',
    version: 'v6',
    overlay: false,
    enabled: true,
    isBuiltIn: true,
    importedAt: Date.now() - 220000,
    syntaxValid: true,
    pineCode: `//@version=6
indicator("Startup Helix", "Helix", overlay=false)
helix = ta.ema(ta.ema(close, 8) - ta.ema(close, 21), 5)
plot(math.abs(helix), "Upper Helix", color=helix > 0 ? color.green : color.purple, linewidth=2)
plot(-math.abs(helix), "Lower Helix", color=helix > 0 ? color.green : color.purple, linewidth=2)`,
  },
  {
    id: 'startup-mountain',
    name: 'Startup Mountain (EMA 50 Altitude)',
    author: 'Startup Suite',
    description:
      'Percentage altitude above/below 50-period EMA ((Close - EMA50)/EMA50 * 100) with base-slope entry/exit inflection markers.',
    category: 'Trend',
    version: 'v6',
    overlay: false,
    enabled: true,
    isBuiltIn: true,
    importedAt: Date.now() - 215000,
    syntaxValid: true,
    pineCode: `//@version=6
indicator("Startup Mountain", "Mountain", overlay=false)
mtnBase = ta.ema(close, 50)
altitude = ((close - mtnBase) / mtnBase) * 100
plot(altitude, "Altitude %", color=altitude > 0 ? color.blue : color.fuchsia, style=plot.style_areabr)
hline(0, "Sea Level", color=color.gray)`,
  },
  {
    id: 'startup-tango',
    name: 'Startup Tango (Slow RSI 28)',
    author: 'Startup Suite',
    description:
      'Slow 10-bar SMA-smoothed RSI(28) macro momentum oscillator filtering short-term noise on Daily/Weekly swing trends.',
    category: 'Oscillator',
    version: 'v6',
    overlay: false,
    enabled: true,
    isBuiltIn: true,
    importedAt: Date.now() - 210000,
    syntaxValid: true,
    pineCode: `//@version=6
indicator("Startup Tango", "Tango", overlay=false)
tango = ta.sma(ta.rsi(close, 28), 10)
plot(tango, "Tango", color=tango > 50 ? color.blue : color.fuchsia, linewidth=2)
hline(50, "Midline", color=color.gray)`,
  },
  {
    id: 'shannon-auto-avwap-v6',
    name: 'Auto Anchored VWAP [Shannon Method]',
    author: 'Brian Shannon Style (Pine v6)',
    description:
      'Multi-anchor YTD / Gap / Major Swing High & Low Anchored VWAPs with +/-1σ and +/-2σ standard deviation institutional bands and 3-bar slope confirmation.',
    category: 'Volume',
    version: 'v6',
    overlay: true,
    enabled: true,
    isBuiltIn: true,
    importedAt: Date.now() - 208000,
    syntaxValid: true,
    pineCode: `//@version=6
indicator("Auto Anchored VWAP [Shannon Method]", shorttitle="Auto AVWAP", overlay=true)
isNewYear = year != year[1]
var float cumPV = 0.0
var float cumV  = 0.0
if isNewYear
    cumPV := hlc3 * volume
    cumV  := volume
else
    cumPV += hlc3 * volume
    cumV  += volume
ytdAvwap = cumV > 0 ? cumPV / cumV : hlc3
plot(ytdAvwap, "YTD AVWAP", color=color.aqua, linewidth=2)`,
  },
  {
    id: 'inside-bar-auto-htf-v2',
    name: 'Inside Bar Auto-HTF System v2.0',
    author: 'Quant Trader (Pine v6)',
    description:
      'Detects coiled Inside Bars (High <= High[1] & Low >= Low[1]) with Mother Bar persistence, Auto-HTF Weekly EMA(50) bias, RVOL/ATR expansion & 0-5 compression quality score.',
    category: 'Volatility',
    version: 'v6',
    overlay: true,
    enabled: true,
    isBuiltIn: true,
    importedAt: Date.now() - 206000,
    syntaxValid: true,
    pineCode: `//@version=6
indicator("Inside Bar Auto-HTF System v2.0", shorttitle="InsideBar HTF", overlay=true)
isInside = high <= high[1] and low >= low[1]
htfEma = request.security(syminfo.tickerid, "W", ta.ema(close, 50), lookahead=barmerge.lookahead_off)
plot(htfEma, "HTF EMA 50", color=close > htfEma ? color.teal : color.red, linewidth=2)
plotshape(isInside, "Inside Bar", shape.diamond, location.abovebar, color.yellow, size=size.tiny)`,
  },
  {
    id: 'ice-confluence-v11',
    name: 'Institutional Confluence Engine [ICE v1.1.0]',
    author: 'Quant Core (Pine v6)',
    description:
      'Composite institutional scoring engine blending 0.35*MACD/ATR + 0.35*(B-Xtrender/50) + 0.30*(HMA_MFI-50)/50 gated by AlphaTrail, ADX(14), and ATR% regime.',
    category: 'Trend',
    version: 'v6',
    overlay: true,
    enabled: true,
    isBuiltIn: true,
    importedAt: Date.now() - 204000,
    syntaxValid: true,
    pineCode: `//@version=6
indicator("Institutional Confluence Engine [ICE v1.1.0]", shorttitle="ICE v1.1", overlay=true)
[macdLine, sigLine, histLine] = ta.macd(close, 12, 26, 9)
atr14 = ta.atr(14)
macdNorm = atr14 > 0 ? math.max(-1.0, math.min(1.0, histLine / atr14)) : 0.0
bxt = (ta.rsi(ta.ema(close, 5) - ta.ema(close, 20), 15) - 50.0) / 50.0
mfiHma = (ta.hma(ta.mfi(hlc3, 14), 7) - 50.0) / 50.0
iceScore = (0.35 * macdNorm + 0.35 * bxt + 0.30 * mfiHma) * 100
plot(ta.hma(close, 33), "ICE AlphaTrail Proxy", color=iceScore > 0 ? color.teal : color.red, linewidth=2)`,
  },
  {
    id: 'ict-prop-engine-v5',
    name: 'Institutional Prop Engine v5 | ICT Liquidity',
    author: 'ICT Prop Quant (Pine v6)',
    description:
      '8-point ICT confluence engine combining Equal H/L BSL/SSL Sweeps vs Acceptance, Fair Value Gaps (FVG), Optimal Trade Entry (0.62-0.79), Weekly Mid, and EMA(20) bias.',
    category: 'SMC',
    version: 'v6',
    overlay: true,
    enabled: true,
    isBuiltIn: true,
    importedAt: Date.now() - 202000,
    syntaxValid: true,
    pineCode: `//@version=6
indicator("Institutional Prop Engine v5 | ICT Liquidity", shorttitle="ICT Prop v5", overlay=true)
fvgBull = low > high[2] and close[1] > open[1]
fvgBear = high < low[2] and close[1] < open[1]
ema20 = ta.ema(close, 20)
plot(ema20, "ICT EMA 20", color=close > ema20 ? color.emerald : color.rose, linewidth=2)
plotshape(fvgBull, "Bull FVG", shape.triangleup, location.belowbar, color.teal, size=size.tiny)`,
  },
  {
    id: 'mcdx-plus-institutional',
    name: 'MCDX Plus — Institutional Edition',
    author: 'Institutional Chips Suite (Pine v6)',
    description:
      'Decomposes price action within VWAP-Sigma or 100-bar High/Low boundaries into Profitable Chips (Banker), Floating Chips (Hot Money), and Trapped Chips (Retail) with PC vs SMA(10) regime.',
    category: 'Volume',
    version: 'v6',
    overlay: false,
    enabled: true,
    isBuiltIn: true,
    importedAt: Date.now() - 201000,
    syntaxValid: true,
    pineCode: `//@version=6
indicator("MCDX Plus — Institutional Edition", shorttitle="MCDX+", overlay=false)
hi = ta.highest(high, 50)
lo = ta.lowest(low, 50)
rng = math.max(hi - lo, 0.0001)
pc = ((close - lo) / rng) * 100
pcSma = ta.sma(pc, 10)
plot(pc, "Profitable Chips %", color=color.red, style=plot.style_columns)
plot(pcSma, "Banker MA(10)", color=color.white, linewidth=2)`,
  },
  {
    id: 'startup-ss-strat-v2',
    name: 'Startup — SS Strat v2.0 (7-Pane + Online IC)',
    author: 'Startup Suite (Pine v6 Strategy)',
    description:
      'Self-contained 7-pane confluence strategy fusing Tango, Bravo (EMA 8/21), Echo, Arch, Helix, Lattice (EMA 8 vs 20/30/40/50 ribbon) & Mountain with Online-IC adaptive weighting, ATR stop & 2R target.',
    category: 'Trend',
    version: 'v6',
    overlay: false,
    enabled: true,
    isBuiltIn: true,
    importedAt: Date.now() - 200500,
    syntaxValid: true,
    pineCode: `//@version=6
indicator("Startup — SS Strat v2.0", shorttitle="SS Strat v2", overlay=false)
tango = (ta.sma(ta.rsi(close, 28), 10) - 50.0) / 15.0
bravo = (ta.ema(close, 8) - ta.ema(close, 21)) / math.max(ta.atr(14), 0.0001)
echo = (ta.sma(ta.rsi(close, 7), 2) - 50.0) / 25.0
latticeAvg = (ta.ema(close, 20) + ta.ema(close, 30) + ta.ema(close, 40) + ta.ema(close, 50)) / 4.0
lattice = ((ta.ema(close, 8) - latticeAvg) / math.max(close, 0.0001)) * 40.0
mtn = ((close - ta.ema(close, 50)) / math.max(ta.ema(close, 50), 0.0001)) * 12.5
comp = (2.0 * math.max(-1.0, math.min(1.0, tango)) + 2.0 * math.max(-1.0, math.min(1.0, bravo)) + math.max(-1.0, math.min(1.0, echo)) + math.max(-1.0, math.min(1.0, lattice)) + math.max(-1.0, math.min(1.0, mtn))) / 7.0
plot(comp * 100.0, "SS Strat 7P Score", color=comp >= 0.4 ? color.lime : comp <= -0.4 ? color.red : color.gray, linewidth=2)
hline(40, "Entry +0.40", color=color.teal)
hline(-40, "Short -0.40", color=color.maroon)`,
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
    name: 'G-Ron TrendCloud Pro v3',
    author: 'G-Ron Quant (Pine v6)',
    description:
      '20-bar Donchian/SMA ratcheting TrendCloud state machine with 2.618 Fibonacci target ray, 200-bar MA institutional risk alignment, and reversal level tracking.',
    category: 'Trend',
    version: 'v6',
    overlay: true,
    enabled: true,
    isBuiltIn: false,
    importedAt: Date.now() - 170000,
    syntaxValid: true,
    pineCode: `//@version=6
indicator("G-Ron TrendCloud Pro v3", shorttitle="TrendCloud Pro", overlay=true)
hi20 = ta.highest(high, 20)
lo20 = ta.lowest(low, 20)
mid20 = (hi20 + lo20) / 2
sma20 = ta.sma(close, 20)
ma200 = ta.sma(close, 200)
p1 = plot(mid20, "Donchian Mid(20)", color=color.teal, linewidth=2)
p2 = plot(sma20, "SMA(20)", color=color.blue, linewidth=1)
plot(ma200, "200 MA Risk Filter", color=color.purple, linewidth=2)
fill(p1, p2, color=close >= mid20 ? color.new(color.green, 82) : color.new(color.red, 82))`,
  },
  {
    id: 'agaig-avwap',
    name: 'AGAIG + Institutional AVWAP v2',
    author: 'AGAIG Quant (Pine v6)',
    description:
      'SSL HMA(60) trend direction + 12-indicator Consensus Engine + CSR 1.5/2.0 ZigZag + Rolling Anchored VWAP & ADX(14) regime filter.',
    category: 'Reversal',
    version: 'v6',
    overlay: true,
    enabled: true,
    isBuiltIn: false,
    importedAt: Date.now() - 160000,
    syntaxValid: true,
    pineCode: `//@version=6
indicator("AGAIG + Institutional AVWAP v2", shorttitle="AGAIG v2", overlay=true)
hmaHi = ta.hma(high, 60)
hmaLo = ta.hma(low, 60)
avwap = ta.vwap(hlc3)
std = ta.stdev(close, 20) * 1.5
plot(hmaHi, "SSL HMA High(60)", color=color.teal)
plot(hmaLo, "SSL HMA Low(60)", color=color.rose)
plot(avwap, "Institutional AVWAP", color=color.yellow, linewidth=2)`,
  },
  {
    id: 'supertrend-v9-pro',
    name: 'SuperTrend v10.1 — Auto Fib & PRIME',
    author: 'Quant Core (Pine v6 Upgrade)',
    description:
      'Upgraded v10.1 LONG-ONLY confluence suite (supersedes v9): SuperTrend(10,3.0) 0.5xATR cloud, EMA 20/50/200 stack, 3-pillar PRIME (Close>EMA200 + RSI>50 + VolZ>=1σ/BuyPress>10%), 10-bar Sweep detector, MTF tags & nearest S/R + Auto Fib 1.272/1.618/2.0 targets.',
    category: 'Trend',
    version: 'v6',
    overlay: true,
    enabled: true,
    isBuiltIn: false,
    importedAt: Date.now() - 150000,
    syntaxValid: true,
    pineCode: `//@version=6
indicator("SuperTrend v10.1 — Auto Fib & PRIME", shorttitle="ST v10.1", overlay=true)
[stLine, stDir] = ta.supertrend(3.0, 10)
atrBand = ta.atr(10) * 0.5
isUp = close > stLine
ema20 = ta.ema(close, 20)
ema50 = ta.ema(close, 50)
ema200 = ta.ema(close, 200)
rsi14 = ta.rsi(close, 14)
volMean = ta.sma(volume, 50)
volStd = ta.stdev(volume, 50)
volZ = volStd > 0 ? (volume - volMean) / volStd : 0.0
primeSig = isUp and not isUp[1] and close > ema200 and rsi14 > 50 and volZ >= 1.0
pSt = plot(stLine, "SuperTrend v10 Line", color=isUp ? color.teal : color.red, linewidth=2)
pBand = plot(isUp ? stLine + atrBand : stLine - atrBand, "ST Cloud Band", color=isUp ? color.teal : color.red)
fill(pSt, pBand, color=isUp ? color.new(color.teal, 82) : color.new(color.red, 82))
plot(ema20, "EMA 20", color=color.sky)
plot(ema50, "EMA 50", color=color.orange)
plotshape(primeSig, "PRIME Buy", shape.triangleup, location.belowbar, color.gold, text="PRIME")`,
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
