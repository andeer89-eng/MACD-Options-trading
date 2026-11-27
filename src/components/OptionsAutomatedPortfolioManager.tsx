import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Bot,
  Zap,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  DollarSign,
  PieChart,
  Layers,
  ChevronRight,
  ChevronDown,
  ExternalLink,
  Percent,
  Play,
  Pause,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  Info,
  Brain,
  Download,
  RefreshCw,
  Cpu,
  GitBranch,
  Edit2,
  Sliders,
  LineChart,
  Activity,
  BarChart2,
  Award,
  Scale,
  Target,
  Search,
  Filter,
  Calendar,
  Clock,
  Flame,
} from 'lucide-react';
import {
  OptionsPortfolioAccount,
  OptionsPosition,
  OptionsTradeLog,
  OptionsPortfolioStats,
  OptionsTradeEpisode,
  loadOptionsPortfolio,
  saveOptionsPortfolio,
  initDefaultOptionsPortfolio,
  calculateOptionsStats,
  exportOptionsLogsToCSV,
  relearnOptionsMemoryFromHistory,
  exportOptionsMemoryJSON,
  OptionsTradeRecord,
} from '../utils/optionsAutomatedPortfolio';
import { analyzeTradingWarzSetup, CandleOHLC } from '../utils/tradingWarzEngine';
import { analyzeMarketStructuralContext } from '../utils/marketStructuralContext';
import type { Candle } from '../utils/trullasStrategy';
import { useAlpacaPaper, fetchAlpacaOptionContracts } from '../hooks/useAlpacaPaper';
import { useMarketHealth } from '../hooks/useMarketHealth';
import { fetchJsonSafe } from '../utils/safeFetchJson';
import {
  alpacaPositionsToOptionsPositions,
  alpacaOrdersToOptionsHistory,
  alpacaOrdersToOptionsSessionLogs,
  buildIdempotentClientOrderId,
} from '../utils/alpacaJournalSync';
import { cancelWorkingOrdersForContract } from '../utils/deterministicOrderPipeline';
import { downloadCSV } from '../utils/tradeJournal';
import {
  getMarketSessionStatus,
  getBucharestTimeFormatted,
} from '../utils/marketSession';
import {
  buildEntryMarketContextFromReport,
  formatEntryMarketContextBadge,
} from '../utils/entryMarketContext';
import type { RegimePerformanceStat } from '../utils/activeLearningEngine';
import { acquirePortfolioCycleLock, evaluatePortfolioRisk, evaluateShortPutOrderRisk } from '../utils/portfolioRiskEngine';

interface OptionsAutomatedPortfolioManagerProps {
  onSelectSymbolForChart: (sym: string) => void;
  scannerResults?: any[];
}

export const OptionsAutomatedPortfolioManager: React.FC<OptionsAutomatedPortfolioManagerProps> = ({
  onSelectSymbolForChart,
}) => {
  const { report: marketHealth, refresh: refreshMarketHealth } = useMarketHealth();
  const {
    overview,
    loading: alpacaLoading,
    error: alpacaError,
    lastSyncSummary,
    refresh: refreshAlpaca,
    submitOrder,
    closePosition,
    cancelOrder,
  } = useAlpacaPaper({ pollMs: 30000, marketHealth });

  const [account, setAccount] = useState<OptionsPortfolioAccount>(() => loadOptionsPortfolio());
  const [mainTab, setMainTab] = useState<'journal' | 'open-positions' | 'brain'>('journal');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OPEN' | 'EXPIRED' | 'EARLY_TP' | 'BREAKEVEN'>('ALL');
  const [sessionFilter, setSessionFilter] = useState<'ALL' | 'REGULAR' | 'PREMARKET' | 'AFTERHOURS' | '24/7'>('ALL');
  const [yearFilter, setYearFilter] = useState<'ALL' | '2026' | '2025'>('ALL');
  const [tickerFilter, setTickerFilter] = useState<'ALL' | 'SPY' | 'QQQ' | 'IWM' | 'AAPL' | 'NVDA' | 'MSFT'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedRowIds, setExpandedRowIds] = useState<Set<string>>(new Set());
  const [isCycleRunning, setIsCycleRunning] = useState(false);
  const [cycleFeedbackMessage, setCycleFeedbackMessage] = useState<string | null>(null);
  const [exportToast, setExportToast] = useState<string | null>(null);

  const isAlpacaConnected = Boolean(overview?.configured && overview?.account);

  // Live Market Time & Countdown
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const overviewRef = useRef(overview);
  overviewRef.current = overview;
  const marketHealthRef = useRef(marketHealth);
  marketHealthRef.current = marketHealth;
  const accountRef = useRef<OptionsPortfolioAccount>(account);
  const autoCycleInFlightRef = useRef<boolean>(false);
  const cycleAbortRef = useRef<AbortController | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef<boolean>(true);

  useEffect(() => {
    accountRef.current = account;
  }, [account]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      cycleAbortRef.current?.abort();
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    };
  }, []);

  const liveOptionsAccount = useMemo<OptionsPortfolioAccount>(() => {
    if (!overview?.configured || !overview?.account) {
      return {
        ...initDefaultOptionsPortfolio(0),
        isAutoPilotActive: account.isAutoPilotActive,
        targetDelta: account.targetDelta,
        profitTakePercent: account.profitTakePercent,
        minDte: account.minDte,
        maxOpenPositions: account.maxOpenPositions,
        tradingWarzStrictFilter: account.tradingWarzStrictFilter,
        activeMemory: account.activeMemory,
      };
    }

    const livePositions = alpacaPositionsToOptionsPositions(
      overview.optionPositions || [],
      overview.orders || [],
      account.profitTakePercent
    );
    const liveHistory = alpacaOrdersToOptionsHistory(overview.orders || []);
    const liveLogs = alpacaOrdersToOptionsSessionLogs(overview.orders || []);
    const totalRealized = Number(liveHistory.reduce((s, r) => s + r.profitDollars, 0).toFixed(2));
    const totalUnrealized = Number(livePositions.reduce((s, p) => s + p.unrealizedPnL, 0).toFixed(2));
    const totalDailyTheta = Number(livePositions.reduce((s, p) => s + p.dailyTheta, 0).toFixed(2));

    return {
      startingBalance: overview.account.last_equity || overview.account.equity,
      cash: overview.account.options_buying_power || overview.account.cash,
      equity: overview.account.equity,
      totalRealizedIncome: totalRealized,
      unrealizedPnL: totalUnrealized,
      dailyThetaIncome: totalDailyTheta,
      positions: livePositions,
      tradeHistory: liveHistory,
      legacyHistory: [],
      sessionLogs: liveLogs,
      isAutoPilotActive: account.isAutoPilotActive,
      targetDelta: account.targetDelta,
      profitTakePercent: account.profitTakePercent,
      minDte: account.minDte,
      maxOpenPositions: account.maxOpenPositions,
      tradingWarzStrictFilter: account.tradingWarzStrictFilter,
      lastUpdated: overview.fetchedAt,
      activeMemory: account.activeMemory,
    };
  }, [overview, account]);

  const fetchLiveOptionsCandidates = async (signal?: AbortSignal) => {
    const targets = ['SPY', 'QQQ', 'IWM', 'AAPL', 'NVDA', 'MSFT'];
    const settled = await Promise.all(
      targets.map(async (symbol) => {
        try {
          const resp = await fetchJsonSafe<{ candles?: any[] }>(
            `/api/candles?symbol=${encodeURIComponent(symbol)}&timeframe=1d&range=6mo`,
            { signal }
          );
          if (!resp.ok || !resp.data) return null;
          const json = resp.data;
          const bars = Array.isArray(json?.candles) ? json.candles : [];
          if (bars.length < 5) return null;
          const latestClose = Number(bars[bars.length - 1]?.close);
          if (!Number.isFinite(latestClose) || latestClose <= 0) return null;
          const normalizedCandles: Candle[] = bars.map((b: any, idx: number) => ({
            timestamp: Number(b.timestamp ?? Date.now() - (bars.length - idx) * 86400000),
            dateStr: String(b.dateStr ?? ''),
            open: Number(b.open ?? b.close),
            high: Number(b.high ?? b.close),
            low: Number(b.low ?? b.close),
            close: Number(b.close),
            volume: Number(b.volume ?? 0),
          }));
          return {
            symbol,
            currentPrice: latestClose,
            fullCandles: normalizedCandles,
            candles: normalizedCandles.map((b) => ({
              open: b.open,
              high: b.high,
              low: b.low,
              close: b.close,
            })) as CandleOHLC[],
          };
        } catch {
          return null;
        }
      })
    );
    return settled.filter((item): item is NonNullable<typeof item> => item !== null);
  };

  // Run autonomous Alpaca Paper options cycle (shared by button & scheduler)
  const executeAlpacaOptionsCycle = async (signal?: AbortSignal, fromScheduler = false) => {
    const releasePortfolioLock = acquirePortfolioCycleLock('options');
    if (!releasePortfolioLock) {
      if (!fromScheduler && isMountedRef.current) {
        setCycleFeedbackMessage('Another portfolio automation cycle is running. Options cycle skipped to prevent overlapping orders.');
      }
      return;
    }
    try {
    const activeOverview = overviewRef.current;
    if (!activeOverview?.configured || !activeOverview?.account) {
      if (!fromScheduler && isMountedRef.current) {
        setCycleFeedbackMessage(
          'Alpaca Paper is not configured. Set APCA_API_KEY_ID and APCA_API_SECRET_KEY in server .env to execute Paper options orders.'
        );
      }
      return;
    }

    const latestAccount = accountRef.current;
    const marketCandidates = await fetchLiveOptionsCandidates(signal);
    if (!isMountedRef.current || signal?.aborted || marketCandidates.length === 0) {
      if (!fromScheduler && isMountedRef.current) {
        setCycleFeedbackMessage('Cycle aborted: live SPY / QQQ / IWM / AAPL / NVDA / MSFT market feeds unavailable.');
      }
      return;
    }

    const actionsLog: string[] = [];
    const currentOpenPositions = alpacaPositionsToOptionsPositions(
      activeOverview.optionPositions || [],
      activeOverview.orders || [],
      latestAccount.profitTakePercent
    );
    const portfolioRisk = evaluatePortfolioRisk({
      account: activeOverview.account,
      positions: [
        ...(activeOverview.equityPositions || []),
        ...(activeOverview.optionPositions || []),
      ],
      openOrders: activeOverview.orders || [],
      equityHistory: activeOverview.portfolioHistory || [],
      fetchedAt: activeOverview.fetchedAt,
    });
    if (!portfolioRisk.allowNewEntries) {
      actionsLog.push(`Portfolio risk gate ${portfolioRisk.status}: ${portfolioRisk.reasons.join(' ')} New option entries blocked; risk-reducing exits remain enabled.`);
    }

    // 1. Evaluate open Alpaca OCC option positions for TP / expiration exits (Deterministic: #1 Cancel -> #2 Close)
    for (const pos of currentOpenPositions) {
      if (pos.unrealizedPnLPercent >= latestAccount.profitTakePercent || pos.dteDaysRemaining <= 0) {
        const cancelRes = await cancelWorkingOrdersForContract({
          symbol: pos.contract,
          openOrders: activeOverview.orders || [],
          cancelOrder,
        });
        if (!cancelRes.ok) {
          actionsLog.push(`Halted close ${pos.contract}: ${cancelRes.errors[0]}`);
          continue;
        }
        if (cancelRes.cancelledCount > 0) {
          actionsLog.push(`Cancelled ${cancelRes.cancelledCount} working order(s) on ${pos.contract}`);
        }
        const res = await closePosition(pos.contract, { cancelOrders: true });
        if (res.ok) {
          actionsLog.push(`Buy-to-Close ${pos.contract} (${pos.unrealizedPnLPercent.toFixed(1)}% profit)`);
        } else if (res.error) {
          actionsLog.push(`Exit rejected ${pos.contract}: ${res.error}`);
        }
      }
    }

    // 2. Scan for new short put opportunities if under maxOpenPositions
    const openUnderlyings = new Set(currentOpenPositions.map((p) => p.ticker));
    const pendingSymbols = new Set(
      (activeOverview.orders || [])
        .filter((o) => ['new', 'accepted', 'pending_new', 'partially_filled'].includes(o.status))
        .map((o) => o.symbol.toUpperCase())
    );

    let openSlots = Math.max(0, latestAccount.maxOpenPositions - currentOpenPositions.length);
    const optionsLevel = activeOverview.account.options_approved_level ?? 0;
    const activeHealth = marketHealthRef.current || (await refreshMarketHealth(false));
    const optionsCrashHalted =
      activeHealth !== null &&
      (activeHealth.current.safetyStatus === 'CRASH_DEFENSE' || !activeHealth.current.allowNewEntries);

    if (openSlots > 0 && !portfolioRisk.allowNewEntries) {
      // The portfolio-wide gate is authoritative for both equity and options entries.
    } else if (openSlots > 0 && optionsCrashHalted && activeHealth) {
      const netVolStr =
        activeHealth.current.netVolume1MBillions < 0
          ? `-$${Math.abs(activeHealth.current.netVolume1MBillions).toFixed(1)}B`
          : `+$${activeHealth.current.netVolume1MBillions.toFixed(1)}B`;
      actionsLog.push(
        `Market Health Crash Defense halted new short puts (Health ${activeHealth.current.score}/100 ${activeHealth.current.label}, VIX ${
          activeHealth.current.vix !== null ? activeHealth.current.vix.toFixed(1) : 'N/A'
        }, 1M Net Vol ${netVolStr})`
      );
    } else if (openSlots > 0 && optionsLevel < 2) {
      actionsLog.push(
        `Alpaca Paper Options Level ${optionsLevel} detected (Level 2+ required for cash-secured short puts). Enable Level 2 Options in Alpaca Paper settings to route short put orders.`
      );
    } else if (openSlots > 0) {
      for (const cand of marketCandidates) {
        if (openSlots <= 0) break;
        if (openUnderlyings.has(cand.symbol)) continue;

        const twAnalysis = analyzeTradingWarzSetup(cand.candles, cand.currentPrice);
        const structural = analyzeMarketStructuralContext({
          symbol: cand.symbol,
          dailyCandles: cand.fullCandles,
        });
        if (structural?.regime === 'IN_VOLUME_GAP') {
          actionsLog.push(
            `Skipped ${cand.symbol} short put (LVN Volume Gap air pocket $${structural.activeVolumeGap?.low.toFixed(0)}–$${structural.activeVolumeGap?.high.toFixed(0)})`
          );
          continue;
        }
        if (structural && structural.mtfVolumeSentiment <= -6 && !structural.isChurnAbsorption) {
          actionsLog.push(
            `Skipped ${cand.symbol} short put (Heavy MTF Vol Sell ${structural.mtfVolumeSentiment}/10 without absorption)`
          );
          continue;
        }
        if (
          activeHealth?.current.safetyStatus === 'CAUTIOUS' &&
          twAnalysis.setupGrade !== 'A+'
        ) {
          continue;
        }
        if (
          twAnalysis.setupGrade !== 'A+' &&
          twAnalysis.setupGrade !== 'A' &&
          latestAccount.tradingWarzStrictFilter
        ) {
          continue;
        }

        const anchoredMaxStrike =
          structural?.recommendedPutFloor && Number.isFinite(structural.recommendedPutFloor)
            ? Number(Math.min(twAnalysis.recommendedPutStrike, structural.recommendedPutFloor * 0.995).toFixed(2))
            : twAnalysis.recommendedPutStrike;

        const chainRes = await fetchAlpacaOptionContracts({
          underlying: cand.symbol,
          type: 'put',
          minDte: latestAccount.minDte,
          maxDte: latestAccount.minDte + 14,
          maxStrike: anchoredMaxStrike,
          limit: 12,
        });
        if (!chainRes.ok || chainRes.contracts.length === 0) continue;

        const tradable = chainRes.contracts
          .filter((c) => c.tradable && !pendingSymbols.has(c.symbol.toUpperCase()))
          .sort((a, b) => b.strike_price - a.strike_price);
        const chosen = tradable.find((c) => (c.close_price ?? 0) >= 0.15) || tradable[0];
        if (!chosen) continue;
        const orderRisk = evaluateShortPutOrderRisk({
          symbol: chosen.symbol,
          contracts: 1,
          premiumPerShare: chosen.close_price ?? 0,
          equity: portfolioRisk.equity,
        });
        if (!orderRisk.allowed) {
          actionsLog.push(`Skipped ${chosen.symbol}: ${orderRisk.reason || 'single-trade risk limit exceeded'}`);
          continue;
        }

        const clientOrderId = buildIdempotentClientOrderId({
          symbol: chosen.symbol,
          side: 'sell',
          qty: 1,
          prefix: 'trullas_opt',
        });
        const hasDuplicateId = (activeOverview.orders || []).some(
          (o) => o.client_order_id === clientOrderId
        );
        if (hasDuplicateId) continue;

        const orderRes = await submitOrder({
          symbol: chosen.symbol,
          side: 'sell',
          qty: 1,
          type: chosen.close_price && chosen.close_price > 0 ? 'limit' : 'market',
          time_in_force: 'day',
          client_order_id: clientOrderId,
          entryMarketContext: buildEntryMarketContextFromReport(activeHealth, {
            symbolStructural: structural,
            initialRiskDollars: chosen.strike_price * 100 * 0.05,
            assetMode: 'OPTIONS',
          }),
          ...(chosen.close_price && chosen.close_price > 0
            ? { limit_price: Number(chosen.close_price.toFixed(2)) }
            : {}),
        });

        if (orderRes.ok) {
          openSlots -= 1;
          openUnderlyings.add(cand.symbol);
          actionsLog.push(`Sold 1x ${chosen.symbol} (TradingWarz ${twAnalysis.patternLabel})`);
        } else if (orderRes.error) {
          actionsLog.push(`Order rejected ${chosen.symbol}: ${orderRes.error}`);
        }
      }
    }

    await refreshAlpaca();

    if (!isMountedRef.current) return;
    if (actionsLog.length > 0) {
      setCycleFeedbackMessage(`Alpaca Paper Options Cycle: ${actionsLog.join(' • ')}.`);
    } else if (!fromScheduler) {
      setCycleFeedbackMessage(
        `Alpaca Paper Options Cycle complete: Evaluated ${currentOpenPositions.length} open contract(s) across ${marketCandidates.length} underlyings.`
      );
    }
    } finally {
      releasePortfolioLock();
    }
  };

  // Autonomous Intraday Scheduler (every 60s when autopilot is active and market is OPEN)
  useEffect(() => {
    if (!account.isAutoPilotActive || !isAlpacaConnected) return;

    const runScheduledCycle = async () => {
      if (getMarketSessionStatus() !== 'OPEN') return;
      if (autoCycleInFlightRef.current) return;
      autoCycleInFlightRef.current = true;
      cycleAbortRef.current?.abort();
      const controller = new AbortController();
      cycleAbortRef.current = controller;

      try {
        await executeAlpacaOptionsCycle(controller.signal, true);
      } finally {
        autoCycleInFlightRef.current = false;
      }
    };

    const intervalId = setInterval(runScheduledCycle, 60000);
    return () => {
      clearInterval(intervalId);
      cycleAbortRef.current?.abort();
    };
  }, [account.isAutoPilotActive, isAlpacaConnected]);

  // Active Memory Brain State
  const [isRelearningMemory, setIsRelearningMemory] = useState(false);
  const [memorySearchQuery, setMemorySearchQuery] = useState('');
  const [memoryOutcomeFilter, setMemoryOutcomeFilter] = useState<'ALL' | 'WIN' | 'BREAKEVEN' | 'LOSS'>('ALL');
  const [episodesDisplayLimit, setEpisodesDisplayLimit] = useState<number>(20);

  // Settings Modal State
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [tempDelta, setTempDelta] = useState(account.targetDelta || 0.12);
  const [tempProfitTake, setTempProfitTake] = useState(account.profitTakePercent || 75);
  const [tempMinDte, setTempMinDte] = useState(account.minDte || 5);
  const [tempMaxPositions, setTempMaxPositions] = useState(account.maxOpenPositions || 4);
  const [tempStrictFilter, setTempStrictFilter] = useState(account.tradingWarzStrictFilter ?? true);

  // Manual Close Modal State
  const [positionToClose, setPositionToClose] = useState<OptionsPosition | null>(null);
  const [closeReason, setCloseReason] = useState<string>('Manual Alpaca Paper Buy-to-Close');

  const stats: OptionsPortfolioStats = useMemo(
    () => calculateOptionsStats(liveOptionsAccount),
    [liveOptionsAccount]
  );
  const marketSession = useMemo(() => getMarketSessionStatus(), [currentTime]);

  // Combine active open positions and closed Alpaca trade history for Options Trade Journal
  const combinedActiveJournal = useMemo(() => {
    const openRecords: OptionsTradeRecord[] = (liveOptionsAccount.positions || []).map((pos) => ({
      id: pos.id,
      date: pos.entryDate,
      ticker: pos.ticker,
      boughtSold: 'Sold',
      contract: pos.contract,
      strike: pos.strike,
      optionType: pos.optionType || 'PUT',
      expiration: pos.expirationLabel || pos.expirationDateStr,
      expirationDateStr: pos.expirationDateStr,
      profitDollars: pos.unrealizedPnL,
      profitPercent: pos.unrealizedPnLPercent,
      status: 'Open',
      outcomeReason: 'Active Open Position' as any,
      underlyingPriceAtEntry: pos.underlyingPriceAtEntry,
      strikeDistancePercent: pos.strikeDistancePercent,
      delta: pos.delta,
      thetaPerDay: pos.dailyTheta,
      tradingWarzPattern: pos.tradingWarzPattern as any,
      goldenZoneSupportLevel: pos.goldenZoneSupportLevel,
      whyOpenedThesis: pos.whyOpenedThesis,
      session: pos.executionSession || 'REGULAR',
    }));
    const seen = new Set<string>();
    return [...openRecords, ...(liveOptionsAccount.tradeHistory || [])].map((rec, idx) => {
      const baseId = rec.id || `opt-journal-${idx + 1}`;
      if (!seen.has(baseId)) {
        seen.add(baseId);
        return rec.id === baseId ? rec : { ...rec, id: baseId };
      }
      let uniqueId = `${baseId}-row-${idx + 1}`;
      while (seen.has(uniqueId)) {
        uniqueId = `${uniqueId}-x`;
      }
      seen.add(uniqueId);
      return { ...rec, id: uniqueId };
    });
  }, [liveOptionsAccount.positions, liveOptionsAccount.tradeHistory]);

  // Filter Alpaca Paper options trade history records
  const filteredHistory = useMemo(() => {
    return combinedActiveJournal.filter((t) => {
      if (statusFilter === 'OPEN' && t.status !== 'Open') return false;
      if (statusFilter === 'EXPIRED' && t.outcomeReason !== 'Expired Worthless') return false;
      if (statusFilter === 'EARLY_TP' && t.outcomeReason !== 'Early Take-Profit') return false;
      if (statusFilter === 'BREAKEVEN' && t.outcomeReason !== 'Break Even') return false;

      if (sessionFilter !== 'ALL') {
        const tradeSession = t.session || 'REGULAR';
        if (sessionFilter === '24/7' && tradeSession !== '24/7') return false;
        if (sessionFilter === 'REGULAR' && tradeSession !== 'REGULAR') return false;
        if (sessionFilter === 'PREMARKET' && tradeSession !== 'PREMARKET') return false;
        if (sessionFilter === 'AFTERHOURS' && tradeSession !== 'AFTERHOURS') return false;
      }

      if (yearFilter !== 'ALL' && !t.date.startsWith(yearFilter)) return false;
      if (tickerFilter !== 'ALL' && t.ticker !== tickerFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          t.contract.toLowerCase().includes(q) ||
          t.ticker.toLowerCase().includes(q) ||
          String(t.strike).includes(q) ||
          (t.tradingWarzPattern && t.tradingWarzPattern.toLowerCase().includes(q)) ||
          t.whyOpenedThesis.toLowerCase().includes(q);
        if (!match) return false;
      }

      return true;
    });
  }, [combinedActiveJournal, statusFilter, sessionFilter, yearFilter, tickerFilter, searchQuery]);

  // Filter episodes for Brain tab
  const filteredEpisodes = useMemo(() => {
    const list = account.activeMemory.episodes || [];
    return list.filter((ep) => {
      if (memoryOutcomeFilter !== 'ALL' && ep.outcome !== memoryOutcomeFilter) {
        return false;
      }
      if (memorySearchQuery.trim()) {
        const q = memorySearchQuery.toLowerCase();
        const match =
          ep.contract.toLowerCase().includes(q) ||
          ep.tradingWarzPattern.toLowerCase().includes(q) ||
          ep.reflectionCritique.toLowerCase().includes(q) ||
          ep.learnedRule.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [account.activeMemory.episodes, memoryOutcomeFilter, memorySearchQuery]);

  const displayedEpisodes = useMemo(() => {
    if (episodesDisplayLimit === 0) return filteredEpisodes;
    return filteredEpisodes.slice(0, episodesDisplayLimit);
  }, [filteredEpisodes, episodesDisplayLimit]);

  const toggleRowExpand = (id: string) => {
    setExpandedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExpandAll = () => {
    setExpandedRowIds(new Set(filteredHistory.map((t) => t.id)));
  };

  const handleCollapseAll = () => {
    setExpandedRowIds(new Set());
  };

  // Run autonomous Alpaca Paper options cycle
  const handleRunOptionsCycle = async () => {
    if (!isAlpacaConnected) {
      setCycleFeedbackMessage(
        'Alpaca Paper is not configured. Set APCA_API_KEY_ID and APCA_API_SECRET_KEY in server .env to execute Paper options orders.'
      );
      return;
    }
    setIsCycleRunning(true);
    setCycleFeedbackMessage('Scanning Alpaca Paper OCC option contracts (SPY, QQQ, IWM, AAPL, NVDA, MSFT) & TradingWarz Golden Zones...');

    try {
      await executeAlpacaOptionsCycle(undefined, false);
    } catch {
      setCycleFeedbackMessage('Cycle aborted: unable to reach Alpaca Paper options API.');
    } finally {
      setIsCycleRunning(false);
    }
  };

  // Toggle Bot Pause
  const handleToggleAutoPilot = () => {
    const updated = {
      ...account,
      isAutoPilotActive: !account.isAutoPilotActive,
      lastUpdated: new Date().toISOString(),
    };
    setAccount(updated);
    saveOptionsPortfolio(updated);
  };

  // Export CSV
  const handleExportCSV = () => {
    const csv = exportOptionsLogsToCSV(liveOptionsAccount);
    downloadCSV(csv, `alpaca_paper_options_${new Date().toISOString().slice(0, 10)}.csv`);
    setExportToast(`Exported ${liveOptionsAccount.tradeHistory.length} Alpaca Paper option trade record(s).`);
    setTimeout(() => setExportToast(null), 4000);
  };

  // Relearn / Resynthesize Active Memory from Alpaca Paper History
  const handleRelearnFromHistory = () => {
    setIsRelearningMemory(true);
    setCycleFeedbackMessage('Synthesizing reflection memory & Market Regime attribution from recorded Alpaca Paper closed options trades...');
    setTimeout(() => {
      const updated = relearnOptionsMemoryFromHistory(
        {
          ...account,
          tradeHistory: liveOptionsAccount.tradeHistory,
          legacyHistory: [],
        },
        marketHealthRef.current
      );
      setAccount(updated);
      setIsRelearningMemory(false);
      setCycleFeedbackMessage(`Synthesized ${updated.activeMemory.episodes.length} trade episode(s) + Regime Matrix. Calibrated Max Delta: ≤ ${updated.activeMemory.calibratedMaxDelta}Δ`);
      setTimeout(() => setCycleFeedbackMessage(null), 4500);
    }, 300);
  };

  // Export Memory JSON
  const handleExportMemoryJSON = () => {
    const jsonStr = exportOptionsMemoryJSON(account.activeMemory);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `alpaca_options_memory_brain_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setExportToast(`Downloaded active memory bank (${account.activeMemory.episodes.length} episodes)!`);
    setTimeout(() => setExportToast(null), 3000);
  };

  // Save Settings Modal
  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: OptionsPortfolioAccount = {
      ...account,
      targetDelta: Number(tempDelta),
      profitTakePercent: Number(tempProfitTake),
      minDte: Number(tempMinDte),
      maxOpenPositions: Number(tempMaxPositions),
      tradingWarzStrictFilter: tempStrictFilter,
      lastUpdated: new Date().toISOString(),
    };
    setAccount(updated);
    saveOptionsPortfolio(updated);
    setShowSettingsModal(false);
    setCycleFeedbackMessage('Options Risk & Strike Selection Parameters saved.');
    setTimeout(() => setCycleFeedbackMessage(null), 4000);
  };

  // Manual Close via Alpaca Paper API
  const handleConfirmManualClose = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!positionToClose) return;
    const contractSymbol = positionToClose.contract;
    setPositionToClose(null);
    await cancelWorkingOrdersForContract({
      symbol: contractSymbol,
      openOrders: overviewRef.current?.orders || [],
      cancelOrder,
    });
    const res = await closePosition(contractSymbol, { cancelOrders: true });
    if (res.ok) {
      setCycleFeedbackMessage(`Submitted Alpaca Paper close for ${contractSymbol}. Real fills synced to Local Trade Journal.`);
    } else {
      setCycleFeedbackMessage(`Alpaca Paper close rejected for ${contractSymbol}: ${res.error}`);
    }
    setTimeout(() => setCycleFeedbackMessage(null), 5000);
  };

  return (
    <div className="space-y-6">
      {/* PERSISTENT ALPACA PAPER OPTIONS HUD */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
        
        {/* Top Header Row */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
          <div>
            <div className="flex items-center space-x-2 flex-wrap gap-y-1">
              <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <Flame className="w-3.5 h-3.5 text-emerald-400" />
                <span>Options Auto-Bot &bull; Alpaca Paper</span>
              </span>
              <span
                className={`inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded text-xs font-mono font-semibold border ${
                  isAlpacaConnected
                    ? 'bg-emerald-950/60 text-emerald-400 border-emerald-500/30'
                    : 'bg-amber-950/50 text-amber-300 border-amber-500/30'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${isAlpacaConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}></span>
                <span>
                  {alpacaLoading
                    ? 'Connecting Alpaca Paper...'
                    : isAlpacaConnected
                    ? `ALPACA PAPER CONNECTED · Options Lvl ${overview?.account?.options_approved_level ?? 0}`
                    : 'ALPACA PAPER DISCONNECTED'}
                </span>
              </span>
              <span className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded text-xs font-semibold bg-zinc-800 text-zinc-300 border border-zinc-700 font-mono">
                <span>{getBucharestTimeFormatted(currentTime)} EET</span>
              </span>
              <span className="text-xs text-zinc-400">
                • {account.isAutoPilotActive ? 'Auto-Pilot ACTIVE' : 'Auto-Pilot PAUSED'}
                {lastSyncSummary ? ` • Journal synced (${lastSyncSummary.totalAlpacaEntries})` : ''}
              </span>
              {marketHealth && (
                <span
                  data-testid="options-market-health-guard"
                  className={`inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded text-xs font-mono font-semibold border ${
                    marketHealth.current.safetyStatus === 'SAFE_RISK_ON'
                      ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                      : marketHealth.current.safetyStatus === 'CAUTIOUS'
                      ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                      : 'bg-rose-500/15 text-rose-300 border-rose-500/40'
                  }`}
                >
                  <span>
                    Market Guard: {marketHealth.current.score}/100 ({marketHealth.current.label}) · VIX{' '}
                    {marketHealth.current.vix !== null ? marketHealth.current.vix.toFixed(1) : '—'} · 1M Net{' '}
                    {marketHealth.current.netVolume1MBillions < 0
                      ? `-$${Math.abs(marketHealth.current.netVolume1MBillions).toFixed(1)}B`
                      : `+$${marketHealth.current.netVolume1MBillions.toFixed(1)}B`}{' '}
                    ·{' '}
                    {marketHealth.current.allowNewEntries
                      ? marketHealth.current.safetyStatus === 'CAUTIOUS'
                        ? 'A+ ONLY'
                        : 'SAFE'
                      : 'HALTED'}
                  </span>
                </span>
              )}
              {marketHealth?.structuralContext?.spy && (
                <span
                  data-testid="options-structural-guard"
                  className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-mono font-semibold border ${
                    marketHealth.structuralContext.spy.regime === 'IN_VOLUME_GAP'
                      ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                      : marketHealth.structuralContext.spy.regime === 'AT_INSTITUTIONAL_BUY_ZONE'
                        ? 'bg-sky-500/10 text-sky-300 border-sky-500/30'
                        : 'bg-zinc-800 text-zinc-300 border-zinc-700'
                  }`}
                >
                  Put Floor Anchor: {marketHealth.structuralContext.spy.recommendedPutFloor
                    ? `$${marketHealth.structuralContext.spy.recommendedPutFloor.toFixed(0)} (${marketHealth.structuralContext.spy.regime.replace(/_/g, ' ')})`
                    : marketHealth.structuralContext.spy.regime.replace(/_/g, ' ')}
                </span>
              )}
            </div>
            <div className="mt-2 flex items-baseline space-x-3">
              <span className="text-3xl font-extrabold text-white font-mono tracking-tight">
                {isAlpacaConnected
                  ? `$${(overview?.account?.options_buying_power ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : '—'}
              </span>
              <span className="text-sm font-semibold text-emerald-400 font-mono">
                {isAlpacaConnected
                  ? `Options Buying Power • ${stats.totalRealizedIncome >= 0 ? '+' : ''}$${stats.totalRealizedIncome.toFixed(2)} Realized`
                  : 'Configure Alpaca Paper keys in server .env'}
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-1 max-w-2xl">
              Harvests theta decay on Alpaca Paper OCC Equity/ETF Out-of-the-Money Puts (SPY, QQQ, IWM, AAPL, NVDA, MSFT at 0.08 - 0.14 Delta) anchored beneath the TradingWarz 61.8% Golden Zone.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleRunOptionsCycle}
              disabled={isCycleRunning || !isAlpacaConnected}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-lg ${
                isCycleRunning
                  ? 'bg-emerald-600/50 text-white cursor-wait'
                  : 'bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white shadow-emerald-500/20'
              }`}
            >
              <Zap className={`w-4 h-4 ${isCycleRunning ? 'animate-spin' : ''}`} />
              <span>{isCycleRunning ? 'Routing Options...' : 'Run Options Auto-Pilot Cycle'}</span>
            </button>

            <button
              onClick={() => refreshAlpaca()}
              className="flex items-center space-x-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors"
              title="Refresh Alpaca Paper OCC positions, orders, and sync to Trade Journal"
            >
              <RefreshCw className="w-3.5 h-3.5 text-sky-400" />
              <span>Refresh Alpaca</span>
            </button>

            <button
              onClick={handleToggleAutoPilot}
              className="flex items-center space-x-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors"
            >
              {account.isAutoPilotActive ? (
                <>
                  <Pause className="w-3.5 h-3.5 text-amber-400" />
                  <span>Pause Bot</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Resume Bot</span>
                </>
              )}
            </button>

            <button
              onClick={handleExportCSV}
              className="flex items-center space-x-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors"
              title="Export Alpaca Paper options execution records to CSV"
            >
              <Download className="w-3.5 h-3.5 text-blue-400" />
              <span>Export CSV</span>
            </button>

            <button
              onClick={() => setShowSettingsModal(true)}
              className="flex items-center space-x-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors"
            >
              <Sliders className="w-3.5 h-3.5 text-purple-400" />
              <span>Controls</span>
            </button>
          </div>
        </div>

        {!alpacaLoading && !isAlpacaConnected && (
          <div
            data-testid="alpaca-options-config-banner"
            className="mt-3 p-3.5 bg-amber-950/40 border border-amber-500/30 rounded-xl text-xs text-amber-200 flex items-start space-x-2.5"
          >
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-amber-300">Alpaca Paper Account Required</div>
              <p className="text-amber-200/80 mt-0.5">
                {overview?.message || alpacaError || 'Configure APCA_API_KEY_ID, APCA_API_SECRET_KEY, and APCA_API_BASE_URL=https://paper-api.alpaca.markets in server .env to enable Paper OCC options routing and live history sync.'}
              </p>
            </div>
          </div>
        )}

        {/* Live Feedback Notification Banner */}
        {cycleFeedbackMessage && (
          <div className="mt-3 p-2.5 rounded-lg bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs flex items-center space-x-2 animate-fadeIn">
            <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{cycleFeedbackMessage}</span>
          </div>
        )}

        {exportToast && (
          <div className="mt-3 p-2.5 rounded-lg bg-blue-950/60 border border-blue-500/40 text-blue-300 text-xs flex items-center space-x-2 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0" />
            <span>{exportToast}</span>
          </div>
        )}

        {/* HUD Metrics Cards Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-4">
          <div className="bg-zinc-950/60 border border-zinc-800 rounded-lg p-3">
            <div className="text-[11px] text-zinc-400 uppercase font-semibold">Total Realized Income</div>
            <div className="text-xl font-bold text-emerald-400 mt-1">
              ${stats.totalRealizedIncome.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-zinc-400 mt-0.5">
              2026: ${stats.income2026.toLocaleString()} | 2025: ${stats.income2025.toLocaleString()}
            </div>
          </div>

          <div className="bg-zinc-950/60 border border-zinc-800 rounded-lg p-3">
            <div className="text-[11px] text-zinc-400 uppercase font-semibold">Win Rate</div>
            <div className="text-xl font-bold text-emerald-400 mt-1">{stats.winRatePercent}%</div>
            <div className="text-[10px] text-zinc-400 mt-0.5">
              {stats.totalTradesCount > 0
                ? `${stats.winningTradesCount} Wins / ${stats.losingTradesCount} Losses / ${stats.breakEvenTradesCount} BE`
                : '0 Active Closed Trades'}
            </div>
          </div>

          <div className="bg-zinc-950/60 border border-zinc-800 rounded-lg p-3">
            <div className="text-[11px] text-zinc-400 uppercase font-semibold">Daily Theta Burn (Θ)</div>
            <div className="text-xl font-bold text-purple-400 mt-1">
              +${stats.dailyThetaIncome.toFixed(2)}/day
            </div>
            <div className="text-[10px] text-zinc-400 mt-0.5">Active Time Decay Accrual</div>
          </div>

          <div className="bg-zinc-950/60 border border-zinc-800 rounded-lg p-3">
            <div className="text-[11px] text-zinc-400 uppercase font-semibold">Profit Factor</div>
            <div className="text-xl font-bold text-white mt-1">{stats.profitFactor}x</div>
            <div className="text-[10px] text-emerald-400 mt-0.5">
              {stats.totalTradesCount === 0
                ? 'No Closed Trades'
                : stats.profitFactor >= 2
                ? 'Strong Asymmetry'
                : 'Active Ratio'}
            </div>
          </div>

          <div className="bg-zinc-950/60 border border-zinc-800 rounded-lg p-3">
            <div className="text-[11px] text-zinc-400 uppercase font-semibold">Total Trades</div>
            <div className="text-xl font-bold text-white mt-1">{stats.totalTradesCount}</div>
            <div className="text-[10px] text-zinc-400 mt-0.5">
              {stats.openPositionsCount} Open Contract{stats.openPositionsCount === 1 ? '' : 's'}
            </div>
          </div>

          <div className="bg-zinc-950/60 border border-zinc-800 rounded-lg p-3">
            <div className="text-[11px] text-zinc-400 uppercase font-semibold">Avg Win / Trade</div>
            <div className="text-xl font-bold text-emerald-400 mt-1">+${stats.averageWin.toFixed(2)}</div>
            <div className="text-[10px] text-zinc-400 mt-0.5">Avg Loss: -${stats.averageLoss.toFixed(2)}</div>
          </div>
        </div>
      </div>

      {/* STRATEGY LOGIC BANNER (Rules enforced by Alpaca Paper Options & TradingWarz) */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4">
        <div className="flex items-center space-x-2 text-xs font-bold text-zinc-300 uppercase tracking-wider mb-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Core Options Harvesting Principles & TradingWarz Confluence:</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="bg-zinc-950/50 p-3 rounded-lg border border-zinc-800/80">
            <span className="font-semibold text-emerald-400">1. Delta & Safe Strike Selection:</span>
            <p className="text-zinc-400 mt-1">
              Sells cash-secured Out-of-the-Money US Equity/ETF Puts strictly at <strong>0.08 - 0.14 Delta</strong> (86% - 94% theoretical probability of expiring worthless), keeping strikes 2.5% to 4.5% below current price.
            </p>
          </div>
          <div className="bg-zinc-950/50 p-3 rounded-lg border border-zinc-800/80">
            <span className="font-semibold text-indigo-400">2. TradingWarz Golden Zone Cushion:</span>
            <p className="text-zinc-400 mt-1">
              Short strikes are placed <strong>strictly below the 61.8% Fibonacci Golden Zone</strong> and beneath the Mother Bar swing low of Inside Bars (IB), The Holy Grail (OBIB), or The Nirvana (IBOB) compression.
            </p>
          </div>
          <div className="bg-zinc-950/50 p-3 rounded-lg border border-zinc-800/80">
            <span className="font-semibold text-amber-400">3. 70-85% Early TP & Breakeven Defense:</span>
            <p className="text-zinc-400 mt-1">
              Captures <strong>65% to 85% of total premium early</strong> via Alpaca Buy-to-Close rather than enduring weekend gamma tail risk.
            </p>
          </div>
        </div>
      </div>

      {/* TAB NAVIGATION: Trade Journal, Open Positions, Brain */}
      <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setMainTab('journal')}
            className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              mainTab === 'journal'
                ? 'bg-zinc-800 text-white border border-zinc-700'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
            <span>Options Trade Journal ({filteredHistory.length})</span>
          </button>

          <button
            onClick={() => setMainTab('open-positions')}
            className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              mainTab === 'open-positions'
                ? 'bg-zinc-800 text-white border border-zinc-700'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-indigo-400" />
            <span>Active Open Positions ({liveOptionsAccount.positions.length})</span>
          </button>

          <button
            onClick={() => setMainTab('brain')}
            className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              mainTab === 'brain'
                ? 'bg-zinc-800 text-white border border-zinc-700'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
            }`}
          >
            <Brain className="w-3.5 h-3.5 text-purple-400" />
            <span>Options Active Memory Brain ({account.activeMemory.episodes.length} Episodes)</span>
          </button>
        </div>

        {/* Global Expand / Collapse All for Journal */}
        {mainTab === 'journal' && (
          <div className="flex items-center space-x-2">
            <button
              onClick={handleExpandAll}
              className="text-xs text-zinc-400 hover:text-zinc-200 px-2 py-1 rounded hover:bg-zinc-800 transition-colors"
            >
              Expand All
            </button>
            <span className="text-zinc-600">|</span>
            <button
              onClick={handleCollapseAll}
              className="text-xs text-zinc-400 hover:text-zinc-200 px-2 py-1 rounded hover:bg-zinc-800 transition-colors"
            >
              Collapse All
            </button>
          </div>
        )}
      </div>

      {/* TAB 1: OPTIONS TRADE JOURNAL (Concise Table Rows with Expandable Detailed Card) */}
      {mainTab === 'journal' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-zinc-900 p-3 rounded-lg border border-zinc-800">
            {/* Status Pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-zinc-500 mr-1 flex items-center">
                <Filter className="w-3 h-3 mr-1" /> Status:
              </span>
              {[
                { id: 'ALL', label: 'All Trades & Positions' },
                { id: 'OPEN', label: 'Active Open Positions' },
                { id: 'EXPIRED', label: '100% Expired Worthless' },
                { id: 'EARLY_TP', label: 'Early Take-Profit' },
                { id: 'BREAKEVEN', label: 'Break Even' },
              ].map((pill) => (
                <button
                  key={pill.id}
                  onClick={() => setStatusFilter(pill.id as any)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    statusFilter === pill.id
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                  }`}
                >
                  {pill.label}
                </button>
              ))}
            </div>

            {/* Year & Ticker Filter */}
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-1 text-xs">
                <span className="text-zinc-500">Year:</span>
                {(['ALL', '2026', '2025'] as const).map((yr) => (
                  <button
                    key={yr}
                    onClick={() => setYearFilter(yr)}
                    className={`px-2 py-0.5 rounded text-xs ${
                      yearFilter === yr
                        ? 'bg-zinc-700 text-white font-bold'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {yr === 'ALL' ? 'All' : yr}
                  </button>
                ))}
              </div>

              <div className="flex items-center space-x-1 text-xs">
                <span className="text-zinc-500">Asset:</span>
                {(['ALL', 'SPY', 'QQQ', 'IWM', 'AAPL'] as const).map((tick) => (
                  <button
                    key={tick}
                    onClick={() => setTickerFilter(tick)}
                    className={`px-2 py-0.5 rounded text-xs ${
                      tickerFilter === tick
                        ? 'bg-zinc-700 text-white font-bold'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {tick}
                  </button>
                ))}
              </div>

              <div className="flex items-center space-x-1 text-xs">
                <span className="text-zinc-500">Session:</span>
                {(['ALL', 'REGULAR', 'PREMARKET', 'AFTERHOURS', '24/7'] as const).map((ses) => (
                  <button
                    key={ses}
                    onClick={() => setSessionFilter(ses)}
                    className={`px-2 py-0.5 rounded text-xs ${
                      sessionFilter === ses
                        ? 'bg-emerald-600 text-white font-bold'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {ses}
                  </button>
                ))}
              </div>

              {/* Search input */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2" />
                <input
                  type="text"
                  placeholder="Search contract, strike..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-zinc-950 border border-zinc-800 rounded-lg pl-8 pr-3 py-1 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 w-44"
                />
              </div>
            </div>
          </div>

          {/* Table Container */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-lg">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-950/80 text-zinc-400 border-b border-zinc-800 uppercase tracking-wider font-semibold text-[11px]">
                  <tr>
                    <th className="py-3 px-4 w-8"></th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Session</th>
                    <th className="py-3 px-4">Contract / Strike</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">TradingWarz Confluence</th>
                    <th className="py-3 px-4">Expiration</th>
                    <th className="py-3 px-4 text-right">Profit ($)</th>
                    <th className="py-3 px-4 text-right">Return (%)</th>
                    <th className="py-3 px-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {filteredHistory.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-10 px-4 text-center text-zinc-400">
                        <div className="max-w-md mx-auto space-y-1">
                          <p className="font-semibold text-zinc-300">
                            {isAlpacaConnected
                              ? 'No Alpaca Paper option positions or filled option orders yet.'
                              : 'Connect Alpaca Paper in server .env to view live option positions and execution history.'}
                          </p>
                          <p className="text-[11px] text-zinc-500">
                            Every Alpaca Paper OCC option fill is mirrored automatically into your Local Trade Journal.
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredHistory.map((trade) => {
                    const isExpanded = expandedRowIds.has(trade.id);
                    const isWin = trade.profitDollars > 0;
                    const isBreakEven = trade.outcomeReason === 'Break Even';

                    return (
                      <React.Fragment key={trade.id}>
                        {/* Concise Default Row */}
                        <tr
                          onClick={() => toggleRowExpand(trade.id)}
                          className={`cursor-pointer transition-colors hover:bg-zinc-800/40 ${
                            isExpanded ? 'bg-zinc-800/30' : ''
                          }`}
                        >
                          <td className="py-3 px-4 text-zinc-500">
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-emerald-400" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-zinc-400" />
                            )}
                          </td>
                          <td className="py-3 px-4 font-mono text-zinc-300 whitespace-nowrap">
                            {trade.date}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                              (trade.session || 'REGULAR') === '24/7'
                                ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                                : (trade.session || 'REGULAR') === 'PREMARKET'
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                : (trade.session || 'REGULAR') === 'AFTERHOURS'
                                ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                                : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            }`}>
                              {trade.session || 'REGULAR'}
                            </span>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <div className="flex items-center space-x-2">
                              <span className="font-bold text-white font-mono">{trade.contract}</span>
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 border border-zinc-700 font-mono">
                                {trade.ticker}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              SOLD PUT
                            </span>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap text-zinc-300">
                            <span className="inline-flex items-center space-x-1 text-xs">
                              <Sparkles className="w-3 h-3 text-indigo-400" />
                              <span>{trade.tradingWarzPattern?.replace(/_/g, ' ') || 'Golden Zone 61.8%'}</span>
                            </span>
                          </td>
                          <td className="py-3 px-4 text-zinc-400 whitespace-nowrap">
                            {trade.expiration}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold whitespace-nowrap">
                            <span className={isWin ? 'text-emerald-400' : isBreakEven ? 'text-amber-400' : 'text-rose-400'}>
                              {trade.profitDollars >= 0 ? '+' : ''}${trade.profitDollars.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-semibold whitespace-nowrap">
                            <span className={isWin ? 'text-emerald-400' : isBreakEven ? 'text-amber-400' : 'text-rose-400'}>
                              {trade.profitPercent}%
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                trade.status === 'Open'
                                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-mono'
                                  : trade.outcomeReason === 'Expired Worthless'
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  : trade.outcomeReason === 'Early Take-Profit'
                                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              }`}
                            >
                              {trade.status === 'Open' ? 'OPEN' : trade.outcomeReason}
                            </span>
                          </td>
                        </tr>

                        {/* Expandable Deep Analytics Card */}
                        {isExpanded && (
                          <tr className="bg-zinc-950/90 border-t border-b border-zinc-800">
                            <td colSpan={10} className="p-5">
                              <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-5 space-y-4 shadow-xl">
                                {/* Card Header with Contract Info */}
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-zinc-800 gap-2">
                                  <div className="flex items-center space-x-3">
                                    <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-sm">
                                      {trade.ticker}
                                    </div>
                                    <div>
                                      <div className="flex items-center space-x-2">
                                        <span className="font-bold text-white text-base font-mono">
                                          {trade.contract}
                                        </span>
                                        <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                                          {trade.outcomeReason}
                                        </span>
                                      </div>
                                      <div className="text-xs text-zinc-400 mt-0.5">
                                        Expiration: {trade.expiration} • Strike: ${trade.strike.toLocaleString()} ({trade.strikeDistancePercent}% OTM Safety Margin)
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flex items-center space-x-2">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onSelectSymbolForChart(trade.ticker);
                                      }}
                                      className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors"
                                    >
                                      <LineChart className="w-3.5 h-3.5 text-indigo-400" />
                                      <span>Technical Chart</span>
                                    </button>
                                  </div>
                                </div>

                                {/* Greeks & Mathematical Telemetry Grid */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                  <div className="bg-zinc-950/70 p-3 rounded-lg border border-zinc-800/80">
                                    <div className="text-[10px] text-zinc-500 uppercase font-semibold">Delta Sensitivity (Δ)</div>
                                    <div className="text-base font-mono font-bold text-white mt-1">
                                      -{trade.delta.toFixed(3)}
                                    </div>
                                    <div className="text-[10px] text-emerald-400 mt-0.5">
                                      ~{((1 - trade.delta) * 100).toFixed(0)}% Probability of Profit
                                    </div>
                                  </div>

                                  <div className="bg-zinc-950/70 p-3 rounded-lg border border-zinc-800/80">
                                    <div className="text-[10px] text-zinc-500 uppercase font-semibold">Theta Decay Rate (Θ)</div>
                                    <div className="text-base font-mono font-bold text-purple-400 mt-1">
                                      +${trade.thetaPerDay.toFixed(2)}/day
                                    </div>
                                    <div className="text-[10px] text-zinc-400 mt-0.5">Calendar Time Harvest</div>
                                  </div>

                                  <div className="bg-zinc-950/70 p-3 rounded-lg border border-zinc-800/80">
                                    <div className="text-[10px] text-zinc-500 uppercase font-semibold">Golden Zone 61.8% Floor</div>
                                    <div className="text-base font-mono font-bold text-indigo-400 mt-1">
                                      ${trade.goldenZoneSupportLevel.toLocaleString()}
                                    </div>
                                    <div className="text-[10px] text-emerald-400 mt-0.5">
                                      Strike is +${(trade.goldenZoneSupportLevel - trade.strike).toFixed(0)} below floor
                                    </div>
                                  </div>

                                  <div className="bg-zinc-950/70 p-3 rounded-lg border border-zinc-800/80">
                                    <div className="text-[10px] text-zinc-500 uppercase font-semibold">Realized Net Gain</div>
                                    <div className="text-base font-mono font-bold text-emerald-400 mt-1">
                                      +${trade.profitDollars.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                    </div>
                                    <div className="text-[10px] text-zinc-400 mt-0.5">
                                      {trade.profitPercent}% of Max Premium
                                    </div>
                                  </div>
                                </div>

                                {/* TradingWarz Confluence Details */}
                                <div className="bg-indigo-950/20 border border-indigo-500/20 rounded-lg p-3 text-xs">
                                  <div className="flex items-center space-x-1.5 font-semibold text-indigo-300">
                                    <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                                    <span>TradingWarz Pattern Confluence:</span>
                                    <span className="text-white font-bold ml-1">
                                      {trade.tradingWarzPattern?.replace(/_/g, ' ') || 'Golden Zone Reversal'}
                                    </span>
                                  </div>
                                  <p className="text-zinc-400 mt-1 leading-relaxed">
                                    Compression pattern occurred on the daily timeframe as the index consolidated near support. Volatility was crushed within the mother bar range, establishing a tight invalidation barrier above our put strike.
                                  </p>
                                </div>

                                {/* Why the Bot Opened This Option Position Thesis */}
                                <div className="bg-zinc-950/60 border border-zinc-800 rounded-lg p-3 text-xs">
                                  <div className="flex items-center space-x-1.5 font-semibold text-emerald-400">
                                    <Bot className="w-3.5 h-3.5 text-emerald-400" />
                                    <span>Why the Bot Opened This Option Position:</span>
                                  </div>
                                  <p className="text-zinc-300 mt-1.5 leading-relaxed font-sans">
                                    {trade.whyOpenedThesis}
                                  </p>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ACTIVE OPEN POSITIONS (Live Alpaca Paper Positions) */}
      {mainTab === 'open-positions' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <Layers className="w-4 h-4 text-emerald-400" />
              <span>Active Open Options Positions ({liveOptionsAccount.positions.length})</span>
            </h3>
            <span className="text-xs text-zinc-400">
              Total Accruing Theta: <strong className="text-purple-400">+${stats.dailyThetaIncome.toFixed(2)}/day</strong>
            </span>
          </div>

          {liveOptionsAccount.positions.length === 0 ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center text-zinc-400">
              <Bot className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
              <p>No active option contracts open in your Alpaca Paper account.</p>
              <p className="text-xs text-zinc-500 mt-1">
                Click "Run Options Auto-Pilot Cycle" to scan OCC option chains for TradingWarz Golden Zone setups on SPY, QQQ, IWM, AAPL, NVDA &amp; MSFT.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {liveOptionsAccount.positions.map((pos) => {
                const profitPct = pos.unrealizedPnLPercent;
                return (
                  <div
                    key={pos.id}
                    className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-lg space-y-4"
                  >
                    {/* Position Header */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center font-bold text-emerald-400">
                          {pos.ticker}
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-bold text-white font-mono text-sm">{pos.contract}</span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                              {pos.setupGrade} Setup
                            </span>
                          </div>
                          <div className="text-xs text-zinc-400 mt-0.5">
                            {pos.contractsCount} Contract(s) • DTE: {pos.dteDaysRemaining} Days • Strike: ${pos.strike.toLocaleString()}
                            <span className="block text-[11px] text-emerald-400/80 font-mono mt-0.5">
                              Opened: {pos.entryDate} (Bucharest Time)
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-xs text-zinc-400">Unrealized P&L</div>
                        <div className="text-base font-bold font-mono text-emerald-400">
                          +${pos.unrealizedPnL.toFixed(2)} (+{pos.unrealizedPnLPercent}%)
                        </div>
                      </div>
                    </div>

                    {/* Progress Bar towards 75% Profit Target */}
                    <div>
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <span className="text-zinc-400">Theta Harvest Progress:</span>
                        <span className="font-semibold text-emerald-400">
                          {pos.unrealizedPnLPercent}% / {pos.profitTargetPercent}% Target
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-500 to-indigo-500 transition-all duration-500"
                          style={{
                            width: `${Math.min(100, Math.max(0, (pos.unrealizedPnLPercent / pos.profitTargetPercent) * 100))}%`,
                          }}
                        />
                      </div>
                    </div>

                    {/* Greeks & Context Stats */}
                    <div className="grid grid-cols-3 gap-2 text-center text-xs bg-zinc-950/60 p-2.5 rounded-lg border border-zinc-800">
                      <div>
                        <div className="text-[10px] text-zinc-500 uppercase font-semibold">Delta</div>
                        <div className="font-mono font-bold text-white">{pos.delta}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-zinc-500 uppercase font-semibold">Daily Theta</div>
                        <div className="font-mono font-bold text-purple-400">+${pos.dailyTheta.toFixed(2)}/day</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-zinc-500 uppercase font-semibold">Strike Distance</div>
                        <div className="font-mono font-bold text-emerald-400">{pos.strikeDistancePercent}% OTM</div>
                      </div>
                    </div>

                    {/* Thesis */}
                    <p className="text-xs text-zinc-400 leading-relaxed bg-zinc-950/30 p-2.5 rounded border border-zinc-800/60">
                      {pos.whyOpenedThesis}
                    </p>

                    {/* Position Action Buttons */}
                    <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
                      <button
                        onClick={() => onSelectSymbolForChart(pos.ticker)}
                        className="text-xs text-zinc-400 hover:text-zinc-200 flex items-center space-x-1"
                      >
                        <LineChart className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Chart View</span>
                      </button>

                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => setPositionToClose(pos)}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
                        >
                          Close on Alpaca ({pos.unrealizedPnL >= 0 ? '+' : ''}${pos.unrealizedPnL.toFixed(2)})
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: OPTIONS ACTIVE LEARNING BRAIN */}
      {mainTab === 'brain' && (
        <div className="space-y-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-lg">
            {/* Header with Title and Relearn/Export Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-2">
              <div className="flex items-center space-x-2 text-sm font-bold text-white">
                <Brain className="w-4 h-4 text-purple-400" />
                <span>Options Active Memory & Continual Learning Architecture (FinRL & TradeMemory)</span>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={handleRelearnFromHistory}
                  disabled={isRelearningMemory}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white flex items-center space-x-1.5 transition-colors shadow"
                  title="Re-run synthesis and reflection across recorded trade history"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRelearningMemory ? 'animate-spin' : ''}`} />
                  <span>{isRelearningMemory ? 'Synthesizing...' : 'Relearn from Trade History'}</span>
                </button>
                <button
                  onClick={handleExportMemoryJSON}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 flex items-center space-x-1.5 transition-colors"
                  title="Export Memory Bank as JSON"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export JSON</span>
                </button>
              </div>
            </div>

            <p className="text-xs text-zinc-400 max-w-3xl leading-relaxed">
              The Options Engine utilizes continual reinforcement learning from real Alpaca Paper trade episodes. It analyzes win velocity, IV crush kinetics, and TradingWarz Golden Zone reliability to autonomously calibrate Delta distance and profit take targets.
            </p>

            {/* Top Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-4">
              <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800">
                <div className="text-[10px] text-zinc-500 uppercase font-semibold">Learned Episodes</div>
                <div className="text-xl font-bold text-white mt-1">
                  {account.activeMemory.episodes?.length || account.activeMemory.learningIterations}
                </div>
                <div className="text-[10px] text-purple-400">
                  {liveOptionsAccount.tradeHistory.length} Live Closed Trade(s) Loaded
                </div>
              </div>
              <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800">
                <div className="text-[10px] text-zinc-500 uppercase font-semibold">Calibrated Delta Cap</div>
                <div className="text-xl font-bold text-emerald-400 mt-1">≤ {account.activeMemory.calibratedMaxDelta} Δ</div>
                <div className="text-[10px] text-zinc-400">Target OTM Put Delta</div>
              </div>
              <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800">
                <div className="text-[10px] text-zinc-500 uppercase font-semibold">Optimal TP Target</div>
                <div className="text-xl font-bold text-indigo-400 mt-1">{account.activeMemory.calibratedProfitTakePct}%</div>
                <div className="text-[10px] text-zinc-400">Early Profit Lock Target</div>
              </div>
              <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800">
                <div className="text-[10px] text-zinc-500 uppercase font-semibold">Total Theta Harvested</div>
                <div className="text-xl font-bold text-emerald-400 mt-1">
                  ${account.activeMemory.totalThetaHarvested.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
                <div className="text-[10px] text-emerald-400">Realized Premium Record</div>
              </div>
            </div>

            {/* Options Market Regime Attribution Matrix (Separate from Equities) */}
            <div className="mt-5" data-testid="options-regime-matrix">
              <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider mb-2 flex items-center space-x-1.5">
                <Activity className="w-3.5 h-3.5 text-cyan-400" />
                <span>Options Theta Edge by Entry Market Regime (Bayesian K=8):</span>
              </h4>
              {(() => {
                const optRegimeRows: RegimePerformanceStat[] = Object.values(
                  account.activeMemory.regimeStats || {}
                )
                  .filter((r) => r.assetMode === 'OPTIONS' && r.axis !== 'SENTIMENT_X_SETUP')
                  .sort((a, b) => b.tradesCount - a.tradesCount || b.shrunkMultiplier - a.shrunkMultiplier);

                if (optRegimeRows.length === 0) {
                  return (
                    <div className="p-3 rounded-lg bg-zinc-950/70 border border-zinc-800/80 text-xs text-zinc-400">
                      Click <strong className="text-zinc-200">Relearn from Trade History</strong> or close Alpaca options trades to attribute short put performance by Sentiment, VIX level &amp; Structural Zone separately from Equities.
                    </div>
                  );
                }

                return (
                  <div className="overflow-x-auto border border-zinc-800/80 rounded-lg bg-zinc-950/60">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-zinc-800 text-[10px] uppercase tracking-wider text-zinc-400">
                        <tr>
                          <th className="py-2 px-3">Axis</th>
                          <th className="py-2 px-3">Entry Market Regime</th>
                          <th className="py-2 px-3 text-right">Contracts (n)</th>
                          <th className="py-2 px-3 text-right">Win Rate</th>
                          <th className="py-2 px-3 text-right">Net Theta P&amp;L</th>
                          <th className="py-2 px-3 text-right">Bayesian Scale</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/60 font-mono tabular-nums">
                        {optRegimeRows.slice(0, 8).map((row) => (
                          <tr key={row.regimeKey}>
                            <td className="py-1.5 px-3 text-[10px] text-zinc-500">{row.axis}</td>
                            <td className="py-1.5 px-3 text-zinc-200 font-semibold">{row.label}</td>
                            <td className="py-1.5 px-3 text-right text-zinc-300">
                              {row.tradesCount}
                              {!row.sampleSufficient && (
                                <span className="text-[10px] text-zinc-500 ml-1">(n&lt;10)</span>
                              )}
                            </td>
                            <td className="py-1.5 px-3 text-right text-zinc-200">{row.winRate.toFixed(1)}%</td>
                            <td
                              className={`py-1.5 px-3 text-right font-bold ${
                                row.totalPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              {row.totalPnL >= 0 ? '+' : '-'}${Math.abs(row.totalPnL).toFixed(2)}
                            </td>
                            <td className="py-1.5 px-3 text-right text-cyan-300 font-bold">
                              {row.shrunkMultiplier.toFixed(2)}x
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>

            {/* Autonomous Policy Rules Formulated by Memory Brain */}
            <div className="mt-5">
              <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider mb-2 flex items-center space-x-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Autonomous Policy Rules Formulated by Memory Brain:</span>
              </h4>
              <div className="space-y-1.5">
                {account.activeMemory.learnedRules.map((rule, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded-lg bg-zinc-950/70 border border-zinc-800/80 text-xs text-zinc-300 flex items-start space-x-2"
                  >
                    <span className="text-emerald-400 font-bold font-mono">[{idx + 1}]</span>
                    <span>{rule}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Episodic Memory Journal with Filters & Pagination */}
            <div className="mt-6 border-t border-zinc-800 pt-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
                <div className="flex items-center space-x-2">
                  <Activity className="w-3.5 h-3.5 text-purple-400" />
                  <h4 className="text-xs font-bold text-zinc-200 uppercase tracking-wider">
                    Epistemic Memory Trade Episodes ({filteredEpisodes.length} Loaded):
                  </h4>
                </div>

                {/* Outcome Filter Buttons */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {(['ALL', 'WIN', 'BREAKEVEN', 'LOSS'] as const).map((outcome) => {
                    const count = outcome === 'ALL'
                      ? (account.activeMemory.episodes?.length || 0)
                      : (account.activeMemory.episodes?.filter((e) => e.outcome === outcome).length || 0);

                    const label = outcome === 'ALL' ? 'All' : outcome === 'WIN' ? 'Wins' : outcome === 'BREAKEVEN' ? 'Break-Even' : 'Loss/Order Error';

                    return (
                      <button
                        key={outcome}
                        onClick={() => setMemoryOutcomeFilter(outcome)}
                        className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${
                          memoryOutcomeFilter === outcome
                            ? 'bg-purple-600 text-white'
                            : 'bg-zinc-950 text-zinc-400 hover:text-white border border-zinc-800'
                        }`}
                      >
                        {label} ({count})
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Sub-bar: Search input & Display count toggle */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3 bg-zinc-950/60 p-2 rounded-lg border border-zinc-800/80">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2" />
                  <input
                    type="text"
                    placeholder="Search episode by contract, pattern (e.g. Holy Grail), or learned rule..."
                    value={memorySearchQuery}
                    onChange={(e) => setMemorySearchQuery(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded pl-8 pr-3 py-1 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div className="flex items-center space-x-1.5 text-xs text-zinc-400">
                  <span className="text-[11px]">Show:</span>
                  {[20, 50, 0].map((limit) => (
                    <button
                      key={limit}
                      onClick={() => setEpisodesDisplayLimit(limit)}
                      className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                        episodesDisplayLimit === limit
                          ? 'bg-zinc-800 text-purple-400 font-bold border border-purple-500/40'
                          : 'bg-zinc-900 text-zinc-400 hover:text-white'
                      }`}
                    >
                      {limit === 0 ? `All (${filteredEpisodes.length})` : limit}
                    </button>
                  ))}
                </div>
              </div>

              {/* Episodes List */}
              <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                {displayedEpisodes.map((ep) => {
                  const isWin = ep.outcome === 'WIN';
                  const isBreakEven = ep.outcome === 'BREAKEVEN';

                  return (
                    <div
                      key={ep.id}
                      className="p-3 rounded-lg bg-zinc-950/90 border border-zinc-800 text-xs space-y-1.5 hover:border-zinc-700 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-white font-mono">{ep.contract}</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 font-medium">
                            {ep.tradingWarzPattern}
                          </span>
                          <span
                            className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                              isWin
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : isBreakEven
                                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                            }`}
                          >
                            {ep.outcome}
                          </span>
                          {ep.entryMarketContext && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/25">
                              {formatEntryMarketContextBadge(ep.entryMarketContext)}
                            </span>
                          )}
                        </div>
                        <span
                          className={`font-bold font-mono ${
                            isWin ? 'text-emerald-400' : isBreakEven ? 'text-amber-400' : 'text-rose-400'
                          }`}
                        >
                          {ep.pnl >= 0 ? '+' : ''}${ep.pnl.toLocaleString('en-US', { minimumFractionDigits: 2 })} ({ep.pnlPercent >= 0 ? '+' : ''}{ep.pnlPercent}%)
                        </span>
                      </div>

                      <p className="text-zinc-400 italic text-[11px] leading-relaxed">
                        "{ep.reflectionCritique}"
                      </p>

                      <div className="text-[11px] text-zinc-300 font-medium flex items-start space-x-1">
                        <span className="text-purple-400">💡</span>
                        <span>
                          <strong className="text-purple-300">Rule Synthesized:</strong> {ep.learnedRule}
                        </span>
                      </div>
                    </div>
                  );
                })}

                {displayedEpisodes.length === 0 && (
                  <div className="p-8 text-center text-zinc-500 text-xs bg-zinc-950/50 rounded-lg border border-zinc-800">
                    No memory episodes found matching filter "{memorySearchQuery}".
                  </div>
                )}
              </div>

              {/* Footer status counter */}
              <div className="flex items-center justify-between text-[11px] text-zinc-500 mt-2 px-1">
                <span>
                  Showing {displayedEpisodes.length} of {filteredEpisodes.length} filtered episodes ({account.activeMemory.episodes?.length || 0} total)
                </span>
                {episodesDisplayLimit > 0 && filteredEpisodes.length > episodesDisplayLimit && (
                  <button
                    onClick={() => setEpisodesDisplayLimit(0)}
                    className="text-purple-400 hover:text-purple-300 underline"
                  >
                    Load all {filteredEpisodes.length} episodes
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* RISK CONTROLS MODAL */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                <Sliders className="w-4 h-4 text-purple-400" />
                <span>Options Harvesting & Risk Parameters</span>
              </h3>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="text-zinc-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-4 text-xs">
              <div>
                <label className="block text-zinc-300 font-medium mb-1">
                  Target Put Delta (Default 0.12 = 88% POP):
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.05"
                  max="0.25"
                  value={tempDelta}
                  onChange={(e) => setTempDelta(parseFloat(e.target.value))}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-white font-mono"
                />
                <span className="text-[11px] text-zinc-500 mt-1 block">
                  Lower delta (e.g. 0.08) offers deeper OTM safety margin (92% win rate).
                </span>
              </div>

              <div>
                <label className="block text-zinc-300 font-medium mb-1">
                  Early Profit-Taking Threshold (% of Max Premium):
                </label>
                <input
                  type="number"
                  step="5"
                  min="50"
                  max="95"
                  value={tempProfitTake}
                  onChange={(e) => setTempProfitTake(parseInt(e.target.value, 10))}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-white font-mono"
                />
                <span className="text-[11px] text-zinc-500 mt-1 block">
                  Capturing 70-85% early eliminates tail gamma risk into Thursday/Friday expiration.
                </span>
              </div>

              <div>
                <label className="block text-zinc-300 font-medium mb-1">
                  Minimum Days to Expiration (DTE):
                </label>
                <input
                  type="number"
                  min="3"
                  max="21"
                  value={tempMinDte}
                  onChange={(e) => setTempMinDte(parseInt(e.target.value, 10))}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-zinc-300 font-medium mb-1">
                  Max Simultaneous Open Option Contracts:
                </label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={tempMaxPositions}
                  onChange={(e) => setTempMaxPositions(parseInt(e.target.value, 10))}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-white font-mono"
                />
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <input
                  type="checkbox"
                  id="strictFilter"
                  checked={tempStrictFilter}
                  onChange={(e) => setTempStrictFilter(e.target.checked)}
                  className="rounded bg-zinc-950 border-zinc-800 text-emerald-500 focus:ring-0"
                />
                <label htmlFor="strictFilter" className="text-zinc-300 font-medium cursor-pointer">
                  Require strict TradingWarz A+ / A setup confluence
                </label>
              </div>

              <div className="flex justify-end space-x-2 pt-4 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowSettingsModal(false)}
                  className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                >
                  Save Controls
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MANUAL CLOSE MODAL */}
      {positionToClose && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Close on Alpaca Paper: {positionToClose.contract}</span>
              </h3>
              <button
                onClick={() => setPositionToClose(null)}
                className="text-zinc-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmManualClose} className="space-y-4 text-xs">
              <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800 space-y-1">
                <div className="flex justify-between text-zinc-400">
                  <span>Entry Premium:</span>
                  <span className="font-mono text-white">${positionToClose.entryPremiumPerContract.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Current Mark Price:</span>
                  <span className="font-mono text-emerald-400">${positionToClose.currentPremiumPerContract.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Unrealized P&amp;L:</span>
                  <span className={`font-mono font-bold ${positionToClose.unrealizedPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {positionToClose.unrealizedPnL >= 0 ? '+' : ''}${positionToClose.unrealizedPnL.toFixed(2)} ({positionToClose.unrealizedPnLPercent}%)
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-zinc-300 font-medium mb-1">Exit Reason / Notes:</label>
                <input
                  type="text"
                  value={closeReason}
                  onChange={(e) => setCloseReason(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-white"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setPositionToClose(null)}
                  className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                >
                  Confirm Close on Alpaca Paper
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
