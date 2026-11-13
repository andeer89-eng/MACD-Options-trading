import React, { useState, useEffect } from 'react';
import {
  Play,
  RotateCcw,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  Award,
  Zap,
  Target,
  BarChart2,
  Calendar,
  Clock,
  ChevronRight,
  ExternalLink,
  Layers,
  Sparkles,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { BacktestResult, SimulatedTrade } from '../utils/backtestEngine';
import { StrategyOptimizationReport, OptimizationCandidate } from '../utils/strategyOptimizer';

interface BacktesterViewProps {
  onSelectSymbolForChart: (symbol: string) => void;
}

export const BacktesterView: React.FC<BacktesterViewProps> = ({
  onSelectSymbolForChart,
}) => {
  // Config state
  const [symbol, setSymbol] = useState<string>('AAPL');
  const [timeframe, setTimeframe] = useState<string>('1d');
  const [range, setRange] = useState<string>('1y');
  const [initialBalance, setInitialBalance] = useState<number>(10000);
  const [riskPerTradePct, setRiskPerTradePct] = useState<number>(1.5);
  const [targetMode, setTargetMode] = useState<'tranches' | 'tp1' | 'tp2'>('tranches');
  const [minQualityScore, setMinQualityScore] = useState<number>(55);

  // Execution state
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [activeTab, setActiveTab] = useState<'equity' | 'breakdowns' | 'trades' | 'optimizer'>('equity');
  const [tradeFilter, setTradeFilter] = useState<'ALL' | 'WIN' | 'LOSS' | 'BREAKEVEN'>('ALL');

  // Strategy Optimizer state
  const [optimizationReport, setOptimizationReport] = useState<StrategyOptimizationReport | null>(null);
  const [optimizing, setOptimizing] = useState<boolean>(false);

  // Quick preset chips
  const PRESET_SYMBOLS = ['AAPL', 'NVDA', 'TSLA', 'MSFT', 'AMD', 'SPY', 'QQQ', 'BTC-USD', 'ETH-USD'];

  // Run backtest
  const executeBacktest = async (
    targetSymbol = symbol,
    targetTf = timeframe,
    targetRange = range,
    overrideTargetMode?: 'tranches' | 'tp1' | 'tp2',
    overrideMinScore?: number
  ) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: targetSymbol,
          timeframe: targetTf,
          range: targetRange,
          initialBalance,
          riskPerTradePct,
          targetMode: overrideTargetMode || targetMode,
          minQualityScore: overrideMinScore ?? minQualityScore,
        }),
      });

      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }

      const data: BacktestResult = await res.json();
      setResult(data);
    } catch (err: any) {
      console.error('Backtest error:', err);
      setError(err.message || 'Failed to execute backtest');
    } finally {
      setLoading(false);
    }
  };

  // Run Strategy Optimization
  const runStrategyOptimization = async () => {
    setOptimizing(true);
    try {
      const res = await fetch('/api/optimize-strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          timeframe,
          range,
          initialBalance,
          riskPerTradePct,
          targetMode,
          minQualityScore,
        }),
      });

      if (!res.ok) {
        throw new Error(`Optimization server returned ${res.status}`);
      }

      const data: StrategyOptimizationReport = await res.json();
      setOptimizationReport(data);
    } catch (err: any) {
      console.error('Strategy optimization error:', err);
    } finally {
      setOptimizing(false);
    }
  };

  // Apply Optimal Thresholds & Re-Run
  const applyOptimalThresholds = async () => {
    if (!optimizationReport) return;
    const rec = optimizationReport.recommendedThresholds;
    setMinQualityScore(rec.minQualityScore);
    setTargetMode(rec.targetMode);

    await executeBacktest(
      symbol,
      timeframe,
      range,
      rec.targetMode,
      rec.minQualityScore
    );
    setActiveTab('equity');
  };

  // Run backtest on initial mount
  useEffect(() => {
    executeBacktest();
  }, []);

  // Trigger optimization when optimizer tab is activated
  useEffect(() => {
    if (activeTab === 'optimizer' && !optimizationReport && !optimizing) {
      runStrategyOptimization();
    }
  }, [activeTab]);

  const filteredTrades = result?.trades.filter((t) => {
    if (tradeFilter === 'ALL') return true;
    if (tradeFilter === 'WIN') return t.status === 'win';
    if (tradeFilter === 'LOSS') return t.status === 'loss';
    if (tradeFilter === 'BREAKEVEN') return t.status === 'breakeven';
    return true;
  }) || [];

  // Calculate equity curve data for SVG rendering
  const renderEquityCurve = () => {
    if (!result || !result.trades || result.trades.length === 0) {
      return (
        <div className="h-64 flex flex-col items-center justify-center text-zinc-500 border border-zinc-800/80 rounded-xl bg-zinc-900/30">
          <BarChart2 className="w-10 h-10 mb-2 opacity-40 text-emerald-400" />
          <p className="text-sm font-medium">No closed trades in this historical window</p>
          <p className="text-xs text-zinc-500 mt-1">Try expanding the range to 1y or 2y, or lowering the quality score threshold.</p>
        </div>
      );
    }

    // Build equity points starting from initial balance
    let currentBal = result.config.initialBalance;
    const points: { date: string; balance: number; pnl: number; isWin: boolean }[] = [
      { date: result.startDate, balance: currentBal, pnl: 0, isWin: true },
    ];

    result.trades.forEach((t) => {
      currentBal += t.netPnl;
      points.push({
        date: t.exitDateStr,
        balance: currentBal,
        pnl: t.netPnl,
        isWin: t.netPnl >= 0,
      });
    });

    const balances = points.map((p) => p.balance);
    const minBal = Math.min(...balances) * 0.98;
    const maxBal = Math.max(...balances) * 1.02;
    const rangeBal = Math.max(10, maxBal - minBal);

    const width = 800;
    const height = 260;
    const padX = 50;
    const padY = 30;

    const chartWidth = width - padX * 2;
    const chartHeight = height - padY * 2;

    const coords = points.map((p, idx) => {
      const x = padX + (idx / (points.length - 1)) * chartWidth;
      const y = padY + chartHeight - ((p.balance - minBal) / rangeBal) * chartHeight;
      return { x, y, ...p };
    });

    const pathD = coords.reduce(
      (acc, pt, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`,
      ''
    );

    const areaD = `${pathD} L ${coords[coords.length - 1].x} ${padY + chartHeight} L ${coords[0].x} ${padY + chartHeight} Z`;

    const isNetPositive = (balances[balances.length - 1] || 0) >= result.config.initialBalance;
    const strokeColor = isNetPositive ? '#10b981' : '#f43f5e';
    const gradientId = isNetPositive ? 'eqGradGreen' : 'eqGradRed';

    return (
      <div className="relative bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 overflow-hidden">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-sm font-semibold text-zinc-100">Cumulative Portfolio Equity Curve</span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                Start: ${result.config.initialBalance.toLocaleString()}
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              Simulated {result.trades.length} Trullàs setups from {result.startDate} to {result.endDate}
            </p>
          </div>
          <div className="text-right">
            <span className="text-xs text-zinc-400 block">Final Balance</span>
            <span
              className={`text-base font-bold font-mono ${
                isNetPositive ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              ${balances[balances.length - 1]?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-64 overflow-visible">
          <defs>
            <linearGradient id="eqGradGreen" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="eqGradRed" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          <line
            x1={padX}
            y1={padY}
            x2={padX + chartWidth}
            y2={padY}
            stroke="#27272a"
            strokeDasharray="3 3"
          />
          <line
            x1={padX}
            y1={padY + chartHeight / 2}
            x2={padX + chartWidth}
            y2={padY + chartHeight / 2}
            stroke="#27272a"
            strokeDasharray="3 3"
          />
          <line
            x1={padX}
            y1={padY + chartHeight}
            x2={padX + chartWidth}
            y2={padY + chartHeight}
            stroke="#3f3f46"
          />

          {/* Initial balance horizontal line */}
          {(() => {
            const initY = padY + chartHeight - ((result.config.initialBalance - minBal) / rangeBal) * chartHeight;
            return (
              <>
                <line
                  x1={padX}
                  y1={initY}
                  x2={padX + chartWidth}
                  y2={initY}
                  stroke="#71717a"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                />
                <text
                  x={padX - 8}
                  y={padY + 4}
                  fill="#71717a"
                  fontSize="10"
                  textAnchor="end"
                  fontFamily="monospace"
                >
                  ${Math.round(maxBal).toLocaleString()}
                </text>
                <text
                  x={padX - 8}
                  y={initY + 3}
                  fill="#10b981"
                  fontSize="9"
                  textAnchor="end"
                  fontFamily="monospace"
                  fontWeight="bold"
                >
                  Base
                </text>
                <text
                  x={padX - 8}
                  y={padY + chartHeight}
                  fill="#71717a"
                  fontSize="10"
                  textAnchor="end"
                  fontFamily="monospace"
                >
                  ${Math.round(minBal).toLocaleString()}
                </text>
              </>
            );
          })()}

          {/* Area Fill */}
          <path d={areaD} fill={`url(#${gradientId})`} />

          {/* Curve Stroke */}
          <path d={pathD} fill="none" stroke={strokeColor} strokeWidth="2.5" />

          {/* Trade Dots */}
          {coords.map((pt, i) => {
            if (i === 0) return null;
            return (
              <g key={i}>
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={3.5}
                  fill={pt.isWin ? '#10b981' : '#f43f5e'}
                  stroke="#09090b"
                  strokeWidth="1.5"
                />
              </g>
            );
          })}
        </svg>

        <div className="flex items-center justify-between text-[11px] text-zinc-500 mt-2 px-2 font-mono">
          <span>{result.startDate}</span>
          <span className="text-zinc-400">Dotted Line = Initial Capital Baseline</span>
          <span>{result.endDate}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Strategy Intro */}
      <div className="bg-gradient-to-r from-zinc-900 via-zinc-900/90 to-zinc-950 border border-zinc-800 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <span className="text-xs uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              Strategy Backtester
            </span>
            <span className="text-xs uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              Trullàs 4-Pillars Engine
            </span>
            <span className="text-xs uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
              @luxalgo/journal-core
            </span>
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">
            Historical Quantitative Backtester & Edge Analytics
          </h1>
          <p className="text-xs text-zinc-400 max-w-2xl">
            Simulate David Trullàs Triple MACD Divergence trade execution with 23.6% Fibonacci breakout trigger,
            swing-low stop loss, and TP1/TP2 scaling. Verified against institutional lot-matching and drawdown analytics.
          </p>
        </div>

        {/* LuxAlgo Edge Score Badge */}
        {result?.edgeScore && (
          <div className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-3 px-4 flex items-center space-x-4 min-w-[210px]">
            <div className="text-center">
              <span className="text-[10px] uppercase font-bold text-zinc-400 block">LuxAlgo Edge Score</span>
              <div className="text-2xl font-black font-mono text-emerald-400">
                {result.edgeScore.score !== null ? `${result.edgeScore.score}/100` : 'N/A'}
              </div>
              <span className="text-[10px] text-zinc-500">
                {result.edgeScore.score && result.edgeScore.score >= 70
                  ? 'Strong Verified Edge'
                  : result.edgeScore.score && result.edgeScore.score >= 50
                  ? 'Moderate Edge'
                  : 'Needs Confluence'}
              </span>
            </div>
            <div className="border-l border-zinc-800 pl-3 text-[10px] text-zinc-400 space-y-1">
              <div>Win Rate: <span className="font-mono text-zinc-200">{result.edgeScore.components?.winRate !== undefined ? Math.round(result.edgeScore.components.winRate) : 0}%</span></div>
              <div>Profit Factor: <span className="font-mono text-zinc-200">{result.edgeScore.components?.profitFactor !== undefined ? Math.round(result.edgeScore.components.profitFactor) : 0}%</span></div>
              <div>Drawdown: <span className="font-mono text-zinc-200">{result.edgeScore.components?.drawdown !== undefined ? Math.round(result.edgeScore.components.drawdown) : 0}%</span></div>
            </div>
          </div>
        )}
      </div>

      {/* Configuration Controls Bar */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          {/* Ticker Input */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
              Asset Symbol
            </label>
            <input
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              className="w-full bg-zinc-950 border border-zinc-700/80 rounded-lg px-3 py-1.5 text-sm font-mono font-bold text-white focus:outline-none focus:border-emerald-500"
              placeholder="e.g. AAPL, NVDA"
            />
          </div>

          {/* Timeframe */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
              Candle Timeframe
            </label>
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-700/80 rounded-lg px-3 py-1.5 text-xs font-medium text-white focus:outline-none focus:border-emerald-500"
            >
              <option value="15m">15 Minutes (Intraday)</option>
              <option value="1h">1 Hour (Swing)</option>
              <option value="1d">1 Day (Standard)</option>
            </select>
          </div>

          {/* Historical Range */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
              Historical Range
            </label>
            <select
              value={range}
              onChange={(e) => setRange(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-700/80 rounded-lg px-3 py-1.5 text-xs font-medium text-white focus:outline-none focus:border-emerald-500"
            >
              <option value="1mo">1 Month</option>
              <option value="3mo">3 Months</option>
              <option value="6mo">6 Months</option>
              <option value="1y">1 Year</option>
              <option value="2y">2 Years</option>
              <option value="5y">5 Years</option>
            </select>
          </div>

          {/* Target Mode */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
              Exit Strategy
            </label>
            <select
              value={targetMode}
              onChange={(e) => setTargetMode(e.target.value as any)}
              className="w-full bg-zinc-950 border border-zinc-700/80 rounded-lg px-3 py-1.5 text-xs font-medium text-white focus:outline-none focus:border-emerald-500"
            >
              <option value="tranches">Trullàs Scaling (TP1 + BE + TP2)</option>
              <option value="tp1">TP1 Only (38.2% Fib Target)</option>
              <option value="tp2">TP2 Golden Pocket (61.8% Fib)</option>
            </select>
          </div>

          {/* Starting Capital */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
              Starting Capital ($)
            </label>
            <input
              type="number"
              value={initialBalance}
              onChange={(e) => setInitialBalance(Number(e.target.value))}
              step={1000}
              min={1000}
              className="w-full bg-zinc-950 border border-zinc-700/80 rounded-lg px-3 py-1.5 text-xs font-mono font-medium text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Run Action */}
          <div className="flex items-end">
            <button
              onClick={() => executeBacktest(symbol, timeframe, range)}
              disabled={loading}
              className="w-full h-[34px] flex items-center justify-center space-x-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-xs rounded-lg transition-all shadow-md shadow-emerald-500/20 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                  <span>Simulating...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Run Backtest</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Quick Presets */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-zinc-800/60">
          <span className="text-[11px] text-zinc-400 font-medium mr-1">Quick Assets:</span>
          {PRESET_SYMBOLS.map((sym) => (
            <button
              key={sym}
              onClick={() => {
                setSymbol(sym);
                executeBacktest(sym, timeframe, range);
              }}
              className={`px-2 py-0.5 text-[11px] rounded font-mono font-semibold transition-all ${
                symbol === sym
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700'
              }`}
            >
              {sym}
            </button>
          ))}
          <div className="ml-auto text-[11px] text-zinc-400 flex items-center space-x-2">
            <span>Risk/Trade:</span>
            <input
              type="range"
              min="0.5"
              max="3.0"
              step="0.5"
              value={riskPerTradePct}
              onChange={(e) => setRiskPerTradePct(parseFloat(e.target.value))}
              className="w-20 accent-emerald-500"
            />
            <span className="font-mono text-zinc-200">{riskPerTradePct}%</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs flex items-center space-x-2">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>Error running backtest: {error}</span>
        </div>
      )}

      {/* KPI Performance Scorecard */}
      {result && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {/* Win Rate */}
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-3">
            <span className="text-[10px] uppercase font-bold text-zinc-400 block">Win Rate</span>
            <div className="text-lg font-bold font-mono text-emerald-400 mt-1">
              {result.metrics.winRate !== null
                ? `${(result.metrics.winRate * 100).toFixed(1)}%`
                : '0.0%'}
            </div>
            <span className="text-[10px] text-zinc-500">
              {result.metrics.wins}W / {result.metrics.losses}L / {result.metrics.breakevens}BE
            </span>
          </div>

          {/* Net P&L */}
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-3">
            <span className="text-[10px] uppercase font-bold text-zinc-400 block">Net Realized P&L</span>
            <div
              className={`text-lg font-bold font-mono mt-1 ${
                result.metrics.netPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {result.metrics.netPnl >= 0 ? '+' : ''}$
              {result.metrics.netPnl.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            <span className="text-[10px] text-zinc-500">
              {result.config.initialBalance > 0
                ? `${((result.metrics.netPnl / result.config.initialBalance) * 100).toFixed(1)}% return`
                : ''}
            </span>
          </div>

          {/* Profit Factor */}
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-3">
            <span className="text-[10px] uppercase font-bold text-zinc-400 block">Profit Factor</span>
            <div className="text-lg font-bold font-mono text-cyan-400 mt-1">
              {result.metrics.profitFactor !== null
                ? result.metrics.profitFactor.toFixed(2)
                : result.metrics.profitFactorIsInfinite
                ? '∞ (Zero Loss)'
                : '1.00'}
            </div>
            <span className="text-[10px] text-zinc-500">Gross profit / loss</span>
          </div>

          {/* Max Drawdown */}
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-3">
            <span className="text-[10px] uppercase font-bold text-zinc-400 block">Max Drawdown</span>
            <div className="text-lg font-bold font-mono text-rose-400 mt-1">
              {result.metrics.maxDrawdownPct !== null
                ? `-${(result.metrics.maxDrawdownPct * 100).toFixed(1)}%`
                : '-0.0%'}
            </div>
            <span className="text-[10px] text-zinc-500">
              -${result.metrics.maxDrawdown?.toLocaleString(undefined, { minimumFractionDigits: 0 }) || 0}
            </span>
          </div>

          {/* Realized R Multiple */}
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-3">
            <span className="text-[10px] uppercase font-bold text-zinc-400 block">Avg Realized R</span>
            <div className="text-lg font-bold font-mono text-amber-400 mt-1">
              {result.metrics.avgRealizedR !== null
                ? `${result.metrics.avgRealizedR > 0 ? '+' : ''}${result.metrics.avgRealizedR.toFixed(2)}R`
                : '—'}
            </div>
            <span className="text-[10px] text-zinc-500">Reward-to-Risk ratio</span>
          </div>

          {/* Expectancy */}
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-3">
            <span className="text-[10px] uppercase font-bold text-zinc-400 block">Expectancy</span>
            <div
              className={`text-lg font-bold font-mono mt-1 ${
                (result.metrics.expectancy || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {(result.metrics.expectancy || 0) >= 0 ? '+' : ''}$
              {result.metrics.expectancy?.toFixed(2) || '0.00'}
            </div>
            <span className="text-[10px] text-zinc-500">Per trade value</span>
          </div>

          {/* Streaks */}
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-3">
            <span className="text-[10px] uppercase font-bold text-zinc-400 block">Max Streak</span>
            <div className="text-lg font-bold font-mono text-zinc-200 mt-1">
              <span className="text-emerald-400">{result.metrics.maxWinStreak}W</span> /{' '}
              <span className="text-rose-400">{result.metrics.maxLossStreak}L</span>
            </div>
            <span className="text-[10px] text-zinc-500">Consecutive runs</span>
          </div>

          {/* Total Trades */}
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-3">
            <span className="text-[10px] uppercase font-bold text-zinc-400 block">Total Cycles</span>
            <div className="text-lg font-bold font-mono text-white mt-1">
              {result.trades.length}
            </div>
            <span className="text-[10px] text-zinc-500">
              {result.candleCount} bars tested
            </span>
          </div>
        </div>
      )}

      {/* Main Tabs (Equity Curve vs Breakdowns vs Trade Log) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setActiveTab('equity')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'equity'
                  ? 'bg-zinc-800 text-white border border-zinc-700 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Cumulative Equity Curve
            </button>
            <button
              onClick={() => setActiveTab('breakdowns')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'breakdowns'
                  ? 'bg-zinc-800 text-white border border-zinc-700 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              LuxAlgo Performance Breakdowns
            </button>
            <button
              onClick={() => setActiveTab('trades')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'trades'
                  ? 'bg-zinc-800 text-white border border-zinc-700 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Trade Execution Log ({result?.trades.length || 0})
            </button>
            <button
              onClick={() => setActiveTab('optimizer')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center space-x-1.5 ${
                activeTab === 'optimizer'
                  ? 'bg-indigo-600 text-white border border-indigo-500 shadow-sm shadow-indigo-500/20'
                  : 'bg-indigo-950/40 text-indigo-400 hover:bg-indigo-900/50 border border-indigo-800/40'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Strategy Optimizer</span>
            </button>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => onSelectSymbolForChart(symbol)}
              className="flex items-center space-x-1.5 text-xs text-cyan-400 hover:text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 px-3 py-1.5 rounded-lg border border-cyan-500/20 transition-all font-medium"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Inspect {symbol} in Technical Chart</span>
            </button>
          </div>
        </div>

        {/* Tab 1: Equity Curve */}
        {activeTab === 'equity' && renderEquityCurve()}

        {/* Tab 2: LuxAlgo Performance Breakdowns */}
        {activeTab === 'breakdowns' && result && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Direction Breakdown */}
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center space-x-2 text-sm font-semibold text-zinc-200">
                <Target className="w-4 h-4 text-emerald-400" />
                <span>Performance by Direction</span>
              </div>
              <div className="space-y-2">
                {result.byDirection.map((item) => (
                  <div
                    key={item.key}
                    className="flex items-center justify-between p-2.5 bg-zinc-950/70 border border-zinc-800 rounded-lg text-xs"
                  >
                    <div>
                      <span className="font-bold text-zinc-200 uppercase">{item.key}</span>
                      <span className="text-[10px] text-zinc-500 ml-2">({item.trades} trades)</span>
                    </div>
                    <div className="text-right">
                      <span
                        className={`font-mono font-bold block ${
                          item.netPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {item.netPnl >= 0 ? '+' : ''}${item.netPnl.toFixed(2)}
                      </span>
                      <span className="text-[10px] text-zinc-500">
                        WR: {item.winRate !== null ? `${(item.winRate * 100).toFixed(0)}%` : '0%'}
                      </span>
                    </div>
                  </div>
                ))}
                {result.byDirection.length === 0 && (
                  <p className="text-xs text-zinc-500 text-center py-4">No closed trades yet</p>
                )}
              </div>
            </div>

            {/* Weekday Breakdown */}
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center space-x-2 text-sm font-semibold text-zinc-200">
                <Calendar className="w-4 h-4 text-cyan-400" />
                <span>Performance by Weekday</span>
              </div>
              <div className="space-y-1.5 max-h-56 overflow-y-auto">
                {result.byWeekday.map((item) => (
                  <div
                    key={item.key}
                    className="flex items-center justify-between p-2 bg-zinc-950/70 border border-zinc-800 rounded-lg text-xs"
                  >
                    <span className="font-medium text-zinc-300">{item.key}</span>
                    <span className="text-[10px] text-zinc-500">{item.trades} trades</span>
                    <span
                      className={`font-mono font-bold ${
                        item.netPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {item.netPnl >= 0 ? '+' : ''}${item.netPnl.toFixed(0)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Holding Duration */}
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center space-x-2 text-sm font-semibold text-zinc-200">
                <Clock className="w-4 h-4 text-amber-400" />
                <span>Holding Duration</span>
              </div>
              <div className="space-y-1.5">
                {result.byDuration.map((item) => (
                  <div
                    key={item.key}
                    className="flex items-center justify-between p-2 bg-zinc-950/70 border border-zinc-800 rounded-lg text-xs"
                  >
                    <span className="font-medium text-zinc-300">{item.key}</span>
                    <span className="text-[10px] text-zinc-500">{item.trades} trades</span>
                    <span
                      className={`font-mono font-bold ${
                        item.netPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {item.netPnl >= 0 ? '+' : ''}${item.netPnl.toFixed(0)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Detailed Trade Log */}
        {activeTab === 'trades' && result && (
          <div className="space-y-3">
            {/* Filter buttons */}
            <div className="flex items-center space-x-2">
              <span className="text-xs text-zinc-400">Filter:</span>
              {(['ALL', 'WIN', 'LOSS', 'BREAKEVEN'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setTradeFilter(mode)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                    tradeFilter === mode
                      ? 'bg-zinc-800 text-white border border-zinc-700'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {mode}
                </button>
              ))}
              <span className="text-xs text-zinc-500 ml-auto">
                Showing {filteredTrades.length} of {result.trades.length} trades
              </span>
            </div>

            {/* Table */}
            <div className="overflow-x-auto border border-zinc-800 rounded-xl bg-zinc-900/40">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-950/80 border-b border-zinc-800 text-zinc-400 text-[10px] uppercase font-bold tracking-wider">
                  <tr>
                    <th className="py-2.5 px-3">#</th>
                    <th className="py-2.5 px-3">Direction</th>
                    <th className="py-2.5 px-3">Entry Date</th>
                    <th className="py-2.5 px-3">Exit Date</th>
                    <th className="py-2.5 px-3">Entry Price</th>
                    <th className="py-2.5 px-3">Exit Price</th>
                    <th className="py-2.5 px-3">Net P&L ($)</th>
                    <th className="py-2.5 px-3">Return</th>
                    <th className="py-2.5 px-3">Realized R</th>
                    <th className="py-2.5 px-3">Reason</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 font-mono">
                  {filteredTrades.map((t) => (
                    <tr key={t.id} className="hover:bg-zinc-800/30 transition-colors">
                      <td className="py-2.5 px-3 text-zinc-400">#{t.tradeNumber}</td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            t.direction === 'long'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          }`}
                        >
                          {t.direction === 'long' ? (
                            <ArrowUpRight className="w-3 h-3" />
                          ) : (
                            <ArrowDownRight className="w-3 h-3" />
                          )}
                          <span className="uppercase">{t.direction}</span>
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-zinc-300 font-sans">{t.entryDateStr}</td>
                      <td className="py-2.5 px-3 text-zinc-300 font-sans">{t.exitDateStr}</td>
                      <td className="py-2.5 px-3 text-zinc-200">${t.entryPrice.toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-zinc-200">${t.exitPrice.toFixed(2)}</td>
                      <td
                        className={`py-2.5 px-3 font-bold ${
                          t.netPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {t.netPnl >= 0 ? '+' : ''}${t.netPnl.toFixed(2)}
                      </td>
                      <td
                        className={`py-2.5 px-3 font-bold ${
                          t.returnPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {t.returnPct >= 0 ? '+' : ''}{t.returnPct.toFixed(2)}%
                      </td>
                      <td className="py-2.5 px-3 text-amber-400 font-bold">
                        {t.realizedR > 0 ? `+${t.realizedR.toFixed(2)}R` : `${t.realizedR.toFixed(2)}R`}
                      </td>
                      <td className="py-2.5 px-3 text-[10px] text-zinc-400 font-sans">
                        {t.exitReason}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-1.5 py-0.5 text-[10px] uppercase font-bold rounded ${
                            t.status === 'win'
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : t.status === 'loss'
                              ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                              : 'bg-zinc-800 text-zinc-300 border border-zinc-700'
                          }`}
                        >
                          {t.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-sans">
                        <button
                          onClick={() => onSelectSymbolForChart(symbol)}
                          className="text-[11px] text-cyan-400 hover:text-cyan-300 hover:underline flex items-center space-x-1"
                        >
                          <span>Chart</span>
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredTrades.length === 0 && (
                    <tr>
                      <td colSpan={12} className="py-8 text-center text-zinc-500 font-sans">
                        No trades found matching this filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 4: Strategy Optimizer */}
        {activeTab === 'optimizer' && (
          <div className="space-y-6">
            {optimizing || !optimizationReport ? (
              <div className="p-12 flex flex-col items-center justify-center bg-zinc-900/60 border border-zinc-800 rounded-xl space-y-3">
                <RotateCcw className="w-8 h-8 animate-spin text-indigo-400" />
                <span className="text-sm font-medium text-zinc-300">
                  Running Sharpe Ratio Grid Search Optimization for {symbol}...
                </span>
                <span className="text-xs text-zinc-500">
                  Simulating 54 parameter combinations across MACD Signal Quality Scores, RSI Extremes, and Tranche Exits.
                </span>
              </div>
            ) : (
              <>
                {/* Hero Sharpe Comparison Banner */}
                <div className="bg-gradient-to-r from-indigo-950/80 via-zinc-900 to-indigo-950/60 border border-indigo-500/30 rounded-xl p-5 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                        Sharpe Maximizer Engine
                      </span>
                      {optimizationReport.sharpeImprovementPct > 0 && (
                        <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center space-x-1">
                          <TrendingUp className="w-3 h-3" />
                          <span>+{optimizationReport.sharpeImprovementPct}% Sharpe Boost</span>
                        </span>
                      )}
                    </div>
                    <h2 className="text-lg font-bold text-white tracking-tight">
                      Optimal Strategy Configuration Suggested
                    </h2>
                    <p className="text-xs text-zinc-400 max-w-xl">
                      Automated backtest grid search evaluated parameter combinations against historical {symbol} price action to isolate the ideal MACD signal quality filter and exit tranche.
                    </p>
                  </div>

                  {/* Apply Optimal Thresholds Button */}
                  <div className="flex flex-col sm:flex-row items-center gap-3">
                    <div className="flex items-center space-x-4 bg-zinc-950/80 border border-zinc-800 rounded-xl p-3 px-4">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-zinc-500 block">Baseline Sharpe</span>
                        <span className="text-base font-bold font-mono text-zinc-400">
                          {optimizationReport.baselineMetrics.sharpeRatio.toFixed(2)}
                        </span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-zinc-600" />
                      <div>
                        <span className="text-[10px] uppercase font-bold text-indigo-400 block">Optimal Sharpe</span>
                        <span className="text-base font-bold font-mono text-emerald-400">
                          {optimizationReport.optimalCandidate.sharpeRatio.toFixed(2)}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={applyOptimalThresholds}
                      className="w-full sm:w-auto h-[44px] px-5 bg-gradient-to-r from-indigo-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 text-white font-bold text-xs rounded-xl transition-all shadow-lg shadow-indigo-500/20 flex items-center justify-center space-x-2 shrink-0"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>Apply Optimal Strategy Thresholds & Re-Run</span>
                    </button>
                  </div>
                </div>

                {/* Key Recommendation Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {/* Min Quality Score */}
                  <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 space-y-2">
                    <span className="text-[10px] uppercase font-bold text-zinc-400 block">Suggested Min Quality Score</span>
                    <div className="text-2xl font-black font-mono text-indigo-400">
                      {optimizationReport.recommendedThresholds.minQualityScore}%
                    </div>
                    <p className="text-[11px] text-zinc-400">
                      Baseline: {optimizationReport.baselineMetrics.minQualityScore}% Score Threshold
                    </p>
                  </div>

                  {/* Target Mode */}
                  <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 space-y-2">
                    <span className="text-[10px] uppercase font-bold text-zinc-400 block">Suggested Exit Strategy</span>
                    <div className="text-lg font-bold text-emerald-400 uppercase font-mono">
                      {optimizationReport.recommendedThresholds.targetMode}
                    </div>
                    <p className="text-[11px] text-zinc-400">
                      {optimizationReport.recommendedThresholds.targetMode === 'tranches'
                        ? 'Trullàs Tranche Scaling (TP1 + BE + TP2)'
                        : optimizationReport.recommendedThresholds.targetMode === 'tp1'
                        ? 'TP1 Quick Profit Lock (38.2% Fib)'
                        : 'TP2 Golden Pocket Swing (61.8% Fib)'}
                    </p>
                  </div>

                  {/* RSI Extremes */}
                  <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 space-y-2">
                    <span className="text-[10px] uppercase font-bold text-zinc-400 block">Suggested RSI Extremes</span>
                    <div className="text-2xl font-black font-mono text-cyan-400">
                      {optimizationReport.recommendedThresholds.rsiOversold} / {optimizationReport.recommendedThresholds.rsiOverbought}
                    </div>
                    <p className="text-[11px] text-zinc-400">
                      Oversold / Overbought divergence boundaries
                    </p>
                  </div>

                  {/* Expected Max Drawdown */}
                  <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 space-y-2">
                    <span className="text-[10px] uppercase font-bold text-zinc-400 block">Optimized Max Drawdown</span>
                    <div className="text-2xl font-black font-mono text-rose-400">
                      -{(optimizationReport.optimalCandidate.maxDrawdownPct * 100).toFixed(1)}%
                    </div>
                    <p className="text-[11px] text-zinc-400">
                      Baseline Drawdown: -{(optimizationReport.baselineMetrics.maxDrawdownPct * 100).toFixed(1)}%
                    </p>
                  </div>
                </div>

                {/* Rationale & Optimization Leaderboard */}
                <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-center space-x-2 text-sm font-semibold text-zinc-200">
                    <Zap className="w-4 h-4 text-amber-400" />
                    <span>Optimization Rationale & Analytical Insights</span>
                  </div>
                  <p className="text-xs text-zinc-300 leading-relaxed bg-zinc-950/70 p-3 rounded-lg border border-zinc-800/80 font-sans">
                    {optimizationReport.recommendedThresholds.rationale}
                  </p>
                </div>

                {/* Top 5 Optimization Candidates Leaderboard */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-zinc-200">Top 5 Optimization Candidate Configurations</h3>
                    <span className="text-xs text-zinc-500 font-mono">Sorted by Sharpe Ratio</span>
                  </div>

                  <div className="overflow-x-auto border border-zinc-800 rounded-xl bg-zinc-900/40">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-zinc-950/80 border-b border-zinc-800 text-zinc-400 text-[10px] uppercase font-bold tracking-wider">
                        <tr>
                          <th className="py-2.5 px-3">Rank</th>
                          <th className="py-2.5 px-3">Min Score</th>
                          <th className="py-2.5 px-3">RSI Bounds</th>
                          <th className="py-2.5 px-3">Exit Target Mode</th>
                          <th className="py-2.5 px-3">Sharpe Ratio</th>
                          <th className="py-2.5 px-3">Win Rate</th>
                          <th className="py-2.5 px-3">Net P&L ($)</th>
                          <th className="py-2.5 px-3">Max Drawdown</th>
                          <th className="py-2.5 px-3">Edge Score</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/60 font-mono">
                        {optimizationReport.topCandidates.map((cand, idx) => (
                          <tr
                            key={idx}
                            className={`transition-colors ${
                              idx === 0
                                ? 'bg-indigo-500/10 hover:bg-indigo-500/20'
                                : 'hover:bg-zinc-800/30'
                            }`}
                          >
                            <td className="py-2.5 px-3 font-bold">
                              {idx === 0 ? (
                                <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-black bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                                  #1 Optimal
                                </span>
                              ) : (
                                <span className="text-zinc-500">#{idx + 1}</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-zinc-200">{cand.params.minQualityScore}%</td>
                            <td className="py-2.5 px-3 text-cyan-400">
                              {cand.params.rsiOversoldThreshold}/{cand.params.rsiOverboughtThreshold}
                            </td>
                            <td className="py-2.5 px-3 uppercase text-emerald-400">{cand.params.targetMode}</td>
                            <td className="py-2.5 px-3 font-bold text-indigo-300">{cand.sharpeRatio.toFixed(2)}</td>
                            <td className="py-2.5 px-3 text-emerald-400">
                              {cand.winRatePct !== null && cand.winRatePct !== undefined
                                ? (cand.winRatePct * 100).toFixed(1)
                                : '0.0'}%
                            </td>
                            <td
                              className={`py-2.5 px-3 font-bold ${
                                cand.totalNetPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              ${cand.totalNetPnl.toFixed(2)}
                            </td>
                            <td className="py-2.5 px-3 text-rose-400">
                              -{(cand.maxDrawdownPct * 100).toFixed(1)}%
                            </td>
                            <td className="py-2.5 px-3 font-bold text-amber-400">
                              {cand.luxAlgoEdgeScore !== undefined && cand.luxAlgoEdgeScore !== null
                                ? `${cand.luxAlgoEdgeScore}/100`
                                : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Parameter Sensitivity Surface Grid */}
                <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-zinc-200">Parameter Sensitivity Surface</span>
                    <span className="text-xs text-zinc-500 font-mono">Sharpe Ratio Heat Map</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {['25/75 (Strict Extreme)', '30/70 (Standard)', '35/65 (Relaxed)'].map((rsiLabel) => {
                      const surfaceForLabel = optimizationReport.parameterSensitivitySurface.filter(
                        (pt) => pt.rsiThresholdLabel === rsiLabel
                      );
                      return (
                        <div key={rsiLabel} className="bg-zinc-950/70 border border-zinc-800 rounded-lg p-3 space-y-2">
                          <span className="text-[11px] font-bold text-indigo-300 block">{rsiLabel}</span>
                          <div className="space-y-1">
                            {surfaceForLabel.map((pt) => (
                              <div
                                key={pt.minQualityScore}
                                className="flex items-center justify-between text-xs py-1 border-b border-zinc-800/40 last:border-none"
                              >
                                <span className="text-zinc-400">Min Score {pt.minQualityScore}%</span>
                                <span
                                  className={`font-mono font-bold px-1.5 py-0.5 rounded text-[11px] ${
                                    pt.sharpeRatio >= 2.0
                                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                      : pt.sharpeRatio >= 1.5
                                      ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                                      : 'bg-zinc-800 text-zinc-300'
                                  }`}
                                >
                                  {pt.sharpeRatio.toFixed(2)} Sharpe
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
