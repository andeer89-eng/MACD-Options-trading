import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computePositionSizeFromSetup,
  DEFAULT_RISK_SETTINGS,
  RiskSettings,
} from './riskSettings.ts';
import { DivergenceSetup } from './trullasStrategy.ts';

test('computePositionSizeFromSetup calculates shares accurately based on SL distance', () => {
  const mockSetup: DivergenceSetup = {
    id: 'test-1',
    symbol: 'AAPL',
    timeframe: '1d',
    type: 'BULLISH_TRIPLE',
    qualityScore: 90,
    points: [],
    currentPrice: 198,
    triggerPrice: 200, // Entry = $200
    stopLoss: 190,     // SL = $190, distance = $10
    fibLevels: { fib0: 190, fib236: 200, fib382: 210, fib500: 215, fib618: 220, fib1000: 230 },
    targets: { tp1: 210, tp2: 220, tp3: 230 },
    riskRewardRatio: 2.0,
    confluenceChecks: { priceDivergence: true, macdDivergence: true, rsiDivergence: true, volumeExhaustion: true, macdCrossConfirmed: true },
    scalingTranches: { tranche1: '33%', tranche2: '33%', tranche3: '34%' },
    detectedAt: Date.now(),
  };

  const settings: RiskSettings = {
    accountEquity: 50000,
    fixedRiskPercent: 1.0, // 1% = $500 risk budget
    maxPortfolioLeverage: 2.0,
    maxPositionCapDollar: 30000,
    maxRiskDollarCap: 1000,
  };

  const result = computePositionSizeFromSetup(mockSetup, settings);

  assert.equal(result.entryPrice, 200);
  assert.equal(result.stopLossPrice, 190);
  assert.equal(result.stopLossDistance, 10); // $200 - $190
  assert.equal(result.calculatedDollarRisk, 500); // 1% of $50k
  assert.equal(result.recommendedShares, 50); // $500 risk / $10 SL distance = 50 shares
  assert.equal(result.totalPositionValue, 10000); // 50 * $200 = $10,000
  assert.equal(result.portfolioWeightPercent, 20.0); // $10k / $50k = 20%
});
