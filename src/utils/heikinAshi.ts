import { Candle } from './trullasStrategy';

/**
 * Calculates smoothed Heikin-Ashi candles from standard OHLCV candles.
 * HaClose = (Open + High + Low + Close) / 4
 * HaOpen = (PrevHaOpen + PrevHaClose) / 2
 * HaHigh = Max(High, HaOpen, HaClose)
 * HaLow = Min(Low, HaOpen, HaClose)
 */
export function calculateHeikinAshi(candles: Candle[]): Candle[] {
  if (candles.length === 0) return [];

  const haCandles: Candle[] = [];
  let prevOpen = candles[0].open;
  let prevClose = candles[0].close;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const haClose = Number(((c.open + c.high + c.low + c.close) / 4).toFixed(2));
    const haOpen = i === 0
      ? Number(((c.open + c.close) / 2).toFixed(2))
      : Number(((prevOpen + prevClose) / 2).toFixed(2));
    const haHigh = Number(Math.max(c.high, haOpen, haClose).toFixed(2));
    const haLow = Number(Math.min(c.low, haOpen, haClose).toFixed(2));

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
