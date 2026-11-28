import type { AlpacaOptionSnapshotItem } from './alpaca.ts';

export function validateShortPutEntryQuote(
  quote: AlpacaOptionSnapshotItem | undefined,
  limitPrice: number | null | undefined,
): string | null {
  if (!quote || quote.quoteStatus !== 'FRESH' || !quote.isUsable) {
    return 'A fresh, valid OPRA option quote is required for a short-put entry.';
  }
  if (quote.bidPrice === null || quote.askPrice === null ||
      quote.bidPrice <= 0 || quote.askPrice < quote.bidPrice ||
      quote.bidSize <= 0 || quote.askSize <= 0) {
    return 'The option NBBO is invalid or has no displayed size.';
  }
  if (quote.spreadPercent === null || quote.spreadPercent > 20) {
    return 'The option bid/ask spread exceeds the 20% entry limit.';
  }
  if (quote.delta === null || Math.abs(quote.delta) < 0.08 || Math.abs(quote.delta) > 0.16) {
    return 'The option delta must be between 0.08 and 0.16 absolute value.';
  }
  if (limitPrice === null || limitPrice === undefined ||
      !Number.isFinite(limitPrice) || limitPrice < quote.bidPrice || limitPrice > quote.askPrice) {
    return 'Short-put entries require a limit price inside the current option NBBO.';
  }
  return null;
}
