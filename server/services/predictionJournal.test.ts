import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryPredictionJournal, calculateCalibration, calculateCohortCalibration, verifyPredictionJournal, type PredictionSnapshotInput, type StockOutcome, type OptionOutcome } from './predictionJournal.ts';

let clock = 2_000_000;
const digest = 'a'.repeat(64);
function stockInput(id = 'stock-1'): PredictionSnapshotInput {
  return { predictionId: id, assetClass: 'STOCK', symbol: 'AAPL', createdAt: clock - 1000, targetAt: clock + 1000,
    evidencePackId: digest, evidencePackSha256: digest, committeeGeneratedAt: clock - 500, judgeGeneratedAt: clock - 250,
    disposition: 'APPROVE', riskMultiplier: 0.5, confidence: 0.8,
    probabilities: { positive: 0.7, neutral: 0.2, negative: 0.1 }, sourceRefs: ['source:0'] };
}
function optionInput(id = 'option-1'): PredictionSnapshotInput {
  return { ...stockInput(id), assetClass: 'OPTION', symbol: 'AAPL', contractId: 'AAPL261218C00250000' };
}
function stockOutcome(): StockOutcome {
  return { assetClass: 'STOCK', realizedAt: clock - 100, observedAt: clock - 50, outcome: 'POSITIVE',
    totalReturnPct: 4.2, benchmarkReturnPct: 2.1, labelSource: 'fixture-close-prices' };
}
function optionOutcome(): OptionOutcome {
  return { assetClass: 'OPTION', realizedAt: clock - 100, observedAt: clock - 50, outcome: 'NEGATIVE',
    contractReturnPct: -35, underlyingReturnPct: 2, exitMethod: 'MARK_TO_MARKET',
    entryPremium: 5, exitValue: 3.25, labelSource: 'fixture-option-marks' };
}
test('records STOCK and OPTION decisions as immutable hash-chained events', () => {
  const journal = new InMemoryPredictionJournal(() => clock);
  const stock = journal.record(stockInput());
  const option = journal.record(optionInput());
  assert.equal(stock.assetClass, 'STOCK');
  assert.equal(option.assetClass, 'OPTION');
  assert.equal(verifyPredictionJournal(journal.listEvents()).valid, true);
  const copy = journal.getPrediction('stock-1')!;
  (copy as any).symbol = 'MSFT';
  assert.equal(journal.getPrediction('stock-1')?.symbol, 'AAPL');
});
test('labels only after target horizon and rejects cross-asset outcomes', () => {
  const journal = new InMemoryPredictionJournal(() => clock);
  journal.record(stockInput());
  assert.throws(() => journal.label('stock-1', { ...stockOutcome(), realizedAt: clock }), (e: any) => e.code === 'OUTCOME_BEFORE_TARGET');
  assert.throws(() => journal.label('stock-1', optionOutcome()), (e: any) => e.code === 'OUTCOME_ASSET_CLASS_MISMATCH');
  clock += 2000;
  assert.equal(journal.label('stock-1', stockOutcome()).outcome, 'POSITIVE');
});
test('outcome labeling is idempotent but conflicting relabels are rejected', () => {
  const journal = new InMemoryPredictionJournal(() => clock);
  journal.record(stockInput()); clock += 2000;
  const outcome = stockOutcome();
  journal.label('stock-1', outcome);
  journal.label('stock-1', outcome);
  assert.throws(() => journal.label('stock-1', { ...outcome, totalReturnPct: 8 }), (e: any) => e.code === 'OUTCOME_ALREADY_LABELED');
  assert.equal(journal.listEvents().filter(e => e.eventType === 'OUTCOME_LABELED').length, 1);
});
test('validates probability simplex and required option contract identity', () => {
  const journal = new InMemoryPredictionJournal(() => clock);
  assert.throws(() => journal.record({ ...stockInput(), probabilities: { positive: 0.8, neutral: 0.3, negative: 0.1 } }), (e: any) => e.code === 'INVALID_PREDICTION');
  assert.throws(() => journal.record({ ...optionInput(), contractId: undefined }), (e: any) => e.code === 'INVALID_PREDICTION');
});
test('calculates separate Brier and reliability reports for STOCK and OPTION', () => {
  const journal = new InMemoryPredictionJournal(() => clock);
  const stock = journal.record(stockInput());
  const option = journal.record({ ...optionInput(), probabilities: { positive: 0.2, neutral: 0.3, negative: 0.5 } });
  clock += 2000;
  const stockLabel = journal.label('stock-1', stockOutcome());
  const optionLabel = journal.label('option-1', optionOutcome());
  const rows = [{ prediction: stock, outcome: stockLabel }, { prediction: option, outcome: optionLabel }];
  const stocks = calculateCalibration(rows, 'STOCK');
  const options = calculateCalibration(rows, 'OPTION');
  assert.equal(stocks.sampleSize, 1);
  assert.ok(Math.abs(stocks.brierScore - 0.09) < 1e-9);
  assert.equal(options.sampleSize, 1);
  assert.ok(Math.abs(options.brierScore - 0.04) < 1e-9);
  assert.notEqual(stocks.assetClass, options.assetClass);
  assert.ok(Math.abs(stocks.multiclassBrierScore - 0.14) < 1e-9);
  assert.ok(Math.abs(stocks.logLoss - -Math.log(0.7)) < 1e-9);
  assert.equal(stocks.accuracy, 1);
  assert.ok(Math.abs(options.multiclassBrierScore - 0.38) < 1e-9);
  assert.ok(Math.abs(options.logLoss - -Math.log(0.5)) < 1e-9);
  assert.equal(options.accuracy, 1);
});
test('rejects malformed journal chain after tampering', () => {
  const journal = new InMemoryPredictionJournal(() => clock);
  journal.record(stockInput());
  const events = journal.listEvents();
  (events[0] as any).prediction.symbol = 'TSLA';
  assert.equal(verifyPredictionJournal(events).valid, false);
});

test('multiclass calibration scores the realized NEUTRAL and NEGATIVE classes', () => {
  const journal = new InMemoryPredictionJournal(() => clock);
  const neutralPrediction = journal.record({ ...stockInput('neutral-stock'),
    probabilities: { positive: 0.1, neutral: 0.8, negative: 0.1 } });
  const negativePrediction = journal.record({ ...stockInput('negative-stock'),
    probabilities: { positive: 0.1, neutral: 0.2, negative: 0.7 } });
  clock += 2000;
  const neutralOutcome = journal.label('neutral-stock', { ...stockOutcome(), outcome: 'NEUTRAL' });
  const negativeOutcome = journal.label('negative-stock', { ...stockOutcome(), outcome: 'NEGATIVE' });
  const report = calculateCalibration([
    { prediction: neutralPrediction, outcome: neutralOutcome },
    { prediction: negativePrediction, outcome: negativeOutcome },
  ], 'STOCK');
  assert.equal(report.sampleSize, 2);
  assert.equal(report.accuracy, 1);
  assert.ok(Math.abs(report.multiclassBrierScore - 0.1) < 1e-9);
  assert.ok(Math.abs(report.logLoss - ((-Math.log(0.8) - Math.log(0.7)) / 2)) < 1e-9);
  assert.ok(Math.abs(report.brierScore - 0.01) < 1e-12);
});


test('P1.28 builds disjoint horizon cohorts and flags small samples', async () => {
  const { calculateCohortCalibration } = await import('./predictionJournal.ts');
  const now = clock + 200 * 86_400_000;
  const journal = new InMemoryPredictionJournal(() => now);
  const horizons = [0.5, 5, 20, 60, 120];
  const rows = horizons.map((days, index) => {
    const createdAt = clock - 1000;
    const prediction = journal.record({
      ...stockInput(`horizon-${index}`), createdAt,
      targetAt: createdAt + days * 86_400_000,
      committeeGeneratedAt: createdAt + 500, judgeGeneratedAt: createdAt + 750,
    });
    const outcome = journal.label(`horizon-${index}`, {
      ...stockOutcome(), realizedAt: now - 1, observedAt: now,
      totalReturnPct: index + 2, benchmarkReturnPct: index,
    });
    return { prediction, outcome };
  });
  const report = calculateCohortCalibration(rows, 'STOCK', 2);
  assert.equal(report.assetClass, 'STOCK');
  assert.equal(report.overall.sampleSize, 5);
  assert.deepEqual(report.horizonCohorts.map(c => c.report.sampleSize), [1, 1, 1, 1, 1]);
  assert.ok(report.horizonCohorts.every(c => c.belowMinimumSample));
  assert.equal(report.benchmark.sampleSize, 5);
  assert.equal(report.benchmark.coverage, 1);
  assert.equal(report.benchmark.meanExcessReturnPct, 2);
  assert.equal(report.benchmark.positiveExcessRate, 1);
  assert.equal(report.benchmark.belowMinimumSample, false);
});

test('P1.28 separates OPTION exit methods and never mixes STOCK records', async () => {
  const { calculateCohortCalibration } = await import('./predictionJournal.ts');
  const now = clock + 200 * 86_400_000;
  const journal = new InMemoryPredictionJournal(() => now);
  const methods: OptionOutcome['exitMethod'][] = ['CLOSED', 'MARK_TO_MARKET', 'EXPIRED'];
  const optionRows = methods.map((method, index) => {
    const createdAt = clock - 1000;
    const prediction = journal.record({
      ...optionInput(`exit-${index}`), createdAt,
      targetAt: createdAt + 2 * 86_400_000,
      committeeGeneratedAt: createdAt + 500, judgeGeneratedAt: createdAt + 750,
    });
    const outcome = journal.label(`exit-${index}`, {
      ...optionOutcome(), exitMethod: method, realizedAt: now - 1, observedAt: now,
    });
    return { prediction, outcome };
  });
  const oldCreatedAt = clock - 1000;
  const stockPrediction = journal.record({ ...stockInput('unrelated-stock'), createdAt: oldCreatedAt, targetAt: oldCreatedAt + 86_400_000, committeeGeneratedAt: oldCreatedAt + 500, judgeGeneratedAt: oldCreatedAt + 750 });
  const stockOutcomeLabel = journal.label('unrelated-stock', {
    ...stockOutcome(), realizedAt: now - 1, observedAt: now,
  });
  const report = calculateCohortCalibration([
    ...optionRows, { prediction: stockPrediction, outcome: stockOutcomeLabel },
  ], 'OPTION', 1);
  assert.equal(report.overall.sampleSize, 3);
  assert.deepEqual(report.exitMethodCohorts.map(c => c.report.sampleSize), [1, 1, 1]);
  assert.ok(report.exitMethodCohorts.every(c => !c.belowMinimumSample));
  assert.equal(report.horizonCohorts.reduce((sum, c) => sum + c.report.sampleSize, 0), 3);
});

test('P1.28 handles absent benchmark observations and validates minimum sample size', async () => {
  const { calculateCohortCalibration } = await import('./predictionJournal.ts');
  const now = clock + 200 * 86_400_000;
  const journal = new InMemoryPredictionJournal(() => now);
  const oldCreatedAt = clock - 1000;
  const prediction = journal.record({ ...stockInput('no-benchmark'), createdAt: oldCreatedAt, targetAt: oldCreatedAt + 86_400_000, committeeGeneratedAt: oldCreatedAt + 500, judgeGeneratedAt: oldCreatedAt + 750 });
  const outcome = journal.label('no-benchmark', {
    ...stockOutcome(), benchmarkReturnPct: undefined, realizedAt: now - 1, observedAt: now,
  });
  const report = calculateCohortCalibration([{ prediction, outcome }], 'STOCK');
  assert.equal(report.benchmark.sampleSize, 0);
  assert.equal(report.benchmark.coverage, 0);
  assert.equal(report.benchmark.meanExcessReturnPct, null);
  assert.equal(report.benchmark.positiveExcessRate, null);
  assert.equal(report.benchmark.belowMinimumSample, true);
  assert.throws(() => calculateCohortCalibration([], 'STOCK', 0), RangeError);
});


test('P1.29 reports 95% Wilson uncertainty without pooling asset classes', async () => {
  const { calculateCalibrationUncertainty } = await import('./predictionJournal.ts');
  const now = clock + 200 * 86_400_000;
  const journal = new InMemoryPredictionJournal(() => now);
  const createdAt = clock - 1000;
  const stockPredictions = [
    journal.record({ ...stockInput('uncertainty-1'), createdAt, targetAt: createdAt + 86_400_000,
      committeeGeneratedAt: createdAt + 500, judgeGeneratedAt: createdAt + 750,
      probabilities: { positive: 0.7, neutral: 0.2, negative: 0.1 } }),
    journal.record({ ...stockInput('uncertainty-2'), createdAt, targetAt: createdAt + 86_400_000,
      committeeGeneratedAt: createdAt + 500, judgeGeneratedAt: createdAt + 750,
      probabilities: { positive: 0.7, neutral: 0.2, negative: 0.1 } }),
  ];
  const stockOutcomes = [
    journal.label('uncertainty-1', { ...stockOutcome(), realizedAt: now - 1, observedAt: now,
      outcome: 'POSITIVE', totalReturnPct: 4, benchmarkReturnPct: 2 }),
    journal.label('uncertainty-2', { ...stockOutcome(), realizedAt: now - 1, observedAt: now,
      outcome: 'NEGATIVE', totalReturnPct: 1, benchmarkReturnPct: 2 }),
  ];
  const optionPrediction = journal.record({ ...optionInput('uncertainty-option'), createdAt,
    targetAt: createdAt + 86_400_000, committeeGeneratedAt: createdAt + 500, judgeGeneratedAt: createdAt + 750 });
  const optionOutcomeLabel = journal.label('uncertainty-option', {
    ...optionOutcome(), realizedAt: now - 1, observedAt: now,
  });
  const stockRows = stockPredictions.map((prediction, index) => ({ prediction, outcome: stockOutcomes[index] }));
  const stock = calculateCalibrationUncertainty([...stockRows, { prediction: optionPrediction, outcome: optionOutcomeLabel }], 'STOCK');
  assert.equal(stock.sampleSize, 2);
  assert.equal(stock.confidenceLevel, 0.95);
  assert.ok(stock.accuracy);
  assert.ok(stock.accuracy.lower < 0.5 && stock.accuracy.upper > 0.5);
  assert.ok(stock.positiveOutcomeRate);
  assert.equal(stock.reliability[0].sampleSize, 2);
  assert.ok(stock.reliability[0].confidenceInterval.lower < 0.5);
  assert.ok(stock.benchmarkPositiveExcessRate);
  assert.ok(stock.benchmarkPositiveExcessRate.lower < 0.5);
  assert.ok(stock.benchmarkPositiveExcessRate.upper > 0.5);
  const empty = calculateCalibrationUncertainty([], 'OPTION');
  assert.equal(empty.sampleSize, 0);
  assert.equal(empty.accuracy, null);
  assert.equal(empty.positiveOutcomeRate, null);
  assert.deepEqual(empty.reliability, []);
  assert.equal('benchmarkPositiveExcessRate' in empty, false);
});


test('P1.30 enforces chronological walk-forward maturity and keeps asset classes separate', async () => {
  const { calculateWalkForwardCalibration } = await import('./predictionJournal.ts');
  const now = clock + 500 * 86_400_000;
  const journal = new InMemoryPredictionJournal(() => now);
  const day = 86_400_000;
  const makeStock = (id: string, createdAt: number, observedAt: number) => {
    const prediction = journal.record({
      ...stockInput(id), createdAt, targetAt: createdAt + day,
      committeeGeneratedAt: createdAt + 500, judgeGeneratedAt: createdAt + 750,
    });
    const outcome = journal.label(id, {
      ...stockOutcome(), realizedAt: observedAt - 1000, observedAt,
    });
    return { prediction, outcome };
  };
  const makeOption = (id: string, createdAt: number, observedAt: number) => {
    const prediction = journal.record({
      ...optionInput(id), createdAt, targetAt: createdAt + day,
      committeeGeneratedAt: createdAt + 500, judgeGeneratedAt: createdAt + 750,
    });
    const outcome = journal.label(id, {
      ...optionOutcome(), realizedAt: observedAt - 1000, observedAt,
    });
    return { prediction, outcome };
  };
  const trainRow = makeStock('wf-train', now - 110 * day, now - 95 * day);
  const calibrationRow = makeStock('wf-calibration', now - 80 * day, now - 65 * day);
  const purgedCalibrationRow = makeStock('wf-calibration-late', now - 75 * day, now - 50 * day);
  const testRow = makeStock('wf-test', now - 50 * day, now - 40 * day);
  const unrelatedOption = makeOption('wf-option', now - 50 * day, now - 40 * day);
  const report = calculateWalkForwardCalibration(
    [trainRow, calibrationRow, purgedCalibrationRow, testRow, unrelatedOption],
    'STOCK',
    [{
      foldId: 'fold-1',
      train: { startAt: now - 120 * day, endAt: now - 100 * day },
      calibration: { startAt: now - 90 * day, endAt: now - 60 * day },
      test: { startAt: now - 60 * day, endAt: now - 35 * day },
      evaluationAsOf: now - 30 * day,
      embargoMs: day,
    }],
  )[0];
  assert.equal(report.train.assignedSampleSize, 1);
  assert.equal(report.train.eligibleSampleSize, 1);
  assert.equal(report.train.calibration, null);
  assert.equal(report.calibration.assignedSampleSize, 2);
  assert.equal(report.calibration.eligibleSampleSize, 1);
  assert.equal(report.calibration.purgedSampleSize, 1);
  assert.equal(report.calibration.calibration?.sampleSize, 1);
  assert.equal(report.test.assignedSampleSize, 1);
  assert.equal(report.test.eligibleSampleSize, 1);
  assert.equal(report.test.calibration?.sampleSize, 1);
  assert.equal(report.assetClass, 'STOCK');
});

test('P1.30 rejects invalid or overlapping walk-forward boundaries', async () => {
  const { calculateWalkForwardCalibration } = await import('./predictionJournal.ts');
  const fold = {
    foldId: 'invalid-fold',
    train: { startAt: 1, endAt: 10 },
    calibration: { startAt: 9, endAt: 20 },
    test: { startAt: 20, endAt: 30 },
    evaluationAsOf: 30,
  };
  assert.throws(() => calculateWalkForwardCalibration([], 'STOCK', [fold]), RangeError);
  assert.throws(() => calculateWalkForwardCalibration([], 'STOCK', [{
    ...fold, foldId: 'negative-embargo', train: { startAt: 1, endAt: 9 }, embargoMs: -1,
  }]), RangeError);
  assert.throws(() => calculateWalkForwardCalibration([], 'STOCK', [
    { ...fold, train: { startAt: 1, endAt: 8 }, foldId: 'duplicate' },
    { ...fold, train: { startAt: 1, endAt: 8 }, foldId: 'duplicate' },
  ]), RangeError);
});


test('P1.31 aggregates disjoint walk-forward test folds with sample weighting and dispersion', async () => {
  const { summarizeWalkForwardCalibration } = await import('./predictionJournal.ts');
  const report = (foldId: string, startAt: number, endAt: number, sampleSize: number,
    accuracy: number, brier: number, logLoss: number) => ({
    foldId, assetClass: 'STOCK' as const,
    train: { period: { startAt: startAt - 30, endAt: startAt - 20 }, assignedSampleSize: 0,
      eligibleSampleSize: 0, purgedSampleSize: 0, calibration: null, uncertainty: null },
    calibration: { period: { startAt: startAt - 20, endAt: startAt - 10 }, assignedSampleSize: 0,
      eligibleSampleSize: 0, purgedSampleSize: 0, calibration: null, uncertainty: null },
    test: { period: { startAt, endAt }, assignedSampleSize: sampleSize,
      eligibleSampleSize: sampleSize, purgedSampleSize: 0,
      calibration: { assetClass: 'STOCK' as const, sampleSize, accuracy,
        multiclassBrierScore: brier, logLoss, brierScore: brier, meanConfidence: 0.7, reliability: [] },
      uncertainty: null },
  });
  const summary = summarizeWalkForwardCalibration([
    report('fold-a', 100, 200, 10, 0.6, 0.4, 0.8),
    report('fold-b', 200, 300, 30, 0.8, 0.2, 0.4),
  ], 50);
  assert.equal(summary.foldCount, 2);
  assert.equal(summary.testSampleSize, 40);
  assert.equal(summary.belowMinimumSample, true);
  assert.equal(summary.weightedMeanAccuracy, 0.75);
  assert.equal(summary.weightedMeanMulticlassBrierScore, 0.25);
  assert.equal(summary.weightedMeanLogLoss, 0.5);
  assert.ok(summary.accuracyFoldStdDev);
  assert.ok(summary.multiclassBrierFoldStdDev);
  assert.throws(() => summarizeWalkForwardCalibration([
    report('overlap-a', 100, 250, 10, 0.6, 0.4, 0.8),
    report('overlap-b', 200, 300, 10, 0.8, 0.2, 0.4),
  ]), RangeError);
  assert.throws(() => summarizeWalkForwardCalibration([
    report('stock', 100, 200, 10, 0.6, 0.4, 0.8),
    { ...report('option', 200, 300, 10, 0.8, 0.2, 0.4), assetClass: 'OPTION' },
  ]), RangeError);
});

test('P1.41 records typed origin provenance and keeps bot asset classes isolated', () => {
  const journal = new InMemoryPredictionJournal(() => clock);
  const stock = journal.record({ ...stockInput('stock-bot-origin'), origin: {
    kind: 'STOCK_BOT', sourceId: 'stock-run-42', strategyId: 'macd-equity-v2',
    decisionId: 'decision-stock-42', candidateId: 'candidate-AAPL', runId: 'run-stock-42',
  } });
  const option = journal.record({ ...optionInput('option-bot-origin'), origin: {
    kind: 'OPTION_BOT', sourceId: 'option-run-17', strategyId: 'covered-call-v1',
    decisionId: 'decision-option-17', candidateId: 'candidate-AAPL-call', runId: 'run-option-17',
  } });
  assert.equal(stock.origin?.kind, 'STOCK_BOT');
  assert.equal(stock.origin?.decisionId, 'decision-stock-42');
  assert.equal(option.origin?.kind, 'OPTION_BOT');
  assert.equal(option.origin?.candidateId, 'candidate-AAPL-call');
  assert.equal(verifyPredictionJournal(journal.listEvents()).valid, true);

  assert.throws(() => journal.record({ ...stockInput('wrong-stock-origin'), origin: {
    kind: 'OPTION_BOT', sourceId: 'option-run-18',
  } }), (error: any) => error.code === 'INVALID_PREDICTION');
  assert.throws(() => journal.record({ ...optionInput('wrong-option-origin'), origin: {
    kind: 'STOCK_BOT', sourceId: 'stock-run-43',
  } }), (error: any) => error.code === 'INVALID_PREDICTION');
});

test('P1.41 validates origin identifiers and preserves legacy origin-free snapshots', () => {
  const journal = new InMemoryPredictionJournal(() => clock);
  const legacy = journal.record(stockInput('legacy-origin-free'));
  assert.equal(legacy.origin, undefined);
  assert.throws(() => journal.record({ ...stockInput('invalid-origin'), origin: {
    kind: 'SCANNER', sourceId: '',
  } }), (error: any) => error.code === 'INVALID_PREDICTION');
  assert.throws(() => journal.record({ ...stockInput('invalid-origin-kind'), origin: {
    kind: 'UNKNOWN' as any, sourceId: 'scanner-1',
  } }), (error: any) => error.code === 'INVALID_PREDICTION');
  assert.throws(() => journal.record({ ...stockInput('oversized-origin-id'), origin: {
    kind: 'MANUAL', sourceId: 'x'.repeat(129),
  } }), (error: any) => error.code === 'INVALID_PREDICTION');
});

test('P1.42 reports origin calibration cohorts independently for STOCK and OPTION', () => {
  const journal = new InMemoryPredictionJournal(() => clock);
  const stockBot = journal.record({ ...stockInput('origin-stock-bot'), origin: { kind: 'STOCK_BOT', sourceId: 'stock-run-1' } });
  const stockLegacy = journal.record(stockInput('origin-stock-legacy'));
  const optionBot = journal.record({ ...optionInput('origin-option-bot'), origin: { kind: 'OPTION_BOT', sourceId: 'option-run-1' } });
  const optionLegacy = journal.record(optionInput('origin-option-legacy'));
  clock += 2000;
  const records = [
    { prediction: stockBot, outcome: journal.label(stockBot.predictionId, stockOutcome()) },
    { prediction: stockLegacy, outcome: journal.label(stockLegacy.predictionId, stockOutcome()) },
    { prediction: optionBot, outcome: journal.label(optionBot.predictionId, optionOutcome()) },
    { prediction: optionLegacy, outcome: journal.label(optionLegacy.predictionId, optionOutcome()) },
  ];
  const stock = calculateCohortCalibration(records, 'STOCK', 2);
  const option = calculateCohortCalibration(records, 'OPTION', 2);
  const stockBotCohort = stock.originCohorts.find(row => row.key === 'STOCK_BOT')!;
  const stockLegacyCohort = stock.originCohorts.find(row => row.key === 'LEGACY_UNATTRIBUTED')!;
  const optionBotCohort = option.originCohorts.find(row => row.key === 'OPTION_BOT')!;
  assert.equal(stockBotCohort.report.sampleSize, 1);
  assert.equal(stockLegacyCohort.report.sampleSize, 1);
  assert.equal(optionBotCohort.report.sampleSize, 1);
  assert.equal(stock.originCohorts.reduce((sum, row) => sum + row.report.sampleSize, 0), stock.overall.sampleSize);
  assert.equal(option.originCohorts.reduce((sum, row) => sum + row.report.sampleSize, 0), option.overall.sampleSize);
  assert.equal(stock.originCohorts.find(row => row.key === 'OPTION_BOT')?.report.sampleSize, 0);
  assert.equal(option.originCohorts.find(row => row.key === 'STOCK_BOT')?.report.sampleSize, 0);
});
