export interface ChartPattern {
  name: 'DOUBLE_BOTTOM' | 'DOUBLE_TOP' | 'HEAD_AND_SHOULDERS' | 'INVERSE_HEAD_AND_SHOULDERS';
  type: 'BULLISH' | 'BEARISH';
  confidence: number;
  startIndex: number;
  endIndex: number;
}

export function detectChartPatterns(
  candles: { high: number; low: number; close: number }[],
  lookback: number = 60
): ChartPattern[] {
  if (candles.length < lookback) return [];

  const patterns: ChartPattern[] = [];
  const n = candles.length;
  
  // Find swing points (peaks and troughs)
  const swings: { index: number; type: 'PEAK' | 'TROUGH'; price: number }[] = [];
  for (let i = 2; i < n - 2; i++) {
    if (candles[i].high > candles[i - 1].high && candles[i].high > candles[i - 2].high && candles[i].high > candles[i + 1].high && candles[i].high > candles[i + 2].high) {
      swings.push({ index: i, type: 'PEAK', price: candles[i].high });
    } else if (candles[i].low < candles[i - 1].low && candles[i].low < candles[i - 2].low && candles[i].low < candles[i + 1].low && candles[i].low < candles[i + 2].low) {
      swings.push({ index: i, type: 'TROUGH', price: candles[i].low });
    }
  }

  // Detect Double Bottom / Top
  for (let i = 2; i < swings.length; i++) {
    const s1 = swings[i - 2];
    const s2 = swings[i - 1];
    const s3 = swings[i];

    // Double Bottom: Trough - Peak - Trough (similar price)
    if (s1.type === 'TROUGH' && s2.type === 'PEAK' && s3.type === 'TROUGH') {
      const priceDiff = Math.abs(s1.price - s3.price) / s1.price;
      if (priceDiff < 0.03) {
        patterns.push({
          name: 'DOUBLE_BOTTOM',
          type: 'BULLISH',
          confidence: Math.max(50, 100 - priceDiff * 1000),
          startIndex: s1.index,
          endIndex: s3.index,
        });
      }
    }
    
    // Double Top: Peak - Trough - Peak (similar price)
    if (s1.type === 'PEAK' && s2.type === 'TROUGH' && s3.type === 'PEAK') {
        const priceDiff = Math.abs(s1.price - s3.price) / s1.price;
        if (priceDiff < 0.03) {
          patterns.push({
            name: 'DOUBLE_TOP',
            type: 'BEARISH',
            confidence: Math.max(50, 100 - priceDiff * 1000),
            startIndex: s1.index,
            endIndex: s3.index,
          });
        }
      }
  }
  
  return patterns;
}
