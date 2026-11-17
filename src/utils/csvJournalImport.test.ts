import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseBrokerCsvToJournalEntries,
  splitCsvLines,
  SAMPLE_BROKER_CSV,
} from './csvJournalImport.ts';

test('splitCsvLines preserves commas and escaped quotes inside quoted cells', () => {
  const csv = 'Symbol,Entry Price,Notes\n"NVDA",125.50,"Entered at 23.6% Fib, ""tight stop"""\n';
  const rows = splitCsvLines(csv);
  assert.equal(rows.length, 2);
  assert.equal(rows[1][0], 'NVDA');
  assert.equal(rows[1][2], 'Entered at 23.6% Fib, "tight stop"');
});

test('parseBrokerCsvToJournalEntries imports sample broker CSV accurately for longs and shorts', () => {
  const result = parseBrokerCsvToJournalEntries(SAMPLE_BROKER_CSV, 1760000000000);
  assert.equal(result.errors.length, 0);
  assert.equal(result.entries.length, 3);

  const nvda = result.entries[0];
  assert.equal(nvda.symbol, 'NVDA');
  assert.equal(nvda.status, 'CLOSED_WIN');
  assert.equal(nvda.quantity, 20);
  assert.equal(nvda.realizedPnL, Number(((136.8 - 124.5) * 20).toFixed(2)));
  assert.ok(nvda.tags.includes('CSV Import'));

  const amdShort = result.entries[2];
  assert.equal(amdShort.symbol, 'AMD');
  assert.equal(amdShort.status, 'CLOSED_LOSS');
  assert.equal(amdShort.realizedPnL, Number(((158.0 - 162.4) * 12).toFixed(2)));
  assert.equal(amdShort.setupType, 'BEARISH_DOUBLE');
});

test('parseBrokerCsvToJournalEntries handles TradingView prefix symbols and open trades', () => {
  const tvCsv = `Ticker,Action,Date,Price,Qty,SL,TP\nNASDAQ:MSFT,Buy,10/18/2026,$420.00,10,$412.00,$440.00`;
  const result = parseBrokerCsvToJournalEntries(tvCsv, 1760000000000);

  assert.equal(result.errors.length, 0);
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].symbol, 'MSFT');
  assert.equal(result.entries[0].entryDate, '2026-10-18');
  assert.equal(result.entries[0].status, 'OPEN');
  assert.equal(result.entries[0].stopLoss, 412);
});

test('parseBrokerCsvToJournalEntries rejects malformed rows without silent fallback', () => {
  const badCsv = `Symbol,Entry Price\n,100\nNVDA,-5\nAAPL,210.50`;
  const result = parseBrokerCsvToJournalEntries(badCsv, 1760000000000);

  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].symbol, 'AAPL');
  assert.equal(result.errors.length, 2);
  assert.equal(result.errors[0].rowNumber, 2);
  assert.equal(result.errors[1].rowNumber, 3);
});
