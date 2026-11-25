/**
 * Trullàs Backtester Engine
 * Simulates David Trullàs 4-Pillars Triple Divergence Strategy across historical candlestick data.
 * Integrates with @luxalgo/journal-core for institutional-grade round-trip matching,
 * metrics calculation, equity curves, drawdown analytics, and the LuxAlgo Edge Score.
 */

import {
  calculateIndicators,
  detectDivergences,
  Candle,
  DivergenceSetup,
  IndicatorPoint,
} from './trullasStrategy.ts';

import {
  buildRoundTrips,
  computeMetrics,
  computeEdgeScore,
  equityCurve,
  dailyStats,
  byDirection,
  byWeekday,
  byDuration,
  type Execution,
  type RoundTrip,
  type TradeMetrics,
  type EdgeScore,
  type EquityPoint,
  type DayStats,
  type BucketStats,
  type AnnotatedTrade,
} from '@luxalgo/journal-core';
import {
  computeBacktestRuleAttribution,
  type RuleAttributionRow,
} from './tradeAttribution.ts';
import { calculateATR, calculateEMA } from './trullasStrategy.ts';

export type BacktestStrategyMode =
  | 'trullas_divergence'
  | 'ttm_squeeze_stack'
  | 'stacked_ema_pullback';

export interface BacktestConfig {
  symbol: string;
  timeframe: string;
  range: string;
  initialBalance: number;
  riskPerTradePct: number; // e.g. 1.0 = 1%
  targetMode: 'tranches' | 'tp1' | 'tp2';
  minQualityScore: number;
  strategyMode?: BacktestStrategyMode;
  rsiFilter?: {
    oversold: number;
    overbought: number;
  };
}

export interface SimulatedTrade {
  id: string;
  tradeNumber: number;
  symbol: string;
  setupType:
    | 'BULLISH_TRIPLE'
    | 'BEARISH_TRIPLE'
    | 'BULLISH_DOUBLE'
    | 'BEARISH_DOUBLE'
    | 'TTM_SQUEEZE_LONG'
    | 'TTM_SQUEEZE_SHORT'
    | 'EMA_PULLBACK_LONG'
    | 'EMA_PULLBACK_SHORT';
  direction: 'long' | 'short';
  entryIndex: number;
  entryTime: number;
  entryDateStr: string;
  entryPrice: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  exitIndex: number;
  exitTime: number;
  exitDateStr: string;
  exitPrice: number;
  status: 'win' | 'loss' | 'breakeven' | 'open';
  exitReason: 'TP1_HIT' | 'TP2_HIT' | 'STOP_LOSS' | 'BREAKEVEN' | 'BARS_EXPIRED' | 'STILL_OPEN';
  quantity: number;
  grossPnl: number;
  feeAndSlippageDollars: number;
  feeDragPct: number;
  netPnl: number;
  returnPct: number;
  realizedR: number;
  barsHeld: number;
  qualityScore: number;
  rulesFired: string[];
}

export interface BacktestResult {
  symbol: string;
  timeframe: string;
  range: string;
  config: BacktestConfig;
  candleCount: number;
  startDate: string;
  endDate: string;
  trades: SimulatedTrade[];
  metrics: TradeMetrics;
  edgeScore: EdgeScore;
  equityCurvePoints: EquityPoint[];
  dailyStats: DayStats[];
  byDirection: BucketStats[];
  byWeekday: BucketStats[];
  byDuration: BucketStats[];
  candles: Candle[];
  detectedSetups: DivergenceSetup[];
  grossTotalPnl: number;
  totalFeeDragDollars: number;
  ruleAttribution: RuleAttributionRow[];
}

function buildRulesFiredTags(setup: DivergenceSetup, config: BacktestConfig): string[] {
  const tags: string[] = [setup.type];
  if (setup.confluenceChecks.macdDivergence) tags.push('MACD_DIV');
  if (setup.confluenceChecks.rsiDivergence) tags.push('RSI_DIV');
  if (setup.confluenceChecks.volumeExhaustion) tags.push('VOL_EXHAUST');
  if (setup.confluenceChecks.macdCrossConfirmed) tags.push('MACD_CROSS');
  if (config.rsiFilter) tags.push('RSI_FILTER');
  tags.push(`EXIT_${(config.targetMode || 'tranches').toUpperCase()}`);
  return tags;
}

/**
 * Runs a full historical backtest of David Trullàs Triple Divergence logic
 * across a series of candlestick bars.
 */
export function runBacktest(
  candles: Candle[],
  config: BacktestConfig
): BacktestResult {
  const {
    symbol,
    timeframe,
    range,
    initialBalance = 10000,
    riskPerTradePct = 1.0,
    minQualityScore = 55,
  } = config;

  if (!candles || candles.length < 30) {
    const emptyMetrics = computeMetrics([], { initialBalance });
    const emptyEdgeScore = computeEdgeScore(emptyMetrics);
    return {
      symbol,
      timeframe,
      range,
      config,
      candleCount: candles ? candles.length : 0,
      startDate: '',
      endDate: '',
      trades: [],
      metrics: emptyMetrics,
      edgeScore: emptyEdgeScore,
      equityCurvePoints: [],
      dailyStats: [],
      byDirection: [],
      byWeekday: [],
      byDuration: [],
      candles: candles || [],
      detectedSetups: [],
      grossTotalPnl: 0,
      totalFeeDragDollars: 0,
      ruleAttribution: [],
    };
  }

  const strategyMode: BacktestStrategyMode = config.strategyMode || 'trullas_divergence';
  if (strategyMode !== 'trullas_divergence') {
    return runTosStrategyBacktest(candles, { ...config, strategyMode });
  }

  const indicators = calculateIndicators(candles);
  const executions: Execution[] = [];
  const simulatedTrades: SimulatedTrade[] = [];
  const detectedSetups: DivergenceSetup[] = [];

  // Step 1: Detect all divergence setups across the series
  const allSetups = detectDivergences(symbol, timeframe, indicators, 3);
  allSetups.forEach((s) => detectedSetups.push(s));

  // Step 2: Sequential simulation
  let tradeCounter = 0;
  let activeTrade: {
    setup: DivergenceSetup;
    direction: 'long' | 'short';
    entryIndex: number;
    entryTime: number;
    entryDateStr: string;
    entryPrice: number;
    currentStopLoss: number;
    initialStopLoss: number;
    tp1: number;
    tp2: number;
    quantity: number;
    remainingQuantity: number;
    partialGrossPnl: number;
    partialExecutions: Array<{ quantity: number; price: number; time: number }>;
    riskDollars: number;
    tp1Hit: boolean;
  } | null = null;

  // Track pending setups that are awaiting trigger breakout
  interface PendingSetup {
    setup: DivergenceSetup;
    direction: 'long' | 'short';
    p3Index: number;
    triggerPrice: number;
    stopLoss: number;
    tp1: number;
    tp2: number;
    barsPending: number;
  }
  const pendingSetups: PendingSetup[] = [];

  for (let i = 25; i < candles.length; i++) {
    const curCandle = candles[i];
    const prevCandle = candles[i - 1];

    // Check if any setups have their 3rd point at this bar (or confirmed with lookback 3 at bar i - 3)
    const confirmedSetups = allSetups.filter((s) => {
      const p3 = s.points[s.points.length - 1];
      if (!p3 || p3.index !== i - 3 || s.qualityScore < minQualityScore) return false;
      if (config.rsiFilter && s.points.length > 0) {
        const isBull = s.type.startsWith('BULLISH');
        const pointRsis = s.points
          .map((pt) => indicators[pt.index]?.rsi)
          .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
        if (pointRsis.length > 0) {
          if (isBull) {
            const minRsi = Math.min(...pointRsis);
            if (minRsi > config.rsiFilter.oversold + 12) return false;
          } else {
            const maxRsi = Math.max(...pointRsis);
            if (maxRsi < config.rsiFilter.overbought - 12) return false;
          }
        }
      }
      return true;
    });

    for (const setup of confirmedSetups) {
      const isBull = setup.type.startsWith('BULLISH');
      pendingSetups.push({
        setup,
        direction: isBull ? 'long' : 'short',
        p3Index: setup.points[setup.points.length - 1].index,
        triggerPrice: setup.triggerPrice,
        stopLoss: setup.stopLoss,
        tp1: setup.targets.tp1,
        tp2: setup.targets.tp2,
        barsPending: 0,
      });
    }

    // A. Manage Active Trade if any
    if (activeTrade) {
      const barsHeld = i - activeTrade.entryIndex;
      let closed = false;
      let exitPrice = curCandle.close;
      let exitReason: SimulatedTrade['exitReason'] = 'STILL_OPEN';

      if (activeTrade.direction === 'long') {
        if (curCandle.low <= activeTrade.currentStopLoss) {
          closed = true;
          exitPrice = activeTrade.currentStopLoss;
          exitReason = activeTrade.tp1Hit ? 'BREAKEVEN' : 'STOP_LOSS';
        } else if (!activeTrade.tp1Hit && curCandle.high >= activeTrade.tp1) {
          activeTrade.tp1Hit = true;
          activeTrade.currentStopLoss = activeTrade.entryPrice; // Trailed to Breakeven
          if (config.targetMode === 'tp1') {
            closed = true;
            exitPrice = activeTrade.tp1;
            exitReason = 'TP1_HIT';
          } else if (config.targetMode === 'tranches' && activeTrade.remainingQuantity >= 2) {
            const tp1Qty = Math.floor(activeTrade.remainingQuantity / 2);
            activeTrade.partialGrossPnl += (activeTrade.tp1 - activeTrade.entryPrice) * tp1Qty;
            activeTrade.remainingQuantity -= tp1Qty;
            activeTrade.partialExecutions.push({
              quantity: tp1Qty,
              price: activeTrade.tp1,
              time: curCandle.timestamp,
            });
          }
        } else if (curCandle.high >= activeTrade.tp2) {
          closed = true;
          exitPrice = activeTrade.tp2;
          exitReason = 'TP2_HIT';
        } else if (barsHeld >= 45) {
          closed = true;
          exitPrice = curCandle.close;
          exitReason = 'BARS_EXPIRED';
        }
      } else {
        // Short trade management
        if (curCandle.high >= activeTrade.currentStopLoss) {
          closed = true;
          exitPrice = activeTrade.currentStopLoss;
          exitReason = activeTrade.tp1Hit ? 'BREAKEVEN' : 'STOP_LOSS';
        } else if (!activeTrade.tp1Hit && curCandle.low <= activeTrade.tp1) {
          activeTrade.tp1Hit = true;
          activeTrade.currentStopLoss = activeTrade.entryPrice; // Trailed to Breakeven
          if (config.targetMode === 'tp1') {
            closed = true;
            exitPrice = activeTrade.tp1;
            exitReason = 'TP1_HIT';
          } else if (config.targetMode === 'tranches' && activeTrade.remainingQuantity >= 2) {
            const tp1Qty = Math.floor(activeTrade.remainingQuantity / 2);
            activeTrade.partialGrossPnl += (activeTrade.entryPrice - activeTrade.tp1) * tp1Qty;
            activeTrade.remainingQuantity -= tp1Qty;
            activeTrade.partialExecutions.push({
              quantity: tp1Qty,
              price: activeTrade.tp1,
              time: curCandle.timestamp,
            });
          }
        } else if (curCandle.low <= activeTrade.tp2) {
          closed = true;
          exitPrice = activeTrade.tp2;
          exitReason = 'TP2_HIT';
        } else if (barsHeld >= 45) {
          closed = true;
          exitPrice = curCandle.close;
          exitReason = 'BARS_EXPIRED';
        }
      }

      if (closed) {
        tradeCounter++;
        const isLong = activeTrade.direction === 'long';
        const priceDiff = isLong
          ? exitPrice - activeTrade.entryPrice
          : activeTrade.entryPrice - exitPrice;
        const grossPnl = Number(
          (activeTrade.partialGrossPnl + priceDiff * activeTrade.remainingQuantity).toFixed(2)
        );
        const partialExitNotional = activeTrade.partialExecutions.reduce(
          (sum, pe) => sum + pe.quantity * pe.price,
          0
        );
        const avgExitPrice = Number(
          (
            (partialExitNotional + exitPrice * activeTrade.remainingQuantity) /
            Math.max(1, activeTrade.quantity)
          ).toFixed(2)
        );
        // Consistent 10 bps (0.10%) round-trip spread/slippage cost model
        const notional = Math.max(0, activeTrade.entryPrice * activeTrade.quantity);
        const feeAndSlippageDollars = Number((notional * 0.001).toFixed(2));
        const feeDragPct = notional > 0 ? Number(((feeAndSlippageDollars / notional) * 100).toFixed(3)) : 0;
        const netPnl = Number((grossPnl - feeAndSlippageDollars).toFixed(2));
        const returnPct = Number(
          ((netPnl / Math.max(1, notional)) * 100).toFixed(2)
        );
        const realizedR =
          activeTrade.riskDollars > 0
            ? Number((netPnl / activeTrade.riskDollars).toFixed(2))
            : 0;

        let status: 'win' | 'loss' | 'breakeven' = 'breakeven';
        if (netPnl > 5) status = 'win';
        else if (netPnl < -5) status = 'loss';

        simulatedTrades.push({
          id: `trade-${tradeCounter}-${activeTrade.entryTime}`,
          tradeNumber: tradeCounter,
          symbol,
          setupType: activeTrade.setup.type,
          direction: activeTrade.direction,
          entryIndex: activeTrade.entryIndex,
          entryTime: activeTrade.entryTime,
          entryDateStr: activeTrade.entryDateStr,
          entryPrice: activeTrade.entryPrice,
          stopLoss: activeTrade.initialStopLoss,
          tp1: activeTrade.tp1,
          tp2: activeTrade.tp2,
          exitIndex: i,
          exitTime: curCandle.timestamp,
          exitDateStr: curCandle.dateStr,
          exitPrice: avgExitPrice,
          status,
          exitReason,
          quantity: activeTrade.quantity,
          grossPnl,
          feeAndSlippageDollars,
          feeDragPct,
          netPnl,
          returnPct,
          realizedR,
          barsHeld,
          qualityScore: activeTrade.setup.qualityScore,
          rulesFired: buildRulesFiredTags(activeTrade.setup, config),
        });

        const entryFee = Number((feeAndSlippageDollars / 2).toFixed(2));
        let exitFeeRemaining = Number((feeAndSlippageDollars - entryFee).toFixed(2));
        executions.push({
          id: `exec-${tradeCounter}-entry`,
          accountId: 'trullas-backtest-acc',
          symbol,
          side: isLong ? 'buy' : 'sell',
          quantity: activeTrade.quantity,
          price: activeTrade.entryPrice,
          fee: entryFee,
          executedAt: new Date(activeTrade.entryTime).toISOString(),
          source: 'sync',
        });
        activeTrade.partialExecutions.forEach((pe, peIdx) => {
          const legFee = Number(
            (exitFeeRemaining * (pe.quantity / Math.max(1, activeTrade!.quantity))).toFixed(2)
          );
          exitFeeRemaining = Number((exitFeeRemaining - legFee).toFixed(2));
          executions.push({
            id: `exec-${tradeCounter}-tp1-${peIdx}`,
            accountId: 'trullas-backtest-acc',
            symbol,
            side: isLong ? 'sell' : 'buy',
            quantity: pe.quantity,
            price: Number(pe.price.toFixed(2)),
            fee: legFee,
            executedAt: new Date(pe.time).toISOString(),
            source: 'sync',
          });
        });
        executions.push({
          id: `exec-${tradeCounter}-exit`,
          accountId: 'trullas-backtest-acc',
          symbol,
          side: isLong ? 'sell' : 'buy',
          quantity: activeTrade.remainingQuantity,
          price: Number(exitPrice.toFixed(2)),
          fee: exitFeeRemaining,
          executedAt: new Date(curCandle.timestamp).toISOString(),
          source: 'sync',
        });

        activeTrade = null;
      }
    }

    // B. If no active trade, check pending setups for entry triggers or invalidation
    if (!activeTrade && pendingSetups.length > 0) {
      for (let pIdx = pendingSetups.length - 1; pIdx >= 0; pIdx--) {
        const ps = pendingSetups[pIdx];
        ps.barsPending++;

        // Invalidation check: did price break the swing extreme (Stop Loss) before triggering?
        const invalidated =
          ps.direction === 'long'
            ? curCandle.low <= ps.stopLoss
            : curCandle.high >= ps.stopLoss;

        if (invalidated || ps.barsPending > 20) {
          pendingSetups.splice(pIdx, 1);
          continue;
        }

        // Trigger check: did price cross the 23.6% Fibonacci breakout trigger?
        const triggered =
          ps.direction === 'long'
            ? curCandle.high >= ps.triggerPrice
            : curCandle.low <= ps.triggerPrice;

        if (triggered) {
          const entryPrice = ps.triggerPrice;
          const stopLoss = ps.stopLoss;
          const riskPerShare = Math.max(0.1, Math.abs(entryPrice - stopLoss));

          const riskDollars = (initialBalance * riskPerTradePct) / 100;
          let quantity = Math.floor(riskDollars / riskPerShare);
          if (quantity < 1) quantity = 1;

          const maxSharesByCapital = Math.floor((initialBalance * 0.4) / entryPrice);
          if (maxSharesByCapital > 0 && quantity > maxSharesByCapital) {
            quantity = maxSharesByCapital;
          }

          activeTrade = {
            setup: ps.setup,
            direction: ps.direction,
            entryIndex: i,
            entryTime: curCandle.timestamp,
            entryDateStr: curCandle.dateStr,
            entryPrice,
            currentStopLoss: stopLoss,
            initialStopLoss: stopLoss,
            tp1: ps.tp1,
            tp2: ps.tp2,
            quantity,
            remainingQuantity: quantity,
            partialGrossPnl: 0,
            partialExecutions: [],
            riskDollars,
            tp1Hit: false,
          };

          pendingSetups.splice(pIdx, 1);
          break; // Trade initiated
        }
      }
    }
  }

  // Handle open trade at end of backtest window if any
  if (activeTrade) {
    tradeCounter++;
    const lastBar = candles[candles.length - 1];
    const isLong = activeTrade.direction === 'long';
    const exitPrice = lastBar.close;
    const priceDiff = isLong
      ? exitPrice - activeTrade.entryPrice
      : activeTrade.entryPrice - exitPrice;
    const grossPnl = Number(
      (activeTrade.partialGrossPnl + priceDiff * activeTrade.remainingQuantity).toFixed(2)
    );
    const notional = Math.max(0, activeTrade.entryPrice * activeTrade.quantity);
    const feeAndSlippageDollars = Number((notional * 0.0005).toFixed(2));
    const feeDragPct = notional > 0 ? Number(((feeAndSlippageDollars / notional) * 100).toFixed(3)) : 0;
    const netPnl = Number((grossPnl - feeAndSlippageDollars).toFixed(2));
    const returnPct = Number(
      ((netPnl / Math.max(1, notional)) * 100).toFixed(2)
    );
    const realizedR =
      activeTrade.riskDollars > 0
        ? Number((netPnl / activeTrade.riskDollars).toFixed(2))
        : 0;

    simulatedTrades.push({
      id: `trade-${tradeCounter}-${activeTrade.entryTime}`,
      tradeNumber: tradeCounter,
      symbol,
      setupType: activeTrade.setup.type,
      direction: activeTrade.direction,
      entryIndex: activeTrade.entryIndex,
      entryTime: activeTrade.entryTime,
      entryDateStr: activeTrade.entryDateStr,
      entryPrice: activeTrade.entryPrice,
      stopLoss: activeTrade.initialStopLoss,
      tp1: activeTrade.tp1,
      tp2: activeTrade.tp2,
      exitIndex: candles.length - 1,
      exitTime: lastBar.timestamp,
      exitDateStr: lastBar.dateStr,
      exitPrice: Number(exitPrice.toFixed(2)),
      status: 'open',
      exitReason: 'STILL_OPEN',
      quantity: activeTrade.quantity,
      grossPnl,
      feeAndSlippageDollars,
      feeDragPct,
      netPnl,
      returnPct,
      realizedR,
      barsHeld: candles.length - 1 - activeTrade.entryIndex,
      qualityScore: activeTrade.setup.qualityScore,
      rulesFired: buildRulesFiredTags(activeTrade.setup, config),
    });
  }

  // Build institutional round trips and metrics using @luxalgo/journal-core
  const roundTrips: RoundTrip[] = buildRoundTrips(executions, { method: 'fifo' });

  // Enrich with stop-loss annotations for R-multiple calculations in LuxAlgo
  const annotatedTrades: AnnotatedTrade[] = roundTrips.map((rt) => {
    const rtOpenedMs = Date.parse(rt.openedAt);
    const sim =
      simulatedTrades.find(
        (st) =>
          st.direction === rt.direction &&
          Math.abs(st.entryTime - rtOpenedMs) < 1000
      ) ||
      simulatedTrades.find(
        (st) =>
          st.direction === rt.direction &&
          Math.abs(new Date(st.entryDateStr).getTime() - rtOpenedMs) <
            48 * 60 * 60 * 1000
      );
    return {
      ...rt,
      annotations: {
        playbook: 'Trullas MACD Triple Divergence',
        tags: sim?.rulesFired || [sim?.setupType || 'TRIPLE_DIV', sim?.direction || 'long'],
        stopLoss: sim?.stopLoss,
        profitTarget: sim?.tp2,
      },
    };
  });

  const metrics: TradeMetrics = computeMetrics(annotatedTrades, {
    initialBalance,
  });

  const edgeScore: EdgeScore = computeEdgeScore(metrics);
  const eqPoints: EquityPoint[] = equityCurve(roundTrips);
  const dStats: DayStats[] = dailyStats(roundTrips);
  const dirStats: BucketStats[] = byDirection(annotatedTrades);
  const wkdayStats: BucketStats[] = byWeekday(annotatedTrades);
  const durStats: BucketStats[] = byDuration(annotatedTrades);

  const closedTradesOnly = simulatedTrades.filter((t) => t.status !== 'open');
  const grossTotalPnl = Number(
    closedTradesOnly.reduce((s, t) => s + t.grossPnl, 0).toFixed(2)
  );
  const totalFeeDragDollars = Number(
    closedTradesOnly.reduce((s, t) => s + t.feeAndSlippageDollars, 0).toFixed(2)
  );
  const ruleAttribution = computeBacktestRuleAttribution(simulatedTrades);

  return {
    symbol,
    timeframe,
    range,
    config,
    candleCount: candles.length,
    startDate: candles[0]?.dateStr || '',
    endDate: candles[candles.length - 1]?.dateStr || '',
    trades: simulatedTrades,
    metrics,
    edgeScore,
    equityCurvePoints: eqPoints,
    dailyStats: dStats,
    byDirection: dirStats,
    byWeekday: wkdayStats,
    byDuration: durStats,
    candles,
    detectedSetups,
    grossTotalPnl,
    totalFeeDragDollars,
    ruleAttribution,
  };
}

function smaAtIndex(values: number[], idx: number, period: number): number | null {
  if (idx + 1 < period) return null;
  let sum = 0;
  for (let k = idx - period + 1; k <= idx; k++) sum += values[k];
  return sum / period;
}

function runTosStrategyBacktest(
  candles: Candle[],
  config: BacktestConfig & { strategyMode: Exclude<BacktestStrategyMode, 'trullas_divergence'> }
): BacktestResult {
  const {
    symbol,
    timeframe,
    range,
    initialBalance = 10000,
    riskPerTradePct = 1.0,
    strategyMode,
  } = config;

  const closes = candles.map((c) => c.close);
  const ema8 = calculateEMA(closes, 8);
  const ema13 = calculateEMA(closes, 13);
  const ema21 = calculateEMA(closes, 21);
  const ema34 = calculateEMA(closes, 34);
  const atr14 = calculateATR(candles, 14);

  const n = candles.length;
  const squeezeSeries = new Array<boolean>(n).fill(false);
  for (let i = 19; i < n; i++) {
    const mean20 = smaAtIndex(closes, i, 20) ?? closes[i];
    let sq = 0;
    for (let k = i - 19; k <= i; k++) {
      const d = closes[k] - mean20;
      sq += d * d;
    }
    const sd = Math.sqrt(sq / 20);
    const bbUpper = mean20 + 2.0 * sd;
    const bbLower = mean20 - 2.0 * sd;
    const kcMid = ema21[i];
    const kcUpper = kcMid + 1.5 * atr14[i];
    const kcLower = kcMid - 1.5 * atr14[i];
    squeezeSeries[i] = bbUpper < kcUpper && bbLower > kcLower;
  }

  const executions: Execution[] = [];
  const simulatedTrades: SimulatedTrade[] = [];
  let tradeCounter = 0;

  interface ActiveTosTrade {
    setupType: SimulatedTrade['setupType'];
    direction: 'long' | 'short';
    entryIndex: number;
    entryTime: number;
    entryDateStr: string;
    entryPrice: number;
    currentStopLoss: number;
    initialStopLoss: number;
    tp1: number;
    tp2: number;
    quantity: number;
    remainingQuantity: number;
    partialGrossPnl: number;
    partialExecutions: Array<{ quantity: number; price: number; time: number }>;
    riskDollars: number;
    tp1Hit: boolean;
    qualityScore: number;
    rulesFired: string[];
  }
  let activeTrade: ActiveTosTrade | null = null;

  const startIdx = strategyMode === 'stacked_ema_pullback' ? 50 : 35;

  for (let i = startIdx; i < n; i++) {
    const cur = candles[i];
    const prev = candles[i - 1];

    if (activeTrade) {
      const barsHeld = i - activeTrade.entryIndex;
      let closed = false;
      let exitPrice = cur.close;
      let exitReason: SimulatedTrade['exitReason'] = 'STILL_OPEN';

      if (activeTrade.direction === 'long') {
        if (cur.low <= activeTrade.currentStopLoss) {
          closed = true;
          exitPrice = activeTrade.currentStopLoss;
          exitReason = activeTrade.tp1Hit ? 'BREAKEVEN' : 'STOP_LOSS';
        } else if (!activeTrade.tp1Hit && cur.high >= activeTrade.tp1) {
          activeTrade.tp1Hit = true;
          activeTrade.currentStopLoss = activeTrade.entryPrice;
          if (config.targetMode === 'tp1') {
            closed = true;
            exitPrice = activeTrade.tp1;
            exitReason = 'TP1_HIT';
          } else if (config.targetMode === 'tranches' && activeTrade.remainingQuantity >= 2) {
            const tp1Qty = Math.floor(activeTrade.remainingQuantity / 2);
            activeTrade.partialGrossPnl += (activeTrade.tp1 - activeTrade.entryPrice) * tp1Qty;
            activeTrade.remainingQuantity -= tp1Qty;
            activeTrade.partialExecutions.push({
              quantity: tp1Qty,
              price: activeTrade.tp1,
              time: cur.timestamp,
            });
          }
        } else if (cur.high >= activeTrade.tp2) {
          closed = true;
          exitPrice = activeTrade.tp2;
          exitReason = 'TP2_HIT';
        } else if (barsHeld >= 45) {
          closed = true;
          exitPrice = cur.close;
          exitReason = 'BARS_EXPIRED';
        }
      } else {
        if (cur.high >= activeTrade.currentStopLoss) {
          closed = true;
          exitPrice = activeTrade.currentStopLoss;
          exitReason = activeTrade.tp1Hit ? 'BREAKEVEN' : 'STOP_LOSS';
        } else if (!activeTrade.tp1Hit && cur.low <= activeTrade.tp1) {
          activeTrade.tp1Hit = true;
          activeTrade.currentStopLoss = activeTrade.entryPrice;
          if (config.targetMode === 'tp1') {
            closed = true;
            exitPrice = activeTrade.tp1;
            exitReason = 'TP1_HIT';
          } else if (config.targetMode === 'tranches' && activeTrade.remainingQuantity >= 2) {
            const tp1Qty = Math.floor(activeTrade.remainingQuantity / 2);
            activeTrade.partialGrossPnl += (activeTrade.entryPrice - activeTrade.tp1) * tp1Qty;
            activeTrade.remainingQuantity -= tp1Qty;
            activeTrade.partialExecutions.push({
              quantity: tp1Qty,
              price: activeTrade.tp1,
              time: cur.timestamp,
            });
          }
        } else if (cur.low <= activeTrade.tp2) {
          closed = true;
          exitPrice = activeTrade.tp2;
          exitReason = 'TP2_HIT';
        } else if (barsHeld >= 45) {
          closed = true;
          exitPrice = cur.close;
          exitReason = 'BARS_EXPIRED';
        }
      }

      if (closed) {
        tradeCounter++;
        const isLong = activeTrade.direction === 'long';
        const priceDiff = isLong
          ? exitPrice - activeTrade.entryPrice
          : activeTrade.entryPrice - exitPrice;
        const grossPnl = Number(
          (activeTrade.partialGrossPnl + priceDiff * activeTrade.remainingQuantity).toFixed(2)
        );
        const partialExitNotional = activeTrade.partialExecutions.reduce(
          (sum, pe) => sum + pe.quantity * pe.price,
          0
        );
        const avgExitPrice = Number(
          (
            (partialExitNotional + exitPrice * activeTrade.remainingQuantity) /
            Math.max(1, activeTrade.quantity)
          ).toFixed(2)
        );
        const notional = Math.max(0, activeTrade.entryPrice * activeTrade.quantity);
        const feeAndSlippageDollars = Number((notional * 0.001).toFixed(2));
        const feeDragPct =
          notional > 0 ? Number(((feeAndSlippageDollars / notional) * 100).toFixed(3)) : 0;
        const netPnl = Number((grossPnl - feeAndSlippageDollars).toFixed(2));
        const returnPct = Number(((netPnl / Math.max(1, notional)) * 100).toFixed(2));
        const realizedR =
          activeTrade.riskDollars > 0
            ? Number((netPnl / activeTrade.riskDollars).toFixed(2))
            : 0;

        let status: 'win' | 'loss' | 'breakeven' = 'breakeven';
        if (netPnl > 5) status = 'win';
        else if (netPnl < -5) status = 'loss';

        simulatedTrades.push({
          id: `trade-${tradeCounter}-${activeTrade.entryTime}`,
          tradeNumber: tradeCounter,
          symbol,
          setupType: activeTrade.setupType,
          direction: activeTrade.direction,
          entryIndex: activeTrade.entryIndex,
          entryTime: activeTrade.entryTime,
          entryDateStr: activeTrade.entryDateStr,
          entryPrice: activeTrade.entryPrice,
          stopLoss: activeTrade.initialStopLoss,
          tp1: activeTrade.tp1,
          tp2: activeTrade.tp2,
          exitIndex: i,
          exitTime: cur.timestamp,
          exitDateStr: cur.dateStr,
          exitPrice: avgExitPrice,
          status,
          exitReason,
          quantity: activeTrade.quantity,
          grossPnl,
          feeAndSlippageDollars,
          feeDragPct,
          netPnl,
          returnPct,
          realizedR,
          barsHeld,
          qualityScore: activeTrade.qualityScore,
          rulesFired: activeTrade.rulesFired,
        });

        const entryFee = Number((feeAndSlippageDollars / 2).toFixed(2));
        let exitFeeRemaining = Number((feeAndSlippageDollars - entryFee).toFixed(2));
        executions.push({
          id: `exec-${tradeCounter}-entry`,
          accountId: 'trullas-backtest-acc',
          symbol,
          side: isLong ? 'buy' : 'sell',
          quantity: activeTrade.quantity,
          price: activeTrade.entryPrice,
          fee: entryFee,
          executedAt: new Date(activeTrade.entryTime).toISOString(),
          source: 'sync',
        });
        activeTrade.partialExecutions.forEach((pe, peIdx) => {
          const legFee = Number(
            (exitFeeRemaining * (pe.quantity / Math.max(1, activeTrade!.quantity))).toFixed(2)
          );
          exitFeeRemaining = Number((exitFeeRemaining - legFee).toFixed(2));
          executions.push({
            id: `exec-${tradeCounter}-tp1-${peIdx}`,
            accountId: 'trullas-backtest-acc',
            symbol,
            side: isLong ? 'sell' : 'buy',
            quantity: pe.quantity,
            price: Number(pe.price.toFixed(2)),
            fee: legFee,
            executedAt: new Date(pe.time).toISOString(),
            source: 'sync',
          });
        });
        executions.push({
          id: `exec-${tradeCounter}-exit`,
          accountId: 'trullas-backtest-acc',
          symbol,
          side: isLong ? 'sell' : 'buy',
          quantity: activeTrade.remainingQuantity,
          price: Number(exitPrice.toFixed(2)),
          fee: exitFeeRemaining,
          executedAt: new Date(cur.timestamp).toISOString(),
          source: 'sync',
        });

        activeTrade = null;
      }
      continue;
    }

    // Signal evaluation on completed bar `i`
    const effAtr = atr14[i] > 0 ? atr14[i] : cur.close * 0.018;
    let signalDir: 'long' | 'short' | null = null;
    let setupType: SimulatedTrade['setupType'] = 'TTM_SQUEEZE_LONG';
    let qualityScore = 76;
    let rulesFired: string[] = [];
    let tp2Mult = 2.5;

    if (strategyMode === 'ttm_squeeze_stack') {
      // Count consecutive squeeze dots ending at i - 1
      let prevDots = 0;
      for (let k = i - 1; k >= 0 && squeezeSeries[k]; k--) prevDots++;
      const squeezeFired = !squeezeSeries[i] && prevDots >= 5;
      const deepSqueeze = squeezeSeries[i] && prevDots >= 4;
      const bullStack = ema13[i] > ema21[i] && ema21[i] > ema34[i];
      const bearStack = ema13[i] < ema21[i] && ema21[i] < ema34[i];

      if ((squeezeFired || deepSqueeze) && bullStack && cur.close > prev.high) {
        signalDir = 'long';
        setupType = 'TTM_SQUEEZE_LONG';
        qualityScore = squeezeFired ? 84 : 76;
        tp2Mult = 3.0;
        rulesFired = ['TTM_SQUEEZE', 'EMA_13_21_34_STACK', `EXIT_${(config.targetMode || 'tranches').toUpperCase()}`];
      } else if ((squeezeFired || deepSqueeze) && bearStack && cur.close < prev.low) {
        signalDir = 'short';
        setupType = 'TTM_SQUEEZE_SHORT';
        qualityScore = squeezeFired ? 84 : 76;
        tp2Mult = 3.0;
        rulesFired = ['TTM_SQUEEZE', 'EMA_13_21_34_STACK', `EXIT_${(config.targetMode || 'tranches').toUpperCase()}`];
      }
    } else if (strategyMode === 'stacked_ema_pullback') {
      const sma50 = smaAtIndex(closes, i, 50);
      if (sma50 !== null) {
        const bullStack = ema8[i] > ema21[i] && ema21[i] > ema34[i] && ema34[i] > sma50;
        const bearStack = ema8[i] < ema21[i] && ema21[i] < ema34[i] && ema34[i] < sma50;
        const touchedBullEma21 = prev.low <= ema21[i - 1] * 1.003 || cur.low <= ema21[i] * 1.003;
        const touchedBearEma21 = prev.high >= ema21[i - 1] * 0.997 || cur.high >= ema21[i] * 0.997;

        if (bullStack && touchedBullEma21 && cur.close > prev.high && cur.close > ema21[i]) {
          signalDir = 'long';
          setupType = 'EMA_PULLBACK_LONG';
          qualityScore = 80;
          tp2Mult = 2.5;
          rulesFired = ['STACKED_EMA_8_21_34_50', 'EMA21_PULLBACK', `EXIT_${(config.targetMode || 'tranches').toUpperCase()}`];
        } else if (bearStack && touchedBearEma21 && cur.close < prev.low && cur.close < ema21[i]) {
          signalDir = 'short';
          setupType = 'EMA_PULLBACK_SHORT';
          qualityScore = 80;
          tp2Mult = 2.5;
          rulesFired = ['STACKED_EMA_8_21_34_50', 'EMA21_PULLBACK', `EXIT_${(config.targetMode || 'tranches').toUpperCase()}`];
        }
      }
    }

    if (signalDir) {
      const entryPrice = Number(cur.close.toFixed(2));
      const stopDistance = Math.max(0.1, effAtr * 1.5);
      const stopLoss = Number(
        (signalDir === 'long' ? entryPrice - stopDistance : entryPrice + stopDistance).toFixed(2)
      );
      const tp1 = Number(
        (signalDir === 'long' ? entryPrice + stopDistance * 1.5 : entryPrice - stopDistance * 1.5).toFixed(2)
      );
      const tp2 = Number(
        (signalDir === 'long' ? entryPrice + stopDistance * tp2Mult : entryPrice - stopDistance * tp2Mult).toFixed(2)
      );
      const riskDollars = (initialBalance * riskPerTradePct) / 100;
      let quantity = Math.max(1, Math.floor(riskDollars / stopDistance));
      const maxSharesByCapital = Math.floor((initialBalance * 0.4) / entryPrice);
      if (maxSharesByCapital > 0 && quantity > maxSharesByCapital) {
        quantity = maxSharesByCapital;
      }

      activeTrade = {
        setupType,
        direction: signalDir,
        entryIndex: i,
        entryTime: cur.timestamp,
        entryDateStr: cur.dateStr,
        entryPrice,
        currentStopLoss: stopLoss,
        initialStopLoss: stopLoss,
        tp1,
        tp2,
        quantity,
        remainingQuantity: quantity,
        partialGrossPnl: 0,
        partialExecutions: [],
        riskDollars,
        tp1Hit: false,
        qualityScore,
        rulesFired,
      };
    }
  }

  if (activeTrade) {
    tradeCounter++;
    const lastBar = candles[candles.length - 1];
    const isLong = activeTrade.direction === 'long';
    const exitPrice = lastBar.close;
    const priceDiff = isLong
      ? exitPrice - activeTrade.entryPrice
      : activeTrade.entryPrice - exitPrice;
    const grossPnl = Number(
      (activeTrade.partialGrossPnl + priceDiff * activeTrade.remainingQuantity).toFixed(2)
    );
    const notional = Math.max(0, activeTrade.entryPrice * activeTrade.quantity);
    const feeAndSlippageDollars = Number((notional * 0.0005).toFixed(2));
    const feeDragPct = notional > 0 ? Number(((feeAndSlippageDollars / notional) * 100).toFixed(3)) : 0;
    const netPnl = Number((grossPnl - feeAndSlippageDollars).toFixed(2));
    const returnPct = Number(((netPnl / Math.max(1, notional)) * 100).toFixed(2));
    const realizedR =
      activeTrade.riskDollars > 0
        ? Number((netPnl / activeTrade.riskDollars).toFixed(2))
        : 0;

    simulatedTrades.push({
      id: `trade-${tradeCounter}-${activeTrade.entryTime}`,
      tradeNumber: tradeCounter,
      symbol,
      setupType: activeTrade.setupType,
      direction: activeTrade.direction,
      entryIndex: activeTrade.entryIndex,
      entryTime: activeTrade.entryTime,
      entryDateStr: activeTrade.entryDateStr,
      entryPrice: activeTrade.entryPrice,
      stopLoss: activeTrade.initialStopLoss,
      tp1: activeTrade.tp1,
      tp2: activeTrade.tp2,
      exitIndex: candles.length - 1,
      exitTime: lastBar.timestamp,
      exitDateStr: lastBar.dateStr,
      exitPrice: Number(exitPrice.toFixed(2)),
      status: 'open',
      exitReason: 'STILL_OPEN',
      quantity: activeTrade.quantity,
      grossPnl,
      feeAndSlippageDollars,
      feeDragPct,
      netPnl,
      returnPct,
      realizedR,
      barsHeld: candles.length - 1 - activeTrade.entryIndex,
      qualityScore: activeTrade.qualityScore,
      rulesFired: activeTrade.rulesFired,
    });
  }

  const roundTrips: RoundTrip[] = buildRoundTrips(executions, { method: 'fifo' });
  const annotatedTrades: AnnotatedTrade[] = roundTrips.map((rt) => {
    const rtOpenedMs = Date.parse(rt.openedAt);
    const sim =
      simulatedTrades.find(
        (st) =>
          st.direction === rt.direction &&
          Math.abs(st.entryTime - rtOpenedMs) < 1000
      ) ||
      simulatedTrades.find(
        (st) =>
          st.direction === rt.direction &&
          Math.abs(new Date(st.entryDateStr).getTime() - rtOpenedMs) <
            48 * 60 * 60 * 1000
      );
    return {
      ...rt,
      annotations: {
        playbook:
          strategyMode === 'ttm_squeeze_stack'
            ? 'TOS TTM Squeeze + EMA Stack'
            : 'TOS Stacked EMA Pullback',
        tags: sim?.rulesFired || [sim?.setupType || strategyMode, sim?.direction || 'long'],
        stopLoss: sim?.stopLoss,
        profitTarget: sim?.tp2,
      },
    };
  });

  const metrics: TradeMetrics = computeMetrics(annotatedTrades, { initialBalance });
  const edgeScore: EdgeScore = computeEdgeScore(metrics);
  const closedTradesOnly = simulatedTrades.filter((t) => t.status !== 'open');

  return {
    symbol,
    timeframe,
    range,
    config,
    candleCount: candles.length,
    startDate: candles[0]?.dateStr || '',
    endDate: candles[candles.length - 1]?.dateStr || '',
    trades: simulatedTrades,
    metrics,
    edgeScore,
    equityCurvePoints: equityCurve(roundTrips),
    dailyStats: dailyStats(roundTrips),
    byDirection: byDirection(annotatedTrades),
    byWeekday: byWeekday(annotatedTrades),
    byDuration: byDuration(annotatedTrades),
    candles,
    detectedSetups: [],
    grossTotalPnl: Number(closedTradesOnly.reduce((s, t) => s + t.grossPnl, 0).toFixed(2)),
    totalFeeDragDollars: Number(
      closedTradesOnly.reduce((s, t) => s + t.feeAndSlippageDollars, 0).toFixed(2)
    ),
    ruleAttribution: computeBacktestRuleAttribution(simulatedTrades),
  };
}

