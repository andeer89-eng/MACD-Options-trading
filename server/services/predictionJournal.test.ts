import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryPredictionJournal, calculateCalibration, verifyPredictionJournal, type PredictionSnapshotInput, type StockOutcome, type OptionOutcome } from './predictionJournal.ts';

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
  assert.equal(stock.benchmarkPositiveExcessRate.lower, 0);
  assert.equal(stock.benchmarkPositiveExcessRate.upper, 1);
  const empty = calculateCalibrationUncertainty([], 'OPTION');
  assert.equal(empty.sampleSize, 0);
  assert.equal(empty.accuracy, null);
  assert.equal(empty.positiveOutcomeRate, null);
  assert.deepEqual(empty.reliability, []);
  assert.equal('benchmarkPositiveExcessRate' in empty, false);
});
