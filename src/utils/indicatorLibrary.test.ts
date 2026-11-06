import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validatePineScriptHeader,
  importCustomPineIndicator,
  exportIndicatorsAsJSON,
  BUILT_IN_INDICATORS,
} from './indicatorLibrary.ts';

test('validatePineScriptHeader parses indicator declaration correctly', () => {
  const code = `//@version=5\nindicator("My Custom Momentum", overlay=true)\nplot(close)`;
  const res = validatePineScriptHeader(code);
  assert.equal(res.valid, true);
  assert.equal(res.name, 'My Custom Momentum');
  assert.equal(res.overlay, true);
  assert.equal(res.version, 'v5');
});

test('validatePineScriptHeader detects missing declaration error', () => {
  const code = `//@version=5\nplot(close)`;
  const res = validatePineScriptHeader(code);
  assert.equal(res.valid, false);
  assert.ok(res.error?.includes('Missing indicator'));
});

test('importCustomPineIndicator creates valid indicator entity', () => {
  const code = `//@version=5\nindicator("RSI Divergence Pro", overlay=false)\nplot(ta.rsi(close, 14))`;
  const res = importCustomPineIndicator(code, {
    author: 'AlphaTrader',
    category: 'Oscillator',
    description: 'Custom RSI divergence script',
  });

  assert.equal(res.success, true);
  assert.ok(res.indicator);
  assert.equal(res.indicator.name, 'RSI Divergence Pro');
  assert.equal(res.indicator.author, 'AlphaTrader');
  assert.equal(res.indicator.category, 'Oscillator');
  assert.equal(res.indicator.overlay, false);
  assert.equal(res.indicator.isBuiltIn, false);
});

test('exportIndicatorsAsJSON returns valid parseable bundle', () => {
  const jsonStr = exportIndicatorsAsJSON(BUILT_IN_INDICATORS);
  const parsed = JSON.parse(jsonStr);
  assert.equal(parsed.count, BUILT_IN_INDICATORS.length);
  assert.ok(Array.isArray(parsed.indicators));
});
