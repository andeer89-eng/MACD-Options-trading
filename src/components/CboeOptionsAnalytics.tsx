import React, { useState, useEffect } from 'react';
import {
  Activity,
  Search,
  Zap,
  TrendingUp,
  ShieldAlert,
  Clock,
  Flame,
  RefreshCw,
  Sliders,
} from 'lucide-react';
import {
  CboeMarketOverview,
  TickerOptionsSummary,
  createUnavailableCboeOverview,
} from '../utils/cboeOptionsEngine';
import { SP500_UNIVERSE } from '../data/sp500Universe';

interface CboeOptionsAnalyticsProps {
  initialSymbol?: string;
  onSelectSymbolForChart: (sym: string) => void;
}

const fmtNum = (val: number | null | undefined, digits = 2, prefix = '', suffix = '') => {
  if (val === null || val === undefined || !Number.isFinite(val)) return '—';
  return `${prefix}${val.toFixed(digits)}${suffix}`;
};

export const CboeOptionsAnalytics: React.FC<CboeOptionsAnalyticsProps> = ({
  initialSymbol = 'NVDA',
  onSelectSymbolForChart,
}) => {
  const [selectedSymbol, setSelectedSymbol] = useState<string>(initialSymbol.toUpperCase());
  const [searchInput, setSearchInput] = useState<string>('');
  const [marketOverview, setMarketOverview] = useState<CboeMarketOverview>(() =>
    createUnavailableCboeOverview('Connecting to live CBOE & Yahoo Finance feeds...')
  );
  const [optionsSummary, setOptionsSummary] = useState<TickerOptionsSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date>(() => new Date());
  const [secondsAgo, setSecondsAgo] = useState<number>(0);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [selectedExpiration, setSelectedExpiration] = useState<string | undefined>(undefined);
  const [chainFilter, setChainFilter] = useState<'ALL' | 'ITM' | 'NEAR_MONEY'>('ALL');

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsAgo(Math.max(0, Math.floor((Date.now() - lastFetched.getTime()) / 1000)));
    }, 1000);
    return () => clearInterval(timer);
  }, [lastFetched]);

  const fetchOptionsData = async (
    sym: string,
    isManualRefresh: boolean = false,
    expirationOverride?: string
  ) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);
    setErrorMsg(null);

    try {
      const params = new URLSearchParams({ symbol: sym });
      if (isManualRefresh) params.set('refresh', 'true');
      if (expirationOverride) params.set('expiration', expirationOverride);

      const res = await fetch(`/api/cboe-options?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status} fetching CBOE options`);
      }

      if (data.marketOverview) {
        setMarketOverview(data.marketOverview);
        setLastFetched(new Date(data.marketOverview.lastFetchedAt || Date.now()));
        setSecondsAgo(0);
      }
      if (data.optionsSummary) {
        setOptionsSummary(data.optionsSummary);
        setSelectedExpiration(data.optionsSummary.selectedExpiration || undefined);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to connect to live CBOE options endpoint.');
      setMarketOverview(createUnavailableCboeOverview('Live CBOE upstream feed unavailable'));
      setOptionsSummary(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    setSelectedExpiration(undefined);
    fetchOptionsData(selectedSymbol, false, undefined);
  }, [selectedSymbol]);

  useEffect(() => {
    const handleGlobalRefresh = () => {
      fetchOptionsData(selectedSymbol, true, selectedExpiration);
    };
    window.addEventListener('market-data-refreshed', handleGlobalRefresh);
    return () => window.removeEventListener('market-data-refreshed', handleGlobalRefresh);
  }, [selectedSymbol, selectedExpiration]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchOptionsData(selectedSymbol, true, selectedExpiration);
    }, 30000);
    return () => clearInterval(interval);
  }, [selectedSymbol, autoRefresh, selectedExpiration]);

  const handleManualRefresh = () => {
    fetchOptionsData(selectedSymbol, true, selectedExpiration);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      const clean = searchInput.trim().toUpperCase();
      setSelectedSymbol(clean);
      setSearchInput('');
    }
  };

  const filteredRows = optionsSummary
    ? optionsSummary.chainRows.filter((row) => {
        if (chainFilter === 'ITM') {
          return Boolean(row.call?.inTheMoney || row.put?.inTheMoney);
        }
        if (chainFilter === 'NEAR_MONEY' && optionsSummary.underlyingPrice !== null) {
          return (
            Math.abs(row.strike - optionsSummary.underlyingPrice) <=
            optionsSummary.underlyingPrice * 0.05
          );
        }
        return true;
      })
    : [];

  const vix = marketOverview.vixIndex;
  const gex = marketOverview.totalMarketGexMillions;
  const pc = marketOverview.putCallVolumeRatio;
  const skew = marketOverview.cboeSkewIndex;
  const spotPrice = optionsSummary?.underlyingPrice ?? null;

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

              <div
                className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono border ${
                  marketOverview.isLive
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                    : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    marketOverview.isLive ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'
                  }`}
                ></span>
                <span>{marketOverview.isLive ? 'Live CBOE & Yahoo Feed' : 'Feed Unavailable'}</span>
              </div>

              <div className="inline-flex items-center space-x-1 text-[11px] text-zinc-400 font-mono">
                <Clock className="w-3 h-3 text-zinc-500" />
                <span>
                  Last fetch:{' '}
                  {lastFetched.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}{' '}
                  ({secondsAgo === 0 ? 'just now' : `${secondsAgo}s ago`})
                </span>
              </div>
            </div>

            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              CBOE Market Volatility &amp; Option Greeks (Γ, Θ, ν, Δ)
            </h2>
            <p className="mt-1 text-xs text-zinc-300 max-w-3xl leading-relaxed">
              Live institutional options analytics sourced directly from CBOE Delayed Quotes chains &amp; Yahoo Finance volatility indices: Net Gamma Exposure (GEX), OCC contract Greeks, Implied Volatility, CBOE SKEW, and Max Pain strike pinning.
            </p>

            <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t border-indigo-500/20 text-xs">
              <button
                onClick={handleManualRefresh}
                disabled={refreshing}
                className="flex items-center space-x-1.5 px-3 py-1 rounded-lg bg-indigo-600/80 hover:bg-indigo-600 text-white font-medium transition disabled:opacity-50 shadow-sm"
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
                <span>Auto-refresh (30s)</span>
              </label>

              <span className="text-[10px] text-zinc-500 font-mono hidden sm:inline">
                Source: {marketOverview.dataSource}
              </span>
            </div>
          </div>

          {/* Quick Stats Pill Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono shrink-0">
            {/* 1. CBOE VIX Index Card */}
            <div className="bg-zinc-950/90 border border-zinc-800 hover:border-indigo-500/60 p-3.5 rounded-xl relative group/vix cursor-help transition shadow-lg">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-400 uppercase block font-sans font-semibold">
                  CBOE VIX Index
                </span>
                <span className="w-4 h-4 rounded-full bg-zinc-900 border border-zinc-700 flex items-center justify-center text-[10px] text-zinc-400">
                  ?
                </span>
              </div>
              <div className="flex items-baseline space-x-1.5 mt-1">
                <span className="text-xl sm:text-2xl font-bold text-emerald-400 font-mono tracking-tight">
                  {fmtNum(vix, 2)}
                </span>
                {marketOverview.vixChangePct !== null && marketOverview.vixChangePct !== undefined && (
                  <span
                    className={`text-[10px] font-mono font-bold ${
                      marketOverview.vixChangePct <= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {marketOverview.vixChangePct > 0 ? '+' : ''}
                    {marketOverview.vixChangePct.toFixed(2)}%
                  </span>
                )}
              </div>
              <span className="text-[10px] text-zinc-400 block font-sans mt-0.5 font-medium">
                {vix === null
                  ? 'Unavailable'
                  : vix < 15
                  ? 'Low Vol (Complacent)'
                  : vix < 20
                  ? 'Normal Vol Regime'
                  : vix < 30
                  ? 'Elevated Vol Regime'
                  : 'Panic / Crisis Vol'}
              </span>
            </div>

            {/* 2. Market Net GEX Card */}
            <div className="bg-zinc-950/90 border border-zinc-800 hover:border-emerald-500/60 p-3.5 rounded-xl relative group/gex cursor-help transition shadow-lg">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-400 uppercase block font-sans font-semibold">
                  SPX Net GEX
                </span>
                <Zap className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <span className="text-xl sm:text-2xl font-bold text-emerald-400 block mt-1 font-mono tracking-tight">
                {gex === null ? '—' : `${gex >= 0 ? '+' : ''}$${gex.toFixed(1)}M`}
              </span>
              <span className="text-[10px] text-emerald-500/90 block font-sans mt-0.5 font-medium">
                {marketOverview.marketMakerGammaRegime === 'LONG_GAMMA_SUPPRESSION'
                  ? 'Long Gamma (Suppressed)'
                  : marketOverview.marketMakerGammaRegime === 'SHORT_GAMMA_EXPANSION'
                  ? 'Short Gamma (Expanding)'
                  : marketOverview.marketMakerGammaRegime === 'NEUTRAL_FLIP'
                  ? 'Neutral Gamma Flip'
                  : 'Unavailable'}
              </span>
            </div>

            {/* 3. Put/Call Ratio Card */}
            <div className="bg-zinc-950/90 border border-zinc-800 hover:border-amber-500/60 p-3.5 rounded-xl relative group/pc cursor-help transition shadow-lg">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-400 uppercase block font-sans font-semibold">
                  SPX Put/Call Vol
                </span>
                <Sliders className="w-3.5 h-3.5 text-amber-400" />
              </div>
              <span className="text-xl sm:text-2xl font-bold text-amber-400 block mt-1 font-mono tracking-tight">
                {fmtNum(pc, 2)}
              </span>
              <span className="text-[10px] text-zinc-400 block font-sans mt-0.5 font-medium">
                {pc === null
                  ? 'Unavailable'
                  : pc < 0.7
                  ? 'Bullish (<0.70)'
                  : pc < 0.9
                  ? 'Balanced Flow'
                  : 'Hedging Active (>=0.90)'}
              </span>
            </div>

            {/* 4. CBOE Skew Index Card */}
            <div className="bg-zinc-950/90 border border-zinc-800 hover:border-indigo-500/60 p-3.5 rounded-xl relative group/skew cursor-help transition shadow-lg">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-400 uppercase block font-sans font-semibold">
                  CBOE Skew Index
                </span>
                <Flame className="w-3.5 h-3.5 text-indigo-400" />
              </div>
              <span className="text-xl sm:text-2xl font-bold text-indigo-400 block mt-1 font-mono tracking-tight">
                {fmtNum(skew, 1)}
              </span>
              <span className="text-[10px] text-zinc-400 block font-sans mt-0.5 font-medium">
                {skew === null
                  ? 'Unavailable'
                  : skew < 115
                  ? 'Low Tail Risk'
                  : skew < 135
                  ? 'Normal Tail Benchmark'
                  : 'Elevated Tail Skew'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* TICKER SEARCH & SELECTION BAR */}
      <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-md">
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          <form onSubmit={handleSearchSubmit} className="flex items-center space-x-2 w-full sm:w-64">
            <div className="relative w-full">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search ticker (e.g. NVDA, AAPL, SPX)..."
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

          <div className="flex items-center space-x-2 w-full sm:w-80">
            <span className="text-zinc-500 text-xs font-mono shrink-0">S&amp;P 500:</span>
            <select
              value={SP500_UNIVERSE.some((c) => c.symbol === selectedSymbol) ? selectedSymbol : 'NVDA'}
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

        <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono shrink-0">
          {['NVDA', 'AAPL', 'MSFT', 'AMZN', 'TSLA', 'SPY', 'SPX', 'JPM'].map((sym, idx) => (
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
        </div>
      </div>

      {loading && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center text-xs font-mono text-zinc-400 flex items-center justify-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
          <span>Loading live CBOE option chain for {selectedSymbol}...</span>
        </div>
      )}

      {!loading && errorMsg && (
        <div className="bg-rose-950/30 border border-rose-500/30 rounded-2xl p-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 text-xs text-rose-300">
            <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            onClick={handleManualRefresh}
            className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {!loading && optionsSummary && (
        <>
          {/* TICKER GREEKS & VOLATILITY HUD GAUGES */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-6 shadow-md">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
              <div>
                <div className="flex items-center space-x-3">
                  <h3 className="text-2xl font-extrabold text-white font-mono">
                    {optionsSummary.symbol}
                  </h3>
                  <span className="text-xl font-bold text-emerald-400 font-mono">
                    {fmtNum(spotPrice, 2, '$')}
                  </span>
                  <button
                    onClick={() => onSelectSymbolForChart(optionsSummary.symbol)}
                    className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-xs text-indigo-300 font-semibold rounded-lg transition"
                  >
                    View Chart
                  </button>
                </div>
                <p className="text-xs text-zinc-400 mt-1">
                  ATM Implied Volatility:{' '}
                  <strong className="text-white font-mono">
                    {fmtNum(optionsSummary.impliedVolatilityPct, 1, '', '%')}
                  </strong>{' '}
                  &bull; IV Elevation:{' '}
                  <strong className="text-amber-400 font-mono">
                    {fmtNum(optionsSummary.ivRankPct, 1, '', '%')}
                  </strong>{' '}
                  &bull; 30d Realized HV:{' '}
                  <strong className="text-zinc-300 font-mono">
                    {fmtNum(optionsSummary.historicalVol30dPct, 1, '', '%')}
                  </strong>{' '}
                  &bull; Put/Call:{' '}
                  <strong className="text-cyan-300 font-mono">
                    {fmtNum(optionsSummary.putCallRatio, 2)}
                  </strong>
                </p>
              </div>

              <div className="flex items-center space-x-3 text-xs font-mono">
                <div className="p-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-right">
                  <span className="text-[10px] text-zinc-500 uppercase block font-sans">
                    Max Pain Strike
                  </span>
                  <span className="font-bold text-amber-400">
                    {fmtNum(optionsSummary.maxPainStrike, 2, '$')}
                  </span>
                </div>
                <div className="p-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-right">
                  <span className="text-[10px] text-zinc-500 uppercase block font-sans">
                    Zero GEX Flip
                  </span>
                  <span className="font-bold text-indigo-400">
                    {fmtNum(optionsSummary.zeroGexFlipPrice, 2, '$')}
                  </span>
                </div>
              </div>
            </div>

            {!optionsSummary.chainAvailable ? (
              <div className="p-5 rounded-xl bg-amber-950/20 border border-amber-500/30 text-xs text-amber-300 font-mono flex items-center gap-2.5">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>
                  {optionsSummary.unavailableReason ||
                    `No live CBOE option chain available for ${optionsSummary.symbol}.`}
                </span>
              </div>
            ) : (
              /* 5 BLACK-SCHOLES GREEKS CARDS */
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 font-mono">
                <div className="bg-zinc-950 border border-indigo-500/30 rounded-xl p-4">
                  <div className="text-[11px] text-indigo-400 uppercase tracking-wider font-semibold font-sans flex items-center justify-between">
                    <span>Gamma (Γ)</span>
                    <Zap className="w-3.5 h-3.5 text-indigo-400" />
                  </div>
                  <div className="text-2xl font-bold text-white mt-1">
                    {fmtNum(optionsSummary.averageGreeks.gammaAtm, 4)}
                  </div>
                  <div className="text-[10px] text-zinc-400 mt-1 font-sans">
                    ATM Delta acceleration per $1 move.
                  </div>
                </div>

                <div className="bg-zinc-950 border border-amber-500/30 rounded-xl p-4">
                  <div className="text-[11px] text-amber-400 uppercase tracking-wider font-semibold font-sans flex items-center justify-between">
                    <span>Theta (Θ)</span>
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                  </div>
                  <div className="text-2xl font-bold text-amber-400 mt-1">
                    {fmtNum(optionsSummary.averageGreeks.thetaDailyAtm, 3, '$')}
                  </div>
                  <div className="text-[10px] text-zinc-400 mt-1 font-sans">
                    Daily time decay per share.
                  </div>
                </div>

                <div className="bg-zinc-950 border border-emerald-500/30 rounded-xl p-4">
                  <div className="text-[11px] text-emerald-400 uppercase tracking-wider font-semibold font-sans flex items-center justify-between">
                    <span>Vega (ν)</span>
                    <Flame className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  <div className="text-2xl font-bold text-emerald-400 mt-1">
                    {fmtNum(optionsSummary.averageGreeks.vegaAtm, 3)}
                  </div>
                  <div className="text-[10px] text-zinc-400 mt-1 font-sans">
                    Option value shift per +1% IV.
                  </div>
                </div>

                <div className="bg-zinc-950 border border-blue-500/30 rounded-xl p-4">
                  <div className="text-[11px] text-blue-400 uppercase tracking-wider font-semibold font-sans flex items-center justify-between">
                    <span>Delta (Δ)</span>
                    <TrendingUp className="w-3.5 h-3.5 text-blue-400" />
                  </div>
                  <div className="text-2xl font-bold text-blue-400 mt-1">
                    {optionsSummary.averageGreeks.callDeltaAtm !== null
                      ? `+${optionsSummary.averageGreeks.callDeltaAtm.toFixed(2)}`
                      : '—'}
                  </div>
                  <div className="text-[10px] text-zinc-400 mt-1 font-sans">
                    ATM Call directional share equiv.
                  </div>
                </div>

                <div className="bg-zinc-950 border border-purple-500/30 rounded-xl p-4">
                  <div className="text-[11px] text-purple-400 uppercase tracking-wider font-semibold font-sans flex items-center justify-between">
                    <span>Net GEX ($M)</span>
                    <Activity className="w-3.5 h-3.5 text-purple-400" />
                  </div>
                  <div className="text-2xl font-bold text-purple-300 mt-1">
                    {optionsSummary.totalGexMillions !== null
                      ? `${optionsSummary.totalGexMillions >= 0 ? '+' : ''}$${optionsSummary.totalGexMillions.toFixed(1)}M`
                      : '—'}
                  </div>
                  <div className="text-[10px] text-zinc-400 mt-1 font-sans">
                    Aggregate open-interest Gamma exposure.
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* INTERACTIVE OPTION CHAIN TABLE */}
          {optionsSummary.chainAvailable && optionsSummary.chainRows.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4 shadow-md">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
                <div>
                  <h3 className="text-base font-bold text-white font-mono flex items-center space-x-2">
                    <span>Live CBOE Option Chain ({optionsSummary.selectedExpiration})</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                      {filteredRows.length} Strikes
                    </span>
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Real Call vs Put contracts sourced from CBOE delayed quotes.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 bg-zinc-950 border border-zinc-800 p-1.5 rounded-xl font-mono text-xs">
                  <span className="text-zinc-500 text-[11px] px-2 font-sans">Expiration:</span>
                  {optionsSummary.expirationDates.map((expDate) => (
                    <button
                      key={`cboe-exp-${expDate}`}
                      onClick={() => fetchOptionsData(selectedSymbol, false, expDate)}
                      className={`px-2.5 py-1 rounded-lg transition ${
                        optionsSummary.selectedExpiration === expDate
                          ? 'bg-indigo-600 text-white font-bold shadow-sm'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      {expDate.slice(5)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between text-xs font-mono">
                <div className="flex items-center space-x-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
                  {(['ALL', 'NEAR_MONEY', 'ITM'] as const).map((filter) => (
                    <button
                      key={`cboe-flt-${filter}`}
                      onClick={() => setChainFilter(filter)}
                      className={`px-3 py-1 rounded-lg transition ${
                        chainFilter === filter
                          ? 'bg-zinc-800 text-white font-bold'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      {filter === 'ALL'
                        ? 'All Strikes'
                        : filter === 'NEAR_MONEY'
                        ? 'Near Money (±5%)'
                        : 'In The Money'}
                    </button>
                  ))}
                </div>

                <span className="text-zinc-500 text-[11px] font-sans">
                  Max Pain Pinning Target:{' '}
                  <strong className="text-amber-400 font-mono">
                    {fmtNum(optionsSummary.maxPainStrike, 2, '$')}
                  </strong>
                </span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-zinc-800">
                <table className="w-full text-xs font-mono text-left border-collapse">
                  <thead className="bg-zinc-950 text-zinc-400 text-[10px] uppercase border-b border-zinc-800">
                    <tr>
                      <th
                        colSpan={6}
                        className="py-2.5 px-3 text-center bg-emerald-950/40 text-emerald-400 border-r border-zinc-800 font-bold"
                      >
                        CALL OPTIONS
                      </th>
                      <th className="py-2.5 px-3 text-center bg-zinc-900 text-white font-extrabold border-r border-zinc-800">
                        STRIKE
                      </th>
                      <th
                        colSpan={6}
                        className="py-2.5 px-3 text-center bg-rose-950/40 text-rose-400 font-bold"
                      >
                        PUT OPTIONS
                      </th>
                    </tr>
                    <tr className="border-b border-zinc-800 bg-zinc-950/80">
                      <th className="py-2 px-2 text-right text-zinc-500">IV%</th>
                      <th className="py-2 px-2 text-right text-zinc-500">Δ</th>
                      <th className="py-2 px-2 text-right text-zinc-500">Γ</th>
                      <th className="py-2 px-2 text-right text-zinc-500">Θ</th>
                      <th className="py-2 px-2 text-right text-zinc-300">Bid/Ask</th>
                      <th className="py-2 px-2 text-right text-emerald-400 border-r border-zinc-800">
                        Last
                      </th>

                      <th className="py-2 px-3 text-center text-white bg-zinc-900 border-r border-zinc-800 font-bold">
                        ($)
                      </th>

                      <th className="py-2 px-2 text-left text-rose-400">Last</th>
                      <th className="py-2 px-2 text-left text-zinc-300">Bid/Ask</th>
                      <th className="py-2 px-2 text-left text-zinc-500">Θ</th>
                      <th className="py-2 px-2 text-left text-zinc-500">Γ</th>
                      <th className="py-2 px-2 text-left text-zinc-500">Δ</th>
                      <th className="py-2 px-2 text-left text-zinc-500">IV%</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-zinc-800/60 bg-zinc-900/60">
                    {filteredRows.map((row) => {
                      const isAtm =
                        spotPrice !== null && Math.abs(row.strike - spotPrice) < spotPrice * 0.02;

                      return (
                        <tr
                          key={`cboe-row-${row.strike}`}
                          className={`hover:bg-zinc-800/40 transition ${
                            isAtm ? 'bg-indigo-950/30' : ''
                          } ${row.isMaxPainStrike ? 'border-l-2 border-l-amber-400' : ''}`}
                        >
                          {/* CALL SIDE */}
                          <td className="py-2 px-2 text-right text-zinc-400 text-[11px]">
                            {row.call ? `${row.call.impliedVolatilityPct}%` : '—'}
                          </td>
                          <td className="py-2 px-2 text-right text-blue-400 font-bold">
                            {row.call ? `+${row.call.greeks.delta.toFixed(2)}` : '—'}
                          </td>
                          <td className="py-2 px-2 text-right text-indigo-300 text-[11px]">
                            {row.call ? row.call.greeks.gamma.toFixed(4) : '—'}
                          </td>
                          <td className="py-2 px-2 text-right text-amber-400 text-[11px]">
                            {row.call ? row.call.greeks.theta.toFixed(2) : '—'}
                          </td>
                          <td className="py-2 px-2 text-right text-zinc-300 text-[11px]">
                            {row.call
                              ? `$${row.call.bid.toFixed(2)} / $${row.call.ask.toFixed(2)}`
                              : '—'}
                          </td>
                          <td
                            className={`py-2 px-2 text-right font-bold border-r border-zinc-800 ${
                              row.call?.inTheMoney ? 'text-emerald-400 bg-emerald-950/20' : 'text-zinc-200'
                            }`}
                          >
                            {row.call ? `$${row.call.lastPrice.toFixed(2)}` : '—'}
                          </td>

                          {/* STRIKE PRICE */}
                          <td
                            className={`py-2 px-3 text-center font-extrabold font-mono border-r border-zinc-800 ${
                              isAtm ? 'bg-indigo-600 text-white shadow-sm' : 'bg-zinc-950 text-white'
                            }`}
                          >
                            ${row.strike.toFixed(2)}
                            {row.isMaxPainStrike && (
                              <span className="block text-[8px] font-sans text-amber-400 font-semibold">
                                Max Pain
                              </span>
                            )}
                          </td>

                          {/* PUT SIDE */}
                          <td
                            className={`py-2 px-2 text-left font-bold ${
                              row.put?.inTheMoney ? 'text-rose-400 bg-rose-950/20' : 'text-zinc-200'
                            }`}
                          >
                            {row.put ? `$${row.put.lastPrice.toFixed(2)}` : '—'}
                          </td>
                          <td className="py-2 px-2 text-left text-zinc-300 text-[11px]">
                            {row.put
                              ? `$${row.put.bid.toFixed(2)} / $${row.put.ask.toFixed(2)}`
                              : '—'}
                          </td>
                          <td className="py-2 px-2 text-left text-amber-400 text-[11px]">
                            {row.put ? row.put.greeks.theta.toFixed(2) : '—'}
                          </td>
                          <td className="py-2 px-2 text-left text-indigo-300 text-[11px]">
                            {row.put ? row.put.greeks.gamma.toFixed(4) : '—'}
                          </td>
                          <td className="py-2 px-2 text-left text-rose-400 font-bold">
                            {row.put ? row.put.greeks.delta.toFixed(2) : '—'}
                          </td>
                          <td className="py-2 px-2 text-left text-zinc-400 text-[11px]">
                            {row.put ? `${row.put.impliedVolatilityPct}%` : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
