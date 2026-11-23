/**
 * SuperKumo MPro — Pure TypeScript Computational Engine
 * Faithfully implements the user's Pine Script v6 SuperKumo MPro specification:
 *  - Ichimoku Kumo Cloud (Tenkan 9, Kijun 26, Span B 52, Displacement 26)
 *  - Supertrend (ATR 10, Factor 3.0) with Early / Confirmed / Pullback ADD / Risky ADD / Support DCA / More signals
 *  - ADX (14) + Cloud Flatness Chop Filter
 *  - Merged Pivot Swing + Higher-Timeframe S/R Zones & S/R Room-to-Target Filter
 *  - Ratcheting Structural Trail Stop & Live Telemetry Summary
 */

import type { Candle } from './trullasStrategy';

export interface SuperKumoConfig {
  convLen?: number;
  baseLen?: number;
  spanBLen?: number;
  disp?: number;
  atrLen?: number;
  factor?: number;
  useKijun?: boolean;
  useVol?: boolean;
  volLen?: number;
  volMult?: number;
  earlyWindow?: number;
  moreWindow?: number;
  useDcaFilter?: boolean;
  dcaAtrMult?: number;
  dcaCooldown?: number;
  maxDca?: number;
  usePB?: boolean;
  pbLookback?: number;
  useRisky?: boolean;
  riskyLookback?: number;
  useDcaDn?: boolean;
  dcaBandMult?: number;
  useChop?: boolean;
  adxLen?: number;
  adxMin?: number;
  flatMult?: number;
  useSRFilter?: boolean;
  minRoomMult?: number;
  swLen?: number;
  htfStepBars?: number;
  mergeMult?: number;
  bandMult?: number;
  maxZones?: number;
  trailType?: 'Swing' | 'Kijun' | 'Cloud';
  trailAtrMult?: number;
  swTrailLen?: number;
}

export type SuperKumoSignalKind =
  | 'BUY'
  | 'SELL'
  | 'EARLY_BUY'
  | 'EARLY_SELL'
  | 'PB_ADD'
  | 'RISKY_ADD'
  | 'DCA'
  | 'BUY_MORE'
  | 'SELL_MORE';

export interface SuperKumoSignalMarker {
  barIndex: number;
  time: number;
  price: number;
  direction: 'BULL' | 'BEAR';
  kind: SuperKumoSignalKind;
  label: string;
}

export interface SuperKumoSrZone {
  level: number;
  high: number;
  low: number;
  kind: 'S' | 'R';
  touches: number;
  isHtf: boolean;
}

export interface SuperKumoBar {
  time: number;
  tenkan: number;
  kijun: number;
  spanA: number;
  spanB: number;
  kumoA: number;
  kumoB: number;
  kumoTop: number;
  kumoBot: number;
  supertrend: number;
  stDir: -1 | 1; // -1 = bull (below price), +1 = bear (above price)
  adx: number;
  atr14: number;
  trailStop: number | null;
  tradeDir: -1 | 0 | 1; // 1 = long, -1 = short, 0 = flat
}

export interface SuperKumoReport {
  bars: SuperKumoBar[];
  signals: SuperKumoSignalMarker[];
  zones: SuperKumoSrZone[];
  nearestSupport: number | null;
  nearestResistance: number | null;
  roomUpAtr: number | null;
  roomDnAtr: number | null;
  roomUpOk: boolean;
  roomDnOk: boolean;
  isChop: boolean;
  dashboard: {
    trend: 'UP' | 'DOWN';
    lastSignalText: string;
    lastSignalBarsAgo: number;
    trailStop: number | null;
    entryPrice: number | null;
    tenkan: number;
    kijun: number;
    adx: number;
    atr: number;
    kumoTop: number;
    kumoBot: number;
    priceVsCloud: 'ABOVE' | 'INSIDE' | 'BELOW';
    roomUpOk: boolean;
    roomDnOk: boolean;
  };
}

function donchianMid(candles: Candle[], idx: number, len: number): number {
  const start = Math.max(0, idx - len + 1);
  let hi = -Infinity;
  let lo = Infinity;
  for (let i = start; i <= idx; i++) {
    if (candles[i].high > hi) hi = candles[i].high;
    if (candles[i].low < lo) lo = candles[i].low;
  }
  return (hi + lo) / 2;
}

function computeWilderAtr(candles: Candle[], period: number): number[] {
  const n = candles.length;
  const tr = new Array<number>(n).fill(0);
  const atr = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    const h = candles[i].high;
    const l = candles[i].low;
    if (i === 0) {
      tr[i] = Math.max(0, h - l);
    } else {
      const pc = candles[i - 1].close;
      tr[i] = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    }
  }
  if (n === 0) return atr;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    if (i < period) {
      sum += tr[i];
      atr[i] = sum / (i + 1);
    } else {
      atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period;
    }
  }
  return atr;
}

function computeAdx(candles: Candle[], period: number): number[] {
  const n = candles.length;
  const adx = new Array<number>(n).fill(20);
  if (n < 2) return adx;

  const plusDm = new Array<number>(n).fill(0);
  const minusDm = new Array<number>(n).fill(0);
  const tr = new Array<number>(n).fill(0);

  for (let i = 1; i < n; i++) {
    const upMove = candles[i].high - candles[i - 1].high;
    const downMove = candles[i - 1].low - candles[i].low;
    plusDm[i] = upMove > downMove && upMove > 0 ? upMove : 0;
    minusDm[i] = downMove > upMove && downMove > 0 ? downMove : 0;
    const pc = candles[i - 1].close;
    tr[i] = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - pc),
      Math.abs(candles[i].low - pc)
    );
  }

  let smTr = 0;
  let smPlus = 0;
  let smMinus = 0;
  const dxArr = new Array<number>(n).fill(0);

  for (let i = 1; i < n; i++) {
    if (i <= period) {
      smTr += tr[i];
      smPlus += plusDm[i];
      smMinus += minusDm[i];
    } else {
      smTr = smTr - smTr / period + tr[i];
      smPlus = smPlus - smPlus / period + plusDm[i];
      smMinus = smMinus - smMinus / period + minusDm[i];
    }
    const plusDi = smTr > 0 ? (100 * smPlus) / smTr : 0;
    const minusDi = smTr > 0 ? (100 * smMinus) / smTr : 0;
    const sumDi = plusDi + minusDi;
    dxArr[i] = sumDi > 0 ? (100 * Math.abs(plusDi - minusDi)) / sumDi : 0;
    if (i <= period) {
      adx[i] = dxArr[i];
    } else {
      adx[i] = (adx[i - 1] * (period - 1) + dxArr[i]) / period;
    }
  }
  return adx;
}

export function calculateSuperKumoMpro(
  candles: Candle[],
  cfg: SuperKumoConfig = {}
): SuperKumoReport {
  const convLen = cfg.convLen ?? 9;
  const baseLen = cfg.baseLen ?? 26;
  const spanBLen = cfg.spanBLen ?? 52;
  const disp = cfg.disp ?? 26;
  const atrLen = cfg.atrLen ?? 10;
  const factor = cfg.factor ?? 3.0;
  const useKijun = cfg.useKijun ?? false;
  const useVol = cfg.useVol ?? false;
  const volLen = cfg.volLen ?? 20;
  const volMult = cfg.volMult ?? 1.2;
  const earlyWindow = cfg.earlyWindow ?? 3;
  const moreWindow = cfg.moreWindow ?? 8;
  const useDcaFilter = cfg.useDcaFilter ?? true;
  const dcaAtrMult = cfg.dcaAtrMult ?? 1.0;
  const dcaCooldown = cfg.dcaCooldown ?? 15;
  const maxDca = cfg.maxDca ?? 3;
  const usePB = cfg.usePB ?? true;
  const pbLookback = cfg.pbLookback ?? 5;
  const useRisky = cfg.useRisky ?? true;
  const riskyLookback = cfg.riskyLookback ?? 5;
  const useDcaDn = cfg.useDcaDn ?? true;
  const dcaBandMult = cfg.dcaBandMult ?? 1.0;
  const useChop = cfg.useChop ?? true;
  const adxLen = cfg.adxLen ?? 14;
  const adxMin = cfg.adxMin ?? 20.0;
  const flatMult = cfg.flatMult ?? 0.3;
  const useSRFilter = cfg.useSRFilter ?? true;
  const minRoomMult = cfg.minRoomMult ?? 1.0;
  const swLen = cfg.swLen ?? 10;
  const mergeMult = cfg.mergeMult ?? 1.5;
  const bandMult = cfg.bandMult ?? 0.5;
  const maxZones = cfg.maxZones ?? 6;
  const trailType = cfg.trailType ?? 'Swing';
  const trailAtrMult = cfg.trailAtrMult ?? 1.5;
  const swTrailLen = cfg.swTrailLen ?? 10;

  const n = candles.length;
  if (n === 0) {
    return {
      bars: [],
      signals: [],
      zones: [],
      nearestSupport: null,
      nearestResistance: null,
      roomUpAtr: null,
      roomDnAtr: null,
      roomUpOk: true,
      roomDnOk: true,
      isChop: false,
      dashboard: {
        trend: 'UP',
        lastSignalText: 'NONE',
        lastSignalBarsAgo: 0,
        trailStop: null,
        entryPrice: null,
        tenkan: 0,
        kijun: 0,
        adx: 20,
        atr: 0,
        kumoTop: 0,
        kumoBot: 0,
        priceVsCloud: 'INSIDE',
        roomUpOk: true,
        roomDnOk: true,
      },
    };
  }

  const atrSt = computeWilderAtr(candles, atrLen);
  const atr14 = computeWilderAtr(candles, 14);
  const adxArr = computeAdx(candles, adxLen);

  // Ichimoku raw series
  const tenkanArr = new Array<number>(n);
  const kijunArr = new Array<number>(n);
  const spanAArr = new Array<number>(n);
  const spanBArr = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    tenkanArr[i] = donchianMid(candles, i, convLen);
    kijunArr[i] = donchianMid(candles, i, baseLen);
    spanAArr[i] = (tenkanArr[i] + kijunArr[i]) / 2;
    spanBArr[i] = donchianMid(candles, i, spanBLen);
  }

  // Supertrend (Pine v6 convention: dir = -1 bullish / green below close, dir = +1 bearish / red above close)
  const stLine = new Array<number>(n);
  const stDirArr = new Array<-1 | 1>(n);
  const finalUpper = new Array<number>(n);
  const finalLower = new Array<number>(n);

  for (let i = 0; i < n; i++) {
    const hl2 = (candles[i].high + candles[i].low) / 2;
    const basicUp = hl2 + factor * atrSt[i];
    const basicDn = hl2 - factor * atrSt[i];

    if (i === 0) {
      finalUpper[i] = basicUp;
      finalLower[i] = basicDn;
      stDirArr[i] = candles[i].close >= hl2 ? -1 : 1;
      stLine[i] = stDirArr[i] === -1 ? finalLower[i] : finalUpper[i];
    } else {
      const prevC = candles[i - 1].close;
      finalUpper[i] =
        basicUp < finalUpper[i - 1] || prevC > finalUpper[i - 1] ? basicUp : finalUpper[i - 1];
      finalLower[i] =
        basicDn > finalLower[i - 1] || prevC < finalLower[i - 1] ? basicDn : finalLower[i - 1];

      const prevDir = stDirArr[i - 1];
      let nextDir: -1 | 1 = prevDir;
      if (prevDir === 1 && candles[i].close > finalUpper[i]) {
        nextDir = -1;
      } else if (prevDir === -1 && candles[i].close < finalLower[i]) {
        nextDir = 1;
      }
      stDirArr[i] = nextDir;
      stLine[i] = nextDir === -1 ? finalLower[i] : finalUpper[i];
    }
  }

  // S/R Pivot Swings (rolling historical candidates + higher-timeframe aggregated candles)
  interface RawZone {
    level: number;
    touches: number;
    isHtf: boolean;
  }
  const rawZones: RawZone[] = [];
  const lastAtr = atr14[n - 1] || Math.max(0.01, candles[n - 1].close * 0.015);
  const mergeDist = Math.max(1e-6, lastAtr * mergeMult);
  const touchDist = Math.max(1e-6, lastAtr * 1.0);

  const pushOrTouchZone = (lv: number, isHtf: boolean) => {
    for (const z of rawZones) {
      if (Math.abs(z.level - lv) <= touchDist) {
        z.touches += 1;
        z.level = (z.level * (z.touches - 1) + lv) / z.touches;
        if (isHtf) z.isHtf = true;
        return;
      }
    }
    rawZones.push({ level: lv, touches: 1, isHtf });
  };

  // Detect pivots across candles
  const effectiveSw = Math.min(swLen, Math.max(3, Math.floor((n - 4) / 4)));
  for (let i = effectiveSw; i < n - effectiveSw; i++) {
    let isPh = true;
    let isPl = true;
    for (let k = 1; k <= effectiveSw; k++) {
      if (candles[i].high <= candles[i - k].high || candles[i].high <= candles[i + k].high) {
        isPh = false;
      }
      if (candles[i].low >= candles[i - k].low || candles[i].low >= candles[i + k].low) {
        isPl = false;
      }
    }
    if (isPh) pushOrTouchZone(candles[i].high, false);
    if (isPl) pushOrTouchZone(candles[i].low, false);
  }

  // Synthetic HTF (5-bar weekly/4H macro bucket) swings so HTF levels complement LTF pivots
  const htfStep = cfg.htfStepBars ?? 5;
  if (n >= htfStep * 6) {
    const htfCandles: Array<{ high: number; low: number }> = [];
    for (let i = 0; i < n; i += htfStep) {
      const slice = candles.slice(i, Math.min(n, i + htfStep));
      htfCandles.push({
        high: Math.max(...slice.map((c) => c.high)),
        low: Math.min(...slice.map((c) => c.low)),
      });
    }
    for (let i = 2; i < htfCandles.length - 2; i++) {
      const h = htfCandles[i].high;
      const l = htfCandles[i].low;
      if (
        h > htfCandles[i - 1].high &&
        h > htfCandles[i - 2].high &&
        h > htfCandles[i + 1].high &&
        h > htfCandles[i + 2].high
      ) {
        pushOrTouchZone(h, true);
      }
      if (
        l < htfCandles[i - 1].low &&
        l < htfCandles[i - 2].low &&
        l < htfCandles[i + 1].low &&
        l < htfCandles[i + 2].low
      ) {
        pushOrTouchZone(l, true);
      }
    }
  }

  // Filter minTouches >= 2 (or HTF), merge within mergeDist, and rank closest to current price
  const currentClose = candles[n - 1].close;
  const candidateZones = rawZones.filter((z) => z.touches >= 2 || z.isHtf);
  const mergedZones: RawZone[] = [];
  for (const cand of candidateZones) {
    const existing = mergedZones.find((m) => Math.abs(m.level - cand.level) <= mergeDist);
    if (existing) {
      const totalT = existing.touches + cand.touches;
      existing.level = (existing.level * existing.touches + cand.level * cand.touches) / totalT;
      existing.touches = totalT;
      existing.isHtf = existing.isHtf || cand.isHtf;
    } else {
      mergedZones.push({ ...cand });
    }
  }

  mergedZones.sort((a, b) => Math.abs(a.level - currentClose) - Math.abs(b.level - currentClose));
  const topZones = mergedZones.slice(0, maxZones).sort((a, b) => a.level - b.level);
  const halfBand = lastAtr * bandMult;

  const zones: SuperKumoSrZone[] = topZones.map((z) => ({
    level: Number(z.level.toFixed(2)),
    high: Number((z.level + halfBand).toFixed(2)),
    low: Number((z.level - halfBand).toFixed(2)),
    kind: z.level >= currentClose ? 'R' : 'S',
    touches: z.touches,
    isHtf: z.isHtf,
  }));

  // Compute nearest Support/Resistance at any close price
  const computeRoomAt = (price: number, atrVal: number) => {
    let nr: number | null = null;
    let ns: number | null = null;
    for (const z of zones) {
      if (z.level > price && (nr === null || z.level < nr)) nr = z.level;
      if (z.level < price && (ns === null || z.level > ns)) ns = z.level;
    }
    const rawRoomUp = nr !== null ? nr - price : null;
    const rawRoomDn = ns !== null ? price - ns : null;
    const upOk = !useSRFilter || rawRoomUp === null || rawRoomUp >= minRoomMult * atrVal;
    const dnOk = !useSRFilter || rawRoomDn === null || rawRoomDn >= minRoomMult * atrVal;
    return { nr, ns, rawRoomUp, rawRoomDn, upOk, dnOk };
  };

  // Volume rolling SMA
  const volSma = new Array<number>(n).fill(0);
  let volSum = 0;
  for (let i = 0; i < n; i++) {
    volSum += candles[i].volume;
    if (i >= volLen) volSum -= candles[i - volLen].volume;
    volSma[i] = volSum / Math.min(volLen, i + 1);
  }

  // Signal state machine & trailing stop tracking
  let bullFlipBar: number | null = null;
  let bearFlipBar: number | null = null;
  let earlyBullBar: number | null = null;
  let earlyBearBar: number | null = null;
  let lastLongSigBar: number | null = null;
  let lastShortSigBar: number | null = null;
  let lastSigPrice = NaN;
  let lastSigType: SuperKumoSignalKind | null = null;
  let dcaCount = 0;
  let tradeDir: -1 | 0 | 1 = 0;
  let tradeEntry: number | null = null;
  let trailStop: number | null = null;

  const bars: SuperKumoBar[] = [];
  const signals: SuperKumoSignalMarker[] = [];

  for (let i = 0; i < n; i++) {
    const c = candles[i];
    const time = Math.floor(c.timestamp / 1000);
    const kumoA = i >= disp ? spanAArr[i - disp] : spanAArr[0];
    const kumoB = i >= disp ? spanBArr[i - disp] : spanBArr[0];
    const kumoTop = Math.max(kumoA, kumoB);
    const kumoBot = Math.min(kumoA, kumoB);
    const dir = stDirArr[i];
    const prevDir = i > 0 ? stDirArr[i - 1] : dir;
    const a14 = atr14[i];
    const adx = adxArr[i];
    const kj = kijunArr[i];

    const longFlip = dir === -1 && prevDir === 1;
    const shortFlip = dir === 1 && prevDir === -1;
    if (longFlip) bullFlipBar = i;
    if (shortFlip) bearFlipBar = i;

    const okKijunL = !useKijun || c.close > kj;
    const okKijunS = !useKijun || c.close < kj;
    const okVol = !useVol || (volSma[i] > 0 && c.volume > volSma[i] * volMult);
    const kijunPassL = okKijunL && okVol;
    const kijunPassS = okKijunS && okVol;

    const earlyLongCond =
      dir === -1 && bullFlipBar !== null && i - bullFlipBar <= earlyWindow && kijunPassL;
    const earlyShortCond =
      dir === 1 && bearFlipBar !== null && i - bearFlipBar <= earlyWindow && kijunPassS;

    const earlyLong =
      earlyLongCond &&
      (earlyBullBar === null || (bullFlipBar !== null && earlyBullBar < bullFlipBar));
    const earlyShort =
      earlyShortCond &&
      (earlyBearBar === null || (bearFlipBar !== null && earlyBearBar < bearFlipBar));

    if (earlyLong) earlyBullBar = i;
    if (earlyShort) earlyBearBar = i;

    const room = computeRoomAt(c.close, a14);
    const longCond = c.close > kumoTop && dir < 0 && room.upOk;
    const shortCond = c.close < kumoBot && dir > 0 && room.dnOk;
    const longSignal = longCond && tradeDir !== 1;
    const shortSignal = shortCond && tradeDir !== -1;

    const flatKumo = Math.abs(kumoA - kumoB) < a14 * flatMult;
    const isChop = useChop && (adx < adxMin || flatKumo);

    // Pullback ADD: deep dip into/below Kijun within pbLookback while ST bull & above Kumo
    let pbSeen = false;
    for (let k = Math.max(0, i - pbLookback); k < i; k++) {
      if (candles[k].low <= kijunArr[k]) {
        pbSeen = true;
        break;
      }
    }
    const pbCond =
      usePB && c.close > kumoTop && dir < 0 && pbSeen && c.close > kj && room.upOk;
    const pbCondS =
      usePB && c.close < kumoBot && dir > 0 && pbSeen && c.close < kj && room.dnOk;

    // Risky ADD: below kumoTop while Supertrend already bull
    let riskyBearSeen = false;
    let riskyBullSeen = false;
    for (let k = Math.max(0, i - riskyLookback); k < i; k++) {
      if (candles[k].close < candles[k].open) riskyBearSeen = true;
      if (candles[k].close > candles[k].open) riskyBullSeen = true;
    }
    const riskyCond =
      useRisky && dir < 0 && c.close <= kumoTop && riskyBearSeen && c.close > c.open && room.upOk;
    const riskyCondS =
      useRisky && dir > 0 && c.close >= kumoBot && riskyBullSeen && c.close < c.open && room.dnOk;

    // Support DCA
    const nearSupport = room.ns !== null && c.low <= room.ns + a14 * dcaBandMult;
    const nearResist = room.nr !== null && c.high >= room.nr - a14 * dcaBandMult;
    const dcaDnCond =
      useDcaDn &&
      dir < 0 &&
      nearSupport &&
      c.close > c.open &&
      (i === 0 || candles[i - 1].close < candles[i - 1].open);
    const dcaUpCond =
      useDcaDn &&
      dir > 0 &&
      nearResist &&
      c.close < c.open &&
      (i === 0 || candles[i - 1].close > candles[i - 1].open);

    const dcaOkL =
      !useDcaFilter ||
      ((!Number.isFinite(lastSigPrice) || Math.abs(c.close - lastSigPrice) >= a14 * dcaAtrMult) &&
        (lastLongSigBar === null || i - lastLongSigBar >= dcaCooldown) &&
        (maxDca === 0 || dcaCount < maxDca));
    const dcaOkS =
      !useDcaFilter ||
      ((!Number.isFinite(lastSigPrice) || Math.abs(c.close - lastSigPrice) >= a14 * dcaAtrMult) &&
        (lastShortSigBar === null || i - lastShortSigBar >= dcaCooldown) &&
        (maxDca === 0 || dcaCount < maxDca));

    const pbLong = pbCond && !longSignal && !isChop && dcaOkL;
    const pbShort = pbCondS && !shortSignal && !isChop && dcaOkS;
    const riskyLong = riskyCond && !longSignal && !pbLong && !isChop && dcaOkL;
    const riskyShort = riskyCondS && !shortSignal && !pbShort && !isChop && dcaOkS;
    const dcaDnLong =
      dcaDnCond && !longSignal && !pbLong && !riskyLong && !isChop && dcaOkL;
    const dcaUpShort =
      dcaUpCond && !shortSignal && !pbShort && !riskyShort && !isChop && dcaOkS;

    const tpLong =
      longSignal && earlyBullBar !== null && i - earlyBullBar <= moreWindow;
    const tpShort =
      shortSignal && earlyBearBar !== null && i - earlyBearBar <= moreWindow;

    // Emit prioritized marker for this bar (only from bar 15+ so warm-up is clean)
    const warm = i >= Math.min(20, Math.floor(n * 0.15));
    const emit = (kind: SuperKumoSignalKind, label: string, direction: 'BULL' | 'BEAR') => {
      if (warm) {
        signals.push({
          barIndex: i,
          time,
          price: direction === 'BULL' ? c.low : c.high,
          direction,
          kind,
          label,
        });
      }
      lastSigPrice = c.close;
      lastSigType = kind;
      if (direction === 'BULL') lastLongSigBar = i;
      else lastShortSigBar = i;
    };

    if (longSignal) {
      tradeDir = 1;
      tradeEntry = c.close;
      dcaCount = 0;
      trailStop = null;
      emit(tpLong ? 'BUY_MORE' : 'BUY', tpLong ? 'Buy More' : 'BUY', 'BULL');
    } else if (shortSignal) {
      tradeDir = -1;
      tradeEntry = c.close;
      dcaCount = 0;
      trailStop = null;
      emit(tpShort ? 'SELL_MORE' : 'SELL', tpShort ? 'Sell More' : 'SELL', 'BEAR');
    } else if (earlyLong) {
      if (tradeDir !== 1) {
        tradeDir = 1;
        tradeEntry = c.close;
        dcaCount = 0;
        trailStop = null;
      }
      emit('EARLY_BUY', 'EARLY BUY', 'BULL');
    } else if (earlyShort) {
      if (tradeDir !== -1) {
        tradeDir = -1;
        tradeEntry = c.close;
        dcaCount = 0;
        trailStop = null;
      }
      emit('EARLY_SELL', 'EARLY SELL', 'BEAR');
    } else if (pbLong) {
      dcaCount += 1;
      emit('PB_ADD', 'PB ADD', 'BULL');
    } else if (pbShort) {
      dcaCount += 1;
      emit('PB_ADD', 'PB ADD', 'BEAR');
    } else if (riskyLong) {
      dcaCount += 1;
      emit('RISKY_ADD', 'RISKY ADD', 'BULL');
    } else if (riskyShort) {
      dcaCount += 1;
      emit('RISKY_ADD', 'RISKY ADD', 'BEAR');
    } else if (dcaDnLong) {
      dcaCount += 1;
      emit('DCA', 'DCA', 'BULL');
    } else if (dcaUpShort) {
      dcaCount += 1;
      emit('DCA', 'DCA', 'BEAR');
    }

    // Update trailing stop ratchet
    if (tradeDir !== 0) {
      const lookStart = Math.max(0, i - swTrailLen + 1);
      let swLo = Infinity;
      let swHi = -Infinity;
      for (let k = lookStart; k <= i; k++) {
        if (candles[k].low < swLo) swLo = candles[k].low;
        if (candles[k].high > swHi) swHi = candles[k].high;
      }
      const rawLongTrail =
        trailType === 'Kijun'
          ? kj - a14 * trailAtrMult
          : trailType === 'Cloud'
            ? kumoTop - a14 * trailAtrMult
            : swLo - a14 * trailAtrMult;
      const rawShortTrail =
        trailType === 'Kijun'
          ? kj + a14 * trailAtrMult
          : trailType === 'Cloud'
            ? kumoBot + a14 * trailAtrMult
            : swHi + a14 * trailAtrMult;

      if (tradeDir === 1) {
        trailStop = trailStop === null ? rawLongTrail : Math.max(trailStop, rawLongTrail);
      } else {
        trailStop = trailStop === null ? rawShortTrail : Math.min(trailStop, rawShortTrail);
      }
    }

    bars.push({
      time,
      tenkan: Number(tenkanArr[i].toFixed(2)),
      kijun: Number(kj.toFixed(2)),
      spanA: Number(spanAArr[i].toFixed(2)),
      spanB: Number(spanBArr[i].toFixed(2)),
      kumoA: Number(kumoA.toFixed(2)),
      kumoB: Number(kumoB.toFixed(2)),
      kumoTop: Number(kumoTop.toFixed(2)),
      kumoBot: Number(kumoBot.toFixed(2)),
      supertrend: Number(stLine[i].toFixed(2)),
      stDir: dir,
      adx: Number(adx.toFixed(1)),
      atr14: Number(a14.toFixed(2)),
      trailStop: trailStop !== null ? Number(trailStop.toFixed(2)) : null,
      tradeDir,
    });
  }

  const lastBar = bars[bars.length - 1];
  const lastRoom = computeRoomAt(currentClose, lastBar.atr14);
  const lastFlatKumo = Math.abs(lastBar.kumoA - lastBar.kumoB) < lastBar.atr14 * flatMult;
  const latestSig = signals[signals.length - 1];
  const lastSignalBarsAgo = latestSig ? Math.max(0, n - 1 - latestSig.barIndex) : 0;
  const lastSignalText = latestSig
    ? `${latestSig.label} @ $${candles[latestSig.barIndex].close.toFixed(2)}`
    : lastSigType || 'NEUTRAL';

  const priceVsCloud: 'ABOVE' | 'INSIDE' | 'BELOW' =
    currentClose > lastBar.kumoTop
      ? 'ABOVE'
      : currentClose < lastBar.kumoBot
        ? 'BELOW'
        : 'INSIDE';

  return {
    bars,
    signals,
    zones,
    nearestSupport: lastRoom.ns !== null ? Number(lastRoom.ns.toFixed(2)) : null,
    nearestResistance: lastRoom.nr !== null ? Number(lastRoom.nr.toFixed(2)) : null,
    roomUpAtr:
      lastRoom.rawRoomUp !== null && lastBar.atr14 > 0
        ? Number((lastRoom.rawRoomUp / lastBar.atr14).toFixed(2))
        : null,
    roomDnAtr:
      lastRoom.rawRoomDn !== null && lastBar.atr14 > 0
        ? Number((lastRoom.rawRoomDn / lastBar.atr14).toFixed(2))
        : null,
    roomUpOk: lastRoom.upOk,
    roomDnOk: lastRoom.dnOk,
    isChop: useChop && (lastBar.adx < adxMin || lastFlatKumo),
    dashboard: {
      trend: lastBar.stDir === -1 ? 'UP' : 'DOWN',
      lastSignalText,
      lastSignalBarsAgo,
      trailStop: lastBar.trailStop,
      entryPrice: tradeEntry !== null ? Number(tradeEntry.toFixed(2)) : null,
      tenkan: lastBar.tenkan,
      kijun: lastBar.kijun,
      adx: lastBar.adx,
      atr: lastBar.atr14,
      kumoTop: lastBar.kumoTop,
      kumoBot: lastBar.kumoBot,
      priceVsCloud,
      roomUpOk: lastRoom.upOk,
      roomDnOk: lastRoom.dnOk,
    },
  };
}
