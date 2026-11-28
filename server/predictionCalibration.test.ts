import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import {
  createPredictionCalibrationRouter,
} from './routes/predictionCalibration.ts';
import { FirestorePredictionJournalError } from './services/predictionJournalFirestore.ts';

async function withRoute(
  router: express.Router,
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const app = express();
  app.use(router);
  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not bind test server.');
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>(resolve => {
      server.closeAllConnections?.();
      server.close(() => resolve());
    });
  }
}

describe('authenticated prediction calibration read API', () => {
  it('requires a Firebase bearer token and rejects invalid tokens', async () => {
    const router = createPredictionCalibrationRouter({
      projectId: 'test-project',
      journal: { getCalibrationReport: async () => ({}), getWalkForwardCalibrationReport: async () => ({}) } as any,
      verifyToken: async () => { throw new Error('invalid token'); },
    });
    await withRoute(router, async baseUrl => {
      const missing = await fetch(`${baseUrl}/api/research/prediction-calibration`);
      assert.equal(missing.status, 401);
      const invalid = await fetch(`${baseUrl}/api/research/prediction-calibration`, {
        headers: { Authorization: 'Bearer invalid' },
      });
      assert.equal(invalid.status, 401);
      assert.equal(invalid.headers.get('cache-control'), 'no-store');
    });
  });

  it('derives Firestore owner scope from verified UID and returns read-only STOCK/OPTION reports', async () => {
    const calls: Array<{ ownerId: string; minimumSampleSize: number }> = [];
    const router = createPredictionCalibrationRouter({
      projectId: 'test-project',
      verifyToken: async token => {
        assert.equal(token, 'valid-token');
        return { uid: 'firebase_user_123' };
      },
      journal: {
        getCalibrationReport: async (ownerId: string, minimumSampleSize: number) => {
          calls.push({ ownerId, minimumSampleSize });
          return {
            integrity: { valid: true, headMatches: true, length: 4, headHash: 'a'.repeat(64) },
            stock: { assetClass: 'STOCK', overall: { sampleSize: 2 } },
            option: { assetClass: 'OPTION', overall: { sampleSize: 1 } },
          };
        },
        getWalkForwardCalibrationReport: async (ownerId: string, minimumSampleSize: number) => ({ ownerId, minimumSampleSize }),
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
      journal: { getCalibrationReport: async () => { calls++; return {}; }, getWalkForwardCalibrationReport: async () => { calls++; return {}; } } as any,
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

  it('fails closed when storage is unconfigured or journal integrity rejects the report', async () => {
    const unconfigured = createPredictionCalibrationRouter({ projectId: 'test-project' });
    await withRoute(unconfigured, async baseUrl => {
      const response = await fetch(`${baseUrl}/api/research/prediction-calibration`, {
        headers: { Authorization: 'Bearer valid-token' },
      });
      assert.equal(response.status, 503);
    });

    const integrityFailure = createPredictionCalibrationRouter({
      projectId: 'test-project',
      verifyToken: async () => ({ uid: 'firebase_user_123' }),
      journal: {
        getCalibrationReport: async () => {
          throw new FirestorePredictionJournalError('Integrity verification failed.', 409);
        },
        getWalkForwardCalibrationReport: async () => ({}),
      } as any,
    });
    await withRoute(integrityFailure, async baseUrl => {
      const response = await fetch(`${baseUrl}/api/research/prediction-calibration`, {
        headers: { Authorization: 'Bearer valid-token' },
      });
      assert.equal(response.status, 409);
    });
  });

  it('rejects Firebase UIDs outside the Firestore owner-ID contract', async () => {
    let calls = 0;
    const router = createPredictionCalibrationRouter({
      projectId: 'test-project',
      verifyToken: async () => ({ uid: 'uid:with:colon' }),
      journal: { getCalibrationReport: async () => { calls++; return {}; }, getWalkForwardCalibrationReport: async () => { calls++; return {}; } } as any,
    });
    await withRoute(router, async baseUrl => {
      const response = await fetch(`${baseUrl}/api/research/prediction-calibration`, {
        headers: { Authorization: 'Bearer valid-token' },
      });
      assert.equal(response.status, 403);
      assert.equal(calls, 0);
    });
  });
});
