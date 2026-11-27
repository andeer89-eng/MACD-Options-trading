import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { createWatchlistEvaluationRouter } from './watchlistEvaluation.ts';
import { buildWatchlistSignalMarketData } from '../services/watchlistMarketData.ts';
import type { Candle } from '../../src/utils/trullasStrategy.ts';

const base = Date.UTC(2026, 0, 1);
const now = base + 62 * 86_400_000;
const candles: Candle[] = Array.from({ length: 61 }, (_, index) => {
  const timestamp = base + index * 86_400_000;
  return {
    timestamp,
    dateStr: new Date(timestamp).toISOString().slice(0, 10),
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volume: 1_000,
  };
});
const built = buildWatchlistSignalMarketData({
  symbol: 'AAPL',
  timeframe: '1d',
  range: '3mo',
  candles,
  retrievedAt: now,
  feedMetadata: {
    isLiveFeed: true,
    source: 'Yahoo Finance v8 Chart API',
    exchange: 'NMS',
    exchangeTimezone: 'America/New_York',
    currency: 'USD',
  },
});
if (!built.ok) throw new Error(built.reason);

async function withServer(run: (baseUrl: string) => Promise<void>, token = 'evaluation-worker-token') {
  const app = express();
  app.use(express.json());
  app.use(createWatchlistEvaluationRouter({
    marketData: {
      fetchWatchlistSignalMarketData: async () => built,
    } as any,
    projectId: 'demo-project',
    serviceAccountJson: JSON.stringify({
      client_email: 'worker-test@example.iam.gserviceaccount.com',
      private_key: 'not-used-without-journal-events',
    }),
    workerToken: token,
    now: () => now,
    maxMarketDataAgeMs: 60_000,
  }));
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind.');
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

test('watchlist evaluation endpoint requires the dedicated worker token', async () => {
  await withServer(async baseUrl => {
    const response = await fetch(baseUrl + '/api/internal/watchlist/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer wrong-token' },
      body: JSON.stringify({}),
    });
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  });
});

test('watchlist evaluation endpoint validates owner, symbol, timeframe and range', async () => {
  await withServer(async baseUrl => {
    const response = await fetch(baseUrl + '/api/internal/watchlist/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer evaluation-worker-token' },
      body: JSON.stringify({ ownerId: 'owner_1', symbol: 'AAPL', timeframe: '99x', range: '3mo' }),
    });
    assert.equal(response.status, 400);
  });
});

test('watchlist evaluation endpoint evaluates closed OHLCV data without mutating watchlist state', async () => {
  await withServer(async baseUrl => {
    const response = await fetch(baseUrl + '/api/internal/watchlist/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer evaluation-worker-token' },
      body: JSON.stringify({ ownerId: 'owner_1', symbol: 'AAPL', timeframe: '1d', range: '3mo' }),
    });
    assert.equal(response.status, 200);
    const body = await response.json() as any;
    assert.equal(body.ownerId, 'owner_1');
    assert.equal(body.symbol, 'AAPL');
    assert.equal(body.provider, 'YAHOO_FINANCE_CHART_V8');
    assert.equal(body.activeSetupCount, 0);
    assert.equal(body.journaledEvaluationCount, 0);
    assert.equal(body.readOnly, true);
  });
});
