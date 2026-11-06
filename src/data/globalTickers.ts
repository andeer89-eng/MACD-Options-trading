/**
 * Global and European / Nordic Equities Registry
 * Supplements S&P 500 universe with key international tickers, semiconductor leaders,
 * Nordic tech companies, and dual-listed assets.
 */

export interface GlobalCompanyProfile {
  symbol: string;
  name: string;
  longName?: string;
  sector: string;
  subIndustry: string;
  exchange: string;
  country: string;
  currency: string;
  typicalPrice?: number;
  description?: string;
}

export const GLOBAL_TICKER_REGISTRY: Record<string, GlobalCompanyProfile> = {
  // Sivers Semiconductors AB (Sweden - Nasdaq Stockholm)
  'SIVE.ST': {
    symbol: 'SIVE.ST',
    name: 'Sivers Semiconductors AB',
    longName: 'Sivers Semiconductors AB (publ)',
    sector: 'Information Technology',
    subIndustry: 'Semiconductors (Photonics & Wireless)',
    exchange: 'Nasdaq Stockholm (STO)',
    country: 'Sweden',
    currency: 'SEK',
    typicalPrice: 17.05,
    description: 'Sweden-based semiconductor pioneer specializing in RF Photonics and Wireless 5G/6G millimeter-wave solutions.',
  },
  'SIVE': {
    symbol: 'SIVE.ST',
    name: 'Sivers Semiconductors AB',
    longName: 'Sivers Semiconductors AB (publ)',
    sector: 'Information Technology',
    subIndustry: 'Semiconductors (Photonics & Wireless)',
    exchange: 'Nasdaq Stockholm (STO)',
    country: 'Sweden',
    currency: 'SEK',
    typicalPrice: 17.05,
    description: 'Sweden-based semiconductor pioneer specializing in RF Photonics and Wireless 5G/6G millimeter-wave solutions.',
  },
  'SIVEF': {
    symbol: 'SIVEF',
    name: 'Sivers Semiconductors AB (ADR)',
    longName: 'Sivers Semiconductors AB (publ) OTC',
    sector: 'Information Technology',
    subIndustry: 'Semiconductors (Photonics & Wireless)',
    exchange: 'US OTC',
    country: 'Sweden',
    currency: 'USD',
    typicalPrice: 1.65,
    description: 'US OTC listing for Sivers Semiconductors AB.',
  },

  // Key Global & European Semiconductor Giants
  'ASML': {
    symbol: 'ASML',
    name: 'ASML Holding N.V.',
    sector: 'Information Technology',
    subIndustry: 'Semiconductor Equipment (EUV Lithography)',
    exchange: 'NASDAQ / Euronext Amsterdam',
    country: 'Netherlands',
    currency: 'EUR/USD',
    typicalPrice: 720.0,
  },
  'ASML.AS': {
    symbol: 'ASML.AS',
    name: 'ASML Holding N.V.',
    sector: 'Information Technology',
    subIndustry: 'Semiconductor Equipment',
    exchange: 'Euronext Amsterdam',
    country: 'Netherlands',
    currency: 'EUR',
    typicalPrice: 680.0,
  },
  'TSM': {
    symbol: 'TSM',
    name: 'Taiwan Semiconductor Manufacturing Co.',
    longName: 'Taiwan Semiconductor Manufacturing Company Limited',
    sector: 'Information Technology',
    subIndustry: 'Semiconductors (Foundry)',
    exchange: 'NYSE',
    country: 'Taiwan',
    currency: 'USD',
    typicalPrice: 195.0,
  },
  'ARM': {
    symbol: 'ARM',
    name: 'Arm Holdings plc',
    sector: 'Information Technology',
    subIndustry: 'Semiconductors & IP Architecture',
    exchange: 'NASDAQ',
    country: 'United Kingdom',
    currency: 'USD',
    typicalPrice: 145.0,
  },
  'STM': {
    symbol: 'STM',
    name: 'STMicroelectronics N.V.',
    sector: 'Information Technology',
    subIndustry: 'Semiconductors',
    exchange: 'NYSE / Euronext Paris',
    country: 'Switzerland/France/Italy',
    currency: 'EUR/USD',
    typicalPrice: 26.5,
  },
  'IFX.DE': {
    symbol: 'IFX.DE',
    name: 'Infineon Technologies AG',
    sector: 'Information Technology',
    subIndustry: 'Semiconductors (Power & Automotive)',
    exchange: 'XETRA (Frankfurt)',
    country: 'Germany',
    currency: 'EUR',
    typicalPrice: 31.2,
  },

  // Key Nordic Leaders (Nasdaq Stockholm & OMX)
  'ERIC.ST': {
    symbol: 'ERIC.ST',
    name: 'Telefonaktiebolaget LM Ericsson',
    sector: 'Information Technology',
    subIndustry: 'Communications Equipment & 5G',
    exchange: 'Nasdaq Stockholm',
    country: 'Sweden',
    currency: 'SEK',
    typicalPrice: 82.5,
  },
  'ERIC': {
    symbol: 'ERIC',
    name: 'Telefonaktiebolaget LM Ericsson (ADR)',
    sector: 'Information Technology',
    subIndustry: 'Communications Equipment',
    exchange: 'NASDAQ',
    country: 'Sweden',
    currency: 'USD',
    typicalPrice: 7.9,
  },
  'NOKIA.HE': {
    symbol: 'NOKIA.HE',
    name: 'Nokia Oyj',
    sector: 'Information Technology',
    subIndustry: 'Communications Equipment',
    exchange: 'Nasdaq Helsinki',
    country: 'Finland',
    currency: 'EUR',
    typicalPrice: 4.15,
  },
  'VOLV-B.ST': {
    symbol: 'VOLV-B.ST',
    name: 'AB Volvo (publ)',
    sector: 'Industrials',
    subIndustry: 'Commercial Vehicles & Trucks',
    exchange: 'Nasdaq Stockholm',
    country: 'Sweden',
    currency: 'SEK',
    typicalPrice: 285.0,
  },
  'INVE-B.ST': {
    symbol: 'INVE-B.ST',
    name: 'Investor AB',
    sector: 'Financials',
    subIndustry: 'Industrial Holding & Investments',
    exchange: 'Nasdaq Stockholm',
    country: 'Sweden',
    currency: 'SEK',
    typicalPrice: 310.0,
  },
};

/**
 * Resolves any stock symbol across S&P 500 and Global/Nordic registry.
 */
export function lookupGlobalCompany(rawSymbol: string): GlobalCompanyProfile | null {
  if (!rawSymbol) return null;
  const upper = rawSymbol.trim().toUpperCase();

  // 1. Direct registry lookup
  if (GLOBAL_TICKER_REGISTRY[upper]) {
    return GLOBAL_TICKER_REGISTRY[upper];
  }

  // 2. Handle dot vs hyphen variations (e.g. SIVE-ST -> SIVE.ST)
  const dotNotation = upper.replace(/-/g, '.');
  if (GLOBAL_TICKER_REGISTRY[dotNotation]) {
    return GLOBAL_TICKER_REGISTRY[dotNotation];
  }

  // 3. Handle base symbol without exchange (e.g. SIVE -> SIVE.ST)
  const baseSym = upper.split('.')[0].split('-')[0];
  if (GLOBAL_TICKER_REGISTRY[baseSym]) {
    return GLOBAL_TICKER_REGISTRY[baseSym];
  }

  return null;
}
