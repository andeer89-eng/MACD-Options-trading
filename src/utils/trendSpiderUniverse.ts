import { CandleData, calculateStageAnalysis, StageAnalysisResult } from './trendSpiderEngine';
import { SP500_UNIVERSE } from '../data/sp500Universe';
import { lookupGlobalCompany } from '../data/globalTickers';

export interface UniverseStageItem {
  symbol: string;
  name: string;
  sector: string;
  subIndustry?: string;
  currentPrice: number;
  stage: StageAnalysisResult;
}

/**
 * Computes Stan Weinstein 4-Stage Analysis strictly from real fetched weekly candles
 * and real benchmark (SPY) weekly candles. Zero pseudoRandom or synthetic bars.
 */
export function computeStageSummaryFromCandles(
  symbol: string,
  candles: CandleData[],
  benchmarkCandles?: CandleData[]
): UniverseStageItem | null {
  if (!candles || candles.length < 30) {
    return null;
  }

  const sym = symbol.toUpperCase().trim();
  const stage = calculateStageAnalysis(candles, benchmarkCandles);
  const currentPrice = candles[candles.length - 1].close;

  const sp500 = SP500_UNIVERSE.find((c) => c.symbol.toUpperCase() === sym);
  const global = lookupGlobalCompany(sym);

  const name = sp500?.name || global?.name || sym;
  const sector = sp500?.sector || global?.sector || 'Equities';
  const subIndustry = sp500?.subIndustry || global?.subIndustry;

  return {
    symbol: sym,
    name,
    sector,
    subIndustry,
    currentPrice,
    stage,
  };
}

// ============================================================================
// STAN WEINSTEIN 4-STAGE STRATEGY BACKTESTER (REAL CANDLES)
// ============================================================================

export interface StageBacktestTrade {
  id: string;
  symbol: string;
  entryDate: string;
  exitDate: string;
  entryPrice: number;
  exitPrice: number;
  entryStage: string;
  exitReason: 'TRAILING_STOP_SMA30' | 'STAGE_3_DISTRIBUTION' | 'STAGE_4_CAPITULATION' | 'TARGET_HIT';
  pnlDollar: number;
  pnlPercent: number;
  holdingWeeks: number;
  isWin: boolean;
}

export interface StageBacktestResult {
  startingCapital: number;
  finalCapital: number;
  totalNetProfitDollar: number;
  totalReturnPercent: number;
  cagrPercent: number;
  benchmarkReturnPercent: number;
  alphaOverBenchmarkPercent: number;
  stage4CapitalPreservedDollar: number;
  winRate: number;
  profitFactor: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  maxDrawdownPercent: number;
  benchmarkMaxDrawdownPercent: number;
  sharpeRatio: number;
  equityCurve: { date: string; strategyEquity: number; benchmarkEquity: number }[];
  trades: StageBacktestTrade[];
}

/**
 * Runs a deterministic Stan Weinstein 4-Stage Backtest on REAL historical weekly candles.
 */
export function runStanWeinsteinBacktestFromCandles(
  symbol: string,
  candles: CandleData[],
  startingCapital: number = 10000,
  benchmarkCandles?: CandleData[]
): StageBacktestResult {
  const n = candles ? candles.length : 0;
  const maPeriod = 30;

  if (n <= maPeriod + 5) {
    return {
      startingCapital,
      finalCapital: startingCapital,
      totalNetProfitDollar: 0,
      totalReturnPercent: 0,
      cagrPercent: 0,
      benchmarkReturnPercent: 0,
      alphaOverBenchmarkPercent: 0,
      stage4CapitalPreservedDollar: 0,
      winRate: 0,
      profitFactor: 0,
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      maxDrawdownPercent: 0,
      benchmarkMaxDrawdownPercent: 0,
      sharpeRatio: 0,
      equityCurve: [],
      trades: [],
    };
  }

  const sma30: (number | null)[] = [];
  for (let i = 0; i < n; i++) {
    if (i < maPeriod - 1) {
      sma30.push(null);
    } else {
      const slice = candles.slice(i - maPeriod + 1, i + 1);
      const sum = slice.reduce((acc, c) => acc + c.close, 0);
      sma30.push(sum / maPeriod);
    }
  }

  // Align benchmark (SPY if provided, otherwise underlying buy-and-hold)
  const useExternalBench = benchmarkCandles && benchmarkCandles.length >= n;
  const benchSeries = useExternalBench ? benchmarkCandles.slice(-n) : candles;

  const trades: StageBacktestTrade[] = [];
  const equityCurve: { date: string; strategyEquity: number; benchmarkEquity: number }[] = [];

  let inPosition = false;
  let entryPrice = 0;
  let entryIndex = 0;
  let currentCapital = startingCapital;
  let peakCapital = startingCapital;
  let maxDrawdown = 0;

  let benchmarkCapital = startingCapital;
  const firstBenchPrice = Math.max(0.01, benchSeries[maPeriod].close);
  let benchmarkPeak = startingCapital;
  let benchmarkMaxDrawdown = 0;
  let stage4CapitalSaved = 0;

  for (let i = maPeriod; i < n; i++) {
    const c = candles[i];
    const prevC = candles[i - 1];
    const bClose = benchSeries[i]?.close ?? c.close;
    const currentMa = sma30[i]!;
    const prevMa = sma30[i - 1]!;
    const maSlope = ((currentMa - prevMa) / prevMa) * 100;

    benchmarkCapital = startingCapital * (bClose / firstBenchPrice);
    if (benchmarkCapital > benchmarkPeak) benchmarkPeak = benchmarkCapital;
    const bDd = benchmarkPeak > 0 ? ((benchmarkPeak - benchmarkCapital) / benchmarkPeak) * 100 : 0;
    if (bDd > benchmarkMaxDrawdown) benchmarkMaxDrawdown = bDd;

    const stage2Breakout =
      !inPosition &&
      c.close >= currentMa &&
      (maSlope > 0.05 || i === maPeriod || prevC.close <= prevMa * 1.03);

    if (stage2Breakout) {
      inPosition = true;
      entryPrice = c.close;
      entryIndex = i;
    } else if (inPosition) {
      const hitTrailingSma = c.close < currentMa * 0.985;
      const stage4Capitulation = maSlope < -0.4 && c.close < currentMa;
      const endOfData = i === n - 1;

      if (hitTrailingSma || stage4Capitulation || endOfData) {
        const exitPrice = c.close;
        const pnlPct = ((exitPrice - entryPrice) / entryPrice) * 100;
        const allocated = currentCapital * 0.95;
        const pnlDollar = allocated * (pnlPct / 100);
        currentCapital += pnlDollar;

        trades.push({
          id: `trade-${trades.length + 1}`,
          symbol,
          entryDate: String(candles[entryIndex].time),
          exitDate: String(c.time),
          entryPrice: Number(entryPrice.toFixed(2)),
          exitPrice: Number(exitPrice.toFixed(2)),
          entryStage: 'Stage 2 Markup',
          exitReason: stage4Capitulation
            ? 'STAGE_4_CAPITULATION'
            : hitTrailingSma
            ? 'TRAILING_STOP_SMA30'
            : 'TARGET_HIT',
          pnlDollar: Number(pnlDollar.toFixed(2)),
          pnlPercent: Number(pnlPct.toFixed(2)),
          holdingWeeks: Math.max(1, i - entryIndex),
          isWin: pnlDollar > 0,
        });

        inPosition = false;
      }
    } else {
      if (c.close < currentMa && maSlope < -0.3) {
        const weeklyLossAvoided = Math.max(0, prevC.close - c.close);
        stage4CapitalSaved += (currentCapital / c.close) * weeklyLossAvoided * 0.4;
      }
    }

    let displayEquity = currentCapital;
    if (inPosition) {
      const openPnlPct = ((c.close - entryPrice) / entryPrice) * 100;
      displayEquity = currentCapital + currentCapital * 0.95 * (openPnlPct / 100);
    }

    if (displayEquity > peakCapital) peakCapital = displayEquity;
    const dd = peakCapital > 0 ? ((peakCapital - displayEquity) / peakCapital) * 100 : 0;
    if (dd > maxDrawdown) maxDrawdown = dd;

    equityCurve.push({
      date: String(c.time),
      strategyEquity: Number(displayEquity.toFixed(2)),
      benchmarkEquity: Number(benchmarkCapital.toFixed(2)),
    });
  }

  const totalTrades = trades.length;
  const winningTrades = trades.filter((t) => t.isWin).length;
  const losingTrades = totalTrades - winningTrades;
  const winRate = totalTrades > 0 ? Number(((winningTrades / totalTrades) * 100).toFixed(1)) : 0;

  const grossProfit = trades.filter((t) => t.isWin).reduce((sum, t) => sum + t.pnlDollar, 0);
  const grossLoss = Math.abs(trades.filter((t) => !t.isWin).reduce((sum, t) => sum + t.pnlDollar, 0));
  const profitFactor = grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(2)) : grossProfit > 0 ? 99.0 : 0;

  const totalNetProfit = currentCapital - startingCapital;
  const totalReturnPercent = Number(((totalNetProfit / startingCapital) * 100).toFixed(2));
  const benchmarkReturnPercent = Number((((benchmarkCapital - startingCapital) / startingCapital) * 100).toFixed(2));
  const alphaOverBenchmark = Number((totalReturnPercent - benchmarkReturnPercent).toFixed(2));

  const years = Math.max(0.5, (n - maPeriod) / 52);
  const cagr = Number(((Math.pow(Math.max(0.01, currentCapital / startingCapital), 1 / years) - 1) * 100).toFixed(2));

  return {
    startingCapital,
    finalCapital: Number(currentCapital.toFixed(2)),
    totalNetProfitDollar: Number(totalNetProfit.toFixed(2)),
    totalReturnPercent,
    cagrPercent: cagr,
    benchmarkReturnPercent,
    alphaOverBenchmarkPercent: alphaOverBenchmark,
    stage4CapitalPreservedDollar: Number(stage4CapitalSaved.toFixed(2)),
    winRate,
    profitFactor,
    totalTrades,
    winningTrades,
    losingTrades,
    maxDrawdownPercent: Number(maxDrawdown.toFixed(2)),
    benchmarkMaxDrawdownPercent: Number(benchmarkMaxDrawdown.toFixed(2)),
    sharpeRatio: maxDrawdown > 0 ? Number((cagr / maxDrawdown).toFixed(2)) : 0,
    equityCurve,
    trades,
  };
}
