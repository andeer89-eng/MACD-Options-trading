import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeSymbolForYahoo,
  normalizeSymbolForDisplay,
  deduplicateSymbols,
  generateStableAlertId,
  generateStableScanKey,
  generateCompositeKey,
} from './dataFetcher.ts';

test('normalizeSymbolForYahoo converts dot-notated share classes to hyphens', () => {
  assert.equal(normalizeSymbolForYahoo('BRK.B'), 'BRK-B');
  assert.equal(normalizeSymbolForYahoo('BF.B'), 'BF-B');
  assert.equal(normalizeSymbolForYahoo('aapl'), 'AAPL');
  assert.equal(normalizeSymbolForYahoo(' brk.b '), 'BRK-B');
  assert.equal(normalizeSymbolForYahoo('BTC-USD'), 'BTC-USD');
});

test('normalizeSymbolForDisplay converts back to S&P 500 standard dot notation', () => {
  assert.equal(normalizeSymbolForDisplay('BRK-B'), 'BRK.B');
  assert.equal(normalizeSymbolForDisplay('BF-B'), 'BF.B');
  assert.equal(normalizeSymbolForDisplay('AAPL'), 'AAPL');
});

test('deduplicateSymbols removes duplicate tickers and share-class aliases', () => {
  const input = ['AAPL', 'NVDA', 'aapl', 'BRK.B', 'BRK-B', 'MSFT', 'NVDA', 'BF.B', 'BF-B', '   '];
  const result = deduplicateSymbols(input);
  assert.deepEqual(result, ['AAPL', 'NVDA', 'BRK.B', 'MSFT', 'BF.B']);
});

test('generateStableAlertId produces stable non-empty identifiers', () => {
  const id1 = generateStableAlertId('AAPL', 'BULLISH_TRIPLE', 1700000000000);
  const id2 = generateStableAlertId('AAPL', 'BULLISH_TRIPLE', 1700000000000, 1);
  assert.equal(id1, 'alert-AAPL-BULLISH-TRIPLE-1700000000000');
  assert.equal(id2, 'alert-AAPL-BULLISH-TRIPLE-1700000000000-1');
});

test('generateStableScanKey produces stable keys', () => {
  assert.equal(generateStableScanKey('BAC'), 'scan-row-BAC');
  assert.equal(generateStableScanKey('BAC', 2), 'scan-row-BAC-2');
  assert.equal(generateStableScanKey('BAC', 2, '1d'), 'scan-row-BAC-1d-2');
});

test('generateCompositeKey produces symbol-timestamp-index format', () => {
  assert.equal(generateCompositeKey('AAPL', 1700000000000, 0), 'AAPL-1700000000000-0');
  assert.equal(generateCompositeKey('NVDA', '1d', 3), 'NVDA-1d-3');
});

