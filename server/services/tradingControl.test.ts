import test from 'node:test';
import assert from 'node:assert/strict';
import { getBotOrderBlockReason } from './tradingControl.ts';

test('bot order gate is closed by default configuration', () => {
  assert.equal(getBotOrderBlockReason({ enabled: false, killSwitchEnabled: false }), 'NOT_ARMED');
});

test('server kill switch overrides an enabled bot configuration', () => {
  assert.equal(getBotOrderBlockReason({ enabled: true, killSwitchEnabled: true }), 'KILL_SWITCH');
});

test('bot order gate permits orders only when explicitly enabled and kill switch is clear', () => {
  assert.equal(getBotOrderBlockReason({ enabled: true, killSwitchEnabled: false }), null);
});

import { getBotOptionCapabilityViolation } from './tradingControl.ts';

test('bot options capability permits only sell-to-open OCC puts', () => {
  assert.equal(getBotOptionCapabilityViolation({ symbol: 'SPY261218P00570000', side: 'sell' }), null);
  assert.equal(getBotOptionCapabilityViolation({ symbol: 'SPY261218P00570000', side: 'buy' }), 'UNSUPPORTED_OPTION_STRATEGY');
  assert.equal(getBotOptionCapabilityViolation({ symbol: 'SPY261218C00600000', side: 'sell' }), 'UNSUPPORTED_OPTION_STRATEGY');
  assert.equal(getBotOptionCapabilityViolation({ symbol: 'SPY261218C00600000', side: 'buy' }), 'UNSUPPORTED_OPTION_STRATEGY');
});

test('bot options capability does not classify ordinary equity symbols as options', () => {
  assert.equal(getBotOptionCapabilityViolation({ symbol: 'AAPL', side: 'buy' }), null);
});
