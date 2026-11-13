import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Sparkles,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  Layers,
  Search,
  Target,
  BarChart3,
  Award,
  CheckCircle2,
  AlertTriangle,
  Activity,
  ArrowUpRight,
  Eye,
  RefreshCw,
  Compass,
  Zap,
  SlidersHorizontal,
  X,
  ExternalLink,
  Info,
} from 'lucide-react';
import {
  evaluateCandidate360Confluence,
  rankCandidatesByConfluence,
  Candidate360Confluence,
  AngleEvaluation,
} from '../utils/confluenceScoringEngine';
import { Candle } from '../utils/trullasStrategy';
import { SP500_TOP_50 } from '../data/sp500Universe';
import { TickerOptionsSummary } from '../utils/cboeOptionsEngine';
import { GicsSectorPerformance } from '../utils/sectorMetrics';

function getCurrencyPrefix(currency?: string, symbol?: string): string {
  if (currency === 'SEK' || symbol?.endsWith('.ST')) return 'SEK ';
  if (currency === 'EUR' || symbol?.endsWith('.DE') || symbol?.endsWith('.PA') || symbol?.endsWith('.AS') || symbol?.endsWith('.HE')) return '€';
  if (currency === 'GBP' || symbol?.endsWith('.L')) return '£';
  return '$';
}

function normalizeCandles(raw: any[]): Candle[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c) => c && typeof c.close === 'number' && Number.isFinite(c.close) && c.close > 0)
    .map((c) => ({
      timestamp: Number(c.timestamp) || (c.dateStr ? Date.parse(c.dateStr) : Date.now()),
      dateStr: c.dateStr || (c.timestamp ? new Date(c.timestamp).toISOString().split('T')[0] : undefined),
      open: Number(c.open ?? c.close),
      high: Number(c.high ?? c.close),
      low: Number(c.low ?? c.close),
      close: Number(c.close),
      volume: Number(c.volume) || 0,
    }));
}

interface ConfluenceMatrixViewProps {
  onSelectSymbolForChart: (symbol: string) => void;
  scannerResults?: any[];
}

export const ConfluenceMatrixView: React.FC<ConfluenceMatrixViewProps> = ({
  onSelectSymbolForChart,
  scannerResults = [],
}) => {
  // Universe symbols to analyze (prioritize live scanner detections first)
  const candidateSymbols = useMemo(() => {
    const scannerSymbols = scannerResults.map((r) => r.symbol || r.setup?.symbol).filter(Boolean);
    const combined = Array.from(new Set([...scannerSymbols, ...SP500_TOP_50.slice(0, 12)]));
    return combined.slice(0, 14);
  }, [scannerResults]);

  // Evaluated candidates (populated strictly from real OHLCV candles)
  const [candidates, setCandidates] = useState<Candidate360Confluence[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sectorsMap, setSectorsMap] = useState<Map<string, GicsSectorPerformance>>(new Map());

  // Search & Auditing State
  const [searchQuery, setSearchQuery] = useState('');
  const [gradeFilter, setGradeFilter] = useState<'ALL' | 'A+' | 'A' | 'B' | 'C'>('ALL');
  const [directionFilter, setDirectionFilter] = useState<'ALL' | 'BULLISH' | 'BEARISH'>('ALL');
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate360Confluence | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);

  const evaluateAllCandidates = useCallback(async (symbolsToEval: string[]) => {
    if (symbolsToEval.length === 0) return;
    setIsAuditing(true);
    setErrorMessage(null);

    try {
      const scanBySymbol = new Map<string, any>();
      for (const r of scannerResults) {
        const sym = (r.symbol || r.setup?.symbol || '').toUpperCase();
        if (sym) scanBySymbol.set(sym, r);
      }

      // Fetch sector performance once for real Sector Alpha weighting
      let localSectorsMap = new Map<string, GicsSectorPerformance>();
      try {
        const secRes = await fetch('/api/sectors');
        if (secRes.ok) {
          const secData = await secRes.json();
          if (Array.isArray(secData.sectors)) {
            for (const s of secData.sectors) {
              localSectorsMap.set(s.name, s);
            }
            setSectorsMap(localSectorsMap);
          }
        }
      } catch {
        // Optional macro benchmark
      }

      // Reuse scanner candles when available, otherwise fetch live 1d/6mo candles
      const entries: Array<{
        symbol: string;
        candles: Candle[];
        direction?: 'BULLISH' | 'BEARISH';
        context?: { sectorAlphaPct?: number | null };
      }> = [];

      const toFetch = symbolsToEval.filter((sym) => {
        const existing = scanBySymbol.get(sym.toUpperCase());
        return !existing || !Array.isArray(existing.candles) || existing.candles.length < 30;
      });

      const fetchedCandleMap = new Map<string, Candle[]>();
      if (toFetch.length > 0) {
        const results = await Promise.allSettled(
          toFetch.map(async (sym) => {
            const cRes = await fetch(`/api/candles?symbol=${encodeURIComponent(sym)}&timeframe=1d&range=6mo`);
            if (!cRes.ok) return { sym, candles: [] as Candle[] };
            const cData = await cRes.json();
            return { sym, candles: normalizeCandles(cData.candles || []) };
          })
        );
        for (const r of results) {
          if (r.status === 'fulfilled' && r.value.candles.length >= 30) {
            fetchedCandleMap.set(r.value.sym.toUpperCase(), r.value.candles);
          }
        }
      }

      for (const sym of symbolsToEval) {
        const upper = sym.toUpperCase();
        const scanItem = scanBySymbol.get(upper);
        const candles =
          scanItem && Array.isArray(scanItem.candles) && scanItem.candles.length >= 30
            ? normalizeCandles(scanItem.candles)
            : fetchedCandleMap.get(upper) || [];

        if (candles.length < 30) continue;

        const firstSetupType: string = scanItem?.setups?.[0]?.type || '';
        const direction: 'BULLISH' | 'BEARISH' = firstSetupType.includes('BEAR') ? 'BEARISH' : 'BULLISH';
        const secPerf = scanItem?.sector ? localSectorsMap.get(scanItem.sector) : undefined;
        const sectorAlphaPct =
          typeof secPerf?.rsVsSpy === 'number'
            ? secPerf.rsVsSpy
            : typeof secPerf?.changePercent === 'number'
            ? secPerf.changePercent
            : null;

        entries.push({
          symbol: upper,
          candles,
          direction,
          context: { sectorAlphaPct },
        });
      }

      const ranked = rankCandidatesByConfluence(entries);
      setCandidates(ranked);
      if (ranked.length === 0) {
        setErrorMessage('Live market feeds did not return enough OHLCV history (>= 30 daily bars) for matrix evaluation.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to evaluate live 360° confluence matrix.');
    } finally {
      setIsAuditing(false);
    }
  }, [scannerResults]);

  useEffect(() => {
    evaluateAllCandidates(candidateSymbols);
  }, [candidateSymbols, evaluateAllCandidates]);

  // Re-run evaluation
  const handleRefreshMatrix = () => {
    evaluateAllCandidates(candidateSymbols);
  };

  // Direct symbol audit lookup
  const handleAuditCustomSymbol = async (sym: string) => {
    const clean = sym.trim().toUpperCase();
    if (!clean) return;

    setIsAuditing(true);
    setErrorMessage(null);

    try {
      const [lookupRes, candleRes, cboeRes] = await Promise.allSettled([
        fetch(`/api/lookup-ticker?query=${encodeURIComponent(clean)}`),
        fetch(`/api/candles?symbol=${encodeURIComponent(clean)}&timeframe=1d&range=6mo`),
        fetch(`/api/cboe-options?symbol=${encodeURIComponent(clean)}`),
      ]);

      let companyMetaOverride: any = null;
      if (lookupRes.status === 'fulfilled' && lookupRes.value.ok) {
        const data = await lookupRes.value.json();
        if (data.found) companyMetaOverride = data;
      }

      let realCandles: Candle[] = [];
      if (candleRes.status === 'fulfilled' && candleRes.value.ok) {
        const cData = await candleRes.value.json();
        realCandles = normalizeCandles(cData.candles || []);
      }

      if (realCandles.length < 30) {
        setErrorMessage(`Insufficient live OHLCV history for ${clean} (${realCandles.length} bars fetched; minimum 30 required).`);
        setIsAuditing(false);
        return;
      }

      let cboeSummary: TickerOptionsSummary | null = null;
      if (cboeRes.status === 'fulfilled' && cboeRes.value.ok) {
        const cbData = await cboeRes.value.json();
        cboeSummary = cbData.optionsSummary || null;
      }

      const secName = companyMetaOverride?.sector || '';
      const secPerf = secName ? sectorsMap.get(secName) : undefined;
      const sectorAlphaPct =
        typeof secPerf?.rsVsSpy === 'number'
          ? secPerf.rsVsSpy
          : typeof secPerf?.changePercent === 'number'
          ? secPerf.changePercent
          : null;

      const evaluated = evaluateCandidate360Confluence(clean, realCandles, 'BULLISH', {
        cboeSummary,
        sectorAlphaPct,
      });

      if (!evaluated) {
        setErrorMessage(`Unable to score ${clean}: insufficient real market bars.`);
        setIsAuditing(false);
        return;
      }

      if (companyMetaOverride) {
        if (companyMetaOverride.name) evaluated.companyName = companyMetaOverride.name;
        if (companyMetaOverride.sector) evaluated.sector = companyMetaOverride.sector;
        if (companyMetaOverride.subIndustry) evaluated.subIndustry = companyMetaOverride.subIndustry;
        if (companyMetaOverride.exchange) evaluated.exchange = companyMetaOverride.exchange;
        if (companyMetaOverride.currency) evaluated.currency = companyMetaOverride.currency;
        if (companyMetaOverride.symbol) evaluated.symbol = companyMetaOverride.symbol;
      }

      setCandidates((prev) => {
        const exists = prev.find((c) => c.symbol === evaluated.symbol || c.symbol === clean);
        if (exists) {
          return [evaluated, ...prev.filter((c) => c.symbol !== evaluated.symbol && c.symbol !== clean)];
        }
        return [evaluated, ...prev];
      });
      setSelectedCandidate(evaluated);
      setSearchQuery('');
    } catch (err: any) {
      setErrorMessage(err?.message || `Failed to audit ${clean}.`);
    } finally {
      setIsAuditing(false);
    }
  };

  // Filtered candidate list
  const filteredCandidates = useMemo(() => {
    return candidates.filter((c) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesSym = c.symbol.toLowerCase().includes(q);
        const matchesName = c.companyName.toLowerCase().includes(q);
        const matchesSector = c.sector.toLowerCase().includes(q);
        if (!matchesSym && !matchesName && !matchesSector) return false;
      }
      if (gradeFilter !== 'ALL') {
        if (gradeFilter === 'A+' && c.overallGrade !== 'A+') return false;
        if (gradeFilter === 'A' && !['A+', 'A'].includes(c.overallGrade)) return false;
        if (gradeFilter === 'B' && !['A+', 'A', 'B'].includes(c.overallGrade)) return false;
        if (gradeFilter === 'C' && c.overallGrade !== 'C') return false;
      }
      if (directionFilter !== 'ALL' && c.direction !== directionFilter) return false;
      return true;
    });
  }, [candidates, searchQuery, gradeFilter, directionFilter]);

  // Top summary metrics
  const topPick = candidates[0] ?? null;
  const eliteCount = candidates.filter((c) => c.overallGrade === 'A+').length;
  const highConvictionCount = candidates.filter((c) => ['A+', 'A'].includes(c.overallGrade)).length;
  const passingRatePct = candidates.length > 0 ? Math.round((highConvictionCount / candidates.length) * 100) : 0;
  const avgRR = candidates.length > 0
    ? (candidates.reduce((acc, c) => acc + c.executionPlan.riskRewardRatio, 0) / candidates.length).toFixed(2)
    : '—';

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-900/80 p-5 rounded-xl border border-zinc-800 shadow-lg relative overflow-hidden">
        <div className="absolute -right-12 -top-12 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex items-start space-x-3 z-10">
          <div className="p-3 bg-gradient-to-br from-indigo-500/20 to-emerald-500/20 rounded-xl border border-indigo-500/30 text-indigo-400">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-xl font-bold text-white tracking-tight">
                360° Multi-Indicator Confluence Matrix
              </h2>
              <span className="px-2 py-0.5 text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 rounded">
                Cross-System Synthesis
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-1 max-w-2xl leading-relaxed">
              Synthesizes David Trullàs 4-Pillars MACD, LuxAlgo SMC & Nadaraya-Watson bands, full Indicator Library consensus, CBOE Options flow & GEX, Pearson signal correlation, and Sector Alpha into an institutional conviction score (A+ to F).
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 z-10">
          <button
            onClick={handleRefreshMatrix}
            disabled={isAuditing}
            className="flex items-center space-x-2 px-3.5 py-2 text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 rounded-lg transition shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isAuditing ? 'animate-spin text-indigo-400' : ''}`} />
            <span>{isAuditing ? 'Auditing Library...' : 'Re-Evaluate All (360°)'}</span>
          </button>
        </div>
      </div>

      {/* Persistent Key Metric HUD */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Top Pick */}
        <div className="bg-zinc-900/90 border border-zinc-800 p-4 rounded-xl relative overflow-hidden">
          <div className="flex items-center justify-between text-zinc-400 text-xs mb-1">
            <span className="flex items-center space-x-1 font-semibold">
              <Award className="w-3.5 h-3.5 text-amber-400" />
              <span>Top Confluence Pick</span>
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold">
              {topPick ? `Grade ${topPick.overallGrade}` : 'Pending'}
            </span>
          </div>
          <div className="flex items-baseline space-x-2 mt-2">
            <span className="text-2xl font-bold text-white tracking-tight">{topPick?.symbol ?? '—'}</span>
            <span className="text-sm font-semibold text-emerald-400 font-mono">
              {topPick ? `${topPick.overallScore}% Score` : '—'}
            </span>
          </div>
          <div className="text-[11px] text-zinc-400 mt-1 truncate">
            {topPick ? `${topPick.companyName} • ${topPick.confidenceTier}` : 'Fetching live OHLCV feeds...'}
          </div>
        </div>

        {/* High Conviction Count */}
        <div className="bg-zinc-900/90 border border-zinc-800 p-4 rounded-xl">
          <div className="flex items-center justify-between text-zinc-400 text-xs mb-1">
            <span className="flex items-center space-x-1 font-semibold">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Elite / High Conviction</span>
            </span>
            <span className="text-[10px] text-zinc-500">Grades A+ & A</span>
          </div>
          <div className="flex items-baseline space-x-2 mt-2">
            <span className="text-2xl font-bold text-white tracking-tight">{highConvictionCount}</span>
            <span className="text-xs text-zinc-400">of {candidates.length} candidates</span>
          </div>
          <div className="text-[11px] text-emerald-400/90 mt-1">
            {eliteCount} A+ setups ({passingRatePct}% passing rate)
          </div>
        </div>

        {/* Average Planned R:R */}
        <div className="bg-zinc-900/90 border border-zinc-800 p-4 rounded-xl">
          <div className="flex items-center justify-between text-zinc-400 text-xs mb-1">
            <span className="flex items-center space-x-1 font-semibold">
              <Target className="w-3.5 h-3.5 text-cyan-400" />
              <span>Avg Risk : Reward</span>
            </span>
            <span className="text-[10px] text-zinc-500">Target 1 Hurdle</span>
          </div>
          <div className="flex items-baseline space-x-2 mt-2">
            <span className="text-2xl font-bold text-white tracking-tight">{avgRR === '—' ? '—' : `${avgRR} : 1`}</span>
            <span className="text-xs text-emerald-400 font-medium">Asymmetric</span>
          </div>
          <div className="text-[11px] text-zinc-400 mt-1">
            Strict 1.2x ATR stop with 1.618 Fib extension
          </div>
        </div>

        {/* 6-Angle Synthesized Engines */}
        <div className="bg-zinc-900/90 border border-zinc-800 p-4 rounded-xl">
          <div className="flex items-center justify-between text-zinc-400 text-xs mb-1">
            <span className="flex items-center space-x-1 font-semibold">
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
              <span>Cross-Indicator Breadth</span>
            </span>
            <span className="text-[10px] text-indigo-400">6 Engines Active</span>
          </div>
          <div className="flex items-baseline space-x-2 mt-2">
            <span className="text-2xl font-bold text-white tracking-tight">100%</span>
            <span className="text-xs text-zinc-400">Library Coverage</span>
          </div>
          <div className="text-[11px] text-zinc-400 mt-1 truncate">
            Trullàs + LuxAlgo + CBOE + Library + SW + Sector
          </div>
        </div>
      </div>

      {/* Search Bar & Instant Ticker Audit */}
      <div className="bg-zinc-900/60 p-4 rounded-xl border border-zinc-800 space-y-3">
        <div className="flex flex-col md:flex-row items-center gap-3">
          {/* Search Input */}
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && searchQuery.trim()) {
                  handleAuditCustomSymbol(searchQuery);
                }
              }}
              placeholder="Search ticker, company or type any symbol to run instant 360° Confluence Audit (e.g. NVDA, TSLA, AAPL)..."
              className="w-full bg-zinc-950/80 border border-zinc-800 rounded-lg pl-9 pr-24 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition"
            />
            {searchQuery && (
              <button
                onClick={() => handleAuditCustomSymbol(searchQuery)}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 px-2.5 py-1 text-[11px] font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded transition shadow-sm"
              >
                Audit (360°)
              </button>
            )}
          </div>

          {/* Quick-Pick Symbol Chips */}
          <div className="flex items-center space-x-1.5 overflow-x-auto w-full md:w-auto text-[11px] text-zinc-400">
            <span className="text-[10px] uppercase font-bold text-zinc-500 whitespace-nowrap">Audit Quick:</span>
            {['NVDA', 'SIVE.ST', 'ASML', 'TSM', 'AAPL', 'MSFT', 'TSLA', 'AMD'].map((sym) => (
              <button
                key={sym}
                onClick={() => handleAuditCustomSymbol(sym)}
                className="px-2 py-0.5 rounded bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700/60 transition font-mono text-[10px]"
              >
                {sym}
              </button>
            ))}
          </div>
        </div>

        {/* Filter Controls Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-zinc-800/80 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center space-x-1 text-zinc-400 font-medium mr-1">
              <SlidersHorizontal className="w-3 h-3 text-zinc-500" />
              <span className="text-[11px]">Grade Filter:</span>
            </div>
            {(['ALL', 'A+', 'A', 'B', 'C'] as const).map((g) => (
              <button
                key={g}
                onClick={() => setGradeFilter(g)}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition ${
                  gradeFilter === g
                    ? 'bg-zinc-200 text-zinc-950 shadow-sm'
                    : 'bg-zinc-800/80 text-zinc-400 hover:text-white hover:bg-zinc-800'
                }`}
              >
                {g === 'ALL' ? 'All Grades' : g === 'A+' ? 'Grade A+ (≥90%)' : g === 'A' ? 'Grade A (≥80%)' : `Grade ${g}`}
              </button>
            ))}
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-[11px] text-zinc-500 font-medium">Direction:</span>
            <button
              onClick={() => setDirectionFilter('ALL')}
              className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                directionFilter === 'ALL' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setDirectionFilter('BULLISH')}
              className={`px-2 py-0.5 rounded text-[11px] font-medium flex items-center space-x-1 ${
                directionFilter === 'BULLISH'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                  : 'text-zinc-400 hover:text-emerald-400'
              }`}
            >
              <TrendingUp className="w-3 h-3" />
              <span>Bullish</span>
            </button>
            <button
              onClick={() => setDirectionFilter('BEARISH')}
              className={`px-2 py-0.5 rounded text-[11px] font-medium flex items-center space-x-1 ${
                directionFilter === 'BEARISH'
                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                  : 'text-zinc-400 hover:text-rose-400'
              }`}
            >
              <TrendingDown className="w-3 h-3" />
              <span>Bearish</span>
            </button>
          </div>
        </div>
      </div>

      {errorMessage && (
        <div role="alert" className="bg-rose-950/60 border border-rose-500/40 text-rose-200 px-4 py-3 rounded-xl flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-rose-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Candidate Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-950/70 border-b border-zinc-800 text-zinc-400 uppercase font-mono text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-4">Rank / Asset</th>
                <th className="py-3 px-3 text-center">Setup Grade</th>
                <th className="py-3 px-3">6-Angle Confluence Breakdown</th>
                <th className="py-3 px-3">Confirmed Evidence Badges</th>
                <th className="py-3 px-3 text-right">Price / R:R</th>
                <th className="py-3 px-3 text-center">Action</th>
                <th className="py-3 px-4 text-right">360° Audit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 font-sans">
              {isAuditing && filteredCandidates.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-zinc-400 font-mono">
                    <RefreshCw className="w-5 h-5 animate-spin text-indigo-400 mx-auto mb-2" />
                    Fetching real OHLCV candles & computing 6-angle confluence scores...
                  </td>
                </tr>
              )}
              {!isAuditing && filteredCandidates.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-zinc-500 font-mono">
                    No matching live confluence setups found. Try adjusting filters or auditing a specific symbol above.
                  </td>
                </tr>
              )}
              {filteredCandidates.map((cand, idx) => {
                const isAplus = cand.overallGrade === 'A+';
                const isA = cand.overallGrade === 'A';
                const isB = cand.overallGrade === 'B';
                const isBull = cand.direction === 'BULLISH';

                return (
                  <tr
                    key={cand.symbol}
                    className="hover:bg-zinc-800/40 transition group cursor-pointer"
                    onClick={() => setSelectedCandidate(cand)}
                  >
                    {/* Rank & Symbol */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center space-x-3">
                        <span className="font-mono text-zinc-500 text-[11px] w-5 text-right font-bold">
                          #{idx + 1}
                        </span>
                        <div>
                          <div className="flex items-center space-x-1.5">
                            <span className="font-bold text-white text-sm font-mono tracking-tight">
                              {cand.symbol}
                            </span>
                            <span
                              className={`text-[9px] font-bold px-1.5 py-0.2 rounded uppercase ${
                                isBull
                                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                  : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                              }`}
                            >
                              {cand.direction}
                            </span>
                          </div>
                          <div className="text-[11px] text-zinc-300 font-medium truncate max-w-[180px]" title={cand.companyName}>
                            {cand.companyName}
                          </div>
                          <div className="text-[9px] text-zinc-500 font-mono truncate max-w-[180px]">
                            {cand.subIndustry || cand.sector}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Setup Grade & Score Badge */}
                    <td className="py-3.5 px-3 text-center">
                      <div className="inline-flex flex-col items-center">
                        <div
                          className={`w-12 h-12 rounded-lg flex flex-col items-center justify-center font-bold text-base shadow-md border ${
                            isAplus
                              ? 'bg-gradient-to-br from-emerald-500/20 to-teal-500/20 text-emerald-300 border-emerald-500/60 ring-2 ring-emerald-500/20'
                              : isA
                              ? 'bg-emerald-950/60 text-emerald-400 border-emerald-500/40'
                              : isB
                              ? 'bg-cyan-950/60 text-cyan-400 border-cyan-500/40'
                              : 'bg-amber-950/60 text-amber-400 border-amber-500/40'
                          }`}
                        >
                          <span className="leading-none">{cand.overallGrade}</span>
                          <span className="text-[9px] font-mono mt-0.5">{cand.overallScore}%</span>
                        </div>
                        <span className="text-[9px] uppercase font-semibold text-zinc-400 mt-1 tracking-tight">
                          {cand.confidenceTier}
                        </span>
                      </div>
                    </td>

                    {/* 6-Angle Breakdown Mini Progress Bars */}
                    <td className="py-3.5 px-3 min-w-[200px]">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-zinc-400">1. Trullàs 4-Pillars (25%)</span>
                          <span className="font-mono text-zinc-200">{cand.angles.trullasMacd.score}%</span>
                        </div>
                        <div className="w-full bg-zinc-800 rounded-full h-1 overflow-hidden">
                          <div
                            className="bg-emerald-400 h-1 rounded-full transition-all"
                            style={{ width: `${cand.angles.trullasMacd.score}%` }}
                          />
                        </div>

                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-zinc-400">2. LuxAlgo SMC & NWE (20%)</span>
                          <span className="font-mono text-zinc-200">{cand.angles.luxalgoSmc.score}%</span>
                        </div>
                        <div className="w-full bg-zinc-800 rounded-full h-1 overflow-hidden">
                          <div
                            className="bg-indigo-400 h-1 rounded-full transition-all"
                            style={{ width: `${cand.angles.luxalgoSmc.score}%` }}
                          />
                        </div>

                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-zinc-400">3. CBOE Options Flow (15%)</span>
                          <span className="font-mono text-zinc-200">{cand.angles.cboeOptions.score}%</span>
                        </div>
                        <div className="w-full bg-zinc-800 rounded-full h-1 overflow-hidden">
                          <div
                            className="bg-cyan-400 h-1 rounded-full transition-all"
                            style={{ width: `${cand.angles.cboeOptions.score}%` }}
                          />
                        </div>
                      </div>
                    </td>

                    {/* Confirmed Evidence Badges */}
                    <td className="py-3.5 px-3 max-w-[240px]">
                      <div className="flex flex-wrap gap-1">
                        {cand.confirmedEvidenceBadges.slice(0, 3).map((badge, bIdx) => (
                          <span
                            key={bIdx}
                            className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] bg-zinc-800/90 text-zinc-300 border border-zinc-700/60"
                          >
                            <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
                            <span className="truncate">{badge}</span>
                          </span>
                        ))}
                        {cand.confirmedEvidenceBadges.length > 3 && (
                          <span className="text-[10px] text-zinc-500 font-mono self-center">
                            +{cand.confirmedEvidenceBadges.length - 3} more
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Price & Risk/Reward */}
                    <td className="py-3.5 px-3 text-right font-mono">
                      <div className="font-bold text-white text-sm">
                        {getCurrencyPrefix(cand.currency, cand.symbol)}{cand.price.toFixed(2)}
                      </div>
                      <div className="text-[11px] text-emerald-400 font-semibold mt-0.5">
                        R:R {cand.executionPlan.riskRewardRatio} : 1
                      </div>
                      <div className="text-[10px] text-zinc-500">
                        Stop: ${cand.executionPlan.stopLoss.toFixed(2)}
                      </div>
                    </td>

                    {/* Recommended Capital Action */}
                    <td className="py-3.5 px-3 text-center">
                      <span
                        className={`inline-block px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${
                          cand.executionPlan.recommendedAction === 'FULL_TRANCHE_BUY'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : cand.executionPlan.recommendedAction === 'STARTER_BUY'
                            ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                            : cand.executionPlan.recommendedAction === 'CAUTION_WAIT'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                            : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                        }`}
                      >
                        {cand.executionPlan.recommendedAction.replace(/_/g, ' ')}
                      </span>
                      <div className="text-[9px] text-zinc-500 font-mono mt-1">
                        Size: {cand.executionPlan.suggestedAllocationPct}% NAV
                      </div>
                    </td>

                    {/* 360° Action buttons */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end space-x-1.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => setSelectedCandidate(cand)}
                          className="px-2.5 py-1 text-xs font-semibold bg-indigo-600/30 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/40 rounded transition flex items-center space-x-1"
                          title="Open 360° Confluence Autopsy & Multi-Angle Breakdown"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Audit</span>
                        </button>
                        <button
                          onClick={() => onSelectSymbolForChart(cand.symbol)}
                          className="p-1 text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded transition"
                          title="View on Technical Chart"
                        >
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 360° Deep-Dive Evidence & Confluence Autopsy Modal */}
      {selectedCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div
            className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl relative animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-zinc-800 bg-zinc-950/80">
              <div className="flex items-center space-x-3">
                <div
                  className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center font-bold text-lg border ${
                    selectedCandidate.overallGrade === 'A+'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/60 ring-2 ring-emerald-500/30'
                      : selectedCandidate.overallGrade === 'A'
                      ? 'bg-emerald-950/60 text-emerald-400 border-emerald-500/40'
                      : 'bg-indigo-950/60 text-indigo-400 border-indigo-500/40'
                  }`}
                >
                  <span>{selectedCandidate.overallGrade}</span>
                  <span className="text-[9px] font-mono">{selectedCandidate.overallScore}%</span>
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-xl font-bold text-white tracking-tight font-mono">
                      {selectedCandidate.symbol}
                    </h3>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                        selectedCandidate.direction === 'BULLISH'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                      }`}
                    >
                      {selectedCandidate.direction}
                    </span>
                    <span className="text-xs text-zinc-400 font-medium">
                      {selectedCandidate.confidenceTier}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    <span className="font-semibold text-white">{selectedCandidate.companyName}</span>
                    {selectedCandidate.subIndustry ? ` • ${selectedCandidate.subIndustry}` : ` • ${selectedCandidate.sector}`}
                    {selectedCandidate.exchange ? ` (${selectedCandidate.exchange})` : ''}
                    • Price: {getCurrencyPrefix(selectedCandidate.currency, selectedCandidate.symbol)}{selectedCandidate.price.toFixed(2)}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => {
                    onSelectSymbolForChart(selectedCandidate.symbol);
                    setSelectedCandidate(null);
                  }}
                  className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 rounded-lg transition"
                >
                  <BarChart3 className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Open Chart</span>
                </button>
                <button
                  onClick={() => setSelectedCandidate(null)}
                  className="p-1.5 text-zinc-400 hover:text-white bg-zinc-800/80 hover:bg-zinc-800 rounded-lg transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 text-xs">
              {/* Execution Envelope HUD */}
              <div className="bg-zinc-950/70 p-4 rounded-xl border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between text-zinc-400 text-xs">
                  <span className="font-semibold text-white flex items-center space-x-1.5">
                    <Target className="w-4 h-4 text-emerald-400" />
                    <span>Quant Execution Envelope & Planned Levels</span>
                  </span>
                  <span className="text-[11px] font-mono text-indigo-400">
                    Recommended Sizing: {selectedCandidate.executionPlan.suggestedAllocationPct}% Portfolio NAV
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-2">
                  <div className="bg-zinc-900/80 p-2.5 rounded-lg border border-zinc-800/80">
                    <span className="text-[10px] text-zinc-500 uppercase block font-semibold">Entry Trigger</span>
                    <span className="text-sm font-bold text-white font-mono">
                      ${selectedCandidate.executionPlan.entryTrigger.toFixed(2)}
                    </span>
                  </div>
                  <div className="bg-zinc-900/80 p-2.5 rounded-lg border border-rose-900/30">
                    <span className="text-[10px] text-rose-400 uppercase block font-semibold">Stop Loss (1.2x ATR)</span>
                    <span className="text-sm font-bold text-rose-300 font-mono">
                      ${selectedCandidate.executionPlan.stopLoss.toFixed(2)}
                    </span>
                  </div>
                  <div className="bg-zinc-900/80 p-2.5 rounded-lg border border-emerald-900/30">
                    <span className="text-[10px] text-emerald-400 uppercase block font-semibold">Target 1 (38.2%)</span>
                    <span className="text-sm font-bold text-emerald-300 font-mono">
                      ${selectedCandidate.executionPlan.target1.toFixed(2)}
                    </span>
                  </div>
                  <div className="bg-zinc-900/80 p-2.5 rounded-lg border border-teal-900/30">
                    <span className="text-[10px] text-teal-400 uppercase block font-semibold">Target 2 (61.8%)</span>
                    <span className="text-sm font-bold text-teal-300 font-mono">
                      ${selectedCandidate.executionPlan.target2.toFixed(2)}
                    </span>
                  </div>
                  <div className="bg-zinc-900/80 p-2.5 rounded-lg border border-indigo-900/30">
                    <span className="text-[10px] text-indigo-400 uppercase block font-semibold">Risk : Reward Ratio</span>
                    <span className="text-sm font-bold text-indigo-300 font-mono">
                      {selectedCandidate.executionPlan.riskRewardRatio} : 1
                    </span>
                  </div>
                </div>

                {/* Evidence Badges */}
                <div className="pt-2 flex flex-wrap gap-1.5">
                  {selectedCandidate.confirmedEvidenceBadges.map((badge, bIdx) => (
                    <span
                      key={bIdx}
                      className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-950/50 text-emerald-300 border border-emerald-500/40"
                    >
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      <span>{badge}</span>
                    </span>
                  ))}
                </div>
              </div>

              {/* 6 Angle Cards Grid */}
              <div className="space-y-3">
                <h4 className="text-sm font-bold text-white flex items-center space-x-2">
                  <Compass className="w-4 h-4 text-indigo-400" />
                  <span>The 6 Analytical Confluence Angles</span>
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Angle 1 */}
                  <AngleCard angle={selectedCandidate.angles.trullasMacd} color="emerald" />
                  {/* Angle 2 */}
                  <AngleCard angle={selectedCandidate.angles.luxalgoSmc} color="indigo" />
                  {/* Angle 3 */}
                  <AngleCard angle={selectedCandidate.angles.indicatorLibrary} color="cyan" />
                  {/* Angle 4 */}
                  <AngleCard angle={selectedCandidate.angles.cboeOptions} color="teal" />
                  {/* Angle 5 */}
                  <AngleCard angle={selectedCandidate.angles.signalWeighting} color="amber" />
                  {/* Angle 6 */}
                  <AngleCard angle={selectedCandidate.angles.sectorMacro} color="purple" />
                </div>
              </div>

              {/* Summary Rationale */}
              <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 space-y-2">
                <span className="font-semibold text-zinc-300 text-xs flex items-center space-x-1.5">
                  <Info className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Quantitative System Conviction Rationale</span>
                </span>
                <ul className="space-y-1 text-zinc-400 text-xs list-disc pl-4">
                  {selectedCandidate.executionPlan.reasons.map((r, rIdx) => (
                    <li key={rIdx}>{r}</li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-zinc-800 bg-zinc-950 flex items-center justify-between">
              <div className="text-[11px] text-zinc-500">
                Setup Grade calculated using deterministic multi-indicator weighting across active market data.
              </div>
              <button
                onClick={() => setSelectedCandidate(null)}
                className="px-4 py-2 text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg transition"
              >
                Close Audit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface AngleCardProps {
  angle: AngleEvaluation;
  color: 'emerald' | 'indigo' | 'cyan' | 'teal' | 'amber' | 'purple';
}

const AngleCard: React.FC<AngleCardProps> = ({ angle, color }) => {
  const isGood = angle.score >= 70;

  return (
    <div className="bg-zinc-950/80 p-4 rounded-xl border border-zinc-800/90 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center space-x-2">
            <span className="font-bold text-white text-xs">{angle.name}</span>
            <span className="text-[10px] text-zinc-500 font-mono">({angle.weightPct}% Weight)</span>
          </div>
          <span className="text-[11px] text-zinc-400 mt-0.5 block truncate max-w-[260px]">
            {angle.headline}
          </span>
        </div>

        <div className="text-right">
          <span
            className={`text-sm font-bold font-mono ${
              isGood ? 'text-emerald-400' : 'text-zinc-300'
            }`}
          >
            {angle.score}%
          </span>
          <span
            className={`block text-[9px] font-bold uppercase ${
              angle.verdict === 'BULLISH'
                ? 'text-emerald-400'
                : angle.verdict === 'BEARISH'
                ? 'text-rose-400'
                : 'text-zinc-500'
            }`}
          >
            {angle.verdict}
          </span>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 gap-2 bg-zinc-900/60 p-2 rounded-lg border border-zinc-800/60 text-[10px] font-mono">
        {Object.entries(angle.metrics).map(([k, v]) => (
          <div key={k} className="flex justify-between">
            <span className="text-zinc-500 truncate mr-1">{k}:</span>
            <span className="text-zinc-200 font-semibold truncate">{v}</span>
          </div>
        ))}
      </div>

      {/* Evidence Points */}
      <div className="space-y-1">
        {angle.evidencePoints.slice(0, 3).map((pt, pIdx) => (
          <div key={pIdx} className="flex items-start space-x-1.5 text-[11px] text-zinc-300">
            <div className="w-1 h-1 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
            <span className="leading-snug">{pt}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
