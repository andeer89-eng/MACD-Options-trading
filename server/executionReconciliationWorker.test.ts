import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createExecutionReconciliationWorker } from './services/executionReconciliationWorker.ts';

describe('Automated execution reconciliation worker', () => {
  it('reconciles active orders and skips terminal orders', async () => {
    const appended: any[] = [];
    const resolvedAlerts: any[] = [];
    const ledger = {
      listTrackedOrders: async () => [
        { clientOrderId: 'active-1', brokerOrderId: 'broker-1', symbol: 'AAPL', status: 'partially_filled', lastEventType: 'ORDER_SUBMITTED', updatedAt: '2026-11-27T12:00:00Z' },
        { clientOrderId: 'done-1', brokerOrderId: 'broker-2', symbol: 'MSFT', status: 'filled', lastEventType: 'RECONCILIATION', updatedAt: '2026-11-27T12:00:00Z' },
      ],
      append: async (event: any) => {
        appended.push(event);
        return { ...event, sequence: appended.length };
      },
      readEvents: async () => [],
      acquireReconciliationLease: async () => true,
      renewReconciliationLease: async () => true,
      releaseReconciliationLease: async () => {},
      recordReconciliationRun: async () => {},
      upsertOperationalAlert: async () => {},
      resolveOperationalAlert: async (...args: any[]) => { resolvedAlerts.push(args); },
    };
    const alpaca = {
      getExecutionSnapshot: async (clientOrderId: string) => ({
        order: {
          id: 'broker-1',
          client_order_id: clientOrderId,
          symbol: 'AAPL',
          side: 'buy',
          qty: '3',
          filled_qty: '2',
          filled_avg_price: '190.25',
          status: 'partially_filled',
          submitted_at: '2026-11-27T12:00:00.000Z',
          updated_at: '2026-11-27T12:02:00.000Z',
        },
        fills: [
          { id: 'activity-1', order_id: 'broker-1', side: 'buy', qty: '1', price: '190.00', transaction_time: '2026-11-27T12:01:00.000Z' },
          { id: 'activity-2', order_id: 'broker-1', side: 'buy', qty: '1', price: '190.50', transaction_time: '2026-11-27T12:02:00.000Z' },
        ],
        fillHistoryComplete: true,
      }),
    };
    const worker = createExecutionReconciliationWorker({ alpaca: alpaca as any, ledger: ledger as any });
    const result = await worker.runOnce();
    assert.equal(result.scanned, 2);
    assert.equal(result.reconciled, 1);
    assert.equal(result.skippedTerminal, 1);
    assert.equal(result.failed, 0);
    assert.deepEqual(appended.map(event => event.eventType), ['FILL_RECORDED', 'FILL_RECORDED', 'RECONCILIATION']);
    assert.equal(worker.getStatus().lastRun?.reconciled, 1);
    assert.equal(resolvedAlerts.length, 1);
  });

  it('fails closed and raises a deduplicated order alert when fill history is incomplete', async () => {
    const appended: any[] = [];
    const raisedAlerts: any[] = [];
    const ledger = {
      listTrackedOrders: async () => [
        { clientOrderId: 'active-2', brokerOrderId: 'broker-2', symbol: 'NVDA', status: 'new', lastEventType: 'ORDER_SUBMITTED', updatedAt: '2026-11-27T12:00:00Z' },
      ],
      append: async (event: any) => { appended.push(event); return event; },
      readEvents: async () => [],
      acquireReconciliationLease: async () => true,
      renewReconciliationLease: async () => true,
      releaseReconciliationLease: async () => {},
      recordReconciliationRun: async () => {},
    };
    const alpaca = {
      getExecutionSnapshot: async () => ({
        order: { id: 'broker-2', client_order_id: 'active-2', symbol: 'NVDA', qty: '1', filled_qty: '0', status: 'new' },
        fills: [],
        fillHistoryComplete: false,
      }),
    };
    const worker = createExecutionReconciliationWorker({ alpaca: alpaca as any, ledger: ledger as any });
    const result = await worker.runOnce();
    assert.equal(result.failed, 1);
    assert.equal(appended.length, 0);
    assert.match(result.errors[0].error, /incomplete/);
    assert.equal(raisedAlerts.length, 1);
    assert.equal(raisedAlerts[0].type, 'ORDER_RECONCILIATION_FAILURE');
    assert.equal(raisedAlerts[0].severity, 'WARNING');
  });
  it('does not poll Alpaca when another instance owns the distributed lease', async () => {
    let brokerCalls = 0;
    const runs: any[] = [];
    const ledger = {
      listTrackedOrders: async () => [],
      append: async (event: any) => event,
      readEvents: async () => [],
      acquireReconciliationLease: async () => false,
      renewReconciliationLease: async () => true,
      releaseReconciliationLease: async () => {},
      recordReconciliationRun: async (run: any) => { runs.push(run); },
      upsertOperationalAlert: async (alert: any) => { raisedAlerts.push(alert); },
      resolveOperationalAlert: async () => {},
    };
    const alpaca = {
      getExecutionSnapshot: async () => { brokerCalls++; return null; },
    };
    const worker = createExecutionReconciliationWorker({ alpaca: alpaca as any, ledger: ledger as any });
    const result = await worker.runOnce();
    assert.equal(result.leaseAcquired, false);
    assert.equal(result.scanned, 0);
    assert.equal(brokerCalls, 0);
    assert.equal(runs.length, 1);
    assert.equal(runs[0].status, 'skipped');
  });

});
