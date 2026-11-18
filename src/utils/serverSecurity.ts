/**
 * Server boundary validation and sanitization utilities.
 * Prevents shell-injection and malformed upstream parameter abuse across /api/* routes.
 */

export const MAX_PYTHON_TICKERS = 25;
const VALID_TICKER_RE = /^[A-Z0-9.\-^=]{1,16}$/;

export type TickerSanitizeResult =
  | { ok: true; tickers: string[] }
  | { ok: false; error: string };

export function sanitizePythonTickers(
  rawTickers: unknown,
  fallback: string[] = ['AAPL', 'MSFT', 'BTC-USD']
): TickerSanitizeResult {
  if (rawTickers === undefined || rawTickers === null) {
    return { ok: true, tickers: [...fallback] };
  }

  if (!Array.isArray(rawTickers)) {
    return { ok: false, error: 'tickers must be an array of ticker symbols.' };
  }

  if (rawTickers.length === 0) {
    return { ok: false, error: 'tickers array cannot be empty.' };
  }

  if (rawTickers.length > MAX_PYTHON_TICKERS) {
    return {
      ok: false,
      error: `Too many tickers requested (max ${MAX_PYTHON_TICKERS}).`,
    };
  }

  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const item of rawTickers) {
    if (typeof item !== 'string') {
      return { ok: false, error: 'Each ticker must be a non-empty string.' };
    }
    const sym = item.trim().toUpperCase();
    if (!VALID_TICKER_RE.test(sym)) {
      return {
        ok: false,
        error: `Invalid ticker symbol "${item}". Allowed characters: A-Z, 0-9, ., -, ^, = (max 16 chars).`,
      };
    }
    if (!seen.has(sym)) {
      seen.add(sym);
      normalized.push(sym);
    }
  }

  return { ok: true, tickers: normalized };
}

export interface BacktestNumericInput {
  initialBalance: number;
  riskPerTradePct: number;
  minQualityScore: number;
}

export type BacktestValidationResult =
  | { ok: true; values: BacktestNumericInput }
  | { ok: false; error: string };

export function validateBacktestParams(raw: {
  initialBalance?: unknown;
  riskPerTradePct?: unknown;
  minQualityScore?: unknown;
}): BacktestValidationResult {
  const initialBalance = Number(raw.initialBalance ?? 10000);
  const riskPerTradePct = Number(raw.riskPerTradePct ?? 1.5);
  const minQualityScore = Number(raw.minQualityScore ?? 55);

  if (!Number.isFinite(initialBalance) || initialBalance < 100 || initialBalance > 100_000_000) {
    return { ok: false, error: 'initialBalance must be between 100 and 100,000,000.' };
  }
  if (!Number.isFinite(riskPerTradePct) || riskPerTradePct <= 0 || riskPerTradePct > 25) {
    return { ok: false, error: 'riskPerTradePct must be between 0 (exclusive) and 25.' };
  }
  if (!Number.isFinite(minQualityScore) || minQualityScore < 0 || minQualityScore > 100) {
    return { ok: false, error: 'minQualityScore must be between 0 and 100.' };
  }

  return {
    ok: true,
    values: { initialBalance, riskPerTradePct, minQualityScore },
  };
}
