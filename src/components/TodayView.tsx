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
  clusterStats,
  summarize,
} from '../utils/trullasOutcomeEngine';
import {
  DailyWatchlistItem,
  loadDailyWatchlist,
  subscribeDailyWatchlist,
  loadDailyWatchlistFromFirestore,
} from '../utils/dailyWatchlistStore';
import {
  JournalEntry,
  loadJournalEntries,
  loadJournalEntriesFromFirestore,
} from '../utils/tradeJournal';
import { GicsSectorPerformance } from '../utils/sectorMetrics';
import { calculateStageAnalysis } from '../utils/trendSpiderEngine';
import { SP500_UNIVERSE } from '../data/sp500Universe';
import { useAuth } from '../lib/AuthProvider';

interface TodayViewProps {
  onOpenChart?: (symbol: string) => void;
  scannerResults?: any[];
  onScanNow?: () => void;
}

const NDX_CORE_SET = new Set([
  'NVDA', 'AAPL', 'MSFT', 'AMZN', 'META', 'GOOGL', 'GOOG', 'TSLA', 'AVGO',
  'COST', 'NFLX', 'AMD', 'ADBE', 'CSCO', 'PEP', 'TMUS', 'LIN', 'INTC', 'QCOM', 'INTU',
]);

interface SectorRrgPoint {
  symbol: string;
  name: string;
  rs: number;
  mom: number;
  changePercent: number;
}

interface WatchlistDisplayRow {
  s: string;
  sec: string;
  u: ('sp500' | 'ndx100')[];
  setup: string;
  dir: 'long' | 'short';
  p: number;
  atr: number;
  status: string;
  score: number;
  why: string[];
  levels: Levels;
  gate: ReturnType<typeof canTrade>;
}

export const TodayView: React.FC<TodayViewProps> = ({
  onOpenChart,
  scannerResults = [],
  onScanNow,
}) => {
  const { user } = useAuth();
  const [settings, setSettings] = useState<MasterPlanSettings>(loadSettings);
  const [selectedSymbol, setSelectedSymbol] = useState<string>('');
  const [universeFilter, setUniverseFilter] = useState<'both' | 'sp500' | 'ndx100'>('both');
  const [statusFilter, setStatusFilter] = useState<'active' | 'all'>('active');

  // Live macro & market state
  const [liveSectors, setLiveSectors] = useState<GicsSectorPerformance[]>([]);
  const [cboeOverview, setCboeOverview] = useState<any>(null);
  const [spyStageScore, setSpyStageScore] = useState<number | null>(null);
  const [macroLoading, setMacroLoading] = useState<boolean>(true);
  const [macroError, setMacroError] = useState<string | null>(null);

  // Real user watchlist & journal state
  const [savedWatchlist, setSavedWatchlist] = useState<DailyWatchlistItem[]>(loadDailyWatchlist);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>(loadJournalEntries);

  // Regime Score components derived strictly from live feeds
  const regimeComponents = useMemo(() => {
    const sp500Trend = spyStageScore ?? 0;

    // Breadth from live SPDR sectors advancing & positive weekly performance
    const breadth =
      liveSectors.length > 0
        ? Math.round(
            (liveSectors.filter((s) => s.changePercent >= 0).length / liveSectors.length) * 100
          )
        : 0;

    // VIX + Term Structure score (low VIX & contango VIX9D < VIX < VIX3M = bullish)
    const vix = cboeOverview?.vixIndex;
    const vix3m = cboeOverview?.vix3mIndex;
    let vixScore = 0;
    if (typeof vix === 'number' && Number.isFinite(vix)) {
      const base = Math.max(5, Math.min(95, Math.round(110 - vix * 3)));
      const contangoBonus = typeof vix3m === 'number' && vix3m > vix ? 8 : -5;
      vixScore = Math.max(0, Math.min(100, base + contangoBonus));
    }

    // Put/Call Ratio score (CBOE)
    const pc = cboeOverview?.putCallVolumeRatio;
    let pcScore = 0;
    if (typeof pc === 'number' && Number.isFinite(pc) && pc > 0) {
      pcScore = Math.max(10, Math.min(95, Math.round(115 - pc * 55)));
    }

    // Sector Participation (% of SPDR ETFs outperforming SPY or trending positively on 1W)
    const sectorPart =
      liveSectors.length > 0
        ? Math.round(
            (liveSectors.filter((s) => (s.weekChangePercent ?? s.changePercent) > 0).length /
              liveSectors.length) *
              100
          )
        : 0;

    return [
      { key: 'Trend S&P 500 (Stage Weinstein)', weight: 25, value: sp500Trend, ready: spyStageScore !== null },
      { key: 'Breadth (% Sectoare Pozitive)', weight: 25, value: breadth, ready: liveSectors.length > 0 },
      { key: 'VIX + Term Structure', weight: 20, value: vixScore, ready: typeof vix === 'number' },
      { key: 'Put/Call Ratio (CBOE)', weight: 15, value: pcScore, ready: typeof pc === 'number' },
      { key: 'Participare Sectorială (SPDR)', weight: 15, value: sectorPart, ready: liveSectors.length > 0 },
    ];
  }, [spyStageScore, liveSectors, cboeOverview]);

  const spdrRrgPoints = useMemo<SectorRrgPoint[]>(() => {
    return liveSectors.map((sec) => {
      const rsDelta = typeof sec.rsVsSpy === 'number' ? sec.rsVsSpy : sec.monthChangePercent ?? 0;
      const momDelta = typeof sec.weekChangePercent === 'number' ? sec.weekChangePercent : sec.changePercent;
      return {
        symbol: sec.etf,
        name: sec.name,
        rs: Number((100 + rsDelta).toFixed(2)),
        mom: Number((100 + momDelta).toFixed(2)),
        changePercent: sec.changePercent,
      };
    });
  }, [liveSectors]);

  // Dynamic Regime Score Calculation
  const regimeScore = useMemo(() => {
    return Math.round(
      regimeComponents.reduce((acc, c) => acc + (c.weight * c.value) / 100, 0)
    );
  }, [regimeComponents]);

  const regimeBand = useMemo(() => getRegimeBand(regimeScore), [regimeScore]);

  // Market Session State
  const [marketSession, setMarketSession] = useState(isNyseMarketOpen);

  const fetchLiveMacro = async () => {
    setMacroLoading(true);
    setMacroError(null);
    try {
      const [secRes, cboeRes, spyRes] = await Promise.allSettled([
        fetch('/api/sectors'),
        fetch('/api/cboe/market-overview'),
        fetch('/api/candles?symbol=SPY&timeframe=1wk&range=2y'),
      ]);

      let anyOk = false;
      if (secRes.status === 'fulfilled' && secRes.value.ok) {
        const sData = await secRes.value.json();
        if (Array.isArray(sData.sectors) && sData.sectors.length > 0) {
          setLiveSectors(sData.sectors);
          anyOk = true;
        }
      }

      if (cboeRes.status === 'fulfilled' && cboeRes.value.ok) {
        const cbData = await cboeRes.value.json();
        if (cbData.marketOverview) {
          setCboeOverview(cbData.marketOverview);
          anyOk = true;
        }
      }

      if (spyRes.status === 'fulfilled' && spyRes.value.ok) {
        const spyData = await spyRes.value.json();
        const candles = Array.isArray(spyData.candles) ? spyData.candles : [];
        if (candles.length >= 30) {
          const mapped = candles.map((c: any) => ({
            time: c.dateStr || c.timestamp,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: c.volume || 0,
          }));
          const st = calculateStageAnalysis(mapped);
          const stageScoreMap: Record<string, number> = {
            STAGE_2_ADVANCING: 85,
            STAGE_1_BASING: 58,
            STAGE_3_TOPPING: 42,
            STAGE_4_DECLINING: 18,
          };
          setSpyStageScore(stageScoreMap[st.currentStage] ?? 50);
          anyOk = true;
        }
      }

      if (!anyOk) {
        setMacroError('Feed-urile live macro (Yahoo Finance / CBOE) sunt momentan indisponibile.');
      }
    } catch (err: any) {
      setMacroError(err?.message || 'Eroare la încărcarea telemetriei live macro.');
    } finally {
      setMacroLoading(false);
    }
  };

  useEffect(() => {
    const unsubSettings = subscribeSettings(setSettings);
    const unsubWatchlist = subscribeDailyWatchlist((items) => setSavedWatchlist(items));
    fetchLiveMacro();

    const onRefreshEvent = () => fetchLiveMacro();
    window.addEventListener('market-data-refreshed', onRefreshEvent);
    const timer = setInterval(() => {
      setMarketSession(isNyseMarketOpen());
    }, 15000);

    return () => {
      unsubSettings();
      unsubWatchlist();
      window.removeEventListener('market-data-refreshed', onRefreshEvent);
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    loadDailyWatchlistFromFirestore()
      .then((items) => {
        if (items.length > 0) setSavedWatchlist(items);
      })
      .catch(() => {});
    loadJournalEntriesFromFirestore()
      .then((entries) => {
        setJournalEntries(entries);
      })
      .catch(() => {});
  }, [user]);

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

  // Watchlist Items derived strictly from live Scanner setups + saved Watchlist items
  const watchlistItems = useMemo<WatchlistDisplayRow[]>(() => {
    const spMap = new Map(SP500_UNIVERSE.map((c) => [c.symbol, c]));
    const bySymbol = new Map<string, WatchlistDisplayRow>();

    // 1. Live scanner detections
    for (const r of scannerResults) {
      const sym = (r.symbol || '').toUpperCase();
      if (!sym) continue;
      const mainSetup = r.setups?.[0];
      const currentPrice = Number(r.currentPrice ?? r.price) || Number(mainSetup?.currentPrice) || 0;
      const atr = Number(r.atr) || Number((currentPrice * 0.02).toFixed(2));
      if (currentPrice <= 0) continue;

      const isBear = mainSetup?.type?.includes('BEAR');
      const dir: 'long' | 'short' = isBear ? 'short' : 'long';
      const recentBars = Array.isArray(r.candles)
        ? r.candles.slice(-20).map((c: any) => ({
            o: Number(c.open ?? c.close),
            h: Number(c.high ?? c.close),
            l: Number(c.low ?? c.close),
            c: Number(c.close),
          }))
        : [];

      const levels = calculateLevels({
        symbol: sym,
        direction: dir,
        currentPrice,
        atr14: atr,
        recentBars,
        dataQuality: settings.dataQuality,
      });

      const score = Number(mainSetup?.qualityScore) || 65;
      const sec = r.sector || spMap.get(sym)?.sector || 'Equities';
      const gate = canTrade({
        symbol: sym,
        direction: dir,
        sector: sec,
        setupScore: score,
        levels,
        currentPrice,
        regimeScore,
        customSettings: settings,
      });

      const universe: ('sp500' | 'ndx100')[] = [];
      if (spMap.has(sym)) universe.push('sp500');
      if (NDX_CORE_SET.has(sym)) universe.push('ndx100');
      if (universe.length === 0) universe.push('sp500');

      const why: string[] = [];
      if (mainSetup) {
        why.push(`${mainSetup.type.replace(/_/g, ' ')} pe ${mainSetup.timeframe} (Scor ${score})`);
        if (mainSetup.confluenceChecks?.rsiDivergence) why.push('Divergență RSI confirmată');
        if (mainSetup.confluenceChecks?.volumeExhaustion) why.push('Epuizare volum confirmată');
      }
      why.push(`ATR ${(Number(r.atrPercent) || 0).toFixed(2)}% • Preț live $${currentPrice.toFixed(2)}`);

      bySymbol.set(sym, {
        s: sym,
        sec,
        u: universe,
        setup: mainSetup ? mainSetup.type.replace(/_/g, ' ') : 'Live Divergence Setup',
        dir,
        p: currentPrice,
        atr,
        status: r.setups?.length ? 'TRIGGERED' : 'WATCHING',
        score,
        why,
        levels,
        gate,
      });
    }

    // 2. Saved user watchlist items (without overwriting fresh live scanner rows)
    for (const w of savedWatchlist) {
      const sym = w.symbol.toUpperCase();
      if (bySymbol.has(sym) || w.currentPrice <= 0) continue;
      const atr = w.atr > 0 ? w.atr : Number((w.currentPrice * 0.02).toFixed(2));
      const levels =
        w.levels ||
        calculateLevels({
          symbol: sym,
          direction: w.direction,
          currentPrice: w.currentPrice,
          atr14: atr,
          recentBars: [],
          dataQuality: settings.dataQuality,
        });

      const gate = canTrade({
        symbol: sym,
        direction: w.direction,
        sector: w.sector,
        setupScore: w.totalScore,
        levels,
        currentPrice: w.currentPrice,
        regimeScore,
        customSettings: settings,
      });

      bySymbol.set(sym, {
        s: sym,
        sec: w.sector,
        u: w.universe,
        setup: w.setup,
        dir: w.direction,
        p: w.currentPrice,
        atr,
        status: w.status,
        score: w.totalScore,
        why: w.why.length > 0 ? w.why : [`Saved watchlist item (${w.status})`],
        levels,
        gate,
      });
    }

    return Array.from(bySymbol.values()).sort((a, b) => b.score - a.score);
  }, [scannerResults, savedWatchlist, settings, regimeScore]);

  const filteredWatchlist = useMemo(() => {
    return watchlistItems.filter((item) => {
      const matchUni = universeFilter === 'both' || item.u.includes(universeFilter);
      const matchStatus =
        statusFilter === 'all' || ['NEW', 'WATCHING', 'TRIGGERED'].includes(item.status);
      return matchUni && matchStatus;
    });
  }, [watchlistItems, universeFilter, statusFilter]);

  const selectedItem = useMemo(() => {
    if (watchlistItems.length === 0) return null;
    return watchlistItems.find((i) => i.s === selectedSymbol) || watchlistItems[0];
  }, [watchlistItems, selectedSymbol]);

  // Review & Signal Quality derived strictly from REAL closed trades in user journal
  const [selectedExitPolicy, setSelectedExitPolicy] = useState<string>('X1_fixed_v1');

  const shadowAnalysis = useMemo(() => {
    const riskUsd = getRiskUsd(settings);
    const closed = journalEntries.filter((e) => e.status !== 'OPEN');

    const tradesR: number[] = [];
    const dates: string[] = [];
    let winningTrades = 0;

    for (const t of closed) {
      const unitRisk = Math.abs(t.entryPrice - t.stopLoss);
      const positionRisk = unitRisk > 0 && t.quantity > 0 ? unitRisk * t.quantity : riskUsd;
      const pnl = t.realizedPnL ?? 0;
      const rMultiple = positionRisk > 0 ? pnl / positionRisk : 0;
      tradesR.push(rMultiple);
      dates.push((t.exitDate || t.entryDate || 'unknown').split('T')[0]);
      if (pnl > 0) winningTrades++;
    }

    const stats = summarize(tradesR);
    const cluster = clusterStats(tradesR, dates);
    const netPnlUsd = stats.sum * riskUsd;
    const netPnlPct = settings.simCapitalUsd > 0 ? (netPnlUsd / settings.simCapitalUsd) * 100 : 0;

    return {
      n: stats.n,
      wins: winningTrades,
      meanR: stats.mean,
      winRate: stats.winRate * 100,
      profitFactor: stats.pf,
      ci90: [cluster.lo, cluster.hi] as [number, number],
      netPnlUsd,
      netPnlPct,
      riskUsd,
    };
  }, [settings, journalEntries]);

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
              NON-LIVE MODE — Feed quality is set to {settings.dataQuality.toUpperCase()}.
              Autopilot blocks new entries per canTrade() Check #2.
            </span>
          </div>
          <button
            onClick={() => handleDataQualityChange('live')}
            className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded text-[11px] transition shadow"
          >
            Switch to LIVE
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
            Wall St (ET) • {macroLoading ? 'Syncing Live Feeds...' : macroError ? 'Upstream Unavailable' : 'Live Telemetry'}
          </span>

          {/* Data Quality Badge */}
          <span
            className={`px-2.5 py-0.5 rounded-full font-mono font-bold text-[11px] border ${
              settings.dataQuality === 'live'
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                : 'bg-amber-500/20 text-amber-400 border-amber-500/40'
            }`}
          >
            Feed: {settings.dataQuality.toUpperCase()}
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
              <span>ARM BOT</span>
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
              Capital Allocation & Live Risk Controls (Master Plan v3 §1)
            </h3>
          </div>
          <span className="text-[11px] text-zinc-400 font-mono">
            Computed Risk:{' '}
            <strong className="text-emerald-400">
              ${((settings.simCapitalUsd * settings.maxRiskPerTradePct) / 100).toFixed(2)}
            </strong>{' '}
            / trade (
            {settings.maxRiskPerTradePct}% of ${settings.simCapitalUsd.toLocaleString()})
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono">
          <div>
            <label className="text-zinc-400 block mb-1">
              Allocated Capital (Paper / Sim):
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
              Drives live position sizing &amp; P&amp;L
            </span>
          </div>

          <div>
            <label className="text-zinc-400 block mb-1">
              Max Risk per Trade (%):
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
              Default 1.0% = ${(settings.simCapitalUsd * 0.01).toFixed(2)}
            </span>
          </div>

          <div>
            <label className="text-zinc-400 block mb-1">Data Feed Mode:</label>
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
              canTrade() rejects non-live entries
            </span>
          </div>

          <div>
            <label className="text-zinc-400 block mb-1">Autopilot Status:</label>
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
              Kill switch immediately halts orders
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
            <strong className="text-zinc-200 block mb-0.5">Regime Policy:</strong>
            {regimeBand.policyText}
          </div>
        </div>

        {/* Panel B: Sector Rotation RRG (11 SPDR ETFs) */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3.5 shadow-md flex flex-col justify-between">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
            <div className="flex items-center space-x-2">
              <TrendingUp className="w-4 h-4 text-sky-400" />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                Sector Rotation (RRG SPDR)
              </h3>
            </div>
            <span className="text-[10px] text-zinc-500 font-mono">RS vs SPY Benchmark</span>
          </div>

          {/* Quadrant Visual Grid */}
          <div className="relative h-52 bg-zinc-950 rounded-lg border border-zinc-800 p-2 font-mono text-[10px] overflow-hidden">
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
            {spdrRrgPoints.length === 0 ? (
              <div className="h-full flex items-center justify-center text-zinc-500 text-xs">
                {macroLoading ? 'Loading live SPDR rotation...' : macroError || 'SPDR rotation unavailable'}
              </div>
            ) : (
              spdrRrgPoints.map((sec, sIdx) => {
                const xPct = Math.min(90, Math.max(10, (sec.rs - 96) * 12));
                const baseY = 100 - (sec.mom - 96) * 12;
                const offsetY = (sIdx % 2 === 0 ? -1 : 1) * 1.6;
                const yPct = Math.min(88, Math.max(12, baseY + offsetY));
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
                    <span className="text-[9px] text-zinc-200 font-bold bg-zinc-950/85 px-1 rounded group-hover:text-white">
                      {sec.symbol}
                    </span>
                  </div>
                );
              })
            )}
          </div>

          <div className="text-[11px] text-zinc-400 flex justify-between">
            <span>
              Leading:{' '}
              <strong className="text-emerald-400">
                {spdrRrgPoints.filter((s) => s.rs >= 100 && s.mom >= 100).length}
              </strong>
            </span>
            <span>
              Lagging:{' '}
              <strong className="text-rose-400">
                {spdrRrgPoints.filter((s) => s.rs < 100 && s.mom < 100).length}
              </strong>
            </span>
            <span className="text-zinc-500 font-mono">{spdrRrgPoints.length} Live SPDR Sectors</span>
          </div>
        </div>

        {/* Panel C: Autopilot Gate Check Summary (§3) */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3.5 shadow-md flex flex-col justify-between">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
            <div className="flex items-center space-x-2">
              <Shield className="w-4 h-4 text-emerald-400" />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                canTrade() Global Gate (§3)
              </h3>
            </div>
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded font-mono ${
                !selectedItem
                  ? 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                  : selectedItem.gate.allow
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                  : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
              }`}
            >
              {!selectedItem ? 'PENDING' : selectedItem.gate.allow ? 'ALLOWED' : 'BLOCKED'}
            </span>
          </div>

          {!selectedItem ? (
            <div className="py-10 text-center space-y-3">
              <p className="text-xs text-zinc-400 font-mono">
                No active setups from Live Scanner or Watchlist yet.
              </p>
              {onScanNow && (
                <button
                  onClick={onScanNow}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition"
                >
                  Scan S&amp;P 500 Live
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="space-y-1 text-xs">
                {selectedItem.gate.checks.map((chk) => (
                  <div
                    key={chk.number}
                    className="flex items-center justify-between py-1 border-b border-zinc-800/60 text-[11px]"
                  >
                    <div className="flex items-center space-x-1.5 min-w-0">
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
                  Selected: <strong className="text-white">{selectedItem.s}</strong>
                </span>
                <span>
                  Suggested size:{' '}
                  <strong className="text-emerald-400">
                    {selectedItem.gate.suggestedQty} shares
                  </strong>
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 5. WATCHLIST & LEVEL PREVIEW SPLIT VIEW (§4.1 & §4.2) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Watchlist Table (7 cols) */}
        <div className="lg:col-span-7 bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3.5 shadow-md">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-zinc-800">
            <div className="flex items-center space-x-2">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                Live Daily Watchlist ({filteredWatchlist.length} setups)
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
                    {uni === 'both' ? 'All' : uni === 'sp500' ? 'S&P 500' : 'NDX 100'}
                  </button>
                ))}
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="bg-zinc-950 border border-zinc-800 text-zinc-300 text-[11px] rounded px-2 py-1"
              >
                <option value="active">Active (NEW, WATCHING, TRIGGERED)</option>
                <option value="all">All Statuses</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-zinc-800 text-[10px] text-zinc-500 uppercase tracking-wider">
                  <th className="py-2 px-2.5">Symbol</th>
                  <th className="py-2 px-2">Setup</th>
                  <th className="py-2 px-2 text-right">Score</th>
                  <th className="py-2 px-2 text-right">Entry Zone</th>
                  <th className="py-2 px-2 text-right">SL</th>
                  <th className="py-2 px-2 text-right">TP1</th>
                  <th className="py-2 px-2 text-right">R:R</th>
                  <th className="py-2 px-2">Status</th>
                  <th className="py-2 px-2 text-right">canTrade()</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {filteredWatchlist.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-10 text-center text-zinc-500">
                      No active setups yet. Run Live Scanner or add symbols to your Watchlist.
                    </td>
                  </tr>
                ) : (
                  filteredWatchlist.map((item) => {
                    const isSelected = item.s === (selectedItem?.s ?? '');
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
                            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/30 whitespace-nowrap">
                              ACCEPT &times; {item.gate.suggestedQty}
                            </span>
                          ) : (
                            <span
                              className="text-[10px] text-rose-400 font-bold bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/30 whitespace-nowrap"
                              title={item.gate.fails.map((f) => f.name).join(', ')}
                            >
                              BLOCKED ({item.gate.fails[0]?.shortName})
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Selected Symbol Detail & SVG Levels Preview (5 cols) */}
        <div className="lg:col-span-5 bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3.5 shadow-md flex flex-col justify-between">
          {!selectedItem ? (
            <div className="py-16 text-center space-y-2 text-zinc-500 text-xs font-mono">
              <Eye className="w-6 h-6 mx-auto text-zinc-600" />
              <p>Select a symbol from the Watchlist or wait for Live Scanner Trullàs levels.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                <div className="flex items-center space-x-2">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                    Levels &amp; Diagnostics: {selectedItem.s}
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
                    <span>Open in Chart</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* SVG Mini Chart Visualizing Entry, SL and TP */}
              <div className="bg-zinc-950 rounded-lg p-2.5 border border-zinc-800 font-mono text-[11px] space-y-2">
                <div className="flex justify-between items-center text-zinc-400 text-[10px]">
                  <span>Trullàs Geometry (Levels Object v3)</span>
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
                    <span className="text-zinc-400">Entry Zone (Trigger):</span>
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
                    <span className="text-zinc-400">Unit Risk (1 share):</span>
                    <span className="text-white font-bold">
                      ${selectedItem.levels.riskPerUnit.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-zinc-400">Bot Allocated Size:</span>
                    <span className="text-emerald-400 font-bold">
                      {selectedItem.gate.suggestedQty} shares ($
                      {(selectedItem.gate.suggestedQty * selectedItem.levels.riskPerUnit).toFixed(2)}{' '}
                      risk)
                    </span>
                  </div>
                </div>
              </div>

              {/* Reasons & Invalidation Rule */}
              <div className="space-y-2 text-xs">
                <div>
                  <span className="text-zinc-400 block font-bold text-[10px] uppercase mb-1">
                    Confluence &amp; Thesis:
                  </span>
                  <ul className="list-disc list-inside text-zinc-300 space-y-0.5 text-[11px]">
                    {selectedItem.why.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <span className="text-zinc-400 block font-bold text-[10px] uppercase mb-0.5">
                    Invalidation Rule:
                  </span>
                  <span className="text-amber-400 text-[11px] font-mono">
                    {selectedItem.levels.invalidation.rule} ($
                    {selectedItem.levels.invalidation.price.toFixed(2)})
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 6. REVIEW & SIGNAL QUALITY (SHADOW LEARNING) PANEL (§4.5 & §6.5) */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-4 shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-zinc-800">
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Real Trade Signal Review &amp; Quality (Master Plan v3 §6.5)
            </h3>
            <span className="text-[11px] text-zinc-400">
              Computed strictly from recorded closed journal trades ({selectedExitPolicy}) &bull; Net R after costs
            </span>
          </div>

          <div className="flex items-center space-x-2 text-xs">
            <span className="text-zinc-400">Exit Policy:</span>
            <select
              value={selectedExitPolicy}
              onChange={(e) => setSelectedExitPolicy(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs rounded px-2.5 py-1 font-mono"
            >
              <option value="X1_fixed_v1">X1 &middot; SL / TP1 / Time-Stop (Primary)</option>
              <option value="X2_trail_v1">X2 &middot; Breakeven + Trailing 2&times;ATR</option>
              <option value="X3_structure_v1">X3 &middot; Structure (MA30 / Invalidation)</option>
            </select>
          </div>
        </div>

        {/* 6 KPI Cards (§4.5) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 font-mono">
          <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800">
            <span className="text-[10px] text-zinc-500 uppercase block">Epoch Net P&amp;L</span>
            <span
              className={`text-lg font-black ${
                shadowAnalysis.netPnlUsd >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {shadowAnalysis.netPnlUsd >= 0 ? '+' : ''}${shadowAnalysis.netPnlUsd.toFixed(2)}
            </span>
            <span className="text-[10px] text-zinc-400 block mt-0.5">
              {shadowAnalysis.netPnlPct >= 0 ? '+' : ''}
              {shadowAnalysis.netPnlPct.toFixed(1)}% of ${settings.simCapitalUsd.toLocaleString()}
            </span>
          </div>

          <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800">
            <span className="text-[10px] text-zinc-500 uppercase block">Trades (n)</span>
            <span className="text-lg font-black text-white">{shadowAnalysis.n}</span>
            <span className="text-[10px] text-amber-400 block mt-0.5">
              {shadowAnalysis.n > 0 ? `n=${shadowAnalysis.n} (${settings.activeEpochId})` : '0 closed trades'}
            </span>
          </div>

          <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800">
            <span className="text-[10px] text-zinc-500 uppercase block">Expectancy</span>
            <span className={`text-lg font-black ${shadowAnalysis.meanR >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {shadowAnalysis.n > 0 ? `${shadowAnalysis.meanR >= 0 ? '+' : ''}${shadowAnalysis.meanR.toFixed(2)}R` : '—'}
            </span>
            <span className="text-[10px] text-zinc-400 block mt-0.5">
              {shadowAnalysis.n > 0
                ? `CI90 [${shadowAnalysis.ci90[0].toFixed(2)}R ; ${shadowAnalysis.ci90[1].toFixed(2)}R]`
                : 'Requires ≥ 1 closed trade'}
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
              {shadowAnalysis.profitFactor !== null ? 'Gross Win / Loss' : 'Hidden under n=10'}
            </span>
          </div>

          <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800">
            <span className="text-[10px] text-zinc-500 uppercase block">Win Rate</span>
            <span className="text-lg font-black text-emerald-400">
              {shadowAnalysis.n > 0 ? `${shadowAnalysis.winRate.toFixed(0)}%` : '—'}
            </span>
            <span className="text-[10px] text-zinc-500 block mt-0.5">
              {shadowAnalysis.wins} of {shadowAnalysis.n} trades
            </span>
          </div>

          <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800">
            <span className="text-[10px] text-zinc-500 uppercase block">Risk / Trade</span>
            <span className="text-lg font-black text-sky-400">
              ${shadowAnalysis.riskUsd.toFixed(0)}
            </span>
            <span className="text-[10px] text-zinc-500 block mt-0.5">
              {settings.maxRiskPerTradePct}% of capital
            </span>
          </div>
        </div>

        <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800 text-xs text-zinc-400 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <Info className="w-4 h-4 text-sky-400" />
            <span>
              R-multiples are scale-invariant and independent of capital size. Updating capital in
              Settings dynamically recalculates dollar values without re-running backtests.
            </span>
          </div>
          <span className="font-mono text-zinc-500">Engine Version: {ENGINE_VERSION}</span>
        </div>
      </div>
    </div>
  );
};
