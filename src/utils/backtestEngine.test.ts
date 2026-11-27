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

  it('simulates TOS TTM Squeeze + 13/21/34 EMA Stack trades when squeeze releases into uptrend', () => {
    const baseTime = Date.UTC(2026, 0, 2, 14, 30, 0);
    const candles: Candle[] = [];
    // Phase 1: gentle steady uptrend (bars 0-44) -> aligns EMA 13 > 21 > 34
    // Phase 2: tight squeeze coil (bars 45-64) -> BB inside KC for >= 5 bars
    // Phase 3: breakout rally (bars 65-95) -> fires squeeze + hits TP1/TP2
    for (let i = 0; i < 95; i++) {
      let close = 100 + i * 0.4;
      let spread = 1.6;
      if (i >= 45 && i <= 64) {
        close = 118 + Math.sin(i * 0.5) * 0.08;
        spread = 0.25;
      } else if (i > 64) {
        close = 118.5 + (i - 64) * 1.1;
        spread = 1.4;
      }
      candles.push({
        timestamp: baseTime + i * 86400000,
        dateStr: new Date(baseTime + i * 86400000).toISOString().split('T')[0],
        open: Number((close - 0.1).toFixed(2)),
        high: Number((close + spread).toFixed(2)),
        low: Number((close - spread).toFixed(2)),
        close: Number(close.toFixed(2)),
        volume: 1_500_000,
      });
    }

    const result = runBacktest(candles, {
      symbol: 'QQQ',
      timeframe: '1d',
      range: '1y',
      initialBalance: 10000,
      riskPerTradePct: 1.5,
      targetMode: 'tranches',
      minQualityScore: 55,
      strategyMode: 'ttm_squeeze_stack',
    });

    assert.ok(result.trades.length >= 1, 'Expected at least 1 TTM Squeeze trade');
    assert.ok(result.trades.some((t) => t.setupType === 'TTM_SQUEEZE_LONG'));
    for (const trade of result.trades) {
      assert.equal(
        trade.entryPrice,
        candles[trade.entryIndex].open,
        'TTM/EMA signal must fill at the next candle open, not the signal candle close'
      );
    }
    const closed = result.trades.filter((t) => t.status !== 'open');
    for (const t of closed) {
      assert.equal(Number((t.grossPnl - t.feeAndSlippageDollars).toFixed(2)), t.netPnl);
    }
  });

  it('simulates TOS Stacked EMA (8/21/34/50) Pullback entries on dip-and-reclaim', () => {
    const baseTime = Date.UTC(2026, 0, 2, 14, 30, 0);
    const candles: Candle[] = [];
    for (let i = 0; i < 110; i++) {
      let close = 100 + i * 0.8;
      let low = close - 0.9;
      let high = close + 0.9;
      // Pullback around bar 75 touching 21 EMA zone (~155), then bar 76 closes strongly above prev high
      if (i === 75) {
        close = 152.5;
        low = 149.0;
        high = 154.0;
      } else if (i === 76) {
        close = 160.5;
        low = 153.0;
        high = 161.2;
      }
      candles.push({
        timestamp: baseTime + i * 86400000,
        dateStr: new Date(baseTime + i * 86400000).toISOString().split('T')[0],
        open: Number((close - 0.3).toFixed(2)),
        high: Number(high.toFixed(2)),
        low: Number(low.toFixed(2)),
        close: Number(close.toFixed(2)),
        volume: 1_200_000,
      });
    }

    const result = runBacktest(candles, {
      symbol: 'NVDA',
      timeframe: '1d',
      range: '1y',
      initialBalance: 10000,
      riskPerTradePct: 1.5,
      targetMode: 'tranches',
      minQualityScore: 55,
      strategyMode: 'stacked_ema_pullback',
    });

    assert.ok(result.trades.length >= 1, 'Expected at least 1 Stacked EMA Pullback trade');
    assert.ok(result.trades.some((t) => t.setupType === 'EMA_PULLBACK_LONG'));
    for (const trade of result.trades) {
      assert.equal(
        trade.entryPrice,
        candles[trade.entryIndex].open,
        'EMA pullback signal must fill at the next candle open, not the signal candle close'
      );
    }
    assert.ok(result.ruleAttribution.length >= 1);
  });

  it('books 50% TP1 partial profit in tranches mode when price hits TP1 then reverses to breakeven stop', () => {
    const baseTime = Date.UTC(2026, 0, 2, 14, 30, 0);
    const candles: Candle[] = [];
    for (let i = 0; i < 95; i++) {
      let close = 100 + i * 0.4;
      let high = close + 1.2;
      let low = close - 1.2;
      if (i >= 45 && i <= 64) {
        close = 117.5;
        high = 117.9;
        low = 117.1;
      } else if (i === 65) {
        // Trigger squeeze release entry near 119.0
        close = 119.0;
        high = 119.4;
        low = 117.6;
      } else if (i === 66) {
        // Next-open entry is around 121.70; hit TP1 without touching the initial stop or TP2.
        close = 121.8;
        high = 124.0;
        low = 121.0;
      } else if (i === 67) {
        // Reverse through the entry after TP1 so the remaining tranche exits at breakeven.
        close = 121.8;
        high = 122.4;
        low = 119.5;
      } else if (i >= 68) {
        // Continue reversing after the breakeven stop has been crossed.
        close = Math.max(108, 118.5 - (i - 68) * 1.2);
        high = close + 0.4;
        low = close - 1.2;
      }
      candles.push({
        timestamp: baseTime + i * 86400000,
        dateStr: new Date(baseTime + i * 86400000).toISOString().split('T')[0],
        open: Number((close - 0.1).toFixed(2)),
        high: Number(high.toFixed(2)),
        low: Number(low.toFixed(2)),
        close: Number(close.toFixed(2)),
        volume: 1_500_000,
      });
    }

    const result = runBacktest(candles, {
      symbol: 'QQQ',
      timeframe: '1d',
      range: '1y',
      initialBalance: 10000,
      riskPerTradePct: 2.0,
      targetMode: 'tranches',
      minQualityScore: 50,
      strategyMode: 'ttm_squeeze_stack',
    });

    const partialThenBe = result.trades.find((t) => t.exitReason === 'BREAKEVEN');
    assert.ok(partialThenBe, 'Expected a trade that scaled 50% at TP1 and exited runner at breakeven');
    assert.equal(
      partialThenBe.entryPrice,
      candles[partialThenBe.entryIndex].open,
      'Partial-tranche setup must also use the next candle open'
    );
    assert.ok(partialThenBe.grossPnl > 0, `Expected TP1 50% tranche profit > 0 even when runner hits BE, got ${partialThenBe.grossPnl}`);
    assert.equal(
      Number((partialThenBe.grossPnl - partialThenBe.feeAndSlippageDollars).toFixed(2)),
      partialThenBe.netPnl
    );
  });
});

