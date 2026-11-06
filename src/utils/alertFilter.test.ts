import test from 'node:test';
import assert from 'node:assert/strict';
import {
  determineVolatilityLevel,
  filterAlertList,
  DEFAULT_ALERT_FILTERS,
  isFilterActive,
  countActiveFilters,
  AlertItemData,
  AlertFilterCriteria,
} from './alertFilter.ts';

const SAMPLE_ALERTS: AlertItemData[] = [
  {
    id: '1',
    timestamp: Date.now() - 10000,
    symbol: 'NVDA',
    companyName: 'NVIDIA Corporation',
    type: 'BULLISH_TRIPLE',
    price: 128.5,
    score: 92,
    trigger: 130.0,
    stopLoss: 124.0,
    target2: 138.0,
    atr: 4.8,
    atrPercent: 3.73, // High volatility (>2%)
    volatilityLevel: 'high',
  },
  {
    id: '2',
    timestamp: Date.now() - 20000,
    symbol: 'AAPL',
    companyName: 'Apple Inc.',
    type: 'BULLISH_DOUBLE',
    price: 224.2,
    score: 75,
    trigger: 226.0,
    stopLoss: 220.0,
    target2: 232.0,
    atr: 3.2,
    atrPercent: 1.43, // Moderate volatility (1% - 2%)
    volatilityLevel: 'moderate',
  },
  {
    id: '3',
    timestamp: Date.now() - 30000,
    symbol: 'JNJ',
    companyName: 'Johnson & Johnson',
    type: 'BEARISH_TRIPLE',
    price: 162.0,
    score: 65,
    trigger: 160.5,
    stopLoss: 164.0,
    target2: 156.0,
    atr: 1.1,
    atrPercent: 0.68, // Low volatility (<1%)
    volatilityLevel: 'low',
  },
  {
    id: '4',
    timestamp: Date.now() - 40000,
    symbol: 'TSLA',
    companyName: 'Tesla, Inc.',
    type: 'BEARISH_DOUBLE',
    price: 248.0,
    score: 55,
    trigger: 244.0,
    stopLoss: 254.0,
    target2: 236.0,
    atr: 8.5,
    atrPercent: 3.42, // High volatility (>2%)
    volatilityLevel: 'high',
  },
];

test('determineVolatilityLevel classifies correctly', () => {
  assert.equal(determineVolatilityLevel(0.5), 'low');
  assert.equal(determineVolatilityLevel(0.99), 'low');
  assert.equal(determineVolatilityLevel(1.0), 'moderate');
  assert.equal(determineVolatilityLevel(1.85), 'moderate');
  assert.equal(determineVolatilityLevel(2.0), 'moderate');
  assert.equal(determineVolatilityLevel(2.01), 'high');
  assert.equal(determineVolatilityLevel(4.5), 'high');
  assert.equal(determineVolatilityLevel(undefined), 'moderate');
});

test('filterAlertList returns all alerts with default criteria', () => {
  const result = filterAlertList(SAMPLE_ALERTS, DEFAULT_ALERT_FILTERS);
  assert.equal(result.length, 4);
});

test('filterAlertList filters by minimum MACD quality score', () => {
  // Score >= 70 should match NVDA (92) and AAPL (75)
  const filters: AlertFilterCriteria = {
    ...DEFAULT_ALERT_FILTERS,
    minQualityScore: 70,
  };
  const result = filterAlertList(SAMPLE_ALERTS, filters);
  assert.equal(result.length, 2);
  assert.deepEqual(result.map((a) => a.symbol), ['NVDA', 'AAPL']);

  // Score >= 90 should only match NVDA (92)
  const eliteFilters: AlertFilterCriteria = {
    ...DEFAULT_ALERT_FILTERS,
    minQualityScore: 90,
  };
  const eliteResult = filterAlertList(SAMPLE_ALERTS, eliteFilters);
  assert.equal(eliteResult.length, 1);
  assert.equal(eliteResult[0].symbol, 'NVDA');

  // Score >= 95 should match 0
  const topFilters: AlertFilterCriteria = {
    ...DEFAULT_ALERT_FILTERS,
    minQualityScore: 95,
  };
  assert.equal(filterAlertList(SAMPLE_ALERTS, topFilters).length, 0);
});

test('filterAlertList filters by specific volatility levels', () => {
  // Only high volatility: NVDA and TSLA
  const highOnly: AlertFilterCriteria = {
    ...DEFAULT_ALERT_FILTERS,
    volatilityLevels: ['high'],
  };
  const highResult = filterAlertList(SAMPLE_ALERTS, highOnly);
  assert.equal(highResult.length, 2);
  assert.deepEqual(highResult.map((a) => a.symbol), ['NVDA', 'TSLA']);

  // Only low volatility: JNJ
  const lowOnly: AlertFilterCriteria = {
    ...DEFAULT_ALERT_FILTERS,
    volatilityLevels: ['low'],
  };
  const lowResult = filterAlertList(SAMPLE_ALERTS, lowOnly);
  assert.equal(lowResult.length, 1);
  assert.equal(lowResult[0].symbol, 'JNJ');

  // Moderate and High: NVDA, AAPL, TSLA
  const modHigh: AlertFilterCriteria = {
    ...DEFAULT_ALERT_FILTERS,
    volatilityLevels: ['moderate', 'high'],
  };
  const modHighResult = filterAlertList(SAMPLE_ALERTS, modHigh);
  assert.equal(modHighResult.length, 3);
  assert.ok(!modHighResult.some((a) => a.symbol === 'JNJ'));
});

test('filterAlertList combines min score and volatility filters', () => {
  // Score >= 70 AND High Volatility: Only NVDA (score 92, high vol)
  const combined: AlertFilterCriteria = {
    ...DEFAULT_ALERT_FILTERS,
    minQualityScore: 70,
    volatilityLevels: ['high'],
  };
  const result = filterAlertList(SAMPLE_ALERTS, combined);
  assert.equal(result.length, 1);
  assert.equal(result[0].symbol, 'NVDA');
});

test('filterAlertList supports divergence type and search filter', () => {
  // Bullish only
  const bullish: AlertFilterCriteria = {
    ...DEFAULT_ALERT_FILTERS,
    divergenceType: 'BULLISH',
  };
  const bullResult = filterAlertList(SAMPLE_ALERTS, bullish);
  assert.equal(bullResult.length, 2);
  assert.deepEqual(bullResult.map((a) => a.symbol), ['NVDA', 'AAPL']);

  // Triple only
  const triple: AlertFilterCriteria = {
    ...DEFAULT_ALERT_FILTERS,
    divergenceType: 'TRIPLE',
  };
  const tripleResult = filterAlertList(SAMPLE_ALERTS, triple);
  assert.equal(tripleResult.length, 2);
  assert.deepEqual(tripleResult.map((a) => a.symbol), ['NVDA', 'JNJ']);

  // Symbol query
  const querySearch: AlertFilterCriteria = {
    ...DEFAULT_ALERT_FILTERS,
    searchQuery: 'aapl',
  };
  const searchResult = filterAlertList(SAMPLE_ALERTS, querySearch);
  assert.equal(searchResult.length, 1);
  assert.equal(searchResult[0].symbol, 'AAPL');
});

test('isFilterActive and countActiveFilters track state changes correctly', () => {
  assert.equal(isFilterActive(DEFAULT_ALERT_FILTERS), false);
  assert.equal(countActiveFilters(DEFAULT_ALERT_FILTERS), 0);

  const modified: AlertFilterCriteria = {
    ...DEFAULT_ALERT_FILTERS,
    minQualityScore: 70,
    volatilityLevels: ['high'],
  };
  assert.equal(isFilterActive(modified), true);
  assert.equal(countActiveFilters(modified), 2);
});
