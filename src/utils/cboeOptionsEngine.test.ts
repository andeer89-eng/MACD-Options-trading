import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBlackScholesGreeks,
  calculateHistoricalVol30dPct,
  createUnavailableCboeOverview,
  parseOccOptionSymbol,
  summarizeCboeOptionsChain,
  RawCboeOptionRecord,
} from './cboeOptionsEngine';

test('calculateBlackScholesGreeks computes accurate Call option price and Greeks', () => {
  const result = calculateBlackScholesGreeks(100, 100, 0.25, 0.05, 0.20, 'CALL');
  assert.ok(result.price > 0, 'Call price should be positive');
  assert.ok(result.greeks.delta > 0.45 && result.greeks.delta < 0.65, 'ATM Call delta should be near 0.50');
  assert.ok(result.greeks.gamma > 0, 'Gamma should be positive');
  assert.ok(result.greeks.theta < 0, 'Theta should be negative');
  assert.ok(result.greeks.vega > 0, 'Vega should be positive');
});

test('calculateBlackScholesGreeks computes accurate Put option price and Greeks', () => {
  const result = calculateBlackScholesGreeks(100, 100, 0.25, 0.05, 0.20, 'PUT');
  assert.ok(result.price > 0, 'Put price should be positive');
  assert.ok(result.greeks.delta < 0 && result.greeks.delta > -0.60, 'ATM Put delta should be near -0.50');
  assert.ok(result.greeks.gamma > 0, 'Put Gamma should be positive');
  assert.ok(result.greeks.theta < 0, 'Put Theta should be negative');
});

test('parseOccOptionSymbol parses equity and index OCC contract names', () => {
  const eq = parseOccOptionSymbol('AAPL281215C00230000');
  assert.deepEqual(eq, { expiration: '2028-12-15', optionType: 'CALL', strike: 230 });

  const spx = parseOccOptionSymbol('SPXW281215P06000500');
  assert.deepEqual(spx, { expiration: '2028-12-15', optionType: 'PUT', strike: 6000.5 });
});

test('calculateHistoricalVol30dPct computes annualized volatility from closes', () => {
  const closes = Array.from({ length: 35 }, (_, i) => 100 + Math.sin(i * 0.5) * 2.5 + i * 0.1);
  const hv = calculateHistoricalVol30dPct(closes);
  assert.ok(hv !== null && hv > 5 && hv < 80);
  assert.equal(calculateHistoricalVol30dPct([100, 101]), null);
});

test('summarizeCboeOptionsChain computes real GEX, Max Pain, Put/Call and ATM Greeks from OCC records', () => {
  const rawOptions: RawCboeOptionRecord[] = [
    {
      option: 'NVDA281215C00130000',
      bid: 12.1,
      ask: 12.4,
      last_trade_price: 12.25,
      iv: 0.42,
      delta: 0.62,
      gamma: 0.021,
      theta: -0.09,
      vega: 0.25,
      volume: 4200,
      open_interest: 18000,
    },
    {
      option: 'NVDA281215P00130000',
      bid: 6.1,
      ask: 6.3,
      last_trade_price: 6.2,
      iv: 0.43,
      delta: -0.38,
      gamma: 0.021,
      theta: -0.08,
      vega: 0.25,
      volume: 2100,
      open_interest: 9000,
    },
    {
      option: 'NVDA281215C00135000',
      bid: 9.2,
      ask: 9.5,
      last_trade_price: 9.3,
      iv: 0.41,
      delta: 0.51,
      gamma: 0.024,
      theta: -0.10,
      vega: 0.26,
      volume: 5500,
      open_interest: 22000,
    },
    {
      option: 'NVDA281215P00135000',
      bid: 8.8,
      ask: 9.1,
      last_trade_price: 8.95,
      iv: 0.41,
      delta: -0.49,
      gamma: 0.024,
      theta: -0.09,
      vega: 0.26,
      volume: 3300,
      open_interest: 15000,
    },
  ];

  const closes = Array.from({ length: 35 }, (_, i) => 130 + Math.sin(i * 0.4) * 3);
  const summary = summarizeCboeOptionsChain({
    symbol: 'NVDA',
    underlyingPrice: 135.2,
    closes,
    rawOptions,
  });

  assert.equal(summary.symbol, 'NVDA');
  assert.equal(summary.chainAvailable, true);
  assert.equal(summary.chainRows.length, 2);
  assert.equal(summary.selectedExpiration, '2028-12-15');
  assert.ok(summary.maxPainStrike === 130 || summary.maxPainStrike === 135);
  assert.ok(summary.putCallRatio !== null && summary.putCallRatio > 0);
  assert.ok(summary.totalGexMillions !== null && summary.totalGexMillions > 0);
  assert.ok(summary.historicalVol30dPct !== null);
});

test('createUnavailableCboeOverview marks unavailable state explicitly without fake defaults', () => {
  const unavailable = createUnavailableCboeOverview();
  assert.equal(unavailable.isLive, false);
  assert.equal(unavailable.vixIndex, null);
  assert.equal(unavailable.totalMarketGexMillions, null);
});
