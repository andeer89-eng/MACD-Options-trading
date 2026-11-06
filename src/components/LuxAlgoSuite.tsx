import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Layers,
  Code2,
  Activity,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  Flame,
  CheckCircle2,
  Sliders,
  ExternalLink,
  RefreshCw,
  Zap,
  Info,
  Maximize2,
  ChevronRight,
  Play,
  RotateCcw,
} from 'lucide-react';
import {
  NadarayaWatsonResult,
  SmartMoneyConceptsResult,
  OscillatorMatrixPoint,
  LuxAlgoConfluenceReport,
} from '../utils/luxalgoIndicators';

interface LuxAlgoSuiteProps {
  onSelectSymbolForChart: (sym: string) => void;
  initialSymbol?: string;
}

const PINE_SCRIPT_PRESETS: Record<string, { title: string; code: string; desc: string }> = {
  nwe: {
    title: 'LuxAlgo Nadaraya-Watson Envelope (v5)',
    desc: 'Non-parametric rational quadratic kernel regression envelope with dynamic mean-reversion bands.',
    code: `//@version=5
indicator("LuxAlgo - Nadaraya-Watson Envelope", overlay=true)
h = input.float(8.0, "Bandwidth (h)", minval=0.5, step=0.5)
mult = input.float(2.5, "Multiplier", minval=0.1, step=0.1)

// Gaussian Kernel Regression
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
  smc: {
    title: 'LuxAlgo Smart Money Concepts (v5)',
    desc: 'Institutional Order Blocks, Fair Value Gaps, and Market Structure Shifts (BOS / CHoCH).',
    code: `//@version=5
indicator("LuxAlgo - Smart Money Concepts [SMC]", overlay=true)

// Fair Value Gap Detection
fvg_bull = low > high[2] and close[1] > open[1]
fvg_bear = high < low[2] and close[1] < open[1]

// Order Blocks
ob_bull = close > open and close[1] < open[1] and (close - open) > ta.atr(14) * 1.5
ob_bear = close < open and close[1] > open[1] and (open - close) > ta.atr(14) * 1.5

plotshape(fvg_bull, "Bullish FVG", shape.triangleup, location.belowbar, color.teal, size=size.tiny)
plotshape(fvg_bear, "Bearish FVG", shape.triangledown, location.abovebar, color.maroon, size=size.tiny)
plotshape(ob_bull, "Demand Order Block", shape.square, location.belowbar, color.green, size=size.small)
plotshape(ob_bear, "Supply Order Block", shape.square, location.abovebar, color.red, size=size.small)`,
  },
  trullas_lux: {
    title: 'Trullàs MACD + LuxAlgo Confluence Engine',
    desc: 'Multi-layer confluence combining David Trullàs 3rd wave exhaustion with LuxAlgo institutional zones.',
    code: `//@version=5
indicator("Trullàs MACD x LuxAlgo SMC Confluence", overlay=true)

[macdLine, signalLine, histLine] = ta.macd(close, 12, 26, 9)
rsi = ta.rsi(close, 14)

// 3rd Wave Exhaustion check
is_triple_divergence = low < low[1] and low[1] < low[2] and macdLine > macdLine[1] and macdLine[1] > macdLine[2]
is_confluent_buy = is_triple_divergence and rsi < 35

plotshape(is_confluent_buy, "Elite Trullas+Lux Confluence", shape.diamond, location.belowbar, color.yellow, size=size.normal)`,
  },
};

export const LuxAlgoSuite: React.FC<LuxAlgoSuiteProps> = ({
  onSelectSymbolForChart,
  initialSymbol = 'AAPL',
}) => {
  const [symbol, setSymbol] = useState(initialSymbol);
  const [timeframe, setTimeframe] = useState('1d');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'confluence' | 'nwe' | 'smc' | 'pinets'>('confluence');

  // Indicators Data from Server
  const [data, setData] = useState<{
    nwe: NadarayaWatsonResult;
    smc: SmartMoneyConceptsResult;
    oscillatorMatrix: OscillatorMatrixPoint[];
    confluence: LuxAlgoConfluenceReport;
  } | null>(null);

  // NWE Slider Parameters
  const [bandwidth, setBandwidth] = useState<number>(8.0);
  const [multiplier, setMultiplier] = useState<number>(2.5);

  // PineTS Script Runner State
  const [selectedPreset, setSelectedPreset] = useState<string>('nwe');
  const [pineCode, setPineCode] = useState<string>(PINE_SCRIPT_PRESETS.nwe.code);
  const [pinetsResult, setPinetsResult] = useState<{
    syntaxValid: boolean;
    transpiledPreview: string;
    error: string | null;
  } | null>(null);
  const [runningPineTS, setRunningPineTS] = useState(false);

  // Fetch LuxAlgo Indicators
  const fetchLuxAlgoData = async (sym: string, tf: string, bw: number, mult: number) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/luxalgo/indicators?symbol=${sym}&timeframe=${tf}&bandwidth=${bw}&multiplier=${mult}`
      );
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (e) {
      console.error('Failed to fetch LuxAlgo indicators:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLuxAlgoData(symbol, timeframe, bandwidth, multiplier);
  }, [symbol, timeframe, bandwidth, multiplier]);

  // Transpile Pine Script with PineTS
  const handleRunPineTS = async () => {
    setRunningPineTS(true);
    try {
      const res = await fetch('/api/luxalgo/pinets-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, pineCode }),
      });
      if (res.ok) {
        const result = await res.json();
        setPinetsResult(result);
      }
    } catch (e: any) {
      setPinetsResult({
        syntaxValid: false,
        transpiledPreview: '',
        error: e.message || 'Execution failed',
      });
    } finally {
      setRunningPineTS(false);
    }
  };

  const handleSelectPreset = (key: string) => {
    setSelectedPreset(key);
    setPineCode(PINE_SCRIPT_PRESETS[key].code);
    setPinetsResult(null);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-zinc-900 via-indigo-950/40 to-zinc-950 border border-zinc-800 rounded-2xl p-6 sm:p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-medium mb-3">
              <Sparkles className="w-3.5 h-3.5" />
              <span>LuxAlgo GitHub Open-Source Suite & PineTS Engine</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              LuxAlgo Quantitative Indicators & Confluence Engine
            </h1>
            <p className="mt-2 text-sm text-zinc-400 max-w-3xl leading-relaxed">
              Integrates LuxAlgo's premier open-source algorithms: Nadaraya-Watson Kernel Envelopes, Smart Money Concepts (Order Blocks & FVGs), Oscillator Matrix, and live PineTS Pine Script execution.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* Symbol Chips */}
            <div className="flex items-center space-x-1.5 bg-zinc-950 p-1.5 rounded-lg border border-zinc-800">
              {['AAPL', 'NVDA', 'TSLA', 'MSFT', 'BTC-USD', 'SPY'].map((s) => (
                <button
                  key={s}
                  onClick={() => setSymbol(s)}
                  className={`px-2.5 py-1 rounded text-xs font-mono transition ${
                    symbol === s
                      ? 'bg-indigo-600 text-white font-bold'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>

            <button
              onClick={() => onSelectSymbolForChart(symbol)}
              className="flex items-center space-x-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-xs font-medium border border-zinc-700 transition"
            >
              <span>View Chart</span>
              <ExternalLink className="w-3.5 h-3.5 text-zinc-400" />
            </button>
          </div>
        </div>

        {/* Suite Sub-Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-2 mt-6 pt-6 border-t border-zinc-800/80">
          {[
            { id: 'confluence', label: 'Trullàs + LuxAlgo Confluence', icon: Flame },
            { id: 'nwe', label: 'Nadaraya-Watson Envelope (NWE)', icon: Layers },
            { id: 'smc', label: 'Smart Money Concepts (SMC)', icon: ShieldAlert },
            { id: 'pinets', label: 'PineTS Execution Sandbox', icon: Code2 },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-semibold transition border ${
                  active
                    ? 'bg-zinc-800 text-indigo-300 border-indigo-500/50 shadow-sm'
                    : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-zinc-200 hover:border-zinc-700'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${active ? 'text-indigo-400' : 'text-zinc-500'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* TAB 1: TRULLAS + LUXALGO CONFLUENCE MATRIX */}
      {activeTab === 'confluence' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Confluence Score Card */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  Confluence Rating
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                  {symbol} &bull; {timeframe}
                </span>
              </div>

              <div className="flex items-baseline space-x-3">
                <span className="text-4xl font-extrabold text-white tracking-tight">
                  {data?.confluence?.confluenceScore ?? 80}%
                </span>
                <span className="text-xs font-semibold text-emerald-400">
                  High Probability Exhaustion
                </span>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-zinc-950 h-2 rounded-full overflow-hidden border border-zinc-800">
                <div
                  className="bg-gradient-to-r from-indigo-500 to-emerald-400 h-full rounded-full transition-all duration-500"
                  style={{ width: `${data?.confluence?.confluenceScore ?? 80}%` }}
                />
              </div>

              <p className="text-xs text-zinc-400 leading-relaxed">
                When a David Trullàs 3rd-wave MACD divergence converges with a LuxAlgo Nadaraya-Watson envelope extreme and SMC order block demand, false breakout frequency drops significantly.
              </p>
            </div>

            {/* Nadaraya-Watson Envelope Proximity Card */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  NWE Kernel Position
                </span>
                <span className="text-[10px] font-mono text-zinc-400">Bandwidth: {bandwidth}</span>
              </div>

              <div>
                <span className="text-lg font-bold text-white">
                  {data?.confluence?.nwePosition === 'AT_LOWER_BAND'
                    ? 'At Lower Regression Band'
                    : data?.confluence?.nwePosition === 'AT_UPPER_BAND'
                    ? 'At Upper Regression Band'
                    : 'Inside Kernel Channel'}
                </span>
                <p className="text-xs text-zinc-400 mt-1">
                  Proximity: {data?.confluence?.nweDistancePct ?? 0.8}% from envelope boundary
                </p>
              </div>

              <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800 text-xs space-y-1 font-mono">
                <div className="flex justify-between text-rose-400">
                  <span>Upper Band (Rejection):</span>
                  <span>${data?.nwe?.upper[data.nwe.upper.length - 1] ?? '0.00'}</span>
                </div>
                <div className="flex justify-between text-blue-400">
                  <span>Central yHat Curve:</span>
                  <span>${data?.nwe?.yhat[data.nwe.yhat.length - 1] ?? '0.00'}</span>
                </div>
                <div className="flex justify-between text-emerald-400">
                  <span>Lower Band (Demand):</span>
                  <span>${data?.nwe?.lower[data.nwe.lower.length - 1] ?? '0.00'}</span>
                </div>
              </div>
            </div>

            {/* Smart Money Concepts Institutional Zone Card */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  SMC Pricing Structure
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                  Zone: {data?.smc?.premiumDiscountZone?.currentZone ?? 'DISCOUNT'}
                </span>
              </div>

              <div>
                <span className="text-lg font-bold text-white">
                  {data?.smc?.premiumDiscountZone?.currentZone === 'DISCOUNT'
                    ? 'Institutional Discount (Buy Zone)'
                    : data?.smc?.premiumDiscountZone?.currentZone === 'PREMIUM'
                    ? 'Institutional Premium (Sell Zone)'
                    : 'Equilibrium Consolidation'}
                </span>
                <p className="text-xs text-zinc-400 mt-1">
                  Equilibrium: ${data?.smc?.premiumDiscountZone?.equilibrium ?? '0.00'}
                </p>
              </div>

              <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800 text-xs space-y-1">
                <div className="flex justify-between text-zinc-400">
                  <span>Active Order Blocks:</span>
                  <span className="font-mono text-zinc-200">
                    {data?.smc?.activeOrderBlocks?.length ?? 0} active
                  </span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Active Fair Value Gaps:</span>
                  <span className="font-mono text-zinc-200">
                    {data?.smc?.activeFVGs?.length ?? 0} active
                  </span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Structure Shifts (BOS/CHoCH):</span>
                  <span className="font-mono text-zinc-200">
                    {data?.smc?.structureShifts?.length ?? 0} detected
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Confluence Factor Verification List */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
            <h3 className="font-bold text-white text-sm flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Confluence Factors Verified for {symbol}</span>
            </h3>

            <div className="space-y-2">
              {data?.confluence?.confluenceFactors && data.confluence.confluenceFactors.length > 0 ? (
                data.confluence.confluenceFactors.map((factor, idx) => (
                  <div
                    key={idx}
                    className="flex items-center space-x-3 p-3 bg-zinc-950 border border-zinc-800/80 rounded-lg text-xs"
                  >
                    <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-[10px] shrink-0">
                      ✓
                    </span>
                    <span className="text-zinc-200">{factor}</span>
                  </div>
                ))
              ) : (
                <div className="text-xs text-zinc-500 p-4 bg-zinc-950 rounded-lg">
                  No extreme confluence factors triggered at this bar. Asset is trading within central fair value ranges.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: NADARAYA-WATSON ENVELOPE (NWE) */}
      {activeTab === 'nwe' && (
        <div className="space-y-6">
          {/* Controls Bar */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-6 text-xs">
              <div>
                <label className="text-zinc-400 block mb-1 font-medium">
                  Kernel Bandwidth (h): <span className="font-mono text-white">{bandwidth}</span>
                </label>
                <input
                  type="range"
                  min="3.0"
                  max="16.0"
                  step="0.5"
                  value={bandwidth}
                  onChange={(e) => setBandwidth(Number(e.target.value))}
                  className="w-40 accent-indigo-500 bg-zinc-800 h-1.5 rounded-lg cursor-pointer"
                />
              </div>

              <div>
                <label className="text-zinc-400 block mb-1 font-medium">
                  Envelope Multiplier: <span className="font-mono text-white">{multiplier}x</span>
                </label>
                <input
                  type="range"
                  min="1.0"
                  max="4.5"
                  step="0.1"
                  value={multiplier}
                  onChange={(e) => setMultiplier(Number(e.target.value))}
                  className="w-40 accent-indigo-500 bg-zinc-800 h-1.5 rounded-lg cursor-pointer"
                />
              </div>
            </div>

            <div className="text-xs text-zinc-400">
              Algorithm: <span className="text-zinc-200 font-mono">Gaussian Rational Quadratic Kernel</span>
            </div>
          </div>

          {/* Reversal Signals Table */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <h3 className="font-bold text-white text-sm">
                Nadaraya-Watson Mean Reversion Signals ({data?.nwe?.signals?.length ?? 0} events)
              </h3>
              <span className="text-xs font-mono text-zinc-500">Non-Repainting Execution Bar</span>
            </div>

            <div className="space-y-2">
              {data?.nwe?.signals && data.nwe.signals.length > 0 ? (
                data.nwe.signals.slice(-8).reverse().map((sig, i) => {
                  const isBull = sig.type === 'BULLISH_REVERSAL';
                  return (
                    <div
                      key={i}
                      className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg flex items-center justify-between text-xs font-mono"
                    >
                      <div className="flex items-center space-x-3">
                        <span
                          className={`p-1.5 rounded ${
                            isBull
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : 'bg-rose-500/20 text-rose-400'
                          }`}
                        >
                          {isBull ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                        </span>
                        <div>
                          <div className="flex items-center space-x-2">
                            <strong className="text-white">{sig.type.replace('_', ' ')}</strong>
                            <span className="text-zinc-500">&bull; {sig.date}</span>
                          </div>
                          <p className="text-[11px] text-zinc-400 mt-0.5">{sig.description}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-white font-bold">${sig.price.toFixed(2)}</div>
                        <div className="text-[10px] text-zinc-500">Envelope: ${sig.envelopePrice.toFixed(2)}</div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="p-6 text-center text-xs text-zinc-500 bg-zinc-950 rounded-lg">
                  No envelope boundary breaches in the recent lookback window. Price is safely enclosed inside the bandwidth.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: SMART MONEY CONCEPTS (SMC) */}
      {activeTab === 'smc' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Active Order Blocks */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                <h3 className="font-bold text-white text-sm">
                  Active Institutional Order Blocks ({data?.smc?.activeOrderBlocks?.length ?? 0})
                </h3>
                <span className="text-[10px] text-zinc-500">Unmitigated Demand/Supply</span>
              </div>

              <div className="space-y-2.5">
                {data?.smc?.activeOrderBlocks && data.smc.activeOrderBlocks.length > 0 ? (
                  data.smc.activeOrderBlocks.map((ob) => {
                    const isBull = ob.type === 'BULLISH_OB';
                    return (
                      <div
                        key={ob.id}
                        className={`p-3 rounded-lg border text-xs font-mono ${
                          isBull
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                            : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <span className="font-bold">{isBull ? 'DEMAND ORDER BLOCK' : 'SUPPLY ORDER BLOCK'}</span>
                          <span className="text-[10px] text-zinc-400">{ob.dateStr}</span>
                        </div>
                        <div className="mt-1 text-zinc-300">
                          Zone: ${ob.bottomPrice.toFixed(2)} - ${ob.topPrice.toFixed(2)}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-6 text-center text-xs text-zinc-500 bg-zinc-950 rounded-lg">
                    No active unmitigated order blocks found in recent price action.
                  </div>
                )}
              </div>
            </div>

            {/* Fair Value Gaps (FVGs) */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                <h3 className="font-bold text-white text-sm">
                  Fair Value Gaps / Imbalances ({data?.smc?.activeFVGs?.length ?? 0})
                </h3>
                <span className="text-[10px] text-zinc-500">3-Bar Liquidity Inefficiency</span>
              </div>

              <div className="space-y-2.5">
                {data?.smc?.activeFVGs && data.smc.activeFVGs.length > 0 ? (
                  data.smc.activeFVGs.map((fvg) => {
                    const isBull = fvg.type === 'BULLISH_FVG';
                    return (
                      <div
                        key={fvg.id}
                        className={`p-3 rounded-lg border text-xs font-mono ${
                          isBull
                            ? 'bg-teal-500/10 border-teal-500/30 text-teal-300'
                            : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <span className="font-bold">{isBull ? 'BULLISH FVG (Discount)' : 'BEARISH FVG (Premium)'}</span>
                          <span className="text-[10px] text-zinc-400">Mid: ${fvg.midPrice.toFixed(2)}</span>
                        </div>
                        <div className="mt-1 text-zinc-300">
                          Range: ${fvg.bottomPrice.toFixed(2)} - ${fvg.topPrice.toFixed(2)}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-6 text-center text-xs text-zinc-500 bg-zinc-950 rounded-lg">
                    No active unmitigated Fair Value Gaps in recent bars.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: PINETS EXECUTION SANDBOX */}
      {activeTab === 'pinets' && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-zinc-800">
            <div>
              <h3 className="font-bold text-white text-base flex items-center space-x-2">
                <Code2 className="w-4 h-4 text-indigo-400" />
                <span>PineTS Pine Script Runtime (LuxAlgo Open-Source)</span>
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Execute or validate TradingView Pine Script® (v5/v6) natively using LuxAlgo's open-source transpiler.
              </p>
            </div>

            {/* Presets Selector */}
            <div className="flex items-center space-x-2">
              <span className="text-xs text-zinc-400">Preset:</span>
              <select
                value={selectedPreset}
                onChange={(e) => handleSelectPreset(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-medium"
              >
                {Object.entries(PINE_SCRIPT_PRESETS).map(([key, item]) => (
                  <option key={key} value={key}>
                    {item.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Code Editor */}
          <div className="space-y-2">
            <label className="text-xs text-zinc-400 block font-medium">
              Pine Script Source Code:
            </label>
            <textarea
              rows={12}
              value={pineCode}
              onChange={(e) => setPineCode(e.target.value)}
              className="w-full p-4 bg-zinc-950 border border-zinc-800 rounded-xl font-mono text-xs text-indigo-300 leading-relaxed focus:outline-none focus:border-indigo-500 selection:bg-indigo-600 selection:text-white"
            />
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={handleRunPineTS}
              disabled={runningPineTS}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 text-white font-semibold rounded-lg text-xs transition flex items-center space-x-2"
            >
              {runningPineTS ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
              <span>{runningPineTS ? 'Transpiling Script...' : 'Transpile & Run with PineTS'}</span>
            </button>

            <span className="text-[11px] font-mono text-zinc-500">
              Runtime: @luxalgo/pinets &bull; v0.13.1
            </span>
          </div>

          {/* Results Output */}
          {pinetsResult && (
            <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2 font-mono text-xs">
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">AST Syntax Validation:</span>
                <span
                  className={`px-2 py-0.5 rounded font-bold ${
                    pinetsResult.syntaxValid
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-rose-500/20 text-rose-400'
                  }`}
                >
                  {pinetsResult.syntaxValid ? 'VALID PINE SCRIPT' : 'SYNTAX ERROR'}
                </span>
              </div>

              {pinetsResult.error ? (
                <div className="p-3 rounded bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
                  {pinetsResult.error}
                </div>
              ) : (
                <div>
                  <div className="text-zinc-500 text-[11px] mb-1">Transpiled JavaScript Preview:</div>
                  <pre className="p-3 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 text-[11px] overflow-x-auto whitespace-pre-wrap">
                    {pinetsResult.transpiledPreview}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
