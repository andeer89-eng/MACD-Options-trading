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

test('evaluateCandidate360Confluence integrates tosSignals and relPerfVsSpyPct into scores and badges', () => {
  const candles = buildFixtureCandles(150, 70);
  const baseline = evaluateCandidate360Confluence('MSFT', candles, 'BULLISH', {
    sectorAlphaPct: 0.5,
  });
  const boosted = evaluateCandidate360Confluence('MSFT', candles, 'BULLISH', {
    sectorAlphaPct: 2.5,
    relPerfVsSpyPct: 12.4,
    tosSignals: [
      { id: 'ttm-squeeze', label: 'TTM Squeeze Fire', direction: 'BULLISH', strength: 90 },
      { id: 'momentum-leader', label: 'Momentum Surge', direction: 'BULLISH', strength: 85 },
    ],
  });
  assert.ok(baseline && boosted);
  assert.ok(boosted.angles.indicatorLibrary.score > baseline.angles.indicatorLibrary.score);
  assert.ok(boosted.angles.sectorMacro.score >= baseline.angles.sectorMacro.score);
  assert.ok(boosted.confirmedEvidenceBadges.includes('TTM Squeeze Fire'));
});

test('rankCandidatesByConfluence supports up to 50 ranked leaders', () => {
  const candles = buildFixtureCandles(100, 50);
  const entries = Array.from({ length: 55 }, (_, i) => ({
    symbol: `SYM${i}`,
    candles,
    direction: 'BULLISH' as const,
  }));
  const ranked = rankCandidatesByConfluence(entries);
  assert.equal(ranked.length, 50);
});

test('evaluateCandidate360Confluence allows elite Stage 2 + TOS + Divergence leaders to reach A+ (>=88) without batch CBOE penalty', () => {
  // Build a realistic Stage 2 advancing series with periodic pullbacks (avoids synthetic RSI=99 exhaustion)
  const candles: Candle[] = [];
  const baseTs = 1735689600000;
  let price = 100;
  for (let i = 0; i < 80; i++) {
    const open = price;
    // Higher highs and higher lows with realistic 3-bar pullback waves
    const wave = i % 7 >= 4 ? -0.8 : 0.95;
    price = Math.max(10, price + wave + Math.sin(i * 0.6) * 0.35);
    const high = Math.max(open, price) * 1.012;
    const low = Math.min(open, price) * 0.988;
    candles.push({
      timestamp: baseTs + i * 86400000,
      dateStr: new Date(baseTs + i * 86400000).toISOString().split('T')[0],
      open,
      high,
      low,
      close: price,
      volume: 2_500_000 + (i > 75 ? 1_200_000 : 0),
    });
  }

  const res = evaluateCandidate360Confluence('DLTR', candles, 'BULLISH', {
    relPerfVsSpyPct: 40.6,
    relVolStDev: 3.9,
    matchingSetup: { type: 'BULLISH_DOUBLE', qualityScore: 88, timeframe: '1d' },
    tosSignals: [
      { id: 'TTM_SQUEEZE', label: 'TTM Squeeze', direction: 'BULLISH', strength: 90 },
      { id: 'DMI_POWER_MOVE', label: 'DMI Power Move', direction: 'BULLISH', strength: 88 },
    ],
  });

  assert.ok(res !== null);
  assert.ok(res.overallScore >= 88, `Expected elite A+ score >= 88, got ${res.overallScore}`);
  assert.equal(res.overallGrade, 'A+');
});

