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
];

const STORAGE_KEY = 'trullas_custom_pine_indicators_v1';

/**
 * Validates and extracts metadata from raw Pine Script code.
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

  // Declaration statement check (indicator(...) or strategy(...))
  const indicatorMatch = code.match(/(?:indicator|strategy)\s*\(\s*(?:"([^"]+)"|'([^']+)')([^)]*)\)/);
  if (!indicatorMatch) {
    return {
      valid: false,
      name: 'Custom Indicator',
      overlay: true,
      version,
      error: 'Missing indicator(...) or strategy(...) declaration statement',
    };
  }

  const name = indicatorMatch[1] || indicatorMatch[2] || 'Custom Pine Indicator';
  const args = indicatorMatch[3] || '';
  const overlay = args.includes('overlay=true') || (!args.includes('overlay=false') && !args.includes('overlay'));

  return {
    valid: true,
    name,
    overlay,
    version,
  };
}

/**
 * Load indicators from localStorage with built-in fallbacks.
 */
export function loadAllIndicators(): CustomPineIndicator[] {
  if (typeof window === 'undefined') return BUILT_IN_INDICATORS;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(BUILT_IN_INDICATORS));
      return BUILT_IN_INDICATORS;
    }
    const parsed = JSON.parse(raw) as CustomPineIndicator[];
    // Ensure all built-in indicators exist
    const builtInIds = new Set(parsed.map((p) => p.id));
    const missingBuiltIns = BUILT_IN_INDICATORS.filter((b) => !builtInIds.has(b.id));
    if (missingBuiltIns.length > 0) {
      const merged = [...parsed, ...missingBuiltIns];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      return merged;
    }
    return parsed;
  } catch (e) {
    console.error('Failed to parse stored indicators:', e);
    return BUILT_IN_INDICATORS;
  }
}

/**
 * Save indicators list to localStorage.
 */
export function saveAllIndicators(list: CustomPineIndicator[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (e) {
    console.error('Failed to save indicators to localStorage:', e);
  }
}

/**
 * Import a new custom Pine Script indicator.
 */
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

  const newIndicator: CustomPineIndicator = {
    id: `custom-pine-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
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
      generator: 'Trullas MACD 24/7 PineTS Library',
      count: indicators.length,
      indicators,
    },
    null,
    2
  );
}
