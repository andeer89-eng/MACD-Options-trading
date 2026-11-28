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
