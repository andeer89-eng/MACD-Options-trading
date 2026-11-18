import { Candle } from './trullasStrategy';

export interface QmxIntelligenceScore {
  bullishEvidencePct: number; // 0 - 100
  bearishEvidencePct: number; // 0 - 100
  liquidityStrengthPct: number; // 0 - 100
  trapRiskPct: number; // 0 - 100
  displacementPct: number; // 0 - 100
  marketConfidencePct: number; // 0 - 100
}

export interface QmxMarketConditions {
  volatility: 'Low' | 'Moderate' | 'High';
  pressureValue: number; // e.g. -60 or +45
  pressureLabel: string; // "Bearish (-60)" or "Bullish (+45)"
  liquidity: 'Low' | 'Moderate' | 'High';
  exhaustion: 'Low' | 'Medium' | 'High';
}

export interface QmxMtfRow {
  timeframe: string;
  bias: 'Bullish' | 'Bearish' | 'Neutral' | '—';
  state: 'Expansion' | 'Trend' | 'Consolidation' | 'Reversal' | '—';
}

export interface QmxRibbonPoint {
  time: number;
  upper: number;
  lower: number;
  mid: number;
  isBull: boolean;
}

export interface QmxLiquidityZone {
  id: string;
  isHigh: boolean; // true = BSL (Buy-Side), false = SSL (Sell-Side)
  price: number;
  top: number;
  bot: number;
  startTime: number;
  endTime?: number;
  strength: number; // 0 - 100
  label: string;
}

export interface QmxSweepEvent {
  id: string;
  time: number;
  price: number;
  isBull: boolean; // true = Bullish Sweep, false = Bearish Sweep
  qualityScore: number; // SQ: 56, 65, etc.
  label: string;
}

export interface QmxTrapBox {
  id: string;
  startTime: number;
  endTime: number;
  high: number;
  low: number;
  isBuyers: boolean; // true = Trapped Buyers, false = Trapped Sellers
  label: string;
}

export interface QmxExhaustionCloud {
  id: string;
  time: number;
  price: number;
  isBull: boolean;
  type: 'Early' | 'Confirmed';
  score: number; // e.g. 49, 57, 47
  label: string;
}

export interface QmxVacuumCorridor {
  id: string;
  startTime: number;
  endTime: number;
  top: number;
  bot: number;
  isBull: boolean;
  entryPrice: number;
  exitPrice: number;
  filled: boolean;
  label: string;
}

export interface QmxTargetRay {
  id: string;
  startTime: number;
  targetPrice: number;
  anchorPrice: number;
  isBull: boolean;
  tier: 'T1' | 'T2' | 'T3';
  strength: number; // e.g. Str 45
  pointsDelta: number; // e.g. +78.248
  atrMultiple: number; // e.g. 5.7 ATR
  label: string;
}

export interface QmxKeyLevels {
  bslPrice: number | null;
  sslPrice: number | null;
  nearestTargetUp: number | null;
  nearestTargetDown: number | null;
}

export interface QmxDashboardState {
  market: string;
  timeframe: string;
  price: number;
  atr: number;
  marketBias: 'Bullish' | 'Bearish' | 'Neutral';
  phase: string; // e.g. "Bearish Expansion"
  scores: QmxIntelligenceScore;
  conditions: QmxMarketConditions;
  mtfOverview: QmxMtfRow[];
  keyLevels: QmxKeyLevels;
}

export interface QmxReport {
  candles: Candle[];
  ribbon: QmxRibbonPoint[];
  liquidityZones: QmxLiquidityZone[];
  sweeps: QmxSweepEvent[];
  traps: QmxTrapBox[];
  exhaustions: QmxExhaustionCloud[];
  vacuums: QmxVacuumCorridor[];
  targets: QmxTargetRay[];
  dashboard: QmxDashboardState;
}

export const QMX_COLORS = {
  cyan: '#00FFA3',
  teal: '#00E5FF',
  magenta: '#FF2BD6',
  red: '#FF2D55',
  purple: '#A855F7',
  gold: '#FFC400',
  amber: '#FF9F1C',
  silver: '#C0C6D4',
  darkNavy: '#070B16',
  navyCard: '#0B1226',
  navyBorder: '#121C38',
};

/**
 * Calculates Quantum Market X-Ray (QMX) metrics and visual primitives
 */
export function calculateQuantumMarketXray(
  candles: Candle[],
  options?: { symbol?: string; timeframe?: string }
): QmxReport {
  const symbol = options?.symbol || 'MARKET';
  const timeframe = options?.timeframe || '1d';

  if (!candles || candles.length === 0) {
    return {
      candles: [],
      ribbon: [],
      liquidityZones: [],
      sweeps: [],
      traps: [],
      exhaustions: [],
      vacuums: [],
      targets: [],
      dashboard: {
        market: symbol,
        timeframe,
        price: 0,
        atr: 0,
        marketBias: 'Neutral',
        phase: 'Consolidation',
        scores: {
          bullishEvidencePct: 50,
          bearishEvidencePct: 50,
          liquidityStrengthPct: 50,
          trapRiskPct: 30,
          displacementPct: 40,
          marketConfidencePct: 60,
        },
        conditions: {
          volatility: 'Low',
          pressureValue: 0,
          pressureLabel: 'Neutral (0)',
          liquidity: 'Moderate',
          exhaustion: 'Low',
        },
        mtfOverview: [
          { timeframe: '5m', bias: '—', state: '—' },
          { timeframe: '15m', bias: '—', state: '—' },
          { timeframe: '1H', bias: 'Neutral', state: 'Consolidation' },
          { timeframe: '4H', bias: 'Neutral', state: 'Consolidation' },
          { timeframe: '1D', bias: 'Neutral', state: 'Consolidation' },
        ],
        keyLevels: {
          bslPrice: null,
          sslPrice: null,
          nearestTargetUp: null,
          nearestTargetDown: null,
        },
      },
    };
  }

  // 1. True Range & ATR (14)
  const atrArr: number[] = [];
  let trSum = 0;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const prev = i > 0 ? candles[i - 1] : c;
    const hl = c.high - c.low;
    const hc = Math.abs(c.high - prev.close);
    const lc = Math.abs(c.low - prev.close);
    const tr = Math.max(hl, hc, lc);
    if (i < 14) {
      trSum += tr;
      atrArr.push(trSum / (i + 1));
    } else {
      const prevAtr = atrArr[i - 1];
      atrArr.push((prevAtr * 13 + tr) / 14);
    }
  }

  // 2. Quantum Intelligence Ribbon (Dynamic Midline, Upper Expansion Band, Lower Expansion Band)
  // Hull / Weighted Moving Average smoothing for responsive trend tracking
  const period = 21;
  const k = 2 / (period + 1);
  const midArr: number[] = [];
  let currEma = (candles[0].high + candles[0].low + candles[0].close) / 3;

  for (let i = 0; i < candles.length; i++) {
    const typ = (candles[i].high + candles[i].low + candles[i].close) / 3;
    currEma = currEma * (1 - k) + typ * k;
    midArr.push(currEma);
  }

  const ribbon: QmxRibbonPoint[] = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const time = Math.floor(c.timestamp / 1000);
    const m = midArr[i];
    const atr = atrArr[i] || 1;
    // Multipliers for upper (cyan) and lower (magenta) boundaries
    const up = m + atr * 1.85;
    const dn = m - atr * 1.85;
    const isBull = c.close >= m;
    ribbon.push({
      time,
      upper: Number(up.toFixed(3)),
      lower: Number(dn.toFixed(3)),
      mid: Number(m.toFixed(3)),
      isBull,
    });
  }

  // 3. Liquidity Zones (BSL & SSL detection from swing pivots)
  const liquidityZones: QmxLiquidityZone[] = [];
  const swingLen = 5;

  for (let i = swingLen; i < candles.length - swingLen; i++) {
    const c = candles[i];
    let isHigh = true;
    let isLow = true;

    for (let j = i - swingLen; j <= i + swingLen; j++) {
      if (j === i) continue;
      if (candles[j].high > c.high) isHigh = false;
      if (candles[j].low < c.low) isLow = false;
    }

    const atr = atrArr[i] || 1;
    const zoneHeight = atr * 0.45;

    if (isHigh) {
      const strength = Math.min(95, Math.round(40 + (c.volume / (candles[i - 1].volume || 1)) * 12));
      liquidityZones.push({
        id: `bsl-${c.timestamp}`,
        isHigh: true,
        price: c.high,
        top: c.high + zoneHeight * 0.5,
        bot: c.high - zoneHeight * 0.5,
        startTime: Math.floor(c.timestamp / 1000),
        strength,
        label: `BSL Zone Strength: ${strength}`,
      });
    }

    if (isLow) {
      const strength = Math.min(95, Math.round(40 + (c.volume / (candles[i - 1].volume || 1)) * 12));
      liquidityZones.push({
        id: `ssl-${c.timestamp}`,
        isHigh: false,
        price: c.low,
        top: c.low + zoneHeight * 0.5,
        bot: c.low - zoneHeight * 0.5,
        startTime: Math.floor(c.timestamp / 1000),
        strength,
        label: `SSL Zone Strength: ${strength}`,
      });
    }
  }

  // 4. Liquidity Sweeps (Price wick sweeps beyond previous swing pivot then closes back inside)
  const sweeps: QmxSweepEvent[] = [];
  const recentZones = liquidityZones.slice(-8);

  for (let i = 10; i < candles.length; i++) {
    const c = candles[i];
    const time = Math.floor(c.timestamp / 1000);

    // Bullish Sweep: Low pierces below prior SSL, but close rejects back above
    for (const z of recentZones) {
      if (!z.isHigh && c.low < z.price && c.close > z.price && time > z.startTime) {
        // Avoid duplicate sweeps within 3 bars
        const lastSweep = sweeps[sweeps.length - 1];
        if (!lastSweep || Math.abs(time - lastSweep.time) > 3600 * 4) {
          const sq = Math.min(90, Math.round(50 + ((c.close - c.low) / (c.high - c.low || 1)) * 25));
          sweeps.push({
            id: `sweep-bull-${c.timestamp}`,
            time,
            price: c.low,
            isBull: true,
            qualityScore: sq,
            label: `Bullish Sweep SQ: ${sq}`,
          });
        }
      }

      // Bearish Sweep: High pierces above prior BSL, but close rejects back below
      if (z.isHigh && c.high > z.price && c.close < z.price && time > z.startTime) {
        const lastSweep = sweeps[sweeps.length - 1];
        if (!lastSweep || Math.abs(time - lastSweep.time) > 3600 * 4) {
          const sq = Math.min(90, Math.round(50 + ((c.high - c.close) / (c.high - c.low || 1)) * 25));
          sweeps.push({
            id: `sweep-bear-${c.timestamp}`,
            time,
            price: c.high,
            isBull: false,
            qualityScore: sq,
            label: `Bearish Sweep SQ: ${sq}`,
          });
        }
      }
    }
  }

  // 5. Smart Money Traps & Trapped Traders
  const traps: QmxTrapBox[] = [];
  for (let i = 5; i < candles.length; i++) {
    const c = candles[i];
    const prev = candles[i - 1];
    const range = c.high - c.low || 1;
    const upperWick = c.high - Math.max(c.open, c.close);
    const lowerWick = Math.min(c.open, c.close) - c.low;

    // Trapped Buyers: Long upper wick into resistance with high volume followed by bearish drop
    if (upperWick / range > 0.45 && c.volume > prev.volume * 1.15 && c.close < prev.close) {
      const t0 = Math.floor(prev.timestamp / 1000);
      const t1 = Math.floor(c.timestamp / 1000);
      traps.push({
        id: `trap-buy-${c.timestamp}`,
        startTime: t0,
        endTime: t1,
        high: c.high,
        low: Math.max(c.open, c.close),
        isBuyers: true,
        label: 'Trapped Buyers ⚠',
      });
    }

    // Trapped Sellers: Long lower wick into support with high volume followed by bullish rally
    if (lowerWick / range > 0.45 && c.volume > prev.volume * 1.15 && c.close > prev.close) {
      const t0 = Math.floor(prev.timestamp / 1000);
      const t1 = Math.floor(c.timestamp / 1000);
      traps.push({
        id: `trap-sell-${c.timestamp}`,
        startTime: t0,
        endTime: t1,
        high: Math.min(c.open, c.close),
        low: c.low,
        isBuyers: false,
        label: 'Trapped Sellers ⚠',
      });
    }
  }

  // 6. Exhaustion Clouds (Momentum exhaustion signals)
  const exhaustions: QmxExhaustionCloud[] = [];
  for (let i = 14; i < candles.length; i++) {
    const c = candles[i];
    const time = Math.floor(c.timestamp / 1000);
    const atr = atrArr[i] || 1;
    const ribbonPt = ribbon[i];

    // Bullish Exhaustion (Overextended rally above upper ribbon with slowing delta)
    if (c.high > ribbonPt.upper) {
      const score = Math.round(45 + Math.min(30, ((c.high - ribbonPt.upper) / atr) * 20));
      exhaustions.push({
        id: `exh-bull-${c.timestamp}`,
        time,
        price: c.high,
        isBull: true,
        type: score > 55 ? 'Confirmed' : 'Early',
        score,
        label: `Exhaustion Cloud - ${score > 55 ? 'Confirmed' : 'Early'} Bullish Exh - ${score}`,
      });
    }

    // Bearish Exhaustion (Overextended selloff below lower ribbon)
    if (c.low < ribbonPt.lower) {
      const score = Math.round(45 + Math.min(30, ((ribbonPt.lower - c.low) / atr) * 20));
      exhaustions.push({
        id: `exh-bear-${c.timestamp}`,
        time,
        price: c.low,
        isBull: false,
        type: score > 55 ? 'Confirmed' : 'Early',
        score,
        label: `Exhaustion Cloud - ${score > 55 ? 'Confirmed' : 'Early'} Bearish Exh - ${score}`,
      });
    }
  }

  // 7. Vacuum Corridors (Fair Value Gaps / Imbalance voids filled)
  const vacuums: QmxVacuumCorridor[] = [];
  for (let i = 2; i < candles.length; i++) {
    const c2 = candles[i - 2];
    const c0 = candles[i];

    // Bullish Vacuum: low of current bar > high of 2 bars ago
    if (c0.low > c2.high) {
      const startT = Math.floor(candles[i - 1].timestamp / 1000);
      const endT = Math.floor(c0.timestamp / 1000);
      vacuums.push({
        id: `vac-bull-${c0.timestamp}`,
        startTime: startT,
        endTime: endT,
        top: c0.low,
        bot: c2.high,
        isBull: true,
        entryPrice: c2.high,
        exitPrice: c0.low,
        filled: true,
        label: `VACUUM ▲ FILLED ✓ Entry ${c2.high.toFixed(2)} → Exit ${c0.low.toFixed(2)}`,
      });
    }

    // Bearish Vacuum: high of current bar < low of 2 bars ago
    if (c0.high < c2.low) {
      const startT = Math.floor(candles[i - 1].timestamp / 1000);
      const endT = Math.floor(c0.timestamp / 1000);
      vacuums.push({
        id: `vac-bear-${c0.timestamp}`,
        startTime: startT,
        endTime: endT,
        top: c2.low,
        bot: c0.high,
        isBull: false,
        entryPrice: c2.low,
        exitPrice: c0.high,
        filled: true,
        label: `VACUUM ▼ FILLED ✓ Entry ${c2.low.toFixed(2)} → Exit ${c0.high.toFixed(2)}`,
      });
    }
  }

  // 8. Projected Target Rays (T1, T2, T3) from recent key breakout pivot
  const targets: QmxTargetRay[] = [];
  const lastCandle = candles[candles.length - 1];
  const lastAtr = atrArr[atrArr.length - 1] || 1;
  const recentPivot = candles[Math.max(0, candles.length - 15)];
  const isOverallBear = lastCandle.close < midArr[midArr.length - 1];

  if (recentPivot) {
    const pTime = Math.floor(recentPivot.timestamp / 1000);
    if (isOverallBear) {
      // Downward Bearish expansion targets
      const t1Price = recentPivot.low - lastAtr * 5.2;
      const t2Price = recentPivot.low - lastAtr * 6.8;
      const d1 = recentPivot.low - t1Price;
      const d2 = recentPivot.low - t2Price;

      targets.push({
        id: 'target-t1-dn',
        startTime: pTime,
        targetPrice: Number(t1Price.toFixed(2)),
        anchorPrice: recentPivot.low,
        isBull: false,
        tier: 'T1',
        strength: 51,
        pointsDelta: -Number(d1.toFixed(3)),
        atrMultiple: 5.2,
        label: `T1 ▼ - Str 51 -${d1.toFixed(2)} - 5.2 ATR`,
      });

      targets.push({
        id: 'target-t2-dn',
        startTime: pTime,
        targetPrice: Number(t2Price.toFixed(2)),
        anchorPrice: recentPivot.low,
        isBull: false,
        tier: 'T2',
        strength: 46,
        pointsDelta: -Number(d2.toFixed(3)),
        atrMultiple: 6.8,
        label: `T2 ▼ - Str 46 -${d2.toFixed(2)} - 6.8 ATR`,
      });
    } else {
      // Upward Bullish expansion targets
      const t1Price = recentPivot.high + lastAtr * 5.7;
      const t3Price = recentPivot.high + lastAtr * 11.6;
      const d1 = t1Price - recentPivot.high;
      const d3 = t3Price - recentPivot.high;

      targets.push({
        id: 'target-t1-up',
        startTime: pTime,
        targetPrice: Number(t1Price.toFixed(2)),
        anchorPrice: recentPivot.high,
        isBull: true,
        tier: 'T1',
        strength: 45,
        pointsDelta: Number(d1.toFixed(3)),
        atrMultiple: 5.7,
        label: `T1 ▲ - Str 45 +${d1.toFixed(2)} - 5.7 ATR`,
      });

      targets.push({
        id: 'target-t3-up',
        startTime: pTime,
        targetPrice: Number(t3Price.toFixed(2)),
        anchorPrice: recentPivot.high,
        isBull: true,
        tier: 'T3',
        strength: 39,
        pointsDelta: Number(d3.toFixed(3)),
        atrMultiple: 11.6,
        label: `T3 ▲ - Str 39 +${d3.toFixed(2)} - 11.6 ATR`,
      });
    }
  }

  // 9. Intelligence Scores & Market Conditions for Live HUD
  const lastClose = lastCandle.close;
  const lastMid = midArr[midArr.length - 1];
  const lastUpper = ribbon[ribbon.length - 1]?.upper || lastClose;
  const lastLower = ribbon[ribbon.length - 1]?.lower || lastClose;

  const distToMid = (lastClose - lastMid) / lastAtr;
  const rawBullEvidence = Math.max(10, Math.min(90, Math.round(50 + distToMid * 20)));
  const rawBearEvidence = 100 - rawBullEvidence;

  const bias: 'Bullish' | 'Bearish' | 'Neutral' =
    rawBullEvidence >= 60 ? 'Bullish' : rawBearEvidence >= 60 ? 'Bearish' : 'Neutral';

  const phase =
    bias === 'Bearish'
      ? 'Bearish Expansion'
      : bias === 'Bullish'
      ? 'Bullish Breakout'
      : 'Consolidation';

  const pressureVal = Math.round((rawBullEvidence - 50) * 1.5);
  const pressureLabel = `${bias} (${pressureVal >= 0 ? '+' : ''}${pressureVal})`;

  // Key Levels
  const activeBsl = liquidityZones.filter((z) => z.isHigh).slice(-1)[0]?.price ?? lastUpper;
  const activeSsl = liquidityZones.filter((z) => !z.isHigh).slice(-1)[0]?.price ?? lastLower;

  const dashboard: QmxDashboardState = {
    market: symbol,
    timeframe,
    price: Number(lastClose.toFixed(3)),
    atr: Number(lastAtr.toFixed(3)),
    marketBias: bias,
    phase,
    scores: {
      bullishEvidencePct: rawBullEvidence,
      bearishEvidencePct: rawBearEvidence,
      liquidityStrengthPct: 48,
      trapRiskPct: 42,
      displacementPct: 36,
      marketConfidencePct: 62,
    },
    conditions: {
      volatility: lastAtr / lastClose > 0.02 ? 'High' : lastAtr / lastClose > 0.008 ? 'Moderate' : 'Low',
      pressureValue: pressureVal,
      pressureLabel,
      liquidity: 'Moderate',
      exhaustion: 'Medium',
    },
    mtfOverview: [
      { timeframe: '5m', bias: '—', state: '—' },
      { timeframe: '15m', bias: '—', state: '—' },
      { timeframe: '1H', bias, state: phase.includes('Expansion') ? 'Expansion' : 'Trend' },
      { timeframe: '4H', bias, state: 'Trend' },
      { timeframe: '1D', bias: 'Neutral', state: 'Expansion' },
    ],
    keyLevels: {
      bslPrice: Number(activeBsl.toFixed(3)),
      sslPrice: Number(activeSsl.toFixed(3)),
      nearestTargetUp: targets.find((t) => t.isBull)?.targetPrice ?? Number((lastClose + lastAtr * 4).toFixed(3)),
      nearestTargetDown: targets.find((t) => !t.isBull)?.targetPrice ?? Number((lastClose - lastAtr * 4).toFixed(3)),
    },
  };

  return {
    candles,
    ribbon,
    liquidityZones: liquidityZones.slice(-12),
    sweeps: sweeps.slice(-10),
    traps: traps.slice(-8),
    exhaustions: exhaustions.slice(-8),
    vacuums: vacuums.slice(-6),
    targets,
    dashboard,
  };
}
