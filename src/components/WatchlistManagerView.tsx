import React, { useState, useEffect, useMemo } from 'react';
import {
  ListFilter,
  Plus,
  Trash2,
  Edit3,
  Download,
  Upload,
  Check,
  X,
  Search,
  Sparkles,
  BookMarked,
  ShieldAlert,
  ShieldCheck,
  ArrowRight,
  Zap,
  Tag,
  Copy,
  ExternalLink,
  Layers,
  Radio,
} from 'lucide-react';
import {
  Watchlist,
  DEFAULT_WATCHLISTS,
  loadWatchlists,
  saveWatchlists,
  createWatchlist,
  updateWatchlist,
  deleteWatchlist,
  addSymbolsToWatchlist,
  removeSymbolFromWatchlist,
  getActiveWatchlistId,
  setActiveWatchlistId,
  exportWatchlistsToJSON,
  importWatchlistsFromJSON,
  exportWatchlistToCSV,
} from '../utils/watchlistManager';
import { SP500_UNIVERSE } from '../data/sp500Universe';
import { downloadCSV } from '../utils/tradeJournal';

interface WatchlistManagerViewProps {
  onSelectSymbolForChart: (sym: string) => void;
  onSetScanWatchlist?: (symbols: string[], name: string) => void;
}

export const WatchlistManagerView: React.FC<WatchlistManagerViewProps> = ({
  onSelectSymbolForChart,
  onSetScanWatchlist,
}) => {
  const [watchlists, setWatchlists] = useState<Watchlist[]>(() => loadWatchlists());
  const [activeId, setActiveId] = useState<string>(() => getActiveWatchlistId(watchlists));
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [symbolInput, setSymbolInput] = useState<string>('');
  const [notification, setNotification] = useState<string | null>(null);

  // Modal / Drawer states
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [newListName, setNewListName] = useState<string>('');
  const [newListDesc, setNewListDesc] = useState<string>('');
  const [newListColor, setNewListColor] = useState<Watchlist['color']>('purple');
  const [newListSymbols, setNewListSymbols] = useState<string>('');

  const [showImportModal, setShowImportModal] = useState<boolean>(false);
  const [importJsonText, setImportJsonText] = useState<string>('');

  const [editingWatchlist, setEditingWatchlist] = useState<Watchlist | null>(null);

  // Sync active ID state
  useEffect(() => {
    setActiveWatchlistId(activeId);
  }, [activeId]);

  // Sync watchlists to localStorage
  useEffect(() => {
    saveWatchlists(watchlists);
  }, [watchlists]);

  const activeWatchlist = useMemo(() => {
    return watchlists.find((wl) => wl.id === activeId) || watchlists[0] || DEFAULT_WATCHLISTS[0];
  }, [watchlists, activeId]);

  // Filter symbols in active watchlist by search query
  const filteredActiveSymbols = useMemo(() => {
    if (!activeWatchlist) return [];
    if (!searchQuery.trim()) return activeWatchlist.symbols;

    const q = searchQuery.toLowerCase().trim();
    return activeWatchlist.symbols.filter((sym) => {
      const spData = SP500_UNIVERSE.find((item) => item.symbol === sym);
      const name = spData ? spData.name.toLowerCase() : '';
      const sector = spData ? spData.sector.toLowerCase() : '';
      return sym.toLowerCase().includes(q) || name.includes(q) || sector.includes(q);
    });
  }, [activeWatchlist, searchQuery]);

  // Add symbol handler
  const handleAddSymbol = (e: React.FormEvent) => {
    e.preventDefault();
    if (!symbolInput.trim()) return;

    const updated = addSymbolsToWatchlist(watchlists, activeId, symbolInput);
    setWatchlists(updated);
    setSymbolInput('');
    showToast(`Added symbol(s) to ${activeWatchlist.name}`);
  };

  // Quick preset add (from S&P 500 search suggestions)
  const handleAddPresetSymbol = (sym: string) => {
    const updated = addSymbolsToWatchlist(watchlists, activeId, sym);
    setWatchlists(updated);
    showToast(`Added ${sym} to ${activeWatchlist.name}`);
  };

  // Remove symbol handler
  const handleRemoveSymbol = (sym: string) => {
    const updated = removeSymbolFromWatchlist(watchlists, activeId, sym);
    setWatchlists(updated);
    showToast(`Removed ${sym} from ${activeWatchlist.name}`);
  };

  // Create watchlist handler
  const handleCreateWatchlistSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListName.trim()) return;

    const initialSymbols = newListSymbols
      .split(/[\s,]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);

    const { updatedWatchlists, newWatchlist } = createWatchlist(
      watchlists,
      newListName,
      newListDesc,
      initialSymbols,
      newListColor
    );

    setWatchlists(updatedWatchlists);
    setActiveId(newWatchlist.id);
    setShowCreateModal(false);
    setNewListName('');
    setNewListDesc('');
    setNewListSymbols('');
    showToast(`Created custom watchlist "${newWatchlist.name}"`);
  };

  // Delete watchlist handler
  const handleDeleteWatchlist = (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete custom watchlist "${name}"?`)) {
      const updated = deleteWatchlist(watchlists, id, true);
      setWatchlists(updated);
      if (activeId === id) {
        setActiveId(updated[0]?.id || 'wl-sp500-top');
      }
      showToast(`Deleted watchlist "${name}"`);
    }
  };

  // Export CSV handler
  const handleExportCSV = () => {
    if (!activeWatchlist) return;
    const csvContent = exportWatchlistToCSV(activeWatchlist);
    const fileName = `${activeWatchlist.name.toLowerCase().replace(/\s+/g, '_')}_watchlist.csv`;
    downloadCSV(csvContent, fileName);
    showToast(`Exported ${activeWatchlist.name} to CSV`);
  };

  // Export JSON handler
  const handleExportJSON = () => {
    const jsonContent = exportWatchlistsToJSON(watchlists);
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `trullas_custom_watchlists_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast(`Exported all watchlists to JSON backup file`);
  };

  // Import JSON handler
  const handleImportJSONSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const merged = importWatchlistsFromJSON(watchlists, importJsonText);
      setWatchlists(merged);
      setShowImportModal(false);
      setImportJsonText('');
      showToast(`Imported watchlists successfully`);
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Apply to Scanner
  const handleApplyToScanner = () => {
    if (!activeWatchlist || !onSetScanWatchlist) return;
    onSetScanWatchlist(activeWatchlist.symbols, activeWatchlist.name);
    showToast(`Set "${activeWatchlist.name}" (${activeWatchlist.symbols.length} symbols) as active scanning universe!`);
  };

  const showToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => {
      setNotification(null);
    }, 3500);
  };

  const getColorClass = (col?: Watchlist['color']) => {
    switch (col) {
      case 'emerald':
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'indigo':
        return 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30';
      case 'blue':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'amber':
        return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      case 'cyan':
        return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30';
      case 'rose':
        return 'bg-rose-500/20 text-rose-400 border-rose-500/30';
      case 'violet':
        return 'bg-violet-500/20 text-violet-400 border-violet-500/30';
      default:
        return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
    }
  };

  return (
    <div className="space-y-6">
      {/* HEADER BANNER */}
      <div className="bg-gradient-to-r from-zinc-900 via-indigo-950/40 to-zinc-950 border border-zinc-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold mb-2">
              <BookMarked className="w-3.5 h-3.5" />
              <span>Watchlist &amp; Portfolio Basket Manager</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Custom Watchlists &amp; Focused Symbol Baskets
            </h2>
            <p className="mt-1 text-xs text-zinc-300 max-w-2xl leading-relaxed">
              Create, organize, and isolate custom lists of symbols (e.g. <strong>Tech-Watch</strong>, <strong>Blue-Chips</strong>, <strong>Semiconductors</strong>) alongside the global S&amp;P 500 universe for targeted 24/7 scanning.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl transition shadow-lg shadow-emerald-600/20 flex items-center space-x-2"
            >
              <Plus className="w-4 h-4" />
              <span>Create Watchlist</span>
            </button>

            <button
              onClick={() => setShowImportModal(true)}
              className="px-3.5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium text-xs rounded-xl border border-zinc-700 transition flex items-center space-x-1.5"
            >
              <Upload className="w-3.5 h-3.5 text-indigo-400" />
              <span>Import JSON</span>
            </button>

            <button
              onClick={handleExportJSON}
              className="px-3.5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium text-xs rounded-xl border border-zinc-700 transition flex items-center space-x-1.5"
            >
              <Download className="w-3.5 h-3.5 text-amber-400" />
              <span>Backup All</span>
            </button>
          </div>
        </div>

        {/* TOAST NOTIFICATION */}
        {notification && (
          <div className="mt-4 p-3 bg-zinc-950 border border-indigo-500/40 rounded-xl text-xs text-indigo-300 flex items-center space-x-2 animate-in fade-in">
            <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{notification}</span>
          </div>
        )}
      </div>

      {/* WATCHLIST SELECTOR GRID */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {watchlists.map((wl) => {
          const isActive = wl.id === activeId;
          const colorBadge = getColorClass(wl.color);

          return (
            <div
              key={wl.id}
              onClick={() => setActiveId(wl.id)}
              className={`p-4 rounded-xl border transition cursor-pointer relative group flex flex-col justify-between ${
                isActive
                  ? 'bg-zinc-900 border-indigo-500 shadow-md ring-1 ring-indigo-500/50'
                  : 'bg-zinc-950 border-zinc-800 hover:bg-zinc-900/60 hover:border-zinc-700'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border font-bold ${colorBadge}`}>
                    {wl.symbols.length} Symbols
                  </span>
                  {wl.isDefault && (
                    <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                      Preset
                    </span>
                  )}
                </div>

                <h3 className="text-sm font-bold text-white tracking-tight font-mono">{wl.name}</h3>
                <p className="text-[11px] text-zinc-400 mt-1 line-clamp-2 leading-relaxed">
                  {wl.description}
                </p>
              </div>

              <div className="mt-3 pt-2.5 border-t border-zinc-800/60 flex items-center justify-between text-[10px] text-zinc-500 font-mono">
                <span>Updated: {wl.updatedAt.slice(0, 10)}</span>
                {!wl.isDefault && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteWatchlist(wl.id, wl.name);
                    }}
                    className="p-1 hover:text-rose-400 transition"
                    title="Delete Watchlist"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ACTIVE WATCHLIST INSPECTOR & EDITOR */}
      {activeWatchlist && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-6 shadow-md">
          {/* Active Watchlist HUD */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
            <div>
              <div className="flex items-center space-x-3">
                <h3 className="text-xl font-extrabold text-white font-mono">{activeWatchlist.name}</h3>
                <span className={`text-xs font-mono px-2.5 py-0.5 rounded-full border font-bold ${getColorClass(activeWatchlist.color)}`}>
                  {activeWatchlist.symbols.length} Tickers
                </span>
                {activeWatchlist.isDefault ? (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                    System Preset
                  </span>
                ) : (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-500/30">
                    Custom List
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400 mt-1">{activeWatchlist.description}</p>
            </div>

            <div className="flex items-center space-x-2 shrink-0">
              {onSetScanWatchlist && (
                <button
                  onClick={handleApplyToScanner}
                  className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl transition shadow-md flex items-center space-x-1.5"
                  title="Scan only symbols in this watchlist"
                >
                  <Radio className="w-3.5 h-3.5 text-emerald-300" />
                  <span>Scan This Watchlist</span>
                </button>
              )}

              <button
                onClick={handleExportCSV}
                className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium rounded-xl border border-zinc-700 transition flex items-center space-x-1"
                title="Export list to CSV"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span>CSV</span>
              </button>
            </div>
          </div>

          {/* SYMBOL ADD & SEARCH TOOLBAR */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Add symbol form */}
            <form onSubmit={handleAddSymbol} className="flex items-center space-x-2">
              <input
                type="text"
                value={symbolInput}
                onChange={(e) => setSymbolInput(e.target.value)}
                placeholder="Add ticker(s) (e.g. AMD, PLTR, NVDA)..."
                className="flex-1 bg-zinc-950 border border-zinc-800 focus:border-indigo-500 rounded-xl px-3.5 py-2 text-xs text-white placeholder-zinc-500 font-mono focus:outline-none"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition flex items-center space-x-1 shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            </form>

            {/* Filter symbol input */}
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter symbols in this list..."
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-indigo-500 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-zinc-500 font-mono focus:outline-none"
              />
            </div>

            {/* Quick S&P 500 Suggestions dropdown */}
            <div className="flex items-center space-x-2">
              <span className="text-[11px] text-zinc-500 font-mono shrink-0">Add S&amp;P Presets:</span>
              <div className="flex flex-wrap gap-1 overflow-x-auto py-1">
                {['AAPL', 'NVDA', 'MSFT', 'AMZN', 'TSLA', 'AMD', 'SPY'].map((preset) => {
                  const exists = activeWatchlist.symbols.includes(preset);
                  return (
                    <button
                      key={preset}
                      disabled={exists}
                      onClick={() => handleAddPresetSymbol(preset)}
                      className={`px-2 py-1 rounded text-[10px] font-mono transition ${
                        exists
                          ? 'bg-zinc-950 text-zinc-600 border border-zinc-800 cursor-not-allowed'
                          : 'bg-zinc-800 text-indigo-300 hover:bg-indigo-600 hover:text-white'
                      }`}
                    >
                      +{preset}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* SYMBOL TILES / TABLE */}
          {filteredActiveSymbols.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {filteredActiveSymbols.map((sym) => {
                const spData = SP500_UNIVERSE.find((item) => item.symbol === sym);
                const companyName = spData ? spData.name : sym;
                const sector = spData ? spData.sector : 'Custom Ticker';

                return (
                  <div
                    key={sym}
                    className="bg-zinc-950 border border-zinc-800 hover:border-indigo-500/50 p-3.5 rounded-xl space-y-2 transition relative group shadow-sm"
                  >
                    <div className="flex items-start justify-between">
                      <span className="text-base font-bold text-white font-mono tracking-tight">{sym}</span>
                      <button
                        onClick={() => handleRemoveSymbol(sym)}
                        className="p-1 text-zinc-600 hover:text-rose-400 transition"
                        title={`Remove ${sym} from ${activeWatchlist.name}`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="text-[11px] text-zinc-400 font-sans truncate" title={companyName}>
                      {companyName}
                    </div>

                    <div className="flex items-center justify-between text-[10px] font-mono pt-1 border-t border-zinc-900">
                      <span className="text-zinc-500 truncate max-w-[90px]">{sector}</span>
                      <button
                        onClick={() => onSelectSymbolForChart(sym)}
                        className="text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-0.5"
                      >
                        Chart <ArrowRight className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-8 text-center bg-zinc-950 border border-zinc-800/80 rounded-xl space-y-2">
              <Search className="w-8 h-8 text-zinc-600 mx-auto" />
              <p className="text-sm text-zinc-300 font-medium">No symbols found in this watchlist</p>
              <p className="text-xs text-zinc-500">
                Type a ticker above to populate this custom basket.
              </p>
            </div>
          )}
        </div>
      )}

      {/* CREATE WATCHLIST MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-base font-bold text-white font-mono flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-400" />
                <span>Create New Custom Watchlist</span>
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-zinc-500 hover:text-zinc-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateWatchlistSubmit} className="space-y-4 text-xs font-mono">
              <div>
                <label className="block text-zinc-400 mb-1 font-sans">Watchlist Name *</label>
                <input
                  type="text"
                  required
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  placeholder="e.g. AI-Infrastructure, Dividend-Growth"
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-indigo-500 rounded-xl px-3 py-2 text-white placeholder-zinc-600 font-mono focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1 font-sans">Description</label>
                <input
                  type="text"
                  value={newListDesc}
                  onChange={(e) => setNewListDesc(e.target.value)}
                  placeholder="Brief description of this asset basket"
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-indigo-500 rounded-xl px-3 py-2 text-white placeholder-zinc-600 font-mono focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1 font-sans">Initial Symbols (comma or space separated)</label>
                <input
                  type="text"
                  value={newListSymbols}
                  onChange={(e) => setNewListSymbols(e.target.value)}
                  placeholder="e.g. NVDA, AMD, AVGO, TSM, PLTR"
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-indigo-500 rounded-xl px-3 py-2 text-white placeholder-zinc-600 font-mono focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1 font-sans">Tag Color</label>
                <div className="flex items-center space-x-2">
                  {(['purple', 'emerald', 'indigo', 'blue', 'amber', 'cyan', 'rose'] as const).map((col) => (
                    <button
                      type="button"
                      key={col}
                      onClick={() => setNewListColor(col)}
                      className={`w-6 h-6 rounded-full border transition ${
                        newListColor === col ? 'ring-2 ring-white ring-offset-2 ring-offset-zinc-900 scale-110' : 'opacity-70'
                      } ${getColorClass(col)}`}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-zinc-800 text-zinc-300 rounded-xl hover:bg-zinc-700 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition shadow-md"
                >
                  Create List
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* IMPORT JSON MODAL */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-base font-bold text-white font-mono flex items-center gap-2">
                <Upload className="w-4 h-4 text-indigo-400" />
                <span>Import Watchlists from JSON</span>
              </h3>
              <button
                onClick={() => setShowImportModal(false)}
                className="text-zinc-500 hover:text-zinc-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleImportJSONSubmit} className="space-y-4 text-xs font-mono">
              <div>
                <label className="block text-zinc-400 mb-1 font-sans">Paste JSON Backup Content</label>
                <textarea
                  rows={6}
                  required
                  value={importJsonText}
                  onChange={(e) => setImportJsonText(e.target.value)}
                  placeholder='{"watchlists": [{"name": "My Tech List", "symbols": ["NVDA", "AAPL"]}]}'
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-indigo-500 rounded-xl p-3 text-white placeholder-zinc-600 font-mono text-[11px] focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="px-4 py-2 bg-zinc-800 text-zinc-300 rounded-xl hover:bg-zinc-700 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition shadow-md"
                >
                  Import Watchlists
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
