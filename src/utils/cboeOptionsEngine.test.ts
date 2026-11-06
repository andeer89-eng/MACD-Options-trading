import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBlackScholesGreeks,
  getCboeMarketOverview,
  generateTickerOptionsSummary,
} from './cboeOptionsEngine';

test('calculateBlackScholesGreeks computes accurate Call option price and Greeks', () => {
  const S = 100;
  const K = 100;
  const T = 0.25; // 3 months
  const r = 0.05;
  const sigma = 0.20;

  const result = calculateBlackScholesGreeks(S, K, T, r, sigma, 'CALL');

  assert.ok(result.price > 0, 'Call price should be positive');
  assert.ok(result.greeks.delta > 0.45 && result.greeks.delta < 0.65, 'ATM Call delta should be near 0.50');
  assert.ok(result.greeks.gamma > 0, 'Gamma should be positive');
  assert.ok(result.greeks.theta < 0, 'Theta should be negative (time decay)');
  assert.ok(result.greeks.vega > 0, 'Vega should be positive');
});

test('calculateBlackScholesGreeks computes accurate Put option price and Greeks', () => {
  const S = 100;
  const K = 100;
  const T = 0.25;
  const r = 0.05;
  const sigma = 0.20;

  const result = calculateBlackScholesGreeks(S, K, T, r, sigma, 'PUT');

  assert.ok(result.price > 0, 'Put price should be positive');
  assert.ok(result.greeks.delta < 0 && result.greeks.delta > -0.60, 'ATM Put delta should be near -0.50');
  assert.ok(result.greeks.gamma > 0, 'Put Gamma should be positive');
  assert.ok(result.greeks.theta < 0, 'Put Theta should be negative');
});

test('getCboeMarketOverview provides valid VIX and GEX telemetry', () => {
  const overview = getCboeMarketOverview();
  assert.ok(overview.vixIndex > 0);
  assert.ok(overview.totalMarketGexMillions !== 0);
  assert.ok(overview.putCallVolumeRatio > 0);
});

test('generateTickerOptionsSummary builds complete strike chain for any S&P 500 symbol', () => {
  const summary = generateTickerOptionsSummary('NVDA', 130.0, 32.5);

  assert.equal(summary.symbol, 'NVDA');
  assert.equal(summary.underlyingPrice, 130.0);
  assert.ok(summary.chainRows.length >= 10, 'Should generate at least 10 strike rows');
  assert.ok(summary.maxPainStrike > 0);
  assert.ok(summary.expirationDates.length >= 5);

  const firstRow = summary.chainRows[0];
  assert.ok(firstRow.call.greeks.delta > 0);
  assert.ok(firstRow.put.greeks.delta < 0);
});
