import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  sendWebhookAlert,
  validateWebhookUrl,
} from './webhookAlerts.ts';
import type { DivergenceSetup } from './trullasStrategy.ts';

const sampleSetup: DivergenceSetup = {
  id: 'setup-1',
  symbol: 'AAPL',
  timeframe: '1d',
  type: 'BULLISH_TRIPLE',
  qualityScore: 88,
  points: [],
  currentPrice: 200,
  triggerPrice: 201,
  stopLoss: 195,
  fibLevels: { fib0: 195, fib236: 197, fib382: 199, fib500: 200, fib618: 202, fib1000: 205 },
  targets: { tp1: 206, tp2: 210, tp3: 215 },
  riskRewardRatio: 2.0,
  confluenceChecks: {
    priceDivergence: true,
    macdDivergence: true,
    rsiDivergence: true,
    volumeExhaustion: true,
    macdCrossConfirmed: true,
  },
  scalingTranches: { tranche1: '', tranche2: '', tranche3: '' },
  detectedAt: 1700000000000,
};

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('webhookAlerts validation & delivery hardening', () => {
  it('validates webhook URLs strictly to http(s) with valid hostnames', () => {
    assert.equal(validateWebhookUrl('https://hooks.zapier.com/hooks/catch/123/abc').valid, true);
    assert.equal(validateWebhookUrl('http://localhost:8080/hook').valid, true);

    assert.equal(validateWebhookUrl('').valid, false);
    assert.equal(validateWebhookUrl('not-a-url').valid, false);
    assert.equal(validateWebhookUrl('javascript:alert(1)').valid, false);
    assert.equal(validateWebhookUrl('file:///etc/passwd').valid, false);
    assert.equal(validateWebhookUrl('ftp://hooks.example.com/test').valid, false);
  });

  it('blocks invalid or unsafe URLs before invoking fetch', async () => {
    let fetchCalls = 0;
    globalThis.fetch = (async () => {
      fetchCalls++;
      return new Response('ok', { status: 200 });
    }) as typeof fetch;

    const res = await sendWebhookAlert('javascript:alert(1)', sampleSetup);
    assert.equal(res.success, false);
    assert.equal(fetchCalls, 0);
  });

  it('posts expected JSON payload on 200 and surfaces HTTP error responses', async () => {
    let capturedInit: RequestInit | undefined;
    let capturedUrl = '';
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedInit = init;
      return new Response('ok', { status: 200 });
    }) as typeof fetch;

    const okRes = await sendWebhookAlert('  https://hooks.example.com/trigger  ', sampleSetup);
    assert.equal(okRes.success, true);
    assert.equal(capturedUrl, 'https://hooks.example.com/trigger');
    assert.equal(capturedInit?.method, 'POST');
    const parsedBody = JSON.parse(String(capturedInit?.body));
    assert.equal(parsedBody.alert, 'TRULLÀS MACD ALERT');
    assert.equal(parsedBody.setup.symbol, 'AAPL');

    globalThis.fetch = (async () => new Response('bad gateway', { status: 502, statusText: 'Bad Gateway' })) as typeof fetch;
    const errRes = await sendWebhookAlert('https://hooks.example.com/trigger', sampleSetup);
    assert.equal(errRes.success, false);
    assert.ok(errRes.error?.includes('502'));
  });

  it('aborts hanging webhook requests cleanly when timeoutMs elapses', async () => {
    globalThis.fetch = ((_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const err = new Error('The operation was aborted.');
          err.name = 'AbortError';
          reject(err);
        });
      })) as typeof fetch;

    const res = await sendWebhookAlert('https://hooks.example.com/slow', sampleSetup, { timeoutMs: 25 });
    assert.equal(res.success, false);
    assert.ok(res.error?.toLowerCase().includes('timed out') || res.error?.toLowerCase().includes('abort'));
  });
});
