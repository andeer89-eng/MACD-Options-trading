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

import {
  createDefaultTradingControlState,
  applyTradingControlUpdate,
  normalizeTradingControlState,
} from './tradingControl.ts';

test('persistent trading control defaults to both bots disarmed', () => {
  const state = createDefaultTradingControlState('owner-1', '2026-11-28T12:00:00.000Z');
  assert.equal(state.stockBotEnabled, false);
  assert.equal(state.optionBotEnabled, false);
  assert.equal(state.killSwitchEnabled, false);
  assert.equal(state.version, 0);
});

test('persistent trading control kill switch atomically disarms both bots and increments version', () => {
  const current = {
    ...createDefaultTradingControlState('owner-1', '2026-11-28T12:00:00.000Z'),
    stockBotEnabled: true,
    optionBotEnabled: true,
    version: 3,
  };
  const next = applyTradingControlUpdate(current, {
    stockBotEnabled: true,
    optionBotEnabled: true,
    killSwitchEnabled: true,
    expectedVersion: 3,
  }, '2026-11-28T12:01:00.000Z');
  assert.equal(next.stockBotEnabled, false);
  assert.equal(next.optionBotEnabled, false);
  assert.equal(next.killSwitchEnabled, true);
  assert.equal(next.version, 4);
});

test('persistent trading control rejects stale expected versions', () => {
  const current = { ...createDefaultTradingControlState('owner-1', '2026-11-28T12:00:00.000Z'), version: 2 };
  assert.throws(() => applyTradingControlUpdate(current, {
    stockBotEnabled: true,
    optionBotEnabled: false,
    killSwitchEnabled: false,
    expectedVersion: 1,
  }, '2026-11-28T12:01:00.000Z'), /changed concurrently/);
});

test('persistent trading control normalization never trusts missing or malformed bot flags', () => {
  const state = normalizeTradingControlState('owner-1', { stockBotEnabled: 'true', optionBotEnabled: 1 }, '2026-11-28T12:00:00.000Z');
  assert.equal(state.stockBotEnabled, false);
  assert.equal(state.optionBotEnabled, false);
  assert.equal(state.killSwitchEnabled, false);
});
