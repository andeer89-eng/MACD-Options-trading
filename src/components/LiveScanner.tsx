import React, { useState, useRef, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
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
  Bot,
  SlidersHorizontal,
  BookOpen,
} from 'lucide-react';
import {
  SP500_UNIVERSE,
  SP500_SECTORS,
  SP500_TOP_50,
  getTickersBySector,
} from '../data/sp500Universe';
import { SectorFiltering } from './SectorFiltering';
import { MarketOverview } from './MarketOverview';
import { Candle, DivergenceSetup } from '../utils/trullasStrategy';
import { evaluateCandidate360Confluence } from '../utils/confluenceScoringEngine';
import { computeStageSummaryFromCandles } from '../utils/trendSpiderUniverse';
import { CandleData } from '../utils/trendSpiderEngine';
import { evaluateSignalWeighting } from '../utils/signalWeightingEngine';
import {
  evaluateTosScans,
  buildSetupFromTosScan,
  TOS_SCAN_DEFINITIONS,
  TosScanId,
  TosScanReport,
} from '../utils/tosScansEngine';
import {
  BOT_QUEUE_EVENT,
  enqueueBotCandidate,
  isAlpacaEquityEligibleSymbol,
  loadBotCandidateQueue,
  removeQueuedBotCandidate,
} from '../utils/botCandidateQueue';

function toStageCandles(raw?: Candle[]): CandleData[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c) => c && typeof c.close === 'number' && Number.isFinite(c.close) && c.close > 0)
    .map((c) => ({
      time: c.dateStr || new Date(c.timestamp).toISOString().split('T')[0],
      open: Number(c.open ?? c.close),
      high: Number(c.high ?? c.close),
      low: Number(c.low ?? c.close),
      close: Number(c.close),
      volume: Number(c.volume) || 0,
    }));
}

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
  tosScans?: TosScanReport;
  relPerfVsSpyPct?: number | null;
  return30dPct?: number | null;
  sec: any;
  candleCount: number;
  candles?: Candle[];
}

type ScanStrategyFilter =
  | 'ALL'
  | 'ANY_SIGNAL'
  | 'TRULLAS_DIV'
  | 'TTM_SQUEEZE'
  | 'FALSE_BREAKOUT'
  | 'STACKED_EMA'
  | 'UNUSUAL_VOLUME'
  | 'VSCORE_VWAP'
  | 'SMA50_REVERSION'
  | 'DMI_POWER_MOVE'
  | 'MACD_ZERO_CROSS'
  | 'VZO_FVG_ROC';

type ScanSortKey =
  | 'CONFLUENCE'
  | 'TOS_STRENGTH'
  | 'QUALITY_SCORE'
  | 'REL_PERF_SPY'
  | 'ATR_PCT'
  | 'REL_VOL'
  | 'CHANGE_PCT';

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
  const [scanStrategyFilter, setScanStrategyFilter] = useState<ScanStrategyFilter>('ALL');
  const [sortBy, setSortBy] = useState<ScanSortKey>('CONFLUENCE');
  const [showTosRulesCatalog, setShowTosRulesCatalog] = useState<boolean>(false);
  const [selectedSectorFilter, setSelectedSectorFilter] = useState<string>('All');
  const [selectedStageFilter, setSelectedStageFilter] = useState<
    'ALL' | 'STAGE_1' | 'STAGE_2' | 'STAGE_3' | 'STAGE_4'
  >('ALL');
  const [selectedSP500Preset, setSelectedSP500Preset] = useState<string>('Full S&P 500 Universe (503)');
  const [selectedPreScanGicsSector, setSelectedPreScanGicsSector] = useState<string>('All Sectors');
  const [newTickerInput, setNewTickerInput] = useState('');

  // S&P 500 Index Search Bar State
  const [sp500SearchQuery, setSp500SearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [showMarketOverview, setShowMarketOverview] = useState(false);
  const [queuedBotSymbols, setQueuedBotSymbols] = useState<string[]>(() =>
    loadBotCandidateQueue()
      .filter((q) => q.status === 'QUEUED')
      .map((q) => q.symbol.toUpperCase())
  );

  React.useEffect(() => {
    const syncQueue = () => {
      setQueuedBotSymbols(
        loadBotCandidateQueue()
          .filter((q) => q.status === 'QUEUED')
          .map((q) => q.symbol.toUpperCase())
      );
    };
    window.addEventListener(BOT_QUEUE_EVENT, syncQueue);
    window.addEventListener('storage', syncQueue);
    return () => {
      window.removeEventListener(BOT_QUEUE_EVENT, syncQueue);
      window.removeEventListener('storage', syncQueue);
    };
  }, []);

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

  const scannerScrollRef = useRef<HTMLDivElement>(null);

  const enrichedBySymbol = useMemo(() => {
    const map = new Map<
      string,
      {
        conf: ReturnType<typeof evaluateCandidate360Confluence>;
        stageSummary: ReturnType<typeof computeStageSummaryFromCandles>;
        weighting: ReturnType<typeof evaluateSignalWeighting> | null;
        tosScans: TosScanReport;
        tosPlanSetup: DivergenceSetup | null;
      }
    >();
    for (const item of results) {
      if (!item || !item.symbol || map.has(item.symbol)) continue;
      const mainSetup = item.setups[0];
      const tosScans = item.tosScans ?? evaluateTosScans(item.symbol, item.candles || []);
      const isBull = mainSetup
        ? mainSetup.type.includes('BULLISH')
        : tosScans.primarySignal?.direction !== 'BEARISH';
      const stageSummary = computeStageSummaryFromCandles(item.symbol, toStageCandles(item.candles));
      const conf = evaluateCandidate360Confluence(
        item.symbol,
        item.candles,
        isBull ? 'BULLISH' : 'BEARISH',
        {
          relPerfVsSpyPct: typeof item.relPerfVsSpyPct === 'number' ? item.relPerfVsSpyPct : null,
          relVolStDev: tosScans.snapshot?.relVolStDev ?? null,
          matchingSetup: mainSetup ?? null,
          tosSignals: tosScans.signals
            .filter((s): s is typeof s & { direction: 'BULLISH' | 'BEARISH' } =>
              s.direction === 'BULLISH' || s.direction === 'BEARISH'
            )
            .map((s) => ({
              id: s.id,
              label: s.shortLabel || s.name || s.id,
              direction: s.direction,
              strength: s.strength,
            })),
        }
      );
      const weighting =
        mainSetup && Array.isArray(item.candles) && item.candles.length >= 20
          ? evaluateSignalWeighting(mainSetup, item.candles)
          : null;
      const tosPlanSetup =
        !mainSetup && tosScans.primarySignal
          ? buildSetupFromTosScan(
              item.symbol,
              item.timeframe || timeframe,
              item.currentPrice,
              item.atr || 0,
              tosScans
            )
          : null;
      map.set(item.symbol, { conf, stageSummary, weighting, tosScans, tosPlanSetup });
    }
    return map;
  }, [results, timeframe]);

  const strategyCounts = useMemo(() => {
    const counts: Record<ScanStrategyFilter, number> = {
      ALL: 0,
      ANY_SIGNAL: 0,
      TRULLAS_DIV: 0,
      TTM_SQUEEZE: 0,
      FALSE_BREAKOUT: 0,
      STACKED_EMA: 0,
      UNUSUAL_VOLUME: 0,
      VSCORE_VWAP: 0,
      SMA50_REVERSION: 0,
      DMI_POWER_MOVE: 0,
      MACD_ZERO_CROSS: 0,
      VZO_FVG_ROC: 0,
    };
    const seen = new Set<string>();
    for (const item of results) {
      if (!item || !item.symbol || seen.has(item.symbol)) continue;
      seen.add(item.symbol);
      counts.ALL++;
      const tos = enrichedBySymbol.get(item.symbol)?.tosScans;
      const hasDiv = Array.isArray(item.setups) && item.setups.length > 0;
      const ids = tos?.matchedIds || [];
      if (hasDiv) counts.TRULLAS_DIV++;
      if (hasDiv || ids.length > 0) counts.ANY_SIGNAL++;
      if (ids.includes('TTM_SQUEEZE')) counts.TTM_SQUEEZE++;
      if (ids.includes('FALSE_BREAKOUT')) counts.FALSE_BREAKOUT++;
      if (ids.includes('STACKED_EMA')) counts.STACKED_EMA++;
      if (ids.includes('UNUSUAL_VOLUME')) counts.UNUSUAL_VOLUME++;
      if (ids.includes('VSCORE_VWAP')) counts.VSCORE_VWAP++;
      if (ids.includes('SMA50_REVERSION')) counts.SMA50_REVERSION++;
      if (ids.includes('DMI_POWER_MOVE')) counts.DMI_POWER_MOVE++;
      if (ids.includes('MACD_ZERO_CROSS')) counts.MACD_ZERO_CROSS++;
      if (ids.includes('VZO_SIGNAL') || ids.includes('FVG_RETEST') || ids.includes('ROC_EXTREME')) {
        counts.VZO_FVG_ROC++;
      }
    }
    return counts;
  }, [results, enrichedBySymbol]);

  // Filter & sort live results directly without triggering duplicate backend scans
  const filteredResults = useMemo(() => {
    const seen = new Set<string>();
    const deduped: ScanResultItem[] = [];
    for (const item of results) {
      if (item && item.symbol && !seen.has(item.symbol)) {
        seen.add(item.symbol);
        deduped.push(item);
      }
    }

    const filtered = deduped.filter((item) => {
      const itemAtrPct = item.atrPercent !== undefined ? item.atrPercent : 0;
      const isStagnant = itemAtrPct < minAtrPercent;

      if (atrFilterActive && isStagnant && !showStagnantSymbols) {
        return false;
      }

      const enriched = enrichedBySymbol.get(item.symbol);
      const tos = enriched?.tosScans;
      const matchedIds = tos?.matchedIds || [];

      if (scanStrategyFilter !== 'ALL') {
        if (scanStrategyFilter === 'ANY_SIGNAL') {
          if (item.setups.length === 0 && matchedIds.length === 0) return false;
        } else if (scanStrategyFilter === 'TRULLAS_DIV') {
          if (item.setups.length === 0) return false;
        } else if (scanStrategyFilter === 'VZO_FVG_ROC') {
          if (
            !matchedIds.includes('VZO_SIGNAL') &&
            !matchedIds.includes('FVG_RETEST') &&
            !matchedIds.includes('ROC_EXTREME')
          ) {
            return false;
          }
        } else if (!matchedIds.includes(scanStrategyFilter as TosScanId)) {
          return false;
        }
      }

      const hasBull =
        item.setups.some((s) => s.type.includes('BULLISH')) || (tos?.bullishCount ?? 0) > 0;
      const hasBear =
        item.setups.some((s) => s.type.includes('BEARISH')) || (tos?.bearishCount ?? 0) > 0;
      const hasHighScore =
        item.setups.some((s) => s.qualityScore >= 75) || (tos?.compositeStrength ?? 0) >= 75;

      if (filterType === 'triple' && !item.hasTripleDivergence) return false;
      if (filterType === 'bullish' && !hasBull) return false;
      if (filterType === 'bearish' && !hasBear) return false;
      if (filterType === 'high-score' && !hasHighScore) return false;

      if (selectedSectorFilter !== 'All' && item.sector !== selectedSectorFilter) {
        return false;
      }

      if (selectedStageFilter !== 'ALL') {
        const stageSummary = enriched?.stageSummary;
        const stageMap: Record<string, string> = {
          STAGE_1: 'STAGE_1_BASING',
          STAGE_2: 'STAGE_2_ADVANCING',
          STAGE_3: 'STAGE_3_TOPPING',
          STAGE_4: 'STAGE_4_DECLINING',
        };
        if (!stageSummary || stageSummary.stage.currentStage !== stageMap[selectedStageFilter]) {
          return false;
        }
      }

      return true;
    });

    return filtered.sort((a, b) => {
      const ea = enrichedBySymbol.get(a.symbol);
      const eb = enrichedBySymbol.get(b.symbol);
      if (sortBy === 'TOS_STRENGTH') {
        return (eb?.tosScans.compositeStrength ?? 0) - (ea?.tosScans.compositeStrength ?? 0);
      }
      if (sortBy === 'QUALITY_SCORE') {
        const qa = Math.max(a.setups[0]?.qualityScore ?? 0, ea?.tosScans.compositeStrength ?? 0);
        const qb = Math.max(b.setups[0]?.qualityScore ?? 0, eb?.tosScans.compositeStrength ?? 0);
        return qb - qa;
      }
      if (sortBy === 'REL_PERF_SPY') {
        return (b.relPerfVsSpyPct ?? -999) - (a.relPerfVsSpyPct ?? -999);
      }
      if (sortBy === 'ATR_PCT') {
        return (b.atrPercent ?? 0) - (a.atrPercent ?? 0);
      }
      if (sortBy === 'REL_VOL') {
        return (eb?.tosScans.snapshot.relVolStDev ?? 0) - (ea?.tosScans.snapshot.relVolStDev ?? 0);
      }
      if (sortBy === 'CHANGE_PCT') {
        return Math.abs(b.changePercent ?? 0) - Math.abs(a.changePercent ?? 0);
      }
      // CONFLUENCE: total active signals (Divergences + TOS scans) weighted by strength
      const countA = (a.setups.length > 0 ? 2 : 0) + (ea?.tosScans.signals.length ?? 0);
      const countB = (b.setups.length > 0 ? 2 : 0) + (eb?.tosScans.signals.length ?? 0);
      if (countB !== countA) return countB - countA;
      const scoreA = Math.max(a.setups[0]?.qualityScore ?? 0, ea?.tosScans.compositeStrength ?? 0);
      const scoreB = Math.max(b.setups[0]?.qualityScore ?? 0, eb?.tosScans.compositeStrength ?? 0);
      return scoreB - scoreA;
    });
  }, [
    results,
    enrichedBySymbol,
    minAtrPercent,
    atrFilterActive,
    showStagnantSymbols,
    scanStrategyFilter,
    sortBy,
    filterType,
    selectedSectorFilter,
    selectedStageFilter,
  ]);

  const scannerVirtualizer = useVirtualizer({
    count: filteredResults.length,
    getScrollElement: () => scannerScrollRef.current,
    estimateSize: () => 204,
    overscan: 6,
  });

  const totalTripleCount = results.filter((r) => r.hasTripleDivergence).length;
  const totalAnySignalCount = strategyCounts.ANY_SIGNAL;
  const totalBullish = results.filter((r) => {
    const tos = enrichedBySymbol.get(r.symbol)?.tosScans;
    return r.setups.some((s) => s.type.includes('BULLISH')) || (tos?.bullishCount ?? 0) > 0;
  }).length;
  const totalBearish = results.filter((r) => {
    const tos = enrichedBySymbol.get(r.symbol)?.tosScans;
    return r.setups.some((s) => s.type.includes('BEARISH')) || (tos?.bearishCount ?? 0) > 0;
  }).length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Real-time GICS Sector Performance & Watchlist Refiner (collapsed by default to prioritize setups) */}
      <SectorFiltering
        currentWatchlist={watchlist}
        onApplyWatchlist={(newWatchlist) => {
          setWatchlist(newWatchlist);
        }}
        onScanNow={(tickers) => {
          onScanNow(tickers, timeframe);
        }}
        scanResults={results}
        initialExpanded={false}
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
                  {SP500_SECTORS.filter((s) => s !== 'All Sectors').map((sec) => {
                    const count = getTickersBySector(sec).length;
                    return (
                      <option key={sec} value={sec} className="bg-zinc-900 text-white">
                        {sec} ({count} companies)
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            {/* Timeframe selector */}
            <div className="flex items-center space-x-1 bg-zinc-950 p-1.5 rounded-lg border border-zinc-800">
              {['1m', '5m', '15m', '1h', '1d'].map((tf) => (
                <button
                  key={tf}
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
          ].map((preset) => (
            <button
              key={preset.label}
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
                  {[0.5, 1.0, 1.5, 2.0].map((val) => (
                    <button
                      key={String(val)}
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

        {/* Watchlist search and custom queue */}
        <div className="pt-3 border-t border-zinc-800/60 space-y-3">
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
                        key={company.symbol}
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

              {Array.from(new Set(watchlist)).slice(0, 32).map((sym) => (
                <span
                  key={sym}
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

      {/* Collapsible Market Overview Aggregate Stats */}
      <div className="space-y-3">
        <div className="flex items-center justify-between bg-zinc-900/70 border border-zinc-800 rounded-xl px-4 py-2.5">
          <div className="flex items-center gap-2 text-xs text-zinc-300">
            <PieChart className="w-4 h-4 text-emerald-400" />
            <span className="font-semibold">Basket Snapshot &amp; Momentum Leaders</span>
            <span className="text-zinc-500 hidden sm:inline">({results.length} symbols scanned)</span>
          </div>
          <button
            type="button"
            onClick={() => setShowMarketOverview((prev) => !prev)}
            className="text-xs font-medium text-emerald-400 hover:text-emerald-300 px-2.5 py-1 rounded-lg bg-zinc-950 border border-zinc-800 transition"
          >
            {showMarketOverview ? 'Hide Snapshot' : 'Expand Snapshot'}
          </button>
        </div>
        {showMarketOverview && (
          <MarketOverview
            results={results}
            onSelectSymbolForChart={onSelectSymbolForChart}
          />
        )}
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="text-xs text-zinc-400">Total Scanned</div>
          <div className="text-xl sm:text-2xl font-bold text-white mt-1 font-mono tabular-nums">
            {results.length} <span className="text-xs text-zinc-500 font-normal">assets</span>
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="text-xs text-emerald-400 font-medium">Multi-Scan Active Setups</div>
          <div className="text-xl sm:text-2xl font-bold text-emerald-400 mt-1 font-mono tabular-nums">
            {totalAnySignalCount}{' '}
            <span className="text-xs text-emerald-500/70 font-normal">
              ({totalTripleCount} triple divs)
            </span>
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="text-xs text-blue-400 font-medium">Bullish Signals</div>
          <div className="text-xl sm:text-2xl font-bold text-blue-400 mt-1 font-mono tabular-nums">
            {totalBullish}
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="text-xs text-rose-400 font-medium">Bearish Signals</div>
          <div className="text-xl sm:text-2xl font-bold text-rose-400 mt-1 font-mono tabular-nums">
            {totalBearish}
          </div>
        </div>
      </div>

      {/* Multi-Strategy TOS Indicators Scan Selector */}
      <div
        data-testid="tos-scan-strategy-bar"
        className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs">
            <SlidersHorizontal className="w-4 h-4 text-emerald-400" />
            <span className="font-semibold text-white">Scan Strategy Modes</span>
            <span className="text-zinc-500 hidden sm:inline">
              &middot; Trullàs Divergences + 11 TOS Indicators Stock Hacker Setups
            </span>
          </div>

          <button
            type="button"
            onClick={() => setShowTosRulesCatalog((prev) => !prev)}
            className="text-xs font-medium text-zinc-300 hover:text-white px-2.5 py-1 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center gap-1.5 transition whitespace-nowrap shrink-0"
          >
            <BookOpen className="w-3.5 h-3.5 text-emerald-400" />
            <span>{showTosRulesCatalog ? 'Hide Scan Specs' : 'TOS Scan Rules (11)'}</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'ALL', label: 'All Scanned' },
              { id: 'ANY_SIGNAL', label: 'Any Active Setup' },
              { id: 'TRULLAS_DIV', label: 'Trullàs Div' },
              { id: 'TTM_SQUEEZE', label: 'TTM Squeeze' },
              { id: 'FALSE_BREAKOUT', label: 'False Breakout' },
              { id: 'STACKED_EMA', label: 'Stacked EMAs' },
              { id: 'UNUSUAL_VOLUME', label: 'Unusual Vol' },
              { id: 'VSCORE_VWAP', label: 'V-Score VWAP' },
              { id: 'SMA50_REVERSION', label: '50-SMA Revert' },
              { id: 'DMI_POWER_MOVE', label: 'DMI Power' },
              { id: 'MACD_ZERO_CROSS', label: 'MACD Zero Cross' },
              { id: 'VZO_FVG_ROC', label: 'VZO · FVG · ROC' },
            ] as { id: ScanStrategyFilter; label: string }[]
          ).map((mode) => {
            const active = scanStrategyFilter === mode.id;
            const cnt = strategyCounts[mode.id];
            return (
              <button
                key={mode.id}
                type="button"
                data-testid={`scan-mode-${mode.id}`}
                onClick={() => setScanStrategyFilter(mode.id)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                  active
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-white hover:bg-zinc-800/60'
                }`}
              >
                <span>{mode.label}</span>
                <span className="font-mono tabular-nums text-[11px] opacity-80">({cnt})</span>
              </button>
            );
          })}
        </div>

        {/* Active scan rule summary */}
        {(() => {
          const activeDef = TOS_SCAN_DEFINITIONS.find((d) => d.id === scanStrategyFilter);
          if (activeDef) {
            return (
              <div className="text-xs text-zinc-300 bg-zinc-950/80 border border-zinc-800/80 rounded-lg px-3 py-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-semibold text-emerald-400">{activeDef.name}:</span>{' '}
                  <span className="text-zinc-400">{activeDef.ruleSummary}</span>
                </div>
                <span className="font-mono text-[11px] text-zinc-500 shrink-0">
                  Min bars: {activeDef.minBars}
                </span>
              </div>
            );
          }
          if (scanStrategyFilter === 'VZO_FVG_ROC') {
            return (
              <div className="text-xs text-zinc-400 bg-zinc-950/80 border border-zinc-800/80 rounded-lg px-3 py-2">
                <span className="font-semibold text-emerald-400">Structural &amp; Flow Suite:</span>{' '}
                Combines Volume Zone Oscillator (±15/±40 with ADX &gt; 18 &amp; 60-EMA), open 3-candle Fair Value Gap retests, and Rate of Change range-extreme reversal hooks.
              </div>
            );
          }
          return null;
        })()}

        {showTosRulesCatalog && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-2 border-t border-zinc-800/80">
            {TOS_SCAN_DEFINITIONS.map((def) => (
              <button
                key={def.id}
                type="button"
                onClick={() => {
                  const mapped: ScanStrategyFilter =
                    def.id === 'VZO_SIGNAL' || def.id === 'FVG_RETEST' || def.id === 'ROC_EXTREME'
                      ? 'VZO_FVG_ROC'
                      : def.id;
                  setScanStrategyFilter(mapped);
                  setShowTosRulesCatalog(false);
                }}
                className="text-left p-3 rounded-lg bg-zinc-950 border border-zinc-800 hover:border-emerald-500/40 transition space-y-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-white">{def.name}</span>
                  <span className="text-[11px] font-mono tabular-nums text-emerald-400">
                    {strategyCounts[
                      def.id === 'VZO_SIGNAL' || def.id === 'FVG_RETEST' || def.id === 'ROC_EXTREME'
                        ? 'VZO_FVG_ROC'
                        : (def.id as ScanStrategyFilter)
                    ] ?? 0}{' '}
                    hits
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">{def.ruleSummary}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Results Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="flex flex-wrap items-center gap-2">
          {/* Setup Direction & Quality Filters */}
          <div className="flex items-center space-x-1.5 bg-zinc-900 p-1 rounded-lg border border-zinc-800 text-xs">
            <Filter className="w-3.5 h-3.5 text-zinc-500 ml-1.5 mr-0.5" />
            <button
              onClick={() => setFilterType('all')}
              className={`px-2.5 py-1 rounded font-medium whitespace-nowrap ${
                filterType === 'all' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              All ({results.length})
            </button>
            <button
              onClick={() => setFilterType('triple')}
              className={`px-2.5 py-1 rounded font-medium whitespace-nowrap ${
                filterType === 'triple'
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Triple Divs ({totalTripleCount})
            </button>
            <button
              onClick={() => setFilterType('bullish')}
              className={`px-2.5 py-1 rounded font-medium whitespace-nowrap ${
                filterType === 'bullish'
                  ? 'bg-blue-500/20 text-blue-400'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Bullish ({totalBullish})
            </button>
            <button
              onClick={() => setFilterType('bearish')}
              className={`px-2.5 py-1 rounded font-medium whitespace-nowrap ${
                filterType === 'bearish'
                  ? 'bg-rose-500/20 text-rose-400'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Bearish ({totalBearish})
            </button>
            <button
              onClick={() => setFilterType('high-score')}
              className={`px-2.5 py-1 rounded font-medium whitespace-nowrap ${
                filterType === 'high-score'
                  ? 'bg-amber-500/20 text-amber-400'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Score &ge; 75%
            </button>
          </div>

          {/* Sort selector */}
          <div className="flex items-center space-x-1.5 bg-zinc-900 px-3 py-1.5 rounded-lg border border-zinc-800 text-xs">
            <span className="text-zinc-500">Sort:</span>
            <select
              aria-label="Sort scanner results"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as ScanSortKey)}
              className="bg-zinc-950 border border-zinc-700 rounded px-2 py-0.5 text-xs text-white focus:outline-none"
            >
              <option value="CONFLUENCE">Multi-Signal Confluence</option>
              <option value="TOS_STRENGTH">TOS Scan Strength</option>
              <option value="REL_PERF_SPY">30D Alpha vs SPY</option>
              <option value="QUALITY_SCORE">Quality Score</option>
              <option value="REL_VOL">Relative Volume (σ)</option>
              <option value="ATR_PCT">ATR Volatility %</option>
              <option value="CHANGE_PCT">% Daily Move</option>
            </select>
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

          {/* TrendSpider Stan Weinstein Stage Filter */}
          <div className="flex items-center space-x-1 bg-zinc-900 p-1 rounded-lg border border-zinc-800 text-xs">
            <span className="text-zinc-500 text-[11px] px-1 font-mono">Stage:</span>
            <button
              onClick={() => setSelectedStageFilter('ALL')}
              className={`px-2 py-0.5 rounded font-medium text-xs ${
                selectedStageFilter === 'ALL' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setSelectedStageFilter('STAGE_2')}
              className={`px-2 py-0.5 rounded font-medium text-xs ${
                selectedStageFilter === 'STAGE_2' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'text-zinc-400 hover:text-white'
              }`}
              title="Stan Weinstein Stage 2: Markup Bull Trend (Price > rising 30w SMA)"
            >
              Stage 2 🚀
            </button>
            <button
              onClick={() => setSelectedStageFilter('STAGE_4')}
              className={`px-2 py-0.5 rounded font-medium text-xs ${
                selectedStageFilter === 'STAGE_4' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'text-zinc-400 hover:text-white'
              }`}
              title="Stan Weinstein Stage 4: Capitulation / Markdown (Price < falling 30w SMA)"
            >
              Stage 4 🩸
            </button>
            <button
              onClick={() => setSelectedStageFilter('STAGE_1')}
              className={`px-2 py-0.5 rounded font-medium text-xs ${
                selectedStageFilter === 'STAGE_1' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'text-zinc-400 hover:text-white'
              }`}
              title="Stage 1: Basing & Accumulation"
            >
              Stage 1
            </button>
            <button
              onClick={() => setSelectedStageFilter('STAGE_3')}
              className={`px-2 py-0.5 rounded font-medium text-xs ${
                selectedStageFilter === 'STAGE_3' ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30' : 'text-zinc-400 hover:text-white'
              }`}
              title="Stage 3: Topping & Distribution"
            >
              Stage 3 ⚠️
            </button>
          </div>
        </div>

        <div className="text-xs text-zinc-500 font-mono tabular-nums">
          Showing {filteredResults.length} matches (Excluding stagnant: {atrFilterActive && !showStagnantSymbols ? 'YES' : 'NO'})
        </div>
      </div>

      {/* Results List */}
      <div className="space-y-4">
        {filteredResults.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center text-xs font-mono text-zinc-400">
            {scanning
              ? 'Scanning live Yahoo Finance feeds across active universe...'
              : 'No live setups matched current filters. Click Scan or broaden filters above.'}
          </div>
        ) : (
          <div
            ref={scannerScrollRef}
            data-testid="scanner-virtual-list"
            className="max-h-[760px] overflow-y-auto pr-1"
          >
            <div
              style={{
                height: `${scannerVirtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {scannerVirtualizer.getVirtualItems().map((virtualRow) => {
                const item = filteredResults[virtualRow.index];
                if (!item) return null;
                const mainSetup = item.setups[0];
                const enriched = enrichedBySymbol.get(item.symbol);
                const conf = enriched?.conf;
                const stageSummary = enriched?.stageSummary;
                const weighting = enriched?.weighting ?? null;
                const tosScans = enriched?.tosScans;
                const tosPlanSetup = enriched?.tosPlanSetup ?? null;
                const activePlanSetup = mainSetup ?? tosPlanSetup;

                const hasAnySignal = Boolean(mainSetup) || (tosScans?.signals.length ?? 0) > 0;
                const isBull = mainSetup
                  ? mainSetup.type.includes('BULLISH')
                  : tosScans?.primarySignal?.direction !== 'BEARISH';

                const atrPct = item.atrPercent !== undefined ? item.atrPercent : 0;
                const isStagnant = atrPct < minAtrPercent;
                const scanItemKey = `${item.symbol}-${item.timeframe || timeframe}`;

                return (
                  <div
                    key={scanItemKey}
                    data-index={virtualRow.index}
                    ref={scannerVirtualizer.measureElement}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualRow.start}px)`,
                      paddingBottom: '16px',
                    }}
                  >
                    <div
                      className={`bg-zinc-900 border rounded-xl p-5 transition hover:border-zinc-700 ${
                isStagnant && showStagnantSymbols
                  ? 'border-zinc-800 opacity-60 bg-zinc-950/60'
                  : mainSetup?.type.includes('TRIPLE')
                  ? isBull
                    ? 'border-emerald-500/40 shadow-sm shadow-emerald-500/5'
                    : 'border-rose-500/40 shadow-sm shadow-rose-500/5'
                  : (tosScans?.compositeStrength ?? 0) >= 82
                  ? isBull
                    ? 'border-emerald-500/30'
                    : 'border-rose-500/30'
                  : 'border-zinc-800'
              }`}
            >
              <div className="space-y-3">
                {/* Row 1: Symbol + Structural Badges (left) & Action Controls (right) */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="flex items-start space-x-3 min-w-0 flex-1">
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                        hasAnySignal
                          ? isBull
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-rose-500/20 text-rose-400'
                          : 'bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      {hasAnySignal ? (
                        isBull ? (
                          <TrendingUp className="w-5 h-5" />
                        ) : (
                          <TrendingDown className="w-5 h-5" />
                        )
                      ) : (
                        <Clock className="w-5 h-5" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-bold text-white font-mono">{item.symbol}</span>
                        <span className="text-xs text-zinc-400 font-medium truncate max-w-[220px]">
                          {item.companyName}
                        </span>
                        {item.sector && (
                          <span className="text-[11px] font-mono text-zinc-400 whitespace-nowrap">
                            &middot; {item.sector}
                          </span>
                        )}
                        {/* 360° Confluence Grade Badge */}
                        {conf && (
                          <span
                            className={`text-[10px] font-mono px-2 py-0.5 rounded flex items-center gap-1 font-semibold whitespace-nowrap ${
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
                        )}
                        {/* TrendSpider Stan Weinstein Stage Badge */}
                        {stageSummary && (() => {
                          const st = stageSummary.stage;
                          return (
                            <span
                              className={`text-[10px] font-mono px-2 py-0.5 rounded flex items-center gap-1 font-semibold border whitespace-nowrap ${st.stageBadgeBg} ${st.stageBadgeColor} ${st.stageBadgeBorder}`}
                              title={`TrendSpider Weinstein Stage Analysis: ${st.stageName} • 30-Period SMA: $${st.ma30Week.toFixed(2)} (${st.distanceFromMaPercent}%)`}
                            >
                              <span>{st.stageNumber === 4 ? 'Stage 4 🩸' : st.stageNumber === 2 ? 'Stage 2 🚀' : st.stageNumber === 3 ? 'Stage 3 ⚠️' : 'Stage 1'}</span>
                              <span className="text-[9px] opacity-80">({st.distanceFromMaPercent >= 0 ? '+' : ''}{st.distanceFromMaPercent}%)</span>
                            </span>
                          );
                        })()}
                        {/* ATR Volatility Badge with Rich Educational Hover Popover */}
                        <div className="relative group/atr inline-block">
                          <span
                            className={`text-[10px] font-mono px-2 py-0.5 rounded flex items-center gap-1 cursor-help transition whitespace-nowrap ${
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
                                  &bull; <strong>Stop-Loss:</strong> Placed at 1.0x to 1.5x ATR below entry to absorb normal daily market fluctuation.
                                </div>
                                <div className="text-zinc-400">
                                  &bull; <strong>Position Size:</strong> Higher ATR dollar swings require fewer shares to strictly enforce the 1% account risk rule.
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {mainSetup && (
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded border whitespace-nowrap ${
                              mainSetup.type.includes('TRIPLE')
                                ? isBull
                                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                  : 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                                : 'bg-zinc-800 text-zinc-300 border-zinc-700'
                            }`}
                          >
                            {mainSetup.type.replace('_', ' ')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions & SEC Badge */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {item.sec?.available && item.sec.filings?.length > 0 && (
                      <span
                        className="px-2 py-1 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20 text-[10px] font-mono flex items-center gap-1 whitespace-nowrap"
                        title={`Latest SEC Form ${item.sec.filings[0].form} on ${item.sec.filings[0].filingDate}`}
                      >
                        <FileText className="w-3 h-3" />
                        <span>SEC Form {item.sec.filings[0].form}</span>
                      </span>
                    )}

                    <button
                      onClick={() => onSelectSymbolForChart(item.symbol)}
                      className="flex items-center space-x-1 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded text-xs font-medium transition whitespace-nowrap"
                    >
                      <span>Inspect Chart</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>

                    {activePlanSetup && (
                      <button
                        onClick={() => onOpenCalculator(activePlanSetup)}
                        className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold rounded text-xs transition whitespace-nowrap"
                      >
                        Scale Plan
                      </button>
                    )}

                    {isAlpacaEquityEligibleSymbol(item.symbol) && (
                      <button
                        type="button"
                        data-testid={`queue-bot-${item.symbol}`}
                        onClick={() => {
                          const symUpper = item.symbol.toUpperCase();
                          if (queuedBotSymbols.includes(symUpper)) {
                            removeQueuedBotCandidate(symUpper);
                            return;
                          }
                          const isBear = mainSetup
                            ? mainSetup.type.includes('BEARISH')
                            : tosScans?.primarySignal?.direction === 'BEARISH';
                          enqueueBotCandidate({
                            symbol: symUpper,
                            direction: isBear ? 'BEARISH' : 'BULLISH',
                            source: 'SCANNER',
                            setupType:
                              mainSetup?.type || tosScans?.primarySignal?.id || 'SCANNER_SIGNAL',
                            qualityScore:
                              mainSetup?.qualityScore ?? tosScans?.compositeStrength ?? 75,
                            currentPrice: item.currentPrice,
                            atr: item.atr,
                            sector: item.sector,
                            hrN: weighting?.excursionQuantiles?.analogCount,
                          });
                        }}
                        className={`flex items-center space-x-1 px-2.5 py-1.5 rounded text-xs font-semibold border transition whitespace-nowrap ${
                          queuedBotSymbols.includes(item.symbol.toUpperCase())
                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/25'
                            : 'bg-zinc-950 hover:bg-zinc-800 text-zinc-300 border-zinc-700 hover:border-emerald-500/40'
                        }`}
                        title={
                          queuedBotSymbols.includes(item.symbol.toUpperCase())
                            ? `${item.symbol} queued for Auto-Bot (click to remove)`
                            : `Queue ${item.symbol} for Auto-Bot (evaluated through canTrade() + Market Health)`
                        }
                      >
                        {queuedBotSymbols.includes(item.symbol.toUpperCase()) ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Bot className="w-3.5 h-3.5 text-emerald-400" />
                        )}
                        <span>{queuedBotSymbols.includes(item.symbol.toUpperCase()) ? 'Queued' : 'Queue Bot'}</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Row 2: Price Telemetry + TOS Signal Tags (left) & 5-Col Setup Metrics (right) */}
                <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-2 pl-0 lg:pl-[52px]">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-mono tabular-nums">
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
                      {tosScans && tosScans.snapshot.relVolStDev >= 1.2 && (
                        <span className="text-cyan-400">
                          RelVol: {tosScans.snapshot.relVolStDev.toFixed(1)}&sigma;
                        </span>
                      )}
                      {tosScans && tosScans.snapshot.emaStack !== 'MIXED' && (
                        <span
                          className={
                            tosScans.snapshot.emaStack === 'BULLISH'
                              ? 'text-emerald-400'
                              : 'text-rose-400'
                          }
                        >
                          EMA 8–89: {tosScans.snapshot.emaStack}
                        </span>
                      )}
                      {typeof item.relPerfVsSpyPct === 'number' && Number.isFinite(item.relPerfVsSpyPct) && (
                        <span
                          title={`30-bar stock return (${typeof item.return30dPct === 'number' ? `${item.return30dPct >= 0 ? '+' : ''}${item.return30dPct}%` : '—'}) minus SPY 30-bar return`}
                          className={
                            item.relPerfVsSpyPct >= 0 ? 'text-emerald-300' : 'text-amber-300'
                          }
                        >
                          vs SPY (30D): {item.relPerfVsSpyPct >= 0 ? '+' : ''}
                          {item.relPerfVsSpyPct.toFixed(1)}%
                        </span>
                      )}
                    </div>

                    {/* Matched TOS Scan Signals Row */}
                    {tosScans && tosScans.signals.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {tosScans.signals.slice(0, 4).map((sig) => (
                          <span
                            key={sig.id}
                            title={`${sig.name}: ${sig.headline} (${sig.metricsSummary})`}
                            className={`text-[10px] font-mono px-2 py-0.5 rounded border whitespace-nowrap ${
                              sig.direction === 'BULLISH'
                                ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                                : sig.direction === 'BEARISH'
                                ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                                : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                            }`}
                          >
                            {sig.direction === 'BULLISH' ? '▲ ' : sig.direction === 'BEARISH' ? '▼ ' : '◆ '}
                            {sig.shortLabel}
                          </span>
                        ))}
                        {tosScans.signals.length > 4 && (
                          <span className="text-[10px] font-mono text-zinc-400">
                            +{tosScans.signals.length - 4} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Setup Metrics: Trullas Divergence OR TOS Scan ATR Plan */}
                  {mainSetup ? (
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs font-mono tabular-nums bg-zinc-950 p-3 rounded-lg border border-zinc-800/80 xl:min-w-[520px] shrink-0">
                      <div className="min-w-[124px]">
                        <span className="text-zinc-500 block text-[10px] whitespace-nowrap">Signal Weighting</span>
                        {weighting ? (
                          <>
                            <div className="flex items-center space-x-1.5 mt-0.5 whitespace-nowrap">
                              <span className="font-bold text-indigo-300">Grade {weighting.signalGrade}</span>
                              <span className="px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 text-[10px] font-bold border border-indigo-500/30">
                                {weighting.confidenceScore}%
                              </span>
                            </div>
                            <span className="text-[9px] text-zinc-500 block tabular-nums truncate">
                              r={weighting.rollingCorrelation >= 0 ? '+' : ''}{weighting.rollingCorrelation.toFixed(2)} &bull;{' '}
                              {weighting.hasHistoricalSample
                                ? `${weighting.historicalAccuracyPct}% (${weighting.totalHistoricalSignals})`
                                : '0 hits'}
                              {' · '}HR-N={weighting.excursionQuantiles.analogCount}
                            </span>
                          </>
                        ) : (
                          <span className="text-zinc-400 text-[11px] block mt-1">Need &ge;20 bars</span>
                        )}
                      </div>
                      <div>
                        <span className="text-zinc-500 block text-[10px] whitespace-nowrap">Quality Score</span>
                        <span className="font-bold text-emerald-400 mt-0.5 block">{mainSetup.qualityScore}%</span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block text-[10px] whitespace-nowrap">Trigger (23.6%)</span>
                        <span className="font-bold text-white mt-0.5 block">${mainSetup.triggerPrice.toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block text-[10px] whitespace-nowrap">Stop Loss</span>
                        <span className="font-bold text-rose-400 mt-0.5 block">${mainSetup.stopLoss.toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block text-[10px] whitespace-nowrap">Target 2 (61.8%)</span>
                        <span className="font-bold text-amber-400 mt-0.5 block">
                          ${mainSetup.targets.tp2.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ) : tosPlanSetup && tosScans?.primarySignal ? (
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs font-mono tabular-nums bg-zinc-950 p-3 rounded-lg border border-zinc-800/80 xl:min-w-[520px] shrink-0">
                      <div className="min-w-[124px]">
                        <span className="text-zinc-500 block text-[10px] whitespace-nowrap">Primary TOS Scan</span>
                        <span className="font-bold text-emerald-300 mt-0.5 block truncate max-w-[140px]">
                          {tosScans.primarySignal.shortLabel}
                        </span>
                        <span className="text-[10px] text-zinc-500 block whitespace-nowrap">
                          {tosScans.signals.length} setup{tosScans.signals.length > 1 ? 's' : ''} matched
                        </span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block text-[10px] whitespace-nowrap">Scan Strength</span>
                        <span className="font-bold text-emerald-400 mt-0.5 block">
                          {tosScans.compositeStrength}%
                        </span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block text-[10px] whitespace-nowrap">ATR Trigger</span>
                        <span className="font-bold text-white mt-0.5 block">
                          ${tosPlanSetup.triggerPrice.toFixed(2)}
                        </span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block text-[10px] whitespace-nowrap">Stop (1.35×ATR)</span>
                        <span className="font-bold text-rose-400 mt-0.5 block">
                          ${tosPlanSetup.stopLoss.toFixed(2)}
                        </span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block text-[10px] whitespace-nowrap">Target 2 (2.5R)</span>
                        <span className="font-bold text-amber-400 mt-0.5 block">
                          ${tosPlanSetup.targets.tp2.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-zinc-500 italic">
                      Consolidating &bull; No active divergence or TOS scan trigger
                    </div>
                  )}
                </div>
              </div>

              {/* Confluence details row for divergences OR TOS scans */}
              {mainSetup ? (
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
                  <div className="flex flex-wrap items-center gap-3 text-zinc-400 font-mono tabular-nums">
                    {weighting && weighting.excursionQuantiles.analogCount > 0 && (
                      <span
                        data-testid={`excursion-quantiles-${item.symbol}`}
                        className="text-[11px] text-zinc-300"
                        title="Empirical 25-bar forward excursion quantiles from same-direction historical analogs on real OHLCV bars"
                      >
                        HR-N={weighting.excursionQuantiles.analogCount}
                        {!weighting.excursionQuantiles.sampleSufficient ? ' (n<10)' : ''}
                        {' · '}
                        <span className="text-emerald-400">MFE p80 +{weighting.excursionQuantiles.mfeP80Pct}%</span>
                        {' · '}
                        <span className="text-rose-400">MAE p50 -{weighting.excursionQuantiles.maeP50Pct}%</span>
                        {weighting.excursionQuantiles.tp1WithinMfeP80 !== null && (
                          <span
                            className={
                              weighting.excursionQuantiles.tp1WithinMfeP80
                                ? ' text-emerald-400'
                                : ' text-amber-400'
                            }
                          >
                            {' · '}
                            {weighting.excursionQuantiles.tp1WithinMfeP80 ? 'TP1≤p80' : 'TP1>p80'}
                          </span>
                        )}
                      </span>
                    )}
                    <span>
                      R:R Ratio = <strong className="text-white">1:{mainSetup.riskRewardRatio}</strong>
                    </span>
                  </div>
                </div>
              ) : tosScans?.primarySignal ? (
                <div className="mt-3 pt-3 border-t border-zinc-800/80 flex flex-wrap items-center justify-between text-[11px] text-zinc-400 gap-2">
                  <div>
                    <span className="text-zinc-300 font-medium">{tosScans.primarySignal.name}:</span>{' '}
                    <span>{tosScans.primarySignal.headline}</span>
                  </div>
                  <div className="font-mono tabular-nums text-zinc-400">
                    {tosScans.primarySignal.metricsSummary}
                    {' · '}
                    R:R = <strong className="text-white">1:2.5</strong>
                  </div>
                </div>
              ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
