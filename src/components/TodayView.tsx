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
  Cloud,
  CloudOff,
  ArrowUpDown,
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
  loadUserBotStateFromFirestore,
  saveUserBotStateToFirestore,
  mergeCloudUserBotSettings,
} from '../utils/masterPlanCore';
import {
  ENGINE_VERSION,
  clusterStats,
  summarize,
} from '../utils/trullasOutcomeEngine';
import { fetchJsonSafe } from '../utils/safeFetchJson';
import {
  buildShadowAuditReport,
  ShadowAuditReport,
} from '../utils/shadowAudit';
import type { Candle } from '../utils/trullasStrategy';
import { useMarketHealth } from '../hooks/useMarketHealth';
import { MarketHealthGaugePanel } from './MarketHealthGaugePanel';
import {
  DailyWatchlistItem,
  loadDailyWatchlist,
  saveDailyWatchlist,
  subscribeDailyWatchlist,
  loadDailyWatchlistFromFirestore,
  mergeDailyWatchlists,
  normalizeThesisLine,
} from '../utils/dailyWatchlistStore';
import {
  JournalEntry,
  loadJournalEntries,
  loadJournalEntriesFromFirestore,
  mergeJournalEntries,
} from '../utils/tradeJournal';
import { GicsSectorPerformance } from '../utils/sectorMetrics';
import { calculateStageAnalysis } from '../utils/trendSpiderEngine';
import { computeLevelLadderGeometry } from '../utils/levelGeometry';
import { SP500_UNIVERSE } from '../data/sp500Universe';
import { useAuth } from '../lib/AuthProvider';
import {
  buildDualMarketLeaderboards,
  HIGH_CONVICTION_MIN_SCORE,
  ConvictionGrade,
  scoreToConvictionGrade,
} from '../utils/watchlistRankingEngine';
import {
  recordTop50PresenceSnapshot,
  PresenceAnnotation,
  getTradingDateKey,
} from '../utils/watchlistPersistenceTracker';

interface TodayViewProps {
  onOpenChart?: (symbol: string) => void;
  scannerResults?: any[];
  onScanNow?: () => void;
}

interface SectorRrgPoint {
  symbol: string;
  name: string;
  rs: number;
  mom: number;
  changePercent: number;
}

interface WatchlistDisplayRow {
  rank: number;
  s: string;
  sec: string;
  u: ('sp500' | 'ndx100')[];
  setup: string;
  dir: 'long' | 'short';
  p: number;
  atr: number;
  status: string;
  score: number;
  grade: ConvictionGrade;
  relPerfVsSpyPct: number | null;
  daysInWatchlist: number;
  consecutiveDays: number;
  firstSeenDate: string;
  bestRank: number;
  rankDelta: number | null;
  isNewToday: boolean;
  stageLabel: string;
  why: string[];
  levels: Levels;
  gate: ReturnType<typeof canTrade>;
}

type WatchlistSortKey = 'score' | 'days' | 'alpha' | 'rr' | 'symbol';

export const TodayView: React.FC<TodayViewProps> = ({
  onOpenChart,
  scannerResults = [],
  onScanNow,
}) => {
  const { user } = useAuth();
  const [settings, setSettings] = useState<MasterPlanSettings>(loadSettings);
  const [cloudSyncState, setCloudSyncState] = useState<'local' | 'syncing' | 'synced' | 'error'>(
    user ? 'syncing' : 'local'
  );
  const cloudHydratedRef = React.useRef<boolean>(false);
  const syncTimerRef = React.useRef<number | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState<string>('');
  const [universeFilter, setUniverseFilter] = useState<'both' | 'sp500' | 'ndx100'>('both');
  const [directionView, setDirectionView] = useState<'long' | 'short'>('long');
  const [gradeGate, setGradeGate] = useState<'strong' | 'includeC' | 'saved'>('strong');
  const [sortBy, setSortBy] = useState<WatchlistSortKey>('score');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const [presenceMap, setPresenceMap] = useState<Map<string, PresenceAnnotation>>(new Map());

  // Live macro & market state
  const [liveSectors, setLiveSectors] = useState<GicsSectorPerformance[]>([]);
  const [cboeOverview, setCboeOverview] = useState<any>(null);
  const [spyStageScore, setSpyStageScore] = useState<number | null>(null);
  const [macroLoading, setMacroLoading] = useState<boolean>(true);
  const [macroError, setMacroError] = useState<string | null>(null);
  const {
    report: marketHealth,
    loading: marketHealthLoading,
    error: marketHealthError,
    refresh: refreshMarketHealth,
  } = useMarketHealth();

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
      { key: 'S&P 500 Trend (Weinstein Stage)', weight: 25, value: sp500Trend, ready: spyStageScore !== null },
      { key: 'Market Breadth (% Positive Sectors)', weight: 25, value: breadth, ready: liveSectors.length > 0 },
      { key: 'VIX + Term Structure', weight: 20, value: vixScore, ready: typeof vix === 'number' },
      { key: 'Put/Call Ratio (CBOE)', weight: 15, value: pcScore, ready: typeof pc === 'number' },
      { key: 'Sector Participation (SPDR)', weight: 15, value: sectorPart, ready: liveSectors.length > 0 },
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

  // Dynamic Regime Score Calculation (unified with real 1M Market Health + VIX + Net Flow when available)
  const regimeScore = useMemo(() => {
    if (marketHealth && marketHealth.isLive) {
      return marketHealth.current.score;
    }
    return Math.round(
      regimeComponents.reduce((acc, c) => acc + (c.weight * c.value) / 100, 0)
    );
  }, [marketHealth, regimeComponents]);

  // Keep Panel A bars synchronized with the active source driving regimeScore
  const activeRegimeBars = useMemo(() => {
    if (marketHealth && marketHealth.isLive) {
      return [
        { key: 'SPY Trend & Momentum', weight: 25, value: marketHealth.current.momentumScore, ready: true },
        { key: 'VIX & Term Structure', weight: 25, value: marketHealth.current.vixScore, ready: true },
        { key: 'Net Buying vs Selling Vol', weight: 25, value: marketHealth.current.volumeScore, ready: true },
        { key: 'Sector Breadth & Safe-Haven', weight: 25, value: marketHealth.current.breadthScore, ready: true },
      ];
    }
    return regimeComponents;
  }, [marketHealth, regimeComponents]);

  const regimeBand = useMemo(() => getRegimeBand(regimeScore), [regimeScore]);

  // Market Session State
  const [marketSession, setMarketSession] = useState(isNyseMarketOpen);

  const fetchLiveMacro = async () => {
    setMacroLoading(true);
    setMacroError(null);
    try {
      const [secRes, cboeRes, spyRes] = await Promise.all([
        fetchJsonSafe<{ sectors?: any[] }>('/api/sectors'),
        fetchJsonSafe<{ marketOverview?: any }>('/api/cboe/market-overview'),
        fetchJsonSafe<{ candles?: any[] }>('/api/candles?symbol=SPY&timeframe=1wk&range=2y'),
      ]);

      let anyOk = false;
      if (secRes.ok && secRes.data) {
        const sData = secRes.data;
        if (Array.isArray(sData.sectors) && sData.sectors.length > 0) {
          setLiveSectors(sData.sectors);
          anyOk = true;
        }
      }

      if (cboeRes.ok && cboeRes.data) {
        const cbData = cboeRes.data;
        if (cbData.marketOverview) {
          setCboeOverview(cbData.marketOverview);
          anyOk = true;
        }
      }

      if (spyRes.ok && spyRes.data) {
        const spyData = spyRes.data;
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
        setMacroError('Live macro feeds (Yahoo Finance / CBOE) are currently unavailable.');
      }
    } catch (err: any) {
      setMacroError(err?.message || 'Failed to load live macro telemetry.');
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
    if (!user) {
      cloudHydratedRef.current = false;
      setCloudSyncState('local');
      if (syncTimerRef.current !== null) {
        window.clearTimeout(syncTimerRef.current);
        syncTimerRef.current = null;
      }
      return;
    }

    let active = true;
    cloudHydratedRef.current = false;
    setCloudSyncState('syncing');

    loadUserBotStateFromFirestore()
      .then(async (remote) => {
        if (!active) return;
        const local = loadSettings();
        if (remote) {
          const merged = mergeCloudUserBotSettings(local, remote);
          saveSettings(merged);
          setSettings(merged);
          setCloudSyncState('synced');
        } else {
          await saveUserBotStateToFirestore(local);
          if (active) setCloudSyncState('synced');
        }
        cloudHydratedRef.current = true;
      })
      .catch(() => {
        if (!active) return;
        cloudHydratedRef.current = true;
        setCloudSyncState('error');
      });

    loadDailyWatchlistFromFirestore()
      .then((items) => {
        if (!active || items.length === 0) return;
        const merged = mergeDailyWatchlists(loadDailyWatchlist(), items);
        saveDailyWatchlist(merged);
        setSavedWatchlist(merged);
      })
      .catch(() => {});
    loadJournalEntriesFromFirestore()
      .then((entries) => {
        if (!active || entries.length === 0) return;
        setJournalEntries(mergeJournalEntries(loadJournalEntries(), entries));
      })
      .catch(() => {});
    return () => {
      active = false;
      if (syncTimerRef.current !== null) {
        window.clearTimeout(syncTimerRef.current);
        syncTimerRef.current = null;
      }
    };
  }, [user]);

  const scheduleCloudSync = (nextSettings: MasterPlanSettings) => {
    if (!user || !cloudHydratedRef.current) return;
    if (syncTimerRef.current !== null) {
      window.clearTimeout(syncTimerRef.current);
    }
    setCloudSyncState('syncing');
    syncTimerRef.current = window.setTimeout(() => {
      syncTimerRef.current = null;
      saveUserBotStateToFirestore(nextSettings)
        .then((res) => {
          setCloudSyncState(res.synced ? 'synced' : 'local');
        })
        .catch(() => {
          setCloudSyncState('error');
        });
    }, 500);
  };

  // Handlers for Capital and Risk manual settings inputs (§1)
  const handleCapitalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    if (val >= 100) {
      const updated = saveSettings({ simCapitalUsd: val });
      scheduleCloudSync(updated);
    }
  };

  const handleRiskPctChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    if (val > 0 && val <= 10) {
      const updated = saveSettings({ maxRiskPerTradePct: val });
      scheduleCloudSync(updated);
    }
  };

  const handleDataQualityChange = (dq: DataQuality) => {
    saveSettings({ dataQuality: dq });
  };

  const handleBotStatusChange = (status: BotStateStatus) => {
    const updated = saveSettings({ botStatus: status });
    scheduleCloudSync(updated);
  };

  // Unified Top-50 Bullish & Bearish leaderboards (excludes Grade C/D noise unless explicitly requested)
  const leaderboards = useMemo(() => {
    const minScore = gradeGate === 'includeC' ? 55 : HIGH_CONVICTION_MIN_SCORE;
    return buildDualMarketLeaderboards(scannerResults, {
      minScore,
      maxItems: 50,
    });
  }, [scannerResults, gradeGate]);

  const strictLeaderboards = useMemo(() => {
    return buildDualMarketLeaderboards(scannerResults, {
      minScore: HIGH_CONVICTION_MIN_SCORE,
      maxItems: 50,
    });
  }, [scannerResults]);

  // Persist daily Top-50 presence history & streak counts strictly from high-conviction Top-50
  useEffect(() => {
    const nextMap = new Map<string, PresenceAnnotation>();
    if (strictLeaderboards.bullish.length > 0) {
      const bullPresence = recordTop50PresenceSnapshot(
        strictLeaderboards.bullish.map((l) => ({ symbol: l.symbol, rank: l.rank, score: l.score })),
        'long'
      );
      for (const [sym, ann] of bullPresence.entries()) {
        nextMap.set(`long:${sym}`, ann);
      }
    }
    if (strictLeaderboards.bearish.length > 0) {
      const bearPresence = recordTop50PresenceSnapshot(
        strictLeaderboards.bearish.map((l) => ({ symbol: l.symbol, rank: l.rank, score: l.score })),
        'short'
      );
      for (const [sym, ann] of bearPresence.entries()) {
        nextMap.set(`short:${sym}`, ann);
      }
    }
    if (nextMap.size > 0) {
      setPresenceMap(nextMap);
    }
  }, [strictLeaderboards]);

  const handleHeaderSort = (key: WatchlistSortKey) => {
    if (sortBy === key) {
      setSortDir((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortBy(key);
      setSortDir(key === 'symbol' ? 'asc' : 'desc');
    }
  };

  // Watchlist Items derived strictly from Top-50 Bullish/Bearish high-conviction leaders (or saved items)
  const watchlistItems = useMemo<WatchlistDisplayRow[]>(() => {
    const todayKey = getTradingDateKey();

    if (gradeGate === 'saved') {
      const savedRows: WatchlistDisplayRow[] = [];
      savedWatchlist.forEach((w, idx) => {
        const sym = w.symbol.toUpperCase();
        if (!sym || w.currentPrice <= 0) return;
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
        const { grade } = scoreToConvictionGrade(w.totalScore);
        const pres = presenceMap.get(`${w.direction}:${sym}`);
        savedRows.push({
          rank: idx + 1,
          s: sym,
          sec: w.sector,
          u: w.universe,
          setup: w.setup,
          dir: w.direction,
          p: w.currentPrice,
          atr,
          status: w.status,
          score: w.totalScore,
          grade,
          relPerfVsSpyPct: null,
          daysInWatchlist: pres?.daysInWatchlist ?? 1,
          consecutiveDays: pres?.consecutiveDays ?? 1,
          firstSeenDate: pres?.firstSeenDate ?? todayKey,
          bestRank: pres?.bestRank ?? idx + 1,
          rankDelta: pres?.rankDelta ?? null,
          isNewToday: pres?.isNewToday ?? true,
          stageLabel: 'Saved Watchlist',
          why: w.why.length > 0 ? w.why.map(normalizeThesisLine) : [`Saved watchlist item (${w.status})`],
          levels,
          gate,
        });
      });
      return savedRows.sort((a, b) => b.score - a.score).slice(0, 50);
    }

    const activeList = directionView === 'long' ? leaderboards.bullish : leaderboards.bearish;
    return activeList.map((leader) => {
      const recentBars = Array.isArray(leader.candles)
        ? leader.candles.slice(-20).map((c) => ({
            o: Number(c.open ?? c.close),
            h: Number(c.high ?? c.close),
            l: Number(c.low ?? c.close),
            c: Number(c.close),
          }))
        : [];

      const levels = calculateLevels({
        symbol: leader.symbol,
        direction: leader.direction,
        currentPrice: leader.currentPrice,
        atr14: leader.atr,
        recentBars,
        dataQuality: settings.dataQuality,
      });

      const gate = canTrade({
        symbol: leader.symbol,
        direction: leader.direction,
        sector: leader.sector,
        setupScore: leader.score,
        levels,
        currentPrice: leader.currentPrice,
        regimeScore,
        customSettings: settings,
      });

      const pres = presenceMap.get(`${leader.direction}:${leader.symbol}`);
      return {
        rank: leader.rank,
        s: leader.symbol,
        sec: leader.sector,
        u: leader.universe,
        setup: leader.primarySetup,
        dir: leader.direction,
        p: leader.currentPrice,
        atr: leader.atr,
        status: leader.hasDivergence ? 'TRIGGERED' : 'COILED',
        score: leader.score,
        grade: leader.grade,
        relPerfVsSpyPct: leader.relPerfVsSpyPct,
        daysInWatchlist: pres?.daysInWatchlist ?? 1,
        consecutiveDays: pres?.consecutiveDays ?? 1,
        firstSeenDate: pres?.firstSeenDate ?? todayKey,
        bestRank: pres?.bestRank ?? leader.rank,
        rankDelta: pres?.rankDelta ?? null,
        isNewToday: pres?.isNewToday ?? true,
        stageLabel: leader.stageLabel,
        why: leader.why,
        levels,
        gate,
      };
    });
  }, [gradeGate, savedWatchlist, directionView, leaderboards, settings, regimeScore, presenceMap]);

  const filteredWatchlist = useMemo(() => {
    const filtered = watchlistItems.filter((item) => {
      return universeFilter === 'both' || item.u.includes(universeFilter);
    });
    const mult = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'days': {
          if (a.daysInWatchlist !== b.daysInWatchlist) {
            return (a.daysInWatchlist - b.daysInWatchlist) * mult;
          }
          if (a.consecutiveDays !== b.consecutiveDays) {
            return (a.consecutiveDays - b.consecutiveDays) * mult;
          }
          return (a.score - b.score) * mult;
        }
        case 'alpha': {
          const aVal = a.relPerfVsSpyPct !== null ? (a.dir === 'long' ? a.relPerfVsSpyPct : -a.relPerfVsSpyPct) : -999;
          const bVal = b.relPerfVsSpyPct !== null ? (b.dir === 'long' ? b.relPerfVsSpyPct : -b.relPerfVsSpyPct) : -999;
          if (aVal !== bVal) return (aVal - bVal) * mult;
          return b.score - a.score;
        }
        case 'rr': {
          if (a.levels.rr !== b.levels.rr) return (a.levels.rr - b.levels.rr) * mult;
          return b.score - a.score;
        }
        case 'symbol':
          return a.s.localeCompare(b.s) * mult;
        case 'score':
        default: {
          if (a.score !== b.score) return (a.score - b.score) * mult;
          return a.rank - b.rank;
        }
      }
    });
  }, [watchlistItems, universeFilter, sortBy, sortDir]);

  const selectedItem = useMemo(() => {
    if (filteredWatchlist.length === 0) return null;
    return filteredWatchlist.find((i) => i.s === selectedSymbol) || filteredWatchlist[0];
  }, [filteredWatchlist, selectedSymbol]);

  // Review & Signal Quality derived strictly from REAL closed trades in user journal
  const [selectedExitPolicy, setSelectedExitPolicy] = useState<string>('X1_fixed_v1');
  const [shadowAuditLoading, setShadowAuditLoading] = useState<boolean>(false);
  const [shadowAuditError, setShadowAuditError] = useState<string | null>(null);
  const [shadowCandleCache, setShadowCandleCache] = useState<Record<string, Candle[]> | null>(null);

  const shadowAuditReport = useMemo<ShadowAuditReport | null>(() => {
    if (!shadowCandleCache) return null;
    return buildShadowAuditReport(shadowCandleCache, selectedExitPolicy);
  }, [shadowCandleCache, selectedExitPolicy]);

  const runLiveShadowAudit = async () => {
    setShadowAuditLoading(true);
    setShadowAuditError(null);
    const benchmarkSymbols = ['SPY', 'QQQ', 'NVDA', 'AAPL', 'MSFT'];
    try {
      const responses = await Promise.allSettled(
        benchmarkSymbols.map(async (sym) => {
          const resp = await fetchJsonSafe<{ candles?: Candle[] }>(
            `/api/candles?symbol=${encodeURIComponent(sym)}&timeframe=1d&range=2y`
          );
          if (!resp.ok || !resp.data) throw new Error(resp.error || `HTTP ${resp.status} for ${sym}`);
          const candles: Candle[] = Array.isArray(resp.data.candles) ? resp.data.candles : [];
          return { sym, candles };
        })
      );
      const nextMap: Record<string, Candle[]> = {};
      for (const r of responses) {
        if (r.status === 'fulfilled' && r.value.candles.length >= 40) {
          nextMap[r.value.sym] = r.value.candles;
        }
      }
      if (Object.keys(nextMap).length === 0) {
        setShadowAuditError('Historical candles temporarily unavailable from upstream Yahoo feed.');
      } else {
        setShadowCandleCache(nextMap);
      }
    } catch (err: any) {
      setShadowAuditError(err?.message || 'Failed to run shadow audit.');
    } finally {
      setShadowAuditLoading(false);
    }
  };

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
      {/* 1. SIMULATED DATA / CACHED WARNING BANNER */}
      {settings.dataQuality !== 'live' && (
        <div
          role="alert"
          className="bg-rose-950/90 border border-rose-600/70 text-rose-200 px-4 py-2.5 rounded-xl flex items-center justify-between text-xs font-mono font-bold shadow-lg"
        >
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>
              NON-LIVE MODE — Feed quality is set to {settings.dataQuality.toUpperCase()}.
              canTrade() Check #2 blocks unverified position sizing.
            </span>
          </div>
          <button
            onClick={() => handleDataQualityChange('live')}
            className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded text-[11px] transition shadow whitespace-nowrap shrink-0"
          >
            Switch to LIVE
          </button>
        </div>
      )}

      {/* 2. GLOBAL STATUS BAR */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-md">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="font-display font-bold text-white pr-2.5 border-r border-zinc-800 whitespace-nowrap">
            Pre-Market Brief
          </div>

          <span className="text-zinc-300 font-mono text-[11px] tabular-nums">
            {marketSession.sessionName} &middot; {marketSession.isOpen ? 'NYSE Open' : 'NYSE Closed (ET)'}
          </span>
          <span className="text-zinc-600" aria-hidden="true">/</span>
          <span className="text-zinc-400 font-mono text-[11px]">
            {macroLoading
              ? 'Syncing macro...'
              : macroError
              ? 'Upstream delayed/unavailable'
              : `Quote Feed: ${settings.dataQuality === 'live' ? 'Yahoo Delayed 10–20m' : settings.dataQuality.toUpperCase()}`}
          </span>
          <span className="text-zinc-600" aria-hidden="true">/</span>
          <span
            className={`font-mono font-semibold text-[11px] ${
              regimeBand.badgeCls === 'g'
                ? 'text-emerald-400'
                : regimeBand.badgeCls === 'a'
                ? 'text-amber-400'
                : 'text-rose-400'
            }`}
          >
            Regime {regimeScore} ({regimeBand.name})
          </span>
          <span className="text-zinc-600" aria-hidden="true">/</span>
          <span
            className={`font-mono font-semibold text-[11px] ${
              settings.botStatus === 'armed' ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            Desk: {settings.botStatus.toUpperCase()}
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

      {/* 2.5 REAL MARKET HEALTH & 1-MONTH FEAR/GREED + VIX + NET VOLUME FLOW */}
      <MarketHealthGaugePanel
        report={marketHealth}
        loading={marketHealthLoading}
        error={marketHealthError}
        onRefresh={() => refreshMarketHealth(true)}
      />

      {/* 3. SIMULATION & CAPITAL SETTINGS PANEL (§1) */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-4 space-y-3 shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/80 pb-2.5">
          <div className="flex items-center space-x-2">
            <Sliders className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-white">
              Capital Allocation & Live Risk Controls (Master Plan v3 §1)
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono">
            <span
              title={
                user
                  ? 'Bot state & risk controls synced with your Firebase account'
                  : 'Sign in with Google to sync capital & bot controls across devices'
              }
              className={`inline-flex items-center space-x-1 ${
                cloudSyncState === 'synced'
                  ? 'text-emerald-400'
                  : cloudSyncState === 'syncing'
                  ? 'text-amber-400'
                  : cloudSyncState === 'error'
                  ? 'text-rose-400'
                  : 'text-zinc-400'
              }`}
            >
              {cloudSyncState === 'local' ? (
                <CloudOff className="w-3.5 h-3.5" />
              ) : (
                <Cloud className="w-3.5 h-3.5" />
              )}
              <span>
                {cloudSyncState === 'synced'
                  ? 'Cloud Synced'
                  : cloudSyncState === 'syncing'
                  ? 'Syncing Cloud...'
                  : cloudSyncState === 'error'
                  ? 'Sync Error'
                  : 'Local Only'}
              </span>
            </span>
            <span className="text-zinc-700" aria-hidden="true">|</span>
            <span className="text-zinc-400">
              Computed Risk:{' '}
              <strong className="text-emerald-400">
                ${((settings.simCapitalUsd * settings.maxRiskPerTradePct) / 100).toFixed(2)}
              </strong>{' '}
              / trade (
              {settings.maxRiskPerTradePct}% of ${settings.simCapitalUsd.toLocaleString()})
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono">
          <div>
            <label htmlFor="sim-capital-input" className="text-zinc-400 block mb-1">
              Sizing Capital (USD):
            </label>
            <div className="relative">
              <span className="absolute left-2.5 top-2 text-zinc-500 font-bold">$</span>
              <input
                id="sim-capital-input"
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
            <label htmlFor="max-risk-pct-input" className="text-zinc-400 block mb-1">
              Max Risk per Trade (%):
            </label>
            <div className="relative">
              <input
                id="max-risk-pct-input"
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
            {activeRegimeBars.map((c, i) => (
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

            {/* Placed ETF dots with collision nudging */}
            {spdrRrgPoints.length === 0 ? (
              <div className="h-full flex items-center justify-center text-zinc-500 text-xs">
                {macroLoading ? 'Loading live SPDR rotation...' : macroError || 'SPDR rotation unavailable'}
              </div>
            ) : (
              (() => {
                const placed: Array<{ x: number; y: number }> = [];
                return spdrRrgPoints.map((sec) => {
                  const xPct = Math.min(90, Math.max(10, (sec.rs - 96) * 12));
                  let yPct = Math.min(86, Math.max(14, 100 - (sec.mom - 96) * 12));
                  for (let attempt = 0; attempt < 6; attempt++) {
                    const overlaps = placed.some(
                      (p) => Math.abs(p.x - xPct) < 11 && Math.abs(p.y - yPct) < 9
                    );
                    if (!overlaps) break;
                    const delta = (attempt % 2 === 0 ? -1 : 1) * (5 + attempt * 3);
                    yPct = Math.min(88, Math.max(12, yPct + delta));
                  }
                  placed.push({ x: xPct, y: yPct });
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
                      <span className="text-[9px] text-zinc-200 font-bold bg-zinc-950/90 px-1 rounded group-hover:text-white">
                        {sec.symbol}
                      </span>
                    </div>
                  );
                });
              })()
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
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Watchlist Table (8 cols) */}
        <div className="lg:col-span-8 bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3.5 shadow-md min-w-0">
          <div className="flex flex-col gap-3 pb-2.5 border-b border-zinc-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  Live Daily Watchlist &mdash; Top 50 {directionView === 'long' ? 'Bullish' : 'Bearish'} ({filteredWatchlist.length})
                </h3>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  High-conviction leaders only ({gradeGate === 'strong' ? 'Grade B+ / A / A+' : gradeGate === 'includeC' ? 'Includes Grade C' : 'Saved Watchlist'}). Weak &amp; signal-less tickers excluded.
                </p>
              </div>

              {/* Dual Top-50 Bullish / Bearish Switcher */}
              <div className="flex items-center bg-zinc-950 p-0.5 rounded-lg border border-zinc-800 gap-1">
                <button
                  type="button"
                  data-testid="watchlist-dir-bullish"
                  onClick={() => setDirectionView('long')}
                  className={`px-2.5 py-1 rounded text-[11px] font-semibold flex items-center space-x-1 transition whitespace-nowrap shrink-0 ${
                    directionView === 'long'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      : 'text-zinc-400 hover:text-emerald-400'
                  }`}
                >
                  <TrendingUp className="w-3 h-3" />
                  <span>Bullish Top 50 ({leaderboards.bullish.length})</span>
                </button>
                <button
                  type="button"
                  data-testid="watchlist-dir-bearish"
                  onClick={() => setDirectionView('short')}
                  className={`px-2.5 py-1 rounded text-[11px] font-semibold flex items-center space-x-1 transition whitespace-nowrap shrink-0 ${
                    directionView === 'short'
                      ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                      : 'text-zinc-400 hover:text-rose-400'
                  }`}
                >
                  <TrendingDown className="w-3 h-3" />
                  <span>Bearish Top 50 ({leaderboards.bearish.length})</span>
                </button>
              </div>
            </div>

            {/* Secondary Controls: Universe, Conviction Gate, Sort By */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex bg-zinc-950 p-0.5 rounded-lg border border-zinc-800 text-[11px]">
                  {(['both', 'sp500', 'ndx100'] as const).map((uni) => (
                    <button
                      key={uni}
                      type="button"
                      onClick={() => setUniverseFilter(uni)}
                      className={`px-2 py-0.5 rounded transition whitespace-nowrap ${
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
                  aria-label="Filter watchlist by conviction grade gate"
                  data-testid="watchlist-grade-gate"
                  value={gradeGate}
                  onChange={(e) => setGradeGate(e.target.value as 'strong' | 'includeC' | 'saved')}
                  className="bg-zinc-950 border border-zinc-800 text-zinc-300 text-[11px] rounded px-2 py-1"
                >
                  <option value="strong">Grade B+ Strong (Top 50)</option>
                  <option value="includeC">Include Grade C</option>
                  <option value="saved">Saved Watchlist Items</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-zinc-500">Sort:</span>
                <select
                  aria-label="Sort watchlist column"
                  data-testid="watchlist-sort-select"
                  value={sortBy}
                  onChange={(e) => {
                    const nextKey = e.target.value as WatchlistSortKey;
                    setSortBy(nextKey);
                    setSortDir(nextKey === 'symbol' ? 'asc' : 'desc');
                  }}
                  className="bg-zinc-950 border border-zinc-800 text-zinc-200 text-[11px] rounded px-2 py-1"
                >
                  <option value="score">Rank / Score</option>
                  <option value="days">Days in Watchlist</option>
                  <option value="alpha">Alpha vs SPY</option>
                  <option value="rr">Risk : Reward</option>
                  <option value="symbol">Symbol (A-Z)</option>
                </select>
                <button
                  type="button"
                  data-testid="watchlist-sort-dir"
                  onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
                  title={sortDir === 'desc' ? 'Descending (Highest first)' : 'Ascending (Lowest first)'}
                  className="px-2 py-1 bg-zinc-950 border border-zinc-800 hover:border-zinc-700 text-zinc-300 rounded text-[11px] font-mono flex items-center gap-1 whitespace-nowrap"
                >
                  <ArrowUpDown className="w-3 h-3" />
                  <span>{sortDir === 'desc' ? 'DESC' : 'ASC'}</span>
                </button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto overflow-y-auto max-h-[580px]">
            <table className="w-full text-left text-[11px] font-mono tabular-nums">
              <thead className="sticky top-0 bg-zinc-900 z-10">
                <tr className="border-b border-zinc-800 text-[10px] text-zinc-500 uppercase tracking-wider">
                  <th className="py-2 px-1.5">#</th>
                  <th className="py-2 px-1.5">
                    <button
                      type="button"
                      onClick={() => handleHeaderSort('symbol')}
                      className="hover:text-white transition uppercase tracking-wider"
                    >
                      Symbol {sortBy === 'symbol' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                    </button>
                  </th>
                  <th className="py-2 px-1.5 text-right">
                    <button
                      type="button"
                      onClick={() => handleHeaderSort('score')}
                      className="hover:text-white transition uppercase tracking-wider"
                    >
                      Grade {sortBy === 'score' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                    </button>
                  </th>
                  <th className="py-2 px-1.5 text-right">
                    <button
                      type="button"
                      onClick={() => handleHeaderSort('days')}
                      className="hover:text-white transition uppercase tracking-wider"
                    >
                      Days {sortBy === 'days' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                    </button>
                  </th>
                  <th className="py-2 px-1.5 text-right">
                    <button
                      type="button"
                      onClick={() => handleHeaderSort('alpha')}
                      className="hover:text-white transition uppercase tracking-wider"
                    >
                      vs SPY {sortBy === 'alpha' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                    </button>
                  </th>
                  <th className="py-2 px-1.5">Setup</th>
                  <th className="py-2 px-1.5 text-right">Entry</th>
                  <th className="py-2 px-1.5 text-right">SL</th>
                  <th className="py-2 px-1.5 text-right">TP1</th>
                  <th className="py-2 px-1.5 text-right">
                    <button
                      type="button"
                      onClick={() => handleHeaderSort('rr')}
                      className="hover:text-white transition uppercase tracking-wider"
                    >
                      R:R {sortBy === 'rr' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                    </button>
                  </th>
                  <th className="py-2 px-1.5 text-right">Gate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {filteredWatchlist.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-10 text-center text-zinc-500">
                      {scannerResults.length === 0
                        ? 'Scanning S&P 500 universe for high-conviction Top 50 setups...'
                        : `No ${directionView === 'long' ? 'Bullish' : 'Bearish'} Grade B+ leaders match the current filter.`}
                    </td>
                  </tr>
                ) : (
                  filteredWatchlist.map((item, idx) => {
                    const isSelected = item.s === (selectedItem?.s ?? '');
                    const gradeColor =
                      item.grade === 'A+' || item.grade === 'A'
                        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                        : item.grade === 'B'
                        ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40'
                        : 'bg-amber-500/15 text-amber-300 border-amber-500/40';
                    const rankDeltaLabel =
                      item.rankDelta === null
                        ? item.isNewToday
                          ? 'NEW'
                          : null
                        : item.rankDelta > 0
                        ? `▲${item.rankDelta}`
                        : item.rankDelta < 0
                        ? `▼${Math.abs(item.rankDelta)}`
                        : '•';

                    return (
                      <tr
                        key={`${item.dir}-${item.s}`}
                        data-testid={`watchlist-row-${item.s}`}
                        onClick={() => setSelectedSymbol(item.s)}
                        className={`cursor-pointer transition hover:bg-zinc-800/40 ${
                          isSelected ? 'bg-zinc-800/70 border-l-2 border-emerald-500' : ''
                        }`}
                      >
                        <td className="py-2 px-1.5 text-zinc-400 font-bold whitespace-nowrap">
                          <span>#{sortBy === 'score' && sortDir === 'desc' ? item.rank : idx + 1}</span>
                          {rankDeltaLabel && (
                            <span
                              className={`ml-1 text-[9px] ${
                                rankDeltaLabel === 'NEW'
                                  ? 'text-sky-400'
                                  : rankDeltaLabel.startsWith('▲')
                                  ? 'text-emerald-400'
                                  : rankDeltaLabel.startsWith('▼')
                                  ? 'text-rose-400'
                                  : 'text-zinc-600'
                              }`}
                            >
                              {rankDeltaLabel}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-1.5 font-bold text-white whitespace-nowrap">
                          <span>{item.s}</span>
                          {item.u.includes('ndx100') && !item.u.includes('sp500') && (
                            <span className="ml-1 text-[9px] bg-sky-500/20 text-sky-400 px-1 rounded">
                              NDX
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-1.5 text-right whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-bold ${gradeColor}`}>
                            <span>{item.grade}</span>
                            <span className="opacity-80">{item.score}</span>
                          </span>
                        </td>
                        <td
                          className="py-2 px-1.5 text-right whitespace-nowrap"
                          title={`First seen: ${item.firstSeenDate} · Streak: ${item.consecutiveDays}d · Best rank: #${item.bestRank}`}
                        >
                          <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-200 border border-zinc-700 text-[10px] font-semibold">
                            {item.daysInWatchlist}d
                          </span>
                        </td>
                        <td
                          className={`py-2 px-1.5 text-right whitespace-nowrap font-semibold ${
                            item.relPerfVsSpyPct === null
                              ? 'text-zinc-500'
                              : item.relPerfVsSpyPct >= 0
                              ? 'text-emerald-400'
                              : 'text-rose-400'
                          }`}
                        >
                          {item.relPerfVsSpyPct === null
                            ? '—'
                            : `${item.relPerfVsSpyPct >= 0 ? '+' : ''}${item.relPerfVsSpyPct.toFixed(1)}%`}
                        </td>
                        <td className="py-2 px-1.5 text-zinc-300">
                          <span className="truncate block max-w-[115px]" title={item.setup}>
                            {item.setup}
                          </span>
                        </td>
                        <td className="py-2 px-1.5 text-right text-zinc-300 whitespace-nowrap">
                          ${item.levels.entryZone.lo.toFixed(0)}–{item.levels.entryZone.hi.toFixed(0)}
                        </td>
                        <td className="py-2 px-1.5 text-right text-rose-400 whitespace-nowrap">
                          ${item.levels.stop.price.toFixed(1)}
                        </td>
                        <td className="py-2 px-1.5 text-right text-emerald-400 whitespace-nowrap">
                          ${item.levels.targets[0]?.price.toFixed(1)}
                        </td>
                        <td className="py-2 px-1.5 text-right text-zinc-300 whitespace-nowrap">
                          1:{item.levels.rr.toFixed(1)}
                        </td>
                        <td className="py-2 px-1.5 text-right whitespace-nowrap">
                          {item.gate.allow ? (
                            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/30 whitespace-nowrap">
                              OK &times;{item.gate.suggestedQty}
                            </span>
                          ) : (
                            <span
                              className="text-[10px] text-rose-400 font-bold bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/30 whitespace-nowrap"
                              title={item.gate.fails.map((f) => f.name).join(', ')}
                            >
                              {item.gate.fails[0]?.shortName || 'BLOCKED'}
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

        {/* Selected Symbol Detail & SVG Levels Preview (4 cols) */}
        <div
          data-testid="levels-diagnostics-panel"
          className="lg:col-span-4 bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3.5 shadow-md lg:sticky lg:top-20 min-w-0"
        >
          {!selectedItem ? (
            <div className="py-16 text-center space-y-2 text-zinc-500 text-xs font-mono">
              <Eye className="w-6 h-6 mx-auto text-zinc-600" />
              <p>Select a symbol from the Watchlist or wait for Live Scanner levels.</p>
            </div>
          ) : (() => {
            const ladder = computeLevelLadderGeometry(selectedItem.levels, selectedItem.p);
            const isShort = selectedItem.dir === 'short';
            return (
              <>
                <div className="flex items-center justify-between pb-2 border-b border-zinc-800 gap-2">
                  <div className="flex items-center flex-wrap gap-2 min-w-0">
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                      Levels &amp; Diagnostics: {selectedItem.s}
                    </h3>
                    <span className="text-[10px] text-zinc-400 font-mono truncate">
                      {selectedItem.sec}
                    </span>
                  </div>
                  {onOpenChart && (
                    <button
                      onClick={() => onOpenChart(selectedItem.s)}
                      className="text-xs text-sky-400 hover:text-sky-300 flex items-center space-x-1 shrink-0"
                    >
                      <span>Open in Chart</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Setup Summary Telemetry Strip */}
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="px-2 py-0.5 rounded bg-zinc-950 border border-zinc-700 text-zinc-200 font-bold">
                      #{selectedItem.rank}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded font-bold border ${
                        isShort
                          ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                          : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                      }`}
                    >
                      {isShort ? 'SHORT' : 'LONG'}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800 text-zinc-200">
                      {selectedItem.setup}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800 text-emerald-400 font-bold">
                      Grade {selectedItem.grade} ({selectedItem.score})
                    </span>
                    <span
                      title={`First seen: ${selectedItem.firstSeenDate} · Streak: ${selectedItem.consecutiveDays}d · Best: #${selectedItem.bestRank}`}
                      className="px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-200 font-semibold"
                    >
                      {selectedItem.daysInWatchlist}d in Top 50 (Best #{selectedItem.bestRank})
                    </span>
                  </div>
                  <span className="text-zinc-400 tabular-nums">
                    Spot <strong className="text-white">${selectedItem.p.toFixed(2)}</strong> &middot; ATR ${selectedItem.atr.toFixed(2)}
                  </span>
                </div>

                {/* SVG Price Ladder Geometry Preview */}
                <div className="bg-zinc-950 rounded-lg p-2.5 border border-zinc-800 space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
                    <span>Level Ladder ({isShort ? 'TP2 ← Entry → SL' : 'SL ← Entry → TP2'})</span>
                    <span>Spot ${selectedItem.p.toFixed(2)}</span>
                  </div>
                  <svg
                    viewBox="0 0 100 26"
                    className="w-full h-11 overflow-visible"
                    role="img"
                    aria-label={`${selectedItem.s} risk and target price ladder`}
                  >
                    {/* Base axis */}
                    <line x1="2" y1="13" x2="98" y2="13" stroke="#27272a" strokeWidth="1.2" strokeLinecap="round" />
                    {/* Entry Zone shaded band */}
                    <rect
                      x={ladder.entryLeftPct}
                      y="7"
                      width={ladder.entryWidthPct}
                      height="12"
                      rx="1.5"
                      fill="#0ea5e9"
                      fillOpacity="0.24"
                      stroke="#38bdf8"
                      strokeWidth="0.6"
                    />
                    {/* Invalidation marker */}
                    <line
                      x1={ladder.invalidationPct}
                      y1="5"
                      x2={ladder.invalidationPct}
                      y2="21"
                      stroke="#f59e0b"
                      strokeWidth="0.7"
                      strokeDasharray="1.2,1.2"
                    />
                    {/* Stop Loss marker */}
                    <line x1={ladder.stopPct} y1="5" x2={ladder.stopPct} y2="21" stroke="#fb7185" strokeWidth="1.2" />
                    <text x={ladder.stopPct} y="4" textAnchor="middle" fill="#fb7185" fontSize="3.4" fontFamily="monospace" fontWeight="bold">
                      SL
                    </text>
                    {/* TP1 marker */}
                    <line x1={ladder.tp1Pct} y1="5" x2={ladder.tp1Pct} y2="21" stroke="#34d399" strokeWidth="1.2" />
                    <text x={ladder.tp1Pct} y="4" textAnchor="middle" fill="#34d399" fontSize="3.4" fontFamily="monospace" fontWeight="bold">
                      TP1
                    </text>
                    {/* TP2 marker */}
                    {ladder.tp2Pct !== null && (
                      <>
                        <line x1={ladder.tp2Pct} y1="6" x2={ladder.tp2Pct} y2="20" stroke="#fbbf24" strokeWidth="1.0" />
                        <text x={ladder.tp2Pct} y="24.8" textAnchor="middle" fill="#fbbf24" fontSize="3.2" fontFamily="monospace" fontWeight="bold">
                          TP2
                        </text>
                      </>
                    )}
                    {/* Current spot price dot */}
                    <circle cx={ladder.currentPct} cy="13" r="2.2" fill="#ffffff" stroke="#38bdf8" strokeWidth="0.8" />
                    <text x={ladder.currentPct} y="24.8" textAnchor="middle" fill="#e4e4e7" fontSize="3.2" fontFamily="monospace">
                      ENTRY
                    </text>
                  </svg>
                </div>

                {/* Immutable Levels Panel */}
                <div className="bg-zinc-950 rounded-lg p-2.5 border border-zinc-800 font-mono text-[11px] space-y-2">
                  <div className="flex justify-between items-center text-zinc-400 text-[10px]">
                    <span>Immutable Geometry (Levels v3)</span>
                    <span>R:R = 1 : {selectedItem.levels.rr.toFixed(1)}</span>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between py-1 border-b border-zinc-800/80">
                      <span className="text-zinc-400">TP2 (Target 2):</span>
                      <span className="text-amber-400 font-bold">
                        {selectedItem.levels.targets[1]
                          ? `$${selectedItem.levels.targets[1].price.toFixed(2)} (${selectedItem.levels.targets[1].rMultiple}R)`
                          : '—'}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-zinc-800/80">
                      <span className="text-zinc-400">TP1 (Target 1):</span>
                      <span className="text-emerald-400 font-bold">
                        {selectedItem.levels.targets[0]
                          ? `$${selectedItem.levels.targets[0].price.toFixed(2)} (${selectedItem.levels.targets[0].rMultiple}R)`
                          : '—'}
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
                      <span
                        className={`font-bold ${
                          selectedItem.gate.allow ? 'text-emerald-400' : 'text-zinc-400'
                        }`}
                      >
                        {selectedItem.gate.suggestedQty} shares ($
                        {(selectedItem.gate.suggestedQty * selectedItem.levels.riskPerUnit).toFixed(2)}{' '}
                        risk)
                      </span>
                    </div>
                  </div>
                </div>

                {/* Gate Diagnostics & Execution Blockers */}
                <div
                  className={`rounded-lg p-2.5 border text-[11px] font-mono ${
                    selectedItem.gate.allow
                      ? 'bg-emerald-950/25 border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-950/25 border-rose-500/30 text-rose-300'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold mb-1">
                    <span>canTrade() Gate Diagnostics</span>
                    <span>{selectedItem.gate.allow ? 'ALL 10 CHECKS PASSED' : `${selectedItem.gate.fails.length} BLOCKER(S)`}</span>
                  </div>
                  {selectedItem.gate.allow ? (
                    <p className="text-[10px] text-emerald-200/80">
                      Approved for {selectedItem.gate.suggestedQty} share(s) within risk budget.
                    </p>
                  ) : (
                    <ul className="space-y-0.5 text-[10px] text-rose-200/90">
                      {selectedItem.gate.fails.map((f) => (
                        <li key={f.number}>
                          #{f.number} {f.name}: {f.detail}
                        </li>
                      ))}
                    </ul>
                  )}
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
            );
          })()}
        </div>
      </div>

      {/* 6. SHADOW SIGNAL LEDGER & BASELINE AUDIT PANEL */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-4 shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-2.5 border-b border-zinc-800">
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Shadow Signal Ledger &amp; Journal Expectancy Audit
            </h3>
            <span className="text-[11px] text-zinc-400">
              Evaluated strictly net of 10 bps round-trip cost ({selectedExitPolicy}) &middot; No unverified numbers
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label htmlFor="shadow-exit-policy" className="text-zinc-400">Exit Policy:</label>
            <select
              id="shadow-exit-policy"
              value={selectedExitPolicy}
              onChange={(e) => setSelectedExitPolicy(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs rounded px-2.5 py-1.5 font-mono"
            >
              <option value="X1_fixed_v1">X1 &middot; SL / TP1 / Time-Stop (Primary)</option>
              <option value="X2_trail_v1">X2 &middot; Breakeven + Trailing 2&times;ATR</option>
              <option value="X3_structure_v1">X3 &middot; Structure (MA30 / Invalidation)</option>
            </select>

            <button
              type="button"
              onClick={runLiveShadowAudit}
              disabled={shadowAuditLoading}
              data-testid="run-shadow-audit-btn"
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition flex items-center space-x-1.5 whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${shadowAuditLoading ? 'animate-spin' : ''}`} />
              <span>{shadowAuditLoading ? 'Auditing 2y Candles...' : 'Run Live 2y Baseline Audit'}</span>
            </button>
          </div>
        </div>

        {/* 6 Journal KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 font-mono">
          <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800">
            <span className="text-[10px] text-zinc-400 uppercase block">Journal Net P&amp;L</span>
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
            <span className="text-[10px] text-zinc-400 uppercase block">Journal Trades (n)</span>
            <span className="text-lg font-black text-white">{shadowAnalysis.n}</span>
            <span className="text-[10px] text-amber-400 block mt-0.5">
              {shadowAnalysis.n > 0 ? `n=${shadowAnalysis.n} (${settings.activeEpochId})` : '0 closed trades'}
            </span>
          </div>

          <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800">
            <span className="text-[10px] text-zinc-400 uppercase block">Journal Expectancy</span>
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
            <span className="text-[10px] text-zinc-400 uppercase block">Profit Factor</span>
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
            <span className="text-[10px] text-zinc-400 uppercase block">Win Rate</span>
            <span className="text-lg font-black text-emerald-400">
              {shadowAnalysis.n > 0 ? `${shadowAnalysis.winRate.toFixed(0)}%` : '—'}
            </span>
            <span className="text-[10px] text-zinc-500 block mt-0.5">
              {shadowAnalysis.wins} of {shadowAnalysis.n} trades
            </span>
          </div>

          <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800">
            <span className="text-[10px] text-zinc-400 uppercase block">Risk / Trade</span>
            <span className="text-lg font-black text-sky-400">
              ${shadowAnalysis.riskUsd.toFixed(0)}
            </span>
            <span className="text-[10px] text-zinc-500 block mt-0.5">
              {settings.maxRiskPerTradePct}% of capital
            </span>
          </div>
        </div>

        {/* Historical Live-Data Shadow Audit vs Baseline Control */}
        {shadowAuditError && (
          <div className="p-3 bg-rose-950/60 border border-rose-500/40 rounded-lg text-xs text-rose-300">
            {shadowAuditError}
          </div>
        )}

        {shadowAuditReport && (
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-3" data-testid="shadow-audit-report">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-2">
              <div className="text-xs font-semibold text-white">
                Benchmark Cohort ({shadowAuditReport.symbolsAnalyzed.join(', ')}) &middot; {shadowAuditReport.totalBarsScanned.toLocaleString()} daily bars audited
              </div>
              <span className="text-[11px] font-mono text-zinc-400">
                Policy: {shadowAuditReport.policyName} &middot; Slippage/Cost: {shadowAuditReport.roundTripBps} bps
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 font-mono text-xs">
              <div className="p-2.5 bg-zinc-900 rounded-lg border border-zinc-800/80">
                <span className="text-[10px] text-zinc-400 block">Signals (n / n_eff)</span>
                <strong className="text-white text-sm">
                  {shadowAuditReport.metrics.n} / {shadowAuditReport.metrics.nEff}d
                </strong>
              </div>
              <div className="p-2.5 bg-zinc-900 rounded-lg border border-zinc-800/80">
                <span className="text-[10px] text-zinc-400 block">Signal Net Mean R</span>
                <strong className={`text-sm ${shadowAuditReport.metrics.meanR >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {shadowAuditReport.metrics.meanR >= 0 ? '+' : ''}{shadowAuditReport.metrics.meanR.toFixed(3)}R
                </strong>
                <span className="text-[10px] text-zinc-500 block">
                  CI90 [{shadowAuditReport.metrics.ci90[0].toFixed(2)}, {shadowAuditReport.metrics.ci90[1].toFixed(2)}]
                </span>
              </div>
              <div className="p-2.5 bg-zinc-900 rounded-lg border border-zinc-800/80">
                <span className="text-[10px] text-zinc-400 block">Baseline Mean R (n={shadowAuditReport.metrics.baselineN})</span>
                <strong className="text-zinc-200 text-sm">
                  {shadowAuditReport.metrics.baselineMeanR >= 0 ? '+' : ''}{shadowAuditReport.metrics.baselineMeanR.toFixed(3)}R
                </strong>
              </div>
              <div className="p-2.5 bg-zinc-900 rounded-lg border border-zinc-800/80">
                <span className="text-[10px] text-zinc-400 block">Alpha vs Baseline</span>
                <strong className={`text-sm ${shadowAuditReport.metrics.alphaOverBaselineR >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {shadowAuditReport.metrics.alphaOverBaselineR >= 0 ? '+' : ''}{shadowAuditReport.metrics.alphaOverBaselineR.toFixed(3)}R
                </strong>
              </div>
              <div className="p-2.5 bg-zinc-900 rounded-lg border border-zinc-800/80">
                <span className="text-[10px] text-zinc-400 block">Win Rate &middot; PF</span>
                <strong className="text-white text-sm">
                  {shadowAuditReport.metrics.winRatePct}% &middot; {shadowAuditReport.metrics.profitFactor !== null ? `${shadowAuditReport.metrics.profitFactor}x` : '—'}
                </strong>
              </div>
            </div>

            {shadowAuditReport.recentSignals.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px] font-mono">
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-400">
                      <th className="py-1.5 pr-3">Confirmed Date</th>
                      <th className="py-1.5 pr-3">Symbol</th>
                      <th className="py-1.5 pr-3">Setup</th>
                      <th className="py-1.5 pr-3 text-right">Score</th>
                      <th className="py-1.5 pr-3">Exit</th>
                      <th className="py-1.5 pr-3 text-right">Held</th>
                      <th className="py-1.5 text-right">Net R</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-900">
                    {shadowAuditReport.recentSignals.slice(0, 6).map((sig, i) => (
                      <tr key={`${sig.symbol}-${sig.confirmedIdx}-${i}`}>
                        <td className="py-1.5 pr-3 text-zinc-300">{sig.signalDate}</td>
                        <td className="py-1.5 pr-3 font-bold text-white">{sig.symbol}</td>
                        <td className="py-1.5 pr-3 text-zinc-300">{sig.type.replace(/_/g, ' ')}</td>
                        <td className="py-1.5 pr-3 text-right text-zinc-300">{sig.qualityScore}</td>
                        <td className="py-1.5 pr-3 text-zinc-400 uppercase">{sig.exitReason}</td>
                        <td className="py-1.5 pr-3 text-right text-zinc-400">{sig.barsHeld}d</td>
                        <td className={`py-1.5 text-right font-bold ${sig.rNet >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {sig.rNet >= 0 ? '+' : ''}{sig.rNet.toFixed(2)}R
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="text-[10px] text-zinc-400 leading-relaxed">
              {shadowAuditReport.caveat}
            </p>
          </div>
        )}

        <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800 text-xs text-zinc-400 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <Info className="w-4 h-4 text-sky-400 shrink-0" />
            <span>
              R-multiples are scale-invariant and independent of capital size. Updating Allocated Capital
              dynamically recalculates dollar values without re-running backtests.
            </span>
          </div>
          <span className="font-mono text-zinc-500">Engine Version: {ENGINE_VERSION}</span>
        </div>
      </div>
    </div>
  );
};
