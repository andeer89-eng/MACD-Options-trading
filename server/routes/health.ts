import { Router, Request, Response } from 'express';
import type { MarketDataService } from '../services/marketData.ts';

export function createHealthRouter(marketData: MarketDataService): Router {
  const router = Router();

  router.get('/api/system-health', (_req: Request, res: Response) => {
    const t = marketData.getTelemetry();
    const mem = process.memoryUsage();
    const heapUsedMb = Number((mem.heapUsed / 1024 / 1024).toFixed(1));
    const heapTotalMb = Number((mem.heapTotal / 1024 / 1024).toFixed(1));
    const rssMb = Number((mem.rss / 1024 / 1024).toFixed(1));
    const externalMb = Number((mem.external / 1024 / 1024).toFixed(1));
    const utilizationPercent = Number(((heapUsedMb / heapTotalMb) * 100).toFixed(1));

    const avgLatency =
      t.recentScanLatencies.length > 0
        ? Math.round(t.recentScanLatencies.reduce((a, b) => a + b, 0) / t.recentScanLatencies.length)
        : 0;

    const uptimeSeconds = Math.floor(process.uptime());
    const tickersPerSecond =
      t.lastScanDurationMs > 0 && t.lastScannedBatchSize > 0
        ? Number((t.lastScannedBatchSize / (t.lastScanDurationMs / 1000)).toFixed(1))
        : 0;

    const totalCacheLookups = t.cacheHitsTotal + t.cacheMissesTotal;
    const hitRatioPercent =
      totalCacheLookups > 0 ? Number(((t.cacheHitsTotal / totalCacheLookups) * 100).toFixed(1)) : 0;

    const status = t.rateLimitHitsCount > 5 ? 'DEGRADED' : 'OPTIMAL';

    res.json({
      status,
      uptimeSeconds,
      scanLatencyMs: avgLatency,
      recentLatencies: t.recentScanLatencies,
      tickersPerSecond,
      totalTickersScannedSession: t.totalTickersScannedCounter,
      lastCycleDurationMs: t.lastScanDurationMs,
      memory: {
        rssMb,
        heapUsedMb,
        heapTotalMb,
        externalMb,
        utilizationPercent,
        memoryHealth: utilizationPercent > 85 ? 'CRITICAL' : utilizationPercent > 70 ? 'ELEVATED' : 'HEALTHY',
      },
      apiQuota: {
        provider: 'Yahoo Finance v8 (Unofficial) + CBOE Delayed Quotes + SEC EDGAR',
        usedRequests: t.totalApiRequestsCount,
        maxHourlyQuota: null,
        remainingQuota: null,
        percentUsed: null,
        rateLimitHits: t.rateLimitHitsCount,
        resetTimeStr: 'Dynamic rate limit by IP (Unofficial API)',
        quotaNote: 'Yahoo Finance v8 has no formal public quota. Rate limiting is dynamic and unannounced.',
      },
      secCompliance: {
        currentReqsPerSec: Number((t.totalApiRequestsCount / Math.max(1, uptimeSeconds)).toFixed(2)),
        maxAllowedReqsPerSec: 10.0,
        isCompliant: t.rateLimitHitsCount === 0,
        userAgent: 'TrullasTradingScanner/2.0 (trader@trullas-scanner.com)',
      },
      cache: {
        cachedSymbolsCount: t.cachedSymbolsCount,
        hitRatioPercent,
        estimatedMemoryKb: Math.round(t.cachedSymbolsCount * 2.8),
      },
      daemon: {
        is247Active: false,
        mode: 'on-request scans driven by frontend polling',
        intervalSeconds: 45,
        lastHeartbeat: t.lastScanTimestampIso || new Date().toISOString(),
        consecutiveSuccessfulScans: t.consecutiveSuccessfulScans,
        nodeVersion: process.version,
        platform: process.platform,
      },
    });
  });

  router.get('/api/system-health/ping', async (_req: Request, res: Response) => {
    const start = Date.now();
    try {
      const testCandles = await marketData.fetchYahooData('SPY', '1d', '5d', 1);
      const pingMs = Date.now() - start;
      if (testCandles.length === 0) {
        return res.status(503).json({
          ok: false,
          pingMs,
          candlesReturned: 0,
          error: 'Yahoo Finance v8 returned 0 bars for SPY',
          timestamp: Date.now(),
        });
      }
      res.json({
        ok: true,
        pingMs,
        candlesReturned: testCandles.length,
        timestamp: Date.now(),
      });
    } catch (err: any) {
      res.status(500).json({
        ok: false,
        pingMs: Date.now() - start,
        error: err.message,
      });
    }
  });

  router.post('/api/system-health/clear-cache', (_req: Request, res: Response) => {
    const count = marketData.clearAllCaches();
    res.json({
      success: true,
      clearedCount: count,
      timestamp: Date.now(),
    });
  });

  return router;
}
