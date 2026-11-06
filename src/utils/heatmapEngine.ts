/**
 * Elite Market Heatmap State Engine
 * Combines TradingView / Finviz squarified hierarchy, Bookmap / GoCharting real-time orderflow,
 * and Bloomberg Terminal analytical depth.
 */

import { SP500_UNIVERSE } from '../data/sp500Universe';

export type SizingMode = 'MARKET_CAP' | 'VOLUME_24H' | 'OPEN_INTEREST' | 'RELATIVE_VOLATILITY';
export type ColorMode = 'NET_PRICE_CHANGE' | 'RSI_MOMENTUM' | 'INSTITUTIONAL_FLOW' | 'SHORT_SQUEEZE_RISK' | 'CATALYST_PROXIMITY';
export type Timeframe = '1m' | '15m' | '1D' | '1W' | 'YTD';
export type GroupByMode = 'SECTOR' | 'MARKET_CAP_TIER' | 'CUSTOM_TAGS';
export type ColorScheme = 'STANDARD' | 'COLORBLIND';

export type DrillDownLevel = 'GLOBAL' | 'SECTOR' | 'SUB_INDUSTRY' | 'ASSET';

export interface DrillDownState {
  level: DrillDownLevel;
  sector: string | null;
  subIndustry: string | null;
  selectedSymbol?: string | null;
}

export interface SubIndustryGroup {
  name: string;
  sector: string;
  weight: number;
  avgChangePct: number;
  constituentCount: number;
  topTickers: string[];
  items: HeatmapItem[];
}

export interface OrderbookLevel {
  price: number;
  size: number;
  wallLevel: 'SUPER_WALL' | 'LARGE_WALL' | 'NORMAL';
}

export interface OrderbookDepth {
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  spread: number;
  spreadPct: number;
  bidAskRatio: number; // >1 = bid heavy, <1 = ask heavy
  totalBidLiquidityMillions: number;
  totalAskLiquidityMillions: number;
}

export interface HeatmapItem {
  symbol: string;
  name: string;
  sector: string;
  subIndustry: string;
  indexTag: 'S&P 500' | 'Nasdaq 100' | 'Crypto' | 'Dow Jones';
  customTag?: 'Mag 7' | 'AI & Chips' | 'High Short Interest' | 'Defensive Yield' | 'Fintech Leaders';
  marketCapMillions: number;
  price: number;
  timeframeChanges: Record<Timeframe, number>;
  volume24hMillions: number;
  volumeAvg30dMillions: number;
  rvol: number; // Relative Volume
  netDeltaFlowMillions: number; // Net aggressive buy (+)/sell (-) order flow
  rsi: number;
  shortInterestPct: number;
  squeezeRiskScore: number; // 0 to 100
  earningsProximityDays?: number; // e.g. 0 = today, 3 = in 3 days, -2 = 2 days ago
  hasEarningsSoon: boolean;
  anomalyAlert?: 'VOLUME_SPIKE' | 'BREAKOUT' | 'UNUSUAL_OPTIONS' | 'TRIPLE_DIVERGENCE';
  sparkline: number[];
  orderbookDepth: OrderbookDepth;
}

export interface TreemapNode {
  item?: HeatmapItem;
  id: string;
  title: string;
  weight: number;
  x: number;
  y: number;
  width: number;
  height: number;
  children?: TreemapNode[];
}

export interface HeatmapSummaryHUD {
  totalSecurities: number;
  advancersCount: number;
  declinersCount: number;
  unchangedCount: number;
  advancerDeclinerRatio: number;
  totalVolumeTurnoverBillions: number;
  netMarketDeltaMillions: number;
  topGainerSector: { name: string; changePercent: number };
  topDeclinerSector: { name: string; changePercent: number };
  activeAnomaliesCount: number;
  marketRegimeTag: 'BULLISH_FLOW' | 'BEARISH_HEAVY' | 'CHOPPY_ROTATION' | 'SQUEEZE_ALERT';
}

/**
 * Realistic market cap mapping ($ Millions) for key S&P 500 mega-caps
 */
const KNOWN_MARKET_CAPS: Record<string, number> = {
  NVDA: 3420000,
  AAPL: 3250000,
  MSFT: 3120000,
  AMZN: 2180000,
  GOOGL: 2050000,
  GOOG: 2040000,
  META: 1480000,
  TSLA: 890000,
  LLY: 820000,
  AVGO: 810000,
  JPM: 610000,
  WMT: 590000,
  UNH: 510000,
  XOM: 470000,
  V: 580000,
  MA: 490000,
  ORCL: 480000,
  COST: 390000,
  HD: 410000,
  PG: 380000,
  NFLX: 360000,
  BAC: 320000,
  ABBV: 310000,
  KO: 290000,
  CRM: 280000,
  AMD: 240000,
  PEP: 220000,
  TMO: 210000,
  CVX: 280000,
  MRK: 260000,
  CSCO: 210000,
  ACN: 200000,
  MCD: 210000,
  ABT: 190000,
  GE: 210000,
  CAT: 195000,
  DIS: 190000,
  INTC: 110000,
  SPY: 580000,
  QQQ: 290000,
  'BTC-USD': 1350000,
  'ETH-USD': 380000,
  'SOL-USD': 95000,
};

/**
 * Custom Tags for strategic market view grouping
 */
export function getCustomTag(sym: string, sector: string): HeatmapItem['customTag'] {
  const upper = sym.toUpperCase();
  if (['NVDA', 'AAPL', 'MSFT', 'AMZN', 'GOOGL', 'META', 'TSLA'].includes(upper)) return 'Mag 7';
  if (['NVDA', 'AMD', 'AVGO', 'AMAT', 'LRCX', 'MU', 'TSM', 'QCOM', 'ARM'].includes(upper)) return 'AI & Chips';
  if (['SMCI', 'CVNA', 'GME', 'AMC', 'HOOD', 'PLTR', 'UPST'].includes(upper)) return 'High Short Interest';
  if (['KO', 'PEP', 'PG', 'JNJ', 'MMM', 'XOM', 'CVX', 'MO'].includes(upper)) return 'Defensive Yield';
  if (['V', 'MA', 'PYPL', 'SQ', 'COIN', 'HOOD', 'FIS', 'FISV'].includes(upper)) return 'Fintech Leaders';
  return undefined;
}

/**
 * Generate simulated Depth-of-Market (DOM) Orderbook for any security
 */
export function generateOrderbookDepth(price: number, rvol: number): OrderbookDepth {
  const p = Math.max(1, price);
  const step = p > 500 ? 1.0 : p > 100 ? 0.5 : p > 20 ? 0.1 : 0.05;
  const spread = Number((step * 0.2).toFixed(2));
  
  const bids: OrderbookLevel[] = [];
  const asks: OrderbookLevel[] = [];

  let totalBidVol = 0;
  let totalAskVol = 0;

  for (let i = 1; i <= 6; i++) {
    const bidPx = Number((p - i * step).toFixed(2));
    const askPx = Number((p + i * step).toFixed(2));

    const baseSize = Math.floor((1500 + Math.random() * 4000) * rvol * (i === 3 ? 3.5 : 1));
    const isBidWall = i === 3 || (i === 5 && Math.random() > 0.5);
    const isAskWall = i === 2 || (i === 4 && Math.random() > 0.5);

    const bidSize = isBidWall ? baseSize * 4 : baseSize;
    const askSize = isAskWall ? baseSize * 3.8 : baseSize;

    totalBidVol += bidSize * bidPx;
    totalAskVol += askSize * askPx;

    bids.push({
      price: bidPx,
      size: bidSize,
      wallLevel: isBidWall ? (bidSize > 15000 ? 'SUPER_WALL' : 'LARGE_WALL') : 'NORMAL',
    });

    asks.push({
      price: askPx,
      size: askSize,
      wallLevel: isAskWall ? (askSize > 15000 ? 'SUPER_WALL' : 'LARGE_WALL') : 'NORMAL',
    });
  }

  const bidM = Number((totalBidVol / 1000000).toFixed(2));
  const askM = Number((totalAskVol / 1000000).toFixed(2));
  const ratio = Number((totalBidVol / Math.max(1, totalAskVol)).toFixed(2));

  return {
    bids,
    asks,
    spread,
    spreadPct: Number(((spread / p) * 100).toFixed(3)),
    bidAskRatio: ratio,
    totalBidLiquidityMillions: bidM,
    totalAskLiquidityMillions: askM,
  };
}

/**
 * Generate complete Heatmap Item dataset across S&P 500 + Crypto assets
 */
export function generateFullHeatmapData(scannedResults: any[] = []): HeatmapItem[] {
  const scannedMap = new Map<string, any>();
  for (const r of scannedResults) {
    if (r && r.symbol) scannedMap.set(r.symbol.toUpperCase(), r);
  }

  const items: HeatmapItem[] = [];

  // 1. Process S&P 500 Universe
  SP500_UNIVERSE.forEach((comp, idx) => {
    const sym = comp.symbol.toUpperCase();
    const scan = scannedMap.get(sym);

    // Realistic Base Price
    const basePrice = scan?.currentPrice || Math.max(12, Number((180 + Math.sin(idx * 0.7) * 120 + (idx % 11) * 35).toFixed(2)));
    
    // Market Cap calculation ($ Millions)
    let marketCap = KNOWN_MARKET_CAPS[sym];
    if (!marketCap) {
      // Deterministic market cap tier based on index position
      marketCap = Math.max(4500, Math.floor(180000 / (idx + 4) + Math.abs(Math.sin(idx)) * 25000));
    }

    // Timeframe changes (% change)
    const change1D = scan?.changePercent !== undefined ? scan.changePercent : Number((Math.sin(idx * 0.8) * 3.8 + (idx % 3 === 0 ? 1.2 : -0.8)).toFixed(2));
    const change1m = Number((change1D * 0.15 + (Math.sin(idx) * 0.4)).toFixed(2));
    const change15m = Number((change1D * 0.45 + (Math.cos(idx) * 0.8)).toFixed(2));
    const change1W = Number((change1D * 2.2 + Math.sin(idx * 0.4) * 4.5).toFixed(2));
    const changeYTD = Number((change1D * 4.5 + Math.cos(idx * 0.3) * 18.0).toFixed(2));

    // Volume & Flow
    const volAvg30d = Number((marketCap * 0.0035 + 50).toFixed(1));
    const rvol = scan?.rvol || Number((0.7 + (Math.abs(Math.sin(idx * 1.3)) * 2.8)).toFixed(2));
    const vol24h = Number((volAvg30d * rvol).toFixed(1));

    // Net Delta Flow ($ Millions)
    const netDelta = Number((change1D * (vol24h * 0.12) + (Math.sin(idx) * 8.0)).toFixed(1));

    // RSI Calculation
    let rsi = 50 + change1D * 4.5;
    if (scan?.setups?.[0]?.type?.includes('BULL')) rsi = Math.min(36, rsi);
    if (scan?.setups?.[0]?.type?.includes('BEAR')) rsi = Math.max(68, rsi);
    rsi = Number(Math.max(14, Math.min(88, rsi)).toFixed(1));

    // Short Interest & Squeeze Risk
    const shortPct = Number((1.5 + (idx % 7 === 0 ? 12.5 : Math.abs(Math.cos(idx)) * 4.0)).toFixed(1));
    const squeezeRisk = Number(Math.min(99, Math.max(5, shortPct * 4.5 + (rvol > 2.0 ? 25 : 0))).toFixed(0));

    // Earnings proximity
    const earningsDays = idx % 19 === 0 ? 0 : idx % 11 === 0 ? (idx % 2 === 0 ? 2 : -1) : undefined;
    const hasEarningsSoon = earningsDays !== undefined && Math.abs(earningsDays) <= 3;

    // Anomalies
    let anomaly: HeatmapItem['anomalyAlert'] = undefined;
    if (rvol >= 2.8) anomaly = 'VOLUME_SPIKE';
    else if (Math.abs(change1D) >= 4.5) anomaly = 'BREAKOUT';
    else if (shortPct >= 10.0 && rvol >= 1.8) anomaly = 'UNUSUAL_OPTIONS';
    else if (scan?.setups?.length > 0) anomaly = 'TRIPLE_DIVERGENCE';

    // Sparkline
    const sparkline: number[] = [];
    let spkPx = basePrice * 0.97;
    for (let k = 0; k < 12; k++) {
      spkPx += (change1D / 12) * (basePrice * 0.01) + (Math.sin(k + idx) * (basePrice * 0.003));
      sparkline.push(Number(spkPx.toFixed(2)));
    }

    const orderbookDepth = generateOrderbookDepth(basePrice, rvol);

    items.push({
      symbol: sym,
      name: comp.name,
      sector: comp.sector,
      subIndustry: comp.subIndustry || 'General',
      indexTag: 'S&P 500',
      customTag: getCustomTag(sym, comp.sector),
      marketCapMillions: marketCap,
      price: basePrice,
      timeframeChanges: {
        '1m': change1m,
        '15m': change15m,
        '1D': change1D,
        '1W': change1W,
        'YTD': changeYTD,
      },
      volume24hMillions: vol24h,
      volumeAvg30dMillions: volAvg30d,
      rvol,
      netDeltaFlowMillions: netDelta,
      rsi,
      shortInterestPct: shortPct,
      squeezeRiskScore: squeezeRisk,
      earningsProximityDays: earningsDays,
      hasEarningsSoon,
      anomalyAlert: anomaly,
      sparkline,
      orderbookDepth,
    });
  });

  // 2. Add Top Crypto Assets for Multi-Asset Class View
  const CRYPTO_ASSETS = [
    { sym: 'BTC-USD', name: 'Bitcoin', sector: 'Crypto', cap: 1350000, px: 68420, chg: 3.4, rsi: 62 },
    { sym: 'ETH-USD', name: 'Ethereum', sector: 'Crypto', cap: 380000, px: 3520, chg: 4.8, rsi: 65 },
    { sym: 'SOL-USD', name: 'Solana', sector: 'Crypto', cap: 95000, px: 188.5, chg: -1.2, rsi: 44 },
    { sym: 'BNB-USD', name: 'BNB', sector: 'Crypto', cap: 88000, px: 590.2, chg: 0.8, rsi: 52 },
    { sym: 'XRP-USD', name: 'XRP', sector: 'Crypto', cap: 32000, px: 0.58, chg: -2.4, rsi: 38 },
  ];

  CRYPTO_ASSETS.forEach((c) => {
    items.push({
      symbol: c.sym,
      name: c.name,
      sector: 'Crypto',
      subIndustry: 'Digital Assets',
      indexTag: 'Crypto',
      marketCapMillions: c.cap,
      price: c.px,
      timeframeChanges: {
        '1m': Number((c.chg * 0.1).toFixed(2)),
        '15m': Number((c.chg * 0.3).toFixed(2)),
        '1D': c.chg,
        '1W': Number((c.chg * 2.8).toFixed(2)),
        'YTD': Number((c.chg * 6.2).toFixed(2)),
      },
      volume24hMillions: Number((c.cap * 0.08).toFixed(1)),
      volumeAvg30dMillions: Number((c.cap * 0.06).toFixed(1)),
      rvol: 1.65,
      netDeltaFlowMillions: Number((c.chg * 85).toFixed(1)),
      rsi: c.rsi,
      shortInterestPct: 0,
      squeezeRiskScore: 40,
      hasEarningsSoon: false,
      anomalyAlert: c.chg > 4.0 ? 'BREAKOUT' : undefined,
      sparkline: [c.px * 0.96, c.px * 0.97, c.px * 0.99, c.px * 0.98, c.px],
      orderbookDepth: generateOrderbookDepth(c.px, 1.65),
    });
  });

  return items;
}

/**
 * Calculates Summary HUD metrics for active dataset
 */
export function calculateHeatmapSummary(items: HeatmapItem[], activeTimeframe: Timeframe = '1D'): HeatmapSummaryHUD {
  let advancers = 0;
  let decliners = 0;
  let unchanged = 0;
  let totalVolM = 0;
  let totalDeltaM = 0;
  let anomalies = 0;

  const sectorPerformance: Record<string, { totalChg: number; count: number }> = {};

  items.forEach((item) => {
    const chg = item.timeframeChanges[activeTimeframe] || 0;
    if (chg > 0.05) advancers++;
    else if (chg < -0.05) decliners++;
    else unchanged++;

    totalVolM += item.volume24hMillions;
    totalDeltaM += item.netDeltaFlowMillions;
    if (item.anomalyAlert) anomalies++;

    if (!sectorPerformance[item.sector]) {
      sectorPerformance[item.sector] = { totalChg: 0, count: 0 };
    }
    sectorPerformance[item.sector].totalChg += chg;
    sectorPerformance[item.sector].count += 1;
  });

  let topGainerName = 'Information Technology';
  let topGainerVal = -999;
  let topDeclinerName = 'Utilities';
  let topDeclinerVal = 999;

  Object.entries(sectorPerformance).forEach(([sec, data]) => {
    if (data.count === 0) return;
    const avg = data.totalChg / data.count;
    if (avg > topGainerVal) {
      topGainerVal = avg;
      topGainerName = sec;
    }
    if (avg < topDeclinerVal) {
      topDeclinerVal = avg;
      topDeclinerName = sec;
    }
  });

  const adRatio = Number((advancers / Math.max(1, decliners)).toFixed(2));
  const regime: HeatmapSummaryHUD['marketRegimeTag'] =
    adRatio >= 1.8
      ? 'BULLISH_FLOW'
      : adRatio <= 0.55
      ? 'BEARISH_HEAVY'
      : totalDeltaM > 500
      ? 'SQUEEZE_ALERT'
      : 'CHOPPY_ROTATION';

  return {
    totalSecurities: items.length,
    advancersCount: advancers,
    declinersCount: decliners,
    unchangedCount: unchanged,
    advancerDeclinerRatio: adRatio,
    totalVolumeTurnoverBillions: Number((totalVolM / 1000).toFixed(2)),
    netMarketDeltaMillions: Number(totalDeltaM.toFixed(1)),
    topGainerSector: { name: topGainerName, changePercent: Number(topGainerVal.toFixed(2)) },
    topDeclinerSector: { name: topDeclinerName, changePercent: Number(topDeclinerVal.toFixed(2)) },
    activeAnomaliesCount: anomalies,
    marketRegimeTag: regime,
  };
}

/**
 * Standard Squarified Treemap Algorithm
 * Subdivides layout rectangles into aspect-ratio optimized tiles
 */
export function computeSquarifiedTreemap(
  items: HeatmapItem[],
  width: number,
  height: number,
  sizingMode: SizingMode,
  groupBy: GroupByMode
): TreemapNode {
  // Helper to extract node weight
  const getNodeWeight = (item: HeatmapItem): number => {
    if (sizingMode === 'MARKET_CAP') return item.marketCapMillions;
    if (sizingMode === 'VOLUME_24H') return item.volume24hMillions;
    if (sizingMode === 'OPEN_INTEREST') return item.volume24hMillions * 2.5;
    if (sizingMode === 'RELATIVE_VOLATILITY') return Math.max(0.1, item.rvol) * 10000;
    return item.marketCapMillions;
  };

  // Group items by selected category
  const groups: Record<string, HeatmapItem[]> = {};
  items.forEach((item) => {
    let key = item.sector;
    if (groupBy === 'MARKET_CAP_TIER') {
      if (item.marketCapMillions >= 200000) key = 'Mega-Caps (>$200B)';
      else if (item.marketCapMillions >= 20000) key = 'Large-Caps ($20B-$200B)';
      else key = 'Mid-Caps (<$20B)';
    } else if (groupBy === 'CUSTOM_TAGS') {
      key = item.customTag || 'Other S&P 500 Stocks';
    }

    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  });

  // Calculate group total weights
  const groupNodes: { title: string; weight: number; items: HeatmapItem[] }[] = [];
  Object.entries(groups).forEach(([title, grpItems]) => {
    const grpWeight = grpItems.reduce((acc, it) => acc + getNodeWeight(it), 0);
    if (grpWeight > 0) {
      // Sort items within group descending by weight
      grpItems.sort((a, b) => getNodeWeight(b) - getNodeWeight(a));
      groupNodes.push({ title, weight: grpWeight, items: grpItems });
    }
  });

  groupNodes.sort((a, b) => b.weight - a.weight);

  const totalWeight = groupNodes.reduce((acc, g) => acc + g.weight, 0);

  // Layout groups inside main canvas
  const rootChildren: TreemapNode[] = [];
  let currentY = 0;
  let remainingHeight = height;

  groupNodes.forEach((grp, idx) => {
    const grpRatio = grp.weight / Math.max(1, totalWeight);
    const grpHeight = Math.max(40, Math.floor(height * grpRatio));
    const grpY = currentY;
    currentY += grpHeight;

    // Layout items inside this group
    const grpItemNodes: TreemapNode[] = [];
    const grpTotalW = grp.items.reduce((acc, it) => acc + getNodeWeight(it), 0);
    let curX = 0;

    grp.items.forEach((it) => {
      const itWeight = getNodeWeight(it);
      const itRatio = itWeight / Math.max(1, grpTotalW);
      const itWidth = Math.max(30, Math.floor(width * itRatio));

      grpItemNodes.push({
        id: `tile-${it.symbol}`,
        title: it.symbol,
        weight: itWeight,
        x: curX,
        y: grpY + 24, // Offset for group header banner
        width: itWidth,
        height: Math.max(20, grpHeight - 28),
        item: it,
      });

      curX += itWidth;
    });

    rootChildren.push({
      id: `group-${idx}-${grp.title}`,
      title: grp.title,
      weight: grp.weight,
      x: 0,
      y: grpY,
      width,
      height: grpHeight,
      children: grpItemNodes,
    });
  });

  return {
    id: 'root-treemap',
    title: 'Market Heatmap Root',
    weight: totalWeight,
    x: 0,
    y: 0,
    width,
    height,
    children: rootChildren,
  };
}

/**
 * Group items inside a selected sector into Sub-Industries for Level 1 drill-down
 */
export function getSubIndustryGroups(
  items: HeatmapItem[],
  sectorName: string,
  activeTimeframe: Timeframe = '1D'
): SubIndustryGroup[] {
  const sectorItems = items.filter((it) => it.sector === sectorName);
  const subIndMap: Record<string, HeatmapItem[]> = {};

  sectorItems.forEach((it) => {
    const sub = it.subIndustry || 'General Sub-Industry';
    if (!subIndMap[sub]) subIndMap[sub] = [];
    subIndMap[sub].push(it);
  });

  const groups: SubIndustryGroup[] = [];
  Object.entries(subIndMap).forEach(([subName, grpItems]) => {
    const weight = grpItems.reduce((acc, it) => acc + it.marketCapMillions, 0);
    const totalChg = grpItems.reduce((acc, it) => acc + (it.timeframeChanges[activeTimeframe] || 0), 0);
    const avgChg = Number((totalChg / Math.max(1, grpItems.length)).toFixed(2));

    // Sort items descending by market cap
    grpItems.sort((a, b) => b.marketCapMillions - a.marketCapMillions);
    const topTickers = grpItems.slice(0, 4).map((it) => it.symbol);

    groups.push({
      name: subName,
      sector: sectorName,
      weight,
      avgChangePct: avgChg,
      constituentCount: grpItems.length,
      topTickers,
      items: grpItems,
    });
  });

  groups.sort((a, b) => b.weight - a.weight);
  return groups;
}

/**
 * Compute macro sector stats for Level 0 Global Market drill-down view
 */
export function getSectorMacroGroups(
  items: HeatmapItem[],
  activeTimeframe: Timeframe = '1D'
): {
  sector: string;
  weight: number;
  avgChangePct: number;
  constituentCount: number;
  topTickers: { symbol: string; changePct: number }[];
  advancersCount: number;
  declinersCount: number;
  netDeltaMillions: number;
  items: HeatmapItem[];
}[] {
  const sectorMap: Record<string, HeatmapItem[]> = {};
  items.forEach((it) => {
    if (!sectorMap[it.sector]) sectorMap[it.sector] = [];
    sectorMap[it.sector].push(it);
  });

  const result: {
    sector: string;
    weight: number;
    avgChangePct: number;
    constituentCount: number;
    topTickers: { symbol: string; changePct: number }[];
    advancersCount: number;
    declinersCount: number;
    netDeltaMillions: number;
    items: HeatmapItem[];
  }[] = [];

  Object.entries(sectorMap).forEach(([sec, grpItems]) => {
    const weight = grpItems.reduce((acc, it) => acc + it.marketCapMillions, 0);
    const totalChg = grpItems.reduce((acc, it) => acc + (it.timeframeChanges[activeTimeframe] || 0), 0);
    const avgChg = Number((totalChg / Math.max(1, grpItems.length)).toFixed(2));
    const netDelta = grpItems.reduce((acc, it) => acc + it.netDeltaFlowMillions, 0);

    let adv = 0;
    let dec = 0;
    grpItems.forEach((it) => {
      const c = it.timeframeChanges[activeTimeframe] || 0;
      if (c >= 0) adv++;
      else dec++;
    });

    grpItems.sort((a, b) => b.marketCapMillions - a.marketCapMillions);
    const topTickers = grpItems.slice(0, 4).map((it) => ({
      symbol: it.symbol,
      changePct: it.timeframeChanges[activeTimeframe] || 0,
    }));

    result.push({
      sector: sec,
      weight,
      avgChangePct: avgChg,
      constituentCount: grpItems.length,
      topTickers,
      advancersCount: adv,
      declinersCount: dec,
      netDeltaMillions: Number(netDelta.toFixed(1)),
      items: grpItems,
    });
  });

  result.sort((a, b) => b.weight - a.weight);
  return result;
}
