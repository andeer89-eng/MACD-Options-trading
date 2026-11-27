import { randomUUID } from 'node:crypto';
import { verifyExecutionLedgerChain, type createExecutionLedger } from './executionLedger.ts';
import type { AlpacaService } from './alpaca.ts';

type ExecutionLedger = ReturnType<typeof createExecutionLedger>;

export interface ReconciliationRunResult {
  scanned: number;
  reconciled: number;
  skippedTerminal: number;
  failed: number;
  errors: Array<{ clientOrderId: string; error: string }>;
  runId?: string;
  leaseAcquired?: boolean;
}

const TERMINAL_STATUSES = new Set(['filled', 'canceled', 'cancelled', 'rejected', 'expired', 'replaced']);

export function createExecutionReconciliationWorker(options: {
  alpaca: AlpacaService;
  ledger: ExecutionLedger;
  intervalMs?: number;
  concurrency?: number;
  leaseMs?: number;
}) {
  const intervalMs = Math.max(30_000, options.intervalMs ?? 60_000);
  const concurrency = Math.max(1, Math.min(10, options.concurrency ?? 3));
  let timer: ReturnType<typeof setInterval> | undefined;
  let running = false;
  let lastRun: (ReconciliationRunResult & { startedAt: string; completedAt: string; status: string }) | null = null;
  const leaseMs = Math.max(120_000, options.leaseMs ?? intervalMs * 4);

  async function reconcileOrder(clientOrderId: string): Promise<void> {
    const snapshot = await options.alpaca.getExecutionSnapshot(clientOrderId);
    if (!snapshot.order) throw new Error('Broker order not found by client_order_id.');
    if (!snapshot.fillHistoryComplete) throw new Error('Broker fill activity history is incomplete.');

    const order = snapshot.order;
    if (String(order.client_order_id || '') !== clientOrderId || !order.id) {
      throw new Error('Broker order identity does not match the indexed client_order_id.');
    }
    const brokerOrderId = String(order.id);
    const symbol = String(order.symbol || '').toUpperCase();
    const brokerFilledQty = Number(order.filled_qty || 0);
    const activityFilledQty = snapshot.fills.reduce((sum, fill) => sum + Number(fill?.qty || 0), 0);
    if (!Number.isFinite(brokerFilledQty) || brokerFilledQty < 0 ||
        Math.abs(activityFilledQty - brokerFilledQty) > 0.000001) {
      throw new Error('Broker filled_qty does not match the complete fill-activity quantity.');
    }

    for (const fill of snapshot.fills) {
      const activityId = String(fill?.id || '');
      const qty = Number(fill?.qty);
      const price = Number(fill?.price);
      const occurredAt = String(fill?.transaction_time || '');
      if (!activityId || !Number.isFinite(qty) || qty <= 0 ||
          !Number.isFinite(price) || price < 0 || !occurredAt) {
        throw new Error('Broker returned a malformed fill activity.');
      }
      await options.ledger.append({
        eventType: 'FILL_RECORDED',
        clientOrderId,
        brokerOrderId,
        symbol,
        occurredAt,
        payload: { activityId, side: String(fill.side || order.side || ''), qty, price },
      });
    }

    const status = String(order.status || 'unknown').toLowerCase();
    const eventType = status === 'canceled' || status === 'cancelled'
      ? 'ORDER_CANCELED' as const
      : status === 'rejected' ? 'ORDER_REJECTED' as const : 'RECONCILIATION' as const;
    await options.ledger.append({
      eventType,
      clientOrderId,
      brokerOrderId,
      symbol,
      occurredAt: String(order.updated_at || order.filled_at || order.canceled_at || order.submitted_at || new Date().toISOString()),
      payload: {
        status,
        qty: Number(order.qty || 0),
        filledQty: brokerFilledQty,
        filledAvgPrice: order.filled_avg_price == null ? null : Number(order.filled_avg_price),
      },
    });

    const events = await options.ledger.readEvents(clientOrderId);
    const verification = verifyExecutionLedgerChain(events);
    if (!verification.valid) throw new Error(`Ledger hash-chain verification failed at sequence ${verification.brokenAtSequence}.`);
  }

  async function runOnce(): Promise<ReconciliationRunResult> {
    if (running) return { scanned: 0, reconciled: 0, skippedTerminal: 0, failed: 0, errors: [] };
    running = true;
    const runId = randomUUID();
    const startedAt = new Date().toISOString();
    const result: ReconciliationRunResult = {
      scanned: 0, reconciled: 0, skippedTerminal: 0, failed: 0, errors: [], runId,
    };
    let acquired = false;
    let leaseLost = false;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    try {
      acquired = await options.ledger.acquireReconciliationLease(runId, leaseMs);
      result.leaseAcquired = acquired;
      if (!acquired) return result;
      heartbeat = setInterval(() => {
        void options.ledger.renewReconciliationLease(runId, leaseMs)
          .then(renewed => { if (!renewed) leaseLost = true; })
          .catch(() => { leaseLost = true; });
      }, Math.max(10_000, Math.floor(leaseMs / 3)));
      heartbeat.unref?.();

      const tracked = await options.ledger.listTrackedOrders();
      result.scanned = tracked.length;
      const pending = tracked.filter(order => !TERMINAL_STATUSES.has(String(order.status || '').toLowerCase()));
      result.skippedTerminal = tracked.length - pending.length;
      for (let offset = 0; offset < pending.length; offset += concurrency) {
        if (leaseLost) {
          result.failed++;
          result.errors.push({ clientOrderId: '__worker__', error: 'Distributed reconciliation lease was lost; remaining orders were not processed.' });
          break;
        }
        const batch = pending.slice(offset, offset + concurrency);
        const outcomes = await Promise.all(batch.map(async order => {
          try {
            await reconcileOrder(order.clientOrderId);
            return { clientOrderId: order.clientOrderId, ok: true as const };
          } catch (error) {
            return {
              clientOrderId: order.clientOrderId,
              ok: false as const,
              error: error instanceof Error ? error.message : 'Unknown reconciliation error.',
            };
          }
        }));
        for (const outcome of outcomes) {
          if (outcome.ok) result.reconciled++;
          else {
            result.failed++;
            result.errors.push({ clientOrderId: outcome.clientOrderId, error: outcome.error });
          }
        }
      }
      return result;
    } catch (error) {
      result.failed++;
      result.errors.push({ clientOrderId: '__worker__', error: error instanceof Error ? error.message : 'Unknown worker failure.' });
      return result;
    } finally {
      if (heartbeat) clearInterval(heartbeat);
      if (acquired) {
        try {
          await options.ledger.releaseReconciliationLease(runId);
        } catch (error) {
          result.failed++;
          result.errors.push({ clientOrderId: '__worker__', error: error instanceof Error ? error.message : 'Unable to release distributed lease.' });
        }
      }
      const completedAt = new Date().toISOString();
      const status = !acquired ? 'skipped' : result.failed === 0 ? 'completed' :
        result.reconciled > 0 ? 'partial' : 'failed';
      lastRun = { ...result, startedAt, completedAt, status };
      try {
        await options.ledger.recordReconciliationRun({
          runId, startedAt, completedAt, status,
          scanned: result.scanned, reconciled: result.reconciled,
          skippedTerminal: result.skippedTerminal, failed: result.failed,
          errorCount: result.errors.length, errors: result.errors.slice(0, 100),
        });
      } catch (error) {
        result.failed++;
        result.errors.push({ clientOrderId: '__audit__', error: error instanceof Error ? error.message : 'Unable to persist reconciliation run audit.' });
        lastRun = { ...result, startedAt, completedAt, status: 'failed' };
      }
      running = false;
    }
  }

  function start(): void {
    if (timer) return;
    // Run immediately after server startup, then periodically. A failed run
    // never blocks the next scheduled attempt.
    void runOnce().catch(() => undefined);
    timer = setInterval(() => { void runOnce().catch(() => undefined); }, intervalMs);
    timer.unref?.();
  }

  function stop(): void {
    if (timer) clearInterval(timer);
    timer = undefined;
  }

  function getStatus() {
    return { running, intervalMs, lastRun };
  }

  return { start, stop, runOnce, getStatus };
}
