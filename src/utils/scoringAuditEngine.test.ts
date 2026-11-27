import test from 'node:test';
import assert from 'node:assert/strict';
import {
  auditUnifiedScoringConsistency,
  reconcileSymbolScoring,
} from './scoringAuditEngine';
import { Candle } from './trullasStrategy';

function buildRealisticSeries(count: number, startPrice: number, slope: number): Candle[] {
  const candles: Candle[] = [];
  const baseTs = Date.UTC(2026, 0, 1);
  let price = startPrice;
  for (let i = 0; i < count; i++) {
    const wave = i % 6 >= 4 ? -slope * 0.45 : slope;
    const open = price;
    price = Math.max(5, Number((price + wave + Math.sin(i * 0.5) * 0.3).toFixed(2)));
    candles.push({
      timestamp: baseTs + i * 86_400_000,
      dateStr: new Date(baseTs + i * 86_400_000).toISOString().slice(0, 10),
      open,
      high: Number((Math.max(open, price) * 1.012).toFixed(2)),
      low: Number((Math.min(open, price) * 0.988).toFixed(2)),
      close: price,
      volume: 3_000_000 + (i % 4) * 500_000,
    });
  }
  return candles;
}

test('reconcileSymbolScoring guarantees 0-pt divergence across Confluence 360°, Watchlist, Scanner, and Action Zones', () => {
  const upCandles = buildRealisticSeries(80, 100, 0.85);
  const spot = upCandles[upCandles.length - 1].close;

  const item = {
    symbol: 'TGT',
    companyName: 'Target Corporation',
    sector: 'Consumer Staples',
    currentPrice: spot,
    atr: 4.2,
    atrPercent: 2.4,
    isStagnant: false,
    relPerfVsSpyPct: 18.5,
    setups: [
      {
        id: 'tgt-bull',
        symbol: 'TGT',
        timeframe: '1d',
        type: 'BULLISH_TRIPLE',
        qualityScore: 86,
        currentPrice: spot,
        triggerPrice: spot * 0.99,
        stopLoss: spot * 0.94,
        targets: { tp1: spot * 1.08, tp2: spot * 1.15, tp3: spot * 1.24 },
        riskRewardRatio: 1.8,
      },
    ],
    tosScans: {
      symbol: 'TGT',
      matchedIds: ['TTM_SQUEEZE', 'STACKED_EMA', 'UNUSUAL_VOLUME'],
      signals: [
        { id: 'TTM_SQUEEZE', shortLabel: 'TTM Squeeze', direction: 'BULLISH', strength: 88 },
        { id: 'STACKED_EMA', shortLabel: 'Stacked EMA', direction: 'BULLISH', strength: 84 },
        { id: 'UNUSUAL_VOLUME', shortLabel: 'RelVol 2.4σ', direction: 'BULLISH', strength: 86 },
      ],
      snapshot: { relVolStDev: 2.4 },
    },
    candles: upCandles,
  };

  const audit = reconcileSymbolScoring(item, 'BULLISH', {
    sectorAlphaPct: 1.8,
  });

  assert.ok(audit);
  assert.equal(audit.status, 'RECONCILED');
  assert.equal(audit.reconciledGapPts, 0);
  assert.equal(audit.watchlistScore, audit.confluence360Score);
  assert.equal(audit.watchlistGrade, audit.confluence360Grade);
  assert.equal(audit.scannerScore, audit.unifiedScore);
  assert.equal(audit.actionZoneScore, audit.unifiedScore);
});

test('reconcileSymbolScoring diagnoses legacy Watchlist inflation & stale opposing setups (DLTR scenario)', () => {
  const upCandles = buildRealisticSeries(80, 110, 0.75);
  const spot = upCandles[upCandles.length - 1].close;

  const dltr = {
    symbol: 'DLTR',
    sector: 'Consumer Staples',
    currentPrice: spot,
    atr: 6.0,
    atrPercent: 3.9,
    isStagnant: false,
    relPerfVsSpyPct: 40.6,
    setups: [
      // Stopped-out bearish setup at index 0 (used to confuse raw setups[0] readers)
      {
        id: 'dltr-bear-stale',
        symbol: 'DLTR',
        timeframe: '1d',
        type: 'BEARISH_TRIPLE',
        qualityScore: 85,
        currentPrice: spot,
        triggerPrice: 120,
        stopLoss: 127.63, // Below spot! Stopped out!
        targets: { tp1: 118.45, tp2: 113.39, tp3: 108 },
        riskRewardRatio: 1.35,
      },
      // Old completed bullish setup
      {
        id: 'dltr-bull-completed',
        symbol: 'DLTR',
        timeframe: '1d',
        type: 'BULLISH_DOUBLE',
        qualityScore: 68,
        currentPrice: spot,
        triggerPrice: 112,
        stopLoss: 108,
        targets: { tp1: 115, tp2: 118, tp3: 122 }, // Already way past TP2!
        riskRewardRatio: 1.5,
      },
    ],
    tosScans: {
      symbol: 'DLTR',
      matchedIds: ['UNUSUAL_VOLUME', 'VZO_SIGNAL', 'MACD_ZERO_CROSS'],
      signals: [
        { id: 'UNUSUAL_VOLUME', shortLabel: 'RelVol 3.9σ', direction: 'BULLISH', strength: 90 },
        { id: 'VZO_SIGNAL', shortLabel: 'VZO +45', direction: 'BULLISH', strength: 84 },
        { id: 'MACD_ZERO_CROSS', shortLabel: 'MACD 0-Cross', direction: 'BULLISH', strength: 82 },
      ],
      snapshot: { relVolStDev: 3.9 },
    },
    candles: upCandles,
  };

  const audit = reconcileSymbolScoring(dltr, 'BULLISH', { sectorAlphaPct: 0.9 });
  assert.ok(audit);
  assert.equal(audit.status, 'RECONCILED');
  assert.equal(audit.reconciledGapPts, 0);
  assert.ok(
    audit.drivers.includes('STALE_OR_STOPPED_DIVERGENCE_MISMATCH'),
    'Must flag filtered stale/completed divergence'
  );
  assert.ok(
    audit.drivers.includes('DIRECTIONAL_SPLIT_MISMATCH'),
    'Must flag raw setups[0] opposing direction vs TOS signals'
  );
  assert.ok(audit.legacyWatchlistScore >= 85);
});

test('auditUnifiedScoringConsistency confirms 0 divergent setups across batch of Bullish & Bearish leaders', () => {
  const upCandles = buildRealisticSeries(75, 100, 0.9);
  const downCandles = buildRealisticSeries(75, 220, -0.95);

  const batch = [
    {
      symbol: 'NVDA',
      sector: 'Information Technology',
      currentPrice: upCandles[upCandles.length - 1].close,
      atr: 4.5,
      atrPercent: 2.8,
      relPerfVsSpyPct: 19.2,
      setups: [
        {
          id: 'nvda-1',
          symbol: 'NVDA',
          timeframe: '1d',
          type: 'BULLISH_TRIPLE',
          qualityScore: 88,
          currentPrice: upCandles[upCandles.length - 1].close,
          triggerPrice: upCandles[upCandles.length - 1].close * 0.99,
          stopLoss: upCandles[upCandles.length - 1].close * 0.94,
          targets: {
            tp1: upCandles[upCandles.length - 1].close * 1.07,
            tp2: upCandles[upCandles.length - 1].close * 1.14,
            tp3: upCandles[upCandles.length - 1].close * 1.22,
          },
          riskRewardRatio: 2.1,
        },
      ],
      tosScans: {
        symbol: 'NVDA',
        matchedIds: ['TTM_SQUEEZE', 'VCP_BREAKOUT'],
        signals: [
          { id: 'TTM_SQUEEZE', shortLabel: 'TTM Squeeze', direction: 'BULLISH', strength: 88 },
          { id: 'VCP_BREAKOUT', shortLabel: 'VCP Breakout', direction: 'BULLISH', strength: 85 },
        ],
        snapshot: { relVolStDev: 2.3 },
      },
      candles: upCandles,
    },
    {
      symbol: 'INTC',
      sector: 'Information Technology',
      currentPrice: downCandles[downCandles.length - 1].close,
      atr: 3.1,
      atrPercent: 2.4,
      relPerfVsSpyPct: -22.5,
      setups: [
        {
          id: 'intc-1',
          symbol: 'INTC',
          timeframe: '1d',
          type: 'BEARISH_TRIPLE',
          qualityScore: 85,
          currentPrice: downCandles[downCandles.length - 1].close,
          triggerPrice: downCandles[downCandles.length - 1].close * 1.01,
          stopLoss: downCandles[downCandles.length - 1].close * 1.06,
          targets: {
            tp1: downCandles[downCandles.length - 1].close * 0.92,
            tp2: downCandles[downCandles.length - 1].close * 0.85,
            tp3: downCandles[downCandles.length - 1].close * 0.78,
          },
          riskRewardRatio: 2.2,
        },
      ],
      tosScans: {
        symbol: 'INTC',
        matchedIds: ['STACKED_EMA', 'PARABOLIC_SHORT'],
        signals: [
          { id: 'STACKED_EMA', shortLabel: 'Stacked EMA', direction: 'BEARISH', strength: 86 },
          { id: 'PARABOLIC_SHORT', shortLabel: 'Parabolic Short', direction: 'BEARISH', strength: 82 },
        ],
        snapshot: { relVolStDev: 2.0 },
      },
      candles: downCandles,
    },
  ];

  const report = auditUnifiedScoringConsistency(batch, {
    sectorAlphaBySector: { 'Information Technology': 1.2 },
  });

  assert.equal(report.totalAudited, 2);
  assert.equal(report.reconciledCount, 2);
  assert.equal(report.divergentCount, 0);
  assert.equal(report.maxReconciledGapPts, 0);
  assert.ok(report.rootCauseSummary.length >= 3);
});
