import test from 'node:test';
import assert from 'node:assert/strict';
import { createStockBotShadowStrategy } from './stockBotShadowStrategy.ts';

const candles = Array.from({ length: 80 }, (_, index) => ({
  timestamp: 1_700_000_000 + index * 86_400,
  open: 100 + index * 0.5,
  high: 101 + index * 0.5,
  low: 99 + index * 0.5,
  close: 100 + index * 0.5,
  volume: 1_000_000 + index * 1000,
}));

function overview(overrides: Record<string, unknown> = {}) {
  return {
    configured: true,
    mode: 'PAPER',
    fetchedAt: '2026-11-28T12:00:00.000Z',
    account: {
      equity: 100_000, buying_power: 100_000, cash: 100_000,
      day_pnl: 0, day_pnl_pct: 0, options_buying_power: 0,
      options_approved_level: 0, pattern_day_trader: false,
      trading_blocked: false, account_blocked: false, trade_suspended_by_user: false,
    },
    positions: [],
    equityPositions: [],
    optionPositions: [],
    orders: [],
    fills: [],
    portfolioHistory: [],
    orderHistoryComplete: true,
    portfolioHistoryComplete: true,
    fillHistoryComplete: true,
    ...overrides,
  };
}

test('stock shadow strategy returns a blocked result when Alpaca Paper is unavailable', async () => {
  const strategy = createStockBotShadowStrategy({
    getOverview: async () => overview({ configured: false, account: null }),
    fetchCandles: async () => candles,
    getMarketHealth: async () => null,
    now: () => Date.parse('2026-11-28T12:00:00.000Z'),
  });
  const result = await strategy.evaluate({});
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.reason, 'ALPACA_PAPER_UNAVAILABLE');
});

test('stock shadow strategy blocks incomplete broker history and never submits orders', async () => {
  let candleCalls = 0;
  const strategy = createStockBotShadowStrategy({
    getOverview: async () => overview({ orderHistoryComplete: false }),
    fetchCandles: async () => { candleCalls++; return candles; },
    getMarketHealth: async () => null,
  });
  const result = await strategy.evaluate({});
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.reason, 'INCOMPLETE_BROKER_SNAPSHOT');
  assert.equal(candleCalls, 0);
});

test('stock shadow strategy evaluates only normalized symbols and remains read-only', async () => {
  const requested: string[] = [];
  const strategy = createStockBotShadowStrategy({
    getOverview: async () => overview(),
    fetchCandles: async (symbol) => { requested.push(symbol); return candles; },
    getMarketHealth: async () => null,
    now: () => Date.parse('2026-11-28T12:00:00.000Z'),
  });
  const result = await strategy.evaluate({
    symbols: ['aapl', 'AAPL', 'bad symbol', 'NVDA'],
    maxOpenPositions: 3,
    riskPerTradePercent: 1,
  });
  assert.deepEqual(requested, ['AAPL', 'NVDA']);
  assert.equal(result.mode, 'SHADOW');
  assert.equal(result.assetClass, 'STOCK');
  assert.equal(result.execution.ordersSubmitted, 0);
  assert.equal(result.execution.brokerSideEffects, false);
  assert.equal(result.scan.evaluatedSymbols, 2);
  assert.equal(result.configDigest.length, 64);
});

test('stock shadow strategy isolates per-symbol data failures', async () => {
  const strategy = createStockBotShadowStrategy({
    getOverview: async () => overview(),
    fetchCandles: async (symbol) => {
      if (symbol === 'AAPL') throw new Error('provider timeout');
      return candles;
    },
    getMarketHealth: async () => null,
  });
  const result = await strategy.evaluate({ symbols: ['AAPL', 'NVDA'] });
  assert.equal(result.status, 'EVALUATED');
  assert.equal(result.scan.evaluatedSymbols, 1);
  assert.deepEqual(result.scan.errors, [{ symbol: 'AAPL', error: 'provider timeout' }]);
});

test('stock shadow strategy excludes potentially incomplete daily bars', async () => {
  const now = Date.parse('2026-11-28T12:00:00.000Z');
  const mixed = [
    ...candles,
    {
      timestamp: now - 60 * 60 * 1000,
      open: 140, high: 141, low: 139, close: 140, volume: 1_000_000,
    },
  ];
  const strategy = createStockBotShadowStrategy({
    getOverview: async () => overview(),
    fetchCandles: async () => mixed,
    getMarketHealth: async () => null,
    now: () => now,
  });
  const result = await strategy.evaluate({ symbols: ['AAPL'] });
  assert.equal(result.status, 'EVALUATED');
  assert.equal(result.scan.evaluatedSymbols, 1);
});

test('stock shadow strategy rejects malformed OHLC and non-monotonic candle data', async () => {
  const malformed = candles.map((candle, index) => index === 10
    ? { ...candle, high: candle.low - 1 }
    : candle);
  const strategy = createStockBotShadowStrategy({
    getOverview: async () => overview(),
    fetchCandles: async () => malformed,
    getMarketHealth: async () => null,
    now: () => Date.parse('2026-11-28T12:00:00.000Z'),
  });
  const result = await strategy.evaluate({ symbols: ['AAPL'] });
  assert.equal(result.scan?.evaluatedSymbols, 0);
  assert.equal(result.scan?.errors[0].error, 'INSUFFICIENT_CANDLES');
});
