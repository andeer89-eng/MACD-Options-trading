import { createHash } from 'node:crypto';

export type PredictionAssetClass = 'STOCK' | 'OPTION';
export type PredictionOutcomeClass = 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
export type PredictionProbabilities = { positive: number; neutral: number; negative: number };
export type PredictionSnapshotInput = {
  predictionId: string; assetClass: PredictionAssetClass; symbol: string; contractId?: string;
  createdAt: number; targetAt: number; evidencePackId: string; evidencePackSha256: string;
  committeeGeneratedAt: number; judgeGeneratedAt: number; disposition: 'APPROVE' | 'REDUCE' | 'REJECT';
  riskMultiplier: number; confidence: number; probabilities: PredictionProbabilities;
  sourceRefs: string[]; model?: { provider: string; model: string; promptVersion: string };
};
export type StockOutcome = { assetClass: 'STOCK'; realizedAt: number; observedAt: number; outcome: PredictionOutcomeClass; totalReturnPct: number; benchmarkReturnPct?: number; labelSource: string };
export type OptionOutcome = { assetClass: 'OPTION'; realizedAt: number; observedAt: number; outcome: PredictionOutcomeClass; contractReturnPct: number; underlyingReturnPct: number; exitMethod: 'CLOSED' | 'MARK_TO_MARKET' | 'EXPIRED'; entryPremium: number; exitValue: number; labelSource: string };
export type PredictionOutcome = StockOutcome | OptionOutcome;
export type PredictionSnapshot = PredictionSnapshotInput & { schemaVersion: '1.0.0'; recordedAt: number; inputSha256: string; snapshotSha256: string };
export type PredictionEvent =
  | { sequence: number; eventType: 'PREDICTION_RECORDED'; prediction: PredictionSnapshot; prevHash: string; eventHash: string }
  | { sequence: number; eventType: 'OUTCOME_LABELED'; predictionId: string; outcome: PredictionOutcome; prevHash: string; eventHash: string };
type PredictionEventBody = PredictionEvent extends infer E ? E extends PredictionEvent ? Omit<E, 'sequence' | 'prevHash' | 'eventHash'> : never : never;
export type JournalErrorCode = 'INVALID_PREDICTION' | 'PREDICTION_ID_COLLISION' | 'PREDICTION_NOT_FOUND' | 'OUTCOME_ASSET_CLASS_MISMATCH' | 'OUTCOME_BEFORE_TARGET' | 'OUTCOME_ALREADY_LABELED' | 'INVALID_OUTCOME' | 'JOURNAL_CHAIN_INVALID';
export class PredictionJournalError extends Error {
  constructor(readonly code: JournalErrorCode) { super(code); this.name = 'PredictionJournalError'; }
}
const GENESIS = '0'.repeat(64);
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  const o = v as Record<string, unknown>;
  return '{' + Object.keys(o).sort().filter(k => o[k] !== undefined).map(k => JSON.stringify(k) + ':' + canonical(o[k])).join(',') + '}';
}
function validProbabilities(p: PredictionProbabilities): boolean {
  return !!p && [p.positive, p.neutral, p.negative].every(v => finite(v) && v >= 0 && v <= 1) &&
    Math.abs(p.positive + p.neutral + p.negative - 1) < 1e-8;
}
function validatePrediction(p: PredictionSnapshotInput, now: number): void {
  if (!p || !text(p.predictionId) || p.predictionId.length > 128 ||
      !['STOCK', 'OPTION'].includes(p.assetClass) || !/^[A-Z0-9._-]{1,24}$/.test(p.symbol) ||
      !finite(p.createdAt) || !finite(p.targetAt) || p.createdAt <= 0 || p.targetAt <= p.createdAt || p.createdAt > now ||
      !text(p.evidencePackId) || !/^[a-f0-9]{64}$/.test(p.evidencePackSha256) ||
      !finite(p.committeeGeneratedAt) || !finite(p.judgeGeneratedAt) ||
      p.committeeGeneratedAt < p.createdAt || p.judgeGeneratedAt < p.committeeGeneratedAt || p.judgeGeneratedAt > now ||
      !['APPROVE', 'REDUCE', 'REJECT'].includes(p.disposition) || !finite(p.riskMultiplier) ||
      p.riskMultiplier < 0 || p.riskMultiplier > 1 || !finite(p.confidence) || p.confidence < 0 || p.confidence > 1 ||
      !validProbabilities(p.probabilities) || !Array.isArray(p.sourceRefs) || !p.sourceRefs.length || !p.sourceRefs.every(text) ||
      (p.assetClass === 'OPTION' && !text(p.contractId)) || (p.assetClass === 'STOCK' && p.contractId !== undefined) ||
      (p.model && (!text(p.model.provider) || !text(p.model.model) || !text(p.model.promptVersion)))) {
    throw new PredictionJournalError('INVALID_PREDICTION');
  }
}
function validateOutcome(o: PredictionOutcome, p: PredictionSnapshot, now: number): void {
  if (!o || o.assetClass !== p.assetClass) throw new PredictionJournalError('OUTCOME_ASSET_CLASS_MISMATCH');
  if (!finite(o.realizedAt) || !finite(o.observedAt) || o.realizedAt < p.targetAt) throw new PredictionJournalError('OUTCOME_BEFORE_TARGET');
  if (o.observedAt > now || o.realizedAt > o.observedAt || !['POSITIVE', 'NEUTRAL', 'NEGATIVE'].includes(o.outcome) || !text(o.labelSource)) throw new PredictionJournalError('INVALID_OUTCOME');
  if (o.assetClass === 'STOCK') {
    if (!finite(o.totalReturnPct) || (o.benchmarkReturnPct !== undefined && !finite(o.benchmarkReturnPct))) throw new PredictionJournalError('INVALID_OUTCOME');
  } else if (!finite(o.contractReturnPct) || !finite(o.underlyingReturnPct) || !finite(o.entryPremium) || o.entryPremium <= 0 ||
    !finite(o.exitValue) || o.exitValue < 0 || !['CLOSED', 'MARK_TO_MARKET', 'EXPIRED'].includes(o.exitMethod)) {
    throw new PredictionJournalError('INVALID_OUTCOME');
  }
}
export function verifyPredictionJournal(events: PredictionEvent[]) {
  let previous = GENESIS;
  for (let i = 0; i < events.length; i++) {
    const { eventHash, ...body } = events[i];
    if (events[i].sequence !== i + 1 || events[i].prevHash !== previous || hash(canonical(body)) !== eventHash) {
      return { valid: false, length: events.length, headHash: events.at(-1)?.eventHash || GENESIS, brokenAtSequence: events[i].sequence };
    }
    previous = eventHash;
  }
  return { valid: true, length: events.length, headHash: previous, brokenAtSequence: null };
}

/** In-memory reference implementation. Production persistence must use an atomic append-only adapter. */
export class InMemoryPredictionJournal {
  private events: PredictionEvent[] = [];
  private predictions = new Map<string, PredictionSnapshot>();
  private outcomes = new Map<string, PredictionOutcome>();
  constructor(private readonly now: () => number = Date.now) {}
  listEvents(): PredictionEvent[] { return structuredClone(this.events); }
  getPrediction(id: string): PredictionSnapshot | null { const p = this.predictions.get(id); return p ? structuredClone(p) : null; }
  getOutcome(id: string): PredictionOutcome | null { const o = this.outcomes.get(id); return o ? structuredClone(o) : null; }
  record(input: PredictionSnapshotInput): PredictionSnapshot {
    const now = this.now(); validatePrediction(input, now);
    const inputSha256 = hash(canonical(input));
    const body = { ...structuredClone(input), schemaVersion: '1.0.0' as const, recordedAt: now, inputSha256 };
    const snapshot = { ...body, snapshotSha256: hash(canonical(body)) };
    const old = this.predictions.get(input.predictionId);
    if (old) {
      if (old.inputSha256 === inputSha256) return structuredClone(old);
      throw new PredictionJournalError('PREDICTION_ID_COLLISION');
    }
    this.append({ eventType: 'PREDICTION_RECORDED', prediction: snapshot });
    this.predictions.set(input.predictionId, snapshot);
    return structuredClone(snapshot);
  }
  label(id: string, outcome: PredictionOutcome): PredictionOutcome {
    const p = this.predictions.get(id);
    if (!p) throw new PredictionJournalError('PREDICTION_NOT_FOUND');
    validateOutcome(outcome, p, this.now());
    const old = this.outcomes.get(id);
    if (old) {
      if (canonical(old) === canonical(outcome)) return structuredClone(old);
      throw new PredictionJournalError('OUTCOME_ALREADY_LABELED');
    }
    const value = structuredClone(outcome);
    this.append({ eventType: 'OUTCOME_LABELED', predictionId: id, outcome: value });
    this.outcomes.set(id, value);
    return structuredClone(value);
  }
  private append(body: PredictionEventBody): void {
    const eventBody = { ...body, sequence: this.events.length + 1, prevHash: this.events.at(-1)?.eventHash || GENESIS };
    this.events.push({ ...eventBody, eventHash: hash(canonical(eventBody)) } as PredictionEvent);
    if (!verifyPredictionJournal(this.events).valid) throw new PredictionJournalError('JOURNAL_CHAIN_INVALID');
  }
}
export type CalibrationReport = { assetClass: PredictionAssetClass; sampleSize: number; brierScore: number; multiclassBrierScore: number; logLoss: number; accuracy: number; meanConfidence: number; reliability: Array<{ bucket: string; count: number; meanPredictedPositive: number; observedPositiveRate: number }> };
/** One-vs-rest positive Brier score; STOCK and OPTION samples are never pooled. */
export function calculateCalibration(records: Array<{ prediction: PredictionSnapshot; outcome: PredictionOutcome }>, assetClass: PredictionAssetClass): CalibrationReport {
  const rows = records.filter(r => r.prediction.assetClass === assetClass && r.outcome.assetClass === assetClass);
  if (rows.some(r => r.outcome.realizedAt < r.prediction.targetAt)) throw new PredictionJournalError('OUTCOME_BEFORE_TARGET');
  const buckets = Array.from({ length: 5 }, (_, i) => ({ bucket: `${i * 20}-${(i + 1) * 20}%`, count: 0, predicted: 0, positive: 0 }));
  let positiveBrier = 0, multiclassBrier = 0, logLoss = 0, correct = 0, confidence = 0;
  const epsilon = 1e-15;
  for (const { prediction, outcome } of rows) {
    const probabilities = prediction.probabilities;
    const actualClass = outcome.outcome.toLowerCase() as keyof PredictionProbabilities;
    const actual = { positive: 0, neutral: 0, negative: 0 };
    actual[actualClass] = 1;
    const predicted = probabilities.positive;
    positiveBrier += (predicted - actual.positive) ** 2;
    multiclassBrier += (probabilities.positive - actual.positive) ** 2 +
      (probabilities.neutral - actual.neutral) ** 2 + (probabilities.negative - actual.negative) ** 2;
    logLoss -= Math.log(Math.max(epsilon, probabilities[actualClass]));
    const predictedClass = (Object.entries(probabilities) as Array<[keyof PredictionProbabilities, number]>)
      .sort((a, b) => b[1] - a[1])[0][0];
    if (predictedClass === actualClass) correct++;
    confidence += prediction.confidence;
    const b = buckets[Math.min(4, Math.floor(predicted * 5))];
    b.count++; b.predicted += predicted; b.positive += actual.positive;
  }
  const n = rows.length;
  return { assetClass, sampleSize: n, brierScore: n ? positiveBrier / n : 0,
    multiclassBrierScore: n ? multiclassBrier / n : 0, logLoss: n ? logLoss / n : 0,
    accuracy: n ? correct / n : 0, meanConfidence: n ? confidence / n : 0,
    reliability: buckets.filter(b => b.count).map(b => ({
      bucket: b.bucket, count: b.count, meanPredictedPositive: b.predicted / b.count, observedPositiveRate: b.positive / b.count,
    })) };
}


export type CalibrationCohort<T> = {
  key: T;
  report: CalibrationReport;
  belowMinimumSample: boolean;
};
export type StockBenchmarkCalibration = {
  assetClass: 'STOCK';
  sampleSize: number;
  coverage: number;
  meanExcessReturnPct: number | null;
  positiveExcessRate: number | null;
  belowMinimumSample: boolean;
};
export type CohortCalibrationReport =
  | {
      assetClass: 'STOCK';
      overall: CalibrationReport;
      horizonCohorts: Array<CalibrationCohort<string>>;
      benchmark: StockBenchmarkCalibration;
      minimumSampleSize: number;
    }
  | {
      assetClass: 'OPTION';
      overall: CalibrationReport;
      horizonCohorts: Array<CalibrationCohort<string>>;
      exitMethodCohorts: Array<CalibrationCohort<OptionOutcome['exitMethod']>>;
      minimumSampleSize: number;
    };

const HORIZON_BANDS = [
  { key: '0-1d', maxDays: 1 },
  { key: '1-7d', maxDays: 7 },
  { key: '7-30d', maxDays: 30 },
  { key: '30-90d', maxDays: 90 },
  { key: '90d+', maxDays: Number.POSITIVE_INFINITY },
] as const;
function horizonBand(prediction: PredictionSnapshot): string {
  const days = (prediction.targetAt - prediction.createdAt) / 86_400_000;
  return HORIZON_BANDS.find(band => days <= band.maxDays)!.key;
}

/**
 * Evaluates calibration within disjoint research cohorts. The minimum sample
 * threshold is an operational warning only, not a statistical guarantee.
 * STOCK and OPTION records are filtered independently and never pooled.
 */
export function calculateCohortCalibration(
  records: Array<{ prediction: PredictionSnapshot; outcome: PredictionOutcome }>,
  assetClass: 'STOCK',
  minimumSampleSize?: number,
): Extract<CohortCalibrationReport, { assetClass: 'STOCK' }>;
export function calculateCohortCalibration(
  records: Array<{ prediction: PredictionSnapshot; outcome: PredictionOutcome }>,
  assetClass: 'OPTION',
  minimumSampleSize?: number,
): Extract<CohortCalibrationReport, { assetClass: 'OPTION' }>;
export function calculateCohortCalibration(
  records: Array<{ prediction: PredictionSnapshot; outcome: PredictionOutcome }>,
  assetClass: PredictionAssetClass,
  minimumSampleSize = 30,
): CohortCalibrationReport {
  if (!Number.isInteger(minimumSampleSize) || minimumSampleSize < 1) {
    throw new RangeError('minimumSampleSize must be a positive integer');
  }
  const rows = records.filter(row =>
    row.prediction.assetClass === assetClass && row.outcome.assetClass === assetClass);
  const overall = calculateCalibration(rows, assetClass);
  const cohort = <T,>(key: T, members: Array<{ prediction: PredictionSnapshot; outcome: PredictionOutcome }>): CalibrationCohort<T> => {
    const report = calculateCalibration(members, assetClass);
    return { key, report, belowMinimumSample: report.sampleSize < minimumSampleSize };
  };
  const horizonCohorts = HORIZON_BANDS.map(band => cohort(
    band.key,
    rows.filter(row => horizonBand(row.prediction) === band.key),
  ));
  if (assetClass === 'STOCK') {
    const stockRows = rows.filter((row): row is { prediction: PredictionSnapshot; outcome: StockOutcome } =>
      row.outcome.assetClass === 'STOCK' && row.prediction.assetClass === 'STOCK');
    const benchmarkRows = stockRows.filter(row => row.outcome.benchmarkReturnPct !== undefined);
    const excessReturns = benchmarkRows.map(row => row.outcome.totalReturnPct - row.outcome.benchmarkReturnPct!);
    const n = excessReturns.length;
    return {
      assetClass, overall, horizonCohorts,
      benchmark: {
        assetClass: 'STOCK', sampleSize: n,
        coverage: stockRows.length ? n / stockRows.length : 0,
        meanExcessReturnPct: n ? excessReturns.reduce((sum, value) => sum + value, 0) / n : null,
        positiveExcessRate: n ? excessReturns.filter(value => value > 0).length / n : null,
        belowMinimumSample: n < minimumSampleSize,
      },
      minimumSampleSize,
    };
  }
  const optionRows = rows.filter((row): row is { prediction: PredictionSnapshot; outcome: OptionOutcome } =>
    row.outcome.assetClass === 'OPTION' && row.prediction.assetClass === 'OPTION');
  const exitMethods: OptionOutcome['exitMethod'][] = ['CLOSED', 'MARK_TO_MARKET', 'EXPIRED'];
  return {
    assetClass, overall, horizonCohorts,
    exitMethodCohorts: exitMethods.map(method => cohort(method, optionRows.filter(row => row.outcome.exitMethod === method))),
    minimumSampleSize,
  };
}


export type ProportionConfidenceInterval = { lower: number; upper: number };
export type CalibrationUncertaintyReport = {
  assetClass: PredictionAssetClass;
  sampleSize: number;
  confidenceLevel: 0.95;
  accuracy: ProportionConfidenceInterval | null;
  positiveOutcomeRate: ProportionConfidenceInterval | null;
  reliability: Array<{
    bucket: string;
    sampleSize: number;
    observedPositiveRate: number;
    confidenceInterval: ProportionConfidenceInterval;
  }>;
  /** STOCK-only: probability that the realized return exceeded its benchmark. */
  benchmarkPositiveExcessRate?: ProportionConfidenceInterval | null;
};

const WILSON_Z_95 = 1.959963984540054;

/** Two-sided 95% Wilson score interval for a binomial proportion. */
function wilsonInterval(successes: number, sampleSize: number): ProportionConfidenceInterval | null {
  if (!Number.isInteger(successes) || !Number.isInteger(sampleSize) ||
      sampleSize < 0 || successes < 0 || successes > sampleSize) {
    throw new RangeError('Wilson interval requires integer counts with 0 <= successes <= sampleSize');
  }
  if (sampleSize === 0) return null;
  const z2 = WILSON_Z_95 ** 2;
  const p = successes / sampleSize;
  const denominator = 1 + z2 / sampleSize;
  const center = (p + z2 / (2 * sampleSize)) / denominator;
  const margin = WILSON_Z_95 * Math.sqrt((p * (1 - p) / sampleSize) + z2 / (4 * sampleSize ** 2)) / denominator;
  return { lower: Math.max(0, center - margin), upper: Math.min(1, center + margin) };
}

/**
 * Adds sampling uncertainty for observed proportions without implying that
 * confidence intervals establish predictive edge or calibration quality.
 * Intervals are two-sided 95% Wilson score intervals; empty samples are null.
 */
export function calculateCalibrationUncertainty(
  records: Array<{ prediction: PredictionSnapshot; outcome: PredictionOutcome }>,
  assetClass: PredictionAssetClass,
): CalibrationUncertaintyReport {
  const rows = records.filter(row =>
    row.prediction.assetClass === assetClass && row.outcome.assetClass === assetClass);
  let correct = 0;
  let positive = 0;
  const reliabilityCounts = new Map<string, { count: number; positive: number }>();
  let benchmarkCount = 0;
  let benchmarkPositive = 0;
  for (const { prediction, outcome } of rows) {
    const probabilities = prediction.probabilities;
    const predictedClass = (Object.entries(probabilities) as Array<[keyof PredictionProbabilities, number]>)
      .sort((a, b) => b[1] - a[1])[0][0];
    const actualClass = outcome.outcome.toLowerCase();
    if (predictedClass === actualClass) correct++;
    if (actualClass === 'positive') positive++;
    const bucket = `${Math.min(4, Math.floor(probabilities.positive * 5)) * 20}-${(Math.min(4, Math.floor(probabilities.positive * 5)) + 1) * 20}%`;
    const current = reliabilityCounts.get(bucket) || { count: 0, positive: 0 };
    current.count++;
    if (actualClass === 'positive') current.positive++;
    reliabilityCounts.set(bucket, current);
    if (assetClass === 'STOCK') {
      const stockOutcome = outcome as StockOutcome;
      if (stockOutcome.benchmarkReturnPct !== undefined) {
        benchmarkCount++;
        if (stockOutcome.totalReturnPct > stockOutcome.benchmarkReturnPct) benchmarkPositive++;
      }
    }
  }
  return {
    assetClass,
    sampleSize: rows.length,
    confidenceLevel: 0.95,
    accuracy: wilsonInterval(correct, rows.length),
    positiveOutcomeRate: wilsonInterval(positive, rows.length),
    reliability: [...reliabilityCounts.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([bucket, value]) => ({
      bucket, sampleSize: value.count, observedPositiveRate: value.positive / value.count,
      confidenceInterval: wilsonInterval(value.positive, value.count)!,
    })),
    ...(assetClass === 'STOCK'
      ? { benchmarkPositiveExcessRate: wilsonInterval(benchmarkPositive, benchmarkCount) }
      : {}),
  };
}


export type WalkForwardPeriod = { startAt: number; endAt: number };
export type WalkForwardFold = {
  foldId: string;
  train: WalkForwardPeriod;
  calibration: WalkForwardPeriod;
  test: WalkForwardPeriod;
  evaluationAsOf: number;
  embargoMs?: number;
};
export type WalkForwardSegmentReport = {
  period: WalkForwardPeriod;
  assignedSampleSize: number;
  eligibleSampleSize: number;
  purgedSampleSize: number;
  calibration: CalibrationReport | null;
  uncertainty: CalibrationUncertaintyReport | null;
};
export type WalkForwardFoldReport = {
  foldId: string;
  assetClass: PredictionAssetClass;
  train: WalkForwardSegmentReport;
  calibration: WalkForwardSegmentReport;
  test: WalkForwardSegmentReport;
};

/**
 * Evaluates strictly chronological train/calibration/test windows.
 * Training labels must be observable before calibration begins; calibration
 * labels before test begins; test labels by evaluationAsOf. Embargo is applied
 * at each boundary to purge overlapping/late observations. Training metrics
 * are intentionally omitted to avoid presenting in-sample fit as validation.
 */
export function calculateWalkForwardCalibration(
  records: Array<{ prediction: PredictionSnapshot; outcome: PredictionOutcome }>,
  assetClass: PredictionAssetClass,
  folds: WalkForwardFold[],
): WalkForwardFoldReport[] {
  if (!Array.isArray(folds) || !folds.length) throw new RangeError('At least one walk-forward fold is required');
  const ids = new Set<string>();
  const rows = records.filter(row =>
    row.prediction.assetClass === assetClass && row.outcome.assetClass === assetClass);
  const validatePeriod = (period: WalkForwardPeriod): void => {
    if (!period || !finite(period.startAt) || !finite(period.endAt) ||
        period.startAt <= 0 || period.endAt <= period.startAt) {
      throw new RangeError('Walk-forward periods require finite startAt < endAt');
    }
  };
  return folds.map(fold => {
    if (!fold || !text(fold.foldId) || ids.has(fold.foldId) || !finite(fold.evaluationAsOf)) {
      throw new RangeError('Walk-forward fold requires a unique ID and finite evaluationAsOf');
    }
    ids.add(fold.foldId);
    validatePeriod(fold.train);
    validatePeriod(fold.calibration);
    validatePeriod(fold.test);
    const embargoMs = fold.embargoMs ?? 0;
    if (!finite(embargoMs) || embargoMs < 0 ||
        fold.train.endAt > fold.calibration.startAt ||
        fold.calibration.endAt > fold.test.startAt ||
        fold.test.endAt > fold.evaluationAsOf) {
      throw new RangeError('Walk-forward windows must be chronological and embargo must be non-negative');
    }
    const segment = (
      period: WalkForwardPeriod,
      maturityCutoff: number,
      includeMetrics: boolean,
    ): WalkForwardSegmentReport => {
      const assigned = rows.filter(row =>
        row.prediction.createdAt >= period.startAt && row.prediction.createdAt < period.endAt);
      if (assigned.some(row => row.outcome.realizedAt < row.prediction.targetAt)) {
        throw new PredictionJournalError('OUTCOME_BEFORE_TARGET');
      }
      const eligible = assigned.filter(row => row.outcome.observedAt <= maturityCutoff);
      return {
        period: { ...period },
        assignedSampleSize: assigned.length,
        eligibleSampleSize: eligible.length,
        purgedSampleSize: assigned.length - eligible.length,
        calibration: includeMetrics && eligible.length ? calculateCalibration(eligible, assetClass) : null,
        uncertainty: includeMetrics && eligible.length ? calculateCalibrationUncertainty(eligible, assetClass) : null,
      };
    };
    return {
      foldId: fold.foldId,
      assetClass,
      train: segment(fold.train, fold.calibration.startAt - embargoMs, false),
      calibration: segment(fold.calibration, fold.test.startAt - embargoMs, true),
      test: segment(fold.test, fold.evaluationAsOf, true),
    };
  });
}


export type WalkForwardAggregateReport = {
  assetClass: PredictionAssetClass;
  foldCount: number;
  testSampleSize: number;
  belowMinimumSample: boolean;
  weightedMeanAccuracy: number | null;
  weightedMeanMulticlassBrierScore: number | null;
  weightedMeanLogLoss: number | null;
  accuracyFoldStdDev: number | null;
  multiclassBrierFoldStdDev: number | null;
  folds: Array<{ foldId: string; testSampleSize: number; accuracy: number | null; multiclassBrierScore: number | null; logLoss: number | null }>;
};

/**
 * Summarizes independent, non-overlapping test folds. Metrics are weighted
 * by eligible test sample size; dispersion is the population SD across fold
 * metrics (unweighted). Overlapping test windows are rejected to prevent
 * silently double-counting the same predictions in aggregate statistics.
 */
export function summarizeWalkForwardCalibration(
  reports: WalkForwardFoldReport[],
  minimumSampleSize = 30,
): WalkForwardAggregateReport {
  if (!Array.isArray(reports) || !reports.length) throw new RangeError('At least one walk-forward report is required');
  if (!Number.isInteger(minimumSampleSize) || minimumSampleSize < 1) {
    throw new RangeError('minimumSampleSize must be a positive integer');
  }
  const assetClass = reports[0].assetClass;
  const ids = new Set<string>();
  const ordered = [...reports].sort((a, b) => a.test.period.startAt - b.test.period.startAt);
  for (let i = 0; i < ordered.length; i++) {
    const report = ordered[i];
    if (report.assetClass !== assetClass || !text(report.foldId) || ids.has(report.foldId)) {
      throw new RangeError('Walk-forward reports must have one asset class and unique fold IDs');
    }
    ids.add(report.foldId);
    if (i > 0 && ordered[i - 1].test.period.endAt > report.test.period.startAt) {
      throw new RangeError('Test windows must not overlap when aggregating folds');
    }
  }
  const folds = reports.map(report => {
    const calibration = report.test.calibration;
    const sampleSize = calibration?.sampleSize ?? 0;
    return {
      foldId: report.foldId,
      testSampleSize: sampleSize,
      accuracy: sampleSize ? calibration!.accuracy : null,
      multiclassBrierScore: sampleSize ? calibration!.multiclassBrierScore : null,
      logLoss: sampleSize ? calibration!.logLoss : null,
    };
  });
  const total = folds.reduce((sum, fold) => sum + fold.testSampleSize, 0);
  const weighted = (key: 'accuracy' | 'multiclassBrierScore' | 'logLoss'): number | null => {
    if (!total) return null;
    return folds.reduce((sum, fold) =>
      sum + (fold[key] ?? 0) * fold.testSampleSize, 0) / total;
  };
  const deviation = (key: 'accuracy' | 'multiclassBrierScore'): number | null => {
    const measured = folds.filter(fold => fold[key] !== null);
    if (!measured.length) return null;
    const mean = measured.reduce((sum, fold) => sum + (fold[key] as number), 0) / measured.length;
    return Math.sqrt(measured.reduce((sum, fold) => sum + ((fold[key] as number) - mean) ** 2, 0) / measured.length);
  };
  return {
    assetClass,
    foldCount: reports.length,
    testSampleSize: total,
    belowMinimumSample: total < minimumSampleSize,
    weightedMeanAccuracy: weighted('accuracy'),
    weightedMeanMulticlassBrierScore: weighted('multiclassBrierScore'),
    weightedMeanLogLoss: weighted('logLoss'),
    accuracyFoldStdDev: deviation('accuracy'),
    multiclassBrierFoldStdDev: deviation('multiclassBrierScore'),
    folds,
  };
}
