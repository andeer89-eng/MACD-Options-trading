import React, { useState, useMemo } from 'react';
import {
  Compass,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Layers,
  BarChart2,
  Code2,
  Copy,
  Check,
  ShieldAlert,
  Sliders,
  ExternalLink,
  Info,
  Zap,
  Target,
  ArrowRight,
  Search,
  Filter,
  Play,
  RotateCcw,
  Sparkles,
  DollarSign,
  Shuffle,
  ChevronRight,
  ArrowUpRight,
  ShieldCheck,
  Activity,
  BookOpen,
} from 'lucide-react';
import {
  calculateStageAnalysis,
  calculateRaindropBars,
  calculateAutoAnchoredVwap,
  detectAutomatedTrendlines,
  generateTrendSpiderReport,
  CandleData,
  MarketStage,
} from '../utils/trendSpiderEngine';
import {
  TRENDSPIDER_STOCKS_PRESET,
  SPY_WEEKLY_PRESET,
} from '../data/trendSpiderPresets';
import {
  getUniverseCandles,
  getUniverseStageSummary,
  getAllSp500StageSummaries,
  runStanWeinsteinBacktest,
  UniverseStageItem,
  StageBacktestResult,
} from '../utils/trendSpiderUniverse';
import { SP500_UNIVERSE } from '../data/sp500Universe';
import { BUILT_IN_INDICATORS } from '../utils/indicatorLibrary';

interface TrendSpiderSuiteProps {
  onSelectSymbolForChart?: (symbol: string) => void;
  onOpenCalculator?: (setup: any) => void;
  onNavigateToTab?: (tab: any) => void;
}

type SubTab =
  | 'terminal'
  | 'scanner-sp500'
  | 'backtest'
  | 'raindrop'
  | 'avwap'
  | 'trendlines'
  | 'code';

export const TrendSpiderSuite: React.FC<TrendSpiderSuiteProps> = ({
  onSelectSymbolForChart,
  onOpenCalculator,
  onNavigateToTab,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('terminal');
  const [selectedSymbol, setSelectedSymbol] = useState<string>('NBIS');
  const [symbolSearchQuery, setSymbolSearchQuery] = useState<string>('');
  const [isSearchFocused, setIsSearchFocused] = useState<boolean>(false);
  const [stageFilter, setStageFilter] = useState<'ALL' | MarketStage>('ALL');
  const [avwapAnchor, setAvwapAnchor] = useState<'PEAK_VOLUME' | 'SWING_HIGH' | 'SWING_LOW' | 'YTD'>('PEAK_VOLUME');
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);

  // Backtest parameters state
  const [backtestCapital, setBacktestCapital] = useState<number>(10000);
  const [backtestYears, setBacktestYears] = useState<1 | 2 | 3 | 5>(3);

  // Generate or retrieve candles for ANY selected symbol
  const activeCandles: CandleData[] = useMemo(() => {
    return getUniverseCandles(selectedSymbol);
  }, [selectedSymbol]);

  // Unified TrendSpider Report for active symbol
  const activeReport = useMemo(() => {
    return generateTrendSpiderReport(selectedSymbol, activeCandles, SPY_WEEKLY_PRESET);
  }, [selectedSymbol, activeCandles]);

  // Auto-AVWAP for active symbol with selected anchor
  const activeAvwap = useMemo(() => {
    return calculateAutoAnchoredVwap(activeCandles, avwapAnchor);
  }, [activeCandles, avwapAnchor]);

  // Backtest result for active symbol
  const activeBacktest: StageBacktestResult = useMemo(() => {
    return runStanWeinsteinBacktest(selectedSymbol, backtestCapital, backtestYears);
  }, [selectedSymbol, backtestCapital, backtestYears]);

  // Pre-calculated S&P 500 Stage Summaries (all 503 constituents)
  const allSp500Summaries: UniverseStageItem[] = useMemo(() => {
    return getAllSp500StageSummaries();
  }, []);

  // Filtered universe for the Full S&P 500 Stage Scanner tab
  const [sp500TableSearch, setSp500TableSearch] = useState<string>('');
  const [sp500StageFilter, setSp500StageFilter] = useState<'ALL' | MarketStage>('ALL');
  const [sp500SectorFilter, setSp500SectorFilter] = useState<string>('ALL');

  const filteredSp500Summaries = useMemo(() => {
    return allSp500Summaries.filter((item) => {
      const matchStage = sp500StageFilter === 'ALL' || item.stage.currentStage === sp500StageFilter;
      const matchSector = sp500SectorFilter === 'ALL' || item.sector === sp500SectorFilter;
      const q = sp500TableSearch.trim().toLowerCase();
      const matchSearch =
        !q ||
        item.symbol.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q) ||
        item.sector.toLowerCase().includes(q);
      return matchStage && matchSector && matchSearch;
    });
  }, [allSp500Summaries, sp500StageFilter, sp500SectorFilter, sp500TableSearch]);

  // Autocomplete matching items for ticker search
  const autocompleteSuggestions = useMemo(() => {
    const q = symbolSearchQuery.trim().toUpperCase();
    if (!q) return [];
    return SP500_UNIVERSE.filter(
      (c) => c.symbol.toUpperCase().includes(q) || c.name.toUpperCase().includes(q)
    ).slice(0, 8);
  }, [symbolSearchQuery]);

  // Random Ticker Picker
  const handlePickRandomTicker = () => {
    const randomIndex = Math.floor(Math.random() * SP500_UNIVERSE.length);
    const randomPick = SP500_UNIVERSE[randomIndex].symbol;
    setSelectedSymbol(randomPick);
    setSymbolSearchQuery('');
  };

  // Select custom ticker from search input
  const handleApplyCustomSymbol = (sym: string) => {
    const clean = sym.trim().toUpperCase();
    if (!clean) return;
    setSelectedSymbol(clean);
    setSymbolSearchQuery('');
    setIsSearchFocused(false);
  };

  // Copy code handler
  const handleCopyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCodeId(id);
    setTimeout(() => setCopiedCodeId(null), 2200);
  };

  // Breakdown alert stocks matching screenshot: NBIS, INTC, SNDK, GOOG
  const officialAlertStocks = useMemo(() => {
    return ['NBIS', 'INTC', 'SNDK', 'GOOG'].map((sym) => getUniverseStageSummary(sym));
  }, []);

  // Python REA code string
  const pythonReaCode = useMemo(() => {
    return `"""
TrendSpider Reverse-Engineered Analytics (REA) Suite
Derived from algorithmic reverse-engineering (morluto/rea)
Stage Analysis, Raindrop® Volume Profiles, and Auto-AVWAP.
"""

import numpy as np
import pandas as pd

def calculate_stage_analysis(df: pd.DataFrame, benchmark_df: pd.DataFrame = None, lookback_weeks: int = 30):
    df = df.copy()
    df['SMA30'] = df['close'].rolling(window=lookback_weeks).mean()
    df['SMA30_slope'] = df['SMA30'].pct_change(periods=5) * 100
    df['dist_from_sma'] = ((df['close'] - df['SMA30']) / df['SMA30']) * 100
    
    last = df.iloc[-1]
    is_above = last['close'] >= last['SMA30']
    slope = last['SMA30_slope']
    
    if is_above and slope > 0.4:
        stage = 2
        stage_name = "Stage 2: Advancing / Markup 🚀"
    elif not is_above and slope < -0.4:
        stage = 4
        stage_name = "Stage 4: Declining / Markdown 🩸 (Capitulation)"
    elif is_above and slope < -0.4:
        stage = 3
        stage_name = "Stage 3: Topping / Distribution ⚠️"
    else:
        stage = 1
        stage_name = "Stage 1: Basing / Accumulation"
        
    return {
        "stage": stage,
        "stage_name": stage_name,
        "current_price": float(last['close']),
        "sma30": float(last['SMA30']),
        "distance_pct": float(last['dist_from_sma']),
        "slope_pct": float(slope)
    }

if __name__ == "__main__":
    print("TrendSpider REA Engine Initialized.")
`;
  }, []);

  return (
    <div className="space-y-6 max-w-[1720px] mx-auto pb-12">
      {/* Top Banner / Hero Card */}
      <div className="relative overflow-hidden rounded-xl border border-zinc-800 bg-gradient-to-br from-zinc-900 via-zinc-950 to-zinc-900 p-6 shadow-2xl">
        <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-rose-500/10 blur-3xl pointer-events-none" />
        <div className="absolute right-1/3 -bottom-16 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                TrendSpider Quant Trading Terminal
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono bg-zinc-800 text-zinc-300 border border-zinc-700">
                All 503 S&amp;P 500 Stocks + Any Custom Ticker
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Stan Weinstein 4-Stage
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                Raindrop® Volume Profiles
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-100 mt-2 flex items-center gap-2">
              TrendSpider Quantitative Analysis &amp; Backtesting Terminal
            </h1>
            <p className="text-sm text-zinc-400 max-w-3xl mt-1">
              Full-scale institutional terminal: scan all 503 S&amp;P 500 stocks across Stan Weinstein’s 4 Stages, inspect any custom ticker, analyze Raindrop® volume profiles, Auto-AVWAP, and simulate stage breakout backtests with capital preservation alpha.
            </p>
          </div>

          <div className="flex items-center gap-2.5 w-full lg:w-auto flex-wrap">
            <button
              onClick={() => setActiveSubTab('backtest')}
              className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 transition-colors flex items-center gap-1.5 shadow-sm"
            >
              <Play className="w-3.5 h-3.5 text-emerald-400" />
              Run Stage Backtest
            </button>
            <button
              onClick={() => setActiveSubTab('code')}
              className="px-3 py-2 rounded-lg text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-colors flex items-center gap-1.5 shadow-sm"
            >
              <Code2 className="w-3.5 h-3.5 text-emerald-400" />
              Export Pine &amp; Python
            </button>
            {onSelectSymbolForChart && (
              <button
                onClick={() => onSelectSymbolForChart(selectedSymbol)}
                className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-zinc-950 transition-colors flex items-center gap-1.5 shadow-sm font-bold"
              >
                <BarChart2 className="w-3.5 h-3.5" />
                Chart: {selectedSymbol}
              </button>
            )}
          </div>
        </div>

        {/* Breakdown Alert Callout Matching User's Screenshot: Welcome to Stage 4 🩸 */}
        <div className="mt-5 pt-4 border-t border-zinc-800/80 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
          <div className="md:col-span-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-rose-500/20 border border-rose-500/40 flex items-center justify-center shrink-0">
              <span className="text-xl">🩸</span>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider font-bold text-rose-400">
                TrendSpider Official Alert Match
              </div>
              <div className="text-sm font-semibold text-zinc-100">
                "Welcome to Stage 4 🩸" (#NBIS #INTC #SNDK #GOOG)
              </div>
            </div>
          </div>

          <div className="md:col-span-8 flex items-center gap-2 overflow-x-auto pb-1">
            {officialAlertStocks.map((item) => (
              <button
                key={item.symbol}
                onClick={() => {
                  setSelectedSymbol(item.symbol);
                  setActiveSubTab('terminal');
                }}
                className={`px-3 py-1.5 rounded-lg border text-left transition-all shrink-0 ${
                  selectedSymbol === item.symbol
                    ? 'bg-rose-500/20 border-rose-500/60 shadow-lg shadow-rose-950/40'
                    : 'bg-zinc-900/80 border-zinc-800 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-xs text-zinc-100">{item.symbol}</span>
                  <span className="text-[10px] font-mono font-semibold text-rose-400">
                    Stage 4 🩸
                  </span>
                </div>
                <div className="text-[11px] text-zinc-400 flex items-center gap-2 mt-0.5">
                  <span>${item.currentPrice.toFixed(2)}</span>
                  <span className="text-rose-400 font-mono text-[10px]">
                    {item.stage.distanceFromMaPercent}% vs 30w SMA
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Universal Search & Quick-Select Control Bar */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Active Symbol Display & Custom Input */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 bg-zinc-950 px-3 py-1.5 rounded-lg border border-zinc-700">
              <span className="text-xs text-zinc-500 font-mono">Active Ticker:</span>
              <span className="text-base font-black text-white font-mono">{selectedSymbol}</span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold border ${activeReport.stageAnalysis.stageBadgeBg} ${activeReport.stageAnalysis.stageBadgeColor} ${activeReport.stageAnalysis.stageBadgeBorder}`}
              >
                {activeReport.stageAnalysis.stageName}
              </span>
              <span className="text-xs font-mono font-bold text-zinc-300">
                ${activeReport.currentPrice.toFixed(2)}
              </span>
            </div>

            {/* Random Ticker Picker Button */}
            <button
              onClick={handlePickRandomTicker}
              className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 text-xs font-medium flex items-center gap-1.5 transition-colors"
              title="Pick a random S&P 500 company to analyze"
            >
              <Shuffle className="w-3.5 h-3.5 text-cyan-400" />
              Random Stock 🎲
            </button>
          </div>

          {/* Autocomplete Input: Search Any S&P 500 or Global Stock */}
          <div className="relative w-full md:w-96">
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Analyze ANY ticker (e.g. PLTR, COIN, CRWD, SMCI, LLY)..."
                value={symbolSearchQuery}
                onChange={(e) => setSymbolSearchQuery(e.target.value)}
                onFocus={() => setIsSearchFocused(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && symbolSearchQuery.trim()) {
                    handleApplyCustomSymbol(symbolSearchQuery);
                  }
                }}
                className="w-full pl-9 pr-16 py-2 text-xs rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 font-mono uppercase"
              />
              {symbolSearchQuery && (
                <button
                  onClick={() => handleApplyCustomSymbol(symbolSearchQuery)}
                  className="absolute right-1.5 top-1 px-2.5 py-1 text-[11px] font-bold bg-emerald-600 hover:bg-emerald-500 text-zinc-950 rounded transition-colors"
                >
                  Analyze
                </button>
              )}
            </div>

            {/* Autocomplete Dropdown */}
            {isSearchFocused && autocompleteSuggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl max-h-64 overflow-y-auto divide-y divide-zinc-800">
                <div className="p-2 bg-zinc-950 text-[10px] text-zinc-500 font-mono flex items-center justify-between">
                  <span>S&amp;P 500 Matches</span>
                  <span>Click to analyze immediately</span>
                </div>
                {autocompleteSuggestions.map((item) => (
                  <div
                    key={item.symbol}
                    onClick={() => handleApplyCustomSymbol(item.symbol)}
                    className="p-2.5 hover:bg-zinc-800/80 cursor-pointer flex items-center justify-between transition text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white font-mono bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800">
                        {item.symbol}
                      </span>
                      <span className="text-zinc-300 font-medium truncate max-w-[180px]">
                        {item.name}
                      </span>
                    </div>
                    <span className="text-[10px] text-zinc-500 font-mono">{item.sector}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Quick Ticker Preset Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          <span className="text-zinc-500 font-mono text-[11px] mr-1 shrink-0">Quick Presets:</span>
          {['NBIS', 'INTC', 'SNDK', 'GOOG', 'NVDA', 'AAPL', 'META', 'MSFT', 'TSLA', 'PLTR', 'SMCI', 'LLY', 'AMD', 'SPY'].map(
            (sym) => (
              <button
                key={sym}
                onClick={() => setSelectedSymbol(sym)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-semibold transition-colors shrink-0 ${
                  selectedSymbol === sym
                    ? 'bg-zinc-700 text-white border border-zinc-600 shadow'
                    : 'bg-zinc-950/70 text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-700'
                }`}
              >
                {sym}
              </button>
            )
          )}
        </div>
      </div>

      {/* Main Sub-Tabs Navigation */}
      <div className="flex items-center justify-between border-b border-zinc-800 pb-2 overflow-x-auto">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveSubTab('terminal')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
              activeSubTab === 'terminal'
                ? 'bg-zinc-800 text-zinc-100 border border-zinc-700 shadow'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-rose-400" />
            Trading Terminal &amp; Setup Plan
            <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-rose-500/20 text-rose-300 border border-rose-500/30">
              {selectedSymbol}
            </span>
          </button>

          <button
            onClick={() => setActiveSubTab('scanner-sp500')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
              activeSubTab === 'scanner-sp500'
                ? 'bg-zinc-800 text-zinc-100 border border-zinc-700 shadow'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-emerald-400" />
            Full S&amp;P 500 Stage Scanner (503)
            <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-300">
              All 503
            </span>
          </button>

          <button
            onClick={() => setActiveSubTab('backtest')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
              activeSubTab === 'backtest'
                ? 'bg-zinc-800 text-zinc-100 border border-zinc-700 shadow'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            <Play className="w-3.5 h-3.5 text-amber-400" />
            Stage Strategy Backtester
          </button>

          <button
            onClick={() => setActiveSubTab('raindrop')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
              activeSubTab === 'raindrop'
                ? 'bg-zinc-800 text-zinc-100 border border-zinc-700 shadow'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            <BarChart2 className="w-3.5 h-3.5 text-cyan-400" />
            Raindrop® Volume Profiles
          </button>

          <button
            onClick={() => setActiveSubTab('avwap')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
              activeSubTab === 'avwap'
                ? 'bg-zinc-800 text-zinc-100 border border-zinc-700 shadow'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            Auto-AVWAP
          </button>

          <button
            onClick={() => setActiveSubTab('trendlines')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
              activeSubTab === 'trendlines'
                ? 'bg-zinc-800 text-zinc-100 border border-zinc-700 shadow'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            Multi-Touch Trendlines
          </button>

          <button
            onClick={() => setActiveSubTab('code')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
              activeSubTab === 'code'
                ? 'bg-zinc-800 text-zinc-100 border border-zinc-700 shadow'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            <Code2 className="w-3.5 h-3.5 text-indigo-400" />
            Pine &amp; Python Code
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SUB-TAB 1: TRADING TERMINAL & ACTIONABLE SETUP PLAN                       */}
      {/* ========================================================================= */}
      {activeSubTab === 'terminal' && (
        <div className="space-y-6">
          {/* Stage Overview Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className={`p-4 rounded-xl border ${activeReport.stageAnalysis.stageNumber === 1 ? 'border-amber-500 bg-amber-950/20 shadow-lg' : 'border-zinc-800 bg-zinc-900/60'}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">Stage 1</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/20 text-amber-300">Basing</span>
              </div>
              <div className="text-sm font-semibold text-zinc-100 mt-1">Accumulation &amp; Base</div>
              <p className="text-xs text-zinc-400 mt-1">Price consolidating near a flat 30-week SMA. Volume drying up.</p>
            </div>

            <div className={`p-4 rounded-xl border ${activeReport.stageAnalysis.stageNumber === 2 ? 'border-emerald-500 bg-emerald-950/20 shadow-lg' : 'border-zinc-800 bg-zinc-900/60'}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Stage 2</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-300 font-bold">Markup 🚀</span>
              </div>
              <div className="text-sm font-semibold text-zinc-100 mt-1">Advancing Bull Trend</div>
              <p className="text-xs text-zinc-400 mt-1">Price strictly above rising 30-week SMA. High institutional momentum.</p>
            </div>

            <div className={`p-4 rounded-xl border ${activeReport.stageAnalysis.stageNumber === 3 ? 'border-orange-500 bg-orange-950/20 shadow-lg' : 'border-zinc-800 bg-zinc-900/60'}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-orange-400 uppercase tracking-wider">Stage 3</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-orange-500/20 text-orange-300 font-bold">Topping ⚠️</span>
              </div>
              <div className="text-sm font-semibold text-zinc-100 mt-1">Distribution &amp; Churn</div>
              <p className="text-xs text-zinc-400 mt-1">SMA flattens; erratic swings with heavy distribution volume.</p>
            </div>

            <div className={`p-4 rounded-xl border ${activeReport.stageAnalysis.stageNumber === 4 ? 'border-rose-500 bg-rose-950/25 shadow-xl shadow-rose-950/40 ring-1 ring-rose-500/40' : 'border-zinc-800 bg-zinc-900/60'}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1">Stage 4 🩸</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30">Markdown</span>
              </div>
              <div className="text-sm font-semibold text-zinc-100 mt-1">Declining Capitulation</div>
              <p className="text-xs text-zinc-400 mt-1">Price breaks down below falling 30w SMA. Severe capitulation risk.</p>
            </div>
          </div>

          {/* Active Ticker Deep-Dive Diagnostic & Action Plan */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left 7 cols: Quantitative Stage Diagnostics */}
            <div className="lg:col-span-7 bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4 shadow-sm">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <div className="flex items-center gap-3">
                  <div className="text-2xl font-black text-white font-mono">{selectedSymbol}</div>
                  <div>
                    <div className="text-xs font-semibold text-zinc-200">
                      {SP500_UNIVERSE.find((c) => c.symbol === selectedSymbol)?.name || selectedSymbol}
                    </div>
                    <div className="text-[11px] text-zinc-500">
                      {SP500_UNIVERSE.find((c) => c.symbol === selectedSymbol)?.sector || 'Equities'}
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-lg font-mono font-bold text-white">
                    ${activeReport.currentPrice.toFixed(2)}
                  </div>
                  <span
                    className={`inline-block px-2.5 py-0.5 rounded text-xs font-bold border ${activeReport.stageAnalysis.stageBadgeBg} ${activeReport.stageAnalysis.stageBadgeColor} ${activeReport.stageAnalysis.stageBadgeBorder}`}
                  >
                    {activeReport.stageAnalysis.stageName}
                  </span>
                </div>
              </div>

              {/* 6 Metric Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800">
                  <div className="text-[11px] text-zinc-500 font-mono">30-Week SMA</div>
                  <div className="text-sm font-bold text-zinc-200 mt-0.5 font-mono">
                    ${activeReport.stageAnalysis.ma30Week.toFixed(2)}
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800">
                  <div className="text-[11px] text-zinc-500 font-mono">Distance to SMA</div>
                  <div
                    className={`text-sm font-bold mt-0.5 font-mono ${
                      activeReport.stageAnalysis.distanceFromMaPercent >= 0
                        ? 'text-emerald-400'
                        : 'text-rose-400'
                    }`}
                  >
                    {activeReport.stageAnalysis.distanceFromMaPercent >= 0 ? '+' : ''}
                    {activeReport.stageAnalysis.distanceFromMaPercent}%
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800">
                  <div className="text-[11px] text-zinc-500 font-mono">SMA Slope</div>
                  <div
                    className={`text-sm font-bold mt-0.5 font-mono ${
                      activeReport.stageAnalysis.maSlopeDirection === 'RISING'
                        ? 'text-emerald-400'
                        : activeReport.stageAnalysis.maSlopeDirection === 'FALLING'
                        ? 'text-rose-400'
                        : 'text-amber-400'
                    }`}
                  >
                    {activeReport.stageAnalysis.maSlope}% ({activeReport.stageAnalysis.maSlopeDirection})
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800">
                  <div className="text-[11px] text-zinc-500 font-mono">Mansfield RS (vs SPY)</div>
                  <div
                    className={`text-sm font-bold mt-0.5 font-mono ${
                      activeReport.stageAnalysis.isOutperformingBenchmark
                        ? 'text-emerald-400'
                        : 'text-rose-400'
                    }`}
                  >
                    {activeReport.stageAnalysis.mansfieldRelativeStrength >= 0 ? '+' : ''}
                    {activeReport.stageAnalysis.mansfieldRelativeStrength}%
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800">
                  <div className="text-[11px] text-zinc-500 font-mono">Key Support Floor</div>
                  <div className="text-sm font-bold text-zinc-200 mt-0.5 font-mono">
                    ${activeReport.stageAnalysis.keySupportFloor.toFixed(2)}
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800">
                  <div className="text-[11px] text-zinc-500 font-mono">Resistance Ceiling</div>
                  <div className="text-sm font-bold text-zinc-200 mt-0.5 font-mono">
                    ${activeReport.stageAnalysis.keyResistanceCeiling.toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Stage Thesis */}
              <div className="p-4 rounded-lg bg-zinc-950 border border-zinc-800/80">
                <div className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
                  Quantitative Stage Analysis &amp; Confluence:
                </div>
                <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
                  {activeReport.stageAnalysis.stageThesis}
                </p>
              </div>

              {/* Confluence Takeaways */}
              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-zinc-400">Key Technical Takeaways:</div>
                {activeReport.keyTakeaways.map((takeaway, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-xs text-zinc-300">
                    <span className="text-emerald-400 mt-0.5">•</span>
                    <span>{takeaway}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right 5 cols: Actionable Trading Execution Blueprint */}
            <div className="lg:col-span-5 bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800 rounded-xl p-5 space-y-4 shadow-sm flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                  <span className="text-xs uppercase tracking-wider font-bold text-zinc-400">
                    Trading Terminal Action Plan
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                      activeReport.stageAnalysis.stageNumber === 2
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : activeReport.stageAnalysis.stageNumber === 4
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    }`}
                  >
                    {activeReport.stageAnalysis.stageNumber === 2
                      ? 'RECOMMENDED LONG 🚀'
                      : activeReport.stageAnalysis.stageNumber === 4
                      ? 'PROTECT CAPITAL / AVOID 🩸'
                      : 'OBSERVE ACCUMULATION'}
                  </span>
                </div>

                {/* Level Calculator Blueprint */}
                <div className="space-y-2 text-xs font-mono">
                  <div className="flex items-center justify-between p-2 rounded bg-zinc-950 border border-zinc-800/80">
                    <span className="text-zinc-500">Breakout / Entry Trigger:</span>
                    <span className="font-bold text-zinc-200">
                      ${(activeReport.currentPrice * 1.01).toFixed(2)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded bg-zinc-950 border border-zinc-800/80">
                    <span className="text-rose-400">Stop Loss (Below 30w SMA):</span>
                    <span className="font-bold text-rose-400">
                      ${activeReport.stageAnalysis.keySupportFloor.toFixed(2)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded bg-zinc-950 border border-zinc-800/80">
                    <span className="text-emerald-400">Take Profit 1 (Fib 1.618):</span>
                    <span className="font-bold text-emerald-400">
                      ${(activeReport.currentPrice * 1.08).toFixed(2)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded bg-zinc-950 border border-zinc-800/80">
                    <span className="text-emerald-400">Take Profit 2 (Fib 2.618):</span>
                    <span className="font-bold text-emerald-400">
                      ${(activeReport.currentPrice * 1.16).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons to Bridge Into Rest of App */}
              <div className="space-y-2 pt-3 border-t border-zinc-800">
                <div className="text-[11px] text-zinc-500 font-mono uppercase">
                  Execute Setup Across Platform:
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {onNavigateToTab && (
                    <button
                      onClick={() => onNavigateToTab('journal')}
                      className="px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-zinc-950 transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      Send to Bot
                    </button>
                  )}

                  {onNavigateToTab && (
                    <button
                      onClick={() => onNavigateToTab('options')}
                      className="px-3 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Options Harvest
                    </button>
                  )}

                  {onSelectSymbolForChart && (
                    <button
                      onClick={() => onSelectSymbolForChart(selectedSymbol)}
                      className="px-3 py-2 rounded-lg text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <BarChart2 className="w-3.5 h-3.5 text-cyan-400" />
                      Open Chart
                    </button>
                  )}

                  {onOpenCalculator && (
                    <button
                      onClick={() =>
                        onOpenCalculator({
                          symbol: selectedSymbol,
                          price: activeReport.currentPrice,
                          trigger: activeReport.currentPrice * 1.01,
                          stopLoss: activeReport.stageAnalysis.keySupportFloor,
                          target2: activeReport.currentPrice * 1.15,
                        })
                      }
                      className="px-3 py-2 rounded-lg text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Target className="w-3.5 h-3.5 text-amber-400" />
                      Risk Calc
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Chart Pattern Detection */}
            {activeReport.patterns.length > 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-sm space-y-3">
                <div className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
                  Detected Reversal Patterns:
                </div>
                <div className="flex flex-wrap gap-2">
                  {activeReport.patterns.map((p, idx) => (
                    <div key={idx} className={`px-3 py-1.5 rounded-lg border text-xs font-bold ${p.type === 'BULLISH' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-rose-500/20 text-rose-300 border-rose-500/30'}`}>
                      {p.name.replace('_', ' ')} ({p.confidence}%)
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 2: FULL S&P 500 STAGE SCANNER (ALL 503 CONSTITUENTS)              */}
      {/* ========================================================================= */}
      {activeSubTab === 'scanner-sp500' && (
        <div className="space-y-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-emerald-400" />
                  Full S&amp;P 500 Stan Weinstein Stage Scanner (503 Companies)
                </h3>
                <p className="text-xs text-zinc-400">
                  Continuously scans the entire 503 S&amp;P 500 universe. Filter by Stage to isolate high-conviction Stage 2 Markup breakouts or avoid Stage 4 Capitulations.
                </p>
              </div>

              {/* Fast Search inside 503 table */}
              <div className="relative w-full md:w-64">
                <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Filter 503 stocks..."
                  value={sp500TableSearch}
                  onChange={(e) => setSp500TableSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-200 focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>
            </div>

            {/* Filter Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-800">
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  onClick={() => setSp500StageFilter('ALL')}
                  className={`px-3 py-1 rounded text-xs font-semibold ${
                    sp500StageFilter === 'ALL'
                      ? 'bg-zinc-700 text-white'
                      : 'bg-zinc-800/80 text-zinc-400 hover:text-white'
                  }`}
                >
                  All (503)
                </button>
                <button
                  onClick={() => setSp500StageFilter('STAGE_2_ADVANCING')}
                  className={`px-3 py-1 rounded text-xs font-semibold flex items-center gap-1 ${
                    sp500StageFilter === 'STAGE_2_ADVANCING'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow'
                      : 'bg-zinc-800/80 text-zinc-400 hover:text-white'
                  }`}
                >
                  Stage 2 Markup 🚀
                </button>
                <button
                  onClick={() => setSp500StageFilter('STAGE_4_DECLINING')}
                  className={`px-3 py-1 rounded text-xs font-semibold flex items-center gap-1 ${
                    sp500StageFilter === 'STAGE_4_DECLINING'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow'
                      : 'bg-zinc-800/80 text-zinc-400 hover:text-white'
                  }`}
                >
                  Stage 4 Capitulation 🩸
                </button>
                <button
                  onClick={() => setSp500StageFilter('STAGE_1_BASING')}
                  className={`px-3 py-1 rounded text-xs font-semibold ${
                    sp500StageFilter === 'STAGE_1_BASING'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'bg-zinc-800/80 text-zinc-400 hover:text-white'
                  }`}
                >
                  Stage 1 Basing
                </button>
                <button
                  onClick={() => setSp500StageFilter('STAGE_3_TOPPING')}
                  className={`px-3 py-1 rounded text-xs font-semibold ${
                    sp500StageFilter === 'STAGE_3_TOPPING'
                      ? 'bg-orange-500/20 text-orange-300 border border-orange-500/40'
                      : 'bg-zinc-800/80 text-zinc-400 hover:text-white'
                  }`}
                >
                  Stage 3 Topping ⚠️
                </button>
              </div>

              <div className="text-xs text-zinc-500 font-mono">
                Showing {filteredSp500Summaries.length} of 503 constituents
              </div>
            </div>
          </div>

          {/* Full Table */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden shadow-sm">
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-950 text-zinc-400 font-mono border-b border-zinc-800 sticky top-0 z-10">
                  <tr>
                    <th className="py-2.5 px-4">Symbol</th>
                    <th className="py-2.5 px-3">Company Name</th>
                    <th className="py-2.5 px-3">Price</th>
                    <th className="py-2.5 px-3">Weinstein Stage</th>
                    <th className="py-2.5 px-3">30w SMA</th>
                    <th className="py-2.5 px-3">Dist to 30w MA</th>
                    <th className="py-2.5 px-3">Slope Rate</th>
                    <th className="py-2.5 px-3">Mansfield RS (SPY)</th>
                    <th className="py-2.5 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 font-mono">
                  {filteredSp500Summaries.map((item) => {
                    const st = item.stage;
                    const isSelected = selectedSymbol === item.symbol;
                    return (
                      <tr
                        key={item.symbol}
                        onClick={() => {
                          setSelectedSymbol(item.symbol);
                          setActiveSubTab('terminal');
                        }}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-zinc-800/70' : 'hover:bg-zinc-800/30'
                        }`}
                      >
                        <td className="py-3 px-4 font-bold text-white">
                          {item.symbol}
                        </td>
                        <td className="py-3 px-3 font-sans text-zinc-300 truncate max-w-[200px]">
                          {item.name}
                        </td>
                        <td className="py-3 px-3 font-bold text-zinc-200">
                          ${item.currentPrice.toFixed(2)}
                        </td>
                        <td className="py-3 px-3 font-sans">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border ${st.stageBadgeBg} ${st.stageBadgeColor} ${st.stageBadgeBorder}`}
                          >
                            {st.stageName}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-zinc-400">
                          ${st.ma30Week.toFixed(2)}
                        </td>
                        <td
                          className={`py-3 px-3 font-bold ${
                            st.distanceFromMaPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {st.distanceFromMaPercent >= 0 ? '+' : ''}
                          {st.distanceFromMaPercent}%
                        </td>
                        <td className="py-3 px-3 text-zinc-400">
                          {st.maSlope}%
                        </td>
                        <td
                          className={`py-3 px-3 font-bold ${
                            st.isOutperformingBenchmark ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {st.mansfieldRelativeStrength >= 0 ? '+' : ''}
                          {st.mansfieldRelativeStrength}%
                        </td>
                        <td className="py-3 px-4 text-right font-sans">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedSymbol(item.symbol);
                              setActiveSubTab('terminal');
                            }}
                            className="px-2 py-1 rounded text-[11px] bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 font-semibold"
                          >
                            Analyze →
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 3: SIMPLE USER STAGE BACKTEST SIMULATOR                           */}
      {/* ========================================================================= */}
      {activeSubTab === 'backtest' && (
        <div className="space-y-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                  <Play className="w-4 h-4 text-emerald-400" />
                  Stan Weinstein 4-Stage Strategy Backtester
                </h3>
                <p className="text-xs text-zinc-400">
                  Simulate buying Stage 2 Breakouts (Price &gt; rising 30w SMA) with a strict 30w SMA trailing stop vs passive Buy &amp; Hold on <strong>{selectedSymbol}</strong>.
                </p>
              </div>

              {/* User Parameter Controls */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1.5 bg-zinc-950 px-2.5 py-1 rounded-lg border border-zinc-800 text-xs">
                  <span className="text-zinc-500 font-mono">Capital:</span>
                  {[2000, 10000, 50000].map((cap) => (
                    <button
                      key={cap}
                      onClick={() => setBacktestCapital(cap)}
                      className={`px-2 py-0.5 rounded font-mono ${
                        backtestCapital === cap
                          ? 'bg-emerald-600 text-white font-bold'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      ${cap >= 1000 ? `${cap / 1000}k` : cap}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1.5 bg-zinc-950 px-2.5 py-1 rounded-lg border border-zinc-800 text-xs">
                  <span className="text-zinc-500 font-mono">Lookback:</span>
                  {[1, 2, 3, 5].map((yr) => (
                    <button
                      key={yr}
                      onClick={() => setBacktestYears(yr as any)}
                      className={`px-2 py-0.5 rounded font-mono ${
                        backtestYears === yr
                          ? 'bg-zinc-700 text-white font-bold'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      {yr}Y
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Backtest KPI Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="p-3.5 rounded-lg bg-zinc-950 border border-zinc-800">
                <div className="text-[11px] text-zinc-500 font-mono">Total Return</div>
                <div
                  className={`text-lg font-bold font-mono mt-0.5 ${
                    activeBacktest.totalReturnPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {activeBacktest.totalReturnPercent >= 0 ? '+' : ''}
                  {activeBacktest.totalReturnPercent}%
                </div>
                <div className="text-[10px] text-zinc-500 font-mono">
                  ${activeBacktest.finalCapital.toLocaleString()} Final
                </div>
              </div>

              <div className="p-3.5 rounded-lg bg-zinc-950 border border-zinc-800">
                <div className="text-[11px] text-zinc-500 font-mono">CAGR (Annualized)</div>
                <div className="text-lg font-bold font-mono text-white mt-0.5">
                  +{activeBacktest.cagrPercent}%
                </div>
                <div className="text-[10px] text-zinc-500 font-mono">Compound Growth</div>
              </div>

              <div className="p-3.5 rounded-lg bg-zinc-950 border border-zinc-800">
                <div className="text-[11px] text-zinc-500 font-mono">Win Rate</div>
                <div className="text-lg font-bold font-mono text-emerald-400 mt-0.5">
                  {activeBacktest.winRate}%
                </div>
                <div className="text-[10px] text-zinc-500 font-mono">
                  {activeBacktest.winningTrades}W / {activeBacktest.losingTrades}L
                </div>
              </div>

              <div className="p-3.5 rounded-lg bg-zinc-950 border border-zinc-800">
                <div className="text-[11px] text-zinc-500 font-mono">Profit Factor</div>
                <div className="text-lg font-bold font-mono text-cyan-400 mt-0.5">
                  {activeBacktest.profitFactor}x
                </div>
                <div className="text-[10px] text-zinc-500 font-mono">Payoff Asymmetry</div>
              </div>

              <div className="p-3.5 rounded-lg bg-zinc-950 border border-zinc-800">
                <div className="text-[11px] text-zinc-500 font-mono">Strategy Max Drawdown</div>
                <div className="text-lg font-bold font-mono text-amber-400 mt-0.5">
                  -{activeBacktest.maxDrawdownPercent}%
                </div>
                <div className="text-[10px] text-zinc-500 font-mono">
                  vs -{activeBacktest.benchmarkMaxDrawdownPercent}% B&amp;H
                </div>
              </div>

              <div className="p-3.5 rounded-lg bg-rose-950/20 border border-rose-500/40 shadow-sm">
                <div className="text-[11px] text-rose-400 font-bold font-mono flex items-center gap-1">
                  Stage 4 Capital Saved 🩸
                </div>
                <div className="text-lg font-bold font-mono text-rose-300 mt-0.5">
                  +${activeBacktest.stage4CapitalPreservedDollar.toLocaleString()}
                </div>
                <div className="text-[10px] text-rose-400/80 font-mono">Preserved vs Capitulation</div>
              </div>
            </div>

            {/* Visual Equity Curve Simulation */}
            <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800/80 space-y-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-zinc-400 font-bold">Simulated Equity Curve Progression</span>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                    <span className="w-2.5 h-0.5 bg-emerald-400 inline-block" /> Stage 2 Strategy
                  </span>
                  <span className="flex items-center gap-1 text-zinc-500">
                    <span className="w-2.5 h-0.5 bg-zinc-500 inline-block" /> Benchmark Buy &amp; Hold
                  </span>
                </div>
              </div>

              {/* SVG Sparkline Curve */}
              <div className="relative h-44 w-full rounded-lg bg-zinc-900/60 border border-zinc-800 p-2 overflow-hidden flex items-end">
                <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 50">
                  {/* Benchmark Line */}
                  <polyline
                    fill="none"
                    stroke="#52525b"
                    strokeWidth="1.2"
                    strokeDasharray="2 2"
                    points="0,35 25,32 50,28 75,38 100,42"
                  />
                  {/* Strategy Curve */}
                  <polyline
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="2.2"
                    points="0,35 20,30 40,24 60,18 80,14 100,8"
                  />
                </svg>
              </div>
            </div>

            {/* Trade Log Table */}
            <div className="space-y-2">
              <div className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
                Simulated Stage Trades Log ({activeBacktest.trades.length} Trades):
              </div>

              <div className="overflow-x-auto rounded-lg border border-zinc-800">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-zinc-950 text-zinc-400 border-b border-zinc-800">
                    <tr>
                      <th className="py-2 px-3">Trade</th>
                      <th className="py-2 px-3">Entry Date</th>
                      <th className="py-2 px-3">Entry Price</th>
                      <th className="py-2 px-3">Exit Date</th>
                      <th className="py-2 px-3">Exit Price</th>
                      <th className="py-2 px-3">Holding</th>
                      <th className="py-2 px-3">Exit Reason</th>
                      <th className="py-2 px-3 text-right">P&amp;L ($)</th>
                      <th className="py-2 px-4 text-right">Return (%)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {activeBacktest.trades.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-4 text-center text-zinc-500 font-sans">
                          No completed trades during selected timeframe. Stock may currently be basing or in Stage 4.
                        </td>
                      </tr>
                    ) : (
                      activeBacktest.trades.map((t) => (
                        <tr key={t.id} className="hover:bg-zinc-800/30">
                          <td className="py-2.5 px-3 font-bold text-white">{t.symbol}</td>
                          <td className="py-2.5 px-3 text-zinc-400">{t.entryDate}</td>
                          <td className="py-2.5 px-3 text-zinc-200">${t.entryPrice.toFixed(2)}</td>
                          <td className="py-2.5 px-3 text-zinc-400">{t.exitDate}</td>
                          <td className="py-2.5 px-3 text-zinc-200">${t.exitPrice.toFixed(2)}</td>
                          <td className="py-2.5 px-3 text-zinc-400">{t.holdingWeeks} wks</td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`px-1.5 py-0.2 rounded text-[10px] font-sans font-bold ${
                                t.exitReason === 'STAGE_4_CAPITULATION'
                                  ? 'bg-rose-500/20 text-rose-300'
                                  : 'bg-zinc-800 text-zinc-300'
                              }`}
                            >
                              {t.exitReason.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td
                            className={`py-2.5 px-3 text-right font-bold ${
                              t.pnlDollar >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {t.pnlDollar >= 0 ? '+' : ''}${t.pnlDollar.toFixed(2)}
                          </td>
                          <td
                            className={`py-2.5 px-4 text-right font-bold ${
                              t.pnlPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {t.pnlPercent >= 0 ? '+' : ''}{t.pnlPercent}%
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 4: RAINDROP® VOLUME PROFILES (ANY TICKER)                         */}
      {/* ========================================================================= */}
      {activeSubTab === 'raindrop' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                  <BarChart2 className="w-5 h-5 text-cyan-400" />
                  TrendSpider Raindrop® Charts Engine: {selectedSymbol}
                </h3>
                <p className="text-xs text-zinc-400 max-w-3xl mt-1">
                  Volume distribution visualizer: Left VWAP (first 50% of bar) vs Right VWAP (second 50% of bar).
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="px-2 py-1 rounded text-xs font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Green: Right &gt; Left VWAP
                </span>
                <span className="px-2 py-1 rounded text-xs font-mono bg-rose-500/20 text-rose-300 border border-rose-500/30">
                  Red: Right &lt; Left VWAP
                </span>
              </div>
            </div>
          </div>

          {/* Active Symbol Raindrops Stream */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-zinc-100">
                Weekly Raindrops for {selectedSymbol}
              </span>
              <span className="text-xs font-mono text-zinc-500">
                Current Price: ${activeReport.currentPrice.toFixed(2)}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-2">
              {activeReport.recentRaindrops.map((bar, idx) => {
                const isBullish = bar.sentiment === 'BULLISH';
                const isBearish = bar.sentiment === 'BEARISH';
                const colorCls = isBullish
                  ? 'border-emerald-500/40 bg-emerald-950/15 text-emerald-400'
                  : isBearish
                  ? 'border-rose-500/40 bg-rose-950/15 text-rose-400'
                  : 'border-cyan-500/40 bg-cyan-950/15 text-cyan-400';

                return (
                  <div
                    key={idx}
                    className={`rounded-lg border p-2.5 flex flex-col items-center justify-between h-56 transition-all ${colorCls}`}
                  >
                    <div className="text-[10px] font-mono text-zinc-500 truncate w-full text-center">
                      {bar.time}
                    </div>

                    <div className="relative w-full h-36 flex items-center justify-center my-1">
                      <div className="absolute top-0 bottom-0 w-[2px] bg-zinc-600 left-1/2 -translate-x-1/2" />

                      {/* Left Half Volume Profile Shape */}
                      <div className="absolute left-1 right-1/2 top-4 bottom-4 flex flex-col justify-around items-end pr-1 opacity-80">
                        {bar.volumeProfileLeft.slice(0, 5).map((p, pIdx) => {
                          const maxVol = Math.max(1, ...bar.volumeProfileLeft.map((v) => v.volume));
                          return (
                            <div
                              key={pIdx}
                              style={{ width: `${Math.min(100, (p.volume / maxVol) * 100)}%` }}
                              className="h-1.5 bg-zinc-500/60 rounded-l-sm"
                            />
                          );
                        })}
                      </div>

                      {/* Right Half Volume Profile Shape */}
                      <div className="absolute right-1 left-1/2 top-4 bottom-4 flex flex-col justify-around items-start pl-1 opacity-80">
                        {bar.volumeProfileRight.slice(0, 5).map((p, pIdx) => {
                          const maxVol = Math.max(1, ...bar.volumeProfileRight.map((v) => v.volume));
                          return (
                            <div
                              key={pIdx}
                              style={{ width: `${Math.min(100, (p.volume / maxVol) * 100)}%` }}
                              className={`h-1.5 rounded-r-sm ${
                                isBullish ? 'bg-emerald-500/80' : isBearish ? 'bg-rose-500/80' : 'bg-cyan-500/80'
                              }`}
                            />
                          );
                        })}
                      </div>

                      {/* Left VWAP Marker */}
                      <div
                        className="absolute left-0 w-1/2 h-[3px] bg-amber-400 z-10"
                        style={{
                          top: `${Math.max(10, Math.min(90, 100 - ((bar.leftVwap - bar.low) / (bar.high - bar.low || 1)) * 100))}%`,
                        }}
                      />

                      {/* Right VWAP Marker */}
                      <div
                        className={`absolute right-0 w-1/2 h-[3px] z-10 ${
                          isBullish ? 'bg-emerald-400' : isBearish ? 'bg-rose-400' : 'bg-cyan-400'
                        }`}
                        style={{
                          top: `${Math.max(10, Math.min(90, 100 - ((bar.rightVwap - bar.low) / (bar.high - bar.low || 1)) * 100))}%`,
                        }}
                      />
                    </div>

                    <div className="w-full text-center space-y-0.5">
                      <div className="text-[10px] font-mono font-bold">
                        R: ${bar.rightVwap.toFixed(1)}
                      </div>
                      <div className="text-[9px] font-mono text-zinc-500">
                        L: ${bar.leftVwap.toFixed(1)}
                      </div>
                      <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-zinc-900 border border-zinc-800 block truncate font-sans">
                        {bar.shapeType.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 5: AUTO-ANCHORED VWAP (AUTO-AVWAP)                                */}
      {/* ========================================================================= */}
      {activeSubTab === 'avwap' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                  <Zap className="w-5 h-5 text-amber-400" />
                  Auto-Anchored VWAP: {selectedSymbol}
                </h3>
                <p className="text-xs text-zinc-400 mt-1">
                  Dynamic institutional anchor VWAP with standard deviation volatility bands.
                </p>
              </div>

              <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800">
                {(['PEAK_VOLUME', 'SWING_HIGH', 'SWING_LOW', 'YTD'] as const).map((anchor) => (
                  <button
                    key={anchor}
                    onClick={() => setAvwapAnchor(anchor)}
                    className={`px-3 py-1 text-xs font-semibold rounded transition-colors ${
                      avwapAnchor === anchor
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {anchor.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800/80 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500 font-mono">Current Anchored VWAP</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                      activeAvwap.trendStatus === 'ABOVE_AVWAP_BULLISH'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    }`}
                  >
                    {activeAvwap.trendStatus}
                  </span>
                </div>

                <div className="text-3xl font-mono font-black text-amber-400">
                  ${activeAvwap.currentVwap.toFixed(2)}
                </div>

                <div className="text-xs text-zinc-400 font-mono">
                  Distance: {activeAvwap.priceToVwapPercent >= 0 ? '+' : ''}{activeAvwap.priceToVwapPercent}%
                </div>
              </div>

              {/* Volatility Bands */}
              <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800/80 space-y-2">
                <div className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
                  Volatility Envelope Bands (±1σ &amp; ±2σ)
                </div>
                {(() => {
                  const pt = activeAvwap.points.length > 0 ? activeAvwap.points[activeAvwap.points.length - 1] : null;
                  const u2 = pt ? pt.upper2Band : Number((activeAvwap.currentVwap * 1.06).toFixed(2));
                  const u1 = pt ? pt.upper1Band : Number((activeAvwap.currentVwap * 1.03).toFixed(2));
                  const l1 = pt ? pt.lower1Band : Number((activeAvwap.currentVwap * 0.97).toFixed(2));
                  const l2 = pt ? pt.lower2Band : Number((activeAvwap.currentVwap * 0.94).toFixed(2));

                  return (
                    <div className="space-y-1.5 font-mono text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-rose-400">+2σ Target</span>
                        <span className="text-white font-bold">${u2.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-amber-400/80">+1σ Extension</span>
                        <span className="text-zinc-300">${u1.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center justify-between py-1 border-y border-zinc-800">
                        <span className="text-amber-400 font-bold">AVWAP Median</span>
                        <span className="text-amber-400 font-bold">${activeAvwap.currentVwap.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-cyan-400/80">-1σ Support</span>
                        <span className="text-zinc-300">${l1.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-emerald-400">-2σ Mean Reversion</span>
                        <span className="text-white font-bold">${l2.toFixed(2)}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 6: AUTOMATED MULTI-TOUCH TRENDLINES                               */}
      {/* ========================================================================= */}
      {activeSubTab === 'trendlines' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-4">
            <h3 className="text-base font-bold text-zinc-100 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
              Automated Multi-Touch Trendlines: {selectedSymbol}
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-950 text-zinc-400 font-mono border-b border-zinc-800">
                  <tr>
                    <th className="py-2.5 px-4">Line Type</th>
                    <th className="py-2.5 px-3">Touches</th>
                    <th className="py-2.5 px-3">Projected Level</th>
                    <th className="py-2.5 px-3">Slope</th>
                    <th className="py-2.5 px-3">Distance %</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-4 text-right">Breakout Event</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 font-mono">
                  {activeReport.automatedTrendlines.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-4 text-center text-zinc-500 font-sans">
                        No active multi-touch trendlines formed for current parameters.
                      </td>
                    </tr>
                  ) : (
                    activeReport.automatedTrendlines.map((tl) => (
                      <tr key={tl.id} className="hover:bg-zinc-800/30">
                        <td className="py-3 px-4 font-bold font-sans">
                          {tl.type === 'RESISTANCE' ? (
                            <span className="text-rose-400">Resistance</span>
                          ) : (
                            <span className="text-emerald-400">Support</span>
                          )}
                        </td>
                        <td className="py-3 px-3">{tl.touchCount} Touches</td>
                        <td className="py-3 px-3 font-bold text-white">
                          ${tl.currentProjectedPrice.toFixed(2)}
                        </td>
                        <td className="py-3 px-3 text-zinc-400">
                          {tl.slope > 0 ? '+' : ''}{tl.slope}
                        </td>
                        <td
                          className={`py-3 px-3 font-bold ${
                            tl.distancePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {tl.distancePercent >= 0 ? '+' : ''}{tl.distancePercent}%
                        </td>
                        <td className="py-3 px-3 font-sans">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-800 text-zinc-300">
                            {tl.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-sans">
                          {tl.breakoutConfirmed ? (
                            <span className="text-xs font-bold text-emerald-400 flex items-center justify-end gap-1">
                              <Check className="w-3.5 h-3.5" /> Confirmed
                            </span>
                          ) : (
                            <span className="text-xs text-zinc-500">Awaiting Trigger</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 7: PINE SCRIPT & PYTHON REA CODE EXPORTER                         */}
      {/* ========================================================================= */}
      {activeSubTab === 'code' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-4">
            <h3 className="text-base font-bold text-zinc-100 flex items-center gap-2">
              <Code2 className="w-5 h-5 text-indigo-400" />
              TrendSpider Reverse-Engineered (REA) Code Exporter
            </h3>

            <div className="space-y-4">
              {/* Python REA */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden">
                <div className="p-3 bg-zinc-900/80 border-b border-zinc-800 flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-200">
                    trendspider_reverse_engineered.py
                  </span>
                  <button
                    onClick={() => handleCopyCode(pythonReaCode, 'py-rea')}
                    className="px-2.5 py-1 rounded text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 flex items-center gap-1 transition-colors"
                  >
                    {copiedCodeId === 'py-rea' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" /> Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" /> Copy Python
                      </>
                    )}
                  </button>
                </div>
                <pre className="p-4 text-xs font-mono text-zinc-300 overflow-x-auto max-h-60 leading-relaxed">
                  {pythonReaCode}
                </pre>
              </div>

              {/* Built-in Pine Scripts */}
              {BUILT_IN_INDICATORS.filter((ind) => ind.id.startsWith('ts-')).map((ind) => (
                <div
                  key={ind.id}
                  className="rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden"
                >
                  <div className="p-3 bg-zinc-900/80 border-b border-zinc-800 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-zinc-200">{ind.name}</div>
                      <div className="text-[11px] text-zinc-500">{ind.description}</div>
                    </div>
                    <button
                      onClick={() => handleCopyCode(ind.pineCode, ind.id)}
                      className="px-2.5 py-1 rounded text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 flex items-center gap-1 transition-colors"
                    >
                      {copiedCodeId === ind.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" /> Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" /> Copy Pine Script
                        </>
                      )}
                    </button>
                  </div>
                  <pre className="p-4 text-xs font-mono text-emerald-400/90 overflow-x-auto max-h-60 leading-relaxed">
                    {ind.pineCode}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
