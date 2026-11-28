import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseCalibrationPayload,
  selectCalibrationReport,
} from './predictionCalibrationView';

const metrics = (assetClass: 'STOCK' | 'OPTION') => ({
  assetClass,
  sampleSize: 12,
  brierScore: 0.18,
  multiclassBrierScore: 0.31,
  logLoss: 0.72,
  accuracy: 0.75,
  meanConfidence: 0.68,
  reliability: [{
    bucket: '40-60%',
    count: 12,
    meanPredictedPositive: 0.51,
    observedPositiveRate: 0.58,
  }],
});

const cohort = (assetClass: 'STOCK' | 'OPTION', key: string) => ({
  key,
  report: metrics(assetClass),
  belowMinimumSample: true,
});

function payload() {
  return {
    integrity: { valid: true, headMatches: true, length: 24, headHash: 'a'.repeat(64) },
    readOnly: true,
    stock: {
      assetClass: 'STOCK',
      overall: metrics('STOCK'),
      horizonCohorts: [cohort('STOCK', '0-1d')],
      benchmark: {
        assetClass: 'STOCK',
        sampleSize: 10,
        coverage: 10 / 12,
        meanExcessReturnPct: 1.25,
        positiveExcessRate: 0.6,
        belowMinimumSample: true,
      },
      minimumSampleSize: 30,
    },
    option: {
      assetClass: 'OPTION',
      overall: metrics('OPTION'),
      horizonCohorts: [cohort('OPTION', '7-30d')],
      exitMethodCohorts: [cohort('OPTION', 'CLOSED')],
      minimumSampleSize: 30,
    },
    walkForward: { methodology: 'chronological-five-bin-expanding-window-v1', minimumSampleSize: 30,
      stock: wfAsset('STOCK'), option: wfAsset('OPTION') },
  };
}

test('parses a valid report and selects STOCK/OPTION without pooling', () => {
  const parsed = parseCalibrationPayload(payload());
  assert.ok(parsed);
  assert.equal(selectCalibrationReport(parsed, 'STOCK').overall.assetClass, 'STOCK');
  assert.equal(selectCalibrationReport(parsed, 'OPTION').overall.assetClass, 'OPTION');
  assert.equal(parsed.stock.benchmark.sampleSize, 10);
  assert.equal(parsed.option.exitMethodCohorts[0].key, 'CLOSED');
});

test('rejects an unverified or non-read-only response', () => {
  const invalidIntegrity = payload();
  invalidIntegrity.integrity.headMatches = false;
  assert.equal(parseCalibrationPayload(invalidIntegrity), null);

  const writable = payload();
  writable.readOnly = false;
  assert.equal(parseCalibrationPayload(writable), null);
});

test('rejects cross-asset metrics and cohorts', () => {
  const mixed = payload();
  mixed.option.overall = metrics('STOCK');
  assert.equal(parseCalibrationPayload(mixed), null);

  const mixedCohort = payload();
  mixedCohort.stock.horizonCohorts[0] = cohort('OPTION', '0-1d');
  assert.equal(parseCalibrationPayload(mixedCohort), null);
});

test('rejects malformed metric values and malformed integrity hashes', () => {
  const invalidMetric = payload();
  invalidMetric.stock.overall.accuracy = 1.5;
  assert.equal(parseCalibrationPayload(invalidMetric), null);

  const invalidHash = payload();
  invalidHash.integrity.headHash = 'not-a-sha256';
  assert.equal(parseCalibrationPayload(invalidHash), null);
});

test('rejects incomplete asset-specific report fields', () => {
  const missingBenchmark = payload();
  delete (missingBenchmark.stock as Partial<typeof missingBenchmark.stock>).benchmark;
  assert.equal(parseCalibrationPayload(missingBenchmark), null);

  const missingExitCohorts = payload();
  delete (missingExitCohorts.option as Partial<typeof missingExitCohorts.option>).exitMethodCohorts;
  assert.equal(parseCalibrationPayload(missingExitCohorts), null);
});

const wfAsset = (assetClass: 'STOCK' | 'OPTION') => ({
  assetClass, available: true, reason: null, distinctTimestamps: 8,
  folds: [{ foldId: 'WF-1',
    train: { assignedSampleSize: 8, eligibleSampleSize: 8, purgedSampleSize: 0, calibration: null, uncertainty: null },
    calibration: { assignedSampleSize: 3, eligibleSampleSize: 2, purgedSampleSize: 1, calibration: metrics(assetClass), uncertainty: null },
    test: { assignedSampleSize: 3, eligibleSampleSize: 3, purgedSampleSize: 0, calibration: metrics(assetClass),
      uncertainty: { accuracy: { lower: 0.4, upper: 0.9 }, positiveOutcomeRate: null } } }],
  aggregate: { foldCount: 1, testSampleSize: 3, belowMinimumSample: true, weightedMeanAccuracy: 0.75,
    weightedMeanMulticlassBrierScore: 0.31, weightedMeanLogLoss: 0.72, accuracyFoldStdDev: 0, multiclassBrierFoldStdDev: 0 },
});

test('validates walk-forward reports and rejects cross-asset contamination', () => {
  const parsed = parseCalibrationPayload(payload());
  assert.ok(parsed);
  assert.equal(parsed.walkForward.stock.assetClass, 'STOCK');
  assert.equal(parsed.walkForward.option.assetClass, 'OPTION');
  const mixed = payload(); mixed.walkForward.option = wfAsset('STOCK');
  assert.equal(parseCalibrationPayload(mixed), null);
  const malformed = payload(); malformed.walkForward.stock.folds[0].test.uncertainty.accuracy = { lower: 0.9, upper: 0.2 };
  assert.equal(parseCalibrationPayload(malformed), null);
});
