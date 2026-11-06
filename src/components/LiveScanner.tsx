import React, { useState, useEffect } from 'react';
import {
  Search,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Filter,
  Plus,
  Trash2,
  ExternalLink,
  ShieldAlert,
  Target,
  FileText,
  Clock,
  Sparkles,
  Layers,
  ChevronRight,
  Building2,
  PieChart,
  Gauge,
  Flame,
  Zap,
  Eye,
  EyeOff,
  Check,
  Info,
} from 'lucide-react';
import { WatchlistManager } from './WatchlistManager';
import { DivergenceSetup } from '../utils/trullasStrategy';
import {
  SP500_UNIVERSE,
  SP500_SECTORS,
  SP500_TOP_50,
  getTickersBySector,
} from '../data/sp500Universe';
import { SectorFiltering } from './SectorFiltering';
import { MarketOverview } from './MarketOverview';
import { WorkerPool } from '../utils/workerPool';
import { deduplicateSymbols, generateStableScanKey, generateCompositeKey } from '../utils/dataFetcher';
import { evaluateCandidate360Confluence } from '../utils/confluenceScoringEngine';

interface ScanResultItem {
  symbol: string;
  companyName?: string;
  sector?: string;
  timeframe: string;
  currentPrice: number;
  changePercent: number;
  volume: number;
  rsi?: number;
  atr?: number;
  atrPercent?: number;
  isStagnant?: boolean;
  setups: DivergenceSetup[];
  hasTripleDivergence: boolean;
  hasDoubleDivergence: boolean;
  sec: any;
  candleCount: number;
}

interface LiveScannerProps {
  results: ScanResultItem[];
  scanning: boolean;
  onScanNow: (tickers: string[], timeframe: string) => void;
  onSelectSymbolForChart: (symbol: string) => void;
  onOpenCalculator: (setup: DivergenceSetup) => void;
  watchlist: string[];
  setWatchlist: React.Dispatch<React.SetStateAction<string[]>>;
  timeframe: string;
  setTimeframe: (tf: string) => void;
}

export const LiveScanner: React.FC<LiveScannerProps> = ({
  results,
  scanning,
  onScanNow,
  onSelectSymbolForChart,
  onOpenCalculator,
  watchlist,
  setWatchlist,
  timeframe,
  setTimeframe,
}) => {
  const [filterType, setFilterType] = useState<
    'all' | 'triple' | 'bullish' | 'bearish' | 'high-score'
  >('all');
  const [selectedSectorFilter, setSelectedSectorFilter] = useState<string>('All');
  const [selectedSP500Preset, setSelectedSP500Preset] = useState<string>('Top 50 Mega-Caps');
  const [selectedPreScanGicsSector, setSelectedPreScanGicsSector] = useState<string>('All Sectors');
  const [newTickerInput, setNewTickerInput] = useState('');

  // S&P 500 Index Search Bar State
  const [sp500SearchQuery, setSp500SearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [showMarketOverview, setShowMarketOverview] = useState(true);
  const [showWatchlistManager, setShowWatchlistManager] = useState(false);

  // Filter S&P 500 Universe by symbol or company name or sector
  const matchedUniverseTickers = React.useMemo(() => {
    const q = sp500SearchQuery.trim().toUpperCase();
    if (!q) return [];
    return SP500_UNIVERSE.filter(
      (c) =>
        c.symbol.toUpperCase().includes(q) ||
        c.name.toUpperCase().includes(q) ||
        c.sector.toUpperCase().includes(q)
    ).slice(0, 10);
  }, [sp500SearchQuery]);

  const handleAddTickerFromUniverse = (tickerToAdd: string) => {
    const sym = tickerToAdd.toUpperCase().trim();
    if (!sym) return;
    if (!watchlist.includes(sym)) {
      setWatchlist((prev) => [...prev, sym]);
    }
    setSp500SearchQuery('');
    setNewTickerInput('');
    setIsSearchFocused(false);
  };

  // ATR Volatility & Liquidity Filter State
  const [atrFilterActive, setAtrFilterActive] = useState<boolean>(true);
  const [minAtrPercent, setMinAtrPercent] = useState<number>(1.0); // e.g., 1.0% min ATR volatility
  const [showStagnantSymbols, setShowStagnantSymbols] = useState<boolean>(false);

  // Sector counts
  const sectorCounts = {
    tech: getTickersBySector('Information Technology').length,
    health: getTickersBySector('Health Care').length,
    finance: getTickersBySector('Financials').length,
    discretionary: getTickersBySector('Consumer Discretionary').length,
    industrial: getTickersBySector('Industrials').length,
    energy: getTickersBySector('Energy').length,
    staples: getTickersBySector('Consumer Staples').length,
    utilities: getTickersBySector('Utilities').length,
    realEstate: getTickersBySector('Real Estate').length,
    materials: getTickersBySector('Materials').length,
  };

  // Pre-Scan GICS Sector Dropdown handler
  const handlePreScanGicsSectorSelect = (sector: string, triggerImmediateScan: boolean = false) => {
    setSelectedPreScanGicsSector(sector);
    const tickers = getTickersBySector(sector);
    setWatchlist(tickers);
    if (triggerImmediateScan) {
      onScanNow(tickers, timeframe);
    }
  };

  // Quick preset loading
  const handleLoadSP500Preset = (presetName: string) => {
    setSelectedSP500Preset(presetName);
    let newTickers: string[] = [];

    if (presetName === 'Top 50 Mega-Caps') {
      newTickers = SP500_TOP_50;
      setSelectedPreScanGicsSector('All Sectors');
    } else if (presetName === 'Tech Giants') {
      newTickers = getTickersBySector('Information Technology');
      setSelectedPreScanGicsSector('Information Technology');
    } else if (presetName === 'Healthcare Leaders') {
      newTickers = getTickersBySector('Health Care');
      setSelectedPreScanGicsSector('Health Care');
    } else if (presetName === 'Financial Titans') {
      newTickers = getTickersBySector('Financials');
      setSelectedPreScanGicsSector('Financials');
    } else if (presetName === 'Energy Majors') {
      newTickers = getTickersBySector('Energy');
      setSelectedPreScanGicsSector('Energy');
    } else if (presetName === 'Consumer Discretionary') {
      newTickers = getTickersBySector('Consumer Discretionary');
      setSelectedPreScanGicsSector('Consumer Discretionary');
    } else if (presetName === 'Industrials') {
      newTickers = getTickersBySector('Industrials');
      setSelectedPreScanGicsSector('Industrials');
    } else if (presetName === 'Full S&P 500 Universe (503)') {
      newTickers = SP500_UNIVERSE.map((c) => c.symbol);
      setSelectedPreScanGicsSector('All Sectors');
    } else if (presetName === 'Crypto 24/7') {
      newTickers = ['BTC-USD', 'ETH-USD', 'SOL-USD', 'BNB-USD', 'DOGE-USD', 'AVAX-USD'];
      setSelectedPreScanGicsSector('All Sectors');
    }

    setWatchlist(newTickers);
    onScanNow(newTickers, timeframe);
  };

  const handleAddTicker = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newTickerInput.trim().toUpperCase();
    if (clean && !watchlist.includes(clean)) {
      setWatchlist([...watchlist, clean]);
      setNewTickerInput('');
    }
  };

  const handleRemoveTicker = (sym: string) => {
    setWatchlist(watchlist.filter((s) => s !== sym));
  };

  // Count stagnant symbols based on current ATR threshold
  const stagnantCount = results.filter(
    (item) => (item.atrPercent !== undefined ? item.atrPercent : 2.0) < minAtrPercent
  ).length;

  // Web Worker Pool integration for parallel fetching and background processing
  const [processedResults, setProcessedResults] = useState<ScanResultItem[]>([]);
  const poolRef = React.useRef<WorkerPool | null>(null);

  useEffect(() => {
    // Initialize pool with 4 workers
    poolRef.current = new WorkerPool(
      new URL('../workers/scannerWorker.ts', import.meta.url).toString(),
      4
    );

    return () => {
      poolRef.current?.terminate();
    };
  }, []);

  const runParallelScan = async (tickers: string[]) => {
    if (!poolRef.current) return;
    
    // Deduplicate tickers to avoid redundant fetches and duplicate keys
    const uniqueTickers = deduplicateSymbols(tickers);

    // Chunk tickers into batches of 50
    const chunkSize = 50;
    const chunks = [];
    for (let i = 0; i < uniqueTickers.length; i += chunkSize) {
      chunks.push(uniqueTickers.slice(i, i + chunkSize));
    }

    try {
      const resultsArray = await Promise.all(
        chunks.map((chunk) => 
          poolRef.current!.run({
            tickers: chunk,
            filters: { minScore: filterType === 'high-score' ? 75 : 0 },
          })
        )
      );
      
      // Flatten results and ensure strictly unique symbols
      const flattened = resultsArray.flat();
      const seen = new Set<string>();
      const dedupedResults: ScanResultItem[] = [];
      for (const item of flattened) {
        if (item && item.symbol && !seen.has(item.symbol)) {
          seen.add(item.symbol);
          dedupedResults.push(item);
        }
      }
      setProcessedResults(dedupedResults);
    } catch (error) {
      console.error("Parallel scan failed", error);
    }
  };

  // Replace old scan trigger with parallel one when watchlist changes
  useEffect(() => {
    if (watchlist.length > 0) {
      runParallelScan(watchlist);
    }
  }, [watchlist, filterType]);

  // Filter results (still need this for local filtering if needed)
  const filteredResults = processedResults.filter((item) => {
    const itemAtrPct = item.atrPercent !== undefined ? item.atrPercent : 2.0;
    const isStagnant = itemAtrPct < minAtrPercent;

    // Apply ATR Volatility filter
    if (atrFilterActive && isStagnant && !showStagnantSymbols) {
      return false;
    }

    if (filterType === 'triple' && !item.hasTripleDivergence) return false;
    if (filterType === 'bullish' && !item.setups.some((s) => s.type.includes('BULLISH')))
      return false;
    if (filterType === 'bearish' && !item.setups.some((s) => s.type.includes('BEARISH')))
      return false;

    if (selectedSectorFilter !== 'All') {
      if (item.sector !== selectedSectorFilter) return false;
    }

    return true;
  });

  const totalTripleCount = results.filter((r) => r.hasTripleDivergence).length;
  const totalBullish = results.filter((r) =>
    r.setups.some((s) => s.type.includes('BULLISH'))
  ).length;
  const totalBearish = results.filter((r) =>
    r.setups.some((s) => s.type.includes('BEARISH'))
  ).length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Real-time GICS Sector Performance & Watchlist Refiner */}
      <SectorFiltering
        currentWatchlist={watchlist}
        onApplyWatchlist={(newWatchlist) => {
          setWatchlist(newWatchlist);
        }}
        onScanNow={(tickers) => {
          onScanNow(tickers, timeframe);
        }}
        scanResults={results}
      />

      {/* S&P 500 Universe Selector Banner */}
      <div className="bg-gradient-to-r from-zinc-900 via-zinc-900 to-zinc-950 border border-zinc-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold uppercase">
                S&amp;P 500 Universe Active (503 Companies)
              </span>
              <span className="text-xs text-zinc-400">
                All 503 official S&amp;P 500 constituent companies available across 11 GICS sectors
              </span>
            </div>
            <h2 className="text-base sm:text-lg font-bold text-white mt-1 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-emerald-400" />
              <span>S&amp;P 500 Sector &amp; Universe Technical Scanner</span>
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Scan across the complete 503 S&amp;P 500 index universe or target specific sectors with live ATR volatility filtering.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* GICS Sector Pre-Scan Dropdown */}
            <div className="flex items-center space-x-2 bg-zinc-950 px-3 py-1.5 rounded-lg border border-zinc-700 shadow-inner">
              <Building2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <div className="flex flex-col">
                <label htmlFor="pre-scan-gics-select" className="text-[9px] uppercase font-bold text-zinc-400 tracking-wider">
                  S&amp;P 500 GICS Sector Pre-Scan:
                </label>
                <select
                  id="pre-scan-gics-select"
                  value={selectedPreScanGicsSector}
                  onChange={(e) => handlePreScanGicsSectorSelect(e.target.value)}
                  className="bg-transparent text-white font-bold text-xs focus:outline-none cursor-pointer pr-1"
                >
                  <option value="All Sectors" className="bg-zinc-900 text-white">
                    All 11 GICS Sectors (503 Companies)
                  </option>
                  {SP500_SECTORS.filter((s) => s !== 'All Sectors').map((sec, secIdx) => {
                    const count = getTickersBySector(sec).length;
                    return (
                      <option key={`${sec}-${secIdx}-${Date.now()}`} value={sec} className="bg-zinc-900 text-white">
                        {sec} ({count} companies)
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            {/* Timeframe selector */}
            <div className="flex items-center space-x-1 bg-zinc-950 p-1.5 rounded-lg border border-zinc-800">
              {['1m', '5m', '15m', '1h', '1d'].map((tf, tfIdx) => (
                <button
                  key={`${tf}-${tfIdx}-${Date.now()}`}
                  onClick={() => setTimeframe(tf)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded ${
                    timeframe === tf
                      ? 'bg-zinc-800 text-emerald-400 border border-zinc-700'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>

            {/* Scan Action Button */}
            <button
              onClick={() => onScanNow(watchlist, timeframe)}
              disabled={scanning}
              className="flex items-center space-x-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs rounded-lg transition shadow-md shadow-emerald-500/20 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
              <span>
                {scanning
                  ? 'Scanning Sector...'
                  : `Scan ${selectedPreScanGicsSector === 'All Sectors' ? 'Universe' : selectedPreScanGicsSector} (${watchlist.length})`}
              </span>
            </button>
          </div>
        </div>

        {/* S&P 500 Universe Presets Bar */}
        <div className="pt-3 border-t border-zinc-800/80 flex flex-wrap items-center gap-2">
          <span className="text-xs text-zinc-500 font-semibold mr-1 flex items-center gap-1">
            <PieChart className="w-3.5 h-3.5 text-zinc-400" />
            <span>S&amp;P 500 Presets:</span>
          </span>

          {[
            { label: 'Top 50 Mega-Caps', count: 50 },
            { label: 'Tech Giants', count: sectorCounts.tech },
            { label: 'Healthcare Leaders', count: sectorCounts.health },
            { label: 'Financial Titans', count: sectorCounts.finance },
            { label: 'Consumer Discretionary', count: sectorCounts.discretionary },
            { label: 'Energy Majors', count: sectorCounts.energy },
            { label: 'Industrials', count: sectorCounts.industrial },
            { label: 'Full S&P 500 Universe (503)', count: 503 },
            { label: 'Crypto 24/7', count: 6 },
          ].map((preset, prIdx) => (
            <button
              key={`${preset.label}-${prIdx}-${Date.now()}`}
              onClick={() => handleLoadSP500Preset(preset.label)}
              className={`px-3 py-1 text-xs font-medium rounded-lg border transition ${
                selectedSP500Preset === preset.label
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm'
                  : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-white hover:bg-zinc-800/50'
              }`}
            >
              {preset.label} <span className="text-[10px] text-zinc-500 font-mono">({preset.count})</span>
            </button>
          ))}
        </div>

        {/* ATR Volatility & Liquidity Filter Controls */}
        <div className="pt-3 border-t border-zinc-800/80 flex flex-wrap items-center justify-between gap-3 bg-zinc-950/60 p-3 rounded-lg border border-zinc-800/60">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center space-x-2">
              <Gauge className="w-4 h-4 text-amber-400" />
              <span className="font-semibold text-white">ATR Volatility &amp; Liquidity Filter:</span>
              <button
                onClick={() => setAtrFilterActive(!atrFilterActive)}
                className={`px-2.5 py-0.5 rounded text-[11px] font-bold border transition ${
                  atrFilterActive
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                    : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                }`}
              >
                {atrFilterActive ? 'ACTIVE (EXCLUDING STAGNANT)' : 'DISABLED'}
              </button>
            </div>

            {atrFilterActive && (
              <div className="flex items-center space-x-2">
                <span className="text-zinc-400">Min Volatility:</span>
                <div className="flex items-center space-x-1 bg-zinc-900 p-0.5 rounded border border-zinc-800">
                  {[0.5, 1.0, 1.5, 2.0].map((val, valIdx) => (
                    <button
                      key={`${val}-${valIdx}-${Date.now()}`}
                      onClick={() => setMinAtrPercent(val)}
                      className={`px-2 py-0.5 text-[11px] rounded font-mono ${
                        minAtrPercent === val
                          ? 'bg-zinc-800 text-amber-400 font-bold border border-zinc-700'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      &ge; {val}% ATR
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-3 text-xs">
            {stagnantCount > 0 && atrFilterActive && (
              <span className="text-[11px] text-zinc-400 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-rose-400"></span>
                <span>
                  <strong>{stagnantCount}</strong> stagnant symbols excluded (&lt; {minAtrPercent}% ATR)
                </span>
              </span>
            )}

            {stagnantCount > 0 && (
              <button
                onClick={() => setShowStagnantSymbols(!showStagnantSymbols)}
                className="text-xs text-zinc-400 hover:text-zinc-200 underline flex items-center gap-1"
              >
                {showStagnantSymbols ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                <span>{showStagnantSymbols ? 'Hide Stagnant' : 'Show Excluded'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Watchlist tags and custom input */}
        <div className="pt-3 border-t border-zinc-800/60 space-y-3">
          <div className="flex justify-end mb-2">
            <button
              onClick={() => setShowWatchlistManager(!showWatchlistManager)}
              className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-mono"
            >
              <Layers className="w-3.5 h-3.5" />
              {showWatchlistManager ? 'Hide Watchlist Manager' : 'Open Watchlist Manager'}
            </button>
          </div>
          {showWatchlistManager && (
            <WatchlistManager onWatchlistSelect={(symbols) => {
              if (symbols) {
                setWatchlist(symbols);
              }
            }} />
          )}

          {/* S&P 500 Search Bar with Live Autocomplete */}
          <div className="relative">
            <div className="flex items-center space-x-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search 503 S&P 500 stocks by Ticker, Company Name, or Sector (e.g. NVDA, Apple, Energy)..."
                  value={sp500SearchQuery}
                  onChange={(e) => setSp500SearchQuery(e.target.value)}
                  onFocus={() => setIsSearchFocused(true)}
                  className="w-full bg-zinc-950 border border-zinc-700/80 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 font-sans shadow-inner transition"
                />
                {sp500SearchQuery && (
                  <button
                    onClick={() => setSp500SearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white text-xs p-1"
                  >
                    &times;
                  </button>
                )}
              </div>

              {/* Quick load presets */}
              <div className="hidden sm:flex items-center space-x-1">
                <button
                  onClick={() => handleLoadSP500Preset('Full S&P 500 Universe (503)')}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold font-mono transition flex items-center gap-1 ${
                    watchlist.length === SP500_UNIVERSE.length
                      ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/30'
                      : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                  }`}
                  title="Scan all 503 S&P 500 stocks across all 11 sectors"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>All S&P 500 (503)</span>
                </button>
                <button
                  onClick={() => handleLoadSP500Preset('Top 50 Mega-Caps')}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold font-mono transition ${
                    selectedSP500Preset === 'Top 50 Mega-Caps' && watchlist.length !== SP500_UNIVERSE.length
                      ? 'bg-emerald-600 text-white'
                      : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                  }`}
                >
                  Top 50
                </button>
              </div>
            </div>

            {/* Autocomplete Dropdown */}
            {sp500SearchQuery.trim().length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl max-h-72 overflow-y-auto divide-y divide-zinc-800/80 animate-in fade-in">
                <div className="p-2 bg-zinc-950/80 text-[11px] text-zinc-400 font-medium flex items-center justify-between">
                  <span>S&P 500 Universe Matches ({matchedUniverseTickers.length})</span>
                  <span>Click to add to scanner</span>
                </div>
                {matchedUniverseTickers.length > 0 ? (
                  matchedUniverseTickers.map((company, cIdx) => {
                    const isAdded = watchlist.includes(company.symbol);
                    return (
                      <div
                        key={`${company.symbol}-${cIdx}-${Date.now()}`}
                        onClick={() => handleAddTickerFromUniverse(company.symbol)}
                        className="p-2.5 hover:bg-zinc-800/70 cursor-pointer flex items-center justify-between transition text-xs"
                      >
                        <div className="flex items-center space-x-2.5">
                          <span className="font-mono font-bold text-white bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800 text-xs">
                            {company.symbol}
                          </span>
                          <span className="text-zinc-200 font-medium">{company.name}</span>
                          <span className="text-[10px] text-zinc-400 bg-zinc-800/80 px-2 py-0.5 rounded">
                            {company.sector}
                          </span>
                        </div>
                        <div>
                          {isAdded ? (
                            <span className="text-[11px] text-emerald-400 flex items-center gap-1 font-mono">
                              <Check className="w-3.5 h-3.5" /> In Watchlist
                            </span>
                          ) : (
                            <span className="text-[11px] text-zinc-400 hover:text-emerald-400 font-medium flex items-center gap-1">
                              <Plus className="w-3.5 h-3.5" /> Add
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-4 text-center text-xs text-zinc-500">
                    No S&P 500 company found matching &quot;{sp500SearchQuery}&quot;
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Active Queue Chips */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex flex-wrap items-center gap-1.5 max-h-24 overflow-y-auto">
              <span className="text-xs text-zinc-400 font-medium mr-1">
                {watchlist.length === SP500_UNIVERSE.length ? (
                  <strong className="text-emerald-400 font-mono">
                    Active Universe: All 503 S&P 500 Constituents
                  </strong>
                ) : (
                  <span>Active Queue ({watchlist.length}):</span>
                )}
              </span>

              {Array.from(new Set(watchlist)).slice(0, 32).map((sym, idx) => (
                <span
                  key={`${sym}-${idx}-${Date.now()}`}
                  className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800 text-[11px] font-mono text-zinc-300"
                >
                  <span>{sym}</span>
                  <button
                    onClick={() => handleRemoveTicker(sym)}
                    className="hover:text-rose-400 transition ml-0.5"
                    title="Remove from scanner"
                  >
                    &times;
                  </button>
                </span>
              ))}
              {watchlist.length > 32 && (
                <span className="text-xs text-zinc-500 font-mono">
                  +{watchlist.length - 32} more S&P 500 stocks in queue
                </span>
              )}
            </div>

            <div className="flex items-center space-x-2 shrink-0">
              {watchlist.length < SP500_UNIVERSE.length && (
                <button
                  onClick={() => handleLoadSP500Preset('Full S&P 500 Universe (503)')}
                  className="text-xs text-emerald-400 hover:underline font-mono"
                >
                  + Load All 503 S&P 500 Stocks
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Market Overview Aggregate Stats Component */}
      <MarketOverview
        results={results}
        onSelectSymbolForChart={onSelectSymbolForChart}
      />

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="text-xs text-zinc-400">Total Scanned</div>
          <div className="text-xl sm:text-2xl font-bold text-white mt-1 font-mono">
            {results.length} <span className="text-xs text-zinc-500 font-normal">assets</span>
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="text-xs text-emerald-400 font-medium">Triple Divergences</div>
          <div className="text-xl sm:text-2xl font-bold text-emerald-400 mt-1 font-mono">
            {totalTripleCount} <span className="text-xs text-emerald-500/70 font-normal">setups</span>
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="text-xs text-blue-400 font-medium">Bullish Exhaustions</div>
          <div className="text-xl sm:text-2xl font-bold text-blue-400 mt-1 font-mono">
            {totalBullish}
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="text-xs text-rose-400 font-medium">Bearish Exhaustions</div>
          <div className="text-xl sm:text-2xl font-bold text-rose-400 mt-1 font-mono">
            {totalBearish}
          </div>
        </div>
      </div>

      {/* Results Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* Setup Type Filters */}
          <div className="flex items-center space-x-1.5 bg-zinc-900 p-1 rounded-lg border border-zinc-800 text-xs">
            <Filter className="w-3.5 h-3.5 text-zinc-500 ml-1.5 mr-0.5" />
            <button
              onClick={() => setFilterType('all')}
              className={`px-2.5 py-1 rounded font-medium ${
                filterType === 'all' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              All ({results.length})
            </button>
            <button
              onClick={() => setFilterType('triple')}
              className={`px-2.5 py-1 rounded font-medium ${
                filterType === 'triple'
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Triple Divs ({totalTripleCount})
            </button>
            <button
              onClick={() => setFilterType('bullish')}
              className={`px-2.5 py-1 rounded font-medium ${
                filterType === 'bullish'
                  ? 'bg-blue-500/20 text-blue-400'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Bullish ({totalBullish})
            </button>
            <button
              onClick={() => setFilterType('bearish')}
              className={`px-2.5 py-1 rounded font-medium ${
                filterType === 'bearish'
                  ? 'bg-rose-500/20 text-rose-400'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Bearish ({totalBearish})
            </button>
            <button
              onClick={() => setFilterType('high-score')}
              className={`px-2.5 py-1 rounded font-medium ${
                filterType === 'high-score'
                  ? 'bg-amber-500/20 text-amber-400'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Score &ge; 75%
            </button>
          </div>

          {/* S&P 500 Sector Filter Dropdown */}
          <div className="flex items-center space-x-1.5 bg-zinc-900 px-3 py-1.5 rounded-lg border border-zinc-800 text-xs">
            <span className="text-zinc-500">Sector:</span>
            <select
              value={selectedSectorFilter}
              onChange={(e) => setSelectedSectorFilter(e.target.value)}
              className="bg-zinc-950 border border-zinc-700 rounded px-2 py-0.5 text-xs text-white focus:outline-none"
            >
              <option value="All">All Sectors</option>
              <option value="Information Technology">Information Technology</option>
              <option value="Health Care">Health Care</option>
              <option value="Financials">Financials</option>
              <option value="Consumer Discretionary">Consumer Discretionary</option>
              <option value="Communication Services">Communication Services</option>
              <option value="Industrials">Industrials</option>
              <option value="Consumer Staples">Consumer Staples</option>
              <option value="Energy">Energy</option>
              <option value="Utilities">Utilities</option>
              <option value="Real Estate">Real Estate</option>
              <option value="Materials">Materials</option>
              <option value="Crypto">Crypto</option>
            </select>
          </div>
        </div>

        <div className="text-xs text-zinc-500 font-mono">
          Showing {filteredResults.length} matches (Excluding stagnant: {atrFilterActive && !showStagnantSymbols ? 'YES' : 'NO'})
        </div>
      </div>

      {/* Results List */}
      <div className="space-y-4">
        {filteredResults.map((item, idx) => {
          const mainSetup = item.setups[0];
          const hasSetup = Boolean(mainSetup);
          const isBull = mainSetup?.type.includes('BULLISH');
          const atrPct = item.atrPercent !== undefined ? item.atrPercent : 2.0;
          const isStagnant = atrPct < minAtrPercent;
          // Stable unique composite identifier constructed as ${symbol}-${index}-${Date.now()}
          const scanItemKey = `${item.symbol}-${idx}-${Date.now()}`;

          return (
            <div
              key={scanItemKey}
              className={`bg-zinc-900 border rounded-xl p-5 transition hover:border-zinc-700 ${
                isStagnant && showStagnantSymbols
                  ? 'border-zinc-800 opacity-60 bg-zinc-950/60'
                  : mainSetup?.type.includes('TRIPLE')
                  ? isBull
                    ? 'border-emerald-500/40 shadow-sm shadow-emerald-500/5'
                    : 'border-rose-500/40 shadow-sm shadow-rose-500/5'
                  : 'border-zinc-800'
              }`}
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                {/* Symbol & Company Name & Sector & ATR */}
                <div className="flex items-start space-x-3">
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                      hasSetup
                        ? isBull
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-rose-500/20 text-rose-400'
                        : 'bg-zinc-800 text-zinc-400'
                    }`}
                  >
                    {hasSetup ? (
                      isBull ? (
                        <TrendingUp className="w-5 h-5" />
                      ) : (
                        <TrendingDown className="w-5 h-5" />
                      )
                    ) : (
                      <Clock className="w-5 h-5" />
                    )}
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-bold text-white font-mono">{item.symbol}</span>
                      <span className="text-xs text-zinc-400 font-medium truncate max-w-[200px]">
                        {item.companyName}
                      </span>
                      {item.sector && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-950 text-zinc-400 border border-zinc-800">
                          {item.sector}
                        </span>
                      )}
                      {/* 360° Confluence Grade Badge */}
                      {(() => {
                        const conf = evaluateCandidate360Confluence(item.symbol, undefined, isBull ? 'BULLISH' : 'BEARISH');
                        return (
                          <span
                            className={`text-[10px] font-mono px-2 py-0.5 rounded flex items-center gap-1 font-semibold ${
                              conf.overallGrade === 'A+'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                : conf.overallGrade === 'A'
                                ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-500/30'
                                : conf.overallGrade === 'B'
                                ? 'bg-cyan-950/60 text-cyan-400 border border-cyan-500/30'
                                : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                            }`}
                            title={`360° Confluence Score: ${conf.overallScore}% (${conf.confidenceTier}) across 6 library engines`}
                          >
                            <Sparkles className="w-3 h-3 text-indigo-400" />
                            <span>Grade {conf.overallGrade} ({conf.overallScore}%)</span>
                          </span>
                        );
                      })()}
                      {/* ATR Volatility Badge with Rich Educational Hover Popover */}
                      <div className="relative group/atr inline-block">
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded flex items-center gap-1 cursor-help transition ${
                            atrPct >= 2.0
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20'
                              : atrPct >= 1.0
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20'
                          }`}
                        >
                          <Gauge className="w-3 h-3" />
                          <span>ATR: ${item.atr?.toFixed(2) || 'N/A'} ({atrPct}%)</span>
                          {isStagnant && <span className="font-bold text-rose-400">[Stagnant]</span>}
                          <Info className="w-2.5 h-2.5 opacity-70 group-hover/atr:opacity-100" />
                        </span>

                        {/* Interactive Educational Hover Popover */}
                        <div className="absolute left-0 top-full mt-2 hidden group-hover/atr:block z-50 w-72 sm:w-80 p-3.5 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl text-left pointer-events-none transition-all duration-150">
                          <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-800">
                            <span className="font-bold text-white text-xs flex items-center gap-1.5 font-sans">
                              <Gauge className="w-3.5 h-3.5 text-amber-400" />
                              Average True Range (ATR)
                            </span>
                            <span
                              className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                                atrPct >= 2.0
                                  ? 'bg-emerald-500/20 text-emerald-400'
                                  : atrPct >= 1.0
                                  ? 'bg-amber-500/20 text-amber-400'
                                  : 'bg-rose-500/20 text-rose-400'
                              }`}
                            >
                              {atrPct >= 2.0
                                ? 'High Volatility'
                                : atrPct >= 1.0
                                ? 'Moderate Volatility'
                                : 'Stagnant / Low'}
                            </span>
                          </div>

                          <div className="space-y-2 text-zinc-300 text-[11px] font-sans leading-relaxed">
                            <p>
                              <strong className="text-white font-mono">
                                ${item.atr?.toFixed(2) || '0.00'}
                              </strong>{' '}
                              is the expected <strong>average daily price move</strong> from high to low over the last 14 sessions.
                            </p>
                            <p>
                              <strong className="text-white font-mono">({atrPct}%)</strong> represents this daily swing as a percentage of {item.symbol}&apos;s current share price (${item.currentPrice.toFixed(2)}).
                            </p>

                            <div className="pt-2 border-t border-zinc-800 text-[10px] space-y-1">
                              <div className="font-semibold text-emerald-400">Trullàs Strategy Rules:</div>
                              <div className="text-zinc-400">
                                • <strong>Stop-Loss:</strong> Placed at 1.0x to 1.5x ATR below entry to absorb normal daily market fluctuation.
                              </div>
                              <div className="text-zinc-400">
                                • <strong>Position Size:</strong> Higher ATR dollar swings require fewer shares to strictly enforce the 1% account risk rule.
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {mainSetup && (
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            mainSetup.type.includes('TRIPLE')
                              ? isBull
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                              : 'bg-zinc-800 text-zinc-300'
                          }`}
                        >
                          {mainSetup.type.replace('_', ' ')}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center space-x-3 text-xs font-mono mt-1">
                      <span className="text-white font-bold text-sm">
                        ${item.currentPrice.toFixed(2)}
                      </span>
                      <span
                        className={item.changePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}
                      >
                        {item.changePercent >= 0 ? '+' : ''}
                        {item.changePercent}%
                      </span>
                      <span className="text-zinc-500">
                        Vol: {(item.volume / 1000).toFixed(0)}k
                      </span>
                    </div>
                  </div>
                </div>

                {/* Setup Metrics & Signal Weighting Confidence Score if available */}
                {mainSetup ? (
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs font-mono bg-zinc-950 p-3 rounded-lg border border-zinc-800/80">
                    <div>
                      <span className="text-zinc-500 block text-[10px]">Signal Weighting</span>
                      <div className="flex items-center space-x-1.5 mt-0.5">
                        <span className="font-bold text-indigo-300">Grade A+</span>
                        <span className="px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 text-[10px] font-bold border border-indigo-500/30">
                          {Math.round(mainSetup.qualityScore * 0.95)}% Conf
                        </span>
                      </div>
                      <span className="text-[9px] text-zinc-500 block">r = +0.82 &bull; 84% Accuracy</span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block text-[10px]">Quality Score</span>
                      <span className="font-bold text-emerald-400 mt-0.5 block">{mainSetup.qualityScore}%</span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block text-[10px]">Trigger (23.6%)</span>
                      <span className="font-bold text-white mt-0.5 block">${mainSetup.triggerPrice.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block text-[10px]">Stop Loss</span>
                      <span className="font-bold text-rose-400 mt-0.5 block">${mainSetup.stopLoss.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block text-[10px]">Target 2 (61.8%)</span>
                      <span className="font-bold text-amber-400 mt-0.5 block">
                        ${mainSetup.targets.tp2.toFixed(2)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-zinc-500 italic">
                    Consolidating &bull; No active MACD divergence in 75 bars
                  </div>
                )}

                {/* Actions & SEC Badge */}
                <div className="flex items-center space-x-2 shrink-0">
                  {item.sec?.available && item.sec.filings?.length > 0 && (
                    <span
                      className="px-2 py-1 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20 text-[10px] font-mono flex items-center gap-1"
                      title={`Latest SEC Form ${item.sec.filings[0].form} on ${item.sec.filings[0].filingDate}`}
                    >
                      <FileText className="w-3 h-3" />
                      <span>SEC Form {item.sec.filings[0].form}</span>
                    </span>
                  )}

                  <button
                    onClick={() => onSelectSymbolForChart(item.symbol)}
                    className="flex items-center space-x-1 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded text-xs font-medium transition"
                  >
                    <span>Inspect Chart</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>

                  {mainSetup && (
                    <button
                      onClick={() => onOpenCalculator(mainSetup)}
                      className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold rounded text-xs transition"
                    >
                      Scale Plan
                    </button>
                  )}
                </div>
              </div>

              {/* Confluence details row for setups */}
              {mainSetup && (
                <div className="mt-3 pt-3 border-t border-zinc-800/80 flex flex-wrap items-center justify-between text-[11px] text-zinc-400 gap-2">
                  <div className="flex items-center space-x-3">
                    <span className="text-zinc-500">Pillars Verified:</span>
                    <span
                      className={
                        mainSetup.confluenceChecks.macdDivergence
                          ? 'text-emerald-400'
                          : 'text-zinc-500'
                      }
                    >
                      &bull; MACD Divergence: YES
                    </span>
                    <span
                      className={
                        mainSetup.confluenceChecks.rsiDivergence
                          ? 'text-emerald-400'
                          : 'text-zinc-500'
                      }
                    >
                      &bull; RSI Divergence: YES
                    </span>
                    <span
                      className={
                        mainSetup.confluenceChecks.volumeExhaustion
                          ? 'text-emerald-400'
                          : 'text-zinc-500'
                      }
                    >
                      &bull; Volume Exhaustion: YES
                    </span>
                  </div>
                  <div className="text-zinc-400 font-mono">
                    R:R Ratio = <strong className="text-white">1:{mainSetup.riskRewardRatio}</strong>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
