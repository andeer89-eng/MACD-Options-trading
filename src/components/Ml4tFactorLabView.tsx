import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Activity,
  Play,
  Copy,
  Check,
  AlertTriangle,
  Sliders,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Layers,
  GitMerge,
  Plus,
  Trash2,
  ArrowRight,
  FlaskConical,
} from 'lucide-react';
import type { Candle } from '../utils/trullasStrategy';
import { fetchJsonSafe } from '../utils/safeFetchJson';
import {
  AttachedOverlapAuditRow,
  CombinationLeg,
  CombinationMode,
  CombinationTestResult,
  CrossSectionalAuditReport,
  FactorIcAuditRow,
  FactorOrigin,
  SIMULATION_HORIZONS,
  SimulationHorizon,
  UNIFIED_ML4T_FACTORS,
  buildSyncedPythonAlphalensScript,
  evaluateIndicatorCombination,
  runCrossSectionalFactorAudit,
} from '../utils/ml4tFactorsEngine';
import { InfoTooltip } from './InfoTooltip';

interface Ml4tFactorLabViewProps {
  scannerResults?: any[];
  onSelectSymbolForChart?: (symbol: string) => void;
}

type CohortId = 'sp500_core16' | 'megacap_beta24' | 'scanner_active';
type OriginFilter = 'ALL' | FactorOrigin;
type LabSubTab = 'leaderboard' | 'combinations' | 'audit_flow';
type AuditTypeFilter = 'ALL' | 'PINE_INDICATOR' | 'LLM_PROMPT';

const COHORT_LISTS: Record<Exclude<CohortId, 'scanner_active'>, string[]> = {
  sp500_core16: [
    'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA', 'AMD',
    'JPM', 'BAC', 'UNH', 'WMT', 'XOM', 'HD', 'COST', 'AVGO',
  ],
  megacap_beta24: [
    'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA', 'AMD',
    'JPM', 'BAC', 'UNH', 'WMT', 'XOM', 'HD', 'COST', 'AVGO',
    'LLY', 'ORCL', 'CRM', 'PG', 'NFLX', 'PANW', 'PLTR', 'SMCI',
  ],
};

function formatIc(val: number): string {
  const sign = val > 0 ? '+' : '';
  return `${sign}${val.toFixed(4)}`;
}

function formatSpread(val: number): string {
  const sign = val > 0 ? '+' : '';
  return `${sign}${val.toFixed(2)}%`;
}

function formatTStat(val: number): string {
  const sign = val > 0 ? '+' : '';
  return `${sign}${val.toFixed(2)}`;
}

function originShortLabel(origin: FactorOrigin): { text: string; colorClass: string } {
  if (origin === 'NEW_PINE_PORT') {
    return { text: 'New Pine', colorClass: 'text-sky-400' };
  }
  if (origin === 'ATTACHED_SUITE') {
    return { text: 'Attached', colorClass: 'text-amber-300' };
  }
  return { text: 'Core', colorClass: 'text-zinc-300' };
}

function comboVerdictMeta(verdict: CombinationTestResult['verdict']): {
  label: string;
  colorClass: string;
} {
  switch (verdict) {
    case 'SYNERGISTIC':
      return { label: 'SYNERGISTIC', colorClass: 'text-emerald-400' };
    case 'POSITIVE_EDGE':
      return { label: 'POSITIVE EDGE', colorClass: 'text-sky-400' };
    case 'NO_LIFT':
      return { label: 'NO LIFT', colorClass: 'text-amber-400' };
    default:
      return { label: 'WEAK', colorClass: 'text-zinc-500' };
  }
}

function overlapStatusMeta(status: AttachedOverlapAuditRow['status']): {
  label: string;
  colorClass: string;
} {
  switch (status) {
    case 'UNIQUE_NEW':
      return { label: 'UNIQUE NEW', colorClass: 'text-emerald-400' };
    case 'PARTIAL_OVERLAP':
      return { label: 'PARTIAL OVERLAP', colorClass: 'text-amber-300' };
    case 'DUPLICATE_EXISTING':
      return { label: 'DUPLICATE', colorClass: 'text-rose-400' };
    default:
      return { label: 'PROMPT ONLY', colorClass: 'text-zinc-400' };
  }
}

export const Ml4tFactorLabView: React.FC<Ml4tFactorLabViewProps> = ({
  scannerResults = [],
  onSelectSymbolForChart,
}) => {
  const [cohortId, setCohortId] = useState<CohortId>('sp500_core16');
  const [targetHorizon, setTargetHorizon] = useState<SimulationHorizon>(5);
  const [originFilter, setOriginFilter] = useState<OriginFilter>('ALL');
  const [activeSubTab, setActiveSubTab] = useState<LabSubTab>('leaderboard');
  const [auditTypeFilter, setAuditTypeFilter] = useState<AuditTypeFilter>('ALL');

  const [loading, setLoading] = useState<boolean>(false);
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [report, setReport] = useState<CrossSectionalAuditReport | null>(null);
  const [cachedCandles, setCachedCandles] = useState<Record<string, Candle[]>>({});

  const [selectedFactorId, setSelectedFactorId] = useState<string | null>(null);
  const [copiedScript, setCopiedScript] = useState<boolean>(false);
  const [showScriptPreview, setShowScriptPreview] = useState<boolean>(false);

  // Custom 1D Combination Builder state
  const [customLegs, setCustomLegs] = useState<CombinationLeg[]>([
    { factorId: 'williams_vix_fix', direction: 1 },
    { factorId: 'vscore_vwap50', direction: -1 },
    { factorId: 'ha_ribbon_align', direction: 1 },
  ]);
  const [customMode, setCustomMode] = useState<CombinationMode>('COMPOSITE_RANK');
  const [customZThresh, setCustomZThresh] = useState<number>(0.5);
  const [customName, setCustomName] = useState<string>('Custom 1D Alpha Stack');
  const [customResult, setCustomResult] = useState<CombinationTestResult | null>(null);

  const mountedRef = useRef<boolean>(true);
  const activeRunRef = useRef<number>(0);
  const targetHorizonRef = useRef<SimulationHorizon>(targetHorizon);

  const scannerCohortSymbols = useMemo(() => {
    const unique = Array.from(
      new Set(
        (scannerResults || [])
          .map((r) => String(r?.symbol || '').trim().toUpperCase())
          .filter(Boolean)
      )
    );
    return unique.slice(0, 20);
  }, [scannerResults]);

  const activeSymbols = useMemo(() => {
    if (cohortId === 'scanner_active' && scannerCohortSymbols.length >= 6) {
      return scannerCohortSymbols;
    }
    return COHORT_LISTS[cohortId === 'scanner_active' ? 'sp500_core16' : cohortId];
  }, [cohortId, scannerCohortSymbols]);

  const activeCohortCandles = useMemo(() => {
    const out: Record<string, Candle[]> = {};
    for (const sym of activeSymbols) {
      if (cachedCandles[sym] && cachedCandles[sym].length >= 80) {
        out[sym] = cachedCandles[sym];
      }
    }
    return out;
  }, [activeSymbols, cachedCandles]);

  const runLiveAudit = useCallback(
    async (symbolsToAudit: string[], horizon: SimulationHorizon, forceRefetch = false) => {
      const runId = ++activeRunRef.current;
      targetHorizonRef.current = horizon;
      setLoading(true);
      setErrorMsg(null);
      setProgress({ done: 0, total: symbolsToAudit.length });

      const nextCandles: Record<string, Candle[]> = {};
      const missing: string[] = [];

      for (const sym of symbolsToAudit) {
        if (!forceRefetch && cachedCandles[sym] && cachedCandles[sym].length >= 80) {
          nextCandles[sym] = cachedCandles[sym];
        } else {
          missing.push(sym);
        }
      }

      let doneCount = symbolsToAudit.length - missing.length;
      if (mountedRef.current && activeRunRef.current === runId) {
        setProgress({ done: doneCount, total: symbolsToAudit.length });
      }

      const batchSize = 5;
      for (let i = 0; i < missing.length; i += batchSize) {
        if (!mountedRef.current || activeRunRef.current !== runId) return;
        const batch = missing.slice(i, i + batchSize);
        const batchResults = await Promise.allSettled(
          batch.map(async (sym) => {
            const resp = await fetchJsonSafe<{ candles?: Candle[] }>(
              `/api/candles?symbol=${encodeURIComponent(sym)}&timeframe=1d&range=10y`
            );
            return { sym, resp };
          })
        );

        for (const r of batchResults) {
          doneCount++;
          if (r.status === 'fulfilled' && r.value.resp.ok) {
            const arr = r.value.resp.data?.candles;
            if (Array.isArray(arr) && arr.length >= 80) {
              nextCandles[r.value.sym] = arr;
            }
          }
        }

        if (mountedRef.current && activeRunRef.current === runId) {
          setProgress({ done: doneCount, total: symbolsToAudit.length });
        }
      }

      if (!mountedRef.current || activeRunRef.current !== runId) return;

      const validCount = Object.keys(nextCandles).length;
      if (validCount < 4) {
        setLoading(false);
        setErrorMsg(
          `Only ${validCount} symbols returned sufficient 10Y daily OHLCV history (need at least 4). Check network/Yahoo availability and retry.`
        );
        return;
      }

      setCachedCandles((prev) => ({ ...prev, ...nextCandles }));
      // Always honor latest user-selected horizon if changed while candles were downloading
      const latestHorizon = targetHorizonRef.current;
      const auditResult = runCrossSectionalFactorAudit(nextCandles, {
        horizons: [...SIMULATION_HORIZONS],
        shiftBars: 1,
        targetHorizonDays: latestHorizon,
        ridgeLambda: 25.0,
      });

      setReport(auditResult);
      setLoading(false);
    },
    [cachedCandles]
  );

  // Run initial 10Y factor audit cleanly on mount
  useEffect(() => {
    mountedRef.current = true;
    void runLiveAudit(COHORT_LISTS.sp500_core16, targetHorizonRef.current, false);
    return () => {
      mountedRef.current = false;
      activeRunRef.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recompute Walk-Forward Ridge & Preset Combos when user changes targetHorizon on already fetched 1D candles
  const handleHorizonChange = (nextH: SimulationHorizon) => {
    targetHorizonRef.current = nextH;
    setTargetHorizon(nextH);
    if (Object.keys(activeCohortCandles).length >= 4) {
      const updated = runCrossSectionalFactorAudit(activeCohortCandles, {
        horizons: [...SIMULATION_HORIZONS],
        shiftBars: 1,
        targetHorizonDays: nextH,
        ridgeLambda: 25.0,
      });
      setReport(updated);

      if (customResult && customLegs.length >= 2) {
        const nextCustom = evaluateIndicatorCombination(
          activeCohortCandles,
          {
            id: 'custom_user_combo',
            name: customName.trim() || 'Custom 1D Alpha Stack',
            description: 'Evaluated on 1D bars with causal shift(1) & 10bps round-trip friction.',
            mode: customMode,
            consensusZThreshold: customZThresh,
            legs: customLegs,
          },
          { horizonDays: nextH, factorRanking: updated.factorRanking }
        );
        setCustomResult(nextCustom);
      }
    }
  };

  const handleRunCustomCombo = useCallback(() => {
    if (Object.keys(activeCohortCandles).length < 4 || customLegs.length < 2) return;
    const res = evaluateIndicatorCombination(
      activeCohortCandles,
      {
        id: 'custom_user_combo',
        name: customName.trim() || 'Custom 1D Alpha Stack',
        description: `User-selected ${customLegs.length}-factor 1D combination (${customMode === 'STRICT_CONSENSUS' ? `AND Gate Z >= ${customZThresh}` : 'Equal Z-Rank Composite'}).`,
        mode: customMode,
        consensusZThreshold: customZThresh,
        legs: customLegs,
      },
      {
        horizonDays: targetHorizon,
        shiftBars: 1,
        factorRanking: report?.factorRanking ?? [],
      }
    );
    setCustomResult(res);
  }, [activeCohortCandles, customLegs, customMode, customName, customZThresh, report, targetHorizon]);

  const handleLoadPresetIntoBuilder = (combo: CombinationTestResult) => {
    setCustomName(`${combo.name} (Edited)`);
    setCustomMode(combo.mode);
    setCustomLegs(combo.legs.map((l) => ({ factorId: l.factorId, direction: l.direction })));
    setCustomResult(combo);
  };

  const getRecommendedDirection = useCallback(
    (factorId: string): 1 | -1 => {
      const row = report?.factorRanking.find((r) => r.factorId === factorId);
      if (!row) return 1;
      const horizonIc = row.byHorizon[targetHorizon]?.meanIc ?? row.bestIc;
      return horizonIc < 0 ? -1 : 1;
    },
    [report, targetHorizon]
  );

  const handleChangeLegFactor = (idx: number, nextFactorId: string) => {
    const recDir = getRecommendedDirection(nextFactorId);
    setCustomLegs((prev) =>
      prev.map((leg, i) => (i === idx ? { factorId: nextFactorId, direction: recDir } : leg))
    );
  };

  const handleToggleLegDir = (idx: number) => {
    setCustomLegs((prev) =>
      prev.map((leg, i) =>
        i === idx ? { ...leg, direction: leg.direction === 1 ? -1 : 1 } : leg
      )
    );
  };

  const handleAddLeg = () => {
    if (customLegs.length >= 4) return;
    const usedIds = new Set(customLegs.map((l) => l.factorId));
    const candidate =
      UNIFIED_ML4T_FACTORS.find((f) => !usedIds.has(f.id))?.id ?? UNIFIED_ML4T_FACTORS[0].id;
    setCustomLegs((prev) => [
      ...prev,
      { factorId: candidate, direction: getRecommendedDirection(candidate) },
    ]);
  };

  const handleRemoveLeg = (idx: number) => {
    if (customLegs.length <= 2) return;
    setCustomLegs((prev) => prev.filter((_, i) => i !== idx));
  };

  const filteredRanking = useMemo(() => {
    if (!report) return [];
    if (originFilter === 'ALL') return report.factorRanking;
    return report.factorRanking.filter((row) => row.origin === originFilter);
  }, [report, originFilter]);

  const filteredOverlapAudit = useMemo(() => {
    if (!report) return [];
    if (auditTypeFilter === 'ALL') return report.overlapAudit;
    return report.overlapAudit.filter((row) => row.fileType === auditTypeFilter);
  }, [report, auditTypeFilter]);

  const qualifyingRows = useMemo(
    () => (report ? report.factorRanking.filter((r) => r.verdict === 'ALPHA_SIGNAL') : []),
    [report]
  );

  const qualifyingPineCount = useMemo(
    () => qualifyingRows.filter((r) => r.origin !== 'STAGELEDGER_CORE').length,
    [qualifyingRows]
  );

  const topFactor: FactorIcAuditRow | null = report?.factorRanking[0] ?? null;

  const syncedPythonScript = useMemo(() => {
    const topIds =
      qualifyingRows.length > 0
        ? qualifyingRows.map((r) => r.factorId)
        : report?.factorRanking.slice(0, 6).map((r) => r.factorId) ?? [];
    return buildSyncedPythonAlphalensScript(topIds);
  }, [qualifyingRows, report]);

  const handleCopyPython = async () => {
    try {
      await navigator.clipboard.writeText(syncedPythonScript);
      setCopiedScript(true);
      setTimeout(() => setCopiedScript(false), 2200);
    } catch {
      setShowScriptPreview(true);
    }
  };

  const originCounts = useMemo(() => {
    const newPine = UNIFIED_ML4T_FACTORS.filter((f) => f.origin === 'NEW_PINE_PORT').length;
    const attached = UNIFIED_ML4T_FACTORS.filter((f) => f.origin === 'ATTACHED_SUITE').length;
    const core = UNIFIED_ML4T_FACTORS.filter((f) => f.origin === 'STAGELEDGER_CORE').length;
    return { newPine, attached, core, total: UNIFIED_ML4T_FACTORS.length };
  }, []);

  const auditCounts = useMemo(() => {
    const rows = report?.overlapAudit ?? [];
    return {
      total: rows.length,
      pine: rows.filter((r) => r.fileType === 'PINE_INDICATOR').length,
      unique: rows.filter((r) => r.status === 'UNIQUE_NEW').length,
      partial: rows.filter((r) => r.status === 'PARTIAL_OVERLAP').length,
      duplicate: rows.filter((r) => r.status === 'DUPLICATE_EXISTING').length,
      prompts: rows.filter((r) => r.status === 'NON_INDICATOR_PROMPT').length,
    };
  }, [report]);

  return (
    <div className="space-y-6">
      {/* Top Controls Bar */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-5">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <Activity className="w-4 h-4 text-emerald-400 shrink-0" />
              <h2 className="text-base font-bold text-zinc-100 tracking-tight">
                ML4T Factor IC, 1D Combinations &amp; Audit Lab
              </h2>
              <InfoTooltip
                align="left"
                title="ML4T Factor IC & Strategy Validation Lab (Bare 1D)"
                summary={`Testează statistic fiecare indicator (${originCounts.newPine + originCounts.attached} indicatori Pine + ${originCounts.core} factori StageLedger = ${originCounts.total}) pe bare zilnice (1D) cu lag cauzal .shift(1) pentru a elimina look-ahead bias-ul și dublurile.`}
                strategyImpact="Filtrează ce indicatori și combinații merită promovate în Confluence 360° și Live Daily Watchlist."
              />
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              Cross-sectional Spearman Rank IC, 1D Indicator Combinations (10 bps net friction) &amp; Purged 70/30 Ridge across 1D–360D windows with strict{' '}
              <span className="font-mono text-zinc-300">.shift(1)</span> causal lag on 10Y Yahoo <span className="font-mono text-zinc-200">1D</span> daily bars.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* Cohort Select */}
            <label className="flex items-center gap-2 text-xs text-zinc-400 shrink-0">
              <span className="hidden sm:inline font-medium">Cohort</span>
              <select
                aria-label="Factor Audit Cohort"
                value={cohortId}
                onChange={(e) => setCohortId(e.target.value as CohortId)}
                className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-2 text-xs font-medium text-zinc-200 focus:outline-none focus:border-emerald-500/60"
              >
                <option value="sp500_core16">S&amp;P 500 Core 16</option>
                <option value="megacap_beta24">Mega-Cap &amp; High-Beta 24</option>
                <option value="scanner_active" disabled={scannerCohortSymbols.length < 6}>
                  Active Scanner Top {scannerCohortSymbols.length >= 6 ? scannerCohortSymbols.length : '(Run Scan)'}
                </option>
              </select>
            </label>

            {/* Run CTA */}
            <button
              type="button"
              onClick={() => void runLiveAudit(activeSymbols, targetHorizon, true)}
              disabled={loading}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 disabled:bg-emerald-500/50 text-zinc-950 transition whitespace-nowrap shrink-0"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span className="font-mono tabular-nums">
                    Auditing {progress.done}/{progress.total}
                  </span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  <span>Run Live Factor IC Audit (10Y)</span>
                </>
              )}
            </button>

            {/* Copy Python Script */}
            <button
              type="button"
              onClick={() => void handleCopyPython()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-zinc-950 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 transition whitespace-nowrap shrink-0"
            >
              {copiedScript ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Copy Python Script</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Simulation Window Selector (1D -> 360D) */}
        <div className="mt-3.5 pt-3.5 border-t border-zinc-800/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 text-xs text-zinc-300 shrink-0">
            <span className="font-semibold text-zinc-200">Simulation Horizon (Forward 1D Bars):</span>
            <InfoTooltip
              align="left"
              title="Fereastra de Simulare (1D → 360D)"
              summary="Selectează orizontul de randament viitor (de la 1 zi până la 360 zile de tranzacționare) pentru clasamentul Leaderboard, combinațiile 1D și modelul Walk-Forward Purged Ridge."
              strategyImpact="Orizonturile scurte (1D–10D) prind reveniri tactice; cele medii/lungi (30D–360D) scot în evidență factorii de trend structural și regim macro."
            />
          </div>
          <div
            role="group"
            aria-label="Simulation Horizon Selector"
            className="flex flex-wrap items-center gap-1 bg-zinc-950 border border-zinc-800 rounded-lg p-1"
          >
            {SIMULATION_HORIZONS.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => handleHorizonChange(h)}
                aria-pressed={targetHorizon === h}
                className={`px-2.5 py-1 rounded-md text-xs font-mono font-semibold transition whitespace-nowrap shrink-0 ${
                  targetHorizon === h
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
                }`}
              >
                {h}D
              </button>
            ))}
          </div>
        </div>

        {/* Sub-view Switcher + Session Info */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-2.5 mt-4 pt-3.5 border-t border-zinc-800/80">
          <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Factor Lab Sub-views">
            <button
              type="button"
              role="tab"
              aria-selected={activeSubTab === 'leaderboard'}
              onClick={() => setActiveSubTab('leaderboard')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap shrink-0 ${
                activeSubTab === 'leaderboard'
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/40'
                  : 'text-zinc-400 hover:text-zinc-200 border border-zinc-800 bg-zinc-950/60'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Factor IC Leaderboard ({originCounts.total})</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeSubTab === 'combinations'}
              onClick={() => setActiveSubTab('combinations')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap shrink-0 ${
                activeSubTab === 'combinations'
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/40'
                  : 'text-zinc-400 hover:text-zinc-200 border border-zinc-800 bg-zinc-950/60'
              }`}
            >
              <FlaskConical className="w-3.5 h-3.5" />
              <span>1D Combinations Lab ({report?.presetCombinations.length ?? 10})</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeSubTab === 'audit_flow'}
              onClick={() => setActiveSubTab('audit_flow')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap shrink-0 ${
                activeSubTab === 'audit_flow'
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/40'
                  : 'text-zinc-400 hover:text-zinc-200 border border-zinc-800 bg-zinc-950/60'
              }`}
            >
              <GitMerge className="w-3.5 h-3.5" />
              <span>Duplication Audit ({report?.overlapAudit.length ?? 29}) &amp; Strategy Flow</span>
            </button>
          </div>

          {report && (
            <div className="flex items-center gap-1.5 text-[11px] font-mono tabular-nums text-zinc-400 whitespace-nowrap shrink-0">
              <span>
                {report.symbolsAnalyzed.length} sym · {report.commonDatesCount}d ({report.dateRange.start} → {report.dateRange.end}) · ADF {report.stationaryCount}/{report.factorRanking.length} · Spec {report.configFingerprint}
              </span>
              <InfoTooltip
                align="right"
                title="Spec Fingerprint & Test Staționaritate ADF"
                summary={`Spec ${report.configFingerprint} blochează exact definirea celor ${report.factorRanking.length} factori, barierele +2R/-1R/15D și costul de 10 bps între TypeScript și scriptul Python. ADF (${report.stationaryCount}/${report.factorRanking.length}) verifică câți factori sunt staționari (t <= -2.86).`}
                strategyImpact="Garantează paritate deterministă și separă oscilatorii staționari de indicatorii cu drift."
              />
            </div>
          )}
        </div>
      </section>

      {/* Error State */}
      {errorMsg && (
        <div className="bg-rose-950/30 border border-rose-500/40 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div className="text-xs text-rose-200">{errorMsg}</div>
        </div>
      )}

      {/* KPI Strip */}
      {report && (
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              <span>Top Alpha Factor ({targetHorizon}D)</span>
              <InfoTooltip
                align="left"
                title={`Cel mai puternic factor pe orizontul +${targetHorizon}D`}
                summary="Indicatorul cu cea mai mare corelație Spearman (|IC|) față de randamentele viitoare pe orizontul activ (1D–360D), calculat exclusiv din datele închise anterior (.shift(1))."
                strategyImpact="Ghidează selecția factorilor principali pentru Confluence 360° și Live Daily Watchlist."
              />
            </div>
            <div className="mt-2 flex items-baseline justify-between gap-2">
              <span className="text-base font-bold text-zinc-100 truncate">
                {topFactor ? topFactor.shortLabel : '—'}
              </span>
              <span
                className={`text-sm font-mono font-bold tabular-nums ${
                  topFactor && (topFactor.byHorizon[targetHorizon]?.meanIc ?? topFactor.bestIc) >= 0
                    ? 'text-emerald-400'
                    : 'text-rose-400'
                }`}
              >
                {topFactor
                  ? formatIc(topFactor.byHorizon[targetHorizon]?.meanIc ?? topFactor.bestIc)
                  : '0.0000'}
              </span>
            </div>
            <div className="mt-1.5 text-xs text-zinc-400 font-mono tabular-nums">
              {topFactor
                ? `${originShortLabel(topFactor.origin).text} · ${targetHorizon}D t=${formatTStat(
                    topFactor.byHorizon[targetHorizon]?.icTStat ?? topFactor.bestTStat
                  )} · Peak ${topFactor.bestHorizonDays}D`
                : 'Awaiting run'}
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              <span>Qualifying Alpha Signals</span>
              <InfoTooltip
                title="Semnale statistice validate (Alpha)"
                summary={`Numărul de indicatori din cei ${originCounts.total} testați care ating |IC| >= 0.015 și semnificație statistică |t-stat| >= 2.0 pe bare zilnice (1D).`}
                strategyImpact="Doar factorii cu Alpha validat și corelație scăzută între ei merită greutate mare în strategie."
              />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-mono font-bold tabular-nums text-zinc-100">
                {qualifyingRows.length}
              </span>
              <span className="text-xs font-mono text-zinc-400">
                / {report.factorRanking.length} factors
              </span>
            </div>
            <div className="mt-1.5 text-xs text-zinc-400 font-mono tabular-nums">
              {qualifyingPineCount} Pine Ports/Attached · |IC| ≥ 0.015 &amp; |t| ≥ 2.0
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              <span>Walk-Forward OOS Ridge ({report.walkForwardMeta.targetHorizonDays}D)</span>
              <InfoTooltip
                title="Model ML liniar regularizat Out-Of-Sample"
                summary={`Antrenat pe primele 70% din zile (cu purge gap între train și test) și evaluat pe ultimele 30% zile nevăzute, combinând automat toți cei ${originCounts.total} factori 1D.`}
                strategyImpact="Arată dacă agregarea ML a indicatorilor produce edge real pe date noi (+OOS IC)."
              />
            </div>
            <div className="mt-2 flex items-baseline justify-between gap-2">
              <span
                className={`text-2xl font-mono font-bold tabular-nums ${
                  report.walkForwardMeta.oosMeanIc > 0 ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {report.walkForwardMeta.available
                  ? formatIc(report.walkForwardMeta.oosMeanIc)
                  : 'N/A'}
              </span>
              <span className="text-xs font-mono tabular-nums text-zinc-300">
                t={formatTStat(report.walkForwardMeta.oosIcTStat)}
              </span>
            </div>
            <div className="mt-1.5 text-xs text-zinc-400 font-mono tabular-nums">
              {report.walkForwardMeta.available
                ? `${report.walkForwardMeta.trainDates} train / ${report.walkForwardMeta.oosDates} OOS days`
                : report.walkForwardMeta.note}
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              <span>OOS Q5−Q1 Spread &amp; 2R Barrier</span>
              <InfoTooltip
                align="right"
                title="Spread OOS Q5−Q1 & Bariera Triplă (+2R / −1R / 15D)"
                summary="Diferența de randament Q5 minus Q1 pe date nevăzute (OOS), plus rata de succes reală pe bariera StageLedger X1 (+2×ATR TP / −1×ATR SL / 15 bare 1D, SL verificat înainte de TP, -10 bps cost). Break-even la R:R 2:1 = 33.3%."
                strategyImpact="Validează dacă semnalele ML supraviețuiesc regulilor reale de Stop Loss și Take Profit."
              />
            </div>
            <div className="mt-2 flex items-baseline justify-between gap-2">
              <span
                className={`text-2xl font-mono font-bold tabular-nums ${
                  report.walkForwardMeta.oosQuintileSpreadPct >= 0
                    ? 'text-emerald-400'
                    : 'text-rose-400'
                }`}
              >
                {report.walkForwardMeta.available
                  ? formatSpread(report.walkForwardMeta.oosQuintileSpreadPct)
                  : 'N/A'}
              </span>
              <span className="text-xs font-mono tabular-nums text-zinc-300">
                {report.walkForwardMeta.available
                  ? `${report.walkForwardMeta.oosLongHitRatePct.toFixed(1)}% Q5 Win`
                  : ''}
              </span>
            </div>
            <div className="mt-1.5 text-xs text-zinc-400 font-mono tabular-nums">
              {report.walkForwardMeta.available
                ? `TB 2R: ${report.walkForwardMeta.oosBarrierWinRatePct.toFixed(1)}% (${report.walkForwardMeta.oosBarrierExpectancyR >= 0 ? '+' : ''}${report.walkForwardMeta.oosBarrierExpectancyR.toFixed(2)}R) · Split ${report.walkForwardMeta.trainSplitDate || '—'}`
                : `Split @ ${report.walkForwardMeta.trainSplitDate || '—'} (purged gap)`}
            </div>
          </div>
        </section>
      )}

      {/* Loading Skeleton when no report yet */}
      {!report && loading && (
        <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
          <RefreshCw className="w-6 h-6 text-emerald-400 animate-spin mx-auto mb-3" />
          <div className="text-sm font-semibold text-zinc-200">
            Computing Cross-Sectional Factor ICs, 1D Combinations &amp; Duplication Audit...
          </div>
          <div className="text-xs text-zinc-400 font-mono mt-1 tabular-nums">
            Fetching 10Y daily OHLCV history ({progress.done}/{progress.total} symbols)
          </div>
        </section>
      )}

      {/* ============================================================
          SUB-TAB 1: LEADERBOARD (26 FACTORS) + RIDGE + COLLINEARITY
      ============================================================ */}
      {report && activeSubTab === 'leaderboard' && (
        <>
          <section className="bg-zinc-900 border border-zinc-800 rounded-xl">
            <div className="px-4 py-3.5 border-b border-zinc-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-zinc-100">
                  Factor IC Leaderboard (1D Bars · 1D–360D)
                </h3>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Sorted by |{targetHorizon}D IC|. Positive = momentum/fear buy; negative = contrarian pullback. Click any row to expand all 9 horizons (1D–360D).
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1 shrink-0">
                {(
                  [
                    { id: 'ALL', label: `All Factors (${originCounts.total})` },
                    { id: 'NEW_PINE_PORT', label: `New Pine (${originCounts.newPine})` },
                    { id: 'ATTACHED_SUITE', label: `Attached (${originCounts.attached})` },
                    { id: 'STAGELEDGER_CORE', label: `Core (${originCounts.core})` },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setOriginFilter(opt.id)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap shrink-0 ${
                      originFilter === opt.id
                        ? 'bg-zinc-800 text-zinc-100 border border-zinc-700'
                        : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {(() => {
              const benchmarkHorizons = ([5, 30, 120, 360] as SimulationHorizon[])
                .filter((h) => h !== targetHorizon)
                .slice(0, 3)
                .sort((a, b) => a - b);

              return (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-950/60 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                    <th className="py-2.5 px-2 w-7 whitespace-nowrap">#</th>
                    <th className="py-2.5 px-2 whitespace-nowrap">Factor</th>
                    <th className="py-2.5 px-2 whitespace-nowrap">Origin · Cat</th>
                    <th className="py-2.5 px-2 text-right bg-emerald-500/10 text-emerald-300 whitespace-nowrap">
                      <InfoTooltip
                        label={`${targetHorizon}D IC`}
                        title={`Orizontul activ: Information Coefficient la +${targetHorizon}D`}
                        summary={`Corelația Spearman între factorul de ieri (.shift(1)) și randamentul pe următoarele ${targetHorizon} zile de tranzacționare.`}
                        strategyImpact="Tabelul este sortat după valoarea absolută a acestui orizont selectat."
                      />
                    </th>
                    {benchmarkHorizons.map((bh) => (
                      <th key={bh} className="py-2.5 px-2 text-right whitespace-nowrap">
                        <InfoTooltip
                          label={`${bh}D IC`}
                          title={`Information Coefficient la ${bh} ${bh === 1 ? 'zi' : 'zile'} (+${bh}D)`}
                          summary={`Corelația Spearman cross-sectională cu randamentul viitor pe ${bh} bare 1D (repere de comparație pe curba 1D–360D).`}
                        />
                      </th>
                    ))}
                    <th className="py-2.5 px-2 text-right whitespace-nowrap">
                      <InfoTooltip
                        label={`${targetHorizon}D t`}
                        title={`Semnificația statistică la +${targetHorizon}D`}
                        summary="Raportul între media IC și eroarea standard la orizontul activ. |t| >= 2.0 înseamnă sub 5% șansă de zgomot."
                      />
                    </th>
                    <th className="py-2.5 px-2 text-right whitespace-nowrap">
                      <InfoTooltip
                        label={`${targetHorizon}D Q5−Q1`}
                        title={`Spread Quintile Top 20% minus Bottom 20% (+${targetHorizon}D)`}
                        summary={`Diferența de randament mediu (%) pe +${targetHorizon} zile între cele mai mari 20% valori (Q5) și cele mai mici 20% (Q1).`}
                      />
                    </th>
                    <th className="py-2.5 px-2 text-right whitespace-nowrap">
                      <InfoTooltip
                        label="Turn%"
                        title="Rotația zilnică a clasamentului (%)"
                        summary="Cât de des se schimbă ordinea simbolurilor de la o zi la alta. Turnover mic înseamnă costuri de tranzacționare reduse."
                      />
                    </th>
                    <th className="py-2.5 px-2 text-right whitespace-nowrap">
                      <InfoTooltip
                        label="ADF"
                        title="Test Staționaritate Augmented Dickey-Fuller"
                        summary="Verifică prin regresie OLS (lag=1) dacă seria factorului este staționară (Stat: t <= -2.86) sau are drift nestabil (Drift: t > -2.86)."
                        strategyImpact="Factorii staționari oferă semnale stabile în timp pentru modelele ML."
                      />
                    </th>
                    <th className="py-2.5 px-2 text-right whitespace-nowrap">
                      <InfoTooltip
                        label="2R TB"
                        title="Expectancy Triple-Barrier (+2×ATR / −1×ATR / 15D)"
                        summary="Câștigul mediu în unități de risc R pentru top quintila Q5 (aliniată după semnul IC), cu SL verificat înainte de TP și -10 bps comision. Break-even = 33.3% win rate."
                        strategyImpact="Conectează direct fiecare indicator cu regulile de risc X1_fixed_v1 din StageLedger."
                      />
                    </th>
                    <th className="py-2.5 px-2 whitespace-nowrap">
                      <InfoTooltip
                        label="Top Peer"
                        align="right"
                        title="Cel mai corelat indicator din sistem"
                        summary="Perechea cu cea mai mare corelație între factori. Dacă |r| >= 0.72, cei doi indicatori măsoară aproape același lucru."
                      />
                    </th>
                    <th className="py-2.5 px-2 text-right whitespace-nowrap">
                      <InfoTooltip
                        label="Verdict"
                        align="right"
                        title="Clasificarea finală a factorului"
                        summary="ALPHA (|IC|>=0.015 & |t|>=2.0), WEAK (edge moderat), NOISE (fără putere predictivă), SUSPECT (anomalie look-ahead)."
                      />
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/70 text-xs">
                  {filteredRanking.map((row, idx) => {
                    const isSelected = selectedFactorId === row.factorId;
                    const activeM = row.byHorizon[targetHorizon];
                    const icActive = activeM?.meanIc ?? row.bestIc;
                    const tActive = activeM?.icTStat ?? row.bestTStat;
                    const spreadActive = activeM?.quintileSpreadPct ?? row.bestSpreadPct;
                    const originBadge = originShortLabel(row.origin);
                    const verdictColor =
                      row.verdict === 'ALPHA_SIGNAL'
                        ? 'text-emerald-400'
                        : row.verdict === 'WEAK_EDGE'
                        ? 'text-amber-400'
                        : row.verdict === 'LOOKAHEAD_SUSPECT'
                        ? 'text-rose-400'
                        : 'text-zinc-500';
                    const verdictLabel =
                      row.verdict === 'ALPHA_SIGNAL'
                        ? 'ALPHA'
                        : row.verdict === 'WEAK_EDGE'
                        ? 'WEAK'
                        : row.verdict === 'LOOKAHEAD_SUSPECT'
                        ? 'SUSPECT'
                        : 'NOISE';

                    const icColorClass = (v: number) =>
                      Math.abs(v) >= 0.015
                        ? v > 0
                          ? 'text-emerald-400'
                          : 'text-rose-400'
                        : 'text-zinc-400';

                    return (
                      <React.Fragment key={row.factorId}>
                        <tr
                          onClick={() =>
                            setSelectedFactorId(isSelected ? null : row.factorId)
                          }
                          className={`cursor-pointer transition ${
                            isSelected ? 'bg-zinc-800/60' : 'hover:bg-zinc-800/35'
                          }`}
                        >
                          <td className="py-2.5 px-2 font-mono tabular-nums text-zinc-500">
                            {idx + 1}
                          </td>
                          <td className="py-2.5 px-2">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-zinc-100">{row.name}</span>
                              <InfoTooltip
                                align="left"
                                title={row.name}
                                summary={row.description}
                                strategyImpact={row.strategyRole}
                                ariaLabel={`Detalii ${row.name}`}
                              />
                            </div>
                          </td>
                          <td className="py-2.5 px-2 text-zinc-400 whitespace-nowrap">
                            <span className={`${originBadge.colorClass} font-medium`}>
                              {originBadge.text}
                            </span>
                            <span className="mx-1 text-zinc-600">·</span>
                            <span>{row.category}</span>
                          </td>
                          <td
                            className={`py-2.5 px-2 text-right font-mono tabular-nums font-semibold bg-emerald-500/5 ${icColorClass(icActive)}`}
                          >
                            {formatIc(icActive)}
                          </td>
                          {benchmarkHorizons.map((bh) => {
                            const bVal = row.byHorizon[bh]?.meanIc ?? 0;
                            return (
                              <td
                                key={bh}
                                className={`py-2.5 px-2 text-right font-mono tabular-nums ${icColorClass(bVal)}`}
                              >
                                {formatIc(bVal)}
                              </td>
                            );
                          })}
                          <td
                            className={`py-2.5 px-2 text-right font-mono tabular-nums font-semibold ${
                              Math.abs(tActive) >= 2.0 ? 'text-zinc-100' : 'text-zinc-500'
                            }`}
                          >
                            {formatTStat(tActive)}
                          </td>
                          <td
                            className={`py-2.5 px-2 text-right font-mono tabular-nums ${
                              spreadActive >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {formatSpread(spreadActive)}
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono tabular-nums text-zinc-400">
                            {row.turnoverPct.toFixed(1)}%
                          </td>
                          <td
                            className={`py-2.5 px-2 text-right font-mono tabular-nums whitespace-nowrap ${
                              row.isStationary ? 'text-emerald-400' : 'text-amber-400'
                            }`}
                            title={`ADF t-stat = ${row.adfTStat.toFixed(2)} (MacKinnon 5%: <= -2.86)`}
                          >
                            {row.isStationary ? 'Stat' : 'Drift'}
                          </td>
                          <td
                            className={`py-2.5 px-2 text-right font-mono tabular-nums whitespace-nowrap ${
                              row.tbExpectancyR > 0 ? 'text-emerald-400' : 'text-zinc-400'
                            }`}
                            title={`Triple-Barrier +2R/-1R/15D: ${row.tbWinRatePct.toFixed(1)}% Win Rate (Break-even 33.3%)`}
                          >
                            {row.tbExpectancyR >= 0 ? '+' : ''}
                            {row.tbExpectancyR.toFixed(2)}R
                          </td>
                          <td className="py-2.5 px-2 font-mono tabular-nums text-zinc-400 whitespace-nowrap">
                            {row.topCorrelatedPeer
                              ? `${row.topCorrelatedPeer.shortLabel} (${row.topCorrelatedPeer.correlation >= 0 ? '+' : ''}${row.topCorrelatedPeer.correlation.toFixed(2)})`
                              : '—'}
                          </td>
                          <td
                            className={`py-2.5 px-2 text-right font-mono font-bold tracking-wide whitespace-nowrap ${verdictColor}`}
                          >
                            {verdictLabel}
                          </td>
                        </tr>
                        {isSelected && (
                          <tr className="bg-zinc-950/75">
                            <td colSpan={14} className="px-3 py-3 text-xs text-zinc-300 space-y-2.5">
                              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <span className="font-semibold text-zinc-100">{row.name}: </span>
                                  {row.description}
                                </div>
                                <div className="font-mono tabular-nums text-[11px] text-zinc-400 shrink-0 whitespace-nowrap">
                                  Peak {row.bestHorizonDays}D ({formatIc(row.bestIc)}, t={formatTStat(row.bestTStat)}) · ADF t={row.adfTStat.toFixed(2)} ({row.isStationary ? 'Stat' : 'Drift'}) · TB 2R: {row.tbWinRatePct.toFixed(1)}% ({row.tbExpectancyR >= 0 ? '+' : ''}{row.tbExpectancyR.toFixed(2)}R)
                                </div>
                              </div>
                              <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-1.5">
                                {SIMULATION_HORIZONS.map((h) => {
                                  const hm = row.byHorizon[h];
                                  const isCur = h === targetHorizon;
                                  return (
                                    <div
                                      key={h}
                                      className={`rounded-lg p-2 border font-mono tabular-nums ${
                                        isCur
                                          ? 'bg-emerald-500/10 border-emerald-500/40'
                                          : 'bg-zinc-900/80 border-zinc-800'
                                      }`}
                                    >
                                      <div className="flex items-center justify-between text-[10px] text-zinc-400">
                                        <span className={isCur ? 'text-emerald-300 font-bold' : 'font-semibold'}>
                                          +{h}D
                                        </span>
                                        <span>n={hm?.datesEvaluated ?? 0}</span>
                                      </div>
                                      <div
                                        className={`text-xs font-bold mt-0.5 ${
                                          hm && Math.abs(hm.meanIc) >= 0.015
                                            ? hm.meanIc >= 0
                                              ? 'text-emerald-400'
                                              : 'text-rose-400'
                                            : 'text-zinc-300'
                                        }`}
                                      >
                                        {hm ? formatIc(hm.meanIc) : '—'}
                                      </div>
                                      <div className="text-[10px] text-zinc-400 mt-0.5">
                                        t={hm ? formatTStat(hm.icTStat) : '0'} · {hm ? formatSpread(hm.quintileSpreadPct) : '0%'}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                              <div className="text-[11px] text-emerald-400">
                                <span className="font-semibold">Integrare strategie (1D): </span>
                                {row.strategyRole}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
              );
            })()}
          </section>

          {/* Lower Diagnostic Panels */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Left: Walk-Forward Ridge Feature Weights */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-sm font-bold text-zinc-100">
                    Walk-Forward Ridge Feature Weights (+{report.walkForwardMeta.targetHorizonDays}D)
                  </h3>
                  <InfoTooltip
                    align="left"
                    title="Ponderile empirice Walk-Forward Ridge"
                    summary="Greutatea fiecărui factor învățată automat de regresia Ridge pe primele 70% din datele istorice 1D. Penalizează factorii redundanți."
                    strategyImpact="Arată ce indicatori contribuie cel mai mult împreună la predicția OOS."
                  />
                </div>
                <span className="text-[11px] font-mono text-zinc-400">
                  Top 12 Alpha Share
                </span>
              </div>

              {report.walkForwardMeta.available ? (
                <div className="space-y-2.5">
                  {report.walkForwardMeta.featureWeights.slice(0, 12).map((fw) => {
                    const maxImp = Math.max(
                      1,
                      report.walkForwardMeta.featureWeights[0]?.importancePct || 1
                    );
                    const barPct = Math.min(100, (fw.importancePct / maxImp) * 100);
                    const positive = fw.weight >= 0;
                    const badge = originShortLabel(fw.origin);
                    return (
                      <div key={fw.factorId} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-medium text-zinc-200 truncate">
                              {fw.shortLabel}
                            </span>
                            <span className={`text-[10px] font-mono ${badge.colorClass}`}>
                              {badge.text}
                            </span>
                          </div>
                          <div className="font-mono tabular-nums text-[11px] text-zinc-300 shrink-0">
                            <span className={positive ? 'text-emerald-400' : 'text-rose-400'}>
                              {positive ? '+' : ''}
                              {fw.weight.toFixed(3)}
                            </span>
                            <span className="text-zinc-500 ml-2">{fw.importancePct.toFixed(1)}%</span>
                          </div>
                        </div>
                        <div className="h-1.5 bg-zinc-950 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              positive ? 'bg-emerald-500/80' : 'bg-rose-500/80'
                            }`}
                            style={{ width: `${barPct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-xs text-zinc-400 py-4">{report.walkForwardMeta.note}</div>
              )}
            </div>

            {/* Right: Redundancy Audit & Port Completeness Status */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-5 space-y-5">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-zinc-100">
                    Collinearity &amp; Redundant Pairs (|r| ≥ 0.72)
                  </h3>
                  <InfoTooltip
                    align="right"
                    title="Perechi de indicatori redundanți"
                    summary="Indicatori diferiți ca nume dar care produc aproape același clasament zilnic (corelație |r| >= 0.72). Exemplu: Mountain EMA50% vs 50-SMA Distance%."
                    strategyImpact="Păstrezi doar unul din fiecare pereche în sistemul de scoring pentru a nu dubla artificial scorul."
                  />
                </div>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Factors carrying nearly identical rank orderings double-count conviction inside static confluence weights.
                </p>

                {report.redundantPairs.length === 0 ? (
                  <div className="mt-3 text-xs text-emerald-400 font-mono">
                    No redundant factor pairs ≥ 0.72 detected in this cohort.
                  </div>
                ) : (
                  <div className="mt-3 divide-y divide-zinc-800/70 border border-zinc-800 rounded-lg bg-zinc-950/50">
                    {report.redundantPairs.map((pair) => (
                      <div
                        key={`${pair.factorA}-${pair.factorB}`}
                        className="px-3 py-2 flex items-center justify-between text-xs"
                      >
                        <span className="text-zinc-200">
                          {pair.labelA} <span className="text-zinc-500">↔</span> {pair.labelB}
                        </span>
                        <span className="font-mono tabular-nums font-semibold text-amber-400">
                          r = {pair.correlation >= 0 ? '+' : ''}
                          {pair.correlation.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-zinc-800">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                    Pine Port Coverage (1D Bars)
                  </h4>
                  {onSelectSymbolForChart && report.symbolsAnalyzed[0] && (
                    <button
                      type="button"
                      onClick={() => onSelectSymbolForChart(report.symbolsAnalyzed[0])}
                      className="text-[11px] font-mono text-emerald-400 hover:text-emerald-300 transition whitespace-nowrap"
                    >
                      Open {report.symbolsAnalyzed[0]} Chart →
                    </button>
                  )}
                </div>

                <div className="mt-2.5 text-xs text-zinc-300 space-y-1.5">
                  <div>
                    <span className="text-emerald-400 font-semibold">23 Complete Pine Ports Active:</span>{' '}
                    5 Core Pine (B-Xtrender, WVF, WhaleFusion, AlgoAlpha, Centered MFI) + 10 Batch-1 Suite (HA v2.1, Order Flow ELITE, TradingWie V3.0, Weinstein 150D, Startup Bravo+Voila/Arch/Echo/Helix/Mountain/Tango) + 6 Batch-2 Ports (G-Ron v3, Shannon AVWAP, AGAIG v2, Inside Bar HTF, ICT Prop v5, MCDX+) + 2 Batch-3 Upgrades (Startup SS Strat v2.0 with Lattice &amp; Online-IC, SuperTrend v10.1 PRIME).
                  </div>
                  {report.clippedPineNotice.map((notice, i) => (
                    <div key={i} className="text-[11px] text-zinc-400 flex items-start gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                      <span>{notice}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowScriptPreview((v) => !v)}
                  className="flex items-center justify-between w-full text-xs font-semibold text-zinc-300 hover:text-white transition"
                >
                  <span>Synced Python Alphalens Script Preview</span>
                  {showScriptPreview ? (
                    <ChevronUp className="w-4 h-4 text-zinc-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-zinc-400" />
                  )}
                </button>
                {showScriptPreview && (
                  <pre className="mt-2.5 p-3 rounded-lg bg-zinc-950 border border-zinc-800 text-[11px] font-mono text-zinc-300 overflow-x-auto max-h-64">
                    {syncedPythonScript}
                  </pre>
                )}
              </div>
            </div>
          </section>
        </>
      )}

      {/* ============================================================
          SUB-TAB 2: 1D COMBINATIONS LAB (PRESETS + CUSTOM BUILDER)
      ============================================================ */}
      {report && activeSubTab === 'combinations' && (
        <div className="space-y-6">
          {/* Custom 1D Combination Builder */}
          <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-5 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <FlaskConical className="w-4 h-4 text-emerald-400 shrink-0" />
                  <h3 className="text-sm font-bold text-zinc-100">
                    Custom 1D Multi-Indicator Combination Tester
                  </h3>
                  <InfoTooltip
                    align="left"
                    title="Tester Combinații pe Bare Zilnice (1D)"
                    summary="Combină 2 până la 4 indicatori pe bare 1D (cu .shift(1) și 10 bps comision/alunecare dus-întors). Poți testa atât scor compozit (Composite Z-Rank) cât și poartă strictă AND (Strict Consensus)."
                    strategyImpact="Validează dacă o combinație produce Alpha Lift peste cel mai bun indicator individual înainte să o pui în Confluence 360°."
                  />
                </div>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Select 2–4 factors, set direction (<span className="font-mono text-emerald-400">+1 Follow</span> or{' '}
                  <span className="font-mono text-rose-400">-1 Contrarian</span>), and backtest net of 10 bps round-trip friction on +{targetHorizon}D horizon.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleAddLeg}
                  disabled={customLegs.length >= 4}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-950 hover:bg-zinc-800 disabled:opacity-40 text-zinc-200 border border-zinc-800 transition whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Leg ({customLegs.length}/4)</span>
                </button>
                <button
                  type="button"
                  onClick={handleRunCustomCombo}
                  disabled={Object.keys(activeCohortCandles).length < 4}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 disabled:bg-emerald-500/40 text-zinc-950 transition whitespace-nowrap shrink-0"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Test Custom 1D Combo</span>
                </button>
              </div>
            </div>

            {/* Mode & Threshold Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="block text-xs">
                <span className="text-zinc-400 font-medium block mb-1">Combination Name</span>
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-emerald-500/60"
                />
              </label>

              <label className="block text-xs">
                <span className="text-zinc-400 font-medium flex items-center gap-1 mb-1">
                  <span>Gate Mode</span>
                  <InfoTooltip
                    title="Mod de combinare"
                    summary="Composite Z-Rank face media Z-score-urilor aliniate (bun pentru ranking zilnic). Strict Consensus (AND Gate) intră doar când TOȚI factorii trec pragul Z simultan."
                  />
                </span>
                <select
                  aria-label="Combination Gate Mode"
                  value={customMode}
                  onChange={(e) => setCustomMode(e.target.value as CombinationMode)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-emerald-500/60"
                >
                  <option value="COMPOSITE_RANK">Composite Z-Rank (Top Quintile Q5)</option>
                  <option value="STRICT_CONSENSUS">Strict Consensus (AND Gate Z ≥ Threshold)</option>
                </select>
              </label>

              <label className="block text-xs">
                <span className="text-zinc-400 font-medium block mb-1">
                  Consensus Z Threshold {customMode === 'STRICT_CONSENSUS' ? `(±${customZThresh.toFixed(2)}σ)` : '(Only for AND Gate)'}
                </span>
                <select
                  aria-label="Consensus Z Threshold"
                  value={customZThresh}
                  disabled={customMode !== 'STRICT_CONSENSUS'}
                  onChange={(e) => setCustomZThresh(Number(e.target.value))}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 disabled:opacity-45 focus:outline-none focus:border-emerald-500/60"
                >
                  <option value={0.25}>Z ≥ +0.25σ (Frequent)</option>
                  <option value={0.5}>Z ≥ +0.50σ (Balanced)</option>
                  <option value={0.75}>Z ≥ +0.75σ (High Conviction)</option>
                  <option value={1.0}>Z ≥ +1.00σ (Rare Sniper)</option>
                </select>
              </label>
            </div>

            {/* Legs Builder */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {customLegs.map((leg, idx) => {
                const factorRow = report.factorRanking.find((r) => r.factorId === leg.factorId);
                const empIc = factorRow?.byHorizon[targetHorizon]?.meanIc ?? factorRow?.bestIc ?? 0;
                return (
                  <div
                    key={idx}
                    className="bg-zinc-950/70 border border-zinc-800 rounded-lg p-3 flex flex-wrap sm:flex-nowrap items-center gap-2"
                  >
                    <span className="text-[11px] font-mono text-zinc-500 shrink-0">
                      #{idx + 1}
                    </span>

                    <select
                      aria-label={`Combination Leg ${idx + 1} Factor`}
                      value={leg.factorId}
                      onChange={(e) => handleChangeLegFactor(idx, e.target.value)}
                      className="flex-1 min-w-[160px] bg-zinc-900 border border-zinc-800 rounded-md px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-emerald-500/60"
                    >
                      {UNIFIED_ML4T_FACTORS.map((f) => {
                        const row = report.factorRanking.find((r) => r.factorId === f.id);
                        const icVal = row?.byHorizon[targetHorizon]?.meanIc ?? 0;
                        return (
                          <option key={f.id} value={f.id}>
                            {f.shortLabel} ({originShortLabel(f.origin).text} · IC {formatIc(icVal)})
                          </option>
                        );
                      })}
                    </select>

                    <button
                      type="button"
                      onClick={() => handleToggleLegDir(idx)}
                      className={`px-2.5 py-1.5 rounded-md text-[11px] font-mono font-semibold border transition whitespace-nowrap shrink-0 ${
                        leg.direction === 1
                          ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
                          : 'bg-rose-500/10 border-rose-500/40 text-rose-400'
                      }`}
                      title={`Empirical ${targetHorizon}D IC: ${formatIc(empIc)}`}
                    >
                      {leg.direction === 1 ? '+1 Follow' : '-1 Contrarian'}
                    </button>

                    <button
                      type="button"
                      aria-label={`Remove leg ${idx + 1}`}
                      onClick={() => handleRemoveLeg(idx)}
                      disabled={customLegs.length <= 2}
                      className="p-1.5 rounded-md text-zinc-500 hover:text-rose-400 disabled:opacity-30 transition shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Live Custom Result */}
            {customResult && (
              <div className="bg-zinc-950 border border-emerald-500/35 rounded-xl p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-bold text-zinc-100 flex items-center gap-2">
                      <span>{customResult.name}</span>
                      <span
                        className={`font-mono text-[11px] ${comboVerdictMeta(customResult.verdict).colorClass}`}
                      >
                        {comboVerdictMeta(customResult.verdict).label}
                      </span>
                    </div>
                    <div className="text-[11px] text-zinc-400 mt-0.5">{customResult.description}</div>
                  </div>
                  <div className="text-[11px] font-mono tabular-nums text-zinc-400 shrink-0">
                    {customResult.horizonDays}D Horizon · 10 bps Net Friction
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-2 border-t border-zinc-800/80">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-zinc-400">Mean IC</div>
                    <div className={`text-sm font-mono font-bold tabular-nums mt-0.5 ${customResult.meanIc >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {formatIc(customResult.meanIc)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-zinc-400">t-stat</div>
                    <div className="text-sm font-mono font-bold tabular-nums text-zinc-100 mt-0.5">
                      {formatTStat(customResult.icTStat)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-zinc-400">Net Q5−Q1</div>
                    <div className={`text-sm font-mono font-bold tabular-nums mt-0.5 ${customResult.q5MinusQ1NetPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {formatSpread(customResult.q5MinusQ1NetPct)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-zinc-400">Trades / Win%</div>
                    <div className="text-sm font-mono font-bold tabular-nums text-zinc-100 mt-0.5">
                      {customResult.consensusTradesCount} · {customResult.consensusWinRatePct.toFixed(1)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-zinc-400">Profit Factor</div>
                    <div className="text-sm font-mono font-bold tabular-nums text-zinc-100 mt-0.5">
                      {customResult.profitFactor.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-zinc-400">Alpha Lift vs Best</div>
                    <div className={`text-sm font-mono font-bold tabular-nums mt-0.5 ${customResult.alphaLiftIc >= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {formatIc(customResult.alphaLiftIc)}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Preset 1D Combinations Leaderboard */}
          <section className="bg-zinc-900 border border-zinc-800 rounded-xl">
            <div className="px-4 py-3.5 border-b border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-zinc-100">
                  Curated Multi-Indicator Combinations Leaderboard (+{targetHorizon}D on 1D Bars)
                </h3>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Tests preset combinations across all fetched symbols net of 10 bps round-trip friction. Click <span className="text-zinc-200 font-medium">Load in Builder</span> to customize legs.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-950/60 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                    <th className="py-2.5 px-3">Combination &amp; Legs</th>
                    <th className="py-2.5 px-3">Mode</th>
                    <th className="py-2.5 px-3 text-right">
                      <InfoTooltip
                        label="Mean IC"
                        title="IC-ul combinației pe bare 1D"
                        summary="Corelația Spearman medie dintre scorul combinat al leg-urilor (cu direcția +1/-1) și randamentul viitor."
                        strategyImpact="Dacă Mean IC bate fiecare componentă individuală, combinația adaugă valoare reală."
                      />
                    </th>
                    <th className="py-2.5 px-3 text-right">
                      <InfoTooltip
                        label="t-stat"
                        title="Semnificația statistică a combinației"
                        summary="T-statistic pe seria zilnică de IC. >= 2.0 înseamnă edge statistic robust."
                      />
                    </th>
                    <th className="py-2.5 px-3 text-right">
                      <InfoTooltip
                        label="Net Q5−Q1"
                        title="Spread Net Q5 minus Q1 (după 10 bps)"
                        summary="Diferența de randament între top 20% și bottom 20% minus 0.10% fricțiune de execuție."
                      />
                    </th>
                    <th className="py-2.5 px-3 text-right">
                      <InfoTooltip
                        label="Win Rate"
                        title="Procent tranzacții câștigătoare (net)"
                        summary="Procentul semnalelor care închid pe plus după cele N zile (+1D până la +360D) și după 10 bps comision."
                      />
                    </th>
                    <th className="py-2.5 px-3 text-right">
                      <InfoTooltip
                        label="Profit Factor"
                        title="Raport Câștig Brut / Pierdere Brută"
                        summary="Suma profiturilor nete împărțită la suma pierderilor nete. > 1.25 indică o asimetrie sănătoasă."
                      />
                    </th>
                    <th className="py-2.5 px-3 text-right">
                      <InfoTooltip
                        label="Alpha Lift"
                        align="right"
                        title="Câștig de IC față de cel mai bun indicator din combo"
                        summary="Mean IC al combinației minus |IC| al celui mai bun factor component. Pozitiv = sinergie reală (SYNERGISTIC)."
                        strategyImpact="Doar combinațiile cu Alpha Lift pozitiv merită complexitatea adițională."
                      />
                    </th>
                    <th className="py-2.5 px-3 text-right">Verdict</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/70 text-xs">
                  {report.presetCombinations.map((combo) => {
                    const vMeta = comboVerdictMeta(combo.verdict);
                    return (
                      <tr key={combo.id} className="hover:bg-zinc-800/35 transition">
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-zinc-100">{combo.name}</span>
                            <InfoTooltip
                              align="left"
                              title={combo.name}
                              summary={combo.description}
                              strategyImpact={`Comparat cu cel mai bun factor singular (IC ${formatIc(combo.bestSingleComponentIc)}), lift: ${formatIc(combo.alphaLiftIc)}.`}
                            />
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] font-mono text-zinc-400">
                            {combo.legs.map((l) => (
                              <span key={l.factorId}>
                                <span className={l.direction === 1 ? 'text-emerald-400' : 'text-rose-400'}>
                                  {l.direction === 1 ? '+' : '−'}
                                </span>
                                {l.shortLabel}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-3 px-3 font-mono text-[11px] text-zinc-300 whitespace-nowrap">
                          {combo.mode === 'STRICT_CONSENSUS' ? 'AND Gate' : 'Z-Rank'}
                        </td>
                        <td
                          className={`py-3 px-3 text-right font-mono tabular-nums font-semibold ${
                            combo.meanIc >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {formatIc(combo.meanIc)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-zinc-200">
                          {formatTStat(combo.icTStat)}
                        </td>
                        <td
                          className={`py-3 px-3 text-right font-mono tabular-nums ${
                            combo.q5MinusQ1NetPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {formatSpread(combo.q5MinusQ1NetPct)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-zinc-200 whitespace-nowrap">
                          {combo.consensusWinRatePct.toFixed(1)}%{' '}
                          <span className="text-zinc-500">({combo.consensusTradesCount})</span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-zinc-200">
                          {combo.profitFactor.toFixed(2)}
                        </td>
                        <td
                          className={`py-3 px-3 text-right font-mono tabular-nums ${
                            combo.alphaLiftIc >= 0 ? 'text-emerald-400' : 'text-amber-400'
                          }`}
                        >
                          {formatIc(combo.alphaLiftIc)}
                        </td>
                        <td className={`py-3 px-3 text-right font-mono font-bold whitespace-nowrap ${vMeta.colorClass}`}>
                          {vMeta.label}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleLoadPresetIntoBuilder(combo)}
                            className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 transition whitespace-nowrap shrink-0"
                          >
                            Load in Builder
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* ============================================================
          SUB-TAB 3: DUPLICATION AUDIT (14 FILES) & STRATEGY FLOW
      ============================================================ */}
      {report && activeSubTab === 'audit_flow' && (
        <div className="space-y-6">
          {/* Strategy Integration Architecture */}
          <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-zinc-100">
                  Cum este integrat Factor IC &amp; ML Lab în Strategia StageLedger (Bare 1D)
                </h3>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Fluxul end-to-end care conectează librăria de indicatori Pine, validarea statistică pe bare zilnice (1D) și motorul de decizie Live Scanner / Watchlist.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              {[
                {
                  step: '01 · Indicator Library',
                  title: 'Pine v6 Ports (1D)',
                  summary:
                    'Scripturile unice din Batch 1–3 (HA v2.1, Startup Suite + SS Strat v2.0 Lattice/Online-IC, SuperTrend v10.1 PRIME, TradingWie V3.0, G-Ron v3, Shannon AVWAP, AGAIG v2, Inside Bar HTF, ICE v1.1.0, ICT Prop v5, MCDX+) sunt integrate curat în Indicator Library.',
                  impact: 'Volume Spike v5/Pro, Order Flow ELITE, Bravo+Voila, TradingWie V2.3 și dublura SuperTrend v10.1 NU au fost clonate.',
                },
                {
                  step: '02 · Anti-Lookahead',
                  title: 'Causal Lag .shift(1)',
                  summary:
                    `Extractoarele calculează toți cei ${originCounts.total} factori pe bare 1D și aplică strict shift(1): decizia de azi folosește doar barele închise până ieri.`,
                  impact: 'Garantează că niciun semnal nu folosește prețul High/Close al zilei viitoare.',
                },
                {
                  step: '03 · Duplication Gate',
                  title: 'Spearman IC & |r| < 0.72',
                  summary:
                    'Corelația cross-sectională detectează automat dublurile (ex. Mountain EMA50% ↔ 50-SMA% sau Helix ↔ MACD).',
                  impact: 'Elimină dubla-numărare a aceluiași semnal în Confluence 360°.',
                },
                {
                  step: '04 · 1D Combos & Ridge',
                  title: 'Synergy & OOS Weights',
                  summary:
                    '1D Combinations Lab măsoară dacă 2–4 indicatori împreună depășesc cel mai bun factor singular (Alpha Lift > 0, net 10 bps).',
                  impact: 'Purged 70/30 Ridge calibrează ponderile empirice pe orizonturile 1D → 360D.',
                },
                {
                  step: '05 · Live Execution',
                  title: 'Confluence 360° & Watchlist',
                  summary:
                    'Factorii și combinațiile validate alimentează scorul unificat (Confluence 360°), Top 50 Live Daily Watchlist și Chart Studio.',
                  impact: 'Traderul vede doar setup-uri cu edge statistic verificat pe date reale Yahoo 1D.',
                },
              ].map((node, i) => (
                <div
                  key={node.step}
                  className="bg-zinc-950/70 border border-zinc-800 rounded-lg p-3.5 flex flex-col justify-between gap-2"
                >
                  <div>
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-400">
                        {node.step}
                      </span>
                      <InfoTooltip
                        align={i >= 3 ? 'right' : 'left'}
                        title={`${node.step} — ${node.title}`}
                        summary={node.summary}
                        strategyImpact={node.impact}
                      />
                    </div>
                    <div className="text-xs font-bold text-zinc-100 mt-1 flex items-center gap-1">
                      <span>{node.title}</span>
                      {i < 4 && <ArrowRight className="w-3 h-3 text-zinc-600 hidden md:inline shrink-0" />}
                    </div>
                    <p className="text-[11px] text-zinc-400 mt-1.5 leading-relaxed">
                      {node.summary}
                    </p>
                  </div>
                  <div className="pt-2 border-t border-zinc-800/80 text-[10px] text-emerald-400/90 leading-snug">
                    {node.impact}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Attached Python / LightGBM / ONNX Prototype Engineering Audit */}
          <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-zinc-100">
                  Audit Prototip Atașat (Python / LightGBM / ONNX) — Doar ce aduce valoare reală pe 1D
                </h3>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Separăm componentele matematice utile integrate nativ în StageLedger de stub-urile incomplete sau greșite din fișierele atașate.
                </p>
              </div>
              <span className="font-mono text-[11px] text-emerald-400 shrink-0">
                Spec Hash: {report.configFingerprint}
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-zinc-950/70 border border-emerald-500/30 rounded-lg p-3.5 space-y-2">
                <div className="text-xs font-bold text-emerald-400">
                  Integrat Nativ în StageLedger (Util pe bare 1D)
                </div>
                <ul className="space-y-1.5 text-[11px] text-zinc-300 leading-relaxed">
                  <li>
                    <span className="font-semibold text-zinc-100">Triple-Barrier (+2×ATR TP / −1×ATR SL / 15D):</span>{' '}
                    Aliniat cu politica StageLedger <span className="font-mono text-zinc-200">X1_fixed_v1</span> (SL verificat înainte de TP pe aceeași bară, cost 10 bps, break-even 33.3% la R:R 2:1).
                  </li>
                  <li>
                    <span className="font-semibold text-zinc-100">Test Staționaritate ADF (OLS lag=1):</span>{' '}
                    Verifică automat toți cei {report.factorRanking.length} factori (<span className="font-mono text-zinc-200">{report.stationaryCount}</span> staționari la MacKinnon 5% t ≤ −2.86) înainte de ponderarea Ridge.
                  </li>
                  <li>
                    <span className="font-semibold text-zinc-100">Config Fingerprint &amp; Export Python Curat:</span>{' '}
                    Scriptul Python Alphalens include acum hash-ul de specificație, <span className="font-mono text-zinc-200">B-Xtrender</span> exact, <span className="font-mono text-zinc-200">adfuller</span> și <span className="font-mono text-zinc-200">triple_barrier_labels</span>.
                  </li>
                </ul>
              </div>

              <div className="bg-zinc-950/70 border border-rose-500/30 rounded-lg p-3.5 space-y-2">
                <div className="text-xs font-bold text-rose-400">
                  Respins / Neimportat din Prototip (Bug-uri &amp; Redundanțe)
                </div>
                <ul className="space-y-1.5 text-[11px] text-zinc-300 leading-relaxed">
                  <li>
                    <span className="font-semibold text-zinc-100">Stub-uri greșite (`bxtrender.py`, `whale_z.py`, `avwap.py`):</span>{' '}
                    <span className="font-mono text-zinc-200">bxtrender.py</span> calcula `close − ema(5)` în loc de `ema(5) − ema(20)` + Tillson T3; <span className="font-mono text-zinc-200">avwap.py</span> cu reset zilnic devine inutil pe bare 1D (StageLedger are Calendar YTD AVWAP).
                  </li>
                  <li>
                    <span className="font-semibold text-zinc-100">Defecte în `training/splits.py` &amp; `metrics.py`:</span>{' '}
                    <span className="font-mono text-zinc-200">embargo_bars</span> era no-op (`pass`), Kelly folosea limită 100% (`0.02/0.02`) și formulă simetrică pe bariere 2:1, iar Sharpe-ul însuma trade-uri suprapuse de 24 bare zilnic.
                  </li>
                  <li>
                    <span className="font-semibold text-zinc-100">Fără dependențe grele `lightgbm` / `onnxruntime-node`:</span>{' '}
                    Serverul web rămâne pur TypeScript/Express rapid fără dependențe native fragile.
                  </li>
                </ul>
              </div>
            </div>
          </section>

          {/* 14 Attached Files Duplication Audit Table */}
          <section className="bg-zinc-900 border border-zinc-800 rounded-xl">
            <div className="px-4 py-3.5 border-b border-zinc-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-zinc-100">
                    Complete {auditCounts.total}-Item Duplication &amp; 1D Bar Adaptation Audit
                  </h3>
                  <InfoTooltip
                    align="left"
                    title={`Audit complet pentru toate cele ${auditCounts.total} scripturi și fișiere`}
                    summary={`Din ${auditCounts.total} elemente auditate: ${auditCounts.unique} indicatori unici/upgrade-uri canonice, ${auditCounts.partial} suprapuneri parțiale, ${auditCounts.duplicate} duplicate directe (ex. Volume Spike v5/Pro, Order Flow ELITE, Bravo+Voila, TradingWie V2.3) și ${auditCounts.prompts} template-uri de prompt AI.`}
                    strategyImpact="Previne aglomerarea strategiei cu indicatori identici redenumiți."
                  />
                </div>
                <p className="text-[11px] text-zinc-400 mt-0.5 font-mono tabular-nums">
                  {auditCounts.unique} Unique · {auditCounts.partial} Partial Overlap · {auditCounts.duplicate} Duplicate Existing · {auditCounts.prompts} Non-Indicator Prompts
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    { id: 'ALL', label: `All Files (${auditCounts.total})` },
                    { id: 'PINE_INDICATOR', label: `Pine Indicators (${auditCounts.pine})` },
                    { id: 'LLM_PROMPT', label: `Prompt Templates (${auditCounts.prompts})` },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setAuditTypeFilter(opt.id)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap shrink-0 ${
                      auditTypeFilter === opt.id
                        ? 'bg-zinc-800 text-zinc-100 border border-zinc-700'
                        : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-950/60 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                    <th className="py-2.5 px-3">Attached File &amp; Title</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">
                      <InfoTooltip
                        align="left"
                        label="Overlaps With"
                        title="Modulul existent cu care se suprapune"
                        summary="Arată exact ce engine existent din StageLedger (Volume Spike Engine, TrendSpider Weinstein, Keltner, RSI14, SMA50%) acoperă deja aceeași formulă."
                      />
                    </th>
                    <th className="py-2.5 px-3 text-right">
                      <InfoTooltip
                        label="Empirical r"
                        title="Corelație empirică (1D) față de peer"
                        summary="Corelația măsurată live pe cohorta activă între factorul atașat și echivalentul său din StageLedger Core."
                      />
                    </th>
                    <th className="py-2.5 px-3">1D Daily Bar Note &amp; Recommendation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/70 text-xs">
                  {filteredOverlapAudit.map((row) => {
                    const sMeta = overlapStatusMeta(row.status);
                    return (
                      <tr key={row.fileName} className="hover:bg-zinc-800/35 transition align-top">
                        <td className="py-3 px-3">
                          <div className="font-semibold text-zinc-100">{row.title}</div>
                          <div className="text-[11px] font-mono text-zinc-500 mt-0.5 break-all">
                            {row.fileName}
                          </div>
                        </td>
                        <td className={`py-3 px-3 font-mono font-bold whitespace-nowrap ${sMeta.colorClass}`}>
                          {sMeta.label}
                        </td>
                        <td className="py-3 px-3 text-zinc-300">
                          {row.overlapsWith}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                          {row.empiricalCorr !== null ? (
                            <span
                              className={
                                Math.abs(row.empiricalCorr) >= 0.72
                                  ? 'text-rose-400 font-bold'
                                  : 'text-zinc-200'
                              }
                            >
                              {row.empiricalCorr >= 0 ? '+' : ''}
                              {row.empiricalCorr.toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-zinc-500">—</span>
                          )}
                        </td>
                        <td className="py-3 px-3 space-y-1">
                          <div className="text-zinc-300 leading-relaxed">{row.dailyBarNote}</div>
                          <div className="text-[11px] font-medium text-emerald-400">
                            {row.recommendation}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
