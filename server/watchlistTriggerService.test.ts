import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import {
  createWatchlistTriggerService,
  WatchlistTriggerError,
} from './services/watchlistTrigger.ts';

function createFixture(options: {
  ownerId?: string;
  symbol?: string;
  status?: string;
  commitStatus?: number;
} = {}) {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const requests: Array<{ url: string; method: string; body?: string }> = [];
  let eventFields: Record<string, unknown> | null = null;
  let commitCount = 0;
  const fetchImpl: typeof fetch = async (input, init = {}) => {
    const url = String(input);
    const method = init.method || 'GET';
    requests.push({ url, method, body: typeof init.body === 'string' ? init.body : undefined });
    if (url === 'https://oauth2.googleapis.com/token') {
      return new Response(JSON.stringify({ access_token: 'admin-token', expires_in: 3600 }), { status: 200 });
    }
    if (url.endsWith('/watchlistTriggerEvents/' + 'e'.repeat(64))) {
      if (eventFields) return new Response(JSON.stringify({ fields: eventFields }), { status: 200 });
      return new Response('{}', { status: 404 });
    }
    if (url.endsWith('/users/owner-1/watchlistItems/AAPL') && method === 'GET') {
      const fields = {
        ownerId: { stringValue: options.ownerId ?? 'owner-1' },
        symbol: { stringValue: options.symbol ?? 'AAPL' },
        status: { stringValue: options.status ?? 'WATCHING' },
      };
      return new Response(JSON.stringify({
        name: 'projects/demo/databases/watchlist-db/documents/users/owner-1/watchlistItems/AAPL',
        updateTime: '2026-11-27T10:00:00.000000Z',
        fields,
      }), { status: 200 });
    }
    if (url.endsWith('/documents:commit') && method === 'POST') {
      commitCount++;
      if (options.commitStatus && options.commitStatus !== 200) return new Response('{}', { status: options.commitStatus });
      const body = JSON.parse(String(init.body || '{}'));
      eventFields = body.writes[1].update.fields;
      return new Response('{}', { status: 200 });
    }
    throw new Error('Unexpected mocked Firestore request: ' + method + ' ' + url);
  };
  const service = createWatchlistTriggerService({
    projectId: 'demo-project',
    databaseId: 'watchlist-db',
    serviceAccountJson: JSON.stringify({
      client_email: 'test@demo-project.iam.gserviceaccount.com',
      private_key: privatePem,
    }),
    fetchImpl,
    now: () => Date.UTC(2026, 10, 27, 12, 0, 0),
  });
  const input = {
    ownerId: 'owner-1',
    symbol: 'AAPL',
    triggerId: 'eeeeeeeeeeeeeeeeeeeeeeee',
    evidence: {
      ruleId: 'breakout-v1',
      source: 'trusted-feed',
      observedPrice: 192.4,
      threshold: 190,
      evaluatedAt: '2026-11-27T11:59:00.000Z',
    },
  };
  return { service, input, requests, get commitCount() { return commitCount; } };
}

test('watchlist trigger service commits status and immutable audit event atomically', async () => {
  const fixture = createFixture();
  const result = await fixture.service.transition(fixture.input);
  assert.deepEqual(result, { status: 'TRIGGERED', replayed: false });
  assert.equal(fixture.commitCount, 1);
  const commit = fixture.requests.find(request => request.method === 'POST' && request.url.endsWith('/documents:commit'));
  assert.ok(commit);
  const body = JSON.parse(commit.body || '{}');
  assert.equal(body.writes.length, 2);
  assert.equal(body.writes[0].update.fields.status.stringValue, 'TRIGGERED');
  assert.equal(body.writes[0].currentDocument.updateTime, '2026-11-27T10:00:00.000000Z');
  assert.equal(body.writes[1].currentDocument.exists, false);
  assert.equal(body.writes[1].update.fields.triggerId.stringValue, fixture.input.triggerId);
  assert.equal(body.writes[1].update.fields.ownerId.stringValue, 'owner-1');
});

test('watchlist trigger service makes retries idempotent for the same trigger, owner, and symbol', async () => {
  const fixture = createFixture();
  const first = await fixture.service.transition(fixture.input);
  const second = await fixture.service.transition(fixture.input);
  assert.equal(first.replayed, false);
  assert.equal(second.replayed, true);
  assert.equal(fixture.commitCount, 1);
});

test('watchlist trigger service rejects owner or symbol mismatches and terminal source states', async () => {
  for (const options of [
    { ownerId: 'different-owner' },
    { symbol: 'MSFT' },
    { status: 'EXPIRED' },
    { status: 'TRIGGERED' },
  ]) {
    const fixture = createFixture(options);
    await assert.rejects(() => fixture.service.transition(fixture.input), WatchlistTriggerError);
    assert.equal(fixture.commitCount, 0);
  }
});

test('watchlist trigger service rejects invalid payloads before contacting Google APIs', async () => {
  const fixture = createFixture();
  await assert.rejects(
    () => fixture.service.transition({ ...fixture.input, triggerId: 'bad id' }),
    (error: unknown) => error instanceof WatchlistTriggerError && error.status === 400
  );
  assert.equal(fixture.requests.length, 0);
});

test('watchlist trigger service returns a conflict on a concurrent Firestore update', async () => {
  const fixture = createFixture({ commitStatus: 409 });
  await assert.rejects(
    () => fixture.service.transition(fixture.input),
    (error: unknown) => error instanceof WatchlistTriggerError && error.status === 409
  );
});
