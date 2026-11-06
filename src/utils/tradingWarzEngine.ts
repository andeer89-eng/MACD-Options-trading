/**
 * Pure Logic Engine for TradingWarz Price Action & Fibonacci Golden Zone Architecture
 * Based on Ricky/Dan (TradingWarz) methodology:
 * 1. Inside Bars (IB) - Market compression & volatility contraction
 * 2. Double Inside Bars (DIB) - Coiled spring accumulation
 * 3. The Holy Grail (OBIB) - Outside Bar (trap) followed by Inside Bar (compression)
 * 4. The Nirvana Pattern (IBOB) - Inside Bar followed by Outside Bar (expansion commitment)
 * 5. Fibonacci Golden Zone - 50.0%, 61.8% (Primary), 78.6% retracements
 * 6. Confluence Engine for Options Premium Harvesting (Selling OTM Puts beneath Golden Zone support)
 */

export interface CandleOHLC {
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  dateStr?: string;
}

export type TradingWarzPatternType =
  | 'HOLY_GRAIL_OBIB'
  | 'NIRVANA_IBOB'
  | 'DOUBLE_INSIDE_BAR'
  | 'INSIDE_BAR'
  | 'OUTSIDE_BAR'
  | 'NONE';

export interface FibonacciGoldenLevels {
  swingHigh: number;
  swingLow: number;
  range: number;
  isUptrendSwing: boolean;
  fib236: number; // 23.6% retracement
  fib382: number; // 38.2% retracement
  fib500: number; // 50.0% Golden Zone upper bound
  fib618: number; // 61.8% Primary Golden Pocket
  fib786: number; // 78.6% Deep Golden Buffer
  ext1618: number; // 161.8% Fib Target 1
  ext2618: number; // 261.8% Fib Target 2
}

export interface TradingWarzAnalysis {
  pattern: TradingWarzPatternType;
  patternLabel: string;
  patternColor: 'yellow' | 'blue' | 'purple' | 'emerald' | 'zinc';
  isInsideBar: boolean;
  isDoubleInsideBar: boolean;
  isHolyGrail: boolean;
  isNirvana: boolean;
  motherBar?: CandleOHLC;
  insideBar?: CandleOHLC;
  fibLevels: FibonacciGoldenLevels;
  isInGoldenZone: boolean;
  goldenZoneProximityPercent: number; // distance to 61.8% level
  recommendedPutStrike: number;
  strikeDistancePercent: number;
  estimatedDelta: number;
  probabilityOfProfitPercent: number;
  setupGrade: 'A+' | 'A' | 'B' | 'NEUTRAL';
  auditRationale: string;
}

/**
 * Checks if a candle is an Inside Bar relative to the previous candle
 */
export function isInsideBar(curr: CandleOHLC, prev: CandleOHLC): boolean {
  return curr.high <= prev.high && curr.low >= prev.low;
}

/**
 * Checks if a candle is an Outside Bar relative to the previous candle
 */
export function isOutsideBar(curr: CandleOHLC, prev: CandleOHLC): boolean {
  return curr.high > prev.high && curr.low < prev.low;
}

/**
 * Calculates Fibonacci Golden Zone levels from a price swing
 */
export function calculateFibonacciGoldenLevels(
  candles: CandleOHLC[],
  lookback: number = 20
): FibonacciGoldenLevels {
  if (candles.length < 2) {
    const defaultPrice = candles[0]?.close || 5800;
    return {
      swingHigh: defaultPrice * 1.02,
      swingLow: defaultPrice * 0.98,
      range: defaultPrice * 0.04,
      isUptrendSwing: true,
      fib236: defaultPrice * 0.99,
      fib382: defaultPrice * 0.985,
      fib500: defaultPrice * 0.98,
      fib618: defaultPrice * 0.975,
      fib786: defaultPrice * 0.968,
      ext1618: defaultPrice * 1.04,
      ext2618: defaultPrice * 1.08,
    };
  }

  const window = candles.slice(-Math.min(candles.length, lookback));
  let swingHigh = -Infinity;
  let swingLow = Infinity;
  let highIdx = 0;
  let lowIdx = 0;

  window.forEach((c, idx) => {
    if (c.high > swingHigh) {
      swingHigh = c.high;
      highIdx = idx;
    }
    if (c.low < swingLow) {
      swingLow = c.low;
      lowIdx = idx;
    }
  });

  const range = Math.max(0.01, swingHigh - swingLow);
  const isUptrendSwing = highIdx >= lowIdx; // Low occurred before High

  // For bullish swing (impulse up, pulling back down to Golden Zone):
  const fib236 = isUptrendSwing ? swingHigh - range * 0.236 : swingLow + range * 0.236;
  const fib382 = isUptrendSwing ? swingHigh - range * 0.382 : swingLow + range * 0.382;
  const fib500 = isUptrendSwing ? swingHigh - range * 0.500 : swingLow + range * 0.500;
  const fib618 = isUptrendSwing ? swingHigh - range * 0.618 : swingLow + range * 0.618;
  const fib786 = isUptrendSwing ? swingHigh - range * 0.786 : swingLow + range * 0.786;

  const ext1618 = isUptrendSwing ? swingHigh + range * 0.618 : swingLow - range * 0.618;
  const ext2618 = isUptrendSwing ? swingHigh + range * 1.618 : swingLow - range * 1.618;

  return {
    swingHigh: Number(swingHigh.toFixed(2)),
    swingLow: Number(swingLow.toFixed(2)),
    range: Number(range.toFixed(2)),
    isUptrendSwing,
    fib236: Number(fib236.toFixed(2)),
    fib382: Number(fib382.toFixed(2)),
    fib500: Number(fib500.toFixed(2)),
    fib618: Number(fib618.toFixed(2)),
    fib786: Number(fib786.toFixed(2)),
    ext1618: Number(ext1618.toFixed(2)),
    ext2618: Number(ext2618.toFixed(2)),
  };
}

/**
 * Analyzes candlestick patterns and TradingWarz confluence for an asset
 */
export function analyzeTradingWarzSetup(
  candles: CandleOHLC[],
  currentPrice?: number
): TradingWarzAnalysis {
  if (candles.length < 3) {
    const p = currentPrice || candles[candles.length - 1]?.close || 5800;
    const fibs = calculateFibonacciGoldenLevels(candles);
    return {
      pattern: 'NONE',
      patternLabel: 'Standard Price Action',
      patternColor: 'zinc',
      isInsideBar: false,
      isDoubleInsideBar: false,
      isHolyGrail: false,
      isNirvana: false,
      fibLevels: fibs,
      isInGoldenZone: false,
      goldenZoneProximityPercent: 3.5,
      recommendedPutStrike: Math.floor(p * 0.96 / 10) * 10,
      strikeDistancePercent: 4.0,
      estimatedDelta: 0.10,
      probabilityOfProfitPercent: 90.0,
      setupGrade: 'NEUTRAL',
      auditRationale: 'Insufficient candle history for TradingWarz pattern classification.',
    };
  }

  const n = candles.length;
  const cCurrent = candles[n - 1];
  const cPrev = candles[n - 2];
  const cPrePrev = candles[n - 3];
  const price = currentPrice || cCurrent.close;

  const fibLevels = calculateFibonacciGoldenLevels(candles, 25);

  const currIsIB = isInsideBar(cCurrent, cPrev);
  const prevIsIB = isInsideBar(cPrev, cPrePrev);
  const prevIsOB = isOutsideBar(cPrev, cPrePrev);
  const currIsOB = isOutsideBar(cCurrent, cPrev);

  let pattern: TradingWarzPatternType = 'NONE';
  let patternLabel = 'Standard Action';
  let patternColor: TradingWarzAnalysis['patternColor'] = 'zinc';

  // 1. Holy Grail (OBIB): Outside bar followed by Inside bar (Yellow)
  if (prevIsOB && currIsIB) {
    pattern = 'HOLY_GRAIL_OBIB';
    patternLabel = 'The Holy Grail (OBIB)';
    patternColor = 'yellow';
  }
  // 2. Nirvana (IBOB): Inside bar followed by Outside bar (Blue)
  else if (prevIsIB && currIsOB) {
    pattern = 'NIRVANA_IBOB';
    patternLabel = 'The Nirvana (IBOB)';
    patternColor = 'blue';
  }
  // 3. Double Inside Bar (DIB): Two consecutive inside bars (Purple)
  else if (currIsIB && prevIsIB) {
    pattern = 'DOUBLE_INSIDE_BAR';
    patternLabel = 'Double Inside Bar (DIB)';
    patternColor = 'purple';
  }
  // 4. Single Inside Bar (IB) (Emerald)
  else if (currIsIB) {
    pattern = 'INSIDE_BAR';
    patternLabel = 'Inside Bar Compression (IB)';
    patternColor = 'emerald';
  } else if (currIsOB) {
    pattern = 'OUTSIDE_BAR';
    patternLabel = 'Outside Bar Expansion (OB)';
    patternColor = 'zinc';
  }

  // Check Golden Zone Proximity (between 50% and 61.8% - 78.6%)
  const minGZ = Math.min(fibLevels.fib500, fibLevels.fib618);
  const maxGZ = Math.max(fibLevels.fib500, fibLevels.fib618);
  const gzTolerance = fibLevels.range * 0.05; // 5% buffer around golden zone

  const isInGoldenZone = price >= minGZ - gzTolerance && price <= maxGZ + gzTolerance;
  const goldenZoneProximityPercent = Number(
    (Math.abs(price - fibLevels.fib618) / price * 100).toFixed(2)
  );

  // Safe Put Strike Placement for Rich's S&P 500 Put Harvesting:
  // Must be strictly BELOW the 61.8% Golden Zone, below the 78.6% pocket, and below the mother bar low!
  const structuralSupportFloor = Math.min(
    fibLevels.fib618,
    fibLevels.fib786,
    cPrev.low,
    cCurrent.low
  );

  // Minimum safety cushion: at least 2.5% to 4.5% below current price
  const rawSafetyStrike = Math.min(structuralSupportFloor * 0.985, price * 0.965);
  // Round to standard 5-point or 10-point ES/MES/SPY strike intervals
  const strikeInterval = price > 1000 ? 10 : 5;
  const recommendedPutStrike = Math.floor(rawSafetyStrike / strikeInterval) * strikeInterval;

  const strikeDistancePercent = Number(
    (((price - recommendedPutStrike) / price) * 100).toFixed(2)
  );

  // Delta estimation based on distance OTM
  let estimatedDelta = 0.12;
  if (strikeDistancePercent >= 4.5) estimatedDelta = 0.08;
  else if (strikeDistancePercent >= 3.5) estimatedDelta = 0.10;
  else if (strikeDistancePercent >= 2.5) estimatedDelta = 0.14;
  else estimatedDelta = 0.18;

  const probabilityOfProfitPercent = Number((100 - estimatedDelta * 100).toFixed(1));

  // Determine Setup Grade
  let setupGrade: TradingWarzAnalysis['setupGrade'] = 'B';
  if ((pattern === 'HOLY_GRAIL_OBIB' || pattern === 'NIRVANA_IBOB') && isInGoldenZone) {
    setupGrade = 'A+';
  } else if (isInGoldenZone || pattern === 'DOUBLE_INSIDE_BAR' || pattern === 'HOLY_GRAIL_OBIB') {
    setupGrade = 'A';
  } else if (pattern === 'INSIDE_BAR') {
    setupGrade = 'B';
  } else {
    setupGrade = 'NEUTRAL';
  }

  const motherBar = currIsIB ? cPrev : undefined;
  const insideBar = currIsIB ? cCurrent : undefined;

  const auditRationale = `TradingWarz pattern: [${patternLabel}]. Current Price: $${price.toFixed(2)}. Fibonacci 50-61.8% Golden Zone situated at $${fibLevels.fib500.toFixed(2)} - $${fibLevels.fib618.toFixed(2)} (${isInGoldenZone ? 'ACTIVE TEST / BOUNCE' : 'Proximity ' + goldenZoneProximityPercent + '%'}). Recommended Put Strike: $${recommendedPutStrike.toFixed(2)} placed $${(price - recommendedPutStrike).toFixed(2)} (${strikeDistancePercent}%) below structural support floor ($${structuralSupportFloor.toFixed(2)}). Delta: ${estimatedDelta.toFixed(2)}, POP: ${probabilityOfProfitPercent}%. Setup Grade: ${setupGrade}.`;

  return {
    pattern,
    patternLabel,
    patternColor,
    isInsideBar: currIsIB,
    isDoubleInsideBar: currIsIB && prevIsIB,
    isHolyGrail: prevIsOB && currIsIB,
    isNirvana: prevIsIB && currIsOB,
    motherBar,
    insideBar,
    fibLevels,
    isInGoldenZone,
    goldenZoneProximityPercent,
    recommendedPutStrike,
    strikeDistancePercent,
    estimatedDelta,
    probabilityOfProfitPercent,
    setupGrade,
    auditRationale,
  };
}
