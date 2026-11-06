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

/**
 * Classifies latency into responsive performance tiers
 */
export function calculateLatencyRating(latencyMs: number): 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' {
  if (latencyMs <= 600) return 'EXCELLENT';
  if (latencyMs <= 1800) return 'GOOD';
  if (latencyMs <= 3500) return 'FAIR';
  return 'POOR';
}

/**
 * Computes memory utilization percentage and health status
 */
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

/**
 * Formats uptime seconds into human-readable duration (e.g. "3d 4h 12m 45s")
 */
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

/**
 * Calculates processing throughput in tickers per second
 */
export function calculateThroughput(tickerCount: number, durationMs: number): number {
  if (durationMs <= 0 || tickerCount <= 0) return 0;
  const durationSec = durationMs / 1000;
  return Number((tickerCount / durationSec).toFixed(1));
}

/**
 * Calculates remaining API quota and usage percentage
 */
export function calculateQuotaUsage(
  usedRequests: number,
  maxHourlyQuota: number = 2000
): { remaining: number; percentUsed: number } {
  const remaining = Math.max(0, maxHourlyQuota - usedRequests);
  const percentUsed = Number(((usedRequests / maxHourlyQuota) * 100).toFixed(1));
  return { remaining, percentUsed };
}

/**
 * Evaluates holistic system status across latency, memory, and rate-limits
 */
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
 * Generates initial realistic telemetry state for fallback and demonstration
 */
export function getBaselineHealthData(): SystemHealthData {
  const now = new Date();
  const history: Array<{ timestamp: string; latencyMs: number }> = [];

  // Generate 12 historical 5-minute ticks
  for (let i = 11; i >= 0; i--) {
    const t = new Date(now.getTime() - i * 5 * 60000);
    const timeStr = t.toTimeString().slice(0, 5);
    const latency = Math.floor(320 + Math.sin(i) * 90 + Math.random() * 40);
    history.push({ timestamp: timeStr, latencyMs: latency });
  }

  const scanLatencyMs = history[history.length - 1].latencyMs;
  const latencyRating = calculateLatencyRating(scanLatencyMs);
  const memory = {
    rssMb: 178.4,
    heapUsedMb: 114.2,
    heapTotalMb: 198.5,
    externalMb: 14.8,
    utilizationPercent: 57.5,
    memoryHealth: 'HEALTHY' as const,
  };
  const { remaining, percentUsed } = calculateQuotaUsage(184, 2000);

  return {
    status: evaluateOverallSystemStatus(latencyRating, memory.memoryHealth, percentUsed),
    uptimeSeconds: 86400 * 3 + 3600 * 7 + 1420,
    uptimeFormatted: formatUptime(86400 * 3 + 3600 * 7 + 1420),
    scanLatencyMs,
    latencyRating,
    latencyHistory: history,
    tickersPerSecond: 36.2,
    totalTickersScannedSession: 18450,
    lastCycleDurationMs: 13890, // ~13.8 seconds to scan full basket
    apiQuota: {
      provider: 'Yahoo Finance Free Endpoint',
      usedRequests: 184,
      maxHourlyQuota: 2000,
      remainingQuota: remaining,
      percentUsed,
      rateLimitHits: 0,
      resetTimeStr: 'Top of the hour (automatic rolling window)',
    },
    secCompliance: {
      currentReqsPerSec: 1.2,
      maxAllowedReqsPerSec: 10.0,
      isCompliant: true,
      userAgent: 'TrullasTradingScanner/2.0 (trader@trullas-scanner.com)',
    },
    memory,
    cache: {
      cachedSymbolsCount: 503,
      hitRatioPercent: 91.4,
      estimatedMemoryKb: 1420,
    },
    daemon: {
      is247Active: true,
      intervalSeconds: 45,
      lastHeartbeat: now.toISOString(),
      consecutiveSuccessfulScans: 412,
      nodeVersion: typeof process !== 'undefined' ? process.version : 'v20.x',
      platform: typeof process !== 'undefined' ? process.platform : 'linux',
    },
  };
}
