import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildPositionReconciliation } from './positionReconciliation.ts';

describe('position reconciliation provenance', () => {
  it('matches ledger net fills to the current broker quantity without treating it as proof of complete provenance', () => {
    const result = buildPositionReconciliation({
      brokerPositions: [{ symbol: 'AAPL', qty: '3', side: 'long', asset_class: 'us_equity' }],
      orders: [{ clientOrderId: 'app-order-1', events: [
        { eventType: 'FILL_RECORDED', symbol: 'AAPL', payload: { side: 'buy', qty: 5 } },
        { eventType: 'FILL_RECORDED', symbol: 'AAPL', payload: { side: 'sell', qty: 2 } },
      ] }],
    });
    assert.equal(result.rows[0].brokerQty, 3);
    assert.equal(result.rows[0].ledgerNetFillQty, 3);
    assert.equal(result.rows[0].classification, 'LEDGER_NET_EQUALS_BROKER');
    assert.match(result.interpretation, /not a complete position basis/);
  });

  it('classifies holdings with no app fill provenance as unattributed, not as a confirmed mismatch', () => {
    const result = buildPositionReconciliation({
      brokerPositions: [{ symbol: 'MSFT', qty: '7', side: 'long', asset_class: 'us_equity' }],
      orders: [],
    });
    assert.equal(result.rows[0].classification, 'UNATTRIBUTED_OR_EXTERNAL_ACTIVITY');
    assert.equal(result.rows[0].unexplainedQty, 7);
    assert.equal(result.summary.unattributedOrExternalActivity, 1);
  });

  it('exposes unexplained variance when ledger and broker quantities differ', () => {
    const result = buildPositionReconciliation({
      brokerPositions: [{ symbol: 'NVDA', qty: '2', side: 'long' }],
      orders: [{ clientOrderId: 'app-order-2', events: [
        { eventType: 'FILL_RECORDED', symbol: 'NVDA', payload: { side: 'buy', qty: 5 } },
      ] }],
    });
    assert.equal(result.rows[0].unexplainedQty, -3);
    assert.equal(result.rows[0].classification, 'UNEXPLAINED_VARIANCE');
  });

  it('normalizes short positions and short-sale fills to negative quantities', () => {
    const result = buildPositionReconciliation({
      brokerPositions: [{ symbol: 'TSLA', qty: '4', side: 'short' }],
      orders: [{ clientOrderId: 'app-order-3', events: [
        { eventType: 'FILL_RECORDED', symbol: 'TSLA', payload: { side: 'sell_short', qty: 4 } },
      ] }],
    });
    assert.equal(result.rows[0].brokerQty, -4);
    assert.equal(result.rows[0].ledgerNetFillQty, -4);
    assert.equal(result.rows[0].classification, 'LEDGER_NET_EQUALS_BROKER');
  });

  it('fails closed for malformed broker quantities or ledger fills', () => {
    assert.throws(() => buildPositionReconciliation({
      brokerPositions: [{ symbol: 'AAPL', qty: 'not-a-number' }],
      orders: [],
    }), /invalid quantity/);
    assert.throws(() => buildPositionReconciliation({
      brokerPositions: [],
      orders: [{ clientOrderId: 'bad', events: [
        { eventType: 'FILL_RECORDED', symbol: 'AAPL', payload: { side: 'buy', qty: -1 } },
      ] }],
    }), /invalid fill/);
  });
});
