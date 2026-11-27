import { Router, Request, Response } from 'express';
import { AlpacaApiError, AlpacaService } from '../services/alpaca.ts';
import { createFirebaseAlpacaAuthMiddleware } from '../services/firebaseAuth.ts';
import type { FirebaseAuthOptions } from '../services/firebaseAuth.ts';
import { verifyExecutionLedgerChain, type createExecutionLedger } from '../services/executionLedger.ts';
type ExecutionLedger = ReturnType<typeof createExecutionLedger>;

function handleAlpacaError(res: Response, err: unknown) {
  if (err instanceof AlpacaApiError) {
    return res.status(err.status).json({
      error: err.message,
      mode: 'PAPER',
    });
  }
  const message = err instanceof Error ? err.message : 'Alpaca Paper proxy request failed';
  return res.status(502).json({ error: message, mode: 'PAPER' });
}

export function createAlpacaRouter(
  alpaca: AlpacaService,
  authOptions: FirebaseAuthOptions,
  executionLedger?: ExecutionLedger,
  ledgerRequired = false,
  reconciliationWorker?: { getStatus: () => unknown }
): Router {
  const router = Router();
  router.use('/api/alpaca', createFirebaseAlpacaAuthMiddleware(authOptions));

  router.get('/api/alpaca/status', async (req: Request, res: Response) => {
    try {
      const verify = req.query.verify === 'true';
      const status = await alpaca.getStatus(verify);
      res.json(status);
    } catch (err) {
      handleAlpacaError(res, err);
    }
  });

  router.get('/api/alpaca/overview', async (_req: Request, res: Response) => {
    try {
      const overview = await alpaca.getOverview();
      res.json(overview);
    } catch (err) {
      handleAlpacaError(res, err);
    }
  });

  router.get('/api/alpaca/options/contracts', async (req: Request, res: Response) => {
    try {
      const underlying = String(req.query.underlying || 'SPY');
      const type = req.query.type === 'call' ? 'call' : 'put';
      const minDte = req.query.minDte ? Number(req.query.minDte) : undefined;
      const maxDte = req.query.maxDte ? Number(req.query.maxDte) : undefined;
      const maxStrike = req.query.maxStrike ? Number(req.query.maxStrike) : undefined;
      const minStrike = req.query.minStrike ? Number(req.query.minStrike) : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;

      const contracts = await alpaca.getOptionContracts({
        underlying,
        type,
        minDte,
        maxDte,
        maxStrike,
        minStrike,
        limit,
      });

      res.json({
        mode: 'PAPER',
        underlying: underlying.trim().toUpperCase(),
        count: contracts.length,
        contracts,
      });
    } catch (err) {
      handleAlpacaError(res, err);
    }
  });

  router.post('/api/alpaca/orders', async (req: Request, res: Response) => {
    try {
      if (ledgerRequired && !executionLedger) {
        res.status(503).json({ error: 'Persistent execution ledger is required but not configured.', mode: 'PAPER' });
        return;
      }
      const result = await alpaca.submitOrder(req.body || {});
      if (executionLedger) {
        try {
          const order = result.order;
          await executionLedger.append({
            eventType: 'ORDER_SUBMITTED',
            clientOrderId: String(order.client_order_id || req.body?.client_order_id || ''),
            brokerOrderId: String(order.id),
            symbol: String(order.symbol || req.body?.symbol || '').toUpperCase(),
            occurredAt: String(order.submitted_at || new Date().toISOString()),
            payload: {
              status: String(order.status || 'accepted'),
              side: String(order.side || req.body?.side || ''),
              qty: Number(order.qty ?? req.body?.qty ?? 0),
              type: String(order.type || req.body?.type || ''),
            },
          });
        } catch {
          // The broker may already have accepted the order. Return 503 so the
          // caller retries with the same client_order_id and broker idempotency
          // recovers the order while the ledger write is retried.
          res.status(503).json({
            error: 'Order state is known to Alpaca but persistent audit recording failed. Retry with the same client_order_id.',
            mode: 'PAPER',
            brokerOrderId: result.order.id,
            clientOrderId: result.order.client_order_id || req.body?.client_order_id,
          });
          return;
        }
      }
      res.json(result);
    } catch (err) {
      handleAlpacaError(res, err);
    }
  });

  router.post('/api/alpaca/reconciliation/backfill-index', async (req: Request, res: Response) => {
    if (!executionLedger) {
      res.status(503).json({ error: 'Persistent execution ledger is not configured.', mode: 'PAPER' });
      return;
    }
    try {
      const requestedLimit = req.body?.maxEvents === undefined ? 500_000 : Number(req.body.maxEvents);
      if (!Number.isSafeInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 1_000_000) {
        res.status(400).json({ error: 'maxEvents must be an integer between 1 and 1000000.', mode: 'PAPER' });
        return;
      }
      const result = await executionLedger.backfillTrackedOrderIndex({ maxEvents: requestedLimit });
      res.json({ mode: 'PAPER', ...result });
    } catch (err) {
      handleAlpacaError(res, err);
    }
  });

  router.get('/api/alpaca/reconciliation/status', (_req: Request, res: Response) => {
    if (!reconciliationWorker) {
      res.status(503).json({ error: 'Automated reconciliation worker is not configured.', mode: 'PAPER' });
      return;
    }
    res.json({ mode: 'PAPER', ...reconciliationWorker.getStatus() as object });
  });

  router.get('/api/alpaca/orders/:clientOrderId/ledger', async (req: Request, res: Response) => {
    if (!executionLedger) {
      res.status(503).json({ error: 'Persistent execution ledger is not configured.', mode: 'PAPER' });
      return;
    }
    try {
      const events = await executionLedger.readEvents(req.params.clientOrderId);
      res.json({ mode: 'PAPER', clientOrderId: req.params.clientOrderId, events, verification: verifyExecutionLedgerChain(events) });
    } catch {
      res.status(503).json({ error: 'Persistent execution ledger is temporarily unavailable.', mode: 'PAPER' });
    }
  });

  router.post('/api/alpaca/orders/:clientOrderId/reconcile', async (req: Request, res: Response) => {
    if (!executionLedger) {
      res.status(503).json({ error: 'Persistent execution ledger is not configured.', mode: 'PAPER' });
      return;
    }
    try {
      const clientOrderId = String(req.params.clientOrderId || '');
      const snapshot = await alpaca.getExecutionSnapshot(clientOrderId);
      if (!snapshot.order) {
        res.status(404).json({ error: 'Order was not found by client_order_id at Alpaca.', mode: 'PAPER' });
        return;
      }
      if (!snapshot.fillHistoryComplete) {
        res.status(503).json({
          error: 'Alpaca fill activity history is incomplete; reconciliation was not committed.',
          mode: 'PAPER',
          brokerOrderId: snapshot.order.id,
        });
        return;
      }

      const order = snapshot.order;
      const brokerOrderId = String(order.id);
      const symbol = String(order.symbol || '').toUpperCase();
      const brokerFilledQty = Number(order.filled_qty || 0);
      const activityFilledQty = snapshot.fills.reduce((sum, fill) => sum + Number(fill?.qty || 0), 0);
      if (!Number.isFinite(brokerFilledQty) || brokerFilledQty < 0 ||
          Math.abs(activityFilledQty - brokerFilledQty) > 0.000001) {
        res.status(503).json({
          error: 'Broker order filled_qty does not match the complete fill-activity quantity; reconciliation was not committed.',
          mode: 'PAPER',
          brokerOrderId,
          brokerFilledQty,
          activityFilledQty,
        });
        return;
      }
      let fillsRecorded = 0;
      for (const fill of snapshot.fills) {
        const activityId = String(fill?.id || '');
        const qty = Number(fill?.qty);
        const price = Number(fill?.price);
        const occurredAt = String(fill?.transaction_time || '');
        if (!activityId || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price < 0 || !occurredAt) {
          throw new Error('Alpaca returned an invalid fill activity; reconciliation stopped.');
        }
        await executionLedger.append({
          eventType: 'FILL_RECORDED',
          clientOrderId,
          brokerOrderId,
          symbol,
          occurredAt,
          payload: {
            activityId,
            side: String(fill.side || order.side || ''),
            qty,
            price,
          },
        });
        fillsRecorded++;
      }

      const status = String(order.status || 'unknown').toLowerCase();
      const eventType = status === 'canceled' || status === 'cancelled'
        ? 'ORDER_CANCELED' as const
        : status === 'rejected' ? 'ORDER_REJECTED' as const : 'RECONCILIATION' as const;
      const stateEvent = await executionLedger.append({
        eventType,
        clientOrderId,
        brokerOrderId,
        symbol,
        occurredAt: String(order.updated_at || order.filled_at || order.canceled_at || order.submitted_at || new Date().toISOString()),
        payload: {
          status,
          qty: Number(order.qty || 0),
          filledQty: Number(order.filled_qty || 0),
          filledAvgPrice: order.filled_avg_price == null ? null : Number(order.filled_avg_price),
        },
      });
      const events = await executionLedger.readEvents(clientOrderId);
      const verification = verifyExecutionLedgerChain(events);
      if (!verification.valid) {
        res.status(409).json({ error: 'Execution ledger hash-chain verification failed after reconciliation.', mode: 'PAPER', verification });
        return;
      }
      res.json({
        mode: 'PAPER',
        clientOrderId,
        brokerOrderId,
        brokerStatus: status,
        brokerFilledQty: Number(order.filled_qty || 0),
        brokerFillActivityCount: snapshot.fills.length,
        fillsRecorded,
        stateEventSequence: stateEvent.sequence,
        verification,
      });
    } catch (error) {
      res.status(503).json({
        error: error instanceof Error ? error.message : 'Broker reconciliation failed.',
        mode: 'PAPER',
      });
    }
  });

  router.delete('/api/alpaca/positions/:symbol', async (req: Request, res: Response) => {
    try {
      const qty = req.query.qty ? Number(req.query.qty) : undefined;
      const percentage = req.query.percentage ? Number(req.query.percentage) : undefined;
      const cancel_orders =
        req.query.cancel_orders === 'true'
          ? true
          : req.query.cancel_orders === 'false'
          ? false
          : undefined;
      const result = await alpaca.closePosition(req.params.symbol, { qty, percentage, cancel_orders });
      res.json(result);
    } catch (err) {
      handleAlpacaError(res, err);
    }
  });

  router.delete('/api/alpaca/orders/:orderId', async (req: Request, res: Response) => {
    try {
      const result = await alpaca.cancelOrder(req.params.orderId);
      res.json(result);
    } catch (err) {
      handleAlpacaError(res, err);
    }
  });

  return router;
}
