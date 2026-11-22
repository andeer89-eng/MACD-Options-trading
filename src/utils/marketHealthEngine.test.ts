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
