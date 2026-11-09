import { CandleData } from '../utils/trendSpiderEngine';

export interface PresetStock {
  symbol: string;
  name: string;
  sector: string;
  targetStage: 1 | 2 | 3 | 4;
  candles: CandleData[];
  description: string;
}

// Deterministic seedable random number generator
function pseudoRandom(seed: number) {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

/**
 * Generates a realistic 52-week candle series matching specific market stage trajectories
 */
function generatePresetCandles(
  basePrice: number,
  targetStage: 1 | 2 | 3 | 4,
  seed: number,
  customDropPercent?: number
): CandleData[] {
  const rand = pseudoRandom(seed);
  const weeks = 52;
  const candles: CandleData[] = [];
  let price = basePrice;

  // Timestamps starting 52 weeks ago up to current week
  const now = Date.now();
  const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const startTs = now - weeks * ONE_WEEK_MS;

  for (let i = 0; i < weeks; i++) {
    const time = new Date(startTs + i * ONE_WEEK_MS).toISOString().split('T')[0];
    let drift = 0;
    let volMultiplier = 1.0;

    if (targetStage === 2) {
      // Stage 2: Strong markup trend
      drift = (rand() - 0.35) * 0.04; // upward bias
      volMultiplier = 1.0 + (i / weeks) * 0.8;
    } else if (targetStage === 4) {
      // Stage 4: Initial run up, top in middle, severe capitulation breakdown at end
      if (i < 20) {
        drift = (rand() - 0.4) * 0.035; // run up
      } else if (i < 34) {
        drift = (rand() - 0.5) * 0.045; // topping volatility
        volMultiplier = 1.3;
      } else {
        // Severe Stage 4 breakdown capitulation
        const dropIntensity = customDropPercent ? customDropPercent / 18 : 0.045;
        drift = -(rand() * dropIntensity + 0.015);
        volMultiplier = 2.2; // heavy panic distribution volume
      }
    } else if (targetStage === 3) {
      // Stage 3: Topping / Distribution
      if (i < 30) {
        drift = (rand() - 0.4) * 0.03;
      } else {
        drift = (rand() - 0.53) * 0.04; // churning volatile top
        volMultiplier = 1.6;
      }
    } else {
      // Stage 1: Basing / Accumulation
      if (i < 24) {
        drift = -(rand() * 0.02); // ending prior decline
      } else {
        drift = (rand() - 0.48) * 0.018; // tight flat range
        volMultiplier = 0.7; // drying volume
      }
    }

    const open = price;
    price = Math.max(1, price * (1 + drift));
    const close = price;
    const high = Math.max(open, close) * (1 + rand() * 0.022);
    const low = Math.min(open, close) * (1 - rand() * 0.022);
    const volume = Math.round((15000000 + rand() * 25000000) * volMultiplier);

    candles.push({
      time,
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      volume,
    });
  }

  return candles;
}

// SPY Benchmark for Mansfield Relative Strength
export const SPY_WEEKLY_PRESET: CandleData[] = generatePresetCandles(470, 2, 9999);

// Presets covering the exact tickers from user's TrendSpider post (#NBIS #INTC #SNDK #GOOG) + others
export const TRENDSPIDER_STOCKS_PRESET: PresetStock[] = [
  {
    symbol: 'NBIS',
    name: 'Nebius Group N.V.',
    sector: 'Technology & AI Infrastructure',
    targetStage: 4,
    description: 'Broke down from multi-month top into severe Stage 4 capitulation beneath 30-week SMA.',
    candles: generatePresetCandles(32.5, 4, 101, 0.45),
  },
  {
    symbol: 'INTC',
    name: 'Intel Corporation',
    sector: 'Semiconductors',
    targetStage: 4,
    description: 'Classic Stan Weinstein Stage 4 markdown. Broke $30 support floor on 3x average weekly volume.',
    candles: generatePresetCandles(50.2, 4, 202, 0.52),
  },
  {
    symbol: 'SNDK',
    name: 'SanDisk / Flash Memory Sector',
    sector: 'Storage & Hardware',
    targetStage: 4,
    description: 'Post-cycle inventory distribution led to clean Stage 4 breakdown below declining 30-week moving average.',
    candles: generatePresetCandles(85.0, 4, 303, 0.48),
  },
  {
    symbol: 'GOOG',
    name: 'Alphabet Inc.',
    sector: 'Interactive Media & Services',
    targetStage: 4,
    description: 'Regulatory headwind breakdown below weekly 30-week SMA support band, entering Stage 4 correction.',
    candles: generatePresetCandles(182.0, 4, 404, 0.22),
  },
  {
    symbol: 'NVDA',
    name: 'NVIDIA Corporation',
    sector: 'Semiconductors & AI',
    targetStage: 2,
    description: 'Textbook Stage 2 Advancing markup phase. Price riding above rising 30-week SMA with Mansfield RS outperformance.',
    candles: generatePresetCandles(65.0, 2, 505),
  },
  {
    symbol: 'AAPL',
    name: 'Apple Inc.',
    sector: 'Consumer Electronics',
    targetStage: 2,
    description: 'Institutional accumulation and Stage 2 markup with consecutive higher swing highs and strong volume absorption.',
    candles: generatePresetCandles(175.0, 2, 606),
  },
  {
    symbol: 'MSFT',
    name: 'Microsoft Corporation',
    sector: 'Software & Cloud',
    targetStage: 3,
    description: 'Stage 3 Topping / Distribution. Erratic churn near resistance ceiling with flattening 30-week SMA.',
    candles: generatePresetCandles(410.0, 3, 707),
  },
  {
    symbol: 'TSLA',
    name: 'Tesla, Inc.',
    sector: 'Automotive & Clean Energy',
    targetStage: 1,
    description: 'Stage 1 Basing / Accumulation. Multi-month tight consolidation base building above support floor.',
    candles: generatePresetCandles(220.0, 1, 808),
  },
  {
    symbol: 'AMD',
    name: 'Advanced Micro Devices',
    sector: 'Semiconductors',
    targetStage: 3,
    description: 'Stage 3 distribution test. Price testing the 30-week SMA floor with heavy overhead supply.',
    candles: generatePresetCandles(160.0, 3, 909),
  },
  {
    symbol: 'META',
    name: 'Meta Platforms, Inc.',
    sector: 'Interactive Media',
    targetStage: 2,
    description: 'Persistent Stage 2 advancing trend backed by strong institutional Raindrop volume accumulation.',
    candles: generatePresetCandles(360.0, 2, 111),
  },
];
