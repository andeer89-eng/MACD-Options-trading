import { test } from 'node:test';
import assert from 'node:assert';
import {
  calculateStageAnalysis,
  calculateRaindropBars,
  calculateAutoAnchoredVwap,
  detectAutomatedTrendlines,
  generateTrendSpiderReport,
  CandleData,
} from './trendSpiderEngine.ts';

// Helper to generate simulated candles
function createSampleCandles(count: number, trend: 'UP' | 'DOWN' | 'SIDEWAYS'): CandleData[] {
  const candles: CandleData[] = [];
  let basePrice = 100;

  for (let i = 0; i < count; i++) {
    let delta = 0;
    if (trend === 'UP') delta = 0.5 + Math.sin(i / 3) * 0.2;
    else if (trend === 'DOWN') delta = -0.6 + Math.sin(i / 3) * 0.2;
    else delta = Math.sin(i / 2) * 0.5;

    basePrice = Math.max(10, basePrice + delta);
    const open = basePrice;
    const high = basePrice + 1.2;
    const low = basePrice - 1.0;
    const close = basePrice + (trend === 'UP' ? 0.3 : trend === 'DOWN' ? -0.3 : 0.05);
    const volume = 1000000 + Math.round(Math.random() * 500000);

    candles.push({
      time: 1700000000 + i * 86400,
      open,
      high,
      low,
      close,
      volume,
    });
  }

  return candles;
}

test('calculateStageAnalysis correctly detects Stage 2 Advancing on strong uptrend', () => {
  const bullCandles = createSampleCandles(50, 'UP');
  const result = calculateStageAnalysis(bullCandles);

  assert.strictEqual(result.currentStage, 'STAGE_2_ADVANCING');
  assert.strictEqual(result.stageNumber, 2);
  assert.strictEqual(result.isAboveMa, true);
  assert.strictEqual(result.maSlopeDirection, 'RISING');
  assert.ok(result.distanceFromMaPercent > 0);
  assert.ok(result.ma30Week > 0);
});

test('calculateStageAnalysis correctly detects Stage 4 Declining on persistent downtrend (as in NBIS/INTC/GOOG post)', () => {
  const bearCandles = createSampleCandles(50, 'DOWN');
  const result = calculateStageAnalysis(bearCandles);

  assert.strictEqual(result.currentStage, 'STAGE_4_DECLINING');
  assert.strictEqual(result.stageNumber, 4);
  assert.strictEqual(result.isAboveMa, false);
  assert.strictEqual(result.maSlopeDirection, 'FALLING');
  assert.ok(result.distanceFromMaPercent < 0);
  assert.ok(result.stageName.includes('Stage 4'));
});

test('calculateRaindropBars correctly builds Left/Right VWAP and volume profiles', () => {
  const candles = createSampleCandles(20, 'UP');
  const raindrops = calculateRaindropBars(candles, 8);

  assert.strictEqual(raindrops.length, 20);
  const r = raindrops[raindrops.length - 1];

  assert.ok(r.leftVwap > 0);
  assert.ok(r.rightVwap > 0);
  assert.ok(r.volumeProfileLeft.length === 8);
  assert.ok(r.volumeProfileRight.length === 8);
  assert.ok(['BULLISH', 'BEARISH', 'NEUTRAL'].includes(r.sentiment));
  assert.ok(['BALLOON_TOP', 'BALLOON_BOTTOM', 'HOURGLASS', 'SQUEEZE', 'BALANCED'].includes(r.shapeType));
});

test('calculateAutoAnchoredVwap anchors to peak volume bar and calculates standard deviation bands', () => {
  const candles = createSampleCandles(30, 'UP');
  // Inject peak volume on bar 15
  candles[15].volume = 99999999;

  const result = calculateAutoAnchoredVwap(candles, 'PEAK_VOLUME');
  assert.strictEqual(result.anchorIndex, 15);
  assert.strictEqual(result.anchorType, 'PEAK_VOLUME');
  assert.ok(result.points.length > 0);
  assert.ok(result.currentVwap > 0);
  assert.ok(result.points[0].upper1Band > result.points[0].vwap);
  assert.ok(result.points[0].lower1Band < result.points[0].vwap);
});

test('detectAutomatedTrendlines identifies support and resistance lines', () => {
  const candles = createSampleCandles(40, 'UP');
  const trendlines = detectAutomatedTrendlines(candles);

  assert.ok(Array.isArray(trendlines));
  if (trendlines.length > 0) {
    const tl = trendlines[0];
    assert.ok(tl.currentProjectedPrice > 0);
    assert.ok(typeof tl.touchCount === 'number');
  }
});

test('generateTrendSpiderReport compiles complete report and confluence score', () => {
  const candles = createSampleCandles(40, 'UP');
  const report = generateTrendSpiderReport('AAPL', candles);

  assert.strictEqual(report.symbol, 'AAPL');
  assert.ok(report.confluenceScore >= 0 && report.confluenceScore <= 100);
  assert.ok(report.stageAnalysis);
  assert.ok(report.keyTakeaways.length > 0);
  assert.ok(['STRONG_BULLISH', 'BULLISH', 'NEUTRAL', 'BEARISH', 'AVOID_STAGE_4_COLLAPSE'].includes(report.verdict));
});
