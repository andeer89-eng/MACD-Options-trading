import { test } from 'node:test';
import assert from 'node:assert';
import {
  getUniverseCandles,
  getUniverseStageSummary,
  getAllSp500StageSummaries,
  runStanWeinsteinBacktest,
} from './trendSpiderUniverse';

test('getUniverseCandles returns 52 weekly candles for both presets and arbitrary tickers', () => {
  // Preset
  const nbisCandles = getUniverseCandles('NBIS');
  assert.ok(nbisCandles.length >= 50, 'NBIS should have 52 candles');

  // Arbitrary custom ticker
  const pltrCandles = getUniverseCandles('PLTR');
  assert.strictEqual(pltrCandles.length, 52, 'PLTR should have 52 candles');

  const randomCandles = getUniverseCandles('RANDOM_CUSTOM_TICKER_XYZ');
  assert.strictEqual(randomCandles.length, 52, 'Custom ticker should have 52 candles');
});

test('getUniverseStageSummary accurately computes stage for known breakdown ticker INTC', () => {
  const intcSummary = getUniverseStageSummary('INTC');
  assert.strictEqual(intcSummary.symbol, 'INTC');
  assert.strictEqual(intcSummary.stage.currentStage, 'STAGE_4_DECLINING');
  assert.ok(intcSummary.stage.maSlope < 0, 'INTC slope should be negative');
});

test('getAllSp500StageSummaries scans all 503 S&P 500 constituents', () => {
  const allSummaries = getAllSp500StageSummaries();
  assert.strictEqual(allSummaries.length, 503, 'Should scan all 503 S&P 500 stocks');
  const stage2Count = allSummaries.filter((s) => s.stage.currentStage === 'STAGE_2_ADVANCING').length;
  const stage4Count = allSummaries.filter((s) => s.stage.currentStage === 'STAGE_4_DECLINING').length;
  assert.ok(stage2Count > 0, 'Universe should contain Stage 2 stocks');
  assert.ok(stage4Count > 0, 'Universe should contain Stage 4 stocks');
});

test('runStanWeinsteinBacktest simulates trading performance and calculates capital preserved', () => {
  const result = runStanWeinsteinBacktest('NVDA', 10000);
  assert.strictEqual(result.startingCapital, 10000);
  assert.ok(result.finalCapital > 0);
  assert.ok(result.equityCurve.length > 0);
  assert.ok(typeof result.winRate === 'number');
  assert.ok(typeof result.profitFactor === 'number');
});
