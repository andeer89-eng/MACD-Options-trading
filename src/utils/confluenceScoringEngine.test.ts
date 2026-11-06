import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateCandidate360Confluence,
  rankCandidatesByConfluence,
  generateCandlesForEvaluation,
} from './confluenceScoringEngine';

test('generateCandlesForEvaluation builds valid OHLCV series', () => {
  const candles = generateCandlesForEvaluation(120.0, 50, 'NVDA');
  assert.equal(candles.length, 50);
  assert.ok(candles[0].timestamp > 0);
  assert.ok(candles[0].high >= candles[0].low);
  assert.ok(candles[candles.length - 1].close > 0);
});

test('evaluateCandidate360Confluence computes 6 analytical angles and setup grade', () => {
  const result = evaluateCandidate360Confluence('NVDA', undefined, 'BULLISH');

  assert.equal(result.symbol, 'NVDA');
  assert.equal(result.direction, 'BULLISH');
  assert.ok(result.overallScore >= 0 && result.overallScore <= 100);
  assert.ok(['A+', 'A', 'B', 'C', 'D', 'F'].includes(result.overallGrade));

  // Check all 6 angles exist and have valid structure
  assert.ok(result.angles.trullasMacd.score >= 0);
  assert.ok(result.angles.luxalgoSmc.score >= 0);
  assert.ok(result.angles.indicatorLibrary.score >= 0);
  assert.ok(result.angles.cboeOptions.score >= 0);
  assert.ok(result.angles.signalWeighting.score >= 0);
  assert.ok(result.angles.sectorMacro.score >= 0);

  // Check execution plan
  assert.ok(result.executionPlan.entryTrigger > 0);
  assert.ok(result.executionPlan.stopLoss > 0);
  assert.ok(result.executionPlan.target1 > 0);
  assert.ok(result.executionPlan.riskRewardRatio > 0);
  assert.ok(result.executionPlan.suggestedAllocationPct >= 0);
});

test('evaluateCandidate360Confluence correctly resolves international tickers like SIVE.ST', () => {
  const result = evaluateCandidate360Confluence('SIVE.ST', undefined, 'BULLISH');

  assert.equal(result.symbol, 'SIVE.ST');
  assert.equal(result.companyName, 'Sivers Semiconductors AB');
  assert.equal(result.sector, 'Information Technology');
  assert.ok(result.subIndustry?.includes('Semiconductors'));
  assert.equal(result.currency, 'SEK');
  assert.ok(result.price < 50, 'Price should reflect Swedish krona realistic scale (~17 SEK)');
});
