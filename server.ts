import 'dotenv/config';
import express, { Express } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import firebaseConfig from './firebase-applet-config.json' with { type: 'json' };
import {
  createMarketDataService,
  MarketDataServiceOptions,
} from './server/services/marketData.ts';
import { createAlpacaService, FetchLike } from './server/services/alpaca.ts';
import { createMarketRouter } from './server/routes/market.ts';
import { createOptimizerRouter } from './server/routes/optimizer.ts';
import { createHealthRouter } from './server/routes/health.ts';
import { createPythonRouter } from './server/routes/python.ts';
import { createStreamRouter } from './server/routes/stream.ts';
import { createAlpacaRouter } from './server/routes/alpaca.ts';
import { createWatchlistTriggerRouter } from './server/routes/watchlist.ts';
import { createWatchlistEvaluationRouter } from './server/routes/watchlistEvaluation.ts';
import { createPredictionCalibrationRouter } from './server/routes/predictionCalibration.ts';
import { createExecutionLedger } from './server/services/executionLedger.ts';
import { createExecutionReconciliationWorker } from './server/services/executionReconciliationWorker.ts';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const isProduction = process.env.NODE_ENV === 'production';

export interface CreateAppOptions extends MarketDataServiceOptions {
  attachFrontend?: boolean;
  streamPulseIntervalMs?: number;
  alpacaFetchOverride?: FetchLike;
  alpacaEnvOverride?: Record<string, string | undefined>;
  firebaseProjectIdOverride?: string;
  alpacaAllowedUidsOverride?: string[];
  alpacaBotExecutionEnabledOverride?: boolean;
  alpacaTradingKillSwitchOverride?: boolean;
  firebaseAuthFetchOverride?: typeof fetch;
  executionLedgerRequiredOverride?: boolean;
  reconciliationIntervalMs?: number;
  reconciliationLeaseMs?: number;
  watchlistTriggerWorkerTokenOverride?: string;
  watchlistEvaluationWorkerTokenOverride?: string;
  watchlistEvaluationMaxMarketDataAgeMsOverride?: number;
  firebaseServiceAccountJsonOverride?: string;
}

export async function createApp(options: CreateAppOptions = {}): Promise<{ app: Express; startBackgroundWorkers: () => void }> {
  const app = express();
  app.use(express.json());

  const marketData = createMarketDataService({
    fetchYahooDataOverride: options.fetchYahooDataOverride,
    fetchSECFilingsOverride: options.fetchSECFilingsOverride,
  });
  const alpaca = createAlpacaService({
    fetchImpl: options.alpacaFetchOverride,
    env: options.alpacaEnvOverride,
  });

  app.use(createMarketRouter(marketData));
  app.use(createOptimizerRouter(marketData));
  app.use(createHealthRouter(marketData));
  app.use(createPythonRouter());
  app.use(createStreamRouter(marketData, { pulseIntervalMs: options.streamPulseIntervalMs }));
  const allowedAlpacaUids = options.alpacaAllowedUidsOverride ??
    (process.env.ALPACA_ALLOWED_UIDS || '').split(',').map((uid) => uid.trim()).filter(Boolean);
  const firebaseProjectId = options.firebaseProjectIdOverride || process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId;
  const serviceAccountJson = options.firebaseServiceAccountJsonOverride ?? process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const executionLedger = serviceAccountJson
    ? createExecutionLedger({ projectId: firebaseProjectId, serviceAccountJson })
    : undefined;
  const executionLedgerRequired = options.executionLedgerRequiredOverride ??
    (process.env.EXECUTION_LEDGER_REQUIRED === 'true' || (isProduction && process.env.EXECUTION_LEDGER_REQUIRED !== 'false'));
  const configuredInterval = Number(process.env.EXECUTION_RECONCILIATION_INTERVAL_MS);
  const configuredLease = Number(process.env.EXECUTION_RECONCILIATION_LEASE_MS);
  const reconciliationWorker = executionLedger
    ? createExecutionReconciliationWorker({
        alpaca,
        ledger: executionLedger,
        intervalMs: options.reconciliationIntervalMs ??
          (Number.isFinite(configuredInterval) && configuredInterval >= 30_000 ? configuredInterval : 60_000),
        concurrency: 3,
        leaseMs: options.reconciliationLeaseMs ??
          (Number.isFinite(configuredLease) && configuredLease >= 120_000 ? configuredLease : undefined),
      })
    : undefined;

  app.use(createPredictionCalibrationRouter({
    projectId: firebaseProjectId,
    databaseId: firebaseConfig.firestoreDatabaseId,
    serviceAccountJson,
    fetchImpl: options.firebaseAuthFetchOverride,
  }));

  app.use(createWatchlistTriggerRouter({
    projectId: firebaseProjectId,
    databaseId: firebaseConfig.firestoreDatabaseId,
    serviceAccountJson,
    workerToken: options.watchlistTriggerWorkerTokenOverride ?? process.env.WATCHLIST_TRIGGER_WORKER_TOKEN,
  }));

  app.use(createWatchlistEvaluationRouter({
    marketData,
    projectId: firebaseProjectId,
    databaseId: firebaseConfig.firestoreDatabaseId,
    serviceAccountJson,
    workerToken: options.watchlistEvaluationWorkerTokenOverride ?? process.env.WATCHLIST_EVALUATION_WORKER_TOKEN,
    maxMarketDataAgeMs: options.watchlistEvaluationMaxMarketDataAgeMsOverride,
  }));

  const botExecutionEnabled = options.alpacaBotExecutionEnabledOverride ??
    process.env.ALPACA_BOT_EXECUTION_ENABLED === 'true';
  const botKillSwitchEnabled = options.alpacaTradingKillSwitchOverride ??
    process.env.ALPACA_TRADING_KILL_SWITCH === 'true';

  app.use(createAlpacaRouter(alpaca, {
    projectId: firebaseProjectId,
    allowedUids: allowedAlpacaUids,
    fetchImpl: options.firebaseAuthFetchOverride,
  }, executionLedger, executionLedgerRequired, reconciliationWorker, botExecutionEnabled, botKillSwitchEnabled));

  // Ensure unmatched /api/* routes and API parse errors always return JSON, never Vite SPA index.html
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API route not found' });
  });
  app.use(
    '/api',
    (
      err: any,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      res.status(err?.status || 500).json({ error: err?.message || 'Internal API error' });
    }
  );

  if (options.attachFrontend) {
    if (!isProduction) {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } else {
      const distPath = path.resolve(process.cwd(), 'dist');
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  return { app, startBackgroundWorkers: () => reconciliationWorker?.start() };
}

async function startServer() {
  const { app, startBackgroundWorkers } = await createApp({ attachFrontend: true });
  startBackgroundWorkers();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Trullas Scanner Server] Running on http://0.0.0.0:${PORT}`);
  });
}

const isDirectEntry = (() => {
  try {
    const currentFile = fileURLToPath(import.meta.url);
    const entryArg = process.argv[1] ? path.resolve(process.argv[1]) : '';
    return currentFile === entryArg;
  } catch {
    return false;
  }
})();

if (isDirectEntry) {
  startServer();
}
