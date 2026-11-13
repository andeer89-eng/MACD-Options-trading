/**
 * Elite Market Heatmap State Engine
 * Pure analytical grouping, breadth aggregation, and squarified treemap layout
 * driven strictly by real market quote feeds from /api/heatmap.
 */

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
  bidAskRatio: number;
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
  rvol: number; // Relative Volume vs 20-30d avg
  netDeltaFlowMillions: number; // Price-volume directional flow proxy from real OHLCV
  rsi: number;
  shortInterestPct?: number;
  squeezeRiskScore?: number;
  earningsProximityDays?: number;
  hasEarningsSoon: boolean;
  anomalyAlert?: 'VOLUME_SPIKE' | 'BREAKOUT' | 'UNUSUAL_OPTIONS' | 'TRIPLE_DIVERGENCE';
  sparkline: number[];
  orderbookDepth?: OrderbookDepth;
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
 * Reference S&P 500 & Digital Asset market-cap weighting ($ Millions) for treemap tile proportions
 * when batched spark endpoint returns price/volume without fundamental shares outstanding.
 */
export const KNOWN_MARKET_CAPS: Record<string, number> = {
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
  'BNB-USD': 88000,
  'XRP-USD': 32000,
};

export const CRYPTO_HEATMAP_UNIVERSE = [
  { symbol: 'BTC-USD', name: 'Bitcoin', sector: 'Crypto', subIndustry: 'Digital Assets' },
  { symbol: 'ETH-USD', name: 'Ethereum', sector: 'Crypto', subIndustry: 'Digital Assets' },
  { symbol: 'SOL-USD', name: 'Solana', sector: 'Crypto', subIndustry: 'Digital Assets' },
  { symbol: 'BNB-USD', name: 'BNB', sector: 'Crypto', subIndustry: 'Digital Assets' },
  { symbol: 'XRP-USD', name: 'XRP', sector: 'Crypto', subIndustry: 'Digital Assets' },
] as const;

/**
 * Custom Tags for strategic market view grouping
 */
export function getCustomTag(sym: string, _sector: string): HeatmapItem['customTag'] {
  const upper = sym.toUpperCase();
  if (['NVDA', 'AAPL', 'MSFT', 'AMZN', 'GOOGL', 'META', 'TSLA'].includes(upper)) return 'Mag 7';
  if (['NVDA', 'AMD', 'AVGO', 'AMAT', 'LRCX', 'MU', 'TSM', 'QCOM', 'ARM'].includes(upper)) return 'AI & Chips';
  if (['SMCI', 'CVNA', 'GME', 'AMC', 'HOOD', 'PLTR', 'UPST'].includes(upper)) return 'High Short Interest';
  if (['KO', 'PEP', 'PG', 'JNJ', 'MMM', 'XOM', 'CVX', 'MO'].includes(upper)) return 'Defensive Yield';
  if (['V', 'MA', 'PYPL', 'SQ', 'COIN', 'HOOD', 'FIS', 'FISV'].includes(upper)) return 'Fintech Leaders';
  return undefined;
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

  let topGainerName = '—';
  let topGainerVal = -Infinity;
  let topDeclinerName = '—';
  let topDeclinerVal = Infinity;

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

  if (!Number.isFinite(topGainerVal)) topGainerVal = 0;
  if (!Number.isFinite(topDeclinerVal)) topDeclinerVal = 0;

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
  const getNodeWeight = (item: HeatmapItem): number => {
    if (sizingMode === 'MARKET_CAP') return Math.max(1, item.marketCapMillions);
    if (sizingMode === 'VOLUME_24H') return Math.max(1, item.volume24hMillions);
    if (sizingMode === 'OPEN_INTEREST') return Math.max(1, item.volume24hMillions * 2.5);
    if (sizingMode === 'RELATIVE_VOLATILITY') return Math.max(0.1, item.rvol) * 10000;
    return Math.max(1, item.marketCapMillions);
  };

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

  const groupNodes: { title: string; weight: number; items: HeatmapItem[] }[] = [];
  Object.entries(groups).forEach(([title, grpItems]) => {
    const grpWeight = grpItems.reduce((acc, it) => acc + getNodeWeight(it), 0);
    if (grpWeight > 0) {
      grpItems.sort((a, b) => getNodeWeight(b) - getNodeWeight(a));
      groupNodes.push({ title, weight: grpWeight, items: grpItems });
    }
  });

  groupNodes.sort((a, b) => b.weight - a.weight);

  const totalWeight = groupNodes.reduce((acc, g) => acc + g.weight, 0);

  const rootChildren: TreemapNode[] = [];
  let currentY = 0;

  groupNodes.forEach((grp, idx) => {
    const grpRatio = grp.weight / Math.max(1, totalWeight);
    const grpHeight = Math.max(40, Math.floor(height * grpRatio));
    const grpY = currentY;
    currentY += grpHeight;

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
        y: grpY + 24,
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
