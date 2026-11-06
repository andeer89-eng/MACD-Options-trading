import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatDivergenceTelegramAlert,
  loadTelegramConfig,
  DEFAULT_TELEGRAM_CONFIG,
} from './telegramAlerts.ts';
import { DivergenceSetup } from './trullasStrategy.ts';

test('formatDivergenceTelegramAlert creates HTML formatted message with key levels', () => {
  const mockSetup: DivergenceSetup = {
    id: 'setup-1',
    symbol: 'NVDA',
    timeframe: '1d',
    type: 'BULLISH_TRIPLE',
    qualityScore: 94,
    points: [],
    currentPrice: 124.5,
    triggerPrice: 126.0,
    stopLoss: 120.0,
    fibLevels: { fib0: 120, fib236: 126, fib382: 132, fib500: 135, fib618: 138, fib1000: 145 },
    targets: { tp1: 132, tp2: 138, tp3: 145 },
    riskRewardRatio: 2.3,
    confluenceChecks: { priceDivergence: true, macdDivergence: true, rsiDivergence: true, volumeExhaustion: true, macdCrossConfirmed: true },
    scalingTranches: { tranche1: '33%', tranche2: '33%', tranche3: '34%' },
    detectedAt: Date.now(),
  };

  const msg = formatDivergenceTelegramAlert(mockSetup);

  assert.ok(msg.includes('TRULLÀS MACD ALERT: NVDA'));
  assert.ok(msg.includes('94%'));
  assert.ok(msg.includes('$126.00'));
  assert.ok(msg.includes('$120.00'));
  assert.ok(msg.includes('$138.00'));
});

test('loadTelegramConfig returns default config if uninitialized', () => {
  const config = loadTelegramConfig();
  assert.equal(config.enabled, false);
  assert.equal(config.notifyMinQualityScore, 70);
});
