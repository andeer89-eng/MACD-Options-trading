import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import {
  createWatchlistEvaluationId,
  createWatchlistEvaluationJournal,
  WatchlistEvaluationJournalError,
  type WatchlistEvaluationJournalInput,
} from './watchlistEvaluationJournal.ts';

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
const serviceAccountJson = JSON.stringify({
  client_email: 'journal-test@example.iam.gserviceaccount.com',
  private_key: privateKey,
  token_uri: 'https://oauth.test/token',
});
const baseInput: WatchlistEvaluationJournalInput = {
  ownerId: 'owner_123',
  symbol: 'aapl',
  setupId: 'AAPL-BULL-2-123456',
  ruleVersion: 'trullas-close-cross-v1',
  status: 'TRIGGERED',
  evaluatedAt: 1_800_000_000_000,
  lastClosedCandleTimestamp: 1_799_999_000_000,
  marketDataProvider: 'YAHOO_FINANCE_CHART_V8',
  normalizedPayloadSha256: 'a'.repeat(64),
  direction: 'BULLISH',
  threshold: 105,
  previousClose: 104,
  observedClose: 106,
  triggerCandleTimestamp: 1_799_999_000_000,
};

function createFakeFetch() {
  let savedRecordJson: string | undefined;
  let createCalls = 0;
  let readCalls = 0;
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url === 'https://oauth.test/token') {
      return new Response(JSON.stringify({ access_token: 'test-access-token', expires_in: 3600 }), { status: 200 });
    }
    if (url.includes('/watchlistEvaluationEvents?documentId=')) {
      createCalls++;
      if (savedRecordJson) return new Response(JSON.stringify({ error: 'already exists' }), { status: 409 });
      const body = JSON.parse(String(init?.body));
      savedRecordJson = body.fields.recordJson.stringValue;
      return new Response(JSON.stringify({ name: 'created' }), { status: 200 });
    }
    if (url.includes('/watchlistEvaluationEvents/')) {
      readCalls++;
      return new Response(JSON.stringify({
        fields: { recordJson: { stringValue: savedRecordJson } },
      }), { status: 200 });
    }
    throw new Error('Unexpected URL: ' + url);
  };
  return { fetchImpl, getCounts: () => ({ createCalls, readCalls }) };
}

test('evaluation identity is stable and scoped to owner, setup, rule, bar and data digest', () => {
  const id = createWatchlistEvaluationId(baseInput);
  assert.equal(id, createWatchlistEvaluationId({ ...baseInput, symbol: 'AAPL' }));
  assert.notEqual(id, createWatchlistEvaluationId({ ...baseInput, ownerId: 'other_owner' }));
  assert.notEqual(id, createWatchlistEvaluationId({ ...baseInput, normalizedPayloadSha256: 'b'.repeat(64) }));
});

test('journal append is idempotent for the same evidence record', async () => {
  const fake = createFakeFetch();
  const journal = createWatchlistEvaluationJournal({
    projectId: 'demo-project',
    databaseId: 'trading',
    serviceAccountJson,
    fetchImpl: fake.fetchImpl,
    now: () => 1_800_000_100_000,
  });
  const first = await journal.append(baseInput);
  const second = await journal.append({ ...baseInput, symbol: 'AAPL' });
  assert.equal(first.replayed, false);
  assert.equal(second.replayed, true);
  assert.equal(first.evaluationId, second.evaluationId);
  assert.deepEqual(fake.getCounts(), { createCalls: 2, readCalls: 1 });
});

test('same evaluation identity with changed evidence is a conflict', async () => {
  const fake = createFakeFetch();
  const journal = createWatchlistEvaluationJournal({
    projectId: 'demo-project', serviceAccountJson, fetchImpl: fake.fetchImpl,
  });
  await journal.append(baseInput);
  await assert.rejects(
    () => journal.append({ ...baseInput, status: 'NOT_TRIGGERED', reason: 'changed' }),
    (error: unknown) => error instanceof WatchlistEvaluationJournalError && error.status === 409
  );
});

test('invalid records are rejected before Firestore writes', async () => {
  let requests = 0;
  const journal = createWatchlistEvaluationJournal({
    projectId: 'demo-project',
    serviceAccountJson,
    fetchImpl: async () => {
      requests++;
      return new Response('{}', { status: 500 });
    },
  });
  await assert.rejects(
    () => journal.append({ ...baseInput, normalizedPayloadSha256: 'bad' }),
    (error: unknown) => error instanceof WatchlistEvaluationJournalError && error.status === 400
  );
  assert.equal(requests, 0);
});
