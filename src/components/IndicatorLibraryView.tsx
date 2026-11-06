import React, { useState, useEffect } from 'react';
import {
  Code2,
  Plus,
  Trash2,
  Download,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCcw,
  Sparkles,
  Layers,
  FileCode,
  Tag,
  Search,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  CustomPineIndicator,
  IndicatorCategory,
  loadAllIndicators,
  saveAllIndicators,
  importCustomPineIndicator,
  exportIndicatorsAsJSON,
} from '../utils/indicatorLibrary';

interface IndicatorLibraryViewProps {
  onSelectIndicatorForChart?: (indicator: CustomPineIndicator) => void;
}

const CATEGORIES: ('All' | IndicatorCategory)[] = [
  'All',
  'Trend',
  'Oscillator',
  'Volatility',
  'SMC',
  'Reversal',
  'Volume',
];

export const IndicatorLibraryView: React.FC<IndicatorLibraryViewProps> = ({
  onSelectIndicatorForChart,
}) => {
  const [indicators, setIndicators] = useState<CustomPineIndicator[]>([]);
  const [activeCategory, setActiveCategory] = useState<'All' | IndicatorCategory>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [showImportForm, setShowImportForm] = useState(false);
  const [expandedCodeId, setExpandedCodeId] = useState<string | null>(null);

  // Form State
  const [pasteCode, setPasteCode] = useState('');
  const [indicatorName, setIndicatorName] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<IndicatorCategory>('Reversal');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [transpileResult, setTranspileResult] = useState<{
    valid: boolean;
    preview?: string;
    error?: string;
  } | null>(null);

  // Load from storage
  useEffect(() => {
    setIndicators(loadAllIndicators());
  }, []);

  const updateIndicatorsState = (updated: CustomPineIndicator[]) => {
    setIndicators(updated);
    saveAllIndicators(updated);
  };

  const handleToggleEnabled = (id: string) => {
    const updated = indicators.map((ind) =>
      ind.id === id ? { ...ind, enabled: !ind.enabled } : ind
    );
    updateIndicatorsState(updated);
  };

  const handleDelete = (id: string) => {
    const target = indicators.find((i) => i.id === id);
    if (target?.isBuiltIn) return; // Protect built-ins
    const updated = indicators.filter((ind) => ind.id !== id);
    updateIndicatorsState(updated);
  };

  const handleValidateAndTranspile = async () => {
    if (!pasteCode.trim()) {
      setValidationError('Please enter or paste TradingView Pine Script code.');
      return;
    }

    setValidating(true);
    setValidationError(null);
    setTranspileResult(null);

    try {
      const res = await fetch('/api/luxalgo/pinets-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: 'AAPL',
          pineCode: pasteCode,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        if (json.syntaxValid) {
          setTranspileResult({
            valid: true,
            preview: json.transpiledPreview,
          });
        } else {
          setTranspileResult({
            valid: false,
            error: json.error || 'Syntax validation failed',
          });
        }
      }
    } catch (e: any) {
      setTranspileResult({
        valid: false,
        error: e.message || 'Validation request failed',
      });
    } finally {
      setValidating(false);
    }
  };

  const handleImportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pasteCode.trim()) {
      setValidationError('Please paste Pine Script code.');
      return;
    }

    const res = importCustomPineIndicator(pasteCode, {
      name: indicatorName.trim() || undefined,
      author: authorName.trim() || undefined,
      description: description.trim() || undefined,
      category,
    });

    if (!res.success || !res.indicator) {
      setValidationError(res.error || 'Failed to import indicator');
      return;
    }

    const updated = [res.indicator, ...indicators];
    updateIndicatorsState(updated);

    // Reset Form
    setPasteCode('');
    setIndicatorName('');
    setAuthorName('');
    setDescription('');
    setValidationError(null);
    setTranspileResult(null);
    setShowImportForm(false);
  };

  // Export bundle
  const handleExportBundle = () => {
    const jsonStr = exportIndicatorsAsJSON(indicators);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trullas_indicators_bundle_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Filtered indicators
  const filtered = indicators.filter((item) => {
    if (activeCategory !== 'All' && item.category !== activeCategory) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toUpperCase();
      const matchName = item.name.toUpperCase().includes(q);
      const matchDesc = item.description.toUpperCase().includes(q);
      const matchAuthor = item.author.toUpperCase().includes(q);
      if (!matchName && !matchDesc && !matchAuthor) return false;
    }
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12">
      {/* Top Header */}
      <div className="bg-gradient-to-r from-zinc-900 via-zinc-900 to-zinc-950 border border-zinc-800 rounded-2xl p-6 sm:p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-medium mb-3">
              <Code2 className="w-3.5 h-3.5" />
              <span>PineTS Runtime & Community Indicator Engine</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Custom Pine Script Indicator Library
            </h1>
            <p className="mt-2 text-sm text-zinc-400 max-w-2xl leading-relaxed">
              Import, transpile, and manage custom TradingView Pine Script® (v5/v6) indicators. Run them natively in the application via LuxAlgo's PineTS runtime.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              onClick={() => setShowImportForm(!showImportForm)}
              className="flex items-center space-x-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow-md shadow-indigo-600/20 transition"
            >
              <Plus className="w-4 h-4" />
              <span>{showImportForm ? 'Close Importer' : 'Import Pine Script'}</span>
            </button>

            <button
              onClick={handleExportBundle}
              className="flex items-center space-x-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium border border-zinc-700 transition"
              title="Export all indicators as JSON"
            >
              <Download className="w-3.5 h-3.5 text-zinc-400" />
              <span>Export JSON</span>
            </button>
          </div>
        </div>
      </div>

      {/* IMPORT DRAWER / MODAL */}
      {showImportForm && (
        <form
          onSubmit={handleImportSubmit}
          className="bg-zinc-950 border border-indigo-500/40 rounded-2xl p-6 space-y-5 shadow-2xl animate-in fade-in duration-200"
        >
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <h3 className="font-bold text-white text-sm">Import New Pine Script Indicator</h3>
            </div>
            <span className="text-[11px] font-mono text-zinc-500">v5 / v6 Compatible</span>
          </div>

          {validationError && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-400 text-xs flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{validationError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="text-zinc-400 block mb-1 font-medium">Indicator Title (Optional)</label>
              <input
                type="text"
                placeholder="Auto-detected from indicator(...)"
                value={indicatorName}
                onChange={(e) => setIndicatorName(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="text-zinc-400 block mb-1 font-medium">Author / Credit</label>
              <input
                type="text"
                placeholder="e.g. LuxAlgo, Community, Custom"
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="text-zinc-400 block mb-1 font-medium">Strategy Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as IndicatorCategory)}
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-white focus:outline-none focus:border-indigo-500 font-medium"
              >
                <option value="Reversal">Reversal & Exhaustion</option>
                <option value="Trend">Trend & Momentum</option>
                <option value="Oscillator">Oscillator</option>
                <option value="SMC">Smart Money Concepts (SMC)</option>
                <option value="Volatility">Volatility & ATR</option>
                <option value="Volume">Volume & Flow</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5 text-xs">
            <label className="text-zinc-400 block font-medium">
              Paste TradingView Pine Script® Code:
            </label>
            <textarea
              rows={8}
              placeholder={`//@version=5\nindicator("My Custom Indicator", overlay=true)\nplot(ta.ema(close, 20), color=color.blue)`}
              value={pasteCode}
              onChange={(e) => setPasteCode(e.target.value)}
              className="w-full p-4 bg-zinc-900 border border-zinc-800 rounded-xl font-mono text-xs text-indigo-300 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Transpile Diagnostics Result */}
          {transpileResult && (
            <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-lg text-xs font-mono">
              <div className="flex items-center space-x-2 mb-1">
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    transpileResult.valid
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-rose-500/20 text-rose-400'
                  }`}
                >
                  {transpileResult.valid ? 'VALID PINETS AST' : 'PINE SCRIPT SYNTAX ERROR'}
                </span>
                <span className="text-zinc-400 text-[11px]">
                  {transpileResult.valid ? 'Code ready to execute' : transpileResult.error}
                </span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={handleValidateAndTranspile}
              disabled={validating || !pasteCode.trim()}
              className="flex items-center space-x-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium border border-zinc-700 transition"
            >
              <Play className="w-3.5 h-3.5 text-indigo-400" />
              <span>{validating ? 'Transpiling...' : 'Test & Transpile with PineTS'}</span>
            </button>

            <div className="flex items-center space-x-3">
              <button
                type="button"
                onClick={() => setShowImportForm(false)}
                className="px-4 py-2 text-xs text-zinc-400 hover:text-white transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-md shadow-emerald-600/20 transition"
              >
                Save to Library
              </button>
            </div>
          </div>
        </form>
      )}

      {/* FILTER & SEARCH BAR */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Category Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                activeCategory === cat
                  ? 'bg-zinc-800 text-white border border-zinc-700 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-zinc-500" />
          <input
            type="text"
            placeholder="Search indicators..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
          />
        </div>
      </div>

      {/* INDICATORS LIST */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map((ind) => {
          const isExpanded = expandedCodeId === ind.id;
          return (
            <div
              key={ind.id}
              className={`bg-zinc-900 border rounded-xl p-5 space-y-4 transition ${
                ind.enabled
                  ? 'border-zinc-800 hover:border-zinc-700'
                  : 'border-zinc-900/60 opacity-60'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <h3 className="font-bold text-white text-sm">{ind.name}</h3>
                    {ind.isBuiltIn && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">
                        Built-in
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-400 line-clamp-2">{ind.description}</p>
                </div>

                {/* Enable Toggle Switch */}
                <button
                  onClick={() => handleToggleEnabled(ind.id)}
                  className={`px-2.5 py-1 rounded text-[11px] font-mono font-bold transition border shrink-0 ${
                    ind.enabled
                      ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-500'
                  }`}
                >
                  {ind.enabled ? 'ACTIVE' : 'MUTED'}
                </button>
              </div>

              {/* Metadata Badges */}
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-zinc-400 pt-1 border-t border-zinc-800/60">
                <span className="px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800 text-indigo-300">
                  {ind.category}
                </span>
                <span className="px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800">
                  {ind.version}
                </span>
                <span className="px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800">
                  {ind.overlay ? 'Overlay: True' : 'Sub-Pane'}
                </span>
                <span className="text-zinc-500">&bull;</span>
                <span className="text-zinc-400">By {ind.author}</span>
              </div>

              {/* Code Toggle & Actions */}
              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => setExpandedCodeId(isExpanded ? null : ind.id)}
                  className="text-xs text-zinc-400 hover:text-white flex items-center space-x-1 transition"
                >
                  <FileCode className="w-3.5 h-3.5 text-zinc-500" />
                  <span>{isExpanded ? 'Hide Pine Script' : 'View Pine Script'}</span>
                  {isExpanded ? (
                    <ChevronUp className="w-3 h-3 text-zinc-500" />
                  ) : (
                    <ChevronDown className="w-3 h-3 text-zinc-500" />
                  )}
                </button>

                {!ind.isBuiltIn && (
                  <button
                    onClick={() => handleDelete(ind.id)}
                    className="p-1.5 text-zinc-500 hover:text-rose-400 transition rounded hover:bg-rose-500/10"
                    title="Delete custom indicator"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Expanded Pine Script Code Preview */}
              {isExpanded && (
                <div className="pt-2 animate-in fade-in duration-150">
                  <pre className="p-3 rounded-lg bg-zinc-950 border border-zinc-800/80 font-mono text-[11px] text-indigo-300 overflow-x-auto max-h-56 leading-relaxed">
                    {ind.pineCode}
                  </pre>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
