export type CalibrationAssetClass = 'STOCK' | 'OPTION';

export type CalibrationMetrics = {
  assetClass: CalibrationAssetClass;
  sampleSize: number;
  brierScore: number;
  multiclassBrierScore: number;
  logLoss: number;
  accuracy: number;
  meanConfidence: number;
  reliability: Array<{
    bucket: string;
    count: number;
    meanPredictedPositive: number;
    observedPositiveRate: number;
  }>;
};

export type CalibrationCohort = {
  key: string;
  report: CalibrationMetrics;
  belowMinimumSample: boolean;
};

export type CalibrationAssetReport =
  | {
      assetClass: 'STOCK';
      overall: CalibrationMetrics;
      horizonCohorts: CalibrationCohort[];
      benchmark: {
        assetClass: 'STOCK';
        sampleSize: number;
        coverage: number;
        meanExcessReturnPct: number | null;
        positiveExcessRate: number | null;
        belowMinimumSample: boolean;
      };
      minimumSampleSize: number;
    }
  | {
      assetClass: 'OPTION';
      overall: CalibrationMetrics;
      horizonCohorts: CalibrationCohort[];
      exitMethodCohorts: CalibrationCohort[];
      minimumSampleSize: number;
    };

export type WilsonInterval = { lower: number; upper: number } | null;
export type WalkForwardSegment = {
  assignedSampleSize: number; eligibleSampleSize: number; purgedSampleSize: number;
  calibration: CalibrationMetrics | null;
  uncertainty: { accuracy: WilsonInterval; positiveOutcomeRate: WilsonInterval } | null;
};
export type WalkForwardAssetReport = {
  assetClass: CalibrationAssetClass; available: boolean; reason: string | null; distinctTimestamps: number;
  folds: Array<{ foldId: string; train: WalkForwardSegment; calibration: WalkForwardSegment; test: WalkForwardSegment }>;
  aggregate: null | { foldCount: number; testSampleSize: number; belowMinimumSample: boolean;
    weightedMeanAccuracy: number | null; weightedMeanMulticlassBrierScore: number | null;
    weightedMeanLogLoss: number | null; accuracyFoldStdDev: number | null; multiclassBrierFoldStdDev: number | null };
};
export type CalibrationPayload = {
  integrity: { valid: true; headMatches: true; length: number; headHash: string };
  stock: Extract<CalibrationAssetReport, { assetClass: 'STOCK' }>;
  option: Extract<CalibrationAssetReport, { assetClass: 'OPTION' }>;
  walkForward: { methodology: string; minimumSampleSize: number; stock: WalkForwardAssetReport; option: WalkForwardAssetReport };
  readOnly: true;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const isUnitInterval = (value: unknown): value is number =>
  isFiniteNumber(value) && value >= 0 && value <= 1;

function parseMetrics(value: unknown, assetClass: CalibrationAssetClass): CalibrationMetrics | null {
  if (!isRecord(value) || value.assetClass !== assetClass ||
      !Number.isSafeInteger(value.sampleSize) || (value.sampleSize as number) < 0 ||
      !isFiniteNumber(value.brierScore) || !isFiniteNumber(value.multiclassBrierScore) ||
      !isFiniteNumber(value.logLoss) || !isUnitInterval(value.accuracy) ||
      !isUnitInterval(value.meanConfidence) || !Array.isArray(value.reliability)) return null;

  const reliability = value.reliability.map((row) => {
    if (!isRecord(row) || typeof row.bucket !== 'string' ||
        !Number.isSafeInteger(row.count) || (row.count as number) < 1 ||
        !isUnitInterval(row.meanPredictedPositive) || !isUnitInterval(row.observedPositiveRate)) return null;
    return {
      bucket: row.bucket,
      count: row.count as number,
      meanPredictedPositive: row.meanPredictedPositive as number,
      observedPositiveRate: row.observedPositiveRate as number,
    };
  });
  if (reliability.some(row => row === null)) return null;

  return {
    assetClass,
    sampleSize: value.sampleSize as number,
    brierScore: value.brierScore,
    multiclassBrierScore: value.multiclassBrierScore,
    logLoss: value.logLoss,
    accuracy: value.accuracy,
    meanConfidence: value.meanConfidence,
    reliability: reliability as CalibrationMetrics['reliability'],
  };
}

function parseCohorts(value: unknown, assetClass: CalibrationAssetClass): CalibrationCohort[] | null {
  if (!Array.isArray(value)) return null;
  const cohorts = value.map((row) => {
    if (!isRecord(row) || typeof row.key !== 'string' ||
        typeof row.belowMinimumSample !== 'boolean') return null;
    const report = parseMetrics(row.report, assetClass);
    return report ? { key: row.key, report, belowMinimumSample: row.belowMinimumSample } : null;
  });
  return cohorts.some(row => row === null) ? null : cohorts as CalibrationCohort[];
}

function parseAssetReport(value: unknown, assetClass: CalibrationAssetClass): CalibrationAssetReport | null {
  if (!isRecord(value) || value.assetClass !== assetClass ||
      !Number.isSafeInteger(value.minimumSampleSize) || (value.minimumSampleSize as number) < 1) return null;
  const overall = parseMetrics(value.overall, assetClass);
  const horizonCohorts = parseCohorts(value.horizonCohorts, assetClass);
  if (!overall || !horizonCohorts) return null;

  if (assetClass === 'STOCK') {
    const benchmark = value.benchmark;
    if (!isRecord(benchmark) || benchmark.assetClass !== 'STOCK' ||
        !Number.isSafeInteger(benchmark.sampleSize) || (benchmark.sampleSize as number) < 0 ||
        !isUnitInterval(benchmark.coverage) ||
        !(benchmark.meanExcessReturnPct === null || isFiniteNumber(benchmark.meanExcessReturnPct)) ||
        !(benchmark.positiveExcessRate === null || isUnitInterval(benchmark.positiveExcessRate)) ||
        typeof benchmark.belowMinimumSample !== 'boolean') return null;
    return {
      assetClass, overall, horizonCohorts,
      benchmark: {
        assetClass: 'STOCK',
        sampleSize: benchmark.sampleSize as number,
        coverage: benchmark.coverage,
        meanExcessReturnPct: benchmark.meanExcessReturnPct as number | null,
        positiveExcessRate: benchmark.positiveExcessRate as number | null,
        belowMinimumSample: benchmark.belowMinimumSample,
      },
      minimumSampleSize: value.minimumSampleSize as number,
    };
  }

  const exitMethodCohorts = parseCohorts(value.exitMethodCohorts, assetClass);
  if (!exitMethodCohorts) return null;
  return { assetClass, overall, horizonCohorts, exitMethodCohorts, minimumSampleSize: value.minimumSampleSize as number };
}

export function selectCalibrationReport(
  payload: CalibrationPayload,
  assetClass: CalibrationAssetClass,
): CalibrationAssetReport {
  return assetClass === 'STOCK' ? payload.stock : payload.option;
}

function parseInterval(value: unknown): WilsonInterval | undefined {
  if (value === null) return null;
  if (!isRecord(value) || !isUnitInterval(value.lower) || !isUnitInterval(value.upper) || value.lower > value.upper) return undefined;
  return { lower: value.lower, upper: value.upper };
}
function parseWalkForwardSegment(value: unknown, assetClass: CalibrationAssetClass): WalkForwardSegment | null {
  if (!isRecord(value) || !Number.isSafeInteger(value.assignedSampleSize) || (value.assignedSampleSize as number) < 0 ||
      !Number.isSafeInteger(value.eligibleSampleSize) || (value.eligibleSampleSize as number) < 0 ||
      !Number.isSafeInteger(value.purgedSampleSize) || (value.purgedSampleSize as number) < 0 ||
      (value.eligibleSampleSize as number) + (value.purgedSampleSize as number) > (value.assignedSampleSize as number)) return null;
  let calibration: CalibrationMetrics | null = null;
  if (value.calibration !== null) { calibration = parseMetrics(value.calibration, assetClass); if (!calibration) return null; }
  let uncertainty: WalkForwardSegment['uncertainty'] = null;
  if (value.uncertainty !== null) {
    if (!isRecord(value.uncertainty)) return null;
    const accuracy = parseInterval(value.uncertainty.accuracy);
    const positiveOutcomeRate = parseInterval(value.uncertainty.positiveOutcomeRate);
    if (accuracy === undefined || positiveOutcomeRate === undefined) return null;
    uncertainty = { accuracy, positiveOutcomeRate };
  }
  return { assignedSampleSize: value.assignedSampleSize as number, eligibleSampleSize: value.eligibleSampleSize as number,
    purgedSampleSize: value.purgedSampleSize as number, calibration, uncertainty };
}
function parseWalkForwardAsset(value: unknown, assetClass: CalibrationAssetClass): WalkForwardAssetReport | null {
  if (!isRecord(value) || value.assetClass !== assetClass || typeof value.available !== 'boolean' ||
      !(value.reason === null || typeof value.reason === 'string') ||
      !Number.isSafeInteger(value.distinctTimestamps) || (value.distinctTimestamps as number) < 0 || !Array.isArray(value.folds)) return null;
  const folds = value.folds.map((fold) => {
    if (!isRecord(fold) || typeof fold.foldId !== 'string' || !fold.foldId.trim()) return null;
    const train = parseWalkForwardSegment(fold.train, assetClass);
    const calibration = parseWalkForwardSegment(fold.calibration, assetClass);
    const test = parseWalkForwardSegment(fold.test, assetClass);
    return train && calibration && test ? { foldId: fold.foldId, train, calibration, test } : null;
  });
  if (folds.some(fold => fold === null)) return null;
  let aggregate: WalkForwardAssetReport['aggregate'] = null;
  if (value.aggregate !== null) {
    const a = value.aggregate;
    if (!isRecord(a) || !Number.isSafeInteger(a.foldCount) || (a.foldCount as number) < 0 ||
        !Number.isSafeInteger(a.testSampleSize) || (a.testSampleSize as number) < 0 || typeof a.belowMinimumSample !== 'boolean') return null;
    for (const key of ['weightedMeanAccuracy','weightedMeanMulticlassBrierScore','weightedMeanLogLoss','accuracyFoldStdDev','multiclassBrierFoldStdDev']) {
      if (!(a[key] === null || (isFiniteNumber(a[key]) && (a[key] as number) >= 0))) return null;
    }
    if ((a.weightedMeanAccuracy !== null && !isUnitInterval(a.weightedMeanAccuracy)) ||
        (a.weightedMeanMulticlassBrierScore !== null && (a.weightedMeanMulticlassBrierScore as number) > 2) ||
        (a.accuracyFoldStdDev !== null && (a.accuracyFoldStdDev as number) > 1)) return null;
    aggregate = { foldCount: a.foldCount as number, testSampleSize: a.testSampleSize as number, belowMinimumSample: a.belowMinimumSample,
      weightedMeanAccuracy: a.weightedMeanAccuracy as number | null, weightedMeanMulticlassBrierScore: a.weightedMeanMulticlassBrierScore as number | null,
      weightedMeanLogLoss: a.weightedMeanLogLoss as number | null, accuracyFoldStdDev: a.accuracyFoldStdDev as number | null,
      multiclassBrierFoldStdDev: a.multiclassBrierFoldStdDev as number | null };
  }
  if (value.available ? !aggregate || folds.length === 0 : aggregate !== null || folds.length !== 0) return null;
  return { assetClass, available: value.available, reason: value.reason as string | null,
    distinctTimestamps: value.distinctTimestamps as number, folds: folds as WalkForwardAssetReport['folds'], aggregate };
}
export function parseCalibrationPayload(value: unknown): CalibrationPayload | null {
  if (!isRecord(value) || value.readOnly !== true || !isRecord(value.integrity) || value.integrity.valid !== true ||
      value.integrity.headMatches !== true || !Number.isSafeInteger(value.integrity.length) || (value.integrity.length as number) < 0 ||
      typeof value.integrity.headHash !== 'string' || !/^[a-f0-9]{64}$/.test(value.integrity.headHash)) return null;
  const stock = parseAssetReport(value.stock, 'STOCK'); const option = parseAssetReport(value.option, 'OPTION');
  if (!stock || !option || !isRecord(value.walkForward)) return null;
  const wf = value.walkForward;
  if (typeof wf.methodology !== 'string' || !wf.methodology.trim() || !Number.isSafeInteger(wf.minimumSampleSize) || (wf.minimumSampleSize as number) < 1) return null;
  const stockWalkForward = parseWalkForwardAsset(wf.stock, 'STOCK'); const optionWalkForward = parseWalkForwardAsset(wf.option, 'OPTION');
  if (!stockWalkForward || !optionWalkForward) return null;
  return { integrity: { valid: true, headMatches: true, length: value.integrity.length as number, headHash: value.integrity.headHash },
    stock, option, walkForward: { methodology: wf.methodology, minimumSampleSize: wf.minimumSampleSize as number, stock: stockWalkForward, option: optionWalkForward }, readOnly: true };
}
