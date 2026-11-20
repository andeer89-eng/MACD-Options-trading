import { PineTS } from 'pinets';
import type { Candle } from './trullasStrategy';
import { validatePineScriptHeader } from './indicatorLibrary';

export interface PinePlotPoint {
  time: number; // unix seconds
  value: number;
  color?: string;
}

export type PinePlotStyle =
  | 'line'
  | 'stepline'
  | 'histogram'
  | 'columns'
  | 'area'
  | 'circles'
  | 'cross'
  | 'linebr';

export interface PinePlotSeries {
  name: string;
  style: PinePlotStyle;
  color: string;
  lineWidth: number;
  points: PinePlotPoint[];
}

export interface PineFillBand {
  id: string;
  title: string;
  plot1Name: string;
  plot2Name: string;
  points: { time: number; y1: number; y2: number; color: string }[];
}

export interface PineShapeMarker {
  time: number;
  barIndex: number;
  price: number;
  shape: string;
  location: 'AboveBar' | 'BelowBar' | 'Top' | 'Bottom' | 'Absolute';
  color: string;
  textColor: string;
  text: string;
  char?: string;
}

export interface PineBgBand {
  time: number;
  color: string;
}

export interface PineHLine {
  title: string;
  price: number;
  color: string;
  style: 'solid' | 'dashed' | 'dotted';
  lineWidth: number;
}

export interface PineBoxObject {
  leftTime: number;
  rightTime: number;
  top: number;
  bottom: number;
  extend: 'none' | 'left' | 'right' | 'both';
  borderColor: string;
  borderWidth: number;
  borderStyle: 'solid' | 'dashed' | 'dotted';
  bgcolor: string;
  text: string;
  textColor: string;
  textHalign: 'left' | 'center' | 'right';
  textValign: 'top' | 'center' | 'bottom';
}

export interface PineLineObject {
  x1Time: number;
  y1: number;
  x2Time: number;
  y2: number;
  extend: 'none' | 'left' | 'right' | 'both';
  color: string;
  width: number;
  style: 'solid' | 'dashed' | 'dotted';
}

export interface PineLabelObject {
  time: number;
  y: number;
  yloc: string;
  text: string;
  color: string;
  textColor: string;
  style: string;
}

export interface PineTableCell {
  text: string;
  textColor: string;
  bgcolor: string;
  textHalign: 'left' | 'center' | 'right';
}

export interface PineTableObject {
  position: string;
  borderColor: string;
  borderWidth: number;
  bgcolor: string;
  cells: PineTableCell[][];
}

export interface PineStrategyTradeMarker {
  time: number;
  price: number;
  direction: 'long' | 'short';
  kind: 'entry' | 'exit';
  label: string;
}

export interface PineExecutionResult {
  indicatorId: string;
  name: string;
  overlay: boolean;
  ok: boolean;
  error?: string;
  warnings: string[];
  plots: PinePlotSeries[];
  fills: PineFillBand[];
  hlines: PineHLine[];
  shapes: PineShapeMarker[];
  bgBands: PineBgBand[];
  boxes: PineBoxObject[];
  lines: PineLineObject[];
  labels: PineLabelObject[];
  tables: PineTableObject[];
  strategyTrades: PineStrategyTradeMarker[];
  summaryValue: string;
  summaryStatus: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
}

export function pineColorToCss(rawColor: string | undefined | null, fallback = '#38bdf8'): string {
  if (!rawColor || typeof rawColor !== 'string') return fallback;
  const trimmed = rawColor.trim();
  if (!trimmed || trimmed === 'na') return fallback;
  if (trimmed.toLowerCase() === 'transparent') return 'rgba(0, 0, 0, 0)';

  const hex8 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(trimmed);
  if (hex8) {
    const r = parseInt(hex8[1], 16);
    const g = parseInt(hex8[2], 16);
    const b = parseInt(hex8[3], 16);
    const a = (parseInt(hex8[4], 16) / 255).toFixed(2);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  return trimmed;
}

const V4_TA_FNS = new Set([
  'sma',
  'ema',
  'wma',
  'vwma',
  'rma',
  'rsi',
  'atr',
  'tr',
  'macd',
  'bb',
  'stoch',
  'cci',
  'crossover',
  'crossunder',
  'highest',
  'lowest',
  'highestbars',
  'lowestbars',
  'stdev',
  'variance',
  'pivothigh',
  'pivotlow',
  'vwap',
  'change',
  'mom',
  'roc',
  'cum',
  'sar',
  'supertrend',
  'valuewhen',
  'barssince',
  'falling',
  'rising',
  'linreg',
  'correlation',
]);

const V4_MATH_FNS = new Set([
  'abs',
  'max',
  'min',
  'pow',
  'sqrt',
  'log',
  'exp',
  'round',
  'floor',
  'ceil',
  'sign',
  'avg',
]);

const EXTENDED_COLORS: Record<string, string> = {
  'color.cyan': 'color.aqua',
  'color.emerald': '#10b981',
  'color.rose': '#f43f5e',
  'color.sky': '#38bdf8',
  'color.amber': '#f59e0b',
  'color.gold': '#facc15',
  'color.violet': '#8b5cf6',
  'color.indigo': '#6366f1',
};

function transformCodeSegment(segment: string, upgradeV4: boolean): string {
  let out = segment;

  // Extended color aliases often pasted from modern snippets
  out = out.replace(
    /\bcolor\.(?:cyan|emerald|rose|sky|amber|gold|violet|indigo)\b/g,
    (m) => EXTENDED_COLORS[m] ?? m
  );

  if (upgradeV4) {
    out = out.replace(/(?<![.\w])study\s*\(/g, 'indicator(');
    out = out.replace(/(?<![.\w])security\s*\(/g, 'request.security(');
    out = out.replace(/(?<![.\w])([a-z_][a-z0-9_]*)\s*\(/g, (full, fnName: string) => {
      if (V4_TA_FNS.has(fnName)) return `ta.${fnName}(`;
      if (V4_MATH_FNS.has(fnName)) return `math.${fnName}(`;
      return full;
    });
  }

  return out;
}

/**
 * Normalizes TradingView Pine Script v4/v5/v6 code safely while preserving string literals
 * and comments untouched so PineTS v0.13.1 executes community scripts reliably.
 */
export function preprocessPineScript(rawCode: string): string {
  if (!rawCode) return '';

  const hasV4 = /\/\/\s*@version\s*=\s*[34]\b/.test(rawCode) || (!/\/\/\s*@version\s*=/.test(rawCode) && /\bstudy\s*\(/.test(rawCode));
  const hasAnyVersion = /\/\/\s*@version\s*=\s*\d+/.test(rawCode);

  let source = rawCode;
  if (/\/\/\s*@version\s*=\s*[34]\b/.test(source)) {
    source = source.replace(/\/\/\s*@version\s*=\s*[34]\b/, '//@version=5');
  } else if (!hasAnyVersion) {
    source = `//@version=5\n${source}`;
  }

  // Split around strings and comments so only executable code tokens are transformed
  let out = '';
  let codeBuf = '';
  let inSingle = false;
  let inDouble = false;
  let inLineComment = false;
  let inBlockComment = false;

  const flushCode = () => {
    if (codeBuf.length > 0) {
      out += transformCodeSegment(codeBuf, hasV4);
      codeBuf = '';
    }
  };

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1];
    const prev = source[i - 1];

    if (inLineComment) {
      out += ch;
      if (ch === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      out += ch;
      if (prev === '*' && ch === '/') inBlockComment = false;
      continue;
    }
    if (inSingle) {
      out += ch;
      if (ch === "'" && prev !== '\\') inSingle = false;
      continue;
    }
    if (inDouble) {
      out += ch;
      if (ch === '"' && prev !== '\\') inDouble = false;
      continue;
    }

    if (ch === '/' && next === '/') {
      flushCode();
      inLineComment = true;
      out += '//';
      i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      flushCode();
      inBlockComment = true;
      out += '/*';
      i++;
      continue;
    }
    if (ch === "'") {
      flushCode();
      inSingle = true;
      out += ch;
      continue;
    }
    if (ch === '"') {
      flushCode();
      inDouble = true;
      out += ch;
      continue;
    }

    codeBuf += ch;
  }
  flushCode();
  return out;
}

function mapLineStyle(raw: unknown): 'solid' | 'dashed' | 'dotted' {
  const s = String(raw || '').toLowerCase();
  if (s.includes('dash')) return 'dashed';
  if (s.includes('dot')) return 'dotted';
  return 'solid';
}

function mapPlotStyle(raw: unknown): PinePlotStyle {
  const s = String(raw || '').toLowerCase();
  if (s.includes('histogram')) return 'histogram';
  if (s.includes('columns')) return 'columns';
  if (s.includes('stepline')) return 'stepline';
  if (s.includes('area')) return 'area';
  if (s.includes('circle')) return 'circles';
  if (s.includes('cross')) return 'cross';
  if (s.includes('linebr')) return 'linebr';
  return 'line';
}

function mapExtend(raw: unknown): 'none' | 'left' | 'right' | 'both' {
  const s = String(raw || '').toLowerCase();
  if (s.includes('both')) return 'both';
  if (s.includes('right')) return 'right';
  if (s.includes('left')) return 'left';
  return 'none';
}

function hashString(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

const EXECUTION_CACHE = new Map<string, PineExecutionResult>();
const MAX_CACHE_ENTRIES = 48;

export interface PineExecutableDescriptor {
  id: string;
  name: string;
  overlay?: boolean;
  pineCode: string;
}

export async function executePineScriptIndicator(
  indicator: PineExecutableDescriptor,
  candles: Candle[],
  options: { symbol?: string; timeframe?: string } = {}
): Promise<PineExecutionResult> {
  const header = validatePineScriptHeader(indicator.pineCode);
  const declaredOverlay = header.valid ? header.overlay : (indicator.overlay ?? true);

  if (!candles || candles.length === 0) {
    return {
      indicatorId: indicator.id,
      name: indicator.name || header.name,
      overlay: declaredOverlay,
      ok: false,
      error: 'No market candles loaded to evaluate indicator.',
      warnings: [],
      plots: [],
      fills: [],
      hlines: [],
      shapes: [],
      bgBands: [],
      boxes: [],
      lines: [],
      labels: [],
      tables: [],
      strategyTrades: [],
      summaryValue: 'Waiting for bars',
      summaryStatus: 'NEUTRAL',
    };
  }

  // Ensure strictly sorted ascending unique timestamps
  const sorted = [...candles].sort((a, b) => a.timestamp - b.timestamp);
  const unique: Candle[] = [];
  const seen = new Set<number>();
  for (const c of sorted) {
    const sec = Math.floor(c.timestamp / 1000);
    if (!seen.has(sec)) {
      seen.add(sec);
      unique.push(c);
    }
  }

  const last = unique[unique.length - 1];
  const cacheKey = `${indicator.id}|${hashString(indicator.pineCode)}|${options.symbol || ''}|${options.timeframe || ''}|${unique.length}|${last.timestamp}|${last.close}`;
  const cached = EXECUTION_CACHE.get(cacheKey);
  if (cached) return cached;

  const ohlcv = unique.map((c) => ({
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
    openTime: c.timestamp,
  }));

  const barIndexToUnixSec = (rawX: unknown, xloc?: string): number => {
    const num = Number(rawX);
    if (!Number.isFinite(num)) return Math.floor(last.timestamp / 1000);
    if (String(xloc || '').toLowerCase().includes('bt') || num > 1_000_000_000) {
      // Bar time (ms or sec)
      return num > 10_000_000_000 ? Math.floor(num / 1000) : Math.floor(num);
    }
    const idx = Math.round(num);
    if (idx >= 0 && idx < unique.length) {
      return Math.floor(unique[idx].timestamp / 1000);
    }
    const avgDt =
      unique.length >= 2
        ? Math.max(60, Math.floor((last.timestamp - unique[0].timestamp) / 1000 / (unique.length - 1)))
        : 86_400;
    if (idx < 0) {
      return Math.floor(unique[0].timestamp / 1000) + idx * avgDt;
    }
    return Math.floor(last.timestamp / 1000) + (idx - (unique.length - 1)) * avgDt;
  };

  const candleByTimeSec = new Map<number, { candle: Candle; index: number }>();
  unique.forEach((c, idx) => {
    candleByTimeSec.set(Math.floor(c.timestamp / 1000), { candle: c, index: idx });
  });

  try {
    const normalizedCode = preprocessPineScript(indicator.pineCode);
    const pts = new PineTS(ohlcv, options.symbol || 'TICKER', options.timeframe || '1d');
    const ctx = await pts.run(normalizedCode);

    const ctxOverlay =
      typeof ctx?.indicator?.overlay === 'boolean' ? ctx.indicator.overlay : declaredOverlay;

    const rawPlots = (ctx?.plots || {}) as Record<string, any>;
    const plots: PinePlotSeries[] = [];
    const fillEntries: Array<{ key: string; obj: any }> = [];
    const hlines: PineHLine[] = [];
    const shapes: PineShapeMarker[] = [];
    const bgBands: PineBgBand[] = [];
    const boxes: PineBoxObject[] = [];
    const lines: PineLineObject[] = [];
    const labels: PineLabelObject[] = [];
    const tables: PineTableObject[] = [];

    const plotMapByTitle = new Map<string, Map<number, number>>();

    for (const [key, entry] of Object.entries(rawPlots)) {
      if (!entry || !Array.isArray(entry.data)) continue;
      const opts = entry.options || {};
      const styleRaw = String(opts.style || '').toLowerCase();

      // Drawing buckets
      if (key === '__boxes__' || styleRaw === 'drawing_box') {
        const lastSnapshot = entry.data[entry.data.length - 1]?.value;
        const arr = Array.isArray(lastSnapshot) ? lastSnapshot : [];
        for (const b of arr) {
          if (!b || b._deleted) continue;
          const top = Number(b.top);
          const bottom = Number(b.bottom);
          if (!Number.isFinite(top) || !Number.isFinite(bottom)) continue;
          boxes.push({
            leftTime: barIndexToUnixSec(b.left, b.xloc),
            rightTime: barIndexToUnixSec(b.right, b.xloc),
            top: Math.max(top, bottom),
            bottom: Math.min(top, bottom),
            extend: mapExtend(b.extend),
            borderColor: pineColorToCss(b.border_color, '#38bdf8'),
            borderWidth: Math.max(1, Number(b.border_width) || 1),
            borderStyle: mapLineStyle(b.border_style),
            bgcolor: pineColorToCss(b.bgcolor, 'rgba(56, 189, 248, 0.12)'),
            text: typeof b.text === 'string' ? b.text : '',
            textColor: pineColorToCss(b.text_color, '#e4e4e7'),
            textHalign: b.text_halign === 'left' || b.text_halign === 'right' ? b.text_halign : 'center',
            textValign: b.text_valign === 'top' || b.text_valign === 'bottom' ? b.text_valign : 'center',
          });
        }
        continue;
      }

      if (key === '__lines__' || styleRaw === 'drawing_line') {
        const lastSnapshot = entry.data[entry.data.length - 1]?.value;
        const arr = Array.isArray(lastSnapshot) ? lastSnapshot : [];
        for (const ln of arr) {
          if (!ln || ln._deleted) continue;
          const y1 = Number(ln.y1);
          const y2 = Number(ln.y2);
          if (!Number.isFinite(y1) || !Number.isFinite(y2)) continue;
          lines.push({
            x1Time: barIndexToUnixSec(ln.x1, ln.xloc),
            y1,
            x2Time: barIndexToUnixSec(ln.x2, ln.xloc),
            y2,
            extend: mapExtend(ln.extend),
            color: pineColorToCss(ln.color, '#38bdf8'),
            width: Math.max(1, Number(ln.width) || 1.5),
            style: mapLineStyle(ln.style),
          });
        }
        continue;
      }

      if (key === '__labels__' || styleRaw === 'label') {
        const lastSnapshot = entry.data[entry.data.length - 1]?.value;
        const arr = Array.isArray(lastSnapshot) ? lastSnapshot : [];
        for (const lb of arr) {
          if (!lb || lb._deleted) continue;
          const yVal = Number(lb.y);
          const textStr = typeof lb.text === 'string' ? lb.text.trim() : '';
          if (!textStr && !Number.isFinite(yVal)) continue;
          labels.push({
            time: barIndexToUnixSec(lb.x, lb.xloc),
            y: Number.isFinite(yVal) ? yVal : last.close,
            yloc: String(lb.yloc || 'pr'),
            text: textStr || '●',
            color: pineColorToCss(lb.color, '#2563eb'),
            textColor: pineColorToCss(lb.textcolor, '#ffffff'),
            style: String(lb.style || 'style_label_down'),
          });
        }
        continue;
      }

      if (key === '__tables__' || styleRaw === 'table') {
        const lastSnapshot = entry.data[entry.data.length - 1]?.value;
        const arr = Array.isArray(lastSnapshot) ? lastSnapshot : [];
        for (const tb of arr) {
          if (!tb || tb._deleted || !Array.isArray(tb.cells)) continue;
          const mappedCells: PineTableCell[][] = [];
          for (const row of tb.cells) {
            if (!Array.isArray(row)) continue;
            const nonEmptyRow = row.map((cell: any) => ({
              text: cell && typeof cell.text === 'string' ? cell.text : '',
              textColor: pineColorToCss(cell?.text_color, '#e4e4e7'),
              bgcolor: cell?.bgcolor ? pineColorToCss(cell.bgcolor, 'transparent') : 'transparent',
              textHalign:
                cell?.text_halign === 'left' || cell?.text_halign === 'right'
                  ? cell.text_halign
                  : 'center',
            }));
            if (nonEmptyRow.some((c) => c.text.length > 0)) {
              mappedCells.push(nonEmptyRow);
            }
          }
          if (mappedCells.length > 0) {
            tables.push({
              position: String(tb.position || 'top_right'),
              borderColor: pineColorToCss(tb.border_color, '#2962FF'),
              borderWidth: Math.max(1, Number(tb.border_width) || 1),
              bgcolor: pineColorToCss(tb.bgcolor, 'rgba(9, 13, 24, 0.88)'),
              cells: mappedCells,
            });
          }
        }
        continue;
      }

      if (key === '__linefills__' || key === '__polylines__') {
        continue;
      }

      if (styleRaw === 'fill') {
        fillEntries.push({ key, obj: entry });
        continue;
      }

      if (key.startsWith('bgcolor') || styleRaw === 'bgcolor') {
        for (const item of entry.data) {
          const rawCol = item?.options?.color ?? item?.value;
          if (!rawCol || rawCol === 'na' || rawCol === false) continue;
          const timeSec = Math.floor(Number(item.time) / 1000);
          if (!Number.isFinite(timeSec)) continue;
          bgBands.push({
            time: timeSec,
            color: pineColorToCss(String(rawCol), 'rgba(16, 185, 129, 0.08)'),
          });
        }
        continue;
      }

      if (styleRaw === 'hline') {
        const firstValid = entry.data.find((d: any) => typeof d?.value === 'number' && Number.isFinite(d.value));
        if (firstValid) {
          hlines.push({
            title: String(entry.title || key),
            price: firstValid.value,
            color: pineColorToCss(opts.color, '#71717a'),
            style: mapLineStyle(opts.linestyle),
            lineWidth: Math.max(1, Number(opts.linewidth) || 1),
          });
        }
        continue;
      }

      if (styleRaw === 'shape' || styleRaw === 'char' || styleRaw === 'arrow') {
        for (const item of entry.data) {
          const v = item?.value;
          const triggered = v === true || (typeof v === 'number' && Number.isFinite(v) && v !== 0);
          if (!triggered) continue;
          const timeSec = Math.floor(Number(item.time) / 1000);
          const match = candleByTimeSec.get(timeSec);
          if (!match) continue;

          const itemOpts = item.options || {};
          const rawLoc = String(itemOpts.location ?? opts.location ?? 'AboveBar');
          const loc: PineShapeMarker['location'] =
            rawLoc === 'BelowBar' || rawLoc === 'Top' || rawLoc === 'Bottom' || rawLoc === 'Absolute'
              ? rawLoc
              : 'AboveBar';

          const anchorPrice =
            loc === 'Absolute' && typeof v === 'number'
              ? v
              : loc === 'BelowBar' || loc === 'Bottom'
                ? match.candle.low
                : match.candle.high;

          shapes.push({
            time: timeSec,
            barIndex: match.index,
            price: anchorPrice,
            shape: String(itemOpts.shape ?? opts.shape ?? 'shape_circle'),
            location: loc,
            color: pineColorToCss(itemOpts.color ?? opts.color, '#10b981'),
            textColor: pineColorToCss(itemOpts.textcolor ?? opts.textcolor, '#ffffff'),
            text: typeof (itemOpts.text ?? opts.text) === 'string' ? (itemOpts.text ?? opts.text) : '',
            char: typeof (itemOpts.char ?? opts.char) === 'string' ? (itemOpts.char ?? opts.char) : undefined,
          });
        }
        continue;
      }

      // Standard numeric plot series (line / stepline / histogram / columns / area / circles / cross)
      const baseColor = pineColorToCss(opts.color, '#38bdf8');
      const plotName = String(entry.title || key);
      const ptsOut: PinePlotPoint[] = [];
      const timeToVal = new Map<number, number>();

      for (const item of entry.data) {
        const val = typeof item?.value === 'number' ? item.value : NaN;
        if (!Number.isFinite(val)) continue;
        const timeSec = Math.floor(Number(item.time) / 1000);
        if (!Number.isFinite(timeSec)) continue;
        const barColRaw = item?.options?.color;
        const ptColor = barColRaw ? pineColorToCss(barColRaw, baseColor) : baseColor;
        ptsOut.push({ time: timeSec, value: val, color: ptColor });
        timeToVal.set(timeSec, val);
      }

      if (ptsOut.length > 0) {
        plotMapByTitle.set(plotName, timeToVal);
        if (entry._plotKey) plotMapByTitle.set(String(entry._plotKey), timeToVal);
        plots.push({
          name: plotName,
          style: mapPlotStyle(opts.style),
          color: baseColor,
          lineWidth: Math.max(1, Math.min(4, Number(opts.linewidth) || 2)),
          points: ptsOut,
        });
      }
    }

    // Resolve fills against extracted plot maps
    const fills: PineFillBand[] = [];
    for (const { key, obj } of fillEntries) {
      const opts = obj.options || {};
      const p1Name = String(obj.plot1 ?? opts.plot1 ?? '');
      const p2Name = String(obj.plot2 ?? opts.plot2 ?? '');
      const map1 = plotMapByTitle.get(p1Name);
      const map2 = plotMapByTitle.get(p2Name);
      if (!map1 || !map2) continue;

      const defaultFillColor = pineColorToCss(opts.color, 'rgba(56, 189, 248, 0.16)');
      const fillPts: { time: number; y1: number; y2: number; color: string }[] = [];
      for (const item of obj.data) {
        const timeSec = Math.floor(Number(item.time) / 1000);
        const y1 = map1.get(timeSec);
        const y2 = map2.get(timeSec);
        if (y1 === undefined || y2 === undefined) continue;
        const col = pineColorToCss(item?.options?.color, defaultFillColor);
        fillPts.push({ time: timeSec, y1, y2, color: col });
      }
      if (fillPts.length >= 2) {
        fills.push({
          id: key,
          title: String(obj.title || key),
          plot1Name: p1Name,
          plot2Name: p2Name,
          points: fillPts,
        });
      }
    }

    // Extract strategy entries/exits if strategy(...) was used
    const strategyTrades: PineStrategyTradeMarker[] = [];
    const strat = ctx?.strategy as any;
    const allTrades = [
      ...(Array.isArray(strat?.closedtrades) ? strat.closedtrades : []),
      ...(Array.isArray(strat?.opentrades) ? strat.opentrades : []),
    ];
    for (const tr of allTrades) {
      if (!tr) continue;
      const isShort = tr.size < 0 || String(tr.direction || '').toLowerCase().includes('short');
      const dir: 'long' | 'short' = isShort ? 'short' : 'long';
      const eTime = tr.entry_time ?? tr.entryTime;
      const ePrice = tr.entry_price ?? tr.entryPrice;
      const eId = tr.entry_id ?? tr.entryId;
      const xTime = tr.exit_time ?? tr.exitTime;
      const xPrice = tr.exit_price ?? tr.exitPrice;
      const xId = tr.exit_id ?? tr.exitId;

      if (Number.isFinite(eTime) && Number.isFinite(ePrice)) {
        strategyTrades.push({
          time: eTime > 10_000_000_000 ? Math.floor(eTime / 1000) : Math.floor(eTime),
          price: ePrice,
          direction: dir,
          kind: 'entry',
          label: eId ? `${dir === 'long' ? '▲' : '▼'} ${eId}` : dir === 'long' ? '▲ LONG' : '▼ SHORT',
        });
      }
      if (Number.isFinite(xTime) && Number.isFinite(xPrice)) {
        strategyTrades.push({
          time: xTime > 10_000_000_000 ? Math.floor(xTime / 1000) : Math.floor(xTime),
          price: xPrice,
          direction: dir,
          kind: 'exit',
          label: xId ? `✕ ${xId}` : '✕ EXIT',
        });
      }
    }

    // Summary metric for indicator badge
    const primaryPlot = plots[0];
    const lastVal = primaryPlot?.points[primaryPlot.points.length - 1]?.value;
    const prevVal = primaryPlot?.points[Math.max(0, primaryPlot.points.length - 2)]?.value;
    let summaryStatus: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    if (lastVal !== undefined) {
      if (ctxOverlay) {
        summaryStatus = last.close >= lastVal ? 'BULLISH' : 'BEARISH';
      } else if (prevVal !== undefined) {
        summaryStatus = lastVal > prevVal ? 'BULLISH' : lastVal < prevVal ? 'BEARISH' : 'NEUTRAL';
      }
    }

    const fmtNum = (n: number) =>
      Math.abs(n) >= 10 ? n.toFixed(2) : Math.abs(n) >= 0.1 ? n.toFixed(4) : n.toFixed(6);

    const summaryValue =
      lastVal !== undefined
        ? `${primaryPlot.name}: ${fmtNum(lastVal)}`
        : `${shapes.length} signals · ${boxes.length} boxes`;

    const result: PineExecutionResult = {
      indicatorId: indicator.id,
      name: String(ctx?.indicator?.title || indicator.name || header.name),
      overlay: ctxOverlay,
      ok: true,
      warnings: Array.isArray(ctx?.warnings)
        ? ctx.warnings.slice(0, 8).map((w: any) => String(w?.message || w))
        : [],
      plots,
      fills,
      hlines,
      shapes,
      bgBands,
      boxes,
      lines,
      labels,
      tables,
      strategyTrades,
      summaryValue,
      summaryStatus,
    };

    if (EXECUTION_CACHE.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = EXECUTION_CACHE.keys().next().value;
      if (oldestKey) EXECUTION_CACHE.delete(oldestKey);
    }
    EXECUTION_CACHE.set(cacheKey, result);
    return result;
  } catch (err: any) {
    return {
      indicatorId: indicator.id,
      name: indicator.name || header.name,
      overlay: declaredOverlay,
      ok: false,
      error: err?.message ? String(err.message) : 'Pine Script compilation/execution failed',
      warnings: [],
      plots: [],
      fills: [],
      hlines: [],
      shapes: [],
      bgBands: [],
      boxes: [],
      lines: [],
      labels: [],
      tables: [],
      strategyTrades: [],
      summaryValue: 'Execution Error',
      summaryStatus: 'NEUTRAL',
    };
  }
}
