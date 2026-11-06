import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runBacktest, BacktestConfig } from './backtestEngine.ts';
import { Candle } from './trullasStrategy.ts';

describe('Trullàs Backtest Engine & LuxAlgo Journal-Core Integration', () => {
  // Generate synthetic candles with multiple wave troughs
  function generateTestCandles(count: number = 120): Candle[] {
    const candles: Candle[] = [];
    const baseTime = Date.now() - count * 24 * 60 * 60 * 1000;
    const basePrice = 150;

    for (let i = 0; i < count; i++) {
      const time = baseTime + i * 24 * 60 * 60 * 1000;
      const dateStr = new Date(time).toISOString().split('T')[0];

      // Create wavy structure with swing lows and highs
      const cycle = Math.sin((i / 8) * Math.PI) * 12;
      const trend = (i / count) * 15;
      const close = basePrice + cycle + trend;
      const high = close + 2.5;
      const low = close - 2.5;
      const open = close - 0.5;
      const volume = 2000000 + Math.floor(Math.sin(i) * 500000);

      candles.push({
        timestamp: time,
        dateStr,
        open: Number(open.toFixed(2)),
        high: Number(high.toFixed(2)),
        low: Number(low.toFixed(2)),
        close: Number(close.toFixed(2)),
        volume,
      });
    }
    return candles;
  }

  it('should initialize and run backtest without crashing on valid candle series', () => {
    const candles = generateTestCandles(120);
    const config: BacktestConfig = {
      symbol: 'AAPL',
      timeframe: '1d',
      range: '6mo',
      initialBalance: 10000,
      riskPerTradePct: 1.5,
      targetMode: 'tranches',
      minQualityScore: 50,
    };

    const result = runBacktest(candles, config);

    assert.equal(result.symbol, 'AAPL');
    assert.equal(result.candleCount, 120);
    assert.ok(result.startDate.length > 0);
    assert.ok(result.endDate.length > 0);
    assert.ok(result.metrics !== undefined);
    assert.ok(result.edgeScore !== undefined);
    assert.ok(Array.isArray(result.trades));
  });

  it('should handle small candle dataset gracefully', () => {
    const smallCandles = generateTestCandles(10);
    const config: BacktestConfig = {
      symbol: 'MSFT',
      timeframe: '1d',
      range: '1mo',
      initialBalance: 10000,
      riskPerTradePct: 1.0,
      targetMode: 'tranches',
      minQualityScore: 60,
    };

    const result = runBacktest(smallCandles, config);
    assert.equal(result.candleCount, 10);
    assert.equal(result.trades.length, 0);
    assert.equal(result.metrics.totalTrades, 0);
  });

  it('should compute valid LuxAlgo metrics structure', () => {
    const candles = generateTestCandles(150);
    const config: BacktestConfig = {
      symbol: 'NVDA',
      timeframe: '1d',
      range: '1y',
      initialBalance: 25000,
      riskPerTradePct: 2.0,
      targetMode: 'tp2',
      minQualityScore: 55,
    };

    const result = runBacktest(candles, config);
    assert.ok(typeof result.metrics.totalTrades === 'number');
    assert.ok(typeof result.metrics.netPnl === 'number');
    assert.ok(result.edgeScore.version >= 1);
  });
});
