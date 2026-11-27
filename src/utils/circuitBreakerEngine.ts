/**
 * Institutional Drawdown Circuit Breaker & Pre-Trade Discipline Gate
 * Inspired by drawdown-circuit-breaker & pre-trade-discipline-gate:
 *  - Daily (2.0%), Weekly (5.0%), Monthly (8.0%) drawdown halts anchored in America/New_York time
 *  - Consecutive losing streak cooldown (24h cooldown after 2+ terminal losing closed trades)
 *  - Pre-Trade Discipline Gate (GO / REVIEW_REQUIRED / NO_GO)
 */

import type { JournalEntry } from './tradeJournal.ts';

export type CircuitBreakerStatus = 'OK' | 'CAUTION' | 'COOLDOWN' | 'HALTED';

export interface CircuitBreakerConfig {
  dailyLossLimitPct: number;
  weeklyLossLimitPct: number;
  monthlyLossLimitPct: number;
  consecutiveLossLimit: number;
  cooldownHours: number;
}

export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  dailyLossLimitPct: 2.0,
  weeklyLossLimitPct: 5.0,
  monthlyLossLimitPct: 8.0,
  consecutiveLossLimit: 2,
  cooldownHours: 24,
};

export interface DrawdownCircuitBreakerReport {
  status: CircuitBreakerStatus;
  allowNewTrades: boolean;
  sizeMultiplier: number; // 1.0 (OK), 0.5 (CAUTION), 0 (COOLDOWN/HALTED)
  etDateKey: string;
  etWeekStartKey: string;
  etMonthKey: string;
  dailyPnlUsd: number;
  dailyDrawdownPct: number;
  weeklyPnlUsd: number;
  weeklyDrawdownPct: number;
  monthlyPnlUsd: number;
  monthlyDrawdownPct: number;
  consecutiveLosses: number;
  cooldownActive: boolean;
  cooldownRemainingHours: number;
  triggers: string[];
  summary: string;
}

export type PreTradeVerdict = 'GO' | 'REVIEW_REQUIRED' | 'NO_GO';

export interface PreTradeDisciplineResult {
  verdict: PreTradeVerdict;
  passedCount: number;
  totalCount: number;
  reasons: string[];
}

export function getNewYorkCalendarKeys(now: Date = new Date()): {
  dateKey: string;
  weekStartKey: string;
  monthKey: string;
} {
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const dateKey = fmt.format(now); // YYYY-MM-DD
    const [y, m, d] = dateKey.split('-').map(Number);
    const utcMid = new Date(Date.UTC(y, m - 1, d));
    const dayOfWeek = utcMid.getUTCDay(); // 0=Sun .. 6=Sat
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(utcMid.getTime() + diffToMonday * 86_400_000);
    const weekStartKey = monday.toISOString().slice(0, 10);
    const monthKey = dateKey.slice(0, 7);
    return { dateKey, weekStartKey, monthKey };
  } catch {
    const iso = now.toISOString().slice(0, 10);
    return { dateKey: iso, weekStartKey: iso, monthKey: iso.slice(0, 7) };
  }
}

function getEntryCloseTimestampMs(entry: JournalEntry): number {
  const raw = entry.exitDate || entry.entryDate;
  if (raw) {
    const ms = Date.parse(raw.length === 10 ? `${raw}T20:00:00Z` : raw);
    if (Number.isFinite(ms)) return ms;
  }
  return Number.isFinite(entry.createdAt) ? entry.createdAt : 0;
}

export function evaluateDrawdownCircuitBreaker(
  entries: JournalEntry[],
  simCapitalUsd: number,
  now: Date = new Date(),
  partialConfig: Partial<CircuitBreakerConfig> = {}
): DrawdownCircuitBreakerReport {
  const cfg: CircuitBreakerConfig = {
    ...DEFAULT_CIRCUIT_BREAKER_CONFIG,
    ...partialConfig,
  };
  const capital = Number.isFinite(simCapitalUsd) && simCapitalUsd > 0 ? simCapitalUsd : 2000;
  const { dateKey, weekStartKey, monthKey } = getNewYorkCalendarKeys(now);

  const closed = (Array.isArray(entries) ? entries : [])
    .filter(
      (e) =>
        e &&
        e.status !== 'OPEN' &&
        typeof e.realizedPnL === 'number' &&
        Number.isFinite(e.realizedPnL)
    )
    .map((e) => {
      const closeMs = getEntryCloseTimestampMs(e);
      const closeKeys = getNewYorkCalendarKeys(new Date(closeMs));
      return {
        entry: e,
        pnl: Number(e.realizedPnL || 0),
        closeMs,
        closeDateKey: closeKeys.dateKey,
        closeMonthKey: closeKeys.monthKey,
        closeWeekStartKey: closeKeys.weekStartKey,
      };
    })
    .sort((a, b) => b.closeMs - a.closeMs);

  let dailyPnlUsd = 0;
  let weeklyPnlUsd = 0;
  let monthlyPnlUsd = 0;

  for (const row of closed) {
    if (row.closeDateKey === dateKey) dailyPnlUsd += row.pnl;
    if (row.closeWeekStartKey === weekStartKey) weeklyPnlUsd += row.pnl;
    if (row.closeMonthKey === monthKey) monthlyPnlUsd += row.pnl;
  }

  const dailyDrawdownPct = Number((Math.max(0, -dailyPnlUsd / capital) * 100).toFixed(2));
  const weeklyDrawdownPct = Number((Math.max(0, -weeklyPnlUsd / capital) * 100).toFixed(2));
  const monthlyDrawdownPct = Number((Math.max(0, -monthlyPnlUsd / capital) * 100).toFixed(2));

  // Consecutive losing streak (newest -> oldest)
  let consecutiveLosses = 0;
  let lastLossMs = 0;
  for (const row of closed) {
    const isLoss = row.entry.status === 'CLOSED_LOSS' || row.pnl < 0;
    const isBreakeven = row.entry.status === 'BREAKEVEN' && Math.abs(row.pnl) < 0.01;
    if (isLoss && !isBreakeven) {
      if (consecutiveLosses === 0) lastLossMs = row.closeMs;
      consecutiveLosses++;
    } else {
      break;
    }
  }

  const cooldownMs = cfg.cooldownHours * 3_600_000;
  const elapsedSinceLossMs = lastLossMs > 0 ? Math.max(0, now.getTime() - lastLossMs) : Infinity;
  const cooldownActive =
    consecutiveLosses >= cfg.consecutiveLossLimit && elapsedSinceLossMs < cooldownMs;
  const cooldownRemainingHours = cooldownActive
    ? Number(((cooldownMs - elapsedSinceLossMs) / 3_600_000).toFixed(1))
    : 0;

  const triggers: string[] = [];
  if (dailyDrawdownPct >= cfg.dailyLossLimitPct) {
    triggers.push(`Daily drawdown ${dailyDrawdownPct.toFixed(2)}% >= ${cfg.dailyLossLimitPct.toFixed(1)}% limit`);
  }
  if (weeklyDrawdownPct >= cfg.weeklyLossLimitPct) {
    triggers.push(`Weekly drawdown ${weeklyDrawdownPct.toFixed(2)}% >= ${cfg.weeklyLossLimitPct.toFixed(1)}% limit`);
  }
  if (monthlyDrawdownPct >= cfg.monthlyLossLimitPct) {
    triggers.push(`Monthly drawdown ${monthlyDrawdownPct.toFixed(2)}% >= ${cfg.monthlyLossLimitPct.toFixed(1)}% limit`);
  }
  if (cooldownActive) {
    triggers.push(
      `${consecutiveLosses} consecutive losses — ${cooldownRemainingHours.toFixed(1)}h cooldown active`
    );
  }

  const hasHardHalt =
    dailyDrawdownPct >= cfg.dailyLossLimitPct ||
    weeklyDrawdownPct >= cfg.weeklyLossLimitPct ||
    monthlyDrawdownPct >= cfg.monthlyLossLimitPct;

  let status: CircuitBreakerStatus = 'OK';
  let allowNewTrades = true;
  let sizeMultiplier = 1.0;

  if (hasHardHalt) {
    status = 'HALTED';
    allowNewTrades = false;
    sizeMultiplier = 0;
  } else if (cooldownActive) {
    status = 'COOLDOWN';
    allowNewTrades = false;
    sizeMultiplier = 0;
  } else if (
    dailyDrawdownPct >= cfg.dailyLossLimitPct * 0.5 ||
    weeklyDrawdownPct >= cfg.weeklyLossLimitPct * 0.5 ||
    consecutiveLosses === 1
  ) {
    status = 'CAUTION';
    sizeMultiplier = 0.5;
    if (dailyDrawdownPct >= cfg.dailyLossLimitPct * 0.5) {
      triggers.push(`Daily DD ${dailyDrawdownPct.toFixed(2)}% nearing limit (0.5x size)`);
    } else if (weeklyDrawdownPct >= cfg.weeklyLossLimitPct * 0.5) {
      triggers.push(`Weekly DD ${weeklyDrawdownPct.toFixed(2)}% nearing limit (0.5x size)`);
    }
  }

  const summary =
    triggers.length > 0
      ? triggers.join(' · ')
      : `Daily ${dailyDrawdownPct.toFixed(1)}% / Weekly ${weeklyDrawdownPct.toFixed(1)}% / Monthly ${monthlyDrawdownPct.toFixed(1)}% · Streak ${consecutiveLosses}L`;

  return {
    status,
    allowNewTrades,
    sizeMultiplier,
    etDateKey: dateKey,
    etWeekStartKey: weekStartKey,
    etMonthKey: monthKey,
    dailyPnlUsd: Number(dailyPnlUsd.toFixed(2)),
    dailyDrawdownPct,
    weeklyPnlUsd: Number(weeklyPnlUsd.toFixed(2)),
    weeklyDrawdownPct,
    monthlyPnlUsd: Number(monthlyPnlUsd.toFixed(2)),
    monthlyDrawdownPct,
    consecutiveLosses,
    cooldownActive,
    cooldownRemainingHours,
    triggers,
    summary,
  };
}

export function evaluatePreTradeDiscipline(params: {
  direction: 'long' | 'short';
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  plannedRiskUsd: number;
  maxRiskBudgetUsd: number;
  regimeName?: string;
  circuitBreaker: DrawdownCircuitBreakerReport;
}): PreTradeDisciplineResult {
  const reasons: string[] = [];
  let passedCount = 0;
  const totalCount = 5;

  // 1. Structural stop-loss validity
  const validStop =
    Number.isFinite(params.entryPrice) &&
    Number.isFinite(params.stopPrice) &&
    params.entryPrice > 0 &&
    params.stopPrice > 0 &&
    (params.direction === 'long'
      ? params.stopPrice < params.entryPrice
      : params.stopPrice > params.entryPrice);
  if (validStop) passedCount++;
  else reasons.push('Stop loss missing or on wrong side of entry');

  // 2. Risk within trade budget
  const validRisk =
    params.plannedRiskUsd > 0 &&
    params.maxRiskBudgetUsd > 0 &&
    params.plannedRiskUsd <= params.maxRiskBudgetUsd * 1.05;
  if (validRisk) passedCount++;
  else reasons.push(`Planned risk $${params.plannedRiskUsd.toFixed(2)} exceeds budget $${params.maxRiskBudgetUsd.toFixed(2)}`);

  // 3. Asymmetric Reward:Risk (>= 1.5R)
  const riskUnit = Math.abs(params.entryPrice - params.stopPrice);
  const rewardUnit = Math.abs(params.targetPrice - params.entryPrice);
  const rr = riskUnit > 0 ? rewardUnit / riskUnit : 0;
  if (rr >= 1.5) passedCount++;
  else reasons.push(`Reward:Risk ${rr.toFixed(2)} below 1.5R minimum`);

  // 4. Regime directional alignment
  const regimeConflict = params.regimeName === 'Risk-off' && params.direction === 'long';
  if (!regimeConflict) passedCount++;
  else reasons.push('Long setup violates Risk-off market regime');

  // 5. Circuit breaker clear
  const cbClear =
    params.circuitBreaker.status !== 'HALTED' && params.circuitBreaker.status !== 'COOLDOWN';
  if (cbClear) passedCount++;
  else reasons.push(`Circuit Breaker ${params.circuitBreaker.status}: ${params.circuitBreaker.summary}`);

  let verdict: PreTradeVerdict = 'GO';
  if (!cbClear || !validStop || regimeConflict || !validRisk) {
    verdict = 'NO_GO';
  } else if (rr < 1.5 || params.circuitBreaker.status === 'CAUTION') {
    verdict = 'REVIEW_REQUIRED';
  }

  return {
    verdict,
    passedCount,
    totalCount,
    reasons,
  };
}
