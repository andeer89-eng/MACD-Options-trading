import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  HeatmapItem,
  calculateHeatmapSummary,
  computeSquarifiedTreemap,
  getCustomTag,
  getSubIndustryGroups,
  getSectorMacroGroups,
} from './heatmapEngine';

const FIXTURE_ITEMS: HeatmapItem[] = [
  {
    symbol: 'NVDA',
    name: 'NVIDIA Corp',
    sector: 'Information Technology',
    subIndustry: 'Semiconductors',
    indexTag: 'S&P 500',
    customTag: 'Mag 7',
    marketCapMillions: 3420000,
    price: 138.2,
    timeframeChanges: { '1m': 0.2, '15m': 0.5, '1D': 2.4, '1W': 6.1, YTD: 45.2 },
    volume24hMillions: 420.5,
    volumeAvg30dMillions: 310.0,
    rvol: 1.36,
    netDeltaFlowMillions: 120.4,
    rsi: 64.2,
    hasEarningsSoon: false,
    anomalyAlert: 'BREAKOUT',
    sparkline: [130, 132, 135, 138.2],
  },
  {
    symbol: 'AAPL',
    name: 'Apple Inc.',
    sector: 'Information Technology',
    subIndustry: 'Technology Hardware',
    indexTag: 'S&P 500',
    customTag: 'Mag 7',
    marketCapMillions: 3250000,
    price: 226.4,
    timeframeChanges: { '1m': 0.1, '15m': 0.2, '1D': 1.1, '1W': 2.4, YTD: 18.5 },
    volume24hMillions: 210.0,
    volumeAvg30dMillions: 200.0,
    rvol: 1.05,
    netDeltaFlowMillions: 45.2,
    rsi: 58.1,
    hasEarningsSoon: false,
    sparkline: [222, 224, 225, 226.4],
  },
  {
    symbol: 'JPM',
    name: 'JPMorgan Chase',
    sector: 'Financials',
    subIndustry: 'Diversified Banks',
    indexTag: 'S&P 500',
    marketCapMillions: 610000,
    price: 238.5,
    timeframeChanges: { '1m': -0.1, '15m': -0.3, '1D': -1.4, '1W': -0.8, YTD: 22.0 },
    volume24hMillions: 95.0,
    volumeAvg30dMillions: 88.0,
    rvol: 1.08,
    netDeltaFlowMillions: -28.0,
    rsi: 44.5,
    hasEarningsSoon: false,
    sparkline: [242, 240, 239, 238.5],
  },
  {
    symbol: 'KO',
    name: 'Coca-Cola Co',
    sector: 'Consumer Staples',
    subIndustry: 'Soft Drinks',
    indexTag: 'S&P 500',
    customTag: 'Defensive Yield',
    marketCapMillions: 290000,
    price: 65.1,
    timeframeChanges: { '1m': 0.0, '15m': 0.0, '1D': 0.02, '1W': 0.4, YTD: 5.2 },
    volume24hMillions: 52.0,
    volumeAvg30dMillions: 55.0,
    rvol: 0.95,
    netDeltaFlowMillions: 2.1,
    rsi: 50.2,
    hasEarningsSoon: false,
    sparkline: [64.8, 65.0, 65.1],
  },
];

describe('Market Heatmap State Engine Unit Tests', () => {
  test('calculateHeatmapSummary computes accurate market breadth & regime tags', () => {
    const hud = calculateHeatmapSummary(FIXTURE_ITEMS, '1D');

    assert.strictEqual(hud.totalSecurities, 4);
    assert.strictEqual(hud.advancersCount, 2);
    assert.strictEqual(hud.declinersCount, 1);
    assert.strictEqual(hud.unchangedCount, 1);
    assert.ok(hud.advancersCount + hud.declinersCount + hud.unchangedCount === hud.totalSecurities);
    assert.strictEqual(hud.topGainerSector.name, 'Information Technology');
    assert.strictEqual(hud.topDeclinerSector.name, 'Financials');
    assert.ok(['BULLISH_FLOW', 'BEARISH_HEAVY', 'CHOPPY_ROTATION', 'SQUEEZE_ALERT'].includes(hud.marketRegimeTag));
  });

  test('computeSquarifiedTreemap creates valid tree hierarchy layout', () => {
    const tree = computeSquarifiedTreemap(FIXTURE_ITEMS, 1200, 800, 'MARKET_CAP', 'SECTOR');

    assert.strictEqual(tree.id, 'root-treemap');
    assert.ok(tree.children && tree.children.length === 3, 'Has 3 sector group children');

    const firstGroup = tree.children[0];
    assert.strictEqual(firstGroup.width, 1200);
    assert.ok(firstGroup.children && firstGroup.children.length > 0, 'Group has item children');
  });

  test('getSubIndustryGroups computes sub-industry drill-down hierarchy', () => {
    const subGroups = getSubIndustryGroups(FIXTURE_ITEMS, 'Information Technology', '1D');

    assert.strictEqual(subGroups.length, 2);
    const firstSub = subGroups[0];
    assert.strictEqual(firstSub.sector, 'Information Technology');
    assert.strictEqual(firstSub.constituentCount, 1);
    assert.ok(firstSub.topTickers.length > 0);
  });

  test('getSectorMacroGroups computes macro sector blocks for Level 0 drill-down', () => {
    const macro = getSectorMacroGroups(FIXTURE_ITEMS, '1D');

    assert.strictEqual(macro.length, 3);
    const tech = macro.find((m) => m.sector === 'Information Technology');
    assert.ok(tech);
    assert.strictEqual(tech?.constituentCount, 2);
    assert.ok(tech!.weight > 0);
  });

  test('getCustomTag identifies Mag 7 and defensive yield stock classifications', () => {
    assert.strictEqual(getCustomTag('NVDA', 'Information Technology'), 'Mag 7');
    assert.strictEqual(getCustomTag('KO', 'Consumer Staples'), 'Defensive Yield');
    assert.strictEqual(getCustomTag('GME', 'Consumer Discretionary'), 'High Short Interest');
  });
});
