import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createWatchlistRouter } from './routes/watchlist.ts';
import type { Candle } from '../src/utils/trullasStrategy.ts';

function flatCandles(): Candle[] {
  return Array.from({ length: 100 }, (_, index) => {
    const close = 100 + index * 0.1;
    const timestamp = Date.UTC(2026, 0, 1) + index * 86_400_000;
    return {
      timestamp,
      dateStr: new Date(timestamp).toISOString().slice(0, 10),
      open: close - 0.02,
      high: close + 0.1,
      low: close - 0.1,
      close,
      volume: 1_000_000,
    };
  });
}

describe('Server-authoritative watchlist trigger route', () => {
  let server: http.Server;
  let baseUrl = '';
  let marketRequests = 0;
  let writes = 0;

  before(async () => {
    const router = createWatchlistRouter({
      fetchYahooData: async () => {
        marketRequests++;
        return flatCandles();
      },
    } as any, {
      verifyFirebaseIdToken: async (token: string) => {
        if (token === 'valid-unverified') return { uid: 'owner-1', emailVerified: false };
        if (token === 'valid-verified') return { uid: 'owner-1', emailVerified: true };
        throw new Error('invalid token');
      },
      markTriggered: async () => {
        writes++;
        return { status: 'TRIGGERED', symbol: 'AAPL', updatedAt: new Date(0).toISOString() };
      },
    });
    const app = (await import('express')).default();
    app.use((await import('express')).default.json());
    app.use(router);
    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Failed to bind test server');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await new Promise<void>((resolve) => {
      server.closeAllConnections?.();
      server.close(() => resolve());
    });
  });

  it('requires a Firebase bearer token before fetching market data', async () => {
    const response = await fetch(`${baseUrl}/api/watchlist/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol: 'AAPL', direction: 'long' }),
    });
    assert.equal(response.status, 401);
    assert.equal(marketRequests, 0);
  });

  it('rejects unverified Firebase accounts', async () => {
    const response = await fetch(`${baseUrl}/api/watchlist/trigger`, {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-unverified', 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol: 'AAPL', direction: 'long' }),
    });
    assert.equal(response.status, 403);
    assert.equal(marketRequests, 0);
  });

  it('recomputes market divergence server-side and refuses a trigger without active evidence', async () => {
    const response = await fetch(`${baseUrl}/api/watchlist/trigger`, {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-verified', 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol: 'AAPL', direction: 'long', timeframe: '1d' }),
    });
    assert.equal(response.status, 409);
    assert.equal(writes, 0);
    assert.equal(marketRequests, 1);
  });

  it('rejects invalid symbol, direction, and timeframe before market access', async () => {
    const response = await fetch(`${baseUrl}/api/watchlist/trigger`, {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-verified', 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol: 'AAPL;DROP', direction: 'long', timeframe: '1m' }),
    });
    assert.equal(response.status, 400);
    assert.equal(marketRequests, 1);
  });
});
