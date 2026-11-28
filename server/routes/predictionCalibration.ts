import { Router, type Request, type Response } from 'express';
import type { PredictionSnapshotInput } from '../services/predictionJournal.ts';
import { createFirebaseIdTokenVerifier, FirebaseAuthUnavailableError } from '../services/firebaseAuth.ts';
import {
  createFirestorePredictionJournal,
  FirestorePredictionJournalError,
} from '../services/predictionJournalFirestore.ts';

type CalibrationJournal = Pick<ReturnType<typeof createFirestorePredictionJournal>, 'getCalibrationSnapshot' | 'recordPrediction'>;
type VerifyToken = (token: string) => Promise<{ uid: string }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(value).every(key => allowed.includes(key));
}

/** Browser capture is limited to user-authored research; bot-origin claims require a trusted server adapter. */
function parseUserPredictionInput(value: unknown): PredictionSnapshotInput | null {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    'predictionId', 'assetClass', 'symbol', 'contractId', 'createdAt', 'targetAt',
    'evidencePackId', 'evidencePackSha256', 'committeeGeneratedAt', 'judgeGeneratedAt',
    'disposition', 'riskMultiplier', 'confidence', 'probabilities', 'sourceRefs', 'origin', 'model',
  ])) return null;
  if (!isRecord(value.probabilities) || !hasOnlyKeys(value.probabilities, ['positive', 'neutral', 'negative'])) return null;
  if (!Array.isArray(value.sourceRefs) || value.sourceRefs.length < 1 || value.sourceRefs.length > 50 ||
      !value.sourceRefs.every(ref => typeof ref === 'string' && ref.trim().length > 0 && ref.length <= 512)) return null;
  if (!isRecord(value.origin) || !hasOnlyKeys(value.origin, ['kind', 'sourceId', 'strategyId', 'decisionId', 'candidateId', 'runId']) ||
      !['MANUAL', 'RESEARCH'].includes(String(value.origin.kind)) ||
      typeof value.origin.sourceId !== 'string' || !value.origin.sourceId.trim() || value.origin.sourceId.length > 128) return null;
  for (const key of ['strategyId', 'decisionId', 'candidateId', 'runId']) {
    const item = value.origin[key];
    if (item !== undefined && (typeof item !== 'string' || !item.trim() || item.length > 128)) return null;
  }
  const model = value.model;
  if (model !== undefined && (!isRecord(model) ||
      !hasOnlyKeys(model, ['provider', 'model', 'promptVersion']) ||
      !['provider', 'model', 'promptVersion'].every(key =>
        typeof model[key] === 'string' && (model[key] as string).trim().length > 0 && (model[key] as string).length <= 128))) return null;
  return value as unknown as PredictionSnapshotInput;
}


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


  router.post('/api/research/predictions', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vary', 'Authorization');
    if (!journal || typeof journal.recordPrediction !== 'function') {
      res.status(503).json({ error: 'Prediction capture storage is not configured.' });
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
    if (typeof uid !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(uid)) {
      res.status(403).json({ error: 'Authenticated account is not eligible for prediction research data.' });
      return;
    }

    const input = parseUserPredictionInput(req.body);
    if (!input) {
      res.status(400).json({ error: 'Invalid prediction payload. User capture requires a MANUAL or RESEARCH origin.' });
      return;
    }

    try {
      const result = await journal.recordPrediction(uid, input);
      if (result.event.eventType !== 'PREDICTION_RECORDED') {
        res.status(500).json({ error: 'Prediction capture returned an invalid journal event.' });
        return;
      }
      res.status(result.replayed ? 200 : 201).json({
        prediction: result.event.prediction,
        replayed: result.replayed,
      });
    } catch (error) {
      if (error instanceof FirestorePredictionJournalError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      res.status(503).json({ error: 'Prediction capture is temporarily unavailable.' });
    }
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
