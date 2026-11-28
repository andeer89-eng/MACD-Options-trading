import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { createPredictionCalibrationRouter } from './routes/predictionCalibration.ts';
import { FirestorePredictionJournalError } from './services/predictionJournalFirestore.ts';

async function withRoute(router: express.Router, run: (baseUrl: string) => Promise<void>): Promise<void> {
  const app = express();
  app.use(router);
  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not bind test server.');
  try { await run(`http://127.0.0.1:${address.port}`); }
  finally {
    await new Promise<void>(resolve => {
      server.closeAllConnections?.();
      server.close(() => resolve());
    });
  }
}

const snapshot = {
  integrity: { valid: true, headMatches: true, length: 4, headHash: 'a'.repeat(64) },
  stock: { assetClass: 'STOCK', overall: { sampleSize: 2 } },
  option: { assetClass: 'OPTION', overall: { sampleSize: 1 } },
  minimumSampleSize: 55,
  methodology: 'chronological-five-bin-expanding-window-v1',
  walkForward: {
    stock: { assetClass: 'STOCK', available: false, distinctTimestamps: 2, folds: [], aggregate: null },
    option: { assetClass: 'OPTION', available: false, distinctTimestamps: 1, folds: [], aggregate: null },
  },
};


const predictionInput = {
  predictionId: 'manual-prediction-1',
  assetClass: 'STOCK' as const,
  symbol: 'AAPL',
  createdAt: 1_000,
  targetAt: 2_000,
  evidencePackId: 'evidence-pack-1',
  evidencePackSha256: 'a'.repeat(64),
  committeeGeneratedAt: 1_100,
  judgeGeneratedAt: 1_200,
  disposition: 'APPROVE' as const,
  riskMultiplier: 0.5,
  confidence: 0.8,
  probabilities: { positive: 0.7, neutral: 0.2, negative: 0.1 },
  sourceRefs: ['sec:filing:1'],
  origin: { kind: 'MANUAL' as const, sourceId: 'manual-review-1' },
};

describe('authenticated prediction calibration read API', () => {
  it('requires a Firebase bearer token and rejects invalid tokens', async () => {
    const router = createPredictionCalibrationRouter({
      projectId: 'test-project',
      journal: { getCalibrationSnapshot: async () => snapshot } as any,
      verifyToken: async () => { throw new Error('invalid token'); },
    });
    await withRoute(router, async baseUrl => {
      const missing = await fetch(`${baseUrl}/api/research/prediction-calibration`);
      assert.equal(missing.status, 401);
      const invalid = await fetch(`${baseUrl}/api/research/prediction-calibration`, { headers: { Authorization: 'Bearer invalid' } });
      assert.equal(invalid.status, 401);
      assert.equal(invalid.headers.get('cache-control'), 'no-store');
    });
  });

  it('derives owner scope from verified UID and returns both reports from one snapshot call', async () => {
    const calls: Array<{ ownerId: string; minimumSampleSize: number }> = [];
    const router = createPredictionCalibrationRouter({
      projectId: 'test-project',
      verifyToken: async token => { assert.equal(token, 'valid-token'); return { uid: 'firebase_user_123' }; },
      journal: {
        getCalibrationSnapshot: async (ownerId: string, minimumSampleSize: number) => {
          calls.push({ ownerId, minimumSampleSize });
          return { ...snapshot, minimumSampleSize };
        },
      } as any,
    });
    await withRoute(router, async baseUrl => {
      const response = await fetch(
        `${baseUrl}/api/research/prediction-calibration?minimumSampleSize=55&ownerId=attacker`,
        { headers: { Authorization: 'Bearer valid-token' } },
      );
      assert.equal(response.status, 200);
      const body = await response.json() as any;
      assert.equal(body.readOnly, true);
      assert.equal(body.stock.assetClass, 'STOCK');
      assert.equal(body.option.assetClass, 'OPTION');
      assert.equal(body.walkForward.stock.assetClass, 'STOCK');
      assert.equal(body.walkForward.option.assetClass, 'OPTION');
      assert.equal(body.minimumSampleSize, 55);
      assert.deepEqual(calls, [{ ownerId: 'firebase_user_123', minimumSampleSize: 55 }]);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(response.headers.get('vary'), 'Authorization');
    });
  });

  it('rejects invalid minimum sample sizes before querying Firestore', async () => {
    let calls = 0;
    const router = createPredictionCalibrationRouter({
      projectId: 'test-project',
      verifyToken: async () => ({ uid: 'firebase_user_123' }),
      journal: { getCalibrationSnapshot: async () => { calls++; return snapshot; } } as any,
    });
    await withRoute(router, async baseUrl => {
      for (const value of ['0', '-1', '10001', '1.5', 'abc', '']) {
        const response = await fetch(
          `${baseUrl}/api/research/prediction-calibration?minimumSampleSize=${encodeURIComponent(value)}`,
          { headers: { Authorization: 'Bearer valid-token' } },
        );
        assert.equal(response.status, 400);
      }
      assert.equal(calls, 0);
    });
  });

  it('fails closed when storage is unconfigured or snapshot integrity rejects the report', async () => {
    const unconfigured = createPredictionCalibrationRouter({ projectId: 'test-project' });
    await withRoute(unconfigured, async baseUrl => {
      const response = await fetch(`${baseUrl}/api/research/prediction-calibration`, { headers: { Authorization: 'Bearer valid-token' } });
      assert.equal(response.status, 503);
    });

    const integrityFailure = createPredictionCalibrationRouter({
      projectId: 'test-project',
      verifyToken: async () => ({ uid: 'firebase_user_123' }),
      journal: { getCalibrationSnapshot: async () => {
        throw new FirestorePredictionJournalError('Integrity verification failed.', 409);
      } } as any,
    });
    await withRoute(integrityFailure, async baseUrl => {
      const response = await fetch(`${baseUrl}/api/research/prediction-calibration`, { headers: { Authorization: 'Bearer valid-token' } });
      assert.equal(response.status, 409);
    });
  });

  it('rejects Firebase UIDs outside the Firestore owner-ID contract', async () => {
    let calls = 0;
    const router = createPredictionCalibrationRouter({
      projectId: 'test-project',
      verifyToken: async () => ({ uid: 'uid:with:colon' }),
      journal: { getCalibrationSnapshot: async () => { calls++; return snapshot; } } as any,
    });
    await withRoute(router, async baseUrl => {
      const response = await fetch(`${baseUrl}/api/research/prediction-calibration`, { headers: { Authorization: 'Bearer valid-token' } });
      assert.equal(response.status, 403);
      assert.equal(calls, 0);
    });
  });
  it('records user-authored predictions under the verified UID and returns idempotent status', async () => {
    const calls: Array<{ ownerId: string; input: unknown }> = [];
    let replayed = false;
    const router = createPredictionCalibrationRouter({
      projectId: 'test-project',
      verifyToken: async token => { assert.equal(token, 'valid-token'); return { uid: 'verified_user_1' }; },
      journal: {
        getCalibrationSnapshot: async () => snapshot,
        recordPrediction: async (ownerId: string, input: unknown) => {
          calls.push({ ownerId, input });
          return {
            replayed,
            event: { eventType: 'PREDICTION_RECORDED', prediction: {
              ...(input as object), schemaVersion: '1.0.0', recordedAt: 3_000,
              inputSha256: 'b'.repeat(64), snapshotSha256: 'c'.repeat(64),
            } },
          };
        },
      } as any,
    });
    await withRoute(router, async baseUrl => {
      const first = await fetch(baseUrl + '/api/research/predictions', {
        method: 'POST', headers: { Authorization: 'Bearer valid-token', 'Content-Type': 'application/json' },
        body: JSON.stringify(predictionInput),
      });
      assert.equal(first.status, 201);
      const firstBody = await first.json() as any;
      assert.equal(firstBody.prediction.origin.kind, 'MANUAL');
      assert.equal(firstBody.replayed, false);

      replayed = true;
      const replay = await fetch(baseUrl + '/api/research/predictions', {
        method: 'POST', headers: { Authorization: 'Bearer valid-token', 'Content-Type': 'application/json' },
        body: JSON.stringify(predictionInput),
      });
      assert.equal(replay.status, 200);
      assert.equal((await replay.json() as any).replayed, true);
      assert.equal(calls.length, 2);
      assert.equal(calls[0].ownerId, 'verified_user_1');
      assert.deepEqual(calls[0].input, predictionInput);
    });
  });

  it('rejects unauthenticated, bot-claimed, and owner-overridden prediction capture before storage', async () => {
    let calls = 0;
    const router = createPredictionCalibrationRouter({
      projectId: 'test-project',
      verifyToken: async () => ({ uid: 'verified_user_1' }),
      journal: {
        getCalibrationSnapshot: async () => snapshot,
        recordPrediction: async () => { calls++; throw new Error('must not be called'); },
      } as any,
    });
    await withRoute(router, async baseUrl => {
      const unauthenticated = await fetch(baseUrl + '/api/research/predictions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(predictionInput),
      });
      assert.equal(unauthenticated.status, 401);

      for (const body of [
        { ...predictionInput, origin: { kind: 'STOCK_BOT', sourceId: 'forged-bot-run' } },
        { ...predictionInput, ownerId: 'attacker_uid' },
        { ...predictionInput, unexpectedField: 'not-allowed' },
      ]) {
        const response = await fetch(baseUrl + '/api/research/predictions', {
          method: 'POST', headers: { Authorization: 'Bearer valid-token', 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        assert.equal(response.status, 400);
      }
      assert.equal(calls, 0);
    });
  });

  it('maps semantic persistence conflicts to an HTTP conflict response', async () => {
    const router = createPredictionCalibrationRouter({
      projectId: 'test-project',
      verifyToken: async () => ({ uid: 'verified_user_1' }),
      journal: {
        getCalibrationSnapshot: async () => snapshot,
        recordPrediction: async () => { throw new FirestorePredictionJournalError('Prediction identity collision.', 409); },
      } as any,
    });
    await withRoute(router, async baseUrl => {
      const response = await fetch(baseUrl + '/api/research/predictions', {
        method: 'POST', headers: { Authorization: 'Bearer valid-token', 'Content-Type': 'application/json' },
        body: JSON.stringify(predictionInput),
      });
      assert.equal(response.status, 409);
      assert.equal(response.headers.get('cache-control'), 'no-store');
    });
  });

});
