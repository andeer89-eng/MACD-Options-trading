/**
 * ML4T Factor Research & Walk-Forward Meta-Scoring Engine (Native TypeScript)
 *
 * Implements Stefan Jansen's "Machine Learning for Trading" (Ch. 4, Ch. 11, Ch. 12, Ch. 24)
 * natively on real OHLCV history with strict anti-lookahead (.shift(1) causal lag):
 *
 * Newly Ported Pine Script Indicators:
 *  1. B-Xtrender (@Puppytherapy) — RSI(EMA5-EMA20, 15)-50, Long RSI(EMA20, 15)-50, Tillson T3(5)
 *  2. Williams Vix Fix (TheeHoganator) — (Highest(C,22)-L)/Highest(C,22)*100 + BB & filtered reversal
 *  3. WhaleFusion Institutional v6 — WhaleMap Vol Imbalance, LinReg Momentum, CCI(21), pTrend Regime
 *  4. AlgoAlpha Trend Flow Trail — Hull MA(33) ratcheting AlphaTrail + HMA(7)-smoothed MFI(14)
 *  5. Centered MFI (v9 PRO style) — MFI(14)-50 & SMA(9) signal spread
 *
 * Combined side-by-side against StageLedger Native Core Factors:
 *  - Trullas MACD Histogram, RSI(14), RelVol StDev(50), VZO(14), VWAP VScore(50),
 *    Keltner/Squeeze Position, ADX(14), 50-SMA Stretch (%).
 */

import {
  Candle,
  calculateATR,
  calculateEMA,
  calculateIndicators,
  calculateRSI,
} from './trullasStrategy.ts';

export type FactorOrigin = 'NEW_PINE_PORT' | 'ATTACHED_SUITE' | 'STAGELEDGER_CORE';
export type FactorVerdict = 'ALPHA_SIGNAL' | 'WEAK_EDGE' | 'NOISE' | 'LOOKAHEAD_SUSPECT';

export const SIMULATION_HORIZONS = [1, 5, 10, 30, 50, 100, 120, 200, 360] as const;
export type SimulationHorizon = (typeof SIMULATION_HORIZONS)[number];

export interface FactorDefinition {
  id: string;
  name: string;
  shortLabel: string;
  origin: FactorOrigin;
  category: 'Momentum' | 'Volatility' | 'Volume' | 'Trend' | 'Mean-Reversion';
  description: string;
  strategyRole: string;
}

export const UNIFIED_ML4T_FACTORS: FactorDefinition[] = [
  // Previously Ported Indicators (Batch 1)
  {
    id: 'bxtrender_short',
    name: 'B-Xtrender Short (T3)',
    shortLabel: 'B-Xtrender T3',
    origin: 'NEW_PINE_PORT',
    category: 'Momentum',
    description: 'Tillson T3(5) smoothed RSI(EMA5 - EMA20, 15) - 50 (@Puppytherapy).',
    strategyRole: 'Short-term 1D momentum timing trigger; confirms histogram inflection before entry.',
  },
  {
    id: 'bxtrender_long',
    name: 'B-Xtrender Long Trend',
    shortLabel: 'B-Xtrender LT',
    origin: 'NEW_PINE_PORT',
    category: 'Trend',
    description: 'Long-term RSI(EMA20, 15) - 50 structural momentum oscillator.',
    strategyRole: 'Macro trend bias filter; separates sustained Stage 2 swings from counter-trend bounces.',
  },
  {
    id: 'williams_vix_fix',
    name: 'Williams Vix Fix (Panic)',
    shortLabel: 'WVF Panic',
    origin: 'NEW_PINE_PORT',
    category: 'Volatility',
    description: '(Highest(Close,22)-Low)/Highest(Close,22)*100 synthetic bottom exhaustion gauge.',
    strategyRole: 'Captures 1D capitulation washouts & fear spikes for contrarian / mean-reversion long entries.',
  },
  {
    id: 'whalefusion_linreg',
    name: 'WhaleFusion LinReg Mom',
    shortLabel: 'WF LinReg',
    origin: 'NEW_PINE_PORT',
    category: 'Momentum',
    description: 'WhaleFusion f_momentum(20,5): linear regression vs Donchian/SMA centerline.',
    strategyRole: 'Detects institutional squeeze expansion & trend acceleration on daily bars.',
  },
  {
    id: 'whalefusion_ptrend',
    name: 'WhaleFusion Regime (pTrend)',
    shortLabel: 'WF pTrend',
    origin: 'NEW_PINE_PORT',
    category: 'Trend',
    description: 'Blended trend probability 0.6*min(ADX/50,1) + 0.4*min(BBWidth/0.02,1).',
    strategyRole: 'Regime gate (chop vs directional expansion); improves Confluence 360° breakout filtering.',
  },
  {
    id: 'algoalpha_trail_dist',
    name: 'AlgoAlpha Trail Distance',
    shortLabel: 'AA Trail%',
    origin: 'NEW_PINE_PORT',
    category: 'Trend',
    description: 'Directional signed distance (%) from Hull-MA(33) ratcheting AlphaTrail.',
    strategyRole: 'Trailing stop distance & overextension monitor; negative IC highlights pullback entries near trail.',
  },
  {
    id: 'algoalpha_mfi_hma',
    name: 'AlgoAlpha HMA-MFI (14)',
    shortLabel: 'AA MFI-HMA',
    origin: 'NEW_PINE_PORT',
    category: 'Volume',
    description: 'HMA(7)-smoothed Money Flow Index(14) centered around 50 equilibrium.',
    strategyRole: 'Smoothed money-flow direction filter reducing single-day volume noise.',
  },
  {
    id: 'centered_mfi_spread',
    name: 'Centered MFI v9 PRO Spread',
    shortLabel: 'MFI v9 Spread',
    origin: 'NEW_PINE_PORT',
    category: 'Volume',
    description: 'MFI(14) - 50 minus SMA(9) signal line measuring money-flow acceleration.',
    strategyRole: 'Early capital inflow/outflow acceleration cross vs 9-day baseline.',
  },

  // Newly Audited Attached Pine Suite (1D Daily Bar Ports)
  {
    id: 'ha_ribbon_align',
    name: 'HA Institutional v2.1 Ribbon%',
    shortLabel: 'HA Ribbon%',
    origin: 'ATTACHED_SUITE',
    category: 'Trend',
    description: 'Heiken Ashi Bull/Bear/Uncertain state (+/-) weighted by 5-SMA ribbon alignment (8..16) & ADX(14).',
    strategyRole: 'Filters out Uncertain/Doji indecision candles on 1D bars; strengthens trend continuation sizing.',
  },
  {
    id: 'orderflow_bar_imbalance',
    name: 'Order Flow ELITE Imbalance',
    shortLabel: 'OF Imbalance',
    origin: 'ATTACHED_SUITE',
    category: 'Volume',
    description: 'Intrabar buyer vs seller delta ratio (buyVol - sellVol)/vol scaled -1..+1 (Overlaps Volume Spike Engine).',
    strategyRole: 'Measures daily close conviction within candle range; flagged for overlap check vs Volume Spike Engine.',
  },
  {
    id: 'tw_prev_week_fib_pos',
    name: 'TradingWarz Weekly Fib Zone',
    shortLabel: 'TW WkFib%',
    origin: 'ATTACHED_SUITE',
    category: 'Mean-Reversion',
    description: '1D close location inside completed Previous Week High/Low range (0=Low, 0.618-0.786 Golden Zone, 1=High).',
    strategyRole: 'Identifies Golden Zone pullbacks and deep-to-shallow reclaims across completed weekly ranges on 1D charts.',
  },
  {
    id: 'weinstein_stage_roc',
    name: 'Weinstein v3.3 30W Slope%',
    shortLabel: 'WSA 30W ROC',
    origin: 'ATTACHED_SUITE',
    category: 'Trend',
    description: '150-day (30-week) SMA 15-day ROC slope % gated by Stage 2 structure (Overlaps TrendSpider Stage Engine).',
    strategyRole: 'Long-term Weinstein Stage 1B/2 slope confirmation on 1D bars; checked for overlap vs TrendSpider Stage.',
  },
  {
    id: 'startup_bravo_atr_dist',
    name: 'Startup Bravo+Voila EMA12 ATR',
    shortLabel: 'Bravo ATR',
    origin: 'ATTACHED_SUITE',
    category: 'Mean-Reversion',
    description: '(Close - EMA(12)) / ATR(14) normalized distance inside Bravo 1σ/2σ/3σ volatility bands.',
    strategyRole: 'Measures short-term 1D stretch from EMA12 baseline in ATR units for pullback vs parabolic exhaustion.',
  },
  {
    id: 'startup_arch_z',
    name: 'Startup Arch Z-Score (100)',
    shortLabel: 'Arch Z(100)',
    origin: 'ATTACHED_SUITE',
    category: 'Mean-Reversion',
    description: '100-bar Z-score of linreg(Close - SMA(20), 20, 0) flagging Early (<-2σ) vs Late (>+2σ) phases.',
    strategyRole: 'Cycle-phase detector; tested explicitly for overlap against WhaleFusion LinReg Momentum.',
  },
  {
    id: 'startup_echo_rsi7',
    name: 'Startup Echo Fast RSI(7)',
    shortLabel: 'Echo RSI(7)',
    origin: 'ATTACHED_SUITE',
    category: 'Mean-Reversion',
    description: 'Fast 2-bar SMA of RSI(7) centered around 50 midline.',
    strategyRole: 'Fast 1D swing oscillation timing; faster trigger alternative to Trullas RSI(14).',
  },
  {
    id: 'startup_helix_osc',
    name: 'Startup Helix (8/21/5)',
    shortLabel: 'Helix 8/21',
    origin: 'ATTACHED_SUITE',
    category: 'Momentum',
    description: 'EMA(EMA(8) - EMA(21), 5) normalized as % of close (steepness oscillator).',
    strategyRole: 'Smooth directional impulse gauge; tested for collinearity against MACD Hist & B-Xtrender.',
  },
  {
    id: 'startup_mountain_alt',
    name: 'Startup Mountain EMA50%',
    shortLabel: 'Mountain%',
    origin: 'ATTACHED_SUITE',
    category: 'Trend',
    description: '((Close - EMA(50)) / EMA(50)) * 100 altitude above/below 50-day EMA.',
    strategyRole: 'Tests whether EMA(50) altitude adds any edge or strictly duplicates StageLedger 50-SMA Distance%.',
  },
  {
    id: 'startup_tango_rsi28',
    name: 'Startup Tango Slow RSI(28)',
    shortLabel: 'Tango RSI(28)',
    origin: 'ATTACHED_SUITE',
    category: 'Trend',
    description: 'Slow 10-bar SMA of RSI(28) centered around 50 equilibrium.',
    strategyRole: 'Macro slow-oscillator regime anchor; first-pane trend confirmation in Startup Suite.',
  },
  {
    id: 'gron_trendcloud_bias',
    name: 'G-Ron TrendCloud Pro v3 Bias',
    shortLabel: 'G-Ron Cloud',
    origin: 'ATTACHED_SUITE',
    category: 'Trend',
    description: 'ATR-normalized distance from 20-bar Donchian/SMA TrendCloud gated by 200-bar MA institutional alignment.',
    strategyRole: 'Replaces basic EMA 12/34 TrendCloud; tracks structural trend continuation & 2.618 target room on 1D bars.',
  },
  {
    id: 'shannon_ytd_avwap_z',
    name: 'Shannon YTD Auto-AVWAP Z',
    shortLabel: 'Shannon AVWAP',
    origin: 'ATTACHED_SUITE',
    category: 'Mean-Reversion',
    description: 'Standardized Z-score of 1D Close vs Year-to-Date Anchored VWAP (20-bar σ) + 3-bar slope confirmation.',
    strategyRole: 'Benchmarks true calendar-year institutional cost basis vs rolling 50-bar VWAP VScore.',
  },
  {
    id: 'agaig_consensus_score',
    name: 'AGAIG 11-Pillar Consensus',
    shortLabel: 'AGAIG 11P',
    origin: 'ATTACHED_SUITE',
    category: 'Momentum',
    description: 'Net bull minus bear consensus (-11..+11) across SSL HMA(60), EMAs, RSI, MACD, Stoch, CCI, CMF, ADX & VWAP on 1D bars.',
    strategyRole: 'Tests whether unweighted 11-indicator voting adds alpha or correlates heavily with ICE / Ridge.',
  },
  {
    id: 'inside_bar_htf_score',
    name: 'Inside Bar Auto-HTF v2.0',
    shortLabel: 'InsideBar HTF',
    origin: 'ATTACHED_SUITE',
    category: 'Volatility',
    description: 'Inside-bar compression & mother-bar breakout directional persistence aligned with Auto-HTF Weekly EMA(50).',
    strategyRole: 'Quantifies coiled volatility breakouts gated by Weekly institutional trend on 1D charts.',
  },
  {
    id: 'ict_liquidity_confluence',
    name: 'ICT Prop v5 Liquidity Score',
    shortLabel: 'ICT Prop v5',
    origin: 'ATTACHED_SUITE',
    category: 'Trend',
    description: 'Smoothed 8-pt ICT confluence: BSL/SSL liquidity sweeps, FVG imbalances, OTE 0.62-0.79, Weekly Mid & EMA(20).',
    strategyRole: 'Measures Smart Money sweep/FVG directional edge alongside Confluence 360° structure.',
  },
  {
    id: 'mcdx_net_chip_edge',
    name: 'MCDX+ Net Banker Chip Edge',
    shortLabel: 'MCDX+ Chip',
    origin: 'ATTACHED_SUITE',
    category: 'Volume',
    description: 'MCDX Plus Profitable Chips % minus Trapped Chips % plus PC vs SMA(10) banker momentum inside 100-bar/VWAP bounds.',
    strategyRole: 'Captures long-horizon institutional accumulation vs retail trapped supply on 1D swing charts.',
  },
  {
    id: 'startup_lattice_osc',
    name: 'Startup Lattice (8 vs 20..50)',
    shortLabel: 'Lattice 8/50',
    origin: 'ATTACHED_SUITE',
    category: 'Trend',
    description: 'EMA(8) minus average of EMA(20, 30, 40, 50) ribbon normalized as % of close (7th pane of Startup Suite).',
    strategyRole: 'Completes the 7-pane Startup Suite; tracks fast-vs-slow EMA ribbon expansion & pullback spread on 1D bars.',
  },
  {
    id: 'ss_strat_alignment',
    name: 'Startup SS Strat 7P (Online-IC)',
    shortLabel: 'SS Strat IC',
    origin: 'ATTACHED_SUITE',
    category: 'Trend',
    description: 'Causal rolling Online-IC weighted composite across all 7 Startup panes (Tango, Bravo 8/21, Echo, Arch, Helix, Lattice, Mountain).',
    strategyRole: 'Adapts pane weights dynamically from realized past IC without look-ahead; tests SS Strat v2.0 vs static Ridge.',
  },
  {
    id: 'supertrend_v10_prime',
    name: 'SuperTrend v10.1 PRIME Score',
    shortLabel: 'ST v10 PRIME',
    origin: 'ATTACHED_SUITE',
    category: 'Trend',
    description: 'SuperTrend(10,3.0) ATR distance + 3-pillar PRIME (Close>EMA200, RSI>50, VolZ>=1σ/BuyPress>10%) + 10-bar Sweep bonus.',
    strategyRole: 'Upgrades placeholder SuperTrend v9 into a volume/liquidity-sweep confluence score on 1D daily charts.',
  },

  // StageLedger Native Core Factors
  {
    id: 'trullas_macd_hist',
    name: 'Trullas MACD Histogram',
    shortLabel: 'MACD Hist%',
    origin: 'STAGELEDGER_CORE',
    category: 'Momentum',
    description: 'Price-normalized MACD(12,26,9) histogram momentum impulse.',
    strategyRole: 'Core Pillar 1 divergence & momentum engine driving Live Scanner setups.',
  },
  {
    id: 'trullas_rsi14',
    name: 'RSI (14) Oscillator',
    shortLabel: 'RSI (14)',
    origin: 'STAGELEDGER_CORE',
    category: 'Mean-Reversion',
    description: 'Centered RSI(14) - 50 from Trullas 4-Pillars engine.',
    strategyRole: 'Core Pillar 2 overbought/oversold confirmation inside Confluence 360°.',
  },
  {
    id: 'relvol_z50',
    name: 'Relative Volume Z-Score (50)',
    shortLabel: 'RelVol σ',
    origin: 'STAGELEDGER_CORE',
    category: 'Volume',
    description: 'Directional signed 50-bar volume Z-score (institutional participation burst).',
    strategyRole: 'Core volume conviction gate (+1.5σ to +3σ+) boosting Watchlist & Confluence rank.',
  },
  {
    id: 'vzo14',
    name: 'Volume Zone Oscillator (14)',
    shortLabel: 'VZO (14)',
    origin: 'STAGELEDGER_CORE',
    category: 'Volume',
    description: 'Signed close-change volume EMA ratio over total volume EMA (14).',
    strategyRole: 'Core TOS Multi-Scan volume oscillator; measures institutional accumulation/distribution.',
  },
  {
    id: 'vscore_vwap50',
    name: 'Rolling 50 VWAP Z-Score',
    shortLabel: 'VScore VWAP',
    origin: 'STAGELEDGER_CORE',
    category: 'Mean-Reversion',
    description: 'Standardized Z-score of price vs 50-bar volume-weighted average price.',
    strategyRole: 'Core institutional value-area stretch gauge; spots discounted vs extended locations.',
  },
  {
    id: 'keltner_position',
    name: 'Keltner Channel Position',
    shortLabel: 'Keltner Pos',
    origin: 'STAGELEDGER_CORE',
    category: 'Volatility',
    description: '(Close - EMA20) / (2 * ATR14) normalized breakout vs overextension location.',
    strategyRole: 'Core ATR-normalized price location used inside squeeze & breakout checks.',
  },
  {
    id: 'adx14',
    name: 'ADX (14) Trend Strength',
    shortLabel: 'ADX (14)',
    origin: 'STAGELEDGER_CORE',
    category: 'Trend',
    description: 'Directional movement strength ADX(14) signed by DI+ vs DI-.',
    strategyRole: 'Core trend-strength filter distinguishing trending regimes from range-bound chop.',
  },
  {
    id: 'dist_sma50_pct',
    name: '50-SMA Distance (%)',
    shortLabel: 'vs 50SMA%',
    origin: 'STAGELEDGER_CORE',
    category: 'Mean-Reversion',
    description: 'Percentage stretch above/below 50-day Simple Moving Average.',
    strategyRole: 'Core baseline distance metric; benchmarks mean-reversion risk vs Stage 2 extension.',
  },
];

function clamp(val: number, min: number, max: number): number {
  if (!Number.isFinite(val)) return min;
  return Math.max(min, Math.min(max, val));
}

function calculateSMA(values: number[], period: number): number[] {
  const n = values.length;
  const out = new Array<number>(n).fill(NaN);
  if (n === 0 || period <= 0) return out;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const v = Number.isFinite(values[i]) ? values[i] : 0;
    sum += v;
    if (i >= period) {
      const old = Number.isFinite(values[i - period]) ? values[i - period] : 0;
      sum -= old;
    }
    if (i >= period - 1) {
      out[i] = sum / period;
    }
  }
  return out;
}

function calculateWMA(values: number[], period: number): number[] {
  const n = values.length;
  const out = new Array<number>(n).fill(NaN);
  if (n === 0 || period <= 0) return out;
  const denom = (period * (period + 1)) / 2;
  for (let i = period - 1; i < n; i++) {
    let weightedSum = 0;
    let valid = true;
    for (let k = 0; k < period; k++) {
      const val = values[i - k];
      if (!Number.isFinite(val)) {
        valid = false;
        break;
      }
      weightedSum += val * (period - k);
    }
    if (valid) out[i] = weightedSum / denom;
  }
  return out;
}

/**
 * Hull Moving Average: WMA(2*WMA(n/2) - WMA(n), sqrt(n))
 */
export function calculateHMA(values: number[], period: number): number[] {
  const n = values.length;
  const p = Math.max(2, Math.round(period));
  const half = Math.max(1, Math.floor(p / 2));
  const sqrtP = Math.max(1, Math.round(Math.sqrt(p)));
  const wmaHalf = calculateWMA(values, half);
  const wmaFull = calculateWMA(values, p);
  const diff = new Array<number>(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    if (Number.isFinite(wmaHalf[i]) && Number.isFinite(wmaFull[i])) {
      diff[i] = 2 * wmaHalf[i] - wmaFull[i];
    }
  }
  return calculateWMA(diff, sqrtP);
}

function calculateRollingStd(values: number[], period: number): number[] {
  const n = values.length;
  const out = new Array<number>(n).fill(NaN);
  if (n < period || period < 2) return out;
  for (let i = period - 1; i < n; i++) {
    let sum = 0;
    let cnt = 0;
    for (let k = i - period + 1; k <= i; k++) {
      if (Number.isFinite(values[k])) {
        sum += values[k];
        cnt++;
      }
    }
    if (cnt < Math.max(2, Math.floor(period * 0.7))) continue;
    const mean = sum / cnt;
    let sq = 0;
    for (let k = i - period + 1; k <= i; k++) {
      if (Number.isFinite(values[k])) {
        const d = values[k] - mean;
        sq += d * d;
      }
    }
    out[i] = Math.sqrt(sq / cnt);
  }
  return out;
}

/**
 * Tillson T3 Smoothing (used by B-Xtrender @Puppytherapy with b = 0.7)
 */
function calculateT3(src: number[], len: number = 5, b: number = 0.7): number[] {
  const e1 = calculateEMA(src, len);
  const e2 = calculateEMA(e1, len);
  const e3 = calculateEMA(e2, len);
  const e4 = calculateEMA(e3, len);
  const e5 = calculateEMA(e4, len);
  const e6 = calculateEMA(e5, len);
  const c1 = -b * b * b;
  const c2 = 3 * b * b + 3 * b * b * b;
  const c3 = -6 * b * b - 3 * b - 3 * b * b * b;
  const c4 = 1 + 3 * b + b * b * b + 3 * b * b;
  return src.map((_, i) => c1 * e6[i] + c2 * e5[i] + c3 * e4[i] + c4 * e3[i]);
}

// ============================================================
// PORTED PINE SCRIPT INDICATORS
// ============================================================

export interface BXtrenderPoint {
  shortTerm: number;
  longTerm: number;
  t3Short: number;
}

export function computeBXtrender(
  candles: Candle[],
  shortL1: number = 5,
  shortL2: number = 20,
  shortL3: number = 15,
  longL1: number = 20,
  longL2: number = 15
): BXtrenderPoint[] {
  const closes = candles.map((c) => c.close);
  const emaShort1 = calculateEMA(closes, shortL1);
  const emaShort2 = calculateEMA(closes, shortL2);
  const diff = closes.map((_, i) => emaShort1[i] - emaShort2[i]);
  const shortRsi = calculateRSI(diff, shortL3).map((r) => r - 50);

  const emaLong = calculateEMA(closes, longL1);
  const longRsi = calculateRSI(emaLong, longL2).map((r) => r - 50);

  const t3 = calculateT3(shortRsi, 5, 0.7);
  return candles.map((_, i) => ({
    shortTerm: Number(shortRsi[i].toFixed(2)),
    longTerm: Number(longRsi[i].toFixed(2)),
    t3Short: Number(t3[i].toFixed(2)),
  }));
}

export interface WilliamsVixFixPoint {
  wvf: number;
  upperBand: number;
  rangeHigh: number;
  isExtreme: boolean;
  filteredReversal: boolean;
}

export function computeWilliamsVixFix(
  candles: Candle[],
  pd: number = 22,
  bbl: number = 20,
  mult: number = 2.0,
  lb: number = 50,
  ph: number = 0.85
): WilliamsVixFixPoint[] {
  const n = candles.length;
  const wvf = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    const start = Math.max(0, i - pd + 1);
    let highestClose = -Infinity;
    for (let k = start; k <= i; k++) {
      if (candles[k].close > highestClose) highestClose = candles[k].close;
    }
    wvf[i] = highestClose > 0 ? ((highestClose - candles[i].low) / highestClose) * 100 : 0;
  }

  const midLine = calculateSMA(wvf, bbl);
  const sDev = calculateRollingStd(wvf, bbl);

  return candles.map((c, i) => {
    const upperBand =
      Number.isFinite(midLine[i]) && Number.isFinite(sDev[i])
        ? midLine[i] + mult * sDev[i]
        : wvf[i] + 5;

    let maxWvfLb = 0;
    const lbStart = Math.max(0, i - lb + 1);
    for (let k = lbStart; k <= i; k++) {
      if (wvf[k] > maxWvfLb) maxWvfLb = wvf[k];
    }
    const rangeHigh = maxWvfLb * ph;

    const prevUpper =
      i > 0 && Number.isFinite(midLine[i - 1]) && Number.isFinite(sDev[i - 1])
        ? midLine[i - 1] + mult * sDev[i - 1]
        : upperBand;
    let prevMaxWvf = 0;
    const prevLbStart = Math.max(0, i - lb);
    for (let k = prevLbStart; k <= Math.max(0, i - 1); k++) {
      if (wvf[k] > prevMaxWvf) prevMaxWvf = wvf[k];
    }
    const prevRangeHigh = prevMaxWvf * ph;

    const isExtreme = wvf[i] >= upperBand || wvf[i] >= rangeHigh;
    const wasExtreme =
      i > 0 && (wvf[i - 1] >= prevUpper || wvf[i - 1] >= prevRangeHigh);
    const upRange = i > 0 && c.low > candles[i - 1].low && c.close > candles[i - 1].high;
    const filteredReversal = wasExtreme && !isExtreme && upRange;

    return {
      wvf: Number(wvf[i].toFixed(2)),
      upperBand: Number(upperBand.toFixed(2)),
      rangeHigh: Number(rangeHigh.toFixed(2)),
      isExtreme,
      filteredReversal,
    };
  });
}

function computeAdxDiSeries(candles: Candle[], period: number = 14) {
  const n = candles.length;
  const adx = new Array<number>(n).fill(20);
  const plusDi = new Array<number>(n).fill(20);
  const minusDi = new Array<number>(n).fill(20);
  if (n < period * 2) return { adx, plusDi, minusDi };

  const atr = calculateATR(candles, period);
  const plusDm = new Array<number>(n).fill(0);
  const minusDm = new Array<number>(n).fill(0);

  for (let i = 1; i < n; i++) {
    const up = candles[i].high - candles[i - 1].high;
    const dn = candles[i - 1].low - candles[i].low;
    plusDm[i] = up > dn && up > 0 ? up : 0;
    minusDm[i] = dn > up && dn > 0 ? dn : 0;
  }

  const plusSm = calculateEMA(plusDm, period);
  const minusSm = calculateEMA(minusDm, period);
  const dx = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    const a = Math.max(1e-6, atr[i] || 1);
    const pdi = (plusSm[i] / a) * 100;
    const mdi = (minusSm[i] / a) * 100;
    plusDi[i] = pdi;
    minusDi[i] = mdi;
    const denom = pdi + mdi;
    dx[i] = denom > 1e-6 ? (Math.abs(pdi - mdi) / denom) * 100 : 0;
  }
  const smoothedDx = calculateEMA(dx, period);
  for (let i = 0; i < n; i++) adx[i] = smoothedDx[i];
  return { adx, plusDi, minusDi };
}

export interface WhaleFusionPoint {
  whaleVolZ: number;
  whaleImbalanceSign: number; // +1 buy whale, -1 sell whale, 0 neutral
  linRegMom: number;
  cci21: number;
  pTrend: number;
}

export function computeWhaleFusionMetrics(candles: Candle[]): WhaleFusionPoint[] {
  const n = candles.length;
  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume || 0);
  const volSma7 = calculateSMA(volumes, 7);
  const volSma50 = calculateSMA(volumes, 50);
  const volStd50 = calculateRollingStd(volumes, 50);
  const sma20 = calculateSMA(closes, 20);
  const std20 = calculateRollingStd(closes, 20);
  const { adx } = computeAdxDiSeries(candles, 14);

  // CCI(21) on typical price
  const tp = candles.map((c) => (c.high + c.low + c.close) / 3);
  const tpSma21 = calculateSMA(tp, 21);
  const cci = new Array<number>(n).fill(0);
  for (let i = 20; i < n; i++) {
    const mean = tpSma21[i];
    if (!Number.isFinite(mean)) continue;
    let devSum = 0;
    for (let k = i - 20; k <= i; k++) devSum += Math.abs(tp[k] - mean);
    const meanDev = devSum / 21;
    cci[i] = meanDev > 1e-6 ? (tp[i] - mean) / (0.015 * meanDev) : 0;
  }

  // LinReg Momentum (20): ta.linreg(close - centerLine, 20, 0)
  const devFromCenter = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    const start = Math.max(0, i - 19);
    let hi = -Infinity;
    let lo = Infinity;
    for (let k = start; k <= i; k++) {
      if (candles[k].high > hi) hi = candles[k].high;
      if (candles[k].low < lo) lo = candles[k].low;
    }
    const avgClose = Number.isFinite(sma20[i]) ? sma20[i] : closes[i];
    const center = (hi + lo + avgClose) / 3;
    devFromCenter[i] = closes[i] > 0 ? ((closes[i] - center) / closes[i]) * 100 : 0;
  }
  const linRegMom = new Array<number>(n).fill(0);
  const regLen = 20;
  for (let i = regLen - 1; i < n; i++) {
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;
    for (let k = 0; k < regLen; k++) {
      const y = devFromCenter[i - regLen + 1 + k];
      sumX += k;
      sumY += y;
      sumXY += k * y;
      sumXX += k * k;
    }
    const denom = regLen * sumXX - sumX * sumX;
    const slope = denom !== 0 ? (regLen * sumXY - sumX * sumY) / denom : 0;
    const intercept = (sumY - slope * sumX) / regLen;
    linRegMom[i] = intercept + slope * (regLen - 1);
  }

  return candles.map((c, i) => {
    let blVol = 0;
    let brVol = 0;
    const maxI = Math.min(6, i);
    for (let j = 0; j < maxI; j++) {
      if (candles[i - j].close > candles[i - j - 1].close) blVol += volumes[i - j];
      else if (candles[i - j].close < candles[i - j - 1].close) brVol += volumes[i - j];
    }
    const vMean = Number.isFinite(volSma50[i]) ? volSma50[i] : volumes[i];
    const vStd = Number.isFinite(volStd50[i]) && volStd50[i] > 0 ? volStd50[i] : 1;
    const volZ = (volumes[i] - vMean) / vStd;
    const v7 = Number.isFinite(volSma7[i]) ? volSma7[i] : volumes[i];

    const totalV = blVol + brVol;
    let imbalanceSign = 0;
    if (totalV > 0 && volumes[i] > v7 * 1.25 && volZ > 1.5) {
      if (blVol <= brVol * 0.15) imbalanceSign = 1;
      else if (brVol <= blVol * 0.15) imbalanceSign = -1;
    }

    const bbWidth =
      Number.isFinite(sma20[i]) && sma20[i] > 0 && Number.isFinite(std20[i])
        ? std20[i] / sma20[i]
        : 0.01;
    const pTrend = 0.6 * Math.min(adx[i] / 50, 1) + 0.4 * Math.min(bbWidth / 0.02, 1);

    return {
      whaleVolZ: Number(clamp(volZ, -5, 8).toFixed(3)),
      whaleImbalanceSign: imbalanceSign,
      linRegMom: Number(linRegMom[i].toFixed(3)),
      cci21: Number(cci[i].toFixed(2)),
      pTrend: Number(clamp(pTrend, 0, 1).toFixed(3)),
    };
  });
}

function computeRawMfiSeries(candles: Candle[], period: number = 14): number[] {
  const n = candles.length;
  const out = new Array<number>(n).fill(50);
  if (n <= period) return out;

  const posFlow = new Array<number>(n).fill(0);
  const negFlow = new Array<number>(n).fill(0);
  for (let i = 1; i < n; i++) {
    const tpCur = (candles[i].high + candles[i].low + candles[i].close) / 3;
    const tpPrev = (candles[i - 1].high + candles[i - 1].low + candles[i - 1].close) / 3;
    const mf = tpCur * (candles[i].volume || 0);
    if (tpCur > tpPrev) posFlow[i] = mf;
    else if (tpCur < tpPrev) negFlow[i] = mf;
  }

  let posSum = 0;
  let negSum = 0;
  for (let i = 1; i <= period; i++) {
    posSum += posFlow[i];
    negSum += negFlow[i];
  }
  out[period] = negSum <= 0 ? (posSum > 0 ? 100 : 50) : 100 - 100 / (1 + posSum / negSum);

  for (let i = period + 1; i < n; i++) {
    posSum += posFlow[i] - posFlow[i - period];
    negSum += negFlow[i] - negFlow[i - period];
    out[i] = negSum <= 0 ? (posSum > 0 ? 100 : 50) : 100 - 100 / (1 + posSum / negSum);
  }
  return out;
}

export interface AlgoAlphaTrendFlowPoint {
  alphaTrail: number;
  alphaDir: -1 | 1; // -1 = Bullish (lower trail), 1 = Bearish (upper trail)
  trailDistPct: number;
  mfiHma7: number;
}

export function computeAlgoAlphaTrendFlow(
  candles: Candle[],
  alphaLen: number = 33,
  alphaMult: number = 3.3,
  mfiLen: number = 14
): AlgoAlphaTrendFlowPoint[] {
  const n = candles.length;
  const closes = candles.map((c) => c.close);
  const ranges = candles.map((c) => Math.max(0, c.high - c.low));
  const basis = calculateHMA(closes, alphaLen);
  const spread = calculateEMA(ranges, alphaLen).map((s) => s * alphaMult);
  const rawMfi = computeRawMfiSeries(candles, mfiLen);
  const mfiHma = calculateHMA(rawMfi, 7);

  let prevLower = NaN;
  let prevUpper = NaN;
  let prevTrail = NaN;
  const results: AlgoAlphaTrendFlowPoint[] = [];

  for (let i = 0; i < n; i++) {
    const b = Number.isFinite(basis[i]) ? basis[i] : closes[i];
    const s = spread[i] || closes[i] * 0.02;
    let lower = b - s;
    let upper = b + s;

    if (i > 0 && Number.isFinite(prevLower)) {
      lower = lower > prevLower || closes[i - 1] < prevLower ? lower : prevLower;
    }
    if (i > 0 && Number.isFinite(prevUpper)) {
      upper = upper < prevUpper || closes[i - 1] > prevUpper ? upper : prevUpper;
    }

    let dir: -1 | 1 = 1;
    if (!Number.isFinite(prevTrail)) {
      dir = closes[i] >= b ? -1 : 1;
    } else if (prevTrail === prevUpper) {
      dir = closes[i] > upper ? -1 : 1;
    } else {
      dir = closes[i] < lower ? 1 : -1;
    }

    const trail = dir === -1 ? lower : upper;
    const signedDist = closes[i] > 0 ? ((closes[i] - trail) / closes[i]) * 100 : 0;

    prevLower = lower;
    prevUpper = upper;
    prevTrail = trail;

    results.push({
      alphaTrail: Number(trail.toFixed(2)),
      alphaDir: dir,
      trailDistPct: Number(signedDist.toFixed(2)),
      mfiHma7: Number(((Number.isFinite(mfiHma[i]) ? mfiHma[i] : rawMfi[i]) - 50).toFixed(2)),
    });
  }

  return results;
}

export interface CenteredMfiPoint {
  mfiCentered: number;
  mfiSignal: number;
  mfiSpread: number;
}

export function computeCenteredMfi(
  candles: Candle[],
  mfiLen: number = 14,
  sigLen: number = 9
): CenteredMfiPoint[] {
  const mfiCentered = computeRawMfiSeries(candles, mfiLen).map((m) => m - 50);
  const sig = calculateSMA(mfiCentered, sigLen);
  return mfiCentered.map((m, i) => {
    const s = Number.isFinite(sig[i]) ? sig[i] : m;
    return {
      mfiCentered: Number(m.toFixed(2)),
      mfiSignal: Number(s.toFixed(2)),
      mfiSpread: Number((m - s).toFixed(2)),
    };
  });
}

// ============================================================
// ATTACHED PINE SUITE PORTS (1D DAILY BARS)
// ============================================================

function computeLinearRegressionEnd(values: number[], period: number): number[] {
  const n = values.length;
  const out = new Array<number>(n).fill(0);
  if (n < period || period < 2) return out;
  for (let i = period - 1; i < n; i++) {
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;
    for (let k = 0; k < period; k++) {
      const y = Number.isFinite(values[i - period + 1 + k]) ? values[i - period + 1 + k] : 0;
      sumX += k;
      sumY += y;
      sumXY += k * y;
      sumXX += k * k;
    }
    const denom = period * sumXX - sumX * sumX;
    const slope = denom !== 0 ? (period * sumXY - sumX * sumY) / denom : 0;
    const intercept = (sumY - slope * sumX) / period;
    out[i] = intercept + slope * (period - 1);
  }
  return out;
}

export interface HaInstitutionalPoint {
  trendState: -1 | 0 | 1;
  ribbonAlignPct: number;
  signedRibbonScore: number;
}

export function computeHaInstitutionalSuite(candles: Candle[]): HaInstitutionalPoint[] {
  const n = candles.length;
  if (n === 0) return [];
  const closes = candles.map((c) => c.close);
  const atr14 = calculateATR(candles, 14);
  const r1 = calculateSMA(closes, 8);
  const r2 = calculateSMA(closes, 10);
  const r3 = calculateSMA(closes, 12);
  const r4 = calculateSMA(closes, 14);
  const r5 = calculateSMA(closes, 16);

  const out: HaInstitutionalPoint[] = [];
  let prevHaOpen = (candles[0].open + candles[0].close) / 2;
  let prevHaClose = (candles[0].open + candles[0].high + candles[0].low + candles[0].close) / 4;

  for (let i = 0; i < n; i++) {
    const c = candles[i];
    const haClose = (c.open + c.high + c.low + c.close) / 4;
    const haOpen = i === 0 ? (c.open + c.close) / 2 : (prevHaOpen + prevHaClose) / 2;
    const haHigh = Math.max(c.high, haOpen, haClose);
    const haLow = Math.min(c.low, haOpen, haClose);
    const upperWick = haHigh - Math.max(haOpen, haClose);
    const lowerWick = Math.min(haOpen, haClose) - haLow;

    const minWick = (atr14[i] || 0) * 0.08;
    const sigWick = upperWick >= minWick || lowerWick >= minWick;
    const isUncertain = upperWick > 0 && lowerWick > 0 && sigWick;
    const state: -1 | 0 | 1 = isUncertain ? 0 : haClose > haOpen ? 1 : -1;

    let bullPairs = 0;
    if (r1[i] > r2[i]) bullPairs++;
    if (r2[i] > r3[i]) bullPairs++;
    if (r3[i] > r4[i]) bullPairs++;
    if (r4[i] > r5[i]) bullPairs++;
    const alignPct = (bullPairs / 4) * 100;
    const centeredAlign = (alignPct - 50) / 50; // -1..+1
    const signedScore = state === 0 ? centeredAlign * 25 : state * (50 + alignPct * 0.5);

    prevHaOpen = haOpen;
    prevHaClose = haClose;
    out.push({
      trendState: state,
      ribbonAlignPct: Number(alignPct.toFixed(1)),
      signedRibbonScore: Number(signedScore.toFixed(2)),
    });
  }
  return out;
}

export function computeOrderFlowEliteMetrics(candles: Candle[]): number[] {
  return candles.map((c) => {
    const rng = Math.max(c.high - c.low, 1e-6);
    const buyVol = (c.volume || 0) * ((c.close - c.low) / rng);
    const sellVol = (c.volume || 0) * ((c.high - c.close) / rng);
    const vol = c.volume || 0;
    return vol > 0 ? clamp((buyVol - sellVol) / vol, -1, 1) : 0;
  });
}

function getIsoWeekKey(c: Candle, idx: number): string {
  const ts = c.timestamp || (c.dateStr ? Date.parse(c.dateStr) : NaN);
  if (!Number.isFinite(ts)) return `w-${Math.floor(idx / 5)}`;
  const d = new Date(ts);
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${utc.getUTCFullYear()}-W${weekNo}`;
}

/**
 * TradingWarz Auto Fibonacci adapted strictly for 1D daily bars:
 * Measures where bar i closes within the PREVIOUS COMPLETED WEEK's High/Low range.
 * Returned centered score: negative = inside/near Golden Zone discount (0.618-0.786 retrace),
 * positive = near/above Previous Week High breakout.
 */
export function computeTradingWarzWeeklyFib(candles: Candle[]): number[] {
  const n = candles.length;
  const out = new Array<number>(n).fill(0);
  if (n === 0) return out;

  let curWeekKey = getIsoWeekKey(candles[0], 0);
  let curHigh = candles[0].high;
  let curLow = candles[0].low;
  let prevHigh = NaN;
  let prevLow = NaN;

  for (let i = 0; i < n; i++) {
    const c = candles[i];
    const wk = getIsoWeekKey(c, i);
    if (wk !== curWeekKey) {
      prevHigh = curHigh;
      prevLow = curLow;
      curHigh = c.high;
      curLow = c.low;
      curWeekKey = wk;
    } else {
      curHigh = Math.max(curHigh, c.high);
      curLow = Math.min(curLow, c.low);
    }

    if (Number.isFinite(prevHigh) && Number.isFinite(prevLow) && prevHigh > prevLow) {
      const rng = prevHigh - prevLow;
      const pos = (c.close - prevLow) / rng; // 0 = prevLow, 1 = prevHigh
      out[i] = Number(clamp((pos - 0.5) * 2, -2, 2).toFixed(4));
    }
  }
  return out;
}

/**
 * Weinstein Stage Analysis v3.3 adapted for 1D daily bars:
 * 30 weeks = 150 trading days (fallback to available length down to 50 if shorter history),
 * 3 weeks = 15 trading days slope ROC%.
 */
export function computeWeinsteinDailyMetrics(candles: Candle[]): number[] {
  const n = candles.length;
  const out = new Array<number>(n).fill(0);
  if (n < 55) return out;
  const closes = candles.map((c) => c.close);
  const maLen = n >= 165 ? 150 : 50;
  const slopeLen = 15;
  const ma = calculateSMA(closes, maLen);

  for (let i = maLen + slopeLen; i < n; i++) {
    const mNow = ma[i];
    const mPrev = ma[i - slopeLen];
    if (Number.isFinite(mNow) && Number.isFinite(mPrev) && mPrev > 0) {
      const roc = ((mNow - mPrev) / mPrev) * 100;
      const aboveFactor = closes[i] > mNow ? 1 : -1;
      out[i] = Number((roc + aboveFactor * 0.25).toFixed(4));
    }
  }
  return out;
}

export interface StartupSuitePoint {
  bravoAtrDist: number;
  archZ: number;
  echoRsi7: number;
  helixOsc: number;
  mountainAlt: number;
  tangoRsi28: number;
}

export function computeStartupSuiteMetrics(candles: Candle[]): StartupSuitePoint[] {
  const n = candles.length;
  const closes = candles.map((c) => c.close);
  const ema12 = calculateEMA(closes, 12);
  const atr14 = calculateATR(candles, 14);
  const sma20 = calculateSMA(closes, 20);
  const detrended20 = closes.map((c, i) => (Number.isFinite(sma20[i]) ? c - sma20[i] : 0));
  const archRaw = computeLinearRegressionEnd(detrended20, 20);
  const archMean100 = calculateSMA(archRaw, 100);
  const archSd100 = calculateRollingStd(archRaw, 100);

  const rsi7 = calculateRSI(closes, 7);
  const echo = calculateSMA(rsi7, 2);

  const ema8 = calculateEMA(closes, 8);
  const ema21 = calculateEMA(closes, 21);
  const diff8_21 = closes.map((_, i) => ema8[i] - ema21[i]);
  const helixRaw = calculateEMA(diff8_21, 5);

  const ema50 = calculateEMA(closes, 50);
  const rsi28 = calculateRSI(closes, 28);
  const tango = calculateSMA(rsi28, 10);

  return candles.map((c, i) => {
    const a = atr14[i] > 0 ? atr14[i] : Math.max(1e-4, c.close * 0.015);
    const bravoAtrDist = (c.close - ema12[i]) / a;

    const am = Number.isFinite(archMean100[i]) ? archMean100[i] : 0;
    const asd = Number.isFinite(archSd100[i]) && archSd100[i] > 1e-6 ? archSd100[i] : 1;
    const archZ = Number.isFinite(archMean100[i])
      ? clamp((archRaw[i] - am) / asd, -4, 4)
      : c.close > 0
      ? (archRaw[i] / c.close) * 100
      : 0;

    const echoVal = (Number.isFinite(echo[i]) ? echo[i] : rsi7[i]) - 50;
    const helixVal = c.close > 0 ? (helixRaw[i] / c.close) * 100 : 0;
    const mountainVal = ema50[i] > 0 ? ((c.close - ema50[i]) / ema50[i]) * 100 : 0;
    const tangoVal = (Number.isFinite(tango[i]) ? tango[i] : rsi28[i]) - 50;

    return {
      bravoAtrDist: Number(clamp(bravoAtrDist, -6, 6).toFixed(4)),
      archZ: Number(archZ.toFixed(4)),
      echoRsi7: Number(echoVal.toFixed(2)),
      helixOsc: Number(helixVal.toFixed(4)),
      mountainAlt: Number(mountainVal.toFixed(3)),
      tangoRsi28: Number(tangoVal.toFixed(2)),
    };
  });
}

// ============================================================
// BATCH 2 PINE V6 PORTS (1D DAILY BARS, STRICTLY CAUSAL)
// ============================================================

export interface GronTrendCloudPoint {
  cloudMid: number;
  isBullish: boolean;
  biasScore: number;
}

export function computeGronTrendCloud(candles: Candle[]): GronTrendCloudPoint[] {
  const n = candles.length;
  if (n === 0) return [];
  const closes = candles.map((c) => c.close);
  const sma20 = calculateSMA(closes, 20);
  const sma200 = calculateSMA(closes, Math.min(200, Math.max(50, n)));
  const atr14 = calculateATR(candles, 14);
  const out: GronTrendCloudPoint[] = [];

  for (let i = 0; i < n; i++) {
    const start = Math.max(0, i - 19);
    let hi = -Infinity;
    let lo = Infinity;
    for (let k = start; k <= i; k++) {
      if (candles[k].high > hi) hi = candles[k].high;
      if (candles[k].low < lo) lo = candles[k].low;
    }
    const donchianMid = (hi + lo) / 2;
    const s20 = Number.isFinite(sma20[i]) ? sma20[i] : closes[i];
    const cloudMid = (donchianMid + s20) / 2;
    const isBull = closes[i] >= cloudMid;
    const atr = atr14[i] > 0 ? atr14[i] : Math.max(1e-4, closes[i] * 0.015);
    const ma200 = Number.isFinite(sma200[i]) ? sma200[i] : cloudMid;
    const macroBonus = closes[i] >= ma200 ? 0.5 : -0.5;
    const rawBias = (closes[i] - cloudMid) / atr + macroBonus;
    out.push({
      cloudMid: Number(cloudMid.toFixed(2)),
      isBullish: isBull,
      biasScore: Number(clamp(rawBias, -5, 5).toFixed(4)),
    });
  }
  return out;
}

export interface ShannonAvwapPoint {
  ytdAvwap: number;
  zScore: number;
  slopeSign: -1 | 0 | 1;
}

export function computeShannonYtdAvwap(candles: Candle[]): ShannonAvwapPoint[] {
  const n = candles.length;
  if (n === 0) return [];
  const devSeries = new Array<number>(n).fill(0);
  const avwapArr = new Array<number>(n).fill(0);

  let curYear = -1;
  let cumPV = 0;
  let cumV = 0;

  for (let i = 0; i < n; i++) {
    const c = candles[i];
    const yr = c.dateStr
      ? Number(c.dateStr.slice(0, 4)) || Math.floor(i / 252)
      : c.timestamp
      ? new Date(c.timestamp).getUTCFullYear()
      : Math.floor(i / 252);

    if (yr !== curYear) {
      curYear = yr;
      cumPV = 0;
      cumV = 0;
    }
    const tp = (c.high + c.low + c.close) / 3;
    const v = Math.max(1, c.volume || 1);
    cumPV += tp * v;
    cumV += v;
    const avwap = cumV > 0 ? cumPV / cumV : tp;
    avwapArr[i] = avwap;
    devSeries[i] = c.close - avwap;
  }

  const sd20 = calculateRollingStd(devSeries, 20);
  return candles.map((c, i) => {
    const sd =
      Number.isFinite(sd20[i]) && sd20[i] > 1e-6
        ? sd20[i]
        : Math.max(1e-4, c.close * 0.015);
    const slope =
      i >= 3
        ? avwapArr[i] > avwapArr[i - 3]
          ? 1
          : avwapArr[i] < avwapArr[i - 3]
          ? -1
          : 0
        : 0;
    const z = clamp(devSeries[i] / sd + slope * 0.15, -5, 5);
    return {
      ytdAvwap: Number(avwapArr[i].toFixed(2)),
      zScore: Number(z.toFixed(4)),
      slopeSign: slope as -1 | 0 | 1,
    };
  });
}

export interface AgaigConsensusPoint {
  bullCount: number;
  bearCount: number;
  netScore: number; // -11..+11 across daily-compatible sub-pillars
}

export function computeAgaigConsensus(candles: Candle[]): AgaigConsensusPoint[] {
  const n = candles.length;
  if (n === 0) return [];
  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);

  const hmaHigh60 = calculateHMA(highs, 60);
  const hmaLow60 = calculateHMA(lows, 60);
  const ema9 = calculateEMA(closes, 9);
  const ema21 = calculateEMA(closes, 21);
  const ema50 = calculateEMA(closes, 50);
  const rsi14 = calculateRSI(closes, 14);
  const trullasPts = calculateIndicators(candles);
  const { plusDi, minusDi } = computeAdxDiSeries(candles, 14);

  // Rolling 20-bar VWAP + CMF(20) proxy + CCI(20)
  const vwap20 = new Array<number>(n).fill(closes[0]);
  const cmf20 = new Array<number>(n).fill(0);
  const stochK = new Array<number>(n).fill(50);
  const cci20 = new Array<number>(n).fill(0);
  const tp = candles.map((c) => (c.high + c.low + c.close) / 3);
  const tpSma20 = calculateSMA(tp, 20);

  for (let i = 0; i < n; i++) {
    const start = Math.max(0, i - 19);
    let pv = 0;
    let vSum = 0;
    let mfVol = 0;
    let hi = -Infinity;
    let lo = Infinity;
    for (let k = start; k <= i; k++) {
      const c = candles[k];
      const v = c.volume || 0;
      pv += tp[k] * v;
      vSum += v;
      const rng = Math.max(c.high - c.low, 1e-6);
      const mfm = ((c.close - c.low) - (c.high - c.close)) / rng;
      mfVol += mfm * v;
      if (c.high > hi) hi = c.high;
      if (c.low < lo) lo = c.low;
    }
    vwap20[i] = vSum > 0 ? pv / vSum : closes[i];
    cmf20[i] = vSum > 0 ? mfVol / vSum : 0;
    stochK[i] = hi > lo ? ((closes[i] - lo) / (hi - lo)) * 100 : 50;

    if (i >= 19 && Number.isFinite(tpSma20[i])) {
      let dev = 0;
      for (let k = i - 19; k <= i; k++) dev += Math.abs(tp[k] - tpSma20[i]);
      const md = dev / 20;
      cci20[i] = md > 1e-6 ? (tp[i] - tpSma20[i]) / (0.015 * md) : 0;
    }
  }

  return candles.map((c, i) => {
    let bull = 0;
    let bear = 0;
    const vote = (isBull: boolean, isBear: boolean) => {
      if (isBull) bull++;
      else if (isBear) bear++;
    };

    // 1. SSL HMA(60)
    const hh = Number.isFinite(hmaHigh60[i]) ? hmaHigh60[i] : c.high;
    const hl = Number.isFinite(hmaLow60[i]) ? hmaLow60[i] : c.low;
    vote(c.close > hh, c.close < hl);
    // 2. EMA 9/21
    vote(ema9[i] > ema21[i], ema9[i] < ema21[i]);
    // 3. EMA 21/50
    vote(ema21[i] > ema50[i], ema21[i] < ema50[i]);
    // 4. Price vs VWAP(20)
    vote(c.close > vwap20[i], c.close < vwap20[i]);
    // 5. RSI(14)
    vote(rsi14[i] > 50, rsi14[i] < 50);
    // 6. MACD Hist
    const hist = trullasPts[i]?.histogram ?? 0;
    vote(hist > 0, hist < 0);
    // 7. Stoch(20)
    vote(stochK[i] > 50, stochK[i] < 50);
    // 8. CCI(20)
    vote(cci20[i] > 0, cci20[i] < 0);
    // 9. CMF(20)
    vote(cmf20[i] > 0, cmf20[i] < 0);
    // 10. ADX DI+/DI-
    vote(plusDi[i] > minusDi[i], minusDi[i] > plusDi[i]);
    // 11. Candle Body vs EMA9 Slope
    vote(i > 0 && c.close > c.open && ema9[i] >= ema9[i - 1], i > 0 && c.close < c.open && ema9[i] < ema9[i - 1]);

    return {
      bullCount: bull,
      bearCount: bear,
      netScore: bull - bear,
    };
  });
}

export interface InsideBarHtfPoint {
  isInsideBar: boolean;
  compressionScore: number; // 0..5
  htfTrendBias: -1 | 1;
  combinedScore: number;
}

export function computeInsideBarHtf(candles: Candle[]): InsideBarHtfPoint[] {
  const n = candles.length;
  if (n === 0) return [];
  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume || 0);
  const atr14 = calculateATR(candles, 14);
  const volSma20 = calculateSMA(volumes, 20);
  // 50-week HTF EMA approximated causally on 1D bars (250d, scaled down cleanly on shorter histories)
  const htfEma = calculateEMA(closes, Math.min(250, Math.max(50, Math.floor(n * 0.7))));

  let motherHigh = candles[0].high;
  let motherLow = candles[0].low;
  let hasActiveMother = false;
  let breakoutImpulse = 0;

  const out: InsideBarHtfPoint[] = [];

  for (let i = 0; i < n; i++) {
    const c = candles[i];
    const prev = i > 0 ? candles[i - 1] : c;
    const isInside = i > 0 && c.high <= prev.high && c.low >= prev.low;
    const atr = atr14[i] > 0 ? atr14[i] : Math.max(1e-4, c.close * 0.015);
    const rng = Math.max(0, c.high - c.low);
    const vMean = Number.isFinite(volSma20[i]) && volSma20[i] > 0 ? volSma20[i] : volumes[i];

    let comp = 0;
    if (rng < atr * 0.75) comp += 1.5;
    if (rng < atr * 0.5) comp += 1.0;
    if (isInside) comp += 1.5;
    if (volumes[i] < vMean) comp += 1.0;

    if (isInside) {
      if (!hasActiveMother) {
        motherHigh = prev.high;
        motherLow = prev.low;
        hasActiveMother = true;
      }
      breakoutImpulse *= 0.8;
    } else if (hasActiveMother) {
      if (c.close > motherHigh) {
        breakoutImpulse = 2.0 + Math.min(2.0, comp * 0.4);
        hasActiveMother = false;
      } else if (c.close < motherLow) {
        breakoutImpulse = -(2.0 + Math.min(2.0, comp * 0.4));
        hasActiveMother = false;
      } else {
        breakoutImpulse *= 0.75;
      }
    } else {
      breakoutImpulse *= 0.75;
    }

    const htfBias: -1 | 1 = c.close >= htfEma[i] ? 1 : -1;
    const combined = clamp(htfBias * (1 + comp * 0.35) + breakoutImpulse, -6, 6);

    out.push({
      isInsideBar: isInside,
      compressionScore: Number(clamp(comp, 0, 5).toFixed(2)),
      htfTrendBias: htfBias,
      combinedScore: Number(combined.toFixed(4)),
    });
  }
  return out;
}

export interface IctPropConfluencePoint {
  rawPoints: number;
  smoothedScore: number;
}

export function computeIctPropConfluence(candles: Candle[]): IctPropConfluencePoint[] {
  const n = candles.length;
  if (n === 0) return [];
  const closes = candles.map((c) => c.close);
  const ema20 = calculateEMA(closes, 20);
  const twFib = computeTradingWarzWeeklyFib(candles);

  const out: IctPropConfluencePoint[] = [];
  let smoothed = 0;

  for (let i = 0; i < n; i++) {
    const c = candles[i];
    let pts = c.close >= ema20[i] ? 1.5 : -1.5;

    // 10-bar Equal/Swing High & Low Liquidity Sweep vs Break
    if (i >= 10) {
      let swingHi = -Infinity;
      let swingLo = Infinity;
      for (let k = i - 10; k < i; k++) {
        if (candles[k].high > swingHi) swingHi = candles[k].high;
        if (candles[k].low < swingLo) swingLo = candles[k].low;
      }
      // SSL Sweep & Reclaim (bullish)
      if (c.low < swingLo && c.close > swingLo) pts += 2.0;
      // BSL Sweep & Reject (bearish)
      else if (c.high > swingHi && c.close < swingHi) pts -= 2.0;

      // OTE 0.62 - 0.79 Discount/Premium inside 20-bar swing
      const rng = Math.max(swingHi - swingLo, 1e-6);
      const pos = (c.close - swingLo) / rng;
      if (pos >= 0.21 && pos <= 0.38) pts += 1.5; // Bullish OTE pullback
      else if (pos >= 0.62 && pos <= 0.79) pts -= 1.0; // Bearish premium
    }

    // Fair Value Gap (FVG)
    if (i >= 2) {
      if (c.low > candles[i - 2].high && candles[i - 1].close > candles[i - 1].open) pts += 2.0;
      else if (c.high < candles[i - 2].low && candles[i - 1].close < candles[i - 1].open) pts -= 2.0;
    }

    // Weekly Mid alignment from twFib (-2..+2 where 0 = Weekly Mid)
    if (twFib[i] > 0) pts += 1.0;
    else if (twFib[i] < 0) pts -= 1.0;

    smoothed = i === 0 ? pts : smoothed * 0.6 + pts * 0.4;
    out.push({
      rawPoints: Number(clamp(pts, -8, 8).toFixed(2)),
      smoothedScore: Number(clamp(smoothed, -8, 8).toFixed(4)),
    });
  }
  return out;
}

export interface McdxPlusPoint {
  profitableChips: number; // 0..100 (Banker)
  trappedChips: number; // 0..100 (Retail)
  bankerMa10: number;
  netChipEdge: number; // Continuous score
}

export function computeMcdxPlusMetrics(
  candles: Candle[],
  lookback: number = 100
): McdxPlusPoint[] {
  const n = candles.length;
  if (n === 0) return [];
  const pcArr = new Array<number>(n).fill(50);
  const tcArr = new Array<number>(n).fill(50);

  for (let i = 0; i < n; i++) {
    const start = Math.max(0, i - lookback + 1);
    let hi = -Infinity;
    let lo = Infinity;
    for (let k = start; k <= i; k++) {
      if (candles[k].high > hi) hi = candles[k].high;
      if (candles[k].low < lo) lo = candles[k].low;
    }
    const rng = Math.max(hi - lo, 1e-6);
    const pc = clamp(((candles[i].close - lo) / rng) * 100, 0, 100);
    const tc = clamp(((hi - candles[i].close) / rng) * 100, 0, 100);
    pcArr[i] = pc;
    tcArr[i] = tc;
  }

  const pcSma10 = calculateSMA(pcArr, 10);
  return candles.map((_, i) => {
    const ma = Number.isFinite(pcSma10[i]) ? pcSma10[i] : pcArr[i];
    const edge = (pcArr[i] - tcArr[i]) + 0.5 * (pcArr[i] - ma);
    return {
      profitableChips: Number(pcArr[i].toFixed(2)),
      trappedChips: Number(tcArr[i].toFixed(2)),
      bankerMa10: Number(ma.toFixed(2)),
      netChipEdge: Number(edge.toFixed(3)),
    };
  });
}

// ============================================================
// BATCH 3 PINE V6 PORTS (SS STRAT v2.0, LATTICE, SUPERTREND v10.1)
// ============================================================

export interface StartupLatticePoint {
  ema8: number;
  ribbonAvg: number;
  latticePct: number;
}

export function computeStartupLattice(candles: Candle[]): StartupLatticePoint[] {
  const n = candles.length;
  if (n === 0) return [];
  const closes = candles.map((c) => c.close);
  const ema8 = calculateEMA(closes, 8);
  const ema20 = calculateEMA(closes, 20);
  const ema30 = calculateEMA(closes, 30);
  const ema40 = calculateEMA(closes, 40);
  const ema50 = calculateEMA(closes, 50);

  return closes.map((c, i) => {
    const ribbonAvg = (ema20[i] + ema30[i] + ema40[i] + ema50[i]) / 4;
    const latticePct = c > 0 ? ((ema8[i] - ribbonAvg) / c) * 100 : 0;
    return {
      ema8: Number(ema8[i].toFixed(2)),
      ribbonAvg: Number(ribbonAvg.toFixed(2)),
      latticePct: Number(clamp(latticePct, -25, 25).toFixed(4)),
    };
  });
}

export interface StartupSsStratPoint {
  staticScore: number;
  onlineIcScore: number;
  activeWeights: number[];
}

/**
 * Startup — SS Strat v2.0 (7-Pane + Online IC) adapted strictly causally on 1D bars:
 * Rolling correlation `corr(state[p][k - icHorizon], fwdRet(k - icHorizon -> k))`
 * uses ONLY completed pairs `k <= i`, ensuring zero future leakage into bar `i`.
 */
export function computeStartupSsStratAlignment(
  candles: Candle[],
  icHorizon: number = 5,
  icWindow: number = 60
): StartupSsStratPoint[] {
  const n = candles.length;
  if (n === 0) return [];
  const closes = candles.map((c) => c.close);
  const startup = computeStartupSuiteMetrics(candles);
  const lattice = computeStartupLattice(candles);
  const ema8 = calculateEMA(closes, 8);
  const ema21 = calculateEMA(closes, 21);
  const atr14 = calculateATR(candles, 14);

  const states: number[][] = Array.from({ length: 7 }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    const atr = atr14[i] > 0 ? atr14[i] : Math.max(1e-4, closes[i] * 0.015);
    states[0][i] = clamp(startup[i].tangoRsi28 / 15, -1, 1); // Tango
    states[1][i] = clamp((ema8[i] - ema21[i]) / atr, -1, 1); // Bravo (8/21)
    states[2][i] = clamp(startup[i].echoRsi7 / 25, -1, 1); // Echo
    states[3][i] = clamp(startup[i].archZ / 2, -1, 1); // Arch
    states[4][i] = clamp(startup[i].helixOsc / 1.5, -1, 1); // Helix
    states[5][i] = clamp(lattice[i].latticePct / 2.5, -1, 1); // Lattice
    states[6][i] = clamp(startup[i].mountainAlt / 8, -1, 1); // Mountain
  }

  const priors = [2.0, 2.0, 1.0, 1.0, 1.0, 1.0, 1.0];
  const priorSum = priors.reduce((s, v) => s + v, 0);
  const h = Math.max(1, icHorizon);

  const out: StartupSsStratPoint[] = [];
  for (let i = 0; i < n; i++) {
    let staticSum = 0;
    for (let p = 0; p < 7; p++) staticSum += priors[p] * states[p][i];
    const staticScore = (staticSum / priorSum) * 100;

    const weights = new Array<number>(7).fill(0);
    if (i >= h + 20) {
      const startK = Math.max(h + 10, i - icWindow + 1);
      const fwdY: number[] = [];
      for (let k = startK; k <= i; k++) {
        const pPrev = closes[k - h];
        fwdY.push(pPrev > 0 ? (closes[k] - pPrev) / pPrev : 0);
      }
      if (fwdY.length >= 15) {
        for (let p = 0; p < 7; p++) {
          const xs: number[] = [];
          for (let k = startK; k <= i; k++) xs.push(states[p][k - h]);
          const corr = pearsonCorrelation(xs, fwdY);
          // Blend shrunk prior + positive online IC contribution (downweight noisy panes)
          weights[p] = Math.max(0.05, priors[p] * 0.35 + Math.max(0, corr) * 3.0);
        }
      } else {
        for (let p = 0; p < 7; p++) weights[p] = priors[p];
      }
    } else {
      for (let p = 0; p < 7; p++) weights[p] = priors[p];
    }

    const wSum = weights.reduce((s, v) => s + v, 0) || 1;
    let onlineSum = 0;
    for (let p = 0; p < 7; p++) onlineSum += weights[p] * states[p][i];
    const onlineIcScore = (onlineSum / wSum) * 100;

    out.push({
      staticScore: Number(clamp(staticScore, -100, 100).toFixed(2)),
      onlineIcScore: Number(clamp(onlineIcScore, -100, 100).toFixed(2)),
      activeWeights: weights.map((w) => Number((w / wSum).toFixed(3))),
    });
  }
  return out;
}

export interface SuperTrendV10Point {
  stLine: number;
  isUp: boolean;
  primeCount: number; // 0..3
  isSweep: boolean;
  isPrimeSignal: boolean;
  combinedScore: number;
}

export function computeSuperTrendV10Prime(
  candles: Candle[],
  stFactor: number = 3.0,
  stLen: number = 10
): SuperTrendV10Point[] {
  const n = candles.length;
  if (n === 0) return [];
  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume || 0);

  const atrSt = calculateATR(candles, stLen);
  const atr14 = calculateATR(candles, 14);
  const ema200 = calculateEMA(closes, 200);
  const rsi14 = calculateRSI(closes, 14);
  const volMean50 = calculateSMA(volumes, 50);
  const volStd50 = calculateRollingStd(volumes, 50);

  const volDelta = candles.map((c) => {
    const rng = c.high - c.low;
    const bodyLoc = rng > 0 ? (c.close - c.low) / rng : 0.5;
    return (c.volume || 0) * (2 * bodyLoc - 1);
  });
  const pressure5 = calculateEMA(volDelta, 5);

  const out: SuperTrendV10Point[] = [];
  let prevFinalUpper = candles[0].high;
  let prevFinalLower = candles[0].low;
  let prevIsUp = true;
  let lastSweepIdx = -999;

  for (let i = 0; i < n; i++) {
    const c = candles[i];
    const hl2 = (c.high + c.low) / 2;
    const atr = atrSt[i] > 0 ? atrSt[i] : Math.max(1e-4, c.close * 0.015);
    const basicUpper = hl2 + stFactor * atr;
    const basicLower = hl2 - stFactor * atr;

    const finalUpper =
      i === 0
        ? basicUpper
        : basicUpper < prevFinalUpper || candles[i - 1].close > prevFinalUpper
        ? basicUpper
        : prevFinalUpper;
    const finalLower =
      i === 0
        ? basicLower
        : basicLower > prevFinalLower || candles[i - 1].close < prevFinalLower
        ? basicLower
        : prevFinalLower;

    let isUp: boolean = prevIsUp;
    if (i > 0) {
      if (prevIsUp && c.close < finalLower) isUp = false;
      else if (!prevIsUp && c.close > finalUpper) isUp = true;
    }
    const flipUp = i > 0 && isUp && !prevIsUp;
    const stLine = isUp ? finalLower : finalUpper;

    const vMean = Number.isFinite(volMean50[i]) && volMean50[i] > 0 ? volMean50[i] : Math.max(1, volumes[i]);
    const vStd = Number.isFinite(volStd50[i]) && volStd50[i] > 0 ? volStd50[i] : vMean * 0.25;
    const volZ = (volumes[i] - vMean) / Math.max(1e-6, vStd);
    const pressNorm = vMean > 0 ? pressure5[i] / vMean : 0;

    let isSweep = false;
    if (i >= 10) {
      let priorLow = Infinity;
      for (let k = i - 10; k < i; k++) {
        if (candles[k].low < priorLow) priorLow = candles[k].low;
      }
      isSweep = c.low < priorLow && c.close > priorLow && c.close > c.open;
      if (isSweep) lastSweepIdx = i;
    }
    const sweepNear = i - lastSweepIdx <= 5;

    const c1 = c.close > ema200[i];
    const c2 = rsi14[i] > 50;
    const c3 = volZ >= 1.0 || pressNorm > 0.1;
    const primeCount = (c1 ? 1 : 0) + (c2 ? 1 : 0) + (c3 ? 1 : 0);
    const isPrimeSignal = flipUp && primeCount >= 3 && (volZ >= 2.0 || sweepNear);

    const a14 = atr14[i] > 0 ? atr14[i] : atr;
    const stAtrDist = clamp((c.close - stLine) / a14, -5, 5);
    const combinedScore = clamp(
      stAtrDist + (primeCount - 1.5) * 0.55 + (sweepNear ? 0.65 : 0),
      -6,
      6
    );

    prevFinalUpper = finalUpper;
    prevFinalLower = finalLower;
    prevIsUp = isUp;

    out.push({
      stLine: Number(stLine.toFixed(2)),
      isUp,
      primeCount,
      isSweep,
      isPrimeSignal,
      combinedScore: Number(combinedScore.toFixed(4)),
    });
  }
  return out;
}

// ============================================================
// FACTOR MATRIX EXTRACTION (STRICT ANTI-LOOKAHEAD LAG)
// ============================================================

export function extractFactorSeriesMap(candles: Candle[]): Record<string, number[]> {
  const n = candles.length;
  const out: Record<string, number[]> = {};
  for (const def of UNIFIED_ML4T_FACTORS) {
    out[def.id] = new Array<number>(n).fill(NaN);
  }
  if (n < 55) return out;

  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume || 0);

  const bx = computeBXtrender(candles);
  const wvf = computeWilliamsVixFix(candles);
  const wf = computeWhaleFusionMetrics(candles);
  const aa = computeAlgoAlphaTrendFlow(candles);
  const cmfi = computeCenteredMfi(candles);

  // Attached Pine Suite (1D bar ports — Batch 1 + Batch 2 + Batch 3)
  const ha = computeHaInstitutionalSuite(candles);
  const ofImb = computeOrderFlowEliteMetrics(candles);
  const twFib = computeTradingWarzWeeklyFib(candles);
  const wsaRoc = computeWeinsteinDailyMetrics(candles);
  const startup = computeStartupSuiteMetrics(candles);
  const gron = computeGronTrendCloud(candles);
  const shannon = computeShannonYtdAvwap(candles);
  const agaig = computeAgaigConsensus(candles);
  const insideBar = computeInsideBarHtf(candles);
  const ict = computeIctPropConfluence(candles);
  const mcdx = computeMcdxPlusMetrics(candles);
  const lattice = computeStartupLattice(candles);
  const ssStrat = computeStartupSsStratAlignment(candles);
  const stV10 = computeSuperTrendV10Prime(candles);

  const trullasPts = calculateIndicators(candles);
  const ema20 = calculateEMA(closes, 20);
  const atr14 = calculateATR(candles, 14);
  const sma50 = calculateSMA(closes, 50);
  const { adx, plusDi, minusDi } = computeAdxDiSeries(candles, 14);

  // VZO(14): signed volume EMA / total volume EMA
  const signedVol = new Array<number>(n).fill(0);
  for (let i = 1; i < n; i++) {
    signedVol[i] = closes[i] > closes[i - 1] ? volumes[i] : closes[i] < closes[i - 1] ? -volumes[i] : 0;
  }
  const vp14 = calculateEMA(signedVol, 14);
  const tv14 = calculateEMA(volumes, 14);

  // Rolling 50-bar VWAP + Z-Score
  const vscore = new Array<number>(n).fill(NaN);
  for (let i = 49; i < n; i++) {
    let pv = 0;
    let vSum = 0;
    for (let k = i - 49; k <= i; k++) {
      const tp = (candles[k].high + candles[k].low + candles[k].close) / 3;
      const v = volumes[k];
      pv += tp * v;
      vSum += v;
    }
    if (vSum > 0) {
      const vwap = pv / vSum;
      let sq = 0;
      for (let k = i - 49; k <= i; k++) {
        const d = closes[k] - vwap;
        sq += d * d;
      }
      const sd = Math.sqrt(sq / 50);
      vscore[i] = sd > 1e-6 ? (closes[i] - vwap) / sd : 0;
    }
  }

  for (let i = 50; i < n; i++) {
    const close = closes[i];
    if (!Number.isFinite(close) || close <= 0) continue;

    out['bxtrender_short'][i] = bx[i].t3Short;
    out['bxtrender_long'][i] = bx[i].longTerm;
    out['williams_vix_fix'][i] = wvf[i].wvf;
    out['whalefusion_linreg'][i] = wf[i].linRegMom;
    out['whalefusion_ptrend'][i] = wf[i].pTrend;
    out['algoalpha_trail_dist'][i] = aa[i].trailDistPct;
    out['algoalpha_mfi_hma'][i] = aa[i].mfiHma7;
    out['centered_mfi_spread'][i] = cmfi[i].mfiSpread;

    out['ha_ribbon_align'][i] = ha[i].signedRibbonScore;
    out['orderflow_bar_imbalance'][i] = ofImb[i];
    out['tw_prev_week_fib_pos'][i] = twFib[i];
    out['weinstein_stage_roc'][i] = wsaRoc[i];
    out['startup_bravo_atr_dist'][i] = startup[i].bravoAtrDist;
    out['startup_arch_z'][i] = startup[i].archZ;
    out['startup_echo_rsi7'][i] = startup[i].echoRsi7;
    out['startup_helix_osc'][i] = startup[i].helixOsc;
    out['startup_mountain_alt'][i] = startup[i].mountainAlt;
    out['startup_tango_rsi28'][i] = startup[i].tangoRsi28;
    out['gron_trendcloud_bias'][i] = gron[i].biasScore;
    out['shannon_ytd_avwap_z'][i] = shannon[i].zScore;
    out['agaig_consensus_score'][i] = agaig[i].netScore;
    out['inside_bar_htf_score'][i] = insideBar[i].combinedScore;
    out['ict_liquidity_confluence'][i] = ict[i].smoothedScore;
    out['mcdx_net_chip_edge'][i] = mcdx[i].netChipEdge;
    out['startup_lattice_osc'][i] = lattice[i].latticePct;
    out['ss_strat_alignment'][i] = ssStrat[i].onlineIcScore;
    out['supertrend_v10_prime'][i] = stV10[i].combinedScore;

    out['trullas_macd_hist'][i] = ((trullasPts[i]?.histogram ?? 0) / close) * 100;
    out['trullas_rsi14'][i] = (trullasPts[i]?.rsi ?? 50) - 50;
    const prevClose = closes[i - 1] || close;
    const dirSign = close >= prevClose ? 1 : -1;
    out['relvol_z50'][i] = wf[i].whaleVolZ * dirSign;
    out['vzo14'][i] = tv14[i] > 0 ? (vp14[i] / tv14[i]) * 100 : 0;
    out['vscore_vwap50'][i] = vscore[i];
    out['keltner_position'][i] =
      atr14[i] > 0 ? (close - ema20[i]) / (2 * atr14[i]) : 0;
    out['adx14'][i] = adx[i] * (plusDi[i] >= minusDi[i] ? 1 : -1);
    out['dist_sma50_pct'][i] =
      Number.isFinite(sma50[i]) && sma50[i] > 0
        ? ((close - sma50[i]) / sma50[i]) * 100
        : 0;
  }

  return out;
}

/**
 * Returns strictly causal shifted series (`shifted[t] = raw[t - shiftBars]`).
 * Guarantees bar `t`'s close/high/low CANNOT leak into `shifted[t]`.
 */
export function applyCausalShift(series: number[], shiftBars: number = 1): number[] {
  const n = series.length;
  const out = new Array<number>(n).fill(NaN);
  const lag = Math.max(0, Math.floor(shiftBars));
  for (let i = lag; i < n; i++) {
    out[i] = series[i - lag];
  }
  return out;
}

// ============================================================
// SPEARMAN CORRELATION & ALPHALENS CROSS-SECTIONAL AUDIT
// ============================================================

function rankArrayAverageTies(values: number[]): number[] {
  const indexed = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const ranks = new Array<number>(values.length);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j + 1 < indexed.length && indexed[j + 1].v === indexed[i].v) {
      j++;
    }
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) {
      ranks[indexed[k].i] = avgRank;
    }
    i = j + 1;
  }
  return ranks;
}

export function pearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 3) return 0;
  let sx = 0;
  let sy = 0;
  let sxy = 0;
  let sx2 = 0;
  let sy2 = 0;
  for (let i = 0; i < n; i++) {
    sx += x[i];
    sy += y[i];
    sxy += x[i] * y[i];
    sx2 += x[i] * x[i];
    sy2 += y[i] * y[i];
  }
  const num = n * sxy - sx * sy;
  const den = Math.sqrt((n * sx2 - sx * sx) * (n * sy2 - sy * sy));
  if (den <= 1e-12 || !Number.isFinite(den)) return 0;
  return clamp(num / den, -1, 1);
}

export function spearmanRankCorrelation(x: number[], y: number[]): number {
  if (x.length < 4 || x.length !== y.length) return 0;
  const rx = rankArrayAverageTies(x);
  const ry = rankArrayAverageTies(y);
  return pearsonCorrelation(rx, ry);
}

export interface HorizonIcMetrics {
  horizonDays: number;
  meanIc: number;
  icStd: number;
  icTStat: number;
  hitRatePct: number; // % of dates with IC > 0
  quintileSpreadPct: number; // Mean Q5 - Q1 forward return %
  datesEvaluated: number;
}

export interface FactorIcAuditRow {
  factorId: string;
  name: string;
  shortLabel: string;
  origin: FactorOrigin;
  category: FactorDefinition['category'];
  description: string;
  strategyRole: string;
  byHorizon: Record<number, HorizonIcMetrics>;
  avgIc: number;
  bestHorizonDays: number;
  bestIc: number;
  bestTStat: number;
  bestSpreadPct: number;
  turnoverPct: number;
  adfTStat: number;
  isStationary: boolean;
  tbWinRatePct: number;
  tbExpectancyR: number;
  topCorrelatedPeer: { factorId: string; shortLabel: string; correlation: number } | null;
  verdict: FactorVerdict;
}

export interface RedundantFactorPair {
  factorA: string;
  labelA: string;
  factorB: string;
  labelB: string;
  correlation: number;
}

export interface WalkForwardMetaModelReport {
  available: boolean;
  targetHorizonDays: number;
  trainDates: number;
  oosDates: number;
  trainSplitDate: string;
  oosMeanIc: number;
  oosIcTStat: number;
  oosQuintileSpreadPct: number;
  oosLongHitRatePct: number;
  oosBarrierWinRatePct: number;
  oosBarrierExpectancyR: number;
  featureWeights: Array<{
    factorId: string;
    shortLabel: string;
    origin: FactorOrigin;
    weight: number;
    importancePct: number;
  }>;
  note: string;
}

export interface AttachedOverlapAuditRow {
  fileName: string;
  title: string;
  fileType: 'PINE_INDICATOR' | 'LLM_PROMPT';
  factorId?: string;
  status: 'UNIQUE_NEW' | 'PARTIAL_OVERLAP' | 'DUPLICATE_EXISTING' | 'NON_INDICATOR_PROMPT';
  overlapsWith: string;
  empiricalCorr: number | null;
  dailyBarNote: string;
  recommendation: string;
}

export type CombinationMode = 'COMPOSITE_RANK' | 'STRICT_CONSENSUS';

export interface CombinationLeg {
  factorId: string;
  direction: 1 | -1; // +1 = Follow higher factor values, -1 = Contrarian (lower values bullish)
}

export interface IndicatorCombinationConfig {
  id: string;
  name: string;
  description: string;
  mode: CombinationMode;
  legs: CombinationLeg[];
  consensusZThreshold?: number;
}

export interface CombinationTestResult {
  id: string;
  name: string;
  description: string;
  mode: CombinationMode;
  legs: Array<CombinationLeg & { shortLabel: string }>;
  horizonDays: number;
  meanIc: number;
  icTStat: number;
  q5MinusQ1GrossPct: number;
  q5MinusQ1NetPct: number;
  hitRatePct: number;
  consensusTradesCount: number;
  consensusWinRatePct: number;
  consensusAvgNetReturnPct: number;
  profitFactor: number;
  bestSingleComponentIc: number;
  alphaLiftIc: number;
  verdict: 'SYNERGISTIC' | 'POSITIVE_EDGE' | 'NO_LIFT' | 'WEAK';
}

export interface CrossSectionalAuditReport {
  configFingerprint: string;
  stationaryCount: number;
  symbolsAnalyzed: string[];
  commonDatesCount: number;
  dateRange: { start: string; end: string };
  horizons: number[];
  antiLookaheadShiftBars: number;
  factorRanking: FactorIcAuditRow[];
  redundantPairs: RedundantFactorPair[];
  walkForwardMeta: WalkForwardMetaModelReport;
  overlapAudit: AttachedOverlapAuditRow[];
  presetCombinations: CombinationTestResult[];
  clippedPineNotice: string[];
}

export interface TripleBarrierPoint {
  label: 1 | -1 | 0;
  rMultiple: number;
  barsHeld: number;
}

/**
 * Deterministic fingerprint locking the 35-factor spec, horizons, shift(1), and 2R/1R/15D barriers.
 */
export function computeFeatureConfigFingerprint(): string {
  const payload = JSON.stringify({
    factors: UNIFIED_ML4T_FACTORS.map((f) => f.id),
    horizons: [...SIMULATION_HORIZONS],
    shiftBars: 1,
    tbUpAtr: 2.0,
    tbDnAtr: 1.0,
    tbMaxBars: 15,
    frictionBps: 10,
  });
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < payload.length; i++) {
    const ch = payload.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= ch + (i & 0xff);
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  const partA = (h1 >>> 0).toString(16).padStart(8, '0');
  const partB = (h2 >>> 0).toString(16).padStart(8, '0');
  return `${partA}${partB.slice(0, 4)}`;
}

/**
 * Augmented Dickey-Fuller (ADF lag=1 with constant) stationarity test via 3x3 OLS normal equations.
 * Returns MacKinnon 5% critical check (tStat <= -2.86 => stationary).
 */
export function computeAdfStationarityTest(series: number[]): {
  adfTStat: number;
  stationary: boolean;
} {
  const clean = series.filter((v) => Number.isFinite(v));
  const n = clean.length;
  if (n < 35) return { adfTStat: 0, stationary: false };

  // OLS regression: dy[t] = alpha + gamma * y[t-1] + delta * dy[t-1]
  const m = n - 2;
  const XtX = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const Xty = [0, 0, 0];
  const rows: Array<{ x: [number, number, number]; y: number }> = [];

  for (let t = 2; t < n; t++) {
    const yLag = clean[t - 1];
    const dyLag = clean[t - 1] - clean[t - 2];
    const dy = clean[t] - clean[t - 1];
    const x: [number, number, number] = [1, yLag, dyLag];
    rows.push({ x, y: dy });
    for (let a = 0; a < 3; a++) {
      Xty[a] += x[a] * dy;
      for (let b = 0; b < 3; b++) {
        XtX[a][b] += x[a] * x[b];
      }
    }
  }

  // Tiny ridge safeguard for singular constant factors
  XtX[0][0] += 1e-9;
  XtX[1][1] += 1e-9;
  XtX[2][2] += 1e-9;

  const beta = solveLinearSystem(XtX, Xty);
  let rss = 0;
  for (const r of rows) {
    const pred = beta[0] * r.x[0] + beta[1] * r.x[1] + beta[2] * r.x[2];
    const err = r.y - pred;
    rss += err * err;
  }
  const sigma2 = rss / Math.max(1, m - 3);
  if (sigma2 <= 1e-18 || !Number.isFinite(sigma2)) {
    return { adfTStat: -10, stationary: true };
  }

  // Invert 3x3 XtX cleanly for SE(gamma) = sqrt(sigma2 * invXtX[1][1])
  const e1 = solveLinearSystem(XtX, [0, 1, 0]);
  const invDiag11 = e1[1];
  const seGamma = invDiag11 > 0 ? Math.sqrt(sigma2 * invDiag11) : 0;
  if (seGamma <= 1e-12 || !Number.isFinite(seGamma)) {
    return { adfTStat: 0, stationary: false };
  }
  const tStat = clamp(beta[1] / seGamma, -25, 10);
  return {
    adfTStat: Number(tStat.toFixed(2)),
    stationary: tStat <= -2.86,
  };
}

/**
 * Computes causal Lopez de Prado Triple-Barrier outcomes on 1D bars aligned with
 * StageLedger X1_fixed_v1 (+2.0xATR TP / -1.0xATR SL / 15-bar time barrier, SL-before-TP tie-break, 10 bps cost).
 */
export function computeTripleBarrierSeries(
  candles: Candle[],
  upMult: number = 2.0,
  dnMult: number = 1.0,
  maxBars: number = 15,
  roundTripFrictionPct: number = 0.1
): TripleBarrierPoint[] {
  const n = candles.length;
  const out: TripleBarrierPoint[] = Array.from({ length: n }, () => ({
    label: 0,
    rMultiple: 0,
    barsHeld: 0,
  }));
  if (n < 20) return out;

  const atr = calculateATR(candles, 14);
  for (let i = 0; i < n - 1; i++) {
    const entry = candles[i].close;
    const atrVal = atr[i];
    if (!Number.isFinite(entry) || entry <= 0 || !Number.isFinite(atrVal) || atrVal <= 1e-6) {
      continue;
    }

    const unitRisk = dnMult * atrVal;
    const upper = entry + upMult * atrVal;
    const lower = entry - unitRisk;
    const frictionR = ((entry * (roundTripFrictionPct / 100)) / unitRisk);
    const end = Math.min(n - 1, i + maxBars);

    let resolved = false;
    for (let j = i + 1; j <= end; j++) {
      // Conservative parity with StageLedger outcome engine: SL checked before TP if both breached same bar
      if (candles[j].low <= lower) {
        out[i] = {
          label: -1,
          rMultiple: Number((-1.0 - frictionR).toFixed(3)),
          barsHeld: j - i,
        };
        resolved = true;
        break;
      }
      if (candles[j].high >= upper) {
        out[i] = {
          label: 1,
          rMultiple: Number((upMult / dnMult - frictionR).toFixed(3)),
          barsHeld: j - i,
        };
        resolved = true;
        break;
      }
    }

    if (!resolved) {
      const exitClose = candles[end].close;
      const rawR = (exitClose - entry) / unitRisk - frictionR;
      out[i] = {
        label: 0,
        rMultiple: Number(clamp(rawR, -3, 3).toFixed(3)),
        barsHeld: end - i,
      };
    }
  }
  return out;
}

export function runCrossSectionalFactorAudit(
  candlesBySymbol: Record<string, Candle[]>,
  options?: {
    horizons?: number[];
    shiftBars?: number;
    targetHorizonDays?: number;
    ridgeLambda?: number;
  }
): CrossSectionalAuditReport {
  const targetHorizonDays = options?.targetHorizonDays ?? 5;
  const baseHorizons = options?.horizons ?? [...SIMULATION_HORIZONS];
  const horizons = baseHorizons.includes(targetHorizonDays)
    ? baseHorizons
    : [...baseHorizons, targetHorizonDays].sort((a, b) => a - b);
  const shiftBars = options?.shiftBars ?? 1;

  const symbols = Object.keys(candlesBySymbol).filter(
    (s) => Array.isArray(candlesBySymbol[s]) && candlesBySymbol[s].length >= 80
  );

  // Align dates across cohort using dateStr map per symbol
  const dateMaps = new Map<
    string,
    {
      candles: Candle[];
      idxByDate: Map<string, number>;
      shiftedFactors: Record<string, number[]>;
      tripleBarrier: TripleBarrierPoint[];
    }
  >();

  const dateCounts = new Map<string, number>();
  for (const sym of symbols) {
    const candles = candlesBySymbol[sym];
    const rawFactors = extractFactorSeriesMap(candles);
    const shiftedFactors: Record<string, number[]> = {};
    for (const def of UNIFIED_ML4T_FACTORS) {
      shiftedFactors[def.id] = applyCausalShift(rawFactors[def.id], shiftBars);
    }
    const tripleBarrier = computeTripleBarrierSeries(candles, 2.0, 1.0, 15, 0.1);
    const idxByDate = new Map<string, number>();
    candles.forEach((c, i) => {
      if (c.dateStr) {
        idxByDate.set(c.dateStr, i);
        dateCounts.set(c.dateStr, (dateCounts.get(c.dateStr) || 0) + 1);
      }
    });
    dateMaps.set(sym, { candles, idxByDate, shiftedFactors, tripleBarrier });
  }

  const minSymbolsPerDate = Math.max(4, Math.floor(symbols.length * 0.6));
  const commonDates = Array.from(dateCounts.entries())
    .filter(([, cnt]) => cnt >= minSymbolsPerDate)
    .map(([d]) => d)
    .sort();

  const factorRanking: FactorIcAuditRow[] = [];
  const sampledFactorVectors: Record<string, number[]> = {};
  for (const def of UNIFIED_ML4T_FACTORS) sampledFactorVectors[def.id] = [];

  for (const def of UNIFIED_ML4T_FACTORS) {
    const byHorizon: Record<number, HorizonIcMetrics> = {};
    const turnoverSamples: number[] = [];
    let prevRanksBySymbol = new Map<string, number>();

    for (let dIdx = 0; dIdx < commonDates.length; dIdx++) {
      const d = commonDates[dIdx];
      const crossSyms: string[] = [];
      const crossVals: number[] = [];

      for (const sym of symbols) {
        const entry = dateMaps.get(sym)!;
        const idx = entry.idxByDate.get(d);
        if (idx === undefined) continue;
        const val = entry.shiftedFactors[def.id][idx];
        if (!Number.isFinite(val)) continue;
        crossSyms.push(sym);
        crossVals.push(val);
      }

      if (crossVals.length >= minSymbolsPerDate) {
        const ranks = rankArrayAverageTies(crossVals);
        const denom = Math.max(1, ranks.length - 1);
        const nextMap = new Map<string, number>();
        let turnSum = 0;
        let turnCnt = 0;
        for (let k = 0; k < crossSyms.length; k++) {
          const normR = (ranks[k] - 1) / denom;
          nextMap.set(crossSyms[k], normR);
          const prev = prevRanksBySymbol.get(crossSyms[k]);
          if (prev !== undefined) {
            turnSum += Math.abs(normR - prev);
            turnCnt++;
          }
          // Sample every 3rd date for fast pairwise correlation matrix
          if (dIdx % 3 === 0) {
            sampledFactorVectors[def.id].push(normR);
          }
        }
        if (turnCnt > 0) {
          turnoverSamples.push((turnSum / turnCnt) * 100);
        }
        prevRanksBySymbol = nextMap;
      }
    }

    for (const h of horizons) {
      const ics: number[] = [];
      const spreads: number[] = [];

      for (let dIdx = 0; dIdx < commonDates.length - h; dIdx++) {
        const d = commonDates[dIdx];
        const fVals: number[] = [];
        const fwdRets: number[] = [];

        for (const sym of symbols) {
          const entry = dateMaps.get(sym)!;
          const idx = entry.idxByDate.get(d);
          if (idx === undefined || idx + h >= entry.candles.length) continue;
          const f = entry.shiftedFactors[def.id][idx];
          const pNow = entry.candles[idx].close;
          const pFwd = entry.candles[idx + h].close;
          if (!Number.isFinite(f) || pNow <= 0 || pFwd <= 0) continue;
          fVals.push(f);
          fwdRets.push(((pFwd - pNow) / pNow) * 100);
        }

        if (fVals.length < 5) continue;
        const ic = spearmanRankCorrelation(fVals, fwdRets);
        ics.push(ic);

        // Quintile top 20% minus bottom 20% spread
        const paired = fVals
          .map((v, i) => ({ v, r: fwdRets[i] }))
          .sort((a, b) => a.v - b.v);
        const qSize = Math.max(1, Math.floor(paired.length / 5));
        let botSum = 0;
        let topSum = 0;
        for (let k = 0; k < qSize; k++) botSum += paired[k].r;
        for (let k = paired.length - qSize; k < paired.length; k++) topSum += paired[k].r;
        spreads.push(topSum / qSize - botSum / qSize);
      }

      const nDates = ics.length;
      const meanIc = nDates > 0 ? ics.reduce((s, v) => s + v, 0) / nDates : 0;
      const icVar =
        nDates > 1
          ? ics.reduce((s, v) => s + (v - meanIc) * (v - meanIc), 0) / (nDates - 1)
          : 0;
      const icStd = Math.sqrt(icVar);
      const icTStat = icStd > 1e-9 && nDates > 0 ? meanIc / (icStd / Math.sqrt(nDates)) : 0;
      const hitRatePct = nDates > 0 ? (ics.filter((v) => v > 0).length / nDates) * 100 : 0;
      const quintileSpreadPct =
        spreads.length > 0 ? spreads.reduce((s, v) => s + v, 0) / spreads.length : 0;

      byHorizon[h] = {
        horizonDays: h,
        meanIc: Number(meanIc.toFixed(4)),
        icStd: Number(icStd.toFixed(4)),
        icTStat: Number(icTStat.toFixed(2)),
        hitRatePct: Number(hitRatePct.toFixed(1)),
        quintileSpreadPct: Number(quintileSpreadPct.toFixed(3)),
        datesEvaluated: nDates,
      };
    }

    const horizonList = horizons.map((h) => byHorizon[h]);
    const evaluatedHorizons = horizonList.filter((m) => m.datesEvaluated > 0);
    const candidateHorizons = evaluatedHorizons.length > 0 ? evaluatedHorizons : horizonList;
    const avgIc =
      candidateHorizons.reduce((s, m) => s + m.meanIc, 0) /
      Math.max(1, candidateHorizons.length);
    const best = candidateHorizons.reduce((bestM, cur) =>
      Math.abs(cur.meanIc) > Math.abs(bestM.meanIc) ? cur : bestM
    );

    const activeMetrics =
      byHorizon[targetHorizonDays]?.datesEvaluated > 0 ? byHorizon[targetHorizonDays] : best;
    const absEvalIc = Math.abs(activeMetrics.meanIc);
    const absEvalT = Math.abs(activeMetrics.icTStat);
    const absBestIc = Math.abs(best.meanIc);
    const absBestT = Math.abs(best.icTStat);
    const suspectIcThreshold =
      best.horizonDays <= 10
        ? 0.22
        : best.horizonDays <= 50
        ? 0.30
        : best.horizonDays <= 120
        ? 0.38
        : 0.48;
    let verdict: FactorVerdict = 'NOISE';
    if (absBestIc > suspectIcThreshold) {
      verdict = 'LOOKAHEAD_SUSPECT';
    } else if (
      (absEvalIc >= 0.015 && absEvalT >= 2.0) ||
      (absBestIc >= 0.015 && absBestT >= 2.0)
    ) {
      verdict = 'ALPHA_SIGNAL';
    } else if (
      (absEvalIc >= 0.01 && absEvalT >= 1.2) ||
      (absBestIc >= 0.01 && absBestT >= 1.2)
    ) {
      verdict = 'WEAK_EDGE';
    }

    const turnoverPct =
      turnoverSamples.length > 0
        ? turnoverSamples.reduce((s, v) => s + v, 0) / turnoverSamples.length
        : 0;

    // Median ADF Stationarity t-stat across cohort symbols for this factor
    const symAdfTStats: number[] = [];
    for (const sym of symbols) {
      const entry = dateMaps.get(sym)!;
      const resAdf = computeAdfStationarityTest(entry.shiftedFactors[def.id]);
      if (Number.isFinite(resAdf.adfTStat)) symAdfTStats.push(resAdf.adfTStat);
    }
    symAdfTStats.sort((a, b) => a - b);
    const adfTStat =
      symAdfTStats.length > 0 ? symAdfTStats[Math.floor(symAdfTStats.length / 2)] : 0;
    const isStationary = adfTStat <= -2.86;

    // Triple-Barrier (+2xATR / -1xATR / 15D) Q5 alignment evaluation net of 10 bps friction
    const activeIcSign = (activeMetrics.meanIc >= 0 ? 1 : -1) as 1 | -1;
    let tbWins = 0;
    let tbTotal = 0;
    let tbRSum = 0;
    for (let dIdx = 0; dIdx < commonDates.length - 16; dIdx++) {
      const d = commonDates[dIdx];
      const cross: Array<{ score: number; tb: TripleBarrierPoint }> = [];
      for (const sym of symbols) {
        const entry = dateMaps.get(sym)!;
        const idx = entry.idxByDate.get(d);
        if (idx === undefined || idx + 15 >= entry.candles.length) continue;
        const val = entry.shiftedFactors[def.id][idx];
        const tb = entry.tripleBarrier[idx];
        if (!Number.isFinite(val) || !tb || tb.barsHeld <= 0) continue;
        cross.push({ score: val * activeIcSign, tb });
      }
      if (cross.length < 5) continue;
      cross.sort((a, b) => a.score - b.score);
      const qSize = Math.max(1, Math.floor(cross.length / 5));
      for (let k = cross.length - qSize; k < cross.length; k++) {
        tbTotal++;
        if (cross[k].tb.label === 1) tbWins++;
        tbRSum += cross[k].tb.rMultiple;
      }
    }
    const tbWinRatePct = tbTotal > 0 ? Number(((tbWins / tbTotal) * 100).toFixed(1)) : 0;
    const tbExpectancyR = tbTotal > 0 ? Number((tbRSum / tbTotal).toFixed(3)) : 0;

    factorRanking.push({
      factorId: def.id,
      name: def.name,
      shortLabel: def.shortLabel,
      origin: def.origin,
      category: def.category,
      description: def.description,
      strategyRole: def.strategyRole,
      byHorizon,
      avgIc: Number(avgIc.toFixed(4)),
      bestHorizonDays: best.horizonDays,
      bestIc: best.meanIc,
      bestTStat: best.icTStat,
      bestSpreadPct: best.quintileSpreadPct,
      turnoverPct: Number(turnoverPct.toFixed(1)),
      adfTStat,
      isStationary,
      tbWinRatePct,
      tbExpectancyR,
      topCorrelatedPeer: null,
      verdict,
    });
  }

  // Pairwise correlation & redundancy check
  const redundantPairs: RedundantFactorPair[] = [];
  const defById = new Map(UNIFIED_ML4T_FACTORS.map((d) => [d.id, d]));
  const bestPeerByFactor = new Map<
    string,
    { factorId: string; shortLabel: string; correlation: number }
  >();

  for (let i = 0; i < UNIFIED_ML4T_FACTORS.length; i++) {
    for (let j = i + 1; j < UNIFIED_ML4T_FACTORS.length; j++) {
      const a = UNIFIED_ML4T_FACTORS[i];
      const b = UNIFIED_ML4T_FACTORS[j];
      const va = sampledFactorVectors[a.id];
      const vb = sampledFactorVectors[b.id];
      const len = Math.min(va.length, vb.length);
      if (len < 30) continue;
      const corr = pearsonCorrelation(va.slice(0, len), vb.slice(0, len));
      const absCorr = Math.abs(corr);

      const curBestA = bestPeerByFactor.get(a.id);
      if (!curBestA || absCorr > Math.abs(curBestA.correlation)) {
        bestPeerByFactor.set(a.id, {
          factorId: b.id,
          shortLabel: b.shortLabel,
          correlation: Number(corr.toFixed(2)),
        });
      }
      const curBestB = bestPeerByFactor.get(b.id);
      if (!curBestB || absCorr > Math.abs(curBestB.correlation)) {
        bestPeerByFactor.set(b.id, {
          factorId: a.id,
          shortLabel: a.shortLabel,
          correlation: Number(corr.toFixed(2)),
        });
      }

      if (absCorr >= 0.72) {
        redundantPairs.push({
          factorA: a.id,
          labelA: defById.get(a.id)!.shortLabel,
          factorB: b.id,
          labelB: defById.get(b.id)!.shortLabel,
          correlation: Number(corr.toFixed(2)),
        });
      }
    }
  }

  redundantPairs.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
  for (const row of factorRanking) {
    row.topCorrelatedPeer = bestPeerByFactor.get(row.factorId) ?? null;
  }

  factorRanking.sort((a, b) => {
    const aH = a.byHorizon[targetHorizonDays];
    const bH = b.byHorizon[targetHorizonDays];
    const aScore = aH && aH.datesEvaluated > 0 ? Math.abs(aH.meanIc) : Math.abs(a.bestIc);
    const bScore = bH && bH.datesEvaluated > 0 ? Math.abs(bH.meanIc) : Math.abs(b.bestIc);
    return bScore - aScore;
  });

  // Walk-Forward Ridge Meta-Model (Chapter 11/12 linear/ridge ensemble baseline)
  const walkForwardMeta = trainWalkForwardRidgeMetaModel(
    symbols,
    dateMaps,
    commonDates,
    targetHorizonDays,
    options?.ridgeLambda ?? 25.0
  );

  const overlapAudit = buildAttachedOverlapAudit(factorRanking, sampledFactorVectors);
  const presetCombinations = runPresetCombinations(
    symbols,
    dateMaps,
    commonDates,
    factorRanking,
    targetHorizonDays
  );

  return {
    configFingerprint: computeFeatureConfigFingerprint(),
    stationaryCount: factorRanking.filter((r) => r.isStationary).length,
    symbolsAnalyzed: symbols,
    commonDatesCount: commonDates.length,
    dateRange: {
      start: commonDates[0] || '',
      end: commonDates[commonDates.length - 1] || '',
    },
    horizons,
    antiLookaheadShiftBars: shiftBars,
    factorRanking,
    redundantPairs: redundantPairs.slice(0, 12),
    walkForwardMeta,
    overlapAudit,
    presetCombinations,
    clippedPineNotice: [
      '23 Complete Pine v6 Ports Active across Core + Batch 1 + Batch 2 + Batch 3 (including Startup SS Strat v2.0 with Lattice & Online-IC + upgraded SuperTrend v10.1 PRIME).',
      'Deduplicated automatically across Batch 2 & 3: Volume Spike v5, Volume Spike Pro, Order Flow ELITE v6, Startup Bravo+Voila (original-style), TradingWie V2.3 & duplicate SuperTrend v10.1 paste were skipped without cloning.',
      '4 attached .txt files (___PROMT_improuving_indicators, DEBUG_AND_TEST_indicator, GitHub_audit_project, tooltip_descriptions) are AI prompt templates rather than Pine indicators.',
    ],
  };
}

/**
 * Solves A * w = b via Gaussian elimination with partial pivoting.
 */
function solveLinearSystem(A: number[][], b: number[]): number[] {
  const m = b.length;
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < m; col++) {
    let pivotRow = col;
    for (let r = col + 1; r < m; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivotRow][col])) {
        pivotRow = r;
      }
    }
    if (pivotRow !== col) {
      const tmp = M[col];
      M[col] = M[pivotRow];
      M[pivotRow] = tmp;
    }
    const diag = M[col][col];
    if (Math.abs(diag) < 1e-10) continue;

    for (let r = col + 1; r < m; r++) {
      const factor = M[r][col] / diag;
      for (let c = col; c <= m; c++) {
        M[r][c] -= factor * M[col][c];
      }
    }
  }

  const w = new Array<number>(m).fill(0);
  for (let i = m - 1; i >= 0; i--) {
    if (Math.abs(M[i][i]) < 1e-10) continue;
    let sum = M[i][m];
    for (let j = i + 1; j < m; j++) {
      sum -= M[i][j] * w[j];
    }
    w[i] = sum / M[i][i];
  }
  return w;
}

function trainWalkForwardRidgeMetaModel(
  symbols: string[],
  dateMaps: Map<
    string,
    {
      candles: Candle[];
      idxByDate: Map<string, number>;
      shiftedFactors: Record<string, number[]>;
      tripleBarrier: TripleBarrierPoint[];
    }
  >,
  commonDates: string[],
  horizonDays: number,
  lambda: number
): WalkForwardMetaModelReport {
  const usableDates = commonDates.slice(0, Math.max(0, commonDates.length - horizonDays));
  if (usableDates.length < 40 || symbols.length < 4) {
    return {
      available: false,
      targetHorizonDays: horizonDays,
      trainDates: 0,
      oosDates: 0,
      trainSplitDate: '',
      oosMeanIc: 0,
      oosIcTStat: 0,
      oosQuintileSpreadPct: 0,
      oosLongHitRatePct: 0,
      oosBarrierWinRatePct: 0,
      oosBarrierExpectancyR: 0,
      featureWeights: [],
      note: 'Need at least 40 overlapping sessions and 4+ symbols for chronological walk-forward split.',
    };
  }

  const splitIdx = Math.floor(usableDates.length * 0.7);
  const purgeGap = Math.min(horizonDays, Math.max(1, usableDates.length - splitIdx - 10));
  const trainDates = usableDates.slice(0, splitIdx);
  const oosDates = usableDates.slice(splitIdx + purgeGap);

  if (trainDates.length < 20 || oosDates.length < 10) {
    return {
      available: false,
      targetHorizonDays: horizonDays,
      trainDates: trainDates.length,
      oosDates: oosDates.length,
      trainSplitDate: usableDates[splitIdx] || '',
      oosMeanIc: 0,
      oosIcTStat: 0,
      oosQuintileSpreadPct: 0,
      oosLongHitRatePct: 0,
      oosBarrierWinRatePct: 0,
      oosBarrierExpectancyR: 0,
      featureWeights: [],
      note: 'Insufficient out-of-sample dates after purged gap.',
    };
  }

  const fCount = UNIFIED_ML4T_FACTORS.length;
  const collectPanelRows = (datesList: string[]) => {
    const byDate: Array<{
      date: string;
      rows: Array<{ x: number[]; y: number; tb: TripleBarrierPoint }>;
    }> = [];
    for (const d of datesList) {
      const rawRows: Array<{ x: number[]; rawY: number; tb: TripleBarrierPoint }> = [];
      for (const sym of symbols) {
        const entry = dateMaps.get(sym)!;
        const idx = entry.idxByDate.get(d);
        if (idx === undefined || idx + horizonDays >= entry.candles.length) continue;
        const pNow = entry.candles[idx].close;
        const pFwd = entry.candles[idx + horizonDays].close;
        if (pNow <= 0 || pFwd <= 0) continue;

        const x: number[] = [];
        let ok = true;
        for (const def of UNIFIED_ML4T_FACTORS) {
          const val = entry.shiftedFactors[def.id][idx];
          if (!Number.isFinite(val)) {
            ok = false;
            break;
          }
          x.push(val);
        }
        if (!ok) continue;
        rawRows.push({
          x,
          rawY: ((pFwd - pNow) / pNow) * 100,
          tb: entry.tripleBarrier[idx] ?? { label: 0, rMultiple: 0, barsHeld: 0 },
        });
      }
      if (rawRows.length < 4) continue;
      // Cross-sectional excess return (de-meaned per date so model predicts alpha, not market beta)
      const meanY = rawRows.reduce((s, r) => s + r.rawY, 0) / rawRows.length;
      byDate.push({
        date: d,
        rows: rawRows.map((r) => ({ x: r.x, y: r.rawY - meanY, tb: r.tb })),
      });
    }
    return byDate;
  };

  const trainByDate = collectPanelRows(trainDates);
  const oosByDate = collectPanelRows(oosDates);
  const flatTrain = trainByDate.flatMap((d) => d.rows);

  if (flatTrain.length < 50 || oosByDate.length < 8) {
    return {
      available: false,
      targetHorizonDays: horizonDays,
      trainDates: trainByDate.length,
      oosDates: oosByDate.length,
      trainSplitDate: usableDates[splitIdx] || '',
      oosMeanIc: 0,
      oosIcTStat: 0,
      oosQuintileSpreadPct: 0,
      oosLongHitRatePct: 0,
      oosBarrierWinRatePct: 0,
      oosBarrierExpectancyR: 0,
      featureWeights: [],
      note: 'Too few valid aligned observations in walk-forward window.',
    };
  }

  // Standardize features strictly from In-Sample window
  const means = new Array<number>(fCount).fill(0);
  const stds = new Array<number>(fCount).fill(1);
  for (let j = 0; j < fCount; j++) {
    means[j] = flatTrain.reduce((s, r) => s + r.x[j], 0) / flatTrain.length;
    const varJ =
      flatTrain.reduce((s, r) => s + (r.x[j] - means[j]) * (r.x[j] - means[j]), 0) /
      Math.max(1, flatTrain.length - 1);
    stds[j] = Math.max(1e-6, Math.sqrt(varJ));
  }

  // Normal Equations (X^T X + lambda * I) w = X^T y
  const XtX: number[][] = Array.from({ length: fCount }, () => new Array<number>(fCount).fill(0));
  const Xty: number[] = new Array<number>(fCount).fill(0);
  for (const row of flatTrain) {
    const z = row.x.map((v, j) => clamp((v - means[j]) / stds[j], -4, 4));
    for (let a = 0; a < fCount; a++) {
      Xty[a] += z[a] * row.y;
      for (let b = a; b < fCount; b++) {
        XtX[a][b] += z[a] * z[b];
      }
    }
  }
  const scaledLambda = lambda * (flatTrain.length / 250);
  for (let a = 0; a < fCount; a++) {
    XtX[a][a] += scaledLambda;
    for (let b = 0; b < a; b++) {
      XtX[a][b] = XtX[b][a];
    }
  }

  const weights = solveLinearSystem(XtX, Xty);

  // Evaluate Out-of-Sample IC, Top-vs-Bottom Spread, and +2R/-1R/15D Triple-Barrier Expectancy
  const oosIcs: number[] = [];
  const oosSpreads: number[] = [];
  let oosTopHits = 0;
  let oosTopTotal = 0;
  let oosTbWins = 0;
  let oosTbTotal = 0;
  let oosTbRSum = 0;

  for (const day of oosByDate) {
    const preds: number[] = [];
    const actuals: number[] = [];
    for (const r of day.rows) {
      let pred = 0;
      for (let j = 0; j < fCount; j++) {
        const z = clamp((r.x[j] - means[j]) / stds[j], -4, 4);
        pred += weights[j] * z;
      }
      preds.push(pred);
      actuals.push(r.y);
    }
    if (preds.length < 4) continue;
    oosIcs.push(spearmanRankCorrelation(preds, actuals));

    const paired = preds
      .map((p, idx) => ({ p, y: actuals[idx], tb: day.rows[idx].tb }))
      .sort((a, b) => a.p - b.p);
    const qSize = Math.max(1, Math.floor(paired.length / 5));
    let bot = 0;
    let top = 0;
    for (let k = 0; k < qSize; k++) bot += paired[k].y;
    for (let k = paired.length - qSize; k < paired.length; k++) {
      top += paired[k].y;
      oosTopTotal++;
      if (paired[k].y > 0) oosTopHits++;
      if (paired[k].tb.barsHeld > 0) {
        oosTbTotal++;
        if (paired[k].tb.label === 1) oosTbWins++;
        oosTbRSum += paired[k].tb.rMultiple;
      }
    }
    oosSpreads.push(top / qSize - bot / qSize);
  }

  const nOos = oosIcs.length;
  const oosMeanIc = nOos > 0 ? oosIcs.reduce((s, v) => s + v, 0) / nOos : 0;
  const oosVar =
    nOos > 1
      ? oosIcs.reduce((s, v) => s + (v - oosMeanIc) * (v - oosMeanIc), 0) / (nOos - 1)
      : 0;
  const oosStd = Math.sqrt(oosVar);
  const oosIcTStat = oosStd > 1e-9 && nOos > 0 ? oosMeanIc / (oosStd / Math.sqrt(nOos)) : 0;
  const oosSpread =
    oosSpreads.length > 0 ? oosSpreads.reduce((s, v) => s + v, 0) / oosSpreads.length : 0;
  const oosHitRate = oosTopTotal > 0 ? (oosTopHits / oosTopTotal) * 100 : 0;
  const oosBarrierWinRatePct = oosTbTotal > 0 ? (oosTbWins / oosTbTotal) * 100 : 0;
  const oosBarrierExpectancyR = oosTbTotal > 0 ? oosTbRSum / oosTbTotal : 0;

  const totalAbsWeight = weights.reduce((s, w) => s + Math.abs(w), 0) || 1;
  const featureWeights = UNIFIED_ML4T_FACTORS.map((def, idx) => ({
    factorId: def.id,
    shortLabel: def.shortLabel,
    origin: def.origin,
    weight: Number(weights[idx].toFixed(4)),
    importancePct: Number(((Math.abs(weights[idx]) / totalAbsWeight) * 100).toFixed(1)),
  })).sort((a, b) => b.importancePct - a.importancePct);

  return {
    available: true,
    targetHorizonDays: horizonDays,
    trainDates: trainByDate.length,
    oosDates: nOos,
    trainSplitDate: usableDates[splitIdx] || '',
    oosMeanIc: Number(oosMeanIc.toFixed(4)),
    oosIcTStat: Number(oosIcTStat.toFixed(2)),
    oosQuintileSpreadPct: Number(oosSpread.toFixed(3)),
    oosLongHitRatePct: Number(oosHitRate.toFixed(1)),
    oosBarrierWinRatePct: Number(oosBarrierWinRatePct.toFixed(1)),
    oosBarrierExpectancyR: Number(oosBarrierExpectancyR.toFixed(3)),
    featureWeights,
    note:
      purgeGap < horizonDays
        ? `Walk-Forward Purged 70/30 Ridge (clamped gap=${purgeGap}d < ${horizonDays}d horizon on available history, lambda=${lambda}) predicting +${horizonDays}D cross-sectional alpha without look-ahead.`
        : `Walk-Forward Purged 70/30 Ridge (gap=${purgeGap}d, lambda=${lambda}) predicting +${horizonDays}D cross-sectional alpha without look-ahead.`,
  };
}

// ============================================================
// ATTACHED INDICATOR DUPLICATION AUDIT (10 PINE + 4 PROMPTS)
// ============================================================

function computePairCorr(vecA?: number[], vecB?: number[]): number | null {
  if (!vecA || !vecB) return null;
  const len = Math.min(vecA.length, vecB.length);
  if (len < 30) return null;
  return Number(pearsonCorrelation(vecA.slice(0, len), vecB.slice(0, len)).toFixed(2));
}

function buildAttachedOverlapAudit(
  _factorRanking: FactorIcAuditRow[],
  sampledVectors: Record<string, number[]>
): AttachedOverlapAuditRow[] {
  return [
    {
      fileName: 'HA_Institutional_Suite_v2.1__PRO__QWEN.txt',
      title: 'HA Institutional Suite v2.1 [PRO]',
      fileType: 'PINE_INDICATOR',
      factorId: 'ha_ribbon_align',
      status: 'PARTIAL_OVERLAP',
      overlapsWith: 'ADX(14) + TrendCloud Pro (EMA 12/34)',
      empiricalCorr: computePairCorr(sampledVectors['ha_ribbon_align'], sampledVectors['keltner_position']),
      dailyBarNote: 'Heiken Ashi Uncertain-Doji filter + 5-SMA Ribbon works cleanly on 1D bars.',
      recommendation: 'KEEP UNIQUE LOGIC: Added HA Ribbon% to Indicator Library & Factor Lab.',
    },
    {
      fileName: 'Order_Flow_Volume_Suite_ELITE__v6_Multi-TF.txt',
      title: 'Order Flow Volume Suite ELITE [v6]',
      fileType: 'PINE_INDICATOR',
      factorId: 'orderflow_bar_imbalance',
      status: 'DUPLICATE_EXISTING',
      overlapsWith: 'Volume Spike & Change Detector Pro + Order Flow Strategy [Auction]',
      empiricalCorr: computePairCorr(sampledVectors['orderflow_bar_imbalance'], sampledVectors['relvol_z50']),
      dailyBarNote: 'Uses identical (close - low)/(high - low) intrabar delta proxy; session VWAP resets daily so HTF MTF fits 1D differently.',
      recommendation: 'SKIP LIBRARY CLONE: Already covered by Volume Spike Engine & Order Flow Strategy.',
    },
    {
      fileName: 'TradingWarz_-_Auto_Fibonacci__RICH_APPROVED_V1.6.txt',
      title: 'TradingWarz - Auto Fibonacci (V1.6)',
      fileType: 'PINE_INDICATOR',
      factorId: 'tw_prev_week_fib_pos',
      status: 'UNIQUE_NEW',
      overlapsWith: 'Trullas Fib Targets (different anchor) & Vol Z-Score(50)',
      empiricalCorr: computePairCorr(sampledVectors['tw_prev_week_fib_pos'], sampledVectors['keltner_position']),
      dailyBarNote: 'On 1D bars, "Current Day" has 1 bar/day; adapted to Previous Completed Week High/Low Golden Zone (61.8-78.6%).',
      recommendation: 'KEEP: Added to Indicator Library + Weekly Fib Zone tested on 1D bars.',
    },
    {
      fileName: 'Weinstein_Stage_Analysis_QWEN.txt',
      title: 'Weinstein Stage Analysis [Institutional v3.3]',
      fileType: 'PINE_INDICATOR',
      factorId: 'weinstein_stage_roc',
      status: 'DUPLICATE_EXISTING',
      overlapsWith: 'TrendSpider Stan Weinstein Stage Analysis (30-Week SMA + Mansfield RS)',
      empiricalCorr: computePairCorr(sampledVectors['weinstein_stage_roc'], sampledVectors['dist_sma50_pct']),
      dailyBarNote: 'On 1D bars, 30W SMA = 150-day SMA. Adds ATR friction & coiled-base counters on top of existing TrendSpider Stage.',
      recommendation: 'MERGE CONCEPTS ONLY: Avoid duplicating Weinstein in Library; benchmarked 150D ROC in Factor Lab.',
    },
    {
      fileName: '_Bravo___Voila.txt',
      title: 'Startup Suite (Bravo+Voila)',
      fileType: 'PINE_INDICATOR',
      factorId: 'startup_bravo_atr_dist',
      status: 'PARTIAL_OVERLAP',
      overlapsWith: 'Keltner Channel Position (EMA20 / 2·ATR14)',
      empiricalCorr: computePairCorr(sampledVectors['startup_bravo_atr_dist'], sampledVectors['keltner_position']),
      dailyBarNote: 'EMA(12) + 1σ/2σ/3σ ATR bands + Daily/Weekly Silver S/R pivot stratification fits 1D swing charts well.',
      recommendation: 'KEEP: Full script ported to Indicator Library + Factor Lab.',
    },
    {
      fileName: 'Arch.txt',
      title: 'Startup Arch (LinReg Detrended Z)',
      fileType: 'PINE_INDICATOR',
      factorId: 'startup_arch_z',
      status: 'PARTIAL_OVERLAP',
      overlapsWith: 'WhaleFusion LinReg Momentum (20-bar regression)',
      empiricalCorr: computePairCorr(sampledVectors['startup_arch_z'], sampledVectors['whalefusion_linreg']),
      dailyBarNote: 'Adds 100-bar Z-score (±2σ Early/Late phase) on top of 20-bar detrended linear regression.',
      recommendation: 'COMPARE IC & r: Keep whichever of Arch Z vs WhaleFusion LinReg delivers higher OOS IC.',
    },
    {
      fileName: 'Echo.txt',
      title: 'Startup Echo (Fast RSI 7)',
      fileType: 'PINE_INDICATOR',
      factorId: 'startup_echo_rsi7',
      status: 'PARTIAL_OVERLAP',
      overlapsWith: 'Trullas RSI(14) Oscillator',
      empiricalCorr: computePairCorr(sampledVectors['startup_echo_rsi7'], sampledVectors['trullas_rsi14']),
      dailyBarNote: 'Faster 7-bar RSI(SMA 2) swings quicker on 1D bars than RSI(14).',
      recommendation: 'KEEP IF NON-REDUNDANT: Tested head-to-head against RSI(14) in Leaderboard.',
    },
    {
      fileName: 'Helix.txt',
      title: 'Startup Helix (8/21/5)',
      fileType: 'PINE_INDICATOR',
      factorId: 'startup_helix_osc',
      status: 'PARTIAL_OVERLAP',
      overlapsWith: 'Trullas MACD(12,26,9) & B-Xtrender (EMA5-20)',
      empiricalCorr: computePairCorr(sampledVectors['startup_helix_osc'], sampledVectors['trullas_macd_hist']),
      dailyBarNote: 'EMA(8-21, 5) tracks fast momentum slope & flat-helix indecision chop on 1D bars.',
      recommendation: 'PRUNE IF |r| >= 0.80: Check correlation vs MACD & B-Xtrender.',
    },
    {
      fileName: 'Mountain.txt',
      title: 'Startup Mountain (EMA 50 Altitude)',
      fileType: 'PINE_INDICATOR',
      factorId: 'startup_mountain_alt',
      status: 'DUPLICATE_EXISTING',
      overlapsWith: 'StageLedger Core 50-SMA Distance (%)',
      empiricalCorr: computePairCorr(sampledVectors['startup_mountain_alt'], sampledVectors['dist_sma50_pct']),
      dailyBarNote: '(Close - EMA50)/EMA50*100 moves nearly 1-for-1 with (Close - SMA50)/SMA50*100 on 1D bars.',
      recommendation: 'REDUNDANT FOR SCORING: Keep in Library for visual chart style, exclude from ML weights.',
    },
    {
      fileName: 'Tango.txt',
      title: 'Startup Tango (Slow RSI 28)',
      fileType: 'PINE_INDICATOR',
      factorId: 'startup_tango_rsi28',
      status: 'UNIQUE_NEW',
      overlapsWith: 'Trullas RSI(14) (slower 28/10 macro cadence)',
      empiricalCorr: computePairCorr(sampledVectors['startup_tango_rsi28'], sampledVectors['trullas_rsi14']),
      dailyBarNote: 'Slow smoothed RSI(28, 10) filters noise effectively on 1D swing & Weekly regimes.',
      recommendation: 'KEEP: Added to Indicator Library + tested in Startup Trifecta combo.',
    },
    {
      fileName: '___PROMT_improuving_indicators.txt',
      title: 'Prompt: Institutional Grade Indicator Reviewer',
      fileType: 'LLM_PROMPT',
      status: 'NON_INDICATOR_PROMPT',
      overlapsWith: 'N/A (Prompt Template)',
      empiricalCorr: null,
      dailyBarNote: 'Analysis checklist prompt (risk sizing, friction, robustness) — not executable Pine code.',
      recommendation: 'REFERENCE ONLY: Principles (10bps friction + sizing) already baked into Combination Tester.',
    },
    {
      fileName: 'DEBUG_AND_TEST_indicator.txt',
      title: 'Prompt: Pine Script v6 Debugger',
      fileType: 'LLM_PROMPT',
      status: 'NON_INDICATOR_PROMPT',
      overlapsWith: 'N/A (Prompt Template)',
      empiricalCorr: null,
      dailyBarNote: 'Code debugging prompt template — not an indicator.',
      recommendation: 'REFERENCE ONLY.',
    },
    {
      fileName: 'GitHub_audit_project.txt',
      title: 'Prompt: Python Port Dues Project Auditor',
      fileType: 'LLM_PROMPT',
      status: 'NON_INDICATOR_PROMPT',
      overlapsWith: 'N/A (Unrelated Maritime Prompt)',
      empiricalCorr: null,
      dailyBarNote: 'Python maritime/port-dues audit prompt — unrelated to trading indicators.',
      recommendation: 'IGNORE (Non-trading prompt).',
    },
    {
      fileName: 'tooltip_descriptions.txt',
      title: 'Prompt: Table Tooltips & VWAP Signals',
      fileType: 'LLM_PROMPT',
      status: 'NON_INDICATOR_PROMPT',
      overlapsWith: 'N/A (UI Tooltip Specification)',
      empiricalCorr: null,
      dailyBarNote: 'Requested hover tooltips on UI tables/metrics — implemented natively across Factor Lab UI.',
      recommendation: 'APPLIED IN UI: Rich hover descriptions added to every metric & strategy flow card.',
    },
    // Batch 2 — 10 Newly Pasted Pine Scripts Deduplication & 1D Audit
    {
      fileName: 'Paste: G-Ron TrendCloud Pro v3',
      title: 'G-Ron TrendCloud Pro v3 (Donchian/SMA Cloud)',
      fileType: 'PINE_INDICATOR',
      factorId: 'gron_trendcloud_bias',
      status: 'PARTIAL_OVERLAP',
      overlapsWith: 'Placeholder trendcloud-pro (upgraded in place) & Keltner Position',
      empiricalCorr: computePairCorr(sampledVectors['gron_trendcloud_bias'], sampledVectors['keltner_position']),
      dailyBarNote: '20-bar Donchian/SMA ratcheting cloud + 200MA risk alignment & 2.618 Fib target fits 1D swing charts well.',
      recommendation: 'UPGRADED IN PLACE: Replaced basic EMA 12/34 stub in Indicator Library + added to Factor Lab.',
    },
    {
      fileName: 'Paste: Auto Anchored VWAP [Shannon Method]',
      title: 'Auto Anchored VWAP [Shannon Method]',
      fileType: 'PINE_INDICATOR',
      factorId: 'shannon_ytd_avwap_z',
      status: 'PARTIAL_OVERLAP',
      overlapsWith: 'TrendSpider Auto-AVWAP & Rolling 50 VWAP VScore',
      empiricalCorr: computePairCorr(sampledVectors['shannon_ytd_avwap_z'], sampledVectors['vscore_vwap50']),
      dailyBarNote: 'Calendar YTD anchor + ±1σ/±2σ bands & 3-bar slope tests true YTD institutional cost basis vs rolling 50-bar VWAP.',
      recommendation: 'KEEP COMPLEMENTARY: Added shannon-auto-avwap-v6 + benchmarked YTD AVWAP Z vs VScore(50).',
    },
    {
      fileName: 'Paste: TradingWie - Auto Fibonacci (V2.3)',
      title: 'TradingWie - Auto Fibonacci (V2.3)',
      fileType: 'PINE_INDICATOR',
      factorId: 'tw_prev_week_fib_pos',
      status: 'DUPLICATE_EXISTING',
      overlapsWith: 'TradingWie Auto Fibonacci V3.0 & V1.6',
      empiricalCorr: 1.0,
      dailyBarNote: 'Strictly superseded by V3.0 (pasted in same batch) which adds EMA50 regime gate, 0.3xATR wick filter & R:R >= 2.0.',
      recommendation: 'SKIP CLONE: Upgraded single Library slot directly to TradingWie V3.0.',
    },
    {
      fileName: 'Paste: Volume Spike & Change Detector v5',
      title: 'Volume Spike & Change Detector v5',
      fileType: 'PINE_INDICATOR',
      factorId: 'orderflow_bar_imbalance',
      status: 'DUPLICATE_EXISTING',
      overlapsWith: 'Volume Spike & Change Detector Pro (volume-spike-change-pro + volumeSpikeEngine.ts)',
      empiricalCorr: computePairCorr(sampledVectors['orderflow_bar_imbalance'], sampledVectors['relvol_z50']),
      dailyBarNote: 'Exact Pine v5 precursor to StageLedger existing v6 Volume Spike Pro (already includes Churn/CVD/MTF sentiment).',
      recommendation: 'SKIP CLONE: Zero new logic; keep existing Volume Spike Pro v6.',
    },
    {
      fileName: 'Paste: AGAIG + Institutional AVWAP v2',
      title: 'AGAIG + Institutional AVWAP v2 (12-Pillar)',
      fileType: 'PINE_INDICATOR',
      factorId: 'agaig_consensus_score',
      status: 'PARTIAL_OVERLAP',
      overlapsWith: 'Placeholder agaig-avwap (upgraded in place) & Confluence 360°',
      empiricalCorr: computePairCorr(sampledVectors['agaig_consensus_score'], sampledVectors['trullas_rsi14']),
      dailyBarNote: 'Adapted to 11 daily-compatible sub-pillars (SSL HMA60 + EMAs + RSI + MACD + Stoch + CCI + CMF + ADX + VWAP) without 5m look-ahead.',
      recommendation: 'UPGRADED IN PLACE: Upgraded agaig-avwap + benchmarked 11-Pillar voting vs Ridge weights.',
    },
    {
      fileName: 'Paste: Inside Bar Auto-HTF System v2.0',
      title: 'Inside Bar Auto-HTF System v2.0',
      fileType: 'PINE_INDICATOR',
      factorId: 'inside_bar_htf_score',
      status: 'UNIQUE_NEW',
      overlapsWith: 'None (Unique Mother-Bar Compression + Weekly EMA50)',
      empiricalCorr: computePairCorr(sampledVectors['inside_bar_htf_score'], sampledVectors['adx14']),
      dailyBarNote: 'Detects 1D volatility coil inside bars with causal Weekly EMA50 Auto-HTF gate & 0-5 compression score.',
      recommendation: 'KEEP UNIQUE LOGIC: Added inside-bar-auto-htf-v2 to Indicator Library + Factor Lab.',
    },
    {
      fileName: 'Paste: Institutional Confluence Engine [ICE v1.1.0]',
      title: 'Institutional Confluence Engine [ICE v1.1.0]',
      fileType: 'PINE_INDICATOR',
      factorId: 'algoalpha_trail_dist',
      status: 'PARTIAL_OVERLAP',
      overlapsWith: 'Trullas MACD + B-Xtrender + AlgoAlpha Trail & HMA-MFI (All 4 already ported)',
      empiricalCorr: computePairCorr(sampledVectors['algoalpha_trail_dist'], sampledVectors['bxtrender_short']),
      dailyBarNote: 'Composite formula 0.35*MACD/ATR + 0.35*BXT/50 + 0.30*(HMA_MFI-50)/50 gated by AlphaTrail.',
      recommendation: 'TESTED AS COMBO: Added ice-confluence-v11 to Library & ICE v1.1.0 preset in 1D Combinations Lab.',
    },
    {
      fileName: 'Paste: Institutional Prop Engine v5 | ICT Liquidity',
      title: 'Institutional Prop Engine v5 | ICT Liquidity',
      fileType: 'PINE_INDICATOR',
      factorId: 'ict_liquidity_confluence',
      status: 'PARTIAL_OVERLAP',
      overlapsWith: 'LuxAlgo Smart Money Concepts [SMC] (adds OTE & Liquidity Sweep scoring)',
      empiricalCorr: computePairCorr(sampledVectors['ict_liquidity_confluence'], sampledVectors['tw_prev_week_fib_pos']),
      dailyBarNote: '8-point ICT confluence (BSL/SSL Sweep vs Break + FVG + OTE 0.62-0.79 + Weekly Mid + EMA20) adapted cleanly to 1D bars.',
      recommendation: 'KEEP COMPLEMENTARY: Added ict-prop-engine-v5 to Indicator Library + Factor Lab.',
    },
    {
      fileName: 'Paste: MCDX Plus — Institutional Edition',
      title: 'MCDX Plus — Institutional Edition',
      fileType: 'PINE_INDICATOR',
      factorId: 'mcdx_net_chip_edge',
      status: 'UNIQUE_NEW',
      overlapsWith: 'None (Banker vs Floating vs Trapped Chips Decomposition)',
      empiricalCorr: computePairCorr(sampledVectors['mcdx_net_chip_edge'], sampledVectors['dist_sma50_pct']),
      dailyBarNote: 'Maps 100-bar Profitable Chips vs Trapped Chips & PC vs SMA(10) regime natively on 1D swing charts.',
      recommendation: 'KEEP UNIQUE LOGIC: Added mcdx-plus-institutional to Indicator Library + Factor Lab.',
    },
    {
      fileName: 'Paste: TradingWie - Auto Fibonacci (V3.0)',
      title: 'TradingWie - Auto Fibonacci (V3.0)',
      fileType: 'PINE_INDICATOR',
      factorId: 'tw_prev_week_fib_pos',
      status: 'UNIQUE_NEW',
      overlapsWith: 'Upgrades V1.6 / V2.3 in place (EMA50 + 0.3xATR Wick + R:R >= 2.0)',
      empiricalCorr: computePairCorr(sampledVectors['tw_prev_week_fib_pos'], sampledVectors['keltner_position']),
      dailyBarNote: 'Final canonical Auto-Fib version: protects against zero-range bars, filters noise wicks & gates by EMA(50).',
      recommendation: 'CANONICAL FIB UPGRADE: Upgraded Library slot to V3.0 without duplicating V1.6/V2.3.',
    },
    // Batch 3 — 5 Newly Pasted Scripts (Deduplication & Missing Pine v6 Ports)
    {
      fileName: 'Paste: Startup Bravo+Voila (Original-Style)',
      title: 'Startup Bravo+Voila (Original-Style)',
      fileType: 'PINE_INDICATOR',
      factorId: 'startup_bravo_atr_dist',
      status: 'DUPLICATE_EXISTING',
      overlapsWith: '_Bravo___Voila.txt (startup-bravo-voila already in Indicator Library & Factor Lab)',
      empiricalCorr: 1.0,
      dailyBarNote: 'Identical EMA(12) + ATR(14) + Voila 1D/1W pivot logic already ported in Batch 1.',
      recommendation: 'SKIP CLONE: Already exists as startup-bravo-voila.',
    },
    {
      fileName: 'Paste: Order Flow Volume Suite ELITE [v6 Multi-TF]',
      title: 'Order Flow Volume Suite ELITE [v6 Multi-TF] (Duplicate Paste)',
      fileType: 'PINE_INDICATOR',
      factorId: 'orderflow_bar_imbalance',
      status: 'DUPLICATE_EXISTING',
      overlapsWith: 'Order_Flow_Volume_Suite_ELITE__v6_Multi-TF.txt + Volume Spike Pro',
      empiricalCorr: 1.0,
      dailyBarNote: 'Exact re-paste of Order Flow ELITE v6 already audited in Batch 1.',
      recommendation: 'SKIP CLONE: Zero duplicate Library entry created.',
    },
    {
      fileName: 'Paste_November_27__2026_-_1_55PM_66f692aa',
      title: 'Volume Spike & Change Detector Pro',
      fileType: 'PINE_INDICATOR',
      factorId: 'relvol_z50',
      status: 'DUPLICATE_EXISTING',
      overlapsWith: 'volume-spike-change-pro (Indicator Library) + src/utils/volumeSpikeEngine.ts',
      empiricalCorr: 1.0,
      dailyBarNote: 'Full Pine v6 source of StageLedger existing Volume Spike & Change Detector Pro (Churn, CVD, W/M Delta, Sentiment).',
      recommendation: 'SKIP CLONE: Already integrated natively across Volume Spike Engine & Library.',
    },
    {
      fileName: 'Paste_November_27__2026_-_1_53PM_7c99d9a0 (x2)',
      title: 'SuperTrend v10.1 — Auto Fib Targets LONG ONLY (Deduplicated x2)',
      fileType: 'PINE_INDICATOR',
      factorId: 'supertrend_v10_prime',
      status: 'UNIQUE_NEW',
      overlapsWith: 'Upgrades placeholder supertrend-v9-pro in place (pasted twice, deduplicated)',
      empiricalCorr: computePairCorr(sampledVectors['supertrend_v10_prime'], sampledVectors['keltner_position']),
      dailyBarNote: 'Adds 0.5xATR cloud, 3-pillar PRIME (Close>EMA200 + RSI>50 + VolZ>=1σ/BuyPress>10%), 10-bar Sweep, nearest S/R & Auto Fib 1.272/1.618/2.0.',
      recommendation: 'UPGRADED IN PLACE: Replaced supertrend-v9-pro with v10.1 + added ST v10 PRIME factor.',
    },
    {
      fileName: 'Paste: Startup — SS Strat v2.0 (7-Pane + Online IC)',
      title: 'Startup — SS Strat v2.0 (7-Pane + Online IC)',
      fileType: 'PINE_INDICATOR',
      factorId: 'ss_strat_alignment',
      status: 'UNIQUE_NEW',
      overlapsWith: 'Integrates 6 existing Startup panes + adds missing Lattice (8 vs 20..50) & Online-IC engine',
      empiricalCorr: computePairCorr(sampledVectors['ss_strat_alignment'], sampledVectors['startup_lattice_osc']),
      dailyBarNote: 'First causal TypeScript port of Lattice ribbon & rolling Online-IC adaptive weighting across all 7 Startup panes on 1D bars.',
      recommendation: 'KEEP NEW STRATEGY & 2 FACTORS: Added startup-ss-strat-v2 + Lattice + SS Strat Online-IC.',
    },
  ];
}

// ============================================================
// MULTI-INDICATOR COMBINATION TESTER (1D DAILY BARS)
// ============================================================

export const PRESET_INDICATOR_COMBOS: IndicatorCombinationConfig[] = [
  {
    id: 'combo_panic_reversion',
    name: '1D Capitulation Reversal Stack',
    description: 'Combines Williams Vix Fix panic (+), stretched below Rolling 50 VWAP (-), and intrabar buyer absorption (+).',
    mode: 'COMPOSITE_RANK',
    legs: [
      { factorId: 'williams_vix_fix', direction: 1 },
      { factorId: 'vscore_vwap50', direction: -1 },
      { factorId: 'orderflow_bar_imbalance', direction: 1 },
    ],
  },
  {
    id: 'combo_regime_breakout',
    name: 'Regime-Gated Stage 2 Trend',
    description: 'WhaleFusion pTrend regime strength (+) + Weinstein 150D ROC (+) + B-Xtrender Long (+).',
    mode: 'COMPOSITE_RANK',
    legs: [
      { factorId: 'whalefusion_ptrend', direction: 1 },
      { factorId: 'weinstein_stage_roc', direction: 1 },
      { factorId: 'bxtrender_long', direction: 1 },
    ],
  },
  {
    id: 'combo_startup_trifecta',
    name: 'Startup Suite Mean-Reversion Trifecta',
    description: 'Startup Tango slow momentum (+) + Startup Arch Z-Score (-) + Startup Echo fast RSI(7) (-).',
    mode: 'COMPOSITE_RANK',
    legs: [
      { factorId: 'startup_tango_rsi28', direction: 1 },
      { factorId: 'startup_arch_z', direction: -1 },
      { factorId: 'startup_echo_rsi7', direction: -1 },
    ],
  },
  {
    id: 'combo_fib_vol_reclaim',
    name: 'Weekly Fib Golden Zone + Volume Flow',
    description: 'TradingWie Previous-Week Fib discount (-) + Centered MFI acceleration (+) + VZO(14) (-).',
    mode: 'COMPOSITE_RANK',
    legs: [
      { factorId: 'tw_prev_week_fib_pos', direction: -1 },
      { factorId: 'centered_mfi_spread', direction: 1 },
      { factorId: 'vzo14', direction: -1 },
    ],
  },
  {
    id: 'combo_ha_algoalpha',
    name: 'HA Institutional + AlgoAlpha Trail Pullback',
    description: 'Heiken Ashi 5-SMA Ribbon (+) combined with AlgoAlpha HMA Trail pullback (-) & Bravo EMA12 ATR (-).',
    mode: 'COMPOSITE_RANK',
    legs: [
      { factorId: 'ha_ribbon_align', direction: 1 },
      { factorId: 'algoalpha_trail_dist', direction: -1 },
      { factorId: 'startup_bravo_atr_dist', direction: -1 },
    ],
  },
  {
    id: 'combo_ice_v11',
    name: 'ICE v1.1.0 Weighted Regime-Gated',
    description: 'Exact Institutional Confluence Engine stack: MACD Hist (+) + B-Xtrender T3 (+) + AlgoAlpha MFI-HMA (+) + AlphaTrail pullback (-).',
    mode: 'COMPOSITE_RANK',
    legs: [
      { factorId: 'trullas_macd_hist', direction: 1 },
      { factorId: 'bxtrender_short', direction: 1 },
      { factorId: 'algoalpha_mfi_hma', direction: 1 },
      { factorId: 'algoalpha_trail_dist', direction: -1 },
    ],
  },
  {
    id: 'combo_institutional_v6_stack',
    name: 'Institutional v6 Pullback Stack (InsideBar + MCDX + Shannon + pTrend)',
    description: 'Empirically aligned Batch 2 stack: InsideBar HTF (-) + MCDX+ Chip (-) + Shannon YTD AVWAP (-) + WF pTrend (+).',
    mode: 'COMPOSITE_RANK',
    legs: [
      { factorId: 'inside_bar_htf_score', direction: -1 },
      { factorId: 'mcdx_net_chip_edge', direction: -1 },
      { factorId: 'shannon_ytd_avwap_z', direction: -1 },
      { factorId: 'whalefusion_ptrend', direction: 1 },
    ],
  },
  {
    id: 'combo_startup_ss_strat_7p',
    name: 'Startup SS Strat v2.0 (Online-IC + Lattice + Tango)',
    description: 'Tests causal 7-pane Online-IC meta-score (+) paired with Lattice ribbon pullback (-) and macro Tango RSI(28) (+).',
    mode: 'COMPOSITE_RANK',
    legs: [
      { factorId: 'ss_strat_alignment', direction: 1 },
      { factorId: 'startup_lattice_osc', direction: -1 },
      { factorId: 'startup_tango_rsi28', direction: 1 },
    ],
  },
  {
    id: 'combo_supertrend_v10_prime',
    name: 'SuperTrend v10.1 PRIME + Pullback Gate',
    description: 'SuperTrend v10.1 PRIME score (+) + Shannon YTD AVWAP pullback (-) + Williams Vix Fix (+).',
    mode: 'COMPOSITE_RANK',
    legs: [
      { factorId: 'supertrend_v10_prime', direction: 1 },
      { factorId: 'shannon_ytd_avwap_z', direction: -1 },
      { factorId: 'williams_vix_fix', direction: 1 },
    ],
  },
  {
    id: 'combo_strict_panic_gate',
    name: 'Strict Consensus: WVF Panic + Below VWAP + pTrend',
    description: 'AND Gate on 1D bars: fires only when all 3 aligned Z-scores exceed +0.50σ simultaneously.',
    mode: 'STRICT_CONSENSUS',
    consensusZThreshold: 0.5,
    legs: [
      { factorId: 'williams_vix_fix', direction: 1 },
      { factorId: 'vscore_vwap50', direction: -1 },
      { factorId: 'whalefusion_ptrend', direction: 1 },
    ],
  },
];

function evaluateComboFromMaps(
  symbols: string[],
  dateMaps: Map<
    string,
    {
      candles: Candle[];
      idxByDate: Map<string, number>;
      shiftedFactors: Record<string, number[]>;
    }
  >,
  commonDates: string[],
  factorRanking: FactorIcAuditRow[],
  config: IndicatorCombinationConfig,
  horizonDays: number,
  roundTripFrictionPct: number = 0.1
): CombinationTestResult {
  const defById = new Map(UNIFIED_ML4T_FACTORS.map((d) => [d.id, d]));
  const rankById = new Map(factorRanking.map((r) => [r.factorId, r]));
  const legsWithLabels = config.legs.map((l) => ({
    ...l,
    shortLabel: defById.get(l.factorId)?.shortLabel ?? l.factorId,
  }));

  const ics: number[] = [];
  const grossSpreads: number[] = [];
  const netSpreads: number[] = [];
  const consensusTradeReturns: number[] = [];
  const zThresh = config.consensusZThreshold ?? 0.5;

  for (let dIdx = 0; dIdx < commonDates.length - horizonDays; dIdx++) {
    const d = commonDates[dIdx];
    const validEntries: Array<{ sym: string; vals: number[]; fwdRet: number }> = [];

    for (const sym of symbols) {
      const entry = dateMaps.get(sym)!;
      const idx = entry.idxByDate.get(d);
      if (idx === undefined || idx + horizonDays >= entry.candles.length) continue;
      const pNow = entry.candles[idx].close;
      const pFwd = entry.candles[idx + horizonDays].close;
      if (pNow <= 0 || pFwd <= 0) continue;

      const vals: number[] = [];
      let ok = true;
      for (const leg of config.legs) {
        const v = entry.shiftedFactors[leg.factorId]?.[idx];
        if (!Number.isFinite(v)) {
          ok = false;
          break;
        }
        vals.push(v);
      }
      if (!ok) continue;
      validEntries.push({ sym, vals, fwdRet: ((pFwd - pNow) / pNow) * 100 });
    }

    if (validEntries.length < 5) continue;

    const compositeScores = new Array<number>(validEntries.length).fill(0);
    const minAlignedZ = new Array<number>(validEntries.length).fill(Infinity);

    for (let l = 0; l < config.legs.length; l++) {
      const dir = config.legs[l].direction;
      const col = validEntries.map((e) => e.vals[l]);
      const mean = col.reduce((s, v) => s + v, 0) / col.length;
      const variance =
        col.reduce((s, v) => s + (v - mean) * (v - mean), 0) / Math.max(1, col.length - 1);
      const sd = Math.max(1e-6, Math.sqrt(variance));
      for (let i = 0; i < validEntries.length; i++) {
        const alignedZ = clamp(((col[i] - mean) / sd) * dir, -3, 3);
        compositeScores[i] += alignedZ / config.legs.length;
        if (alignedZ < minAlignedZ[i]) minAlignedZ[i] = alignedZ;
      }
    }

    const fwdRets = validEntries.map((e) => e.fwdRet);
    const ic = spearmanRankCorrelation(compositeScores, fwdRets);
    ics.push(ic);

    const paired = compositeScores
      .map((score, i) => ({ score, ret: fwdRets[i] }))
      .sort((a, b) => a.score - b.score);
    const qSize = Math.max(1, Math.floor(paired.length / 5));
    let botSum = 0;
    let topSum = 0;
    for (let k = 0; k < qSize; k++) botSum += paired[k].ret;
    for (let k = paired.length - qSize; k < paired.length; k++) topSum += paired[k].ret;
    const spreadGross = topSum / qSize - botSum / qSize;
    grossSpreads.push(spreadGross);
    netSpreads.push(spreadGross - roundTripFrictionPct);

    if (config.mode === 'STRICT_CONSENSUS') {
      for (let i = 0; i < validEntries.length; i++) {
        if (minAlignedZ[i] >= zThresh) {
          consensusTradeReturns.push(validEntries[i].fwdRet - roundTripFrictionPct);
        }
      }
    } else {
      for (let k = paired.length - qSize; k < paired.length; k++) {
        consensusTradeReturns.push(paired[k].ret - roundTripFrictionPct);
      }
    }
  }

  const nDates = ics.length;
  const meanIc = nDates > 0 ? ics.reduce((s, v) => s + v, 0) / nDates : 0;
  const icVar =
    nDates > 1
      ? ics.reduce((s, v) => s + (v - meanIc) * (v - meanIc), 0) / (nDates - 1)
      : 0;
  const icStd = Math.sqrt(icVar);
  const icTStat = icStd > 1e-9 && nDates > 0 ? meanIc / (icStd / Math.sqrt(nDates)) : 0;

  const q5Gross =
    grossSpreads.length > 0 ? grossSpreads.reduce((s, v) => s + v, 0) / grossSpreads.length : 0;
  const q5Net =
    netSpreads.length > 0 ? netSpreads.reduce((s, v) => s + v, 0) / netSpreads.length : 0;
  const hitRatePct = nDates > 0 ? (ics.filter((v) => v > 0).length / nDates) * 100 : 0;

  const tradeCount = consensusTradeReturns.length;
  const winCount = consensusTradeReturns.filter((r) => r > 0).length;
  const consensusWinRatePct = tradeCount > 0 ? (winCount / tradeCount) * 100 : 0;
  const consensusAvgNet =
    tradeCount > 0 ? consensusTradeReturns.reduce((s, r) => s + r, 0) / tradeCount : 0;

  let grossWinSum = 0;
  let grossLossSum = 0;
  for (const r of consensusTradeReturns) {
    if (r > 0) grossWinSum += r;
    else grossLossSum += Math.abs(r);
  }
  const profitFactor =
    grossLossSum > 1e-6 ? grossWinSum / grossLossSum : grossWinSum > 0 ? 3.0 : 0;

  let bestSingleIc = 0;
  for (const leg of config.legs) {
    const row = rankById.get(leg.factorId);
    const singleIc = Math.abs(row?.byHorizon[horizonDays]?.meanIc ?? row?.bestIc ?? 0);
    if (singleIc > bestSingleIc) bestSingleIc = singleIc;
  }
  const alphaLiftIc = meanIc - bestSingleIc;

  let verdict: CombinationTestResult['verdict'] = 'WEAK';
  if (meanIc >= 0.02 && icTStat >= 2.0 && alphaLiftIc > 0.002) verdict = 'SYNERGISTIC';
  else if (meanIc >= 0.015 && icTStat >= 2.0) verdict = 'POSITIVE_EDGE';
  else if (meanIc > 0 && icTStat >= 1.2) verdict = 'NO_LIFT';

  return {
    id: config.id,
    name: config.name,
    description: config.description,
    mode: config.mode,
    legs: legsWithLabels,
    horizonDays,
    meanIc: Number(meanIc.toFixed(4)),
    icTStat: Number(icTStat.toFixed(2)),
    q5MinusQ1GrossPct: Number(q5Gross.toFixed(3)),
    q5MinusQ1NetPct: Number(q5Net.toFixed(3)),
    hitRatePct: Number(hitRatePct.toFixed(1)),
    consensusTradesCount: tradeCount,
    consensusWinRatePct: Number(consensusWinRatePct.toFixed(1)),
    consensusAvgNetReturnPct: Number(consensusAvgNet.toFixed(3)),
    profitFactor: Number(Math.min(9.99, profitFactor).toFixed(2)),
    bestSingleComponentIc: Number(bestSingleIc.toFixed(4)),
    alphaLiftIc: Number(alphaLiftIc.toFixed(4)),
    verdict,
  };
}

function runPresetCombinations(
  symbols: string[],
  dateMaps: Map<
    string,
    {
      candles: Candle[];
      idxByDate: Map<string, number>;
      shiftedFactors: Record<string, number[]>;
    }
  >,
  commonDates: string[],
  factorRanking: FactorIcAuditRow[],
  horizonDays: number
): CombinationTestResult[] {
  return PRESET_INDICATOR_COMBOS.map((cfg) =>
    evaluateComboFromMaps(symbols, dateMaps, commonDates, factorRanking, cfg, horizonDays)
  ).sort((a, b) => b.icTStat - a.icTStat);
}

/**
 * Public entry point for testing any custom user-selected 2-4 indicator combination on 1D bars.
 */
export function evaluateIndicatorCombination(
  candlesBySymbol: Record<string, Candle[]>,
  config: IndicatorCombinationConfig,
  options?: {
    horizonDays?: number;
    shiftBars?: number;
    factorRanking?: FactorIcAuditRow[];
  }
): CombinationTestResult {
  const horizonDays = options?.horizonDays ?? 5;
  const shiftBars = options?.shiftBars ?? 1;

  const symbols = Object.keys(candlesBySymbol).filter(
    (s) => Array.isArray(candlesBySymbol[s]) && candlesBySymbol[s].length >= 80
  );

  const dateMaps = new Map<
    string,
    {
      candles: Candle[];
      idxByDate: Map<string, number>;
      shiftedFactors: Record<string, number[]>;
    }
  >();
  const dateCounts = new Map<string, number>();

  for (const sym of symbols) {
    const candles = candlesBySymbol[sym];
    const rawFactors = extractFactorSeriesMap(candles);
    const shiftedFactors: Record<string, number[]> = {};
    for (const leg of config.legs) {
      if (rawFactors[leg.factorId]) {
        shiftedFactors[leg.factorId] = applyCausalShift(rawFactors[leg.factorId], shiftBars);
      }
    }
    const idxByDate = new Map<string, number>();
    candles.forEach((c, i) => {
      if (c.dateStr) {
        idxByDate.set(c.dateStr, i);
        dateCounts.set(c.dateStr, (dateCounts.get(c.dateStr) || 0) + 1);
      }
    });
    dateMaps.set(sym, { candles, idxByDate, shiftedFactors });
  }

  const minSymbolsPerDate = Math.max(4, Math.floor(symbols.length * 0.6));
  const commonDates = Array.from(dateCounts.entries())
    .filter(([, cnt]) => cnt >= minSymbolsPerDate)
    .map(([d]) => d)
    .sort();

  return evaluateComboFromMaps(
    symbols,
    dateMaps,
    commonDates,
    options?.factorRanking ?? [],
    config,
    horizonDays
  );
}

/**
 * Generates an updated Python Alphalens + ADF + Triple-Barrier research script matching StageLedger's exact ported indicators.
 */
export function buildSyncedPythonAlphalensScript(topFactorIds: string[]): string {
  const chosen = topFactorIds.length > 0 ? topFactorIds.slice(0, 6) : ['whalefusion_ptrend', 'williams_vix_fix', 'algoalpha_trail_dist', 'vzo14', 'vscore_vwap50'];
  const fingerprint = computeFeatureConfigFingerprint();
  return `# StageLedger x ML4T — Synced Alphalens + ADF + Triple-Barrier Research Script (1D Bars)
# CONFIG_FINGERPRINT: ${fingerprint}
# Pre-filtered top factors from StageLedger Factor IC Lab: ${chosen.join(', ')}
import warnings
warnings.filterwarnings('ignore')

import numpy as np
import pandas as pd
import yfinance as yf
import alphalens as al
from alphalens.utils import get_clean_factor_and_forward_returns

CONFIG_FINGERPRINT = '${fingerprint}'
UNIVERSE = ['AAPL','MSFT','GOOGL','AMZN','META','NVDA','TSLA','AMD','JPM','BAC','UNH','WMT','XOM','HD','COST','AVGO','LLY','ORCL','CRM','PG']

def ema(s, span):
    return s.ewm(span=span, adjust=False).mean()

def rsi(s, length=14):
    d = s.diff()
    gain = d.clip(lower=0).ewm(alpha=1/length, adjust=False).mean()
    loss = (-d.clip(upper=0)).ewm(alpha=1/length, adjust=False).mean()
    rs = gain / loss.replace(0, np.nan)
    return 100 - 100 / (1 + rs)

def atr(df, length=14):
    prev_c = df['Close'].shift(1)
    tr = pd.concat([
        df['High'] - df['Low'],
        (df['High'] - prev_c).abs(),
        (df['Low'] - prev_c).abs(),
    ], axis=1).max(axis=1)
    return tr.ewm(alpha=1/length, adjust=False).mean()

def b_xtrender_short(df):
    # Exact Puppytherapy formula: RSI(EMA(5) - EMA(20), 15) - 50 (fixes broken stub in prototype)
    return rsi(ema(df['Close'], 5) - ema(df['Close'], 20), 15) - 50

def williams_vix_fix(df, pd_len=22):
    hc = df['Close'].rolling(pd_len).max()
    return ((hc - df['Low']) / hc) * 100

def vscore_vwap(df, length=50):
    tp = (df['High'] + df['Low'] + df['Close']) / 3
    vwap = (tp * df['Volume']).rolling(length).sum() / df['Volume'].rolling(length).sum()
    return (df['Close'] - vwap) / df['Close'].rolling(length).std()

def startup_echo_rsi7(df):
    return rsi(df['Close'], 7).rolling(2).mean() - 50

def startup_tango_rsi28(df):
    return rsi(df['Close'], 28).rolling(10).mean() - 50

def triple_barrier_labels(df, up_mult=2.0, dn_mult=1.0, max_bars=15, friction_bps=10.0):
    # Matches StageLedger X1_fixed_v1: SL checked BEFORE TP on same bar, 10 bps cost
    a = atr(df, 14).values
    c = df['Close'].values
    h = df['High'].values
    l = df['Low'].values
    n = len(df)
    r_mult = np.zeros(n)
    for i in range(20, n - 1):
        if not np.isfinite(a[i]) or a[i] <= 1e-6 or c[i] <= 0:
            continue
        unit_risk = dn_mult * a[i]
        upper = c[i] + up_mult * a[i]
        lower = c[i] - unit_risk
        fric_r = (c[i] * (friction_bps / 10000.0)) / unit_risk
        end = min(n - 1, i + max_bars)
        hit = False
        for j in range(i + 1, end + 1):
            if l[j] <= lower:
                r_mult[i] = -1.0 - fric_r
                hit = True
                break
            if h[j] >= upper:
                r_mult[i] = (up_mult / dn_mult) - fric_r
                hit = True
                break
        if not hit:
            r_mult[i] = np.clip((c[end] - c[i]) / unit_risk - fric_r, -3.0, 3.0)
    return pd.Series(r_mult, index=df.index, name='tb_r_multiple')

def check_adf_stationarity(s):
    try:
        from statsmodels.tsa.stattools import adfuller
        stat, pval, *_ = adfuller(s.dropna().values, maxlag=1, regression='c')
        return round(float(stat), 2), bool(stat <= -2.86)
    except Exception:
        return None, None

FACTORS = {
    'williams_vix_fix': williams_vix_fix,
    'vscore_vwap50': vscore_vwap,
    'b_xtrender_short': b_xtrender_short,
    'startup_echo_rsi7': startup_echo_rsi7,
    'startup_tango_rsi28': startup_tango_rsi28,
}

if __name__ == '__main__':
    print('StageLedger Spec Fingerprint:', CONFIG_FINGERPRINT)
    raw = yf.download(UNIVERSE, start='2016-01-01', interval='1d', auto_adjust=True, group_by='ticker', progress=False)
    data = {t: raw[t].dropna() for t in UNIVERSE if len(raw[t].dropna()) > 420}
    prices = pd.DataFrame({t: d['Close'] for t, d in data.items()})
    prices.index.name = 'date'
    for name, fn in FACTORS.items():
        adf_t, is_stat = check_adf_stationarity(fn(data['AAPL']))
        panel = pd.concat([fn(d).shift(1).rename('factor').to_frame().assign(asset=t) for t, d in data.items()])
        panel = panel.reset_index().set_index(['Date', 'asset'])['factor'].sort_index().dropna()
        clean = get_clean_factor_and_forward_returns(panel, prices, quantiles=5, periods=(1, 5, 10, 30, 50, 100, 120, 200, 360), max_loss=0.5)
        ic = al.performance.factor_information_coefficient(clean)
        print(name, f'ADF t={adf_t} stat={is_stat}', 'Mean IC:', ic.mean().to_dict())
`;
}
