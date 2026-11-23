import test from 'node:test';
import assert from 'node:assert/strict';
import type { Candle } from './trullasStrategy.ts';
import { analyzeMarketStructuralContext } from './marketStructuralContext.ts';
import { selectAlpacaEquityCandidates, type AlpacaOverviewDTO } from './alpacaJournalSync.ts';
import { DEFAULT_SETTINGS } from './masterPlanCore.ts';
import type { MarketHealthReport } from './marketHealthEngine.ts';

function buildStructuralCandles(params: {
  finalPrice: number;
  heavyVolumeCenter: number;
}): { daily: Candle[]; weekly: Candle[] } {
  const daily: Candle[] = [];
  const baseTs = Date.UTC(2026, 3, 1);

  // Construct 90 daily bars with massive traded volume clustered cleanly around heavyVolumeCenter ($100)
  // and sparse low-volume air pocket between $108 and $118
  for (let i = 0; i < 90; i++) {
    const ts = baseTs + i * 86_400_000;
    const dateStr = new Date(ts).toISOString().slice(0, 10);

    let close: number;
    let high: number;
    let low: number;
    let open: number;
    let volume: number;

    if (i < 55) {
      // Heavy institutional accumulation shelf around heavyVolumeCenter ($98-$102)
      const osc = Math.sin(i * 0.5) * 1.4;
      close = Number((params.heavyVolumeCenter + osc).toFixed(2));
      open = Number((close - 0.3).toFixed(2));
      high = Number((close + 0.9).toFixed(2));
      low = Number((close - 0.9).toFixed(2));
      volume = 12_000_000;
    } else if (i < 75) {
      // Fast low-volume vertical breakout creating an LVN gap ($104 -> $124)
      const step = (i - 54) * 1.05;
      close = Number((params.heavyVolumeCenter + 3 + step).toFixed(2));
      open = Number((close - 0.9).toFixed(2));
      high = Number((close + 0.5).toFixed(2));
      low = Number((open - 0.3).toFixed(2));
      volume = 350_000; // ultra low LVN
    } else if (i < 86) {
      // Secondary shelf around $125-$127 so middle ($106-$122) stays a true LVN air pocket
      const osc = Math.cos(i * 0.6) * 1.1;
      close = Number((params.heavyVolumeCenter + 26 + osc).toFixed(2));
      open = Number((close - 0.2).toFixed(2));
      high = Number((close + 0.8).toFixed(2));
      low = Number((close - 0.8).toFixed(2));
      volume = 8_500_000;
    } else {
      // Approach finalPrice at the tail
      const t = (i - 85) / 4;
      const startTail = params.heavyVolumeCenter + 25;
      close = Number((startTail + (params.finalPrice - startTail) * t).toFixed(2));
      open = Number((close + (params.finalPrice < startTail ? 0.8 : -0.4)).toFixed(2));
      high = Number((Math.max(open, close) + 0.6).toFixed(2));
      low = Number((Math.min(open, close) - 0.6).toFixed(2));
      volume = i === 89 ? 6_000_000 : 1_200_000;
    }

    daily.push({ timestamp: ts, dateStr, open, high, low, close, volume });
  }

  // Group into 25 weekly bars covering similar HVN / LVN distribution
  const weekly: Candle[] = [];
  const wkBase = Date.UTC(2026, 0, 5);
  for (let w = 0; w < 25; w++) {
    const ts = wkBase + w * 7 * 86_400_000;
    const dateStr = new Date(ts).toISOString().slice(0, 10);
    let close: number;
    let high: number;
    let low: number;
    let open: number;
    let volume: number;
    if (w < 15) {
      close = params.heavyVolumeCenter + Math.sin(w) * 1.1;
      open = close - 0.5;
      high = close + 1.1;
      low = close - 1.1;
      volume = 55_000_000;
    } else if (w < 19) {
      close = params.heavyVolumeCenter + 3 + (w - 14) * 5.0;
      open = close - 4.0;
      high = close + 0.6;
      low = open - 0.5;
      volume = 1_500_000;
    } else if (w < 24) {
      close = params.heavyVolumeCenter + 26 + Math.cos(w) * 0.9;
      open = close - 0.4;
      high = close + 1.0;
      low = close - 1.0;
      volume = 40_000_000;
    } else {
      close = params.finalPrice;
      open = params.finalPrice + 1.0;
      high = open + 0.8;
      low = close - 0.8;
      volume = 18_000_000;
    }
    weekly.push({
      timestamp: ts,
      dateStr,
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      volume,
    });
  }

  return { daily, weekly };
}

test('analyzeMarketStructuralContext identifies AT_INSTITUTIONAL_BUY_ZONE vs IN_VOLUME_GAP vs BELOW_STRUCTURAL_SUPPORT', () => {
  // 1) Spot sitting right on heavy HVN shelf ($100) -> AT_INSTITUTIONAL_BUY_ZONE
  const atZoneData = buildStructuralCandles({ finalPrice: 100.2, heavyVolumeCenter: 100 });
  const atZone = analyzeMarketStructuralContext({
    symbol: 'QQQ',
    dailyCandles: atZoneData.daily,
    weeklyCandles: atZoneData.weekly,
  });
  assert.ok(atZone !== null);
  assert.equal(atZone.regime, 'AT_INSTITUTIONAL_BUY_ZONE');
  assert.ok(atZone.institutionalBuyZone !== null);
  assert.ok(atZone.institutionalBuyZone.low <= 101 && atZone.institutionalBuyZone.high >= 99);
  assert.ok(atZone.recommendedPutFloor !== null && atZone.recommendedPutFloor <= atZone.spotPrice);

  // 2) Spot suspended inside the sparse LVN pocket ($113) -> IN_VOLUME_GAP
  const inGapData = buildStructuralCandles({ finalPrice: 113.0, heavyVolumeCenter: 100 });
  const inGap = analyzeMarketStructuralContext({
    symbol: 'QQQ',
    dailyCandles: inGapData.daily,
    weeklyCandles: inGapData.weekly,
  });
  assert.ok(inGap !== null);
  assert.equal(inGap.regime, 'IN_VOLUME_GAP');
  assert.ok(inGap.activeVolumeGap !== null);
  assert.ok(inGap.activeVolumeGap.low <= 113.0 && inGap.activeVolumeGap.high >= 113.0);

  // 3) Spot deeply broken beneath all structural support ($85) -> BELOW_STRUCTURAL_SUPPORT
  const belowData = buildStructuralCandles({ finalPrice: 85.0, heavyVolumeCenter: 100 });
  const below = analyzeMarketStructuralContext({
    symbol: 'QQQ',
    dailyCandles: belowData.daily,
    weeklyCandles: belowData.weekly,
  });
  assert.ok(below !== null);
  assert.equal(below.regime, 'BELOW_STRUCTURAL_SUPPORT');
});

test('selectAlpacaEquityCandidates blocks IN_VOLUME_GAP via Volume Gap Guard, tags AT_INSTITUTIONAL_BUY_ZONE, and preserves CRASH_DEFENSE veto', () => {
  const nowMs = Date.UTC(2026, 10, 23, 15, 0, 0);
  const overview: AlpacaOverviewDTO = {
    configured: true,
    mode: 'PAPER',
    paperEndpoint: 'https://paper-api.alpaca.markets',
    message: 'Connected',
    fetchedAt: new Date(nowMs).toISOString(),
    account: {
      id: 'acct-struct',
      account_number: 'PA999999',
      status: 'ACTIVE',
      currency: 'USD',
      cash: 100000,
      buying_power: 100000,
      options_buying_power: 100000,
      options_approved_level: 2,
      equity: 100000,
      last_equity: 100000,
      day_pnl: 0,
      day_pnl_pct: 0,
      pattern_day_trader: false,
    },
    positions: [],
    equityPositions: [],
    optionPositions: [],
    orders: [],
    fills: [],
  };

  const gapData = buildStructuralCandles({ finalPrice: 113.0, heavyVolumeCenter: 100 });
  const gapSummary = analyzeMarketStructuralContext({
    symbol: 'AAPL',
    dailyCandles: gapData.daily,
    weeklyCandles: gapData.weekly,
  })!;

  const buyZoneData = buildStructuralCandles({ finalPrice: 100.2, heavyVolumeCenter: 100 });
  const buyZoneSummary = analyzeMarketStructuralContext({
    symbol: 'XOM',
    dailyCandles: buyZoneData.daily,
    weeklyCandles: buyZoneData.weekly,
  })!;

  const marketItems = [
    {
      symbol: 'AAPL',
      sector: 'Information Technology',
      currentPrice: 113.0,
      atr: 2.2,
      fetchedAtMs: nowMs - 30_000,
      structuralContext: gapSummary,
      setups: [{ type: 'BULLISH_TRIPLE', qualityScore: 88 }],
    },
    {
      symbol: 'XOM',
      sector: 'Energy',
      currentPrice: 100.2,
      atr: 2.0,
      fetchedAtMs: nowMs - 30_000,
      structuralContext: buyZoneSummary,
      setups: [{ type: 'BULLISH_TRIPLE', qualityScore: 86 }],
    },
  ];

  // Safe market health (risk-on) -> AAPL blocked by Volume Gap Guard, XOM accepted & rationale-tagged
  const safeHealth: MarketHealthReport = {
    isLive: true,
    asOf: '2026-11-23',
    dataSource: 'Test Feed',
    universeCount: 14,
    current: {
      score: 72,
      label: 'Greed',
      safetyStatus: 'SAFE_RISK_ON',
      allowNewEntries: true,
      sizeMultiplier: 1.0,
      vix: 15.2,
      vix3m: 17.5,
      vixTermStructure: 'CONTANGO',
      spyPrice: 590,
      spyChangePct: 0.6,
      spy5dReturnPct: 1.4,
      netVolumeTodayBillions: 3.1,
      buyingVolumeTodayBillions: 15.1,
      sellingVolumeTodayBillions: 12.0,
      netVolume1MBillions: 18.0,
      buyingVolume1MBillions: 140,
      sellingVolume1MBillions: 122,
      buySellRatio1M: 1.15,
      breadthPct: 74,
      momentumScore: 76,
      vixScore: 80,
      volumeScore: 68,
      breadthScore: 72,
      reasons: [],
    },
    snapshots: {
      now: { date: '2026-11-23', score: 72, label: 'Greed', vix: 15.2, netFlowBillions: 3.1 },
      previousClose: null,
      oneWeekAgo: null,
      oneMonthAgo: null,
      oneYearAgo: null,
    },
    history1M: [],
    history1YCount: 252,
    structuralContext: { spy: buyZoneSummary, qqq: buyZoneSummary },
  };

  const resSafe = selectAlpacaEquityCandidates(
    overview,
    marketItems,
    { ...DEFAULT_SETTINGS, maxSectorExposurePct: 40, maxRiskPerTradePct: 1.0 },
    5,
    { nowMs, marketHealth: safeHealth }
  );

  assert.equal(resSafe.ordersToPlace.length, 1);
  assert.equal(resSafe.ordersToPlace[0].symbol, 'XOM');
  assert.ok(
    resSafe.ordersToPlace[0].rationale.includes('Inst. Buy Zone'),
    `Expected Inst. Buy Zone in rationale, got: ${resSafe.ordersToPlace[0].rationale}`
  );
  const aaplBlocked = resSafe.skippedByRiskGates.find((s) => s.symbol === 'AAPL');
  assert.ok(aaplBlocked && aaplBlocked.reasons.some((r) => r.includes('Volume Gap Guard')));

  // CRASH_DEFENSE overrides even an AT_INSTITUTIONAL_BUY_ZONE candidate
  const crashHealth: MarketHealthReport = {
    ...safeHealth,
    current: {
      ...safeHealth.current,
      score: 19,
      label: 'Extreme Fear',
      safetyStatus: 'CRASH_DEFENSE',
      allowNewEntries: false,
      sizeMultiplier: 0,
      vix: 33.0,
      reasons: ['VIX >= 28', 'Extreme fear'],
    },
  };
  const resCrash = selectAlpacaEquityCandidates(
    overview,
    marketItems,
    { ...DEFAULT_SETTINGS, maxSectorExposurePct: 40, maxRiskPerTradePct: 1.0 },
    5,
    { nowMs, marketHealth: crashHealth }
  );
  assert.equal(resCrash.ordersToPlace.length, 0);
  assert.equal(resCrash.marketHealthBlocked, true);
});
