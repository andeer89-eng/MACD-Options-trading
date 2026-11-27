import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWatchlistSignalMarketData,
  validateWatchlistSignalMarketData,
} from './watchlistMarketData.ts';
import type { Candle, DivergenceSetup } from '../../src/utils/trullasStrategy.ts';

const base = Date.UTC(2026, 10, 1);
const candle = (day: number, close: number): Candle => ({
  timestamp: base + day * 86_400_000,
  dateStr: new Date(base + day * 86_400_000).toISOString().slice(0, 10),
  open: close - 1, high: close + 1, low: close - 2, close, volume: 1000,
});
const setup = (): DivergenceSetup => ({
  id: 'AAPL-TEST', symbol: 'AAPL', timeframe: '1d', type: 'BULLISH_DOUBLE',
  qualityScore: 70,
  points: [{ index: 0, type: 'trough', price: 90, macd: 1, histogram: 1, rsi: 40, volume: 10, timestamp: base, dateStr: '2026-11-01' }],
  currentPrice: 100, triggerPrice: 105, stopLoss: 95,
  fibLevels: { fib0: 90, fib236: 105, fib382: 110, fib500: 115, fib618: 120, fib1000: 125 },
  targets: { tp1: 110, tp2: 120, tp3: 125 }, riskRewardRatio: 2,
  confluenceChecks: { priceDivergence: true, macdDivergence: true, rsiDivergence: true, volumeExhaustion: true, macdCrossConfirmed: true },
  scalingTranches: { tranche1: 'a', tranche2: 'b', tranche3: 'c' },
  detectedAt: base, confirmationTimestamp: base,
});
const metadata = { isLiveFeed: true, source: 'Yahoo Finance v8 Chart API', exchange: 'NMS', exchangeTimezone: 'America/New_York', currency: 'USD' };

test('builds provenance envelope and excludes newest potentially-open bar', () => {
  const result = buildWatchlistSignalMarketData({
    symbol: 'aapl', timeframe: '1d', range: '3mo',
    candles: [candle(0, 100), candle(1, 101), candle(2, 102)],
    retrievedAt: base + 3 * 86_400_000, feedMetadata: metadata,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.evidence.symbol, 'AAPL');
  assert.equal(result.evidence.candles.length, 2);
  assert.equal(result.evidence.excludedLatestCandleTimestamp, candle(2, 102).timestamp);
  assert.match(result.evidence.normalizedPayloadSha256, /^[a-f0-9]{64}$/);
});

test('fails closed without provider metadata or enough bars', () => {
  assert.equal(buildWatchlistSignalMarketData({
    symbol: 'AAPL', timeframe: '1d', range: '3mo', candles: [candle(0, 100), candle(1, 101), candle(2, 102)],
    retrievedAt: base + 3 * 86_400_000, feedMetadata: null,
  }).ok, false);
  assert.equal(buildWatchlistSignalMarketData({
    symbol: 'AAPL', timeframe: '1d', range: '3mo', candles: [candle(0, 100), candle(1, 101)],
    retrievedAt: base + 2 * 86_400_000, feedMetadata: metadata,
  }).ok, false);
});

test('rejects unordered or malformed provider bars', () => {
  const result = buildWatchlistSignalMarketData({
    symbol: 'AAPL', timeframe: '1d', range: '3mo', candles: [candle(1, 101), candle(0, 100), candle(2, 102)],
    retrievedAt: base + 3 * 86_400_000, feedMetadata: metadata,
  });
  assert.equal(result.ok, false);
});

test('validates identity, freshness and normalized-payload digest', () => {
  const result = buildWatchlistSignalMarketData({
    symbol: 'AAPL', timeframe: '1d', range: '3mo', candles: [candle(0, 100), candle(1, 101), candle(2, 102)],
    retrievedAt: base + 3 * 86_400_000, feedMetadata: metadata,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const evidence = result.evidence;
  assert.equal(validateWatchlistSignalMarketData(evidence, setup(), base + 3 * 86_400_000, 60_000), null);
  assert.equal(validateWatchlistSignalMarketData(evidence, { ...setup(), symbol: 'MSFT' }, base + 3 * 86_400_000, 60_000), 'MARKET_DATA_SYMBOL_MISMATCH');
  assert.equal(validateWatchlistSignalMarketData(evidence, { ...setup(), timeframe: '1h' }, base + 3 * 86_400_000, 60_000), 'MARKET_DATA_TIMEFRAME_MISMATCH');
  assert.equal(validateWatchlistSignalMarketData(evidence, setup(), base + 4 * 86_400_000, 60_000), 'STALE_MARKET_DATA_EVIDENCE');
  assert.equal(validateWatchlistSignalMarketData({ ...evidence, candles: [candle(1, 99)] }, setup(), base + 3 * 86_400_000, 60_000), 'MARKET_DATA_DIGEST_MISMATCH');
});
