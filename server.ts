import 'dotenv/config';
import express, { Express } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
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

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const isProduction = process.env.NODE_ENV === 'production';

export interface CreateAppOptions extends MarketDataServiceOptions {
  attachFrontend?: boolean;
  streamPulseIntervalMs?: number;
  alpacaFetchOverride?: FetchLike;
  alpacaEnvOverride?: Record<string, string | undefined>;
}

export async function createApp(options: CreateAppOptions = {}): Promise<{ app: Express }> {
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
  app.use(createAlpacaRouter(alpaca));

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

  return { app };
}

async function startServer() {
  const { app } = await createApp({ attachFrontend: true });
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
