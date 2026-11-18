import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizePythonTickers,
  validateBacktestParams,
  MAX_PYTHON_TICKERS,
} from './serverSecurity.ts';

describe('serverSecurity', () => {
  it('returns default tickers when input is omitted', () => {
    const res = sanitizePythonTickers(undefined);
    assert.deepEqual(res, { ok: true, tickers: ['AAPL', 'MSFT', 'BTC-USD'] });
  });

  it('normalizes, trims, and deduplicates valid market tickers', () => {
    const res = sanitizePythonTickers([' aapl ', 'AAPL', 'brk-b', '^GSPC', 'volvo-b.st']);
    assert.deepEqual(res, {
      ok: true,
      tickers: ['AAPL', 'BRK-B', '^GSPC', 'VOLVO-B.ST'],
    });
  });

  it('rejects command injection payloads and shell metacharacters', () => {
    const malicious = [
      ['AAPL; rm -rf /'],
      ['AAPL && id'],
      ['$(whoami)'],
      ['AAPL`id`'],
      ['AAPL\nwhoami'],
      ['--eval=import os'],
    ];
    for (const payload of malicious) {
      const res = sanitizePythonTickers(payload);
      assert.equal(res.ok, false, `Expected injection payload ${JSON.stringify(payload)} to fail`);
    }
  });

  it('rejects empty arrays, non-arrays, and oversized batches', () => {
    assert.equal(sanitizePythonTickers('AAPL').ok, false);
    assert.equal(sanitizePythonTickers([]).ok, false);
    const tooMany = Array.from({ length: MAX_PYTHON_TICKERS + 1 }, (_, i) => `SYM${i}`);
    assert.equal(sanitizePythonTickers(tooMany).ok, false);
  });

  it('validates backtest numeric boundaries safely', () => {
    assert.deepEqual(
      validateBacktestParams({ initialBalance: 5000, riskPerTradePct: 1.0, minQualityScore: 70 }),
      {
        ok: true,
        values: { initialBalance: 5000, riskPerTradePct: 1.0, minQualityScore: 70 },
      }
    );
    assert.equal(validateBacktestParams({ initialBalance: -50 }).ok, false);
    assert.equal(validateBacktestParams({ riskPerTradePct: 0 }).ok, false);
    assert.equal(validateBacktestParams({ riskPerTradePct: 90 }).ok, false);
    assert.equal(validateBacktestParams({ minQualityScore: 150 }).ok, false);
  });
});
