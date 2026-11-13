import { SP500Company, SP500_UNIVERSE } from '../data/sp500Universe';

export interface GicsSectorMetadata {
  name: string;
  etf: string;
  sp500WeightPct: number;
  description: string;
  keyMegaCaps: string[];
}

export interface GicsSectorPerformance {
  name: string;
  etf: string;
  price: number;
  changeNominal: number;
  changePercent: number;
  weekChangePercent?: number;
  monthChangePercent?: number;
  rsVsSpy?: number;
  volume: number;
  constituentCount: number;
  sp500WeightPct: number;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  sparkline: number[];
  keyMegaCaps: string[];
  activeDivergenceCount?: number;
  isLive?: boolean;
}

export const GICS_SECTORS_METADATA: GicsSectorMetadata[] = [
  {
    name: 'Information Technology',
    etf: 'XLK',
    sp500WeightPct: 31.8,
    description: 'Semiconductors, software, hardware, and IT cloud services',
    keyMegaCaps: ['AAPL', 'NVDA', 'MSFT', 'AVGO', 'AMD'],
  },
  {
    name: 'Financials',
    etf: 'XLF',
    sp500WeightPct: 13.2,
    description: 'Diversified banks, investment banking, asset managers & insurance',
    keyMegaCaps: ['JPM', 'BAC', 'V', 'MA', 'WFC'],
  },
  {
    name: 'Health Care',
    etf: 'XLV',
    sp500WeightPct: 11.6,
    description: 'Biotech, pharmaceuticals, medical devices & healthcare plans',
    keyMegaCaps: ['LLY', 'UNH', 'JNJ', 'ABBV', 'MRK'],
  },
  {
    name: 'Consumer Discretionary',
    etf: 'XLY',
    sp500WeightPct: 10.1,
    description: 'E-commerce, EV automotive, retail apparel & restaurants',
    keyMegaCaps: ['AMZN', 'TSLA', 'HD', 'MCD', 'NKE'],
  },
  {
    name: 'Communication Services',
    etf: 'XLC',
    sp500WeightPct: 9.0,
    description: 'Search engines, social media platforms, entertainment & telecom',
    keyMegaCaps: ['GOOGL', 'META', 'NFLX', 'DIS', 'VZ'],
  },
  {
    name: 'Industrials',
    etf: 'XLI',
    sp500WeightPct: 8.4,
    description: 'Aerospace, defense, heavy machinery, transportation & logistics',
    keyMegaCaps: ['GE', 'CAT', 'UNP', 'HON', 'RTX'],
  },
  {
    name: 'Consumer Staples',
    etf: 'XLP',
    sp500WeightPct: 5.7,
    description: 'Packaged goods, beverage leaders, grocery wholesale & household care',
    keyMegaCaps: ['COST', 'PG', 'WMT', 'KO', 'PEP'],
  },
  {
    name: 'Energy',
    etf: 'XLE',
    sp500WeightPct: 3.4,
    description: 'Oil & gas integrated majors, exploration & field services',
    keyMegaCaps: ['XOM', 'CVX', 'COP', 'EOG', 'SLB'],
  },
  {
    name: 'Materials',
    etf: 'XLB',
    sp500WeightPct: 2.3,
    description: 'Chemicals, industrial gases, copper/gold mining & packaging',
    keyMegaCaps: ['LIN', 'SHW', 'FCX', 'APD', 'ECL'],
  },
  {
    name: 'Utilities',
    etf: 'XLU',
    sp500WeightPct: 2.3,
    description: 'Regulated electric utilities, renewable power & water infrastructure',
    keyMegaCaps: ['NEE', 'SO', 'DUK', 'CEG', 'AEP'],
  },
  {
    name: 'Real Estate',
    etf: 'XLRE',
    sp500WeightPct: 2.2,
    description: 'Data center REITs, cell tower infrastructure & logistics warehouses',
    keyMegaCaps: ['PLD', 'AMT', 'EQIX', 'PSA', 'O'],
  },
];

/**
 * Filter universe tickers based on the set of active selected sectors
 */
export function filterWatchlistBySectors(
  universe: SP500Company[] = SP500_UNIVERSE,
  selectedSectors: string[] | Set<string>
): string[] {
  const sectorSet = selectedSectors instanceof Set ? selectedSectors : new Set(selectedSectors);
  if (sectorSet.size === 0) return [];
  return universe
    .filter((comp) => sectorSet.has(comp.sector))
    .map((comp) => comp.symbol);
}

/**
 * Computes S&P 500 Market Breadth and leadership from live sector performance
 */
export function calculateSectorBreadth(sectors: GicsSectorPerformance[]) {
  let advancing = 0;
  let declining = 0;
  let unchanged = 0;
  let topGainer: GicsSectorPerformance | null = null;
  let topLoser: GicsSectorPerformance | null = null;

  for (const s of sectors) {
    if (s.changePercent > 0.05) advancing++;
    else if (s.changePercent < -0.05) declining++;
    else unchanged++;

    if (!topGainer || s.changePercent > topGainer.changePercent) {
      topGainer = s;
    }
    if (!topLoser || s.changePercent < topLoser.changePercent) {
      topLoser = s;
    }
  }

  const avgChange =
    sectors.length > 0
      ? sectors.reduce((acc, curr) => acc + curr.changePercent, 0) / sectors.length
      : 0;

  return {
    advancing,
    declining,
    unchanged,
    total: sectors.length,
    topGainer,
    topLoser,
    avgChange: Number(avgChange.toFixed(2)),
  };
}

/**
 * Common sector filtering presets
 */
export function getSectorPresets(): { id: string; label: string; sectors: string[] }[] {
  const allSectors = GICS_SECTORS_METADATA.map((s) => s.name);
  return [
    {
      id: 'all',
      label: 'All 11 Sectors (503)',
      sectors: allSectors,
    },
    {
      id: 'tech_growth',
      label: 'Tech & Growth',
      sectors: ['Information Technology', 'Communication Services', 'Consumer Discretionary'],
    },
    {
      id: 'defensive',
      label: 'Defensive Value',
      sectors: ['Health Care', 'Consumer Staples', 'Utilities'],
    },
    {
      id: 'cyclicals',
      label: 'Cyclicals & Value',
      sectors: ['Financials', 'Industrials', 'Energy', 'Materials'],
    },
    {
      id: 'infrastructure',
      label: 'Infra & Real Assets',
      sectors: ['Energy', 'Real Estate', 'Utilities', 'Materials'],
    },
  ];
}
