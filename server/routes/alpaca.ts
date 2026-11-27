import { Router, Request, Response } from 'express';
import { AlpacaApiError, AlpacaService } from '../services/alpaca.ts';
import {
  createFirebaseAlpacaAuthMiddleware,
  FirebaseAuthOptions,
} from '../services/firebaseAuth.ts';

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

export function createAlpacaRouter(alpaca: AlpacaService, authOptions: FirebaseAuthOptions): Router {
  const router = Router();
  router.use(createFirebaseAlpacaAuthMiddleware(authOptions));

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
      const result = await alpaca.submitOrder(req.body || {});
      res.json(result);
    } catch (err) {
      handleAlpacaError(res, err);
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
