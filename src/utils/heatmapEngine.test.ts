import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateFullHeatmapData,
  calculateHeatmapSummary,
  computeSquarifiedTreemap,
  generateOrderbookDepth,
  getCustomTag,
  getSubIndustryGroups,
  getSectorMacroGroups,
} from './heatmapEngine';

describe('Market Heatmap State Engine Unit Tests', () => {
  test('generateFullHeatmapData generates complete dataset with valid metrics', () => {
    const items = generateFullHeatmapData();
    assert.ok(items.length > 50, 'Generates full S&P 500 + Crypto dataset');

    const nvda = items.find((i) => i.symbol === 'NVDA');
    assert.ok(nvda, 'Includes NVDA mega-cap stock');
    assert.strictEqual(nvda?.sector, 'Information Technology');
    assert.ok(nvda?.marketCapMillions > 1000000, 'NVDA market cap is in trillion dollar range');
    assert.ok(nvda?.orderbookDepth.bids.length > 0, 'Generates DOM orderbook bids');
    assert.ok(nvda?.orderbookDepth.asks.length > 0, 'Generates DOM orderbook asks');
  });

  test('calculateHeatmapSummary computes accurate market breadth & regime tags', () => {
    const items = generateFullHeatmapData();
    const hud = calculateHeatmapSummary(items, '1D');

    assert.ok(hud.totalSecurities > 50);
    assert.ok(hud.advancersCount + hud.declinersCount + hud.unchangedCount === hud.totalSecurities);
    assert.ok(hud.advancerDeclinerRatio >= 0);
    assert.ok(hud.totalVolumeTurnoverBillions > 0);
    assert.ok(hud.topGainerSector.name.length > 0);
    assert.ok(['BULLISH_FLOW', 'BEARISH_HEAVY', 'CHOPPY_ROTATION', 'SQUEEZE_ALERT'].includes(hud.marketRegimeTag));
  });

  test('computeSquarifiedTreemap creates valid tree hierarchy layout', () => {
    const items = generateFullHeatmapData().slice(0, 30); // Test subset
    const tree = computeSquarifiedTreemap(items, 1200, 800, 'MARKET_CAP', 'SECTOR');

    assert.strictEqual(tree.id, 'root-treemap');
    assert.ok(tree.children && tree.children.length > 0, 'Has sector group children');

    const firstGroup = tree.children[0];
    assert.ok(firstGroup.width === 1200);
    assert.ok(firstGroup.children && firstGroup.children.length > 0, 'Group has item children');
  });

  test('getSubIndustryGroups computes sub-industry drill-down hierarchy', () => {
    const items = generateFullHeatmapData();
    const subGroups = getSubIndustryGroups(items, 'Information Technology', '1D');

    assert.ok(subGroups.length > 0, 'Generates sub-industries for Information Technology');
    const firstSub = subGroups[0];
    assert.strictEqual(firstSub.sector, 'Information Technology');
    assert.ok(firstSub.constituentCount > 0);
    assert.ok(firstSub.topTickers.length > 0);
  });

  test('getSectorMacroGroups computes macro sector blocks for Level 0 drill-down', () => {
    const items = generateFullHeatmapData();
    const macro = getSectorMacroGroups(items, '1D');

    assert.ok(macro.length >= 11, 'Has all 11 GICS sectors plus crypto');
    const tech = macro.find((m) => m.sector === 'Information Technology');
    assert.ok(tech);
    assert.ok(tech?.constituentCount > 0);
    assert.ok(tech?.weight > 0);
  });

  test('generateOrderbookDepth computes bid/ask walls and liquidity levels', () => {
    const dom = generateOrderbookDepth(180, 2.5);
    assert.strictEqual(dom.bids.length, 6);
    assert.strictEqual(dom.asks.length, 6);
    assert.ok(dom.spread > 0);
    assert.ok(dom.bidAskRatio > 0);
    assert.ok(dom.totalBidLiquidityMillions > 0);
  });

  test('getCustomTag identifies Mag 7 and AI & Chips stock classifications', () => {
    assert.strictEqual(getCustomTag('NVDA', 'Information Technology'), 'Mag 7');
    assert.strictEqual(getCustomTag('KO', 'Consumer Staples'), 'Defensive Yield');
    assert.strictEqual(getCustomTag('GME', 'Consumer Discretionary'), 'High Short Interest');
  });
});
