import test from 'node:test';
import assert from 'node:assert/strict';
import type { Candle } from './trullasStrategy.ts';
import {
  classifySentimentLabel,
  decomposeBarDollarFlow,
  evaluateSafetyRegime,
  computeMarketHealthReport,
} from './marketHealthEngine.ts';

function generateDailySeries(params: {
  days: number;
  startPrice: number;
  dailyReturnPct: number;
  vixStart: number;
  vixEnd: number;
  vix3mOffset: number;
  bullishBars?: boolean;
}): {
  spy: Candle[];
  qqq: Candle[];
  xlk: Candle[];
  vix: Candle[];
  vix3m: Candle[];
  tlt: Candle[];
} {
  const spy: Candle[] = [];
  const qqq: Candle[] = [];
  const xlk: Candle[] = [];
  const vix: Candle[] = [];
  const vix3m: Candle[] = [];
  const tlt: Candle[] = [];

  let priceSpy = params.startPrice;
  let priceQqq = params.startPrice * 0.85;
  let priceXlk = params.startPrice * 0.4;
  let priceTlt = 95;

  const baseTs = Date.UTC(2025, 10, 1);

  for (let i = 0; i < params.days; i++) {
    const ts = baseTs + i * 86_400_000;
    const dateStr = new Date(ts).toISOString().split('T')[0];

    const ret =
      typeof params.dailyReturnPct === 'number' ? params.dailyReturnPct / 100 : 0.001;
    const prevSpy = priceSpy;
    priceSpy = Number((priceSpy * (1 + ret)).toFixed(2));
    priceQqq = Number((priceQqq * (1 + ret * 1.15)).toFixed(2));
    priceXlk = Number((priceXlk * (1 + ret * 1.2)).toFixed(2));
    priceTlt = Number((priceTlt * (1 - ret * 0.25)).toFixed(2));

    const t = params.days > 1 ? i / (params.days - 1) : 1;
    const vixPrice = Number((params.vixStart + (params.vixEnd - params.vixStart) * t).toFixed(2));
    const vix3mPrice = Number((vixPrice + params.vix3mOffset).toFixed(2));

    const isBull = params.bullishBars ?? ret >= 0;
    const range = Math.max(1.5, priceSpy * 0.014);
    const spyHigh = Number((priceSpy + (isBull ? range * 0.1 : range * 0.9)).toFixed(2));
    const spyLow = Number((priceSpy - (isBull ? range * 0.9 : range * 0.1)).toFixed(2));

    spy.push({
      timestamp: ts,
      dateStr,
      open: prevSpy,
      high: spyHigh,
      low: spyLow,
      close: priceSpy,
      volume: 65_000_000,
    });
    qqq.push({
      timestamp: ts,
      dateStr,
      open: Number((priceQqq * 0.995).toFixed(2)),
      high: Number((priceQqq + (isBull ? 0.3 : 2.5)).toFixed(2)),
      low: Number((priceQqq - (isBull ? 2.5 : 0.3)).toFixed(2)),
      close: priceQqq,
      volume: 45_000_000,
    });
    xlk.push({
      timestamp: ts,
      dateStr,
      open: Number((priceXlk * 0.995).toFixed(2)),
      high: Number((priceXlk + (isBull ? 0.2 : 1.8)).toFixed(2)),
      low: Number((priceXlk - (isBull ? 1.8 : 0.2)).toFixed(2)),
      close: priceXlk,
      volume: 12_000_000,
    });
    vix.push({
      timestamp: ts,
      dateStr,
      open: vixPrice,
      high: vixPrice + 0.5,
      low: Math.max(9, vixPrice - 0.5),
      close: vixPrice,
      volume: 0,
    });
    vix3m.push({
      timestamp: ts,
      dateStr,
      open: vix3mPrice,
      high: vix3mPrice + 0.4,
      low: Math.max(9, vix3mPrice - 0.4),
      close: vix3mPrice,
      volume: 0,
    });
    tlt.push({
      timestamp: ts,
      dateStr,
      open: priceTlt,
      high: priceTlt + 0.5,
      low: priceTlt - 0.5,
      close: priceTlt,
      volume: 20_000_000,
    });
  }

  return { spy, qqq, xlk, vix, vix3m, tlt };
}

test('classifySentimentLabel maps 0-100 across CNN Fear & Greed bands', () => {
  assert.equal(classifySentimentLabel(12), 'Extreme Fear');
  assert.equal(classifySentimentLabel(35), 'Fear');
  assert.equal(classifySentimentLabel(50), 'Neutral');
  assert.equal(classifySentimentLabel(68), 'Greed');
  assert.equal(classifySentimentLabel(88), 'Extreme Greed');
});

test('decomposeBarDollarFlow splits accumulation vs distribution dollar volume cleanly', () => {
  const accumulation = decomposeBarDollarFlow(
    { timestamp: 1, dateStr: '2026-11-20', open: 500, high: 510, low: 498, close: 509.5, volume: 20_000_000 },
    500
  );
  assert.ok(accumulation.buyBillions > accumulation.sellBillions);
  assert.ok(accumulation.netBillions > 0);

  const distribution = decomposeBarDollarFlow(
    { timestamp: 2, dateStr: '2026-11-21', open: 509, high: 510, low: 495, close: 495.5, volume: 25_000_000 },
    509.5
  );
  assert.ok(distribution.sellBillions > distribution.buyBillions);
  assert.ok(distribution.netBillions < 0);
});

test('computeMarketHealthReport identifies SAFE_RISK_ON in healthy low-VIX uptrend with net buying volume', () => {
  const data = generateDailySeries({
    days: 260,
    startPrice: 480,
    dailyReturnPct: 0.14,
    vixStart: 19,
    vixEnd: 13.5,
    vix3mOffset: 2.5,
    bullishBars: true,
  });

  const report = computeMarketHealthReport({
    spyCandles: data.spy,
    vixCandles: data.vix,
    vix3mCandles: data.vix3m,
    tltCandles: data.tlt,
    flowBenchmarkCandles: {
      SPY: data.spy,
      QQQ: data.qqq,
      XLK: data.xlk,
    },
  });

  assert.equal(report.isLive, true);
  assert.equal(report.history1M.length, 22);
  assert.ok(report.current.score >= 65, `Expected bullish score >= 65, got ${report.current.score}`);
  assert.equal(report.current.safetyStatus, 'SAFE_RISK_ON');
  assert.equal(report.current.allowNewEntries, true);
  assert.equal(report.current.sizeMultiplier, 1.0);
  assert.equal(report.current.vixTermStructure, 'CONTANGO');
  assert.ok(report.current.netVolume1MBillions > 0);
  assert.ok(report.snapshots.previousClose !== null);
  assert.ok(report.snapshots.oneWeekAgo !== null);
  assert.ok(report.snapshots.oneMonthAgo !== null);
  assert.ok(report.snapshots.oneYearAgo !== null);
});

test('computeMarketHealthReport triggers CRASH_DEFENSE halt during high-VIX selloff and net selling', () => {
  const data = generateDailySeries({
    days: 150,
    startPrice: 600,
    dailyReturnPct: -0.95,
    vixStart: 18,
    vixEnd: 33.5,
    vix3mOffset: -3.2, // VIX backwardation
    bullishBars: false,
  });

  const report = computeMarketHealthReport({
    spyCandles: data.spy,
    vixCandles: data.vix,
    vix3mCandles: data.vix3m,
    tltCandles: data.tlt,
    flowBenchmarkCandles: {
      SPY: data.spy,
      QQQ: data.qqq,
      XLK: data.xlk,
    },
  });

  assert.ok(report.current.score <= 30, `Expected fear score <= 30, got ${report.current.score}`);
  assert.equal(report.current.safetyStatus, 'CRASH_DEFENSE');
  assert.equal(report.current.allowNewEntries, false);
  assert.equal(report.current.sizeMultiplier, 0);
  assert.equal(report.current.vixTermStructure, 'BACKWARDATION');
  assert.ok(report.current.netVolume1MBillions < 0);
  assert.ok(report.current.reasons.length > 0);
});

test('evaluateSafetyRegime flags CAUTIOUS (0.5x) on moderate VIX elevation', () => {
  const res = evaluateSafetyRegime({
    score: 48,
    vix: 23.5,
    vixTermRatio: 1.01,
    spy5dReturnPct: -0.8,
    netFlow5dRatioPct: -6,
  });
  assert.equal(res.safetyStatus, 'CAUTIOUS');
  assert.equal(res.allowNewEntries, true);
  assert.equal(res.sizeMultiplier, 0.5);
});

test('single-day +4.7% relief bounce in 21D bear distribution & VIX backwardation remains Extreme Fear (does not flip volumeScore > 50)', () => {
  const data = generateDailySeries({
    days: 150,
    startPrice: 770,
    dailyReturnPct: -0.45,
    vixStart: 18,
    vixEnd: 35.89,
    vix3mOffset: -3.0,
    bullishBars: false,
  });

  // Construct HYG/IEF credit stress and VVIX elevation
  const vvix = data.vix.map((v, idx) => ({
    ...v,
    close: idx >= 130 ? 128 : 88,
    high: idx >= 130 ? 132 : 90,
    low: idx >= 130 ? 122 : 85,
  }));
  const hyg = data.spy.map((s, idx) => ({
    ...s,
    close: idx >= 128 ? 76.2 - (idx - 128) * 0.12 : 79.5,
  }));
  const ief = data.tlt.map((t, idx) => ({
    ...t,
    close: idx >= 128 ? 91.5 + (idx - 128) * 0.04 : 91.2,
  }));

  // Inject ONE +4.71% single-day relief bounce at the final session (like 2026-11-23)
  const lastIdx = data.spy.length - 1;
  const prevSpy = data.spy[lastIdx - 1].close;
  const bounceSpy = Number((prevSpy * 1.0471).toFixed(2));
  data.spy[lastIdx] = {
    ...data.spy[lastIdx],
    open: prevSpy,
    low: prevSpy,
    high: bounceSpy + 0.5,
    close: bounceSpy,
    volume: 95_000_000,
  };
  const prevQqq = data.qqq[lastIdx - 1].close;
  const bounceQqq = Number((prevQqq * 1.062).toFixed(2));
  data.qqq[lastIdx] = {
    ...data.qqq[lastIdx],
    open: prevQqq,
    low: prevQqq,
    high: bounceQqq + 0.5,
    close: bounceQqq,
    volume: 70_000_000,
  };
  const prevXlk = data.xlk[lastIdx - 1].close;
  const bounceXlk = Number((prevXlk * 1.055).toFixed(2));
  data.xlk[lastIdx] = {
    ...data.xlk[lastIdx],
    open: prevXlk,
    low: prevXlk,
    high: bounceXlk + 0.3,
    close: bounceXlk,
    volume: 18_000_000,
  };
  // VIX drops from 35.89 to 26.62, still above 50D SMA (~22) and still in backwardation (25.50 < 26.62)
  data.vix[lastIdx] = { ...data.vix[lastIdx], close: 26.62, high: 29, low: 26 };
  data.vix3m[lastIdx] = { ...data.vix3m[lastIdx], close: 25.5, high: 26.5, low: 25 };
  vvix[lastIdx] = { ...vvix[lastIdx], close: 117.36 };

  const report = computeMarketHealthReport({
    spyCandles: data.spy,
    vixCandles: data.vix,
    vix3mCandles: data.vix3m,
    vvixCandles: vvix,
    tltCandles: data.tlt,
    hygCandles: hyg,
    iefCandles: ief,
    flowBenchmarkCandles: {
      SPY: data.spy,
      QQQ: data.qqq,
      XLK: data.xlk,
    },
  });

  assert.ok(report.current.netVolumeTodayBillions > 0, 'Today flow is positive bounce');
  assert.ok(report.current.netVolume1MBillions < 0, '1M institutional flow must remain net negative');
  assert.ok((report.current.cmf21 ?? 0) < 0, `Expected negative CMF(21), got ${report.current.cmf21}`);
  assert.ok(
    report.current.volumeScore <= 25,
    `Expected volumeScore <= 25 during 1M distribution despite 1-day bounce, got ${report.current.volumeScore}`
  );
  assert.ok(
    report.current.score <= 24,
    `Expected composite score <= 24 (Extreme Fear), got ${report.current.score}`
  );
  assert.equal(report.current.label, 'Extreme Fear');
  assert.equal(report.current.safetyStatus, 'CRASH_DEFENSE');
  assert.equal(
    report.current.scoreDelta1D,
    report.current.score - (report.snapshots.previousClose?.score ?? report.current.score)
  );
});

test('computeMarketHealthReport synchronizes score and snapshots with externalFearGreed (feargreedtracker.com) while preserving internalScore', () => {
  const data = generateDailySeries({
    days: 60,
    startPrice: 750,
    dailyReturnPct: -0.35,
    vixStart: 19,
    vixEnd: 26.62,
    vix3mOffset: -1.12,
    bullishBars: false,
  });

  const lastDate = data.spy[data.spy.length - 1].dateStr;
  const prevDate = data.spy[data.spy.length - 2].dateStr;
  const weekDate = data.spy[data.spy.length - 6].dateStr;

  const report = computeMarketHealthReport({
    spyCandles: data.spy,
    vixCandles: data.vix,
    vix3mCandles: data.vix3m,
    tltCandles: data.tlt,
    flowBenchmarkCandles: {
      SPY: data.spy,
      QQQ: data.qqq,
      XLK: data.xlk,
    },
    externalFearGreed: {
      provider: 'feargreedtracker.com',
      providerLabel: 'feargreedtracker.com (CNN Fear & Greed)',
      currentScore: 17,
      previousCloseScore: 10,
      oneWeekAgoScore: 31,
      oneMonthAgoScore: 49,
      scoreDelta1D: 7,
      asOf: lastDate,
      historyByDate: {
        [lastDate]: { date: lastDate, score: 17, label: 'Extreme Fear', vix: 26.62 },
        [prevDate]: { date: prevDate, score: 10, label: 'Extreme Fear', vix: 35.89 },
        [weekDate]: { date: weekDate, score: 31, label: 'Fear', vix: 22.91 },
      },
    },
  });

  assert.equal(report.scoreSyncSource, 'feargreedtracker.com');
  assert.equal(report.current.score, 17);
  assert.equal(report.current.label, 'Extreme Fear');
  assert.equal(report.current.scoreDelta1D, 7);
  assert.equal(typeof report.current.internalScore, 'number');
  assert.equal(report.snapshots.previousClose?.score, 10);
  assert.equal(report.snapshots.oneWeekAgo?.score, 31);
  assert.equal(report.current.safetyStatus, 'CRASH_DEFENSE');
});

test('computeMarketHealthReport throttles SAFE_RISK_ON sizeMultiplier on publicBreadth BEAR_DIVERGENCE and SEVERE IBD distribution days', () => {
  const data = generateDailySeries({
    days: 80,
    startPrice: 520,
    dailyReturnPct: 0.12,
    vixStart: 17,
    vixEnd: 14.5,
    vix3mOffset: 2.0,
    bullishBars: true,
  });

  // 1) Healthy uptrend + BEAR_DIVERGENCE breadth caps sizeMultiplier <= 0.75
  const divReport = computeMarketHealthReport({
    spyCandles: data.spy,
    vixCandles: data.vix,
    vix3mCandles: data.vix3m,
    tltCandles: data.tlt,
    flowBenchmarkCandles: {
      SPY: data.spy,
      QQQ: data.qqq,
      XLK: data.xlk,
    },
    publicBreadth: {
      source: 'tradermonty-public-csv',
      asOf: data.spy[data.spy.length - 1].dateStr,
      sp500Breadth: {
        pctAbove200Ma: 41.5,
        pctAbove200MaDelta1D: -1.4,
        pctAbove200Ma8Ma: 44.0,
        trend200Ma: 'DOWN',
        bearishSignal200: true,
        isTroughBelow40: false,
        pctAbove50Ma: 34.0,
        pctAbove50MaDelta1D: -2.0,
        pctAbove50Ma8Ma: 38.0,
        trend50Ma: 'DOWN',
        bearishSignal50: true,
        aboveCount200: 208,
        eligibleCount200: 500,
        aboveCount50: 170,
        eligibleCount50: 500,
        regimeLabel: 'BEAR_DIVERGENCE',
      },
      sectorUptrend: null,
    },
  });

  assert.ok(divReport.current.sizeMultiplier <= 0.75);
  assert.ok(divReport.current.reasons.some((r) => r.includes('Bear Divergence')));

  // 2) Inject 6 high-volume distribution days in the last 12 sessions without crashing trend score < 32
  const distSpy = data.spy.map((c) => ({ ...c }));
  const distQqq = data.qqq.map((c) => ({ ...c }));
  for (let offset = 14; offset >= 4; offset -= 2) {
    const idx = distSpy.length - offset;
    const prevSpy = distSpy[idx - 1];
    distSpy[idx] = {
      ...distSpy[idx],
      close: Number((prevSpy.close * 0.996).toFixed(2)),
      volume: prevSpy.volume * 1.45,
    };
    const prevQqq = distQqq[idx - 1];
    distQqq[idx] = {
      ...distQqq[idx],
      close: Number((prevQqq.close * 0.995).toFixed(2)),
      volume: prevQqq.volume * 1.5,
    };
  }

  const distReport = computeMarketHealthReport({
    spyCandles: distSpy,
    vixCandles: data.vix,
    vix3mCandles: data.vix3m,
    tltCandles: data.tlt,
    flowBenchmarkCandles: {
      SPY: distSpy,
      QQQ: distQqq,
      XLK: data.xlk,
    },
  });

  assert.equal(distReport.marketTiming?.overallRisk, 'SEVERE');
  assert.notEqual(distReport.current.safetyStatus, 'SAFE_RISK_ON');
  assert.ok(distReport.current.sizeMultiplier <= 0.5);
  assert.ok(distReport.current.reasons.some((r) => r.includes('IBD Distribution Risk SEVERE')));
});

