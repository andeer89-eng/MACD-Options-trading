import test from 'node:test';
import assert from 'node:assert/strict';
import type { Candle } from './trullasStrategy.ts';
import { calculateVolumeSpikeDetector } from './volumeSpikeDetector.ts';

function buildMultiWeekCandles(): Candle[] {
  const candles: Candle[] = [];
  // Span ~6 weeks (28 daily bars across Oct -> Nov 2026) with explicit month & week rollovers
  const startTs = Date.UTC(2026, 9, 12); // Monday Oct 12, 2026 (W42, Oct)
  let dayCount = 0;

  for (let i = 0; i < 32; i++) {
    const ts = startTs + i * 86_400_000;
    const d = new Date(ts);
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) continue; // skip weekends for realistic trading week boundaries
    const dateStr = d.toISOString().slice(0, 10);

    // Baseline normal volatility & volume, then inject a wide spike and a narrow-range churn spike
    const isOct = d.getUTCMonth() === 9;
    let open = 100;
    let high = 102;
    let low = 98;
    let close = isOct ? 98.4 : 101.6; // Oct bearish (selling), Nov bullish (buying)
    let volume = 1_000_000 + (dayCount % 4) * 50_000;

    if (dayCount === 16) {
      // High volume + narrow range (< 0.5 * ATR) => Churn / Absorption
      open = 101.0;
      high = 101.25;
      low = 100.85;
      close = 101.2;
      volume = 4_800_000;
    } else if (dayCount >= 21) {
      // Final bar(s): big wide-range volume spike closing near high => NOT churn, strong bull
      open = 101.0;
      high = 108.0;
      low = 100.5;
      close = 107.8;
      volume = 6_200_000;
    }

    candles.push({
      timestamp: ts,
      dateStr,
      open,
      high,
      low,
      close,
      volume,
    });
    dayCount++;
  }
  return candles;
}

test('calculateVolumeSpikeDetector splits Buy+Sell=Total cleanly and detects Z-Score spikes vs narrow-range Churn', () => {
  const candles = buildMultiWeekCandles();
  const report = calculateVolumeSpikeDetector(candles);

  assert.equal(report.bars.length, candles.length);

  for (const bar of report.bars) {
    assert.ok(
      Math.abs(bar.buyVol + bar.sellVol - bar.totalVol) < 1e-4,
      `buyVol + sellVol must equal totalVol (${bar.buyVol} + ${bar.sellVol} != ${bar.totalVol})`
    );
    assert.ok(bar.buyPct >= 0 && bar.buyPct <= 100);
    assert.ok(Math.abs(bar.buyPct + bar.sellPct - 100) < 0.25);
  }

  // Bar 16 was narrow-range massive volume -> must trigger both isSpike and isChurn
  const churnBar = report.bars[16];
  assert.equal(churnBar.isSpike, true, 'Bar 16 high volume must trigger Z-score spike > 2.0');
  assert.ok(churnBar.zScore > 2.0);
  assert.equal(churnBar.isChurn, true, 'Narrow-range volume spike must trigger isChurn');

  // Final bar (index 21) is wide-range volume spike -> isSpike = true, isChurn = false
  const lastBar = report.bars[report.bars.length - 1];
  assert.equal(lastBar.isSpike, true, 'Final bar wide spike must trigger isSpike');
  assert.equal(lastBar.isChurn, false, 'Wide-range bar must NOT trigger isChurn');
  assert.equal(lastBar.isBuyDom, true);
  assert.ok(lastBar.buyPct > 90);
});

test('calculateVolumeSpikeDetector rolls Weekly/Monthly volume & delta across boundaries and bounds MTF Sentiment to [-10, +10]', () => {
  const candles = buildMultiWeekCandles();
  const report = calculateVolumeSpikeDetector(candles);

  assert.ok(report.dashboard.prevWeekVol > 0, 'Expected prevWeekVol from ISO week rollover');
  assert.ok(report.dashboard.curWeekVol > 0, 'Expected curWeekVol');
  assert.ok(report.dashboard.weekVolChgPct !== null, 'Expected WoW % change');
  assert.ok(report.dashboard.prevMonthVol > 0, 'Expected prevMonthVol from Oct->Nov rollover');
  assert.ok(report.dashboard.monthVolChgPct !== null, 'Expected MoM % change');
  assert.ok(report.dashboard.prevMonthDelta < 0, 'October bearish closes should produce negative prevMonthDelta');
  assert.ok(report.dashboard.curMonthDelta > 0, 'November bullish closes should produce positive curMonthDelta');

  assert.ok(
    report.dashboard.mtfSentimentScore >= -10 && report.dashboard.mtfSentimentScore <= 10,
    `MTF Sentiment must stay bounded in [-10, 10], got ${report.dashboard.mtfSentimentScore}`
  );
  assert.equal(report.dashboard.sentimentLabel, 'STRONG BULL');
  assert.ok(report.dashboard.mtfSentimentScore >= 6);
});
