import { Router, Request, Response } from 'express';
import { validateBacktestParams } from '../../src/utils/serverSecurity.ts';
import {
  runBacktest,
  BacktestConfig,
  BacktestStrategyMode,
} from '../../src/utils/backtestEngine.ts';
import { optimizeStrategyParameters } from '../../src/utils/strategyOptimizer.ts';
import type { MarketDataService } from '../services/marketData.ts';

const VALID_SYMBOL_REGEX = /^[A-Za-z0-9.^=\-_]{1,20}$/;
const ALLOWED_TARGET_MODES = ['tranches', 'tp1', 'tp2'] as const;
const ALLOWED_STRATEGY_MODES: readonly BacktestStrategyMode[] = [
  'trullas_divergence',
  'ttm_squeeze_stack',
  'stacked_ema_pullback',
];

export function createOptimizerRouter(marketData: MarketDataService): Router {
  const router = Router();

  router.post('/api/backtest', async (req: Request, res: Response) => {
    marketData.incrementApiRequests();
    try {
      const {
        symbol = 'AAPL',
        timeframe = '1d',
        range = '1y',
        initialBalance = 10000,
        riskPerTradePct = 1.5,
        targetMode = 'tranches',
        minQualityScore = 55,
        strategyMode = 'trullas_divergence',
      } = req.body || {};

      if (typeof symbol !== 'string' || !VALID_SYMBOL_REGEX.test(symbol.trim())) {
        return res.status(400).json({ error: 'Invalid or missing symbol parameter.' });
      }
      if (!ALLOWED_TARGET_MODES.includes(targetMode)) {
        return res.status(400).json({ error: 'Invalid targetMode. Must be one of: tranches, tp1, tp2.' });
      }
      if (!ALLOWED_STRATEGY_MODES.includes(strategyMode)) {
        return res.status(400).json({
          error: 'Invalid strategyMode. Must be one of: trullas_divergence, ttm_squeeze_stack, stacked_ema_pullback.',
        });
      }

      const validation = validateBacktestParams({
        initialBalance,
        riskPerTradePct,
        minQualityScore,
      });
      if (!validation.ok) {
        return res.status(400).json({ error: validation.error });
      }

      const cleanSymbol = symbol.trim().toUpperCase();
      const candles = await marketData.fetchYahooData(cleanSymbol, timeframe, range, 25);
      if (candles.length < 25) {
        return res.status(503).json({
          error: `Insufficient live historical bars for ${cleanSymbol} (${candles.length} fetched; need >= 25).`,
        });
      }

      const config: BacktestConfig = {
        symbol: cleanSymbol,
        timeframe,
        range,
        initialBalance: validation.values.initialBalance,
        riskPerTradePct: validation.values.riskPerTradePct,
        targetMode,
        minQualityScore: validation.values.minQualityScore,
        strategyMode,
      };

      const result = runBacktest(candles, config);
      res.json(result);
    } catch (err: any) {
      console.error('[Backtest API Error]:', err);
      res.status(500).json({
        error: 'Failed to run backtest simulation',
        message: err.message,
      });
    }
  });

  router.post('/api/optimize-strategy', async (req: Request, res: Response) => {
    marketData.incrementApiRequests();
    try {
      const {
        symbol,
        timeframe = '1d',
        range = '1y',
        initialBalance = 10000,
        riskPerTradePct = 1.5,
        targetMode = 'tranches',
        minQualityScore = 55,
      } = req.body || {};

      if (typeof symbol !== 'string' || !VALID_SYMBOL_REGEX.test(symbol.trim())) {
        return res.status(400).json({ error: 'Invalid or missing symbol parameter.' });
      }
      if (!ALLOWED_TARGET_MODES.includes(targetMode)) {
        return res.status(400).json({ error: 'Invalid targetMode. Must be one of: tranches, tp1, tp2.' });
      }

      const paramValidation = validateBacktestParams({
        initialBalance,
        riskPerTradePct,
        minQualityScore,
      });
      if (!paramValidation.ok) {
        return res.status(400).json({ error: paramValidation.error });
      }

      const cleanSymbol = symbol.trim().toUpperCase();
      const candles = await marketData.fetchYahooData(cleanSymbol, timeframe, range, 25);
      if (candles.length < 25) {
        return res.status(503).json({
          error: `Insufficient live historical bars for ${cleanSymbol} optimization (${candles.length} fetched).`,
        });
      }

      const config: BacktestConfig = {
        symbol: cleanSymbol,
        timeframe,
        range,
        initialBalance: paramValidation.values.initialBalance,
        riskPerTradePct: paramValidation.values.riskPerTradePct,
        targetMode,
        minQualityScore: paramValidation.values.minQualityScore,
      };

      const optimizationReport = optimizeStrategyParameters(candles, config);
      res.json(optimizationReport);
    } catch (err: any) {
      console.error('[Strategy Optimizer API Error]:', err);
      res.status(500).json({ error: 'Failed to run strategy optimization', message: err.message });
    }
  });

  return router;
}
