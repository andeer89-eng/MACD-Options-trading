/**
 * Live Public Market Breadth & Sector Uptrend Ratio Feed
 * Source: TraderMonty public daily datasets (zero API keys required):
 *  - https://tradermonty.github.io/market-breadth-analysis/market_breadth_data.csv
 *  - https://raw.githubusercontent.com/tradermonty/uptrend-dashboard/main/data/sector_summary.csv
 *
 * Strictly deterministic CSV parsing — never invents synthetic numbers on upstream failure.
 */

export const MARKET_BREADTH_CSV_URL =
  'https://tradermonty.github.io/market-breadth-analysis/market_breadth_data.csv';
export const UPTREND_SECTOR_SUMMARY_CSV_URL =
  'https://raw.githubusercontent.com/tradermonty/uptrend-dashboard/main/data/sector_summary.csv';

export interface PublicBreadthDailyRow {
  date: string;
  sp500Price: number | null;
  pctAbove200Ma: number; // 0..100
  pctAbove200Ma8Ma: number | null; // 0..100
  trend200Ma: 'UP' | 'DOWN' | 'FLAT';
  bearishSignal200: boolean;
  isTroughBelow40: boolean;
  pctAbove50Ma: number | null; // 0..100
  pctAbove50Ma8Ma: number | null; // 0..100
  trend50Ma: 'UP' | 'DOWN' | 'FLAT';
  bearishSignal50: boolean;
  aboveCount200: number | null;
  eligibleCount200: number | null;
  aboveCount50: number | null;
  eligibleCount50: number | null;
}

export interface SectorUptrendRow {
  sector: string;
  rawSector: string;
  uptrendRatioPct: number; // 0..100
  ma10Pct: number | null; // 0..100
  trend: 'UP' | 'DOWN' | 'FLAT';
  slope: number | null;
  status: 'OVERBOUGHT' | 'NORMAL' | 'OVERSOLD';
  asOf: string;
  stale: boolean;
}

export interface PublicBreadthSnapshot {
  source: 'tradermonty-public-csv';
  asOf: string;
  sp500Breadth: {
    pctAbove200Ma: number;
    pctAbove200MaDelta1D: number | null;
    pctAbove200Ma8Ma: number | null;
    trend200Ma: 'UP' | 'DOWN' | 'FLAT';
    bearishSignal200: boolean;
    isTroughBelow40: boolean;
    pctAbove50Ma: number | null;
    pctAbove50MaDelta1D: number | null;
    pctAbove50Ma8Ma: number | null;
    trend50Ma: 'UP' | 'DOWN' | 'FLAT';
    bearishSignal50: boolean;
    aboveCount200: number | null;
    eligibleCount200: number | null;
    aboveCount50: number | null;
    eligibleCount50: number | null;
    regimeLabel: 'STRONG_BREADTH' | 'HEALTHY' | 'WEAKENING' | 'OVERSOLD_TROUGH' | 'BEAR_DIVERGENCE';
  } | null;
  sectorUptrend: {
    asOf: string;
    avgUptrendPct: number;
    sectorsUpCount: number;
    overboughtCount: number;
    oversoldCount: number;
    sectors: SectorUptrendRow[];
  } | null;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  out.push(current.trim());
  return out;
}

function toNum(val: string | undefined): number | null {
  if (!val) return null;
  const trimmed = val.trim();
  if (!trimmed || trimmed.toLowerCase() === 'nan' || trimmed.toLowerCase() === 'na') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function toRatioPct(val: string | undefined): number | null {
  const n = toNum(val);
  if (n === null) return null;
  // Raw ratios in feed are 0..1 (e.g. 0.584 -> 58.4%). Handle edge case if already 0..100 (> 1.05).
  const pct = n <= 1.05 ? n * 100 : n;
  return Number(Math.max(0, Math.min(100, pct)).toFixed(1));
}

function toBool(val: string | undefined): boolean {
  if (!val) return false;
  const s = val.trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
}

function parseTrend(val: string | undefined): 'UP' | 'DOWN' | 'FLAT' {
  if (!val) return 'FLAT';
  const s = val.trim().toLowerCase();
  if (s === 'up' || s === '1' || s === 'bull' || s === 'bullish' || s === 'rising') return 'UP';
  if (s === 'down' || s === '-1' || s === 'bear' || s === 'bearish' || s === 'falling') return 'DOWN';
  return 'FLAT';
}

export function normalizeGicsSectorName(rawSector: string): string {
  const clean = rawSector.trim();
  const key = clean.toLowerCase();
  const map: Record<string, string> = {
    healthcare: 'Health Care',
    'health care': 'Health Care',
    'consumer defensive': 'Consumer Staples',
    'consumer staples': 'Consumer Staples',
    'consumer cyclical': 'Consumer Discretionary',
    'consumer discretionary': 'Consumer Discretionary',
    financial: 'Financials',
    financials: 'Financials',
    'basic materials': 'Materials',
    materials: 'Materials',
    'communication services': 'Communication Services',
    'real estate': 'Real Estate',
    technology: 'Information Technology',
    'information technology': 'Information Technology',
    industrials: 'Industrials',
    energy: 'Energy',
    utilities: 'Utilities',
  };
  return map[key] || clean;
}

export function parseMarketBreadthCsv(csvText: string): PublicBreadthDailyRow[] {
  if (!csvText || typeof csvText !== 'string') return [];
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 2) return [];

  const header = splitCsvLine(lines[0]);
  const colIdx = new Map<string, number>();
  header.forEach((h, i) => colIdx.set(h.trim(), i));

  const get = (cells: string[], name: string): string | undefined => {
    const idx = colIdx.get(name);
    return idx !== undefined ? cells[idx] : undefined;
  };

  if (!colIdx.has('Date') || !colIdx.has('Breadth_Index_Raw')) {
    return [];
  }

  const rows: PublicBreadthDailyRow[] = [];
  for (let r = 1; r < lines.length; r++) {
    const cells = splitCsvLine(lines[r]);
    const date = get(cells, 'Date')?.slice(0, 10) || '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;

    const pctAbove200Ma = toRatioPct(get(cells, 'Breadth_Index_Raw'));
    if (pctAbove200Ma === null) continue;

    rows.push({
      date,
      sp500Price: toNum(get(cells, 'S&P500_Price')),
      pctAbove200Ma,
      pctAbove200Ma8Ma: toRatioPct(get(cells, 'Breadth_Index_8MA')),
      trend200Ma: parseTrend(get(cells, 'Breadth_200MA_Trend')),
      bearishSignal200: toBool(get(cells, 'Bearish_Signal')),
      isTroughBelow40: toBool(get(cells, 'Is_Trough_8MA_Below_04')),
      pctAbove50Ma: toRatioPct(get(cells, 'Breadth_50_Index_Raw')),
      pctAbove50Ma8Ma: toRatioPct(get(cells, 'Breadth_50_Index_8MA')),
      trend50Ma: parseTrend(get(cells, 'Breadth_50_MA_Trend')),
      bearishSignal50: toBool(get(cells, 'Bearish_Signal_50')),
      aboveCount200: toNum(get(cells, 'Above_Count_200')),
      eligibleCount200: toNum(get(cells, 'Eligible_Count_200')),
      aboveCount50: toNum(get(cells, 'Above_Count_50')),
      eligibleCount50: toNum(get(cells, 'Eligible_Count_50')),
    });
  }

  rows.sort((a, b) => a.date.localeCompare(b.date));
  return rows;
}

export function parseUptrendSectorSummaryCsv(csvText: string): SectorUptrendRow[] {
  if (!csvText || typeof csvText !== 'string') return [];
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 2) return [];

  const header = splitCsvLine(lines[0]);
  const colIdx = new Map<string, number>();
  header.forEach((h, i) => colIdx.set(h.trim(), i));

  const get = (cells: string[], name: string): string | undefined => {
    const idx = colIdx.get(name);
    return idx !== undefined ? cells[idx] : undefined;
  };

  if (!colIdx.has('Sector') || !colIdx.has('Ratio')) {
    return [];
  }

  const rows: SectorUptrendRow[] = [];
  for (let r = 1; r < lines.length; r++) {
    const cells = splitCsvLine(lines[r]);
    const rawSector = get(cells, 'Sector') || '';
    if (!rawSector) continue;
    const uptrendRatioPct = toRatioPct(get(cells, 'Ratio'));
    if (uptrendRatioPct === null) continue;

    const rawStatus = (get(cells, 'Status') || 'Normal').trim().toUpperCase();
    const status: SectorUptrendRow['status'] =
      rawStatus === 'OVERBOUGHT'
        ? 'OVERBOUGHT'
        : rawStatus === 'OVERSOLD'
        ? 'OVERSOLD'
        : 'NORMAL';

    rows.push({
      sector: normalizeGicsSectorName(rawSector),
      rawSector,
      uptrendRatioPct,
      ma10Pct: toRatioPct(get(cells, '10MA')),
      trend: parseTrend(get(cells, 'Trend')),
      slope: toNum(get(cells, 'Slope')),
      status,
      asOf: (get(cells, 'As Of') || '').slice(0, 10),
      stale: toBool(get(cells, 'Stale')),
    });
  }

  rows.sort((a, b) => b.uptrendRatioPct - a.uptrendRatioPct);
  return rows;
}

export function buildPublicBreadthSnapshot(params: {
  breadthRows: PublicBreadthDailyRow[];
  sectorRows: SectorUptrendRow[];
}): PublicBreadthSnapshot | null {
  const { breadthRows, sectorRows } = params;
  if (breadthRows.length === 0 && sectorRows.length === 0) return null;

  const latestBreadth = breadthRows.length > 0 ? breadthRows[breadthRows.length - 1] : null;
  const prevBreadth = breadthRows.length >= 2 ? breadthRows[breadthRows.length - 2] : null;

  let sp500Breadth: PublicBreadthSnapshot['sp500Breadth'] = null;
  if (latestBreadth) {
    const delta200 =
      prevBreadth !== null
        ? Number((latestBreadth.pctAbove200Ma - prevBreadth.pctAbove200Ma).toFixed(1))
        : null;
    const delta50 =
      prevBreadth !== null &&
      latestBreadth.pctAbove50Ma !== null &&
      prevBreadth.pctAbove50Ma !== null
        ? Number((latestBreadth.pctAbove50Ma - prevBreadth.pctAbove50Ma).toFixed(1))
        : null;

    let regimeLabel: NonNullable<PublicBreadthSnapshot['sp500Breadth']>['regimeLabel'] = 'HEALTHY';
    if (latestBreadth.isTroughBelow40) {
      regimeLabel = 'OVERSOLD_TROUGH';
    } else if (latestBreadth.bearishSignal200 || latestBreadth.bearishSignal50) {
      regimeLabel = 'BEAR_DIVERGENCE';
    } else if (latestBreadth.pctAbove200Ma >= 65 && (latestBreadth.pctAbove50Ma ?? 60) >= 60) {
      regimeLabel = 'STRONG_BREADTH';
    } else if (latestBreadth.pctAbove200Ma < 48 || (latestBreadth.pctAbove50Ma ?? 50) < 42) {
      regimeLabel = 'WEAKENING';
    }

    sp500Breadth = {
      pctAbove200Ma: latestBreadth.pctAbove200Ma,
      pctAbove200MaDelta1D: delta200,
      pctAbove200Ma8Ma: latestBreadth.pctAbove200Ma8Ma,
      trend200Ma: latestBreadth.trend200Ma,
      bearishSignal200: latestBreadth.bearishSignal200,
      isTroughBelow40: latestBreadth.isTroughBelow40,
      pctAbove50Ma: latestBreadth.pctAbove50Ma,
      pctAbove50MaDelta1D: delta50,
      pctAbove50Ma8Ma: latestBreadth.pctAbove50Ma8Ma,
      trend50Ma: latestBreadth.trend50Ma,
      bearishSignal50: latestBreadth.bearishSignal50,
      aboveCount200: latestBreadth.aboveCount200,
      eligibleCount200: latestBreadth.eligibleCount200,
      aboveCount50: latestBreadth.aboveCount50,
      eligibleCount50: latestBreadth.eligibleCount50,
      regimeLabel,
    };
  }

  let sectorUptrend: PublicBreadthSnapshot['sectorUptrend'] = null;
  if (sectorRows.length > 0) {
    const avg =
      sectorRows.reduce((acc, s) => acc + s.uptrendRatioPct, 0) / sectorRows.length;
    sectorUptrend = {
      asOf: sectorRows.find((s) => s.asOf)?.asOf || latestBreadth?.date || '',
      avgUptrendPct: Number(avg.toFixed(1)),
      sectorsUpCount: sectorRows.filter((s) => s.trend === 'UP').length,
      overboughtCount: sectorRows.filter((s) => s.status === 'OVERBOUGHT').length,
      oversoldCount: sectorRows.filter((s) => s.status === 'OVERSOLD').length,
      sectors: sectorRows,
    };
  }

  return {
    source: 'tradermonty-public-csv',
    asOf: latestBreadth?.date || sectorUptrend?.asOf || '',
    sp500Breadth,
    sectorUptrend,
  };
}

let cachedSnapshot: { timestamp: number; data: PublicBreadthSnapshot } | null = null;
const CACHE_TTL_MS = 15 * 60 * 1000;

async function fetchTextWithTimeout(url: string, timeoutMs: number = 4500): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'StageLedger/1.0 (+market-breadth)' },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchPublicBreadthSnapshot(
  forceRefresh: boolean = false
): Promise<PublicBreadthSnapshot | null> {
  const now = Date.now();
  if (!forceRefresh && cachedSnapshot && now - cachedSnapshot.timestamp < CACHE_TTL_MS) {
    return cachedSnapshot.data;
  }

  const [breadthCsv, sectorCsv] = await Promise.all([
    fetchTextWithTimeout(MARKET_BREADTH_CSV_URL, 4500),
    fetchTextWithTimeout(UPTREND_SECTOR_SUMMARY_CSV_URL, 4500),
  ]);

  const breadthRows = breadthCsv ? parseMarketBreadthCsv(breadthCsv) : [];
  const sectorRows = sectorCsv ? parseUptrendSectorSummaryCsv(sectorCsv) : [];
  const snapshot = buildPublicBreadthSnapshot({ breadthRows, sectorRows });

  if (snapshot) {
    cachedSnapshot = { timestamp: now, data: snapshot };
  }
  return snapshot;
}
