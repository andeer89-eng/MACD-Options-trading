import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { createFirestorePredictionJournal, FirestorePredictionJournalError } from './predictionJournalFirestore.ts';
import type { PredictionSnapshot } from './predictionJournal.ts';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
const serviceAccountJson = JSON.stringify({ client_email: 'journal-test@example.iam.gserviceaccount.com',
  private_key: privateKey, token_uri: 'https://oauth.test/token' });
const prediction: PredictionSnapshot = {
  predictionId: 'pred-stock-1', assetClass: 'STOCK', symbol: 'AAPL', createdAt: 1000, targetAt: 2000,
  evidencePackId: 'pack-1', evidencePackSha256: 'a'.repeat(64), committeeGeneratedAt: 1100, judgeGeneratedAt: 1200,
  disposition: 'APPROVE', riskMultiplier: 0.5, confidence: 0.8,
  probabilities: { positive: 0.7, neutral: 0.2, negative: 0.1 }, sourceRefs: ['sec:filing:1'],
  schemaVersion: '1.0.0', recordedAt: 1300, inputSha256: 'b'.repeat(64), snapshotSha256: 'c'.repeat(64),
};

function fakeFirestore() {
  const docs = new Map<string, { fields: Record<string, any>; updateTime: string }>();
  let revision = 0;
  let commitCalls = 0;
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url === 'https://oauth.test/token') return new Response(JSON.stringify({ access_token: 'test-token', expires_in: 3600 }), { status: 200 });
    const path = url.split('/documents')[1];
    if (init?.method === 'POST' && path === ':commit') {
      commitCalls++;
      const payload = JSON.parse(String(init.body));
      for (const write of payload.writes) {
        const name = write.update.name;
        const current = docs.get(name);
        if (write.currentDocument?.exists === false && current) return new Response('ALREADY_EXISTS', { status: 409 });
        if (write.currentDocument?.updateTime && current?.updateTime !== write.currentDocument.updateTime) {
          return new Response('FAILED_PRECONDITION', { status: 400 });
        }
      }
      for (const write of payload.writes) {
        revision++;
        docs.set(write.update.name, { fields: write.update.fields, updateTime: `t${revision}` });
      }
      return new Response(JSON.stringify({ writeResults: [] }), { status: 200 });
    }
    if (init?.method !== 'POST') {
      if (path.includes('?')) {
        const [collectionPath, queryString] = path.split('?');
        const params = new URLSearchParams(queryString);
        const prefix = `https://firestore.googleapis.com/v1/projects/demo-project/databases/(default)/documents${collectionPath}/`;
        const all = [...docs.entries()].filter(([name]) => name.startsWith(prefix))
          .sort((a, b) => Number(a[1].fields.sequence.integerValue) - Number(b[1].fields.sequence.integerValue));
        const offset = Number(params.get('pageToken') || 0);
        const size = Number(params.get('pageSize') || 500);
        const slice = all.slice(offset, offset + size);
        const documents = slice.map(([name, item]) => ({ name, fields: item.fields, updateTime: item.updateTime }));
        const nextPageToken = offset + size < all.length ? String(offset + size) : undefined;
        return new Response(JSON.stringify({ documents, nextPageToken }), { status: 200 });
      }
      const item = docs.get(url);
      if (!item) return new Response('NOT_FOUND', { status: 404 });
      return new Response(JSON.stringify({ fields: item.fields, updateTime: item.updateTime }), { status: 200 });
    }
    return new Response('Unexpected request', { status: 500 });
  };
  return { fetchImpl, counts: () => ({ commitCalls, documents: docs.size }) };
}

test('persists STOCK and OPTION event types in an atomic append-only hash chain', async () => {
  const fake = fakeFirestore();
  const journal = createFirestorePredictionJournal({ projectId: 'demo-project', serviceAccountJson, fetchImpl: fake.fetchImpl, now: () => 10_000 });
  const first = await journal.append('owner_1', { eventType: 'PREDICTION_RECORDED', prediction });
  const optionPrediction = { ...prediction, predictionId: 'pred-option-1', assetClass: 'OPTION' as const,
    contractId: 'AAPL261218C00200000' };
  const second = await journal.append('owner_1', { eventType: 'PREDICTION_RECORDED', prediction: optionPrediction });
  assert.equal(first.event.sequence, 1);
  assert.equal(first.event.prevHash, '0'.repeat(64));
  assert.equal(second.event.sequence, 2);
  assert.equal(second.event.prevHash, first.event.eventHash);
  assert.equal(fake.counts().commitCalls, 2);
});

test('retries are idempotent when the exact same event is appended again', async () => {
  const fake = fakeFirestore();
  const journal = createFirestorePredictionJournal({ projectId: 'demo-project', serviceAccountJson, fetchImpl: fake.fetchImpl });
  const first = await journal.append('owner_1', { eventType: 'PREDICTION_RECORDED', prediction });
  const replay = await journal.append('owner_1', { eventType: 'PREDICTION_RECORDED', prediction });
  assert.equal(first.event.eventHash, replay.event.eventHash);
  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  assert.equal(fake.counts().commitCalls, 1);
});

test('rejects invalid owner and malformed event before Firestore access', async () => {
  let requests = 0;
  const journal = createFirestorePredictionJournal({ projectId: 'demo-project', serviceAccountJson,
    fetchImpl: async () => { requests++; return new Response('{}', { status: 500 }); } });
  await assert.rejects(() => journal.append('../other', { eventType: 'PREDICTION_RECORDED', prediction }),
    (error: unknown) => error instanceof FirestorePredictionJournalError && error.status === 400);
  assert.equal(requests, 0);
});


test('replays paginated Firestore events and verifies the complete chain against the head', async () => {
  const fake = fakeFirestore();
  const journal = createFirestorePredictionJournal({ projectId: 'demo-project', serviceAccountJson, fetchImpl: fake.fetchImpl });
  await journal.append('owner_1', { eventType: 'PREDICTION_RECORDED', prediction });
  const optionPrediction = { ...prediction, predictionId: 'pred-option-2', assetClass: 'OPTION' as const,
    contractId: 'AAPL261218C00200000' };
  await journal.append('owner_1', { eventType: 'PREDICTION_RECORDED', prediction: optionPrediction });
  const replay = await journal.readAll('owner_1', 1);
  assert.equal(replay.events.length, 2);
  assert.deepEqual(replay.events.map(event => event.sequence), [1, 2]);
  assert.equal(replay.verification.valid, true);
  assert.equal(replay.verification.headHash, replay.events[1].eventHash);
});

test('rejects malformed owner before attempting journal replay', async () => {
  let requests = 0;
  const journal = createFirestorePredictionJournal({ projectId: 'demo-project', serviceAccountJson,
    fetchImpl: async () => { requests++; return new Response('{}', { status: 200 }); } });
  await assert.rejects(() => journal.readAll('../other'), (error: unknown) =>
    error instanceof FirestorePredictionJournalError && error.status === 400);
  assert.equal(requests, 0);
});
