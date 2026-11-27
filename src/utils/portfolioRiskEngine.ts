export interface PortfolioRiskAccount {
  equity: number;
  day_pnl_pct: number;
  status?: string;
  trading_blocked?: boolean;
  account_blocked?: boolean;
  trade_suspended_by_user?: boolean;
  options_buying_power?: number;
}

export interface PortfolioEquityPoint {
  timestamp: number;
  equity: number;
}

export interface PortfolioRiskPosition {
  symbol: string;
  asset_class?: string;
  qty: number;
  side?: 'long' | 'short' | string;
  market_value: number;
}

export interface PortfolioRiskOrder {
  symbol: string;
  asset_class?: string;
  side: 'buy' | 'sell';
  qty: number;
  status: string;
  limit_price?: number | null;
}

export interface PortfolioRiskLimits {
  dailyLossLimitPct: number;
  weeklyLossLimitPct: number;
  monthlyLossLimitPct: number;
  maxGrossExposurePct: number;
  maxShortPutCollateralPct: number;
  maxSingleOptionLossPct: number;
  maxHistoryAgeMs: number;
}

export const DEFAULT_PORTFOLIO_RISK_LIMITS: PortfolioRiskLimits = {
  dailyLossLimitPct: 2,
  weeklyLossLimitPct: 5,
  monthlyLossLimitPct: 8,
  maxGrossExposurePct: 150,
  maxShortPutCollateralPct: 50,
  maxSingleOptionLossPct: 1,
  maxHistoryAgeMs: 90_000,
};

export interface PortfolioRiskReport {
  allowNewEntries: boolean;
  status: 'OK' | 'CAUTION' | 'HALTED' | 'DATA_INVALID';
  equity: number;
  dailyDrawdownPct: number;
  weeklyDrawdownPct: number | null;
  monthlyDrawdownPct: number | null;
  grossExposureUsd: number;
  grossExposurePct: number;
  shortPutCollateralUsd: number;
  shortPutCollateralPct: number;
  reasons: string[];
  evaluatedAt: string;
}

function finitePositive(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function baselineAtOrBefore(points: PortfolioEquityPoint[], cutoffMs: number): number | null {
  const eligible = points
    .filter((p) => Number.isFinite(p.timestamp) && p.timestamp * 1000 <= cutoffMs)
    .sort((a, b) => b.timestamp - a.timestamp);
  return eligible.length ? finitePositive(eligible[0].equity) : null;
}

function parseShortPutCollateral(position: PortfolioRiskPosition): number {
  const symbol = String(position.symbol || '').toUpperCase();
  const match = symbol.match(/^[A-Z]{1,6}(\d{6})P(\d{8})$/);
  const isShort = position.side === 'short' || Number(position.qty) < 0;
  if (!match || !isShort) return 0;
  const strike = Number(match[2]) / 1000;
  const contracts = Math.abs(Number(position.qty));
  return Number.isFinite(strike) && Number.isFinite(contracts) ? strike * 100 * contracts : 0;
}

export function evaluatePortfolioRisk(params: {
  account: PortfolioRiskAccount | null | undefined;
  positions: PortfolioRiskPosition[];
  openOrders: PortfolioRiskOrder[];
  equityHistory: PortfolioEquityPoint[];
  fetchedAt: string;
  now?: Date;
  limits?: Partial<PortfolioRiskLimits>;
}): PortfolioRiskReport {
  const limits = { ...DEFAULT_PORTFOLIO_RISK_LIMITS, ...(params.limits || {}) };
  const now = params.now || new Date();
  const equity = finitePositive(params.account?.equity) ?? 0;
  const reasons: string[] = [];
  const ageMs = Date.parse(params.fetchedAt) >= 0 ? now.getTime() - Date.parse(params.fetchedAt) : Infinity;

  if (!params.account || equity <= 0) reasons.push('Broker account equity is missing or invalid.');
  if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > limits.maxHistoryAgeMs) {
    reasons.push('Broker overview is stale; refresh account and positions before opening risk.');
  }
  if (!params.account || !Number.isFinite(params.account.day_pnl_pct)) {
    reasons.push('Daily broker P&L is unavailable.');
  }
  if (params.account?.status && params.account.status !== 'ACTIVE') {
    reasons.push(`Broker account status is ${params.account.status}; new entries are disabled.`);
  }
  if (params.account?.trading_blocked || params.account?.account_blocked || params.account?.trade_suspended_by_user) {
    reasons.push('Broker account trading is blocked or suspended.');
  }

  const dailyDrawdownPct = Math.max(0, -(Number(params.account?.day_pnl_pct) || 0));
  if (dailyDrawdownPct >= limits.dailyLossLimitPct) {
    reasons.push(`Daily drawdown ${dailyDrawdownPct.toFixed(2)}% reached ${limits.dailyLossLimitPct}% limit.`);
  }

  const history = Array.isArray(params.equityHistory) ? params.equityHistory : [];
  const weekBaseline = baselineAtOrBefore(history, now.getTime() - 7 * 86_400_000);
  const monthBaseline = baselineAtOrBefore(history, now.getTime() - 30 * 86_400_000);
  const weeklyDrawdownPct = weekBaseline && equity > 0
    ? Number((Math.max(0, (weekBaseline - equity) / weekBaseline) * 100).toFixed(2))
    : null;
  const monthlyDrawdownPct = monthBaseline && equity > 0
    ? Number((Math.max(0, (monthBaseline - equity) / monthBaseline) * 100).toFixed(2))
    : null;

  if (weeklyDrawdownPct === null) reasons.push('Weekly equity baseline unavailable; fail-closed for new entries.');
  else if (weeklyDrawdownPct >= limits.weeklyLossLimitPct) reasons.push(`Weekly drawdown ${weeklyDrawdownPct.toFixed(2)}% reached ${limits.weeklyLossLimitPct}% limit.`);
  if (monthlyDrawdownPct === null) reasons.push('Monthly equity baseline unavailable; fail-closed for new entries.');
  else if (monthlyDrawdownPct >= limits.monthlyLossLimitPct) reasons.push(`Monthly drawdown ${monthlyDrawdownPct.toFixed(2)}% reached ${limits.monthlyLossLimitPct}% limit.`);

  const positions = Array.isArray(params.positions) ? params.positions : [];
  const openOrders = (Array.isArray(params.openOrders) ? params.openOrders : [])
    .filter((o) => ['new', 'accepted', 'pending_new', 'partially_filled', 'held', 'pending_replace'].includes(String(o.status).toLowerCase()));
  const positionExposure = positions.reduce((sum, p) => sum + Math.abs(Number(p.market_value) || 0), 0);
  const pendingExposure = openOrders.reduce((sum, o) => {
    const isOption = o.asset_class === 'us_option' || /^[A-Z]{1,6}\d{6}[CP]\d{8}$/.test(String(o.symbol || '').toUpperCase());
    if (!isOption) return sum;
    const m = String(o.symbol || '').toUpperCase().match(/^[A-Z]{1,6}(\d{6})P(\d{8})$/);
    if (o.side !== 'sell' || !m) return sum;
    return sum + (Number(m[2]) / 1000) * 100 * Math.max(0, Number(o.qty) || 0);
  }, 0);
  const shortPutCollateralUsd = positions.reduce((sum, p) => sum + parseShortPutCollateral(p), 0) + pendingExposure;
  const grossExposureUsd = positionExposure + pendingExposure;
  const grossExposurePct = equity > 0 ? (grossExposureUsd / equity) * 100 : 0;
  const shortPutCollateralPct = equity > 0 ? (shortPutCollateralUsd / equity) * 100 : 0;

  if (grossExposurePct >= limits.maxGrossExposurePct) {
    reasons.push(`Gross exposure ${grossExposurePct.toFixed(1)}% reached ${limits.maxGrossExposurePct}% cap.`);
  }
  if (shortPutCollateralPct >= limits.maxShortPutCollateralPct) {
    reasons.push(`Cash-secured put collateral ${shortPutCollateralPct.toFixed(1)}% reached ${limits.maxShortPutCollateralPct}% equity cap.`);
  }

  const hardHalt = reasons.length > 0;
  const nearLimit = dailyDrawdownPct >= limits.dailyLossLimitPct * 0.75 ||
    (weeklyDrawdownPct !== null && weeklyDrawdownPct >= limits.weeklyLossLimitPct * 0.75) ||
    (monthlyDrawdownPct !== null && monthlyDrawdownPct >= limits.monthlyLossLimitPct * 0.75) ||
    grossExposurePct >= limits.maxGrossExposurePct * 0.9 ||
    shortPutCollateralPct >= limits.maxShortPutCollateralPct * 0.9;

  return {
    allowNewEntries: !hardHalt,
    status: hardHalt ? (reasons.some((r) => r.includes('unavailable') || r.includes('stale') || r.includes('invalid')) ? 'DATA_INVALID' : 'HALTED') : nearLimit ? 'CAUTION' : 'OK',
    equity,
    dailyDrawdownPct: Number(dailyDrawdownPct.toFixed(2)),
    weeklyDrawdownPct,
    monthlyDrawdownPct,
    grossExposureUsd: Number(grossExposureUsd.toFixed(2)),
    grossExposurePct: Number(grossExposurePct.toFixed(2)),
    shortPutCollateralUsd: Number(shortPutCollateralUsd.toFixed(2)),
    shortPutCollateralPct: Number(shortPutCollateralPct.toFixed(2)),
    reasons,
    evaluatedAt: now.toISOString(),
  };
}

export function evaluateShortPutOrderRisk(params: {
  symbol: string;
  contracts: number;
  premiumPerShare: number;
  equity: number;
  maxSingleOptionLossPct?: number;
}): { allowed: boolean; maxLossUsd: number; maxLossPct: number; reason?: string } {
  const match = String(params.symbol || '').toUpperCase().match(/^[A-Z]{1,6}\d{6}P(\d{8})$/);
  const strike = match ? Number(match[1]) / 1000 : 0;
  const contracts = Number(params.contracts);
  const premium = Number(params.premiumPerShare);
  const equity = finitePositive(params.equity) ?? 0;
  if (!match || !Number.isInteger(contracts) || contracts <= 0 || !Number.isFinite(premium) || premium < 0 || equity <= 0) {
    return { allowed: false, maxLossUsd: 0, maxLossPct: 0, reason: 'Invalid short-put risk inputs.' };
  }
  const maxLossUsd = Math.max(0, strike * 100 * contracts - premium * 100 * contracts);
  const maxLossPct = (maxLossUsd / equity) * 100;
  const limit = params.maxSingleOptionLossPct ?? DEFAULT_PORTFOLIO_RISK_LIMITS.maxSingleOptionLossPct;
  return {
    allowed: maxLossPct <= limit,
    maxLossUsd: Number(maxLossUsd.toFixed(2)),
    maxLossPct: Number(maxLossPct.toFixed(2)),
    ...(maxLossPct > limit ? { reason: `Worst-case short-put loss ${maxLossPct.toFixed(2)}% exceeds ${limit}% equity per-trade limit.` } : {}),
  };
}

/** One in-tab lock shared by the equity and options automation managers. */
let activeCycleOwner: string | null = null;
export function acquirePortfolioCycleLock(owner: string): (() => void) | null {
  if (activeCycleOwner) return null;
  activeCycleOwner = owner;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (activeCycleOwner === owner) activeCycleOwner = null;
  };
}
