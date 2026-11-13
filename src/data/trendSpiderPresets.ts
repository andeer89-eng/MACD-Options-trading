export interface SpotlightTickerMeta {
  symbol: string;
  name: string;
  sector: string;
  description: string;
}

export const TRENDSPIDER_SPOTLIGHT_TICKERS: SpotlightTickerMeta[] = [
  {
    symbol: 'NBIS',
    name: 'Nebius Group N.V.',
    sector: 'Technology & AI Infrastructure',
    description: 'AI compute infrastructure constituent tracked with live 30-week SMA Stan Weinstein stage classification.',
  },
  {
    symbol: 'INTC',
    name: 'Intel Corporation',
    sector: 'Semiconductors',
    description: 'Semiconductor bellwether evaluated across weekly 30-week SMA slope and Mansfield RS vs SPY.',
  },
  {
    symbol: 'SNDK',
    name: 'Sandisk Corporation',
    sector: 'Storage & Hardware',
    description: 'Memory & storage equity evaluated on live weekly OHLCV structure.',
  },
  {
    symbol: 'GOOG',
    name: 'Alphabet Inc.',
    sector: 'Communication Services',
    description: 'Mega-cap technology constituent tracked for weekly 30-week SMA stage transitions.',
  },
];
