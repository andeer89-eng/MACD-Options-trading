export interface WatchlistConstituent {
  symbol: string;
  companyName?: string;
  sector?: string;
  currentPrice: number;
  changePercent: number;
  rsi?: number;
  atr?: number;
  atrPercent?: number;
  isStagnant?: boolean;
  setups?: {
    type: string;
    qualityScore: number;
    triggerPrice: number;
    stopLoss: number;
  }[];
}

export interface RsiRankedItem {
  symbol: string;
  companyName: string;
  sector: string;
  rsi: number;
  changePercent: number;
  currentPrice: number;
  signalType?: string;
  category: 'Overbought / Momentum' | 'Bullish Zone' | 'Neutral' | 'Oversold / Demand';
}

export interface SectorBreakdownItem {
  sector: string;
  count: number;
  averageChange: number;
}

export interface MarketOverviewStats {
  totalTickers: number;
  totalSignals: number;
  bullishSignalsCount: number;
  bearishSignalsCount: number;
  neutralCount: number;
  bullishRatioPercent: number;
  marketSentiment:
    | 'Strong Bullish'
    | 'Bullish Lean'
    | 'Balanced / Neutral'
    | 'Bearish Lean'
    | 'Strong Bearish';
  averageVolatilityAtrPct: number;
  volatilityRegime: 'High Volatility' | 'Moderate Volatility' | 'Low / Compressed';
  stagnantAssetsCount: number;
  topByRsiStrength: RsiRankedItem[];
  oversoldOpportunities: RsiRankedItem[];
  sectorDistribution: SectorBreakdownItem[];
}

export function classifyRsiCategory(
  rsi: number
): 'Overbought / Momentum' | 'Bullish Zone' | 'Neutral' | 'Oversold / Demand' {
  if (rsi >= 70) return 'Overbought / Momentum';
  if (rsi >= 55) return 'Bullish Zone';
  if (rsi <= 35) return 'Oversold / Demand';
  return 'Neutral';
}

export function calculateMarketOverview(
  items: WatchlistConstituent[]
): MarketOverviewStats {
  if (!items || items.length === 0) {
    return {
      totalTickers: 0,
      totalSignals: 0,
      bullishSignalsCount: 0,
      bearishSignalsCount: 0,
      neutralCount: 0,
      bullishRatioPercent: 50,
      marketSentiment: 'Balanced / Neutral',
      averageVolatilityAtrPct: 0,
      volatilityRegime: 'Low / Compressed',
      stagnantAssetsCount: 0,
      topByRsiStrength: [],
      oversoldOpportunities: [],
      sectorDistribution: [],
    };
  }

  let bullishSignalsCount = 0;
  let bearishSignalsCount = 0;
  let totalVolatilitySum = 0;
  let validVolatilityCount = 0;
  let stagnantAssetsCount = 0;
  const sectorMap: Record<string, { count: number; totalChange: number }> = {};

  const processedRanked: RsiRankedItem[] = [];

  for (const item of items) {
    const setups = item.setups || [];
    let hasBull = false;
    let hasBear = false;
    let primarySetupType: string | undefined = undefined;

    for (const s of setups) {
      if (s.type.includes('BULL')) {
        bullishSignalsCount++;
        hasBull = true;
        if (!primarySetupType) primarySetupType = s.type;
      } else if (s.type.includes('BEAR')) {
        bearishSignalsCount++;
        hasBear = true;
        if (!primarySetupType) primarySetupType = s.type;
      }
    }

    // Volatility
    const atrPct = item.atrPercent ?? 1.5;
    totalVolatilitySum += atrPct;
    validVolatilityCount++;

    if (item.isStagnant || atrPct < 1.0) {
      stagnantAssetsCount++;
    }

    // Sector mapping
    const sec = item.sector || 'ETFs & Index';
    if (!sectorMap[sec]) {
      sectorMap[sec] = { count: 0, totalChange: 0 };
    }
    sectorMap[sec].count += 1;
    sectorMap[sec].totalChange += item.changePercent || 0;

    // RSI
    let rsi = item.rsi;
    if (typeof rsi !== 'number' || isNaN(rsi)) {
      // Estimate fallback from change percent if missing
      rsi = Number((50 + (item.changePercent || 0) * 3).toFixed(1));
      if (hasBull) rsi = Math.min(38, rsi);
      if (hasBear) rsi = Math.max(68, rsi);
      rsi = Math.max(15, Math.min(88, rsi));
    }

    processedRanked.push({
      symbol: item.symbol,
      companyName: item.companyName || item.symbol,
      sector: sec,
      rsi: Number(rsi.toFixed(1)),
      changePercent: item.changePercent || 0,
      currentPrice: item.currentPrice || 0,
      signalType: primarySetupType,
      category: classifyRsiCategory(rsi),
    });
  }

  const totalSignals = bullishSignalsCount + bearishSignalsCount;
  const neutralCount = items.length - (bullishSignalsCount > 0 ? 1 : 0);

  const bullishRatioPercent =
    totalSignals > 0
      ? Number(((bullishSignalsCount / totalSignals) * 100).toFixed(1))
      : 50.0;

  let marketSentiment: MarketOverviewStats['marketSentiment'] = 'Balanced / Neutral';
  if (totalSignals > 0) {
    if (bullishRatioPercent >= 75) marketSentiment = 'Strong Bullish';
    else if (bullishRatioPercent >= 55) marketSentiment = 'Bullish Lean';
    else if (bullishRatioPercent <= 25) marketSentiment = 'Strong Bearish';
    else if (bullishRatioPercent <= 45) marketSentiment = 'Bearish Lean';
  }

  const averageVolatilityAtrPct =
    validVolatilityCount > 0
      ? Number((totalVolatilitySum / validVolatilityCount).toFixed(2))
      : 0;

  let volatilityRegime: MarketOverviewStats['volatilityRegime'] = 'Moderate Volatility';
  if (averageVolatilityAtrPct >= 2.5) volatilityRegime = 'High Volatility';
  else if (averageVolatilityAtrPct < 1.2) volatilityRegime = 'Low / Compressed';

  // Sort by RSI descending for top strength
  const sortedByRsiDesc = [...processedRanked].sort((a, b) => b.rsi - a.rsi);
  const topByRsiStrength = sortedByRsiDesc.slice(0, 5);

  // Sort by RSI ascending for oversold demand candidates
  const sortedByRsiAsc = [...processedRanked].sort((a, b) => a.rsi - b.rsi);
  const oversoldOpportunities = sortedByRsiAsc.filter((item) => item.rsi <= 40).slice(0, 5);

  // Sector breakdown list
  const sectorDistribution: SectorBreakdownItem[] = Object.entries(sectorMap).map(
    ([sector, data]) => ({
      sector,
      count: data.count,
      averageChange: Number((data.totalChange / data.count).toFixed(2)),
    })
  );

  return {
    totalTickers: items.length,
    totalSignals,
    bullishSignalsCount,
    bearishSignalsCount,
    neutralCount,
    bullishRatioPercent,
    marketSentiment,
    averageVolatilityAtrPct,
    volatilityRegime,
    stagnantAssetsCount,
    topByRsiStrength,
    oversoldOpportunities,
    sectorDistribution,
  };
}
