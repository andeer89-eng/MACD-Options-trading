import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseFearGreedTrackerHtml,
  parseCnnFearGreedGraphData,
  mergeExternalFearGreedData,
} from './fearGreedProvider.ts';

test('parseFearGreedTrackerHtml parses Next.js RSC historicalData payload including $undefined fields', () => {
  const sampleHtml = `
    <html><body>
      <div role="meter" aria-label="Fear &amp; Greed Index" aria-valuemin="0" aria-valuemax="100" aria-valuenow="17" aria-valuetext="17 - Extreme Fear"></div>
      <script>self.__next_f.push([1,"2c:[\\"$\\",\\"$L2c\\",null,{\\"historicalData\\":[{\\"date\\":\\"2026-11-23\\",\\"score\\":17,\\"sentiment\\":\\"Extreme Fear\\",\\"sp500_price\\":7237.71,\\"btc_price\\":\\"$undefined\\",\\"vix_price\\":26.62},{\\"date\\":\\"2026-11-20\\",\\"score\\":10,\\"sentiment\\":\\"Extreme Fear\\",\\"sp500_price\\":6901.86,\\"btc_price\\":\\"$undefined\\",\\"vix_price\\":35.89},{\\"date\\":\\"2026-11-16\\",\\"score\\":31,\\"sentiment\\":\\"Fear\\",\\"sp500_price\\":\\"$undefined\\",\\"vix_price\\":\\"$undefined\\"}]}]"])</script>
    </body></html>
  `;

  const parsed = parseFearGreedTrackerHtml(sampleHtml);
  assert.ok(parsed !== null);
  assert.equal(parsed.provider, 'feargreedtracker.com');
  assert.equal(parsed.currentScore, 17);
  assert.equal(parsed.previousCloseScore, 10);
  assert.equal(parsed.scoreDelta1D, 7);
  assert.equal(parsed.asOf, '2026-11-23');
  assert.equal(parsed.historyByDate['2026-11-23'].score, 17);
  assert.equal(parsed.historyByDate['2026-11-23'].vix, 26.62);
  assert.equal(parsed.historyByDate['2026-11-20'].score, 10);
  assert.equal(parsed.historyByDate['2026-11-16'].vix, null);
});

test('parseFearGreedTrackerHtml falls back to ARIA meter and delta text when historicalData is absent', () => {
  const fallbackHtml = `
    <div role="meter" aria-label="Fear &amp; Greed Index" aria-valuenow="17" aria-valuetext="17 - Extreme Fear"></div>
    <div class="delta">+ 7 points</div>
  `;
  const parsed = parseFearGreedTrackerHtml(fallbackHtml);
  assert.ok(parsed !== null);
  assert.equal(parsed.currentScore, 17);
  assert.equal(parsed.scoreDelta1D, 7);
  assert.equal(parsed.previousCloseScore, 10);
});

test('parseCnnFearGreedGraphData parses valid CNN graphdata JSON and rejects invalid payloads', () => {
  assert.equal(parseCnnFearGreedGraphData("I'm a teapot. You're a bot."), null);

  const cnnPayload = {
    fear_and_greed: {
      score: 17.37,
      rating: 'extreme fear',
      timestamp: '2026-11-23T23:00:00+00:00',
      previous_close: 16.9,
      previous_1_week: 26.0,
      previous_1_month: 16.7,
    },
    fear_and_greed_historical: {
      data: [
        { x: Date.UTC(2026, 10, 20), y: 18.6 },
        { x: Date.UTC(2026, 10, 23), y: 17.4 },
      ],
    },
    market_momentum_sp500: { score: 3.2 },
    junk_bond_demand: { score: 18.2 },
  };

  const parsed = parseCnnFearGreedGraphData(cnnPayload);
  assert.ok(parsed !== null);
  assert.equal(parsed.provider, 'cnn.io');
  assert.equal(parsed.currentScore, 17);
  assert.equal(parsed.historyByDate['2026-11-23'].score, 17);
  assert.equal(parsed.cnnPillars?.marketMomentumSp500, 3.2);
  assert.equal(parsed.cnnPillars?.junkBondDemand, 18.2);
});

test('mergeExternalFearGreedData prioritizes feargreedtracker.com while enriching CNN pillars and falling back cleanly', () => {
  const fgt = parseFearGreedTrackerHtml(`
    <div role="meter" aria-label="Fear &amp; Greed Index" aria-valuenow="17" aria-valuetext="17 - Extreme Fear"></div>
    <div class="delta">+7 points</div>
  `);
  const cnn = parseCnnFearGreedGraphData({
    fear_and_greed: { score: 17, previous_close: 17 },
    market_volatility_vix: { score: 41 },
  });

  const merged = mergeExternalFearGreedData(fgt, cnn);
  assert.equal(merged?.provider, 'feargreedtracker.com');
  assert.equal(merged?.currentScore, 17);
  assert.equal(merged?.cnnPillars?.marketVolatilityVix, 41);

  const fallback = mergeExternalFearGreedData(null, cnn);
  assert.equal(fallback?.provider, 'cnn.io');
});
