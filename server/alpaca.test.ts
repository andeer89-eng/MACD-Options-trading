import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../server.ts';
import type { Candle } from '../src/utils/trullasStrategy.ts';
import { isValidAlpacaPaperUrl, resolveAlpacaConfig } from './services/alpaca.ts';

function buildRealishCandles(count = 60): Candle[] {
  const start = Date.UTC(2026, 0, 2, 14, 30, 0);
  return Array.from({ length: count }, (_, i) => {
    const close = Number((180 + Math.sin(i * 0.2) * 6 + i * 0.25).toFixed(2));
    const open = Number((close - 0.8).toFixed(2));
    const high = Number((Math.max(open, close) + 1.5).toFixed(2));
    const low = Number((Math.min(open, close) - 1.5).toFixed(2));
    const ts = start + i * 86_400_000;
    return {
      timestamp: ts,
      dateStr: new Date(ts).toISOString().slice(0, 10),
      open,
      high,
      low,
      close,
      volume: 15_000_000 + i * 100_000,
    };
  });
}

describe('Alpaca Paper Trading Enforcement & Proxy Routes', () => {
  it('enforces https://paper-api.alpaca.markets only and blocks live trading endpoints', () => {
    assert.equal(isValidAlpacaPaperUrl('https://paper-api.alpaca.markets'), true);
    assert.equal(isValidAlpacaPaperUrl('https://paper-api.alpaca.markets/'), true);
    assert.equal(isValidAlpacaPaperUrl('https://api.alpaca.markets'), false);
    assert.equal(isValidAlpacaPaperUrl('http://paper-api.alpaca.markets'), false);
    assert.equal(isValidAlpacaPaperUrl('https://evil.example.com'), false);

    const unconfigured = resolveAlpacaConfig({});
    assert.equal(unconfigured.configured, false);
    assert.equal(unconfigured.paperEndpoint, 'https://paper-api.alpaca.markets');

    const placeholder = resolveAlpacaConfig({
      APCA_API_KEY_ID: 'MY_ALPACA_PAPER_API_KEY_ID',
      APCA_API_SECRET_KEY: 'MY_ALPACA_PAPER_SECRET_KEY',
    });
    assert.equal(placeholder.configured, false);

    const liveViolation = resolveAlpacaConfig({
      APCA_API_KEY_ID: 'PKTEST123456',
      APCA_API_SECRET_KEY: 'SEC123456',
      APCA_API_BASE_URL: 'https://api.alpaca.markets',
    });
    assert.equal(liveViolation.configured, false);
    assert.equal(liveViolation.paperViolation, true);
  });

  describe('HTTP routes when Alpaca env credentials are NOT configured', () => {
    let server: http.Server;
    let baseUrl = '';

    before(async () => {
      const { app } = await createApp({
        attachFrontend: false,
        fetchYahooDataOverride: async (symbol) => (symbol === 'EMPTY' ? [] : buildRealishCandles(60)),
        alpacaEnvOverride: {},
      });
      server = http.createServer(app);
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
      const addr = server.address();
      if (!addr || typeof addr === 'string') throw new Error('Bind error');
      baseUrl = `http://127.0.0.1:${addr.port}`;
    });

    after(async () => {
      await new Promise<void>((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      });
    });

    it('GET /api/alpaca/status & /api/alpaca/overview return 200 configured=false with PAPER mode', async () => {
      const statusRes = await fetch(`${baseUrl}/api/alpaca/status`);
      assert.equal(statusRes.status, 200);
      const statusJson = (await statusRes.json()) as any;
      assert.equal(statusJson.configured, false);
      assert.equal(statusJson.mode, 'PAPER');
      assert.equal(statusJson.paperEndpoint, 'https://paper-api.alpaca.markets');

      const ovRes = await fetch(`${baseUrl}/api/alpaca/overview`);
      assert.equal(ovRes.status, 200);
      const ovJson = (await ovRes.json()) as any;
      assert.equal(ovJson.configured, false);
      assert.equal(ovJson.account, null);
      assert.deepEqual(ovJson.equityPositions, []);
      assert.deepEqual(ovJson.optionPositions, []);
    });

    it('POST /api/alpaca/orders returns 503 when unconfigured (no fake fill)', async () => {
      const res = await fetch(`${baseUrl}/api/alpaca/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: 'AAPL', side: 'buy', qty: 2, type: 'market', time_in_force: 'day' }),
      });
      assert.equal(res.status, 503);
    });

    it('POST /api/luxalgo/pinets-run executes against live fetched candles and returns 503 if market feed empty', async () => {
      const okRes = await fetch(`${baseUrl}/api/luxalgo/pinets-run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: 'AAPL', pineCode: '//@version=5\nindicator("Test", overlay=true)\nplot(ta.ema(close, 10))' }),
      });
      assert.equal(okRes.status, 200);
      const okBody = (await okRes.json()) as any;
      assert.equal(okBody.syntaxValid, true);
      assert.equal(okBody.candleCount, 60);

      const failRes = await fetch(`${baseUrl}/api/luxalgo/pinets-run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: 'EMPTY', pineCode: '//@version=5\nindicator("Test", overlay=true)\nplot(ta.ema(close, 10))' }),
      });
      assert.equal(failRes.status, 503);
    });
  });

  describe('HTTP routes with configured Alpaca Paper credentials & mocked Alpaca API transport', () => {
    let server: http.Server;
    let baseUrl = '';
    const calls: Array<{ url: string; method: string; headers: Record<string, string>; body?: any }> = [];

    before(async () => {
      const { app } = await createApp({
        attachFrontend: false,
        fetchYahooDataOverride: async () => buildRealishCandles(60),
        alpacaEnvOverride: {
          APCA_API_KEY_ID: 'PKTEST_PAPER_KEY',
          APCA_API_SECRET_KEY: 'TEST_PAPER_SECRET',
          APCA_API_BASE_URL: 'https://paper-api.alpaca.markets',
        },
        alpacaFetchOverride: async (input, init) => {
          const url = String(input);
          const method = init?.method || 'GET';
          const headers = (init?.headers || {}) as Record<string, string>;
          const body = init?.body ? JSON.parse(String(init.body)) : undefined;
          calls.push({ url, method, headers, body });

          if (url.endsWith('/v2/account')) {
            return new Response(
              JSON.stringify({
                id: 'acc-paper-1',
                account_number: 'PA123456',
                status: 'ACTIVE',
                currency: 'USD',
                cash: '25400.50',
                buying_power: '50801.00',
                options_buying_power: '25400.50',
                options_approved_level: 2,
                equity: '28120.75',
                last_equity: '27900.00',
                pattern_day_trader: false,
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          }

          if (url.endsWith('/v2/positions')) {
            return new Response(
              JSON.stringify([
                {
                  asset_id: 'eq-1',
                  symbol: 'NVDA',
                  asset_class: 'us_equity',
                  qty: '10',
                  side: 'long',
                  avg_entry_price: '130.00',
                  current_price: '135.20',
                  market_value: '1352.00',
                  unrealized_pl: '52.00',
                  unrealized_plpc: '0.04',
                },
                {
                  asset_id: 'opt-1',
                  symbol: 'SPY261218P00560000',
                  asset_class: 'us_option',
                  qty: '-1',
                  side: 'short',
                  avg_entry_price: '2.40',
                  current_price: '1.15',
                  market_value: '-115.00',
                  unrealized_pl: '125.00',
                  unrealized_plpc: '0.5208',
                },
              ]),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          }

          if (url.includes('/v2/orders') && method === 'GET') {
            return new Response(
              JSON.stringify([
                {
                  id: 'ord-eq-open-1',
                  symbol: 'NVDA',
                  asset_class: 'us_equity',
                  side: 'buy',
                  qty: '10',
                  filled_qty: '10',
                  filled_avg_price: '130.00',
                  type: 'market',
                  time_in_force: 'day',
                  status: 'filled',
                  submitted_at: '2026-11-18T14:35:00Z',
                  filled_at: '2026-11-18T14:35:02Z',
                },
              ]),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          }

          if (url.includes('/v2/account/activities/FILL')) {
            return new Response(
              JSON.stringify([
                {
                  id: 'fill-1',
                  activity_type: 'FILL',
                  order_id: 'ord-eq-open-1',
                  symbol: 'NVDA',
                  side: 'buy',
                  qty: '10',
                  price: '130.00',
                  transaction_time: '2026-11-18T14:35:02Z',
                },
              ]),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          }

          if (url.includes('/v2/options/contracts')) {
            return new Response(
              JSON.stringify({
                option_contracts: [
                  {
                    id: 'c-1',
                    symbol: 'SPY261218P00560000',
                    name: 'SPY Dec 18 2026 560 Put',
                    status: 'active',
                    tradable: true,
                    underlying_symbol: 'SPY',
                    expiration_date: '2026-12-18',
                    type: 'put',
                    strike_price: '560',
                    close_price: '2.45',
                    open_interest: '4200',
                  },
                ],
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          }

          if (url.endsWith('/v2/orders') && method === 'POST') {
            return new Response(
              JSON.stringify({
                id: 'ord-created-99',
                symbol: body.symbol,
                side: body.side,
                qty: body.qty,
                type: body.type,
                status: 'accepted',
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          }

          if (url.includes('/v2/positions/') && method === 'DELETE') {
            return new Response(
              JSON.stringify({ id: 'ord-close-77', symbol: 'NVDA', status: 'accepted' }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          }

          return new Response(JSON.stringify({ message: 'Not mocked' }), { status: 404 });
        },
      });

      server = http.createServer(app);
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
      const addr = server.address();
      if (!addr || typeof addr === 'string') throw new Error('Bind error');
      baseUrl = `http://127.0.0.1:${addr.port}`;
    });

    after(async () => {
      await new Promise<void>((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      });
    });

    it('GET /api/alpaca/overview splits equity vs option positions and passes Paper auth headers', async () => {
      const res = await fetch(`${baseUrl}/api/alpaca/overview`);
      assert.equal(res.status, 200);
      const data = (await res.json()) as any;
      assert.equal(data.configured, true);
      assert.equal(data.mode, 'PAPER');
      assert.equal(data.account.account_number, 'PA123456');
      assert.equal(data.account.equity, 28120.75);
      assert.equal(data.equityPositions.length, 1);
      assert.equal(data.equityPositions[0].symbol, 'NVDA');
      assert.equal(data.optionPositions.length, 1);
      assert.equal(data.optionPositions[0].symbol, 'SPY261218P00560000');

      const accountCall = calls.find((c) => c.url.startsWith('https://paper-api.alpaca.markets/v2/account'));
      assert.ok(accountCall);
      assert.equal(accountCall.headers['APCA-API-KEY-ID'], 'PKTEST_PAPER_KEY');
      assert.equal(accountCall.headers['APCA-API-SECRET-KEY'], 'TEST_PAPER_SECRET');
    });

    it('POST /api/alpaca/orders submits equity and OCC option orders and rejects invalid/futures symbols', async () => {
      const futuresRes = await fetch(`${baseUrl}/api/alpaca/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: 'ES=F', side: 'sell', qty: 1, type: 'market', time_in_force: 'day' }),
      });
      assert.equal(futuresRes.status, 400);

      const eqRes = await fetch(`${baseUrl}/api/alpaca/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: 'AAPL',
          side: 'buy',
          qty: 3,
          type: 'market',
          time_in_force: 'day',
        }),
      });
      assert.equal(eqRes.status, 200);
      const eqBody = (await eqRes.json()) as any;
      assert.equal(eqBody.order.id, 'ord-created-99');

      const optRes = await fetch(`${baseUrl}/api/alpaca/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: 'SPY261218P00560000',
          side: 'sell',
          qty: 1,
          type: 'limit',
          limit_price: 2.45,
          time_in_force: 'day',
        }),
      });
      assert.equal(optRes.status, 200);
    });

    it('GET /api/alpaca/options/contracts & DELETE /api/alpaca/positions/:symbol work cleanly', async () => {
      const contractsRes = await fetch(`${baseUrl}/api/alpaca/options/contracts?underlying=SPY&type=put`);
      assert.equal(contractsRes.status, 200);
      const contractsBody = (await contractsRes.json()) as any;
      assert.equal(contractsBody.contracts.length, 1);
      assert.equal(contractsBody.contracts[0].symbol, 'SPY261218P00560000');

      const closeRes = await fetch(`${baseUrl}/api/alpaca/positions/NVDA?percentage=50`, {
        method: 'DELETE',
      });
      assert.equal(closeRes.status, 200);
      const closeBody = (await closeRes.json()) as any;
      assert.equal(closeBody.order.id, 'ord-close-77');

      const fullCloseRes = await fetch(`${baseUrl}/api/alpaca/positions/NVDA`, {
        method: 'DELETE',
      });
      assert.equal(fullCloseRes.status, 200);
      const fullCloseCall = calls.find(
        (c) => c.method === 'DELETE' && c.url.includes('/v2/positions/NVDA?cancel_orders=true')
      );
      assert.ok(fullCloseCall, 'Expected full closePosition to send cancel_orders=true to Alpaca');
    });
  });
});
