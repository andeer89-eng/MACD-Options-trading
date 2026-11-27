import { Router, Request, Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { createWatchlistTriggerService, WatchlistTriggerError } from '../services/watchlistTrigger.ts';

function safeSecretEqual(candidate: string, expected: string): boolean {
  const left = Buffer.from(candidate);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createWatchlistTriggerRouter(options: {
  projectId: string;
  serviceAccountJson?: string;
  workerToken?: string;
  fetchImpl?: typeof fetch;
}): Router {
  const router = Router();
  const service = options.serviceAccountJson
    ? createWatchlistTriggerService({
        projectId: options.projectId,
        serviceAccountJson: options.serviceAccountJson,
        fetchImpl: options.fetchImpl,
      })
    : undefined;

  router.post('/api/internal/watchlist/trigger', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!options.workerToken || !service) {
      res.status(503).json({ error: 'Watchlist trigger worker is not configured.' });
      return;
    }
    const authorization = req.header('authorization') || '';
    const match = /^Bearer\\s+([^\\s]+)$/i.exec(authorization);
    if (!match || !safeSecretEqual(match[1], options.workerToken)) {
      res.status(401).json({ error: 'Worker authentication required.' });
      return;
    }

    const { ownerId, symbol, triggerId, evidence } = req.body || {};
    if (
      typeof ownerId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(ownerId) ||
      typeof symbol !== 'string' || !/^[A-Za-z0-9.=\\-]{1,20}$/.test(symbol) ||
      typeof triggerId !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(triggerId) ||
      !evidence || typeof evidence !== 'object' ||
      typeof evidence.ruleId !== 'string' || evidence.ruleId.length < 1 || evidence.ruleId.length > 64 ||
      typeof evidence.source !== 'string' || evidence.source.length < 1 || evidence.source.length > 64 ||
      typeof evidence.observedPrice !== 'number' || !Number.isFinite(evidence.observedPrice) || evidence.observedPrice <= 0 ||
      typeof evidence.threshold !== 'number' || !Number.isFinite(evidence.threshold) || evidence.threshold <= 0 ||
      typeof evidence.evaluatedAt !== 'string' || !Number.isFinite(Date.parse(evidence.evaluatedAt))
    ) {
      res.status(400).json({ error: 'Invalid watchlist trigger payload.' });
      return;
    }
    try {
      const result = await service.transition({
        ownerId,
        symbol: symbol.toUpperCase(),
        triggerId,
        evidence: {
          ruleId: evidence.ruleId,
          source: evidence.source,
          observedPrice: evidence.observedPrice,
          threshold: evidence.threshold,
          evaluatedAt: evidence.evaluatedAt,
        },
      });
      res.json({ ...result, symbol: symbol.toUpperCase(), ownerId });
    } catch (error) {
      if (error instanceof WatchlistTriggerError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      res.status(503).json({ error: 'Watchlist trigger transition is unavailable.' });
    }
  });
  return router;
}
