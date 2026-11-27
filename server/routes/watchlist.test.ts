import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { createWatchlistTriggerRouter } from './watchlist.ts';

async function withServer(router: ReturnType<typeof createWatchlistTriggerRouter>, run: (baseUrl: string) => Promise<void>) {
  const app = express();
  app.use(express.json());
  app.use(router);
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

const serviceAccountJson = JSON.stringify({
  client_email: 'test@example.iam.gserviceaccount.com',
  private_key: 'not-used-with-invalid-worker-credentials',
});

test('watchlist trigger endpoint fails closed when worker or service account is not configured', async () => {
  await withServer(createWatchlistTriggerRouter({ projectId: 'demo-project' }), async baseUrl => {
    const response = await fetch(baseUrl + '/api/internal/watchlist/trigger', { method: 'POST' });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  });
});

test('watchlist trigger endpoint requires the dedicated worker bearer token', async () => {
  await withServer(createWatchlistTriggerRouter({
    projectId: 'demo-project',
    serviceAccountJson,
    workerToken: 'a-long-test-worker-token',
  }), async baseUrl => {
    const response = await fetch(baseUrl + '/api/internal/watchlist/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer wrong-token' },
      body: JSON.stringify({}),
    });
    assert.equal(response.status, 401);
  });
});

test('watchlist trigger endpoint validates the complete trigger evidence payload', async () => {
  await withServer(createWatchlistTriggerRouter({
    projectId: 'demo-project',
    serviceAccountJson,
    workerToken: 'a-long-test-worker-token',
  }), async baseUrl => {
    const response = await fetch(baseUrl + '/api/internal/watchlist/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer a-long-test-worker-token' },
      body: JSON.stringify({
        ownerId: 'owner_123',
        symbol: 'AAPL',
        triggerId: 'trigger_123456',
        evidence: { ruleId: 'breakout', source: 'scanner', observedPrice: 0, threshold: 100, evaluatedAt: 'not-a-date' },
      }),
    });
    assert.equal(response.status, 400);
  });
});
