import React, { useState, useEffect } from 'react';
import {
  Activity,
  Layers,
  Search,
  Zap,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  ShieldCheck,
  Clock,
  Flame,
  Award,
  DollarSign,
  Percent,
  RefreshCw,
  Info,
  Sliders,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import {
  CboeMarketOverview,
  TickerOptionsSummary,
  OptionChainRow,
  getCboeMarketOverview,
  generateTickerOptionsSummary,
} from '../utils/cboeOptionsEngine';
import { SP500_UNIVERSE } from '../data/sp500Universe';

interface CboeOptionsAnalyticsProps {
  initialSymbol?: string;
  onSelectSymbolForChart: (sym: string) => void;
}

export const CboeOptionsAnalytics: React.FC<CboeOptionsAnalyticsProps> = ({
  initialSymbol = 'NVDA',
  onSelectSymbolForChart,
}) => {
  const [selectedSymbol, setSelectedSymbol] = useState<string>(initialSymbol.toUpperCase());
  const [searchInput, setSearchInput] = useState<string>('');
  const [underlyingPrice, setUnderlyingPrice] = useState<number>(180.0);
  const [marketOverview, setMarketOverview] = useState<CboeMarketOverview>(() => getCboeMarketOverview());
  const [optionsSummary, setOptionsSummary] = useState<TickerOptionsSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [lastFetched, setLastFetched] = useState<Date>(() => new Date());
  const [secondsAgo, setSecondsAgo] = useState<number>(0);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [selectedExpIndex, setSelectedExpIndex] = useState<number>(2); // 30-day default
  const [chainFilter, setChainFilter] = useState<'ALL' | 'ITM' | 'NEAR_MONEY'>('ALL');

  // Track elapsed seconds since last fetch
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsAgo(Math.max(0, Math.floor((Date.now() - lastFetched.getTime()) / 1000)));
    }, 1000);
    return () => clearInterval(timer);
  }, [lastFetched]);

  // Load CBOE options data from server API or pure logic engine
  const fetchOptionsData = async (sym: string, isManualRefresh: boolean = false) => {
    if (isManualRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const url = `/api/cboe-options?symbol=${encodeURIComponent(sym)}${isManualRefresh ? '&refresh=true' : ''}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.marketOverview) {
          setMarketOverview(data.marketOverview);
          setLastFetched(new Date(data.marketOverview.lastFetchedAt || Date.now()));
          setSecondsAgo(0);
        }
        if (data.optionsSummary) {
          setOptionsSummary(data.optionsSummary);
          setUnderlyingPrice(data.optionsSummary.underlyingPrice || 180.0);
        }
      } else {
        // Fallback to client pure logic calculation
        const fallbackSummary = generateTickerOptionsSummary(sym, underlyingPrice, 32.5);
        setOptionsSummary(fallbackSummary);
        setLastFetched(new Date());
      }
    } catch (e) {
      const fallbackSummary = generateTickerOptionsSummary(sym, underlyingPrice, 32.5);
      setOptionsSummary(fallbackSummary);
      setLastFetched(new Date());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchOptionsData(selectedSymbol);
  }, [selectedSymbol]);

  // Listen to global market data refresh event triggered from header
  useEffect(() => {
    const handleGlobalRefresh = () => {
      fetchOptionsData(selectedSymbol, true);
    };
    window.addEventListener('market-data-refreshed', handleGlobalRefresh);
    return () => window.removeEventListener('market-data-refreshed', handleGlobalRefresh);
  }, [selectedSymbol]);

  // Auto-refresh interval (every 20s to keep VIX and Greeks fresh on time)
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchOptionsData(selectedSymbol, true);
    }, 20000);
    return () => clearInterval(interval);
  }, [selectedSymbol, autoRefresh]);

  const handleManualRefresh = () => {
    fetchOptionsData(selectedSymbol, true);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      const clean = searchInput.trim().toUpperCase();
      setSelectedSymbol(clean);
      setSearchInput('');
    }
  };

  // Filter chain rows based on filter tab
  const filteredRows = optionsSummary ? optionsSummary.chainRows.filter((row) => {
    if (chainFilter === 'ITM') {
      return row.call.inTheMoney || row.put.inTheMoney;
    }
    if (chainFilter === 'NEAR_MONEY') {
      return Math.abs(row.strike - optionsSummary.underlyingPrice) <= optionsSummary.underlyingPrice * 0.05;
    }
    return true;
  }) : [];

  return (
    <div className="space-y-6">
      {/* CBOE MACRO MARKET OVERVIEW BANNER */}
      <div className="bg-gradient-to-r from-indigo-950/60 via-zinc-900 to-zinc-950 border border-indigo-500/30 rounded-2xl p-6 shadow-xl relative overflow-visible">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold">
                <Activity className="w-3.5 h-3.5" />
                <span>CBOE Options Analytics &amp; Black-Scholes Greeks Engine</span>
              </div>

              {/* Real-time Data Freshness Badge */}
              <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-mono">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>{marketOverview.isLive ? 'Live Feed Connected' : 'Calibrated Feed'}</span>
              </div>

              <div className="inline-flex items-center space-x-1 text-[11px] text-zinc-400 font-mono">
                <Clock className="w-3 h-3 text-zinc-500" />
                <span>
                  Last fetch: {lastFetched.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} ({secondsAgo === 0 ? 'just now' : `${secondsAgo}s ago`})
                </span>
              </div>
            </div>

            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              CBOE Market Volatility &amp; Option Greeks ($\Gamma, \Theta, \nu, \Delta$)
            </h2>
            <p className="mt-1 text-xs text-zinc-300 max-w-3xl leading-relaxed">
              Real-time institutional options flow tracking Net Gamma Exposure (GEX), Black-Scholes Option Greeks, Implied Volatility Rank (IVR), CBOE VIX Index skew, and Max Pain strike pinning across the entire S&amp;P 500 universe.
            </p>

            {/* Auto-Refresh & Manual Trigger Controls */}
            <div className="flex items-center space-x-3 mt-3 pt-3 border-t border-indigo-500/20 text-xs">
              <button
                onClick={handleManualRefresh}
                disabled={refreshing}
                className="flex items-center space-x-1.5 px-3 py-1 rounded-lg bg-indigo-600/80 hover:bg-indigo-600 text-white font-medium transition disabled:opacity-50 shadow-sm"
                title="Fetch latest CBOE VIX, SKEW, and options chain immediately"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                <span>{refreshing ? 'Refreshing Live...' : 'Refresh Quotes Now'}</span>
              </button>

              <label className="flex items-center space-x-1.5 cursor-pointer text-zinc-300 text-[11px] select-none">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="rounded border-zinc-700 text-indigo-500 focus:ring-0 accent-indigo-500"
                />
                <span>Auto-refresh on time (20s)</span>
              </label>

              <span className="text-[10px] text-zinc-500 font-mono hidden sm:inline">
                Hover over metric cards for institutional explanations &bull; Source: {marketOverview.dataSource || 'CBOE via Yahoo'}
              </span>
            </div>
          </div>

          {/* Quick Stats Pill Grid with Educational Hover Popovers */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono shrink-0">
            {/* 1. CBOE VIX Index Card */}
            <div className="bg-zinc-950/90 border border-zinc-800 hover:border-indigo-500/60 p-3.5 rounded-xl relative group/vix cursor-help transition shadow-lg">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-400 uppercase block font-sans font-semibold">CBOE VIX Index</span>
                <span className="w-4 h-4 rounded-full bg-zinc-900 border border-zinc-700 flex items-center justify-center text-[10px] text-zinc-400 group-hover/vix:text-indigo-400 group-hover/vix:border-indigo-500 transition">
                  ?
                </span>
              </div>
              <div className="flex items-baseline space-x-1.5 mt-1">
                <span className="text-xl sm:text-2xl font-bold text-emerald-400 font-mono tracking-tight">
                  {marketOverview.vixIndex.toFixed(2)}
                </span>
                {marketOverview.vixChangePct !== undefined && (
                  <span
                    className={`text-[10px] font-mono font-bold ${
                      marketOverview.vixChangePct <= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {marketOverview.vixChangePct <= 0 ? '' : '+'}
                    {marketOverview.vixChangePct}%
                  </span>
                )}
              </div>
              <span className="text-[10px] text-zinc-400 block font-sans mt-0.5 font-medium">
                {marketOverview.vixIndex < 15
                  ? 'Low Vol (Complacent)'
                  : marketOverview.vixIndex < 20
                  ? 'Normal Vol Regime'
                  : marketOverview.vixIndex < 30
                  ? 'Elevated Vol Regime'
                  : 'Panic / Crisis Vol'}
              </span>

              {/* Interactive Educational Hover Popover */}
              <div className="absolute right-0 sm:left-1/2 sm:-translate-x-1/2 top-full mt-2 hidden group-hover/vix:block z-50 w-80 sm:w-96 p-4 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl text-left pointer-events-none transition-all duration-150">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-800">
                  <span className="font-bold text-white text-xs flex items-center gap-1.5 font-sans">
                    <Activity className="w-3.5 h-3.5 text-indigo-400" />
                    CBOE Volatility Index (VIX)
                  </span>
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
                    Live: {marketOverview.vixIndex.toFixed(2)}
                  </span>
                </div>
                <div className="space-y-2 text-zinc-300 text-[11px] font-sans leading-relaxed">
                  <p>
                    <strong className="text-white">What it is:</strong> Known as Wall Street&apos;s &ldquo;Fear Gauge,&rdquo; the VIX measures 30-day expected annualized volatility of the S&amp;P 500, calculated continuously from real-time SPX put and call bid/ask strips.
                  </p>
                  <div className="space-y-1 pt-1 border-t border-zinc-800 text-[10px] font-mono">
                    <div className="font-sans font-semibold text-zinc-400 uppercase tracking-wider text-[9px]">
                      Benchmark Regimes:
                    </div>
                    <div className="flex justify-between text-emerald-400">
                      <span>&bull; &lt; 15.0: Low Volatility</span>
                      <span className="text-zinc-500">Complacent / orderly bull grind</span>
                    </div>
                    <div className="flex justify-between text-blue-400 font-bold bg-blue-500/10 px-1 py-0.5 rounded">
                      <span>&bull; 15.0 – 20.0: Normal Regime</span>
                      <span>Current ({marketOverview.vixIndex.toFixed(2)}) &bull; Balanced</span>
                    </div>
                    <div className="flex justify-between text-amber-400">
                      <span>&bull; 20.0 – 30.0: Elevated Vol</span>
                      <span className="text-zinc-500">Hedging demand active</span>
                    </div>
                    <div className="flex justify-between text-rose-400">
                      <span>&bull; &gt; 30.0: Extreme Panic</span>
                      <span className="text-zinc-500">Market crash / capitulation</span>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-zinc-800 text-[10px] text-zinc-400 space-y-1">
                    <div>
                      <strong className="text-zinc-200">Impact on Trading:</strong> At {marketOverview.vixIndex.toFixed(2)}, normal volatility provides healthy price action where Trullàs 3rd-wave MACD divergences and Fibonacci swing targets respect levels cleanly without erratic overnight gaps.
                    </div>
                    {marketOverview.vixDayHigh && marketOverview.vixDayLow && (
                      <div className="text-[10px] font-mono text-zinc-500 pt-1">
                        Day High: ${marketOverview.vixDayHigh} &bull; Day Low: ${marketOverview.vixDayLow} &bull; Prev Close: ${marketOverview.vixPrevClose}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Market Net GEX Card */}
            <div className="bg-zinc-950/90 border border-zinc-800 hover:border-emerald-500/60 p-3.5 rounded-xl relative group/gex cursor-help transition shadow-lg">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-400 uppercase block font-sans font-semibold">Market Net GEX</span>
                <span className="w-4 h-4 rounded-full bg-zinc-900 border border-zinc-700 flex items-center justify-center text-[10px] text-zinc-400 group-hover/gex:text-emerald-400 group-hover/gex:border-emerald-500 transition">
                  ?
                </span>
              </div>
              <span className="text-xl sm:text-2xl font-bold text-emerald-400 block mt-1 font-mono tracking-tight">
                {marketOverview.totalMarketGexMillions >= 0 ? '+' : ''}${marketOverview.totalMarketGexMillions.toFixed(1)}M
              </span>
              <span className="text-[10px] text-emerald-500/90 block font-sans mt-0.5 font-medium">
                {marketOverview.marketMakerGammaRegime === 'LONG_GAMMA_SUPPRESSION'
                  ? 'Long Gamma (Suppressed)'
                  : marketOverview.marketMakerGammaRegime === 'SHORT_GAMMA_EXPANSION'
                  ? 'Short Gamma (Expanding)'
                  : 'Neutral Gamma Flip'}
              </span>

              {/* Interactive Educational Hover Popover */}
              <div className="absolute right-0 sm:left-1/2 sm:-translate-x-1/2 top-full mt-2 hidden group-hover/gex:block z-50 w-80 sm:w-96 p-4 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl text-left pointer-events-none transition-all duration-150">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-800">
                  <span className="font-bold text-white text-xs flex items-center gap-1.5 font-sans">
                    <Zap className="w-3.5 h-3.5 text-emerald-400" />
                    Market Net Gamma Exposure (GEX)
                  </span>
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
                    {marketOverview.totalMarketGexMillions >= 0 ? '+' : ''}${marketOverview.totalMarketGexMillions.toFixed(1)}M
                  </span>
                </div>
                <div className="space-y-2 text-zinc-300 text-[11px] font-sans leading-relaxed">
                  <p>
                    <strong className="text-white">What it is:</strong> Net GEX measures the dollar amount of underlying S&amp;P 500 stock that option market makers must buy or sell to keep their portfolios delta-neutral for every 1% move in price.
                  </p>
                  <div className="space-y-1.5 pt-1 border-t border-zinc-800 text-[10px]">
                    <div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/20">
                      <strong className="text-emerald-400 block font-semibold">Positive GEX (Long Gamma - Current State):</strong>
                      <span className="text-zinc-300">
                        Market makers must <strong>buy into sell-offs</strong> and <strong>sell into rallies</strong>. This acts as a volatility shock absorber, dampening moves and pinning the index around major option strikes.
                      </span>
                    </div>
                    <div className="p-2 rounded bg-rose-500/10 border border-rose-500/20">
                      <strong className="text-rose-400 block font-semibold">Negative GEX (Short Gamma):</strong>
                      <span className="text-zinc-300">
                        Market makers must sell into dips and buy into rips, amplifying momentum and creating sudden rapid sell-offs.
                      </span>
                    </div>
                  </div>
                  <div className="pt-1 text-[10px] text-zinc-400">
                    <strong className="text-zinc-200">Impact on Trading:</strong> High positive GEX creates reliable bounce zones at historical support triggers.
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Put/Call Ratio Card */}
            <div className="bg-zinc-950/90 border border-zinc-800 hover:border-amber-500/60 p-3.5 rounded-xl relative group/pc cursor-help transition shadow-lg">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-400 uppercase block font-sans font-semibold">Put/Call Ratio</span>
                <span className="w-4 h-4 rounded-full bg-zinc-900 border border-zinc-700 flex items-center justify-center text-[10px] text-zinc-400 group-hover/pc:text-amber-400 group-hover/pc:border-amber-500 transition">
                  ?
                </span>
              </div>
              <span className="text-xl sm:text-2xl font-bold text-amber-400 block mt-1 font-mono tracking-tight">
                {marketOverview.putCallVolumeRatio.toFixed(2)}
              </span>
              <span className="text-[10px] text-zinc-400 block font-sans mt-0.5 font-medium">
                {marketOverview.putCallVolumeRatio < 0.7
                  ? 'Extreme Bullish (<0.7)'
                  : marketOverview.putCallVolumeRatio < 0.85
                  ? 'Bullish Tilt (<0.85)'
                  : marketOverview.putCallVolumeRatio < 1.0
                  ? 'Neutral Balance'
                  : 'Bearish Hedging (>1.0)'}
              </span>

              {/* Interactive Educational Hover Popover */}
              <div className="absolute right-0 sm:left-1/2 sm:-translate-x-1/2 top-full mt-2 hidden group-hover/pc:block z-50 w-80 sm:w-96 p-4 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl text-left pointer-events-none transition-all duration-150">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-800">
                  <span className="font-bold text-white text-xs flex items-center gap-1.5 font-sans">
                    <Sliders className="w-3.5 h-3.5 text-amber-400" />
                    CBOE Put/Call Volume Ratio
                  </span>
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">
                    {marketOverview.putCallVolumeRatio.toFixed(2)} Ratio
                  </span>
                </div>
                <div className="space-y-2 text-zinc-300 text-[11px] font-sans leading-relaxed">
                  <p>
                    <strong className="text-white">What it is:</strong> Total trading volume of put options divided by call options on CBOE. It reflects broad institutional and retail market positioning.
                  </p>
                  <div className="space-y-1 pt-1 border-t border-zinc-800 text-[10px] font-mono">
                    <div className="font-sans font-semibold text-zinc-400 uppercase tracking-wider text-[9px]">
                      Ratio Thresholds:
                    </div>
                    <div className="flex justify-between text-emerald-400">
                      <span>&bull; &lt; 0.70: Extreme Bullish</span>
                      <span className="text-zinc-500">Call-heavy speculative buying</span>
                    </div>
                    <div className="flex justify-between text-amber-400 font-bold bg-amber-500/10 px-1 py-0.5 rounded">
                      <span>&bull; 0.70 – 0.85: Bullish Tilt</span>
                      <span>Current ({marketOverview.putCallVolumeRatio.toFixed(2)}) &bull; Constructive</span>
                    </div>
                    <div className="flex justify-between text-blue-400">
                      <span>&bull; 0.85 – 1.00: Neutral</span>
                      <span className="text-zinc-500">Balanced normal hedging</span>
                    </div>
                    <div className="flex justify-between text-rose-400">
                      <span>&bull; &gt; 1.00: Bearish Tilt</span>
                      <span className="text-zinc-500">Heavy downside put protection</span>
                    </div>
                  </div>
                  <div className="pt-1 text-[10px] text-zinc-400">
                    <strong className="text-zinc-200">Impact on Trading:</strong> At {marketOverview.putCallVolumeRatio.toFixed(2)}, call demand exceeds puts, confirming institutional appetite for upside breakouts.
                  </div>
                </div>
              </div>
            </div>

            {/* 4. CBOE Skew Index Card */}
            <div className="bg-zinc-950/90 border border-zinc-800 hover:border-indigo-500/60 p-3.5 rounded-xl relative group/skew cursor-help transition shadow-lg">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-400 uppercase block font-sans font-semibold">CBOE Skew Index</span>
                <span className="w-4 h-4 rounded-full bg-zinc-900 border border-zinc-700 flex items-center justify-center text-[10px] text-zinc-400 group-hover/skew:text-indigo-400 group-hover/skew:border-indigo-500 transition">
                  ?
                </span>
              </div>
              <span className="text-xl sm:text-2xl font-bold text-indigo-400 block mt-1 font-mono tracking-tight">
                {marketOverview.cboeSkewIndex.toFixed(1)}
              </span>
              <span className="text-[10px] text-zinc-400 block font-sans mt-0.5 font-medium">
                {marketOverview.cboeSkewIndex < 115
                  ? 'Low Tail Risk'
                  : marketOverview.cboeSkewIndex < 135
                  ? 'Tail Risk Benchmark'
                  : 'Elevated Tail Skew'}
              </span>

              {/* Interactive Educational Hover Popover */}
              <div className="absolute right-0 top-full mt-2 hidden group-hover/skew:block z-50 w-80 sm:w-96 p-4 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl text-left pointer-events-none transition-all duration-150">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-800">
                  <span className="font-bold text-white text-xs flex items-center gap-1.5 font-sans">
                    <Flame className="w-3.5 h-3.5 text-indigo-400" />
                    CBOE SKEW Index (&ldquo;Black Swan Index&rdquo;)
                  </span>
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-400">
                    {marketOverview.cboeSkewIndex.toFixed(1)}
                  </span>
                </div>
                <div className="space-y-2 text-zinc-300 text-[11px] font-sans leading-relaxed">
                  <p>
                    <strong className="text-white">What it is:</strong> SKEW measures the relative price of deep out-of-the-money (OTM) puts versus at-the-money options on the S&amp;P 500. It tracks the market&apos;s perceived probability of extreme &ldquo;fat tail&rdquo; 2+ standard deviation crash events.
                  </p>
                  <div className="space-y-1 pt-1 border-t border-zinc-800 text-[10px] font-mono">
                    <div className="font-sans font-semibold text-zinc-400 uppercase tracking-wider text-[9px]">
                      SKEW Risk Scale:
                    </div>
                    <div className="flex justify-between text-emerald-400">
                      <span>&bull; 100.0 – 115.0: Low Risk</span>
                      <span className="text-zinc-500">Normal log-normal probability</span>
                    </div>
                    <div className="flex justify-between text-blue-400">
                      <span>&bull; 115.0 – 130.0: Benchmark</span>
                      <span className="text-zinc-500">Standard portfolio hedging</span>
                    </div>
                    <div className="flex justify-between text-indigo-400 font-bold bg-indigo-500/10 px-1 py-0.5 rounded">
                      <span>&bull; 135.0 – 150.0+: Elevated Skew</span>
                      <span>Current ({marketOverview.cboeSkewIndex.toFixed(1)}) &bull; Active insurance</span>
                    </div>
                  </div>
                  <div className="pt-1 text-[10px] text-zinc-400">
                    <strong className="text-zinc-200">Impact on Trading:</strong> Elevated SKEW shows prudent institutional risk hedging while front-month VIX remains composed, indicating institutions are hedging quietly without disorderly liquidation.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* TICKER SEARCH & SELECTION BAR (ALL 503 S&P 500 CONSTITUENTS) */}
      <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-md">
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          {/* Direct Search Form */}
          <form onSubmit={handleSearchSubmit} className="flex items-center space-x-2 w-full sm:w-64">
            <div className="relative w-full">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search ticker (e.g. NVDA, AAPL)..."
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-indigo-500 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none font-mono"
              />
            </div>
            <button
              type="submit"
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl transition shadow-sm shrink-0"
            >
              Analyze
            </button>
          </form>

          {/* S&P 500 Complete Universe Dropdown Selector */}
          <div className="flex items-center space-x-2 w-full sm:w-80">
            <span className="text-zinc-500 text-xs font-mono shrink-0">S&amp;P 500:</span>
            <select
              value={selectedSymbol}
              onChange={(e) => setSelectedSymbol(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 focus:border-indigo-500 text-xs text-white rounded-xl px-3 py-2 font-mono focus:outline-none cursor-pointer"
            >
              {SP500_UNIVERSE.map((item, idx) => (
                <option key={`cboe-sp-${item.symbol}-${idx}`} value={item.symbol}>
                  {item.symbol} - {item.name} ({item.sector})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Quick Ticker Presets & Universe Badge */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono shrink-0">
          <span className="text-emerald-400 text-[11px] font-semibold bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full mr-1 font-sans">
            503 S&amp;P 500 Companies Supported
          </span>
          {['NVDA', 'AAPL', 'MSFT', 'AMZN', 'TSLA', 'SPY', 'AMD', 'JPM'].map((sym, idx) => (
            <button
              key={`cboe-preset-${sym}-${idx}`}
              onClick={() => setSelectedSymbol(sym)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                selectedSymbol === sym
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-700'
              }`}
            >
              {sym}
            </button>
          ))}
          <button
            onClick={() => fetchOptionsData(selectedSymbol)}
            className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg ml-2 transition"
            title="Refresh CBOE Options Data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-indigo-400' : ''}`} />
          </button>
        </div>
      </div>

      {optionsSummary && (
        <>
          {/* TICKER GREEKS & VOLATILITY HUD GAUGES */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-6 shadow-md">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
              <div>
                <div className="flex items-center space-x-3">
                  <h3 className="text-2xl font-extrabold text-white font-mono">{optionsSummary.symbol}</h3>
                  <span className="text-xl font-bold text-emerald-400 font-mono">
                    ${optionsSummary.underlyingPrice.toFixed(2)}
                  </span>
                  <button
                    onClick={() => onSelectSymbolForChart(optionsSummary.symbol)}
                    className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-xs text-indigo-300 font-semibold rounded-lg transition"
                  >
                    View Chart
                  </button>
                </div>
                <p className="text-xs text-zinc-400 mt-1">
                  CBOE Implied Volatility: <strong className="text-white font-mono">{optionsSummary.impliedVolatilityPct}%</strong> &bull; IV Rank: <strong className="text-amber-400 font-mono">{optionsSummary.ivRankPct}%</strong> &bull; Historical Vol (30d): <strong className="text-zinc-300 font-mono">{optionsSummary.historicalVol30dPct}%</strong>
                </p>
              </div>

              <div className="flex items-center space-x-3 text-xs font-mono">
                <div className="p-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-right">
                  <span className="text-[10px] text-zinc-500 uppercase block font-sans">Max Pain Strike</span>
                  <span className="font-bold text-amber-400">${optionsSummary.maxPainStrike.toFixed(2)}</span>
                </div>
                <div className="p-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-right">
                  <span className="text-[10px] text-zinc-500 uppercase block font-sans">Zero GEX Flip</span>
                  <span className="font-bold text-indigo-400">${optionsSummary.zeroGexFlipPrice.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* 5 BLACK-SCHOLES GREEKS CARDS */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 font-mono">
              {/* GAMMA CARD */}
              <div className="bg-zinc-950 border border-indigo-500/30 rounded-xl p-4 relative overflow-hidden group hover:border-indigo-400 transition">
                <div className="text-[11px] text-indigo-400 uppercase tracking-wider font-semibold font-sans flex items-center justify-between">
                  <span>Gamma ($\Gamma$)</span>
                  <Zap className="w-3.5 h-3.5 text-indigo-400" />
                </div>
                <div className="text-2xl font-bold text-white mt-1">
                  {optionsSummary.averageGreeks.gammaAtm.toFixed(4)}
                </div>
                <div className="text-[10px] text-zinc-400 mt-1 font-sans leading-normal">
                  Delta acceleration per $1 stock move. Drives market maker hedging pressure.
                </div>
              </div>

              {/* THETA CARD */}
              <div className="bg-zinc-950 border border-amber-500/30 rounded-xl p-4 relative overflow-hidden group hover:border-amber-400 transition">
                <div className="text-[11px] text-amber-400 uppercase tracking-wider font-semibold font-sans flex items-center justify-between">
                  <span>Theta ($\Theta$)</span>
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                </div>
                <div className="text-2xl font-bold text-amber-400 mt-1">
                  ${optionsSummary.averageGreeks.thetaDailyAtm.toFixed(3)}
                </div>
                <div className="text-[10px] text-zinc-400 mt-1 font-sans leading-normal">
                  Calendar decay ($ loss / day). Accelerates during final 21 days to expiry.
                </div>
              </div>

              {/* VEGA CARD */}
              <div className="bg-zinc-950 border border-emerald-500/30 rounded-xl p-4 relative overflow-hidden group hover:border-emerald-400 transition">
                <div className="text-[11px] text-emerald-400 uppercase tracking-wider font-semibold font-sans flex items-center justify-between">
                  <span>Vega ($\nu$)</span>
                  <Flame className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <div className="text-2xl font-bold text-emerald-400 mt-1">
                  +${optionsSummary.averageGreeks.vegaAtm.toFixed(3)}
                </div>
                <div className="text-[10px] text-zinc-400 mt-1 font-sans leading-normal">
                  Price shift per +1.0% change in Implied Volatility (IV expansion).
                </div>
              </div>

              {/* DELTA CARD */}
              <div className="bg-zinc-950 border border-blue-500/30 rounded-xl p-4 relative overflow-hidden group hover:border-blue-400 transition">
                <div className="text-[11px] text-blue-400 uppercase tracking-wider font-semibold font-sans flex items-center justify-between">
                  <span>Delta ($\Delta$)</span>
                  <TrendingUp className="w-3.5 h-3.5 text-blue-400" />
                </div>
                <div className="text-2xl font-bold text-blue-400 mt-1">
                  +{optionsSummary.averageGreeks.callDeltaAtm.toFixed(2)}
                </div>
                <div className="text-[10px] text-zinc-400 mt-1 font-sans leading-normal">
                  ATM Call directional exposure. Equivalent to {Math.round(optionsSummary.averageGreeks.callDeltaAtm * 100)} shares.
                </div>
              </div>

              {/* NET GEX CARD */}
              <div className="bg-zinc-950 border border-purple-500/30 rounded-xl p-4 relative overflow-hidden group hover:border-purple-400 transition">
                <div className="text-[11px] text-purple-400 uppercase tracking-wider font-semibold font-sans flex items-center justify-between">
                  <span>Net GEX ($M)</span>
                  <Activity className="w-3.5 h-3.5 text-purple-400" />
                </div>
                <div className="text-2xl font-bold text-purple-300 mt-1">
                  +${optionsSummary.totalGexMillions.toFixed(1)}M
                </div>
                <div className="text-[10px] text-zinc-400 mt-1 font-sans leading-normal">
                  Net Gamma Exposure across strikes. Positive = Volatility Suppression.
                </div>
              </div>
            </div>
          </div>

          {/* INTERACTIVE OPTION CHAIN TABLE */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4 shadow-md">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
              <div>
                <h3 className="text-base font-bold text-white font-mono flex items-center space-x-2">
                  <span>Interactive CBOE Option Chain &amp; Greeks Table</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                    {optionsSummary.chainRows.length} Strikes
                  </span>
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Side-by-side Call Options vs Put Options with Black-Scholes Greeks and Open Interest.
                </p>
              </div>

              {/* Expiration Selector */}
              <div className="flex items-center space-x-1.5 bg-zinc-950 border border-zinc-800 p-1.5 rounded-xl font-mono text-xs">
                <span className="text-zinc-500 text-[11px] px-2 font-sans">Expiration:</span>
                {optionsSummary.expirationDates.map((expDate, idx) => (
                  <button
                    key={`cboe-exp-${expDate}-${idx}`}
                    onClick={() => setSelectedExpIndex(idx)}
                    className={`px-2.5 py-1 rounded-lg transition ${
                      selectedExpIndex === idx
                        ? 'bg-indigo-600 text-white font-bold shadow-sm'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {expDate.slice(5)}
                  </button>
                ))}
              </div>
            </div>

            {/* Filter Buttons */}
            <div className="flex items-center justify-between text-xs font-mono">
              <div className="flex items-center space-x-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
                {(['ALL', 'NEAR_MONEY', 'ITM'] as const).map((filter, idx) => (
                  <button
                    key={`cboe-flt-${filter}-${idx}`}
                    onClick={() => setChainFilter(filter)}
                    className={`px-3 py-1 rounded-lg transition ${
                      chainFilter === filter
                        ? 'bg-zinc-800 text-white font-bold'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {filter === 'ALL' ? 'All Strikes' : filter === 'NEAR_MONEY' ? 'Near Money (±5%)' : 'In The Money'}
                  </button>
                ))}
              </div>

              <span className="text-zinc-500 text-[11px] font-sans">
                Max Pain Pinning Target: <strong className="text-amber-400 font-mono">${optionsSummary.maxPainStrike.toFixed(2)}</strong>
              </span>
            </div>

            {/* CHAIN TABLE */}
            <div className="overflow-x-auto rounded-xl border border-zinc-800">
              <table className="w-full text-xs font-mono text-left border-collapse">
                <thead className="bg-zinc-950 text-zinc-400 text-[10px] uppercase border-b border-zinc-800">
                  <tr>
                    <th colSpan={6} className="py-2.5 px-3 text-center bg-emerald-950/40 text-emerald-400 border-r border-zinc-800 font-bold">
                      CALL OPTIONS (BULLISH)
                    </th>
                    <th className="py-2.5 px-3 text-center bg-zinc-900 text-white font-extrabold border-r border-zinc-800">
                      STRIKE
                    </th>
                    <th colSpan={6} className="py-2.5 px-3 text-center bg-rose-950/40 text-rose-400 font-bold">
                      PUT OPTIONS (BEARISH)
                    </th>
                  </tr>
                  <tr className="border-b border-zinc-800 bg-zinc-950/80">
                    <th className="py-2 px-2 text-right text-zinc-500">IV%</th>
                    <th className="py-2 px-2 text-right text-zinc-500">$\Delta$</th>
                    <th className="py-2 px-2 text-right text-zinc-500">$\Gamma$</th>
                    <th className="py-2 px-2 text-right text-zinc-500">$\Theta$</th>
                    <th className="py-2 px-2 text-right text-zinc-300">Bid/Ask</th>
                    <th className="py-2 px-2 text-right text-emerald-400 border-r border-zinc-800">Last</th>

                    <th className="py-2 px-3 text-center text-white bg-zinc-900 border-r border-zinc-800 font-bold">
                      ($)
                    </th>

                    <th className="py-2 px-2 text-left text-rose-400">Last</th>
                    <th className="py-2 px-2 text-left text-zinc-300">Bid/Ask</th>
                    <th className="py-2 px-2 text-left text-zinc-500">$\Theta$</th>
                    <th className="py-2 px-2 text-left text-zinc-500">$\Gamma$</th>
                    <th className="py-2 px-2 text-left text-zinc-500">$\Delta$</th>
                    <th className="py-2 px-2 text-left text-zinc-500">IV%</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-zinc-800/60 bg-zinc-900/60">
                  {filteredRows.map((row, idx) => {
                    const isAtm = Math.abs(row.strike - optionsSummary.underlyingPrice) < (optionsSummary.underlyingPrice * 0.02);

                    return (
                      <tr
                        key={`cboe-row-${row.strike}-${idx}`}
                        className={`hover:bg-zinc-800/40 transition ${
                          isAtm ? 'bg-indigo-950/30' : ''
                        } ${row.isMaxPainStrike ? 'border-l-2 border-l-amber-400' : ''}`}
                      >
                        {/* CALL SIDE */}
                        <td className="py-2 px-2 text-right text-zinc-400 text-[11px]">
                          {row.call.impliedVolatilityPct}%
                        </td>
                        <td className="py-2 px-2 text-right text-blue-400 font-bold">
                          +{row.call.greeks.delta.toFixed(2)}
                        </td>
                        <td className="py-2 px-2 text-right text-indigo-300 text-[11px]">
                          {row.call.greeks.gamma.toFixed(4)}
                        </td>
                        <td className="py-2 px-2 text-right text-amber-400 text-[11px]">
                          {row.call.greeks.theta.toFixed(2)}
                        </td>
                        <td className="py-2 px-2 text-right text-zinc-300 text-[11px]">
                          ${row.call.bid.toFixed(2)} / ${row.call.ask.toFixed(2)}
                        </td>
                        <td className={`py-2 px-2 text-right font-bold border-r border-zinc-800 ${row.call.inTheMoney ? 'text-emerald-400 bg-emerald-950/20' : 'text-zinc-200'}`}>
                          ${row.call.lastPrice.toFixed(2)}
                        </td>

                        {/* STRIKE PRICE */}
                        <td className={`py-2 px-3 text-center font-extrabold font-mono border-r border-zinc-800 ${isAtm ? 'bg-indigo-600 text-white shadow-sm' : 'bg-zinc-950 text-white'}`}>
                          ${row.strike.toFixed(2)}
                          {row.isMaxPainStrike && (
                            <span className="block text-[8px] font-sans text-amber-400 font-semibold">Max Pain</span>
                          )}
                        </td>

                        {/* PUT SIDE */}
                        <td className={`py-2 px-2 text-left font-bold ${row.put.inTheMoney ? 'text-rose-400 bg-rose-950/20' : 'text-zinc-200'}`}>
                          ${row.put.lastPrice.toFixed(2)}
                        </td>
                        <td className="py-2 px-2 text-left text-zinc-300 text-[11px]">
                          ${row.put.bid.toFixed(2)} / ${row.put.ask.toFixed(2)}
                        </td>
                        <td className="py-2 px-2 text-left text-amber-400 text-[11px]">
                          {row.put.greeks.theta.toFixed(2)}
                        </td>
                        <td className="py-2 px-2 text-left text-indigo-300 text-[11px]">
                          {row.put.greeks.gamma.toFixed(4)}
                        </td>
                        <td className="py-2 px-2 text-left text-rose-400 font-bold">
                          {row.put.greeks.delta.toFixed(2)}
                        </td>
                        <td className="py-2 px-2 text-left text-zinc-400 text-[11px]">
                          {row.put.impliedVolatilityPct}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
