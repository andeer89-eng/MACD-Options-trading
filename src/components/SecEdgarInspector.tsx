import React, { useState, useEffect, useMemo } from 'react';
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
  RefreshCw,
  Clock,
} from 'lucide-react';
import { fetchJsonSafe } from '../utils/safeFetchJson';

export interface SecFilingItem {
  form: string;
  filingDate: string;
  reportDate?: string;
  acceptanceDateTime?: string;
  description?: string;
  accessionNumber?: string;
  url?: string;
}

/**
 * Point-in-Time (PIT) filter: retains only filings whose public filingDate <= asOfDate,
 * preventing look-ahead bias from post-date filings or restatements.
 */
export function filterSecFilingsAsOf(
  filings: SecFilingItem[],
  asOfDate: string
): SecFilingItem[] {
  if (!Array.isArray(filings)) return [];
  const cutoff = asOfDate.trim();
  if (!cutoff) return filings;
  return filings.filter((f) => {
    if (!f.filingDate || f.filingDate === 'N/A') return false;
    return f.filingDate <= cutoff;
  });
}

export const SecEdgarInspector: React.FC = () => {
  const [ticker, setTicker] = useState('AAPL');
  const [pitAsOfDate, setPitAsOfDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);

  const popularTickers = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'META', 'AMD', 'SPY'];

  const fetchFilings = async (symbolToFetch: string) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const resp = await fetchJsonSafe<any>(
        `/api/sec-filings?symbol=${encodeURIComponent(symbolToFetch)}`
      );
      if (resp.ok && resp.data) {
        setData(resp.data);
        if (resp.data.error) {
          setErrorMsg(resp.data.error);
        }
      } else {
        setErrorMsg(resp.error || `Failed to load SEC EDGAR filings for ${symbolToFetch}.`);
      }
    } catch (e: any) {
      setErrorMsg(e?.message || 'Unable to connect to SEC EDGAR endpoint.');
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

  const visibleFilings = useMemo(
    () => filterSecFilingsAsOf(data?.filings || [], pitAsOfDate),
    [data?.filings, pitAsOfDate]
  );

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
              SEC EDGAR Filings &amp; Insider Tracking
            </h1>
            <p className="mt-2 text-sm text-zinc-400 max-w-3xl leading-relaxed">
              Combine technical momentum exhaustion with institutional corporate reality. The SEC EDGAR system provides free, real-time public access to <strong className="text-zinc-200">Form 4</strong> (insider purchases by CEOs/Directors), <strong className="text-zinc-200">Form 8-K</strong> (material events), and <strong className="text-zinc-200">10-Q</strong> quarterly earnings, indexed by Point-in-Time public filing date.
            </p>
          </div>
        </div>

        {/* Search Bar & Quick Tickers */}
        <div className="mt-5 pt-5 border-t border-zinc-800 flex flex-wrap items-center justify-between gap-4">
          <form onSubmit={handleSearch} className="flex flex-wrap items-center gap-2">
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

            <div className="flex items-center space-x-1.5 ml-0 sm:ml-3 bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1">
              <Clock className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <label htmlFor="sec-pit-date" className="text-[11px] text-zinc-400 whitespace-nowrap">
                PIT As-Of:
              </label>
              <input
                id="sec-pit-date"
                data-testid="sec-pit-date-input"
                type="date"
                value={pitAsOfDate}
                onChange={(e) => setPitAsOfDate(e.target.value)}
                title="Point-in-Time filter: show only filings publicly submitted on or before this date"
                className="bg-transparent text-xs text-zinc-200 font-mono focus:outline-none [color-scheme:dark]"
              />
              {pitAsOfDate && (
                <button
                  type="button"
                  onClick={() => setPitAsOfDate('')}
                  className="text-[10px] text-zinc-400 hover:text-white px-1"
                >
                  Clear
                </button>
              )}
            </div>
          </form>

          <div className="flex items-center flex-wrap gap-1.5 text-xs">
            <span className="text-zinc-500 mr-1">Popular:</span>
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
            {pitAsOfDate && (
              <span className="text-[11px] font-mono text-cyan-300 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/30">
                PIT ≤ {pitAsOfDate} ({visibleFilings.length}/{data?.filings?.length || 0})
              </span>
            )}
          </div>
          <span className="text-xs text-zinc-400 font-mono">Real-Time data.sec.gov</span>
        </div>

        {errorMsg && (
          <div className="p-4 rounded-xl bg-rose-950/30 border border-rose-500/30 flex items-center justify-between gap-3 text-xs text-rose-300">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => fetchFilings(ticker)}
              className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-semibold flex items-center gap-1 shrink-0"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Retry</span>
            </button>
          </div>
        )}

        {visibleFilings.length > 0 ? (
          <div className="space-y-3">
            {visibleFilings.map((filing: SecFilingItem, idx: number) => {
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
                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-zinc-500 mt-1">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          <span>Publicly Filed: {filing.filingDate}</span>
                        </span>
                        {filing.reportDate && filing.reportDate !== 'N/A' && filing.reportDate !== filing.filingDate && (
                          <span className="text-zinc-400 font-mono">
                            Period End: {filing.reportDate}
                          </span>
                        )}
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
                    href={filing.url || `https://www.sec.gov/edgar/browse/?CIK=${data?.cik || ''}`}
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
            {loading
              ? 'Fetching records from SEC EDGAR...'
              : pitAsOfDate && (data?.filings?.length || 0) > 0
              ? `No filings publicly submitted on or before ${pitAsOfDate}. Clear the PIT As-Of filter to view all recent filings.`
              : data?.note || 'No filings found for this ticker.'}
          </div>
        )}
      </div>
    </div>
  );
};
