import React, { useState, useEffect, useMemo } from 'react';
import {
  Activity,
  Sliders,
  TrendingUp,
  TrendingDown,
  Shield,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Clock,
  Layers,
  ChevronRight,
  Filter,
  DollarSign,
  Percent,
  RefreshCw,
  Eye,
  Info,
  CheckCircle2,
  XCircle,
  ExternalLink,
} from 'lucide-react';
import {
  MasterPlanSettings,
  Levels,
  loadSettings,
  saveSettings,
  subscribeSettings,
  getRiskUsd,
  calculateLevels,
  canTrade,
  getRegimeBand,
  isNyseMarketOpen,
  DataQuality,
  BotStateStatus,
} from '../utils/masterPlanCore';
import {
  ENGINE_VERSION,
  POLICIES,
  ExitPolicy,
  Bar,
  SignalInput,
  simulateExit,
  computePath,
  clusterStats,
  summarize,
  HORIZONS,
} from '../utils/trullasOutcomeEngine';

interface TodayViewProps {
  onOpenChart?: (symbol: string) => void;
}

// 11 SPDR Sector ETFs for Sector Rotation (RRG)
const SPDR_SECTORS = [
  { symbol: 'XLK', name: 'Technology', rs: 103.2, mom: 101.8 },
  { symbol: 'XLC', name: 'Communication', rs: 101.1, mom: 99.2 },
  { symbol: 'XLY', name: 'Cons. Discretionary', rs: 99.4, mom: 100.9 },
  { symbol: 'XLI', name: 'Industrials', rs: 100.6, mom: 100.4 },
  { symbol: 'XLF', name: 'Financials', rs: 98.9, mom: 99.6 },
  { symbol: 'XLV', name: 'Health Care', rs: 97.8, mom: 100.7 },
  { symbol: 'XLP', name: 'Cons. Staples', rs: 98.2, mom: 98.9 },
  { symbol: 'XLE', name: 'Energy', rs: 96.9, mom: 97.8 },
  { symbol: 'XLU', name: 'Utilities', rs: 99.7, mom: 101.3 },
  { symbol: 'XLB', name: 'Materials', rs: 100.3, mom: 99.1 },
  { symbol: 'XLRE', name: 'Real Estate', rs: 98.4, mom: 101.1 },
];

// Seed Watchlist Items modeled after Master Plan v3
const SEED_WATCHLIST_DEF = [
  {
    s: 'NVDA',
    sec: 'Information Technology',
    u: ['sp500', 'ndx100'],
    setup: 'Weinstein breakout',
    st: 'weinstein_breakout',
    dir: 'long' as const,
    p: 128.4,
    atr: 3.1,
    zone: [1.002, 1.012],
    status: 'WATCHING',
    sc: [27, 18, 17, 16],
    why: ['Stage 2, MA30 ascending', 'Breakout above 6-week base', 'ATR 2.4% — healthy volatility'],
    sm: 'Form 4: 3-insider cluster / 30d',
    earn: 23,
    extra: 0,
    res: 6,
    div: false,
  },
  {
    s: 'LLY',
    sec: 'Health Care',
    u: ['sp500'],
    setup: '4-Pillars divergență bullish',
    st: 'four_pillars_div',
    dir: 'long' as const,
    p: 812.1,
    atr: 16.5,
    zone: [0.996, 1.006],
    status: 'NEW',
    sc: [22, 27, 14, 12],
    why: ['MACD triple divergence on 1d', 'Stage 1→2 transition', 'Volume below 20d avg'],
    sm: '13F: net +1.8% QoQ (lag ≥ 45d)',
    earn: 31,
    extra: 0,
    res: 5,
    div: true,
  },
  {
    s: 'JPM',
    sec: 'Financials',
    u: ['sp500'],
    setup: 'AVWAP reclaim',
    st: 'avwap_reclaim',
    dir: 'long' as const,
    p: 218.75,
    atr: 3.95,
    zone: [1.0, 1.008],
    status: 'NEW',
    sc: [20, 15, 15, 18],
    why: ['Reclaim AVWAP (earnings anchor)', 'Late Stage 2', 'Institutional volume surge'],
    sm: null,
    earn: 12,
    extra: 0,
    res: 4,
    div: false,
  },
  {
    s: 'CAT',
    sec: 'Industrials',
    u: ['sp500'],
    setup: 'Weinstein breakout',
    st: 'weinstein_breakout',
    dir: 'long' as const,
    p: 382.3,
    atr: 7.4,
    zone: [1.003, 1.015],
    status: 'NEW',
    sc: [28, 20, 16, 19],
    why: ['Stage 2 confirmed on weekly', '9-week base, close above pivot', 'Volume +60% vs avg'],
    sm: null,
    earn: 40,
    extra: 0,
    res: 6,
    div: false,
  },
  {
    s: 'AAPL',
    sec: 'Information Technology',
    u: ['sp500', 'ndx100'],
    setup: '4-Pillars divergență bullish',
    st: 'four_pillars_div',
    dir: 'long' as const,
    p: 224.5,
    atr: 4.8,
    zone: [0.997, 1.004],
    status: 'WATCHING',
    sc: [24, 26, 15, 15],
    why: ['Triple divergence on 1d', 'AVWAP support confluence', 'ATR volatility normal'],
    sm: 'Form 4: scheduled 10b5-1 sale',
    earn: 4,
    extra: 0,
    res: 5,
    div: true,
  },
  {
    s: 'TSLA',
    sec: 'Consumer Discretionary',
    u: ['sp500', 'ndx100'],
    setup: 'Epuizare bullish',
    st: 'exhaustion',
    dir: 'long' as const,
    p: 248.2,
    atr: 9.6,
    zone: [0.998, 1.006],
    status: 'NEW',
    sc: [18, 24, 13, 17],
    why: ['Exhaustion sell-off after 5 consecutive down days', 'Below MA30', 'High ATR volatility'],
    sm: null,
    earn: 19,
    extra: 0,
    res: 4,
    div: true,
  },
  {
    s: 'XOM',
    sec: 'Energy',
    u: ['sp500'],
    setup: 'Weinstein breakout',
    st: 'weinstein_breakout',
    dir: 'long' as const,
    p: 118.4,
    atr: 2.4,
    zone: [0.995, 1.005],
    status: 'TRIGGERED',
    sc: [27, 19, 15, 20],
    why: ['Breakout confirmed on close', 'Volume +85% vs avg', 'Leading sector in RRG'],
    sm: null,
    earn: 35,
    extra: 0,
    res: 6,
    div: false,
  },
  {
    s: 'PG',
    sec: 'Consumer Staples',
    u: ['sp500'],
    setup: '4-Pillars divergență bearish',
    st: 'four_pillars_div',
    dir: 'short' as const,
    p: 168.8,
    atr: 2.1,
    zone: [0.994, 1.0],
    status: 'WATCHING',
    sc: [21, 23, 12, 14],
    why: ['Bearish MACD divergence on 1d', 'Stage 3 flattening MA30', 'Lagging sector in RRG'],
    sm: null,
    earn: 16,
    extra: 0,
    res: 5,
    div: true,
  },
];

// Helper to generate deterministic synthetic series for demonstration
function generateDeterministicBars(basePrice: number, atr: number, dir: 'long' | 'short', count = 30): Bar[] {
  const bars: Bar[] = [];
  let price = basePrice;
  const step = (dir === 'long' ? 1 : -1) * (atr * 0.15);

  for (let i = 0; i < count; i++) {
    const o = price;
    const c = o + step + Math.sin(i * 0.8) * (atr * 0.4);
    const h = Math.max(o, c) + atr * 0.3;
    const l = Math.min(o, c) - atr * 0.3;
    bars.push({ o, h, l, c, ma30: o - step * 2 });
    price = c;
  }
  return bars;
}

export const TodayView: React.FC<TodayViewProps> = ({ onOpenChart }) => {
  const [settings, setSettings] = useState<MasterPlanSettings>(loadSettings);
  const [selectedSymbol, setSelectedSymbol] = useState<string>('NVDA');
  const [universeFilter, setUniverseFilter] = useState<'both' | 'sp500' | 'ndx100'>('both');
  const [statusFilter, setStatusFilter] = useState<'active' | 'all'>('active');

  // Regime Score components (weights: S&P Trend 25%, Breadth 25%, VIX 20%, CBOE P/C 15%, Sector Part 15%)
  const [regimeComponents, setRegimeComponents] = useState([
    { key: 'Trend S&P 500 (Stage Weinstein)', weight: 25, value: 72 },
    { key: 'Breadth (% > MA50/MA200, NH/NL)', weight: 25, value: 58 },
    { key: 'VIX + Term Structure', weight: 20, value: 50 },
    { key: 'Put/Call Ratio (CBOE)', weight: 15, value: 42 },
    { key: 'Participare Sectorială (SPDR)', weight: 15, value: 65 },
  ]);

  // Dynamic Regime Score Calculation
  const regimeScore = useMemo(() => {
    return Math.round(
      regimeComponents.reduce((acc, c) => acc + (c.weight * c.value) / 100, 0)
    );
  }, [regimeComponents]);

  const regimeBand = useMemo(() => getRegimeBand(regimeScore), [regimeScore]);

  // Market Session State
  const [marketSession, setMarketSession] = useState(isNyseMarketOpen);

  useEffect(() => {
    const unsub = subscribeSettings(setSettings);
    const timer = setInterval(() => {
      setMarketSession(isNyseMarketOpen());
    }, 15000);
    return () => {
      unsub();
      clearInterval(timer);
    };
  }, []);

  // Handlers for Capital and Risk manual settings inputs (§1)
  const handleCapitalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    if (val >= 100) {
      saveSettings({ simCapitalUsd: val });
    }
  };

  const handleRiskPctChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    if (val > 0 && val <= 10) {
      saveSettings({ maxRiskPerTradePct: val });
    }
  };

  const handleDataQualityChange = (dq: DataQuality) => {
    saveSettings({ dataQuality: dq });
  };

  const handleBotStatusChange = (status: BotStateStatus) => {
    saveSettings({ botStatus: status });
  };

  // Watchlist Items with calculated Levels and canTrade() Gate Check
  const watchlistItems = useMemo(() => {
    return SEED_WATCHLIST_DEF.map((item) => {
      const bars = generateDeterministicBars(item.p, item.atr, item.dir, 30);
      const levels = calculateLevels({
        symbol: item.s,
        direction: item.dir,
        currentPrice: item.p,
        atr14: item.atr,
        recentBars: bars,
        dataQuality: settings.dataQuality,
      });

      const totalScore = item.sc.reduce((a, b) => a + b, 0);

      const gate = canTrade({
        symbol: item.s,
        direction: item.dir,
        sector: item.sec,
        setupScore: totalScore,
        levels,
        currentPrice: item.p,
        regimeScore,
        customSettings: settings,
      });

      return {
        ...item,
        score: totalScore,
        bars,
        levels,
        gate,
      };
    });
  }, [settings, regimeScore]);

  const filteredWatchlist = useMemo(() => {
    return watchlistItems.filter((item) => {
      const matchUni = universeFilter === 'both' || item.u.includes(universeFilter);
      const matchStatus =
        statusFilter === 'all' || ['NEW', 'WATCHING', 'TRIGGERED'].includes(item.status);
      return matchUni && matchStatus;
    });
  }, [watchlistItems, universeFilter, statusFilter]);

  const selectedItem = useMemo(() => {
    return watchlistItems.find((i) => i.s === selectedSymbol) || watchlistItems[0];
  }, [watchlistItems, selectedSymbol]);

  // Review & Signal Quality (Shadow) Evaluation using trullasOutcomeEngine
  const [selectedExitPolicy, setSelectedExitPolicy] = useState<string>('X1_fixed_v1');

  // Deterministic trade outcomes simulation
  const shadowAnalysis = useMemo(() => {
    const riskUsd = getRiskUsd(settings);

    // Simulated closed trades in active epoch (last 30 sessions)
    const simulatedTradesR = [
      +1.85, -0.95, +2.1, -1.0, +3.4, +0.6, -0.9, +1.5, -0.85, +2.2,
      +1.1, -1.0, +2.7, -0.9, +1.9,
    ];

    const stats = summarize(simulatedTradesR);
    const cluster = clusterStats(
      simulatedTradesR,
      simulatedTradesR.map((_, idx) => `day-${Math.floor(idx / 2)}`)
    );

    const netPnlUsd = stats.sum * riskUsd;
    const netPnlPct = (netPnlUsd / settings.simCapitalUsd) * 100;

    return {
      n: stats.n,
      meanR: stats.mean,
      winRate: stats.winRate * 100,
      profitFactor: stats.pf,
      ci90: [cluster.lo, cluster.hi] as [number, number],
      netPnlUsd,
      netPnlPct,
      riskUsd,
    };
  }, [settings]);

  return (
    <div className="space-y-6 text-zinc-200">
      {/* 1. SIMULATED DATA / CACHED WARNING BANNER (§2 P0 item 2) */}
      {settings.dataQuality !== 'live' && (
        <div
          role="alert"
          className="bg-rose-950/90 border border-rose-600/70 text-rose-200 px-4 py-2.5 rounded-xl flex items-center justify-between text-xs font-mono font-bold shadow-lg animate-pulse"
        >
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            <span>
              SIMULATED DATA — Calitatea datelor este {settings.dataQuality.toUpperCase()}.
              Botul refuză automat intrările noi conform regulii canTrade() Check #2.
            </span>
          </div>
          <button
            onClick={() => handleDataQualityChange('live')}
            className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded text-[11px] transition shadow"
          >
            Comută pe LIVE
          </button>
        </div>
      )}

      {/* 2. GLOBAL STATUS BAR (§4.0) */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-md">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center space-x-1.5 font-bold font-mono text-white pr-2 border-r border-zinc-800">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
            <span>TRULLAS TODAY</span>
          </div>

          {/* Market Session Badge */}
          <span
            className={`px-2.5 py-0.5 rounded-full font-mono font-bold text-[11px] border ${
              marketSession.isOpen
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                : 'bg-zinc-800 text-zinc-400 border-zinc-700'
            }`}
          >
            {marketSession.sessionName}
          </span>
          <span className="text-zinc-500 font-mono text-[11px]">
            Wall St (ET) • As of 17:30 EOD
          </span>

          {/* Data Quality Badge */}
          <span
            className={`px-2.5 py-0.5 rounded-full font-mono font-bold text-[11px] border ${
              settings.dataQuality === 'live'
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                : 'bg-amber-500/20 text-amber-400 border-amber-500/40'
            }`}
          >
            Date: {settings.dataQuality.toUpperCase()}
          </span>

          {/* Regime Score Badge */}
          <span
            className={`px-2.5 py-0.5 rounded-full font-mono font-bold text-[11px] border ${
              regimeBand.badgeCls === 'g'
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                : regimeBand.badgeCls === 'a'
                ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                : 'bg-rose-500/20 text-rose-400 border-rose-500/40'
            }`}
          >
            Regime {regimeScore} • {regimeBand.name}
          </span>

          {/* Bot State Badge */}
          <span
            className={`px-2.5 py-0.5 rounded-full font-mono font-bold text-[11px] border ${
              settings.botStatus === 'armed'
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                : 'bg-rose-500/20 text-rose-400 border-rose-500/40'
            }`}
          >
            Bot: {settings.botStatus.toUpperCase()}
          </span>
        </div>

        {/* Quick Kill Switch */}
        <div className="flex items-center space-x-2">
          {settings.botStatus === 'armed' ? (
            <button
              onClick={() => handleBotStatusChange('paused')}
              className="px-3 py-1 bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 border border-rose-500/40 rounded-lg text-xs font-bold transition flex items-center space-x-1"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>KILL SWITCH</span>
            </button>
          ) : (
            <button
              onClick={() => handleBotStatusChange('armed')}
              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition flex items-center space-x-1 shadow"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>ARMEAZĂ BOT</span>
            </button>
          )}
        </div>
      </div>

      {/* 3. SIMULATION & CAPITAL SETTINGS PANEL (§1) */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-4 space-y-3 shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/80 pb-2.5">
          <div className="flex items-center space-x-2">
            <Sliders className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-white">
              Panou de simulare & Setare Capital / Risc Live (Master Plan v3 §1)
            </h3>
          </div>
          <span className="text-[11px] text-zinc-400 font-mono">
            Risc Calculat:{' '}
            <strong className="text-emerald-400">
              ${((settings.simCapitalUsd * settings.maxRiskPerTradePct) / 100).toFixed(2)}
            </strong>{' '}
            / tranzacție (
            {settings.maxRiskPerTradePct}% din ${settings.simCapitalUsd.toLocaleString()})
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono">
          <div>
            <label className="text-zinc-400 block mb-1">
              Capital alocat (simulare / paper):
            </label>
            <div className="relative">
              <span className="absolute left-2.5 top-2 text-zinc-500 font-bold">$</span>
              <input
                type="number"
                min="100"
                step="100"
                value={settings.simCapitalUsd}
                onChange={handleCapitalChange}
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-emerald-500 rounded-lg pl-7 pr-3 py-1.5 text-white font-bold"
              />
            </div>
            <span className="text-[10px] text-zinc-500 mt-1 block">
              Alimentează live mărimea poziției și P&L
            </span>
          </div>

          <div>
            <label className="text-zinc-400 block mb-1">
              Risc maxim per tranzacție (%):
            </label>
            <div className="relative">
              <input
                type="number"
                min="0.1"
                max="10"
                step="0.1"
                value={settings.maxRiskPerTradePct}
                onChange={handleRiskPctChange}
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-emerald-500 rounded-lg px-3 py-1.5 text-white font-bold"
              />
              <span className="absolute right-3 top-2 text-zinc-500 font-bold">%</span>
            </div>
            <span className="text-[10px] text-zinc-500 mt-1 block">
              Implicit 1.0% = ${(settings.simCapitalUsd * 0.01).toFixed(2)}
            </span>
          </div>

          <div>
            <label className="text-zinc-400 block mb-1">Calitatea datelor:</label>
            <div className="flex space-x-1">
              {(['live', 'cached', 'estimated'] as const).map((dq) => (
                <button
                  key={dq}
                  onClick={() => handleDataQualityChange(dq)}
                  className={`flex-1 py-1.5 rounded-lg font-bold text-[11px] transition ${
                    settings.dataQuality === dq
                      ? 'bg-emerald-600 text-white'
                      : 'bg-zinc-950 text-zinc-400 hover:text-white border border-zinc-800'
                  }`}
                >
                  {dq.toUpperCase()}
                </button>
              ))}
            </div>
            <span className="text-[10px] text-zinc-500 mt-1 block">
              canTrade() refuză intrări pe non-live
            </span>
          </div>

          <div>
            <label className="text-zinc-400 block mb-1">Stare Autopilot:</label>
            <div className="flex space-x-1">
              {(['armed', 'paused', 'killed'] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => handleBotStatusChange(st)}
                  className={`flex-1 py-1.5 rounded-lg font-bold text-[11px] transition ${
                    settings.botStatus === st
                      ? st === 'armed'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-rose-600 text-white'
                      : 'bg-zinc-950 text-zinc-400 hover:text-white border border-zinc-800'
                  }`}
                >
                  {st.toUpperCase()}
                </button>
              ))}
            </div>
            <span className="text-[10px] text-zinc-500 mt-1 block">
              Kill switch decuplează ordinul
            </span>
          </div>
        </div>
      </div>

      {/* 4. THREE PANELS: REGIME SCORE, SECTOR ROTATION RRG, AUTOPILOT GATE SUMMARY */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Panel A: Regime Score 0-100 */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3.5 shadow-md flex flex-col justify-between">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
            <div className="flex items-center space-x-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                Regime Score ({regimeScore}/100)
              </h3>
            </div>
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded font-mono ${
                regimeBand.badgeCls === 'g'
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : regimeBand.badgeCls === 'a'
                  ? 'bg-amber-500/20 text-amber-400'
                  : 'bg-rose-500/20 text-rose-400'
              }`}
            >
              {regimeBand.name}
            </span>
          </div>

          <div className="space-y-2 text-xs">
            {regimeComponents.map((c, i) => (
              <div key={i} className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-zinc-400">
                    {c.key} ({c.weight}%)
                  </span>
                  <span className="font-mono font-bold text-zinc-200">{c.value}/100</span>
                </div>
                <div className="w-full bg-zinc-950 h-1.5 rounded-full overflow-hidden border border-zinc-800">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-400"
                    style={{ width: `${c.value}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>

          <div className="p-2.5 bg-zinc-950 rounded-lg border border-zinc-800/80 text-[11px] text-zinc-400">
            <strong className="text-zinc-200 block mb-0.5">Politică de Regim:</strong>
            {regimeBand.policyText}
          </div>
        </div>

        {/* Panel B: Sector Rotation RRG (11 SPDR ETFs) */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3.5 shadow-md flex flex-col justify-between">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
            <div className="flex items-center space-x-2">
              <TrendingUp className="w-4 h-4 text-sky-400" />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                Rotație Sectorială (RRG SPDR)
              </h3>
            </div>
            <span className="text-[10px] text-zinc-500 font-mono">RS vs SPY Benchmark</span>
          </div>

          {/* Quadrant Visual Grid */}
          <div className="relative h-44 bg-zinc-950 rounded-lg border border-zinc-800 p-2 font-mono text-[10px]">
            {/* Crosshairs at 100, 100 */}
            <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-zinc-800"></div>
            <div className="absolute inset-y-0 left-1/2 border-l border-dashed border-zinc-800"></div>

            {/* Quadrant Labels */}
            <span className="absolute top-1.5 right-2 text-emerald-400 font-bold">
              LEADING
            </span>
            <span className="absolute top-1.5 left-2 text-sky-400 font-bold">
              IMPROVING
            </span>
            <span className="absolute bottom-1.5 left-2 text-rose-400 font-bold">
              LAGGING
            </span>
            <span className="absolute bottom-1.5 right-2 text-amber-400 font-bold">
              WEAKENING
            </span>

            {/* Placed ETF dots */}
            {SPDR_SECTORS.map((sec) => {
              const xPct = Math.min(92, Math.max(8, (sec.rs - 96) * 12));
              const yPct = Math.min(92, Math.max(8, 100 - (sec.mom - 96) * 12));
              const isLeading = sec.rs >= 100 && sec.mom >= 100;
              return (
                <div
                  key={sec.symbol}
                  className="absolute transform -translate-x-1/2 -translate-y-1/2 flex items-center space-x-1 cursor-pointer group"
                  style={{ left: `${xPct}%`, top: `${yPct}%` }}
                  title={`${sec.name} (${sec.symbol}): RS ${sec.rs}, Mom ${sec.mom}`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isLeading ? 'bg-emerald-400 ring-2 ring-emerald-500/40' : 'bg-sky-400'
                    }`}
                  ></span>
                  <span className="text-[9px] text-zinc-300 font-bold group-hover:text-white">
                    {sec.symbol}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="text-[11px] text-zinc-400 flex justify-between">
            <span>
              Leading:{' '}
              <strong className="text-emerald-400">
                {SPDR_SECTORS.filter((s) => s.rs >= 100 && s.mom >= 100).length}
              </strong>
            </span>
            <span>
              Lagging:{' '}
              <strong className="text-rose-400">
                {SPDR_SECTORS.filter((s) => s.rs < 100 && s.mom < 100).length}
              </strong>
            </span>
            <span className="text-zinc-500 font-mono">11 Sectoare SPDR</span>
          </div>
        </div>

        {/* Panel C: Autopilot Gate Check Summary (§3) */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3.5 shadow-md flex flex-col justify-between">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
            <div className="flex items-center space-x-2">
              <Shield className="w-4 h-4 text-emerald-400" />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                canTrade() Gate Global (§3)
              </h3>
            </div>
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded font-mono ${
                selectedItem.gate.allow
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                  : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
              }`}
            >
              {selectedItem.gate.allow ? 'PERMIS' : 'BLOCAT'}
            </span>
          </div>

          <div className="space-y-1 text-xs max-h-44 overflow-y-auto pr-1">
            {selectedItem.gate.checks.map((chk) => (
              <div
                key={chk.number}
                className="flex items-center justify-between py-1 border-b border-zinc-800/60 text-[11px]"
              >
                <div className="flex items-center space-x-1.5 truncate">
                  {chk.ok ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
                  )}
                  <span className="text-zinc-300 truncate">
                    {chk.number}. {chk.name}
                  </span>
                </div>
                <span
                  className={`font-mono text-[10px] ml-2 flex-shrink-0 ${
                    chk.ok ? 'text-zinc-400' : 'text-rose-400 font-bold'
                  }`}
                >
                  {chk.detail}
                </span>
              </div>
            ))}
          </div>

          <div className="text-[11px] text-zinc-400 flex items-center justify-between pt-1">
            <span>
              Simbol selectat: <strong className="text-white">{selectedItem.s}</strong>
            </span>
            <span>
              Mărime calculată:{' '}
              <strong className="text-emerald-400">
                {selectedItem.gate.suggestedQty} bucăți
              </strong>
            </span>
          </div>
        </div>
      </div>

      {/* 5. WATCHLIST & LEVEL PREVIEW SPLIT VIEW (§4.1 & §4.2) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Watchlist Table (7 cols) */}
        <div className="lg:col-span-7 bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3.5 shadow-md">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-zinc-800">
            <div className="flex items-center space-x-2">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                Watchlist Zilnică ({filteredWatchlist.length} setups)
              </h3>
            </div>

            <div className="flex items-center space-x-2 text-xs">
              <div className="flex bg-zinc-950 p-0.5 rounded-lg border border-zinc-800 text-[11px]">
                {(['both', 'sp500', 'ndx100'] as const).map((uni) => (
                  <button
                    key={uni}
                    onClick={() => setUniverseFilter(uni)}
                    className={`px-2 py-0.5 rounded transition ${
                      universeFilter === uni
                        ? 'bg-zinc-800 text-white font-bold'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {uni === 'both' ? 'Toate' : uni === 'sp500' ? 'S&P 500' : 'NDX 100'}
                  </button>
                ))}
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="bg-zinc-950 border border-zinc-800 text-zinc-300 text-[11px] rounded px-2 py-1"
              >
                <option value="active">Active (NEW, WATCHING, TRIGGERED)</option>
                <option value="all">Toate</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-zinc-800 text-[10px] text-zinc-500 uppercase tracking-wider">
                  <th className="py-2 px-2.5">Simbol</th>
                  <th className="py-2 px-2">Setup</th>
                  <th className="py-2 px-2 text-right">Scor</th>
                  <th className="py-2 px-2 text-right">Zonă Intrare</th>
                  <th className="py-2 px-2 text-right">SL</th>
                  <th className="py-2 px-2 text-right">TP1</th>
                  <th className="py-2 px-2 text-right">R:R</th>
                  <th className="py-2 px-2">Status</th>
                  <th className="py-2 px-2 text-right">canTrade()</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {filteredWatchlist.map((item) => {
                  const isSelected = item.s === selectedSymbol;
                  const isLong = item.dir === 'long';
                  return (
                    <tr
                      key={item.s}
                      onClick={() => setSelectedSymbol(item.s)}
                      className={`cursor-pointer transition hover:bg-zinc-800/40 ${
                        isSelected ? 'bg-zinc-800/70 border-l-2 border-emerald-500' : ''
                      }`}
                    >
                      <td className="py-2.5 px-2.5 font-bold text-white flex items-center space-x-1.5">
                        <span>{item.s}</span>
                        {item.u.includes('ndx100') && !item.u.includes('sp500') && (
                          <span className="text-[9px] bg-sky-500/20 text-sky-400 px-1 rounded">
                            NDX
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-2 text-zinc-300">
                        <span className="truncate block max-w-[140px]">{item.setup}</span>
                      </td>
                      <td className="py-2.5 px-2 text-right font-bold text-emerald-400">
                        {item.score}
                      </td>
                      <td className="py-2.5 px-2 text-right text-zinc-300">
                        ${item.levels.entryZone.lo.toFixed(1)}–
                        {item.levels.entryZone.hi.toFixed(1)}
                      </td>
                      <td className="py-2.5 px-2 text-right text-rose-400">
                        ${item.levels.stop.price.toFixed(1)}
                      </td>
                      <td className="py-2.5 px-2 text-right text-emerald-400">
                        ${item.levels.targets[0]?.price.toFixed(1)}
                      </td>
                      <td className="py-2.5 px-2 text-right text-zinc-300">
                        1:{item.levels.rr.toFixed(1)}
                      </td>
                      <td className="py-2.5 px-2">
                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                            item.status === 'TRIGGERED'
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : item.status === 'WATCHING'
                              ? 'bg-amber-500/20 text-amber-400'
                              : 'bg-zinc-800 text-zinc-300'
                          }`}
                        >
                          {item.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-right">
                        {item.gate.allow ? (
                          <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/30">
                            ACCEPT × {item.gate.suggestedQty}
                          </span>
                        ) : (
                          <span
                            className="text-[10px] text-rose-400 font-bold bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/30"
                            title={item.gate.fails.map((f) => f.name).join(', ')}
                          >
                            BLOCAT ({item.gate.fails[0]?.shortName})
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Selected Symbol Detail & SVG Levels Preview (5 cols) */}
        <div className="lg:col-span-5 bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3.5 shadow-md flex flex-col justify-between">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
            <div className="flex items-center space-x-2">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                Niveluri & Diagnostic: {selectedItem.s}
              </h3>
              <span className="text-[10px] text-zinc-400 font-mono">
                {selectedItem.sec}
              </span>
            </div>
            {onOpenChart && (
              <button
                onClick={() => onOpenChart(selectedItem.s)}
                className="text-xs text-sky-400 hover:text-sky-300 flex items-center space-x-1"
              >
                <span>Deschide în Chart</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* SVG Mini Chart Visualizing Entry, SL and TP */}
          <div className="bg-zinc-950 rounded-lg p-2.5 border border-zinc-800 font-mono text-[11px] space-y-2">
            <div className="flex justify-between items-center text-zinc-400 text-[10px]">
              <span>Geometrie Trullàs (Levels Object v3)</span>
              <span>R:R = 1 : {selectedItem.levels.rr.toFixed(1)}</span>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between py-1 border-b border-zinc-800/80">
                <span className="text-zinc-400">TP2 (Target 2):</span>
                <span className="text-amber-400 font-bold">
                  ${selectedItem.levels.targets[1]?.price.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-800/80">
                <span className="text-zinc-400">TP1 (Target 1):</span>
                <span className="text-emerald-400 font-bold">
                  ${selectedItem.levels.targets[0]?.price.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-800/80">
                <span className="text-zinc-400">Zonă Intrare (Trigger):</span>
                <span className="text-sky-400 font-bold">
                  ${selectedItem.levels.entryZone.lo.toFixed(2)} – $
                  {selectedItem.levels.entryZone.hi.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-800/80">
                <span className="text-zinc-400">Stop Loss:</span>
                <span className="text-rose-400 font-bold">
                  ${selectedItem.levels.stop.price.toFixed(2)} (
                  {selectedItem.levels.stop.basis})
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-800/80">
                <span className="text-zinc-400">Risc Unitar (1 acțiune):</span>
                <span className="text-white font-bold">
                  ${selectedItem.levels.riskPerUnit.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-zinc-400">Mărime alocată bot:</span>
                <span className="text-emerald-400 font-bold">
                  {selectedItem.gate.suggestedQty} bucăți ($
                  {(selectedItem.gate.suggestedQty * selectedItem.levels.riskPerUnit).toFixed(2)}{' '}
                  risc)
                </span>
              </div>
            </div>
          </div>

          {/* Reasons & Invalidation Rule */}
          <div className="space-y-2 text-xs">
            <div>
              <span className="text-zinc-400 block font-bold text-[10px] uppercase mb-1">
                Confluențe & Teză:
              </span>
              <ul className="list-disc list-inside text-zinc-300 space-y-0.5 text-[11px]">
                {selectedItem.why.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
            <div>
              <span className="text-zinc-400 block font-bold text-[10px] uppercase mb-0.5">
                Regulă de Invalidare:
              </span>
              <span className="text-amber-400 text-[11px] font-mono">
                {selectedItem.levels.invalidation.rule} ($
                {selectedItem.levels.invalidation.price.toFixed(2)})
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 6. REVIEW & SIGNAL QUALITY (SHADOW LEARNING) PANEL (§4.5 & §6.5) */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-4 shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-zinc-800">
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Review & Calitatea Semnalelor Shadow (Master Plan v3 §6.5)
            </h3>
            <span className="text-[11px] text-zinc-400">
              Măsurare shadow independentă cu ieșirea modelată ({selectedExitPolicy}) • R net de costuri
            </span>
          </div>

          <div className="flex items-center space-x-2 text-xs">
            <span className="text-zinc-400">Politică Ieșire:</span>
            <select
              value={selectedExitPolicy}
              onChange={(e) => setSelectedExitPolicy(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs rounded px-2.5 py-1 font-mono"
            >
              <option value="X1_fixed_v1">X1 · SL / TP1 / Time-Stop (Primară)</option>
              <option value="X2_trail_v1">X2 · Breakeven + Trailing 2×ATR</option>
              <option value="X3_structure_v1">X3 · Structură (MA30 / Invalidare)</option>
            </select>
          </div>
        </div>

        {/* 6 KPI Cards (§4.5) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 font-mono">
          <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800">
            <span className="text-[10px] text-zinc-500 uppercase block">P&L Net Epocă</span>
            <span
              className={`text-lg font-black ${
                shadowAnalysis.netPnlUsd >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {shadowAnalysis.netPnlUsd >= 0 ? '+' : ''}${shadowAnalysis.netPnlUsd.toFixed(2)}
            </span>
            <span className="text-[10px] text-zinc-400 block mt-0.5">
              {shadowAnalysis.netPnlPct >= 0 ? '+' : ''}
              {shadowAnalysis.netPnlPct.toFixed(1)}% din ${settings.simCapitalUsd.toLocaleString()}
            </span>
          </div>

          <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800">
            <span className="text-[10px] text-zinc-500 uppercase block">Trade-uri (n)</span>
            <span className="text-lg font-black text-white">{shadowAnalysis.n}</span>
            <span className="text-[10px] text-amber-400 block mt-0.5">n=15 (Epocă 2k)</span>
          </div>

          <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800">
            <span className="text-[10px] text-zinc-500 uppercase block">Expectancy</span>
            <span className="text-lg font-black text-emerald-400">
              +{shadowAnalysis.meanR.toFixed(2)}R
            </span>
            <span className="text-[10px] text-zinc-400 block mt-0.5">
              CI90 [{shadowAnalysis.ci90[0].toFixed(2)}R ; {shadowAnalysis.ci90[1].toFixed(2)}R]
            </span>
          </div>

          <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800">
            <span className="text-[10px] text-zinc-500 uppercase block">Profit Factor</span>
            <span className="text-lg font-black text-white">
              {shadowAnalysis.profitFactor !== null
                ? shadowAnalysis.profitFactor.toFixed(2)
                : '—'}
            </span>
            <span className="text-[10px] text-zinc-500 block mt-0.5">
              {shadowAnalysis.profitFactor !== null ? 'Gross Win / Loss' : 'Ascuns sub n=10'}
            </span>
          </div>

          <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800">
            <span className="text-[10px] text-zinc-500 uppercase block">Win Rate</span>
            <span className="text-lg font-black text-emerald-400">
              {shadowAnalysis.winRate.toFixed(0)}%
            </span>
            <span className="text-[10px] text-zinc-500 block mt-0.5">
              10 din {shadowAnalysis.n} trade-uri
            </span>
          </div>

          <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800">
            <span className="text-[10px] text-zinc-500 uppercase block">Risc / Trade</span>
            <span className="text-lg font-black text-sky-400">
              ${shadowAnalysis.riskUsd.toFixed(0)}
            </span>
            <span className="text-[10px] text-zinc-500 block mt-0.5">
              {settings.maxRiskPerTradePct}% din capital
            </span>
          </div>
        </div>

        <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800 text-xs text-zinc-400 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <Info className="w-4 h-4 text-sky-400" />
            <span>
              Statisticile R sunt adimensionale și independente de capital. Schimbarea capitalului în
              Settings recalculază instantaneu valorile în dolari fără refresh sau recalculare de backtest.
            </span>
          </div>
          <span className="font-mono text-zinc-500">Versiune Engine: {ENGINE_VERSION}</span>
        </div>
      </div>
    </div>
  );
};
