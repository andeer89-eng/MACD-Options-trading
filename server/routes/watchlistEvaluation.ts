import { Router, Request, Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import {
  calculateIndicators,
  detectDivergences,
  filterActiveDivergences,
  type Candle,
} from '../../src/utils/trullasStrategy.ts';
import type { MarketDataService } from '../services/marketData.ts';
import {
  createWatchlistEvaluationJournal,
  WatchlistEvaluationJournalError,
} from '../services/watchlistEvaluationJournal.ts';
import { evaluateWatchlistBreakout } from '../services/watchlistSignalEvaluator.ts';

function safeSecretEqual(candidate: string, expected: string): boolean {
  const left = Buffer.from(candidate);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

const TIMEFRAMES = new Set(['5m', '15m', '30m', '1h', '1d', '1wk']);
const RANGES = new Set(['1mo', '3mo', '6mo', '1y', '2y']);

export function createWatchlistEvaluationRouter(options: {
  marketData: MarketDataService;
  projectId: string;
  databaseId?: string;
  serviceAccountJson?: string;
  workerToken?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  maxMarketDataAgeMs?: number;
}): Router {
  const router = Router();
  const now = options.now ?? Date.now;
  const journal = options.serviceAccountJson
    ? createWatchlistEvaluationJournal({
        projectId: options.projectId,
        databaseId: options.databaseId,
        serviceAccountJson: options.serviceAccountJson,
        fetchImpl: options.fetchImpl,
        now,
      })
    : undefined;

  router.post('/api/internal/watchlist/evaluate', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!options.workerToken || !journal) {
      res.status(503).json({ error: 'Watchlist evaluation worker is not configured.' });
      return;
    }

    const authorization = req.header('authorization') || '';
    const match = /^Bearer\s+([^\s]+)$/i.exec(authorization);
    if (!match || !safeSecretEqual(match[1], options.workerToken)) {
      res.status(401).json({ error: 'Worker authentication required.' });
      return;
    }

    const { ownerId, symbol, timeframe, range } = req.body || {};
    if (
      typeof ownerId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(ownerId) ||
      typeof symbol !== 'string' || !/^[A-Za-z0-9.=_-]{1,20}$/.test(symbol) ||
      typeof timeframe !== 'string' || !TIMEFRAMES.has(timeframe) ||
      typeof range !== 'string' || !RANGES.has(range)
    ) {
      res.status(400).json({ error: 'Invalid watchlist evaluation payload.' });
      return;
    }

    const normalizedSymbol = symbol.trim().toUpperCase();
    const evaluatedAt = now();
    try {
      const marketResult = await options.marketData.fetchWatchlistSignalMarketData(
        normalizedSymbol, timeframe, range, 60
      );
      if (!marketResult.ok) {
        res.status(503).json({ error: 'Provenance-verified market data is unavailable.', reason: marketResult.reason });
        return;
      }

      const evidence = marketResult.evidence;
      const candles = evidence.candles as Candle[];
      const lastClosedCandle = candles[candles.length - 1];
      if (!lastClosedCandle) {
        res.status(503).json({ error: 'No closed market candles are available.' });
        return;
      }

      const indicatorPoints = calculateIndicators(candles);
      const detected = detectDivergences(normalizedSymbol, timeframe, indicatorPoints);
      const activeSetups = filterActiveDivergences(detected, candles, {
        spotPrice: lastClosedCandle.close,
        maxBarsSinceConfirm: 45,
      });
      const maxAge = options.maxMarketDataAgeMs ?? 15 * 60_000;
      const evaluations = [];

      for (const setup of activeSetups) {
        const evaluation = evaluateWatchlistBreakout(setup, evidence, evaluatedAt, maxAge);
        const journalResult = await journal.append({
          ownerId,
          symbol: normalizedSymbol,
          setupId: setup.id,
          ruleVersion: evaluation.ruleVersion,
          status: evaluation.status,
          evaluatedAt,
          lastClosedCandleTimestamp: lastClosedCandle.timestamp,
          marketDataProvider: evidence.provider,
          normalizedPayloadSha256: evidence.normalizedPayloadSha256,
          ...(evaluation.status === 'TRIGGERED' ? {
            direction: evaluation.direction,
            threshold: evaluation.threshold,
            previousClose: evaluation.previousClose,
            observedClose: evaluation.observedClose,
            triggerCandleTimestamp: evaluation.triggerCandleTimestamp,
          } : { reason: evaluation.reason }),
        });
        evaluations.push({
          setupId: setup.id,
          type: setup.type,
          qualityScore: setup.qualityScore,
          evaluation,
          journal: journalResult,
        });
      }

      res.json({
        ownerId,
        symbol: normalizedSymbol,
        timeframe,
        range,
        evaluatedAt,
        provider: evidence.provider,
        normalizedPayloadSha256: evidence.normalizedPayloadSha256,
        lastClosedCandleTimestamp: lastClosedCandle.timestamp,
        detectedSetupCount: detected.length,
        activeSetupCount: activeSetups.length,
        journaledEvaluationCount: evaluations.length,
        evaluations,
        readOnly: true,
      });
    } catch (error) {
      if (error instanceof WatchlistEvaluationJournalError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      res.status(503).json({ error: 'Watchlist evaluation is temporarily unavailable.' });
    }
  });

  return router;
}
