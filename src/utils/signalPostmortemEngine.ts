/**
 * Signal Postmortem & OLS Residual Edge Attribution Engine
 * Inspired by signal-postmortem & residual-edge-analyzer:
 *  - Evaluates +5D and +20D realized returns net of round-trip transaction costs
 *  - Classifies resolved signals: TRUE_POSITIVE | FALSE_POSITIVE | REGIME_MISMATCH | PENDING
 *  - Runs Ordinary Least Squares (OLS) regression (strategyReturn = alpha + beta * spyReturn)
 *    to separate genuine idiosyncratic alpha from broad SPY beta exposure
 */

import {
  Candle,
  calculateIndicators,
  detectDivergences,
  DivergenceSetup,
} from './trullasStrategy.ts';

export type PostmortemClassification =
  | 'TRUE_POSITIVE'
  | 'FALSE_POSITIVE'
  | 'REGIME_MISMATCH'
  | 'PENDING';

export interface SignalPostmortemRow {
  symbol: string;
  signalDate: string;
  setupType: DivergenceSetup['type'];
  direction: 'long' | 'short';
  qualityScore: number;
  entryPrice: number;
  ret5dPct: number | null;
  ret20dPct: number | null;
  spyRet20dPct: number | null;
  spyAboveSma50: boolean | null;
  classification: PostmortemClassification;
}

export interface ResidualEdgeOlsResult {
  sampleSize: number;
  meanStrategyReturnPct: number;
  meanBenchmarkReturnPct: number;
  alphaPerPeriodPct: number; // Regression intercept (idiosyncratic edge)
  annualizedAlphaPct: number; // alphaPerPeriodPct * periodsPerYear
  beta: number; // Market beta exposure
  alphaTStat: number;
  rSquared: number;
  verdict: 'GENUINE_ALPHA' | 'BETA_DRIVEN' | 'NO_EDGE' | 'INSUFFICIENT_DATA';
}

export interface SignalPostmortemReport {
  roundTripCostBps: number;
  totalSignals: number;
  resolvedCount: number;
  truePositives: number;
  falsePositives: number;
  regimeMismatches: number;
  pendingCount: number;
  precisionPct: number;
  avg5dReturnPct: number;
  avg20dReturnPct: number;
  bySetup: Array<{
    setupType: string;
    total: number;
    truePositives: number;
    precisionPct: number;
    avg20dPct: number;
  }>;
  residualEdge: ResidualEdgeOlsResult;
  recentPostmortems: SignalPostmortemRow[];
}

export function computeResidualEdgeOls(
  strategyReturnsPct: number[],
  benchmarkReturnsPct: number[],
  periodsPerYear: number = 12
): ResidualEdgeOlsResult {
  const pairs: Array<[number, number]> = [];
  const len = Math.min(strategyReturnsPct.length, benchmarkReturnsPct.length);
  for (let i = 0; i < len; i++) {
    const y = strategyReturnsPct[i];
    const x = benchmarkReturnsPct[i];
    if (Number.isFinite(y) && Number.isFinite(x)) {
      pairs.push([x, y]);
    }
  }

  const n = pairs.length;
  if (n < 3) {
    const meanY = n > 0 ? pairs.reduce((s, [, y]) => s + y, 0) / n : 0;
    const meanX = n > 0 ? pairs.reduce((s, [x]) => s + x, 0) / n : 0;
    return {
      sampleSize: n,
      meanStrategyReturnPct: Number(meanY.toFixed(2)),
      meanBenchmarkReturnPct: Number(meanX.toFixed(2)),
      alphaPerPeriodPct: 0,
      annualizedAlphaPct: 0,
      beta: 0,
      alphaTStat: 0,
      rSquared: 0,
      verdict: 'INSUFFICIENT_DATA',
    };
  }

  const meanX = pairs.reduce((s, [x]) => s + x, 0) / n;
  const meanY = pairs.reduce((s, [, y]) => s + y, 0) / n;

  let covXY = 0;
  let varX = 0;
  let varY = 0;
  for (const [x, y] of pairs) {
    const dx = x - meanX;
    const dy = y - meanY;
    covXY += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }

  const beta = varX > 1e-10 ? covXY / varX : 0;
  const alpha = meanY - beta * meanX;

  let sse = 0;
  for (const [x, y] of pairs) {
    const resid = y - (alpha + beta * x);
    sse += resid * resid;
  }

  const df = Math.max(1, n - 2);
  const residualVar = sse / df;
  const seAlpha =
    varX > 1e-10
      ? Math.sqrt(residualVar * (1 / n + (meanX * meanX) / varX))
      : Math.sqrt(residualVar / n);
  const alphaTStat = seAlpha > 1e-9 ? alpha / seAlpha : 0;
  const rSquared = varY > 1e-10 ? Math.max(0, Math.min(1, 1 - sse / varY)) : 0;
  const annualizedAlphaPct = alpha * periodsPerYear;

  let verdict: ResidualEdgeOlsResult['verdict'] = 'NO_EDGE';
  if (alpha > 0.25 && alphaTStat >= 1.5) {
    verdict = 'GENUINE_ALPHA';
  } else if (meanY > 0 && alpha <= 0.25 && beta >= 0.65 && rSquared >= 0.3) {
    verdict = 'BETA_DRIVEN';
  }

  return {
    sampleSize: n,
    meanStrategyReturnPct: Number(meanY.toFixed(2)),
    meanBenchmarkReturnPct: Number(meanX.toFixed(2)),
    alphaPerPeriodPct: Number(alpha.toFixed(2)),
    annualizedAlphaPct: Number(annualizedAlphaPct.toFixed(1)),
    beta: Number(beta.toFixed(2)),
    alphaTStat: Number(alphaTStat.toFixed(2)),
    rSquared: Number(rSquared.toFixed(2)),
    verdict,
  };
}

function buildSpyDateLookup(spyCandles: Candle[]) {
  const map = new Map<string, { idx: number; close: number; aboveSma50: boolean | null }>();
  for (let i = 0; i < spyCandles.length; i++) {
    let aboveSma50: boolean | null = null;
    if (i >= 49) {
      let sum = 0;
      for (let k = i - 49; k <= i; k++) sum += spyCandles[k].close;
      const sma50 = sum / 50;
      aboveSma50 = spyCandles[i].close >= sma50;
    }
    map.set(spyCandles[i].dateStr, { idx: i, close: spyCandles[i].close, aboveSma50 });
  }
  return map;
}

export function buildSignalPostmortemReport(
  symbolCandlesMap: Record<string, Candle[]>,
  options?: { roundTripCostBps?: number; lookback?: number }
): SignalPostmortemReport {
  const roundTripCostBps = options?.roundTripCostBps ?? 10;
  const costPct = roundTripCostBps / 100; // 10 bps = 0.10%
  const lookback = options?.lookback ?? 3;

  const spyCandles = symbolCandlesMap['SPY'] || [];
  const spyLookup = buildSpyDateLookup(spyCandles);

  const rows: SignalPostmortemRow[] = [];
  const stratRetPairs: number[] = [];
  const spyRetPairs: number[] = [];

  for (const [symbol, candles] of Object.entries(symbolCandlesMap)) {
    if (!candles || candles.length < 40) continue;
    const pts = calculateIndicators(candles);
    const setups = detectDivergences(symbol, '1d', pts, lookback);
    const seenIdx = new Set<number>();

    for (const setup of setups) {
      const lastPivot = setup.points[setup.points.length - 1];
      if (!lastPivot) continue;
      const confirmedIdx = lastPivot.index + lookback;
      const entryIdx = confirmedIdx + 1;
      if (entryIdx >= candles.length) continue;
      if (seenIdx.has(confirmedIdx)) continue;
      seenIdx.add(confirmedIdx);

      const direction: 'long' | 'short' = setup.type.includes('BEAR') ? 'short' : 'long';
      const sign = direction === 'long' ? 1 : -1;
      const entryPrice = candles[entryIdx].open > 0 ? candles[entryIdx].open : candles[entryIdx].close;
      if (entryPrice <= 0) continue;

      const idx5 = entryIdx + 5;
      const idx20 = entryIdx + 20;

      const ret5dPct =
        idx5 < candles.length
          ? Number(
              (sign * (((candles[idx5].close - entryPrice) / entryPrice) * 100) - costPct).toFixed(2)
            )
          : null;

      const ret20dPct =
        idx20 < candles.length
          ? Number(
              (sign * (((candles[idx20].close - entryPrice) / entryPrice) * 100) - costPct).toFixed(2)
            )
          : null;

      const signalDate = candles[confirmedIdx].dateStr;
      const entryDate = candles[entryIdx].dateStr;
      const spyAtEntry = spyLookup.get(entryDate) || spyLookup.get(signalDate);
      let spyRet20dPct: number | null = null;
      let spyAboveSma50: boolean | null = null;

      if (spyAtEntry) {
        spyAboveSma50 = spyAtEntry.aboveSma50;
        const spyExit = spyCandles[spyAtEntry.idx + 20];
        if (spyExit && spyCandles[spyAtEntry.idx].open > 0) {
          const spyRawRet =
            ((spyExit.close - spyCandles[spyAtEntry.idx].open) / spyCandles[spyAtEntry.idx].open) *
            100;
          spyRet20dPct = Number(spyRawRet.toFixed(2));
        }
      }

      let classification: PostmortemClassification = 'PENDING';
      if (ret20dPct !== null) {
        if (ret20dPct > 0) {
          classification = 'TRUE_POSITIVE';
        } else {
          const againstTrend =
            spyAboveSma50 !== null &&
            ((direction === 'long' && !spyAboveSma50) || (direction === 'short' && spyAboveSma50));
          classification = againstTrend ? 'REGIME_MISMATCH' : 'FALSE_POSITIVE';
        }
        if (spyRet20dPct !== null) {
          stratRetPairs.push(ret20dPct);
          // For OLS alpha attribution of directional selection vs SPY market direction:
          // regress directional trade return against directional SPY return (or long-only SPY).
          // Using long SPY return captures net market beta neutrality.
          spyRetPairs.push(spyRet20dPct);
        }
      }

      rows.push({
        symbol,
        signalDate,
        setupType: setup.type,
        direction,
        qualityScore: setup.qualityScore,
        entryPrice: Number(entryPrice.toFixed(2)),
        ret5dPct,
        ret20dPct,
        spyRet20dPct,
        spyAboveSma50,
        classification,
      });
    }
  }

  const resolved = rows.filter((r) => r.classification !== 'PENDING');
  const truePositives = resolved.filter((r) => r.classification === 'TRUE_POSITIVE').length;
  const falsePositives = resolved.filter((r) => r.classification === 'FALSE_POSITIVE').length;
  const regimeMismatches = resolved.filter((r) => r.classification === 'REGIME_MISMATCH').length;
  const pendingCount = rows.length - resolved.length;

  const r5Vals = rows.map((r) => r.ret5dPct).filter((v): v is number => v !== null);
  const r20Vals = rows.map((r) => r.ret20dPct).filter((v): v is number => v !== null);
  const avg5dReturnPct = r5Vals.length
    ? Number((r5Vals.reduce((a, b) => a + b, 0) / r5Vals.length).toFixed(2))
    : 0;
  const avg20dReturnPct = r20Vals.length
    ? Number((r20Vals.reduce((a, b) => a + b, 0) / r20Vals.length).toFixed(2))
    : 0;

  const setupMap = new Map<string, SignalPostmortemRow[]>();
  for (const r of resolved) {
    const arr = setupMap.get(r.setupType) || [];
    arr.push(r);
    setupMap.set(r.setupType, arr);
  }
  const bySetup = Array.from(setupMap.entries())
    .map(([setupType, list]) => {
      const tp = list.filter((i) => i.classification === 'TRUE_POSITIVE').length;
      const avg20 = list.reduce((s, i) => s + (i.ret20dPct ?? 0), 0) / Math.max(1, list.length);
      return {
        setupType,
        total: list.length,
        truePositives: tp,
        precisionPct: Number(((tp / Math.max(1, list.length)) * 100).toFixed(1)),
        avg20dPct: Number(avg20.toFixed(2)),
      };
    })
    .sort((a, b) => b.total - a.total);

  const residualEdge = computeResidualEdgeOls(stratRetPairs, spyRetPairs, 12);

  return {
    roundTripCostBps,
    totalSignals: rows.length,
    resolvedCount: resolved.length,
    truePositives,
    falsePositives,
    regimeMismatches,
    pendingCount,
    precisionPct:
      resolved.length > 0 ? Number(((truePositives / resolved.length) * 100).toFixed(1)) : 0,
    avg5dReturnPct,
    avg20dReturnPct,
    bySetup,
    residualEdge,
    recentPostmortems: [...rows]
      .sort((a, b) => b.signalDate.localeCompare(a.signalDate))
      .slice(0, 12),
  };
}
