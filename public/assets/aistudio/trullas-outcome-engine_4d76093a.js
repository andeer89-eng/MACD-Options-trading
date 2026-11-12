/* =====================================================================
   TRULLAS — Outcome engine (implementare de REFERINȚĂ, determinist, fără dependențe)
   Ce face: dat un semnal confirmat + barele de DUPĂ `confirmed_bar_ts`, calculează
     (1) simulateExit  — rezultatul în R sub o politică de ieșire versionată -> `signal_outcomes`
     (2) computePath   — traiectoria pieței FĂRĂ ieșiri (fwdR la 1/3/5/10/20 bare, MFE/MAE) -> `signal_forward`
     (3) clusterStats  — medie, SE pe clustere zilnice, CI90 (identic cu cluster_stats() din SQL 10.2)
   Politicile X1/X2/X3 = EXACT cele din plan §6.5 și din `exit_policies` (SQL 10.6). Valori de pornire.
   Convenții (conservatoare, anti look-ahead):
     - bars[0] = prima bară DUPĂ bara de confirmare. Bară: {o,h,l,c, ma30?, earnNext?}
     - `earnNext:true` pe bara j = earnings între închiderea lui j și deschiderea lui j+1 (data e în calendar,
       deci nu e look-ahead). Politicile NU ies înainte de earnings; rezultatul poartă `earningsInWindow`
     - intrare 'next_open': la deschiderea barei 0; 'trigger': ordin stop la `sig.trigger`, valabil `validBars`
     - decizii pe închidere (invalidare, MA30, semnal opus, time-stop) => execuție la deschiderea barei următoare
       (dacă bara următoare nu există încă: status 'open', `pendingExit` setat)
     - SL și TP în aceeași bară => SL primul (`ambiguous:true`); gap peste stop => execuție la deschidere;
       gap peste TP => umplere la nivelul TP (fără bonus de gap)
     - o politică activă la bara k folosește doar bare <= k (proprietate testată: rezultatul unui semnal închis
       nu se schimbă când sosesc bare noi)
     - cost forfetar tur-retur în R: (2·slipAtr·ATR + roundTripBps·intrare/1e4) / risc; R net = R brut − costR
   Unități: R = (preț − intrare)·direcție / risc, cu risc = |intrare − stop| măsurat la FILL.
   ===================================================================== */
(function (root) {
  'use strict';
  var ENGINE_VERSION = 'outcome-1.1.0';

  /* ---- Politici (aceleași valori ca în SQL 10.6; time-stop pe timeframe) ---- */
  var BASE = {
    entryMode: 'next_open',        // 'next_open' | 'trigger'
    validBars: 3,                  // doar 'trigger'
    maxChaseAtr: 0.75,             // fill mai departe de intrarea planificată cu > 0,75 ATR -> void 'chase'
    maxRiskAtr: 3,                 // risc > 3·ATR -> void 'stop_too_wide' (la fel ca Levels.stopTooWide)
    tpMode: 'none',                // 'levels' = TP1 din Levels (sig.tp1Price), ieșire integrală | 'none'
    tp1R: 2, tp1Fraction: 1, beAfterTp1: false, tp2R: null,   // fallback când semnalul nu are tp1Price
    trail: null,                   // {after:'entry'|'tp1'|'r', activateR?, toBreakeven?, mult}
    timeStop: null,                // {maxBars: număr | {'1w':8,'1d':15,'1h':20}}
    invalidationExit: false, oppositeExit: false, maExit: false,
    cost: { roundTripBps: 10, slipAtr: 0 }  // 5 bps/parte: ipoteză de calibrat cu fill-urile paper
  };
  function mk(o) { var r = {}, k; for (k in BASE) r[k] = BASE[k]; for (k in o) r[k] = o[k]; return r; }
  var POLICIES = {
    X1_fixed_v1: mk({ name: 'X1_fixed_v1', tpMode: 'levels', timeStop: { maxBars: { '1w': 8, '1d': 15, '1h': 20 } } }),
    X2_trail_v1: mk({ name: 'X2_trail_v1', trail: { after: 'r', activateR: 1, toBreakeven: true, mult: 2 },
      timeStop: { maxBars: { '1w': 12, '1d': 25, '1h': 30 } } }),
    X3_structure_v1: mk({ name: 'X3_structure_v1', invalidationExit: true, oppositeExit: true, maExit: true,
      timeStop: { maxBars: { '1w': 12, '1d': 25, '1h': 30 } } })
  };
  var DEFAULT_POLICY = POLICIES.X1_fixed_v1;   // politica primară = ce face botul

  /* Mapare motiv de ieșire (engine) -> valorile permise de signal_outcomes.exit_reason */
  var SQL_REASON = { sl: 'sl', be: 'sl', trail: 'trail', tp1: 'tp', tp2: 'tp', invalidation: 'invalidation',
    opposite: 'structure', ma30: 'structure', time: 'time' };

  /* ---- t unilateral 95% (= CI90 bilateral). IDENTIC cu t95(df) din SQL 10.1 (conservator pentru df > 30) ---- */
  var T95 = [6.314, 2.920, 2.353, 2.132, 2.015, 1.943, 1.895, 1.860, 1.833, 1.812, 1.796, 1.782, 1.771, 1.761,
    1.753, 1.746, 1.740, 1.734, 1.729, 1.725, 1.721, 1.717, 1.714, 1.711, 1.708, 1.706, 1.703, 1.701, 1.699, 1.697];
  function t95(df) {
    if (!(df >= 1)) return NaN;
    if (df <= 30) return T95[df - 1];
    if (df <= 40) return 1.697;
    if (df <= 60) return 1.684;
    if (df <= 120) return 1.671;
    return 1.658;
  }
  function tq(n) { return t95(n - 1); }   // pentru n observații independente

  function mergePolicy(p) {
    var o = mk({}), k;
    if (p) for (k in p) o[k] = p[k];
    return o;
  }
  // NOTĂ: mergePolicy e superficial — `trail`, `timeStop`, `cost` se înlocuiesc ÎNTREGI dacă sunt date.
  function dirOf(sig) { return sig.direction === 'short' ? -1 : 1; }
  function maxBarsOf(pol, sig) {
    if (!pol.timeStop) return null;
    var m = pol.timeStop.maxBars;
    return typeof m === 'object' ? m[sig.timeframe || '1d'] : m;
  }

  /* Rezolvă intrarea: {idx, fill, risk} | {void:'...'} | {wait:true} */
  function resolveEntry(sig, bars, pol) {
    var d = dirOf(sig), atr = sig.atr, idx = -1, fill, i, b;
    if (!bars || !bars.length) return { wait: true };
    if (pol.entryMode === 'trigger') {
      var lim = Math.min(pol.validBars, bars.length);
      for (i = 0; i < lim; i++) {
        b = bars[i];
        if (d === 1 ? b.h >= sig.trigger : b.l <= sig.trigger) {
          idx = i;
          fill = d === 1 ? Math.max(sig.trigger, b.o) : Math.min(sig.trigger, b.o); // gap peste trigger => la deschidere
          break;
        }
      }
      if (idx < 0) return bars.length >= pol.validBars ? { void: 'not_triggered' } : { wait: true };
    } else { idx = 0; fill = bars[0].o; }
    if (sig.entry != null && pol.maxChaseAtr != null && d * (fill - sig.entry) > pol.maxChaseAtr * atr) return { void: 'chase' };
    var risk = d * (fill - sig.stop);
    if (!(risk > 0)) return { void: 'stop_beyond_entry' };
    if (risk > pol.maxRiskAtr * atr) return { void: 'stop_too_wide' };
    return { idx: idx, fill: fill, risk: risk };
  }

  /* sig: {direction, stop, atr, timeframe?, entry?, trigger?, invalidation?, tp1Price?, tp2Price?}
     ctx: {oppositeBars?: number[]}  (indici de bară la a căror ÎNCHIDERE a apărut semnal opus) */
  function simulateExit(sig, bars, policy, ctx) {
    var pol = mergePolicy(policy); ctx = ctx || {};
    var d = dirOf(sig), atr = sig.atr, n = bars.length;
    var en = resolveEntry(sig, bars, pol);
    if (en.wait) return { engineVersion: ENGINE_VERSION, status: 'open', openReason: 'awaiting_trigger' };
    if (en.void) return { engineVersion: ENGINE_VERSION, status: 'void', voidReason: en.void };

    var fill = en.fill, risk = en.risk, ei = en.idx;
    function R(px) { return d * (px - fill) / risk; }
    var tp1P = null, tp2P = null;
    if (pol.tpMode === 'levels') {
      tp1P = sig.tp1Price != null ? sig.tp1Price : (pol.tp1R != null ? fill + d * pol.tp1R * risk : null);
      tp2P = sig.tp2Price != null ? sig.tp2Price : (pol.tp2R != null ? fill + d * pol.tp2R * risk : null);
    }
    var costR = (2 * pol.cost.slipAtr * atr + pol.cost.roundTripBps / 1e4 * fill) / risk;
    var maxBars = maxBarsOf(pol, sig);

    var stop = sig.stop, kind = 'sl', tp1Hit = false, remaining = 1, realized = 0, extreme = fill;
    var mfe = 0, mae = 0, ambiguous = false, pending = null, trailOn = false, sawEarn = false, i, b;

    function done(idx, px, reason, atOpen, gap) {
      if (remaining > 1e-12) { realized += remaining * R(px); remaining = 0; }
      mfe = Math.max(mfe, R(px)); mae = Math.min(mae, R(px));
      return {
        engineVersion: ENGINE_VERSION, status: 'closed',
        entryIdx: ei, entryFill: fill, risk: risk,
        exitIdx: idx, exitReason: reason, exitReasonSql: SQL_REASON[reason], exitPrice: px, gapExit: !!gap,
        barsHeld: idx - ei + (atOpen ? 0 : 1), tp1Hit: tp1Hit,
        rGross: realized, costR: costR, rNet: realized - costR,
        mfeR: mfe, maeR: mae, ambiguous: ambiguous, earningsInWindow: sawEarn
      };
    }

    for (i = ei; i < n; i++) {
      b = bars[i];
      if (pending) return done(i, b.o, pending, true, false);                     // decizie la închiderea barei anterioare
      if (i > ei && d * (b.o - stop) <= 0) return done(i, b.o, kind, true, true); // gap peste stop
      var slHit = d === 1 ? b.l <= stop : b.h >= stop;
      var tp = tp1Hit ? tp2P : tp1P;
      var tpHit = tp != null && (d === 1 ? b.h >= tp : b.l <= tp);
      if (slHit) {                                                                // SL primul
        if (tpHit) ambiguous = true;
        return done(i, stop, kind, false, false);
      }
      mfe = Math.max(mfe, R(d === 1 ? b.h : b.l));
      mae = Math.min(mae, R(d === 1 ? b.l : b.h));
      if (tpHit) {
        if (!tp1Hit) {
          realized += pol.tp1Fraction * R(tp1P); remaining -= pol.tp1Fraction; tp1Hit = true;
          if (remaining <= 1e-12) { remaining = 0; return done(i, tp1P, 'tp1', false, false); }
          if (pol.beAfterTp1 && d * (fill - stop) > 0) { stop = fill; kind = 'be'; }
        } else {
          return done(i, tp2P, 'tp2', false, false);
        }
      }
      extreme = d === 1 ? Math.max(extreme, b.h) : Math.min(extreme, b.l);
      if (pol.trail) {
        var tr = pol.trail;
        if (!trailOn) {
          if (tr.after === 'entry') trailOn = true;
          else if (tr.after === 'tp1') trailOn = tp1Hit;
          else if (tr.after === 'r' && R(extreme) >= tr.activateR) {              // efectiv de la bara următoare
            trailOn = true;
            if (tr.toBreakeven && d * (fill - stop) > 0) { stop = fill; kind = 'be'; }
          }
        }
        if (trailOn) {
          var cand = extreme - d * tr.mult * atr;
          if (d * (cand - stop) > 0) { stop = cand; kind = 'trail'; }
        }
      }
      if (pol.invalidationExit && sig.invalidation != null && d * (b.c - sig.invalidation) < 0) pending = 'invalidation';
      else if (pol.oppositeExit && ctx.oppositeBars && ctx.oppositeBars.indexOf(i) >= 0) pending = 'opposite';
      else if (pol.maExit && b.ma30 != null && d * (b.c - b.ma30) < 0) pending = 'ma30';
      else if (maxBars != null && i - ei + 1 >= maxBars) pending = 'time';
      if (b.earnNext) sawEarn = true;
    }
    var last = bars[n - 1];
    var mark = realized + remaining * R(last.c);
    return {
      engineVersion: ENGINE_VERSION, status: 'open',
      entryIdx: ei, entryFill: fill, risk: risk, tp1Hit: tp1Hit, barsHeld: n - ei,
      markR: mark, costR: costR, markNet: mark - costR, mfeR: mfe, maeR: mae,
      pendingExit: pending, ambiguous: ambiguous, earningsInWindow: sawEarn
    };
  }

  /* Traiectoria după semnal, FĂRĂ ieșiri (calitatea semnalului în sine) -> `signal_forward`.
     fwdR[h] = R la ÎNCHIDEREA barei a h-a (bara de intrare = bara 1), stop-ul semnalului ignorat.
     mfe20R >= 0 >= mae20R pe primele 20 de bare. `complete` = toate orizonturile calculate. */
  var HORIZONS = [1, 3, 5, 10, 20];
  function computePath(sig, bars, policy) {
    var pol = mergePolicy(policy);
    var en = resolveEntry(sig, bars, pol);
    if (en.void) return { status: 'void', voidReason: en.void };
    if (en.wait) return { status: 'open' };
    var d = dirOf(sig), fill = en.fill, risk = en.risk, ei = en.idx, h, k, b;
    var fwdR = {}, mfe = 0, mae = 0, avail = bars.length - ei;
    for (k = 0; k < Math.min(20, avail); k++) {
      b = bars[ei + k];
      mfe = Math.max(mfe, d * ((d === 1 ? b.h : b.l) - fill) / risk);
      mae = Math.min(mae, d * ((d === 1 ? b.l : b.h) - fill) / risk);
    }
    for (h = 0; h < HORIZONS.length; h++) {
      if (HORIZONS[h] <= avail) fwdR[HORIZONS[h]] = d * (bars[ei + HORIZONS[h] - 1].c - fill) / risk;
    }
    return { status: 'ok', entryIdx: ei, entryFill: fill, risk: risk, fwdR: fwdR, mfe20R: mfe, mae20R: mae,
      complete: avail >= 20 };
  }

  /* Medie, SE pe clustere (o zi de semnal = un cluster), CI90. Formula din SQL 10.2:
     SE = sqrt( G/(G−1) · Σ_g (Σ_{i∈g}(x_i − μ))² ) / n ;  CI90 = μ ± t95(G−1)·SE ; G = n_eff */
  function clusterStats(vals, days) {
    var n = vals.length, i, mu = 0;
    if (!n) return { n: 0, nEff: 0, mean: NaN, se: NaN, lo: NaN, hi: NaN };
    for (i = 0; i < n; i++) mu += vals[i];
    mu /= n;
    var dev = {}, g = 0, key;
    for (i = 0; i < n; i++) { key = String(days[i]); if (!(key in dev)) { dev[key] = 0; g++; } dev[key] += vals[i] - mu; }
    var ss = 0;
    for (key in dev) ss += dev[key] * dev[key];
    var se = g >= 2 ? Math.sqrt(g / (g - 1) * ss) / n : NaN;
    var q = t95(g - 1);
    return { n: n, nEff: g, mean: mu, se: se, lo: mu - q * se, hi: mu + q * se };
  }

  /* Rezumat descriptiv (fără CI): PF „—" (null) sub n = 10, ca în SQL; capture = Σ R realizat / Σ MFE */
  function summarize(rs) {
    var n = rs.length, i;
    if (!n) return { n: 0, mean: NaN, sd: NaN, wins: 0, winRate: NaN, avgWin: NaN, avgLoss: NaN, pf: null, median: NaN, sum: 0 };
    var sum = 0, gw = 0, gl = 0, nw = 0, nl = 0;
    for (i = 0; i < n; i++) { sum += rs[i]; if (rs[i] > 0) { gw += rs[i]; nw++; } else if (rs[i] < 0) { gl -= rs[i]; nl++; } }
    var mean = sum / n, ss = 0;
    for (i = 0; i < n; i++) ss += (rs[i] - mean) * (rs[i] - mean);
    var sd = n > 1 ? Math.sqrt(ss / (n - 1)) : NaN;
    var s = rs.slice().sort(function (a, b) { return a - b; });
    var med = n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
    return { n: n, mean: mean, sd: sd, wins: nw, winRate: nw / n, avgWin: nw ? gw / nw : NaN,
      avgLoss: nl ? gl / nl : NaN, pf: n >= 10 && gl > 0 ? gw / gl : null, median: med, sum: sum };
  }

  var api = {
    ENGINE_VERSION: ENGINE_VERSION, POLICIES: POLICIES, DEFAULT_POLICY: DEFAULT_POLICY, HORIZONS: HORIZONS,
    mergePolicy: mergePolicy, resolveEntry: resolveEntry, simulateExit: simulateExit, computePath: computePath,
    clusterStats: clusterStats, summarize: summarize, t95: t95, tq: tq
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TrullasEngine = api;
})(typeof window !== 'undefined' ? window : this);
