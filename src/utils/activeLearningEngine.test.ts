import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initDefaultActiveMemory,
  ingestTradeEpisode,
  queryMemoryForSetup,
  exportActiveMemoryJSON,
  generateTradeReflection,
} from './activeLearningEngine.ts';

test('initDefaultActiveMemory creates clean neutral baseline with zero fake seed episodes', () => {
  const memory = initDefaultActiveMemory();

  assert.equal(typeof memory.version, 'string');
  assert.equal(memory.episodes.length, 0);
  assert.equal(memory.learnedRules.length, 0);
  assert.equal(memory.setupWeights['BULLISH TRIPLE'].currentWeightMultiplier, 1.0);
  assert.equal(memory.setupWeights['BEARISH TRIPLE'].currentWeightMultiplier, 1.0);
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
  assert.ok(winReflect.deltaWeight > 0);
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
  assert.ok(lossReflect.deltaWeight < 0);
  assert.ok(lossReflect.critique.includes('loss'));
  assert.ok(lossReflect.rule.includes('Throttle'));
});

test('ingesting a winning trade adapts setup multiplier upward and stores episode', () => {
  const initial = initDefaultActiveMemory();
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

  assert.equal(updatedState.episodes.length, 1);
  assert.equal(newEpisode.outcome, 'WIN');
  assert.ok(updatedState.setupWeights['BULLISH TRIPLE'].currentWeightMultiplier > prevMultiplier);
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
  assert.ok(updatedState.calibratedMinQualityScore >= prevMinQuality);
  assert.ok(updatedState.calibratedAtrStopMultiple >= prevAtrStop);
});

test('queryMemoryForSetup gates low-quality candidates and boosts winning history setups', () => {
  let memory = initDefaultActiveMemory();
  memory = ingestTradeEpisode(memory, {
    symbol: 'NVDA',
    setupType: 'BULLISH TRIPLE',
    direction: 'BULLISH',
    entryPrice: 120,
    exitPrice: 132,
    pnl: 200,
    pnlPercent: 10,
    qualityScore: 85,
    atrPercent: 2.4,
    exitReason: 'TP2',
  }).updatedState;

  const lowQualityQuery = queryMemoryForSetup(memory, 'XYZ', 'BULLISH TRIPLE', 60);
  assert.equal(lowQualityQuery.isApproved, false);
  assert.ok(lowQualityQuery.auditRationale.includes('below adaptive threshold'));

  const highQualityQuery = queryMemoryForSetup(memory, 'NVDA', 'BULLISH TRIPLE', 85);
  assert.equal(highQualityQuery.isApproved, true);
  assert.ok(highQualityQuery.sizingMultiplier > 1.0);
  assert.ok(highQualityQuery.matchingEpisodes.length > 0);
});

test('exportActiveMemoryJSON outputs valid parseable JSON', () => {
  const memory = initDefaultActiveMemory();
  const jsonStr = exportActiveMemoryJSON(memory);
  const parsed = JSON.parse(jsonStr);
  assert.equal(parsed.version, '2.0.0');
  assert.ok(Array.isArray(parsed.episodes));
});
