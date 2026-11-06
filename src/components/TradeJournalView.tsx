import React, { useState, useEffect, useMemo } from 'react';
import {
  BookOpen,
  Plus,
  Trash2,
  Image as ImageIcon,
  CheckCircle2,
  XCircle,
  TrendingUp,
  TrendingDown,
  Star,
  Search,
  Filter,
  DollarSign,
  Calendar,
  Tag,
  Upload,
  X,
  ExternalLink,
  Edit2,
  Award,
  Bot,
  Download,
  FileSpreadsheet,
  ChevronRight,
  ChevronDown,
  ArrowUpRight,
  ArrowDownRight,
  ShieldCheck,
  LineChart,
  Clock,
  Activity,
  Sparkles,
} from 'lucide-react';
import {
  JournalEntry,
  JournalStats,
  loadJournalEntries,
  saveJournalEntries,
  calculateJournalStats,
  exportJournalToCSV,
  downloadCSV,
  enrichJournalEntryAnalytics,
} from '../utils/tradeJournal';
import { AutomatedPortfolioManager } from './AutomatedPortfolioManager';
import { OptionsAutomatedPortfolioManager } from './OptionsAutomatedPortfolioManager';

interface TradeJournalViewProps {
  onSelectSymbolForChart: (sym: string) => void;
  scannerResults?: any[];
}

export const TradeJournalView: React.FC<TradeJournalViewProps> = ({
  onSelectSymbolForChart,
  scannerResults = [],
}) => {
  const [journalTab, setJournalTab] = useState<'automated' | 'options' | 'manual'>('automated');
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'OPEN' | 'CLOSED_WIN' | 'CLOSED_LOSS'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [showLogModal, setShowLogModal] = useState(false);
  const [selectedEntryForView, setSelectedEntryForView] = useState<JournalEntry | null>(null);
  const [expandedJournalIds, setExpandedJournalIds] = useState<Set<string>>(new Set());

  const toggleJournalExpand = (id: string) => {
    setExpandedJournalIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExpandAllJournal = () => {
    setExpandedJournalIds(new Set(filteredEntries.map((e) => e.id)));
  };

  const handleCollapseAllJournal = () => {
    setExpandedJournalIds(new Set());
  };

  // Form State for Log Trade Modal
  const [formSymbol, setFormSymbol] = useState('NVDA');
  const [formCompanyName, setFormCompanyName] = useState('');
  const [formSetupType, setFormSetupType] = useState<JournalEntry['setupType']>('BULLISH_TRIPLE');
  const [formTimeframe, setFormTimeframe] = useState('1d');
  const [formStatus, setFormStatus] = useState<JournalEntry['status']>('CLOSED_WIN');
  const [formEntryDate, setFormEntryDate] = useState(new Date().toISOString().split('T')[0]);
  const [formExitDate, setFormExitDate] = useState(new Date().toISOString().split('T')[0]);
  const [formEntryPrice, setFormEntryPrice] = useState<number>(125.0);
  const [formExitPrice, setFormExitPrice] = useState<number>(138.0);
  const [formStopLoss, setFormStopLoss] = useState<number>(120.0);
  const [formTargetPrice, setFormTargetPrice] = useState<number>(138.0);
  const [formQuantity, setFormQuantity] = useState<number>(100);
  const [formEntryScreenshot, setFormEntryScreenshot] = useState('');
  const [formExitScreenshot, setFormExitScreenshot] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formTags, setFormTags] = useState('Followed 4-Pillars, TP2 Hit');
  const [formRating, setFormRating] = useState(5);

  // Close Trade Modal State
  const [entryToClose, setEntryToClose] = useState<JournalEntry | null>(null);
  const [closeExitPrice, setCloseExitPrice] = useState<number>(0);
  const [closeExitDate, setCloseExitDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [closeStatus, setCloseStatus] = useState<JournalEntry['status']>('CLOSED_WIN');
  const [closeNotes, setCloseNotes] = useState<string>('');
  const [closeExitScreenshot, setCloseExitScreenshot] = useState<string>('');
  const [exportToast, setExportToast] = useState<string | null>(null);

  const handleExportCSV = (entriesToExport: JournalEntry[] = entries) => {
    if (entriesToExport.length === 0) {
      setExportToast('No logged trade records to export.');
      setTimeout(() => setExportToast(null), 3500);
      return;
    }
    const csvData = exportJournalToCSV(entriesToExport);
    const dateStamp = new Date().toISOString().slice(0, 10);
    const fileName = `trullas_trade_journal_${dateStamp}.csv`;
    downloadCSV(csvData, fileName);
    setExportToast(`Exported ${entriesToExport.length} trade records to ${fileName} for external auditing.`);
    setTimeout(() => setExportToast(null), 4500);
  };

  const handleOpenCloseTrade = (entry: JournalEntry) => {
    setEntryToClose(entry);
    const estExit = entry.targetPrice || entry.entryPrice * 1.05;
    setCloseExitPrice(estExit);
    setCloseExitDate(new Date().toISOString().split('T')[0]);
    const isBull = !entry.setupType.includes('BEAR');
    const autoStatus = isBull
      ? estExit >= entry.entryPrice
        ? 'CLOSED_WIN'
        : 'CLOSED_LOSS'
      : estExit <= entry.entryPrice
      ? 'CLOSED_WIN'
      : 'CLOSED_LOSS';
    setCloseStatus(autoStatus);
    setCloseNotes(entry.notes ? `${entry.notes}\n\n[Closed]: Target reached.` : 'Closed trade according to strategy rules.');
    setCloseExitScreenshot('');
  };

  const handleConfirmCloseTrade = (e: React.FormEvent) => {
    e.preventDefault();
    if (!entryToClose) return;

    const isBull = !entryToClose.setupType.includes('BEAR');
    const pnl = isBull
      ? (closeExitPrice - entryToClose.entryPrice) * entryToClose.quantity
      : (entryToClose.entryPrice - closeExitPrice) * entryToClose.quantity;
    const pnlPct = isBull
      ? ((closeExitPrice - entryToClose.entryPrice) / entryToClose.entryPrice) * 100
      : ((entryToClose.entryPrice - closeExitPrice) / entryToClose.entryPrice) * 100;

    const updated = entries.map((item) => {
      if (item.id === entryToClose.id) {
        return {
          ...item,
          status: closeStatus,
          exitDate: closeExitDate,
          exitPrice: Number(closeExitPrice),
          realizedPnL: Number(pnl.toFixed(2)),
          pnlPercent: Number(pnlPct.toFixed(2)),
          notes: closeNotes.trim(),
          exitScreenshotUrl: closeExitScreenshot.trim() || item.exitScreenshotUrl,
        };
      }
      return item;
    });

    updateEntriesState(updated);
    setEntryToClose(null);
    if (selectedEntryForView?.id === entryToClose.id) {
      setSelectedEntryForView(null);
    }
  };

  useEffect(() => {
    setEntries(loadJournalEntries());
  }, []);

  const updateEntriesState = (updated: JournalEntry[]) => {
    setEntries(updated);
    saveJournalEntries(updated);
  };

  const stats: JournalStats = useMemo(() => {
    return calculateJournalStats(entries);
  }, [entries]);

  // Handle Image File Upload (Convert File to Base64 Data URL)
  const handleImageUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    target: 'entry' | 'exit'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        if (target === 'entry') setFormEntryScreenshot(reader.result);
        else setFormExitScreenshot(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  // Submit New Trade Log
  const handleLogTradeSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    let pnl: number | undefined = undefined;
    let pnlPct: number | undefined = undefined;

    if (formStatus !== 'OPEN' && formExitPrice > 0) {
      const isBull = !formSetupType.includes('BEAR');
      pnl = isBull
        ? (formExitPrice - formEntryPrice) * formQuantity
        : (formEntryPrice - formExitPrice) * formQuantity;

      pnlPct = isBull
        ? ((formExitPrice - formEntryPrice) / formEntryPrice) * 100
        : ((formEntryPrice - formExitPrice) / formEntryPrice) * 100;

      pnl = Number(pnl.toFixed(2));
      pnlPct = Number(pnlPct.toFixed(2));
    }

    const newEntry: JournalEntry = {
      id: `journal-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      symbol: formSymbol.toUpperCase().trim(),
      companyName: formCompanyName.trim() || undefined,
      setupType: formSetupType,
      timeframe: formTimeframe,
      status: formStatus,
      entryDate: formEntryDate,
      exitDate: formStatus !== 'OPEN' ? formExitDate : undefined,
      entryPrice: Number(formEntryPrice),
      exitPrice: formStatus !== 'OPEN' ? Number(formExitPrice) : undefined,
      stopLoss: Number(formStopLoss),
      targetPrice: Number(formTargetPrice),
      quantity: Number(formQuantity),
      realizedPnL: pnl,
      pnlPercent: pnlPct,
      entryScreenshotUrl: formEntryScreenshot.trim() || undefined,
      exitScreenshotUrl: formExitScreenshot.trim() || undefined,
      notes: formNotes.trim(),
      tags: formTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      executionRating: formRating,
      createdAt: Date.now(),
    };

    const updated = [newEntry, ...entries];
    updateEntriesState(updated);
    setShowLogModal(false);

    // Reset Form
    setFormNotes('');
    setFormEntryScreenshot('');
    setFormExitScreenshot('');
  };

  const handleDeleteEntry = (id: string) => {
    const updated = entries.filter((e) => e.id !== id);
    updateEntriesState(updated);
    if (selectedEntryForView?.id === id) setSelectedEntryForView(null);
  };

  // Filtered List
  const filteredEntries = useMemo(() => {
    return entries.filter((item) => {
      if (activeFilter !== 'ALL' && item.status !== activeFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toUpperCase();
        const matchSym = item.symbol.toUpperCase().includes(q);
        const matchNotes = item.notes.toUpperCase().includes(q);
        const matchTag = item.tags.some((t) => t.toUpperCase().includes(q));
        if (!matchSym && !matchNotes && !matchTag) return false;
      }
      return true;
    });
  }, [entries, activeFilter, searchQuery]);

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12">
      {/* Top Tab Mode Switcher: Stock Auto-Pilot vs Options Auto-Pilot vs Manual Diary */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-zinc-900/90 border border-zinc-800 p-2 rounded-2xl shadow-md">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setJournalTab('automated')}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition ${
              journalTab === 'automated'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
            }`}
          >
            <Bot className="w-4 h-4" />
            <span>Stock Portfolio Manager ($10k Virtual)</span>
          </button>

          <button
            onClick={() => setJournalTab('options')}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition ${
              journalTab === 'options'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
            }`}
          >
            <Sparkles className="w-4 h-4 text-emerald-300" />
            <span className="flex items-center space-x-1.5">
              <span>Options Harvesting & TradingWarz Bot ($2k Virtual)</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono">
                $2k Era
              </span>
            </span>
          </button>

          <button
            onClick={() => setJournalTab('manual')}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition ${
              journalTab === 'manual'
                ? 'bg-zinc-800 text-white shadow-sm border border-zinc-700'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Manual Trade Diary ({entries.length})</span>
          </button>
        </div>

        <div className="flex items-center space-x-3 px-3 text-xs text-zinc-400 font-mono">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>
              {journalTab === 'options'
                ? "Rich's S&P 500 Put Harvesting + TradingWarz"
                : journalTab === 'automated'
                ? 'Trullàs 4-Pillars Algorithm'
                : 'Manual Journal'}
            </span>
          </span>
        </div>
      </div>

      {journalTab === 'automated' ? (
        <AutomatedPortfolioManager
          onSelectSymbolForChart={onSelectSymbolForChart}
          scannerResults={scannerResults}
        />
      ) : journalTab === 'options' ? (
        <OptionsAutomatedPortfolioManager
          onSelectSymbolForChart={onSelectSymbolForChart}
          scannerResults={scannerResults}
        />
      ) : (
        <>
          {/* Header Banner */}
          <div className="bg-gradient-to-r from-zinc-900 via-zinc-900 to-zinc-950 border border-zinc-800 rounded-2xl p-6 sm:p-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium mb-3">
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>Trader Execution Diary & Performance Analytics</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                  Manual Trading Performance Journal
                </h1>
                <p className="mt-2 text-sm text-zinc-400 max-w-2xl leading-relaxed">
                  Log trades taken based on scanner setups, attach entry/exit chart screenshots, track win rate metrics, and audit strategy discipline.
                </p>
              </div>

              <div className="flex items-center space-x-2.5 shrink-0">
                <button
                  onClick={() => handleExportCSV(entries)}
                  data-testid="export-journal-csv-btn"
                  className="flex items-center space-x-2 px-3.5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white border border-zinc-700 rounded-lg text-xs font-semibold shadow-sm transition"
                  title="Export complete logged trade history to CSV file for external performance auditing"
                >
                  <Download className="w-4 h-4 text-emerald-400" />
                  <span>Export CSV</span>
                </button>

                <button
                  onClick={() => setShowLogModal(true)}
                  className="flex items-center space-x-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-md shadow-emerald-600/20 transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>Log New Trade</span>
                </button>
              </div>
            </div>

        {/* EXPORT TOAST NOTIFICATION */}
        {exportToast && (
          <div className="mt-4 p-3 bg-emerald-950/80 border border-emerald-500/40 rounded-xl flex items-center justify-between text-xs text-emerald-200 animate-fade-in shadow-lg">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{exportToast}</span>
            </div>
            <button
              onClick={() => setExportToast(null)}
              className="text-emerald-400 hover:text-white text-xs px-2 py-0.5"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* PERFORMANCE STATS BAR */}
        {/* PERFORMANCE STATS HUD */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 mb-6 bg-zinc-900 border border-zinc-800 p-4 rounded-2xl shadow-inner font-mono">
          <div className="border-r border-zinc-800">
            <span className="text-[10px] text-zinc-400 block font-sans uppercase">Total Realized P&L</span>
            <div className="text-xl font-bold mt-1">
              <span className={stats.totalRealizedPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                {stats.totalRealizedPnL >= 0 ? '+' : ''}${stats.totalRealizedPnL.toLocaleString()}
              </span>
            </div>
          </div>
          <div className="border-r border-zinc-800">
            <span className="text-[10px] text-zinc-400 block font-sans uppercase">Win Rate</span>
            <div className="text-xl font-bold text-white mt-1">
              {stats.winRatePct}%
              <span className="text-[10px] text-zinc-500 ml-1">({stats.winningTrades}W/{stats.losingTrades}L)</span>
            </div>
          </div>
          <div className="border-r border-zinc-800">
            <span className="text-[10px] text-zinc-400 block font-sans uppercase">Profit Factor</span>
            <div className="text-xl font-bold text-indigo-400 mt-1">{stats.profitFactor}x</div>
          </div>
          <div className="border-r border-zinc-800">
            <span className="text-[10px] text-zinc-400 block font-sans uppercase">Total Trades</span>
            <div className="text-xl font-bold text-white mt-1">
              {stats.totalTrades}
              <span className="text-[10px] text-zinc-500 ml-1">({stats.openTrades} Open)</span>
            </div>
          </div>
          <div className="border-r border-zinc-800">
            <span className="text-[10px] text-zinc-400 block font-sans uppercase">Avg Win</span>
            <div className="text-xl font-bold text-emerald-400 mt-1">+${stats.averageWinPnL}</div>
          </div>
          <div>
            <span className="text-[10px] text-zinc-400 block font-sans uppercase">Avg Loss</span>
            <div className="text-xl font-bold text-rose-400 mt-1">-${stats.averageLossPnL}</div>
          </div>
        </div>

      </div>

      {/* FILTER CONTROLS */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          {[
            { id: 'ALL', label: 'All Trades' },
            { id: 'OPEN', label: 'Open Positions' },
            { id: 'CLOSED_WIN', label: 'Winning Trades' },
            { id: 'CLOSED_LOSS', label: 'Losing Trades' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveFilter(tab.id as any)}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                activeFilter === tab.id
                  ? 'bg-zinc-800 text-white font-semibold border border-zinc-700'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center space-x-2">
          {activeFilter !== 'ALL' && (
            <button
              onClick={() => handleExportCSV(filteredEntries)}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-zinc-950 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 rounded-lg transition"
              title="Export current filtered view to CSV"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>Export Filtered ({filteredEntries.length})</span>
            </button>
          )}

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-zinc-500" />
            <input
              type="text"
              placeholder="Search by ticker or tag..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
            />
          </div>
        </div>
      </div>

      {/* TRADE LOG INSTITUTIONAL TABLE */}
      {filteredEntries.length > 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-sm">
          <div className="p-3 border-b border-zinc-800 bg-zinc-950/60 flex items-center justify-between text-xs font-mono">
            <div className="flex items-center space-x-2 text-zinc-400">
              <span>Trade Log Entries:</span>
              <strong className="text-white">{filteredEntries.length}</strong>
              <span className="text-zinc-600 hidden sm:inline">&bull; Click any row to expand trade autopsy, screenshots &amp; notes</span>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={handleExpandAllJournal}
                className="px-2.5 py-1 text-[11px] font-mono text-zinc-400 hover:text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg transition"
              >
                Expand All
              </button>
              <button
                onClick={handleCollapseAllJournal}
                className="px-2.5 py-1 text-[11px] font-mono text-zinc-400 hover:text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg transition"
              >
                Collapse All
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-950/80 text-[11px] font-mono text-zinc-400 uppercase tracking-wider select-none">
                  <th className="py-3 px-3 w-8 text-center"></th>
                  <th className="py-3 px-3 font-semibold text-zinc-300">Date / Exit</th>
                  <th className="py-3 px-3 font-semibold text-zinc-300">Asset</th>
                  <th className="py-3 px-3 font-semibold text-zinc-300">Side &amp; Setup</th>
                  <th className="py-3 px-3 font-semibold text-right text-zinc-300">Shares / Units</th>
                  <th className="py-3 px-3 font-semibold text-right text-zinc-300">Entry Price</th>
                  <th className="py-3 px-3 font-semibold text-right text-zinc-300">Exit Price</th>
                  <th className="py-3 px-3 font-semibold text-right text-zinc-300">Stop &amp; Target</th>
                  <th className="py-3 px-3 font-semibold text-right text-zinc-300">Realized P&amp;L</th>
                  <th className="py-3 px-3 font-semibold text-right text-zinc-300">Realized R</th>
                  <th className="py-3 px-3 font-semibold text-center text-zinc-300">Grade</th>
                  <th className="py-3 px-3 font-semibold text-center text-zinc-300">Status</th>
                  <th className="py-3 px-3 font-semibold text-right text-zinc-300">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80 text-xs font-mono">
                {filteredEntries.map((item) => {
                  const isWin = item.status === 'CLOSED_WIN';
                  const isLoss = item.status === 'CLOSED_LOSS';
                  const isOpen = item.status === 'OPEN';
                  const isExpanded = expandedJournalIds.has(item.id);
                  const isBull = !item.setupType.includes('BEAR');
                  const riskPerShare = Math.abs(item.entryPrice - item.stopLoss);
                  
                  // Calculate R-multiple based on 2026 Trading Journal Deep Dive Chapter 6
                  let realizedR = '—';
                  if (item.realizedPnL !== undefined && riskPerShare > 0 && item.quantity > 0) {
                    const plannedDollarRisk = riskPerShare * item.quantity;
                    const rVal = item.realizedPnL / plannedDollarRisk;
                    realizedR = `${rVal >= 0 ? '+' : ''}${rVal.toFixed(2)}R`;
                  }

                  // Process grade derived from rating and execution
                  let gradeLetter = 'B';
                  if (item.executionRating >= 5) gradeLetter = 'A+';
                  else if (item.executionRating === 4) gradeLetter = 'A';
                  else if (item.executionRating === 3) gradeLetter = 'B';
                  else if (item.executionRating === 2) gradeLetter = 'C';
                  else gradeLetter = 'D';

                  return (
                    <React.Fragment key={item.id}>
                      {/* Summary Row */}
                      <tr
                        onClick={() => toggleJournalExpand(item.id)}
                        className={`hover:bg-zinc-800/60 cursor-pointer transition select-none group ${
                          isExpanded ? 'bg-zinc-800/40 border-l-2 border-l-emerald-500' : ''
                        }`}
                      >
                        {/* Expand chevron */}
                        <td className="py-3 px-3 text-center text-zinc-400 group-hover:text-white">
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded hover:bg-zinc-700/50 transition">
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-emerald-400" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </span>
                        </td>

                        {/* Date / Exit */}
                        <td className="py-3 px-3">
                          <div className="font-semibold text-white">{item.entryDate}</div>
                          <div className="text-[10px] text-zinc-500 font-sans">
                            {item.exitDate ? `Exit: ${item.exitDate}` : 'Currently Holding'}
                          </div>
                        </td>

                        {/* Asset */}
                        <td className="py-3 px-3">
                          <div className="flex items-center space-x-2">
                            <div
                              className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold ${
                                isBull ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                              }`}
                            >
                              {isBull ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                            </div>
                            <div>
                              <div className="flex items-center space-x-1.5">
                                <span
                                  className="font-bold text-white text-sm hover:underline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onSelectSymbolForChart(item.symbol);
                                  }}
                                >
                                  {item.symbol}
                                </span>
                                <span className="text-[9px] px-1 py-0.2 rounded bg-zinc-950 text-zinc-400 border border-zinc-800">
                                  {item.timeframe}
                                </span>
                              </div>
                              <div className="text-[11px] text-zinc-400 font-sans truncate max-w-[130px]">
                                {item.companyName || 'Stock Asset'}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Side & Setup */}
                        <td className="py-3 px-3">
                          <div className="flex flex-col gap-1 items-start">
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                                isBull
                                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                  : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                              }`}
                            >
                              {isBull ? 'LONG' : 'SHORT'}
                            </span>
                            <span className="text-[10px] text-zinc-400 truncate max-w-[140px]">
                              {item.setupType.replace('_', ' ')}
                            </span>
                          </div>
                        </td>

                        {/* Shares / Units */}
                        <td className="py-3 px-3 text-right">
                          <div className="font-bold text-white">{item.quantity} sh</div>
                          <div className="text-[10px] text-zinc-500 font-sans">
                            ${(item.quantity * item.entryPrice).toFixed(0)} cap
                          </div>
                        </td>

                        {/* Entry Price */}
                        <td className="py-3 px-3 text-right">
                          <div className="text-white font-semibold">${item.entryPrice.toFixed(2)}</div>
                        </td>

                        {/* Exit Price */}
                        <td className="py-3 px-3 text-right">
                          {item.exitPrice ? (
                            <div className="text-white font-semibold">${item.exitPrice.toFixed(2)}</div>
                          ) : (
                            <div className="text-blue-400 font-bold">Open</div>
                          )}
                        </td>

                        {/* Stop & Target */}
                        <td className="py-3 px-3 text-right">
                          <div className="text-amber-400 font-medium text-[11px]">
                            TP: ${item.targetPrice.toFixed(2)}
                          </div>
                          <div className="text-rose-400 text-[10px]">
                            SL: ${item.stopLoss.toFixed(2)}
                          </div>
                        </td>

                        {/* Realized P&L */}
                        <td className="py-3 px-3 text-right">
                          {item.realizedPnL !== undefined ? (
                            <div>
                              <div
                                className={`text-sm font-bold ${
                                  item.realizedPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'
                                }`}
                              >
                                {item.realizedPnL >= 0 ? '+' : ''}${item.realizedPnL.toFixed(2)}
                              </div>
                              <div
                                className={`text-[10px] ${
                                  (item.pnlPercent ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                                }`}
                              >
                                {item.pnlPercent !== undefined ? `${item.pnlPercent >= 0 ? '+' : ''}${item.pnlPercent.toFixed(2)}%` : ''}
                              </div>
                            </div>
                          ) : (
                            <span className="text-blue-400 font-semibold">Running</span>
                          )}
                        </td>

                        {/* Realized R */}
                        <td className="py-3 px-3 text-right">
                          <span
                            className={`font-bold text-xs ${
                              realizedR.startsWith('+') ? 'text-emerald-400' : realizedR.startsWith('-') ? 'text-rose-400' : 'text-zinc-500'
                            }`}
                          >
                            {realizedR}
                          </span>
                        </td>

                        {/* Grade */}
                        <td className="py-3 px-3 text-center">
                          <span className="inline-block px-2 py-0.5 rounded font-mono font-bold text-xs bg-zinc-950 border border-zinc-800 text-amber-300">
                            {gradeLetter}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="py-3 px-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                              isOpen
                                ? 'bg-blue-500/15 border-blue-500/30 text-blue-400'
                                : isWin
                                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                                : 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                            }`}
                          >
                            {item.status.replace('_', ' ')}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end space-x-1">
                            {item.status === 'OPEN' && (
                              <button
                                onClick={() => handleOpenCloseTrade(item)}
                                className="px-2 py-1 bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 border border-emerald-500/30 text-[11px] font-medium rounded transition"
                                title="Close this open position"
                              >
                                Close
                              </button>
                            )}
                            <button
                              onClick={() => onSelectSymbolForChart(item.symbol)}
                              className="p-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded transition"
                              title="View Technical Chart"
                            >
                              <LineChart className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setSelectedEntryForView(item)}
                              className="p-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded transition"
                              title="Open Full Detail Modal"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteEntry(item.id)}
                              className="p-1 bg-zinc-800 hover:bg-rose-900/50 text-zinc-400 hover:text-rose-400 rounded transition"
                              title="Delete Trade Record"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* ACCORDION DROPDOWN: Inline Trade Autopsy */}
                      {isExpanded && (
                        <tr className="bg-zinc-950/95 border-b border-zinc-800">
                          <td colSpan={13} className="p-5">
                            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4 shadow-inner">
                              {/* Header & Meta */}
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div>
                                  <div className="flex items-center space-x-2">
                                    <strong className="text-white text-base font-bold font-mono">
                                      {item.symbol} &bull; {item.companyName || 'Stock'}
                                    </strong>
                                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-950 text-zinc-300 border border-zinc-800">
                                      Timeframe: {item.timeframe}
                                    </span>
                                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30 font-bold">
                                      Rating: {item.executionRating}/5 Stars
                                    </span>
                                  </div>
                                  <div className="text-xs text-zinc-400 font-sans mt-0.5">
                                    Entered: <strong className="text-white">{item.entryDate}</strong> &bull; Exit: <strong className="text-white">{item.exitDate || 'Open'}</strong> &bull; Size: {item.quantity} shares (${(item.quantity * item.entryPrice).toFixed(2)})
                                  </div>
                                </div>

                                <div className="flex items-center space-x-2">
                                  {item.status === 'OPEN' && (
                                    <button
                                      onClick={() => handleOpenCloseTrade(item)}
                                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-sm transition"
                                    >
                                      Close Position
                                    </button>
                                  )}
                                  <button
                                    onClick={() => setSelectedEntryForView(item)}
                                    className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-xs font-medium transition flex items-center space-x-1"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                    <span>Full Autopsy Modal</span>
                                  </button>
                                </div>
                              </div>

                              {/* Price Levels Grid */}
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono bg-zinc-950/80 p-3 rounded-xl border border-zinc-800/80">
                                <div>
                                  <span className="text-[10px] text-zinc-500 block">Entry Price</span>
                                  <span className="font-bold text-white">${item.entryPrice.toFixed(2)}</span>
                                </div>
                                <div>
                                  <span className="text-[10px] text-zinc-500 block">Exit Price</span>
                                  <span className="font-bold text-white">
                                    {item.exitPrice ? `$${item.exitPrice.toFixed(2)}` : 'Position Open'}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-[10px] text-zinc-500 block">Stop Loss (1R)</span>
                                  <span className="font-bold text-rose-400">${item.stopLoss.toFixed(2)}</span>
                                </div>
                                <div>
                                  <span className="text-[10px] text-zinc-500 block">Target Price</span>
                                  <span className="font-bold text-amber-400">${item.targetPrice.toFixed(2)}</span>
                                </div>
                              </div>

                              {/* TRADE-LEVEL EXECUTION ANALYTICS (Duration, MAE Drawdown, MFE Peak, Planned Risk) */}
                              <div className="bg-gradient-to-r from-zinc-950 via-zinc-900/90 to-zinc-950 p-3.5 rounded-xl border border-zinc-800 text-xs space-y-2">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center space-x-2">
                                    <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono font-bold text-[10px] uppercase border border-indigo-500/30 flex items-center gap-1">
                                      <Activity className="w-3 h-3 text-indigo-400" />
                                      Trade-Level Post-Trade Analytics
                                    </span>
                                    <span className="text-[11px] text-zinc-400 font-sans hidden sm:inline">
                                      Execution duration, drawdown from peak &amp; excursion telemetry
                                    </span>
                                  </div>
                                  <span className="text-[10px] font-mono text-zinc-400">
                                    {item.symbol} &bull; {item.status.replace('_', ' ')}
                                  </span>
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1 font-mono text-[11px]">
                                  {/* Trade Duration */}
                                  <div className="bg-zinc-900/90 p-2.5 rounded-lg border border-zinc-800/80">
                                    <div className="flex items-center justify-between text-zinc-400 text-[10px] font-sans mb-1">
                                      <span className="flex items-center gap-1">
                                        <Clock className="w-3 h-3 text-blue-400" />
                                        Trade Duration
                                      </span>
                                      <span className="text-zinc-500">{item.timeframe} bar</span>
                                    </div>
                                    <div className="font-bold text-white text-sm">
                                      {item.tradeDurationLabel || `${item.tradeDurationDays || 1} Days`}
                                    </div>
                                    <div className="text-[10px] text-zinc-500 font-sans mt-0.5">
                                      {item.entryDate} &rarr; {item.exitDate || 'Active Holding'}
                                    </div>
                                  </div>

                                  {/* Drawdown from Peak (MAE) */}
                                  <div className="bg-zinc-900/90 p-2.5 rounded-lg border border-zinc-800/80">
                                    <div className="flex items-center justify-between text-zinc-400 text-[10px] font-sans mb-1">
                                      <span className="flex items-center gap-1">
                                        <TrendingDown className="w-3 h-3 text-rose-400" />
                                        Drawdown from Peak
                                      </span>
                                    </div>
                                    <div className={`font-bold text-sm ${
                                      (item.drawdownFromPeakPct ?? 0) < -3.0
                                        ? 'text-rose-400'
                                        : (item.drawdownFromPeakPct ?? 0) < 0
                                        ? 'text-amber-400'
                                        : 'text-emerald-400'
                                    }`}>
                                      {item.drawdownFromPeakPct !== undefined ? `${item.drawdownFromPeakPct.toFixed(2)}%` : '0.00%'}
                                    </div>
                                    <div className="text-[10px] text-zinc-500 font-sans mt-0.5">
                                      Max retracement while holding
                                    </div>
                                  </div>

                                  {/* Max Favorable Excursion (Peak MFE) */}
                                  <div className="bg-zinc-900/90 p-2.5 rounded-lg border border-zinc-800/80">
                                    <div className="flex items-center justify-between text-zinc-400 text-[10px] font-sans mb-1">
                                      <span className="flex items-center gap-1">
                                        <TrendingUp className="w-3 h-3 text-emerald-400" />
                                        Peak Favorable Move
                                      </span>
                                    </div>
                                    <div className="font-bold text-emerald-400 text-sm">
                                      +{item.maxFavorableExcursionPct !== undefined ? item.maxFavorableExcursionPct.toFixed(2) : ((Math.abs(item.targetPrice - item.entryPrice) / item.entryPrice) * 100).toFixed(2)}%
                                    </div>
                                    <div className="text-[10px] text-zinc-500 font-sans mt-0.5">
                                      Peak: ${item.peakPriceDuringTrade?.toFixed(2) || (item.exitPrice || item.targetPrice).toFixed(2)}
                                    </div>
                                  </div>

                                  {/* Realized R & Risk Multiple */}
                                  <div className="bg-zinc-900/90 p-2.5 rounded-lg border border-zinc-800/80">
                                    <div className="flex items-center justify-between text-zinc-400 text-[10px] font-sans mb-1">
                                      <span className="flex items-center gap-1">
                                        <Award className="w-3 h-3 text-amber-400" />
                                        Planned Risk Outcome
                                      </span>
                                    </div>
                                    <div className={`font-bold text-sm ${
                                      realizedR.startsWith('+') ? 'text-emerald-400' : realizedR.startsWith('-') ? 'text-rose-400' : 'text-zinc-300'
                                    }`}>
                                      {realizedR}
                                    </div>
                                    <div className="text-[10px] text-zinc-500 font-sans mt-0.5">
                                      1R = ${(riskPerShare * item.quantity).toFixed(0)} risk envelope
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* MACD INDICATOR MODEL DERIVATIONS (Entry Trigger & Exit Reason) */}
                              <div className="bg-zinc-950/90 p-4 rounded-xl border border-zinc-800/90 text-xs space-y-3">
                                <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
                                  <div className="flex items-center space-x-2">
                                    <div className="w-5 h-5 rounded-md bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs">
                                      <Activity className="w-3 h-3" />
                                    </div>
                                    <h4 className="font-bold text-white text-xs font-mono uppercase tracking-wide">
                                      MACD 4-Pillars Model Derivations &amp; Algorithmic Thesis
                                    </h4>
                                  </div>
                                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-900 text-emerald-400 border border-emerald-500/30 font-semibold">
                                    David Trullàs Quantitative Framework
                                  </span>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  {/* MACD Entry Model Reason */}
                                  <div className="bg-zinc-900/70 p-3 rounded-lg border border-zinc-800/80 space-y-1.5">
                                    <div className="flex items-center space-x-1.5 text-emerald-400 font-bold text-[11px] font-mono">
                                      <ArrowUpRight className="w-3.5 h-3.5" />
                                      <span>MACD Model Entry Trigger</span>
                                    </div>
                                    <p className="text-zinc-300 font-sans text-[11px] leading-relaxed">
                                      {item.macdEntryModelReason || 'Divergence model confirmed on 12,26,9 MACD histogram with 23.6% Fibonacci breakout trigger.'}
                                    </p>
                                  </div>

                                  {/* MACD Exit Model Reason */}
                                  <div className="bg-zinc-900/70 p-3 rounded-lg border border-zinc-800/80 space-y-1.5">
                                    <div className="flex items-center space-x-1.5 text-amber-400 font-bold text-[11px] font-mono">
                                      {item.status === 'CLOSED_WIN' ? (
                                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                      ) : item.status === 'CLOSED_LOSS' ? (
                                        <XCircle className="w-3.5 h-3.5 text-rose-400" />
                                      ) : (
                                        <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                                      )}
                                      <span>MACD Model Exit / Execution Reason</span>
                                    </div>
                                    <p className="text-zinc-300 font-sans text-[11px] leading-relaxed">
                                      {item.macdExitModelReason || 'Exit executed according to target levels and ATR risk parameters.'}
                                    </p>
                                  </div>
                                </div>
                              </div>

                              {/* Tags */}
                              {item.tags && item.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 pt-1">
                                  {item.tags.map((tag, i) => (
                                    <span
                                      key={i}
                                      className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-950 text-zinc-300 border border-zinc-800 flex items-center gap-1"
                                    >
                                      <Tag className="w-2.5 h-2.5 text-emerald-400" />
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              )}

                              {/* Notes */}
                              <div className="bg-zinc-950/60 p-3 rounded-xl border border-zinc-800/60 text-xs space-y-1">
                                <div className="text-[11px] font-bold text-zinc-400 font-sans">
                                  Execution Notes &amp; Retrospective:
                                </div>
                                <p className="text-zinc-200 font-sans text-xs leading-relaxed">
                                  {item.notes || 'No detailed notes logged for this setup.'}
                                </p>
                              </div>

                              {/* Attached Screenshots if present */}
                              {(item.entryScreenshotUrl || item.exitScreenshotUrl) && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                                  {item.entryScreenshotUrl && (
                                    <div className="space-y-1">
                                      <span className="text-[10px] text-zinc-400 font-mono block">Entry Setup Chart</span>
                                      <div className="rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950">
                                        <img
                                          src={item.entryScreenshotUrl}
                                          alt="Entry Chart"
                                          className="w-full h-auto object-cover max-h-48"
                                        />
                                      </div>
                                    </div>
                                  )}
                                  {item.exitScreenshotUrl && (
                                    <div className="space-y-1">
                                      <span className="text-[10px] text-zinc-400 font-mono block">Exit Execution Chart</span>
                                      <div className="rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950">
                                        <img
                                          src={item.exitScreenshotUrl}
                                          alt="Exit Chart"
                                          className="w-full h-auto object-cover max-h-48"
                                        />
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="p-12 text-center text-xs bg-zinc-900 border border-zinc-800 rounded-xl space-y-3">
          <BookOpen className="w-8 h-8 text-zinc-600 mx-auto" />
          <p className="text-zinc-300 font-medium text-sm">No trade journal entries found</p>
          <button
            onClick={() => setShowLogModal(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-md shadow-emerald-600/20 transition"
          >
            Log Your First Trade
          </button>
        </div>
      )}

      {/* LOG NEW TRADE MODAL */}
      {showLogModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <form
            onSubmit={handleLogTradeSubmit}
            className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl relative overflow-y-auto max-h-[90vh]"
          >
            <button
              type="button"
              onClick={() => setShowLogModal(false)}
              className="absolute top-5 right-5 text-zinc-400 hover:text-white p-1 rounded-lg bg-zinc-800"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center space-x-2 pb-2 border-b border-zinc-800">
              <Plus className="w-5 h-5 text-emerald-400" />
              <h3 className="font-bold text-white text-base">Log Scanner Trade Setup</h3>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="text-zinc-400 block mb-1 font-medium">Ticker Symbol</label>
                <input
                  type="text"
                  required
                  value={formSymbol}
                  onChange={(e) => setFormSymbol(e.target.value)}
                  className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded text-white font-mono focus:outline-none focus:border-emerald-500 uppercase"
                />
              </div>

              <div>
                <label className="text-zinc-400 block mb-1 font-medium">Setup Classification</label>
                <select
                  value={formSetupType}
                  onChange={(e) => setFormSetupType(e.target.value as any)}
                  className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded text-white font-medium focus:outline-none focus:border-emerald-500"
                >
                  <option value="BULLISH_TRIPLE">Bullish Triple Divergence</option>
                  <option value="BEARISH_TRIPLE">Bearish Triple Divergence</option>
                  <option value="BULLISH_DOUBLE">Bullish Double Divergence</option>
                  <option value="BEARISH_DOUBLE">Bearish Double Divergence</option>
                  <option value="BREAKOUT">Neckline Breakout</option>
                  <option value="CUSTOM">Custom Setup</option>
                </select>
              </div>

              <div>
                <label className="text-zinc-400 block mb-1 font-medium">Trade Status</label>
                <select
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value as any)}
                  className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded text-white font-medium focus:outline-none focus:border-emerald-500"
                >
                  <option value="CLOSED_WIN">Closed Win</option>
                  <option value="CLOSED_LOSS">Closed Loss</option>
                  <option value="OPEN">Open Position</option>
                  <option value="BREAKEVEN">Breakeven</option>
                </select>
              </div>

              <div>
                <label className="text-zinc-400 block mb-1 font-medium">Position Units / Shares</label>
                <input
                  type="number"
                  value={formQuantity}
                  onChange={(e) => setFormQuantity(Number(e.target.value))}
                  className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded text-white font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-zinc-400 block mb-1 font-medium">Entry Price ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formEntryPrice}
                  onChange={(e) => setFormEntryPrice(Number(e.target.value))}
                  className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded text-white font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-zinc-400 block mb-1 font-medium">Exit Price ($)</label>
                <input
                  type="number"
                  step="0.01"
                  disabled={formStatus === 'OPEN'}
                  value={formExitPrice}
                  onChange={(e) => setFormExitPrice(Number(e.target.value))}
                  className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded text-white font-mono focus:outline-none focus:border-emerald-500 disabled:opacity-50"
                />
              </div>
            </div>

            {/* SCREENSHOT FILE UPLOADS */}
            <div className="grid grid-cols-2 gap-3 text-xs pt-2 border-t border-zinc-800">
              <div>
                <label className="text-zinc-400 block mb-1 font-medium">Entry Chart Screenshot</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleImageUpload(e, 'entry')}
                  className="text-[11px] text-zinc-400 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-zinc-800 file:text-white hover:file:bg-zinc-700 cursor-pointer"
                />
              </div>

              <div>
                <label className="text-zinc-400 block mb-1 font-medium">Exit Chart Screenshot</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleImageUpload(e, 'exit')}
                  className="text-[11px] text-zinc-400 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-zinc-800 file:text-white hover:file:bg-zinc-700 cursor-pointer"
                />
              </div>
            </div>

            {/* Execution Rating */}
            <div className="text-xs">
              <label className="text-zinc-400 block mb-1 font-medium">Strategy Execution Discipline</label>
              <div className="flex items-center space-x-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setFormRating(star)}
                    className="p-1"
                  >
                    <Star
                      className={`w-5 h-5 ${
                        star <= formRating
                          ? 'text-amber-400 fill-amber-400'
                          : 'text-zinc-700 hover:text-zinc-500'
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div className="text-xs">
              <label className="text-zinc-400 block mb-1 font-medium">Performance Notes & Diary</label>
              <textarea
                rows={3}
                placeholder="Detail strategy alignment, scaling tranches, emotion check, or mistake tags..."
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                className="w-full p-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setShowLogModal(false)}
                className="px-4 py-2 text-xs text-zinc-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-lg shadow-md shadow-emerald-600/20 transition"
              >
                Save Trade Entry
              </button>
            </div>
          </form>
        </div>
      )}

      {/* FULL ENTRY DETAIL MODAL */}
      {selectedEntryForView && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-3xl w-full p-6 space-y-5 shadow-2xl relative overflow-y-auto max-h-[90vh]">
            <button
              onClick={() => setSelectedEntryForView(null)}
              className="absolute top-5 right-5 text-zinc-400 hover:text-white p-1.5 rounded-lg bg-zinc-800"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <h3 className="text-xl font-bold text-white font-mono">
                  {selectedEntryForView.symbol} Trade Record
                </h3>
                <p className="text-xs text-zinc-400">
                  {selectedEntryForView.setupType.replace('_', ' ')} &bull; Entered {selectedEntryForView.entryDate}
                </p>
              </div>

              <span
                className={`px-3 py-1 rounded-lg text-xs font-bold font-mono border ${
                  selectedEntryForView.status === 'CLOSED_WIN'
                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                    : selectedEntryForView.status === 'CLOSED_LOSS'
                    ? 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                    : 'bg-blue-500/15 border-blue-500/30 text-blue-400'
                }`}
              >
                {selectedEntryForView.status.replace('_', ' ')}
              </span>
            </div>

            {/* Price Levels Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono bg-zinc-950/80 p-3.5 rounded-xl border border-zinc-800">
              <div>
                <span className="text-[10px] text-zinc-500 block">Entry Price</span>
                <span className="font-bold text-white text-sm">${selectedEntryForView.entryPrice.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-[10px] text-zinc-500 block">Exit Price</span>
                <span className="font-bold text-white text-sm">
                  {selectedEntryForView.exitPrice ? `$${selectedEntryForView.exitPrice.toFixed(2)}` : 'Position Open'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-zinc-500 block">Stop Loss (1R)</span>
                <span className="font-bold text-rose-400 text-sm">${selectedEntryForView.stopLoss.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-[10px] text-zinc-500 block">Target Price</span>
                <span className="font-bold text-amber-400 text-sm">${selectedEntryForView.targetPrice.toFixed(2)}</span>
              </div>
            </div>

            {/* Trade-Level Execution Analytics HUD */}
            <div className="bg-gradient-to-r from-zinc-950 via-zinc-900/90 to-zinc-950 p-4 rounded-xl border border-zinc-800 text-xs space-y-2">
              <div className="flex items-center space-x-2">
                <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono font-bold text-[10px] uppercase border border-indigo-500/30 flex items-center gap-1">
                  <Activity className="w-3 h-3 text-indigo-400" />
                  Post-Trade Analytics &amp; Excursion Telemetry
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1 font-mono text-[11px]">
                <div className="bg-zinc-900 p-2.5 rounded-lg border border-zinc-800/80">
                  <span className="text-[10px] text-zinc-400 block font-sans">Trade Duration</span>
                  <div className="font-bold text-white text-sm mt-0.5">
                    {selectedEntryForView.tradeDurationLabel || `${selectedEntryForView.tradeDurationDays || 1} Days`}
                  </div>
                  <span className="text-[10px] text-zinc-500 font-sans">{selectedEntryForView.entryDate} &rarr; {selectedEntryForView.exitDate || 'Holding'}</span>
                </div>

                <div className="bg-zinc-900 p-2.5 rounded-lg border border-zinc-800/80">
                  <span className="text-[10px] text-zinc-400 block font-sans">Drawdown from Peak</span>
                  <div className={`font-bold text-sm mt-0.5 ${
                    (selectedEntryForView.drawdownFromPeakPct ?? 0) < -3.0
                      ? 'text-rose-400'
                      : (selectedEntryForView.drawdownFromPeakPct ?? 0) < 0
                      ? 'text-amber-400'
                      : 'text-emerald-400'
                  }`}>
                    {selectedEntryForView.drawdownFromPeakPct !== undefined ? `${selectedEntryForView.drawdownFromPeakPct.toFixed(2)}%` : '0.00%'}
                  </div>
                  <span className="text-[10px] text-zinc-500 font-sans">Max pull from high</span>
                </div>

                <div className="bg-zinc-900 p-2.5 rounded-lg border border-zinc-800/80">
                  <span className="text-[10px] text-zinc-400 block font-sans">Peak Move (MFE)</span>
                  <div className="font-bold text-emerald-400 text-sm mt-0.5">
                    +{selectedEntryForView.maxFavorableExcursionPct !== undefined ? selectedEntryForView.maxFavorableExcursionPct.toFixed(2) : '0.00'}%
                  </div>
                  <span className="text-[10px] text-zinc-500 font-sans">Peak: ${selectedEntryForView.peakPriceDuringTrade?.toFixed(2) || (selectedEntryForView.exitPrice || selectedEntryForView.targetPrice).toFixed(2)}</span>
                </div>

                <div className="bg-zinc-900 p-2.5 rounded-lg border border-zinc-800/80">
                  <span className="text-[10px] text-zinc-400 block font-sans">Realized P&amp;L</span>
                  <div className={`font-bold text-sm mt-0.5 ${
                    (selectedEntryForView.realizedPnL ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}>
                    {selectedEntryForView.realizedPnL !== undefined
                      ? `${selectedEntryForView.realizedPnL >= 0 ? '+' : ''}$${selectedEntryForView.realizedPnL.toFixed(2)}`
                      : 'Running'}
                  </div>
                  <span className="text-[10px] text-zinc-500 font-sans">
                    {selectedEntryForView.pnlPercent !== undefined ? `${selectedEntryForView.pnlPercent >= 0 ? '+' : ''}${selectedEntryForView.pnlPercent.toFixed(2)}%` : ''}
                  </span>
                </div>
              </div>
            </div>

            {/* MACD Model Derivations Box */}
            <div className="bg-zinc-950/90 p-4 rounded-xl border border-zinc-800 text-xs space-y-3">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                <span className="font-bold text-white text-xs font-mono uppercase tracking-wide flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-emerald-400" />
                  MACD 4-Pillars Model Derivations
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-900 text-emerald-400 border border-emerald-500/30">
                  Quantitative Rationale
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-zinc-900/70 p-3 rounded-lg border border-zinc-800 space-y-1">
                  <div className="text-emerald-400 font-bold text-[11px] font-mono flex items-center gap-1">
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    <span>Entry Model Trigger:</span>
                  </div>
                  <p className="text-zinc-300 font-sans text-xs leading-relaxed">
                    {selectedEntryForView.macdEntryModelReason || 'Divergence model confirmed on 12,26,9 MACD histogram with 23.6% Fibonacci breakout trigger.'}
                  </p>
                </div>

                <div className="bg-zinc-900/70 p-3 rounded-lg border border-zinc-800 space-y-1">
                  <div className="text-amber-400 font-bold text-[11px] font-mono flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Exit Model Execution Reason:</span>
                  </div>
                  <p className="text-zinc-300 font-sans text-xs leading-relaxed">
                    {selectedEntryForView.macdExitModelReason || 'Exit executed according to target levels and ATR risk parameters.'}
                  </p>
                </div>
              </div>
            </div>

            {/* Screenshots Display */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {selectedEntryForView.entryScreenshotUrl && (
                <div className="space-y-1">
                  <span className="text-xs text-zinc-400 font-mono block">Entry Setup Chart</span>
                  <div className="rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950">
                    <img
                      src={selectedEntryForView.entryScreenshotUrl}
                      alt="Entry Chart"
                      className="w-full h-auto object-cover max-h-64"
                    />
                  </div>
                </div>
              )}

              {selectedEntryForView.exitScreenshotUrl && (
                <div className="space-y-1">
                  <span className="text-xs text-zinc-400 font-mono block">Exit Execution Chart</span>
                  <div className="rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950">
                    <img
                      src={selectedEntryForView.exitScreenshotUrl}
                      alt="Exit Chart"
                      className="w-full h-auto object-cover max-h-64"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Notes & Tags */}
            <div className="space-y-2 text-xs">
              <strong className="text-white block font-semibold">Execution Diary & Performance Notes:</strong>
              <p className="p-4 bg-zinc-950 rounded-xl border border-zinc-800 text-zinc-200 leading-relaxed">
                {selectedEntryForView.notes || 'No detailed notes logged for this setup.'}
              </p>
            </div>

            <div className="flex items-center space-x-3 pt-2">
              {selectedEntryForView.status === 'OPEN' && (
                <button
                  onClick={() => handleOpenCloseTrade(selectedEntryForView)}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg text-xs transition flex items-center justify-center space-x-1.5 shadow-md shadow-emerald-600/20"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Close This Position</span>
                </button>
              )}
              <button
                onClick={() => setSelectedEntryForView(null)}
                className="flex-1 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-xs font-medium transition"
              >
                Close Record
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CLOSE TRADE MODAL */}
      {entryToClose && (() => {
        const isBull = !entryToClose.setupType.includes('BEAR');
        const calcPnl = isBull
          ? (closeExitPrice - entryToClose.entryPrice) * entryToClose.quantity
          : (entryToClose.entryPrice - closeExitPrice) * entryToClose.quantity;
        const calcPnlPct = entryToClose.entryPrice > 0
          ? isBull
            ? ((closeExitPrice - entryToClose.entryPrice) / entryToClose.entryPrice) * 100
            : ((entryToClose.entryPrice - closeExitPrice) / entryToClose.entryPrice) * 100
          : 0;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in">
            <form
              onSubmit={handleConfirmCloseTrade}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl relative overflow-y-auto max-h-[90vh]"
            >
              <button
                type="button"
                onClick={() => setEntryToClose(null)}
                className="absolute top-5 right-5 text-zinc-400 hover:text-white p-1 rounded-lg bg-zinc-800"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center space-x-2 pb-2 border-b border-zinc-800">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="font-bold text-white text-base">Close Trade Position</h3>
                  <p className="text-xs text-zinc-400 font-mono">
                    {entryToClose.symbol} &bull; {entryToClose.companyName || 'Stock'} &bull; {entryToClose.setupType.replace('_', ' ')}
                  </p>
                </div>
              </div>

              {/* Trade Baseline Specs */}
              <div className="grid grid-cols-3 gap-2 text-xs font-mono bg-zinc-950 p-3 rounded-xl border border-zinc-800">
                <div>
                  <span className="text-[10px] text-zinc-500 block">Entry Price</span>
                  <span className="font-bold text-white">${entryToClose.entryPrice.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-zinc-500 block">Position Size</span>
                  <span className="font-bold text-white">{entryToClose.quantity} units</span>
                </div>
                <div>
                  <span className="text-[10px] text-zinc-500 block">Stop Loss</span>
                  <span className="font-bold text-rose-400">${entryToClose.stopLoss.toFixed(2)}</span>
                </div>
              </div>

              {/* Form Inputs */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="text-zinc-300 block mb-1 font-medium font-sans">
                    Exit Price ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={closeExitPrice}
                    onChange={(e) => {
                      const newPrice = Number(e.target.value);
                      setCloseExitPrice(newPrice);
                      const isWinning = isBull ? newPrice >= entryToClose.entryPrice : newPrice <= entryToClose.entryPrice;
                      setCloseStatus(isWinning ? 'CLOSED_WIN' : 'CLOSED_LOSS');
                    }}
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-white font-mono focus:outline-none focus:border-emerald-500 font-bold text-sm"
                  />
                </div>

                <div>
                  <label className="text-zinc-300 block mb-1 font-medium font-sans">
                    Exit Date
                  </label>
                  <input
                    type="date"
                    required
                    value={closeExitDate}
                    onChange={(e) => setCloseExitDate(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-white font-mono focus:outline-none focus:border-emerald-500 text-xs"
                  />
                </div>
              </div>

              {/* Live Realized P&L Preview */}
              <div
                className={`p-3.5 rounded-xl border font-mono text-xs space-y-1 ${
                  calcPnl >= 0
                    ? 'bg-emerald-950/20 border-emerald-500/30'
                    : 'bg-rose-950/20 border-rose-500/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400 font-sans text-[11px]">Realized Profit / Loss:</span>
                  <span
                    className={`font-bold text-base ${
                      calcPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {calcPnl >= 0 ? '+' : ''}${calcPnl.toFixed(2)} ({calcPnlPct >= 0 ? '+' : ''}{calcPnlPct.toFixed(2)}%)
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] pt-1 border-t border-zinc-800/80">
                  <span className="text-zinc-500 font-sans">Outcome Classification:</span>
                  <span
                    className={`font-bold ${
                      closeStatus === 'CLOSED_WIN'
                        ? 'text-emerald-400'
                        : closeStatus === 'CLOSED_LOSS'
                        ? 'text-rose-400'
                        : 'text-zinc-300'
                    }`}
                  >
                    {closeStatus.replace('_', ' ')}
                  </span>
                </div>
              </div>

              {/* Outcome Status Selector */}
              <div className="text-xs">
                <label className="text-zinc-300 block mb-1 font-medium">Outcome Status</label>
                <select
                  value={closeStatus}
                  onChange={(e) => setCloseStatus(e.target.value as any)}
                  className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-white font-medium focus:outline-none focus:border-emerald-500"
                >
                  <option value="CLOSED_WIN">Closed Win (Profit Target Hit)</option>
                  <option value="CLOSED_LOSS">Closed Loss (Stopped Out)</option>
                  <option value="BREAKEVEN">Breakeven Exit</option>
                </select>
              </div>

              {/* Exit Chart Screenshot Upload */}
              <div className="text-xs pt-1 border-t border-zinc-800">
                <label className="text-zinc-300 block mb-1 font-medium">
                  Attach Exit Chart Screenshot (Optional)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleImageUpload(e, 'exit')}
                  className="text-[11px] text-zinc-400 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-zinc-800 file:text-white hover:file:bg-zinc-700 cursor-pointer"
                />
              </div>

              {/* Closing Notes */}
              <div className="text-xs">
                <label className="text-zinc-300 block mb-1 font-medium">
                  Closing Notes & Retrospective
                </label>
                <textarea
                  rows={3}
                  value={closeNotes}
                  onChange={(e) => setCloseNotes(e.target.value)}
                  placeholder="Reason for closing (target hit, trailing stop trigger, discipline check)..."
                  className="w-full p-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEntryToClose(null)}
                  className="px-4 py-2 text-xs text-zinc-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-lg shadow-md shadow-emerald-600/20 transition flex items-center space-x-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Confirm &amp; Close Trade</span>
                </button>
              </div>
            </form>
          </div>
        );
      })()}
        </>
      )}
    </div>
  );
};
