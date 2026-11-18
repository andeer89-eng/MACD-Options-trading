import { Candle } from './trullasStrategy';

/**
 * Calculates smoothed Heikin-Ashi candles from standard OHLCV candles.
 * HaClose = (Open + High + Low + Close) / 4
 * HaOpen = (PrevHaOpen + PrevHaClose) / 2
 * HaHigh = Max(High, HaOpen, HaClose)
 * HaLow = Min(Low, HaOpen, HaClose)
 */
function roundToTickPrecision(value: number, refPrice: number): number {
  const absRef = Math.abs(refPrice);
  const decimals = absRef >= 10 ? 2 : absRef >= 0.1 ? 4 : 6;
  return Number(value.toFixed(decimals));
}

export function calculateHeikinAshi(candles: Candle[]): Candle[] {
  if (candles.length === 0) return [];

  const haCandles: Candle[] = [];
  let prevOpen = candles[0].open;
  let prevClose = candles[0].close;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const ref = c.close || c.open;
    const haClose = roundToTickPrecision((c.open + c.high + c.low + c.close) / 4, ref);
    const haOpen = i === 0
      ? roundToTickPrecision((c.open + c.close) / 2, ref)
      : roundToTickPrecision((prevOpen + prevClose) / 2, ref);
    const haHigh = roundToTickPrecision(Math.max(c.high, haOpen, haClose), ref);
    const haLow = roundToTickPrecision(Math.min(c.low, haOpen, haClose), ref);

    haCandles.push({
      timestamp: c.timestamp,
      dateStr: c.dateStr,
      open: haOpen,
      high: haHigh,
      low: haLow,
      close: haClose,
      volume: c.volume,
    });

    prevOpen = haOpen;
    prevClose = haClose;
  }

  return haCandles;
}
