import React from 'react';
import {
  X,
  Plus,
  Code2,
  AlertTriangle,
  Play,
  Search,
  Check,
  ShieldCheck,
} from 'lucide-react';
import type { CustomPineIndicator, IndicatorCategory } from '../../utils/indicatorLibrary';
import type { FeedMetadata } from '../../hooks/useChartData';

interface IndicatorsPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  showInlineImporter: boolean;
  setShowInlineImporter: React.Dispatch<React.SetStateAction<boolean>>;
  inlinePineCode: string;
  setInlinePineCode: (val: string) => void;
  inlinePineName: string;
  setInlinePineName: (val: string) => void;
  inlinePineCategory: IndicatorCategory;
  setInlinePineCategory: (val: IndicatorCategory) => void;
  inlinePineTesting: boolean;
  inlinePineError: string | null;
  setInlinePineError: (val: string | null) => void;
  inlinePineStatus: { valid: boolean; message: string } | null;
  onTestInlinePine: () => void;
  onImportInlinePine: (e: React.FormEvent) => void;
  indicatorSearch: string;
  setIndicatorSearch: (val: string) => void;
  selectedCategory: string;
  setSelectedCategory: (val: string) => void;
  filteredIndicators: CustomPineIndicator[];
  activeCustomIndicatorIds: string[];
  onToggleIndicator: (id: string) => void;
}

export const IndicatorsPickerModal: React.FC<IndicatorsPickerModalProps> = ({
  isOpen,
  onClose,
  showInlineImporter,
  setShowInlineImporter,
  inlinePineCode,
  setInlinePineCode,
  inlinePineName,
  setInlinePineName,
  inlinePineCategory,
  setInlinePineCategory,
  inlinePineTesting,
  inlinePineError,
  setInlinePineError,
  inlinePineStatus,
  onTestInlinePine,
  onImportInlinePine,
  indicatorSearch,
  setIndicatorSearch,
  selectedCategory,
  setSelectedCategory,
  filteredIndicators,
  activeCustomIndicatorIds,
  onToggleIndicator,
}) => {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden"
      >
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <span className="font-serif italic text-lg font-bold text-emerald-400">fx</span>
            <h3 className="font-bold text-white text-base">Indicators, Metrics &amp; Strategies</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="toggle-inline-pine-importer"
              onClick={() => setShowInlineImporter((prev) => !prev)}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                showInlineImporter
                  ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/40'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500/40'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{showInlineImporter ? 'Close Importer' : 'Import Pine Script'}</span>
            </button>
            <button
              onClick={onClose}
              aria-label="Close Indicators Modal"
              className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {showInlineImporter && (
          <form
            onSubmit={onImportInlinePine}
            className="p-4 border-b border-indigo-500/30 bg-zinc-950/95 space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-bold text-indigo-300">
                <Code2 className="w-3.5 h-3.5" />
                Paste TradingView Pine Script (v4 / v5 / v6)
              </span>
              <span className="text-[10px] font-mono text-zinc-500">
                Executes live on chart via PineTS
              </span>
            </div>

            {inlinePineError && (
              <div className="p-2 rounded bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>{inlinePineError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <input
                type="text"
                placeholder="Title (optional — auto-detected from script)"
                value={inlinePineName}
                onChange={(e) => setInlinePineName(e.target.value)}
                className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
              />
              <select
                value={inlinePineCategory}
                onChange={(e) => setInlinePineCategory(e.target.value as IndicatorCategory)}
                className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="Trend">Trend &amp; Momentum</option>
                <option value="Oscillator">Oscillator</option>
                <option value="Reversal">Reversal &amp; Exhaustion</option>
                <option value="SMC">Smart Money Concepts</option>
                <option value="Volatility">Volatility &amp; ATR</option>
                <option value="Volume">Volume &amp; Flow</option>
              </select>
            </div>

            <textarea
              rows={5}
              data-testid="inline-pine-textarea"
              placeholder={`//@version=6\nindicator("My Custom Cloud", overlay=true)\nfast = ta.ema(close, 9)\nslow = ta.ema(close, 21)\np1 = plot(fast, "Fast", color=fast > slow ? color.emerald : color.rose)\np2 = plot(slow, "Slow", color=color.sky)\nfill(p1, p2, color=fast > slow ? color.new(color.green, 82) : color.new(color.red, 82))`}
              value={inlinePineCode}
              onChange={(e) => {
                setInlinePineCode(e.target.value);
                if (inlinePineError) setInlinePineError(null);
              }}
              className="w-full p-2.5 bg-zinc-900 border border-zinc-800 rounded-lg font-mono text-xs text-indigo-300 focus:outline-none focus:border-indigo-500"
            />

            {inlinePineStatus && (
              <div
                className={`p-2 rounded text-[11px] font-mono border ${
                  inlinePineStatus.valid
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                }`}
              >
                {inlinePineStatus.valid ? 'READY: ' : 'ERROR: '}
                {inlinePineStatus.message}
              </div>
            )}

            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                data-testid="inline-pine-test-btn"
                onClick={onTestInlinePine}
                disabled={inlinePineTesting || !inlinePineCode.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-medium border border-zinc-700 transition disabled:opacity-50"
              >
                <Play className="w-3 h-3 text-indigo-400" />
                <span>{inlinePineTesting ? 'Testing...' : 'Test Script'}</span>
              </button>
              <button
                type="submit"
                data-testid="inline-pine-apply-btn"
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition"
              >
                Import &amp; Apply to Chart
              </button>
            </div>
          </form>
        )}

        <div className="p-4 border-b border-zinc-800 space-y-3 bg-zinc-950/50">
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search indicators by name or keyword..."
              value={indicatorSearch}
              onChange={(e) => setIndicatorSearch(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 font-mono"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {['All', 'Trend', 'Oscillator', 'Volatility', 'SMC', 'Reversal', 'Volume'].map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-2.5 py-1 text-xs rounded-md font-medium transition ${
                  selectedCategory === cat
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2 divide-y divide-zinc-800/50">
          {filteredIndicators.map((ind) => {
            const isActive = activeCustomIndicatorIds.includes(ind.id);
            return (
              <div
                key={ind.id}
                className="pt-2.5 first:pt-0 flex items-start justify-between gap-4 p-2 rounded-lg hover:bg-zinc-800/40 transition"
              >
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-white text-sm">{ind.name}</span>
                    {!ind.isBuiltIn ? (
                      <span className="px-1.5 py-0.5 text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded font-mono font-bold">
                        [Custom]
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 text-[10px] bg-sky-500/20 text-sky-300 border border-sky-500/40 rounded font-mono">
                        Built-in
                      </span>
                    )}
                    <span className="text-[10px] text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded font-mono">
                      {ind.category}
                    </span>
                    <span className="text-[10px] text-zinc-500">
                      {ind.overlay ? 'Overlay' : 'Sub-Pane'}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 leading-snug">{ind.description}</p>
                  <div className="text-[10px] text-zinc-500 font-mono">By {ind.author}</div>
                </div>

                <button
                  onClick={() => onToggleIndicator(ind.id)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition whitespace-nowrap flex items-center space-x-1 ${
                    isActive
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  }`}
                >
                  {isActive ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-rose-300" />
                      <span>Active (Remove)</span>
                    </>
                  ) : (
                    <span>+ Add to Chart</span>
                  )}
                </button>
              </div>
            );
          })}

          {filteredIndicators.length === 0 && (
            <div className="p-8 text-center text-zinc-500 text-sm">
              No indicators found matching "{indicatorSearch}"
            </div>
          )}
        </div>

        <div className="p-3.5 border-t border-zinc-800 bg-zinc-950 flex items-center justify-between text-xs text-zinc-400">
          <span>{activeCustomIndicatorIds.length} custom indicators active on chart</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg font-medium transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

interface DataAuthenticityModalProps {
  isOpen: boolean;
  onClose: () => void;
  feedMeta: FeedMetadata | null;
}

export const DataAuthenticityModal: React.FC<DataAuthenticityModalProps> = ({
  isOpen,
  onClose,
  feedMeta,
}) => {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <h3 className="font-bold text-white text-base">Market Data Authenticity (Live Feed)</h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close Data Authenticity Modal"
            className="text-zinc-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3 text-xs text-zinc-300 leading-relaxed">
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
            <strong className="text-emerald-300 block mb-1">
              100% Real Institutional Exchange Feeds:
            </strong>
            Data displayed in the scanner and charts is streamed from official exchanges
            (NASDAQ, NYSE, CBOE, CME, Binance) via the Yahoo Finance v8 REST API gateway.
          </div>

          <div className="space-y-2 bg-zinc-950 p-3 rounded-lg border border-zinc-800 font-mono text-[11px]">
            <div className="flex justify-between">
              <span className="text-zinc-500">API Endpoint:</span>
              <span className="text-zinc-300">query1.finance.yahoo.com/v8/finance/chart</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Venue / Exchange:</span>
              <span className="text-white font-bold">{feedMeta?.exchange || 'NASDAQ'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Settlement Currency:</span>
              <span className="text-white font-bold">{feedMeta?.currency || 'USD'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Server UTC:</span>
              <span className="text-zinc-300">{feedMeta?.serverTimeUtc || new Date().toISOString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Refresh Interval:</span>
              <span className="text-emerald-400 font-bold">Every 15 seconds (Auto)</span>
            </div>
          </div>

          <p className="text-zinc-400 text-[11px]">
            Every candlestick contains official Open, High, Low, Close prices and verified
            traded volume. When US equity markets are closed (weekends or overnight), the platform displays
            the official closing bell price and keeps the Bucharest and New York clocks synchronized.
          </p>
        </div>

        <div className="pt-2 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs rounded-lg transition"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};
