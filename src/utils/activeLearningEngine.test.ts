import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initDefaultActiveMemory,
  ingestTradeEpisode,
  queryMemoryForSetup,
  exportActiveMemoryJSON,
  generateTradeReflection,
  ActiveMemoryState,
} from './activeLearningEngine.ts';

test('initDefaultActiveMemory creates structured active memory baseline', () => {
  const memory = initDefaultActiveMemory();

  assert.equal(typeof memory.version, 'string');
  assert.ok(memory.episodes.length >= 3, 'Should have baseline seed episodes');
  assert.ok(memory.learnedRules.length >= 4, 'Should contain learned heuristic rules');
  assert.ok(memory.setupWeights['BULLISH TRIPLE'].currentWeightMultiplier > 1.0);
  assert.ok(memory.setupWeights['BEARISH TRIPLE'].currentWeightMultiplier < 1.0);
  assert.equal(memory.calibratedMinQualityScore, 70);
  assert.equal(memory.calibratedAtrStopMultiple, 1.25);
});

test('generateTradeReflection creates constructive critique for wins and losses', () => {
  const winReflect = generateTradeReflection(
    'NVDA',
    'BULLISH TRIPLE',
    'BULLISH',
    150.0,
    8.5,
    82,
    2.5,
    'Target 2 reached'
  );
  assert.ok(winReflect.deltaWeight > 0, 'Win should yield positive delta weight');
  assert.ok(winReflect.critique.includes('positive expectancy'));
  assert.ok(winReflect.rule.includes('BULLISH TRIPLE'));

  const lossReflect = generateTradeReflection(
    'TSLA',
    'BEARISH TRIPLE',
    'BEARISH',
    -300.0,
    -3.2,
    68,
    4.2,
    'STOP LOSS TRIGGERED'
  );
  assert.ok(lossReflect.deltaWeight < 0, 'Loss should yield negative delta weight');
  assert.ok(lossReflect.critique.includes('loss'));
  assert.ok(lossReflect.rule.includes('Throttle'));
});

test('ingesting a winning trade adapts setup multiplier upward and stores episode', () => {
  const initial = initDefaultActiveMemory();
  const prevCount = initial.episodes.length;
  const prevMultiplier = initial.setupWeights['BULLISH TRIPLE'].currentWeightMultiplier;

  const { updatedState, newEpisode } = ingestTradeEpisode(initial, {
    symbol: 'AMD',
    setupType: 'BULLISH TRIPLE',
    direction: 'BULLISH',
    entryPrice: 150.0,
    exitPrice: 162.0,
    pnl: 240.0,
    pnlPercent: 8.0,
    qualityScore: 85,
    atrPercent: 2.2,
    exitReason: 'Target 2 reached',
  });

  assert.equal(updatedState.episodes.length, prevCount + 1);
  assert.equal(newEpisode.outcome, 'WIN');
  assert.ok(
    updatedState.setupWeights['BULLISH TRIPLE'].currentWeightMultiplier >= prevMultiplier,
    'Multiplier should increase or stay high after win'
  );
  assert.equal(updatedState.episodes[0].symbol, 'AMD');
});

test('ingesting a losing trade throttles multiplier and elevates quality threshold', () => {
  const initial = initDefaultActiveMemory();
  const prevMinQuality = initial.calibratedMinQualityScore;
  const prevAtrStop = initial.calibratedAtrStopMultiple;

  const { updatedState, newEpisode } = ingestTradeEpisode(initial, {
    symbol: 'COIN',
    setupType: 'BULLISH DOUBLE',
    direction: 'BULLISH',
    entryPrice: 200.0,
    exitPrice: 190.0,
    pnl: -100.0,
    pnlPercent: -5.0,
    qualityScore: 65,
    atrPercent: 3.8,
    exitReason: 'STOP LOSS TRIGGERED',
  });

  assert.equal(newEpisode.outcome, 'LOSS');
  assert.ok(
    updatedState.calibratedMinQualityScore >= prevMinQuality,
    'Losing trade should tighten quality filter threshold'
  );
  assert.ok(
    updatedState.calibratedAtrStopMultiple >= prevAtrStop,
    'Losing trade should widen stop multiple to avoid noise'
  );
});

test('queryMemoryForSetup gates low-quality candidates and boosts high-affinity setups', () => {
  const memory = initDefaultActiveMemory();

  // Test setup that fails calibrated threshold (e.g. quality 60 vs calibrated 70)
  const lowQualityQuery = queryMemoryForSetup(memory, 'XYZ', 'BULLISH TRIPLE', 60);
  assert.equal(lowQualityQuery.isApproved, false);
  assert.ok(lowQualityQuery.auditRationale.includes('below adaptive threshold'));

  // Test setup that passes with high score
  const highQualityQuery = queryMemoryForSetup(memory, 'NVDA', 'BULLISH TRIPLE', 85);
  assert.equal(highQualityQuery.isApproved, true);
  assert.ok(highQualityQuery.sizingMultiplier > 1.0);
  assert.ok(highQualityQuery.matchingEpisodes.length > 0);
});

test('exportActiveMemoryJSON outputs valid parseable JSON', () => {
  const memory = initDefaultActiveMemory();
  const jsonStr = exportActiveMemoryJSON(memory);
  const parsed = JSON.parse(jsonStr);

  assert.equal(parsed.version, '1.0.0');
  assert.ok(Array.isArray(parsed.episodes));
});
