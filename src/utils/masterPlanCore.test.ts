import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  saveSettings,
  loadSettings,
  getRiskUsd,
  calculateLevels,
  canTrade,
  isNyseMarketOpen,
  DEFAULT_SETTINGS,
  clampSettingsBounds,
  toUserBotStateFirestoreFields,
  toUserBotStateUpdateFields,
  mergeCloudUserBotSettings,
} from './masterPlanCore.ts';

describe('TRULLAS Master Plan v3 Core Tests', () => {
  it('Settings dynamically recalibrates capital and risk without hardcoded constants', () => {
    // Initial default: $2,000 capital, 1.0% risk -> $20
    saveSettings({ simCapitalUsd: 2000, maxRiskPerTradePct: 1.0 });
    assert.strictEqual(getRiskUsd(), 20);

    // Acceptance criterion from prompt §1: change from $2,000 to $10,000 and 1% to 2%
    saveSettings({ simCapitalUsd: 10000, maxRiskPerTradePct: 2.0 });
    assert.strictEqual(getRiskUsd(), 200);

    // Reset back
    saveSettings(DEFAULT_SETTINGS);
    assert.strictEqual(getRiskUsd(), 20);
  });

  it('calculateLevels produces exact Levels object with proper Annex B schema', () => {
    const bars = [
      { o: 100, h: 102, l: 98, c: 101 },
      { o: 101, h: 103, l: 99, c: 102 },
      { o: 102, h: 104, l: 100, c: 103 },
    ];

    const levels = calculateLevels({
      symbol: 'AAPL',
      direction: 'long',
      currentPrice: 100,
      atr14: 2.5,
      recentBars: bars,
    });

    assert.strictEqual(levels.symbol, 'AAPL');
    assert.strictEqual(levels.direction, 'long');
    assert.ok(levels.stop.price < 100);
    assert.ok(levels.targets[0].price > 100);
    assert.strictEqual(levels.stopTooWide, false);
    assert.ok(levels.rr > 0);
  });

  it('canTrade executes the 10 checks and blocks when stop is too wide (>3x ATR)', () => {
    const bars = [{ o: 100, h: 102, l: 70, c: 100 }];
    const wideLevels = calculateLevels({
      symbol: 'TEST',
      direction: 'long',
      currentPrice: 100,
      atr14: 2.0, // 3x ATR is 6.0, but stop from low=70 will be ~30 away (>3x ATR)
      recentBars: bars,
    });

    assert.strictEqual(wideLevels.stopTooWide, true);

    const gate = canTrade({
      symbol: 'TEST',
      direction: 'long',
      setupScore: 80,
      levels: wideLevels,
      currentPrice: 100,
      marketOpenOverride: true,
      customSettings: {
        ...DEFAULT_SETTINGS,
        dataQuality: 'live',
        botStatus: 'armed',
      },
    });

    assert.strictEqual(gate.allow, false);
    const sizeFail = gate.fails.find((f) => f.shortName === 'size_min');
    assert.ok(sizeFail);
    assert.ok(sizeFail.detail.includes('Stop too wide'));
  });

  it('canTrade allows valid setup when all 10 checks pass', () => {
    const bars = [
      { o: 100, h: 101, l: 99, c: 100 },
      { o: 100, h: 102, l: 99.2, c: 101 },
    ];
    const normalLevels = calculateLevels({
      symbol: 'NVDA',
      direction: 'long',
      currentPrice: 100,
      atr14: 2.0,
      recentBars: bars,
    });

    const gate = canTrade({
      symbol: 'NVDA',
      direction: 'long',
      setupScore: 85,
      levels: normalLevels,
      currentPrice: 100,
      marketOpenOverride: true,
      regimeScore: 75, // Risk-on
      customSettings: {
        ...DEFAULT_SETTINGS,
        simCapitalUsd: 5000,
        maxRiskPerTradePct: 2.0, // Max risk = $100
        dataQuality: 'live',
        botStatus: 'armed',
      },
    });

    assert.strictEqual(gate.allow, true);
    assert.strictEqual(gate.fails.length, 0);
    assert.ok(gate.suggestedQty >= 1);
  });

  it('isNyseMarketOpen honors NYSE holidays and 1:00 PM ET early close', () => {
    // Thanksgiving 2026 at 11:00 AM ET (16:00 UTC) must be closed
    const thanksgivingMidday = new Date('2026-11-26T16:00:00Z');
    const holidayStatus = isNyseMarketOpen(thanksgivingMidday);
    assert.strictEqual(holidayStatus.isOpen, false);

    // Day after Thanksgiving 2026 at 14:00 ET (19:00 UTC) must be afterhours/closed (13:00 ET early close)
    const earlyCloseAfter = new Date('2026-11-27T19:00:00Z');
    const earlyStatus = isNyseMarketOpen(earlyCloseAfter);
    assert.strictEqual(earlyStatus.isOpen, false);
    assert.strictEqual(earlyStatus.sessionName, 'AFTERHOURS');
  });

  it('canTrade gate checks emit English shortNames and details', () => {
    const levels = calculateLevels({
      symbol: 'AAPL',
      direction: 'long',
      currentPrice: 100,
      atr14: 2.0,
      recentBars: [{ o: 100, h: 101, l: 99, c: 100 }],
      dataQuality: 'cached',
    });
    const gate = canTrade({
      symbol: 'AAPL',
      direction: 'long',
      setupScore: 80,
      levels,
      currentPrice: 100,
      marketOpenOverride: false,
      customSettings: { ...DEFAULT_SETTINGS, dataQuality: 'cached' },
    });
    assert.strictEqual(gate.checks[1].shortName, 'data_feed');
    assert.strictEqual(gate.checks[0].name, 'NYSE Calendar Open');
  });

  it('clampSettingsBounds enforces Firestore schema boundaries and truncates activeEpochId', () => {
    const clamped = clampSettingsBounds({
      simCapitalUsd: 999_999_999,
      maxRiskPerTradePct: -5,
      dailyLossLimitPct: 150,
      maxSectorExposurePct: -10,
      botStatus: 'invalid_state' as any,
      dataQuality: 'bogus' as any,
      activeEpochId: 'e'.repeat(90),
    });

    assert.strictEqual(clamped.simCapitalUsd, 100_000_000);
    assert.strictEqual(clamped.maxRiskPerTradePct, DEFAULT_SETTINGS.maxRiskPerTradePct);
    assert.strictEqual(clamped.dailyLossLimitPct, 100);
    assert.strictEqual(clamped.maxSectorExposurePct, 0);
    assert.strictEqual(clamped.botStatus, 'armed');
    assert.strictEqual(clamped.dataQuality, 'live');
    assert.strictEqual(clamped.activeEpochId.length, 64);
  });

  it('toUserBotStateFirestoreFields and toUserBotStateUpdateFields omit dataQuality and enforce allowed keys', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      simCapitalUsd: 15000,
      maxRiskPerTradePct: 1.5,
      dataQuality: 'cached' as const,
      botStatus: 'paused' as const,
    };

    const createFields = toUserBotStateFirestoreFields(settings, 'uid-abc-123');
    assert.strictEqual(createFields.ownerId, 'uid-abc-123');
    assert.strictEqual(createFields.simCapitalUsd, 15000);
    assert.strictEqual(createFields.maxRiskPerTradePct, 1.5);
    assert.strictEqual(createFields.botStatus, 'paused');
    assert.strictEqual('dataQuality' in createFields, false);

    const updateFields = toUserBotStateUpdateFields(settings);
    assert.strictEqual('ownerId' in updateFields, false);
    assert.strictEqual('createdAt' in updateFields, false);
    assert.strictEqual('dataQuality' in updateFields, false);
    assert.deepStrictEqual(
      Object.keys(updateFields).sort(),
      [
        'activeEpochId',
        'botStatus',
        'dailyLossLimitPct',
        'maxRiskPerTradePct',
        'maxSectorExposurePct',
        'simCapitalUsd',
      ]
    );
  });

  it('mergeCloudUserBotSettings merges cloud fields while preserving local dataQuality', () => {
    const local = {
      ...DEFAULT_SETTINGS,
      simCapitalUsd: 2000,
      dataQuality: 'cached' as const,
      botStatus: 'armed' as const,
    };
    const merged = mergeCloudUserBotSettings(local, {
      simCapitalUsd: 25000,
      maxRiskPerTradePct: 0.75,
      botStatus: 'paused',
    });

    assert.strictEqual(merged.simCapitalUsd, 25000);
    assert.strictEqual(merged.maxRiskPerTradePct, 0.75);
    assert.strictEqual(merged.botStatus, 'paused');
    assert.strictEqual(merged.dataQuality, 'cached');
  });

  it('canTrade blocks new entries when DrawdownCircuitBreakerReport is COOLDOWN or HALTED', () => {
    const levels = calculateLevels({
      symbol: 'NVDA',
      direction: 'long',
      currentPrice: 100,
      atr14: 2.0,
      recentBars: [{ o: 100, h: 101, l: 99, c: 100 }],
    });
    const gate = canTrade({
      symbol: 'NVDA',
      direction: 'long',
      setupScore: 90,
      levels,
      currentPrice: 100,
      marketOpenOverride: true,
      regimeScore: 75,
      customSettings: { ...DEFAULT_SETTINGS, simCapitalUsd: 10000, dataQuality: 'live', botStatus: 'armed' },
      circuitBreaker: {
        status: 'COOLDOWN',
        allowNewTrades: false,
        sizeMultiplier: 0,
        etDateKey: '2026-11-25',
        etWeekStartKey: '2026-11-23',
        etMonthKey: '2026-11',
        dailyPnlUsd: -40,
        dailyDrawdownPct: 0.4,
        weeklyPnlUsd: -80,
        weeklyDrawdownPct: 0.8,
        monthlyPnlUsd: -80,
        monthlyDrawdownPct: 0.8,
        consecutiveLosses: 2,
        cooldownActive: true,
        cooldownRemainingHours: 18.5,
        triggers: ['2 consecutive losses — 18.5h cooldown active'],
        summary: '2 consecutive losses — 18.5h cooldown active',
      },
    });
    assert.strictEqual(gate.allow, false);
    assert.strictEqual(gate.suggestedQty, 0);
    const cbFail = gate.fails.find((f) => f.number === 4);
    assert.ok(cbFail);
    assert.ok(cbFail.detail.includes('COOLDOWN'));
  });
});


