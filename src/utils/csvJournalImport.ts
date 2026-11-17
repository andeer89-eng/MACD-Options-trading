import type { JournalEntry } from './tradeJournal';

export interface CsvImportRowError {
  rowNumber: number;
  rawLine: string;
  reason: string;
}

export interface CsvImportResult {
  entries: JournalEntry[];
  errors: CsvImportRowError[];
  detectedColumns: string[];
  totalDataRows: number;
}

type CanonicalCol =
  | 'symbol'
  | 'side'
  | 'setupType'
  | 'timeframe'
  | 'status'
  | 'entryDate'
  | 'exitDate'
  | 'entryPrice'
  | 'exitPrice'
  | 'stopLoss'
  | 'targetPrice'
  | 'quantity'
  | 'realizedPnL'
  | 'notes'
  | 'tags';

const HEADER_ALIASES: Record<string, CanonicalCol> = {
  symbol: 'symbol',
  ticker: 'symbol',
  asset: 'symbol',
  instrument: 'symbol',
  contract: 'symbol',

  side: 'side',
  direction: 'side',
  action: 'side',
  type: 'side',

  setuptype: 'setupType',
  setup: 'setupType',
  strategy: 'setupType',
  pattern: 'setupType',

  timeframe: 'timeframe',
  tf: 'timeframe',
  interval: 'timeframe',

  status: 'status',
  state: 'status',

  entrydate: 'entryDate',
  opendate: 'entryDate',
  date: 'entryDate',
  entrytime: 'entryDate',
  opentime: 'entryDate',

  exitdate: 'exitDate',
  closedate: 'exitDate',
  exittime: 'exitDate',
  closetime: 'exitDate',

  entryprice: 'entryPrice',
  entry: 'entryPrice',
  openprice: 'entryPrice',
  buyprice: 'entryPrice',
  avgbuyprice: 'entryPrice',
  price: 'entryPrice',

  exitprice: 'exitPrice',
  exit: 'exitPrice',
  closeprice: 'exitPrice',
  sellprice: 'exitPrice',
  avgsellprice: 'exitPrice',

  stoploss: 'stopLoss',
  stop: 'stopLoss',
  sl: 'stopLoss',

  targetprice: 'targetPrice',
  target: 'targetPrice',
  takeprofit: 'targetPrice',
  tp: 'targetPrice',
  tp1: 'targetPrice',

  quantity: 'quantity',
  qty: 'quantity',
  shares: 'quantity',
  units: 'quantity',
  size: 'quantity',
  contracts: 'quantity',

  realizedpnl: 'realizedPnL',
  pnl: 'realizedPnL',
  profit: 'realizedPnL',
  netprofit: 'realizedPnL',
  pl: 'realizedPnL',

  notes: 'notes',
  comment: 'notes',
  memo: 'notes',
  performanceauditnotes: 'notes',

  tags: 'tags',
  tag: 'tags',
};

function normalizeHeaderKey(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Splits a CSV text into logical rows while respecting quoted newlines and escaped quotes ("").
 */
export function splitCsvLines(csvText: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  const cleanText = csvText.replace(/^\uFEFF/, '');

  for (let i = 0; i < cleanText.length; i++) {
    const ch = cleanText[i];
    const next = cleanText[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        currentField += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        currentField += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      currentRow.push(currentField.trim());
      currentField = '';
    } else if (ch === '\r' && next === '\n') {
      currentRow.push(currentField.trim());
      if (currentRow.some((cell) => cell.length > 0)) rows.push(currentRow);
      currentRow = [];
      currentField = '';
      i++;
    } else if (ch === '\n' || ch === '\r') {
      currentRow.push(currentField.trim());
      if (currentRow.some((cell) => cell.length > 0)) rows.push(currentRow);
      currentRow = [];
      currentField = '';
    } else {
      currentField += ch;
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((cell) => cell.length > 0)) rows.push(currentRow);
  }

  return rows;
}

function parseNumeric(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const cleaned = raw.replace(/[$,\s%]/g, '').replace(/[()]/g, (m) => (m === '(' ? '-' : ''));
  if (!cleaned) return undefined;
  const val = Number(cleaned);
  return Number.isFinite(val) ? val : undefined;
}

function normalizeDate(raw: string | undefined): string {
  if (!raw) return new Date().toISOString().slice(0, 10);
  const trimmed = raw.trim();
  const isoMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];

  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slashMatch) {
    const m = slashMatch[1].padStart(2, '0');
    const d = slashMatch[2].padStart(2, '0');
    return `${slashMatch[3]}-${m}-${d}`;
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
}

function resolveSetupType(
  rawSetup: string | undefined,
  rawSide: string | undefined
): { setupType: JournalEntry['setupType']; isShort: boolean } {
  const s = (rawSetup || '').toUpperCase().trim();
  const side = (rawSide || '').toUpperCase().trim();
  const sideShort = side === 'SHORT' || side === 'SELL' || side === 'PUT' || side === 'BTO PUT' || side === 'STO CALL';

  if (s === 'BULLISH_TRIPLE' || s === 'BEARISH_TRIPLE' || s === 'BULLISH_DOUBLE' || s === 'BEARISH_DOUBLE' || s === 'BREAKOUT' || s === 'CUSTOM') {
    return { setupType: s, isShort: s.includes('BEAR') || sideShort };
  }
  if (s.includes('BEAR') && s.includes('DOUBLE')) return { setupType: 'BEARISH_DOUBLE', isShort: true };
  if (s.includes('BEAR')) return { setupType: 'BEARISH_TRIPLE', isShort: true };
  if (s.includes('BULL') && s.includes('DOUBLE')) return { setupType: 'BULLISH_DOUBLE', isShort: false };
  if (s.includes('BULL') || s.includes('TRIPLE')) return { setupType: 'BULLISH_TRIPLE', isShort: sideShort };
  if (s.includes('BREAKOUT')) return { setupType: 'BREAKOUT', isShort: sideShort };

  if (sideShort) {
    return { setupType: 'BEARISH_DOUBLE', isShort: true };
  }
  return { setupType: 'CUSTOM', isShort: false };
}

export function parseBrokerCsvToJournalEntries(
  csvText: string,
  nowMs: number = Date.now()
): CsvImportResult {
  const rows = splitCsvLines(csvText);
  if (rows.length < 2) {
    return {
      entries: [],
      errors: [{ rowNumber: 1, rawLine: csvText.slice(0, 120), reason: 'CSV requires a header row and at least one trade row.' }],
      detectedColumns: [],
      totalDataRows: 0,
    };
  }

  const headers = rows[0];
  const colIndexMap: Partial<Record<CanonicalCol, number>> = {};
  const detectedColumns: string[] = [];

  headers.forEach((h, idx) => {
    const key = normalizeHeaderKey(h);
    const canonical = HEADER_ALIASES[key];
    if (canonical && colIndexMap[canonical] === undefined) {
      colIndexMap[canonical] = idx;
      detectedColumns.push(`${h} → ${canonical}`);
    }
  });

  if (colIndexMap.symbol === undefined || colIndexMap.entryPrice === undefined) {
    return {
      entries: [],
      errors: [
        {
          rowNumber: 1,
          rawLine: headers.join(','),
          reason: 'Missing required columns: must include Symbol (or Ticker) and Entry Price (or Entry / Price).',
        },
      ],
      detectedColumns,
      totalDataRows: rows.length - 1,
    };
  }

  const entries: JournalEntry[] = [];
  const errors: CsvImportRowError[] = [];

  for (let i = 1; i < rows.length; i++) {
    const cols = rows[i];
    const rowNum = i + 1;
    const rawLine = cols.join(',');

    const rawSym = (cols[colIndexMap.symbol] || '')
      .toUpperCase()
      .replace(/^NASDAQ:|^NYSE:|^ARCA:/, '')
      .trim();

    if (!rawSym || !/^[A-Z0-9.=/-]{1,20}$/.test(rawSym)) {
      errors.push({ rowNumber: rowNum, rawLine, reason: `Invalid or empty symbol "${cols[colIndexMap.symbol] || ''}"` });
      continue;
    }

    const entryPrice = parseNumeric(cols[colIndexMap.entryPrice]);
    if (entryPrice === undefined || entryPrice <= 0) {
      errors.push({ rowNumber: rowNum, rawLine, reason: `Invalid entry price "${cols[colIndexMap.entryPrice] || ''}"` });
      continue;
    }

    const rawExit = colIndexMap.exitPrice !== undefined ? parseNumeric(cols[colIndexMap.exitPrice]) : undefined;
    const rawStop = colIndexMap.stopLoss !== undefined ? parseNumeric(cols[colIndexMap.stopLoss]) : undefined;
    const rawTarget = colIndexMap.targetPrice !== undefined ? parseNumeric(cols[colIndexMap.targetPrice]) : undefined;
    const rawQty = colIndexMap.quantity !== undefined ? parseNumeric(cols[colIndexMap.quantity]) : undefined;
    const quantity = rawQty !== undefined && rawQty > 0 ? rawQty : 1;

    const rawSide = colIndexMap.side !== undefined ? cols[colIndexMap.side] : undefined;
    const rawSetup = colIndexMap.setupType !== undefined ? cols[colIndexMap.setupType] : undefined;
    const { setupType, isShort } = resolveSetupType(rawSetup, rawSide);

    const stopLoss =
      rawStop !== undefined && rawStop > 0
        ? rawStop
        : Number((isShort ? entryPrice * 1.03 : entryPrice * 0.97).toFixed(2));

    const targetPrice =
      rawTarget !== undefined && rawTarget > 0
        ? rawTarget
        : Number((isShort ? entryPrice * 0.94 : entryPrice * 1.06).toFixed(2));

    const entryDate = normalizeDate(colIndexMap.entryDate !== undefined ? cols[colIndexMap.entryDate] : undefined);
    const rawExitDate = colIndexMap.exitDate !== undefined ? cols[colIndexMap.exitDate] : undefined;
    const exitDate = rawExitDate && rawExitDate.trim().length > 0 ? normalizeDate(rawExitDate) : undefined;

    const explicitPnL = colIndexMap.realizedPnL !== undefined ? parseNumeric(cols[colIndexMap.realizedPnL]) : undefined;

    let realizedPnL = explicitPnL;
    let pnlPercent: number | undefined;

    const isClosedByPrice = rawExit !== undefined && rawExit > 0;
    if (isClosedByPrice) {
      const computedPnL = isShort
        ? (entryPrice - rawExit!) * quantity
        : (rawExit! - entryPrice) * quantity;
      if (realizedPnL === undefined) {
        realizedPnL = Number(computedPnL.toFixed(2));
      }
      const computedPct = isShort
        ? ((entryPrice - rawExit!) / entryPrice) * 100
        : ((rawExit! - entryPrice) / entryPrice) * 100;
      pnlPercent = Number(computedPct.toFixed(2));
    } else if (realizedPnL !== undefined) {
      pnlPercent = Number(((realizedPnL / (entryPrice * quantity)) * 100).toFixed(2));
    }

    const rawStatus = (colIndexMap.status !== undefined ? cols[colIndexMap.status] : '').toUpperCase().trim();
    let status: JournalEntry['status'] = 'OPEN';
    if (rawStatus === 'OPEN' || rawStatus === 'CLOSED_WIN' || rawStatus === 'CLOSED_LOSS' || rawStatus === 'BREAKEVEN') {
      status = rawStatus;
    } else if (isClosedByPrice || realizedPnL !== undefined) {
      const val = realizedPnL ?? 0;
      status = val > 0 ? 'CLOSED_WIN' : val < 0 ? 'CLOSED_LOSS' : 'BREAKEVEN';
    }

    const timeframe = (colIndexMap.timeframe !== undefined && cols[colIndexMap.timeframe]) || '1d';
    const rawNotes = colIndexMap.notes !== undefined ? cols[colIndexMap.notes] : '';
    const rawTags = colIndexMap.tags !== undefined ? cols[colIndexMap.tags] : '';
    const parsedTags = rawTags
      ? rawTags.split(/[|;]/).map((t) => t.trim()).filter(Boolean)
      : ['CSV Import'];

    entries.push({
      id: `csv-${nowMs}-${i}-${rawSym.replace(/[^A-Z0-9]/g, '')}`,
      symbol: rawSym,
      setupType,
      timeframe: timeframe.slice(0, 10),
      status,
      entryDate,
      exitDate: status !== 'OPEN' ? exitDate || entryDate : undefined,
      entryPrice: Number(entryPrice.toFixed(4)),
      exitPrice: isClosedByPrice ? Number(rawExit!.toFixed(4)) : undefined,
      stopLoss,
      targetPrice,
      quantity,
      realizedPnL: realizedPnL !== undefined ? Number(realizedPnL.toFixed(2)) : undefined,
      pnlPercent,
      notes: rawNotes || `Imported via CSV (${rawSide || setupType})`,
      tags: parsedTags.includes('CSV Import') ? parsedTags : [...parsedTags, 'CSV Import'],
      executionRating: status === 'CLOSED_WIN' ? 4 : 3,
      createdAt: nowMs + i,
    });
  }

  return {
    entries,
    errors,
    detectedColumns,
    totalDataRows: rows.length - 1,
  };
}

export const SAMPLE_BROKER_CSV = `Symbol,Side,Entry Date,Exit Date,Quantity,Entry Price,Exit Price,Stop Loss,Target Price,Notes
NVDA,Long,2026-10-08,2026-10-21,20,124.50,136.80,119.20,136.50,Stage 2 bullish triple divergence breakout
AAPL,Long,2026-10-14,2026-10-25,15,221.40,229.90,217.50,231.00,RSI and MACD momentum confirmation
AMD,Short,2026-10-16,2026-10-20,12,158.00,162.40,162.40,147.00,Respected hard stop above swing high`;
