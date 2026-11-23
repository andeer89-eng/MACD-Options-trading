import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDeterministicOrderPlan,
  cancelWorkingOrdersForContract,
  executeDeterministicOrderPlan,
} from './deterministicOrderPipeline';
import type { AlpacaEquityOrderCandidate, AlpacaOrderDTO, AlpacaPositionDTO } from './alpacaJournalSync';

function makeOrder(partial: Partial<AlpacaOrderDTO>): AlpacaOrderDTO {
  return {
    id: partial.id || 'ord-1',
    symbol: partial.symbol || 'AAPL',
    asset_class: partial.asset_class || 'us_equity',
    side: partial.side || 'buy',
    qty: partial.qty ?? 10,
    filled_qty: partial.filled_qty ?? 0,
    filled_avg_price: partial.filled_avg_price ?? null,
    type: partial.type || 'limit',
    time_in_force: partial.time_in_force || 'day',
    limit_price: partial.limit_price ?? 180,
    stop_price: partial.stop_price ?? null,
    status: partial.status || 'accepted',
    submitted_at: partial.submitted_at || '2026-11-23T14:35:00Z',
    filled_at: partial.filled_at ?? null,
  };
}

function makePosition(symbol: string, side: 'long' | 'short' = 'long', qty = 10): AlpacaPositionDTO {
  return {
    asset_id: `asset-${symbol}`,
    symbol,
    asset_class: 'us_equity',
    qty,
    side,
    avg_entry_price: 150,
    current_price: 155,
    market_value: 1550,
    cost_basis: 1500,
    unrealized_pl: 50,
    unrealized_plpc: 3.33,
    change_today: 0.5,
  };
}

function makeEntry(symbol: string, side: 'buy' | 'sell' = 'buy'): AlpacaEquityOrderCandidate {
  return {
    symbol,
    side,
    qty: 5,
    type: 'market',
    time_in_force: 'day',
    client_order_id: `trullas_${symbol}_${side}_5_20261123`,
    sector: 'Information Technology',
    setupType: 'BULLISH_TRIPLE',
    qualityScore: 85,
    stopLoss: 145,
    targetPrice: 170,
    rationale: 'Test entry',
  };
}

describe('Deterministic Order Pipeline (#1 Cancel -> #2 Close -> #3 Enter)', () => {
  it('executes phases strictly in Cancel -> Close -> Submit order and sets cancelOrders=true on full exits', async () => {
    const events: string[] = [];
    const plan = buildDeterministicOrderPlan({
      openOrders: [
        makeOrder({ id: 'ord-aapl-sell', symbol: 'AAPL', side: 'sell', status: 'accepted' }),
        makeOrder({ id: 'ord-nvda-sell', symbol: 'NVDA', side: 'sell', status: 'new' }),
        makeOrder({ id: 'ord-msft-filled', symbol: 'MSFT', side: 'buy', status: 'filled' }),
      ],
      equityPositions: [makePosition('AAPL', 'long', 10)],
      positionsToClose: [{ symbol: 'AAPL', percentage: 100, reason: 'ATR stop-loss' }],
      ordersToPlace: [makeEntry('NVDA', 'buy')],
    });

    assert.equal(plan.cancelSteps.length, 2);
    assert.equal(plan.closeSteps.length, 1);
    assert.equal(plan.closeSteps[0].cancelOrders, true);
    assert.equal(plan.submitSteps.length, 1);

    const res = await executeDeterministicOrderPlan(plan, {
      cancelOrder: async (orderId) => {
        events.push(`CANCEL:${orderId}`);
        return { ok: true };
      },
      closePosition: async (symbol, opts) => {
        events.push(`CLOSE:${symbol}:cancelOrders=${Boolean(opts?.cancelOrders)}`);
        return { ok: true };
      },
      submitOrder: async (payload) => {
        events.push(`SUBMIT:${payload.symbol}:${payload.side}`);
        return { ok: true };
      },
    });

    assert.deepEqual(events, [
      'CANCEL:ord-aapl-sell',
      'CANCEL:ord-nvda-sell',
      'CLOSE:AAPL:cancelOrders=true',
      'SUBMIT:NVDA:buy',
    ]);
    assert.equal(res.cancelledCount, 2);
    assert.equal(res.closedCount, 1);
    assert.equal(res.submittedCount, 1);
    assert.deepEqual(res.haltedSymbols, []);
  });

  it('halts Phase 2 & Phase 3 for a symbol if Phase 1 cancel fails with a broker error, while allowing unrelated symbols', async () => {
    const events: string[] = [];
    const plan = buildDeterministicOrderPlan({
      openOrders: [
        makeOrder({ id: 'ord-bad', symbol: 'TSLA', side: 'sell', status: 'accepted' }),
      ],
      equityPositions: [makePosition('TSLA', 'short', -5)],
      positionsToClose: [],
      reversalRequests: [{ symbol: 'TSLA', targetDirection: 'BULLISH', reason: 'Bullish reversal' }],
      ordersToPlace: [makeEntry('TSLA', 'buy'), makeEntry('AMD', 'buy')],
    });

    const res = await executeDeterministicOrderPlan(plan, {
      cancelOrder: async (orderId) => {
        events.push(`CANCEL:${orderId}`);
        return { ok: false, error: '500 Internal Broker Error' };
      },
      closePosition: async (symbol) => {
        events.push(`CLOSE:${symbol}`);
        return { ok: true };
      },
      submitOrder: async (payload) => {
        events.push(`SUBMIT:${payload.symbol}`);
        return { ok: true };
      },
    });

    assert.deepEqual(events, ['CANCEL:ord-bad', 'SUBMIT:AMD']);
    assert.deepEqual(res.haltedSymbols, ['TSLA']);
    assert.deepEqual(res.submittedSymbols, ['AMD']);
    assert.equal(res.errors.length, 3);
  });

  it('halts Phase 3 entry if Phase 2 opposite-position close fails (prevents wash-trade/conflict)', async () => {
    const events: string[] = [];
    const plan = buildDeterministicOrderPlan({
      openOrders: [],
      equityPositions: [makePosition('META', 'short', -4)],
      positionsToClose: [],
      reversalRequests: [{ symbol: 'META', targetDirection: 'BULLISH', reason: 'Reversal' }],
      ordersToPlace: [makeEntry('META', 'buy')],
    });

    const res = await executeDeterministicOrderPlan(plan, {
      cancelOrder: async () => ({ ok: true }),
      closePosition: async (symbol) => {
        events.push(`CLOSE:${symbol}`);
        return { ok: false, error: 'Market halt' };
      },
      submitOrder: async (payload) => {
        events.push(`SUBMIT:${payload.symbol}`);
        return { ok: true };
      },
    });

    assert.deepEqual(events, ['CLOSE:META']);
    assert.deepEqual(res.haltedSymbols, ['META']);
    assert.equal(res.submittedCount, 0);
  });

  it('allows Phase 2 close when Phase 1 cancel reports order already gone (404/filled)', async () => {
    const events: string[] = [];
    const plan = buildDeterministicOrderPlan({
      openOrders: [makeOrder({ id: 'ord-gone', symbol: 'NVDA', side: 'sell', status: 'pending_new' })],
      equityPositions: [makePosition('NVDA', 'long', 8)],
      positionsToClose: [{ symbol: 'NVDA', percentage: 100, reason: 'TP2 reached' }],
      ordersToPlace: [],
    });

    const res = await executeDeterministicOrderPlan(plan, {
      cancelOrder: async () => ({ ok: false, error: '404 Order not found' }),
      closePosition: async (symbol) => {
        events.push(`CLOSE:${symbol}`);
        return { ok: true };
      },
      submitOrder: async () => ({ ok: true }),
    });

    assert.deepEqual(events, ['CLOSE:NVDA']);
    assert.equal(res.closedCount, 1);
    assert.deepEqual(res.haltedSymbols, []);
  });

  it('cancelWorkingOrdersForContract cancels active OCC option orders deterministically', async () => {
    const cancelled: string[] = [];
    const res = await cancelWorkingOrdersForContract({
      symbol: 'SPY261218P00560000',
      openOrders: [
        makeOrder({ id: 'opt-1', symbol: 'SPY261218P00560000', asset_class: 'us_option', status: 'accepted' }),
        makeOrder({ id: 'opt-2', symbol: 'SPY261218P00560000', asset_class: 'us_option', status: 'filled' }),
        makeOrder({ id: 'opt-3', symbol: 'QQQ261218P00480000', asset_class: 'us_option', status: 'new' }),
      ],
      cancelOrder: async (id) => {
        cancelled.push(id);
        return { ok: true };
      },
    });

    assert.equal(res.ok, true);
    assert.equal(res.cancelledCount, 1);
    assert.deepEqual(cancelled, ['opt-1']);
  });
});
