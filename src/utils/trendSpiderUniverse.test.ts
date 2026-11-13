import { test } from 'node:test';
import assert from 'node:assert';
import {
  computeStageSummaryFromCandles,
  runStanWeinsteinBacktestFromCandles,
} from './trendSpiderUniverse';
import { CandleData } from './trendSpiderEngine';

function makeWeeklyCandles(direction: 'UP' | 'DOWN', weeks: number = 52): CandleData[] {
  const start = 1700000000;
  let price = direction === 'UP' ? 100 : 180;
  const out: CandleData[] = [];
  for (let i = 0; i < weeks; i++) {
    const delta = direction === 'UP' ? 1.4 : -2.1;
    const open = price;
    price = Math.max(10, price + delta + Math.sin(i * 0.4) * 0.5);
    out.push({
      time: new Date((start + i * 7 * 86400) * 1000).toISOString().split('T')[0],
      open: Number(open.toFixed(2)),
      high: Number((Math.max(open, price) + 1.5).toFixed(2)),
      low: Number((Math.min(open, price) - 1.5).toFixed(2)),
      close: Number(price.toFixed(2)),
      volume: 12_000_000 + (i % 4) * 1_000_000,
    });
  }
  return out;
}

test('computeStageSummaryFromCandles returns null if candles insufficient', () => {
  assert.strictEqual(computeStageSummaryFromCandles('INTC', []), null);
});

test('computeStageSummaryFromCandles accurately detects Stage 2 and Stage 4 from weekly candles', () => {
  const bull = makeWeeklyCandles('UP', 52);
  const nvdaSummary = computeStageSummaryFromCandles('NVDA', bull);
  assert.ok(nvdaSummary);
  assert.strictEqual(nvdaSummary.symbol, 'NVDA');
  assert.strictEqual(nvdaSummary.stage.currentStage, 'STAGE_2_ADVANCING');

  const bear = makeWeeklyCandles('DOWN', 52);
  const intcSummary = computeStageSummaryFromCandles('INTC', bear, bull);
  assert.ok(intcSummary);
  assert.strictEqual(intcSummary.symbol, 'INTC');
  assert.strictEqual(intcSummary.stage.currentStage, 'STAGE_4_DECLINING');
  assert.ok(intcSummary.stage.maSlope < 0);
});

test('runStanWeinsteinBacktestFromCandles simulates performance from real weekly series', () => {
  const bull = makeWeeklyCandles('UP', 60);
  const result = runStanWeinsteinBacktestFromCandles('NVDA', bull, 10000);
  assert.strictEqual(result.startingCapital, 10000);
  assert.ok(result.finalCapital > 0);
  assert.ok(result.equityCurve.length > 0);
  assert.ok(typeof result.winRate === 'number');
  assert.ok(typeof result.profitFactor === 'number');
});
