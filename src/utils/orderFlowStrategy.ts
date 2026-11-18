import { Candle } from './trullasStrategy';

// Exact theme palette from roan-maverick/tradingview-order-flow-strategy-indicator
export const OFS_COLORS = {
  cBull: '#00FF9C',
  cCyan: '#00E5FF',
  cBear: '#FF2D55',
  cMagenta: '#FF2BD6',
  cPurple: '#A855F7',
  cValue: '#536DFE',
  cGold: '#FFC400',
  cAmber: '#FF9F1C',
  cSilver: '#C0C6D4',
  cGrey: '#6B7280',
  C_PILL: '#0B0F1C',
  D_HEAD: '#0B1226',
  D_SEC: '#121C38',
  D_ROW: '#070B16',
} as const;

export interface OfsWavePoint {
  time: number; // unix seconds
  barIndex: number;
  wMid: number;
  wUpOuter: number;
  wUpInner: number;
  wDnInner: number;
  wDnOuter: number;
  flowShare: number;
  flowNet: number;
  flowState: 1 | -1 | 0;
}

export interface OfsValueAreaPoint {
  time: number;
  barIndex: number;
  vaHigh: number;
  vaLow: number;
  vaPOC: number;
}

export interface OfsZone {
  side: 1 | -1; // 1 = DISCOUNT (Long), -1 = PREMIUM (Short)
  ready: boolean;
  inZone: boolean;
  top: number; // lz1 or sz3
  mid: number; // lz2 or sz2
  bottom: number; // lz3 or sz1
  z705: number; // lz1 / sz1 (entry edge)
  z788: number; // lz2 / sz2
  z886: number; // lz3 / sz3 (invalidation edge)
  legHigh: number;
  legLow: number;
  legStartBar: number;
  legEndBar: number;
  legStartTime: number;
  legEndTime: number;
  volumeProfileClass: 'THIN' | 'UNTESTED' | 'NORMAL' | 'UNKNOWN';
}

export interface OfsFootprintRow {
  top: number;
  bot: number;
  sellVol: number;
  buyVol: number;
  sellImbalance: boolean;
  buyImbalance: boolean;
  isPoc: boolean;
  sellIntensity: number; // 0..1
  buyIntensity: number; // 0..1
}

export interface OfsFootprintBar {
  barIndex: number;
  time: number;
  low: number;
  high: number;
  open: number;
  close: number;
  delta: number;
  deltaPct: number;
  pocPos: number;
  closePos: number;
  usedLtf: boolean;
  rows: OfsFootprintRow[];
}

export interface OfsAbsorptionEvent {
  barIndex: number;
  time: number;
  price: number;
  side: 1 | -1; // 1 = Sellers absorbed (Bullish intent), -1 = Buyers absorbed (Bearish intent)
  deltaPct: number;
  pocPos: number;
  closePos: number;
  aq: number;
  label: string;
}

export interface OfsFirstShiftEvent {
  barIndex: number;
  time: number;
  price: number;
  side: 1 | -1;
}

export interface OfsLiquidityZone {
  id: string;
  price: number;
  top: number;
  bot: number;
  isHigh: boolean; // true = BSL (#FF2D55), false = SSL (#00FF9C)
  touches: number;
  startBar: number;
  startTime: number;
  endBar: number;
  endTime: number;
  swept: boolean;
  sweptBar?: number;
  sweptTime?: number;
  sweepExtreme?: number;
}

export interface OfsInefficiencyCorridor {
  id: string;
  dir: 1 | -1;
  top: number;
  bot: number;
  startBar: number;
  startTime: number;
  endBar: number;
  endTime: number;
  active: boolean;
  fillPct: number;
  label: string;
}

export interface OfsImpulseCandle {
  barIndex: number;
  time: number;
  high: number;
  low: number;
  up: boolean;
  deltaPct: number;
  atrMultiple: number;
  relVol: number;
}

export interface OfsTradeRecord {
  id: string;
  side: 1 | -1;
  entryBar: number;
  entryTime: number;
  entryPrice: number;
  stopPrice: number;
  initialStopPrice: number;
  targetPrice: number;
  targetSource: string;
  riskPerUnit: number;
  retestBar: number;
  retestTime: number;
  retestPrice: number;
  absBar: number;
  absTime: number;
  absTop: number;
  absBot: number;
  status:
    | 'ACTIVE'
    | 'VALUE_RECLAIMED'
    | 'STOP_AT_ENTRY'
    | 'NO_RECLAIM_STOP_AT_ENTRY'
    | 'TRAILING'
    | 'TRAIL_STOP'
    | 'TARGET_HIT'
    | 'STOPPED'
    | 'BREAKEVEN';
  trailing: boolean;
  beMoved: boolean;
  trailTrigger: number;
  exitBar?: number;
  exitTime?: number;
  exitPrice?: number;
  exitR?: number;
  openR: number;
  targetR: number;
}

export interface OfsMtfRow {
  tf: string;
  isFilter: boolean;
  structure: 1 | -1 | 0;
  label: 'Value Up' | 'Value Down' | 'Balance';
}

export interface OfsDashboardState {
  market: string;
  timeframe: string;
  lastPrice: number;
  atr: number;
  structure: 1 | -1 | 0;
  structureLabel: 'Value Up' | 'Value Down' | 'Balance';
  setupStateText: string;
  setupStateTone: 'bull' | 'bear' | 'amber' | 'value' | 'cyan' | 'silver';
  setupStateSolid: boolean;
  nextStepText: string;
  flowSharePct: number;
  flowNet: number;
  buyAggressionPct: number;
  sellAggressionPct: number;
  participationRelVol: number | null;
  participationOk: boolean;
  absorptionQuality: number | null;
  pocPos: number;
  pocLocationLabel: string;
  sessionDelta: number;
  setupProgress: number; // 0..6
  steps: {
    environment: { label: string; state: 1 | 0 | -1 };
    location: { label: string; state: 1 | 0 | -1 };
    confirmation: { label: string; state: 1 | 0 | -1 };
    riskRules: { label: string; state: 1 | 0 | -1 };
  };
  mtfRows: OfsMtfRow[];
  valueArea: { val: number | null; poc: number | null; vah: number | null; pos: string };
  activeZone: OfsZone | null;
  nearestBSL: { price: number; touches: number } | null;
  nearestSSL: { price: number; touches: number } | null;
  nextTarget: { price: number; label: string } | null;
  activeTrade: OfsTradeRecord | null;
  lastTrade: OfsTradeRecord | null;
  usedLowerTimeframe: boolean;
}

export interface OfsReport {
  symbol: string;
  timeframe: string;
  candles: Candle[];
  waves: OfsWavePoint[];
  valueAreaSeries: OfsValueAreaPoint[];
  longZone: OfsZone | null;
  shortZone: OfsZone | null;
  footprints: OfsFootprintBar[];
  absorptions: OfsAbsorptionEvent[];
  firstShifts: OfsFirstShiftEvent[];
  liquidityZones: OfsLiquidityZone[];
  inefficiencies: OfsInefficiencyCorridor[];
  impulses: OfsImpulseCandle[];
  trades: OfsTradeRecord[];
  dashboard: OfsDashboardState;
}

export interface OfsConfig {
  symbol?: string;
  timeframe?: string;
  swingLen?: number;
  legLookback?: number;
  fibA?: number;
  fibB?: number;
  fibC?: number;
  needOutsideVA?: boolean;
  needInternal?: boolean;
  lvnPct?: number;
  absDelta?: number;
  absPocZone?: number;
  noResultPct?: number;
  shiftDelta?: number;
  setupBars?: number;
  partMode?: 'Relative' | 'Absolute' | 'Off';
  partMult?: number;
  partLen?: number;
  partAbs?: number;
  stopBufAtr?: number;
  minR?: number;
  reclaimBars?: number;
  beAtR?: number;
  trailStartR?: number;
  waveLen?: number;
  pressLen?: number;
  waveAmp?: number;
  eqTol?: number;
  maxLiq?: number;
  ineffMin?: number;
  maxIneff?: number;
  impMult?: number;
  maxImp?: number;
  footBars?: number;
  footRows?: number;
  imbRatio?: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function formatOfsK(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(abs / 1_000).toFixed(1)}K`;
  return `${Math.round(abs)}`;
}

export function computeAtrSeries(candles: Candle[], period: number = 14): number[] {
  const tr: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      tr.push(Math.max(candles[i].high - candles[i].low, 1e-6));
    } else {
      const c = candles[i];
      const prevClose = candles[i - 1].close;
      tr.push(Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose), 1e-6));
    }
  }
  const atr: number[] = [];
  let rma = tr[0] || 1e-4;
  for (let i = 0; i < tr.length; i++) {
    if (i < period) {
      let s = 0;
      for (let j = 0; j <= i; j++) s += tr[j];
      rma = s / (i + 1);
    } else {
      rma = (rma * (period - 1) + tr[i]) / period;
    }
    atr.push(rma);
  }
  return atr;
}

export function computeSwingStructure(candles: Candle[], swingLen: number = 5): Array<1 | -1 | 0> {
  const out: Array<1 | -1 | 0> = new Array(candles.length).fill(0);
  let h1: number | null = null;
  let h2: number | null = null;
  let l1: number | null = null;
  let l2: number | null = null;

  for (let i = 0; i < candles.length; i++) {
    if (i >= swingLen * 2) {
      const pivIdx = i - swingLen;
      const pivHigh = candles[pivIdx].high;
      const pivLow = candles[pivIdx].low;
      let isPH = true;
      let isPL = true;
      for (let k = pivIdx - swingLen; k <= pivIdx + swingLen; k++) {
        if (k === pivIdx) continue;
        if (candles[k].high >= pivHigh) isPH = false;
        if (candles[k].low <= pivLow) isPL = false;
      }
      if (isPH) {
        h2 = h1;
        h1 = pivHigh;
      }
      if (isPL) {
        l2 = l1;
        l1 = pivLow;
      }
    }

    if (h1 !== null && h2 !== null && l1 !== null && l2 !== null) {
      if (h1 > h2 && l1 > l2) out[i] = 1;
      else if (h1 < h2 && l1 < l2) out[i] = -1;
      else out[i] = 0;
    }
  }
  return out;
}

function aggregateCandles(candles: Candle[], factor: number): Candle[] {
  if (factor <= 1 || candles.length < factor * 4) return candles;
  const agg: Candle[] = [];
  for (let i = 0; i < candles.length; i += factor) {
    const slice = candles.slice(i, i + factor);
    if (slice.length === 0) continue;
    let high = -Infinity;
    let low = Infinity;
    let volume = 0;
    for (const c of slice) {
      if (c.high > high) high = c.high;
      if (c.low < low) low = c.low;
      volume += c.volume;
    }
    agg.push({
      timestamp: slice[0].timestamp,
      open: slice[0].open,
      high,
      low,
      close: slice[slice.length - 1].close,
      volume,
      dateStr: slice[0].dateStr ?? new Date(slice[0].timestamp).toISOString().slice(0, 10),
    });
  }
  return agg;
}

function computeValueAreaFromMap(
  bins: Map<number, number>,
  minK: number,
  maxK: number,
  step: number,
  vaPct: number = 0.7
): { poc: number; vah: number; val: number; maxVol: number } | null {
  if (step <= 0 || bins.size === 0 || minK > maxK) return null;
  let pocK = minK;
  let maxVol = -1;
  let totalVol = 0;

  for (let k = minK; k <= maxK; k++) {
    const v = bins.get(k) ?? 0;
    totalVol += v;
    if (v > maxVol) {
      maxVol = v;
      pocK = k;
    }
  }
  if (totalVol <= 0) return null;

  let acc = bins.get(pocK) ?? 0;
  let upK = pocK;
  let dnK = pocK;
  const target = totalVol * vaPct;

  while (acc < target && (upK < maxK || dnK > minK)) {
    const vUp = upK < maxK ? (bins.get(upK + 1) ?? 0) : -1;
    const vDn = dnK > minK ? (bins.get(dnK - 1) ?? 0) : -1;
    if (vUp < 0 && vDn < 0) break;
    if (vUp >= vDn) {
      upK += 1;
      acc += Math.max(0, vUp);
    } else {
      dnK -= 1;
      acc += Math.max(0, vDn);
    }
  }

  return {
    poc: (pocK + 0.5) * step,
    vah: (upK + 1) * step,
    val: dnK * step,
    maxVol,
  };
}

function bucketSessionKey(tsMs: number, timeframe: string): string {
  const d = new Date(tsMs);
  if (timeframe === '1d' || timeframe === '1wk') {
    // Group daily candles into monthly profiles so developing VA builds smoothly across the month
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function calculateOrderFlowStrategy(
  rawCandles: Candle[],
  ltfCandles: Candle[] = [],
  cfg: OfsConfig = {}
): OfsReport {
  const symbol = cfg.symbol || 'MARKET';
  const timeframe = cfg.timeframe || '5m';
  const swingLen = cfg.swingLen ?? 5;
  const legLookback = cfg.legLookback ?? 45;
  const fibA = cfg.fibA ?? 0.705;
  const fibB = cfg.fibB ?? 0.788;
  const fibC = cfg.fibC ?? 0.886;
  const needOutsideVA = cfg.needOutsideVA ?? true;
  const needInternal = cfg.needInternal ?? true;
  const lvnPct = cfg.lvnPct ?? 30;
  const absDelta = cfg.absDelta ?? 15;
  const absPocZone = cfg.absPocZone ?? 35;
  const noResultPct = cfg.noResultPct ?? 30;
  const shiftDelta = cfg.shiftDelta ?? 10;
  const setupBars = cfg.setupBars ?? 8;
  const partMode = cfg.partMode ?? 'Relative';
  const partMult = cfg.partMult ?? 1.0;
  const partLen = cfg.partLen ?? 50;
  const partAbs = cfg.partAbs ?? 20000;
  const stopBufAtr = cfg.stopBufAtr ?? 0.1;
  const minR = cfg.minR ?? 1.5;
  const reclaimBars = cfg.reclaimBars ?? 6;
  const beAtR = cfg.beAtR ?? 1.0;
  const trailStartR = cfg.trailStartR ?? 1.5;
  const waveLen = cfg.waveLen ?? 21;
  const pressLen = cfg.pressLen ?? 8;
  const waveAmp = cfg.waveAmp ?? 1.2;
  const eqTol = cfg.eqTol ?? 0.15;
  const maxLiq = cfg.maxLiq ?? 4;
  const ineffMin = cfg.ineffMin ?? 0.4;
  const maxIneff = cfg.maxIneff ?? 5;
  const impMult = cfg.impMult ?? 1.3;
  const maxImp = cfg.maxImp ?? 8;
  const footBars = cfg.footBars ?? 12;
  const footRows = cfg.footRows ?? 6;
  const imbRatio = cfg.imbRatio ?? 4.0;

  // Deduplicate & sort strictly ascending
  const seenTs = new Set<number>();
  const candles = [...rawCandles]
    .sort((a, b) => a.timestamp - b.timestamp)
    .filter((c) => {
      const s = Math.floor(c.timestamp / 1000);
      if (seenTs.has(s)) return false;
      seenTs.add(s);
      return true;
    });

  const sortedLtf = [...ltfCandles].sort((a, b) => a.timestamp - b.timestamp);
  const barStepMs =
    candles.length >= 2
      ? Math.max(60_000, Math.min(...candles.slice(1).map((c, idx) => Math.max(60_000, c.timestamp - candles[idx].timestamp))))
      : 300_000;

  if (candles.length === 0) {
    return {
      symbol,
      timeframe,
      candles: [],
      waves: [],
      valueAreaSeries: [],
      longZone: null,
      shortZone: null,
      footprints: [],
      absorptions: [],
      firstShifts: [],
      liquidityZones: [],
      inefficiencies: [],
      impulses: [],
      trades: [],
      dashboard: {
        market: symbol,
        timeframe,
        lastPrice: 0,
        atr: 0,
        structure: 0,
        structureLabel: 'Balance',
        setupStateText: 'BALANCE',
        setupStateTone: 'silver',
        setupStateSolid: false,
        nextStepText: 'Waiting for OHLCV market data',
        flowSharePct: 50,
        flowNet: 0,
        buyAggressionPct: 50,
        sellAggressionPct: 50,
        participationRelVol: null,
        participationOk: false,
        absorptionQuality: null,
        pocPos: 50,
        pocLocationLabel: 'Middle of candle',
        sessionDelta: 0,
        setupProgress: 0,
        steps: {
          environment: { label: 'Balance', state: -1 },
          location: { label: 'Building Value', state: -1 },
          confirmation: { label: 'Waiting', state: -1 },
          riskRules: { label: '0/2 trades', state: -1 },
        },
        mtfRows: [],
        valueArea: { val: null, poc: null, vah: null, pos: 'UNKNOWN' },
        activeZone: null,
        nearestBSL: null,
        nearestSSL: null,
        nextTarget: null,
        activeTrade: null,
        lastTrade: null,
        usedLowerTimeframe: false,
      },
    };
  }

  const atrArr = computeAtrSeries(candles, 14);
  const structArr = computeSwingStructure(candles, swingLen);
  const structMid = computeSwingStructure(aggregateCandles(candles, 4), Math.max(3, swingLen - 1));
  const structHi = computeSwingStructure(aggregateCandles(candles, 12), 3);

  // Map LTF bars per parent bar
  let ltfCursor = 0;
  let usedLowerTimeframe = false;

  // Session Value Area state
  let currentSession = '';
  const devMap = new Map<number, number>();
  let devStep = Math.max(1e-4, (atrArr[0] || 1) * 0.18);
  let devMinK: number | null = null;
  let devMaxK: number | null = null;
  let devBars = 0;
  let dMax = 0;
  let sessDelta = 0;

  let priorVa: { poc: number; vah: number; val: number; maxVol: number } | null = null;
  let currentVa: { poc: number; vah: number; val: number; maxVol: number } | null = null;

  const valueAreaSeries: OfsValueAreaPoint[] = [];
  const waves: OfsWavePoint[] = [];
  const absorptions: OfsAbsorptionEvent[] = [];
  const firstShifts: OfsFirstShiftEvent[] = [];
  const footprints: OfsFootprintBar[] = [];
  const liquidityZones: OfsLiquidityZone[] = [];
  const inefficiencies: OfsInefficiencyCorridor[] = [];
  const impulses: OfsImpulseCandle[] = [];
  const trades: OfsTradeRecord[] = [];

  // Long/short impulse leg trackers
  let lastPLBar = -1;
  let lastPLPrice = 0;
  let lastPHBar = -1;
  let lastPHPrice = 0;

  let lValid = false;
  let lInternal = false;
  let lH = 0;
  let lL = 0;
  let lHBar = 0;
  let lLBar = 0;

  let sValid = false;
  let sInternal = false;
  let sL = 0;
  let sH = 0;
  let sLBar = 0;
  let sHBar = 0;

  // EMA trackers for flow pressure wave
  const kPress = 2 / (pressLen + 1);
  const kWave = 2 / (waveLen + 1);
  const kAmp = 2 / (3 + 1);
  let wBuyE = 0.5;
  let wSellE = 0.5;
  let wMid = (candles[0].high + candles[0].low) / 2;
  let wUpAmp = atrArr[0] * waveAmp * 0.75;
  let wDnAmp = atrArr[0] * waveAmp * 0.75;
  let flowState: 1 | -1 | 0 = 0;

  // State machine trackers
  let lState: 0 | 1 | 2 = 0;
  let lAbsLow = 0;
  let lAbsHigh = 0;
  let lAbsBar = -1;
  let lShiftClose = 0;
  let lRetest: number | null = null;
  let lRetestBar = -1;

  let sState: 0 | 1 | 2 = 0;
  let sAbsHigh = 0;
  let sAbsLow = 0;
  let sAbsBar = -1;
  let sShiftClose = 0;
  let sRetest: number | null = null;
  let sRetestBar = -1;

  let activeTrade: OfsTradeRecord | null = null;
  let lastTrade: OfsTradeRecord | null = null;
  let setupAQ: number | null = null;
  let tradesToday = 0;
  let lossStreak = 0;

  let lastGapUpBar = -1000;
  let lastGapDnBar = -1000;

  let lastBarDeltaPct = 0;
  let lastPocPos = 50;
  let lastRelVol: number | null = null;
  let lastPartOk = true;
  let lastZoneSnapshot: { longZone: OfsZone | null; shortZone: OfsZone | null } = {
    longZone: null,
    shortZone: null,
  };

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const timeSec = Math.floor(c.timestamp / 1000);
    const atrV = Math.max(atrArr[i] || (c.high - c.low) || 1e-4, 1e-6);
    const cRange = Math.max(c.high - c.low, 0);

    // 1. Session reset & developing Value Area
    const sess = bucketSessionKey(c.timestamp, timeframe);
    if (sess !== currentSession) {
      if (devBars > 0 && currentVa) {
        priorVa = currentVa;
      }
      currentSession = sess;
      devMap.clear();
      devStep = Math.max(1e-4, atrV * 0.18);
      devMinK = null;
      devMaxK = null;
      devBars = 0;
      sessDelta = 0;
    }

    if (c.volume > 0 && devStep > 0) {
      const kLo = Math.floor(c.low / devStep);
      const kHi = Math.max(kLo, Math.min(kLo + 300, Math.floor(c.high / devStep)));
      const share = c.volume / (kHi - kLo + 1);
      for (let k = kLo; k <= kHi; k++) {
        devMap.set(k, (devMap.get(k) ?? 0) + share);
      }
      devMinK = devMinK === null ? kLo : Math.min(devMinK, kLo);
      devMaxK = devMaxK === null ? kHi : Math.max(devMaxK, kHi);
    }
    devBars += 1;

    if (devMinK !== null && devMaxK !== null) {
      const va = computeValueAreaFromMap(devMap, devMinK, devMaxK, devStep, 0.7);
      if (va) {
        currentVa = va;
        dMax = va.maxVol;
      }
    }

    const effectiveVa = devBars >= 4 && currentVa ? currentVa : priorVa ?? currentVa;
    const vaPOC = effectiveVa?.poc ?? c.close;
    const vaHigh = effectiveVa?.vah ?? c.high;
    const vaLow = effectiveVa?.val ?? c.low;

    if (effectiveVa) {
      valueAreaSeries.push({
        time: timeSec,
        barIndex: i,
        vaHigh,
        vaLow,
        vaPOC,
      });
    }

    // 2. Order Flow Estimation from Lower-Timeframe Bars (or honest single-bar estimate)
    const barEndMs = i + 1 < candles.length ? candles[i + 1].timestamp : c.timestamp + barStepMs;
    while (ltfCursor < sortedLtf.length && sortedLtf[ltfCursor].timestamp < c.timestamp) {
      ltfCursor++;
    }
    const barLtfs: Candle[] = [];
    let scanIdx = ltfCursor;
    while (scanIdx < sortedLtf.length && sortedLtf[scanIdx].timestamp < barEndMs) {
      barLtfs.push(sortedLtf[scanIdx]);
      scanIdx++;
    }

    let barDelta = 0;
    let barVol = c.volume;
    let volPoc = (c.high + c.low) / 2;
    let thisBarUsedLtf = false;

    if (barLtfs.length >= 2) {
      thisBarUsedLtf = true;
      usedLowerTimeframe = true;
      let sumVol = 0;
      let maxLtfVol = -1;
      for (const lb of barLtfs) {
        const v = Math.max(0, lb.volume);
        sumVol += v;
        if (lb.close > lb.open) barDelta += v;
        else if (lb.close < lb.open) barDelta -= v;
        if (v > maxLtfVol) {
          maxLtfVol = v;
          volPoc = (lb.high + lb.low) / 2;
        }
      }
      if (sumVol > 0) barVol = sumVol;
    } else {
      // Bar-level delta approximation when lower timeframe history isn't present
      const closeRatio = cRange > 0 ? (c.close - c.low) / cRange : 0.5;
      const bodySign = c.close > c.open ? 1 : c.close < c.open ? -1 : 0;
      const netBias = bodySign !== 0 ? (closeRatio - 0.5) * 1.4 + bodySign * 0.3 : (closeRatio - 0.5) * 2;
      barDelta = c.volume * clamp(netBias, -1, 1);
      // Estimate candle POC toward the wick when absorption / rejection occurs, else near close/mid
      const upperWick = c.high - Math.max(c.open, c.close);
      const lowerWick = Math.min(c.open, c.close) - c.low;
      if (lowerWick > upperWick * 1.5 && closeRatio >= 0.45) {
        volPoc = c.low + cRange * 0.22;
      } else if (upperWick > lowerWick * 1.5 && closeRatio <= 0.55) {
        volPoc = c.low + cRange * 0.78;
      } else {
        volPoc = (c.high + c.low + c.close) / 3;
      }
    }

    sessDelta += barDelta;
    const deltaPct = barVol > 0 ? clamp((barDelta / barVol) * 100, -100, 100) : 0;
    const pocPos = cRange > 0 ? clamp(((volPoc - c.low) / cRange) * 100, 0, 100) : 50;
    const closePos = cRange > 0 ? clamp(((c.close - c.low) / cRange) * 100, 0, 100) : 50;
    lastBarDeltaPct = deltaPct;
    lastPocPos = pocPos;

    // Footprint cells for recent N bars
    if (i >= Math.max(0, candles.length - footBars) && cRange > 0) {
      const rowStep = cRange / footRows;
      const buyRows = new Array(footRows).fill(0);
      const sellRows = new Array(footRows).fill(0);

      if (barLtfs.length >= 2) {
        for (const lb of barLtfs) {
          const rLo = clamp(Math.floor((lb.low - c.low) / rowStep), 0, footRows - 1);
          const rHi = clamp(Math.floor((lb.high - c.low) / rowStep), rLo, footRows - 1);
          const share = Math.max(0, lb.volume) / (rHi - rLo + 1);
          for (let r = rLo; r <= rHi; r++) {
            if (lb.close > lb.open) buyRows[r] += share;
            else if (lb.close < lb.open) sellRows[r] += share;
            else {
              buyRows[r] += share * 0.5;
              sellRows[r] += share * 0.5;
            }
          }
        }
      } else {
        // Partition volume smoothly across 6 price rows based on bar shape & estimated delta
        const buyRatio = clamp((100 + deltaPct) / 200, 0.15, 0.85);
        const totalV = Math.max(c.volume, 1);
        for (let r = 0; r < footRows; r++) {
          const rowMid = c.low + (r + 0.5) * rowStep;
          const distFromPoc = Math.abs(rowMid - volPoc) / Math.max(cRange, 1e-6);
          const weight = Math.max(0.25, 1.25 - distFromPoc * 1.4);
          buyRows[r] = totalV * weight * buyRatio * 0.25;
          sellRows[r] = totalV * weight * (1 - buyRatio) * 0.25;
        }
      }

      let maxSide = 1e-6;
      let maxTotal = -1;
      let pocRow = 0;
      for (let r = 0; r < footRows; r++) {
        maxSide = Math.max(maxSide, buyRows[r], sellRows[r]);
        const tot = buyRows[r] + sellRows[r];
        if (tot > maxTotal) {
          maxTotal = tot;
          pocRow = r;
        }
      }

      const rows: OfsFootprintRow[] = [];
      for (let r = 0; r < footRows; r++) {
        const bv = buyRows[r];
        const sv = sellRows[r];
        rows.push({
          bot: c.low + r * rowStep,
          top: c.low + (r + 1) * rowStep,
          buyVol: bv,
          sellVol: sv,
          sellImbalance: bv > 0 ? sv >= bv * imbRatio : sv > maxSide * 0.35,
          buyImbalance: sv > 0 ? bv >= sv * imbRatio : bv > maxSide * 0.35,
          isPoc: r === pocRow,
          sellIntensity: clamp(sv / maxSide, 0.08, 1),
          buyIntensity: clamp(bv / maxSide, 0.08, 1),
        });
      }

      footprints.push({
        barIndex: i,
        time: timeSec,
        low: c.low,
        high: c.high,
        open: c.open,
        close: c.close,
        delta: barDelta,
        deltaPct,
        pocPos,
        closePos,
        usedLtf: thisBarUsedLtf,
        rows,
      });
    }

    // 3. Relative Volume / Participation
    let volSma = 0;
    const volStart = Math.max(0, i - partLen + 1);
    for (let k = volStart; k <= i; k++) volSma += candles[k].volume;
    volSma /= i - volStart + 1;
    const relVol = volSma > 0 ? c.volume / volSma : null;
    lastRelVol = relVol;
    const partOk =
      partMode === 'Off'
        ? true
        : partMode === 'Absolute'
        ? c.volume >= partAbs
        : relVol === null || relVol >= partMult;
    lastPartOk = partOk;

    // 4. Order Flow Pressure Wave
    const wShareBar = barVol > 0 ? clamp((barVol + barDelta) / (2 * barVol), 0, 1) : closePos / 100;
    const wWeight = relVol === null ? 1.0 : clamp(relVol, 0.5, 2.0);
    wBuyE = i === 0 ? wShareBar * wWeight : wShareBar * wWeight * kPress + wBuyE * (1 - kPress);
    wSellE = i === 0 ? (1 - wShareBar) * wWeight : (1 - wShareBar) * wWeight * kPress + wSellE * (1 - kPress);
    const flowShare = wBuyE + wSellE > 0 ? wBuyE / (wBuyE + wSellE) : 0.5;
    const flowNet = 2 * flowShare - 1;
    if (flowNet > 0.08) flowState = 1;
    else if (flowNet < -0.08) flowState = -1;

    const hl2 = (c.high + c.low) / 2;
    wMid = i === 0 ? hl2 : hl2 * kWave + wMid * (1 - kWave);
    const upRaw = atrV * waveAmp * (0.25 + flowShare);
    const dnRaw = atrV * waveAmp * (1.25 - flowShare);
    wUpAmp = i === 0 ? upRaw : upRaw * kAmp + wUpAmp * (1 - kAmp);
    wDnAmp = i === 0 ? dnRaw : dnRaw * kAmp + wDnAmp * (1 - kAmp);

    waves.push({
      time: timeSec,
      barIndex: i,
      wMid,
      wUpOuter: wMid + wUpAmp,
      wUpInner: wMid + wUpAmp * 0.55,
      wDnInner: wMid - wDnAmp * 0.55,
      wDnOuter: wMid - wDnAmp,
      flowShare,
      flowNet,
      flowState,
    });

    // 5. Pivots & Liquidity Zones (BSL / SSL)
    if (i >= swingLen * 2) {
      const pivIdx = i - swingLen;
      const pivHigh = candles[pivIdx].high;
      const pivLow = candles[pivIdx].low;
      let isPH = true;
      let isPL = true;
      for (let k = pivIdx - swingLen; k <= pivIdx + swingLen; k++) {
        if (k === pivIdx) continue;
        if (candles[k].high >= pivHigh) isPH = false;
        if (candles[k].low <= pivLow) isPL = false;
      }

      if (isPH) {
        lastPHBar = pivIdx;
        lastPHPrice = pivHigh;
        // Liquidity zone BSL
        const merged = liquidityZones.find((z) => z.isHigh && !z.swept && Math.abs(z.price - pivHigh) <= atrV * eqTol);
        if (merged) {
          merged.price = (merged.price * merged.touches + pivHigh) / (merged.touches + 1);
          merged.touches += 1;
          merged.top = merged.price + atrV * 0.12;
          merged.bot = merged.price - atrV * 0.12;
        } else {
          liquidityZones.push({
            id: `bsl-${pivIdx}`,
            price: pivHigh,
            top: pivHigh + atrV * 0.12,
            bot: pivHigh - atrV * 0.12,
            isHigh: true,
            touches: 1,
            startBar: pivIdx,
            startTime: Math.floor(candles[pivIdx].timestamp / 1000),
            endBar: i,
            endTime: timeSec,
            swept: false,
          });
        }

        // Long Impulse Leg detection
        if (!lValid || pivHigh >= lH) {
          let lowB = pivHigh;
          let lowIdx = pivIdx;
          const scanStart = Math.max(0, pivIdx - legLookback);
          for (let k = scanStart; k <= pivIdx; k++) {
            if (candles[k].low < lowB) {
              lowB = candles[k].low;
              lowIdx = k;
            }
          }
          let maxRecent = pivHigh;
          for (let k = Math.max(0, i - swingLen); k <= i; k++) {
            if (candles[k].high > maxRecent) maxRecent = candles[k].high;
          }
          lH = maxRecent;
          lHBar = pivIdx;
          lL = lowB;
          lLBar = lowIdx;
          lInternal = lastPLBar > lLBar && lastPLBar < lHBar && lastPLPrice > lL;
          lValid = lH > lL;
        }
      }

      if (isPL) {
        lastPLBar = pivIdx;
        lastPLPrice = pivLow;
        // Liquidity zone SSL
        const merged = liquidityZones.find((z) => !z.isHigh && !z.swept && Math.abs(z.price - pivLow) <= atrV * eqTol);
        if (merged) {
          merged.price = (merged.price * merged.touches + pivLow) / (merged.touches + 1);
          merged.touches += 1;
          merged.top = merged.price + atrV * 0.12;
          merged.bot = merged.price - atrV * 0.12;
        } else {
          liquidityZones.push({
            id: `ssl-${pivIdx}`,
            price: pivLow,
            top: pivLow + atrV * 0.12,
            bot: pivLow - atrV * 0.12,
            isHigh: false,
            touches: 1,
            startBar: pivIdx,
            startTime: Math.floor(candles[pivIdx].timestamp / 1000),
            endBar: i,
            endTime: timeSec,
            swept: false,
          });
        }

        // Short Impulse Leg detection
        if (!sValid || pivLow <= sL) {
          let highB = pivLow;
          let highIdx = pivIdx;
          const scanStart = Math.max(0, pivIdx - legLookback);
          for (let k = scanStart; k <= pivIdx; k++) {
            if (candles[k].high > highB) {
              highB = candles[k].high;
              highIdx = k;
            }
          }
          let minRecent = pivLow;
          for (let k = Math.max(0, i - swingLen); k <= i; k++) {
            if (candles[k].low < minRecent) minRecent = candles[k].low;
          }
          sL = minRecent;
          sLBar = pivIdx;
          sH = highB;
          sHBar = highIdx;
          sInternal = lastPHBar > sHBar && lastPHBar < sLBar && lastPHPrice < sH;
          sValid = sH > sL;
        }
      }
    }

    if (lValid) lH = Math.max(lH, c.high);
    if (sValid) sL = Math.min(sL, c.low);

    // Update liquidity zone sweeps & bounds
    for (let idx = liquidityZones.length - 1; idx >= 0; idx--) {
      const z = liquidityZones[idx];
      if (z.swept || i <= z.startBar) continue;
      z.endBar = i;
      z.endTime = timeSec;
      if (z.isHigh) {
        if (c.close > z.price) {
          // Close beyond removes zone
          liquidityZones.splice(idx, 1);
        } else if (c.high > z.price && c.close <= z.price) {
          z.swept = true;
          z.sweptBar = i;
          z.sweptTime = timeSec;
          z.sweepExtreme = c.high;
        }
      } else {
        if (c.close < z.price) {
          liquidityZones.splice(idx, 1);
        } else if (c.low < z.price && c.close >= z.price) {
          z.swept = true;
          z.sweptBar = i;
          z.sweptTime = timeSec;
          z.sweepExtreme = c.low;
        }
      }
    }

    // 6. Inefficiency Corridors & Impulse Candles
    for (const gap of inefficiencies) {
      if (gap.active && i > gap.startBar) {
        gap.endBar = i;
        gap.endTime = timeSec;
        if (gap.dir === 1) {
          const prevLow = c.low;
          const currentFilledDist = Math.max(0, gap.top - prevLow);
          const span = Math.max(gap.top - gap.bot, 1e-6);
          gap.fillPct = Math.max(gap.fillPct, clamp((currentFilledDist / span) * 100, 0, 100));
          if (c.low <= gap.bot) gap.active = false;
        } else {
          const currentFilledDist = Math.max(0, c.high - gap.bot);
          const span = Math.max(gap.top - gap.bot, 1e-6);
          gap.fillPct = Math.max(gap.fillPct, clamp((currentFilledDist / span) * 100, 0, 100));
          if (c.high >= gap.top) gap.active = false;
        }
        gap.label =
          (gap.dir === 1 ? 'Inefficiency ▲ · ' : 'Inefficiency ▼ · ') +
          (gap.fillPct >= 99.5 ? 'Filled ✓' : gap.fillPct <= 2 ? 'Unfilled' : `${Math.round(gap.fillPct)}% filled`);
      }
    }
    if (i >= 2) {
      const prev2 = candles[i - 2];
      const prev1 = candles[i - 1];
      if (c.low > prev2.high && prev1.close > prev1.open && c.low - prev2.high >= atrV * ineffMin && i - lastGapUpBar >= 3) {
        inefficiencies.push({
          id: `gap-up-${i}`,
          dir: 1,
          top: c.low,
          bot: prev2.high,
          startBar: i - 2,
          startTime: Math.floor(prev2.timestamp / 1000),
          endBar: i,
          endTime: timeSec,
          active: true,
          fillPct: 0,
          label: 'Inefficiency ▲ · Unfilled',
        });
        lastGapUpBar = i;
      } else if (c.high < prev2.low && prev1.close < prev1.open && prev2.low - c.high >= atrV * ineffMin && i - lastGapDnBar >= 3) {
        inefficiencies.push({
          id: `gap-dn-${i}`,
          dir: -1,
          top: prev2.low,
          bot: c.high,
          startBar: i - 2,
          startTime: Math.floor(prev2.timestamp / 1000),
          endBar: i,
          endTime: timeSec,
          active: true,
          fillPct: 0,
          label: 'Inefficiency ▼ · Unfilled',
        });
        lastGapDnBar = i;
      }
      while (inefficiencies.length > maxIneff) inefficiencies.shift();
    }

    const cBody = Math.abs(c.close - c.open);
    const impUp = c.close > c.open && cRange > 0 && cBody >= impMult * atrV && cBody / cRange >= 0.6 && closePos >= 70 && (relVol === null || relVol >= 1.2);
    const impDn = c.close < c.open && cRange > 0 && cBody >= impMult * atrV && cBody / cRange >= 0.6 && closePos <= 30 && (relVol === null || relVol >= 1.2);
    if (impUp || impDn) {
      impulses.push({
        barIndex: i,
        time: timeSec,
        high: c.high,
        low: c.low,
        up: impUp,
        deltaPct,
        atrMultiple: Number((cBody / atrV).toFixed(1)),
        relVol: relVol ?? 1.0,
      });
      while (impulses.length > maxImp) impulses.shift();
    }

    // 7. Zone Calculation & 0.886 Invalidation
    const lRange = Math.max(0, lH - lL);
    const lz1 = lH - fibA * lRange;
    const lz2 = lH - fibB * lRange;
    const lz3 = lH - fibC * lRange;
    const sRange = Math.max(0, sH - sL);
    const sz1 = sL + fibA * sRange;
    const sz2 = sL + fibB * sRange;
    const sz3 = sL + fibC * sRange;

    if (lValid && c.close < lz3) lValid = false;
    if (sValid && c.close > sz3) sValid = false;

    const lZoneReady = lValid && (!needInternal || lInternal) && (!needOutsideVA || lz1 <= vaLow);
    const sZoneReady = sValid && (!needInternal || sInternal) && (!needOutsideVA || sz1 >= vaHigh);
    const longLoc = lZoneReady && c.low <= lz1 && c.close >= lz3;
    const shortLoc = sZoneReady && c.high >= sz1 && c.close <= sz3;

    // Zone volume classification
    const classifyZoneVol = (zTop: number, zBot: number): 'THIN' | 'UNTESTED' | 'NORMAL' | 'UNKNOWN' => {
      if (!effectiveVa || devStep <= 0 || devMinK === null || devMaxK === null || dMax <= 0) return 'UNKNOWN';
      const z0 = Math.floor(zBot / devStep);
      const z1 = Math.floor(zTop / devStep);
      if (z1 < devMinK || z0 > devMaxK) return 'UNTESTED';
      const i0 = Math.max(z0, devMinK);
      const i1 = Math.min(z1, devMaxK);
      let sumV = 0;
      for (let k = i0; k <= i1; k++) sumV += devMap.get(k) ?? 0;
      const avg = sumV / Math.max(1, i1 - i0 + 1);
      return avg < (dMax * lvnPct) / 100 ? 'THIN' : 'NORMAL';
    };

    lastZoneSnapshot = {
      longZone: lValid
        ? {
            side: 1,
            ready: lZoneReady,
            inZone: longLoc,
            top: lz1,
            mid: lz2,
            bottom: lz3,
            z705: lz1,
            z788: lz2,
            z886: lz3,
            legHigh: lH,
            legLow: lL,
            legStartBar: lLBar,
            legEndBar: lHBar,
            legStartTime: Math.floor((candles[lLBar] ?? c).timestamp / 1000),
            legEndTime: Math.floor((candles[lHBar] ?? c).timestamp / 1000),
            volumeProfileClass: classifyZoneVol(lz1, lz3),
          }
        : null,
      shortZone: sValid
        ? {
            side: -1,
            ready: sZoneReady,
            inZone: shortLoc,
            top: sz3,
            mid: sz2,
            bottom: sz1,
            z705: sz1,
            z788: sz2,
            z886: sz3,
            legHigh: sH,
            legLow: sL,
            legStartBar: sHBar,
            legEndBar: sLBar,
            legStartTime: Math.floor((candles[sHBar] ?? c).timestamp / 1000),
            legEndTime: Math.floor((candles[sLBar] ?? c).timestamp / 1000),
            volumeProfileClass: classifyZoneVol(sz3, sz1),
          }
        : null,
    };

    // 8. Trade Management on Closed Bars (conservative stop-first check)
    if (activeTrade) {
      let closedNow = false;
      if (activeTrade.side === 1) {
        if (c.low <= activeTrade.stopPrice) {
          activeTrade.status = activeTrade.trailing ? 'TRAIL_STOP' : activeTrade.beMoved ? 'BREAKEVEN' : 'STOPPED';
          activeTrade.exitPrice = activeTrade.stopPrice;
          closedNow = true;
        } else if (c.high >= activeTrade.targetPrice) {
          activeTrade.status = 'TARGET_HIT';
          activeTrade.exitPrice = activeTrade.targetPrice;
          closedNow = true;
        } else {
          if (c.close > vaLow && activeTrade.status === 'ACTIVE') {
            activeTrade.status = 'VALUE_RECLAIMED';
          }
          if (!activeTrade.beMoved && beAtR > 0 && c.high >= activeTrade.entryPrice + beAtR * activeTrade.riskPerUnit) {
            activeTrade.stopPrice = Math.max(activeTrade.stopPrice, activeTrade.entryPrice);
            activeTrade.beMoved = true;
            activeTrade.status = 'STOP_AT_ENTRY';
          }
          if (!activeTrade.beMoved && c.close <= vaLow && i - activeTrade.entryBar >= reclaimBars) {
            activeTrade.stopPrice = Math.max(activeTrade.stopPrice, activeTrade.entryPrice);
            activeTrade.beMoved = true;
            activeTrade.status = 'NO_RECLAIM_STOP_AT_ENTRY';
          }
          if (!activeTrade.trailing && c.high >= activeTrade.trailTrigger) {
            activeTrade.trailing = true;
            activeTrade.status = 'TRAILING';
          }
          if (activeTrade.trailing && c.close > c.open && deltaPct >= shiftDelta) {
            activeTrade.stopPrice = Math.max(activeTrade.stopPrice, c.low - stopBufAtr * atrV);
            activeTrade.status = 'TRAILING';
          }
        }
        activeTrade.openR =
          activeTrade.riskPerUnit > 0 ? (c.close - activeTrade.entryPrice) / activeTrade.riskPerUnit : 0;
      } else {
        if (c.high >= activeTrade.stopPrice) {
          activeTrade.status = activeTrade.trailing ? 'TRAIL_STOP' : activeTrade.beMoved ? 'BREAKEVEN' : 'STOPPED';
          activeTrade.exitPrice = activeTrade.stopPrice;
          closedNow = true;
        } else if (c.low <= activeTrade.targetPrice) {
          activeTrade.status = 'TARGET_HIT';
          activeTrade.exitPrice = activeTrade.targetPrice;
          closedNow = true;
        } else {
          if (c.close < vaHigh && activeTrade.status === 'ACTIVE') {
            activeTrade.status = 'VALUE_RECLAIMED';
          }
          if (!activeTrade.beMoved && beAtR > 0 && c.low <= activeTrade.entryPrice - beAtR * activeTrade.riskPerUnit) {
            activeTrade.stopPrice = Math.min(activeTrade.stopPrice, activeTrade.entryPrice);
            activeTrade.beMoved = true;
            activeTrade.status = 'STOP_AT_ENTRY';
          }
          if (!activeTrade.beMoved && c.close >= vaHigh && i - activeTrade.entryBar >= reclaimBars) {
            activeTrade.stopPrice = Math.min(activeTrade.stopPrice, activeTrade.entryPrice);
            activeTrade.beMoved = true;
            activeTrade.status = 'NO_RECLAIM_STOP_AT_ENTRY';
          }
          if (!activeTrade.trailing && c.low <= activeTrade.trailTrigger) {
            activeTrade.trailing = true;
            activeTrade.status = 'TRAILING';
          }
          if (activeTrade.trailing && c.close < c.open && deltaPct <= -shiftDelta) {
            activeTrade.stopPrice = Math.min(activeTrade.stopPrice, c.high + stopBufAtr * atrV);
            activeTrade.status = 'TRAILING';
          }
        }
        activeTrade.openR =
          activeTrade.riskPerUnit > 0 ? (activeTrade.entryPrice - c.close) / activeTrade.riskPerUnit : 0;
      }

      if (closedNow) {
        activeTrade.exitBar = i;
        activeTrade.exitTime = timeSec;
        const exitPx = activeTrade.exitPrice ?? c.close;
        activeTrade.exitR =
          activeTrade.riskPerUnit > 0
            ? (activeTrade.side * (exitPx - activeTrade.entryPrice)) / activeTrade.riskPerUnit
            : 0;
        if (activeTrade.status === 'STOPPED') lossStreak += 1;
        else if (activeTrade.status === 'TARGET_HIT' || activeTrade.status === 'TRAIL_STOP') lossStreak = 0;
        lastTrade = { ...activeTrade };
        activeTrade = null;
      }
    }

    // 9. Absorption & State Machine
    const bias = structArr[i];
    const sellerAbsorbed = cRange > 0 && deltaPct <= -absDelta && pocPos <= absPocZone && closePos >= noResultPct;
    const buyerAbsorbed = cRange > 0 && deltaPct >= absDelta && pocPos >= 100 - absPocZone && closePos <= 100 - noResultPct;

    const aqLong = clamp(
      35 * clamp(-deltaPct / 40, 0, 1) +
        25 * clamp((absPocZone - pocPos) / absPocZone, 0, 1) +
        25 * clamp((closePos - noResultPct) / (100 - noResultPct), 0, 1) +
        15 * clamp((relVol ?? 1) / 2, 0, 1),
      0,
      100
    );
    const aqShort = clamp(
      35 * clamp(deltaPct / 40, 0, 1) +
        25 * clamp((pocPos - (100 - absPocZone)) / absPocZone, 0, 1) +
        25 * clamp((100 - noResultPct - closePos) / (100 - noResultPct), 0, 1) +
        15 * clamp((relVol ?? 1) / 2, 0, 1),
      0,
      100
    );

    const buyersStep = c.close > c.open && deltaPct >= shiftDelta;
    const sellersStep = c.close < c.open && deltaPct <= -shiftDelta;
    const canTradeBias = activeTrade === null && partOk && lossStreak < 3;
    const canLong = canTradeBias && bias === 1;
    const canShort = canTradeBias && bias === -1;

    // Long state transitions
    if (lState > 0 && (i - lAbsBar > setupBars || c.close < lz3 || bias !== 1)) lState = 0;
    if (lState === 0) {
      if (canLong && longLoc && sellerAbsorbed) {
        lAbsLow = c.low;
        lAbsHigh = c.high;
        lAbsBar = i;
        setupAQ = aqLong;
        absorptions.push({
          barIndex: i,
          time: timeSec,
          price: c.low,
          side: 1,
          deltaPct,
          pocPos,
          closePos,
          aq: aqLong,
          label: `Sellers Absorbed\nΔ ${deltaPct >= 0 ? '+' : '−'}${Math.round(Math.abs(deltaPct))}% · AQ ${Math.round(aqLong)}`,
        });
        if (c.close > c.open) {
          lState = 2;
          lShiftClose = c.close;
          lRetest = null;
          lRetestBar = i;
          firstShifts.push({ barIndex: i, time: timeSec, price: c.low, side: 1 });
        } else {
          lState = 1;
        }
      }
    } else if (lState === 1) {
      if (c.low < lAbsLow && sellerAbsorbed && longLoc) {
        lAbsLow = c.low;
        lAbsHigh = c.high;
        lAbsBar = i;
        setupAQ = aqLong;
        absorptions.push({
          barIndex: i,
          time: timeSec,
          price: c.low,
          side: 1,
          deltaPct,
          pocPos,
          closePos,
          aq: aqLong,
          label: `Sellers Absorbed\nΔ ${deltaPct >= 0 ? '+' : '−'}${Math.round(Math.abs(deltaPct))}% · AQ ${Math.round(aqLong)}`,
        });
      } else if (c.close < lAbsLow) {
        lState = 0;
      } else if (c.close > c.open) {
        lState = 2;
        lShiftClose = c.close;
        lRetest = null;
        lRetestBar = i;
        firstShifts.push({ barIndex: i, time: timeSec, price: c.low, side: 1 });
      }
    } else if (lState === 2) {
      if (lRetest === null || c.low < lRetest) {
        lRetest = c.low;
        lRetestBar = i;
      }
      if (lRetest <= lAbsLow) {
        lState = 0;
      } else if (buyersStep && lRetest < lShiftClose && canLong) {
        const stopLvl = lRetest - stopBufAtr * atrV;
        const risk = Math.max(c.close - stopLvl, atrV * 0.25);
        const swingTarget = lH > c.close + minR * risk ? lH : null;
        const pocTarget = vaPOC > c.close + minR * risk ? vaPOC : null;
        const targetPx = swingTarget ?? pocTarget ?? c.close + 2.0 * risk;
        const targetSource = swingTarget ? 'Last swing' : pocTarget ? 'POC' : 'Fixed R';
        const trailTrigger = Math.min(
          c.close + trailStartR * risk,
          c.close + (targetPx - c.close) * 0.75
        );
        const newTrade: OfsTradeRecord = {
          id: `ofs-long-${i}`,
          side: 1,
          entryBar: i,
          entryTime: timeSec,
          entryPrice: c.close,
          stopPrice: stopLvl,
          initialStopPrice: stopLvl,
          targetPrice: targetPx,
          targetSource,
          riskPerUnit: risk,
          retestBar: lRetestBar,
          retestTime: Math.floor((candles[lRetestBar] ?? c).timestamp / 1000),
          retestPrice: lRetest,
          absBar: lAbsBar,
          absTime: Math.floor((candles[lAbsBar] ?? c).timestamp / 1000),
          absTop: lAbsHigh,
          absBot: lAbsLow,
          status: 'ACTIVE',
          trailing: false,
          beMoved: false,
          trailTrigger,
          openR: 0,
          targetR: Number(((targetPx - c.close) / risk).toFixed(1)),
        };
        activeTrade = newTrade;
        trades.push(newTrade);
        tradesToday += 1;
        lState = 0;
      }
    }

    // Short state transitions
    if (sState > 0 && (i - sAbsBar > setupBars || c.close > sz3 || bias !== -1)) sState = 0;
    if (sState === 0) {
      if (canShort && shortLoc && buyerAbsorbed) {
        sAbsHigh = c.high;
        sAbsLow = c.low;
        sAbsBar = i;
        setupAQ = aqShort;
        absorptions.push({
          barIndex: i,
          time: timeSec,
          price: c.high,
          side: -1,
          deltaPct,
          pocPos,
          closePos,
          aq: aqShort,
          label: `Buyers Absorbed\nΔ +${Math.round(Math.abs(deltaPct))}% · AQ ${Math.round(aqShort)}`,
        });
        if (c.close < c.open) {
          sState = 2;
          sShiftClose = c.close;
          sRetest = null;
          sRetestBar = i;
          firstShifts.push({ barIndex: i, time: timeSec, price: c.high, side: -1 });
        } else {
          sState = 1;
        }
      }
    } else if (sState === 1) {
      if (c.high > sAbsHigh && buyerAbsorbed && shortLoc) {
        sAbsHigh = c.high;
        sAbsLow = c.low;
        sAbsBar = i;
        setupAQ = aqShort;
        absorptions.push({
          barIndex: i,
          time: timeSec,
          price: c.high,
          side: -1,
          deltaPct,
          pocPos,
          closePos,
          aq: aqShort,
          label: `Buyers Absorbed\nΔ +${Math.round(Math.abs(deltaPct))}% · AQ ${Math.round(aqShort)}`,
        });
      } else if (c.close > sAbsHigh) {
        sState = 0;
      } else if (c.close < c.open) {
        sState = 2;
        sShiftClose = c.close;
        sRetest = null;
        sRetestBar = i;
        firstShifts.push({ barIndex: i, time: timeSec, price: c.high, side: -1 });
      }
    } else if (sState === 2) {
      if (sRetest === null || c.high > sRetest) {
        sRetest = c.high;
        sRetestBar = i;
      }
      if (sRetest >= sAbsHigh) {
        sState = 0;
      } else if (sellersStep && sRetest > sShiftClose && canShort) {
        const stopLvl = sRetest + stopBufAtr * atrV;
        const risk = Math.max(stopLvl - c.close, atrV * 0.25);
        const swingTarget = sL < c.close - minR * risk ? sL : null;
        const pocTarget = vaPOC < c.close - minR * risk ? vaPOC : null;
        const targetPx = swingTarget ?? pocTarget ?? c.close - 2.0 * risk;
        const targetSource = swingTarget ? 'Last swing' : pocTarget ? 'POC' : 'Fixed R';
        const trailTrigger = Math.max(
          c.close - trailStartR * risk,
          c.close - (c.close - targetPx) * 0.75
        );
        const newTrade: OfsTradeRecord = {
          id: `ofs-short-${i}`,
          side: -1,
          entryBar: i,
          entryTime: timeSec,
          entryPrice: c.close,
          stopPrice: stopLvl,
          initialStopPrice: stopLvl,
          targetPrice: targetPx,
          targetSource,
          riskPerUnit: risk,
          retestBar: sRetestBar,
          retestTime: Math.floor((candles[sRetestBar] ?? c).timestamp / 1000),
          retestPrice: sRetest,
          absBar: sAbsBar,
          absTime: Math.floor((candles[sAbsBar] ?? c).timestamp / 1000),
          absTop: sAbsHigh,
          absBot: sAbsLow,
          status: 'ACTIVE',
          trailing: false,
          beMoved: false,
          trailTrigger,
          openR: 0,
          targetR: Number(((c.close - targetPx) / risk).toFixed(1)),
        };
        activeTrade = newTrade;
        trades.push(newTrade);
        tradesToday += 1;
        sState = 0;
      }
    }
  }

  // Dashboard Summary Snapshot
  const lastCandle = candles[candles.length - 1];
  const lastAtr = atrArr[atrArr.length - 1] || 0;
  const lastBias = structArr[structArr.length - 1];
  const lastWave = waves[waves.length - 1];
  const lastVa = valueAreaSeries[valueAreaSeries.length - 1];
  const vaHighNow = lastVa?.vaHigh ?? lastCandle.high;
  const vaLowNow = lastVa?.vaLow ?? lastCandle.low;
  const vaPocNow = lastVa?.vaPOC ?? lastCandle.close;
  const valuePos =
    lastCandle.close < vaLowNow ? 'DISCOUNT' : lastCandle.close > vaHighNow ? 'PREMIUM' : 'INSIDE_VALUE';

  const activeZone =
    lastBias === 1 ? lastZoneSnapshot.longZone : lastBias === -1 ? lastZoneSnapshot.shortZone : lastZoneSnapshot.longZone || lastZoneSnapshot.shortZone;
  const zoneReady = Boolean(activeZone?.ready);
  const inZoneNow = Boolean(activeZone?.inZone);
  const armed = lastBias === 1 ? lState : lastBias === -1 ? sState : Math.max(lState, sState);

  let setupStateText = 'BALANCE';
  let setupStateTone: OfsDashboardState['setupStateTone'] = 'silver';
  let setupStateSolid = false;
  let nextStepText = 'Stand aside — market in balance';

  if (activeTrade) {
    setupStateText = activeTrade.side === 1 ? '▲ LONG ACTIVE' : '▼ SHORT ACTIVE';
    setupStateTone = activeTrade.side === 1 ? 'bull' : 'bear';
    setupStateSolid = true;
    nextStepText = activeTrade.trailing
      ? activeTrade.side === 1
        ? 'Trailing behind buyer aggression'
        : 'Trailing behind seller aggression'
      : activeTrade.beMoved
      ? 'Risk off · stop at entry'
      : `Manage toward ${activeTrade.targetSource} target`;
  } else if (armed === 2) {
    setupStateText = 'FIRST SHIFT';
    setupStateTone = 'cyan';
    nextStepText = lastBias === 1 ? 'Retest + buyer flip = entry' : 'Retest + seller flip = entry';
  } else if (armed === 1) {
    setupStateText = 'ABSORPTION';
    setupStateTone = 'amber';
    nextStepText = lastBias === 1 ? 'Bullish close = first shift' : 'Bearish close = first shift';
  } else if (inZoneNow) {
    setupStateText = lastBias === 1 ? 'IN DISCOUNT' : 'IN PREMIUM';
    setupStateTone = 'value';
    nextStepText = lastBias === 1 ? 'Watch for seller absorption' : 'Watch for buyer absorption';
  } else if (lastBias !== 0) {
    setupStateText = lastBias === 1 ? 'VALUE UP' : 'VALUE DOWN';
    setupStateTone = lastBias === 1 ? 'bull' : 'bear';
    nextStepText = zoneReady
      ? lastBias === 1
        ? 'Wait for a pullback into discount'
        : 'Wait for a rally into premium'
      : 'Wait for valid fib leg outside value';
  }

  const setupProgress = activeTrade ? 6 : armed === 2 ? 5 : armed === 1 ? 4 : inZoneNow ? 3 : zoneReady ? 2 : lastBias !== 0 ? 1 : 0;

  // Trim liquidity zones like Pine (top maxLiq per side active + up to 2 swept)
  const activeBsl = liquidityZones.filter((z) => z.isHigh && !z.swept).slice(-maxLiq);
  const activeSsl = liquidityZones.filter((z) => !z.isHigh && !z.swept).slice(-maxLiq);
  const sweptBsl = liquidityZones.filter((z) => z.isHigh && z.swept).slice(-2);
  const sweptSsl = liquidityZones.filter((z) => !z.isHigh && z.swept).slice(-2);
  const visibleLiq = [...activeBsl, ...activeSsl, ...sweptBsl, ...sweptSsl];

  const nearestBSL = activeBsl.length > 0 ? { price: activeBsl[activeBsl.length - 1].price, touches: activeBsl[activeBsl.length - 1].touches } : null;
  const nearestSSL = activeSsl.length > 0 ? { price: activeSsl[activeSsl.length - 1].price, touches: activeSsl[activeSsl.length - 1].touches } : null;

  const buyAgg = clamp((100 + lastBarDeltaPct) / 2, 0, 100);
  const mtfRows: OfsMtfRow[] = [
    {
      tf: timeframe.toUpperCase(),
      isFilter: false,
      structure: lastBias,
      label: lastBias === 1 ? 'Value Up' : lastBias === -1 ? 'Value Down' : 'Balance',
    },
    {
      tf: 'HTF-1',
      isFilter: true,
      structure: structMid[structMid.length - 1] ?? 0,
      label: (structMid[structMid.length - 1] ?? 0) === 1 ? 'Value Up' : (structMid[structMid.length - 1] ?? 0) === -1 ? 'Value Down' : 'Balance',
    },
    {
      tf: 'HTF-2',
      isFilter: true,
      structure: structHi[structHi.length - 1] ?? 0,
      label: (structHi[structHi.length - 1] ?? 0) === 1 ? 'Value Up' : (structHi[structHi.length - 1] ?? 0) === -1 ? 'Value Down' : 'Balance',
    },
  ];

  const pocLocLabel = lastPocPos <= 33 ? 'Low of candle' : lastPocPos >= 67 ? 'High of candle' : 'Middle of candle';

  return {
    symbol,
    timeframe,
    candles,
    longZone: lastZoneSnapshot.longZone,
    shortZone: lastZoneSnapshot.shortZone,
    waves,
    valueAreaSeries,
    footprints: footprints.slice(-footBars),
    absorptions: absorptions.slice(-10),
    firstShifts: firstShifts.slice(-12),
    liquidityZones: visibleLiq,
    inefficiencies,
    impulses,
    trades: trades.slice(-10),
    dashboard: {
      market: symbol,
      timeframe,
      lastPrice: lastCandle.close,
      atr: lastAtr,
      structure: lastBias,
      structureLabel: lastBias === 1 ? 'Value Up' : lastBias === -1 ? 'Value Down' : 'Balance',
      setupStateText,
      setupStateTone,
      setupStateSolid,
      nextStepText,
      flowSharePct: Math.round((lastWave?.flowShare ?? 0.5) * 100),
      flowNet: lastWave?.flowNet ?? 0,
      buyAggressionPct: Math.round(buyAgg),
      sellAggressionPct: Math.round(100 - buyAgg),
      participationRelVol: lastRelVol,
      participationOk: lastPartOk,
      absorptionQuality: armed > 0 && setupAQ !== null ? Math.round(setupAQ) : null,
      pocPos: Math.round(lastPocPos),
      pocLocationLabel: pocLocLabel,
      sessionDelta: sessDelta,
      setupProgress,
      steps: {
        environment: {
          label: lastBias === 1 ? 'Value Up' : lastBias === -1 ? 'Value Down' : 'Balance',
          state: lastBias !== 0 ? 1 : -1,
        },
        location: {
          label: inZoneNow
            ? `In ${fibA} – ${fibC}`
            : zoneReady
            ? `${valuePos === 'DISCOUNT' ? 'Discount' : valuePos === 'PREMIUM' ? 'Premium' : 'Inside Value'} · zone ready`
            : valuePos === 'DISCOUNT'
            ? 'Discount'
            : valuePos === 'PREMIUM'
            ? 'Premium'
            : 'Inside Value',
          state: inZoneNow ? 1 : zoneReady ? 0 : -1,
        },
        confirmation: {
          label: activeTrade ? 'Entry · 2nd failure' : armed === 2 ? 'First shift · 2nd fail next' : armed === 1 ? 'Absorption seen' : 'Waiting',
          state: activeTrade ? 1 : armed > 0 ? 0 : -1,
        },
        riskRules: {
          label: `${tradesToday}/2 trades · ${lossStreak} L`,
          state: lastPartOk && lossStreak < 3 ? 1 : -1,
        },
      },
      mtfRows,
      valueArea: {
        val: lastVa?.vaLow ?? null,
        poc: lastVa?.vaPOC ?? null,
        vah: lastVa?.vaHigh ?? null,
        pos: valuePos,
      },
      activeZone,
      nearestBSL,
      nearestSSL,
      nextTarget: activeTrade
        ? { price: activeTrade.targetPrice, label: activeTrade.targetSource }
        : lastBias === -1 && vaPocNow < lastCandle.close
        ? { price: vaPocNow, label: 'POC' }
        : lastBias === 1 && vaPocNow > lastCandle.close
        ? { price: vaPocNow, label: 'POC' }
        : null,
      activeTrade,
      lastTrade,
      usedLowerTimeframe,
    },
  };
}
