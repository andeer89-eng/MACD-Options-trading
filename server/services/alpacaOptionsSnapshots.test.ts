import test from 'node:test';
import assert from 'node:assert/strict';
import { createAlpacaService, AlpacaApiError } from './alpaca.ts';

const env = {
  APCA_API_KEY_ID: 'paper-key',
  APCA_API_SECRET_KEY: 'paper-secret',
  APCA_DATA_BASE_URL: 'https://data.alpaca.markets',
};

test('option snapshots normalize fresh OPRA quotes, sizes, Greeks and provenance', async () => {
  const now = Date.parse('2026-11-28T12:00:00.000Z');
  const service = createAlpacaService({
    env,
    now: () => now,
    fetchImpl: async (input) => {
      const url = String(input);
      assert.ok(url.startsWith('https://data.alpaca.markets/v1beta1/options/snapshots?'));
      assert.ok(url.includes('feed=opra'));
      return new Response(JSON.stringify({
        snapshots: {
          AAPL261218P00150000: {
            latestQuote: { bp: 2.1, ap: 2.2, bs: 10, as: 12, t: '2026-11-28T11:59:45.000Z' },
            latestTrade: { p: 2.15, s: 4, t: '2026-11-28T11:59:40.000Z' },
            greeks: { delta: -0.12, gamma: 0.01, theta: -0.04, vega: 0.08 },
            impliedVolatility: 0.31,
          },
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  });

  const result = await service.getOptionSnapshots({ symbols: ['aapl261218p00150000'], feed: 'opra' });
  assert.equal(result.snapshots.length, 1);
  const quote = result.snapshots[0];
  assert.equal(quote.symbol, 'AAPL261218P00150000');
  assert.equal(quote.quoteStatus, 'FRESH');
  assert.equal(quote.isUsable, true);
  assert.equal(quote.bidPrice, 2.1);
  assert.equal(quote.askPrice, 2.2);
  assert.equal(quote.bidSize, 10);
  assert.equal(quote.askSize, 12);
  assert.equal(quote.delta, -0.12);
  assert.equal(quote.impliedVolatility, 0.31);
  assert.equal(quote.quoteAgeMs, 15_000);
  assert.ok(quote.spreadPercent && quote.spreadPercent > 0);
});

test('option snapshots fail closed for stale, invalid and missing quotes', async () => {
  const now = Date.parse('2026-11-28T12:00:00.000Z');
  const service = createAlpacaService({
    env,
    now: () => now,
    fetchImpl: async () => new Response(JSON.stringify({
      snapshots: {
        AAPL261218P00150000: {
          latestQuote: { bp: 2, ap: 2.1, bs: 1, as: 1, t: '2026-11-28T11:58:00.000Z' },
        },
        MSFT261218P00300000: {
          latestQuote: { bp: 2.2, ap: 2.1, bs: 1, as: 1, t: '2026-11-28T11:59:59.000Z' },
        },
      },
    }), { status: 200 }),
  });

  const result = await service.getOptionSnapshots({
    symbols: ['AAPL261218P00150000', 'MSFT261218P00300000', 'SPY261218P00500000'],
  });
  assert.equal(result.snapshots[0].quoteStatus, 'STALE');
  assert.equal(result.snapshots[0].isUsable, false);
  assert.equal(result.snapshots[1].quoteStatus, 'INVALID');
  assert.equal(result.snapshots[1].isUsable, false);
  assert.equal(result.snapshots[2].quoteStatus, 'MISSING');
  assert.equal(result.snapshots[2].isUsable, false);
});

test('option snapshots reject invalid symbols and batches larger than 100 before network access', async () => {
  let requests = 0;
  const service = createAlpacaService({
    env,
    fetchImpl: async () => { requests++; return new Response('{}', { status: 200 }); },
  });
  await assert.rejects(
    () => service.getOptionSnapshots({ symbols: ['AAPL'] }),
    (error: unknown) => error instanceof AlpacaApiError && error.status === 400,
  );
  await assert.rejects(
    () => service.getOptionSnapshots({ symbols: Array.from({ length: 101 }, (_, i) => `AAPL261218P${String(i).padStart(8, '0')}`) }),
    (error: unknown) => error instanceof AlpacaApiError && error.status === 400,
  );
  assert.equal(requests, 0);
});
