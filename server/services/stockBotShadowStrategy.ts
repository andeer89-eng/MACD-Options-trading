import { createHash } from 'node:crypto';
import {
  selectAlpacaEquityCandidates,
  type AlpacaOverviewDTO,
} from '../../src/utils/alpacaJournalSync.ts';
import { calculateIndicators, detectDivergences, filterActiveDivergences, getLatestVolatilityMetrics } from '../../src/utils/trullasStrategy.ts';
import { DEFAULT_SETTINGS, clampSettingsBounds } from '../../src/utils/masterPlanCore.ts';
import { evaluatePortfolioRisk } from '../../src/utils/portfolioRiskEngine.ts';
import { SP500_UNIVERSE } from '../../src/data/sp500Universe.ts';

const DEFAULT_SYMBOLS = ['AAPL', 'NVDA', 'MSFT', 'AMZN', 'GOOGL', 'META', 'TSLA', 'JPM', 'LLY', 'XOM', 'SPY', 'AMD', 'AVGO'];

export interface StockBotShadowDependencies {
  getOverview: () => Promise<any>;
  fetchCandles: (symbol: string) => Promise<any[]>;
  getMarketHealth: () => Promise<any>;
  now?: () => number;
}

export interface StockBotShadowPortfolio {
  maxOpenPositions?: number;
  riskPerTradePercent?: number;
  activeMemory?: Record<string, unknown> | null;
  queuedCandidates?: Array<Record<string, unknown>>;
  symbols?: string[];
  masterPlanSettings?: Record<string, unknown>;
}

function normalizeSymbols(input: unknown): string[] {
  const raw = Array.isArray(input) ? input : DEFAULT_SYMBOLS;
  const symbols = [...new Set(raw.map((value) => String(value || '').trim().toUpperCase())
    .filter((symbol) => /^[A-Z][A-Z0-9.\-]{0,9}$/.test(symbol)))];
  return symbols.slice(0, 50);
}

export function createStockBotShadowStrategy(deps: StockBotShadowDependencies) {
  const now = deps.now ?? Date.now;

  async function evaluate(portfolio: StockBotShadowPortfolio) {
    const startedAt = now();
    const [overview, marketHealth] = await Promise.all([
      deps.getOverview(),
      deps.getMarketHealth(),
    ]);
    if (!overview?.configured || !overview?.account) {
      return {
        mode: 'SHADOW' as const,
        status: 'BLOCKED' as const,
        reason: 'ALPACA_PAPER_UNAVAILABLE',
        startedAt: new Date(startedAt).toISOString(),
        completedAt: new Date(now()).toISOString(),
      };
    }
    if (overview.orderHistoryComplete === false || overview.portfolioHistoryComplete === false) {
      return {
        mode: 'SHADOW' as const,
        status: 'BLOCKED' as const,
        reason: 'INCOMPLETE_BROKER_SNAPSHOT',
        startedAt: new Date(startedAt).toISOString(),
        completedAt: new Date(now()).toISOString(),
      };
    }

    const symbols = normalizeSymbols(portfolio.symbols);
    const scanErrors: Array<{ symbol: string; error: string }> = [];
    const marketItems = (await Promise.all(symbols.map(async (symbol) => {
      try {
        const candles = await deps.fetchCandles(symbol);
        if (!Array.isArray(candles) || candles.length < 30) {
          scanErrors.push({ symbol, error: 'INSUFFICIENT_CANDLES' });
          return null;
        }
        const indicators = calculateIndicators(candles);
        const setups = filterActiveDivergences(detectDivergences(symbol, '1d', indicators), candles);
        const volatility = getLatestVolatilityMetrics(candles, 14);
        const last = candles[candles.length - 1];
        const universeItem = SP500_UNIVERSE.find((item) => item.symbol === symbol);
        return {
          symbol,
          sector: universeItem?.sector || 'ETFs & Index',
          currentPrice: Number(last.close),
          atr: volatility.atr,
          atrPercent: volatility.atrPercent,
          setups,
          fetchedAtMs: now(),
        };
      } catch (error) {
        scanErrors.push({
          symbol,
          error: error instanceof Error ? error.message.slice(0, 240) : 'MARKET_DATA_ERROR',
        });
        return null;
      }
    }))).filter((item): item is NonNullable<typeof item> => item !== null);

    const settings = clampSettingsBounds({
      ...DEFAULT_SETTINGS,
      ...(portfolio.masterPlanSettings || {}),
      simCapitalUsd: Number(overview.account.equity || DEFAULT_SETTINGS.simCapitalUsd),
      maxRiskPerTradePct: Number(portfolio.riskPerTradePercent || DEFAULT_SETTINGS.maxRiskPerTradePct),
    });
    const maxOpenPositions = Math.max(1, Math.min(25, Math.floor(Number(portfolio.maxOpenPositions) || 5)));
    const risk = evaluatePortfolioRisk({
      account: overview.account,
      positions: overview.positions || [],
      openOrders: overview.orders || [],
      equityHistory: overview.portfolioHistory || [],
      fetchedAt: overview.fetchedAt,
    });
    const candidates = selectAlpacaEquityCandidates(
      overview as AlpacaOverviewDTO,
      marketItems,
      settings,
      maxOpenPositions,
      {
        nowMs: now(),
        marketHealth,
        queuedCandidates: (portfolio.queuedCandidates || []) as any[],
        activeMemory: (portfolio.activeMemory || null) as any,
      },
    );

    const ordersToPlace = risk.allowNewEntries ? candidates.ordersToPlace : [];
    const reversalRequests = risk.allowNewEntries ? candidates.reversalRequests : [];
    const completedAt = now();
    const configDigest = createHash('sha256').update(JSON.stringify({
      symbols,
      maxOpenPositions,
      riskPerTradePercent: settings.maxRiskPerTradePct,
      masterPlanSettings: settings,
    })).digest('hex');

    return {
      mode: 'SHADOW' as const,
      status: 'EVALUATED' as const,
      assetClass: 'STOCK' as const,
      source: 'SERVER_STOCK_SHADOW_V1' as const,
      startedAt: new Date(startedAt).toISOString(),
      completedAt: new Date(completedAt).toISOString(),
      durationMs: Math.max(0, completedAt - startedAt),
      configDigest,
      marketDataSource: 'YAHOO_FINANCE' as const,
      brokerSnapshotAt: String(overview.fetchedAt || ''),
      marketHealthAvailable: Boolean(marketHealth),
      risk: {
        status: risk.status,
        allowNewEntries: risk.allowNewEntries,
        reasons: risk.reasons,
        equity: risk.equity,
      },
      scan: {
        requestedSymbols: symbols.length,
        evaluatedSymbols: marketItems.length,
        errors: scanErrors,
      },
      decisions: {
        ordersToPlace,
        positionsToClose: candidates.positionsToClose,
        reversalRequests,
        skippedByRiskGates: candidates.skippedByRiskGates,
      },
      execution: {
        ordersSubmitted: 0,
        brokerSideEffects: false,
      },
    };
  }

  return { evaluate };
}
