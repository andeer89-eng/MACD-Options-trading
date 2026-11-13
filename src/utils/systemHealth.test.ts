import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateLatencyRating,
  calculateMemoryHealth,
  formatUptime,
  calculateThroughput,
  calculateQuotaUsage,
  evaluateOverallSystemStatus,
  createEmptyHealthData,
} from './systemHealth';

test('calculateLatencyRating classifies performance tiers accurately', () => {
  assert.equal(calculateLatencyRating(250), 'EXCELLENT');
  assert.equal(calculateLatencyRating(600), 'EXCELLENT');
  assert.equal(calculateLatencyRating(1200), 'GOOD');
  assert.equal(calculateLatencyRating(2500), 'FAIR');
  assert.equal(calculateLatencyRating(4200), 'POOR');
});

test('calculateMemoryHealth calculates percentage and threshold states', () => {
  const healthy = calculateMemoryHealth(100, 200);
  assert.equal(healthy.percent, 50.0);
  assert.equal(healthy.health, 'HEALTHY');

  const elevated = calculateMemoryHealth(75, 100);
  assert.equal(elevated.percent, 75.0);
  assert.equal(elevated.health, 'ELEVATED');

  const critical = calculateMemoryHealth(90, 100);
  assert.equal(critical.percent, 90.0);
  assert.equal(critical.health, 'CRITICAL');
});

test('formatUptime correctly converts raw seconds to formatted string', () => {
  assert.equal(formatUptime(45), '45s');
  assert.equal(formatUptime(125), '2m 5s');
  assert.equal(formatUptime(3665), '1h 1m 5s');
  assert.equal(formatUptime(86400 * 2 + 3600 * 3 + 120 + 10), '2d 3h 2m 10s');
});

test('calculateThroughput computes tickers per second accurately', () => {
  assert.equal(calculateThroughput(500, 10000), 50.0);
  assert.equal(calculateThroughput(0, 5000), 0);
  assert.equal(calculateThroughput(100, 0), 0);
});

test('calculateQuotaUsage computes remaining quota and percentage', () => {
  const usage = calculateQuotaUsage(500, 2000);
  assert.equal(usage.remaining, 1500);
  assert.equal(usage.percentUsed, 25.0);
});

test('evaluateOverallSystemStatus determines system grade based on composite inputs', () => {
  assert.equal(evaluateOverallSystemStatus('EXCELLENT', 'HEALTHY', 20), 'OPTIMAL');
  assert.equal(evaluateOverallSystemStatus('GOOD', 'HEALTHY', 50), 'OPTIMAL');
  assert.equal(evaluateOverallSystemStatus('FAIR', 'HEALTHY', 60), 'DEGRADED');
  assert.equal(evaluateOverallSystemStatus('GOOD', 'ELEVATED', 40), 'DEGRADED');
  assert.equal(evaluateOverallSystemStatus('POOR', 'HEALTHY', 20), 'WARNING');
  assert.equal(evaluateOverallSystemStatus('GOOD', 'CRITICAL', 30), 'WARNING');
  assert.equal(evaluateOverallSystemStatus('EXCELLENT', 'HEALTHY', 96), 'WARNING');
});

test('createEmptyHealthData initializes clean unpopulated telemetry without fake values', () => {
  const data = createEmptyHealthData();
  assert.equal(data.uptimeSeconds, 0);
  assert.equal(data.scanLatencyMs, 0);
  assert.equal(data.latencyHistory.length, 0);
  assert.equal(data.apiQuota.maxHourlyQuota, 2000);
  assert.equal(data.apiQuota.usedRequests, 0);
  assert.ok(data.secCompliance.isCompliant);
});
