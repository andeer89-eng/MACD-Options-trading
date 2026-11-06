/**
 * Data Fetching Utilities for S&P 500 Universe and Tickers.
 * Ensures deduplication of symbols, share-class normalization (e.g. BRK.B -> BRK-B),
 * and prevents redundant parallel API queries.
 */

/**
 * Normalizes ticker symbols for Yahoo Finance and external market APIs.
 * Converts dot-notated share classes to hyphen notation:
 * - BRK.B -> BRK-B
 * - BF.B -> BF-B
 * Also trims and standardizes casing.
 */
export function normalizeSymbolForYahoo(symbol: string): string {
  if (!symbol) return '';
  const clean = symbol.trim().toUpperCase();

  // Known international exchange suffixes on Yahoo Finance (must preserve dot notation):
  // .ST (Stockholm), .L (London), .DE (XETRA), .PA (Paris), .AS (Amsterdam),
  // .TO/.V (Toronto), .AX (Australia), .HK (Hong Kong), .CO (Copenhagen),
  // .HE (Helsinki), .OL (Oslo), .SW (Swiss), .MI (Milan), .MC (Madrid), etc.
  if (/\.(ST|L|DE|PA|AS|TO|V|AX|HK|CO|HE|OL|SW|MI|MC|SS|SZ|T|SA|MX|JO)$/i.test(clean)) {
    return clean;
  }

  // Only standard US equities dual-share classes use hyphens on Yahoo (e.g. BRK.B -> BRK-B, BF.B -> BF-B)
  if (/\.[A-Z]$/.test(clean)) {
    return clean.replace(/\./g, '-');
  }

  return clean;
}

/**
 * Normalizes ticker symbols back to S&P 500 standard format.
 * - BRK-B -> BRK.B
 * - BF-B -> BF.B
 */
export function normalizeSymbolForDisplay(symbol: string): string {
  if (!symbol) return '';
  const clean = symbol.trim().toUpperCase();
  if (clean === 'BRK-B' || clean === 'BRK.B') return 'BRK.B';
  if (clean === 'BF-B' || clean === 'BF.B') return 'BF.B';
  return clean;
}

/**
 * Deduplicates and canonicalizes an array of ticker symbols.
 * Handles:
 * - Case insensitivity (e.g., 'aapl' and 'AAPL')
 * - Duplicate share classes (e.g. 'BRK.B' and 'BRK-B' resolve to a single query symbol)
 * - Leading/trailing whitespace
 * - Empty/null values
 */
export function deduplicateSymbols(tickers: string[]): string[] {
  if (!Array.isArray(tickers)) return [];
  const seenCanonical = new Set<string>();
  const uniqueList: string[] = [];

  for (const raw of tickers) {
    if (!raw || typeof raw !== 'string') continue;
    const trimmed = raw.trim().toUpperCase();
    if (!trimmed) continue;

    // Use Yahoo-normalized form as canonical key
    const canonicalKey = normalizeSymbolForYahoo(trimmed);
    if (!seenCanonical.has(canonicalKey)) {
      seenCanonical.add(canonicalKey);
      // Keep original display format if it was dot-notation like BRK.B, else keep trimmed
      uniqueList.push(trimmed);
    }
  }

  return uniqueList;
}

/**
 * Generates a stable composite key in the format: symbol-timestamp-index
 * Used across lists to completely avoid React duplicate key warnings.
 */
export function generateCompositeKey(
  symbol: string,
  timestamp: number | string,
  index: number | string
): string {
  const sym = (symbol || 'TICKER').trim().toUpperCase();
  const ts = timestamp ?? 0;
  return `${sym}-${ts}-${index}`;
}

/**
 * Generates a stable, unique ID for an alert or setup item.
 * Ensures no React key collisions occur even across rapid re-scans.
 */
export function generateStableAlertId(
  symbol: string,
  type: string,
  timestamp: number,
  index?: number
): string {
  const sym = (symbol || 'UNKNOWN').toUpperCase();
  const pat = (type || 'SETUP').replace(/[^a-zA-Z0-9]/g, '-');
  const ts = timestamp || Date.now();
  const idx = typeof index === 'number' ? `-${index}` : '';
  return `alert-${sym}-${pat}-${ts}${idx}`;
}

/**
 * Generates a stable, unique key for a scan result row.
 */
export function generateStableScanKey(symbol: string, index?: number, extra?: string | number): string {
  const sym = (symbol || 'TICKER').toUpperCase();
  const extraPart = extra !== undefined ? `-${extra}` : '';
  return typeof index === 'number' ? `scan-row-${sym}${extraPart}-${index}` : `scan-row-${sym}${extraPart}`;
}

