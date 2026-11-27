import React, { useState, useEffect } from 'react';
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
  Menu,
  X,
  Search,
  Layers,
  Check,
  TrendingUp,
} from 'lucide-react';
import { useAuth } from '../lib/AuthProvider';
import { signInWithGoogle, logout } from '../lib/auth';

export type ActiveTab =
  | 'today'
  | 'scanner'
  | 'chart'
  | 'markets'
  | 'options'
  | 'journal'
  | 'quant'
  | 'ops';

export interface TabDefinition {
  id: ActiveTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  description: string;
}

export interface JumpDestination {
  id: string;
  tab: ActiveTab;
  subTab?: string;
  label: string;
  group: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  description: string;
}

export const ALL_TABS: TabDefinition[] = [
  {
    id: 'today',
    label: 'Today',
    icon: Activity,
    color: 'text-emerald-400',
    description: 'Daily rhythm: Market Regime, Sector RRG, canTrade() checks & review',
  },
  {
    id: 'scanner',
    label: 'Scanner',
    icon: Radio,
    color: 'text-emerald-400',
    description: 'Live S&P 500 divergences, Confluence 360°, Action Zones & Watchlists',
  },
  {
    id: 'chart',
    label: 'Charts & SEC',
    icon: LineChart,
    color: 'text-cyan-400',
    description: 'Interactive technical chart studio and live SEC EDGAR filings lookup',
  },
  {
    id: 'markets',
    label: 'Markets',
    icon: Grid,
    color: 'text-amber-400',
    description: 'S&P 500 WebGL heatmap and 11 GICS sector ETF breadth rankings',
  },
  {
    id: 'options',
    label: 'Options',
    icon: TrendingUp,
    color: 'text-indigo-400',
    description: 'CBOE Net Gamma Exposure (GEX), VIX/SKEW & Black-Scholes chain',
  },
  {
    id: 'journal',
    label: 'Bots & Backtest',
    icon: BookOpen,
    color: 'text-emerald-400',
    description: 'Automated Stock & Options bots, Trade Diary & Strategy Backtester',
  },
  {
    id: 'quant',
    label: 'Quant Lab',
    icon: Sparkles,
    color: 'text-indigo-400',
    description: 'Orderflow & SMC Lab, Stage & AVWAP Lab, Factor IC & ML Lab, Indicator Library & Playbook',
  },
  {
    id: 'ops',
    label: 'Ops & Alerts',
    icon: Bell,
    color: 'text-rose-400',
    description: 'Alert stream, System Health diagnostics & standalone Python daemon',
  },
];

export const QUICK_JUMP_TARGETS: JumpDestination[] = [
  {
    id: 'today',
    tab: 'today',
    label: 'Today Command Center',
    group: 'Overview',
    icon: Activity,
    color: 'text-emerald-400',
    description: 'Market regime, RRG rotation, 10-check canTrade() gate & closed-trade review',
  },
  {
    id: 'scanner-live',
    tab: 'scanner',
    subTab: 'live',
    label: 'Live Divergence Scanner',
    group: 'Scanner',
    icon: Radio,
    color: 'text-emerald-400',
    description: 'Multi-timeframe S&P 500 MACD divergence scanner with ATR filters',
  },
  {
    id: 'scanner-confluence',
    tab: 'scanner',
    subTab: 'confluence',
    label: 'Confluence 360° Matrix',
    group: 'Scanner',
    icon: Sparkles,
    color: 'text-indigo-400',
    description: '6-angle deterministic setup grading across divergence, orderflow & CBOE',
  },
  {
    id: 'scanner-zones',
    tab: 'scanner',
    subTab: 'zones',
    label: 'Action Zones Pipeline',
    group: 'Scanner',
    icon: Compass,
    color: 'text-emerald-400',
    description: '7-stage execution pipeline from coiled pre-breakout to scaling',
  },
  {
    id: 'scanner-watchlists',
    tab: 'scanner',
    subTab: 'watchlists',
    label: 'Watchlist Manager',
    group: 'Scanner',
    icon: Bookmark,
    color: 'text-purple-400',
    description: 'Custom symbol baskets, CSV/JSON import/export & quick scan presets',
  },
  {
    id: 'chart-studio',
    tab: 'chart',
    subTab: 'studio',
    label: 'Technical Chart Studio',
    group: 'Charts & SEC',
    icon: LineChart,
    color: 'text-cyan-400',
    description: 'Candlestick & Vela multi-chart with MACD, RSI, NWE & SEC sidebar',
  },
  {
    id: 'chart-sec',
    tab: 'chart',
    subTab: 'sec',
    label: 'SEC EDGAR Search',
    group: 'Charts & SEC',
    icon: FileText,
    color: 'text-violet-400',
    description: 'Direct Form 4 insider & Form 8-K corporate filing search by ticker',
  },
  {
    id: 'markets-heatmap',
    tab: 'markets',
    subTab: 'heatmap',
    label: 'S&P 500 Heatmap',
    group: 'Markets',
    icon: Grid,
    color: 'text-amber-400',
    description: 'Interactive S&P 500 treemap with divergence density overlay',
  },
  {
    id: 'markets-sectors',
    tab: 'markets',
    subTab: 'sectors',
    label: 'GICS Sectors & Breadth',
    group: 'Markets',
    icon: PieChart,
    color: 'text-emerald-400',
    description: '11 SPDR sector ETF rankings, breadth & constituent drilldown',
  },
  {
    id: 'options',
    tab: 'options',
    label: 'CBOE Options & GEX',
    group: 'Options',
    icon: TrendingUp,
    color: 'text-indigo-400',
    description: 'Net Gamma Exposure walls, VIX/SKEW telemetry & Black-Scholes chain',
  },
  {
    id: 'journal-automated',
    tab: 'journal',
    subTab: 'automated',
    label: 'Stocks Auto-Bot (Alpaca)',
    group: 'Bots & Backtest',
    icon: BookOpen,
    color: 'text-emerald-400',
    description: 'Alpaca Paper automated equity execution following 4-Pillars setups',
  },
  {
    id: 'journal-options',
    tab: 'journal',
    subTab: 'options',
    label: 'Options Auto-Bot (Alpaca)',
    group: 'Bots & Backtest',
    icon: Sparkles,
    color: 'text-indigo-400',
    description: 'Alpaca Paper OCC options harvesting and Golden Zone automation',
  },
  {
    id: 'journal-manual',
    tab: 'journal',
    subTab: 'manual',
    label: 'Local Trade Journal',
    group: 'Bots & Backtest',
    icon: BookOpen,
    color: 'text-zinc-300',
    description: 'Synced Alpaca Paper fills, manual trades, R-multiples & CSV export',
  },
  {
    id: 'journal-backtester',
    tab: 'journal',
    subTab: 'backtester',
    label: 'Strategy Backtester',
    group: 'Bots & Backtest',
    icon: BarChart3,
    color: 'text-teal-400',
    description: 'Historical multi-asset divergence backtest & parameter optimizer',
  },
  {
    id: 'quant-luxalgo',
    tab: 'quant',
    subTab: 'luxalgo',
    label: 'Orderflow & SMC Lab',
    group: 'Quant Lab',
    icon: Sparkles,
    color: 'text-indigo-400',
    description: 'Smart Money Concepts, Order Blocks, NWE & PineTS sandbox',
  },
  {
    id: 'quant-trendspider',
    tab: 'quant',
    subTab: 'trendspider',
    label: 'Stage & AVWAP Lab',
    group: 'Quant Lab',
    icon: Compass,
    color: 'text-rose-400',
    description: 'Stan Weinstein Stage 1–4 analysis, Raindrop volume & Auto-AVWAP',
  },
  {
    id: 'quant-ml4t',
    tab: 'quant',
    subTab: 'ml4t',
    label: 'Factor IC & ML Lab',
    group: 'Quant Lab',
    icon: Activity,
    color: 'text-emerald-400',
    description: 'ML4T Spearman Rank IC, Quintile Spread & Walk-Forward Ridge audit',
  },
  {
    id: 'quant-indicators',
    tab: 'quant',
    subTab: 'indicators',
    label: 'Indicator Library',
    group: 'Quant Lab',
    icon: Code2,
    color: 'text-pink-400',
    description: 'Browse and validate Pine/math indicator definitions',
  },
  {
    id: 'quant-rules',
    tab: 'quant',
    subTab: 'rules',
    label: '4-Pillars Divergence Playbook',
    group: 'Quant Lab',
    icon: BookOpen,
    color: 'text-amber-400',
    description: 'Complete multi-oscillator divergence & 1% risk methodology guide',
  },
  {
    id: 'ops-alerts',
    tab: 'ops',
    subTab: 'alerts',
    label: 'Alerts & Webhooks Stream',
    group: 'Ops & Alerts',
    icon: Bell,
    color: 'text-rose-400',
    description: 'Live divergence notifications, chime audio & webhook dispatch',
  },
  {
    id: 'ops-health',
    tab: 'ops',
    subTab: 'health',
    label: 'System Health Telemetry',
    group: 'Ops & Alerts',
    icon: Activity,
    color: 'text-emerald-400',
    description: 'Live upstream feed checks, cache stats & runtime memory profile',
  },
  {
    id: 'ops-python',
    tab: 'ops',
    subTab: 'python',
    label: 'Python Standalone Daemon',
    group: 'Ops & Alerts',
    icon: Terminal,
    color: 'text-blue-400',
    description: 'Run, inspect & deploy standalone Python CLI scanner daemon',
  },
];

interface HeaderProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  onQuickJump?: (tab: ActiveTab, subTab?: string) => void;
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

function AuthButton() {
  const { user } = useAuth();
  return user ? (
    <button
      onClick={() => logout()}
      className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-zinc-900 text-rose-400 border border-zinc-800 hover:border-rose-500/50 hover:bg-rose-500/10 transition-colors whitespace-nowrap shrink-0"
      title="Logout"
    >
      <span>{user.email?.split('@')[0]}</span>
      <X className="w-3.5 h-3.5" />
    </button>
  ) : (
    <button
      onClick={() => signInWithGoogle()}
      className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-500 transition-colors whitespace-nowrap shrink-0"
      title="Sign in with Google"
    >
      <Layers className="w-3.5 h-3.5" />
      <span>Login</span>
    </button>
  );
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  onQuickJump,
  isAutoScanning,
  setIsAutoScanning,
  soundEnabled,
  setSoundEnabled,
  activeAlertCount,
  onOpenTelegramConfig,
  lastRefreshedAt = null,
  onRefreshMarketData,
  isRefreshingData = false,
}) => {
  const [showQuickSearch, setShowQuickSearch] = useState<boolean>(false);
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [showMobileDrawer, setShowMobileDrawer] = useState<boolean>(false);

  // Keyboard shortcut Ctrl+K / Cmd+K to open quick jump
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowQuickSearch((prev) => !prev);
      } else if (e.key === 'Escape') {
        setShowQuickSearch(false);
        setShowMobileDrawer(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleNavigate = (tab: ActiveTab, subTab?: string) => {
    if (onQuickJump) {
      onQuickJump(tab, subTab);
    } else {
      setActiveTab(tab);
    }
  };

  const filteredJumpTargets = QUICK_JUMP_TARGETS.filter(
    (item) =>
      item.label.toLowerCase().includes(searchFilter.toLowerCase()) ||
      item.description.toLowerCase().includes(searchFilter.toLowerCase()) ||
      item.group.toLowerCase().includes(searchFilter.toLowerCase())
  );

  return (
    <>
      <header className="border-b border-zinc-800 bg-zinc-950/95 backdrop-blur-md sticky top-0 z-40 shadow-xl">
      <div className="w-full max-w-[1720px] mx-auto px-3 sm:px-4">
        <div className="flex items-center justify-between min-h-14 py-1.5 gap-2">
          {/* Brand Identity */}
          <button
            type="button"
            onClick={() => handleNavigate('today')}
            className="flex items-center space-x-2 shrink-0 text-left group"
          >
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 via-emerald-500 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/10">
              <Activity className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="flex items-center">
                <span className="font-display font-extrabold text-white text-xs sm:text-sm tracking-tight whitespace-nowrap group-hover:text-emerald-300 transition-colors">
                  StageLedger
                </span>
              </div>
              <p className="text-[10px] text-zinc-400 hidden 2xl:block whitespace-nowrap">
                Pre-Market Swing &amp; Shadow Desk
              </p>
            </div>
          </button>

          {/* Concentrated 8-Tab Workspace Rail (Single Row on Desktop xl+) */}
          <nav
            aria-label="Primary Workspaces"
            className="hidden xl:flex items-center gap-0.5 2xl:gap-1 bg-zinc-900/70 p-1 rounded-xl border border-zinc-800/80 min-w-0"
          >
            {ALL_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleNavigate(tab.id)}
                  title={tab.description}
                  className={`flex items-center gap-1 2xl:gap-1.5 px-2 2xl:px-2.5 py-1.5 rounded-lg text-[11px] 2xl:text-xs font-semibold whitespace-nowrap shrink-0 transition-all ${
                    isActive
                      ? 'bg-zinc-800 text-white shadow-sm border border-zinc-700'
                      : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/40 border border-transparent'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? tab.color : 'text-zinc-400'}`} />
                  <span>{tab.label}</span>
                  {tab.id === 'ops' && activeAlertCount > 0 && (
                    <span className="text-[10px] px-1 py-0 rounded-full font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 font-mono tabular-nums">
                      {activeAlertCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Right Utility Strip */}
          <div className="flex items-center space-x-1 shrink-0">
            {/* Market Data Time & Refresh */}
            <div className="hidden sm:flex items-center space-x-1.5 bg-zinc-900/90 px-2 py-1 rounded-lg border border-zinc-800 text-xs font-mono text-zinc-300 shrink-0">
              <Clock className="w-3 h-3 text-indigo-400 shrink-0" />
              <div className="flex flex-col text-[10px] leading-tight">
                <span className="text-zinc-500 uppercase font-sans text-[8px] font-bold tracking-wider">
                  Feed
                </span>
                <span className="font-bold text-emerald-400 font-mono whitespace-nowrap tabular-nums">
                  {lastRefreshedAt
                    ? lastRefreshedAt.toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false,
                      })
                    : 'Live'}
                </span>
              </div>
              {onRefreshMarketData && (
                <button
                  onClick={onRefreshMarketData}
                  disabled={isRefreshingData}
                  aria-label="Refresh live market feeds"
                  className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition disabled:opacity-50 border border-zinc-700/60"
                  title="Manually refresh live market feeds"
                >
                  <RefreshCw
                    className={`w-3 h-3 ${isRefreshingData ? 'animate-spin text-indigo-400' : ''}`}
                  />
                </button>
              )}
            </div>

            {/* Client Auto-Poll Loop Toggle */}
            <button
              onClick={() => setIsAutoScanning(!isAutoScanning)}
              aria-label={isAutoScanning ? 'Pause 45-second browser auto-poll' : 'Resume 45-second browser auto-poll'}
              className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-all whitespace-nowrap shrink-0 ${
                isAutoScanning
                  ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40 hover:bg-emerald-900/60'
                  : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:bg-zinc-800'
              }`}
              title="Browser-tab polling loop (runs every 45s while tab stays open)"
            >
              <span className="hidden md:inline font-mono tabular-nums">
                {isAutoScanning ? 'Auto-Poll 45s' : 'Paused'}
              </span>
              {isAutoScanning ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            </button>

            {/* Quick Jump Search Trigger (Ctrl+K) */}
            <button
              onClick={() => setShowQuickSearch(true)}
              aria-label="Quick Jump search (Ctrl+K)"
              className="p-1.5 rounded-lg border bg-zinc-900 text-zinc-400 hover:text-white border-zinc-800 hover:bg-zinc-800 transition-colors shrink-0"
              title="Quick Jump to any workspace or tool (Ctrl+K)"
            >
              <Search className="w-3.5 h-3.5" />
            </button>

            {/* Sound Mute/Unmute */}
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              aria-label={soundEnabled ? 'Mute alert chime' : 'Enable alert chime'}
              className={`p-1.5 rounded-lg border transition-colors shrink-0 ${
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
                aria-label="Configure Telegram alert bot"
                className="p-1.5 rounded-lg border bg-zinc-900 text-sky-400 border-zinc-800 hover:border-sky-500/50 hover:bg-sky-500/10 transition-colors shrink-0"
                title="Configure Telegram Alert Bot"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Auth Button */}
            <AuthButton />

            {/* Compact / Tablet / Mobile Menu Drawer Button */}
            <button
              onClick={() => setShowMobileDrawer(true)}
              aria-label="Open navigation menu"
              className="xl:hidden p-1.5 rounded-lg bg-zinc-900 text-zinc-300 border border-zinc-800 hover:bg-zinc-800 hover:text-white transition-colors shrink-0"
              title="Open Navigation Menu"
            >
              <Menu className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
      </header>

      {/* QUICK JUMP MODAL (Searches all 8 workspaces + nested tools) */}
      {showQuickSearch && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-start justify-center pt-20 p-4"
          onClick={() => setShowQuickSearch(false)}
        >
          <div
            className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-lg w-full shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3 border-b border-zinc-800 flex items-center space-x-2">
              <Search className="w-4 h-4 text-zinc-400" />
              <input
                type="text"
                autoFocus
                placeholder="Jump to tool (e.g. Backtester, SEC, Confluence, Weinstein, Python)..."
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

            <div className="max-h-80 overflow-y-auto p-2 space-y-1">
              {filteredJumpTargets.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.tab && !item.subTab;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      handleNavigate(item.tab, item.subTab);
                      setShowQuickSearch(false);
                      setSearchFilter('');
                    }}
                    className={`w-full text-left p-2.5 rounded-lg flex items-center justify-between text-xs transition ${
                      isActive
                        ? 'bg-emerald-600/20 border border-emerald-500/40 text-white font-semibold'
                        : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <Icon className={`w-4 h-4 shrink-0 ${item.color}`} />
                      <div className="truncate">
                        <span className="font-semibold">{item.label}</span>
                        <span className="text-[10px] text-zinc-400 ml-2 font-mono uppercase">
                          {item.group}
                        </span>
                      </div>
                    </div>
                    {isActive && <Check className="w-4 h-4 text-emerald-400 shrink-0" />}
                  </button>
                );
              })}
              {filteredJumpTargets.length === 0 && (
                <div className="p-6 text-center text-xs text-zinc-500">
                  No workspace or tool matching &quot;{searchFilter}&quot;.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* RESPONSIVE DRAWER (< xl) */}
      {showMobileDrawer && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex justify-end"
          onClick={() => setShowMobileDrawer(false)}
        >
          <div
            className="w-full max-w-xs bg-zinc-950 border-l border-zinc-800 h-full p-5 space-y-4 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <span className="font-bold text-white text-sm">Workspaces (8)</span>
              <button
                onClick={() => setShowMobileDrawer(false)}
                aria-label="Close navigation menu"
                className="p-1.5 rounded bg-zinc-900 text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-1.5">
              {ALL_TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      handleNavigate(tab.id);
                      setShowMobileDrawer(false);
                    }}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-semibold flex items-center justify-between transition ${
                      isActive
                        ? 'bg-zinc-800 text-white border border-zinc-700'
                        : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5">
                      <Icon className={`w-4 h-4 ${tab.color}`} />
                      <div>
                        <div>{tab.label}</div>
                        <div className="text-[10px] font-normal text-zinc-500 line-clamp-1">
                          {tab.description}
                        </div>
                      </div>
                    </div>
                    {tab.id === 'ops' && activeAlertCount > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-rose-500/20 text-rose-300 font-mono">
                        {activeAlertCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
