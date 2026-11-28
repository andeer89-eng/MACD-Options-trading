import { Router, Request, Response } from 'express';
import { createHash, randomUUID } from 'node:crypto';
import { AlpacaApiError, AlpacaService } from '../services/alpaca.ts';
import { createFirebaseAlpacaAuthMiddleware } from '../services/firebaseAuth.ts';
import type { FirebaseAuthOptions } from '../services/firebaseAuth.ts';
import { verifyExecutionLedgerChain, type createExecutionLedger } from '../services/executionLedger.ts';
import { buildPositionReconciliation } from '../services/positionReconciliation.ts';
import { getBotOrderBlockReason, getBotOptionCapabilityViolation } from '../services/tradingControl.ts';
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
  reconciliationWorker?: { getStatus: () => unknown },
  botExecutionEnabled = false,
  botKillSwitchEnabled = false
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

  router.get('/api/alpaca/options/snapshots', async (req: Request, res: Response) => {
    try {
      const rawSymbols = String(req.query.symbols || '');
      const symbols = rawSymbols.split(',').map((symbol) => symbol.trim().toUpperCase()).filter(Boolean);
      if (symbols.length < 1 || symbols.length > 100) {
        res.status(400).json({ error: 'symbols must contain between 1 and 100 OCC option contracts.', mode: 'PAPER' });
        return;
      }
      const feed = req.query.feed === undefined ? 'opra' : String(req.query.feed);
      if (feed !== 'opra' && feed !== 'indicative') {
        res.status(400).json({ error: 'feed must be opra or indicative.', mode: 'PAPER' });
        return;
      }
      const result = await alpaca.getOptionSnapshots({ symbols, feed });
      res.json({ mode: 'PAPER', ...result });
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

  const submitOrder = async (req: Request, res: Response) => {
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
  };

  // Manual order entry remains separate. Autonomous bots must use the gated route below.
  router.post('/api/alpaca/orders', submitOrder);

  router.post('/api/alpaca/bot/orders', async (req: Request, res: Response) => {
    const blockReason = getBotOrderBlockReason({
      enabled: botExecutionEnabled,
      killSwitchEnabled: botKillSwitchEnabled,
    });
    if (blockReason === 'KILL_SWITCH') {
      res.status(423).json({ error: 'Autonomous trading is blocked by the server kill switch.', code: blockReason, mode: 'PAPER' });
      return;
    }
    if (blockReason === 'NOT_ARMED') {
      res.status(423).json({ error: 'Autonomous trading is not armed on the server. Bot orders are disabled.', code: blockReason, mode: 'PAPER' });
      return;
    }
    const optionViolation = getBotOptionCapabilityViolation({
      symbol: String(req.body?.symbol || ''),
      side: String(req.body?.side || ''),
    });
    if (optionViolation) {
      res.status(403).json({
        error: 'The autonomous options bot currently supports cash-secured short-put entries only. Unsupported option order was blocked.',
        code: optionViolation,
        mode: 'PAPER',
      });
      return;
    }
    await submitOrder(req, res);
  });

  router.get('/api/alpaca/reconciliation/alerts', async (req: Request, res: Response) => {
    if (!executionLedger) {
      res.status(503).json({ error: 'Persistent execution ledger is not configured.', mode: 'PAPER' });
      return;
    }
    try {
      const status = req.query.status === 'RESOLVED' ? 'RESOLVED' :
        req.query.status === 'ACTIVE' ? 'ACTIVE' : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : 100;
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) {
        res.status(400).json({ error: 'limit must be an integer from 1 to 200.', mode: 'PAPER' });
        return;
      }
      const alerts = await executionLedger.listOperationalAlerts({ status, limit });
      res.json({
        mode: 'PAPER',
        count: alerts.length,
        activeCount: alerts.filter(alert => alert.status === 'ACTIVE').length,
        alerts,
        readOnly: true,
      });
    } catch (error) {
      res.status(503).json({
        error: error instanceof Error ? error.message : 'Operational alerts are unavailable.',
        mode: 'PAPER',
      });
    }
  });

  router.post('/api/alpaca/reconciliation/integrity-audit', async (req: Request, res: Response) => {
    if (!executionLedger) {
      res.status(503).json({ error: 'Persistent execution ledger is not configured.', mode: 'PAPER' });
      return;
    }
    const maxOrders = req.body?.maxOrders === undefined ? 5000 : Number(req.body.maxOrders);
    if (!Number.isSafeInteger(maxOrders) || maxOrders < 1 || maxOrders > 10000) {
      res.status(400).json({ error: 'maxOrders must be an integer from 1 to 10000.', mode: 'PAPER' });
      return;
    }
    const startedAt = new Date().toISOString();
    const auditId = 'integrity-' + randomUUID();
    const counts = { VALID: 0, INVALID: 0, UNVERIFIABLE: 0, MISSING_LEDGER: 0, INDEX_MISMATCH: 0 };
    const evidence: Array<Record<string, string | number | boolean>> = [];
    let scanned = 0;
    let pageToken = '';
    const seenPageTokens = new Set<string>();
    let coverageComplete = true;
    try {
      while (scanned < maxOrders) {
        const page = await executionLedger.listTrackedOrdersPage({
          limit: Math.min(500, maxOrders - scanned),
          pageToken: pageToken || undefined,
        });
        for (let offset = 0; offset < page.orders.length; offset += 3) {
          const batch = page.orders.slice(offset, offset + 3);
          const results = await Promise.all(batch.map(async order => {
            try {
              if (!order.clientOrderId || !order.symbol) {
                return { clientOrderId: String(order.clientOrderId || ''), symbol: String(order.symbol || ''), classification: 'UNVERIFIABLE', eventCount: 0 };
              }
              const events = await executionLedger.readEvents(order.clientOrderId);
              if (createHash('sha256').update(order.clientOrderId).digest('hex') !== order.indexKey ||
                  events.some(event => event.clientOrderId !== order.clientOrderId) ||
                  events.some(event => String(event.symbol || '').toUpperCase() !== String(order.symbol || '').toUpperCase())) {
                return { clientOrderId: order.clientOrderId, symbol: order.symbol, classification: 'INDEX_MISMATCH', eventCount: events.length };
              }
              if (events.length === 0) {
                return { clientOrderId: order.clientOrderId, symbol: order.symbol, classification: 'MISSING_LEDGER', eventCount: 0 };
              }
              const verification = verifyExecutionLedgerChain(events);
              return {
                clientOrderId: order.clientOrderId, symbol: order.symbol,
                classification: verification.valid ? 'VALID' : 'INVALID',
                eventCount: events.length,
                ...(verification.brokenAtSequence != null ? { brokenAtSequence: verification.brokenAtSequence } : {}),
                headHash: verification.headHash,
              };
            } catch {
              return { clientOrderId: order.clientOrderId, symbol: order.symbol, classification: 'UNVERIFIABLE', eventCount: 0 };
            }
          }));
          for (const result of results) {
            scanned++;
            counts[result.classification as keyof typeof counts]++;
            if (result.classification !== 'VALID' && evidence.length < 250) evidence.push(result);
          }
        }
        pageToken = page.nextPageToken;
        if (!pageToken) break;
        if (seenPageTokens.has(pageToken)) throw new Error('Firestore returned a repeated order-index page token; audit stopped fail-closed.');
        seenPageTokens.add(pageToken);
      }
      if (pageToken) coverageComplete = false;
      const completedAt = new Date().toISOString();
      const exceptions = counts.INVALID + counts.UNVERIFIABLE + counts.MISSING_LEDGER + counts.INDEX_MISMATCH;
      const report = {
        auditId, runType: 'ACCOUNT_INTEGRITY_AUDIT', startedAt, completedAt,
        status: coverageComplete ? 'completed' : 'partial',
        integrityStatus: exceptions === 0 ? 'CLEAN' : 'FINDINGS',
        coverageComplete, coverageScope: 'INDEXED_ORDERS_ONLY',
        maxOrders, scanned, counts, exceptionCount: exceptions,
        evidence, evidenceTruncated: exceptions > evidence.length, readOnly: true,
      };
      await executionLedger.recordIntegrityAudit(report);
      res.json({ mode: 'PAPER', ...report });
    } catch (error) {
      res.status(503).json({
        error: error instanceof Error ? error.message : 'Account integrity audit could not be completed.',
        mode: 'PAPER', auditId, scanned, partialResultNotPersisted: true,
      });
    }
  });

  router.post('/api/alpaca/reconciliation/coverage-audit', async (req: Request, res: Response) => {
    if (!executionLedger) {
      res.status(503).json({ error: 'Persistent execution ledger is not configured.', mode: 'PAPER' });
      return;
    }
    const maxOrders = req.body?.maxOrders === undefined ? 5000 : Number(req.body.maxOrders);
    if (!Number.isSafeInteger(maxOrders) || maxOrders < 1 || maxOrders > 10000) {
      res.status(400).json({ error: 'maxOrders must be an integer from 1 to 10000.', mode: 'PAPER' });
      return;
    }
    const auditId = 'coverage-' + randomUUID();
    const startedAt = new Date().toISOString();
    try {
      const broker = await alpaca.getOrderHistorySnapshot();
      let indexScanned = 0;
      let pageToken = '';
      const seenTokens = new Set<string>();
      const indexIds = new Map<string, { symbol: string; indexKey: string }>();
      let indexComplete = true;
      while (indexScanned < maxOrders) {
        const page = await executionLedger.listTrackedOrdersPage({
          limit: Math.min(500, maxOrders - indexScanned),
          pageToken: pageToken || undefined,
        });
        for (const order of page.orders) {
          indexScanned++;
          if (order.clientOrderId) indexIds.set(order.clientOrderId, { symbol: String(order.symbol || '').toUpperCase(), indexKey: order.indexKey });
        }
        pageToken = page.nextPageToken;
        if (!pageToken) break;
        if (seenTokens.has(pageToken)) throw new Error('Firestore returned a repeated order-index page token; coverage audit stopped fail-closed.');
        seenTokens.add(pageToken);
      }
      if (pageToken) indexComplete = false;

      const brokerIds = new Map<string, { symbol: string; brokerOrderId: string }>();
      let brokerMissingClientOrderId = 0;
      for (const order of broker.orders) {
        const clientOrderId = String(order?.client_order_id || '');
        if (!clientOrderId) { brokerMissingClientOrderId++; continue; }
        brokerIds.set(clientOrderId, {
          symbol: String(order?.symbol || '').toUpperCase(),
          brokerOrderId: String(order?.id || ''),
        });
      }

      const brokerMissingFromIndex: Array<Record<string, string>> = [];
      const indexMissingFromBroker: Array<Record<string, string>> = [];
      const symbolMismatches: Array<Record<string, string>> = [];
      for (const [clientOrderId, order] of brokerIds) {
        const indexed = indexIds.get(clientOrderId);
        if (!indexed) {
          if (brokerMissingFromIndex.length < 250) brokerMissingFromIndex.push({
            clientOrderId, brokerOrderId: order.brokerOrderId, symbol: order.symbol,
          });
        } else if (indexed.symbol !== order.symbol && symbolMismatches.length < 250) {
          symbolMismatches.push({ clientOrderId, brokerSymbol: order.symbol, indexSymbol: indexed.symbol });
        }
      }
      for (const [clientOrderId, order] of indexIds) {
        if (!brokerIds.has(clientOrderId) && indexMissingFromBroker.length < 250) {
          indexMissingFromBroker.push({ clientOrderId, symbol: order.symbol });
        }
      }

      const brokerMissingCount = [...brokerIds.keys()].filter(id => !indexIds.has(id)).length;
      const indexMissingCount = [...indexIds.keys()].filter(id => !brokerIds.has(id)).length;
      const mismatchCount = [...brokerIds.keys()].filter(id => {
        const indexed = indexIds.get(id);
        return indexed && indexed.symbol !== brokerIds.get(id)!.symbol;
      }).length;
      const coverageComplete = broker.complete && indexComplete;
      const completedAt = new Date().toISOString();
      const findings = brokerMissingCount + indexMissingCount + mismatchCount + brokerMissingClientOrderId;
      const report = {
        auditId, runType: 'BROKER_INDEX_COVERAGE_AUDIT', startedAt, completedAt,
        status: coverageComplete ? 'completed' : 'partial',
        coverageComplete,
        coverageScope: 'ALPACA_PAPER_ORDER_HISTORY_VS_FIRESTORE_ORDER_INDEX',
        brokerHistoryComplete: broker.complete,
        indexComplete,
        brokerOrderCount: broker.orders.length,
        brokerOrdersWithClientOrderId: brokerIds.size,
        brokerMissingClientOrderId,
        indexOrderCount: indexScanned,
        matchedOrderCount: [...brokerIds.keys()].filter(id => indexIds.has(id)).length,
        brokerMissingFromIndexCount: brokerMissingCount,
        indexMissingFromBrokerCount: indexMissingCount,
        symbolMismatchCount: mismatchCount,
        findingsCount: findings,
        evidence: { brokerMissingFromIndex, indexMissingFromBroker, symbolMismatches },
        evidenceLimitPerCategory: 250,
        evidenceTruncated: brokerMissingCount > brokerMissingFromIndex.length ||
          indexMissingCount > indexMissingFromBroker.length || mismatchCount > symbolMismatches.length,
        readOnly: true,
      };
      await executionLedger.recordCoverageAudit(report);
      res.json({ mode: 'PAPER', ...report });
    } catch (error) {
      res.status(503).json({
        error: error instanceof Error ? error.message : 'Broker/index coverage audit could not be completed.',
        mode: 'PAPER', auditId, partialResultNotPersisted: true,
      });
    }
  });

  router.get('/api/alpaca/reconciliation/coverage-audits', async (req: Request, res: Response) => {
    if (!executionLedger) {
      res.status(503).json({ error: 'Persistent execution ledger is not configured.', mode: 'PAPER' });
      return;
    }
    const limit = req.query.limit === undefined ? 20 : Number(req.query.limit);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      res.status(400).json({ error: 'limit must be an integer from 1 to 100.', mode: 'PAPER' });
      return;
    }
    try {
      const audits = await executionLedger.listCoverageAudits({ limit });
      res.json({ mode: 'PAPER', count: audits.length, audits, readOnly: true });
    } catch (error) {
      res.status(503).json({
        error: error instanceof Error ? error.message : 'Broker/index coverage audit history is unavailable.',
        mode: 'PAPER',
      });
    }
  });

  router.get('/api/alpaca/reconciliation/integrity-audits', async (req: Request, res: Response) => {
    if (!executionLedger) {
      res.status(503).json({ error: 'Persistent execution ledger is not configured.', mode: 'PAPER' });
      return;
    }
    const limit = req.query.limit === undefined ? 20 : Number(req.query.limit);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      res.status(400).json({ error: 'limit must be an integer from 1 to 100.', mode: 'PAPER' });
      return;
    }
    try {
      const audits = await executionLedger.listIntegrityAudits({ limit });
      res.json({ mode: 'PAPER', count: audits.length, audits, readOnly: true });
    } catch (error) {
      res.status(503).json({ error: error instanceof Error ? error.message : 'Integrity audit history is unavailable.', mode: 'PAPER' });
    }
  });

  router.get('/api/alpaca/reconciliation/runs', async (req: Request, res: Response) => {
    if (!executionLedger) {
      res.status(503).json({ error: 'Persistent execution ledger is not configured.', mode: 'PAPER' });
      return;
    }
    try {
      const limit = req.query.limit === undefined ? 50 : Number(req.query.limit);
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
        res.status(400).json({ error: 'limit must be an integer from 1 to 100.', mode: 'PAPER' });
        return;
      }
      const runs = await executionLedger.listReconciliationRuns({ limit });
      res.json({ mode: 'PAPER', count: runs.length, runs, readOnly: true });
    } catch (error) {
      res.status(503).json({
        error: error instanceof Error ? error.message : 'Reconciliation run history is unavailable.',
        mode: 'PAPER',
      });
    }
  });

  router.get('/api/alpaca/reconciliation/worker-status', async (_req: Request, res: Response) => {
    res.json({
      mode: 'PAPER',
      ledgerConfigured: Boolean(executionLedger),
      worker: reconciliationWorker?.getStatus() || { running: false, unavailable: true },
      readOnly: true,
    });
  });

  router.get('/api/alpaca/reconciliation/positions', async (_req: Request, res: Response) => {
    if (!executionLedger) {
      res.status(503).json({ error: 'Persistent execution ledger is not configured.', mode: 'PAPER' });
      return;
    }
    try {
      const snapshot = await alpaca.getPositionSnapshot();
      const tracked = await executionLedger.listTrackedOrders();
      const ledgerOrders: Array<{ clientOrderId: string; events: any[] }> = [];
      for (let offset = 0; offset < tracked.length; offset += 3) {
        const batch = tracked.slice(offset, offset + 3);
        const results = await Promise.all(batch.map(async order => ({
          clientOrderId: order.clientOrderId,
          events: await executionLedger.readEvents(order.clientOrderId),
        })));
        for (const result of results) {
          const verification = verifyExecutionLedgerChain(result.events);
          if (!verification.valid) {
            await executionLedger.upsertOperationalAlert({
              alertId: 'ledger-chain-' + createHash('sha256').update(result.clientOrderId).digest('hex').slice(0, 48),
              type: 'LEDGER_CHAIN_INVALID',
              severity: 'CRITICAL',
              title: 'Execution ledger integrity failure',
              message: 'A per-order SHA-256 event chain failed verification; position reconciliation was stopped.',
              source: 'POSITION_RECONCILIATION',
              evidence: { clientOrderId: result.clientOrderId, brokenAtSequence: verification.brokenAtSequence ?? 0 },
            }).catch(() => undefined);
            res.status(409).json({
              error: 'An execution ledger hash chain is invalid; position reconciliation was not classified.',
              mode: 'PAPER',
              clientOrderId: result.clientOrderId,
              verification,
            });
            return;
          }
          ledgerOrders.push(result);
        }
      }
      const reconciliation = buildPositionReconciliation({
        brokerPositions: snapshot.positions.map((position: any) => ({
          symbol: String(position?.symbol || ''),
          qty: position?.qty,
          side: position?.side,
          asset_class: position?.asset_class,
        })),
        orders: ledgerOrders,
      });
      const completedAt = new Date().toISOString();
      const nonMatched = reconciliation.summary.unattributedOrExternalActivity +
        reconciliation.summary.unexplainedVariance;
      const currentPositionAlertIds = new Set<string>();
      for (const row of reconciliation.rows) {
        const alertId = 'position-' + createHash('sha256').update(row.symbol).digest('hex').slice(0, 48);
        currentPositionAlertIds.add(alertId);
        if (row.classification === 'LEDGER_NET_EQUALS_BROKER') {
          await executionLedger.resolveOperationalAlert(alertId, 'Position quantity now matches the application-ledger net fills.');
        } else {
          const unexplained = row.classification === 'UNEXPLAINED_VARIANCE';
          await executionLedger.upsertOperationalAlert({
            alertId,
            type: unexplained ? 'POSITION_QUANTITY_VARIANCE' : 'UNATTRIBUTED_POSITION',
            severity: unexplained ? 'WARNING' : 'INFO',
            title: unexplained ? 'Position quantity variance detected' : 'Position has no application fill provenance',
            message: unexplained
              ? 'Broker quantity differs from net application-ledger fills. External activity or missing provenance may explain the difference.'
              : 'Broker reports a position with no matching application-ledger fill history.',
            source: 'POSITION_RECONCILIATION',
            evidence: {
              symbol: row.symbol,
              brokerQty: row.brokerQty,
              ledgerNetFillQty: row.ledgerNetFillQty,
              unexplainedQty: row.unexplainedQty,
              classification: row.classification,
              snapshotAt: snapshot.fetchedAt,
            },
          });
        }
      }
      const activeAlerts = await executionLedger.listOperationalAlerts({ status: 'ACTIVE', limit: 200 });
      for (const alert of activeAlerts) {
        if (alert.source === 'POSITION_RECONCILIATION' &&
            ['POSITION_QUANTITY_VARIANCE', 'UNATTRIBUTED_POSITION'].includes(String(alert.type)) &&
            !currentPositionAlertIds.has(String(alert.alertId))) {
          await executionLedger.resolveOperationalAlert(
            String(alert.alertId),
            'The symbol is no longer present in the current broker/ledger comparison.'
          );
        }
      }
      await executionLedger.resolveOperationalAlert(
        'position-reconciliation-unavailable',
        'A new position reconciliation completed successfully.'
      );
      const runId = 'positions-' + randomUUID();
      await executionLedger.recordReconciliationRun({
        runId,
        runType: 'POSITION_SNAPSHOT',
        startedAt: snapshot.fetchedAt,
        completedAt,
        status: nonMatched === 0 ? 'completed' : 'partial',
        scanned: snapshot.positions.length,
        reconciled: reconciliation.summary.ledgerNetEqualsBroker,
        skippedTerminal: 0,
        failed: nonMatched,
        errorCount: nonMatched,
        errors: reconciliation.rows
          .filter(row => row.classification !== 'LEDGER_NET_EQUALS_BROKER')
          .slice(0, 100)
          .map(row => ({ clientOrderId: row.symbol, error: row.classification })),
        summary: reconciliation.summary,
        rows: reconciliation.rows.slice(0, 500).map(row => ({
          symbol: row.symbol,
          assetClass: row.assetClass,
          brokerQty: row.brokerQty,
          ledgerNetFillQty: row.ledgerNetFillQty,
          unexplainedQty: row.unexplainedQty,
          appFillCount: row.appFillCount,
          classification: row.classification,
        })),
      });
      res.json({
        mode: 'PAPER',
        fetchedAt: snapshot.fetchedAt,
        brokerPositionCount: snapshot.positions.length,
        ledgerOrderCount: ledgerOrders.length,
        reconciliation,
        runId,
        readOnly: true,
      });
    } catch (error) {
      if (executionLedger) {
        await executionLedger.upsertOperationalAlert({
          alertId: 'position-reconciliation-unavailable',
          type: 'POSITION_RECONCILIATION_UNAVAILABLE',
          severity: 'CRITICAL',
          title: 'Position reconciliation unavailable',
          message: error instanceof Error ? error.message : 'Position reconciliation could not be completed.',
          source: 'POSITION_RECONCILIATION',
        }).catch(() => undefined);
      }
      res.status(503).json({
        error: error instanceof Error ? error.message : 'Position reconciliation could not be completed.',
        mode: 'PAPER',
        conclusive: false,
      });
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
