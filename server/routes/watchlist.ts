import { Router, Request, Response } from 'express';
import {
  calculateIndicators,
  detectDivergences,
  filterActiveDivergences,
} from '../../src/utils/trullasStrategy.ts';
import type { MarketDataService } from '../services/marketData.ts';
import type { createFirebaseIdTokenVerifier } from '../services/firebaseAuth.ts';
import {
  WatchlistAdminUnavailableError,
  WatchlistTransitionConflictError,
} from '../services/watchlistAdmin.ts';

type VerifyToken = ReturnType<typeof createFirebaseIdTokenVerifier>;
type MarkTriggered = (input: {
  uid: string;
  symbol: string;
  direction: 'long' | 'short';
  timeframe: string;
  currentPrice: number;
  atr: number;
  setupId: string;
  detectedAt: number;
}) => Promise<{ status: 'TRIGGERED'; symbol: string; updatedAt: string }>;

export interface WatchlistRouterOptions {
  verifyFirebaseIdToken: VerifyToken;
  markTriggered?: MarkTriggered;
}

const SYMBOL_RE = /^[A-Z0-9.^=_-]{1,20}$/;
const TIMEFRAMES = new Set(['1d', '1wk']);

export function createWatchlistRouter(
  marketData: Pick<MarketDataService, 'fetchYahooData'>,
  options: WatchlistRouterOptions
): Router {
  const router = Router();

  router.post('/api/watchlist/trigger', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!options.markTriggered) {
      return res.status(503).json({ error: 'Server-side watchlist persistence is not configured.' });
    }

    const authorization = req.header('authorization') || '';
    const match = /^Bearer\\s+([^\\s]+)$/i.exec(authorization);
    if (!match) return res.status(401).json({ error: 'Authentication required.' });

    let identity: { uid: string; emailVerified: boolean };
    try {
      identity = await options.verifyFirebaseIdToken(match[1]);
    } catch (error) {
      const unavailable = error instanceof Error && error.name === 'FirebaseAuthUnavailableError';
      return res.status(unavailable ? 503 : 401).json({
        error: unavailable ? 'Authentication service temporarily unavailable.' : 'Invalid or expired authentication token.',
      });
    }
    if (!identity.emailVerified) return res.status(403).json({ error: 'A verified Firebase account is required.' });

    const symbol = typeof req.body?.symbol === 'string' ? req.body.symbol.trim().toUpperCase() : '';
    const direction = req.body?.direction;
    const timeframe = typeof req.body?.timeframe === 'string' ? req.body.timeframe : '1d';
    if (!SYMBOL_RE.test(symbol) || !['long', 'short'].includes(direction) || !TIMEFRAMES.has(timeframe)) {
      return res.status(400).json({ error: 'symbol, direction, or timeframe is invalid.' });
    }

    try {
      const candles = await marketData.fetchYahooData(symbol, timeframe, '6mo', 80);
      if (!Array.isArray(candles) || candles.length < 25) {
        return res.status(503).json({ error: 'Insufficient fresh market data to verify the trigger.' });
      }
      const indicators = calculateIndicators(candles);
      const detected = detectDivergences(symbol, timeframe, indicators);
      const active = filterActiveDivergences(detected, candles);
      const expectedTypes = direction === 'long'
        ? new Set(['BULLISH_TRIPLE', 'BULLISH_DOUBLE'])
        : new Set(['BEARISH_TRIPLE', 'BEARISH_DOUBLE']);
      const setup = active
        .filter(item => expectedTypes.has(item.type))
        .sort((a, b) => b.detectedAt - a.detectedAt)[0];
      if (!setup) {
        return res.status(409).json({ error: 'No active server-verified divergence supports this trigger.' });
      }

      const latest = indicators[indicators.length - 1];
      const result = await options.markTriggered({
        uid: identity.uid,
        symbol,
        direction,
        timeframe,
        currentPrice: latest.candle.close,
        atr: Number(latest.atr || 0),
        setupId: setup.id,
        detectedAt: setup.detectedAt,
      });
      return res.json({ ...result, evidence: {
        source: 'server-market-divergence',
        setupType: setup.type,
        qualityScore: setup.qualityScore,
        triggerPrice: setup.triggerPrice,
        detectedAt: setup.detectedAt,
      } });
    } catch (error) {
      if (error instanceof WatchlistTransitionConflictError) {
        return res.status(409).json({ error: error.message });
      }
      if (error instanceof WatchlistAdminUnavailableError) {
        return res.status(503).json({ error: error.message });
      }
      return res.status(503).json({ error: 'Server-side trigger verification failed.' });
    }
  });

  return router;
}
