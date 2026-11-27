import { evaluatePortfolioRisk, evaluateShortPutOrderRisk } from '../../src/utils/portfolioRiskEngine.ts';

export const ALPACA_PAPER_ENDPOINT = 'https://paper-api.alpaca.markets';
export const ALPACA_DATA_ENDPOINT = 'https://data.alpaca.markets';

const OCC_OPTION_REGEX = /^[A-Z]{1,6}\d{6}[CP]\d{8}$/;
const EQUITY_SYMBOL_REGEX = /^[A-Z][A-Z0-9.\-]{0,9}$/;
const FUTURES_OR_UNSUPPORTED_REGEX = /(=F$|=X$|^\/)/i;

export interface AlpacaResolvedConfig {
  configured: boolean;
  mode: 'PAPER';
  paperEndpoint: string;
  dataEndpoint: string;
  keyId?: string;
  secretKey?: string;
  paperViolation?: boolean;
  message: string;
}

export interface AlpacaAccountSummary {
  id: string;
  account_number: string;
  status: string;
  currency: string;
  cash: number;
  buying_power: number;
  options_buying_power: number;
  options_approved_level: number;
  equity: number;
  last_equity: number;
  day_pnl: number;
  day_pnl_pct: number;
  pattern_day_trader: boolean;
  trading_blocked: boolean;
  account_blocked: boolean;
  trade_suspended_by_user: boolean;
}

export interface AlpacaPositionItem {
  asset_id: string;
  symbol: string;
  asset_class: 'us_equity' | 'us_option' | string;
  qty: number;
  side: 'long' | 'short';
  avg_entry_price: number;
  current_price: number;
  market_value: number;
  cost_basis: number;
  unrealized_pl: number;
  unrealized_plpc: number;
  change_today: number;
}

export interface AlpacaOrderItem {
  id: string;
  client_order_id?: string;
  symbol: string;
  asset_class: 'us_equity' | 'us_option' | string;
  side: 'buy' | 'sell';
  qty: number;
  filled_qty: number;
  filled_avg_price: number | null;
  type: string;
  time_in_force: string;
  limit_price: number | null;
  stop_price: number | null;
  status: string;
  submitted_at: string;
  filled_at: string | null;
}

export interface AlpacaFillActivity {
  id: string;
  order_id: string;
  symbol: string;
  side: 'buy' | 'sell' | 'sell_short' | string;
  qty: number;
  price: number;
  transaction_time: string;
}

export interface AlpacaOptionContractItem {
  id: string;
  symbol: string;
  name: string;
  underlying_symbol: string;
  expiration_date: string;
  type: 'put' | 'call';
  strike_price: number;
  close_price: number | null;
  open_interest: number | null;
  tradable: boolean;
}

export interface AlpacaPortfolioEquityPoint { timestamp: number; equity: number; }

export interface AlpacaOverviewResponse {
  configured: boolean;
  mode: 'PAPER';
  paperEndpoint: string;
  paperViolation?: boolean;
  message: string;
  fetchedAt: string;
  account: AlpacaAccountSummary | null;
  positions: AlpacaPositionItem[];
  equityPositions: AlpacaPositionItem[];
  optionPositions: AlpacaPositionItem[];
  orders: AlpacaOrderItem[];
  fills: AlpacaFillActivity[];
  portfolioHistory: AlpacaPortfolioEquityPoint[];
  portfolioHistoryComplete: boolean;
  portfolioHistoryError?: string;
  fillHistoryComplete: boolean;
  fillHistoryError?: string;
  orderHistoryComplete: boolean;
  error?: string;
}

export interface AlpacaOrderRequestInput {
  symbol: string;
  side: 'buy' | 'sell';
  qty: number;
  type: 'market' | 'limit' | 'stop' | 'stop_limit';
  time_in_force?: 'day' | 'gtc';
  limit_price?: number;
  stop_price?: number;
  client_order_id?: string;
  order_class?: 'simple' | 'bracket';
  take_profit?: { limit_price: number };
  stop_loss?: { stop_price: number; limit_price?: number };
}

export type FetchLike = typeof fetch;

export interface AlpacaServiceOptions {
  env?: Record<string, string | undefined>;
  fetchImpl?: FetchLike;
}

function isPlaceholderCredential(val: string | undefined): boolean {
  if (!val) return true;
  const trimmed = val.trim();
  if (!trimmed) return true;
  return /^MY_ALPACA_/i.test(trimmed) || trimmed === 'YOUR_API_KEY' || trimmed === 'YOUR_SECRET_KEY';
}

export function isValidAlpacaPaperUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl.trim());
    return parsed.protocol === 'https:' && parsed.hostname.toLowerCase() === 'paper-api.alpaca.markets';
  } catch {
    return false;
  }
}

export function resolveAlpacaConfig(
  env: Record<string, string | undefined> = process.env
): AlpacaResolvedConfig {
  const rawBaseUrl = (env.APCA_API_BASE_URL || env.ALPACA_API_BASE_URL || ALPACA_PAPER_ENDPOINT).trim();
  const normalizedBaseUrl = rawBaseUrl.replace(/\/+$/, '');
  const dataEndpoint = (env.APCA_DATA_BASE_URL || ALPACA_DATA_ENDPOINT).trim().replace(/\/+$/, '');

  if (!isValidAlpacaPaperUrl(normalizedBaseUrl)) {
    return {
      configured: false,
      mode: 'PAPER',
      paperEndpoint: normalizedBaseUrl,
      dataEndpoint,
      paperViolation: true,
      message:
        'Live Alpaca trading endpoints are blocked. Set APCA_API_BASE_URL=https://paper-api.alpaca.markets for Paper Trading only.',
    };
  }

  const keyId = (env.APCA_API_KEY_ID || env.ALPACA_API_KEY || '').trim();
  const secretKey = (env.APCA_API_SECRET_KEY || env.ALPACA_SECRET_KEY || '').trim();

  if (isPlaceholderCredential(keyId) || isPlaceholderCredential(secretKey)) {
    return {
      configured: false,
      mode: 'PAPER',
      paperEndpoint: ALPACA_PAPER_ENDPOINT,
      dataEndpoint,
      message:
        'Alpaca Paper credentials are not configured. Set APCA_API_KEY_ID and APCA_API_SECRET_KEY in your server environment (.env).',
    };
  }

  return {
    configured: true,
    mode: 'PAPER',
    paperEndpoint: ALPACA_PAPER_ENDPOINT,
    dataEndpoint,
    keyId,
    secretKey,
    message: 'Connected to Alpaca Paper Trading (paper-api.alpaca.markets).',
  };
}

function toNum(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function toNullableNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function isOccOptionSymbol(symbol: string): boolean {
  return OCC_OPTION_REGEX.test(symbol.trim().toUpperCase());
}

export function validateOrderRequest(
  raw: Partial<AlpacaOrderRequestInput>
): { ok: true; payload: AlpacaOrderRequestInput; isOption: boolean } | { ok: false; error: string } {
  const symbol = typeof raw.symbol === 'string' ? raw.symbol.trim().toUpperCase() : '';
  if (!symbol || FUTURES_OR_UNSUPPORTED_REGEX.test(symbol)) {
    return {
      ok: false,
      error: `Invalid or unsupported Alpaca Paper symbol "${symbol || ''}". Only US equities/ETFs and OCC option contracts are tradable on Alpaca Paper.`,
    };
  }

  const isOption = isOccOptionSymbol(symbol);
  if (!isOption && !EQUITY_SYMBOL_REGEX.test(symbol)) {
    return {
      ok: false,
      error: `Symbol "${symbol}" is not a valid US equity ticker or OCC option symbol.`,
    };
  }

  const side = raw.side;
  if (side !== 'buy' && side !== 'sell') {
    return { ok: false, error: 'Order side must be "buy" or "sell".' };
  }

  const qty = Number(raw.qty);
  if (!Number.isFinite(qty) || qty <= 0) {
    return { ok: false, error: 'Order quantity must be a positive finite number.' };
  }
  if (isOption && !Number.isInteger(qty)) {
    return { ok: false, error: 'Option order contracts qty must be a whole integer.' };
  }

  const type = raw.type || 'market';
  if (!['market', 'limit', 'stop', 'stop_limit'].includes(type)) {
    return { ok: false, error: `Unsupported order type "${type}".` };
  }

  const tif = raw.time_in_force || 'day';
  if (isOption && tif !== 'day') {
    return { ok: false, error: 'Alpaca Paper option orders require time_in_force="day".' };
  }
  if (tif !== 'day' && tif !== 'gtc') {
    return { ok: false, error: `Unsupported time_in_force "${tif}".` };
  }

  if ((type === 'limit' || type === 'stop_limit') && (!Number.isFinite(Number(raw.limit_price)) || Number(raw.limit_price) <= 0)) {
    return { ok: false, error: 'Limit orders require a positive limit_price.' };
  }
  if ((type === 'stop' || type === 'stop_limit') && (!Number.isFinite(Number(raw.stop_price)) || Number(raw.stop_price) <= 0)) {
    return { ok: false, error: 'Stop orders require a positive stop_price.' };
  }

  const payload: AlpacaOrderRequestInput = {
    symbol,
    side,
    qty,
    type,
    time_in_force: tif,
  };
  if (raw.limit_price !== undefined && Number.isFinite(Number(raw.limit_price))) {
    payload.limit_price = Number(Number(raw.limit_price).toFixed(2));
  }
  if (raw.stop_price !== undefined && Number.isFinite(Number(raw.stop_price))) {
    payload.stop_price = Number(Number(raw.stop_price).toFixed(2));
  }
  if (typeof raw.client_order_id === 'string' && raw.client_order_id.trim()) {
    payload.client_order_id = raw.client_order_id.trim().slice(0, 48);
  }
  if (!isOption && raw.order_class === 'bracket') {
    payload.order_class = 'bracket';
    if (raw.take_profit && Number.isFinite(Number(raw.take_profit.limit_price))) {
      payload.take_profit = { limit_price: Number(Number(raw.take_profit.limit_price).toFixed(2)) };
    }
    if (raw.stop_loss && Number.isFinite(Number(raw.stop_loss.stop_price))) {
      payload.stop_loss = {
        stop_price: Number(Number(raw.stop_loss.stop_price).toFixed(2)),
        ...(raw.stop_loss.limit_price !== undefined && Number.isFinite(Number(raw.stop_loss.limit_price))
          ? { limit_price: Number(Number(raw.stop_loss.limit_price).toFixed(2)) }
          : {}),
      };
    }
  }

  return { ok: true, payload, isOption };
}

export class AlpacaApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function createAlpacaService(options: AlpacaServiceOptions = {}) {
  const fetchFn: FetchLike = options.fetchImpl || fetch;
  const getConfig = () => resolveAlpacaConfig(options.env ?? process.env);

  async function alpacaRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
    const cfg = getConfig();
    if (!cfg.configured || !cfg.keyId || !cfg.secretKey) {
      throw new AlpacaApiError(503, cfg.message);
    }
    const targetUrl = `${cfg.paperEndpoint}${path}`;
    if (!isValidAlpacaPaperUrl(cfg.paperEndpoint)) {
      throw new AlpacaApiError(403, 'Blocked non-Paper Alpaca endpoint.');
    }

    const res = await fetchFn(targetUrl, {
      ...init,
      headers: {
        'APCA-API-KEY-ID': cfg.keyId,
        'APCA-API-SECRET-KEY': cfg.secretKey,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
    });

    const text = await res.text();
    let parsed: any = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = { message: text };
    }

    if (!res.ok) {
      const msg = parsed?.message || parsed?.error || `Alpaca Paper API returned HTTP ${res.status}`;
      throw new AlpacaApiError(res.status, msg);
    }

    return parsed as T;
  }

  async function getStatus(verify = false) {
    const cfg = getConfig();
    if (!cfg.configured) {
      return {
        configured: false,
        mode: cfg.mode,
        paperEndpoint: cfg.paperEndpoint,
        paperViolation: Boolean(cfg.paperViolation),
        message: cfg.message,
      };
    }

    if (!verify) {
      return {
        configured: true,
        mode: cfg.mode,
        paperEndpoint: cfg.paperEndpoint,
        message: cfg.message,
      };
    }

    try {
      const acct = await alpacaRequest<any>('/v2/account');
      return {
        configured: true,
        verified: true,
        mode: cfg.mode,
        paperEndpoint: cfg.paperEndpoint,
        accountNumber: acct.account_number,
        accountStatus: acct.status,
        optionsApprovedLevel: toNum(acct.options_approved_level, 0),
        message: cfg.message,
      };
    } catch (err: any) {
      return {
        configured: true,
        verified: false,
        mode: cfg.mode,
        paperEndpoint: cfg.paperEndpoint,
        error: err?.message || 'Unable to verify Alpaca Paper credentials',
        message: cfg.message,
      };
    }
  }

  async function fetchAllOrders(): Promise<{ items: any[]; complete: boolean }> {
    const pageSize = 500;
    const maxPages = 20;
    const items: any[] = [];
    const seenCursors = new Set<string>();
    let beforeOrderId = '';

    for (let pageIndex = 0; pageIndex < maxPages; pageIndex++) {
      const cursor = beforeOrderId ? `&before_order_id=${encodeURIComponent(beforeOrderId)}` : '';
      const page = await alpacaRequest<any[]>(
        `/v2/orders?status=all&limit=${pageSize}&direction=desc${cursor}`
      );
      const rows = Array.isArray(page) ? page : [];
      items.push(...rows);
      if (rows.length < pageSize) return { items, complete: true };

      const nextCursor = String(rows[rows.length - 1]?.id || '');
      if (!nextCursor || seenCursors.has(nextCursor)) {
        return { items, complete: false };
      }
      seenCursors.add(nextCursor);
      beforeOrderId = nextCursor;
    }

    // Do not silently label a capped history as complete.
    return { items, complete: false };
  }

  async function fetchAllFillActivities(): Promise<{ items: any[]; complete: boolean }> {
    const pageSize = 100;
    const maxPages = 100;
    const items: any[] = [];
    const seenIds = new Set<string>();
    const seenCursors = new Set<string>();
    let pageToken = '';

    for (let pageIndex = 0; pageIndex < maxPages; pageIndex++) {
      const cursor = pageToken ? `&page_token=${encodeURIComponent(pageToken)}` : '';
      const page = await alpacaRequest<any[]>(
        `/v2/account/activities/FILL?page_size=${pageSize}&direction=asc${cursor}`
      );
      const rows = Array.isArray(page) ? page : [];
      for (const row of rows) {
        const id = String(row?.id || '');
        if (!id || seenIds.has(id)) continue;
        seenIds.add(id);
        items.push(row);
      }
      if (rows.length < pageSize) return { items, complete: true };

      const nextCursor = String(rows[rows.length - 1]?.id || '');
      if (!nextCursor || seenCursors.has(nextCursor)) {
        return { items, complete: false };
      }
      seenCursors.add(nextCursor);
      pageToken = nextCursor;
    }

    return { items, complete: false };
  }

  async function getOverview(): Promise<AlpacaOverviewResponse> {
    const cfg = getConfig();
    const fetchedAt = new Date().toISOString();
    if (!cfg.configured) {
      return {
        configured: false,
        mode: cfg.mode,
        paperEndpoint: cfg.paperEndpoint,
        paperViolation: Boolean(cfg.paperViolation),
        message: cfg.message,
        fetchedAt,
        account: null,
        positions: [],
        equityPositions: [],
        optionPositions: [],
        orders: [],
        fills: [],
        portfolioHistory: [],
        portfolioHistoryComplete: false,
        fillHistoryComplete: false,
        orderHistoryComplete: false,
      };
    }

    try {
      const [rawAccount, rawPositions, orderHistory, rawPortfolioHistory] = await Promise.all([
        alpacaRequest<any>('/v2/account'),
        alpacaRequest<any[]>('/v2/positions'),
        fetchAllOrders(),
        alpacaRequest<any>('/v2/account/portfolio/history?period=1A&timeframe=1D&intraday_reporting=extended_hours').catch(() => null),
      ]);
      let fillHistory: { items: any[]; complete: boolean } = { items: [], complete: false };
      let fillHistoryError: string | undefined;
      try {
        fillHistory = await fetchAllFillActivities();
      } catch (fillError) {
        // Keep account/position visibility available, but explicitly mark the
        // fill ledger as incomplete so downstream code can fall back to order averages.
        fillHistoryError = fillError instanceof Error ? fillError.message : 'Unable to retrieve Alpaca fill activities.';
      }
      const rawOrders = orderHistory.items;
      const rawFills = fillHistory.items;

      const equity = toNum(rawAccount?.equity);
      const lastEquity = toNum(rawAccount?.last_equity, equity);
      const dayPnl = Number((equity - lastEquity).toFixed(2));
      const dayPnlPct = lastEquity > 0 ? Number(((dayPnl / lastEquity) * 100).toFixed(2)) : 0;

      const account: AlpacaAccountSummary = {
        id: String(rawAccount?.id || ''),
        account_number: String(rawAccount?.account_number || ''),
        status: String(rawAccount?.status || 'UNKNOWN'),
        currency: String(rawAccount?.currency || 'USD'),
        cash: Number(toNum(rawAccount?.cash).toFixed(2)),
        buying_power: Number(toNum(rawAccount?.buying_power).toFixed(2)),
        options_buying_power: Number(toNum(rawAccount?.options_buying_power ?? rawAccount?.buying_power).toFixed(2)),
        options_approved_level: toNum(rawAccount?.options_approved_level ?? rawAccount?.options_trading_level, 0),
        equity: Number(equity.toFixed(2)),
        last_equity: Number(lastEquity.toFixed(2)),
        day_pnl: dayPnl,
        day_pnl_pct: dayPnlPct,
        pattern_day_trader: Boolean(rawAccount?.pattern_day_trader),
        trading_blocked: Boolean(rawAccount?.trading_blocked),
        account_blocked: Boolean(rawAccount?.account_blocked),
        trade_suspended_by_user: Boolean(rawAccount?.trade_suspended_by_user),
      };

      const positions: AlpacaPositionItem[] = (Array.isArray(rawPositions) ? rawPositions : []).map((p) => {
        const qtyNum = toNum(p?.qty);
        const side: 'long' | 'short' = p?.side === 'short' || qtyNum < 0 ? 'short' : 'long';
        const assetClass =
          p?.asset_class || (isOccOptionSymbol(String(p?.symbol || '')) ? 'us_option' : 'us_equity');
        return {
          asset_id: String(p?.asset_id || p?.symbol || ''),
          symbol: String(p?.symbol || '').toUpperCase(),
          asset_class: assetClass,
          qty: qtyNum,
          side,
          avg_entry_price: toNum(p?.avg_entry_price),
          current_price: toNum(p?.current_price),
          market_value: toNum(p?.market_value),
          cost_basis: toNum(p?.cost_basis),
          unrealized_pl: toNum(p?.unrealized_pl),
          unrealized_plpc: Number((toNum(p?.unrealized_plpc) * 100).toFixed(2)),
          change_today: Number((toNum(p?.change_today) * 100).toFixed(2)),
        };
      });

      const equityPositions = positions.filter((p) => p.asset_class !== 'us_option');
      const optionPositions = positions.filter((p) => p.asset_class === 'us_option');

      const orders: AlpacaOrderItem[] = (Array.isArray(rawOrders) ? rawOrders : []).map((o) => {
        const sym = String(o?.symbol || '').toUpperCase();
        const assetClass = o?.asset_class || (isOccOptionSymbol(sym) ? 'us_option' : 'us_equity');
        return {
          id: String(o?.id || ''),
          client_order_id: o?.client_order_id ? String(o.client_order_id) : undefined,
          symbol: sym,
          asset_class: assetClass,
          side: o?.side === 'sell' ? 'sell' : 'buy',
          qty: toNum(o?.qty),
          filled_qty: toNum(o?.filled_qty),
          filled_avg_price: toNullableNum(o?.filled_avg_price),
          type: String(o?.type || 'market'),
          time_in_force: String(o?.time_in_force || 'day'),
          limit_price: toNullableNum(o?.limit_price),
          stop_price: toNullableNum(o?.stop_price),
          status: String(o?.status || 'unknown'),
          submitted_at: String(o?.submitted_at || o?.created_at || ''),
          filled_at: o?.filled_at ? String(o.filled_at) : null,
        };
      });

      const historyTimestamps = Array.isArray(rawPortfolioHistory?.timestamp) ? rawPortfolioHistory.timestamp : [];
      const historyEquity = Array.isArray(rawPortfolioHistory?.equity) ? rawPortfolioHistory.equity : [];
      const portfolioHistory = historyTimestamps.map((timestamp: unknown, index: number) => ({
        timestamp: Number(timestamp),
        equity: toNum(historyEquity[index], NaN),
      })).filter((point: AlpacaPortfolioEquityPoint) =>
        Number.isFinite(point.timestamp) && Number.isFinite(point.equity) && point.equity > 0
      );

      const fills: AlpacaFillActivity[] = (Array.isArray(rawFills) ? rawFills : []).map((f) => ({
        id: String(f?.id || ''),
        order_id: String(f?.order_id || ''),
        symbol: String(f?.symbol || '').toUpperCase(),
        side: String(f?.side || 'buy'),
        qty: toNum(f?.qty),
        price: toNum(f?.price),
        transaction_time: String(f?.transaction_time || ''),
      }));

      return {
        configured: true,
        mode: cfg.mode,
        paperEndpoint: cfg.paperEndpoint,
        message: cfg.message,
        fetchedAt,
        account,
        positions,
        equityPositions,
        optionPositions,
        orders,
        fills,
        portfolioHistory,
        portfolioHistoryComplete: portfolioHistory.length >= 31,
        ...(portfolioHistory.length < 31 ? { portfolioHistoryError: 'Insufficient Alpaca daily equity history for rolling risk checks.' } : {}),
        fillHistoryComplete: fillHistory.complete,
        fillHistoryError,
        orderHistoryComplete: orderHistory.complete,
      };
    } catch (err: any) {
      return {
        configured: true,
        mode: cfg.mode,
        paperEndpoint: cfg.paperEndpoint,
        message: cfg.message,
        fetchedAt,
        account: null,
        positions: [],
        equityPositions: [],
        optionPositions: [],
        orders: [],
        fills: [],
        portfolioHistory: [],
        portfolioHistoryComplete: false,
        portfolioHistoryError: err?.message || 'Failed to retrieve Alpaca portfolio history',
        fillHistoryComplete: false,
        orderHistoryComplete: false,
        error: err?.message || 'Failed to retrieve Alpaca Paper overview',
      };
    }
  }

  async function getOptionContracts(params: {
    underlying: string;
    type?: 'put' | 'call';
    minDte?: number;
    maxDte?: number;
    maxStrike?: number;
    minStrike?: number;
    limit?: number;
  }): Promise<AlpacaOptionContractItem[]> {
    const underlying = params.underlying.trim().toUpperCase();
    if (!EQUITY_SYMBOL_REGEX.test(underlying) || FUTURES_OR_UNSUPPORTED_REGEX.test(underlying)) {
      throw new AlpacaApiError(400, `Unsupported Alpaca options underlying "${params.underlying}".`);
    }

    const now = Date.now();
    const minDte = Math.max(1, params.minDte ?? 4);
    const maxDte = Math.max(minDte + 1, params.maxDte ?? 21);
    const minDate = new Date(now + minDte * 86_400_000).toISOString().slice(0, 10);
    const maxDate = new Date(now + maxDte * 86_400_000).toISOString().slice(0, 10);

    const qs = new URLSearchParams({
      underlying_symbols: underlying,
      status: 'active',
      type: params.type === 'call' ? 'call' : 'put',
      expiration_date_gte: minDate,
      expiration_date_lte: maxDate,
      limit: String(Math.min(100, Math.max(1, params.limit ?? 40))),
    });
    if (params.maxStrike !== undefined && Number.isFinite(params.maxStrike)) {
      qs.set('strike_price_lte', String(params.maxStrike));
    }
    if (params.minStrike !== undefined && Number.isFinite(params.minStrike)) {
      qs.set('strike_price_gte', String(params.minStrike));
    }

    const json = await alpacaRequest<{ option_contracts?: any[] }>(`/v2/options/contracts?${qs.toString()}`);
    const list = Array.isArray(json?.option_contracts) ? json.option_contracts : [];
    return list
      .filter((c) => c?.tradable !== false)
      .map((c) => ({
        id: String(c.id || c.symbol),
        symbol: String(c.symbol || '').toUpperCase(),
        name: String(c.name || c.symbol || ''),
        underlying_symbol: String(c.underlying_symbol || underlying).toUpperCase(),
        expiration_date: String(c.expiration_date || ''),
        type: c.type === 'call' ? 'call' : 'put',
        strike_price: toNum(c.strike_price),
        close_price: toNullableNum(c.close_price),
        open_interest: toNullableNum(c.open_interest),
        tradable: c.tradable !== false,
      }));
  }

  async function submitOrder(rawInput: Partial<AlpacaOrderRequestInput>) {
    const validated = validateOrderRequest(rawInput);
    if (!validated.ok) {
      throw new AlpacaApiError(400, validated.error);
    }
    // The browser risk gate is advisory. Rebuild a fresh broker snapshot for every opening order.
    const isShortPutSell = validated.isOption && validated.payload.side === 'sell' && /P\\d{8}$/.test(validated.payload.symbol);
    const [rawAccount, rawPositions, rawOpenOrders, rawHistory] = await Promise.all([
      alpacaRequest<any>('/v2/account'),
      alpacaRequest<any[]>('/v2/positions'),
      alpacaRequest<any[]>('/v2/orders?status=open&limit=500&direction=desc'),
      alpacaRequest<any>('/v2/account/portfolio/history?period=1A&timeframe=1D&intraday_reporting=extended_hours'),
    ]);
    const equity = toNum(rawAccount?.equity);
    const lastEquity = toNum(rawAccount?.last_equity, equity);
    const positions = (Array.isArray(rawPositions) ? rawPositions : []).map((p) => ({
      symbol: String(p?.symbol || '').toUpperCase(), asset_class: String(p?.asset_class || ''),
      qty: toNum(p?.qty), side: String(p?.side || ''), market_value: toNum(p?.market_value),
    }));
    // Preserve risk-reducing exits even while the portfolio entry gate is halted.
    const heldPosition = positions.find((p) => p.symbol === validated.payload.symbol);
    const heldQty = Math.abs(Number(heldPosition?.qty) || 0);
    const positionSide = String(heldPosition?.side || (Number(heldPosition?.qty) < 0 ? 'short' : 'long'));
    const isRiskReducing = Boolean(
      heldPosition && heldQty > 0 &&
      ((positionSide === 'long' && validated.payload.side === 'sell') ||
       (positionSide === 'short' && validated.payload.side === 'buy')) &&
      validated.payload.qty <= heldQty
    );
    const isOpeningShortPutSell = isShortPutSell && !isRiskReducing;
    const openOrders = (Array.isArray(rawOpenOrders) ? rawOpenOrders : []).map((o) => ({
      symbol: String(o?.symbol || '').toUpperCase(), asset_class: String(o?.asset_class || ''),
      side: o?.side === 'sell' ? 'sell' as const : 'buy' as const,
      qty: toNum(o?.qty), status: String(o?.status || ''), limit_price: toNullableNum(o?.limit_price),
    }));
    if (isOpeningShortPutSell) openOrders.push({
      symbol: validated.payload.symbol, asset_class: 'us_option', side: 'sell' as const,
      qty: validated.payload.qty, status: 'new', limit_price: validated.payload.limit_price ?? null,
    });
    const timestamps = Array.isArray(rawHistory?.timestamp) ? rawHistory.timestamp : [];
    const historyValues = Array.isArray(rawHistory?.equity) ? rawHistory.equity : [];
    const equityHistory = timestamps.map((timestamp: unknown, index: number) => ({
      timestamp: Number(timestamp), equity: toNum(historyValues[index], NaN),
    })).filter((point: AlpacaPortfolioEquityPoint) =>
      Number.isFinite(point.timestamp) && Number.isFinite(point.equity) && point.equity > 0
    );
    if (!isRiskReducing) {
      const riskReport = evaluatePortfolioRisk({
        account: {
          equity, day_pnl_pct: lastEquity > 0 ? ((equity - lastEquity) / lastEquity) * 100 : NaN,
          status: String(rawAccount?.status || 'UNKNOWN'),
          trading_blocked: Boolean(rawAccount?.trading_blocked),
          account_blocked: Boolean(rawAccount?.account_blocked),
          trade_suspended_by_user: Boolean(rawAccount?.trade_suspended_by_user),
        },
        positions, openOrders, equityHistory, fetchedAt: new Date().toISOString(),
      });
      if (!riskReport.allowNewEntries) {
        throw new AlpacaApiError(409, `Portfolio risk gate ${riskReport.status}: ${riskReport.reasons.join(' ')}`);
      }
    }
    if (isOpeningShortPutSell) {
      const orderRisk = evaluateShortPutOrderRisk({
        symbol: validated.payload.symbol, contracts: validated.payload.qty,
        premiumPerShare: validated.payload.limit_price ?? 0, equity,
      });
      if (!orderRisk.allowed) throw new AlpacaApiError(409, orderRisk.reason || 'Short-put per-trade loss limit exceeded.');
    }

    const order = await alpacaRequest<any>('/v2/orders', {
      method: 'POST',
      body: JSON.stringify(validated.payload),
    });
    return {
      order,
      mode: 'PAPER' as const,
      isOption: validated.isOption,
    };
  }

  async function closePosition(
    symbol: string,
    opts: { qty?: number; percentage?: number; cancel_orders?: boolean } = {}
  ) {
    const cleanSym = symbol.trim().toUpperCase();
    if (!cleanSym) {
      throw new AlpacaApiError(400, 'Position symbol is required.');
    }
    const qs = new URLSearchParams();
    const isPartial =
      (opts.qty !== undefined && Number.isFinite(opts.qty) && opts.qty > 0) ||
      (opts.percentage !== undefined && Number.isFinite(opts.percentage) && opts.percentage > 0 && opts.percentage < 100);

    if (opts.qty !== undefined && Number.isFinite(opts.qty) && opts.qty > 0) {
      qs.set('qty', String(opts.qty));
    } else if (opts.percentage !== undefined && Number.isFinite(opts.percentage) && opts.percentage > 0 && opts.percentage < 100) {
      qs.set('percentage', String(opts.percentage));
    }

    if (opts.cancel_orders === true || (opts.cancel_orders !== false && !isPartial)) {
      qs.set('cancel_orders', 'true');
    }

    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    const order = await alpacaRequest<any>(`/v2/positions/${encodeURIComponent(cleanSym)}${suffix}`, {
      method: 'DELETE',
    });
    return { order, mode: 'PAPER' as const };
  }

  async function cancelOrder(orderId: string) {
    const cleanId = orderId.trim();
    if (!cleanId) {
      throw new AlpacaApiError(400, 'Order ID is required.');
    }
    await alpacaRequest<any>(`/v2/orders/${encodeURIComponent(cleanId)}`, {
      method: 'DELETE',
    });
    return { cancelled: true, orderId: cleanId, mode: 'PAPER' as const };
  }

  return {
    getConfig,
    getStatus,
    getOverview,
    getOptionContracts,
    submitOrder,
    closePosition,
    cancelOrder,
  };
}

export type AlpacaService = ReturnType<typeof createAlpacaService>;
