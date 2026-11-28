import test from 'node:test';
import assert from 'node:assert/strict';
import type { AlpacaOptionSnapshotItem } from './alpaca.ts';
import { validateShortPutEntryQuote } from './optionQuotePolicy.ts';

const freshQuote: AlpacaOptionSnapshotItem = {
  symbol: 'SPY261218P00570000',
  feed: 'opra',
  bidPrice: 2.1,
  askPrice: 2.2,
  bidSize: 10,
  askSize: 12,
  quoteTimestamp: '2026-11-28T12:00:00.000Z',
  quoteAgeMs: 1000,
  spreadPercent: 4.65,
  delta: -0.12,
  gamma: 0.01,
  theta: -0.04,
  vega: 0.08,
  impliedVolatility: 0.31,
  tradePrice: 2.15,
  tradeSize: 4,
  tradeTimestamp: '2026-11-28T11:59:59.000Z',
  quoteStatus: 'FRESH',
  isUsable: true,
};

test('short-put quote policy accepts fresh NBBO, in-band delta and in-market limit', () => {
  assert.equal(validateShortPutEntryQuote(freshQuote, 2.1), null);
  assert.equal(validateShortPutEntryQuote(freshQuote, 2.15), null);
});

test('short-put quote policy rejects stale, wide, missing-Greek and off-market quotes', () => {
  assert.ok(validateShortPutEntryQuote({ ...freshQuote, quoteStatus: 'STALE', isUsable: false }, 2.1));
  assert.ok(validateShortPutEntryQuote({ ...freshQuote, spreadPercent: 25 }, 2.1));
  assert.ok(validateShortPutEntryQuote({ ...freshQuote, delta: null }, 2.1));
  assert.ok(validateShortPutEntryQuote({ ...freshQuote, delta: -0.22 }, 2.1));
  assert.ok(validateShortPutEntryQuote(freshQuote, 2.5));
  assert.ok(validateShortPutEntryQuote(freshQuote, null));
});
