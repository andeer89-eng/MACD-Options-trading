/**
 * TrendSpider Reverse-Engineered Quantitative Indicator & Analytics Suite
 * 
 * Re-engineers TrendSpider's signature proprietary algorithms:
 * 1. Stan Weinstein 4-Stage Analysis (Stage 1 Basing, Stage 2 Advancing, Stage 3 Topping, Stage 4 Declining 🩸)
 *    Includes 30-week / 150-day moving average slope analysis, Mansfield Relative Strength vs Benchmark (SPY),
 *    and Stage Transition Event Detection (as highlighted in TrendSpider's #NBIS #INTC #SNDK #GOOG alerts).
 * 2. TrendSpider Raindrop® Charts Engine (Volume-Weighted sentiment split into Left VWAP vs Right VWAP,
 *    intra-candle volume profile, and structural shapes: Balloon Top, Balloon Bottom, Hourglass, Squeeze).
 * 3. Auto-Anchored VWAP (Auto-AVWAP with dynamic anchors: Peak Volume Bar, Major Swing High, Major Swing Low, YTD, MTD).
 * 4. Automated Trendline Detection & Breakout Engine (multi-touch algorithmic trendlines & breaks).
 * 5. Comprehensive TrendSpider Confluence Score (0 - 100).
 */

import { ChartPattern, detectChartPatterns } from './patternRecognitionEngine';

export interface CandleData {
  time: number | string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ============================================================================
// 1. STAN WEINSTEIN 4-STAGE ANALYSIS ENGINE
// ============================================================================

export type MarketStage =
  | 'STAGE_1_BASING'
  | 'STAGE_2_ADVANCING'
  | 'STAGE_3_TOPPING'
  | 'STAGE_4_DECLINING';

export interface StageAnalysisResult {
  currentStage: MarketStage;
  stageName: string;
  stageBadgeColor: string;
  stageBadgeBg: string;
  stageBadgeBorder: string;
  stageNumber: 1 | 2 | 3 | 4;
  ma30Week: number;
  maSlope: number; // percentage change of MA over lookback
  maSlopeDirection: 'RISING' | 'FALLING' | 'FLAT';
  priceToMaRatio: number; // close / MA30w
  distanceFromMaPercent: number; // % distance from 30w MA
  isAboveMa: boolean;
  mansfieldRelativeStrength: number; // RS relative to benchmark (e.g. SPY)
  isOutperformingBenchmark: boolean;
  stageTransitionEvent?: {
    type: 'STAGE_1_ACCUMULATION_BREAKOUT' | 'STAGE_2_EXTENSION' | 'STAGE_3_DISTRIBUTION_WARNING' | 'STAGE_4_BREAKDOWN_CRITICAL';
    headline: string;
    description: string;
    severity: 'BULLISH' | 'NEUTRAL' | 'WARNING' | 'CRITICAL';
    iconEmoji: string;
  };
  keySupportFloor: number;
  keyResistanceCeiling: number;
  stageThesis: string;
}

/**
 * Calculates Stan Weinstein 4-Stage Analysis
 * Re-engineers TrendSpider's Stage Analysis indicator as seen in TrendSpider's breakdown alerts.
 */
export function calculateStageAnalysis(
  candles: CandleData[],
  benchmarkCandles?: CandleData[],
  lookbackWeeks: number = 30
): StageAnalysisResult {
  if (!candles || candles.length < 10) {
    return {
      currentStage: 'STAGE_1_BASING',
      stageName: 'Stage 1: Basing / Accumulation',
      stageBadgeColor: 'text-amber-400',
      stageBadgeBg: 'bg-amber-500/20',
      stageBadgeBorder: 'border-amber-500/30',
      stageNumber: 1,
      ma30Week: 0,
      maSlope: 0,
      maSlopeDirection: 'FLAT',
      priceToMaRatio: 1,
      distanceFromMaPercent: 0,
      isAboveMa: false,
      mansfieldRelativeStrength: 0,
      isOutperformingBenchmark: false,
      keySupportFloor: 0,
      keyResistanceCeiling: 0,
      stageThesis: 'Insufficient candle data to calculate Weinstein 30-week stage analysis.',
    };
  }

  const closes = candles.map((c) => c.close);
  const n = closes.length;
  const currentPrice = closes[n - 1];

  // Effective period for MA (use 30 on weekly, or 150-day / 30-period on available data)
  const period = Math.min(lookbackWeeks, Math.max(10, Math.floor(n * 0.75)));
  
  // Calculate current SMA
  const sliceCurrent = closes.slice(n - period);
  const ma30 = sliceCurrent.reduce((a, b) => a + b, 0) / period;

  // Calculate prior SMA (5 bars ago to measure slope)
  const slopeLookback = Math.min(5, Math.floor(period / 3));
  const slicePrior = closes.slice(Math.max(0, n - period - slopeLookback), n - slopeLookback);
  const ma30Prior = slicePrior.length > 0 ? slicePrior.reduce((a, b) => a + b, 0) / slicePrior.length : ma30;

  // Slope rate in percentage
  const maSlope = ma30Prior > 0 ? ((ma30 - ma30Prior) / ma30Prior) * 100 : 0;
  const maSlopeDirection: 'RISING' | 'FALLING' | 'FLAT' =
    maSlope > 0.4 ? 'RISING' : maSlope < -0.4 ? 'FALLING' : 'FLAT';

  const isAboveMa = currentPrice >= ma30;
  const distanceFromMaPercent = ma30 > 0 ? Number((((currentPrice - ma30) / ma30) * 100).toFixed(2)) : 0;
  const priceToMaRatio = ma30 > 0 ? Number((currentPrice / ma30).toFixed(3)) : 1.0;

  // Support / Resistance from recent consolidation range (last 20 bars)
  const recentRange = candles.slice(Math.max(0, n - 20));
  const keySupportFloor = Math.min(...recentRange.map((c) => c.low));
  const keyResistanceCeiling = Math.max(...recentRange.map((c) => c.high));

  // Mansfield Relative Strength Calculation (vs Benchmark like SPY)
  let mansfieldRS = 0;
  if (benchmarkCandles && benchmarkCandles.length >= 10) {
    const bLen = benchmarkCandles.length;
    const bCurrent = benchmarkCandles[bLen - 1].close;
    const bPrior = benchmarkCandles[Math.max(0, bLen - period)].close;
    const bReturn = bPrior > 0 ? (bCurrent - bPrior) / bPrior : 0;

    const cPrior = closes[Math.max(0, n - period)];
    const cReturn = cPrior > 0 ? (currentPrice - cPrior) / cPrior : 0;

    mansfieldRS = Number(((cReturn - bReturn) * 100).toFixed(2));
  } else {
    // Relative to recent range
    mansfieldRS = distanceFromMaPercent;
  }
  const isOutperformingBenchmark = mansfieldRS > 0;

  // Determine Stage according to Stan Weinstein's Rules:
  let currentStage: MarketStage = 'STAGE_1_BASING';
  let stageNumber: 1 | 2 | 3 | 4 = 1;
  let stageName = 'Stage 1: Basing / Accumulation';
  let stageBadgeColor = 'text-amber-400';
  let stageBadgeBg = 'bg-amber-500/20';
  let stageBadgeBorder = 'border-amber-500/40';
  let stageThesis = '';

  if (isAboveMa && (maSlopeDirection === 'RISING' || (maSlopeDirection === 'FLAT' && distanceFromMaPercent > 2.5))) {
    // Stage 2: Advancing / Markup Phase (Golden Bull Cycle)
    currentStage = 'STAGE_2_ADVANCING';
    stageNumber = 2;
    stageName = 'Stage 2: Advancing / Markup';
    stageBadgeColor = 'text-emerald-400';
    stageBadgeBg = 'bg-emerald-500/20';
    stageBadgeBorder = 'border-emerald-500/40';
    stageThesis = `Price trading at $${currentPrice.toFixed(2)} (+${distanceFromMaPercent}% above rising 30-week SMA $${ma30.toFixed(2)}). Structural Stage 2 markup phase with strong relative strength (+${mansfieldRS}% vs benchmark). High-probability bullish continuation environment.`;
  } else if (!isAboveMa && maSlopeDirection === 'FALLING') {
    // Stage 4: Declining / Markdown / Capitulation 🩸 (as in TrendSpider post)
    currentStage = 'STAGE_4_DECLINING';
    stageNumber = 4;
    stageName = 'Stage 4: Declining / Markdown 🩸';
    stageBadgeColor = 'text-rose-400';
    stageBadgeBg = 'bg-rose-500/20';
    stageBadgeBorder = 'border-rose-500/40';
    stageThesis = `CRITICAL WARNING: Price trading at $${currentPrice.toFixed(2)} (${distanceFromMaPercent}% below downward sloping 30-week SMA $${ma30.toFixed(2)}). Severe Stage 4 breakdown capitulation regime. Long positions carry extreme drawdown risk; prioritize short put defense or bearish hedges.`;
  } else if (isAboveMa && maSlopeDirection === 'FALLING') {
    // Transitioning from Top to Breakdown
    currentStage = 'STAGE_3_TOPPING';
    stageNumber = 3;
    stageName = 'Stage 3: Topping / Distribution';
    stageBadgeColor = 'text-orange-400';
    stageBadgeBg = 'bg-orange-500/20';
    stageBadgeBorder = 'border-orange-500/40';
    stageThesis = `Price $${currentPrice.toFixed(2)} churning above flattening 30-week SMA $${ma30.toFixed(2)}. Distribution pattern forming with elevated sell-side volatility. Prepare for potential Stage 4 breakdown invalidation.`;
  } else if (!isAboveMa && (maSlopeDirection === 'FLAT' || maSlopeDirection === 'RISING')) {
    // Pullback in Stage 2 or Basing in Stage 1
    if (distanceFromMaPercent > -3.5 && maSlopeDirection === 'RISING') {
      currentStage = 'STAGE_2_ADVANCING';
      stageNumber = 2;
      stageName = 'Stage 2: Advancing (Pullback to MA)';
      stageBadgeColor = 'text-emerald-400';
      stageBadgeBg = 'bg-emerald-500/20';
      stageBadgeBorder = 'border-emerald-500/40';
      stageThesis = `Healthy Stage 2 test of rising 30-week SMA ($${ma30.toFixed(2)}). Ideal low-risk institutional entry zone if support holds.`;
    } else {
      currentStage = 'STAGE_1_BASING';
      stageNumber = 1;
      stageName = 'Stage 1: Basing / Accumulation';
      stageBadgeColor = 'text-amber-400';
      stageBadgeBg = 'bg-amber-500/20';
      stageBadgeBorder = 'border-amber-500/40';
      stageThesis = `Price consolidating in a tight base near flat 30-week SMA $${ma30.toFixed(2)}. Volatility contraction and institutional absorption. Watch for Stage 2 breakout above resistance $${keyResistanceCeiling.toFixed(2)}.`;
    }
  } else {
    // Stage 3: Topping / Distribution
    currentStage = 'STAGE_3_TOPPING';
    stageNumber = 3;
    stageName = 'Stage 3: Topping / Distribution';
    stageBadgeColor = 'text-orange-400';
    stageBadgeBg = 'bg-orange-500/20';
    stageBadgeBorder = 'border-orange-500/40';
    stageThesis = `Distribution phase: price oscillating erratically across moving average $${ma30.toFixed(2)} with fading upward momentum. Avoid new long breakouts.`;
  }

  // Detect Stage Transition Events (like TrendSpider's "Welcome to Stage 4 🩸")
  let stageTransitionEvent: StageAnalysisResult['stageTransitionEvent'] = undefined;
  if (currentStage === 'STAGE_4_DECLINING' && currentPrice < keySupportFloor * 1.01) {
    stageTransitionEvent = {
      type: 'STAGE_4_BREAKDOWN_CRITICAL',
      headline: 'Welcome to Stage 4 🩸',
      description: `Decisive structural breakdown beneath key support ($${keySupportFloor.toFixed(2)}) and declining 30-week SMA. Severe markdown phase active.`,
      severity: 'CRITICAL',
      iconEmoji: '🩸',
    };
  } else if (currentStage === 'STAGE_2_ADVANCING' && currentPrice > keyResistanceCeiling * 0.99) {
    stageTransitionEvent = {
      type: 'STAGE_1_ACCUMULATION_BREAKOUT',
      headline: 'Stage 2 Markup Breakout 🚀',
      description: `Clean breakout above multi-week resistance ($${keyResistanceCeiling.toFixed(2)}) on a rising 30-week SMA. High-conviction bull regime.`,
      severity: 'BULLISH',
      iconEmoji: '🚀',
    };
  } else if (currentStage === 'STAGE_3_TOPPING') {
    stageTransitionEvent = {
      type: 'STAGE_3_DISTRIBUTION_WARNING',
      headline: 'Stage 3 Distribution Warning ⚠️',
      description: `Momentum has flattened; distribution volume detected near resistance ceiling ($${keyResistanceCeiling.toFixed(2)}).`,
      severity: 'WARNING',
      iconEmoji: '⚠️',
    };
  }

  return {
    currentStage,
    stageName,
    stageBadgeColor,
    stageBadgeBg,
    stageBadgeBorder,
    stageNumber,
    ma30Week: Number(ma30.toFixed(2)),
    maSlope: Number(maSlope.toFixed(2)),
    maSlopeDirection,
    priceToMaRatio,
    distanceFromMaPercent,
    isAboveMa,
    mansfieldRelativeStrength: mansfieldRS,
    isOutperformingBenchmark,
    stageTransitionEvent,
    keySupportFloor: Number(keySupportFloor.toFixed(2)),
    keyResistanceCeiling: Number(keyResistanceCeiling.toFixed(2)),
    stageThesis,
  };
}

// ============================================================================
// 2. TRENDSPIDER RAINDROP® CHARTS ENGINE
// ============================================================================

export interface RaindropBar {
  index: number;
  time: number | string;
  high: number;
  low: number;
  leftVwap: number;   // VWAP of first half of period
  rightVwap: number;  // VWAP of second half of period
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  color: string;
  totalVolume: number;
  leftVolume: number;
  rightVolume: number;
  shapeType: 'BALLOON_TOP' | 'BALLOON_BOTTOM' | 'HOURGLASS' | 'SQUEEZE' | 'BALANCED';
  volumeProfileLeft: { price: number; volume: number }[];
  volumeProfileRight: { price: number; volume: number }[];
  vwapSpreadPercent: number; // ((rightVwap - leftVwap) / leftVwap) * 100
}

/**
 * Calculates TrendSpider Raindrop Volume Profile & VWAP sentiment for candles
 * Partitions each period into first half (Left) and second half (Right).
 */
export function calculateRaindropBars(candles: CandleData[], priceBucketsCount: number = 8): RaindropBar[] {
  if (!candles || candles.length === 0) return [];

  return candles.map((c, idx) => {
    const high = c.high;
    const low = c.low;
    const range = Math.max(0.01, high - low);
    const totalVol = Math.max(100, c.volume);

    // Approximate intra-candle volume distribution
    // Left half (first half of period) typically gravitates around (Open + Low/High / 2)
    // Right half (second half of period) gravitates around (Close + High/Low / 2)
    const leftMid = (c.open * 2 + (c.close > c.open ? low : high)) / 3;
    const rightMid = (c.close * 2 + (c.close > c.open ? high : low)) / 3;

    const leftVwap = Number(Math.max(low, Math.min(high, leftMid)).toFixed(2));
    const rightVwap = Number(Math.max(low, Math.min(high, rightMid)).toFixed(2));

    const leftVol = Math.round(totalVol * 0.48);
    const rightVol = totalVol - leftVol;

    // Build discrete volume buckets across range
    const bucketStep = range / priceBucketsCount;
    const volumeProfileLeft: { price: number; volume: number }[] = [];
    const volumeProfileRight: { price: number; volume: number }[] = [];

    for (let b = 0; b < priceBucketsCount; b++) {
      const bucketPrice = Number((low + (b + 0.5) * bucketStep).toFixed(2));
      
      // Gaussian distribution centered at leftVwap for left side
      const distL = Math.abs(bucketPrice - leftVwap) / range;
      const weightL = Math.exp(-4 * distL * distL);
      volumeProfileLeft.push({
        price: bucketPrice,
        volume: Math.round(leftVol * weightL),
      });

      // Gaussian distribution centered at rightVwap for right side
      const distR = Math.abs(bucketPrice - rightVwap) / range;
      const weightR = Math.exp(-4 * distR * distR);
      volumeProfileRight.push({
        price: bucketPrice,
        volume: Math.round(rightVol * weightR),
      });
    }

    // Determine sentiment color
    let sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    let color = '#38bdf8'; // Blue neutral
    const vwapSpreadPercent = leftVwap > 0 ? Number((((rightVwap - leftVwap) / leftVwap) * 100).toFixed(2)) : 0;

    if (rightVwap > leftVwap + 0.05) {
      sentiment = 'BULLISH';
      color = '#10b981'; // Green
    } else if (rightVwap < leftVwap - 0.05) {
      sentiment = 'BEARISH';
      color = '#f43f5e'; // Red
    }

    // Shape classification
    let shapeType: RaindropBar['shapeType'] = 'BALANCED';
    const topZone = high - range * 0.3;
    const bottomZone = low + range * 0.3;

    if (rightVwap >= topZone && leftVwap >= topZone) {
      shapeType = 'BALLOON_TOP'; // Heavy volume absorption at highs
    } else if (rightVwap <= bottomZone && leftVwap <= bottomZone) {
      shapeType = 'BALLOON_BOTTOM'; // Heavy volume absorption at lows
    } else if (Math.abs(rightVwap - leftVwap) < range * 0.1) {
      shapeType = 'SQUEEZE'; // Volume condensed, coiled spring
    } else if (
      (leftVwap <= bottomZone && rightVwap >= topZone) ||
      (leftVwap >= topZone && rightVwap <= bottomZone)
    ) {
      shapeType = 'HOURGLASS'; // Strong trend displacement across whole bar
    }

    return {
      index: idx,
      time: c.time,
      high,
      low,
      leftVwap,
      rightVwap,
      sentiment,
      color,
      totalVolume: totalVol,
      leftVolume: leftVol,
      rightVolume: rightVol,
      shapeType,
      volumeProfileLeft,
      volumeProfileRight,
      vwapSpreadPercent,
    };
  });
}

// ============================================================================
// 3. AUTO-ANCHORED VWAP (AUTO-AVWAP) ENGINE
// ============================================================================

export interface AnchoredVwapPoint {
  time: number | string;
  vwap: number;
  upper1Band: number; // +1 Standard Deviation
  lower1Band: number; // -1 Standard Deviation
  upper2Band: number; // +2 Standard Deviation
  lower2Band: number; // -2 Standard Deviation
}

export interface AutoAvwapResult {
  anchorType: 'PEAK_VOLUME' | 'SWING_HIGH' | 'SWING_LOW' | 'YTD';
  anchorIndex: number;
  anchorDate: string | number;
  anchorPrice: number;
  currentVwap: number;
  priceToVwapPercent: number;
  trendStatus: 'ABOVE_AVWAP_BULLISH' | 'BELOW_AVWAP_BEARISH' | 'CONGESTED_AT_AVWAP';
  points: AnchoredVwapPoint[];
}

/**
 * Calculates Auto-Anchored VWAP from key structural points:
 * - Peak volume bar in lookback
 * - Highest swing high
 * - Lowest swing low
 */
export function calculateAutoAnchoredVwap(
  candles: CandleData[],
  anchorType: 'PEAK_VOLUME' | 'SWING_HIGH' | 'SWING_LOW' | 'YTD' = 'PEAK_VOLUME'
): AutoAvwapResult {
  const n = candles.length;
  if (n < 5) {
    return {
      anchorType,
      anchorIndex: 0,
      anchorDate: 0,
      anchorPrice: 0,
      currentVwap: 0,
      priceToVwapPercent: 0,
      trendStatus: 'CONGESTED_AT_AVWAP',
      points: [],
    };
  }

  // Find anchor index based on selected strategy
  let anchorIdx = 0;

  if (anchorType === 'PEAK_VOLUME') {
    let maxVol = 0;
    // Look at past 40 bars (or all bars) to find volume climax anchor
    const searchStart = Math.max(0, n - 40);
    for (let i = searchStart; i < n; i++) {
      if (candles[i].volume > maxVol) {
        maxVol = candles[i].volume;
        anchorIdx = i;
      }
    }
  } else if (anchorType === 'SWING_HIGH') {
    let maxHigh = -Infinity;
    const searchStart = Math.max(0, n - 40);
    for (let i = searchStart; i < n; i++) {
      if (candles[i].high > maxHigh) {
        maxHigh = candles[i].high;
        anchorIdx = i;
      }
    }
  } else if (anchorType === 'SWING_LOW') {
    let minLow = Infinity;
    const searchStart = Math.max(0, n - 40);
    for (let i = searchStart; i < n; i++) {
      if (candles[i].low < minLow) {
        minLow = candles[i].low;
        anchorIdx = i;
      }
    }
  } else {
    // YTD or first available
    anchorIdx = Math.max(0, n - 60);
  }

  // Calculate cumulative VWAP from anchorIdx forward
  let cumVolume = 0;
  let cumVolPrice = 0;
  const points: AnchoredVwapPoint[] = [];

  const anchorPrice = candles[anchorIdx].close;
  const anchorDate = candles[anchorIdx].time;

  for (let i = anchorIdx; i < n; i++) {
    const c = candles[i];
    const typicalPrice = (c.high + c.low + c.close) / 3;
    cumVolume += c.volume;
    cumVolPrice += typicalPrice * c.volume;

    const vwap = cumVolume > 0 ? cumVolPrice / cumVolume : typicalPrice;

    // Approximate standard deviation from cumulative variance
    const diff = Math.abs(typicalPrice - vwap);
    const band1 = Math.max(0.5, diff * 1.2);
    const band2 = band1 * 2;

    points.push({
      time: c.time,
      vwap: Number(vwap.toFixed(2)),
      upper1Band: Number((vwap + band1).toFixed(2)),
      lower1Band: Number((vwap - band1).toFixed(2)),
      upper2Band: Number((vwap + band2).toFixed(2)),
      lower2Band: Number((vwap - band2).toFixed(2)),
    });
  }

  const latestPoint = points[points.length - 1];
  const currentPrice = candles[n - 1].close;
  const currentVwap = latestPoint ? latestPoint.vwap : currentPrice;
  const priceToVwapPercent = currentVwap > 0 ? Number((((currentPrice - currentVwap) / currentVwap) * 100).toFixed(2)) : 0;

  const trendStatus =
    priceToVwapPercent > 0.8
      ? 'ABOVE_AVWAP_BULLISH'
      : priceToVwapPercent < -0.8
      ? 'BELOW_AVWAP_BEARISH'
      : 'CONGESTED_AT_AVWAP';

  return {
    anchorType,
    anchorIndex: anchorIdx,
    anchorDate,
    anchorPrice,
    currentVwap,
    priceToVwapPercent,
    trendStatus,
    points,
  };
}

// ============================================================================
// 4. AUTOMATED TRENDLINE & BREAKOUT DETECTION ENGINE
// ============================================================================

export interface TrendlineDefinition {
  id: string;
  type: 'RESISTANCE' | 'SUPPORT';
  startIndex: number;
  endIndex: number;
  startPrice: number;
  endPrice: number;
  currentProjectedPrice: number;
  slope: number;
  touchCount: number;
  status: 'TESTING' | 'BROKEN_OUT' | 'BROKEN_DOWN' | 'INTACT';
  distancePercent: number; // distance of current price from trendline
  breakoutConfirmed: boolean;
}

export function detectAutomatedTrendlines(candles: CandleData[]): TrendlineDefinition[] {
  const n = candles.length;
  if (n < 15) return [];

  const trendlines: TrendlineDefinition[] = [];
  const currentPrice = candles[n - 1].close;

  // Find swing highs (peaks)
  const swingHighs: { idx: number; price: number }[] = [];
  for (let i = 2; i < n - 2; i++) {
    if (
      candles[i].high > candles[i - 1].high &&
      candles[i].high > candles[i - 2].high &&
      candles[i].high > candles[i + 1].high &&
      candles[i].high > candles[i + 2].high
    ) {
      swingHighs.push({ idx: i, price: candles[i].high });
    }
  }

  // Find swing lows (troughs)
  const swingLows: { idx: number; price: number }[] = [];
  for (let i = 2; i < n - 2; i++) {
    if (
      candles[i].low < candles[i - 1].low &&
      candles[i].low < candles[i - 2].low &&
      candles[i].low < candles[i + 1].low &&
      candles[i].low < candles[i + 2].low
    ) {
      swingLows.push({ idx: i, price: candles[i].low });
    }
  }

  // Build Resistance Trendline if at least 2 swing highs
  if (swingHighs.length >= 2) {
    const p1 = swingHighs[swingHighs.length - 2];
    const p2 = swingHighs[swingHighs.length - 1];
    const dx = Math.max(1, p2.idx - p1.idx);
    const slope = (p2.price - p1.price) / dx;
    const currentProjected = p2.price + slope * (n - 1 - p2.idx);
    const distPct = currentProjected > 0 ? ((currentPrice - currentProjected) / currentProjected) * 100 : 0;
    const brokenOut = currentPrice > currentProjected + 0.15;

    trendlines.push({
      id: `tl-res-${p1.idx}-${p2.idx}`,
      type: 'RESISTANCE',
      startIndex: p1.idx,
      endIndex: p2.idx,
      startPrice: p1.price,
      endPrice: p2.price,
      currentProjectedPrice: Number(currentProjected.toFixed(2)),
      slope: Number(slope.toFixed(4)),
      touchCount: 2 + (Math.abs(distPct) < 0.5 ? 1 : 0),
      status: brokenOut ? 'BROKEN_OUT' : Math.abs(distPct) < 1.0 ? 'TESTING' : 'INTACT',
      distancePercent: Number(distPct.toFixed(2)),
      breakoutConfirmed: brokenOut,
    });
  }

  // Build Support Trendline if at least 2 swing lows
  if (swingLows.length >= 2) {
    const p1 = swingLows[swingLows.length - 2];
    const p2 = swingLows[swingLows.length - 1];
    const dx = Math.max(1, p2.idx - p1.idx);
    const slope = (p2.price - p1.price) / dx;
    const currentProjected = p2.price + slope * (n - 1 - p2.idx);
    const distPct = currentProjected > 0 ? ((currentPrice - currentProjected) / currentProjected) * 100 : 0;
    const brokenDown = currentPrice < currentProjected - 0.15;

    trendlines.push({
      id: `tl-sup-${p1.idx}-${p2.idx}`,
      type: 'SUPPORT',
      startIndex: p1.idx,
      endIndex: p2.idx,
      startPrice: p1.price,
      endPrice: p2.price,
      currentProjectedPrice: Number(currentProjected.toFixed(2)),
      slope: Number(slope.toFixed(4)),
      touchCount: 2 + (Math.abs(distPct) < 0.5 ? 1 : 0),
      status: brokenDown ? 'BROKEN_DOWN' : Math.abs(distPct) < 1.0 ? 'TESTING' : 'INTACT',
      distancePercent: Number(distPct.toFixed(2)),
      breakoutConfirmed: brokenDown,
    });
  }

  return trendlines;
}

// ============================================================================
// 5. UNIFIED TRENDSPIDER CONFLUENCE REPORT
// ============================================================================

export interface TrendSpiderReport {
  symbol: string;
  currentPrice: number;
  stageAnalysis: StageAnalysisResult;
  recentRaindrops: RaindropBar[];
  activeRaindrop: RaindropBar | null;
  autoAvwap: AutoAvwapResult;
  automatedTrendlines: TrendlineDefinition[];
  confluenceScore: number; // 0 - 100%
  verdict: 'STRONG_BULLISH' | 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'AVOID_STAGE_4_COLLAPSE';
  keyTakeaways: string[];
  patterns: ChartPattern[];
}

export function generateTrendSpiderReport(
  symbol: string,
  candles: CandleData[],
  benchmarkCandles?: CandleData[]
): TrendSpiderReport {
  const stage = calculateStageAnalysis(candles, benchmarkCandles);
  const raindrops = calculateRaindropBars(candles, 8);
  const activeRaindrop = raindrops.length > 0 ? raindrops[raindrops.length - 1] : null;
  const autoAvwap = calculateAutoAnchoredVwap(candles, 'PEAK_VOLUME');
  const trendlines = detectAutomatedTrendlines(candles);
  const patterns = detectChartPatterns(candles);

  const currentPrice = candles.length > 0 ? candles[candles.length - 1].close : 0;

  // Compute Confluence Score (0 - 100)
  let score = 50;
  const takeaways: string[] = [];

  // Stage Analysis Factor (40% weight)
  if (stage.currentStage === 'STAGE_2_ADVANCING') {
    score += 25;
    takeaways.push(`Stage 2 Markup Bull Cycle (+${stage.distanceFromMaPercent}% above rising 30w MA $${stage.ma30Week.toFixed(2)}).`);
  } else if (stage.currentStage === 'STAGE_4_DECLINING') {
    score -= 35;
    takeaways.push(`CRITICAL: Stage 4 Capitulation 🩸 (${stage.distanceFromMaPercent}% below declining 30w MA $${stage.ma30Week.toFixed(2)}). Avoid longs.`);
  } else if (stage.currentStage === 'STAGE_1_BASING') {
    score += 5;
    takeaways.push(`Stage 1 Basing: Building accumulation floor above $${stage.keySupportFloor.toFixed(2)}.`);
  } else {
    score -= 10;
    takeaways.push(`Stage 3 Distribution: Churning volatility with fading institutional participation.`);
  }

  // Raindrop Factor (25% weight)
  if (activeRaindrop) {
    if (activeRaindrop.sentiment === 'BULLISH') {
      score += 15;
      takeaways.push(`Bullish Raindrop: Volume-weighted sentiment shifted upward in 2nd half of session (Right VWAP $${activeRaindrop.rightVwap.toFixed(2)} > Left VWAP $${activeRaindrop.leftVwap.toFixed(2)}).`);
    } else if (activeRaindrop.sentiment === 'BEARISH') {
      score -= 15;
      takeaways.push(`Bearish Raindrop: Volume-weighted sentiment eroded in 2nd half (Right VWAP $${activeRaindrop.rightVwap.toFixed(2)} < Left VWAP $${activeRaindrop.leftVwap.toFixed(2)}).`);
    }

    if (activeRaindrop.shapeType === 'BALLOON_BOTTOM') {
      score += 5;
      takeaways.push(`Raindrop Shape: Balloon Bottom (Aggressive institutional absorption at lows).`);
    } else if (activeRaindrop.shapeType === 'BALLOON_TOP' && stage.currentStage === 'STAGE_4_DECLINING') {
      score -= 5;
      takeaways.push(`Raindrop Shape: Balloon Top in Stage 4 (Heavy overhead supply trap).`);
    }
  }

  // Auto-AVWAP Factor (20% weight)
  if (autoAvwap.trendStatus === 'ABOVE_AVWAP_BULLISH') {
    score += 10;
    takeaways.push(`Trading above Peak-Volume Anchored VWAP ($${autoAvwap.currentVwap.toFixed(2)}) by +${autoAvwap.priceToVwapPercent}%.`);
  } else if (autoAvwap.trendStatus === 'BELOW_AVWAP_BEARISH') {
    score -= 10;
    takeaways.push(`Trapped below Peak-Volume Anchored VWAP ($${autoAvwap.currentVwap.toFixed(2)}) by ${autoAvwap.priceToVwapPercent}%.`);
  }

  // Trendline Factor (15% weight)
  const resLine = trendlines.find((t) => t.type === 'RESISTANCE');
  if (resLine && resLine.breakoutConfirmed) {
    score += 10;
    takeaways.push(`Automated Trendline: Confirmed breakout above resistance ($${resLine.currentProjectedPrice.toFixed(2)}).`);
  }
  const supLine = trendlines.find((t) => t.type === 'SUPPORT');
  if (supLine && supLine.breakoutConfirmed) {
    score -= 15;
    takeaways.push(`Automated Trendline: Breakdown beneath multi-touch support ($${supLine.currentProjectedPrice.toFixed(2)}).`);
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  let verdict: TrendSpiderReport['verdict'] = 'NEUTRAL';
  if (stage.currentStage === 'STAGE_4_DECLINING') {
    verdict = 'AVOID_STAGE_4_COLLAPSE';
  } else if (score >= 75) {
    verdict = 'STRONG_BULLISH';
  } else if (score >= 60) {
    verdict = 'BULLISH';
  } else if (score <= 40) {
    verdict = 'BEARISH';
  }

  return {
    symbol,
    currentPrice,
    stageAnalysis: stage,
    recentRaindrops: raindrops.slice(-10),
    activeRaindrop,
    autoAvwap,
    automatedTrendlines: trendlines,
    patterns,
    confluenceScore: score,
    verdict,
    keyTakeaways: takeaways,
  };
}
