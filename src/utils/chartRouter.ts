/* =====================================================================
   TRULLAS Master Plan v3 — Unified Chart Router (§8 Roadmap Item 4)
   Single source of truth for routing symbols and deterministic Levels
   into the charting suite.
   ===================================================================== */

import { Levels, calculateLevels } from './masterPlanCore';

export interface OpenChartParams {
  symbol: string;
  timeframe?: '1w' | '1d' | '1h';
  levels?: Levels;
  source?: string;
}

export type ChartRouterListener = (params: OpenChartParams) => void;

let activeChartTarget: OpenChartParams = {
  symbol: 'AAPL',
  timeframe: '1d',
  source: 'default',
};

const listeners = new Set<ChartRouterListener>();

/**
 * Dispatches an openChart navigation request across the application.
 * Ensures the target symbol, timeframe, and deterministic Levels are synchronized.
 */
export function openChart(params: OpenChartParams): void {
  const normalized: OpenChartParams = {
    symbol: (params.symbol || 'AAPL').toUpperCase().trim(),
    timeframe: params.timeframe || '1d',
    levels: params.levels,
    source: params.source || 'user',
  };

  activeChartTarget = normalized;

  // Notify registered callbacks
  listeners.forEach((listener) => {
    try {
      listener(normalized);
    } catch (err) {
      console.error('[ChartRouter Error]:', err);
    }
  });

  // Also dispatch browser custom event for maximum interoperability
  if (typeof window !== 'undefined' && window.dispatchEvent) {
    window.dispatchEvent(
      new CustomEvent('trullas:open-chart', {
        detail: normalized,
      })
    );
  }
}

/**
 * Returns the currently active chart target.
 */
export function getActiveChartTarget(): OpenChartParams {
  return { ...activeChartTarget };
}

/**
 * Subscribes to openChart requests.
 */
export function subscribeChartTarget(cb: ChartRouterListener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/**
 * Snapshot comparison helper ensuring that a symbol + timeframe + price
 * produces 100% identical Levels for Chart, Watchlist, and Orders.
 */
export function generateDeterministicLevelsSnapshot(
  symbol: string,
  timeframe: '1w' | '1d' | '1h',
  currentPrice: number,
  atr14: number,
  recentBars: { o: number; h: number; l: number; c: number; ts?: string }[],
  direction: 'long' | 'short' = 'long'
): Levels {
  return calculateLevels({
    symbol,
    timeframe,
    direction,
    currentPrice,
    atr14,
    recentBars,
    asOf: '2026-11-12T00:00:00.000Z', // Fixed timestamp for deterministic snapshot equality
  });
}
