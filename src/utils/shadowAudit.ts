import {
  Candle,
  calculateIndicators,
  findSwingPoints,
  detectDivergences,
  DivergenceSetup,
} from './trullasStrategy';
import {
  Bar,
  POLICIES,
  ExitPolicy,
  simulateExit,
  summarize,
  clusterStats,
} from './trullasOutcomeEngine';

export interface ShadowSignalEval {
  symbol: string;
  signalDate: string;
  confirmedIdx: number;
  type: DivergenceSetup['type'];
  direction: 'long' | 'short';
  qualityScore: number;
  rNet: number;
  exitReason: string;
  barsHeld: number;
}

export interface PolicySummaryMetrics {
  policyName: string;
  n: number;
  nEff: number;
  wins: number;
  winRatePct: number;
  meanR: number;
  ci90: [number, number];
  profitFactor: number | null;
  totalR: number;
  baselineMeanR: number;
  baselineN: number;
  alphaOverBaselineR: number;
}

export interface ShadowAuditReport {
  policyName: string;
  roundTripBps: number;
  symbolsAnalyzed: string[];
  totalBarsScanned: number;
  metrics: PolicySummaryMetrics;
  recentSignals: ShadowSignalEval[];
  caveat: string;
}

function toEngineBars(candles: Candle[]): Bar[] {
  // Compute 30-bar SMA for structure policy (X3) strictly using causal trailing window
  const bars: Bar[] = [];
  let rollingSum = 0;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    rollingSum += c.close;
    if (i >= 30) {
      rollingSum -= candles[i - 30].close;
    }
    const ma30 = i >= 29 ? rollingSum / 30 : undefined;
    bars.push({
      o: c.open,
      h: c.high,
      l: c.low,
      c: c.close,
      ma30,
    });
  }
  return bars;
}

/**
 * Computes ATR(14) up to index `idx` strictly without future lookahead.
 */
function causalAtr14(candles: Candle[], idx: number): number {
  const start = Math.max(1, idx - 13);
  let trSum = 0;
  let count = 0;
  for (let i = start; i <= idx; i++) {
    const cur = candles[i];
    const prev = candles[i - 1];
    const tr = Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prev.close),
      Math.abs(cur.low - prev.close)
    );
    trSum += tr;
    count++;
  }
  if (count === 0) return Math.max(0.01, candles[idx].close * 0.02);
  return Math.max(0.01, trSum / count);
}

/**
 * Evaluates all closed divergence signals on historical OHLCV candles for a symbol
 * strictly anti-lookahead: confirmation only occurs `lookback` bars AFTER the final pivot.
 * Compares net expectancy (after roundTripBps) against a deterministic fixed-spacing baseline.
 */
export function evaluateSymbolShadowAudit(
  symbol: string,
  candles: Candle[],
  policy: ExitPolicy = POLICIES.X1_fixed_v1,
  lookback: number = 3
): { signals: ShadowSignalEval[]; baselineR: number[]; baselineDays: string[] } {
  if (!candles || candles.length < 40) {
    return { signals: [], baselineR: [], baselineDays: [] };
  }

  const indicatorPoints = calculateIndicators(candles);
  const setups = detectDivergences(symbol, '1d', indicatorPoints, lookback);
  const engineBars = toEngineBars(candles);

  // Deduplicate by confirmed bar index so overlapping double/triple counts don't inflate N
  const seenConfirmedIdx = new Set<number>();
  const signals: ShadowSignalEval[] = [];

  for (const setup of setups) {
    const lastPivot = setup.points[setup.points.length - 1];
    if (!lastPivot) continue;
    const confirmedIdx = lastPivot.index + lookback;
    // Must leave at least 2 future bars after confirmation (next_open enters at confirmedIdx + 1)
    if (confirmedIdx + 2 >= candles.length) continue;
    if (seenConfirmedIdx.has(confirmedIdx)) continue;
    seenConfirmedIdx.add(confirmedIdx);

    const direction: 'long' | 'short' = setup.type.includes('BEAR') ? 'short' : 'long';
    const atr = causalAtr14(candles, confirmedIdx);
    const futureBars = engineBars.slice(confirmedIdx + 1);
    const entryOpen = futureBars[0].o;

    // Ensure stop sits on valid side of entry with structural anchor from confirmed window
    const structWindow = candles.slice(Math.max(0, confirmedIdx - 9), confirmedIdx + 1);
    const stopPrice =
      direction === 'long'
        ? Math.min(...structWindow.map((b) => b.low), entryOpen - 1.5 * atr)
        : Math.max(...structWindow.map((b) => b.high), entryOpen + 1.5 * atr);

    const riskPerUnit = Math.abs(entryOpen - stopPrice);
    if (riskPerUnit <= 0 || riskPerUnit > 3 * atr) continue;

    const tp1Price = direction === 'long' ? entryOpen + 2 * riskPerUnit : entryOpen - 2 * riskPerUnit;

    const outcome = simulateExit(
      {
        id: setup.id,
        symbol,
        direction,
        timeframe: '1d',
        entry: entryOpen,
        stop: stopPrice,
        atr,
        tp1Price,
        invalidation:
          direction === 'long'
            ? stopPrice - 0.5 * atr
            : stopPrice + 0.5 * atr,
      },
      futureBars,
      policy
    );

    if (outcome.status === 'closed' && typeof outcome.rNet === 'number' && Number.isFinite(outcome.rNet)) {
      signals.push({
        symbol,
        signalDate: candles[confirmedIdx].dateStr,
        confirmedIdx,
        type: setup.type,
        direction,
        qualityScore: setup.qualityScore,
        rNet: outcome.rNet,
        exitReason: outcome.exitReason || 'closed',
        barsHeld: outcome.barsHeld || 1,
      });
    }
  }

  // Deterministic fixed-cadence long baseline every 15 bars over same historical span
  const baselineR: number[] = [];
  const baselineDays: string[] = [];
  const basePol: ExitPolicy = { ...policy, maxRiskAtr: 3 };
  for (let idx = 30; idx + 16 < candles.length; idx += 15) {
    const atr = causalAtr14(candles, idx);
    const futureBars = engineBars.slice(idx + 1);
    const entryOpen = futureBars[0].o;
    const stop = entryOpen - 1.5 * atr;
    const tp1 = entryOpen + 3.0 * atr;
    const out = simulateExit(
      {
        symbol,
        direction: 'long',
        timeframe: '1d',
        entry: entryOpen,
        stop,
        atr,
        tp1Price: tp1,
      },
      futureBars,
      basePol
    );
    if (out.status === 'closed' && typeof out.rNet === 'number' && Number.isFinite(out.rNet)) {
      baselineR.push(out.rNet);
      baselineDays.push(candles[idx].dateStr);
    }
  }

  // Ensure swings finder usage keeps tree clean even if detectDivergences changes
  void findSwingPoints;

  return { signals, baselineR, baselineDays };
}

export function buildShadowAuditReport(
  symbolCandlesMap: Record<string, Candle[]>,
  policyKey: string = 'X1_fixed_v1'
): ShadowAuditReport {
  const policy = POLICIES[policyKey] || POLICIES.X1_fixed_v1;
  const allSignals: ShadowSignalEval[] = [];
  const allBaselineR: number[] = [];
  const symbolsAnalyzed: string[] = [];
  let totalBarsScanned = 0;

  for (const [symbol, candles] of Object.entries(symbolCandlesMap)) {
    if (!candles || candles.length === 0) continue;
    symbolsAnalyzed.push(symbol);
    totalBarsScanned += candles.length;
    const res = evaluateSymbolShadowAudit(symbol, candles, policy);
    allSignals.push(...res.signals);
    allBaselineR.push(...res.baselineR);
  }

  const rs = allSignals.map((s) => s.rNet);
  const days = allSignals.map((s) => s.signalDate);
  const stats = summarize(rs);
  const cluster = clusterStats(rs, days);
  const baseStats = summarize(allBaselineR);

  const meanR = Number.isFinite(stats.mean) ? stats.mean : 0;
  const baselineMeanR = Number.isFinite(baseStats.mean) ? baseStats.mean : 0;
  const roundedMeanR = Number(meanR.toFixed(3));
  const roundedBaselineMeanR = Number(baselineMeanR.toFixed(3));
  const ciLo = Number.isFinite(cluster.lo) ? cluster.lo : meanR;
  const ciHi = Number.isFinite(cluster.hi) ? cluster.hi : meanR;

  const recentSignals = [...allSignals]
    .sort((a, b) => b.signalDate.localeCompare(a.signalDate))
    .slice(0, 12);

  return {
    policyName: policy.name,
    roundTripBps: policy.cost.roundTripBps,
    symbolsAnalyzed,
    totalBarsScanned,
    metrics: {
      policyName: policy.name,
      n: stats.n,
      nEff: cluster.nEff,
      wins: stats.wins,
      winRatePct: Number.isFinite(stats.winRate) ? Number((stats.winRate * 100).toFixed(1)) : 0,
      meanR: roundedMeanR,
      ci90: [Number(ciLo.toFixed(3)), Number(ciHi.toFixed(3))],
      profitFactor: stats.pf !== null ? Number(stats.pf.toFixed(2)) : null,
      totalR: Number(stats.sum.toFixed(2)),
      baselineMeanR: roundedBaselineMeanR,
      baselineN: baseStats.n,
      alphaOverBaselineR: Number((roundedMeanR - roundedBaselineMeanR).toFixed(3)),
    },
    recentSignals,
    caveat:
      'Audit runs on current S&P 500 constituents (survivorship bias present for multi-year spans), net of 10 bps round-trip cost, strictly anti-lookahead (pivot + 3 bars confirmation). Analytical output only — not investment advice.',
  };
}
