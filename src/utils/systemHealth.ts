/**
 * Pure Logic Engine for System Health, 24/7 Daemon Monitoring,
 * Scan Latency, API Quota Tracking, and Memory Telemetry
 */

export interface MemoryMetrics {
  rssMb: number;
  heapUsedMb: number;
  heapTotalMb: number;
  externalMb: number;
  utilizationPercent: number;
  memoryHealth: 'HEALTHY' | 'ELEVATED' | 'CRITICAL';
}

export interface ApiQuotaMetrics {
  provider: string;
  usedRequests: number;
  maxHourlyQuota: number;
  remainingQuota: number;
  percentUsed: number;
  rateLimitHits: number;
  resetTimeStr: string;
}

export interface SecComplianceMetrics {
  currentReqsPerSec: number;
  maxAllowedReqsPerSec: number;
  isCompliant: boolean;
  userAgent: string;
}

export interface SystemHealthData {
  status: 'OPTIMAL' | 'DEGRADED' | 'WARNING';
  uptimeSeconds: number;
  uptimeFormatted: string;
  scanLatencyMs: number;
  latencyRating: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
  latencyHistory: Array<{ timestamp: string; latencyMs: number }>;
  tickersPerSecond: number;
  totalTickersScannedSession: number;
  lastCycleDurationMs: number;
  apiQuota: ApiQuotaMetrics;
  secCompliance: SecComplianceMetrics;
  memory: MemoryMetrics;
  cache: {
    cachedSymbolsCount: number;
    hitRatioPercent: number;
    estimatedMemoryKb: number;
  };
  daemon: {
    is247Active: boolean;
    intervalSeconds: number;
    lastHeartbeat: string;
    consecutiveSuccessfulScans: number;
    nodeVersion: string;
    platform: string;
  };
}

export function calculateLatencyRating(latencyMs: number): 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' {
  if (latencyMs <= 600) return 'EXCELLENT';
  if (latencyMs <= 1800) return 'GOOD';
  if (latencyMs <= 3500) return 'FAIR';
  return 'POOR';
}

export function calculateMemoryHealth(
  heapUsedMb: number,
  heapTotalMb: number
): { percent: number; health: 'HEALTHY' | 'ELEVATED' | 'CRITICAL' } {
  if (heapTotalMb <= 0) {
    return { percent: 0, health: 'HEALTHY' };
  }
  const percent = Number(((heapUsedMb / heapTotalMb) * 100).toFixed(1));
  let health: 'HEALTHY' | 'ELEVATED' | 'CRITICAL' = 'HEALTHY';
  if (percent >= 85) {
    health = 'CRITICAL';
  } else if (percent >= 70) {
    health = 'ELEVATED';
  }
  return { percent, health };
}

export function formatUptime(seconds: number): string {
  const sec = Math.floor(seconds % 60);
  const min = Math.floor((seconds / 60) % 60);
  const hours = Math.floor((seconds / 3600) % 24);
  const days = Math.floor(seconds / 86400);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  if (min > 0 || hours > 0 || days > 0) parts.push(`${min}m`);
  parts.push(`${sec}s`);

  return parts.join(' ');
}

export function calculateThroughput(tickerCount: number, durationMs: number): number {
  if (durationMs <= 0 || tickerCount <= 0) return 0;
  const durationSec = durationMs / 1000;
  return Number((tickerCount / durationSec).toFixed(1));
}

export function calculateQuotaUsage(
  usedRequests: number,
  maxHourlyQuota: number = 2000
): { remaining: number; percentUsed: number } {
  const remaining = Math.max(0, maxHourlyQuota - usedRequests);
  const percentUsed = Number(((usedRequests / maxHourlyQuota) * 100).toFixed(1));
  return { remaining, percentUsed };
}

export function evaluateOverallSystemStatus(
  latencyRating: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR',
  memoryHealth: 'HEALTHY' | 'ELEVATED' | 'CRITICAL',
  quotaPercentUsed: number
): 'OPTIMAL' | 'DEGRADED' | 'WARNING' {
  if (memoryHealth === 'CRITICAL' || latencyRating === 'POOR' || quotaPercentUsed >= 95) {
    return 'WARNING';
  }
  if (memoryHealth === 'ELEVATED' || latencyRating === 'FAIR' || quotaPercentUsed >= 80) {
    return 'DEGRADED';
  }
  return 'OPTIMAL';
}

/**
 * Clean zeroed initial telemetry placeholder before /api/system-health responds.
 * Contains zero fabricated latency, uptime, cache hit, or request counts.
 */
export function createEmptyHealthData(): SystemHealthData {
  return {
    status: 'OPTIMAL',
    uptimeSeconds: 0,
    uptimeFormatted: '0s',
    scanLatencyMs: 0,
    latencyRating: 'EXCELLENT',
    latencyHistory: [],
    tickersPerSecond: 0,
    totalTickersScannedSession: 0,
    lastCycleDurationMs: 0,
    apiQuota: {
      provider: 'Yahoo Finance Chart & Spark API',
      usedRequests: 0,
      maxHourlyQuota: 2000,
      remainingQuota: 2000,
      percentUsed: 0,
      rateLimitHits: 0,
      resetTimeStr: 'Top of the hour (rolling window)',
    },
    secCompliance: {
      currentReqsPerSec: 0,
      maxAllowedReqsPerSec: 10.0,
      isCompliant: true,
      userAgent: 'TrullasTradingScanner/2.0 (trader@trullas-scanner.com)',
    },
    memory: {
      rssMb: 0,
      heapUsedMb: 0,
      heapTotalMb: 0,
      externalMb: 0,
      utilizationPercent: 0,
      memoryHealth: 'HEALTHY',
    },
    cache: {
      cachedSymbolsCount: 0,
      hitRatioPercent: 0,
      estimatedMemoryKb: 0,
    },
    daemon: {
      is247Active: true,
      intervalSeconds: 45,
      lastHeartbeat: new Date().toISOString(),
      consecutiveSuccessfulScans: 0,
      nodeVersion: typeof process !== 'undefined' ? process.version : 'browser',
      platform: typeof process !== 'undefined' ? process.platform : 'web',
    },
  };
}
