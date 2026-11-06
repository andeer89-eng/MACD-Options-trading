import React, { useState, useEffect, useMemo } from 'react';
import {
  Building2,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Check,
  Filter,
  Layers,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Zap,
  Activity,
  PieChart,
  Search,
  SlidersHorizontal,
  Flame,
  Shield,
  ArrowRight,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import {
  GicsSectorPerformance,
  GICS_SECTORS_METADATA,
  filterWatchlistBySectors,
  calculateSectorBreadth,
  generateFallbackSectorMetrics,
  getSectorPresets,
} from '../utils/sectorMetrics';
import { SP500_UNIVERSE } from '../data/sp500Universe';

export interface SectorFilteringProps {
  currentWatchlist: string[];
  onApplyWatchlist: (newWatchlist: string[]) => void;
  onScanNow?: (tickers: string[]) => void;
  scanResults?: Array<{
    symbol: string;
    sector?: string;
    hasTripleDivergence?: boolean;
    hasDoubleDivergence?: boolean;
  }>;
}

export const SectorFiltering: React.FC<SectorFilteringProps> = ({
  currentWatchlist,
  onApplyWatchlist,
  onScanNow,
  scanResults = [],
}) => {
  const [sectors, setSectors] = useState<GicsSectorPerformance[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const [viewMode, setViewMode] = useState<'grid' | 'compact'>('grid');
  const [autoSync, setAutoSync] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Set of selected sector names
  const [selectedSectors, setSelectedSectors] = useState<Set<string>>(() => {
    // Initialize with all 11 sectors by default
    return new Set(GICS_SECTORS_METADATA.map((s) => s.name));
  });

  // Fetch real-time sector metrics from API
  const fetchSectorMetrics = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/sectors');
      if (res.ok) {
        const data = await res.json();
        if (data.sectors && Array.isArray(data.sectors)) {
          setSectors(data.sectors);
          setLastUpdated(new Date());
          return;
        }
      }
      // Fallback
      setSectors(generateFallbackSectorMetrics());
      setLastUpdated(new Date());
    } catch (err) {
      console.warn('Error fetching real-time sector metrics, using fallback', err);
      setSectors(generateFallbackSectorMetrics());
      setLastUpdated(new Date());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSectorMetrics();
  }, []);

  // Compute divergence counts per sector from current scanResults
  const sectorDivergenceCounts = useMemo(() => {
    const counts: Record<string, { total: number; triple: number }> = {};
    for (const item of scanResults) {
      if (item.sector) {
        if (!counts[item.sector]) {
          counts[item.sector] = { total: 0, triple: 0 };
        }
        if (item.hasTripleDivergence || item.hasDoubleDivergence) {
          counts[item.sector].total++;
          if (item.hasTripleDivergence) {
            counts[item.sector].triple++;
          }
        }
      }
    }
    return counts;
  }, [scanResults]);

  // Compute filtered tickers based on current selected sectors
  const filteredTickers = useMemo(() => {
    return filterWatchlistBySectors(SP500_UNIVERSE, selectedSectors);
  }, [selectedSectors]);

  // Calculate sector market breadth
  const breadth = useMemo(() => {
    return calculateSectorBreadth(sectors);
  }, [sectors]);

  // Handle Sector Toggle
  const toggleSector = (sectorName: string) => {
    setSelectedSectors((prev) => {
      const next = new Set(prev);
      if (next.has(sectorName)) {
        next.delete(sectorName);
      } else {
        next.add(sectorName);
      }

      // If auto-sync is enabled, apply changes immediately
      if (autoSync) {
        const nextTickers = filterWatchlistBySectors(SP500_UNIVERSE, next);
        onApplyWatchlist(nextTickers);
      }

      return next;
    });
  };

  // Presets handler
  const handleApplyPreset = (sectorList: string[]) => {
    const nextSet = new Set(sectorList);
    setSelectedSectors(nextSet);
    if (autoSync) {
      const nextTickers = filterWatchlistBySectors(SP500_UNIVERSE, nextSet);
      onApplyWatchlist(nextTickers);
    }
  };

  // Select only Bullish Sectors
  const handleSelectBullishOnly = () => {
    const bullish = sectors.filter((s) => s.changePercent > 0).map((s) => s.name);
    handleApplyPreset(bullish.length > 0 ? bullish : GICS_SECTORS_METADATA.map((s) => s.name));
  };

  // Invert Selection
  const handleInvertSelection = () => {
    const allNames = GICS_SECTORS_METADATA.map((s) => s.name);
    const inverted = allNames.filter((name) => !selectedSectors.has(name));
    handleApplyPreset(inverted);
  };

  // Trigger Apply to Live Watchlist
  const handleApplyToWatchlist = (triggerImmediateScan: boolean = false) => {
    onApplyWatchlist(filteredTickers);
    if (triggerImmediateScan && onScanNow) {
      onScanNow(filteredTickers);
    }
  };

  // Filtered sectors list by search term
  const displayedSectors = useMemo(() => {
    if (!searchTerm.trim()) return sectors;
    const term = searchTerm.toLowerCase();
    return sectors.filter(
      (s) =>
        s.name.toLowerCase().includes(term) ||
        s.etf.toLowerCase().includes(term) ||
        s.keyMegaCaps.some((t) => t.toLowerCase().includes(term))
    );
  }, [sectors, searchTerm]);

  // Mini SVG Sparkline generator
  const renderSparkline = (points: number[], isPositive: boolean) => {
    if (!points || points.length < 2) return null;
    const min = Math.min(...points);
    const max = Math.max(...points);
    const range = max - min || 1;
    const width = 80;
    const height = 24;

    const coords = points.map((val, idx) => {
      const x = (idx / (points.length - 1)) * width;
      const y = height - ((val - min) / range) * (height - 6) - 3;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    const color = isPositive ? '#10b981' : '#f43f5e';

    return (
      <svg width={width} height={height} className="overflow-visible inline-block">
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={coords.join(' ')}
        />
      </svg>
    );
  };

  return (
    <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl overflow-hidden shadow-xl transition-all">
      {/* Top Header & Breadth Bar */}
      <div className="p-4 sm:p-5 bg-gradient-to-r from-zinc-900 via-zinc-900/95 to-zinc-950 border-b border-zinc-800">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                  <span>GICS Sector Filtering &amp; Performance</span>
                </h3>
                <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-bold text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  REAL-TIME BENCHMARKS
                </span>
                {lastUpdated && (
                  <span className="text-[11px] text-zinc-400 hidden sm:inline">
                    Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Monitor real-time SPDR sector ETF metrics and toggle sectors on/off to dynamically refine the active S&amp;P 500 scanner watchlist.
              </p>
            </div>
          </div>

          {/* Quick Breadth & Control Actions */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* Sector Breadth Pill */}
            {sectors.length > 0 && (
              <div className="flex items-center gap-2 bg-zinc-950/80 px-3 py-1.5 rounded-lg border border-zinc-800 text-xs">
                <span className="text-zinc-400 font-medium text-[11px]">Breadth:</span>
                <span className="text-emerald-400 font-bold font-mono">
                  {breadth.advancing} Up
                </span>
                <span className="text-zinc-600">/</span>
                <span className="text-rose-400 font-bold font-mono">
                  {breadth.declining} Down
                </span>
                {breadth.topGainer && (
                  <span className="hidden md:inline-flex items-center gap-1 text-[11px] text-emerald-300 font-mono bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-800/40">
                    <TrendingUp className="w-3 h-3 text-emerald-400" />
                    Top: {breadth.topGainer.etf} (+{breadth.topGainer.changePercent}%)
                  </span>
                )}
              </div>
            )}

            {/* Refresh Quotes */}
            <button
              onClick={fetchSectorMetrics}
              disabled={loading}
              title="Refresh Sector ETF Quotes"
              className="p-2 rounded-lg bg-zinc-800/70 hover:bg-zinc-800 border border-zinc-700/60 text-zinc-300 hover:text-white transition disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
            </button>

            {/* View Mode Toggle */}
            <div className="hidden sm:flex items-center bg-zinc-950 p-1 rounded-lg border border-zinc-800 text-xs">
              <button
                onClick={() => setViewMode('grid')}
                className={`px-2 py-1 rounded font-medium transition ${
                  viewMode === 'grid' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'
                }`}
                title="Grid Cards View"
              >
                Cards
              </button>
              <button
                onClick={() => setViewMode('compact')}
                className={`px-2 py-1 rounded font-medium transition ${
                  viewMode === 'compact' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'
                }`}
                title="Compact Strip View"
              >
                Compact
              </button>
            </div>

            {/* Collapse/Expand Toggle */}
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800/60 hover:bg-zinc-800 border border-zinc-700/60 text-zinc-300 hover:text-white text-xs font-semibold transition"
            >
              <span>{isExpanded ? 'Hide Sectors' : 'Show Sectors'}</span>
              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Market Breadth Progress Bar */}
        {sectors.length > 0 && isExpanded && (
          <div className="mt-3.5 pt-3 border-t border-zinc-800/60 flex items-center gap-3">
            <span className="text-[11px] font-mono font-medium text-zinc-400 shrink-0">
              S&amp;P 500 Sector Momentum:
            </span>
            <div className="flex-1 h-2 bg-zinc-950 rounded-full overflow-hidden flex border border-zinc-800">
              <div
                style={{
                  width: `${(breadth.advancing / (breadth.total || 1)) * 100}%`,
                }}
                className="h-full bg-emerald-500 transition-all duration-500"
                title={`${breadth.advancing} Advancing Sectors`}
              />
              <div
                style={{
                  width: `${(breadth.declining / (breadth.total || 1)) * 100}%`,
                }}
                className="h-full bg-rose-500 transition-all duration-500"
                title={`${breadth.declining} Declining Sectors`}
              />
            </div>
            <span className="text-[11px] font-mono text-zinc-400 shrink-0">
              Avg: {breadth.avgChange >= 0 ? `+${breadth.avgChange}%` : `${breadth.avgChange}%`}
            </span>
          </div>
        )}
      </div>

      {/* Main Collapsible Filter Body */}
      {isExpanded && (
        <div className="p-4 sm:p-5 space-y-4">
          {/* Preset Buttons & Search Row */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-zinc-950/70 p-3 rounded-lg border border-zinc-800/80">
            {/* Quick Sector Presets */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-zinc-400 font-semibold uppercase tracking-wider mr-1 flex items-center gap-1">
                <SlidersHorizontal className="w-3.5 h-3.5 text-zinc-400" />
                <span>Presets:</span>
              </span>

              {getSectorPresets().map((preset) => {
                const isActive =
                  preset.sectors.length === selectedSectors.size &&
                  preset.sectors.every((s) => selectedSectors.has(s));
                return (
                  <button
                    key={preset.id}
                    onClick={() => handleApplyPreset(preset.sectors)}
                    className={`px-2.5 py-1 text-xs rounded-md border font-medium transition ${
                      isActive
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm'
                        : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white hover:bg-zinc-800'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}

              <button
                onClick={handleSelectBullishOnly}
                className="px-2.5 py-1 text-xs rounded-md border bg-zinc-900 text-emerald-400 border-zinc-800 hover:bg-emerald-500/10 hover:border-emerald-500/30 transition font-medium"
              >
                Bullish Only (&gt;0%)
              </button>

              <button
                onClick={handleInvertSelection}
                className="px-2.5 py-1 text-xs rounded-md border bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white hover:bg-zinc-800 transition"
              >
                Invert
              </button>

              <button
                onClick={() => handleApplyPreset([])}
                className="px-2.5 py-1 text-xs rounded-md border bg-zinc-900 text-rose-400 border-zinc-800 hover:bg-rose-500/10 transition"
              >
                Clear All
              </button>
            </div>

            {/* Search within sectors */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter sectors or mega-caps..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 pr-3 py-1 bg-zinc-900 border border-zinc-800 rounded-md text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 w-48 sm:w-56"
                />
              </div>

              {/* Auto-Sync Toggle */}
              <label className="flex items-center gap-1.5 cursor-pointer select-none text-xs text-zinc-300 bg-zinc-900 px-2.5 py-1 rounded-md border border-zinc-800 hover:border-zinc-700">
                <input
                  type="checkbox"
                  checked={autoSync}
                  onChange={(e) => setAutoSync(e.target.checked)}
                  className="rounded border-zinc-700 text-emerald-500 focus:ring-0 cursor-pointer accent-emerald-500"
                />
                <span className="font-medium text-[11px]">Auto-Sync Watchlist</span>
              </label>
            </div>
          </div>

          {/* Active Selection Summary Banner */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <div className="flex items-center space-x-2 text-xs">
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              <div>
                <span className="font-bold text-white">
                  {selectedSectors.size} of 11 GICS Sectors Selected
                </span>
                <span className="text-zinc-400 ml-1.5">
                  &bull; Refining Watchlist to{' '}
                  <span className="text-emerald-400 font-bold font-mono">
                    {filteredTickers.length} S&amp;P 500 Constituent Stocks
                  </span>{' '}
                  ({503 - filteredTickers.length} excluded)
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => handleApplyToWatchlist(false)}
                className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white font-semibold text-xs rounded-lg transition"
              >
                Apply to Watchlist
              </button>
              <button
                onClick={() => handleApplyToWatchlist(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs rounded-lg transition shadow-md shadow-emerald-500/20"
              >
                <span>Apply &amp; Scan Now</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Sector View: Grid vs Compact */}
          {viewMode === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {displayedSectors.map((sector) => {
                const isSelected = selectedSectors.has(sector.name);
                const isPositive = sector.changePercent >= 0;
                const divInfo = sectorDivergenceCounts[sector.name];

                return (
                  <div
                    key={sector.name}
                    onClick={() => toggleSector(sector.name)}
                    className={`relative p-3.5 rounded-xl border transition-all cursor-pointer select-none group ${
                      isSelected
                        ? 'bg-zinc-900 border-zinc-700/90 shadow-md ring-1 ring-emerald-500/30 hover:border-emerald-500/60'
                        : 'bg-zinc-950/60 border-zinc-800/80 opacity-60 hover:opacity-90 hover:border-zinc-700'
                    }`}
                  >
                    {/* Top Row: Checkbox/Toggle + Name + ETF */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {/* Custom Toggle Box */}
                        <div
                          className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                            isSelected
                              ? 'bg-emerald-500 border-emerald-400 text-zinc-950'
                              : 'bg-zinc-900 border-zinc-700 text-transparent'
                          }`}
                        >
                          <Check className="w-3 h-3 stroke-[3]" />
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-xs text-white leading-tight">
                              {sector.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300 font-mono text-[10px] font-bold border border-zinc-700">
                              {sector.etf}
                            </span>
                            <span className="text-[10px] text-zinc-400 font-mono">
                              {sector.constituentCount} stocks &bull; {sector.sp500WeightPct}% wt
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Divergence alert badge if present */}
                      {divInfo && divInfo.total > 0 && (
                        <span className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-[10px] font-bold text-amber-300 font-mono flex items-center gap-1">
                          <Flame className="w-3 h-3 text-amber-400" />
                          {divInfo.total} Divs
                        </span>
                      )}
                    </div>

                    {/* Middle Row: Price, Change %, Sparkline */}
                    <div className="mt-3 pt-2.5 border-t border-zinc-800/70 flex items-center justify-between">
                      <div>
                        <div className="font-mono text-sm font-bold text-white">
                          ${sector.price.toFixed(2)}
                        </div>
                        <div
                          className={`flex items-center gap-1 text-xs font-mono font-bold ${
                            isPositive ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {isPositive ? (
                            <TrendingUp className="w-3.5 h-3.5 shrink-0" />
                          ) : (
                            <TrendingDown className="w-3.5 h-3.5 shrink-0" />
                          )}
                          <span>
                            {isPositive ? `+${sector.changePercent}%` : `${sector.changePercent}%`}
                          </span>
                          <span className="text-[10px] text-zinc-500 font-normal">
                            ({sector.changeNominal >= 0 ? `+$${sector.changeNominal}` : `-$${Math.abs(sector.changeNominal)}`})
                          </span>
                        </div>
                      </div>

                      {/* SVG Sparkline */}
                      <div className="pl-2">
                        {renderSparkline(sector.sparkline, isPositive)}
                      </div>
                    </div>

                    {/* Bottom Row: Key Mega-Cap Tickers */}
                    <div className="mt-2.5 pt-2 border-t border-zinc-800/50 flex items-center justify-between text-[10px] text-zinc-400">
                      <span className="font-mono text-zinc-400">Top Holdings:</span>
                      <div className="flex items-center gap-1">
                        {sector.keyMegaCaps.slice(0, 4).map((ticker, tIdx) => (
                          <span
                            key={`${sector.name}-${ticker}-${tIdx}`}
                            className="px-1 py-0.5 rounded bg-zinc-800/80 text-zinc-300 font-mono text-[9px] border border-zinc-700/60"
                          >
                            {ticker}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Compact Strip View */
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
              {displayedSectors.map((sector) => {
                const isSelected = selectedSectors.has(sector.name);
                const isPositive = sector.changePercent >= 0;

                return (
                  <button
                    key={sector.name}
                    onClick={() => toggleSector(sector.name)}
                    className={`flex items-center justify-between p-2 rounded-lg border text-left transition ${
                      isSelected
                        ? 'bg-zinc-900 border-zinc-700 ring-1 ring-emerald-500/20'
                        : 'bg-zinc-950/60 border-zinc-800/70 opacity-60 hover:opacity-90'
                    }`}
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <div
                        className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                          isSelected
                            ? 'bg-emerald-500 border-emerald-400 text-zinc-950'
                            : 'bg-zinc-900 border-zinc-700 text-transparent'
                        }`}
                      >
                        <Check className="w-2.5 h-2.5 stroke-[3]" />
                      </div>
                      <div className="truncate">
                        <div className="font-bold text-xs text-white truncate">{sector.name}</div>
                        <div className="text-[10px] text-zinc-400 font-mono">
                          {sector.etf} &bull; {sector.constituentCount} cos
                        </div>
                      </div>
                    </div>
                    <div
                      className={`font-mono text-xs font-bold pl-1 shrink-0 ${
                        isPositive ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {isPositive ? `+${sector.changePercent}%` : `${sector.changePercent}%`}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
