/**
 * Shared RFC-4180 CSV escaping with formula-injection protection.
 * Preserves numeric negative literals (e.g. "-12.50", "-$12.50") while neutralizing
 * active spreadsheet formula prefixes (=, +, @, tab, CR) from user/market strings.
 */

const NUMERIC_NEGATIVE_RE = /^-\$?\d/;
const FORMULA_PREFIX_RE = /^[=+@\t\r]/;

export function escapeCsvCell(value: unknown): string {
  const raw = String(value ?? '');
  const needsFormulaNeutralization =
    FORMULA_PREFIX_RE.test(raw) ||
    (raw.startsWith('-') && !NUMERIC_NEGATIVE_RE.test(raw));
  const safe = needsFormulaNeutralization ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function toCsvRow(cells: unknown[]): string {
  return cells.map((cell) => escapeCsvCell(cell)).join(',');
}
