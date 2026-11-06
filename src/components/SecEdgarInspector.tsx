import React, { useState, useEffect } from 'react';
import {
  FileText,
  Search,
  ExternalLink,
  ShieldCheck,
  TrendingUp,
  AlertCircle,
  Building2,
  Calendar,
  Layers,
  ArrowRight,
} from 'lucide-react';

export const SecEdgarInspector: React.FC = () => {
  const [ticker, setTicker] = useState('AAPL');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);

  const popularTickers = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'META', 'AMD', 'SPY'];

  const fetchFilings = async (symbolToFetch: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/sec-filings?symbol=${encodeURIComponent(symbolToFetch)}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFilings(ticker);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (ticker.trim()) {
      fetchFilings(ticker.trim().toUpperCase());
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-zinc-900 via-zinc-900 to-zinc-950 border border-zinc-800 rounded-2xl p-6 sm:p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs font-medium mb-3">
              <FileText className="w-3.5 h-3.5" />
              <span>US Securities and Exchange Commission (Free Public Data)</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              SEC EDGAR Filings & Insider Tracking
            </h1>
            <p className="mt-2 text-sm text-zinc-400 max-w-3xl leading-relaxed">
              Combine technical momentum exhaustion with institutional corporate reality. The SEC EDGAR system provides free, real-time public access to <strong className="text-zinc-200">Form 4</strong> (insider purchases by CEOs/Directors), <strong className="text-zinc-200">Form 8-K</strong> (material events), and <strong className="text-zinc-200">10-Q</strong> quarterly earnings.
            </p>
          </div>
        </div>

        {/* Search Bar & Quick Tickers */}
        <div className="mt-6 pt-6 border-t border-zinc-800 flex flex-wrap items-center justify-between gap-4">
          <form onSubmit={handleSearch} className="flex items-center space-x-2">
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="US Ticker (e.g. NVDA)"
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                className="pl-9 pr-3 py-1.5 bg-zinc-950 border border-zinc-700 rounded-lg text-sm text-white font-mono uppercase focus:outline-none focus:border-violet-500 w-44"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-1.5 bg-violet-600 hover:bg-violet-500 text-white font-medium text-xs rounded-lg transition disabled:opacity-50"
            >
              {loading ? 'Querying EDGAR...' : 'Fetch Filings'}
            </button>
          </form>

          <div className="flex items-center space-x-2 text-xs">
            <span className="text-zinc-500">Popular:</span>
            {popularTickers.map((sym) => (
              <button
                key={sym}
                onClick={() => {
                  setTicker(sym);
                  fetchFilings(sym);
                }}
                className={`px-2 py-0.5 rounded text-xs font-mono transition ${
                  ticker === sym ? 'bg-violet-500 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'
                }`}
              >
                {sym}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Why Combine Triple Divergence with SEC Filings */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-sm mb-3">
            <TrendingUp className="w-4 h-4" />
          </div>
          <h3 className="font-bold text-white text-sm">Form 4: Insider Buying Cluster</h3>
          <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
            When corporate officers (CEOs, CFOs, board members) buy shares with their own cash right as a <strong className="text-emerald-400">Bullish Triple Divergence</strong> forms at Point 3, conviction reaches institutional grade. Insiders know intrinsic value before the public.
          </p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-sm mb-3">
            <Building2 className="w-4 h-4" />
          </div>
          <h3 className="font-bold text-white text-sm">Form 8-K: Material Catalysts</h3>
          <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
            Form 8-K reports unscheduled material corporate changes (mergers, patents, contract wins, or executive departures). A technical divergence combined with an 8-K disclosure often triggers rapid mean reversion back to Fibonacci targets.
          </p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-sm mb-3">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <h3 className="font-bold text-white text-sm">SEC Fair Access API Protocol</h3>
          <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
            SEC EDGAR requires automated scanners to declare a user-agent header containing an email. Our 24/7 Python scanner natively adheres to the 10 requests/sec SEC Fair Access rate limit.
          </p>
        </div>
      </div>

      {/* Filings List */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
          <div className="flex items-center space-x-3">
            <h3 className="font-bold text-white text-base">
              Latest SEC EDGAR Filings for {data?.entityName || ticker}
            </h3>
            {data?.cik && (
              <span className="text-xs font-mono text-zinc-500 bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800">
                CIK: {data.cik}
              </span>
            )}
          </div>
          <span className="text-xs text-zinc-400 font-mono">Real-Time data.sec.gov</span>
        </div>

        {data && data.filings && data.filings.length > 0 ? (
          <div className="space-y-3">
            {data.filings.map((filing: any, idx: number) => {
              const isForm4 = filing.form === '4';
              const isForm8K = filing.form === '8-K';

              return (
                <div
                  key={idx}
                  className="p-4 rounded-xl bg-zinc-950 border border-zinc-800/80 hover:border-zinc-700 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-start space-x-3">
                    <span
                      className={`px-2.5 py-1 rounded text-xs font-bold font-mono shrink-0 ${
                        isForm4
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : isForm8K
                          ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                          : 'bg-zinc-800 text-zinc-300'
                      }`}
                    >
                      Form {filing.form}
                    </span>
                    <div>
                      <div className="text-xs font-semibold text-white">
                        {filing.description || `Official SEC Form ${filing.form} Filing`}
                      </div>
                      <div className="flex items-center space-x-3 text-[11px] text-zinc-500 mt-1">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          <span>Filed: {filing.filingDate}</span>
                        </span>
                        {isForm4 && (
                          <span className="text-emerald-400 font-medium">
                            &bull; Statement of Insider Ownership Changes
                          </span>
                        )}
                        {isForm8K && (
                          <span className="text-blue-400 font-medium">
                            &bull; Significant Corporate Event Report
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <a
                    href={filing.url || `https://www.sec.gov/edgar/browse/?CIK=${data.cik}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded text-xs font-medium border border-zinc-800 shrink-0 self-start sm:self-auto transition"
                  >
                    <span>View on SEC.gov</span>
                    <ExternalLink className="w-3 h-3 text-zinc-400" />
                  </a>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-8 text-center text-xs text-zinc-400 bg-zinc-950 rounded-xl">
            {loading ? 'Fetching records from SEC EDGAR...' : 'No filings found for this ticker.'}
          </div>
        )}
      </div>
    </div>
  );
};
