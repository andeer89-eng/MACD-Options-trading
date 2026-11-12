/* =====================================================================
   TRULLAS — Outcome Engine (Pure TypeScript Implementation)
   Ported 1:1 from trullas-outcome-engine.js (Reference Version 1.1.0)
   Deterministic, zero Math.random(), anti look-ahead.
   ===================================================================== */

export const ENGINE_VERSION = 'outcome-1.1.0';

export type Timeframe = '1w' | '1d' | '1h';
export type Direction = 'long' | 'short';
export type ExitReason = 'tp' | 'sl' | 'time' | 'trail' | 'structure' | 'invalidation';
export type ExitReasonSql = 'tp' | 'sl' | 'time' | 'trail' | 'structure' | 'invalidation';

export interface Bar {
  o: number;
  h: number;
  l: number;
  c: number;
  ma30?: number;
  earnNext?: boolean;
}

export interface SignalInput {
  id?: string;
  symbol?: string;
  direction: Direction;
  timeframe?: Timeframe;
  entry?: number;
  trigger?: number;
  stop: number;
  atr: number;
  invalidation?: number;
  tp1Price?: number;
  tp2Price?: number;
}

export interface PolicyCost {
  roundTripBps: number;
  slipAtr: number;
}

export interface ExitPolicy {
  name: string;
  entryMode: 'next_open' | 'trigger';
  validBars: number;
  maxChaseAtr: number;
  maxRiskAtr: number;
  tpMode: 'none' | 'levels';
  tp1R: number | null;
  tp1Fraction: number;
  beAfterTp1: boolean;
  tp2R: number | null;
  trail: {
    after: 'entry' | 'tp1' | 'r';
    activateR?: number;
    toBreakeven?: boolean;
    mult: number;
  } | null;
  timeStop: {
    maxBars: number | Record<Timeframe, number>;
  } | null;
  invalidationExit: boolean;
  oppositeExit: boolean;
  maExit: boolean;
  cost: PolicyCost;
}

export const BASE_POLICY: ExitPolicy = {
  name: 'BASE',
  entryMode: 'next_open',
  validBars: 3,
  maxChaseAtr: 0.75,
  maxRiskAtr: 3,
  tpMode: 'none',
  tp1R: 2,
  tp1Fraction: 1,
  beAfterTp1: false,
  tp2R: null,
  trail: null,
  timeStop: null,
  invalidationExit: false,
  oppositeExit: false,
  maExit: false,
  cost: { roundTripBps: 10, slipAtr: 0 },
};

export const POLICIES: Record<string, ExitPolicy> = {
  X1_fixed_v1: {
    ...BASE_POLICY,
    name: 'X1_fixed_v1',
    tpMode: 'levels',
    timeStop: { maxBars: { '1w': 8, '1d': 15, '1h': 20 } },
  },
  X2_trail_v1: {
    ...BASE_POLICY,
    name: 'X2_trail_v1',
    trail: { after: 'r', activateR: 1, toBreakeven: true, mult: 2 },
    timeStop: { maxBars: { '1w': 12, '1d': 25, '1h': 30 } },
  },
  X3_structure_v1: {
    ...BASE_POLICY,
    name: 'X3_structure_v1',
    invalidationExit: true,
    oppositeExit: true,
    maExit: true,
    timeStop: { maxBars: { '1w': 12, '1d': 25, '1h': 30 } },
  },
};

export const DEFAULT_POLICY = POLICIES.X1_fixed_v1;

const SQL_REASON: Record<string, ExitReasonSql> = {
  sl: 'sl',
  be: 'sl',
  trail: 'trail',
  tp1: 'tp',
  tp2: 'tp',
  invalidation: 'invalidation',
  opposite: 'structure',
  ma30: 'structure',
  time: 'time',
};

const T95 = [
  6.314, 2.92, 2.353, 2.132, 2.015, 1.943, 1.895, 1.86, 1.833, 1.812, 1.796,
  1.782, 1.771, 1.761, 1.753, 1.746, 1.74, 1.734, 1.729, 1.725, 1.721,
  1.717, 1.714, 1.711, 1.708, 1.706, 1.703, 1.701, 1.699, 1.697,
];

export function t95(df: number): number {
  if (!(df >= 1)) return NaN;
  if (df <= 30) return T95[df - 1];
  if (df <= 40) return 1.697;
  if (df <= 60) return 1.684;
  if (df <= 120) return 1.671;
  return 1.658;
}

export function tq(n: number): number {
  return t95(n - 1);
}

function dirOf(sig: SignalInput): number {
  return sig.direction === 'short' ? -1 : 1;
}

function maxBarsOf(pol: ExitPolicy, sig: SignalInput): number | null {
  if (!pol.timeStop) return null;
  const m = pol.timeStop.maxBars;
  return typeof m === 'object' ? m[sig.timeframe || '1d'] : m;
}

export interface EntryResolution {
  idx?: number;
  fill?: number;
  risk?: number;
  void?: string;
  wait?: boolean;
}

export function resolveEntry(
  sig: SignalInput,
  bars: Bar[],
  pol: ExitPolicy
): EntryResolution {
  const d = dirOf(sig);
  const atr = sig.atr;
  let idx = -1;
  let fill = 0;

  if (!bars || !bars.length) return { wait: true };

  if (pol.entryMode === 'trigger') {
    const lim = Math.min(pol.validBars, bars.length);
    for (let i = 0; i < lim; i++) {
      const b = bars[i];
      if (sig.trigger !== undefined && (d === 1 ? b.h >= sig.trigger : b.l <= sig.trigger)) {
        idx = i;
        fill = d === 1 ? Math.max(sig.trigger, b.o) : Math.min(sig.trigger, b.o);
        break;
      }
    }
    if (idx < 0) return bars.length >= pol.validBars ? { void: 'not_triggered' } : { wait: true };
  } else {
    idx = 0;
    fill = bars[0].o;
  }

  if (sig.entry != null && pol.maxChaseAtr != null && d * (fill - sig.entry) > pol.maxChaseAtr * atr) {
    return { void: 'chase' };
  }

  const risk = d * (fill - sig.stop);
  if (!(risk > 0)) return { void: 'stop_beyond_entry' };
  if (risk > pol.maxRiskAtr * atr) return { void: 'stop_too_wide' };

  return { idx, fill, risk };
}

export interface ExitResult {
  engineVersion: string;
  status: 'closed' | 'open' | 'void';
  voidReason?: string;
  openReason?: string;
  entryIdx?: number;
  entryFill?: number;
  risk?: number;
  exitIdx?: number;
  exitReason?: string;
  exitReasonSql?: ExitReasonSql;
  exitPrice?: number;
  gapExit?: boolean;
  barsHeld?: number;
  tp1Hit?: boolean;
  rGross?: number;
  costR?: number;
  rNet?: number;
  markR?: number;
  markNet?: number;
  mfeR?: number;
  maeR?: number;
  ambiguous?: boolean;
  earningsInWindow?: boolean;
  pendingExit?: string | null;
}

export function simulateExit(
  sig: SignalInput,
  bars: Bar[],
  policy: ExitPolicy = DEFAULT_POLICY,
  ctx: { oppositeBars?: number[] } = {}
): ExitResult {
  const pol = policy;
  const d = dirOf(sig);
  const atr = sig.atr;
  const n = bars.length;

  const en = resolveEntry(sig, bars, pol);
  if (en.wait) return { engineVersion: ENGINE_VERSION, status: 'open', openReason: 'awaiting_trigger' };
  if (en.void) return { engineVersion: ENGINE_VERSION, status: 'void', voidReason: en.void };

  const fill = en.fill!;
  const risk = en.risk!;
  const ei = en.idx!;

  const R = (px: number) => (d * (px - fill)) / risk;

  let tp1P: number | null = null;
  let tp2P: number | null = null;

  if (pol.tpMode === 'levels') {
    tp1P = sig.tp1Price != null ? sig.tp1Price : (pol.tp1R != null ? fill + d * pol.tp1R * risk : null);
    tp2P = sig.tp2Price != null ? sig.tp2Price : (pol.tp2R != null ? fill + d * pol.tp2R * risk : null);
  }

  const costR = (2 * pol.cost.slipAtr * atr + (pol.cost.roundTripBps / 10000) * fill) / risk;
  const maxBars = maxBarsOf(pol, sig);

  let stop = sig.stop;
  let kind = 'sl';
  let tp1Hit = false;
  let remaining = 1;
  let realized = 0;
  let extreme = fill;
  let mfe = 0;
  let mae = 0;
  let ambiguous = false;
  let pending: string | null = null;
  let trailOn = false;
  let sawEarn = false;

  const done = (idx: number, px: number, reason: string, atOpen: boolean, gap: boolean): ExitResult => {
    if (remaining > 1e-12) {
      realized += remaining * R(px);
      remaining = 0;
    }
    mfe = Math.max(mfe, R(px));
    mae = Math.min(mae, R(px));
    return {
      engineVersion: ENGINE_VERSION,
      status: 'closed',
      entryIdx: ei,
      entryFill: fill,
      risk,
      exitIdx: idx,
      exitReason: reason,
      exitReasonSql: SQL_REASON[reason] || 'sl',
      exitPrice: px,
      gapExit: !!gap,
      barsHeld: idx - ei + (atOpen ? 0 : 1),
      tp1Hit,
      rGross: realized,
      costR,
      rNet: realized - costR,
      mfeR: mfe,
      maeR: mae,
      ambiguous,
      earningsInWindow: sawEarn,
    };
  };

  for (let i = ei; i < n; i++) {
    const b = bars[i];
    if (pending) return done(i, b.o, pending, true, false);
    if (i > ei && d * (b.o - stop) <= 0) return done(i, b.o, kind, true, true);

    const slHit = d === 1 ? b.l <= stop : b.h >= stop;
    const tp = tp1Hit ? tp2P : tp1P;
    const tpHit = tp != null && (d === 1 ? b.h >= tp : b.l <= tp);

    if (slHit) {
      if (tpHit) ambiguous = true;
      return done(i, stop, kind, false, false);
    }

    mfe = Math.max(mfe, R(d === 1 ? b.h : b.l));
    mae = Math.min(mae, R(d === 1 ? b.l : b.h));

    if (tpHit) {
      if (!tp1Hit) {
        realized += pol.tp1Fraction * R(tp1P!);
        remaining -= pol.tp1Fraction;
        tp1Hit = true;
        if (remaining <= 1e-12) {
          remaining = 0;
          return done(i, tp1P!, 'tp1', false, false);
        }
        if (pol.beAfterTp1 && d * (fill - stop) > 0) {
          stop = fill;
          kind = 'be';
        }
      } else {
        return done(i, tp2P!, 'tp2', false, false);
      }
    }

    extreme = d === 1 ? Math.max(extreme, b.h) : Math.min(extreme, b.l);

    if (pol.trail) {
      const tr = pol.trail;
      if (!trailOn) {
        if (tr.after === 'entry') trailOn = true;
        else if (tr.after === 'tp1') trailOn = tp1Hit;
        else if (tr.after === 'r' && tr.activateR !== undefined && R(extreme) >= tr.activateR) {
          trailOn = true;
          if (tr.toBreakeven && d * (fill - stop) > 0) {
            stop = fill;
            kind = 'be';
          }
        }
      }
      if (trailOn) {
        const cand = extreme - d * tr.mult * atr;
        if (d * (cand - stop) > 0) {
          stop = cand;
          kind = 'trail';
        }
      }
    }

    if (pol.invalidationExit && sig.invalidation != null && d * (b.c - sig.invalidation) < 0) {
      pending = 'invalidation';
    } else if (pol.oppositeExit && ctx.oppositeBars && ctx.oppositeBars.indexOf(i) >= 0) {
      pending = 'opposite';
    } else if (pol.maExit && b.ma30 != null && d * (b.c - b.ma30) < 0) {
      pending = 'ma30';
    } else if (maxBars != null && i - ei + 1 >= maxBars) {
      pending = 'time';
    }

    if (b.earnNext) sawEarn = true;
  }

  const last = bars[n - 1];
  const mark = realized + remaining * R(last.c);

  return {
    engineVersion: ENGINE_VERSION,
    status: 'open',
    entryIdx: ei,
    entryFill: fill,
    risk,
    tp1Hit,
    barsHeld: n - ei,
    markR: mark,
    costR,
    markNet: mark - costR,
    mfeR: mfe,
    maeR: mae,
    pendingExit: pending,
    ambiguous,
    earningsInWindow: sawEarn,
  };
}

export const HORIZONS = [1, 3, 5, 10, 20] as const;

export interface PathResult {
  status: 'ok' | 'void' | 'open';
  voidReason?: string;
  entryIdx?: number;
  entryFill?: number;
  risk?: number;
  fwdR?: Record<number, number>;
  mfe20R?: number;
  mae20R?: number;
  complete?: boolean;
}

export function computePath(
  sig: SignalInput,
  bars: Bar[],
  policy: ExitPolicy = DEFAULT_POLICY
): PathResult {
  const en = resolveEntry(sig, bars, policy);
  if (en.void) return { status: 'void', voidReason: en.void };
  if (en.wait) return { status: 'open' };

  const d = dirOf(sig);
  const fill = en.fill!;
  const risk = en.risk!;
  const ei = en.idx!;
  const avail = bars.length - ei;

  const fwdR: Record<number, number> = {};
  let mfe = 0;
  let mae = 0;

  for (let k = 0; k < Math.min(20, avail); k++) {
    const b = bars[ei + k];
    mfe = Math.max(mfe, (d * ((d === 1 ? b.h : b.l) - fill)) / risk);
    mae = Math.min(mae, (d * ((d === 1 ? b.l : b.h) - fill)) / risk);
  }

  for (let h = 0; h < HORIZONS.length; h++) {
    const horizon = HORIZONS[h];
    if (horizon <= avail) {
      fwdR[horizon] = (d * (bars[ei + horizon - 1].c - fill)) / risk;
    }
  }

  return {
    status: 'ok',
    entryIdx: ei,
    entryFill: fill,
    risk,
    fwdR,
    mfe20R: mfe,
    mae20R: mae,
    complete: avail >= 20,
  };
}

export interface ClusterStats {
  n: number;
  nEff: number;
  mean: number;
  se: number;
  lo: number;
  hi: number;
}

export function clusterStats(vals: number[], days: (number | string)[]): ClusterStats {
  const n = vals.length;
  if (!n) return { n: 0, nEff: 0, mean: NaN, se: NaN, lo: NaN, hi: NaN };

  let mu = 0;
  for (let i = 0; i < n; i++) mu += vals[i];
  mu /= n;

  const dev: Record<string, number> = {};
  let g = 0;

  for (let i = 0; i < n; i++) {
    const key = String(days[i]);
    if (!(key in dev)) {
      dev[key] = 0;
      g++;
    }
    dev[key] += vals[i] - mu;
  }

  let ss = 0;
  for (const key in dev) ss += dev[key] * dev[key];

  const se = g >= 2 ? Math.sqrt((g / (g - 1)) * ss) / n : NaN;
  const q = t95(g - 1);

  return { n, nEff: g, mean: mu, se, lo: mu - q * se, hi: mu + q * se };
}

export interface SummaryStats {
  n: number;
  mean: number;
  sd: number;
  wins: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  pf: number | null;
  median: number;
  sum: number;
}

export function summarize(rs: number[]): SummaryStats {
  const n = rs.length;
  if (!n) {
    return {
      n: 0,
      mean: NaN,
      sd: NaN,
      wins: 0,
      winRate: NaN,
      avgWin: NaN,
      avgLoss: NaN,
      pf: null,
      median: NaN,
      sum: 0,
    };
  }

  let sum = 0;
  let gw = 0;
  let gl = 0;
  let nw = 0;
  let nl = 0;

  for (let i = 0; i < n; i++) {
    sum += rs[i];
    if (rs[i] > 0) {
      gw += rs[i];
      nw++;
    } else if (rs[i] < 0) {
      gl -= rs[i];
      nl++;
    }
  }

  const mean = sum / n;
  let ss = 0;
  for (let i = 0; i < n; i++) ss += (rs[i] - mean) * (rs[i] - mean);
  const sd = n > 1 ? Math.sqrt(ss / (n - 1)) : NaN;

  const s = rs.slice().sort((a, b) => a - b);
  const med = n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;

  return {
    n,
    mean,
    sd,
    wins: nw,
    winRate: nw / n,
    avgWin: nw ? gw / nw : NaN,
    avgLoss: nl ? gl / nl : NaN,
    pf: n >= 10 && gl > 0 ? gw / gl : null,
    median: med,
    sum,
  };
}
