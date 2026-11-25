import type { JournalEntry } from './tradeJournal';
import type { MarketHealthReport } from './marketHealthEngine';
import {
  backfillEntryMarketContextFromHistory,
  lookupEntryMarketContextSnapshot,
  type EntryMarketContext,
} from './entryMarketContext';

export interface RuleAttributionRow {
  rule: string;
  trades: number;
  wins: number;
  losses: number;
  breakevens: number;
  winRatePct: number;
  grossPnl: number;
  feeDragDollars: number;
  netPnl: number;
  avgRealizedR: number | null;
  expectancyDollars: number;
  sampleSufficient: boolean; // >= 10 closed trades for statistical reliability
}

export interface RegimeAttributionRow {
  regime: string;
  trades: number;
  wins: number;
  losses: number;
  winRatePct: number;
  avgRealizedR: number | null;
  expectancyDollars: number;
  netPnl: number;
  avgVix: number | null;
  shrunkMultiplier: number; // Empirical Bayes K=8 toward 1.0x
  sampleSufficient: boolean;
}

export interface JournalAttributionSummary {
  closedTrades: number;
  wins: number;
  losses: number;
  winRatePct: number;
  totalNetPnl: number;
  avgMfePct: number | null;
  avgMaePct: number | null;
  bySetup: RuleAttributionRow[];
}

export interface AttributableBacktestTrade {
  status: 'win' | 'loss' | 'breakeven' | 'open';
  setupType: string;
  rulesFired?: string[];
  grossPnl?: number;
  feeAndSlippageDollars?: number;
  netPnl: number;
  realizedR: number;
}

/**
 * Aggregates closed backtest trades by setup & confluence rule tag (`rulesFired`).
 * Enforces `sampleSufficient` (n >= 10) so small samples are clearly flagged.
 */
export function computeBacktestRuleAttribution(
  trades: AttributableBacktestTrade[]
): RuleAttributionRow[] {
  const closed = trades.filter((t) => t.status !== 'open');
  if (closed.length === 0) return [];

  const acc = new Map<
    string,
    {
      trades: number;
      wins: number;
      losses: number;
      breakevens: number;
      grossPnl: number;
      feeDrag: number;
      netPnl: number;
      rSum: number;
      rCount: number;
    }
  >();

  for (const t of closed) {
    const tags =
      Array.isArray(t.rulesFired) && t.rulesFired.length > 0
        ? Array.from(new Set(t.rulesFired))
        : [t.setupType];

    const fee = typeof t.feeAndSlippageDollars === 'number' ? t.feeAndSlippageDollars : 0;
    const gross = typeof t.grossPnl === 'number' ? t.grossPnl : t.netPnl + fee;

    for (const rule of tags) {
      const cur = acc.get(rule) || {
        trades: 0,
        wins: 0,
        losses: 0,
        breakevens: 0,
        grossPnl: 0,
        feeDrag: 0,
        netPnl: 0,
        rSum: 0,
        rCount: 0,
      };
      cur.trades += 1;
      if (t.status === 'win') cur.wins += 1;
      else if (t.status === 'loss') cur.losses += 1;
      else cur.breakevens += 1;

      cur.grossPnl += gross;
      cur.feeDrag += fee;
      cur.netPnl += t.netPnl;
      if (Number.isFinite(t.realizedR)) {
        cur.rSum += t.realizedR;
        cur.rCount += 1;
      }
      acc.set(rule, cur);
    }
  }

  return Array.from(acc.entries())
    .map(([rule, s]) => ({
      rule,
      trades: s.trades,
      wins: s.wins,
      losses: s.losses,
      breakevens: s.breakevens,
      winRatePct: s.trades > 0 ? Number(((s.wins / s.trades) * 100).toFixed(1)) : 0,
      grossPnl: Number(s.grossPnl.toFixed(2)),
      feeDragDollars: Number(s.feeDrag.toFixed(2)),
      netPnl: Number(s.netPnl.toFixed(2)),
      avgRealizedR: s.rCount > 0 ? Number((s.rSum / s.rCount).toFixed(2)) : null,
      expectancyDollars: s.trades > 0 ? Number((s.netPnl / s.trades).toFixed(2)) : 0,
      sampleSufficient: s.trades >= 10,
    }))
    .sort((a, b) => {
      if (b.trades !== a.trades) return b.trades - a.trades;
      return b.netPnl - a.netPnl;
    });
}

/**
 * Aggregates real closed Local Trade Journal entries by setupType & MFE/MAE excursions.
 */
export function computeJournalRuleAttribution(
  entries: JournalEntry[]
): JournalAttributionSummary {
  const closed = entries.filter((e) => e.status !== 'OPEN');
  if (closed.length === 0) {
    return {
      closedTrades: 0,
      wins: 0,
      losses: 0,
      winRatePct: 0,
      totalNetPnl: 0,
      avgMfePct: null,
      avgMaePct: null,
      bySetup: [],
    };
  }

  let wins = 0;
  let losses = 0;
  let totalNetPnl = 0;
  let mfeSum = 0;
  let mfeCount = 0;
  let maeSum = 0;
  let maeCount = 0;

  const bySetupMap = new Map<
    string,
    {
      trades: number;
      wins: number;
      losses: number;
      breakevens: number;
      netPnl: number;
      rSum: number;
      rCount: number;
    }
  >();

  for (const e of closed) {
    const pnl = typeof e.realizedPnL === 'number' && Number.isFinite(e.realizedPnL) ? e.realizedPnL : 0;
    totalNetPnl += pnl;
    const isWin = e.status === 'CLOSED_WIN' || (e.status !== 'CLOSED_LOSS' && pnl > 0);
    const isLoss = e.status === 'CLOSED_LOSS' || (e.status !== 'CLOSED_WIN' && pnl < 0);
    if (isWin) wins += 1;
    else if (isLoss) losses += 1;

    if (typeof e.maxFavorableExcursionPct === 'number' && Number.isFinite(e.maxFavorableExcursionPct)) {
      mfeSum += e.maxFavorableExcursionPct;
      mfeCount += 1;
    }
    if (typeof e.drawdownFromPeakPct === 'number' && Number.isFinite(e.drawdownFromPeakPct)) {
      maeSum += Math.abs(e.drawdownFromPeakPct);
      maeCount += 1;
    }

    const riskPerUnit = Math.abs((e.entryPrice || 0) - (e.stopLoss || 0));
    const plannedDollarRisk = riskPerUnit * (e.quantity || 0);
    const rVal = plannedDollarRisk > 0 ? pnl / plannedDollarRisk : null;

    const ruleKey = (e.setupType || 'MANUAL').trim() || 'MANUAL';
    const cur = bySetupMap.get(ruleKey) || {
      trades: 0,
      wins: 0,
      losses: 0,
      breakevens: 0,
      netPnl: 0,
      rSum: 0,
      rCount: 0,
    };
    cur.trades += 1;
    if (isWin) cur.wins += 1;
    else if (isLoss) cur.losses += 1;
    else cur.breakevens += 1;
    cur.netPnl += pnl;
    if (rVal !== null && Number.isFinite(rVal)) {
      cur.rSum += rVal;
      cur.rCount += 1;
    }
    bySetupMap.set(ruleKey, cur);
  }

  const bySetup: RuleAttributionRow[] = Array.from(bySetupMap.entries())
    .map(([rule, s]) => ({
      rule,
      trades: s.trades,
      wins: s.wins,
      losses: s.losses,
      breakevens: s.breakevens,
      winRatePct: s.trades > 0 ? Number(((s.wins / s.trades) * 100).toFixed(1)) : 0,
      grossPnl: Number(s.netPnl.toFixed(2)),
      feeDragDollars: 0,
      netPnl: Number(s.netPnl.toFixed(2)),
      avgRealizedR: s.rCount > 0 ? Number((s.rSum / s.rCount).toFixed(2)) : null,
      expectancyDollars: s.trades > 0 ? Number((s.netPnl / s.trades).toFixed(2)) : 0,
      sampleSufficient: s.trades >= 10,
    }))
    .sort((a, b) => b.trades - a.trades || b.netPnl - a.netPnl);

  return {
    closedTrades: closed.length,
    wins,
    losses,
    winRatePct: Number(((wins / closed.length) * 100).toFixed(1)),
    totalNetPnl: Number(totalNetPnl.toFixed(2)),
    avgMfePct: mfeCount > 0 ? Number((mfeSum / mfeCount).toFixed(2)) : null,
    avgMaePct: maeCount > 0 ? Number((maeSum / maeCount).toFixed(2)) : null,
    bySetup,
  };
}

/**
 * Aggregates closed journal entries by Market Sentiment Regime at entry (`entryMarketContext`),
 * falling back cleanly to `MarketHealthReport.history1M` backfill by `entryDate` when available.
 */
export function computeJournalRegimeAttribution(
  entries: JournalEntry[],
  marketHealth?: MarketHealthReport | null
): RegimeAttributionRow[] {
  const closed = entries.filter((e) => e.status !== 'OPEN');
  if (closed.length === 0) return [];

  const buckets = new Map<
    string,
    {
      trades: number;
      wins: number;
      losses: number;
      netPnl: number;
      rSum: number;
      rCount: number;
      vixSum: number;
      vixCount: number;
    }
  >();

  for (const e of closed) {
    const openOrderTag = e.tags?.find((t) => t.startsWith('alpaca-order:'))?.slice('alpaca-order:'.length);
    const isOption = e.tags?.includes('Alpaca Options') || e.symbol.length > 10;
    const multiplier = isOption ? 100 : 1;
    const riskPerUnit = Math.abs((e.entryPrice || 0) - (e.stopLoss || 0));
    const plannedDollarRisk = riskPerUnit * (e.quantity || 0) * multiplier;

    let ctx: EntryMarketContext | null =
      e.entryMarketContext ||
      lookupEntryMarketContextSnapshot({
        orderId: openOrderTag,
        symbol: e.symbol,
        entryDate: e.entryDate,
      });

    if (!ctx && marketHealth) {
      ctx = backfillEntryMarketContextFromHistory(e.entryDate, marketHealth, {
        initialRiskDollars: plannedDollarRisk > 0 ? plannedDollarRisk : null,
        assetMode: isOption ? 'OPTIONS' : 'EQUITY',
      });
    }

    const regimeKey = ctx?.sentimentLabel || 'Unattributed';
    const pnl = typeof e.realizedPnL === 'number' && Number.isFinite(e.realizedPnL) ? e.realizedPnL : 0;
    const isWin = e.status === 'CLOSED_WIN' || (e.status !== 'CLOSED_LOSS' && pnl > 0);
    const isLoss = e.status === 'CLOSED_LOSS' || (e.status !== 'CLOSED_WIN' && pnl < 0);
    const riskDenom = ctx?.initialRiskDollars && ctx.initialRiskDollars > 0 ? ctx.initialRiskDollars : plannedDollarRisk;
    const rVal = riskDenom > 0 ? pnl / riskDenom : null;

    const acc = buckets.get(regimeKey) || {
      trades: 0,
      wins: 0,
      losses: 0,
      netPnl: 0,
      rSum: 0,
      rCount: 0,
      vixSum: 0,
      vixCount: 0,
    };
    acc.trades += 1;
    if (isWin) acc.wins += 1;
    else if (isLoss) acc.losses += 1;
    acc.netPnl += pnl;
    if (rVal !== null && Number.isFinite(rVal)) {
      acc.rSum += rVal;
      acc.rCount += 1;
    }
    if (ctx?.vix !== null && ctx?.vix !== undefined && Number.isFinite(ctx.vix)) {
      acc.vixSum += ctx.vix;
      acc.vixCount += 1;
    }
    buckets.set(regimeKey, acc);
  }

  const ORDER = ['Extreme Fear', 'Fear', 'Neutral', 'Greed', 'Extreme Greed', 'Unattributed'];
  const PRIOR_K = 8;

  return Array.from(buckets.entries())
    .map(([regime, s]) => {
      const wrFrac = s.trades > 0 ? s.wins / s.trades : 0.5;
      const avgR = s.rCount > 0 ? s.rSum / s.rCount : null;
      const rawFactor = Math.max(
        0.4,
        Math.min(1.65, 1.0 + (wrFrac - 0.5) * 0.7 + (avgR !== null ? Math.max(-0.45, Math.min(0.5, avgR * 0.25)) : 0))
      );
      const shrunkMultiplier =
        regime === 'Unattributed'
          ? 1.0
          : Number(Math.max(0.55, Math.min(1.45, (s.trades * rawFactor + PRIOR_K * 1.0) / (s.trades + PRIOR_K))).toFixed(2));

      return {
        regime,
        trades: s.trades,
        wins: s.wins,
        losses: s.losses,
        winRatePct: s.trades > 0 ? Number(((s.wins / s.trades) * 100).toFixed(1)) : 0,
        avgRealizedR: avgR !== null ? Number(avgR.toFixed(2)) : null,
        expectancyDollars: s.trades > 0 ? Number((s.netPnl / s.trades).toFixed(2)) : 0,
        netPnl: Number(s.netPnl.toFixed(2)),
        avgVix: s.vixCount > 0 ? Number((s.vixSum / s.vixCount).toFixed(1)) : null,
        shrunkMultiplier,
        sampleSufficient: s.trades >= 10,
      };
    })
    .sort((a, b) => {
      const ia = ORDER.indexOf(a.regime);
      const ib = ORDER.indexOf(b.regime);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return b.trades - a.trades;
    });
}
