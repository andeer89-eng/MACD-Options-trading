import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateCandidate360Confluence,
  rankCandidatesByConfluence,
} from './confluenceScoringEngine';
import { Candle } from './trullasStrategy';

function buildFixtureCandles(basePrice: number, count: number): Candle[] {
  const candles: Candle[] = [];
  const baseTs = 1735689600000;
  let price = basePrice;
  for (let i = 0; i < count; i++) {
    const step = Math.sin(i * 0.25) * (basePrice * 0.012);
    const open = price;
    price = Math.max(0.5, price + step);
    const close = price;
    candles.push({
      timestamp: baseTs + i * 86400000,
      dateStr: new Date(baseTs + i * 86400000).toISOString().split('T')[0],
      open,
      high: Math.max(open, close) * 1.01,
      low: Math.min(open, close) * 0.99,
      close,
      volume: 1_500_000 + (i % 5) * 200_000,
    });
  }
  return candles;
}

test('evaluateCandidate360Confluence returns null when real candles are missing or insufficient', () => {
  assert.equal(evaluateCandidate360Confluence('NVDA', undefined, 'BULLISH'), null);
  assert.equal(evaluateCandidate360Confluence('NVDA', buildFixtureCandles(120, 10), 'BULLISH'), null);
});

test('evaluateCandidate360Confluence computes 6 analytical angles and setup grade from provided candles', () => {
  const candles = buildFixtureCandles(130, 60);
  const result = evaluateCandidate360Confluence('NVDA', candles, 'BULLISH', { sectorAlphaPct: 1.4 });
  assert.ok(result !== null);

  assert.equal(result.symbol, 'NVDA');
  assert.equal(result.direction, 'BULLISH');
  assert.ok(result.overallScore >= 0 && result.overallScore <= 100);
  assert.ok(['A+', 'A', 'B', 'C', 'D', 'F'].includes(result.overallGrade));

  assert.ok(result.angles.trullasMacd.score >= 0);
  assert.ok(result.angles.luxalgoSmc.score >= 0);
  assert.ok(result.angles.indicatorLibrary.score >= 0);
  assert.ok(result.angles.cboeOptions.score >= 0);
  assert.ok(result.angles.signalWeighting.score >= 0);
  assert.ok(result.angles.sectorMacro.score >= 0);

  assert.ok(result.executionPlan.entryTrigger > 0);
  assert.ok(result.executionPlan.stopLoss > 0);
  assert.ok(result.executionPlan.target1 > 0);
  assert.ok(result.executionPlan.riskRewardRatio > 0);
});

test('evaluateCandidate360Confluence resolves international tickers like SIVE.ST metadata alongside real candles', () => {
  const candles = buildFixtureCandles(17.5, 60);
  const result = evaluateCandidate360Confluence('SIVE.ST', candles, 'BULLISH');
  assert.ok(result !== null);

  assert.equal(result.symbol, 'SIVE.ST');
  assert.equal(result.companyName, 'Sivers Semiconductors AB');
  assert.equal(result.sector, 'Information Technology');
  assert.ok(result.subIndustry?.includes('Semiconductors'));
  assert.equal(result.currency, 'SEK');
  assert.ok(result.price < 50);

  const ranked = rankCandidatesByConfluence([
    { symbol: 'NVDA', candles: buildFixtureCandles(130, 60) },
    { symbol: 'SIVE.ST', candles },
  ]);
  assert.equal(ranked.length, 2);
});
