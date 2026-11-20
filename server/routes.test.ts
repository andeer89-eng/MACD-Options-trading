import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../server.ts';
import type { Candle } from '../src/utils/trullasStrategy.ts';

function buildFixtureCandles(count: number = 120): Candle[] {
  const startMs = Date.UTC(2025, 0, 2, 14, 30, 0);
  const candles: Candle[] = [];
  let price = 150;
  for (let i = 0; i < count; i++) {
    const wave = Math.sin(i / 6) * 4.5 + Math.cos(i / 11) * 2.2;
    const open = Number((price + wave * 0.25).toFixed(2));
    const close = Number((price + wave * 0.6 + 0.12).toFixed(2));
    const high = Number((Math.max(open, close) + 1.4).toFixed(2));
    const low = Number((Math.min(open, close) - 1.3).toFixed(2));
    price = close;
    const ts = startMs + i * 86_400_000;
    candles.push({
      timestamp: ts,
      dateStr: new Date(ts).toISOString().slice(0, 10),
      open,
      high,
      low,
      close,
      volume: 12_000_000 + (i % 15) * 450_000,
    });
  }
  return candles;
}

describe('HTTP Express Integration Routes', () => {
  let server: http.Server;
  let baseUrl = '';
  const fixtureCandles = buildFixtureCandles(120);

  before(async () => {
    const { app } = await createApp({
      attachFrontend: false,
      streamPulseIntervalMs: 40,
      fetchYahooDataOverride: async (symbol) => {
        if (symbol === 'EMPTY') return [];
        return fixtureCandles;
      },
      fetchSECFilingsOverride: async (symbol) => ({
        symbol: symbol.toUpperCase(),
        cik: '0000320193',
        available: true,
        filings: [
          {
            form: '10-K',
            filingDate: '2025-11-01',
            description: 'Annual Report (Fixture)',
            url: 'https://www.sec.gov/ixviewer/doc',
          },
        ],
      }),
    });

    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address();
    if (!addr || typeof addr === 'string') {
      throw new Error('Failed to bind ephemeral port for HTTP tests');
    }
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  after(async () => {
    await new Promise<void>((resolve) => {
      server.closeAllConnections?.();
      server.close(() => resolve());
    });
  });

  it('GET /api/system-health returns telemetry shape with 200', async () => {
    const res = await fetch(`${baseUrl}/api/system-health`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.ok(body.status === 'OPTIMAL' || body.status === 'DEGRADED');
    assert.equal(typeof body.uptimeSeconds, 'number');
    assert.equal(typeof body.memory?.heapUsedMb, 'number');
    assert.equal(typeof body.cache?.cachedSymbolsCount, 'number');
    assert.equal(typeof body.apiQuota?.usedRequests, 'number');
    assert.equal(typeof body.daemon?.nodeVersion, 'string');
  });

  it('POST /api/system-health/clear-cache clears caches and returns numeric clearedCount', async () => {
    const res = await fetch(`${baseUrl}/api/system-health/clear-cache`, {
      method: 'POST',
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.success, true);
    assert.equal(typeof body.clearedCount, 'number');
    assert.ok(body.clearedCount >= 0);
  });

  it('POST /api/optimize-strategy validates bad inputs with 400 and succeeds with 200 on valid payload', async () => {
    const invalidCases = [
      {},
      { symbol: '$$BAD_SYMBOL!' },
      { symbol: 'AAPL', targetMode: 'moon_mode' },
      { symbol: 'AAPL', initialBalance: -500 },
      { symbol: 'AAPL', riskPerTradePct: 99 },
    ];

    for (const payload of invalidCases) {
      const badRes = await fetch(`${baseUrl}/api/optimize-strategy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      assert.equal(badRes.status, 400, `Expected 400 for payload ${JSON.stringify(payload)}`);
    }

    const okRes = await fetch(`${baseUrl}/api/optimize-strategy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol: 'aapl',
        timeframe: '1d',
        range: '1y',
        initialBalance: 10000,
        riskPerTradePct: 1.5,
        targetMode: 'tranches',
        minQualityScore: 55,
      }),
    });
    assert.equal(okRes.status, 200);
    const report = (await okRes.json()) as any;
    assert.equal(report.symbol, 'AAPL');
    assert.ok(report.baselineMetrics);
    assert.ok(report.optimalCandidate);
    assert.ok(Array.isArray(report.topCandidates));
    assert.ok(report.recommendedThresholds);
  });

  it('GET /api/candles enforces query validation and returns indicators + divergences on valid query', async () => {
    const missingSym = await fetch(`${baseUrl}/api/candles`);
    assert.equal(missingSym.status, 400);

    const invalidSym = await fetch(`${baseUrl}/api/candles?symbol=${encodeURIComponent('AAPL;drop')}`);
    assert.equal(invalidSym.status, 400);

    const invalidTf = await fetch(`${baseUrl}/api/candles?symbol=AAPL&timeframe=99x`);
    assert.equal(invalidTf.status, 400);

    const validRes = await fetch(`${baseUrl}/api/candles?symbol=aapl&timeframe=1d&range=3mo`);
    assert.equal(validRes.status, 200);
    const data = (await validRes.json()) as any;
    assert.equal(data.symbol, 'AAPL');
    assert.equal(data.timeframe, '1d');
    assert.equal(data.count, 120);
    assert.equal(data.candles.length, 120);
    assert.equal(data.indicatorPoints.length, 120);
    assert.ok(Array.isArray(data.divergences));
    assert.equal(data.sec?.available, true);
    assert.ok(data.feedMeta);
  });

  it('POST /api/run-python blocks shell injection, empty arrays, and oversized ticker lists with 400', async () => {
    const malicious = await fetch(`${baseUrl}/api/run-python`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tickers: ['AAPL; rm -rf /'] }),
    });
    assert.equal(malicious.status, 400);
    const malBody = (await malicious.json()) as any;
    assert.equal(malBody.success, false);

    const empty = await fetch(`${baseUrl}/api/run-python`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tickers: [] }),
    });
    assert.equal(empty.status, 400);

    const tooMany = await fetch(`${baseUrl}/api/run-python`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tickers: Array.from({ length: 60 }, (_, idx) => `SYM${idx}`),
      }),
    });
    assert.equal(tooMany.status, 400);
  });

  it('GET /api/stream sets SSE headers, emits market-pulse JSON frames, and terminates on abort', async () => {
    const controller = new AbortController();
    const res = await fetch(`${baseUrl}/api/stream`, { signal: controller.signal });
    assert.equal(res.status, 200);
    assert.ok(res.headers.get('content-type')?.includes('text/event-stream'));

    const reader = res.body?.getReader();
    assert.ok(reader, 'Expected readable SSE response body');

    const decoder = new TextDecoder();
    let buffer = '';
    const payloads: any[] = [];

    const deadline = Date.now() + 2000;
    while (payloads.length < 2 && Date.now() < deadline) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';
      for (const frame of frames) {
        if (!frame.includes('event: market-pulse')) continue;
        const dataLine = frame
          .split('\n')
          .find((line) => line.startsWith('data: '));
        if (dataLine) {
          payloads.push(JSON.parse(dataLine.slice(6)));
        }
      }
    }

    controller.abort();
    await reader.cancel().catch(() => {});

    assert.ok(payloads.length >= 2, `Expected >=2 SSE market-pulse frames, got ${payloads.length}`);
    assert.equal(payloads[0].type, 'connected');
    assert.equal(payloads[1].type, 'pulse');
    assert.equal(typeof payloads[0].uptimeSeconds, 'number');
    assert.ok(payloads[0].status === 'OPTIMAL' || payloads[0].status === 'DEGRADED');
  });
});
