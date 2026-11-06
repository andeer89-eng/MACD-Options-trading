import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateTradeAdvice,
  filterTradeAdviceList,
  getActionZoneMeta,
  DEFAULT_TRADE_FILTERS,
  TradeAdvice,
} from './tradeActionEngine.ts';
import { Candle, DivergenceSetup } from './trullasStrategy.ts';

function createMockCandles(base: number, length: number = 50): Candle[] {
  const candles: Candle[] = [];
  const now = Date.now();
  for (let i = 0; i < length; i++) {
    candles.push({
      timestamp: now - (length - i) * 86400000,
      dateStr: new Date(now - (length - i) * 86400000).toISOString().split('T')[0],
      open: base + Math.sin(i / 3) * 2,
      high: base + Math.sin(i / 3) * 2 + 1,
      low: base + Math.sin(i / 3) * 2 - 1,
      close: base + Math.sin(i / 3) * 2 + 0.5,
      volume: 2000000,
    });
  }
  return candles;
}

test('evaluateTradeAdvice classifies PRE_BREAKOUT when coiled beneath trigger', () => {
  const candles = createMockCandles(99, 50);
  const setup: DivergenceSetup = {
    id: 'test-setup-1',
    symbol: 'AAPL',
    timeframe: '1d',
    type: 'BULLISH_TRIPLE',
    qualityScore: 88,
    points: [],
    currentPrice: 99.2,
    triggerPrice: 100.0, // 0.8% away (< 2%)
    stopLoss: 95.0,
    fibLevels: { fib0: 95, fib236: 100, fib382: 105, fib500: 108, fib618: 112, fib1000: 120 },
    targets: { tp1: 105, tp2: 112, tp3: 120 },
    riskRewardRatio: 2.4,
    confluenceChecks: { priceDivergence: true, macdDivergence: true, rsiDivergence: true, volumeExhaustion: true, macdCrossConfirmed: true },
    scalingTranches: { tranche1: '33%', tranche2: '33%', tranche3: '34%' },
    detectedAt: Date.now(),
  };

  const advice = evaluateTradeAdvice('AAPL', candles, setup);
  assert.equal(advice.actionZone, 'PRE_BREAKOUT');
  assert.equal(advice.triggerPrice, 100.0);
  assert.ok(advice.confidenceScore >= 80);
});

test('evaluateTradeAdvice classifies BREAKOUT_CONFIRMED when freshly crossing trigger', () => {
  const candles = createMockCandles(101, 50);
  const setup: DivergenceSetup = {
    id: 'test-setup-2',
    symbol: 'NVDA',
    timeframe: '1d',
    type: 'BULLISH_TRIPLE',
    qualityScore: 92,
    points: [],
    currentPrice: 101.2, // 1.2% above 100 trigger
    triggerPrice: 100.0,
    stopLoss: 96.0,
    fibLevels: { fib0: 96, fib236: 100, fib382: 106, fib500: 110, fib618: 115, fib1000: 122 },
    targets: { tp1: 106, tp2: 115, tp3: 122 },
    riskRewardRatio: 3.75,
    confluenceChecks: { priceDivergence: true, macdDivergence: true, rsiDivergence: true, volumeExhaustion: true, macdCrossConfirmed: true },
    scalingTranches: { tranche1: '33%', tranche2: '33%', tranche3: '34%' },
    detectedAt: Date.now(),
  };

  const advice = evaluateTradeAdvice('NVDA', candles, setup);
  assert.equal(advice.actionZone, 'BREAKOUT_CONFIRMED');
  assert.ok(advice.rationale.length > 0);
});

test('evaluateTradeAdvice classifies LATE_TO_BUY when extended past TP1', () => {
  const candles = createMockCandles(109, 50);
  const setup: DivergenceSetup = {
    id: 'test-setup-3',
    symbol: 'TSLA',
    timeframe: '1d',
    type: 'BULLISH_TRIPLE',
    qualityScore: 78,
    points: [],
    currentPrice: 109.0, // Well above tp1: 105
    triggerPrice: 100.0,
    stopLoss: 95.0,
    fibLevels: { fib0: 95, fib236: 100, fib382: 105, fib500: 108, fib618: 112, fib1000: 120 },
    targets: { tp1: 105, tp2: 112, tp3: 120 },
    riskRewardRatio: 2.4,
    confluenceChecks: { priceDivergence: true, macdDivergence: true, rsiDivergence: true, volumeExhaustion: true, macdCrossConfirmed: true },
    scalingTranches: { tranche1: '33%', tranche2: '33%', tranche3: '34%' },
    detectedAt: Date.now(),
  };

  const advice = evaluateTradeAdvice('TSLA', candles, setup);
  assert.equal(advice.actionZone, 'LATE_TO_BUY');
  assert.ok(advice.headline.includes('Late to Buy'));
});

test('filterTradeAdviceList filters by zone and search query', () => {
  const sampleList: TradeAdvice[] = [
    {
      symbol: 'AAPL',
      companyName: 'Apple Inc.',
      sector: 'Information Technology',
      currentPrice: 224,
      actionZone: 'PRE_BREAKOUT',
      headline: 'Pre-breakout',
      subAdvice: '',
      confidenceScore: 85,
      triggerPrice: 226,
      distanceToTriggerPct: -0.8,
      stopLoss: 220,
      target1: 230,
      target2: 236,
      riskRewardRatio: 2.0,
      trullasSetup: null,
      luxAlgoConfluenceScore: 80,
      nweBandPosition: 'INSIDE_CHANNEL',
      smcZone: 'DISCOUNT',
      hasActiveOrderBlock: true,
      rationale: [],
      keyRisks: [],
      suggestedAction: '',
    },
    {
      symbol: 'MSFT',
      companyName: 'Microsoft Corporation',
      sector: 'Information Technology',
      currentPrice: 420,
      actionZone: 'LATE_TO_BUY',
      headline: 'Late',
      subAdvice: '',
      confidenceScore: 70,
      triggerPrice: 400,
      distanceToTriggerPct: 5.0,
      stopLoss: 390,
      target1: 415,
      target2: 430,
      riskRewardRatio: 1.0,
      trullasSetup: null,
      luxAlgoConfluenceScore: 75,
      nweBandPosition: 'UPPER_SUPPLY',
      smcZone: 'PREMIUM',
      hasActiveOrderBlock: false,
      rationale: [],
      keyRisks: [],
      suggestedAction: '',
    },
  ];

  const filtered = filterTradeAdviceList(sampleList, {
    ...DEFAULT_TRADE_FILTERS,
    zones: ['PRE_BREAKOUT'],
  });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].symbol, 'AAPL');

  const filteredQuery = filterTradeAdviceList(sampleList, {
    ...DEFAULT_TRADE_FILTERS,
    searchQuery: 'MSFT',
  });
  assert.equal(filteredQuery.length, 1);
  assert.equal(filteredQuery[0].symbol, 'MSFT');
});

test('getActionZoneMeta returns valid styling for all 7 zones', () => {
  const zones: TradeAdvice['actionZone'][] = [
    'STRONG_BUY',
    'PRE_BREAKOUT',
    'BREAKOUT_CONFIRMED',
    'HOLD_PROFIT',
    'LATE_TO_BUY',
    'SELL_TAKE_PROFIT',
    'NEUTRAL_CHOP',
  ];

  for (const z of zones) {
    const meta = getActionZoneMeta(z);
    assert.ok(meta.label.length > 0);
    assert.ok(meta.badgeBg.length > 0);
    assert.ok(meta.textColor.length > 0);
  }
});
