import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createOrderIntent,
  OrderIntentValidationError,
  canTransitionOrderIntent,
} from './orderIntent.ts';

test('order intent is deterministic, owner-scoped and records source/asset class', () => {
  const input = {
    ownerId: 'owner-1',
    source: 'OPTION_BOT' as const,
    order: {
      client_order_id: 'opt-entry-001',
      symbol: 'spy261218p00570000',
      side: 'sell',
      qty: 2,
      type: 'limit',
      limit_price: 2.1,
      time_in_force: 'day',
    },
    now: Date.parse('2026-11-28T12:00:00.000Z'),
  };
  const first = createOrderIntent(input);
  const second = createOrderIntent(input);
  assert.equal(first.intentId, second.intentId);
  assert.equal(first.assetClass, 'OPTION');
  assert.equal(first.source, 'OPTION_BOT');
  assert.equal(first.symbol, 'SPY261218P00570000');
  assert.equal(first.qty, 2);
  assert.equal(first.limitPrice, 2.1);
  assert.notEqual(first.intentId, createOrderIntent({ ...input, ownerId: 'owner-2' }).intentId);
});

test('order intent rejects bot/asset class mismatches and missing stable IDs', () => {
  assert.throws(() => createOrderIntent({
    ownerId: 'owner-1', source: 'STOCK_BOT',
    order: { client_order_id: 'bad-1', symbol: 'SPY261218P00570000', side: 'sell', qty: 1, type: 'limit', limit_price: 1 },
  }), OrderIntentValidationError);
  assert.throws(() => createOrderIntent({
    ownerId: 'owner-1', source: 'MANUAL',
    order: { symbol: 'AAPL', side: 'buy', qty: 1, type: 'market' },
  }), OrderIntentValidationError);
});

test('order intent state machine permits forward/recovery transitions and blocks invalid transitions', () => {
  assert.equal(canTransitionOrderIntent('', 'CREATED'), true);
  assert.equal(canTransitionOrderIntent('CREATED', 'RISK_APPROVED'), true);
  assert.equal(canTransitionOrderIntent('RISK_APPROVED', 'SUBMISSION_PENDING'), true);
  assert.equal(canTransitionOrderIntent('SUBMISSION_PENDING', 'SUBMITTED'), true);
  assert.equal(canTransitionOrderIntent('UNKNOWN', 'RISK_APPROVED'), true);
  assert.equal(canTransitionOrderIntent('SUBMITTED', 'FILLED'), true);
  assert.equal(canTransitionOrderIntent('FILLED', 'SUBMITTED'), false);
  assert.equal(canTransitionOrderIntent('REJECTED', 'RISK_APPROVED'), false);
  assert.equal(canTransitionOrderIntent('NONE', 'SUBMITTED'), true);
  assert.equal(canTransitionOrderIntent('NONE', 'RISK_APPROVED'), false);
});
