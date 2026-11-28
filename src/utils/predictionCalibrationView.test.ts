import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseCalibrationPayload,
  selectCalibrationReport,
} from './predictionCalibrationView';

const metrics = (assetClass: 'STOCK' | 'OPTION', sampleSize = 12) => ({
  assetClass,
  sampleSize,
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
      originCohorts: [cohort('STOCK', 'LEGACY_UNATTRIBUTED')],
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
      originCohorts: [cohort('OPTION', 'LEGACY_UNATTRIBUTED')],
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
  assert.equal(parsed.stock.originCohorts[0].key, 'LEGACY_UNATTRIBUTED');
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
    calibration: { assignedSampleSize: 3, eligibleSampleSize: 2, purgedSampleSize: 1, calibration: metrics(assetClass, 2), uncertainty: { accuracy: { lower: 0.3, upper: 0.9 }, positiveOutcomeRate: null } },
    test: { assignedSampleSize: 3, eligibleSampleSize: 3, purgedSampleSize: 0, calibration: metrics(assetClass, 3),
      uncertainty: { accuracy: { lower: 0.4, upper: 0.9 }, positiveOutcomeRate: null } } }],
  aggregate: { foldCount: 1, testSampleSize: 3, belowMinimumSample: true, weightedMeanAccuracy: 0.75,
    weightedMeanMulticlassBrierScore: 0.31, weightedMeanLogLoss: 0.72, accuracyFoldStdDev: 0, multiclassBrierFoldStdDev: 0,
    degradation: { status: 'INSUFFICIENT_DATA', baselineFoldCount: 0, baselineSampleSize: 0, latestFoldId: 'WF-1', latestSampleSize: 3, accuracyDelta: null as number | null, multiclassBrierDelta: null as number | null, logLossDelta: null as number | null, triggeredBy: [] as Array<'ACCURACY_DROP' | 'BRIER_INCREASE' | 'LOG_LOSS_INCREASE'> } },
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

test('parses temporal degradation separately for STOCK and OPTION and rejects malformed diagnostics', () => {
  const valid = payload();
  valid.walkForward.stock.aggregate.degradation = {
    status: 'POTENTIAL_DEGRADATION', baselineFoldCount: 2, baselineSampleSize: 80,
    latestFoldId: 'WF-3', latestSampleSize: 35, accuracyDelta: -0.12,
    multiclassBrierDelta: 0.06, logLossDelta: 0.11,
    triggeredBy: ['ACCURACY_DROP', 'BRIER_INCREASE', 'LOG_LOSS_INCREASE'],
  };
  valid.walkForward.option.aggregate.degradation = {
    status: 'NO_CLEAR_DEGRADATION', baselineFoldCount: 2, baselineSampleSize: 60,
    latestFoldId: 'WF-3', latestSampleSize: 32, accuracyDelta: -0.02,
    multiclassBrierDelta: 0.01, logLossDelta: 0.02, triggeredBy: [],
  };
  const parsed = parseCalibrationPayload(valid);
  assert.ok(parsed);
  assert.equal(parsed.walkForward.stock.aggregate?.degradation.status, 'POTENTIAL_DEGRADATION');
  assert.deepEqual(parsed.walkForward.stock.aggregate?.degradation.triggeredBy, ['ACCURACY_DROP', 'BRIER_INCREASE', 'LOG_LOSS_INCREASE']);
  assert.equal(parsed.walkForward.option.aggregate?.degradation.status, 'NO_CLEAR_DEGRADATION');

  const invalidTrigger = payload();
  invalidTrigger.walkForward.stock.aggregate.degradation.triggeredBy = ['UNKNOWN_TRIGGER'] as any;
  assert.equal(parseCalibrationPayload(invalidTrigger), null);
  const invalidDelta = payload();
  invalidDelta.walkForward.option.aggregate.degradation.accuracyDelta = 1.5;
  assert.equal(parseCalibrationPayload(invalidDelta), null);

  const inconsistentStatus = payload();
  inconsistentStatus.walkForward.stock.aggregate.degradation.status = 'NO_CLEAR_DEGRADATION';
  assert.equal(parseCalibrationPayload(inconsistentStatus), null);

  const inconsistentTrigger = payload();
  inconsistentTrigger.walkForward.stock.aggregate.degradation.triggeredBy = ['ACCURACY_DROP'];
  assert.equal(parseCalibrationPayload(inconsistentTrigger), null);

  const partialDeltas = payload();
  partialDeltas.walkForward.stock.aggregate.degradation.accuracyDelta = -0.12;
  partialDeltas.walkForward.stock.aggregate.degradation.logLossDelta = null;
  assert.equal(parseCalibrationPayload(partialDeltas), null);

  const emptyBaselineMismatch = payload();
  emptyBaselineMismatch.walkForward.stock.aggregate.degradation.baselineSampleSize = 5;
  assert.equal(parseCalibrationPayload(emptyBaselineMismatch), null);

  const missingDiagnostics = payload();
  delete (missingDiagnostics.walkForward.stock.aggregate as any).degradation;
  assert.equal(parseCalibrationPayload(missingDiagnostics), null);
});

test('rejects inconsistent walk-forward sample accounting and aggregate metadata', () => {
  const incompleteSegment = payload();
  incompleteSegment.walkForward.stock.folds[0].test.assignedSampleSize = 4;
  assert.equal(parseCalibrationPayload(incompleteSegment), null);

  const mismatchedMetrics = payload();
  mismatchedMetrics.walkForward.option.folds[0].calibration.calibration.sampleSize = 1;
  assert.equal(parseCalibrationPayload(mismatchedMetrics), null);

  const wrongAggregateCount = payload();
  wrongAggregateCount.walkForward.stock.aggregate.foldCount = 2;
  assert.equal(parseCalibrationPayload(wrongAggregateCount), null);

  const wrongAggregateSample = payload();
  wrongAggregateSample.walkForward.option.aggregate.testSampleSize = 4;
  assert.equal(parseCalibrationPayload(wrongAggregateSample), null);

  const wrongThinSampleFlag = payload();
  wrongThinSampleFlag.walkForward.stock.aggregate.belowMinimumSample = false;
  assert.equal(parseCalibrationPayload(wrongThinSampleFlag), null);

  const duplicateFoldIds = payload();
  duplicateFoldIds.walkForward.stock.folds.push(duplicateFoldIds.walkForward.stock.folds[0]);
  assert.equal(parseCalibrationPayload(duplicateFoldIds), null);
});
