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
    const parsed = new URL(url);
    const path = parsed.pathname.split('/documents')[1];
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
      if (parsed.searchParams.has('pageSize')) {
        const collectionPath = path;
        const prefix = `projects/demo-project/databases/(default)/documents${collectionPath}/`;
        const documents = [...docs.entries()]
          .filter(([name]) => name.startsWith(prefix) && !name.slice(prefix.length).includes('/'))
          .map(([name, item]) => ({ name, fields: item.fields, updateTime: item.updateTime }));
        return new Response(JSON.stringify({ documents }), { status: 200 });
      }
      const item = docs.get(`projects/demo-project/databases/(default)/documents${path}`);
      if (!item) return new Response('NOT_FOUND', { status: 404 });
      return new Response(JSON.stringify({ fields: item.fields, updateTime: item.updateTime }), { status: 200 });
    }
    return new Response('Unexpected request', { status: 500 });
  };
  return {
    fetchImpl,
    counts: () => ({ commitCalls, documents: docs.size }),
    tamperFirstEvent: () => {
      const entry = [...docs.entries()].find(([name]) => name.includes('/predictionJournalEvents/'));
      if (!entry) throw new Error('No event to tamper.');
      const eventJson = entry[1].fields.eventJson.stringValue;
      const event = JSON.parse(eventJson);
      event.eventHash = 'f'.repeat(64);
      entry[1].fields.eventJson = { stringValue: JSON.stringify(event) };
    },
    deleteHead: (ownerId: string) => {
      const name = `projects/demo-project/databases/(default)/documents/users/${ownerId}/predictionJournalMeta/head`;
      docs.delete(name);
    },
  };
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

test('enforces prediction identity uniqueness and verifies the complete persisted hash chain', async () => {
  const fake = fakeFirestore();
  const journal = createFirestorePredictionJournal({ projectId: 'demo-project', serviceAccountJson, fetchImpl: fake.fetchImpl });
  const first = await journal.append('owner_1', { eventType: 'PREDICTION_RECORDED', prediction });
  await assert.rejects(
    () => journal.append('owner_1', { eventType: 'PREDICTION_RECORDED', prediction: { ...prediction, snapshotSha256: 'd'.repeat(64) } }),
    (error: unknown) => error instanceof FirestorePredictionJournalError && error.status === 409,
  );
  const events = await journal.readEvents('owner_1');
  assert.equal(events.length, 1);
  assert.equal(events[0].eventHash, first.event.eventHash);
  const verification = await journal.verify('owner_1');
  assert.equal(verification.valid, true);
  assert.equal(verification.headMatches, true);
});

test('reports a missing persisted head as an integrity failure, not a valid empty journal', async () => {
  const fake = fakeFirestore();
  const journal = createFirestorePredictionJournal({ projectId: 'demo-project', serviceAccountJson, fetchImpl: fake.fetchImpl });
  await journal.append('owner_1', { eventType: 'PREDICTION_RECORDED', prediction });
  fake.deleteHead('owner_1');
  const verification = await journal.verify('owner_1');
  assert.equal(verification.valid, false);
  assert.equal(verification.headMatches, false);
});

test('detects a tampered persisted event during full-history verification', async () => {
  const fake = fakeFirestore();
  const journal = createFirestorePredictionJournal({ projectId: 'demo-project', serviceAccountJson, fetchImpl: fake.fetchImpl });
  await journal.append('owner_1', { eventType: 'PREDICTION_RECORDED', prediction });
  fake.tamperFirstEvent();
  const verification = await journal.verify('owner_1');
  assert.equal(verification.valid, false);
  assert.equal(verification.headMatches, false);
  assert.equal(verification.brokenAtSequence, 1);
});

test('persists and idempotently replays outcome labels with their own uniqueness key', async () => {
  const fake = fakeFirestore();
  const journal = createFirestorePredictionJournal({ projectId: 'demo-project', serviceAccountJson, fetchImpl: fake.fetchImpl });
  await journal.append('owner_1', { eventType: 'PREDICTION_RECORDED', prediction });
  const outcome = { assetClass: 'STOCK' as const, realizedAt: 3000, observedAt: 3100, outcome: 'POSITIVE' as const,
    totalReturnPct: 12, labelSource: 'test-fixture' };
  const first = await journal.labelOutcome('owner_1', prediction.predictionId, outcome);
  const replay = await journal.labelOutcome('owner_1', prediction.predictionId, outcome);
  assert.equal(first.event.eventHash, replay.event.eventHash);
  assert.equal(replay.replayed, true);
  const verification = await journal.verify('owner_1');
  assert.equal(verification.valid, true);
  assert.equal(verification.length, 2);
});

test('rejects raw OUTCOME_LABELED appends so semantic validation cannot be bypassed', async () => {
  let requests = 0;
  const journal = createFirestorePredictionJournal({ projectId: 'demo-project', serviceAccountJson,
    fetchImpl: async () => { requests++; return new Response('{}', { status: 500 }); } });
  const outcome = { assetClass: 'STOCK' as const, realizedAt: 3000, observedAt: 3100, outcome: 'POSITIVE' as const,
    totalReturnPct: 12, labelSource: 'test-fixture' };
  await assert.rejects(
    () => journal.append('owner_1', { eventType: 'OUTCOME_LABELED', predictionId: prediction.predictionId, outcome }),
    (error: unknown) => error instanceof FirestorePredictionJournalError && error.status === 400 &&
      error.message.includes('labelOutcome'),
  );
  assert.equal(requests, 0);
});

test('rejects invalid owner and malformed event before Firestore access', async () => {
  let requests = 0;
  const journal = createFirestorePredictionJournal({ projectId: 'demo-project', serviceAccountJson,
    fetchImpl: async () => { requests++; return new Response('{}', { status: 500 }); } });
  await assert.rejects(() => journal.append('../other', { eventType: 'PREDICTION_RECORDED', prediction }),
    (error: unknown) => error instanceof FirestorePredictionJournalError && error.status === 400);
  assert.equal(requests, 0);
});


test('semantic outcome labeling requires an existing prediction and matching asset class', async () => {
  const fake = fakeFirestore();
  const journal = createFirestorePredictionJournal({ projectId: 'demo-project', serviceAccountJson, fetchImpl: fake.fetchImpl });
  const stockOutcome = { assetClass: 'STOCK' as const, realizedAt: 3000, observedAt: 3100, outcome: 'POSITIVE' as const,
    totalReturnPct: 12, labelSource: 'test-fixture' };
  await assert.rejects(() => journal.labelOutcome('owner_1', 'missing-prediction', stockOutcome),
    (error: unknown) => error instanceof Error && error.message.includes('PREDICTION_NOT_FOUND'));
  await journal.append('owner_1', { eventType: 'PREDICTION_RECORDED', prediction });
  const optionOutcome = { assetClass: 'OPTION' as const, realizedAt: 3000, observedAt: 3100, outcome: 'POSITIVE' as const,
    contractReturnPct: 20, underlyingReturnPct: 5, exitMethod: 'CLOSED' as const, entryPremium: 2, exitValue: 2.4,
    labelSource: 'test-fixture' };
  await assert.rejects(() => journal.labelOutcome('owner_1', prediction.predictionId, optionOutcome),
    (error: unknown) => error instanceof Error && error.message.includes('OUTCOME_ASSET_CLASS_MISMATCH'));
  assert.equal((await journal.readEvents('owner_1')).length, 1);
});

test('semantic outcome labeling enforces target time and immutable relabeling', async () => {
  const fake = fakeFirestore();
  const journal = createFirestorePredictionJournal({ projectId: 'demo-project', serviceAccountJson, fetchImpl: fake.fetchImpl, now: () => 10_000 });
  await journal.append('owner_1', { eventType: 'PREDICTION_RECORDED', prediction });
  const early = { assetClass: 'STOCK' as const, realizedAt: 1500, observedAt: 1600, outcome: 'POSITIVE' as const,
    totalReturnPct: 12, labelSource: 'test-fixture' };
  await assert.rejects(() => journal.labelOutcome('owner_1', prediction.predictionId, early),
    (error: unknown) => error instanceof Error && error.message.includes('OUTCOME_BEFORE_TARGET'));
  const valid = { ...early, realizedAt: 3000, observedAt: 3100 };
  const first = await journal.labelOutcome('owner_1', prediction.predictionId, valid);
  const replay = await journal.labelOutcome('owner_1', prediction.predictionId, valid);
  assert.equal(first.event.eventHash, replay.event.eventHash);
  assert.equal(replay.replayed, true);
  await assert.rejects(() => journal.labelOutcome('owner_1', prediction.predictionId, { ...valid, outcome: 'NEGATIVE' }),
    (error: unknown) => error instanceof Error && error.message.includes('OUTCOME_ALREADY_LABELED'));
  const verification = await journal.verify('owner_1');
  assert.equal(verification.valid, true);
  assert.equal(verification.length, 2);
});

test('blocks semantic outcome labeling when persisted journal integrity fails', async () => {
  const fake = fakeFirestore();
  const journal = createFirestorePredictionJournal({ projectId: 'demo-project', serviceAccountJson, fetchImpl: fake.fetchImpl });
  await journal.append('owner_1', { eventType: 'PREDICTION_RECORDED', prediction });
  fake.tamperFirstEvent();
  const outcome = { assetClass: 'STOCK' as const, realizedAt: 3000, observedAt: 3100, outcome: 'POSITIVE' as const,
    totalReturnPct: 12, labelSource: 'test-fixture' };
  await assert.rejects(() => journal.labelOutcome('owner_1', prediction.predictionId, outcome),
    (error: unknown) => error instanceof FirestorePredictionJournalError && error.status === 409);
});


test('builds separate STOCK and OPTION calibration reports only from integrity-verified persisted outcomes', async () => {
  const fake = fakeFirestore();
  const journal = createFirestorePredictionJournal({ projectId: 'demo-project', serviceAccountJson, fetchImpl: fake.fetchImpl });
  const optionPrediction: PredictionSnapshot = { ...prediction, predictionId: 'pred-option-calibration',
    assetClass: 'OPTION', contractId: 'AAPL261218C00200000' };
  await journal.append('owner_1', { eventType: 'PREDICTION_RECORDED', prediction });
  await journal.append('owner_1', { eventType: 'PREDICTION_RECORDED', prediction: optionPrediction });
  await journal.labelOutcome('owner_1', prediction.predictionId, { assetClass: 'STOCK', realizedAt: 3000,
    observedAt: 3100, outcome: 'POSITIVE', totalReturnPct: 12, benchmarkReturnPct: 5, labelSource: 'test-fixture' });
  await journal.labelOutcome('owner_1', optionPrediction.predictionId, { assetClass: 'OPTION', realizedAt: 3000,
    observedAt: 3100, outcome: 'NEGATIVE', contractReturnPct: -20, underlyingReturnPct: -3,
    exitMethod: 'CLOSED', entryPremium: 2, exitValue: 1.6, labelSource: 'test-fixture' });
  const report = await journal.getCalibrationReport('owner_1', 2);
  assert.deepEqual(report.integrity, { valid: true, headMatches: true, length: 4,
    headHash: (await journal.verify('owner_1')).headHash });
  assert.equal(report.stock.assetClass, 'STOCK');
  assert.equal(report.stock.overall.sampleSize, 1);
  assert.equal(report.stock.benchmark.sampleSize, 1);
  assert.equal(report.stock.benchmark.meanExcessReturnPct, 7);
  assert.equal(report.option.assetClass, 'OPTION');
  assert.equal(report.option.overall.sampleSize, 1);
  assert.equal(report.option.exitMethodCohorts.find(cohort => cohort.key === 'CLOSED')?.report.sampleSize, 1);
  assert.equal(report.stock.horizonCohorts[0].belowMinimumSample, true);
});

test('blocks persisted calibration reports when the event chain is tampered', async () => {
  const fake = fakeFirestore();
  const journal = createFirestorePredictionJournal({ projectId: 'demo-project', serviceAccountJson, fetchImpl: fake.fetchImpl });
  await journal.append('owner_1', { eventType: 'PREDICTION_RECORDED', prediction });
  fake.tamperFirstEvent();
  await assert.rejects(() => journal.getCalibrationReport('owner_1'),
    (error: unknown) => error instanceof FirestorePredictionJournalError && error.status === 409);
});

test('returns valid empty per-asset reports for a new owner and rejects invalid cohort thresholds', async () => {
  const fake = fakeFirestore();
  const journal = createFirestorePredictionJournal({ projectId: 'demo-project', serviceAccountJson, fetchImpl: fake.fetchImpl });
  const empty = await journal.getCalibrationReport('owner_1');
  assert.equal(empty.integrity.valid, true);
  assert.equal(empty.stock.overall.sampleSize, 0);
  assert.equal(empty.option.overall.sampleSize, 0);
  await assert.rejects(() => journal.getCalibrationReport('owner_1', 0),
    (error: unknown) => error instanceof FirestorePredictionJournalError && error.status === 400);
});
