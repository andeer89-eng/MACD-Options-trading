import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import {
  createWatchlistAdminService,
  WatchlistTransitionConflictError,
} from './watchlistAdmin.ts';

function makeService(options: {
  ownerId?: string;
  symbol?: string;
  status?: string;
  direction?: string;
  patchStatus?: number;
} = {}) {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const requests: Array<{ url: string; method: string; body?: string }> = [];
  const fetchImpl: typeof fetch = async (input, init = {}) => {
    const url = String(input);
    const method = init.method || 'GET';
    requests.push({ url, method, body: typeof init.body === 'string' ? init.body : undefined });
    if (url === 'https://oauth2.googleapis.com/token') {
      return new Response(JSON.stringify({ access_token: 'admin-token', expires_in: 3600 }), { status: 200 });
    }
    if (method === 'GET') {
      const fields = {
        ownerId: { stringValue: options.ownerId ?? 'owner-1' },
        symbol: { stringValue: options.symbol ?? 'AAPL' },
        status: { stringValue: options.status ?? 'WATCHING' },
        direction: { stringValue: options.direction ?? 'long' },
      };
      return new Response(JSON.stringify({ name: 'users/owner-1/watchlistItems/AAPL', updateTime: '2026-11-27T10:00:00Z', fields }), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: options.patchStatus ?? 200 });
  };
  const service = createWatchlistAdminService({
    projectId: 'test-project',
    databaseId: 'named-watchlist-db',
    serviceAccountJson: JSON.stringify({ client_email: 'test@test-project.iam.gserviceaccount.com', private_key: privatePem }),
    fetchImpl,
    now: () => Date.UTC(2026, 10, 27, 12, 0, 0),
  });
  return { service, requests };
}

describe('Watchlist Admin trigger persistence', () => {
  it('uses the configured named database and compare-and-set updateTime precondition', async () => {
    const { service, requests } = makeService();
    const result = await service.markTriggered({
      uid: 'owner-1',
      symbol: 'AAPL',
      direction: 'long',
      timeframe: '1d',
      currentPrice: 123.45,
      atr: 2.1,
      setupId: 'AAPL-BULL-3-1',
      detectedAt: 1_000,
    });
    assert.equal(result.status, 'TRIGGERED');
    assert.equal(result.symbol, 'AAPL');
    const patch = requests.find(request => request.method === 'PATCH');
    assert.ok(patch);
    assert.match(patch.url, /databases\/named-watchlist-db\/documents\/users\/owner-1\/watchlistItems\/AAPL/);
    assert.match(patch.url, /currentDocument.updateTime=2026-11-27T10%3A00%3A00Z/);
    const body = JSON.parse(patch.body || '{}');
    assert.equal(body.fields.status.stringValue, 'TRIGGERED');
    assert.equal(body.fields.triggerEvidence.mapValue.fields.source.stringValue, 'server-market-divergence');
  });

  it('refuses to update a document owned by another user', async () => {
    const { service, requests } = makeService({ ownerId: 'attacker' });
    await assert.rejects(() => service.markTriggered({
      uid: 'owner-1', symbol: 'AAPL', direction: 'long', timeframe: '1d',
      currentPrice: 123, atr: 2, setupId: 'setup', detectedAt: 1,
    }), WatchlistTransitionConflictError);
    assert.equal(requests.some(request => request.method === 'PATCH'), false);
  });

  it('refuses terminal or already-triggered states and direction mismatches', async () => {
    for (const options of [{ status: 'EXPIRED' }, { status: 'TRIGGERED' }, { direction: 'short' }]) {
      const { service, requests } = makeService(options);
      await assert.rejects(() => service.markTriggered({
        uid: 'owner-1', symbol: 'AAPL', direction: 'long', timeframe: '1d',
        currentPrice: 123, atr: 2, setupId: 'setup', detectedAt: 1,
      }), WatchlistTransitionConflictError);
      assert.equal(requests.some(request => request.method === 'PATCH'), false);
    }
  });

  it('maps a concurrent Firestore update to a conflict instead of overwriting', async () => {
    const { service } = makeService({ patchStatus: 409 });
    await assert.rejects(() => service.markTriggered({
      uid: 'owner-1', symbol: 'AAPL', direction: 'long', timeframe: '1d',
      currentPrice: 123, atr: 2, setupId: 'setup', detectedAt: 1,
    }), WatchlistTransitionConflictError);
  });
});
