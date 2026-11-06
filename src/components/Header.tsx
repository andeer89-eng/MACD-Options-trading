import React, { useState, useRef, useEffect } from 'react';
import {
  Activity,
  Radio,
  BookOpen,
  LineChart,
  FileText,
  Terminal,
  Bell,
  Volume2,
  VolumeX,
  Play,
  Pause,
  BarChart3,
  Sparkles,
  Compass,
  Code2,
  Grid,
  Send,
  Bookmark,
  PieChart,
  RefreshCw,
  Clock,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  Search,
  Layers,
  Bot,
  Sliders,
  Check,
} from 'lucide-react';

export type ActiveTab =
  | 'action-zones'
  | 'scanner'
  | 'confluence'
  | 'watchlists'
  | 'sectors'
  | 'options'
  | 'chart'
  | 'heatmap'
  | 'backtester'
  | 'luxalgo'
  | 'indicators'
  | 'journal'
  | 'rules'
  | 'sec'
  | 'python'
  | 'alerts'
  | 'health';

export interface TabDefinition {
  id: ActiveTab;
  label: string;
  shortLabel?: string;
  icon: React.ComponentType<{ className?: string }>;
  category: 'scanner' | 'markets' | 'bots' | 'quant' | 'system';
  badge?: string;
  badgeColor?: string;
  color: string;
  description: string;
}

export const ALL_TABS: TabDefinition[] = [
  // Scanner & Setups
  {
    id: 'scanner',
    label: 'Live Scanner',
    shortLabel: 'Scanner',
    icon: Radio,
    category: 'scanner',
    color: 'text-emerald-400',
    description: 'S&P 500 multi-timeframe MACD divergence scanner with ATR volatility filters',
  },
  {
    id: 'confluence',
    label: 'Confluence 360°',
    shortLabel: 'Confluence',
    icon: Sparkles,
    category: 'scanner',
    badge: 'A+',
    badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
    color: 'text-indigo-400',
    description: 'Deterministic 6-angle setup grading matrix combining Trullàs, LuxAlgo & CBOE options',
  },
  {
    id: 'action-zones',
    label: 'Action Zones',
    shortLabel: 'Zones',
    icon: Compass,
    category: 'scanner',
    color: 'text-emerald-400',
    description: 'Dynamic 7-stage trade pipeline from coiled pre-breakout to target scaling',
  },

  // Markets & Options
  {
    id: 'chart',
    label: 'Technical Chart',
    shortLabel: 'Chart',
    icon: LineChart,
    category: 'markets',
    color: 'text-cyan-400',
    description: 'Interactive candlestick charts with MACD, RSI, ATR, and Fibonacci projections',
  },
  {
    id: 'options',
    label: 'CBOE Options',
    shortLabel: 'Options',
    icon: Activity,
    category: 'markets',
    color: 'text-indigo-400',
    description: 'Institutional Net Gamma Exposure (GEX), VIX telemetry, and Black-Scholes Greeks',
  },
  {
    id: 'heatmap',
    label: 'Market Heatmap',
    shortLabel: 'Heatmap',
    icon: Grid,
    category: 'markets',
    color: 'text-amber-400',
    description: 'High-speed WebGL S&P 500 treemap with live divergence density overlay',
  },
  {
    id: 'sectors',
    label: 'Sectors',
    shortLabel: 'Sectors',
    icon: PieChart,
    category: 'markets',
    color: 'text-emerald-400',
    description: '11 GICS sector performance rankings and industry group divergence distribution',
  },
  {
    id: 'watchlists',
    label: 'Watchlists',
    shortLabel: 'Watchlists',
    icon: Bookmark,
    category: 'markets',
    color: 'text-purple-400',
    description: 'Custom constituent collections, CSV import/export, and focus groups',
  },

  // Automated Bots & Journal
  {
    id: 'journal',
    label: 'Trade Journal & Bots',
    shortLabel: 'Journal & Bots',
    icon: BookOpen,
    category: 'bots',
    badge: 'Auto-Pilot',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    color: 'text-emerald-400',
    description: 'Automated Stock Bot ($10k), Options Harvesting Bot ($115k), and Manual Diary',
  },
  {
    id: 'backtester',
    label: 'Backtester',
    shortLabel: 'Backtester',
    icon: BarChart3,
    category: 'bots',
    color: 'text-teal-400',
    description: 'Historical performance simulation with 1% risk rules and scaling curves',
  },

  // Quant & Indicator Suite
  {
    id: 'luxalgo',
    label: 'LuxAlgo Suite',
    shortLabel: 'LuxAlgo',
    icon: Sparkles,
    category: 'quant',
    color: 'text-indigo-400',
    description: 'Order blocks, Fair Value Gaps, Smart Money Concepts & Nadaraya-Watson envelopes',
  },
  {
    id: 'indicators',
    label: 'Indicator Library',
    shortLabel: 'Indicators',
    icon: Code2,
    category: 'quant',
    color: 'text-pink-400',
    description: 'Browse, inspect, and configure mathematical indicator formulas and oscillators',
  },
  {
    id: 'rules',
    label: 'Trullàs Rules',
    shortLabel: 'Rules',
    icon: BookOpen,
    category: 'quant',
    color: 'text-amber-400',
    description: 'David Trullàs complete 4-Pillars strategy manifesto and risk guidelines',
  },

  // System & Data Feeds
  {
    id: 'alerts',
    label: 'Alerts Stream',
    shortLabel: 'Alerts',
    icon: Bell,
    category: 'system',
    color: 'text-rose-400',
    description: 'Live real-time detection notifications with audio chimes and Telegram dispatch',
  },
  {
    id: 'health',
    label: 'System Health',
    shortLabel: 'Health',
    icon: Activity,
    category: 'system',
    color: 'text-emerald-400',
    description: 'Diagnostics, API latency, worker pool telemetry, and memory profiling',
  },
  {
    id: 'sec',
    label: 'SEC EDGAR',
    shortLabel: 'SEC',
    icon: FileText,
    category: 'system',
    color: 'text-violet-400',
    description: 'Direct corporate filing inspection (10-K, 10-Q, 8-K) and institutional ownership',
  },
  {
    id: 'python',
    label: 'Python 24/7',
    shortLabel: 'Python',
    icon: Terminal,
    category: 'system',
    color: 'text-blue-400',
    description: 'Generate standalone background daemon script with systemd and crontab automation',
  },
];

export const CATEGORIES = [
  { id: 'all', label: 'All Modules (17)' },
  { id: 'scanner', label: 'Scanner & Setups' },
  { id: 'markets', label: 'Markets & Options' },
  { id: 'bots', label: 'Bots & Journal' },
  { id: 'quant', label: 'Quant Suite' },
  { id: 'system', label: 'System & Feeds' },
] as const;

interface HeaderProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  isAutoScanning: boolean;
  setIsAutoScanning: (val: boolean) => void;
  soundEnabled: boolean;
  setSoundEnabled: (val: boolean) => void;
  lastScanTime: Date | null;
  activeAlertCount: number;
  onOpenTelegramConfig?: () => void;
  lastRefreshedAt?: Date | null;
  onRefreshMarketData?: () => void;
  isRefreshingData?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  isAutoScanning,
  setIsAutoScanning,
  soundEnabled,
  setSoundEnabled,
  lastScanTime,
  activeAlertCount,
  onOpenTelegramConfig,
  lastRefreshedAt = null,
  onRefreshMarketData,
  isRefreshingData = false,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [showMegaMenu, setShowMegaMenu] = useState<boolean>(false);
  const [showQuickSearch, setShowQuickSearch] = useState<boolean>(false);
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [showMobileDrawer, setShowMobileDrawer] = useState<boolean>(false);
  const [canScrollLeft, setCanScrollLeft] = useState<boolean>(false);
  const [canScrollRight, setCanScrollRight] = useState<boolean>(true);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLButtonElement>(null);

  // Filter tabs for the sub-rail
  const visibleTabs = selectedCategory === 'all'
    ? ALL_TABS
    : ALL_TABS.filter((t) => t.category === selectedCategory);

  // Check scroll positions
  const checkScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
    setCanScrollLeft(scrollLeft > 4);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 4);
  };

  useEffect(() => {
    checkScroll();
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, [visibleTabs]);

  // Auto-scroll active tab into view when activeTab changes
  useEffect(() => {
    if (activeTabRef.current) {
      activeTabRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      });
    }
  }, [activeTab]);

  const handleScroll = (direction: 'left' | 'right') => {
    if (!scrollContainerRef.current) return;
    const delta = direction === 'left' ? -260 : 260;
    scrollContainerRef.current.scrollBy({ left: delta, behavior: 'smooth' });
    setTimeout(checkScroll, 250);
  };

  // Keyboard shortcut Ctrl+K / Cmd+K to open search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowQuickSearch((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const currentTabDef = ALL_TABS.find((t) => t.id === activeTab);

  return (
    <header className="border-b border-zinc-800 bg-zinc-950/95 backdrop-blur-md sticky top-0 z-40 shadow-xl">
      {/* TIER 1: BRAND IDENTITY + CATEGORY SWITCHER + SYSTEM CONTROLS */}
      <div className="w-full max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-15 gap-4">
          {/* Brand & Strategy Identity */}
          <div className="flex items-center space-x-3 shrink-0">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 via-emerald-500 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/10">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-white text-base tracking-tight font-sans">
                  TRULLÀS 24/7
                </span>
                <span className="hidden sm:inline-flex text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  MACD &amp; Options
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 hidden sm:block">
                4-Pillars Divergence &amp; Options Harvesting
              </p>
            </div>
          </div>

          {/* Center Category Selector & Mega-Menu Button (Desktop & Tablet) */}
          <div className="hidden lg:flex items-center space-x-2">
            {/* Mega Menu Button */}
            <button
              onClick={() => setShowMegaMenu(true)}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 transition-colors shadow-sm"
              title="Browse all 17 trading modules in categorized grid"
            >
              <Grid className="w-3.5 h-3.5 text-indigo-400" />
              <span>All Modules (17)</span>
            </button>

            {/* Category Filter Pills */}
            <div className="flex items-center space-x-1 bg-zinc-900/90 p-1 rounded-lg border border-zinc-800/80">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                    selectedCategory === cat.id
                      ? 'bg-zinc-800 text-white shadow-sm font-semibold border border-zinc-700/80'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Quick Search Trigger */}
            <button
              onClick={() => setShowQuickSearch(true)}
              className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 transition-colors"
              title="Quick Jump (Ctrl+K)"
            >
              <Search className="w-3.5 h-3.5 text-zinc-500" />
              <span className="hidden xl:inline text-zinc-400">Search Views</span>
              <kbd className="hidden xl:inline px-1.5 py-0.2 bg-zinc-800 border border-zinc-700 rounded text-[9px] text-zinc-400 font-mono">
                Ctrl+K
              </kbd>
            </button>
          </div>

          {/* Right Controls: Market Feed Time, 24/7 Loop, Sound, Telegram, Mobile Menu */}
          <div className="flex items-center space-x-2 shrink-0">
            {/* Market Data Time & Refresh */}
            <div className="hidden sm:flex items-center space-x-2 bg-zinc-900/90 px-2.5 py-1 rounded-lg border border-zinc-800 text-xs font-mono text-zinc-300">
              <Clock className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <div className="flex flex-col text-[10px] leading-tight">
                <span className="text-zinc-500 uppercase font-sans text-[8px] font-bold tracking-wider">
                  Data Feed
                </span>
                <span className="font-bold text-emerald-400 font-mono">
                  {lastRefreshedAt
                    ? lastRefreshedAt.toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })
                    : 'Live'}
                </span>
              </div>
              {onRefreshMarketData && (
                <button
                  onClick={onRefreshMarketData}
                  disabled={isRefreshingData}
                  className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition disabled:opacity-50 ml-1 border border-zinc-700/60"
                  title="Manually refresh live market feeds"
                >
                  <RefreshCw
                    className={`w-3 h-3 ${isRefreshingData ? 'animate-spin text-indigo-400' : ''}`}
                  />
                </button>
              )}
            </div>

            {/* 24/7 Loop Toggle */}
            <button
              onClick={() => setIsAutoScanning(!isAutoScanning)}
              className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                isAutoScanning
                  ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40 hover:bg-emerald-900/60 shadow-sm shadow-emerald-900/20'
                  : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:bg-zinc-800'
              }`}
              title="Continuous 24/7 background scanning loop"
            >
              <span className="relative flex h-2 w-2">
                {isAutoScanning && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                )}
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 ${
                    isAutoScanning ? 'bg-emerald-500' : 'bg-zinc-500'
                  }`}
                ></span>
              </span>
              <span className="hidden md:inline">
                {isAutoScanning ? '24/7 Loop: ON' : '24/7: PAUSED'}
              </span>
              {isAutoScanning ? <Pause className="w-3 h-3 ml-0.5" /> : <Play className="w-3 h-3 ml-0.5" />}
            </button>

            {/* Sound Mute/Unmute */}
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`p-2 rounded-lg border transition-colors ${
                soundEnabled
                  ? 'bg-zinc-900 text-emerald-400 border-zinc-700'
                  : 'bg-zinc-900 text-zinc-500 border-zinc-800'
              }`}
              title={soundEnabled ? 'Mute alert chime' : 'Enable audio chime on detected setups'}
            >
              {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            </button>

            {/* Telegram Config Button */}
            {onOpenTelegramConfig && (
              <button
                onClick={onOpenTelegramConfig}
                className="p-2 rounded-lg border bg-zinc-900 text-sky-400 border-zinc-800 hover:border-sky-500/50 hover:bg-sky-500/10 transition-colors"
                title="Configure Telegram Alert Bot"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Mobile / Compact Menu Hamburger Button */}
            <button
              onClick={() => setShowMobileDrawer(true)}
              className="lg:hidden p-2 rounded-lg bg-zinc-900 text-zinc-300 border border-zinc-800 hover:bg-zinc-800 hover:text-white transition-colors"
              title="Open Navigation Menu"
            >
              <Menu className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* TIER 2: ADAPTIVE HORIZONTAL MODULE RAIL (Smooth Scroll with Indicators) */}
      <div className="w-full border-t border-zinc-800/80 bg-zinc-950/90 py-1.5 relative">
        <div className="w-full max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 relative flex items-center">
          {/* Left Scroll Arrow */}
          {canScrollLeft && (
            <button
              onClick={() => handleScroll('left')}
              className="absolute left-2 z-20 w-7 h-7 rounded-full bg-zinc-900/95 border border-zinc-700 text-zinc-200 hover:text-white flex items-center justify-center shadow-lg hover:scale-110 transition-all"
              title="Scroll left"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}

          {/* Left Fade Gradient Mask */}
          {canScrollLeft && (
            <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-zinc-950 via-zinc-950/80 to-transparent pointer-events-none z-10" />
          )}

          {/* Scrollable Navigation Rail */}
          <div
            ref={scrollContainerRef}
            onScroll={checkScroll}
            className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar scroll-smooth w-full py-0.5 px-1"
          >
            {visibleTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  ref={isActive ? activeTabRef : undefined}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all shrink-0 ${
                    isActive
                      ? 'bg-zinc-800 text-white shadow-md border border-zinc-700 ring-1 ring-zinc-600/50'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 border border-transparent'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? tab.color : 'text-zinc-400'}`} />
                  <span>{tab.label}</span>

                  {tab.badge && (
                    <span
                      className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                        tab.badgeColor || 'bg-zinc-700 text-zinc-300'
                      }`}
                    >
                      {tab.badge}
                    </span>
                  )}

                  {tab.id === 'alerts' && activeAlertCount > 0 && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 font-mono">
                      {activeAlertCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Right Fade Gradient Mask */}
          {canScrollRight && (
            <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-zinc-950 via-zinc-950/80 to-transparent pointer-events-none z-10" />
          )}

          {/* Right Scroll Arrow */}
          {canScrollRight && (
            <button
              onClick={() => handleScroll('right')}
              className="absolute right-2 z-20 w-7 h-7 rounded-full bg-zinc-900/95 border border-zinc-700 text-zinc-200 hover:text-white flex items-center justify-center shadow-lg hover:scale-110 transition-all"
              title="Scroll right"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* ALL MODULES MEGA-MENU MODAL / DRAWER (Complete 17-Module Directory) */}
      {showMegaMenu && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-4xl w-full p-6 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-emerald-500 flex items-center justify-center text-white">
                  <Grid className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white tracking-tight">
                    Complete Trading System Modules (17)
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Direct institutional access to all technical scanners, market analytics, quant tools, and autotrading bots
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowMegaMenu(false)}
                className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Categorized Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Category 1: Scanner & Setups */}
              <div className="space-y-2">
                <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center space-x-1.5 pb-1 border-b border-zinc-800">
                  <Radio className="w-3.5 h-3.5" />
                  <span>Scanner &amp; Setups</span>
                </div>
                <div className="space-y-1.5">
                  {ALL_TABS.filter((t) => t.category === 'scanner').map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => {
                          setActiveTab(tab.id);
                          setShowMegaMenu(false);
                        }}
                        className={`w-full text-left p-2.5 rounded-xl transition flex items-start space-x-3 ${
                          isActive
                            ? 'bg-zinc-800 border border-zinc-700 text-white shadow-md'
                            : 'bg-zinc-950/60 hover:bg-zinc-800/60 border border-zinc-800/80 text-zinc-300'
                        }`}
                      >
                        <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${tab.color}`} />
                        <div>
                          <div className="flex items-center space-x-1.5">
                            <span className="font-bold text-xs">{tab.label}</span>
                            {tab.badge && (
                              <span className="text-[9px] px-1 rounded bg-indigo-500/20 text-indigo-300 font-bold">
                                {tab.badge}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-zinc-400 mt-0.5 leading-snug">
                            {tab.description}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Category 2: Markets & Analytics */}
              <div className="space-y-2">
                <div className="text-xs font-bold text-cyan-400 uppercase tracking-wider flex items-center space-x-1.5 pb-1 border-b border-zinc-800">
                  <LineChart className="w-3.5 h-3.5" />
                  <span>Markets &amp; Options</span>
                </div>
                <div className="space-y-1.5">
                  {ALL_TABS.filter((t) => t.category === 'markets').map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => {
                          setActiveTab(tab.id);
                          setShowMegaMenu(false);
                        }}
                        className={`w-full text-left p-2.5 rounded-xl transition flex items-start space-x-3 ${
                          isActive
                            ? 'bg-zinc-800 border border-zinc-700 text-white shadow-md'
                            : 'bg-zinc-950/60 hover:bg-zinc-800/60 border border-zinc-800/80 text-zinc-300'
                        }`}
                      >
                        <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${tab.color}`} />
                        <div>
                          <span className="font-bold text-xs">{tab.label}</span>
                          <p className="text-[11px] text-zinc-400 mt-0.5 leading-snug">
                            {tab.description}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Category 3: Automated Trading & Journal */}
              <div className="space-y-2">
                <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center space-x-1.5 pb-1 border-b border-zinc-800">
                  <Bot className="w-3.5 h-3.5" />
                  <span>Bots &amp; Journal</span>
                </div>
                <div className="space-y-1.5">
                  {ALL_TABS.filter((t) => t.category === 'bots').map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => {
                          setActiveTab(tab.id);
                          setShowMegaMenu(false);
                        }}
                        className={`w-full text-left p-2.5 rounded-xl transition flex items-start space-x-3 ${
                          isActive
                            ? 'bg-zinc-800 border border-zinc-700 text-white shadow-md'
                            : 'bg-zinc-950/60 hover:bg-zinc-800/60 border border-zinc-800/80 text-zinc-300'
                        }`}
                      >
                        <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${tab.color}`} />
                        <div>
                          <div className="flex items-center space-x-1.5">
                            <span className="font-bold text-xs">{tab.label}</span>
                            {tab.badge && (
                              <span className="text-[9px] px-1 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                                {tab.badge}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-zinc-400 mt-0.5 leading-snug">
                            {tab.description}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Category 4: Quant Suite */}
                <div className="pt-3">
                  <div className="text-xs font-bold text-pink-400 uppercase tracking-wider flex items-center space-x-1.5 pb-1 border-b border-zinc-800 mb-2">
                    <Code2 className="w-3.5 h-3.5" />
                    <span>Quant Suite</span>
                  </div>
                  <div className="space-y-1.5">
                    {ALL_TABS.filter((t) => t.category === 'quant').map((tab) => {
                      const Icon = tab.icon;
                      const isActive = activeTab === tab.id;
                      return (
                        <button
                          key={tab.id}
                          onClick={() => {
                            setActiveTab(tab.id);
                            setShowMegaMenu(false);
                          }}
                          className={`w-full text-left p-2.5 rounded-xl transition flex items-start space-x-3 ${
                            isActive
                              ? 'bg-zinc-800 border border-zinc-700 text-white shadow-md'
                              : 'bg-zinc-950/60 hover:bg-zinc-800/60 border border-zinc-800/80 text-zinc-300'
                          }`}
                        >
                          <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${tab.color}`} />
                          <div>
                            <span className="font-bold text-xs">{tab.label}</span>
                            <p className="text-[11px] text-zinc-400 mt-0.5 leading-snug">
                              {tab.description}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Category 5: System Telemetry */}
            <div className="pt-2 border-t border-zinc-800">
              <div className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center space-x-1.5 mb-2">
                <Sliders className="w-3.5 h-3.5 text-zinc-500" />
                <span>System &amp; Infrastructure Feeds</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {ALL_TABS.filter((t) => t.category === 'system').map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => {
                        setActiveTab(tab.id);
                        setShowMegaMenu(false);
                      }}
                      className={`text-left p-2.5 rounded-lg border text-xs flex items-center space-x-2 transition ${
                        isActive
                          ? 'bg-zinc-800 border-zinc-700 text-white'
                          : 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:bg-zinc-800/50'
                      }`}
                    >
                      <Icon className={`w-4 h-4 ${tab.color}`} />
                      <span className="font-semibold">{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* QUICK JUMP MODAL (Search with Instant Keyboard Navigation) */}
      {showQuickSearch && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-start justify-center pt-24 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-md w-full shadow-2xl overflow-hidden animate-fadeIn">
            <div className="p-3 border-b border-zinc-800 flex items-center space-x-2">
              <Search className="w-4 h-4 text-zinc-400" />
              <input
                type="text"
                autoFocus
                placeholder="Search modules (e.g., Options, Scanner, Journal)..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-full bg-transparent border-none text-sm text-white placeholder-zinc-500 focus:outline-none"
              />
              <button
                onClick={() => setShowQuickSearch(false)}
                className="text-xs text-zinc-500 hover:text-white px-1.5 py-0.5 rounded bg-zinc-800"
              >
                ESC
              </button>
            </div>

            <div className="max-h-72 overflow-y-auto p-2 space-y-1">
              {ALL_TABS.filter(
                (t) =>
                  t.label.toLowerCase().includes(searchFilter.toLowerCase()) ||
                  t.description.toLowerCase().includes(searchFilter.toLowerCase()) ||
                  t.category.toLowerCase().includes(searchFilter.toLowerCase())
              ).map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setActiveTab(tab.id);
                      setShowQuickSearch(false);
                      setSearchFilter('');
                    }}
                    className={`w-full text-left p-2 rounded-lg flex items-center justify-between text-xs transition ${
                      isActive
                        ? 'bg-emerald-600 text-white font-bold'
                        : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5">
                      <Icon className="w-4 h-4" />
                      <div>
                        <span>{tab.label}</span>
                        <span className="text-[10px] text-zinc-400 ml-2 font-normal">
                          {tab.category.toUpperCase()}
                        </span>
                      </div>
                    </div>
                    {isActive && <Check className="w-4 h-4 text-white" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* MOBILE FULL DRAWER SLIDE-OVER */}
      {showMobileDrawer && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex justify-end">
          <div className="w-full max-w-xs bg-zinc-950 border-l border-zinc-800 h-full p-5 space-y-4 overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <span className="font-bold text-white text-sm">Navigation Menu</span>
              <button
                onClick={() => setShowMobileDrawer(false)}
                className="p-1 rounded bg-zinc-900 text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-1">
              {ALL_TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setActiveTab(tab.id);
                      setShowMobileDrawer(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-between transition ${
                      isActive
                        ? 'bg-zinc-800 text-white border border-zinc-700'
                        : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5">
                      <Icon className={`w-4 h-4 ${tab.color}`} />
                      <span>{tab.label}</span>
                    </div>
                    {tab.badge && (
                      <span className="text-[9px] px-1.5 py-0.2 rounded font-bold uppercase bg-zinc-800 text-zinc-400">
                        {tab.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
