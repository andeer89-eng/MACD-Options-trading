import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { escapeCsvCell, toCsvRow } from './csvExport.ts';

describe('csvExport', () => {
  it('quotes values and doubles internal quotes', () => {
    assert.equal(escapeCsvCell('Hello "World", CSV'), '"Hello ""World"", CSV"');
    assert.equal(escapeCsvCell(null), '""');
    assert.equal(escapeCsvCell(undefined), '""');
  });

  it('neutralizes formula injection prefixes while preserving negative numeric values', () => {
    assert.equal(escapeCsvCell('=CMD("calc")'), '"\'=CMD(""calc"")"');
    assert.equal(escapeCsvCell('+1+1'), '"\'+1+1"');
    assert.equal(escapeCsvCell('@SUM(A1:A2)'), '"\'@SUM(A1:A2)"');
    assert.equal(escapeCsvCell('-cmd'), '"\'-cmd"');
    assert.equal(escapeCsvCell('-12.50'), '"-12.50"');
    assert.equal(escapeCsvCell('-$45.20'), '"-$45.20"');
  });

  it('builds full RFC-4180 CSV rows', () => {
    assert.equal(toCsvRow(['AAPL', 236.4, 'Breakout "A"']), '"AAPL","236.4","Breakout ""A"""');
  });
});
