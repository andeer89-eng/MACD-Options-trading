import type { Candle } from './trullasStrategy';

export interface SuperTrendProOptions {
  symbol?: string;
  timeframe?: string;
  atrPeriod?: number;
  atrMult?: number;
}

export interface SuperTrendProPoint {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  hl2: number;
  supertrend: number;
  trend: 1 | -1;
  ema20: number;
  ema50: number;
  ema200: number;
  rsi: number;
  relVol: number;
  confluenceScore: 1 | 2 | 3;
}

export type SuperTrendSignalKind =
  | 'BUY'
  | 'SELL'
  | 'DIV'
  | 'SWEEP'
  | 'EARLY'
  | 'WEAK'
  | 'DOTS';

export interface SuperTrendProSignal {
  time: number;
  price: number;
  index: number;
  kind: SuperTrendSignalKind;
  isBull: boolean;
  isPrime?: boolean;
  score: 1 | 2 | 3;
  label: string;
}

export interface SuperTrendMtfTag {
  time: number;
  price: number;
  tag: '1D' | '2D' | '1W' | '1M';
  isBull: boolean;
}

export interface SuperTrendZone {
  startTime: number;
  top: number;
  bot: number;
  label: string;
}

export interface SuperTrendProDashboard {
  symbol: string;
  timeframe: string;
  trendLabel: '▲ UPTREND' | '▼ DOWNTREND';
  isBull: boolean;
  rsi: number;
  volumeState: 'high' | 'normal' | 'low';
  emasAligned: boolean;
  emaOrderText: string;
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  supertrend: number | null;
}

export interface SuperTrendProReport {
  series: SuperTrendProPoint[];
  signals: SuperTrendProSignal[];
  mtfTags: SuperTrendMtfTag[];
  resistanceZone: SuperTrendZone | null;
  supportZone: SuperTrendZone | null;
  dashboard: SuperTrendProDashboard;
}

function computeEmaArray(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const p = Math.max(1, Math.floor(period));
  const k = 2 / (p + 1);
  const out: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    out.push(values[i] * k + out[i - 1] * (1 - k));
  }
  return out;
}

function computeRsiArray(closes: number[], period: number = 14): number[] {
  const n = closes.length;
  if (n === 0) return [];
  const out = new Array<number>(n).fill(50);
  if (n < 2) return out;

  const p = Math.max(2, Math.floor(period));
  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 1; i < n; i++) {
    const ch = closes[i] - closes[i - 1];
    const gain = ch > 0 ? ch : 0;
    const loss = ch < 0 ? -ch : 0;

    if (i <= p) {
      avgGain += gain / p;
      avgLoss += loss / p;
      const rs = avgLoss <= 1e-12 ? (avgGain > 0 ? 100 : 1) : avgGain / avgLoss;
      out[i] = avgLoss <= 1e-12 && avgGain <= 1e-12 ? 50 : 100 - 100 / (1 + rs);
    } else {
      avgGain = (avgGain * (p - 1) + gain) / p;
      avgLoss = (avgLoss * (p - 1) + loss) / p;
      const rs = avgLoss <= 1e-12 ? (avgGain > 0 ? 100 : 1) : avgGain / avgLoss;
      out[i] = avgLoss <= 1e-12 && avgGain <= 1e-12 ? 50 : 100 - 100 / (1 + rs);
    }
  }
  return out;
}

function computeAtrArray(candles: Candle[], period: number): number[] {
  const n = candles.length;
  if (n === 0) return [];
  const p = Math.max(1, Math.floor(period));
  const tr: number[] = new Array(n);

  for (let i = 0; i < n; i++) {
    const hi = candles[i].high;
    const lo = candles[i].low;
    if (i === 0) {
      tr[i] = Math.max(hi - lo, hi * 0.002, 1e-6);
    } else {
      const prevClose = candles[i - 1].close;
      tr[i] = Math.max(
        hi - lo,
        Math.abs(hi - prevClose),
        Math.abs(lo - prevClose),
        hi * 0.0005,
        1e-6
      );
    }
  }

  const atr = new Array<number>(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    if (i < p) {
      sum += tr[i];
      atr[i] = sum / (i + 1);
    } else {
      atr[i] = (atr[i - 1] * (p - 1) + tr[i]) / p;
    }
  }
  return atr;
}

export function calculateSuperTrendPro(
  candles: Candle[],
  options: SuperTrendProOptions = {}
): SuperTrendProReport {
  const symbol = (options.symbol || 'ASSET').toUpperCase();
  const timeframe = options.timeframe || '1d';
  const atrPeriod = Math.max(1, Math.floor(options.atrPeriod ?? 10));
  const atrMult = Math.max(0.5, Number.isFinite(options.atrMult ?? 3.0) ? (options.atrMult ?? 3.0) : 3.0);

  if (!candles || candles.length === 0) {
    return {
      series: [],
      signals: [],
      mtfTags: [],
      resistanceZone: null,
      supportZone: null,
      dashboard: {
        symbol,
        timeframe,
        trendLabel: '▲ UPTREND',
        isBull: true,
        rsi: 50,
        volumeState: 'normal',
        emasAligned: false,
        emaOrderText: '20 / 50 / 200',
        ema20: null,
        ema50: null,
        ema200: null,
        supertrend: null,
      },
    };
  }

  // Sort strictly ascending & deduplicate timestamps (seconds)
  const sorted = [...candles].sort((a, b) => a.timestamp - b.timestamp);
  const clean: Candle[] = [];
  const seen = new Set<number>();
  for (const c of sorted) {
    const sec = Math.floor(c.timestamp / 1000);
    if (!seen.has(sec)) {
      seen.add(sec);
      clean.push(c);
    }
  }

  const n = clean.length;
  const closes = clean.map((c) => c.close);
  const ema20Arr = computeEmaArray(closes, 20);
  const ema50Arr = computeEmaArray(closes, 50);
  const ema200Arr = computeEmaArray(closes, 200);
  const rsiArr = computeRsiArray(closes, 14);
  const atrArr = computeAtrArray(clean, atrPeriod);

  // Rolling 20-bar volume average
  const relVolArr = new Array<number>(n).fill(1);
  for (let i = 0; i < n; i++) {
    const start = Math.max(0, i - 19);
    let volSum = 0;
    let cnt = 0;
    for (let j = start; j <= i; j++) {
      if (Number.isFinite(clean[j].volume) && clean[j].volume > 0) {
        volSum += clean[j].volume;
        cnt++;
      }
    }
    const avgVol = cnt > 0 ? volSum / cnt : 0;
    relVolArr[i] = avgVol > 0 && clean[i].volume > 0 ? clean[i].volume / avgVol : 1;
  }

  // SuperTrend state machine
  const upperBand = new Array<number>(n);
  const lowerBand = new Array<number>(n);
  const supertrendArr = new Array<number>(n);
  const trendArr = new Array<1 | -1>(n);

  for (let i = 0; i < n; i++) {
    const hl2 = (clean[i].high + clean[i].low) / 2;
    const rawUpper = hl2 + atrMult * atrArr[i];
    const rawLower = Math.max(1e-7, hl2 - atrMult * atrArr[i]);

    if (i === 0) {
      upperBand[i] = rawUpper;
      lowerBand[i] = rawLower;
      trendArr[i] = clean[i].close >= hl2 ? 1 : -1;
      supertrendArr[i] = trendArr[i] === 1 ? lowerBand[i] : upperBand[i];
      continue;
    }

    lowerBand[i] =
      rawLower > lowerBand[i - 1] || clean[i - 1].close < lowerBand[i - 1]
        ? rawLower
        : lowerBand[i - 1];

    upperBand[i] =
      rawUpper < upperBand[i - 1] || clean[i - 1].close > upperBand[i - 1]
        ? rawUpper
        : upperBand[i - 1];

    const prevTrend = trendArr[i - 1];
    let curTrend: 1 | -1 = prevTrend;
    if (prevTrend === 1 && clean[i].close < lowerBand[i]) {
      curTrend = -1;
    } else if (prevTrend === -1 && clean[i].close > upperBand[i]) {
      curTrend = 1;
    }

    trendArr[i] = curTrend;
    supertrendArr[i] = curTrend === 1 ? lowerBand[i] : upperBand[i];
  }

  const series: SuperTrendProPoint[] = [];
  for (let i = 0; i < n; i++) {
    const c = clean[i];
    const trend = trendArr[i];
    const ema20 = ema20Arr[i];
    const ema50 = ema50Arr[i];
    const ema200 = ema200Arr[i];
    const rsi = rsiArr[i];
    const isBull = trend === 1;

    let score = 1;
    if (isBull) {
      if (ema20 >= ema50 || c.close > ema50) score++;
      if (rsi >= 50 && c.close >= ema20) score++;
    } else {
      if (ema20 <= ema50 || c.close < ema50) score++;
      if (rsi <= 50 && c.close <= ema20) score++;
    }

    series.push({
      time: Math.floor(c.timestamp / 1000),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      hl2: (c.high + c.low) / 2,
      supertrend: supertrendArr[i],
      trend,
      ema20,
      ema50,
      ema200,
      rsi,
      relVol: relVolArr[i],
      confluenceScore: Math.min(3, Math.max(1, score)) as 1 | 2 | 3,
    });
  }

  // Generate BUY / SELL flip signals, DOTS, SWEEP, EARLY, WEAK, and DIV annotations
  const signals: SuperTrendProSignal[] = [];
  let lastSweepIdx = -999;
  let lastExhaustIdx = -999;
  let lastDivIdx = -999;

  // Pivot highs/lows for divergence & MTF tags
  const pivotLeft = 4;
  const pivotRight = 3;
  const swingHighs: { idx: number; time: number; price: number; rsi: number }[] = [];
  const swingLows: { idx: number; time: number; price: number; rsi: number }[] = [];

  for (let i = pivotLeft; i < n - pivotRight; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - pivotLeft; j <= i + pivotRight; j++) {
      if (j === i) continue;
      if (clean[j].high >= clean[i].high) isHigh = false;
      if (clean[j].low <= clean[i].low) isLow = false;
    }
    if (isHigh) {
      swingHighs.push({
        idx: i,
        time: series[i].time,
        price: clean[i].high,
        rsi: series[i].rsi,
      });
    }
    if (isLow) {
      swingLows.push({
        idx: i,
        time: series[i].time,
        price: clean[i].low,
        rsi: series[i].rsi,
      });
    }
  }

  // Main bar-by-bar signals
  for (let i = 1; i < n; i++) {
    const pt = series[i];
    const prevPt = series[i - 1];
    const c = clean[i];

    // 1. Trend Flip -> Primary BUY / SELL Callout
    if (pt.trend !== prevPt.trend) {
      const isBull = pt.trend === 1;
      const isPrime = pt.confluenceScore === 3;
      signals.push({
        time: pt.time,
        price: isBull ? pt.low : pt.high,
        index: i,
        kind: isBull ? 'BUY' : 'SELL',
        isBull,
        isPrime,
        score: pt.confluenceScore,
        label: isBull
          ? isPrime
            ? 'Buy Signal ★'
            : 'Buy Signal'
          : isPrime
            ? 'Sell Signal ★'
            : 'Sell Signal',
      });

      if (pt.confluenceScore >= 2) {
        signals.push({
          time: pt.time,
          price: isBull ? pt.high : pt.low,
          index: i,
          kind: 'DOTS',
          isBull,
          score: pt.confluenceScore,
          label: pt.confluenceScore === 3 ? '•••' : '••',
        });
      }
      continue;
    }

    // 2. Liquidity Sweep (+)
    if (i >= 12 && i - lastSweepIdx >= 10) {
      let priorLow = Infinity;
      let priorHigh = -Infinity;
      for (let k = i - 10; k < i; k++) {
        if (clean[k].low < priorLow) priorLow = clean[k].low;
        if (clean[k].high > priorHigh) priorHigh = clean[k].high;
      }
      const bullSweep = c.low < priorLow && c.close > priorLow && c.close >= c.open;
      const bearSweep = c.high > priorHigh && c.close < priorHigh && c.close <= c.open;
      if (bullSweep) {
        lastSweepIdx = i;
        signals.push({
          time: pt.time,
          price: pt.low,
          index: i,
          kind: 'SWEEP',
          isBull: true,
          score: pt.confluenceScore,
          label: '+',
        });
      } else if (bearSweep) {
        lastSweepIdx = i;
        signals.push({
          time: pt.time,
          price: pt.high,
          index: i,
          kind: 'SWEEP',
          isBull: false,
          score: pt.confluenceScore,
          label: '+',
        });
      }
    }

    // 3. Early / Weak (◆) Exhaustion warnings
    if (i - lastExhaustIdx >= 12) {
      if (pt.trend === -1 && pt.rsi < 35 && c.close > c.open) {
        lastExhaustIdx = i;
        signals.push({
          time: pt.time,
          price: pt.low,
          index: i,
          kind: 'EARLY',
          isBull: true,
          score: pt.confluenceScore,
          label: '◆',
        });
      } else if (pt.trend === 1 && pt.rsi > 68 && c.close < c.open) {
        lastExhaustIdx = i;
        signals.push({
          time: pt.time,
          price: pt.high,
          index: i,
          kind: 'WEAK',
          isBull: false,
          score: pt.confluenceScore,
          label: '◆',
        });
      }
    }
  }

  // 4. Pivot RSI Divergences (▲ DIV / ▼ DIV)
  for (let k = 1; k < swingHighs.length; k++) {
    const prevH = swingHighs[k - 1];
    const curH = swingHighs[k];
    if (
      curH.price > prevH.price &&
      curH.rsi < prevH.rsi - 2 &&
      curH.idx - lastDivIdx >= 10
    ) {
      lastDivIdx = curH.idx;
      signals.push({
        time: curH.time,
        price: curH.price,
        index: curH.idx,
        kind: 'DIV',
        isBull: false,
        score: series[curH.idx].confluenceScore,
        label: '▼ DIV',
      });
    }
  }

  for (let k = 1; k < swingLows.length; k++) {
    const prevL = swingLows[k - 1];
    const curL = swingLows[k];
    if (
      curL.price < prevL.price &&
      curL.rsi > prevL.rsi + 2 &&
      curL.idx - lastDivIdx >= 10
    ) {
      lastDivIdx = curL.idx;
      signals.push({
        time: curL.time,
        price: curL.price,
        index: curL.idx,
        kind: 'DIV',
        isBull: true,
        score: series[curL.idx].confluenceScore,
        label: '▲ DIV',
      });
    }
  }

  // 5. MTF Swing Badges (1D / 2D / 1W / 1M) placed at significant structural pivots
  const mtfTags: SuperTrendMtfTag[] = [];
  const allPivots: Array<{ idx: number; time: number; price: number; isBull: boolean; rank: number }> = [];

  for (const h of swingHighs) {
    // Rank by local prominence in +/- 12 bars
    const start = Math.max(0, h.idx - 12);
    const end = Math.min(n - 1, h.idx + 12);
    let maxH = -Infinity;
    for (let j = start; j <= end; j++) if (clean[j].high > maxH) maxH = clean[j].high;
    const rank = clean[h.idx].high >= maxH ? 2 : 1;
    allPivots.push({ idx: h.idx, time: h.time, price: h.price, isBull: false, rank });
  }
  for (const l of swingLows) {
    const start = Math.max(0, l.idx - 12);
    const end = Math.min(n - 1, l.idx + 12);
    let minL = Infinity;
    for (let j = start; j <= end; j++) if (clean[j].low < minL) minL = clean[j].low;
    const rank = clean[l.idx].low <= minL ? 2 : 1;
    allPivots.push({ idx: l.idx, time: l.time, price: l.price, isBull: true, rank });
  }

  allPivots.sort((a, b) => a.idx - b.idx);
  const tagCycle: Array<'1D' | '2D' | '1W' | '1M'> = ['1D', '2D', '1W', '1M'];
  let lastMtfIdx = -999;
  for (const pv of allPivots) {
    if (pv.idx - lastMtfIdx < 12) continue;
    lastMtfIdx = pv.idx;
    const tag: '1D' | '2D' | '1W' | '1M' =
      pv.rank >= 2
        ? mtfTags.length % 2 === 0
          ? '1W'
          : '1M'
        : tagCycle[mtfTags.length % 2];
    mtfTags.push({
      time: pv.time,
      price: pv.price,
      tag,
      isBull: pv.isBull,
    });
  }
  // Keep latest 6 MTF tags so chart remains uncluttered
  const trimmedMtfTags = mtfTags.slice(-6);

  // 6. Dynamic Horizontal RESISTANCE & SUPPORT Zones extending to right axis
  const lastPoint = series[n - 1];
  const lastClose = lastPoint.close;
  const lastAtr = Math.max(atrArr[n - 1], lastClose * 0.008, 1e-6);
  const zoneHalfThick = lastAtr * 0.55;

  const recentStartIdx = Math.max(0, n - Math.min(n, 75));
  const recentHighs = swingHighs.filter((h) => h.idx >= recentStartIdx && h.price > lastClose);
  const recentLows = swingLows.filter((l) => l.idx >= recentStartIdx && l.price < lastClose);

  let resCenter: number;
  let resStartIdx: number;
  if (recentHighs.length > 0) {
    // Pick strongest resistance swing just above price or highest recent cluster
    const bestRes = recentHighs.reduce((best, cur) =>
      Math.abs(cur.price - lastClose) < Math.abs(best.price - lastClose) ? cur : best
    );
    resCenter = bestRes.price;
    resStartIdx = Math.min(bestRes.idx, Math.max(0, n - 45));
  } else {
    let maxHigh = lastClose;
    let maxIdx = Math.max(0, n - 30);
    for (let i = Math.max(0, n - 45); i < n; i++) {
      if (clean[i].high > maxHigh) {
        maxHigh = clean[i].high;
        maxIdx = i;
      }
    }
    resCenter = Math.max(maxHigh, lastClose + lastAtr * 1.4);
    resStartIdx = Math.min(maxIdx, Math.max(0, n - 35));
  }

  let supCenter: number;
  let supStartIdx: number;
  if (recentLows.length > 0) {
    const bestSup = recentLows.reduce((best, cur) =>
      Math.abs(lastClose - cur.price) < Math.abs(lastClose - best.price) ? cur : best
    );
    supCenter = bestSup.price;
    supStartIdx = Math.min(bestSup.idx, Math.max(0, n - 45));
  } else {
    let minLow = lastClose;
    let minIdx = Math.max(0, n - 30);
    for (let i = Math.max(0, n - 45); i < n; i++) {
      if (clean[i].low < minLow) {
        minLow = clean[i].low;
        minIdx = i;
      }
    }
    supCenter = Math.max(1e-7, Math.min(minLow, lastClose - lastAtr * 1.4));
    supStartIdx = Math.min(minIdx, Math.max(0, n - 35));
  }

  // Guarantee resistance sits cleanly above support without overlapping
  if (resCenter - zoneHalfThick <= supCenter + zoneHalfThick) {
    const mid = (resCenter + supCenter) / 2;
    resCenter = mid + lastAtr * 1.1;
    supCenter = Math.max(1e-7, mid - lastAtr * 1.1);
  }

  const resistanceZone: SuperTrendZone | null =
    n >= 6
      ? {
          startTime: series[resStartIdx].time,
          top: resCenter + zoneHalfThick * 0.5,
          bot: resCenter - zoneHalfThick * 0.5,
          label: 'RESISTANCE',
        }
      : null;

  const supportZone: SuperTrendZone | null =
    n >= 6
      ? {
          startTime: series[supStartIdx].time,
          top: supCenter + zoneHalfThick * 0.5,
          bot: Math.max(1e-7, supCenter - zoneHalfThick * 0.5),
          label: 'SUPPORT',
        }
      : null;

  // 7. Telemetry Dashboard Summary
  const isBull = lastPoint.trend === 1;
  const volState: 'high' | 'normal' | 'low' =
    lastPoint.relVol >= 1.45 ? 'high' : lastPoint.relVol <= 0.65 ? 'low' : 'normal';

  const bullEmaAligned =
    lastPoint.ema20 > lastPoint.ema50 && lastPoint.ema50 > lastPoint.ema200;
  const bearEmaAligned =
    lastPoint.ema20 < lastPoint.ema50 && lastPoint.ema50 < lastPoint.ema200;
  const emasAligned = bullEmaAligned || bearEmaAligned;

  const emaOrderText = bullEmaAligned
    ? '20 > 50 > 200 ✓'
    : bearEmaAligned
      ? '20 < 50 < 200 ✓'
      : lastPoint.ema20 >= lastPoint.ema50
        ? '20 > 50 ~ 200'
        : '20 < 50 ~ 200';

  return {
    series,
    signals,
    mtfTags: trimmedMtfTags,
    resistanceZone,
    supportZone,
    dashboard: {
      symbol,
      timeframe,
      trendLabel: isBull ? '▲ UPTREND' : '▼ DOWNTREND',
      isBull,
      rsi: lastPoint.rsi,
      volumeState: volState,
      emasAligned,
      emaOrderText,
      ema20: lastPoint.ema20,
      ema50: lastPoint.ema50,
      ema200: lastPoint.ema200,
      supertrend: lastPoint.supertrend,
    },
  };
}
