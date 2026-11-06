import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  GICS_SECTORS_METADATA,
  filterWatchlistBySectors,
  calculateSectorBreadth,
  generateFallbackSectorMetrics,
  getSectorPresets,
} from './sectorMetrics';
import { SP500_UNIVERSE } from '../data/sp500Universe';

describe('GICS Sector Metrics & Filtering Logic', () => {
  it('contains metadata for all 11 official GICS sectors', () => {
    assert.equal(GICS_SECTORS_METADATA.length, 11);
    const etfs = GICS_SECTORS_METADATA.map((s) => s.etf);
    assert.ok(etfs.includes('XLK'));
    assert.ok(etfs.includes('XLF'));
    assert.ok(etfs.includes('XLE'));
    assert.ok(etfs.includes('XLV'));
  });

  it('filters universe watchlist correctly by single sector', () => {
    const techTickers = filterWatchlistBySectors(SP500_UNIVERSE, ['Information Technology']);
    assert.ok(techTickers.length > 50);
    assert.ok(techTickers.includes('AAPL'));
    assert.ok(techTickers.includes('NVDA'));
    assert.ok(!techTickers.includes('XOM')); // XOM is Energy
    assert.ok(!techTickers.includes('JPM')); // JPM is Financials
  });

  it('filters universe watchlist correctly by multiple sectors', () => {
    const tickers = filterWatchlistBySectors(SP500_UNIVERSE, ['Information Technology', 'Energy']);
    assert.ok(tickers.includes('AAPL'));
    assert.ok(tickers.includes('XOM'));
    assert.ok(!tickers.includes('JPM'));
  });

  it('returns empty list if no sectors selected', () => {
    const tickers = filterWatchlistBySectors(SP500_UNIVERSE, []);
    assert.equal(tickers.length, 0);
  });

  it('calculates market breadth correctly', () => {
    const sample = generateFallbackSectorMetrics();
    const breadth = calculateSectorBreadth(sample);
    assert.equal(breadth.total, 11);
    assert.ok(breadth.advancing > 0);
    assert.ok(breadth.declining > 0);
    assert.ok(breadth.topGainer !== null);
    assert.ok(breadth.topLoser !== null);
    assert.ok(breadth.topGainer.changePercent >= breadth.topLoser.changePercent);
  });

  it('provides comprehensive sector presets', () => {
    const presets = getSectorPresets();
    assert.ok(presets.length >= 4);
    const allPreset = presets.find((p) => p.id === 'all');
    assert.ok(allPreset);
    assert.equal(allPreset.sectors.length, 11);
  });
});
