import { Router, type Request, type Response } from 'express';
import { createFirebaseIdTokenVerifier, FirebaseAuthUnavailableError } from '../services/firebaseAuth.ts';
import {
  createFirestorePredictionJournal,
  FirestorePredictionJournalError,
} from '../services/predictionJournalFirestore.ts';

type CalibrationJournal = Pick<ReturnType<typeof createFirestorePredictionJournal>, 'getCalibrationSnapshot'>;
type VerifyToken = (token: string) => Promise<{ uid: string }>;

export function createPredictionCalibrationRouter(options: {
  projectId: string;
  databaseId?: string;
  serviceAccountJson?: string;
  fetchImpl?: typeof fetch;
  verifyToken?: VerifyToken;
  journal?: CalibrationJournal;
}): Router {
  const router = Router();
  const journal = options.journal ?? (options.serviceAccountJson
    ? createFirestorePredictionJournal({
        projectId: options.projectId,
        databaseId: options.databaseId,
        serviceAccountJson: options.serviceAccountJson,
        fetchImpl: options.fetchImpl,
      })
    : undefined);
  const verifyToken = options.verifyToken ?? createFirebaseIdTokenVerifier({
    projectId: options.projectId,
    fetchImpl: options.fetchImpl,
  });

  router.get('/api/research/prediction-calibration', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vary', 'Authorization');

    if (!journal) {
      res.status(503).json({ error: 'Prediction calibration storage is not configured.' });
      return;
    }

    const authorization = req.header('authorization') || '';
    const match = /^Bearer\s+([^\s]+)$/i.exec(authorization);
    if (!match) {
      res.status(401).json({ error: 'Firebase authentication required.' });
      return;
    }

    let uid: string;
    try {
      const verified = await verifyToken(match[1]);
      uid = verified.uid;
    } catch (error) {
      if (error instanceof FirebaseAuthUnavailableError) {
        res.status(503).json({ error: 'Authentication service temporarily unavailable.' });
      } else {
        res.status(401).json({ error: 'Invalid or expired Firebase ID token.' });
      }
      return;
    }

    // Firestore owner scope is derived only from the verified Firebase UID.
    if (typeof uid !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(uid)) {
      res.status(403).json({ error: 'Authenticated account is not eligible for prediction research data.' });
      return;
    }

    const rawMinimum = req.query.minimumSampleSize;
    let minimumSampleSize = 30;
    if (rawMinimum !== undefined) {
      if (typeof rawMinimum !== 'string' || !/^\d{1,5}$/.test(rawMinimum)) {
        res.status(400).json({ error: 'minimumSampleSize must be an integer from 1 to 10000.' });
        return;
      }
      minimumSampleSize = Number(rawMinimum);
      if (!Number.isSafeInteger(minimumSampleSize) || minimumSampleSize < 1 || minimumSampleSize > 10_000) {
        res.status(400).json({ error: 'minimumSampleSize must be an integer from 1 to 10000.' });
        return;
      }
    }

    try {
      // One service call guarantees calibration and walk-forward data share one verified journal snapshot.
      const report = await journal.getCalibrationSnapshot(uid, minimumSampleSize);
      res.json({ ...report, readOnly: true });
    } catch (error) {
      if (error instanceof FirestorePredictionJournalError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      res.status(503).json({ error: 'Prediction calibration report is temporarily unavailable.' });
    }
  });

  return router;
}
