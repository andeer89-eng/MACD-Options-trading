import { describe, it } from 'node:test';
import assert from 'node:assert';
import { calculateQuantumMarketXray } from './quantumMarketXray';
import { Candle } from './trullasStrategy';

describe('Quantum Market X-Ray (QMX) Engine', () => {
  const baseTime = 1700000000000;
  const mockCandles: Candle[] = [];

  // Generate 60 mock candles with an initial rally followed by a sharp drop and recovery
  let price = 100;
  for (let i = 0; i < 60; i++) {
    const change = i < 25 ? 0.8 : i < 45 ? -1.2 : 0.6;
    const open = price;
    const close = price + change;
    const high = Math.max(open, close) + 0.5;
    const low = Math.min(open, close) - 0.5;
    const volume = 1000000 + (i % 5) * 200000;
    price = close;

    mockCandles.push({
      timestamp: baseTime + i * 86400000,
      open,
      high,
      low,
      close,
      volume,
      dateStr: new Date(baseTime + i * 86400000).toISOString().slice(0, 10),
    });
  }

  it('calculates full report for valid candles', () => {
    const report = calculateQuantumMarketXray(mockCandles, { symbol: 'AAPL', timeframe: '1d' });
    assert.ok(report);
    assert.equal(report.candles.length, 60);
    assert.equal(report.ribbon.length, 60);
    assert.ok(report.dashboard);
    assert.equal(report.dashboard.market, 'AAPL');
    assert.equal(report.dashboard.timeframe, '1d');
    assert.ok(report.dashboard.price > 0);
    assert.ok(report.dashboard.atr > 0);
  });

  it('populates intelligence scores between 0 and 100', () => {
    const report = calculateQuantumMarketXray(mockCandles, { symbol: 'AAPL', timeframe: '1d' });
    const s = report.dashboard.scores;
    assert.ok(s.bullishEvidencePct >= 0 && s.bullishEvidencePct <= 100);
    assert.ok(s.bearishEvidencePct >= 0 && s.bearishEvidencePct <= 100);
    assert.ok(s.liquidityStrengthPct >= 0 && s.liquidityStrengthPct <= 100);
    assert.ok(s.trapRiskPct >= 0 && s.trapRiskPct <= 100);
    assert.ok(s.displacementPct >= 0 && s.displacementPct <= 100);
    assert.ok(s.marketConfidencePct >= 0 && s.marketConfidencePct <= 100);
  });

  it('detects liquidity zones and sweeps', () => {
    const report = calculateQuantumMarketXray(mockCandles, { symbol: 'AAPL', timeframe: '1d' });
    assert.ok(report.liquidityZones.length > 0);
    const hasBsl = report.liquidityZones.some((z) => z.isHigh);
    const hasSsl = report.liquidityZones.some((z) => !z.isHigh);
    assert.ok(hasBsl || hasSsl);
  });

  it('provides complete MTF matrix and key levels', () => {
    const report = calculateQuantumMarketXray(mockCandles, { symbol: 'AAPL', timeframe: '1d' });
    assert.equal(report.dashboard.mtfOverview.length, 5);
    assert.ok(report.dashboard.keyLevels.bslPrice !== null);
    assert.ok(report.dashboard.keyLevels.sslPrice !== null);
  });

  it('handles empty candles gracefully', () => {
    const report = calculateQuantumMarketXray([]);
    assert.equal(report.candles.length, 0);
    assert.equal(report.ribbon.length, 0);
    assert.equal(report.dashboard.price, 0);
  });
});
