import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDualMarketLeaderboards,
  evaluateDirectionalLeader,
  HIGH_CONVICTION_MIN_SCORE,
  scoreToConvictionGrade,
} from './watchlistRankingEngine';
import { Candle } from './trullasStrategy';

function buildUptrendCandles(count: number = 60, startPrice: number = 100): Candle[] {
  const candles: Candle[] = [];
  const start = Date.UTC(2026, 0, 1);
  let price = startPrice;
  for (let i = 0; i < count; i++) {
    price = Number((price * 1.004).toFixed(2));
    candles.push({
      timestamp: start + i * 86_400_000,
      dateStr: new Date(start + i * 86_400_000).toISOString().slice(0, 10),
      open: Number((price * 0.995).toFixed(2)),
      high: Number((price * 1.01).toFixed(2)),
      low: Number((price * 0.99).toFixed(2)),
      close: price,
      volume: 5_000_000,
    });
  }
  return candles;
}

function buildDowntrendCandles(count: number = 60, startPrice: number = 200): Candle[] {
  const candles: Candle[] = [];
  const start = Date.UTC(2026, 0, 1);
  let price = startPrice;
  for (let i = 0; i < count; i++) {
    price = Number((price * 0.994).toFixed(2));
    candles.push({
      timestamp: start + i * 86_400_000,
      dateStr: new Date(start + i * 86_400_000).toISOString().slice(0, 10),
      open: Number((price * 1.005).toFixed(2)),
      high: Number((price * 1.01).toFixed(2)),
      low: Number((price * 0.99).toFixed(2)),
      close: price,
      volume: 5_000_000,
    });
  }
  return candles;
}

test('evaluateDirectionalLeader rejects signal-less tickers instead of assigning a fake 65 score', () => {
  const noSignalItem = {
    symbol: 'ZTS',
    sector: 'Health Care',
    currentPrice: 175.0,
    atr: 3.1,
    atrPercent: 1.77,
    setups: [],
    tosScans: { symbol: 'ZTS', matchedIds: [], signals: [], snapshot: { relVolStDev: 0.4 } },
    relPerfVsSpyPct: 1.2,
    candles: buildUptrendCandles(60, 150),
  };

  assert.equal(evaluateDirectionalLeader(noSignalItem, 'long'), null);
  assert.equal(evaluateDirectionalLeader(noSignalItem, 'short'), null);
});

test('buildDualMarketLeaderboards excludes weak/Grade C setups by default and ranks Bullish/Bearish Top 50 cleanly', () => {
  const upCandles = buildUptrendCandles(60, 100);
  const downCandles = buildDowntrendCandles(60, 200);

  const items: any[] = [
    // Strong A+ Bullish leader (Triple Divergence + 2 TOS signals + strong alpha + Stage 2 + RelVol)
    {
      symbol: 'NVDA',
      companyName: 'NVIDIA Corp.',
      sector: 'Information Technology',
      currentPrice: upCandles[upCandles.length - 1].close,
      atr: 4.5,
      atrPercent: 3.2,
      isStagnant: false,
      relPerfVsSpyPct: 16.4,
      setups: [
        {
          id: 'nvda-bull',
          symbol: 'NVDA',
          timeframe: '1d',
          type: 'BULLISH_TRIPLE',
          qualityScore: 88,
          currentPrice: upCandles[upCandles.length - 1].close,
          triggerPrice: 128,
          stopLoss: 118,
          targets: { tp1: 138, tp2: 148, tp3: 158 },
          riskRewardRatio: 2.0,
        },
      ],
      tosScans: {
        symbol: 'NVDA',
        matchedIds: ['TTM_SQUEEZE', 'STACKED_EMA'],
        signals: [
          { id: 'TTM_SQUEEZE', shortLabel: 'TTM Squeeze', direction: 'BULLISH', strength: 88 },
          { id: 'STACKED_EMA', shortLabel: 'Stacked EMA', direction: 'BULLISH', strength: 86 },
        ],
        snapshot: { relVolStDev: 2.2 },
      },
      candles: upCandles,
    },
    // Weak Grade C/D Bullish noise (1 weak TOS signal, negative alpha, stagnant ATR)
    {
      symbol: 'WEAK',
      sector: 'Utilities',
      currentPrice: 52.0,
      atr: 0.25,
      atrPercent: 0.48,
      isStagnant: true,
      relPerfVsSpyPct: -7.5,
      setups: [],
      tosScans: {
        symbol: 'WEAK',
        matchedIds: ['VZO_SIGNAL'],
        signals: [{ id: 'VZO_SIGNAL', shortLabel: 'VZO', direction: 'BULLISH', strength: 58 }],
        snapshot: { relVolStDev: 0.3 },
      },
      candles: downCandles,
    },
    // Strong Bearish leader
    {
      symbol: 'INTC',
      sector: 'Information Technology',
      currentPrice: downCandles[downCandles.length - 1].close,
      atr: 1.4,
      atrPercent: 3.1,
      isStagnant: false,
      relPerfVsSpyPct: -18.2,
      setups: [
        {
          id: 'intc-bear',
          symbol: 'INTC',
          timeframe: '1d',
          type: 'BEARISH_TRIPLE',
          qualityScore: 85,
          currentPrice: downCandles[downCandles.length - 1].close,
          triggerPrice: 135,
          stopLoss: 145,
          targets: { tp1: 122, tp2: 112, tp3: 102 },
          riskRewardRatio: 2.3,
        },
      ],
      tosScans: {
        symbol: 'INTC',
        matchedIds: ['STACKED_EMA', 'DMI_POWER_MOVE'],
        signals: [
          { id: 'STACKED_EMA', shortLabel: 'Stacked EMA', direction: 'BEARISH', strength: 86 },
          { id: 'DMI_POWER_MOVE', shortLabel: 'DMI Power', direction: 'BEARISH', strength: 80 },
        ],
        snapshot: { relVolStDev: 2.1 },
      },
      candles: downCandles,
    },
  ];

  // Add 60 extra qualified bullish tickers to verify Top-50 cap
  for (let i = 1; i <= 60; i++) {
    items.push({
      symbol: `BULL${i}`,
      sector: 'Industrials',
      currentPrice: upCandles[upCandles.length - 1].close,
      atr: 2.2,
      atrPercent: 2.0,
      isStagnant: false,
      relPerfVsSpyPct: 4 + (i % 10),
      setups: [
        {
          id: `b-${i}`,
          symbol: `BULL${i}`,
          timeframe: '1d',
          type: 'BULLISH_DOUBLE',
          qualityScore: 72 + (i % 15),
          currentPrice: upCandles[upCandles.length - 1].close,
          triggerPrice: 125,
          stopLoss: 118,
          targets: { tp1: 132, tp2: 140, tp3: 148 },
          riskRewardRatio: 2.1,
        },
      ],
      tosScans: {
        symbol: `BULL${i}`,
        matchedIds: ['TTM_SQUEEZE'],
        signals: [{ id: 'TTM_SQUEEZE', shortLabel: 'TTM Squeeze', direction: 'BULLISH', strength: 78 }],
        snapshot: { relVolStDev: 1.4 },
      },
      candles: upCandles,
    });
  }

  const res = buildDualMarketLeaderboards(items);

  assert.equal(res.bullish.length, 50, 'Bullish leaderboard must cap strictly at Top 50');
  assert.equal(res.bullish[0].symbol, 'NVDA');
  assert.equal(res.bullish[0].rank, 1);
  assert.ok(res.bullish[0].score >= 88);
  assert.equal(res.bullish[0].grade, 'A+');
  assert.ok(res.bullish.every((b) => b.score >= HIGH_CONVICTION_MIN_SCORE && b.grade !== 'C' && b.grade !== 'D'));
  assert.ok(!res.bullish.some((b) => b.symbol === 'WEAK'), 'Weak Grade C/D ticker must be excluded by default');
  assert.ok(res.excludedWeakBullish >= 1);

  assert.equal(res.bearish.length, 1);
  assert.equal(res.bearish[0].symbol, 'INTC');
  assert.equal(res.bearish[0].rank, 1);
  assert.ok(['A+', 'A'].includes(res.bearish[0].grade));
});

test('scoreToConvictionGrade maps grades cleanly without Grade C leaking above threshold', () => {
  assert.equal(scoreToConvictionGrade(92).grade, 'A+');
  assert.equal(scoreToConvictionGrade(80).grade, 'A');
  assert.equal(scoreToConvictionGrade(68).grade, 'B');
  assert.equal(scoreToConvictionGrade(67).grade, 'C');
  assert.equal(scoreToConvictionGrade(50).grade, 'D');
});

test('evaluateDirectionalLeader ignores stopped-out bearish and completed historical bullish divergences (DLTR scenario)', () => {
  const upCandles = buildUptrendCandles(60, 118); // ends around ~149.8
  const spot = upCandles[upCandles.length - 1].close;

  const dltrItem = {
    symbol: 'DLTR',
    companyName: 'Dollar Tree, Inc.',
    sector: 'Consumer Staples',
    currentPrice: spot,
    atr: 6.03,
    atrPercent: 3.9,
    isStagnant: false,
    relPerfVsSpyPct: 40.6,
    setups: [
      {
        id: 'DLTR-BEAR-STOPPED',
        symbol: 'DLTR',
        timeframe: '1d',
        type: 'BEARISH_DOUBLE',
        qualityScore: 85,
        currentPrice: spot,
        triggerPrice: 138.0,
        stopLoss: 142.0, // Already breached above SL!
        targets: { tp1: 132.0, tp2: 126.0, tp3: 118.0 },
        riskRewardRatio: 1.35,
        points: [
          {
            index: 45,
            timestamp: upCandles[45].timestamp,
            price: 140.9,
            macd: 1.2,
            histogram: 0.3,
            rsi: 62,
            volume: 4_000_000,
          },
        ],
      },
      {
        id: 'DLTR-BULL-OLD',
        symbol: 'DLTR',
        timeframe: '1d',
        type: 'BULLISH_DOUBLE',
        qualityScore: 68,
        currentPrice: spot,
        triggerPrice: 112.6, // >18% away and TP2 114.99 already achieved!
        stopLoss: 110.34,
        targets: { tp1: 113.51, tp2: 114.99, tp3: 117.39 },
        riskRewardRatio: 1.06,
        points: [
          {
            index: 5,
            timestamp: upCandles[5].timestamp,
            price: 111.12,
            macd: -0.5,
            histogram: 0.1,
            rsi: 35,
            volume: 3_500_000,
          },
        ],
      },
    ],
    tosScans: {
      symbol: 'DLTR',
      matchedIds: ['REL_VOL_SURGE', 'VZO_SIGNAL', 'MACD_ZERO_CROSS'],
      signals: [
        { id: 'REL_VOL_SURGE', shortLabel: 'RelVol 3.9σ', direction: 'BULLISH', strength: 88 },
        { id: 'VZO_SIGNAL', shortLabel: 'VZO +45', direction: 'BULLISH', strength: 82 },
        { id: 'MACD_ZERO_CROSS', shortLabel: 'MACD 0-Cross', direction: 'BULLISH', strength: 80 },
      ],
      snapshot: { relVolStDev: 3.9 },
    },
    candles: upCandles,
  };

  const longLeader = evaluateDirectionalLeader(dltrItem, 'long');
  assert.ok(longLeader);
  assert.equal(longLeader.hasDivergence, false);
  assert.equal(longLeader.matchingDivergence, null);
  assert.ok(!longLeader.primarySetup.includes('BULLISH DOUBLE'));
  assert.ok(!longLeader.why.some((line) => line.includes('BULLISH DOUBLE')));
  // Without bogus +13 dualEngineBonus, score reflects pure TOS + SPY alpha + RelVol + Stage 2
  assert.ok(longLeader.score < 90 && longLeader.score >= 78);

  const shortLeader = evaluateDirectionalLeader(dltrItem, 'short');
  assert.equal(shortLeader, null, 'Stopped-out bearish setup must not qualify DLTR for short watchlist');
});

