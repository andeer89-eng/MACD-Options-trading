import React, { useState, useEffect, useMemo } from 'react';
import {
  Compass,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  AlertTriangle,
  Flame,
  Zap,
  Target,
  Clock,
  CheckCircle2,
  SlidersHorizontal,
  Search,
  RefreshCw,
  ExternalLink,
  Calculator,
  ArrowRight,
  Filter,
  BarChart3,
  Layers,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import {
  TradeAdvice,
  TradeActionZone,
  TradeAdviceFilters,
  DEFAULT_TRADE_FILTERS,
  getActionZoneMeta,
  filterTradeAdviceList,
  evaluateTradeAdvice,
} from '../utils/tradeActionEngine';
import { Candle, DivergenceSetup } from '../utils/trullasStrategy';
import { fetchJsonSafe } from '../utils/safeFetchJson';
import {
  buildDualMarketLeaderboards,
  HIGH_CONVICTION_MIN_SCORE,
  ConvictionGrade,
  RankedMarketLeader,
} from '../utils/watchlistRankingEngine';
import {
  recordTop50PresenceSnapshot,
  PresenceAnnotation,
} from '../utils/watchlistPersistenceTracker';

interface ActionDashboardProps {
  onSelectSymbolForChart: (sym: string) => void;
  onOpenCalculator: (setup: DivergenceSetup) => void;
  scannerResults?: any[];
}

interface RankedActionAdvice extends TradeAdvice {
  leaderRank?: number;
  convictionGrade?: ConvictionGrade;
  convictionScore?: number;
  directionSide: 'BULLISH' | 'BEARISH';
  relPerfVsSpyPct?: number | null;
  tosLabels?: string[];
  presence?: PresenceAnnotation;
}

const ALL_ZONES: { zone: TradeActionZone; label: string }[] = [
  { zone: 'PRE_BREAKOUT', label: 'Pre-Breakout Coiled' },
  { zone: 'BREAKOUT_CONFIRMED', label: 'Breakout Confirmed' },
  { zone: 'STRONG_BUY', label: 'Strong Buy / Demand' },
  { zone: 'HOLD_PROFIT', label: 'Hold / Run Profit' },
  { zone: 'LATE_TO_BUY', label: 'Late To Buy (FOMO Risk)' },
  { zone: 'SELL_TAKE_PROFIT', label: 'Sell / Take Profit' },
  { zone: 'NEUTRAL_CHOP', label: 'Stand Aside / Chop' },
];

const ZONE_PRIORITY: Record<TradeActionZone, number> = {
  BREAKOUT_CONFIRMED: 0,
  STRONG_BUY: 1,
  PRE_BREAKOUT: 2,
  HOLD_PROFIT: 3,
  LATE_TO_BUY: 4,
  SELL_TAKE_PROFIT: 5,
  NEUTRAL_CHOP: 6,
};

const PAGE_SIZE = 24;

export const ActionDashboard: React.FC<ActionDashboardProps> = ({
  onSelectSymbolForChart,
  onOpenCalculator,
  scannerResults = [],
}) => {
  const [apiAdviceList, setApiAdviceList] = useState<TradeAdvice[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState<number>(PAGE_SIZE);
  const [actionDirection, setActionDirection] = useState<'BULLISH' | 'BEARISH'>('BULLISH');
  const [presenceMap, setPresenceMap] = useState<Map<string, PresenceAnnotation>>(new Map());

  // Default to minConfidence = 70 (Grade B+ Strong & above) to eliminate Grade C/D noise
  const [filters, setFilters] = useState<TradeAdviceFilters>({
    ...DEFAULT_TRADE_FILTERS,
    minConfidence: 70,
  });
  const [selectedSector, setSelectedSector] = useState<string>('ALL');

  // Fetch advice from API only as fallback or enrichment when scannerResults lacks candles
  const fetchAdvice = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const resp = await fetchJsonSafe<{ advice?: TradeAdvice[]; error?: string }>('/api/trade-advice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          useAllSp500: true,
          timeframe: '1d',
        }),
      });
      if (resp.ok && resp.data) {
        setApiAdviceList(resp.data.advice || []);
      } else {
        setErrorMsg(resp.error || 'Failed to retrieve live trade advice.');
      }
    } catch (e: any) {
      console.error('Failed to load trade advice:', e);
      setErrorMsg(e?.message || 'Unable to connect to /api/trade-advice endpoint.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (scannerResults.length === 0) {
      fetchAdvice();
    }
  }, [scannerResults.length]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filters, selectedSector, actionDirection]);

  // Unified Top-50 Bullish & Bearish leaderboards from live Scanner
  const leaderboards = useMemo(() => {
    const minScore = filters.minConfidence < HIGH_CONVICTION_MIN_SCORE ? Math.max(55, filters.minConfidence) : HIGH_CONVICTION_MIN_SCORE;
    return buildDualMarketLeaderboards(scannerResults, {
      minScore,
      maxItems: 50,
    });
  }, [scannerResults, filters.minConfidence]);

  const strictLeaderboards = useMemo(() => {
    return buildDualMarketLeaderboards(scannerResults, {
      minScore: HIGH_CONVICTION_MIN_SCORE,
      maxItems: 50,
    });
  }, [scannerResults]);

  useEffect(() => {
    const nextMap = new Map<string, PresenceAnnotation>();
    if (strictLeaderboards.bullish.length > 0) {
      const bullPresence = recordTop50PresenceSnapshot(
        strictLeaderboards.bullish.map((l) => ({ symbol: l.symbol, rank: l.rank, score: l.score })),
        'long'
      );
      for (const [sym, ann] of bullPresence.entries()) {
        nextMap.set(`BULLISH:${sym}`, ann);
      }
    }
    if (strictLeaderboards.bearish.length > 0) {
      const bearPresence = recordTop50PresenceSnapshot(
        strictLeaderboards.bearish.map((l) => ({ symbol: l.symbol, rank: l.rank, score: l.score })),
        'short'
      );
      for (const [sym, ann] of bearPresence.entries()) {
        nextMap.set(`BEARISH:${sym}`, ann);
      }
    }
    if (nextMap.size > 0) {
      setPresenceMap(nextMap);
    }
  }, [strictLeaderboards]);

  // Convert active Top-50 directional leaders into Action Zone advice cards
  const adviceList = useMemo<RankedActionAdvice[]>(() => {
    const apiBySym = new Map<string, TradeAdvice>();
    for (const item of apiAdviceList) {
      apiBySym.set(item.symbol.toUpperCase(), item);
    }

    const buildFromLeaders = (
      leaders: RankedMarketLeader[],
      side: 'BULLISH' | 'BEARISH'
    ): RankedActionAdvice[] => {
      const out: RankedActionAdvice[] = [];
      for (const leader of leaders) {
        let baseAdvice: TradeAdvice | null = null;
        if (Array.isArray(leader.candles) && leader.candles.length >= 25) {
          const candles: Candle[] = leader.candles.map((c: any) => ({
            timestamp: Number(c.timestamp) || Date.now(),
            dateStr: c.dateStr,
            open: Number(c.open ?? c.close),
            high: Number(c.high ?? c.close),
            low: Number(c.low ?? c.close),
            close: Number(c.close),
            volume: Number(c.volume) || 0,
          }));
          baseAdvice = evaluateTradeAdvice(
            leader.symbol,
            candles,
            leader.matchingDivergence,
            leader.companyName,
            leader.sector
          );
        } else {
          baseAdvice = apiBySym.get(leader.symbol) ?? null;
        }

        if (!baseAdvice) continue;
        const unifiedConfidence = Math.max(baseAdvice.confidenceScore, leader.score);
        const tosLabels = leader.matchingTosSignals.slice(0, 2).map((s) => s.shortLabel || s.name || s.id);
        let resolvedAdvice = baseAdvice;

        const isCompletedHistoricalBullDiv =
          side === 'BULLISH' &&
          baseAdvice.actionZone === 'SELL_TAKE_PROFIT' &&
          leader.matchingTosSignals.length > 0 &&
          (!leader.matchingDivergence || leader.currentPrice > leader.matchingDivergence.targets.tp2 * 1.03);

        const isCompletedHistoricalBearDiv =
          side === 'BEARISH' &&
          baseAdvice.actionZone === 'SELL_TAKE_PROFIT' &&
          leader.matchingTosSignals.length > 0 &&
          (!leader.matchingDivergence || leader.currentPrice < leader.matchingDivergence.targets.tp2 * 0.97);

        const isWrongSideFallbackShort =
          side === 'BEARISH' &&
          (baseAdvice.actionZone === 'STRONG_BUY' || baseAdvice.actionZone === 'NEUTRAL_CHOP') &&
          leader.matchingTosSignals.length > 0 &&
          !leader.matchingDivergence;

        if (
          (baseAdvice.actionZone === 'NEUTRAL_CHOP' && leader.matchingTosSignals.length > 0) ||
          isCompletedHistoricalBullDiv ||
          isCompletedHistoricalBearDiv ||
          isWrongSideFallbackShort
        ) {
          const isShort = side === 'BEARISH';
          const ids = leader.matchingTosSignals.map((s) => String(s.id).toUpperCase());
          const isCoiled = ids.some(
            (id) =>
              id.includes('SQUEEZE') ||
              id.includes('VSCORE') ||
              id.includes('FVG_RETEST')
          );
          const isReversalDemand = ids.some(
            (id) =>
              id.includes('SMA50_REVERSION') ||
              id.includes('FALSE_BREAKOUT') ||
              id.includes('ROC_EXTREME')
          );
          const isBreakoutThrust = ids.some(
            (id) =>
              id.includes('DMI_POWER_MOVE') ||
              id.includes('MACD_ZERO_CROSS') ||
              id.includes('UNUSUAL_VOLUME')
          );

          const atr = leader.atr > 0 ? leader.atr : leader.currentPrice * 0.02;
          const triggerPrice = isShort
            ? Number((leader.currentPrice * 0.992).toFixed(2))
            : Number((leader.currentPrice * 1.008).toFixed(2));
          const stopLoss = isShort
            ? Number((triggerPrice + 1.4 * atr).toFixed(2))
            : Number(Math.max(0.01, triggerPrice - 1.4 * atr).toFixed(2));
          const riskDist = Math.max(0.01, Math.abs(triggerPrice - stopLoss));
          const target1 = isShort
            ? Number(Math.max(0.01, triggerPrice - 1.618 * riskDist).toFixed(2))
            : Number((triggerPrice + 1.618 * riskDist).toFixed(2));
          const target2 = isShort
            ? Number(Math.max(0.01, triggerPrice - 2.618 * riskDist).toFixed(2))
            : Number((triggerPrice + 2.618 * riskDist).toFixed(2));

          let promotedZone: TradeActionZone;
          if (isShort) {
            if (isReversalDemand) promotedZone = 'STRONG_BUY';
            else if (isCoiled) promotedZone = 'PRE_BREAKOUT';
            else if (isBreakoutThrust) promotedZone = 'BREAKOUT_CONFIRMED';
            else promotedZone = 'HOLD_PROFIT';
          } else {
            if (isReversalDemand) promotedZone = 'STRONG_BUY';
            else if (isCoiled) promotedZone = 'PRE_BREAKOUT';
            else if (isBreakoutThrust) promotedZone = 'BREAKOUT_CONFIRMED';
            else promotedZone = 'HOLD_PROFIT';
          }

          resolvedAdvice = {
            ...baseAdvice,
            actionZone: promotedZone,
            headline: isShort
              ? `Bearish Top-50 Setup: ${tosLabels.join(' + ')}`
              : `Bullish Top-50 Setup: ${tosLabels.join(' + ')}`,
            subAdvice: `${leader.stageLabel} · ${leader.matchingTosSignals.length} current-bar scan(s) aligned (Grade ${leader.grade}, ${leader.score}%).`,
            triggerPrice,
            distanceToTriggerPct: Number((((triggerPrice - leader.currentPrice) / leader.currentPrice) * 100).toFixed(2)),
            stopLoss,
            target1,
            target2,
            riskRewardRatio: 2.62,
            rationale: leader.why.slice(0, 3),
            suggestedAction: isShort
              ? `Monitor breakdown trigger below $${triggerPrice.toFixed(2)} with stop at $${stopLoss.toFixed(2)}.`
              : `Scale starter position near $${triggerPrice.toFixed(2)} with protective stop at $${stopLoss.toFixed(2)} (TP2 $${target2.toFixed(2)}).`,
          };
        }

        out.push({
          ...resolvedAdvice,
          confidenceScore: unifiedConfidence,
          leaderRank: leader.rank,
          convictionGrade: leader.grade,
          convictionScore: leader.score,
          directionSide: side,
          relPerfVsSpyPct: leader.relPerfVsSpyPct,
          tosLabels,
          presence: presenceMap.get(`${side}:${leader.symbol}`),
        });
      }
      return out;
    };

    if (scannerResults.length > 0) {
      return actionDirection === 'BULLISH'
        ? buildFromLeaders(leaderboards.bullish, 'BULLISH')
        : buildFromLeaders(leaderboards.bearish, 'BEARISH');
    }

    // Fallback to API results (strictly excluding baseline signal-less noise when minConfidence >= 70)
    return apiAdviceList
      .filter((item) => {
        const hl = (item.headline || '').toLowerCase();
        const isBear =
          (item.trullasSetup?.type?.includes('BEAR') ?? false) ||
          hl.includes('short') ||
          hl.includes('bear') ||
          hl.includes('breakdown') ||
          item.actionZone === 'SELL_TAKE_PROFIT';
        return actionDirection === 'BEARISH' ? isBear : !isBear;
      })
      .slice(0, 50)
      .map((item, idx) => ({
        ...item,
        leaderRank: idx + 1,
        directionSide: actionDirection,
      }));
  }, [scannerResults.length, leaderboards, actionDirection, apiAdviceList, presenceMap]);

  // Zone selection toggle
  const handleToggleZone = (zone: TradeActionZone) => {
    setFilters((prev) => {
      const exists = prev.zones.includes(zone);
      let updated: TradeActionZone[];
      if (exists) {
        updated = prev.zones.filter((z) => z !== zone);
      } else {
        updated = [...prev.zones, zone];
      }
      return { ...prev, zones: updated };
    });
  };

  const handleSelectAllZones = () => {
    setFilters((prev) => ({
      ...prev,
      zones: ALL_ZONES.map((z) => z.zone),
    }));
  };

  // Distinct sectors
  const availableSectors = useMemo(() => {
    const set = new Set<string>();
    for (const item of adviceList) {
      if (item.sector) set.add(item.sector);
    }
    return ['ALL', ...Array.from(set)];
  }, [adviceList]);

  // Filtered & prioritized advice (actionable zones + confidence score first, max 50)
  const filteredAdvice = useMemo(() => {
    const withSector = { ...filters, sector: selectedSector };
    return (filterTradeAdviceList(adviceList, withSector) as RankedActionAdvice[])
      .sort((a, b) => {
        if ((a.leaderRank ?? 999) !== (b.leaderRank ?? 999)) {
          return (a.leaderRank ?? 999) - (b.leaderRank ?? 999);
        }
        const pa = ZONE_PRIORITY[a.actionZone] ?? 99;
        const pb = ZONE_PRIORITY[b.actionZone] ?? 99;
        if (pa !== pb) return pa - pb;
        return b.confidenceScore - a.confidenceScore;
      })
      .slice(0, 50);
  }, [adviceList, filters, selectedSector]);

  const visibleAdvice = useMemo(
    () => filteredAdvice.slice(0, visibleCount),
    [filteredAdvice, visibleCount]
  );

  // Zone breakdown counters
  const zoneCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of adviceList) {
      counts[item.actionZone] = (counts[item.actionZone] || 0) + 1;
    }
    return counts;
  }, [adviceList]);

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-zinc-900 via-zinc-900 to-zinc-950 border border-zinc-800 rounded-2xl p-6 sm:p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium mb-3">
              <Compass className="w-3.5 h-3.5" />
              <span>Multi-Strategy Confluence Decision Engine</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Trade Action Zones & Strategy Advisor
            </h1>
            <p className="mt-2 text-sm text-zinc-400 max-w-2xl leading-relaxed">
              Synthesizes David Trullàs 3rd-wave MACD divergences, Fibonacci triggers, LuxAlgo Nadaraya-Watson kernel envelopes, and Smart Money Concepts into unambiguous trade execution advice.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <div className="flex items-center bg-zinc-950 p-1 rounded-xl border border-zinc-800 gap-1">
              <button
                type="button"
                onClick={() => setActionDirection('BULLISH')}
                data-testid="action-dir-bullish"
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition whitespace-nowrap ${
                  actionDirection === 'BULLISH'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                    : 'text-zinc-400 hover:text-emerald-400'
                }`}
              >
                <TrendingUp className="w-3.5 h-3.5" />
                <span>Bullish Top 50 ({leaderboards.bullish.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setActionDirection('BEARISH')}
                data-testid="action-dir-bearish"
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition whitespace-nowrap ${
                  actionDirection === 'BEARISH'
                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                    : 'text-zinc-400 hover:text-rose-400'
                }`}
              >
                <TrendingDown className="w-3.5 h-3.5" />
                <span>Bearish Top 50 ({leaderboards.bearish.length})</span>
              </button>
            </div>

            <button
              onClick={fetchAdvice}
              disabled={loading}
              className="flex items-center space-x-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-xs font-semibold border border-zinc-700 transition whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
              <span>{loading ? 'Analyzing Market...' : 'Refresh Signals'}</span>
            </button>
          </div>
        </div>

        {/* Interactive High-Level Zone Filter Cards */}
        <div className="mt-6 pt-6 border-t border-zinc-800/80 space-y-2">
          <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              <span>Interactive Action Zone Cards (Click card to isolate or toggle zone):</span>
            </span>
            {filters.zones.length < ALL_ZONES.length && (
              <button
                onClick={handleSelectAllZones}
                data-testid="reset-all-zones-btn"
                className="text-emerald-400 hover:text-emerald-300 font-semibold underline text-[11px] flex items-center gap-1 cursor-pointer transition"
              >
                <span>Reset / Show All Zones ({ALL_ZONES.length})</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* 1. PRE-BREAKOUT */}
            {(() => {
              const isSelected = filters.zones.includes('PRE_BREAKOUT');
              const isBear = actionDirection === 'BEARISH';
              return (
                <button
                  type="button"
                  onClick={() => handleToggleZone('PRE_BREAKOUT')}
                  data-testid="kpi-filter-pre-breakout"
                  className={`p-3.5 rounded-xl border text-left transition-all duration-200 cursor-pointer ${
                    isSelected
                      ? 'bg-cyan-950/60 border-cyan-500/80 ring-2 ring-cyan-500/20 shadow-lg shadow-cyan-500/10'
                      : 'bg-zinc-950/50 border-zinc-800/80 opacity-50 hover:opacity-100 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-[11px] font-medium block ${isSelected ? 'text-cyan-300 font-bold' : 'text-zinc-400'}`}>
                      {isBear ? 'Pre-Breakdown' : 'Pre-Breakout'}
                    </span>
                    {isSelected && <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>}
                  </div>
                  <div className="flex items-baseline space-x-2 mt-1">
                    <span className={`text-2xl font-bold font-mono ${isSelected ? 'text-cyan-400' : 'text-zinc-300'}`}>
                      {zoneCounts['PRE_BREAKOUT'] || 0}
                    </span>
                    <span className="text-[10px] text-zinc-500 font-mono">Coiled</span>
                  </div>
                </button>
              );
            })()}

            {/* 2. BREAKOUT CONFIRMED */}
            {(() => {
              const isSelected = filters.zones.includes('BREAKOUT_CONFIRMED');
              const isBear = actionDirection === 'BEARISH';
              return (
                <button
                  type="button"
                  onClick={() => handleToggleZone('BREAKOUT_CONFIRMED')}
                  data-testid="kpi-filter-breakout-confirmed"
                  className={`p-3.5 rounded-xl border text-left transition-all duration-200 cursor-pointer ${
                    isSelected
                      ? isBear
                        ? 'bg-rose-950/60 border-rose-500/80 ring-2 ring-rose-500/20 shadow-lg shadow-rose-500/10'
                        : 'bg-indigo-950/60 border-indigo-500/80 ring-2 ring-indigo-500/20 shadow-lg shadow-indigo-500/10'
                      : 'bg-zinc-950/50 border-zinc-800/80 opacity-50 hover:opacity-100 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-[11px] font-medium block ${isSelected ? (isBear ? 'text-rose-300 font-bold' : 'text-indigo-300 font-bold') : 'text-zinc-400'}`}>
                      {isBear ? 'Breakdown Confirmed' : 'Breakout Confirmed'}
                    </span>
                    {isSelected && <span className={`w-2 h-2 rounded-full animate-pulse ${isBear ? 'bg-rose-400' : 'bg-indigo-400'}`}></span>}
                  </div>
                  <div className="flex items-baseline space-x-2 mt-1">
                    <span className={`text-2xl font-bold font-mono ${isSelected ? (isBear ? 'text-rose-400' : 'text-indigo-400') : 'text-zinc-300'}`}>
                      {zoneCounts['BREAKOUT_CONFIRMED'] || 0}
                    </span>
                    <span className="text-[10px] text-zinc-500 font-mono">Tranche 1</span>
                  </div>
                </button>
              );
            })()}

            {/* 3. STRONG BUY / SHORT */}
            {(() => {
              const isSelected = filters.zones.includes('STRONG_BUY');
              const isBear = actionDirection === 'BEARISH';
              return (
                <button
                  type="button"
                  onClick={() => handleToggleZone('STRONG_BUY')}
                  data-testid="kpi-filter-strong-buy"
                  className={`p-3.5 rounded-xl border text-left transition-all duration-200 cursor-pointer ${
                    isSelected
                      ? isBear
                        ? 'bg-rose-950/60 border-rose-500/80 ring-2 ring-rose-500/20 shadow-lg shadow-rose-500/10'
                        : 'bg-emerald-950/60 border-emerald-500/80 ring-2 ring-emerald-500/20 shadow-lg shadow-emerald-500/10'
                      : 'bg-zinc-950/50 border-zinc-800/80 opacity-50 hover:opacity-100 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-[11px] font-medium block ${isSelected ? (isBear ? 'text-rose-300 font-bold' : 'text-emerald-300 font-bold') : 'text-zinc-400'}`}>
                      {isBear ? 'Strong Short' : 'Strong Buy'}
                    </span>
                    {isSelected && <span className={`w-2 h-2 rounded-full animate-pulse ${isBear ? 'bg-rose-400' : 'bg-emerald-400'}`}></span>}
                  </div>
                  <div className="flex items-baseline space-x-2 mt-1">
                    <span className={`text-2xl font-bold font-mono ${isSelected ? (isBear ? 'text-rose-400' : 'text-emerald-400') : 'text-zinc-300'}`}>
                      {zoneCounts['STRONG_BUY'] || 0}
                    </span>
                    <span className="text-[10px] text-zinc-500 font-mono">{isBear ? 'Supply' : 'Demand'}</span>
                  </div>
                </button>
              );
            })()}

            {/* 4. HOLD / RUNNING */}
            {(() => {
              const isSelected = filters.zones.includes('HOLD_PROFIT');
              const isBear = actionDirection === 'BEARISH';
              return (
                <button
                  type="button"
                  onClick={() => handleToggleZone('HOLD_PROFIT')}
                  data-testid="kpi-filter-hold-profit"
                  className={`p-3.5 rounded-xl border text-left transition-all duration-200 cursor-pointer ${
                    isSelected
                      ? 'bg-blue-950/60 border-blue-500/80 ring-2 ring-blue-500/20 shadow-lg shadow-blue-500/10'
                      : 'bg-zinc-950/50 border-zinc-800/80 opacity-50 hover:opacity-100 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-[11px] font-medium block ${isSelected ? 'text-blue-300 font-bold' : 'text-zinc-400'}`}>
                      {isBear ? 'Hold Short' : 'Hold / Running'}
                    </span>
                    {isSelected && <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></span>}
                  </div>
                  <div className="flex items-baseline space-x-2 mt-1">
                    <span className={`text-2xl font-bold font-mono ${isSelected ? 'text-blue-400' : 'text-zinc-300'}`}>
                      {zoneCounts['HOLD_PROFIT'] || 0}
                    </span>
                    <span className="text-[10px] text-zinc-500 font-mono">In Profit</span>
                  </div>
                </button>
              );
            })()}

            {/* 5. LATE TO BUY / SHORT */}
            {(() => {
              const isSelected = filters.zones.includes('LATE_TO_BUY');
              const isBear = actionDirection === 'BEARISH';
              return (
                <button
                  type="button"
                  onClick={() => handleToggleZone('LATE_TO_BUY')}
                  data-testid="kpi-filter-late-to-buy"
                  className={`p-3.5 rounded-xl border text-left transition-all duration-200 cursor-pointer ${
                    isSelected
                      ? 'bg-amber-950/60 border-amber-500/80 ring-2 ring-amber-500/20 shadow-lg shadow-amber-500/10'
                      : 'bg-zinc-950/50 border-zinc-800/80 opacity-50 hover:opacity-100 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-[11px] font-medium block ${isSelected ? 'text-amber-300 font-bold' : 'text-zinc-400'}`}>
                      {isBear ? 'Late To Short' : 'Late To Buy'}
                    </span>
                    {isSelected && <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>}
                  </div>
                  <div className="flex items-baseline space-x-2 mt-1">
                    <span className={`text-2xl font-bold font-mono ${isSelected ? 'text-amber-400' : 'text-zinc-300'}`}>
                      {zoneCounts['LATE_TO_BUY'] || 0}
                    </span>
                    <span className="text-[10px] text-zinc-500 font-mono">Chase Risk</span>
                  </div>
                </button>
              );
            })()}

            {/* 6. SELL / COVER PROFIT */}
            {(() => {
              const isSelected = filters.zones.includes('SELL_TAKE_PROFIT');
              const isBear = actionDirection === 'BEARISH';
              return (
                <button
                  type="button"
                  onClick={() => handleToggleZone('SELL_TAKE_PROFIT')}
                  data-testid="kpi-filter-sell-take-profit"
                  className={`p-3.5 rounded-xl border text-left transition-all duration-200 cursor-pointer ${
                    isSelected
                      ? isBear
                        ? 'bg-emerald-950/60 border-emerald-500/80 ring-2 ring-emerald-500/20 shadow-lg shadow-emerald-500/10'
                        : 'bg-rose-950/60 border-rose-500/80 ring-2 ring-rose-500/20 shadow-lg shadow-rose-500/10'
                      : 'bg-zinc-950/50 border-zinc-800/80 opacity-50 hover:opacity-100 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-[11px] font-medium block ${isSelected ? (isBear ? 'text-emerald-300 font-bold' : 'text-rose-300 font-bold') : 'text-zinc-400'}`}>
                      {isBear ? 'Cover / Take Profit' : 'Sell / Take Profit'}
                    </span>
                    {isSelected && <span className={`w-2 h-2 rounded-full animate-pulse ${isBear ? 'bg-emerald-400' : 'bg-rose-400'}`}></span>}
                  </div>
                  <div className="flex items-baseline space-x-2 mt-1">
                    <span className={`text-2xl font-bold font-mono ${isSelected ? (isBear ? 'text-emerald-400' : 'text-rose-400') : 'text-zinc-300'}`}>
                      {zoneCounts['SELL_TAKE_PROFIT'] || 0}
                    </span>
                    <span className="text-[10px] text-zinc-500 font-mono">Target Hit</span>
                  </div>
                </button>
              );
            })()}
          </div>
        </div>

      </div>

      {/* FILTER CONTROLS */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {/* Action Zone Filter Chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={handleSelectAllZones}
              className={`px-2.5 py-1 text-xs rounded font-medium transition ${
                filters.zones.length === ALL_ZONES.length
                  ? 'bg-zinc-800 text-white border border-zinc-700 font-bold'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              All Zones ({adviceList.length})
            </button>

            {ALL_ZONES.map(({ zone }) => {
              const count = zoneCounts[zone] || 0;
              const isSelected = filters.zones.includes(zone);
              const meta = getActionZoneMeta(zone, actionDirection);
              return (
                <button
                  key={zone}
                  onClick={() => handleToggleZone(zone)}
                  className={`px-2.5 py-1 text-xs rounded font-mono transition border flex items-center space-x-1.5 ${
                    isSelected
                      ? `${meta.badgeBg} ${meta.badgeBorder} ${meta.textColor} font-semibold`
                      : 'bg-zinc-950/60 border-zinc-800/80 text-zinc-500 opacity-60 hover:opacity-100'
                  }`}
                >
                  <span>{meta.label}</span>
                  <span className="text-[10px] opacity-80">({count})</span>
                </button>
              );
            })}
          </div>

          {/* Search Query */}
          <div className="relative w-full sm:w-64 shrink-0">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-zinc-500" />
            <input
              type="text"
              placeholder="Search ticker or advice..."
              value={filters.searchQuery}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, searchQuery: e.target.value }))
              }
              className="w-full pl-8 pr-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
            />
          </div>
        </div>

        {/* Secondary Row: Confidence Slider & Sector dropdown */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-zinc-800/60 text-xs">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <span className="text-zinc-400">Min Confidence:</span>
              <input
                type="range"
                min="0"
                max="90"
                step="5"
                value={filters.minConfidence}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, minConfidence: Number(e.target.value) }))
                }
                className="w-28 accent-emerald-500 bg-zinc-800 h-1.5 rounded-lg cursor-pointer"
              />
              <span className="font-mono text-white text-[11px] font-bold">
                {filters.minConfidence > 0 ? `≥ ${filters.minConfidence}%` : 'Any (0%)'}
              </span>
            </div>

            <div className="flex items-center space-x-2">
              <span className="text-zinc-400">Sector:</span>
              <select
                value={selectedSector}
                onChange={(e) => setSelectedSector(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-zinc-700 font-medium"
              >
                {availableSectors.map((sec) => (
                  <option key={sec} value={sec}>
                    {sec}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <span className="font-mono text-emerald-400 text-[11px] tabular-nums">
            Showing {visibleAdvice.length} of {filteredAdvice.length} matched ({actionDirection === 'BULLISH' ? 'Bullish' : 'Bearish'} Top {adviceList.length})
          </span>

        </div>
      </div>

      {errorMsg && (
        <div className="bg-rose-950/30 border border-rose-500/30 rounded-xl p-4 flex items-center justify-between gap-4 text-xs text-rose-300">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={fetchAdvice}
            className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-semibold shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {/* ADVICE CARDS GRID */}
      {filteredAdvice.length > 0 ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {visibleAdvice.map((item, idx) => {
            const meta = getActionZoneMeta(item.actionZone, item.directionSide);
            const isBearCard = item.directionSide === 'BEARISH';

            return (
              <div
                key={`${item.directionSide}-${item.symbol}`}
                data-testid={`action-card-${item.symbol}`}
                className={`bg-zinc-900 border rounded-2xl p-6 space-y-5 transition relative overflow-hidden ${
                  item.actionZone === 'BREAKOUT_CONFIRMED' || item.actionZone === 'STRONG_BUY'
                    ? isBearCard
                      ? 'border-rose-500/40 shadow-lg shadow-rose-500/5'
                      : 'border-emerald-500/40 shadow-lg shadow-emerald-500/5'
                    : item.actionZone === 'PRE_BREAKOUT'
                    ? 'border-cyan-500/40 shadow-lg shadow-cyan-500/5'
                    : item.actionZone === 'LATE_TO_BUY'
                    ? 'border-amber-500/40'
                    : item.actionZone === 'SELL_TAKE_PROFIT'
                    ? isBearCard
                      ? 'border-emerald-500/40'
                      : 'border-rose-500/40'
                    : 'border-zinc-800 hover:border-zinc-700'
                }`}
              >
                {/* Card Top: Rank, Ticker, Grade, Days & Main Zone Badge */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center flex-wrap gap-1.5">
                      <span className="text-[11px] font-mono tabular-nums font-bold px-1.5 py-0.5 rounded bg-zinc-950 border border-zinc-700 text-zinc-200">
                        #{item.leaderRank ?? idx + 1}
                      </span>
                      <strong className="text-white text-lg font-bold tracking-tight">
                        {item.symbol}
                      </strong>
                      {item.convictionGrade && (
                        <span
                          className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${
                            item.convictionGrade === 'A+' || item.convictionGrade === 'A'
                              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                              : item.convictionGrade === 'B'
                              ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                              : 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                          }`}
                        >
                          Grade {item.convictionGrade}
                        </span>
                      )}
                      {item.presence && (
                        <span
                          title={`First seen: ${item.presence.firstSeenDate} · Streak: ${item.presence.consecutiveDays}d · Best: #${item.presence.bestRank}`}
                          className="text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300"
                        >
                          {item.presence.daysInWatchlist}d in Top 50
                        </span>
                      )}
                      {item.companyName && (
                        <span className="text-xs text-zinc-400 truncate max-w-[140px]">
                          {item.companyName}
                        </span>
                      )}
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800 text-zinc-400">
                        {item.sector || 'Asset'}
                      </span>
                    </div>

                    <div className="flex items-baseline flex-wrap gap-2 mt-1">
                      <span className="text-white font-mono tabular-nums font-bold text-sm">
                        ${item.currentPrice.toFixed(2)}
                      </span>
                      <span className="text-xs font-mono tabular-nums text-zinc-500">
                        {item.distanceToTriggerPct >= 0 ? '+' : ''}
                        {item.distanceToTriggerPct}% from trigger
                      </span>
                      {typeof item.relPerfVsSpyPct === 'number' && (
                        <span
                          className={`text-[11px] font-mono tabular-nums font-semibold ${
                            item.relPerfVsSpyPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          30D vs SPY: {item.relPerfVsSpyPct >= 0 ? '+' : ''}
                          {item.relPerfVsSpyPct.toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </div>

                  {/* ACTION ZONE BADGE */}
                  <div
                    className={`px-3 py-1.5 rounded-lg border text-xs font-bold font-mono uppercase tracking-wider text-right shrink-0 ${meta.badgeBg} ${meta.badgeBorder} ${meta.textColor}`}
                  >
                    {meta.label}
                  </div>
                </div>

                {/* Headline & Sub-Advice Box */}
                <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800/80 space-y-1">
                  <div className="text-xs font-bold text-white flex items-center space-x-1.5">
                    <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>{item.headline}</span>
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed pl-5">
                    {item.subAdvice}
                  </p>
                </div>

                {/* Execution Levels Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                  <div className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800/60">
                    <span className="text-[10px] text-zinc-500 block">Trigger (23.6%)</span>
                    <span className="font-bold text-emerald-400">
                      ${item.triggerPrice.toFixed(2)}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800/60">
                    <span className="text-[10px] text-zinc-500 block">Stop Loss</span>
                    <span className="font-bold text-rose-400">${item.stopLoss.toFixed(2)}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800/60">
                    <span className="text-[10px] text-zinc-500 block">Target 2 (61.8%)</span>
                    <span className="font-bold text-yellow-400">${item.target2.toFixed(2)}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800/60">
                    <span className="text-[10px] text-zinc-500 block">Risk / Reward</span>
                    <span className="font-bold text-indigo-300">
                      1:{item.riskRewardRatio} R:R
                    </span>
                  </div>
                </div>

                {/* Strategy Confluence Pills */}
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
                  <span
                    className={`px-2 py-0.5 rounded border ${
                      item.trullasSetup
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-500'
                    }`}
                  >
                    Trullàs Divergence: {item.trullasSetup ? 'VERIFIED' : 'PENDING'}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded border ${
                      item.nweBandPosition === 'LOWER_DEMAND'
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : item.nweBandPosition === 'UPPER_SUPPLY'
                        ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400'
                    }`}
                  >
                    LuxAlgo NWE: {item.nweBandPosition}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded border ${
                      item.smcZone === 'DISCOUNT'
                        ? 'bg-teal-500/10 border-teal-500/30 text-teal-400'
                        : item.smcZone === 'PREMIUM'
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400'
                    }`}
                  >
                    SMC: {item.smcZone}
                  </span>
                  {item.hasActiveOrderBlock && (
                    <span className="px-2 py-0.5 rounded border bg-indigo-500/10 border-indigo-500/30 text-indigo-300">
                      Order Block: ACTIVE
                    </span>
                  )}
                  {item.tosLabels && item.tosLabels.length > 0 && (
                    <span className="px-2 py-0.5 rounded border bg-cyan-500/10 border-cyan-500/30 text-cyan-300">
                      TOS: {item.tosLabels.join(' · ')}
                    </span>
                  )}
                </div>

                {/* Rationale & Action Plan */}
                <div className="space-y-2 pt-2 border-t border-zinc-800/60 text-xs">
                  <div className="space-y-1">
                    {item.rationale.slice(0, 2).map((r, i) => (
                      <div key={i} className="flex items-start space-x-2 text-zinc-300 text-[11px]">
                        <span className="text-emerald-400 font-bold shrink-0">&bull;</span>
                        <span>{r}</span>
                      </div>
                    ))}
                  </div>

                  <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 font-sans text-zinc-200 text-xs">
                    <strong className="text-white mr-1.5 font-semibold">Suggested Action:</strong>
                    <span>{item.suggestedAction}</span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-between pt-2 border-t border-zinc-800/80">
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => onSelectSymbolForChart(item.symbol)}
                      className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-xs font-medium transition flex items-center space-x-1"
                    >
                      <span>Chart</span>
                      <ExternalLink className="w-3 h-3 text-zinc-400" />
                    </button>

                    {item.trullasSetup && (
                      <button
                        onClick={() => onOpenCalculator(item.trullasSetup!)}
                        className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-lg text-xs font-medium transition flex items-center space-x-1"
                      >
                        <Calculator className="w-3 h-3 text-emerald-400" />
                        <span>Scale Position</span>
                      </button>
                    )}
                  </div>

                  <div className="flex items-center space-x-1.5 text-[11px] font-mono text-zinc-500">
                    <span>Confidence:</span>
                    <strong className="text-emerald-400">{item.confidenceScore}%</strong>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {visibleAdvice.length < filteredAdvice.length && (
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              data-testid="action-zones-load-more"
              onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-xs font-semibold border border-zinc-700 transition"
            >
              Load More (+{Math.min(PAGE_SIZE, filteredAdvice.length - visibleAdvice.length)})
            </button>
            <button
              type="button"
              data-testid="action-zones-show-all"
              onClick={() => setVisibleCount(filteredAdvice.length)}
              className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded-xl text-xs font-medium border border-zinc-800 transition"
            >
              Show All ({filteredAdvice.length})
            </button>
          </div>
        )}
        </>
      ) : (
        <div className="p-12 text-center text-xs bg-zinc-900 border border-zinc-800 rounded-xl space-y-3">
          <Filter className="w-8 h-8 text-zinc-600 mx-auto" />
          <p className="text-zinc-300 font-medium text-sm">No symbols match your current zone filters</p>
          <p className="text-zinc-500 max-w-md mx-auto text-xs leading-relaxed">
            Adjust your zone selections or decrease the minimum confidence threshold to view more evaluated opportunities.
          </p>
          <button
            onClick={handleSelectAllZones}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-xs font-medium border border-zinc-700 transition"
          >
            Reset to All Action Zones
          </button>
        </div>
      )}
    </div>
  );
};
