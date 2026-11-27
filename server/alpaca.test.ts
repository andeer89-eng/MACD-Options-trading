import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { generateKeyPairSync, sign as signJwt } from 'node:crypto';
import { createApp } from '../server.ts';
import type { Candle } from '../src/utils/trullasStrategy.ts';
import { isValidAlpacaPaperUrl, resolveAlpacaConfig } from './services/alpaca.ts';

const TEST_FIREBASE_PROJECT_ID = 'macd-options-test';
const TEST_FIREBASE_UID = 'alpaca-owner-uid';
const firebaseKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const firebasePublicKeyPem = firebaseKeys.publicKey.export({ type: 'spki', format: 'pem' }).toString();

function createFirebaseTestToken(uid = TEST_FIREBASE_UID): string {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const encode = (value: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsignedToken = [
    encode({ alg: 'RS256', kid: 'test-kid', typ: 'JWT' }),
    encode({
      aud: TEST_FIREBASE_PROJECT_ID,
      iss: `https://securetoken.google.com/${TEST_FIREBASE_PROJECT_ID}`,
      sub: uid,
      user_id: uid,
      iat: nowSeconds,
      exp: nowSeconds + 3600,
      auth_time: nowSeconds,
    }),
  ].join('.');
  const signature = signJwt('RSA-SHA256', Buffer.from(unsignedToken), firebaseKeys.privateKey);
  return `${unsignedToken}.${signature.toString('base64url')}`;
}

const firebaseAuthFetchOverride: typeof fetch = async (input) => {
  if (!String(input).includes('securetoken@system.gserviceaccount.com')) {
    throw new Error('Unexpected request in Firebase certificate mock.');
  }
  return new Response(JSON.stringify({ 'test-kid': firebasePublicKeyPem }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};

function firebaseAuthHeaders(uid = TEST_FIREBASE_UID): Record<string, string> {
  return { Authorization: `Bearer ${createFirebaseTestToken(uid)}` };
}

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

  it('fails closed when the Alpaca owner UID allowlist is empty', async () => {
    const { app } = await createApp({
      attachFrontend: false,
      alpacaAllowedUidsOverride: [],
      firebaseProjectIdOverride: TEST_FIREBASE_PROJECT_ID,
      firebaseAuthFetchOverride,
      alpacaEnvOverride: {},
    });
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('Bind error');
    try {
      const res = await fetch(`http://127.0.0.1:${addr.port}/api/alpaca/status`);
      assert.equal(res.status, 503);
    } finally {
      server.closeAllConnections?.();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  describe('HTTP routes when Alpaca env credentials are NOT configured', () => {
    let server: http.Server;
    let baseUrl = '';

    before(async () => {
      const { app } = await createApp({
        attachFrontend: false,
        fetchYahooDataOverride: async (symbol) => (symbol === 'EMPTY' ? [] : buildRealishCandles(60)),
        alpacaEnvOverride: {},
        firebaseProjectIdOverride: TEST_FIREBASE_PROJECT_ID,
        alpacaAllowedUidsOverride: [TEST_FIREBASE_UID],
        firebaseAuthFetchOverride,
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

    it('rejects anonymous Alpaca requests and allows the configured Firebase owner', async () => {
      const anonymousStatus = await fetch(`${baseUrl}/api/alpaca/status`);
      assert.equal(anonymousStatus.status, 401);

      const validToken = createFirebaseTestToken();
      const [tokenHeader, tokenClaims, tokenSignature] = validToken.split('.');
      const tamperedSignature = `${tokenSignature[0] === 'A' ? 'B' : 'A'}${tokenSignature.slice(1)}`;
      const invalidTokenRes = await fetch(`${baseUrl}/api/alpaca/status`, {
        headers: { Authorization: `Bearer ${tokenHeader}.${tokenClaims}.${tamperedSignature}` },
      });
      assert.equal(invalidTokenRes.status, 401);

      const anonymousOrder = await fetch(`${baseUrl}/api/alpaca/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: 'AAPL', side: 'buy', qty: 1 }),
      });
      assert.equal(anonymousOrder.status, 401);

      const statusRes = await fetch(`${baseUrl}/api/alpaca/status`, {
        headers: firebaseAuthHeaders(),
      });
      assert.equal(statusRes.status, 200);
      const statusJson = (await statusRes.json()) as any;
      assert.equal(statusJson.configured, false);
      assert.equal(statusJson.mode, 'PAPER');
      assert.equal(statusJson.paperEndpoint, 'https://paper-api.alpaca.markets');

      const ovRes = await fetch(`${baseUrl}/api/alpaca/overview`, {
        headers: firebaseAuthHeaders(),
      });
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
        headers: { ...firebaseAuthHeaders(), 'Content-Type': 'application/json' },
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
    let includePendingNvdaClose = false;

    before(async () => {
      const { app } = await createApp({
        attachFrontend: false,
        fetchYahooDataOverride: async () => buildRealishCandles(60),
        firebaseProjectIdOverride: TEST_FIREBASE_PROJECT_ID,
        alpacaAllowedUidsOverride: [TEST_FIREBASE_UID],
        firebaseAuthFetchOverride,
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
                cash: '254000.50',
                buying_power: '508001.00',
                options_buying_power: '254000.50',
                options_approved_level: 2,
                equity: '300000.00',
                last_equity: '297900.00',
                pattern_day_trader: false,
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          }
          if (url.includes('/v2/account/portfolio/history')) {
            const nowSeconds = Math.floor(Date.now() / 1000);
            return new Response(JSON.stringify({
              timestamp: Array.from({ length: 40 }, (_, index) => nowSeconds - (39 - index) * 86400),
              equity: Array.from({ length: 40 }, () => '300000.00'),
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
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

          if (url.includes('/v2/orders') && method === 'GET' && new URL(url).searchParams.get('status') === 'open') {
            const requestUrl = new URL(url);
            const oldestOpenOrder = {
              id: 'ord-open-oldest-501',
              symbol: 'AAPL',
              asset_class: 'us_equity',
              side: 'buy',
              qty: '1',
              filled_qty: '0',
              filled_avg_price: null,
              limit_price: '1.00',
              type: 'limit',
              time_in_force: 'day',
              status: 'accepted',
              submitted_at: '2026-11-27T14:30:00Z',
              filled_at: null,
            };
            if (requestUrl.searchParams.has('before_order_id')) {
              return new Response(JSON.stringify([oldestOpenOrder]), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              });
            }
            const firstPage = Array.from({ length: 500 }, (_, i) => ({
              ...oldestOpenOrder,
              id: `ord-open-${String(i).padStart(3, '0')}`,
            }));
            if (includePendingNvdaClose) firstPage[0] = { ...oldestOpenOrder, id: 'ord-nvda-pending-close', symbol: 'NVDA', side: 'sell', qty: '8', limit_price: '135.00' };
            return new Response(JSON.stringify(firstPage), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          if (url.includes('/v2/orders') && method === 'GET') {
            const requestUrl = new URL(url);
            const oldestOrder = {
              id: 'ord-oldest-501',
              symbol: 'NVDA',
              asset_class: 'us_equity',
              side: 'buy',
              qty: '0.1',
              filled_qty: '0.1',
              filled_avg_price: '130.00',
              type: 'market',
              time_in_force: 'day',
              status: 'filled',
              submitted_at: '2026-11-18T14:36:00Z',
              filled_at: '2026-11-18T14:36:01Z',
            };
            if (requestUrl.searchParams.has('before_order_id')) {
              return new Response(JSON.stringify([oldestOrder]), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              });
            }
            const recentOrders = Array.from({ length: 499 }, (_, i) => ({
              id: `ord-dummy-${String(i).padStart(3, '0')}`,
              symbol: 'DUMMY',
              asset_class: 'us_equity',
              side: 'buy',
              qty: '1',
              filled_qty: '0',
              filled_avg_price: null,
              type: 'market',
              time_in_force: 'day',
              status: 'canceled',
              submitted_at: '2026-11-18T14:30:00Z',
              filled_at: null,
            }));
            return new Response(
              JSON.stringify([
                ...recentOrders,
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
            const requestUrl = new URL(url);
            const pageToken = requestUrl.searchParams.get('page_token');
            const rows = pageToken
              ? [{
                  id: 'fill-page-100',
                  activity_type: 'FILL',
                  order_id: 'ord-oldest-501',
                  symbol: 'NVDA',
                  side: 'buy',
                  qty: '0.1',
                  price: '130.00',
                  transaction_time: '2026-11-18T14:36:01Z',
                }]
              : Array.from({ length: 100 }, (_, i) => ({
                  id: `fill-page-${String(i).padStart(3, '0')}`,
                  activity_type: 'FILL',
                  order_id: 'ord-eq-open-1',
                  symbol: 'NVDA',
                  side: 'buy',
                  qty: '0.1',
                  price: '130.00',
                  transaction_time: new Date(Date.UTC(2026, 10, 18, 14, 35, 2, i)).toISOString(),
                }));
            return new Response(JSON.stringify(rows), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
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

          if (url.includes('/v2/orders/') && method === 'DELETE') {
            return new Response(JSON.stringify({ id: 'ord-cancelled-11', status: 'canceled' }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
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

    it('rejects signed-in Firebase users outside the Alpaca UID allowlist', async () => {
      const res = await fetch(`${baseUrl}/api/alpaca/overview`, {
        headers: firebaseAuthHeaders('unapproved-user'),
      });
      assert.equal(res.status, 403);
    });

    it('GET /api/alpaca/overview splits equity vs option positions and passes Paper auth headers', async () => {
      const res = await fetch(`${baseUrl}/api/alpaca/overview`, {
        headers: firebaseAuthHeaders(),
      });
      assert.equal(res.status, 200);
      const data = (await res.json()) as any;
      assert.equal(data.configured, true);
      assert.equal(data.mode, 'PAPER');
      assert.equal(data.account.account_number, 'PA123456');
      assert.equal(data.account.equity, 300000);
      assert.equal(data.equityPositions.length, 1);
      assert.equal(data.equityPositions[0].symbol, 'NVDA');
      assert.equal(data.optionPositions.length, 1);
      assert.equal(data.optionPositions[0].symbol, 'SPY261218P00560000');
      assert.equal(data.orders.length, 501, 'Expected order history to be paginated beyond the first 500 orders');
      assert.equal(data.fills.length, 101, 'Expected fill activity history to be paginated beyond the first 100 activities');
      assert.equal(data.orderHistoryComplete, true);
      assert.equal(data.portfolioHistoryComplete, true);
      assert.equal(data.portfolioHistory.length, 40);
      assert.equal(data.account.trading_blocked, false);
      assert.equal(data.account.account_blocked, false);
      assert.equal(data.fillHistoryComplete, true);
      assert.ok(calls.some((call) => call.url.includes('before_order_id=ord-eq-open-1')));
      assert.ok(calls.some((call) => call.url.includes('page_token=fill-page-099')));

      const accountCall = calls.find((c) => c.url.startsWith('https://paper-api.alpaca.markets/v2/account'));
      assert.ok(accountCall);
      assert.equal(accountCall.headers['APCA-API-KEY-ID'], 'PKTEST_PAPER_KEY');
      assert.equal(accountCall.headers['APCA-API-SECRET-KEY'], 'TEST_PAPER_SECRET');
    });

    it('POST /api/alpaca/orders submits equity and OCC option orders and rejects invalid/futures symbols', async () => {
      const futuresRes = await fetch(`${baseUrl}/api/alpaca/orders`, {
        method: 'POST',
        headers: { ...firebaseAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: 'ES=F', side: 'sell', qty: 1, type: 'market', time_in_force: 'day' }),
      });
      assert.equal(futuresRes.status, 400);

      const eqRes = await fetch(`${baseUrl}/api/alpaca/orders`, {
        method: 'POST',
        headers: { ...firebaseAuthHeaders(), 'Content-Type': 'application/json' },
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
        headers: { ...firebaseAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: 'SPY261218P00560000',
          side: 'sell',
          qty: 1,
          type: 'limit',
          limit_price: 2.45,
          time_in_force: 'day',
        }),
      });
      assert.equal(optRes.status, 409, 'Large short put must be blocked by the per-trade worst-case loss limit');
      const smallPutRes = await fetch(`${baseUrl}/api/alpaca/orders`, {
        method: 'POST',
        headers: { ...firebaseAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: 'XYZ261218P00005000', side: 'sell', qty: 1, type: 'limit', limit_price: 0.10, time_in_force: 'day' }),
      });
      assert.equal(smallPutRes.status, 200, 'Small short put should pass when portfolio limits are clear');
      assert.ok(calls.some((call) =>
        call.url.includes('/v2/orders?status=open') && call.url.includes('before_order_id=ord-open-499')
      ), 'Risk gate must paginate the complete working-order snapshot beyond 500 orders');

      const excessiveEquityBuy = await fetch(`${baseUrl}/api/alpaca/orders`, {
        method: 'POST',
        headers: { ...firebaseAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: 'MSFT', side: 'buy', qty: 5000, type: 'market', time_in_force: 'day' }),
      });
      assert.equal(excessiveEquityBuy.status, 409, 'Projected equity order notional must count against gross exposure');

      includePendingNvdaClose = true;
      const overClose = await fetch(`${baseUrl}/api/alpaca/orders`, {
        method: 'POST',
        headers: { ...firebaseAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: 'NVDA', side: 'sell', qty: 3, type: 'market', time_in_force: 'day' }),
      });
      assert.equal(overClose.status, 409, 'A new close must not exceed the held position after pending closes');
      includePendingNvdaClose = false;
    });

    it('GET /api/alpaca/options/contracts & DELETE /api/alpaca/positions/:symbol work cleanly', async () => {
      const contractsRes = await fetch(`${baseUrl}/api/alpaca/options/contracts?underlying=SPY&type=put`, {
        headers: firebaseAuthHeaders(),
      });
      assert.equal(contractsRes.status, 200);
      const contractsBody = (await contractsRes.json()) as any;
      assert.equal(contractsBody.contracts.length, 1);
      assert.equal(contractsBody.contracts[0].symbol, 'SPY261218P00560000');

      const closeRes = await fetch(`${baseUrl}/api/alpaca/positions/NVDA?percentage=50`, {
        method: 'DELETE',
        headers: firebaseAuthHeaders(),
      });
      assert.equal(closeRes.status, 200);
      const closeBody = (await closeRes.json()) as any;
      assert.equal(closeBody.order.id, 'ord-close-77');

      const fullCloseRes = await fetch(`${baseUrl}/api/alpaca/positions/NVDA`, {
        method: 'DELETE',
        headers: firebaseAuthHeaders(),
      });
      assert.equal(fullCloseRes.status, 200);

      const cancelRes = await fetch(`${baseUrl}/api/alpaca/orders/order-to-cancel`, {
        method: 'DELETE',
        headers: firebaseAuthHeaders(),
      });
      assert.equal(cancelRes.status, 200);
      assert.equal(((await cancelRes.json()) as any).cancelled, true);
      const fullCloseCall = calls.find(
        (c) => c.method === 'DELETE' && c.url.includes('/v2/positions/NVDA?cancel_orders=true')
      );
      assert.ok(fullCloseCall, 'Expected full closePosition to send cancel_orders=true to Alpaca');
    });
  });
});
