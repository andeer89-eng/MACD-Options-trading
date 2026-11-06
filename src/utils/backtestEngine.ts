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

export interface BacktestConfig {
  symbol: string;
  timeframe: string;
  range: string;
  initialBalance: number;
  riskPerTradePct: number; // e.g. 1.0 = 1%
  targetMode: 'tranches' | 'tp1' | 'tp2';
  minQualityScore: number;
}

export interface SimulatedTrade {
  id: string;
  tradeNumber: number;
  symbol: string;
  setupType: 'BULLISH_TRIPLE' | 'BEARISH_TRIPLE' | 'BULLISH_DOUBLE' | 'BEARISH_DOUBLE';
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
  netPnl: number;
  returnPct: number;
  realizedR: number;
  barsHeld: number;
  qualityScore: number;
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
    };
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
      return p3 && p3.index === i - 3 && s.qualityScore >= minQualityScore;
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
        const netPnl = Number((priceDiff * activeTrade.quantity).toFixed(2));
        const returnPct = Number(
          ((priceDiff / activeTrade.entryPrice) * 100).toFixed(2)
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
          exitPrice: Number(exitPrice.toFixed(2)),
          status,
          exitReason,
          quantity: activeTrade.quantity,
          netPnl,
          returnPct,
          realizedR,
          barsHeld,
          qualityScore: activeTrade.setup.qualityScore,
        });

        executions.push({
          id: `exec-${tradeCounter}-entry`,
          accountId: 'trullas-backtest-acc',
          symbol,
          side: isLong ? 'buy' : 'sell',
          quantity: activeTrade.quantity,
          price: activeTrade.entryPrice,
          fee: 1.0,
          executedAt: new Date(activeTrade.entryTime).toISOString(),
          source: 'sync',
        });
        executions.push({
          id: `exec-${tradeCounter}-exit`,
          accountId: 'trullas-backtest-acc',
          symbol,
          side: isLong ? 'sell' : 'buy',
          quantity: activeTrade.quantity,
          price: Number(exitPrice.toFixed(2)),
          fee: 1.0,
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
    const netPnl = Number((priceDiff * activeTrade.quantity).toFixed(2));
    const returnPct = Number(
      ((priceDiff / activeTrade.entryPrice) * 100).toFixed(2)
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
      netPnl,
      returnPct,
      realizedR,
      barsHeld: candles.length - 1 - activeTrade.entryIndex,
      qualityScore: activeTrade.setup.qualityScore,
    });
  }

  // Build institutional round trips and metrics using @luxalgo/journal-core
  const roundTrips: RoundTrip[] = buildRoundTrips(executions, { method: 'fifo' });

  // Enrich with stop-loss annotations for R-multiple calculations in LuxAlgo
  const annotatedTrades: AnnotatedTrade[] = roundTrips.map((rt) => {
    const sim = simulatedTrades.find(
      (st) =>
        Math.abs(new Date(st.entryDateStr).getTime() - new Date(rt.openedAt).getTime()) <
        48 * 60 * 60 * 1000
    );
    return {
      ...rt,
      annotations: {
        playbook: 'Trullas MACD Triple Divergence',
        tags: [sim?.setupType || 'TRIPLE_DIV', sim?.direction || 'long'],
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
  };
}
