import React, { useState, useEffect, useMemo } from 'react';
import {
  Compass,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  AlertTriangle,
  Flame,
  Zap,
  Target,
  Clock,
  CheckCircle2,
  SlidersHorizontal,
  Search,
  RefreshCw,
  ExternalLink,
  Calculator,
  ArrowRight,
  Filter,
  BarChart3,
  Layers,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import {
  TradeAdvice,
  TradeActionZone,
  TradeAdviceFilters,
  DEFAULT_TRADE_FILTERS,
  getActionZoneMeta,
  filterTradeAdviceList,
} from '../utils/tradeActionEngine';
import { DivergenceSetup } from '../utils/trullasStrategy';

interface ActionDashboardProps {
  onSelectSymbolForChart: (sym: string) => void;
  onOpenCalculator: (setup: DivergenceSetup) => void;
}

const ALL_ZONES: { zone: TradeActionZone; label: string }[] = [
  { zone: 'PRE_BREAKOUT', label: 'Pre-Breakout Coiled' },
  { zone: 'BREAKOUT_CONFIRMED', label: 'Breakout Confirmed' },
  { zone: 'STRONG_BUY', label: 'Strong Buy / Demand' },
  { zone: 'HOLD_PROFIT', label: 'Hold / Run Profit' },
  { zone: 'LATE_TO_BUY', label: 'Late To Buy (FOMO Risk)' },
  { zone: 'SELL_TAKE_PROFIT', label: 'Sell / Take Profit' },
  { zone: 'NEUTRAL_CHOP', label: 'Stand Aside / Chop' },
];

export const ActionDashboard: React.FC<ActionDashboardProps> = ({
  onSelectSymbolForChart,
  onOpenCalculator,
}) => {
  const [adviceList, setAdviceList] = useState<TradeAdvice[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Filters
  const [filters, setFilters] = useState<TradeAdviceFilters>(DEFAULT_TRADE_FILTERS);
  const [selectedSector, setSelectedSector] = useState<string>('ALL');

  // Fetch advice from API across full S&P 500 index
  const fetchAdvice = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/trade-advice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          useAllSp500: true,
          timeframe: '1d',
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setAdviceList(data.advice || []);
        setLastUpdated(new Date());
      }
    } catch (e) {
      console.error('Failed to load trade advice:', e);
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    fetchAdvice();
  }, []);

  // Zone selection toggle
  const handleToggleZone = (zone: TradeActionZone) => {
    setFilters((prev) => {
      const exists = prev.zones.includes(zone);
      let updated: TradeActionZone[];
      if (exists) {
        updated = prev.zones.filter((z) => z !== zone);
      } else {
        updated = [...prev.zones, zone];
      }
      return { ...prev, zones: updated };
    });
  };

  const handleSelectAllZones = () => {
    setFilters((prev) => ({
      ...prev,
      zones: ALL_ZONES.map((z) => z.zone),
    }));
  };

  const handleClearZones = () => {
    setFilters((prev) => ({
      ...prev,
      zones: [],
    }));
  };

  // Distinct sectors
  const availableSectors = useMemo(() => {
    const set = new Set<string>();
    for (const item of adviceList) {
      if (item.sector) set.add(item.sector);
    }
    return ['ALL', ...Array.from(set)];
  }, [adviceList]);

  // Filtered advice
  const filteredAdvice = useMemo(() => {
    const withSector = { ...filters, sector: selectedSector };
    return filterTradeAdviceList(adviceList, withSector);
  }, [adviceList, filters, selectedSector]);

  // Zone breakdown counters
  const zoneCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of adviceList) {
      counts[item.actionZone] = (counts[item.actionZone] || 0) + 1;
    }
    return counts;
  }, [adviceList]);

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-zinc-900 via-zinc-900 to-zinc-950 border border-zinc-800 rounded-2xl p-6 sm:p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium mb-3">
              <Compass className="w-3.5 h-3.5" />
              <span>Multi-Strategy Confluence Decision Engine</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Trade Action Zones & Strategy Advisor
            </h1>
            <p className="mt-2 text-sm text-zinc-400 max-w-2xl leading-relaxed">
              Synthesizes David Trullàs 3rd-wave MACD divergences, Fibonacci triggers, LuxAlgo Nadaraya-Watson kernel envelopes, and Smart Money Concepts into unambiguous trade execution advice.
            </p>
          </div>

          <div className="flex items-center space-x-3 shrink-0">
            <button
              onClick={fetchAdvice}
              disabled={loading}
              className="flex items-center space-x-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-xs font-semibold border border-zinc-700 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
              <span>{loading ? 'Analyzing Market...' : 'Refresh Signals'}</span>
            </button>
          </div>
        </div>

        {/* Interactive High-Level Zone Filter Cards */}
        <div className="mt-6 pt-6 border-t border-zinc-800/80 space-y-2">
          <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              <span>Interactive Action Zone Cards (Click card to isolate or toggle zone):</span>
            </span>
            {filters.zones.length < ALL_ZONES.length && (
              <button
                onClick={handleSelectAllZones}
                data-testid="reset-all-zones-btn"
                className="text-emerald-400 hover:text-emerald-300 font-semibold underline text-[11px] flex items-center gap-1 cursor-pointer transition"
              >
                <span>Reset / Show All Zones ({ALL_ZONES.length})</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* 1. PRE-BREAKOUT */}
            {(() => {
              const isSelected = filters.zones.includes('PRE_BREAKOUT');
              return (
                <button
                  type="button"
                  onClick={() => handleToggleZone('PRE_BREAKOUT')}
                  data-testid="kpi-filter-pre-breakout"
                  className={`p-3.5 rounded-xl border text-left transition-all duration-200 cursor-pointer ${
                    isSelected
                      ? 'bg-cyan-950/60 border-cyan-500/80 ring-2 ring-cyan-500/20 shadow-lg shadow-cyan-500/10'
                      : 'bg-zinc-950/50 border-zinc-800/80 opacity-50 hover:opacity-100 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-[11px] font-medium block ${isSelected ? 'text-cyan-300 font-bold' : 'text-zinc-400'}`}>
                      Pre-Breakout
                    </span>
                    {isSelected && <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>}
                  </div>
                  <div className="flex items-baseline space-x-2 mt-1">
                    <span className={`text-2xl font-bold font-mono ${isSelected ? 'text-cyan-400' : 'text-zinc-300'}`}>
                      {zoneCounts['PRE_BREAKOUT'] || 0}
                    </span>
                    <span className="text-[10px] text-zinc-500 font-mono">Coiled</span>
                  </div>
                </button>
              );
            })()}

            {/* 2. BREAKOUT CONFIRMED */}
            {(() => {
              const isSelected = filters.zones.includes('BREAKOUT_CONFIRMED');
              return (
                <button
                  type="button"
                  onClick={() => handleToggleZone('BREAKOUT_CONFIRMED')}
                  data-testid="kpi-filter-breakout-confirmed"
                  className={`p-3.5 rounded-xl border text-left transition-all duration-200 cursor-pointer ${
                    isSelected
                      ? 'bg-indigo-950/60 border-indigo-500/80 ring-2 ring-indigo-500/20 shadow-lg shadow-indigo-500/10'
                      : 'bg-zinc-950/50 border-zinc-800/80 opacity-50 hover:opacity-100 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-[11px] font-medium block ${isSelected ? 'text-indigo-300 font-bold' : 'text-zinc-400'}`}>
                      Breakout Confirmed
                    </span>
                    {isSelected && <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse"></span>}
                  </div>
                  <div className="flex items-baseline space-x-2 mt-1">
                    <span className={`text-2xl font-bold font-mono ${isSelected ? 'text-indigo-400' : 'text-zinc-300'}`}>
                      {zoneCounts['BREAKOUT_CONFIRMED'] || 0}
                    </span>
                    <span className="text-[10px] text-zinc-500 font-mono">Tranche 1</span>
                  </div>
                </button>
              );
            })()}

            {/* 3. STRONG BUY */}
            {(() => {
              const isSelected = filters.zones.includes('STRONG_BUY');
              return (
                <button
                  type="button"
                  onClick={() => handleToggleZone('STRONG_BUY')}
                  data-testid="kpi-filter-strong-buy"
                  className={`p-3.5 rounded-xl border text-left transition-all duration-200 cursor-pointer ${
                    isSelected
                      ? 'bg-emerald-950/60 border-emerald-500/80 ring-2 ring-emerald-500/20 shadow-lg shadow-emerald-500/10'
                      : 'bg-zinc-950/50 border-zinc-800/80 opacity-50 hover:opacity-100 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-[11px] font-medium block ${isSelected ? 'text-emerald-300 font-bold' : 'text-zinc-400'}`}>
                      Strong Buy
                    </span>
                    {isSelected && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>}
                  </div>
                  <div className="flex items-baseline space-x-2 mt-1">
                    <span className={`text-2xl font-bold font-mono ${isSelected ? 'text-emerald-400' : 'text-zinc-300'}`}>
                      {zoneCounts['STRONG_BUY'] || 0}
                    </span>
                    <span className="text-[10px] text-zinc-500 font-mono">Demand</span>
                  </div>
                </button>
              );
            })()}

            {/* 4. HOLD / RUNNING */}
            {(() => {
              const isSelected = filters.zones.includes('HOLD_PROFIT');
              return (
                <button
                  type="button"
                  onClick={() => handleToggleZone('HOLD_PROFIT')}
                  data-testid="kpi-filter-hold-profit"
                  className={`p-3.5 rounded-xl border text-left transition-all duration-200 cursor-pointer ${
                    isSelected
                      ? 'bg-blue-950/60 border-blue-500/80 ring-2 ring-blue-500/20 shadow-lg shadow-blue-500/10'
                      : 'bg-zinc-950/50 border-zinc-800/80 opacity-50 hover:opacity-100 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-[11px] font-medium block ${isSelected ? 'text-blue-300 font-bold' : 'text-zinc-400'}`}>
                      Hold / Running
                    </span>
                    {isSelected && <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></span>}
                  </div>
                  <div className="flex items-baseline space-x-2 mt-1">
                    <span className={`text-2xl font-bold font-mono ${isSelected ? 'text-blue-400' : 'text-zinc-300'}`}>
                      {zoneCounts['HOLD_PROFIT'] || 0}
                    </span>
                    <span className="text-[10px] text-zinc-500 font-mono">In Profit</span>
                  </div>
                </button>
              );
            })()}

            {/* 5. LATE TO BUY */}
            {(() => {
              const isSelected = filters.zones.includes('LATE_TO_BUY');
              return (
                <button
                  type="button"
                  onClick={() => handleToggleZone('LATE_TO_BUY')}
                  data-testid="kpi-filter-late-to-buy"
                  className={`p-3.5 rounded-xl border text-left transition-all duration-200 cursor-pointer ${
                    isSelected
                      ? 'bg-amber-950/60 border-amber-500/80 ring-2 ring-amber-500/20 shadow-lg shadow-amber-500/10'
                      : 'bg-zinc-950/50 border-zinc-800/80 opacity-50 hover:opacity-100 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-[11px] font-medium block ${isSelected ? 'text-amber-300 font-bold' : 'text-zinc-400'}`}>
                      Late To Buy
                    </span>
                    {isSelected && <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>}
                  </div>
                  <div className="flex items-baseline space-x-2 mt-1">
                    <span className={`text-2xl font-bold font-mono ${isSelected ? 'text-amber-400' : 'text-zinc-300'}`}>
                      {zoneCounts['LATE_TO_BUY'] || 0}
                    </span>
                    <span className="text-[10px] text-zinc-500 font-mono">Chase Risk</span>
                  </div>
                </button>
              );
            })()}

            {/* 6. SELL / TAKE PROFIT */}
            {(() => {
              const isSelected = filters.zones.includes('SELL_TAKE_PROFIT');
              return (
                <button
                  type="button"
                  onClick={() => handleToggleZone('SELL_TAKE_PROFIT')}
                  data-testid="kpi-filter-sell-take-profit"
                  className={`p-3.5 rounded-xl border text-left transition-all duration-200 cursor-pointer ${
                    isSelected
                      ? 'bg-rose-950/60 border-rose-500/80 ring-2 ring-rose-500/20 shadow-lg shadow-rose-500/10'
                      : 'bg-zinc-950/50 border-zinc-800/80 opacity-50 hover:opacity-100 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-[11px] font-medium block ${isSelected ? 'text-rose-300 font-bold' : 'text-zinc-400'}`}>
                      Sell / Take Profit
                    </span>
                    {isSelected && <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse"></span>}
                  </div>
                  <div className="flex items-baseline space-x-2 mt-1">
                    <span className={`text-2xl font-bold font-mono ${isSelected ? 'text-rose-400' : 'text-zinc-300'}`}>
                      {zoneCounts['SELL_TAKE_PROFIT'] || 0}
                    </span>
                    <span className="text-[10px] text-zinc-500 font-mono">Target Hit</span>
                  </div>
                </button>
              );
            })()}
          </div>
        </div>

      </div>

      {/* FILTER CONTROLS */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {/* Action Zone Filter Chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={handleSelectAllZones}
              className={`px-2.5 py-1 text-xs rounded font-medium transition ${
                filters.zones.length === ALL_ZONES.length
                  ? 'bg-zinc-800 text-white border border-zinc-700 font-bold'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              All Zones ({adviceList.length})
            </button>

            {ALL_ZONES.map(({ zone, label }) => {
              const count = zoneCounts[zone] || 0;
              const isSelected = filters.zones.includes(zone);
              const meta = getActionZoneMeta(zone);
              return (
                <button
                  key={zone}
                  onClick={() => handleToggleZone(zone)}
                  className={`px-2.5 py-1 text-xs rounded font-mono transition border flex items-center space-x-1.5 ${
                    isSelected
                      ? `${meta.badgeBg} ${meta.badgeBorder} ${meta.textColor} font-semibold`
                      : 'bg-zinc-950/60 border-zinc-800/80 text-zinc-500 opacity-60 hover:opacity-100'
                  }`}
                >
                  <span>{label}</span>
                  <span className="text-[10px] opacity-80">({count})</span>
                </button>
              );
            })}
          </div>

          {/* Search Query */}
          <div className="relative w-full sm:w-64 shrink-0">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-zinc-500" />
            <input
              type="text"
              placeholder="Search ticker or advice..."
              value={filters.searchQuery}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, searchQuery: e.target.value }))
              }
              className="w-full pl-8 pr-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
            />
          </div>
        </div>

        {/* Secondary Row: Confidence Slider & Sector dropdown */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-zinc-800/60 text-xs">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <span className="text-zinc-400">Min Confidence:</span>
              <input
                type="range"
                min="0"
                max="90"
                step="5"
                value={filters.minConfidence}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, minConfidence: Number(e.target.value) }))
                }
                className="w-28 accent-emerald-500 bg-zinc-800 h-1.5 rounded-lg cursor-pointer"
              />
              <span className="font-mono text-white text-[11px] font-bold">
                {filters.minConfidence > 0 ? `≥ ${filters.minConfidence}%` : 'Any (0%)'}
              </span>
            </div>

            <div className="flex items-center space-x-2">
              <span className="text-zinc-400">Sector:</span>
              <select
                value={selectedSector}
                onChange={(e) => setSelectedSector(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-zinc-700 font-medium"
              >
                {availableSectors.map((sec) => (
                  <option key={sec} value={sec}>
                    {sec}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <span className="font-mono text-emerald-400 text-[11px]">
            Showing {filteredAdvice.length} of {adviceList.length} evaluated S&amp;P 500 constituents
          </span>

        </div>
      </div>

      {/* ADVICE CARDS GRID */}
      {filteredAdvice.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filteredAdvice.map((item) => {
            const meta = getActionZoneMeta(item.actionZone);
            const isBull = item.trullasSetup ? item.trullasSetup.type.includes('BULL') : true;

            return (
              <div
                key={item.symbol}
                className={`bg-zinc-900 border rounded-2xl p-6 space-y-5 transition relative overflow-hidden ${
                  item.actionZone === 'BREAKOUT_CONFIRMED' || item.actionZone === 'STRONG_BUY'
                    ? 'border-emerald-500/40 shadow-lg shadow-emerald-500/5'
                    : item.actionZone === 'PRE_BREAKOUT'
                    ? 'border-cyan-500/40 shadow-lg shadow-cyan-500/5'
                    : item.actionZone === 'LATE_TO_BUY'
                    ? 'border-amber-500/40'
                    : item.actionZone === 'SELL_TAKE_PROFIT'
                    ? 'border-rose-500/40'
                    : 'border-zinc-800 hover:border-zinc-700'
                }`}
              >
                {/* Card Top: Ticker & Main Zone Badge */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center space-x-2">
                      <strong className="text-white text-lg font-bold tracking-tight">
                        {item.symbol}
                      </strong>
                      {item.companyName && (
                        <span className="text-xs text-zinc-400 truncate max-w-[140px]">
                          {item.companyName}
                        </span>
                      )}
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800 text-zinc-400">
                        {item.sector || 'Asset'}
                      </span>
                    </div>

                    <div className="flex items-baseline space-x-2 mt-1">
                      <span className="text-white font-mono font-bold text-sm">
                        ${item.currentPrice.toFixed(2)}
                      </span>
                      <span className="text-xs font-mono text-zinc-500">
                        {item.distanceToTriggerPct >= 0 ? '+' : ''}
                        {item.distanceToTriggerPct}% from trigger
                      </span>
                    </div>
                  </div>

                  {/* ACTION ZONE BADGE */}
                  <div
                    className={`px-3 py-1.5 rounded-lg border text-xs font-bold font-mono uppercase tracking-wider text-right shrink-0 ${meta.badgeBg} ${meta.badgeBorder} ${meta.textColor}`}
                  >
                    {meta.label}
                  </div>
                </div>

                {/* Headline & Sub-Advice Box */}
                <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800/80 space-y-1">
                  <div className="text-xs font-bold text-white flex items-center space-x-1.5">
                    <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>{item.headline}</span>
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed pl-5">
                    {item.subAdvice}
                  </p>
                </div>

                {/* Execution Levels Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                  <div className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800/60">
                    <span className="text-[10px] text-zinc-500 block">Trigger (23.6%)</span>
                    <span className="font-bold text-emerald-400">
                      ${item.triggerPrice.toFixed(2)}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800/60">
                    <span className="text-[10px] text-zinc-500 block">Stop Loss</span>
                    <span className="font-bold text-rose-400">${item.stopLoss.toFixed(2)}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800/60">
                    <span className="text-[10px] text-zinc-500 block">Target 2 (61.8%)</span>
                    <span className="font-bold text-yellow-400">${item.target2.toFixed(2)}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800/60">
                    <span className="text-[10px] text-zinc-500 block">Risk / Reward</span>
                    <span className="font-bold text-indigo-300">
                      1:{item.riskRewardRatio} R:R
                    </span>
                  </div>
                </div>

                {/* Strategy Confluence Pills */}
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
                  <span
                    className={`px-2 py-0.5 rounded border ${
                      item.trullasSetup
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-500'
                    }`}
                  >
                    Trullàs Divergence: {item.trullasSetup ? 'VERIFIED' : 'PENDING'}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded border ${
                      item.nweBandPosition === 'LOWER_DEMAND'
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : item.nweBandPosition === 'UPPER_SUPPLY'
                        ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400'
                    }`}
                  >
                    LuxAlgo NWE: {item.nweBandPosition}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded border ${
                      item.smcZone === 'DISCOUNT'
                        ? 'bg-teal-500/10 border-teal-500/30 text-teal-400'
                        : item.smcZone === 'PREMIUM'
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400'
                    }`}
                  >
                    SMC: {item.smcZone}
                  </span>
                  {item.hasActiveOrderBlock && (
                    <span className="px-2 py-0.5 rounded border bg-indigo-500/10 border-indigo-500/30 text-indigo-300">
                      Order Block: ACTIVE
                    </span>
                  )}
                </div>

                {/* Rationale & Action Plan */}
                <div className="space-y-2 pt-2 border-t border-zinc-800/60 text-xs">
                  <div className="space-y-1">
                    {item.rationale.slice(0, 2).map((r, i) => (
                      <div key={i} className="flex items-start space-x-2 text-zinc-300 text-[11px]">
                        <span className="text-emerald-400 font-bold shrink-0">&bull;</span>
                        <span>{r}</span>
                      </div>
                    ))}
                  </div>

                  <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 font-sans text-zinc-200 text-xs">
                    <strong className="text-white mr-1.5 font-semibold">Suggested Action:</strong>
                    <span>{item.suggestedAction}</span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-between pt-2 border-t border-zinc-800/80">
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => onSelectSymbolForChart(item.symbol)}
                      className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-xs font-medium transition flex items-center space-x-1"
                    >
                      <span>Chart</span>
                      <ExternalLink className="w-3 h-3 text-zinc-400" />
                    </button>

                    {item.trullasSetup && (
                      <button
                        onClick={() => onOpenCalculator(item.trullasSetup!)}
                        className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-lg text-xs font-medium transition flex items-center space-x-1"
                      >
                        <Calculator className="w-3 h-3 text-emerald-400" />
                        <span>Scale Position</span>
                      </button>
                    )}
                  </div>

                  <div className="flex items-center space-x-1.5 text-[11px] font-mono text-zinc-500">
                    <span>Confidence:</span>
                    <strong className="text-emerald-400">{item.confidenceScore}%</strong>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-12 text-center text-xs bg-zinc-900 border border-zinc-800 rounded-xl space-y-3">
          <Filter className="w-8 h-8 text-zinc-600 mx-auto" />
          <p className="text-zinc-300 font-medium text-sm">No symbols match your current zone filters</p>
          <p className="text-zinc-500 max-w-md mx-auto text-xs leading-relaxed">
            Adjust your zone selections or decrease the minimum confidence threshold to view more evaluated opportunities.
          </p>
          <button
            onClick={handleSelectAllZones}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-xs font-medium border border-zinc-700 transition"
          >
            Reset to All Action Zones
          </button>
        </div>
      )}
    </div>
  );
};
