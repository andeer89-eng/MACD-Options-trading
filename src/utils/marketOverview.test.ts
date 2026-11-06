import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateMarketOverview,
  classifyRsiCategory,
  WatchlistConstituent,
} from './marketOverview.ts';

test('calculateMarketOverview handles empty watchlist gracefully', () => {
  const result = calculateMarketOverview([]);
  assert.equal(result.totalTickers, 0);
  assert.equal(result.totalSignals, 0);
  assert.equal(result.bullishSignalsCount, 0);
  assert.equal(result.bearishSignalsCount, 0);
  assert.equal(result.averageVolatilityAtrPct, 0);
  assert.equal(result.topByRsiStrength.length, 0);
});

test('calculateMarketOverview aggregates bullish vs bearish counts, volatility, and RSI rankings accurately', () => {
  const mockItems: WatchlistConstituent[] = [
    {
      symbol: 'NVDA',
      companyName: 'NVIDIA Corporation',
      sector: 'Information Technology',
      currentPrice: 125.0,
      changePercent: 3.5,
      rsi: 76.5, // Overbought / Momentum leader
      atrPercent: 3.2,
      isStagnant: false,
      setups: [{ type: 'BULLISH_TRIPLE', qualityScore: 92, triggerPrice: 126, stopLoss: 120 }],
    },
    {
      symbol: 'AAPL',
      companyName: 'Apple Inc.',
      sector: 'Information Technology',
      currentPrice: 220.0,
      changePercent: 1.2,
      rsi: 62.0,
      atrPercent: 1.8,
      isStagnant: false,
      setups: [{ type: 'BULLISH_DOUBLE', qualityScore: 78, triggerPrice: 222, stopLoss: 216 }],
    },
    {
      symbol: 'TSLA',
      companyName: 'Tesla, Inc.',
      sector: 'Consumer Discretionary',
      currentPrice: 245.0,
      changePercent: -2.8,
      rsi: 28.4, // Oversold
      atrPercent: 4.1,
      isStagnant: false,
      setups: [{ type: 'BEARISH_TRIPLE', qualityScore: 85, triggerPrice: 240, stopLoss: 252 }],
    },
    {
      symbol: 'KO',
      companyName: 'The Coca-Cola Company',
      sector: 'Consumer Staples',
      currentPrice: 65.0,
      changePercent: -0.2,
      rsi: 48.0,
      atrPercent: 0.8, // Low volatility
      isStagnant: true,
      setups: [],
    },
  ];

  const overview = calculateMarketOverview(mockItems);

  assert.equal(overview.totalTickers, 4);
  assert.equal(overview.totalSignals, 3);
  assert.equal(overview.bullishSignalsCount, 2);
  assert.equal(overview.bearishSignalsCount, 1);
  assert.equal(overview.stagnantAssetsCount, 1); // KO
  assert.ok(overview.bullishRatioPercent > 60); // 2/3 = 66.7%
  assert.equal(overview.marketSentiment, 'Bullish Lean');

  // Volatility: (3.2 + 1.8 + 4.1 + 0.8) / 4 = 9.9 / 4 = 2.475 -> 2.48%
  assert.equal(overview.averageVolatilityAtrPct, 2.48);

  // Top by RSI strength should rank NVDA (76.5) first
  assert.equal(overview.topByRsiStrength[0].symbol, 'NVDA');
  assert.equal(overview.topByRsiStrength[0].rsi, 76.5);
  assert.equal(overview.topByRsiStrength[0].category, 'Overbought / Momentum');

  // Oversold opportunities should include TSLA (28.4)
  assert.equal(overview.oversoldOpportunities.length, 1);
  assert.equal(overview.oversoldOpportunities[0].symbol, 'TSLA');
  assert.equal(overview.oversoldOpportunities[0].rsi, 28.4);
});

test('classifyRsiCategory categorizes RSI zones correctly', () => {
  assert.equal(classifyRsiCategory(75), 'Overbought / Momentum');
  assert.equal(classifyRsiCategory(60), 'Bullish Zone');
  assert.equal(classifyRsiCategory(50), 'Neutral');
  assert.equal(classifyRsiCategory(30), 'Oversold / Demand');
});
