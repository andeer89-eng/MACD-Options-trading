import React from 'react';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Gauge,
  Flame,
  Zap,
  BarChart2,
  ExternalLink,
  ShieldAlert,
  Sparkles,
  PieChart,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import {
  calculateMarketOverview,
  WatchlistConstituent,
  MarketOverviewStats,
} from '../utils/marketOverview';

interface MarketOverviewProps {
  results: WatchlistConstituent[];
  onSelectSymbolForChart: (symbol: string) => void;
}

export const MarketOverview: React.FC<MarketOverviewProps> = ({
  results,
  onSelectSymbolForChart,
}) => {
  const stats: MarketOverviewStats = React.useMemo(() => {
    return calculateMarketOverview(results);
  }, [results]);

  if (results.length === 0) {
    return null;
  }

  const isBullLean = stats.bullishSignalsCount >= stats.bearishSignalsCount;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 sm:p-6 space-y-6 shadow-xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800/80">
        <div>
          <div className="inline-flex items-center space-x-2 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium mb-1.5">
            <Activity className="w-3.5 h-3.5" />
            <span>Active Basket Intelligence</span>
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <span>Market Overview &amp; Watchlist Aggregates</span>
            <span className="text-xs font-mono font-normal px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800 text-zinc-400">
              {stats.totalTickers} Constituents
            </span>
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Real-time aggregate direction signals, volatility exposure, and RSI momentum leaders across your active scanner queue.
          </p>
        </div>

        <div className="flex items-center space-x-3 shrink-0">
          <div
            className={`px-3 py-1.5 rounded-xl border text-xs font-bold font-mono uppercase tracking-wider flex items-center space-x-1.5 ${
              stats.marketSentiment.includes('Bullish')
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                : stats.marketSentiment.includes('Bearish')
                ? 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                : 'bg-zinc-800 border-zinc-700 text-zinc-300'
            }`}
          >
            {isBullLean ? (
              <TrendingUp className="w-3.5 h-3.5" />
            ) : (
              <TrendingDown className="w-3.5 h-3.5" />
            )}
            <span>{stats.marketSentiment}</span>
          </div>
        </div>
      </div>

      {/* TOP AGGREGATE STATS CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Card 1: Bullish vs Bearish Directional Ratio */}
        <div className="bg-zinc-950/80 border border-zinc-800/90 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-400 font-medium">Signal Direction Ratio</span>
            <span className="font-mono text-zinc-500 text-[11px]">
              {stats.totalSignals} Total Setups
            </span>
          </div>

          <div className="flex items-baseline justify-between font-mono">
            <div className="flex items-baseline space-x-1.5">
              <span className="text-2xl font-bold text-emerald-400">
                {stats.bullishSignalsCount}
              </span>
              <span className="text-xs text-emerald-500 font-sans">Bullish</span>
            </div>

            <div className="text-zinc-600 font-bold">vs</div>

            <div className="flex items-baseline space-x-1.5">
              <span className="text-2xl font-bold text-rose-400">
                {stats.bearishSignalsCount}
              </span>
              <span className="text-xs text-rose-500 font-sans">Bearish</span>
            </div>
          </div>

          {/* Visual Ratio Progress Bar */}
          <div className="space-y-1">
            <div className="w-full bg-zinc-900 h-2 rounded-full overflow-hidden flex border border-zinc-800">
              <div
                className="bg-emerald-500 transition-all duration-300"
                style={{ width: `${stats.bullishRatioPercent}%` }}
                title={`${stats.bullishRatioPercent}% Bullish`}
              ></div>
              <div
                className="bg-rose-500 transition-all duration-300"
                style={{ width: `${100 - stats.bullishRatioPercent}%` }}
                title={`${100 - stats.bullishRatioPercent}% Bearish`}
              ></div>
            </div>
            <div className="flex justify-between text-[10px] font-mono text-zinc-500">
              <span className="text-emerald-400 font-semibold">{stats.bullishRatioPercent}% Bull</span>
              <span className="text-rose-400 font-semibold">
                {(100 - stats.bullishRatioPercent).toFixed(1)}% Bear
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: Average Basket Volatility (ATR %) */}
        <div className="bg-zinc-950/80 border border-zinc-800/90 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-400 font-medium">Average Basket Volatility</span>
            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400">
              ATR (14D)
            </span>
          </div>

          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-amber-400 font-mono">
              {stats.averageVolatilityAtrPct}%
            </span>
            <span className="text-xs text-zinc-400">daily swing range</span>
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-zinc-900 text-xs">
            <span
              className={`text-[11px] font-mono px-2 py-0.5 rounded border ${
                stats.volatilityRegime === 'High Volatility'
                  ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                  : stats.volatilityRegime === 'Moderate Volatility'
                  ? 'bg-blue-500/15 border-blue-500/30 text-blue-300'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-400'
              }`}
            >
              {stats.volatilityRegime}
            </span>

            {stats.stagnantAssetsCount > 0 && (
              <span className="text-[11px] text-zinc-500 font-mono">
                {stats.stagnantAssetsCount} stagnant (&lt;1% ATR)
              </span>
            )}
          </div>
        </div>

        {/* Card 3: Sector Distribution Overview */}
        <div className="bg-zinc-950/80 border border-zinc-800/90 rounded-xl p-4 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-400 font-medium">Sector Clustered Holdings</span>
            <span className="font-mono text-zinc-500 text-[11px]">
              {stats.sectorDistribution.length} Sectors
            </span>
          </div>

          <div className="space-y-1.5 max-h-24 overflow-y-auto pr-1">
            {stats.sectorDistribution.slice(0, 4).map((sec, secIdx) => (
              <div
                key={`sec-dist-${sec.sector}-${secIdx}`}
                className="flex items-center justify-between text-xs font-mono"
              >
                <span className="text-zinc-300 truncate max-w-[140px] text-[11px] font-sans">
                  {sec.sector}
                </span>
                <div className="flex items-center space-x-2 shrink-0">
                  <span className="text-zinc-500 text-[10px]">{sec.count} stocks</span>
                  <span
                    className={`font-bold text-[11px] ${
                      sec.averageChange >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {sec.averageChange >= 0 ? '+' : ''}
                    {sec.averageChange}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* TOP PERFORMING TICKERS BY RSI STRENGTH & MOMENTUM */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Flame className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-bold text-white tracking-tight">
              Top Watchlist Tickers by RSI Strength
            </h3>
          </div>
          <span className="text-[11px] font-mono text-zinc-500">
            Ranked by 14-period Relative Strength Index
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {stats.topByRsiStrength.map((ticker, idx) => (
            <button
              key={`rsi-strength-${ticker.symbol}-${idx}`}
              onClick={() => onSelectSymbolForChart(ticker.symbol)}
              className="bg-zinc-950/80 hover:bg-zinc-800/60 border border-zinc-800 hover:border-zinc-700 p-3.5 rounded-xl text-left transition group space-y-2 relative"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-1.5">
                  <span className="w-5 h-5 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-[10px] font-mono font-bold text-zinc-400">
                    #{idx + 1}
                  </span>
                  <strong className="text-sm font-bold text-white font-mono group-hover:text-emerald-400 transition">
                    {ticker.symbol}
                  </strong>
                </div>

                <div
                  className={`px-2 py-0.5 rounded text-[11px] font-bold font-mono border ${
                    ticker.rsi >= 70
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                      : ticker.rsi >= 55
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                      : 'bg-zinc-800 text-zinc-300 border-zinc-700'
                  }`}
                >
                  RSI {ticker.rsi}
                </div>
              </div>

              <div>
                <p className="text-[11px] text-zinc-400 truncate font-sans">
                  {ticker.companyName}
                </p>
                <div className="flex items-center justify-between text-xs font-mono mt-1">
                  <span className="text-white font-semibold">
                    ${ticker.currentPrice.toFixed(2)}
                  </span>
                  <span
                    className={`font-bold flex items-center text-[11px] ${
                      ticker.changePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {ticker.changePercent >= 0 ? (
                      <ArrowUpRight className="w-3 h-3 mr-0.5" />
                    ) : (
                      <ArrowDownRight className="w-3 h-3 mr-0.5" />
                    )}
                    {ticker.changePercent >= 0 ? '+' : ''}
                    {ticker.changePercent.toFixed(2)}%
                  </span>
                </div>
              </div>

              {ticker.signalType && (
                <div className="pt-1.5 border-t border-zinc-900">
                  <span className="text-[9px] uppercase font-mono font-semibold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 truncate block">
                    {ticker.signalType.replace('_', ' ')}
                  </span>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
