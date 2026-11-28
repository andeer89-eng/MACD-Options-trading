import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assessTemporalDegradation } from './services/predictionJournal.ts';

describe('temporal calibration degradation assessment', () => {
  it('flags material deterioration in the latest chronological fold', () => {
    const report = assessTemporalDegradation([
      { foldId: 'WF-1', testSampleSize: 40, accuracy: 0.72, multiclassBrierScore: 0.42, logLoss: 0.72 },
      { foldId: 'WF-2', testSampleSize: 40, accuracy: 0.70, multiclassBrierScore: 0.43, logLoss: 0.74 },
      { foldId: 'WF-3', testSampleSize: 35, accuracy: 0.55, multiclassBrierScore: 0.51, logLoss: 0.91 },
    ], 30);
    assert.equal(report.status, 'POTENTIAL_DEGRADATION');
    assert.equal(report.latestFoldId, 'WF-3');
    assert.deepEqual(report.triggeredBy, ['ACCURACY_DROP', 'BRIER_INCREASE', 'LOG_LOSS_INCREASE']);
    assert.ok((report.accuracyDelta ?? 0) <= -0.10);
  });

  it('does not flag deterioration when latest metrics remain within thresholds', () => {
    const report = assessTemporalDegradation([
      { foldId: 'WF-1', testSampleSize: 40, accuracy: 0.70, multiclassBrierScore: 0.44, logLoss: 0.75 },
      { foldId: 'WF-2', testSampleSize: 40, accuracy: 0.72, multiclassBrierScore: 0.43, logLoss: 0.73 },
      { foldId: 'WF-3', testSampleSize: 35, accuracy: 0.69, multiclassBrierScore: 0.45, logLoss: 0.78 },
    ], 30);
    assert.equal(report.status, 'NO_CLEAR_DEGRADATION');
    assert.deepEqual(report.triggeredBy, []);
  });

  it('withholds classification when baseline or latest fold is below minimum sample', () => {
    const report = assessTemporalDegradation([
      { foldId: 'WF-1', testSampleSize: 10, accuracy: 0.8, multiclassBrierScore: 0.2, logLoss: 0.3 },
      { foldId: 'WF-2', testSampleSize: 10, accuracy: 0.8, multiclassBrierScore: 0.2, logLoss: 0.3 },
      { foldId: 'WF-3', testSampleSize: 12, accuracy: 0.3, multiclassBrierScore: 0.8, logLoss: 1.5 },
    ], 30);
    assert.equal(report.status, 'INSUFFICIENT_DATA');
    assert.deepEqual(report.triggeredBy, []);
    assert.ok(report.accuracyDelta !== null);
  });

  it('uses a sample-weighted baseline and validates inputs', () => {
    const report = assessTemporalDegradation([
      { foldId: 'WF-1', testSampleSize: 90, accuracy: 0.8, multiclassBrierScore: 0.2, logLoss: 0.3 },
      { foldId: 'WF-2', testSampleSize: 10, accuracy: 0.2, multiclassBrierScore: 0.8, logLoss: 1.3 },
      { foldId: 'WF-3', testSampleSize: 40, accuracy: 0.7, multiclassBrierScore: 0.3, logLoss: 0.5 },
    ], 30);
    assert.equal(report.baselineSampleSize, 100);
    assert.equal(report.baselineFoldCount, 2);
    assert.ok(Math.abs((report.accuracyDelta ?? 0) - (0.7 - 0.74)) < 1e-12);
    assert.throws(() => assessTemporalDegradation([], 0), RangeError);
    assert.throws(() => assessTemporalDegradation([{ foldId: '', testSampleSize: 1, accuracy: 0.5, multiclassBrierScore: 0.5, logLoss: 0.5 }]), RangeError);
  });
});
