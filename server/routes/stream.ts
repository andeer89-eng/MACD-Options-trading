import { Router, Request, Response } from 'express';
import type { MarketDataService } from '../services/marketData.ts';

export interface StreamRouterOptions {
  pulseIntervalMs?: number;
}

export function createStreamRouter(
  marketData: MarketDataService,
  options: StreamRouterOptions = {}
): Router {
  const router = Router();
  const pulseIntervalMs = options.pulseIntervalMs ?? 15_000;

  router.get('/api/stream', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const writeEvent = (eventName: string, payload: Record<string, unknown>) => {
      if (res.writableEnded || res.destroyed) return;
      res.write(`event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`);
    };

    const buildSnapshot = (kind: 'connected' | 'pulse') => {
      const t = marketData.getTelemetry();
      return {
        type: kind,
        serverTimeUtc: new Date().toISOString(),
        uptimeSeconds: Math.floor(process.uptime()),
        usedRequests: t.totalApiRequestsCount,
        cachedSymbolsCount: t.cachedSymbolsCount,
        consecutiveSuccessfulScans: t.consecutiveSuccessfulScans,
        lastScanTimestampIso: t.lastScanTimestampIso,
        status: t.rateLimitHitsCount > 5 ? 'DEGRADED' : 'OPTIMAL',
      };
    };

    writeEvent('market-pulse', buildSnapshot('connected'));

    const timer = setInterval(() => {
      writeEvent('market-pulse', buildSnapshot('pulse'));
    }, pulseIntervalMs);

    const cleanup = () => {
      clearInterval(timer);
      if (!res.writableEnded) {
        res.end();
      }
    };

    req.on('close', cleanup);
    req.on('aborted', cleanup);
  });

  return router;
}
