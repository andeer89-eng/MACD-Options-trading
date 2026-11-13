import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  PieChart,
  TrendingUp,
  TrendingDown,
  Activity,
  Layers,
  Search,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  Radio,
  ExternalLink,
  ChevronRight,
  Sparkles,
  Zap,
  BarChart3,
  Award,
  ShieldCheck,
  ShieldAlert,
  RefreshCw,
} from 'lucide-react';
import {
  GicsSectorPerformance,
  calculateSectorBreadth,
  getSectorPresets,
} from '../utils/sectorMetrics';
import { SP500_UNIVERSE } from '../data/sp500Universe';

interface SectorPerformanceViewProps {
  onSelectSymbolForChart: (sym: string) => void;
  onSetScanWatchlist?: (symbols: string[], name: string) => void;
  scannerResults?: any[];
}

export const SectorPerformanceView: React.FC<SectorPerformanceViewProps> = ({
  onSelectSymbolForChart,
  onSetScanWatchlist,
  scannerResults = [],
}) => {
  const [sectors, setSectors] = useState<GicsSectorPerformance[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [sortField, setSortField] = useState<'changePercent' | 'weekChangePercent' | 'sp500WeightPct'>('changePercent');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [selectedSectorName, setSelectedSectorName] = useState<string | null>('Information Technology');
  const [constituentSearch, setConstituentSearch] = useState<string>('');
  const [notification, setNotification] = useState<string | null>(null);

  const fetchLiveSectors = useCallback(async (force = false) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(force ? '/api/sectors?refresh=true' : '/api/sectors');
      const data = await res.json();
      if (!res.ok || !Array.isArray(data.sectors) || data.sectors.length === 0) {
        throw new Error(data.error || 'Live sector ETF feed unavailable.');
      }
      setSectors(data.sectors);
    } catch (err: any) {
      setSectors([]);
      setErrorMsg(err?.message || 'Unable to load live SPDR sector ETF quotes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLiveSectors(false);
    const onRefresh = () => fetchLiveSectors(true);
    window.addEventListener('market-data-refreshed', onRefresh);
    return () => window.removeEventListener('market-data-refreshed', onRefresh);
  }, [fetchLiveSectors]);

  // Compute active divergences per sector from scanner results if available
  const sectorDivergenceCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of scannerResults) {
      if (item.sector && item.setups && item.setups.length > 0) {
        counts[item.sector] = (counts[item.sector] || 0) + item.setups.length;
      }
    }
    return counts;
  }, [scannerResults]);

  // Breadth calculation
  const breadth = useMemo(() => calculateSectorBreadth(sectors), [sectors]);

  // Sorted sector list
  const sortedSectors = useMemo(() => {
    return [...sectors].sort((a, b) => {
      let valA = a[sortField] || 0;
      let valB = b[sortField] || 0;
      return sortOrder === 'desc' ? valB - valA : valA - valB;
    });
  }, [sectors, sortField, sortOrder]);

  // Active selected sector details & constituents
  const activeSector = useMemo(() => {
    if (!selectedSectorName) return null;
    return sectors.find((s) => s.name === selectedSectorName) || sectors[0];
  }, [sectors, selectedSectorName]);

  const activeConstituents = useMemo(() => {
    if (!activeSector) return [];
    let list = SP500_UNIVERSE.filter((c) => c.sector === activeSector.name);
    if (constituentSearch.trim()) {
      const q = constituentSearch.toLowerCase().trim();
      list = list.filter(
        (c) => c.symbol.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)
      );
    }
    return list;
  }, [activeSector, constituentSearch]);

  const handleFilterScannerToSector = (sectorName: string) => {
    const sectorSymbols = SP500_UNIVERSE.filter((c) => c.sector === sectorName).map((c) => c.symbol);
    if (onSetScanWatchlist && sectorSymbols.length > 0) {
      onSetScanWatchlist(sectorSymbols, `${sectorName} Sector (${sectorSymbols.length})`);
      showToast(`Set scanner focus to ${sectorName} (${sectorSymbols.length} constituents)`);
    }
  };

  const handleFilterScannerToPreset = (preset: { label: string; sectors: string[] }) => {
    const symbols = SP500_UNIVERSE.filter((c) => preset.sectors.includes(c.sector)).map((c) => c.symbol);
    if (onSetScanWatchlist && symbols.length > 0) {
      onSetScanWatchlist(symbols, `${preset.label} (${symbols.length})`);
      showToast(`Set scanner focus to preset "${preset.label}" (${symbols.length} constituents)`);
    }
  };

  const showToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3500);
  };

  return (
    <div className="space-y-6">
      {/* HEADER BANNER */}
      <div className="bg-gradient-to-r from-zinc-900 via-indigo-950/50 to-zinc-950 border border-zinc-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold mb-2">
              <PieChart className="w-3.5 h-3.5" />
              <span>GICS Sector Performance &amp; Sector Rotation Visualizer</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Real-Time S&amp;P 500 Sector Performance
            </h2>
            <p className="mt-1 text-xs text-zinc-300 max-w-2xl leading-relaxed">
              Analyze real-time market leadership across all 11 official GICS sectors to identify momentum drivers, capital rotation, and high-probability setup clusters.
            </p>
          </div>

          {/* Market Breadth HUD */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono shrink-0">
            <div className="bg-zinc-950/80 border border-zinc-800 p-3 rounded-xl">
              <span className="text-[10px] text-zinc-500 uppercase block font-sans">Sector Breadth</span>
              <span className="text-lg font-bold text-emerald-400">
                {breadth.advancing} Adv / {breadth.declining} Dec
              </span>
              <span className="text-[10px] text-zinc-400 block font-sans">11 GICS Sectors</span>
            </div>

            <div className="bg-zinc-950/80 border border-zinc-800 p-3 rounded-xl">
              <span className="text-[10px] text-zinc-500 uppercase block font-sans">Avg Sector Return</span>
              <span className={`text-lg font-bold ${breadth.avgChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {breadth.avgChange >= 0 ? '+' : ''}{breadth.avgChange}%
              </span>
              <span className="text-[10px] text-zinc-400 block font-sans">Equal Weight Avg</span>
            </div>

            <div className="bg-zinc-950/80 border border-zinc-800 p-3 rounded-xl">
              <span className="text-[10px] text-zinc-500 uppercase block font-sans">Top Market Leader</span>
              <span className="text-lg font-bold text-emerald-400">
                {breadth.topGainer ? `${breadth.topGainer.etf} (+${breadth.topGainer.changePercent}%)` : 'N/A'}
              </span>
              <span className="text-[10px] text-zinc-400 block font-sans truncate max-w-[120px]">
                {breadth.topGainer?.name}
              </span>
            </div>

            <div className="bg-zinc-950/80 border border-zinc-800 p-3 rounded-xl">
              <span className="text-[10px] text-zinc-500 uppercase block font-sans">Top Sector Laggard</span>
              <span className="text-lg font-bold text-rose-400">
                {breadth.topLoser ? `${breadth.topLoser.etf} (${breadth.topLoser.changePercent}%)` : 'N/A'}
              </span>
              <span className="text-[10px] text-zinc-400 block font-sans truncate max-w-[120px]">
                {breadth.topLoser?.name}
              </span>
            </div>
          </div>
        </div>

        {/* TOAST NOTIFICATION */}
        {notification && (
          <div className="mt-4 p-3 bg-zinc-950 border border-indigo-500/40 rounded-xl text-xs text-indigo-300 flex items-center space-x-2 animate-in fade-in">
            <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{notification}</span>
          </div>
        )}
      </div>

      {/* SECTOR ROTATION PRESET BAR */}
      <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-md">
        <div className="flex items-center space-x-2">
          <Filter className="w-4 h-4 text-indigo-400 shrink-0" />
          <span className="text-xs font-bold text-white font-mono">Preset Sector Scans:</span>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          {getSectorPresets().map((preset) => (
            <button
              key={preset.id}
              onClick={() => handleFilterScannerToPreset(preset)}
              className="px-3 py-1.5 bg-zinc-950 hover:bg-indigo-600 hover:text-white text-zinc-300 border border-zinc-800 rounded-xl transition flex items-center space-x-1.5"
            >
              <Zap className="w-3 h-3 text-emerald-400" />
              <span>{preset.label}</span>
            </button>
          ))}
        </div>

        {/* SORT CONTROLS */}
        <div className="flex items-center space-x-2 text-xs font-mono shrink-0">
          <span className="text-zinc-500 font-sans">Sort by:</span>
          <button
            onClick={() => {
              setSortField('changePercent');
              setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
            }}
            className={`px-2.5 py-1 rounded-lg border transition ${
              sortField === 'changePercent'
                ? 'bg-indigo-600 text-white border-indigo-500'
                : 'bg-zinc-950 text-zinc-400 border-zinc-800'
            }`}
          >
            1D % {sortField === 'changePercent' && (sortOrder === 'desc' ? '↓' : '↑')}
          </button>

          <button
            onClick={() => {
              setSortField('weekChangePercent');
              setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
            }}
            className={`px-2.5 py-1 rounded-lg border transition ${
              sortField === 'weekChangePercent'
                ? 'bg-indigo-600 text-white border-indigo-500'
                : 'bg-zinc-950 text-zinc-400 border-zinc-800'
            }`}
          >
            7D % {sortField === 'weekChangePercent' && (sortOrder === 'desc' ? '↓' : '↑')}
          </button>

          <button
            onClick={() => {
              setSortField('sp500WeightPct');
              setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
            }}
            className={`px-2.5 py-1 rounded-lg border transition ${
              sortField === 'sp500WeightPct'
                ? 'bg-indigo-600 text-white border-indigo-500'
                : 'bg-zinc-950 text-zinc-400 border-zinc-800'
            }`}
          >
            S&amp;P Weight % {sortField === 'sp500WeightPct' && (sortOrder === 'desc' ? '↓' : '↑')}
          </button>
        </div>
      </div>

      {/* LOADING & ERROR STATES */}
      {loading && sectors.length === 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center text-xs font-mono text-zinc-400 flex items-center justify-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
          <span>Fetching live SPDR sector ETF performance from Yahoo Finance...</span>
        </div>
      )}

      {!loading && errorMsg && (
        <div className="bg-rose-950/30 border border-rose-500/30 rounded-2xl p-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 text-xs text-rose-300">
            <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            onClick={() => fetchLiveSectors(true)}
            className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shrink-0"
          >
            Retry Feed
          </button>
        </div>
      )}

      {/* SECTOR CARDS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sortedSectors.map((sector) => {
          const isSelected = selectedSectorName === sector.name;
          const isPositive = sector.changePercent >= 0;
          const divergenceCount = sectorDivergenceCounts[sector.name] || 0;

          return (
            <div
              key={sector.name}
              onClick={() => setSelectedSectorName(sector.name)}
              className={`bg-zinc-900 border rounded-2xl p-5 space-y-4 transition cursor-pointer relative shadow-sm hover:shadow-md ${
                isSelected
                  ? 'border-indigo-500 ring-1 ring-indigo-500/50 shadow-indigo-500/10'
                  : 'border-zinc-800 hover:border-zinc-700'
              }`}
            >
              {/* Sector Header */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-base font-extrabold text-white font-mono">{sector.name}</span>
                    <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-zinc-950 text-indigo-300 border border-zinc-800">
                      {sector.etf}
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-400 mt-1 font-mono">
                    Weight: <strong className="text-white">{sector.sp500WeightPct}%</strong> of S&amp;P 500 &bull; {sector.constituentCount} stocks
                  </div>
                </div>

                <div className="text-right font-mono">
                  <div className="text-lg font-bold text-white">${sector.price.toFixed(2)}</div>
                  <div
                    className={`text-xs font-bold flex items-center justify-end ${
                      isPositive ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {isPositive ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                    <span>
                      {isPositive ? '+' : ''}${sector.changeNominal.toFixed(2)} ({isPositive ? '+' : ''}{sector.changePercent.toFixed(2)}%)
                    </span>
                  </div>
                </div>
              </div>

              {/* 7D Trend Mini Sparkline */}
              <div className="bg-zinc-950 p-2.5 rounded-xl border border-zinc-800/80 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-zinc-500 block uppercase font-mono">7-Day Trend</span>
                  <span className={`text-xs font-bold font-mono ${sector.weekChangePercent && sector.weekChangePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {sector.weekChangePercent && sector.weekChangePercent >= 0 ? '+' : ''}{sector.weekChangePercent}% 7D
                  </span>
                </div>

                {/* SVG Sparkline */}
                {sector.sparkline && sector.sparkline.length > 1 && (
                  <svg className="w-28 h-8 overflow-visible">
                    <polyline
                      fill="none"
                      stroke={sector.changePercent >= 0 ? '#34d399' : '#f43f5e'}
                      strokeWidth="2"
                      points={sector.sparkline
                        .map((val, idx) => {
                          const min = Math.min(...sector.sparkline);
                          const max = Math.max(...sector.sparkline);
                          const range = max - min || 1;
                          const x = (idx / (sector.sparkline.length - 1)) * 100;
                          const y = 28 - ((val - min) / range) * 22;
                          return `${x},${y}`;
                        })
                        .join(' ')}
                    />
                  </svg>
                )}
              </div>

              {/* Mega-Caps Pills & Divergence Tag */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
                  <span>Key Mega-Caps:</span>
                  {divergenceCount > 0 && (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold flex items-center gap-1">
                      <Sparkles className="w-3 h-3" /> {divergenceCount} Setups
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-1">
                  {sector.keyMegaCaps.map((sym) => (
                    <button
                      key={sym}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectSymbolForChart(sym);
                      }}
                      className="px-2 py-0.5 rounded bg-zinc-950 hover:bg-indigo-600 hover:text-white text-zinc-300 border border-zinc-800 text-[10px] font-mono transition"
                    >
                      {sym}
                    </button>
                  ))}
                </div>
              </div>

              {/* Action Button */}
              {onSetScanWatchlist && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleFilterScannerToSector(sector.name);
                  }}
                  className="w-full py-2 bg-zinc-950 hover:bg-indigo-600 text-zinc-300 hover:text-white border border-zinc-800 text-xs font-mono font-bold rounded-xl transition flex items-center justify-center space-x-1.5"
                >
                  <Radio className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Isolate Scanner to {sector.etf}</span>
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* SELECTED SECTOR CONSTITUENTS INSPECTOR */}
      {activeSector && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4 shadow-md">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
            <div>
              <div className="flex items-center space-x-3">
                <h3 className="text-xl font-extrabold text-white font-mono">{activeSector.name}</h3>
                <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded bg-indigo-600 text-white">
                  {activeSector.etf} ETF
                </span>
                <span className="text-xs font-mono text-zinc-400">
                  ({activeConstituents.length} S&amp;P 500 Constituents)
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-1">
                All S&amp;P 500 member companies belonging to the <strong>{activeSector.name}</strong> GICS sector.
              </p>
            </div>

            {/* Search within sector */}
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={constituentSearch}
                onChange={(e) => setConstituentSearch(e.target.value)}
                placeholder={`Search in ${activeSector.name}...`}
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-indigo-500 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-zinc-500 font-mono focus:outline-none"
              />
            </div>
          </div>

          {/* CONSTITUENT CARDS GRID */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {activeConstituents.map((comp) => (
              <div
                key={comp.symbol}
                className="bg-zinc-950 border border-zinc-800/90 hover:border-indigo-500/50 p-3 rounded-xl space-y-2 transition shadow-sm group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-base font-bold text-white font-mono">{comp.symbol}</span>
                  <button
                    onClick={() => onSelectSymbolForChart(comp.symbol)}
                    className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-0.5"
                  >
                    Chart <ArrowUpRight className="w-3 h-3" />
                  </button>
                </div>

                <div className="text-[11px] text-zinc-400 font-sans truncate" title={comp.name}>
                  {comp.name}
                </div>

                <div className="text-[10px] font-mono text-zinc-500 pt-1 border-t border-zinc-900 flex justify-between">
                  <span>Weight ~{(100 / activeSector.constituentCount).toFixed(2)}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
