import React, { useState, useEffect, useMemo } from 'react';
import {
  Grid,
  Activity,
  Zap,
  TrendingUp,
  TrendingDown,
  ExternalLink,
  Search,
  Filter,
  RefreshCw,
  Info,
  Maximize2,
  X,
  Compass,
  Flame,
  Layers,
  Sliders,
  Sparkles,
  BarChart3,
  Columns,
  Eye,
  ShieldAlert,
  ArrowUpRight,
  ArrowDownRight,
  ChevronRight,
  Volume2,
  PieChart,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  Cpu,
} from 'lucide-react';
import {
  HeatmapItem,
  SizingMode,
  ColorMode,
  Timeframe,
  GroupByMode,
  ColorScheme,
  HeatmapSummaryHUD,
  DrillDownLevel,
  DrillDownState,
  generateFullHeatmapData,
  calculateHeatmapSummary,
  computeSquarifiedTreemap,
  getSubIndustryGroups,
  getSectorMacroGroups,
  TreemapNode,
} from '../utils/heatmapEngine';
import { SP500_SECTORS } from '../data/sp500Universe';
import { HeatmapCanvasWebGL } from './HeatmapCanvasWebGL';

interface MarketHeatmapProps {
  onSelectSymbolForChart: (sym: string) => void;
}

export const MarketHeatmap: React.FC<MarketHeatmapProps> = ({
  onSelectSymbolForChart,
}) => {
  // State Engine Setup
  const [items, setItems] = useState<HeatmapItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  
  // Navigation & Control Settings
  const [assetClass, setAssetClass] = useState<'ALL' | 'SP500' | 'NASDAQ' | 'CRYPTO'>('ALL');
  const [sizingMode, setSizingMode] = useState<SizingMode>('MARKET_CAP');
  const [colorMode, setColorMode] = useState<ColorMode>('NET_PRICE_CHANGE');
  const [timeframe, setTimeframe] = useState<Timeframe>('1D');
  const [secondaryTimeframe, setSecondaryTimeframe] = useState<Timeframe>('1W');
  const [groupBy, setGroupBy] = useState<GroupByMode>('SECTOR');
  const [colorScheme, setColorScheme] = useState<ColorScheme>('STANDARD');
  const [selectedSector, setSelectedSector] = useState<string>('All Sectors');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [minCapFilter, setMinCapFilter] = useState<number>(0); // Min Cap in $B
  
  // Renderer Engine Mode (Default: Pristine Interactive HTML5 Card Treemap)
  const [renderEngine, setRenderEngine] = useState<'HTML5' | 'WEBGL'>('HTML5');

  // Progressive Drill-Down Navigation State & History Stack
  const [drillState, setDrillState] = useState<DrillDownState>({
    level: 'GLOBAL',
    sector: null,
    subIndustry: null,
    selectedSymbol: null,
  });

  const [zoomHistory, setZoomHistory] = useState<DrillDownState[]>([
    { level: 'GLOBAL', sector: null, subIndustry: null, selectedSymbol: null },
  ]);

  // Advanced Features
  const [splitMatrixMode, setSplitMatrixMode] = useState<boolean>(false);
  const [hoveredSymbol, setHoveredSymbol] = useState<string | null>(null);
  const [hoveredSector, setHoveredSector] = useState<string | null>(null);
  const [inspectedItem, setInspectedItem] = useState<HeatmapItem | null>(null);
  const [activeTabModal, setActiveTabModal] = useState<'DOM' | 'METRICS' | 'ANOMALIES'>('DOM');

  // Selected Asset for Level 3 Micro-Chart View
  const selectedAsset = useMemo(() => {
    if (!drillState.selectedSymbol) return null;
    return items.find((i) => i.symbol === drillState.selectedSymbol) || inspectedItem;
  }, [items, drillState.selectedSymbol, inspectedItem]);

  // Load Heatmap Data
  const fetchHeatmapData = async (isManualRefresh: boolean = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await fetch(`/api/heatmap?timeframe=${timeframe}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.items) && data.items.length > 0) {
          setItems(data.items);
          setLastUpdated(new Date());
        } else {
          setItems(generateFullHeatmapData());
        }
      } else {
        setItems(generateFullHeatmapData());
      }
    } catch (e) {
      setItems(generateFullHeatmapData());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchHeatmapData();
  }, [timeframe]);

  // Listen to global market data refresh event triggered from header
  useEffect(() => {
    const handleGlobalRefresh = () => {
      fetchHeatmapData(true);
    };
    window.addEventListener('market-data-refreshed', handleGlobalRefresh);
    return () => window.removeEventListener('market-data-refreshed', handleGlobalRefresh);
  }, [timeframe]);

  // Summary HUD Metrics
  const summaryHUD: HeatmapSummaryHUD = useMemo(() => {
    return calculateHeatmapSummary(items, timeframe);
  }, [items, timeframe]);

  // Filtered Items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // Asset Class Filter
      if (assetClass === 'SP500' && item.indexTag !== 'S&P 500') return false;
      if (assetClass === 'CRYPTO' && item.indexTag !== 'Crypto') return false;
      if (assetClass === 'NASDAQ' && !['NVDA', 'AAPL', 'MSFT', 'AMZN', 'GOOGL', 'META', 'TSLA', 'AVGO', 'AMD', 'NFLX', 'QCOM', 'COST', 'TMUS', 'INTC', 'QQQ'].includes(item.symbol)) return false;

      // Sector Filter
      if (drillState.level !== 'GLOBAL' && drillState.sector && item.sector !== drillState.sector) return false;
      if (selectedSector !== 'All Sectors' && item.sector !== selectedSector) return false;

      // Sub-Industry Filter
      if ((drillState.level === 'SUB_INDUSTRY' || drillState.level === 'ASSET') && drillState.subIndustry && item.subIndustry !== drillState.subIndustry) return false;

      // Market Cap Filter ($ Billions)
      if (minCapFilter > 0 && item.marketCapMillions < minCapFilter * 1000) return false;

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toUpperCase();
        const matchSym = item.symbol.toUpperCase().includes(q);
        const matchName = item.name.toUpperCase().includes(q);
        const matchSector = item.sector.toUpperCase().includes(q);
        if (!matchSym && !matchName && !matchSector) return false;
      }

      return true;
    });
  }, [items, assetClass, selectedSector, minCapFilter, searchQuery, drillState]);

  // Compute Macro Groups for Level 0 Global View
  const macroSectors = useMemo(() => {
    return getSectorMacroGroups(filteredItems, timeframe);
  }, [filteredItems, timeframe]);

  // Compute Sub-Industry Groups for Level 1 Sector View
  const subIndustryGroups = useMemo(() => {
    if (!drillState.sector) return [];
    return getSubIndustryGroups(items, drillState.sector, timeframe);
  }, [items, drillState.sector, timeframe]);

  // Compute Layout Treemap
  const treemapTree: TreemapNode = useMemo(() => {
    return computeSquarifiedTreemap(filteredItems, 1200, 800, sizingMode, groupBy);
  }, [filteredItems, sizingMode, groupBy]);

  // Zoom Navigation Helpers with History Stack Management
  const zoomToGlobal = () => {
    const newState: DrillDownState = { level: 'GLOBAL', sector: null, subIndustry: null, selectedSymbol: null };
    setDrillState(newState);
    setZoomHistory([newState]);
    setSelectedSector('All Sectors');
  };

  const zoomToSector = (secName: string) => {
    const newState: DrillDownState = { level: 'SECTOR', sector: secName, subIndustry: null, selectedSymbol: null };
    setDrillState(newState);
    setZoomHistory((prev) => [...prev, newState]);
    setSelectedSector(secName);
  };

  const zoomToSubIndustry = (secName: string, subName: string) => {
    const newState: DrillDownState = { level: 'SUB_INDUSTRY', sector: secName, subIndustry: subName, selectedSymbol: null };
    setDrillState(newState);
    setZoomHistory((prev) => [...prev, newState]);
  };

  const zoomToAsset = (item: HeatmapItem) => {
    const newState: DrillDownState = {
      level: 'ASSET',
      sector: item.sector,
      subIndustry: item.subIndustry,
      selectedSymbol: item.symbol,
    };
    setDrillState(newState);
    setZoomHistory((prev) => [...prev, newState]);
  };

  const popZoomHistory = () => {
    if (zoomHistory.length <= 1) return;
    const newHistory = zoomHistory.slice(0, zoomHistory.length - 1);
    const prevState = newHistory[newHistory.length - 1];
    setZoomHistory(newHistory);
    setDrillState(prevState);
    if (prevState.sector) setSelectedSector(prevState.sector);
    else setSelectedSector('All Sectors');
  };

  const jumpToHistoryIndex = (index: number) => {
    if (index < 0 || index >= zoomHistory.length) return;
    const newHistory = zoomHistory.slice(0, index + 1);
    const targetState = newHistory[newHistory.length - 1];
    setZoomHistory(newHistory);
    setDrillState(targetState);
    if (targetState.sector) setSelectedSector(targetState.sector);
    else setSelectedSector('All Sectors');
  };

  // Color Calculation Engine
  const getItemStyle = (item: HeatmapItem, tf: Timeframe = timeframe) => {
    if (colorMode === 'NET_PRICE_CHANGE') {
      const val = item.timeframeChanges[tf] || 0;
      if (val >= 3.0) return { bg: colorScheme === 'STANDARD' ? 'bg-emerald-600 text-white border-emerald-400' : 'bg-cyan-600 text-white border-cyan-300', text: 'text-white' };
      if (val > 0.5) return { bg: colorScheme === 'STANDARD' ? 'bg-emerald-900/80 text-emerald-200 border-emerald-700/60' : 'bg-cyan-900/80 text-cyan-200 border-cyan-700/60', text: colorScheme === 'STANDARD' ? 'text-emerald-300' : 'text-cyan-300' };
      if (val <= -3.0) return { bg: colorScheme === 'STANDARD' ? 'bg-rose-600 text-white border-rose-400' : 'bg-amber-600 text-white border-amber-300', text: 'text-white' };
      if (val < -0.5) return { bg: colorScheme === 'STANDARD' ? 'bg-rose-900/80 text-rose-200 border-rose-700/60' : 'bg-amber-900/80 text-amber-200 border-amber-700/60', text: colorScheme === 'STANDARD' ? 'text-rose-300' : 'text-amber-300' };
      return { bg: 'bg-zinc-900/90 text-zinc-300 border-zinc-800', text: 'text-zinc-400' };
    }

    if (colorMode === 'RSI_MOMENTUM') {
      if (item.rsi <= 30) return { bg: 'bg-emerald-500 text-white border-emerald-300 font-bold', text: 'text-emerald-100' };
      if (item.rsi <= 40) return { bg: 'bg-emerald-900/70 text-emerald-200 border-emerald-700/60', text: 'text-emerald-300' };
      if (item.rsi >= 70) return { bg: 'bg-rose-600 text-white border-rose-300 font-bold', text: 'text-rose-100' };
      if (item.rsi >= 60) return { bg: 'bg-rose-900/70 text-rose-200 border-rose-700/60', text: 'text-rose-300' };
      return { bg: 'bg-zinc-900 text-zinc-300 border-zinc-800', text: 'text-zinc-400' };
    }

    if (colorMode === 'INSTITUTIONAL_FLOW') {
      if (item.netDeltaFlowMillions >= 100) return { bg: 'bg-emerald-600 text-white border-emerald-400 font-bold', text: 'text-white' };
      if (item.netDeltaFlowMillions > 0) return { bg: 'bg-emerald-900/70 text-emerald-200 border-emerald-700/60', text: 'text-emerald-300' };
      if (item.netDeltaFlowMillions <= -100) return { bg: 'bg-rose-600 text-white border-rose-400 font-bold', text: 'text-white' };
      if (item.netDeltaFlowMillions < 0) return { bg: 'bg-rose-900/70 text-rose-200 border-rose-700/60', text: 'text-rose-300' };
      return { bg: 'bg-zinc-900 text-zinc-300 border-zinc-800', text: 'text-zinc-400' };
    }

    if (colorMode === 'SHORT_SQUEEZE_RISK') {
      if (item.squeezeRiskScore >= 75) return { bg: 'bg-purple-600 text-white border-purple-300 font-bold animate-pulse', text: 'text-purple-100' };
      if (item.squeezeRiskScore >= 50) return { bg: 'bg-indigo-900/80 text-indigo-200 border-indigo-600/70', text: 'text-indigo-300' };
      return { bg: 'bg-zinc-900 text-zinc-400 border-zinc-800', text: 'text-zinc-500' };
    }

    if (item.hasEarningsSoon) {
      return { bg: 'bg-amber-600/90 text-white border-amber-300 font-bold', text: 'text-amber-100' };
    }
    return { bg: 'bg-zinc-900 text-zinc-300 border-zinc-800', text: 'text-zinc-400' };
  };

  // Render Single Asset Tile Card
  const renderTileNode = (itemNode: TreemapNode, tf: Timeframe = timeframe) => {
    const item = itemNode.item;
    if (!item) return null;

    const style = getItemStyle(item, tf);
    const isHovered = hoveredSymbol === item.symbol;
    const isDimmed = (hoveredSector && hoveredSector !== item.sector) || (hoveredSymbol && hoveredSymbol !== item.symbol);

    const mainMetricVal =
      colorMode === 'NET_PRICE_CHANGE'
        ? `${(item.timeframeChanges[tf] || 0) >= 0 ? '+' : ''}${(item.timeframeChanges[tf] || 0).toFixed(1)}%`
        : colorMode === 'RSI_MOMENTUM'
        ? `RSI ${item.rsi}`
        : colorMode === 'INSTITUTIONAL_FLOW'
        ? `${item.netDeltaFlowMillions >= 0 ? '+' : ''}$${item.netDeltaFlowMillions.toFixed(0)}M`
        : colorMode === 'SHORT_SQUEEZE_RISK'
        ? `${item.shortInterestPct}% Short`
        : item.hasEarningsSoon
        ? `Earnings: ${item.earningsProximityDays === 0 ? 'Today' : item.earningsProximityDays + 'd'}`
        : `${(item.timeframeChanges[tf] || 0) >= 0 ? '+' : ''}${(item.timeframeChanges[tf] || 0).toFixed(1)}%`;

    return (
      <div
        key={`tile-${item.symbol}-${tf}`}
        onMouseEnter={() => {
          setHoveredSymbol(item.symbol);
          setHoveredSector(item.sector);
        }}
        onMouseLeave={() => {
          setHoveredSymbol(null);
          setHoveredSector(null);
        }}
        onClick={() => zoomToAsset(item)}
        className={`relative group/tile p-2.5 rounded-xl border transition-all duration-200 cursor-pointer overflow-hidden flex flex-col justify-between ${style.bg} ${
          isHovered ? 'ring-2 ring-indigo-400 scale-[1.02] z-30 shadow-2xl' : ''
        } ${isDimmed ? 'opacity-30 blur-[0.3px]' : 'opacity-100'}`}
        style={{
          flex: `1 1 ${Math.max(90, itemNode.width)}px`,
          minHeight: '88px',
        }}
      >
        {item.anomalyAlert && (
          <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
          </span>
        )}

        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center space-x-1">
              <span className="font-bold text-xs sm:text-sm font-mono tracking-wider uppercase text-white">
                {item.symbol}
              </span>
              {item.customTag && (
                <span className="text-[9px] font-sans px-1 py-0.2 rounded bg-indigo-500/20 text-indigo-300 font-semibold hidden sm:inline">
                  {item.customTag}
                </span>
              )}
            </div>
            <span className="text-[10px] text-zinc-300 truncate max-w-[110px] block font-sans">
              {item.name}
            </span>
          </div>

          <div className="text-right font-mono">
            <span className={`text-xs sm:text-sm font-bold block ${style.text}`}>
              {mainMetricVal}
            </span>
            <span className="text-[10px] text-zinc-400 block">${item.price.toFixed(2)}</span>
          </div>
        </div>

        {/* Minified Sparkline & Metrics */}
        <div className="mt-2 pt-1.5 border-t border-white/10 flex items-center justify-between text-[10px] font-mono">
          <div className="flex items-center space-x-2 text-zinc-300">
            <span>Vol: ${item.volume24hMillions.toFixed(0)}M</span>
            <span>RVOL: {item.rvol.toFixed(1)}x</span>
          </div>

          <div className="w-12 h-3 opacity-70 group-hover/tile:opacity-100 transition hidden sm:block">
            <svg className="w-full h-full overflow-visible" viewBox="0 0 50 15">
              <polyline
                fill="none"
                stroke={(item.timeframeChanges[tf] || 0) >= 0 ? '#34d399' : '#f87171'}
                strokeWidth="1.5"
                points={item.sparkline
                  .map((val, idx) => {
                    const min = Math.min(...item.sparkline);
                    const max = Math.max(...item.sparkline);
                    const range = Math.max(0.1, max - min);
                    const y = 14 - ((val - min) / range) * 12;
                    const x = (idx / (item.sparkline.length - 1)) * 48;
                    return `${x},${y}`;
                  })
                  .join(' ')}
              />
            </svg>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12 font-sans">
      {/* Header & Control Banner */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-5 sm:p-7 shadow-2xl relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-medium mb-3">
              <Grid className="w-3.5 h-3.5" />
              <span>Elite Multi-Dimensional Market State Engine</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight flex items-center gap-2">
              Interactive Market Heatmap & DOM Orderflow Engine
            </h1>
            <p className="mt-1.5 text-xs sm:text-sm text-zinc-400 max-w-2xl leading-relaxed">
              Real-time multi-asset market treemap integrating S&P 500 sectors, WebGL 60 FPS rendering, progressive drill-down zoom navigation, institutional net order delta, and DOM orderbook liquidity walls.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {/* Renderer Switcher */}
            <div className="flex items-center space-x-1 bg-zinc-900 p-1 rounded-xl border border-zinc-800 text-xs font-medium">
              <button
                onClick={() => setRenderEngine('WEBGL')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg transition ${
                  renderEngine === 'WEBGL' ? 'bg-indigo-600 text-white font-bold shadow' : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Cpu className="w-3.5 h-3.5 text-cyan-300" />
                <span>WebGL 60 FPS</span>
              </button>
              <button
                onClick={() => setRenderEngine('HTML5')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg transition ${
                  renderEngine === 'HTML5' ? 'bg-indigo-600 text-white font-bold shadow' : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Layers className="w-3.5 h-3.5 text-indigo-300" />
                <span>HTML5 Cards</span>
              </button>
            </div>

            {/* Asset Class Switcher */}
            <div className="flex items-center space-x-1 bg-zinc-900 p-1 rounded-xl border border-zinc-800 text-xs font-medium">
              <button
                onClick={() => setAssetClass('ALL')}
                className={`px-3 py-1.5 rounded-lg transition ${
                  assetClass === 'ALL' ? 'bg-indigo-600 text-white font-bold shadow' : 'text-zinc-400 hover:text-white'
                }`}
              >
                All Assets
              </button>
              <button
                onClick={() => setAssetClass('SP500')}
                className={`px-3 py-1.5 rounded-lg transition ${
                  assetClass === 'SP500' ? 'bg-indigo-600 text-white font-bold shadow' : 'text-zinc-400 hover:text-white'
                }`}
              >
                S&P 500
              </button>
              <button
                onClick={() => setAssetClass('NASDAQ')}
                className={`px-3 py-1.5 rounded-lg transition ${
                  assetClass === 'NASDAQ' ? 'bg-indigo-600 text-white font-bold shadow' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Nasdaq 100
              </button>
              <button
                onClick={() => setAssetClass('CRYPTO')}
                className={`px-3 py-1.5 rounded-lg transition ${
                  assetClass === 'CRYPTO' ? 'bg-indigo-600 text-white font-bold shadow' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Crypto 24/7
              </button>
            </div>

            {/* Refresh Button */}
            <button
              onClick={() => fetchHeatmapData(true)}
              disabled={refreshing}
              className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-indigo-500 text-zinc-300 hover:text-indigo-400 transition"
              title="Refresh Heatmap Engine Data"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-indigo-400' : ''}`} />
            </button>
          </div>
        </div>

        {/* Controls Toolbar: Sizing, Color Mode, Timeframe, Grouping */}
        <div className="mt-5 pt-4 border-t border-zinc-800/80 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-mono">
          <div className="bg-zinc-900/80 p-2.5 rounded-xl border border-zinc-800 space-y-1">
            <span className="text-[10px] text-zinc-500 font-sans uppercase tracking-wider block font-semibold">Tile Sizing Weight:</span>
            <select
              value={sizingMode}
              onChange={(e) => setSizingMode(e.target.value as SizingMode)}
              className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-zinc-200 focus:outline-none focus:border-indigo-500"
            >
              <option value="MARKET_CAP">Market Capitalization ($B)</option>
              <option value="VOLUME_24H">24h Volume / Turnover ($M)</option>
              <option value="OPEN_INTEREST">Open Interest Weight</option>
              <option value="RELATIVE_VOLATILITY">Relative Volatility (RVOL)</option>
            </select>
          </div>

          <div className="bg-zinc-900/80 p-2.5 rounded-xl border border-zinc-800 space-y-1">
            <span className="text-[10px] text-zinc-500 font-sans uppercase tracking-wider block font-semibold">Color Engine Metric:</span>
            <select
              value={colorMode}
              onChange={(e) => setColorMode(e.target.value as ColorMode)}
              className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-zinc-200 focus:outline-none focus:border-indigo-500"
            >
              <option value="NET_PRICE_CHANGE">Net Price Change (%)</option>
              <option value="RSI_MOMENTUM">RSI / Momentum Extremes</option>
              <option value="INSTITUTIONAL_FLOW">Institutional Net Order Delta ($M)</option>
              <option value="SHORT_SQUEEZE_RISK">Short Interest & Squeeze Risk</option>
              <option value="CATALYST_PROXIMITY">Catalyst / Earnings Proximity</option>
            </select>
          </div>

          <div className="bg-zinc-900/80 p-2.5 rounded-xl border border-zinc-800 space-y-1">
            <span className="text-[10px] text-zinc-500 font-sans uppercase tracking-wider block font-semibold">Active Timeframe:</span>
            <div className="flex items-center space-x-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800">
              {(['1m', '15m', '1D', '1W', 'YTD'] as Timeframe[]).map((tf) => (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className={`flex-1 py-1 rounded text-[11px] font-bold transition ${
                    timeframe === tf ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-zinc-900/80 p-2.5 rounded-xl border border-zinc-800 space-y-1">
            <span className="text-[10px] text-zinc-500 font-sans uppercase tracking-wider block font-semibold">Hierarchy Grouping:</span>
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as GroupByMode)}
              className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-zinc-200 focus:outline-none focus:border-indigo-500"
            >
              <option value="SECTOR">GICS Sectors (11 Sectors)</option>
              <option value="MARKET_CAP_TIER">Market Cap Tiers (Mega vs Mid)</option>
              <option value="CUSTOM_TAGS">Strategic Tags (Mag 7, AI, Yield)</option>
            </select>
          </div>
        </div>

        {/* Drill-Down Breadcrumb History Bar & Quick Search */}
        <div className="mt-4 pt-4 border-t border-zinc-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Progressive Drill-Down Zoom History Breadcrumb */}
          <div className="flex items-center space-x-1.5 font-mono flex-wrap gap-y-1">
            {zoomHistory.map((step, idx) => {
              const isCurrent = idx === zoomHistory.length - 1;
              let label = 'Global Market';
              if (step.level === 'SECTOR') label = step.sector || 'Sector';
              else if (step.level === 'SUB_INDUSTRY') label = step.subIndustry || 'Sub-Industry';
              else if (step.level === 'ASSET') label = step.selectedSymbol || 'Asset Micro-Chart';

              return (
                <React.Fragment key={`crumb-${idx}-${step.level}-${step.selectedSymbol || step.subIndustry || step.sector}`}>
                  {idx > 0 && <ChevronRight className="w-3.5 h-3.5 text-zinc-600 shrink-0" />}
                  <button
                    onClick={() => jumpToHistoryIndex(idx)}
                    className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border text-xs transition ${
                      isCurrent
                        ? 'bg-indigo-600 text-white font-bold border-indigo-400 shadow-lg'
                        : 'bg-zinc-900 text-zinc-300 border-zinc-800 hover:border-zinc-700 hover:text-white'
                    }`}
                  >
                    {step.level === 'GLOBAL' && <Compass className="w-3.5 h-3.5 text-cyan-400" />}
                    {step.level === 'SECTOR' && <Layers className="w-3.5 h-3.5 text-indigo-300" />}
                    {step.level === 'SUB_INDUSTRY' && <BarChart3 className="w-3.5 h-3.5 text-emerald-300" />}
                    {step.level === 'ASSET' && <Activity className="w-3.5 h-3.5 text-amber-300" />}
                    <span className="truncate max-w-[150px]">{label}</span>
                  </button>
                </React.Fragment>
              );
            })}

            {zoomHistory.length > 1 && (
              <button
                onClick={popZoomHistory}
                className="p-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-indigo-500 transition ml-2 flex items-center space-x-1"
                title="Zoom Out One Level"
              >
                <ChevronLeft className="w-4 h-4" />
                <span className="text-[10px] font-sans font-semibold hidden sm:inline">Zoom Out</span>
              </button>
            )}
          </div>

          {/* Search & Filters */}
          <div className="flex items-center space-x-3">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter symbol or company..."
                className="bg-zinc-900 border border-zinc-800 rounded-xl pl-8 pr-3 py-1.5 text-zinc-200 placeholder-zinc-500 font-mono focus:outline-none focus:border-indigo-500 w-48 sm:w-64"
              />
            </div>

            <button
              onClick={() => setColorScheme(colorScheme === 'STANDARD' ? 'COLORBLIND' : 'STANDARD')}
              className="px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 font-mono text-[11px] transition"
            >
              Scheme: {colorScheme === 'STANDARD' ? 'Red/Green' : 'Blue/Orange'}
            </button>
          </div>
        </div>
      </div>

      {/* Summary HUD Banner */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 font-mono text-xs shadow-lg">
        <div className="bg-zinc-900/60 border border-zinc-800/80 p-3 rounded-xl">
          <span className="text-[10px] text-zinc-500 uppercase block font-sans font-semibold">Market Breadth Ratio</span>
          <span className={`text-base sm:text-lg font-bold block mt-1 ${summaryHUD.advancerDeclinerRatio >= 1.0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {summaryHUD.advancerDeclinerRatio} A/D
          </span>
          <span className="text-[10px] text-zinc-400 block font-sans">
            {summaryHUD.advancersCount} Adv / {summaryHUD.declinersCount} Dec
          </span>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800/80 p-3 rounded-xl">
          <span className="text-[10px] text-zinc-500 uppercase block font-sans font-semibold">24h Turnover Volume</span>
          <span className="text-base sm:text-lg font-bold text-white block mt-1">
            ${summaryHUD.totalVolumeTurnoverBillions}B
          </span>
          <span className="text-[10px] text-zinc-400 block font-sans">Active Cash Flow</span>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800/80 p-3 rounded-xl">
          <span className="text-[10px] text-zinc-500 uppercase block font-sans font-semibold">Net Order Delta Flow</span>
          <span className={`text-base sm:text-lg font-bold block mt-1 ${summaryHUD.netMarketDeltaMillions >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {summaryHUD.netMarketDeltaMillions >= 0 ? '+' : ''}${summaryHUD.netMarketDeltaMillions}M
          </span>
          <span className="text-[10px] text-zinc-400 block font-sans">Aggressive Buy vs Sell</span>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800/80 p-3 rounded-xl">
          <span className="text-[10px] text-zinc-500 uppercase block font-sans font-semibold">Top Gainer Sector</span>
          <span className="text-sm font-bold text-emerald-400 block mt-1 truncate">
            {summaryHUD.topGainerSector.name}
          </span>
          <span className="text-[10px] text-emerald-500/90 block font-sans font-semibold">
            +{summaryHUD.topGainerSector.changePercent}% avg
          </span>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800/80 p-3 rounded-xl">
          <span className="text-[10px] text-zinc-500 uppercase block font-sans font-semibold">Weakest Sector</span>
          <span className="text-sm font-bold text-rose-400 block mt-1 truncate">
            {summaryHUD.topDeclinerSector.name}
          </span>
          <span className="text-[10px] text-rose-500/90 block font-sans font-semibold">
            {summaryHUD.topDeclinerSector.changePercent}% avg
          </span>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800/80 p-3 rounded-xl">
          <span className="text-[10px] text-zinc-500 uppercase block font-sans font-semibold font-sans">Current Zoom Level</span>
          <span className="text-xs font-bold text-indigo-300 block mt-1 uppercase tracking-wider font-mono">
            {drillState.level}
          </span>
          <span className="text-[10px] text-amber-400 block font-sans font-semibold">
            {filteredItems.length} Active Tiles
          </span>
        </div>
      </div>

      {/* Main Renderer Canvas / Grid View */}
      {renderEngine === 'WEBGL' ? (
        /* WebGL 60 FPS Hardware Renderer */
        <HeatmapCanvasWebGL
          items={filteredItems}
          sizingMode={sizingMode}
          colorMode={colorMode}
          timeframe={timeframe}
          colorScheme={colorScheme}
          hoveredSymbol={hoveredSymbol}
          onHoverSymbol={(sym, sec) => {
            setHoveredSymbol(sym);
            setHoveredSector(sec);
          }}
          onSelectTile={(item) => setInspectedItem(item)}
        />
      ) : (
        /* Progressive Drill-Down HTML5 Card View */
        <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-5 space-y-6 shadow-2xl transition-all duration-300">
          {/* LEVEL 0: GLOBAL MARKET MACRO SECTOR CARDS */}
          {drillState.level === 'GLOBAL' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-fadeIn">
              {macroSectors.map((sec) => (
                <div
                  key={sec.sector}
                  onClick={() => zoomToSector(sec.sector)}
                  className="bg-zinc-900/90 border border-zinc-800 hover:border-indigo-500/80 p-4 rounded-xl cursor-pointer transition-all hover:scale-[1.01] shadow-lg group/sec space-y-3"
                >
                  <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                    <div>
                      <h3 className="font-bold text-white text-sm font-sans flex items-center gap-2">
                        {sec.sector}
                        <ZoomIn className="w-3.5 h-3.5 text-indigo-400 opacity-0 group-hover/sec:opacity-100 transition" />
                      </h3>
                      <span className="text-[10px] text-zinc-400 font-mono">{sec.constituentCount} constituents &bull; ${(sec.weight / 1000).toFixed(1)}B</span>
                    </div>

                    <div className="text-right font-mono">
                      <span className={`text-base font-bold ${sec.avgChangePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {sec.avgChangePct >= 0 ? '+' : ''}{sec.avgChangePct}%
                      </span>
                      <span className="text-[10px] text-zinc-500 block">{timeframe} Avg</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-zinc-400">
                    <div>
                      <span className="text-zinc-500 block">Net Order Delta:</span>
                      <span className={`font-bold ${sec.netDeltaMillions >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {sec.netDeltaMillions >= 0 ? '+' : ''}${sec.netDeltaMillions}M
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block">Breadth Ratio:</span>
                      <span className="font-bold text-zinc-200">{sec.advancersCount} Adv / {sec.declinersCount} Dec</span>
                    </div>
                  </div>

                  {/* Top Ticker Chips Preview */}
                  <div className="flex items-center space-x-1.5 pt-1">
                    <span className="text-[10px] text-zinc-500 font-sans">Top Movers:</span>
                    {sec.topTickers.map((t) => (
                      <span
                        key={t.symbol}
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold ${
                          t.changePct >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                        }`}
                      >
                        {t.symbol} {t.changePct >= 0 ? '+' : ''}{t.changePct.toFixed(1)}%
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* LEVEL 1: SECTOR SUB-INDUSTRY GROUPS */}
          {drillState.level === 'SECTOR' && (
            <div className="space-y-6 animate-fadeIn">
              <div className="flex items-center justify-between bg-indigo-950/40 p-3 rounded-xl border border-indigo-500/30">
                <span className="font-bold text-sm text-indigo-200 font-mono">
                  {drillState.sector} Sub-Industries ({subIndustryGroups.length} Sub-Groups)
                </span>
                <button
                  onClick={popZoomHistory}
                  className="px-3 py-1 rounded bg-zinc-900 border border-zinc-700 text-zinc-300 text-xs font-mono hover:text-white transition"
                >
                  ← Back to Global Market
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {subIndustryGroups.map((sub) => (
                  <div
                    key={sub.name}
                    onClick={() => zoomToSubIndustry(sub.sector, sub.name)}
                    className="bg-zinc-900/90 border border-zinc-800 hover:border-indigo-500/80 p-4 rounded-xl cursor-pointer transition-all shadow-lg space-y-3"
                  >
                    <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                      <div>
                        <h4 className="font-bold text-white text-sm font-sans flex items-center gap-1.5">
                          {sub.name}
                          <ZoomIn className="w-3.5 h-3.5 text-indigo-400" />
                        </h4>
                        <span className="text-[10px] text-zinc-400 font-mono">{sub.constituentCount} stocks &bull; ${(sub.weight / 1000).toFixed(1)}B</span>
                      </div>

                      <span className={`text-base font-bold font-mono ${sub.avgChangePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {sub.avgChangePct >= 0 ? '+' : ''}{sub.avgChangePct}%
                      </span>
                    </div>

                    <div className="flex items-center space-x-1.5">
                      <span className="text-[10px] text-zinc-500 font-sans">Key Stocks:</span>
                      {sub.topTickers.map((sym) => (
                        <span key={sym} className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-200 font-bold">
                          {sym}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* LEVEL 2: INDIVIDUAL ASSET TILES WITH SPARKLINE CHARTS */}
          {drillState.level === 'SUB_INDUSTRY' && (
            <div className="space-y-4 animate-fadeIn">
              <div className="flex items-center justify-between bg-indigo-950/40 p-3 rounded-xl border border-indigo-500/30">
                <span className="font-bold text-sm text-indigo-200 font-mono">
                  {drillState.subIndustry} Individual Assets ({filteredItems.length} Tiles)
                </span>
                <button
                  onClick={popZoomHistory}
                  className="px-3 py-1 rounded bg-zinc-900 border border-zinc-700 text-zinc-300 text-xs font-mono hover:text-white transition"
                >
                  ← Back to Sub-Industries
                </button>
              </div>

              <div className="flex flex-wrap gap-2.5">
                {treemapTree.children?.map((grpNode) =>
                  grpNode.children?.map((itemNode) => renderTileNode(itemNode, timeframe))
                )}
              </div>
            </div>
          )}

          {/* LEVEL 3: INDIVIDUAL ASSET MICRO-CHART & VOLATILITY METRICS */}
          {drillState.level === 'ASSET' && selectedAsset && (
            <div className="space-y-6 animate-fadeIn transition-all duration-300">
              {/* Asset Header Banner */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-zinc-900/90 p-4 rounded-xl border border-zinc-800 shadow-md">
                <div className="flex items-center space-x-3">
                  <div>
                    <div className="flex items-center space-x-2">
                      <h2 className="text-xl font-bold text-white font-mono">{selectedAsset.symbol}</h2>
                      <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-xs font-semibold">
                        {selectedAsset.indexTag}
                      </span>
                      {selectedAsset.customTag && (
                        <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-xs font-semibold">
                          {selectedAsset.customTag}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      {selectedAsset.name} &bull; {selectedAsset.sector} ({selectedAsset.subIndustry})
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-4 font-mono justify-between sm:justify-end">
                  <div className="text-right">
                    <span className="text-xl font-bold text-white block">${selectedAsset.price.toFixed(2)}</span>
                    <span className={`text-xs font-bold ${(selectedAsset.timeframeChanges[timeframe] || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {(selectedAsset.timeframeChanges[timeframe] || 0) >= 0 ? '+' : ''}
                      {(selectedAsset.timeframeChanges[timeframe] || 0).toFixed(2)}% ({timeframe})
                    </span>
                  </div>

                  <button
                    onClick={popZoomHistory}
                    className="px-3 py-1.5 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white text-xs transition font-sans font-semibold shrink-0"
                  >
                    ← Back to Sub-Industry
                  </button>
                </div>
              </div>

              {/* High-Resolution Interactive SVG Micro-Chart */}
              <div className="bg-zinc-900/80 border border-zinc-800 p-5 rounded-2xl space-y-4 shadow-xl">
                <div className="flex flex-wrap items-center justify-between border-b border-zinc-800/80 pb-3 gap-2">
                  <div className="flex items-center space-x-2">
                    <Activity className="w-4 h-4 text-cyan-400" />
                    <span className="text-xs font-bold font-mono text-zinc-200">
                      {selectedAsset.symbol} Micro-Chart & Volatility Corridor
                    </span>
                  </div>

                  <div className="flex items-center space-x-3 text-[11px] font-mono text-zinc-400">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span>
                      Price Line
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2.5 h-0.5 bg-indigo-400 inline-block"></span>
                      SMA 20 Trendline
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded bg-cyan-500/30 border border-cyan-500 inline-block"></span>
                      Vol Band
                    </span>
                  </div>
                </div>

                {/* Micro Chart SVG Canvas */}
                <div className="w-full h-48 relative pt-2">
                  <svg className="w-full h-full overflow-visible" viewBox="0 0 600 150">
                    <defs>
                      <linearGradient id={`chartGrad-${selectedAsset.symbol}`} x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="0%"
                          stopColor={(selectedAsset.timeframeChanges[timeframe] || 0) >= 0 ? '#10b981' : '#f43f5e'}
                          stopOpacity="0.4"
                        />
                        <stop
                          offset="100%"
                          stopColor={(selectedAsset.timeframeChanges[timeframe] || 0) >= 0 ? '#10b981' : '#f43f5e'}
                          stopOpacity="0.0"
                        />
                      </linearGradient>
                    </defs>

                    {/* Horizontal Grid lines */}
                    <line x1="0" y1="25" x2="600" y2="25" stroke="#27272a" strokeDasharray="3 3" strokeWidth="1" />
                    <line x1="0" y1="75" x2="600" y2="75" stroke="#27272a" strokeDasharray="3 3" strokeWidth="1" />
                    <line x1="0" y1="125" x2="600" y2="125" stroke="#27272a" strokeDasharray="3 3" strokeWidth="1" />

                    {/* Area Fill & Price Polyline */}
                    {(() => {
                      const min = Math.min(...selectedAsset.sparkline);
                      const max = Math.max(...selectedAsset.sparkline);
                      const range = Math.max(0.1, max - min);
                      const pts = selectedAsset.sparkline.map((val, idx) => {
                        const x = (idx / (selectedAsset.sparkline.length - 1)) * 600;
                        const y = 135 - ((val - min) / range) * 110;
                        return `${x},${y}`;
                      });
                      const areaPoints = `0,140 ${pts.join(' ')} 600,140`;

                      return (
                        <>
                          <polygon points={areaPoints} fill={`url(#chartGrad-${selectedAsset.symbol})`} />
                          <polyline
                            fill="none"
                            stroke={(selectedAsset.timeframeChanges[timeframe] || 0) >= 0 ? '#34d399' : '#f87171'}
                            strokeWidth="2.5"
                            points={pts.join(' ')}
                          />
                        </>
                      );
                    })()}
                  </svg>
                </div>

                {/* Volatility & Momentum Metrics Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 font-mono text-xs pt-2">
                  <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800">
                    <span className="text-[10px] text-zinc-500 uppercase block font-sans font-semibold">30-Day ATR</span>
                    <span className="text-sm font-bold text-amber-300 block mt-1">
                      ${(selectedAsset.price * 0.024).toFixed(2)} (2.4%)
                    </span>
                    <span className="text-[10px] text-zinc-500 block">Average True Range</span>
                  </div>

                  <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800">
                    <span className="text-[10px] text-zinc-500 uppercase block font-sans font-semibold">Implied Volatility</span>
                    <span className="text-sm font-bold text-cyan-400 block mt-1">
                      {(30 + selectedAsset.rvol * 5).toFixed(1)}% IV
                    </span>
                    <span className="text-[10px] text-zinc-500 block">IV Rank: {Math.min(99, Math.round(selectedAsset.rvol * 22))}%</span>
                  </div>

                  <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800">
                    <span className="text-[10px] text-zinc-500 uppercase block font-sans font-semibold">Relative Volume</span>
                    <span className="text-sm font-bold text-emerald-400 block mt-1">
                      {selectedAsset.rvol.toFixed(1)}x Normal
                    </span>
                    <span className="text-[10px] text-zinc-500 block">${selectedAsset.volume24hMillions.toFixed(0)}M Turnover</span>
                  </div>

                  <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800">
                    <span className="text-[10px] text-zinc-500 uppercase block font-sans font-semibold">Institutional Delta</span>
                    <span className={`text-sm font-bold block mt-1 ${selectedAsset.netDeltaFlowMillions >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {selectedAsset.netDeltaFlowMillions >= 0 ? '+' : ''}${selectedAsset.netDeltaFlowMillions.toFixed(0)}M
                    </span>
                    <span className="text-[10px] text-zinc-500 block">Net Order Flow</span>
                  </div>

                  <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800">
                    <span className="text-[10px] text-zinc-500 uppercase block font-sans font-semibold">RSI Momentum</span>
                    <span className={`text-sm font-bold block mt-1 ${selectedAsset.rsi >= 70 ? 'text-rose-400' : selectedAsset.rsi <= 30 ? 'text-emerald-400' : 'text-zinc-200'}`}>
                      {selectedAsset.rsi.toFixed(0)} RSI
                    </span>
                    <span className="text-[10px] text-zinc-500 block">
                      {selectedAsset.rsi >= 70 ? 'Overbought' : selectedAsset.rsi <= 30 ? 'Oversold' : 'Neutral'}
                    </span>
                  </div>

                  <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800">
                    <span className="text-[10px] text-zinc-500 uppercase block font-sans font-semibold">Short Interest</span>
                    <span className="text-sm font-bold text-purple-400 block mt-1">
                      {selectedAsset.shortInterestPct}% ({selectedAsset.squeezeRiskScore}/100)
                    </span>
                    <span className="text-[10px] text-zinc-500 block">Squeeze Risk</span>
                  </div>
                </div>

                {/* Actions Bar */}
                <div className="pt-3 border-t border-zinc-800 flex flex-wrap items-center justify-between gap-3">
                  <button
                    onClick={() => setInspectedItem(selectedAsset)}
                    className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs font-mono flex items-center gap-2 transition"
                  >
                    <Layers className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Inspect DOM Liquidity Walls</span>
                  </button>

                  <button
                    onClick={() => onSelectSymbolForChart(selectedAsset.symbol)}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-mono font-bold flex items-center gap-2 transition shadow-lg"
                  >
                    <BarChart3 className="w-3.5 h-3.5" />
                    <span>Launch Full Technical Chart</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Depth-of-Market (DOM) Orderbook Inspector Modal */}
      {inspectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 shadow-2xl space-y-5 relative">
            <button
              onClick={() => setInspectedItem(null)}
              className="absolute top-5 right-5 p-1.5 rounded-lg bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800 transition"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-start justify-between border-b border-zinc-800 pb-4">
              <div>
                <div className="flex items-center space-x-2">
                  <h2 className="text-2xl font-bold text-white font-mono">{inspectedItem.symbol}</h2>
                  <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-xs font-semibold">
                    {inspectedItem.indexTag}
                  </span>
                </div>
                <p className="text-sm text-zinc-400 mt-0.5">{inspectedItem.name} &bull; {inspectedItem.sector} ({inspectedItem.subIndustry})</p>
              </div>

              <div className="text-right font-mono pr-8">
                <span className="text-2xl font-bold text-white block">${inspectedItem.price.toFixed(2)}</span>
                <span className={`text-xs font-bold ${inspectedItem.timeframeChanges[timeframe] >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {inspectedItem.timeframeChanges[timeframe] >= 0 ? '+' : ''}{inspectedItem.timeframeChanges[timeframe]}% ({timeframe})
                </span>
              </div>
            </div>

            {/* DOM Tab Header */}
            <div className="flex items-center space-x-2 border-b border-zinc-800 pb-3 text-xs font-mono">
              <button
                onClick={() => setActiveTabModal('DOM')}
                className={`px-3 py-1.5 rounded-lg transition ${
                  activeTabModal === 'DOM' ? 'bg-indigo-600 text-white font-bold' : 'text-zinc-400 hover:text-white'
                }`}
              >
                DOM Liquidity Walls & Orderbook
              </button>
              <button
                onClick={() => setActiveTabModal('METRICS')}
                className={`px-3 py-1.5 rounded-lg transition ${
                  activeTabModal === 'METRICS' ? 'bg-indigo-600 text-white font-bold' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Institutional Flow & Metrics
              </button>
            </div>

            {/* DOM Liquidity Inspector */}
            {activeTabModal === 'DOM' && (
              <div className="space-y-4 font-mono text-xs">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-zinc-900 p-3 rounded-xl border border-zinc-800">
                    <span className="text-[10px] text-zinc-500 uppercase block">Bid/Ask Liquidity Ratio</span>
                    <span className="text-base font-bold text-emerald-400 block mt-0.5">
                      {inspectedItem.orderbookDepth.bidAskRatio.toFixed(2)} Ratio
                    </span>
                    <span className="text-[10px] text-zinc-400 block">
                      {inspectedItem.orderbookDepth.bidAskRatio > 1.0 ? 'Bid Support Heavy' : 'Ask Wall Overhead'}
                    </span>
                  </div>

                  <div className="bg-zinc-900 p-3 rounded-xl border border-zinc-800">
                    <span className="text-[10px] text-zinc-500 uppercase block">Bid Depth ($M)</span>
                    <span className="text-base font-bold text-emerald-400 block mt-0.5">
                      ${inspectedItem.orderbookDepth.totalBidLiquidityMillions}M
                    </span>
                  </div>

                  <div className="bg-zinc-900 p-3 rounded-xl border border-zinc-800">
                    <span className="text-[10px] text-zinc-500 uppercase block">Ask Depth ($M)</span>
                    <span className="text-base font-bold text-rose-400 block mt-0.5">
                      ${inspectedItem.orderbookDepth.totalAskLiquidityMillions}M
                    </span>
                  </div>

                  <div className="bg-zinc-900 p-3 rounded-xl border border-zinc-800">
                    <span className="text-[10px] text-zinc-500 uppercase block">Bid/Ask Spread</span>
                    <span className="text-base font-bold text-amber-300 block mt-0.5">
                      ${inspectedItem.orderbookDepth.spread.toFixed(2)} ({inspectedItem.orderbookDepth.spreadPct}%)
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-emerald-400 font-bold border-b border-zinc-800 pb-1 text-[11px]">
                      <span>BID SIZE</span>
                      <span>BID PRICE</span>
                    </div>
                    {inspectedItem.orderbookDepth.bids.map((b, idx) => (
                      <div key={idx} className="flex justify-between items-center bg-emerald-950/40 p-2 rounded border border-emerald-800/40">
                        <span className="text-emerald-300 font-bold">{b.size.toLocaleString()} shares</span>
                        <span className="text-white font-bold">${b.price.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between text-rose-400 font-bold border-b border-zinc-800 pb-1 text-[11px]">
                      <span>ASK PRICE</span>
                      <span>ASK SIZE</span>
                    </div>
                    {inspectedItem.orderbookDepth.asks.map((a, idx) => (
                      <div key={idx} className="flex justify-between items-center bg-rose-950/40 p-2 rounded border border-rose-800/40">
                        <span className="text-white font-bold">${a.price.toFixed(2)}</span>
                        <span className="text-rose-300 font-bold">{a.size.toLocaleString()} shares</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="pt-4 border-t border-zinc-800 flex justify-end">
              <button
                onClick={() => {
                  onSelectSymbolForChart(inspectedItem.symbol);
                  setInspectedItem(null);
                }}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 transition"
              >
                <span>View Technical Chart</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
