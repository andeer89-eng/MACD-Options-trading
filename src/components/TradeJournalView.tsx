import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
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
  BarChart3,
  RefreshCw,
} from 'lucide-react';
import {
  JournalEntry,
  JournalStats,
  loadJournalEntries,
  saveJournalEntries,
  loadJournalEntriesFromFirestore,
  mergeJournalEntries,
  createJournalEntryInFirestore,
  updateJournalEntryInFirestore,
  deleteJournalEntryFromFirestore,
  calculateJournalStats,
  exportJournalToCSV,
  downloadCSV,
  enrichJournalEntryAnalytics,
  purgeLegacySeededDemoEntries,
} from '../utils/tradeJournal';
import { parseBrokerCsvToJournalEntries } from '../utils/csvJournalImport';
import { syncAlpacaOverviewToLocalJournal } from '../hooks/useAlpacaPaper';
import { fetchJsonSafe } from '../utils/safeFetchJson';
import {
  loadAuditLedger,
  verifyAuditChain,
  exportAuditLedgerJSON,
  AuditChainVerification,
} from '../utils/auditLedger';
import { useAuth } from '../lib/AuthProvider';
import { AutomatedPortfolioManager } from './AutomatedPortfolioManager';
import { OptionsAutomatedPortfolioManager } from './OptionsAutomatedPortfolioManager';
import { BacktesterView } from './BacktesterView';
import { computeJournalRuleAttribution } from '../utils/tradeAttribution';

export type JournalSubTab = 'automated' | 'options' | 'manual' | 'backtester';

interface TradeJournalViewProps {
  onSelectSymbolForChart: (sym: string) => void;
  scannerResults?: any[];
  requestedSubTab?: JournalSubTab;
}

export const TradeJournalView: React.FC<TradeJournalViewProps> = ({
  onSelectSymbolForChart,
  scannerResults = [],
  requestedSubTab,
}) => {
  const { user } = useAuth();
  const [journalTab, setJournalTab] = useState<JournalSubTab>(requestedSubTab || 'automated');

  useEffect(() => {
    if (requestedSubTab) {
      setJournalTab(requestedSubTab);
    }
  }, [requestedSubTab]);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'OPEN' | 'CLOSED_WIN' | 'CLOSED_LOSS'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [showLogModal, setShowLogModal] = useState(false);
  const [selectedEntryForView, setSelectedEntryForView] = useState<JournalEntry | null>(null);
  const [expandedJournalIds, setExpandedJournalIds] = useState<Set<string>>(new Set());
  const journalScrollRef = useRef<HTMLDivElement>(null);

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
  const [isClosingOnAlpaca, setIsClosingOnAlpaca] = useState<boolean>(false);
  const [closeTradeError, setCloseTradeError] = useState<string | null>(null);
  const [exportToast, setExportToast] = useState<string | null>(null);
  const [isSyncingAlpaca, setIsSyncingAlpaca] = useState<boolean>(false);
  const [alpacaSyncStatus, setAlpacaSyncStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');
  const [auditVerification, setAuditVerification] = useState<AuditChainVerification>(() =>
    verifyAuditChain(loadAuditLedger())
  );

  useEffect(() => {
    const refreshAudit = () => setAuditVerification(verifyAuditChain(loadAuditLedger()));
    window.addEventListener('trullas-audit-ledger-updated', refreshAudit);
    return () => window.removeEventListener('trullas-audit-ledger-updated', refreshAudit);
  }, []);

  const handleExportAuditChain = () => {
    const chain = loadAuditLedger();
    const json = exportAuditLedgerJSON(chain);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stageledger_audit_chain_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    const check = verifyAuditChain(chain);
    setAuditVerification(check);
    setExportToast(
      `Exported ${chain.length} hash-chained audit events (Integrity: ${check.valid ? 'VERIFIED' : 'BROKEN'}).`
    );
    setTimeout(() => setExportToast(null), 5000);
  };

  // 1-Click CSV Import Modal State
  const [showCsvImportModal, setShowCsvImportModal] = useState(false);
  const [csvImportText, setCsvImportText] = useState('');

  const handleSyncAlpacaPaper = async (silent: boolean = false) => {
    if (!silent) setIsSyncingAlpaca(true);
    try {
      const resp = await fetchJsonSafe<any>('/api/alpaca/overview');
      const data = resp.ok ? resp.data : null;
      if (!data?.configured || !data?.account) {
        setAlpacaSyncStatus('disconnected');
        if (!silent) {
          setExportToast(
            data?.message ||
              resp.error ||
              'Alpaca Paper is not configured. Set APCA_API_KEY_ID and APCA_API_SECRET_KEY in server .env.'
          );
          setTimeout(() => setExportToast(null), 5000);
        }
        return;
      }
      setAlpacaSyncStatus('connected');
      const syncResult = syncAlpacaOverviewToLocalJournal(data);
      setEntries(syncResult.entries);
      if (!silent || syncResult.addedCount > 0 || syncResult.updatedCount > 0) {
        setExportToast(
          `Synced Alpaca Paper history: ${syncResult.addedCount} added, ${syncResult.updatedCount} updated (${syncResult.totalAlpacaEntries} total Alpaca records).`
        );
        setTimeout(() => setExportToast(null), 5000);
      }
    } catch {
      setAlpacaSyncStatus('disconnected');
      if (!silent) {
        setExportToast('Unable to reach /api/alpaca/overview to sync Alpaca Paper trades.');
        setTimeout(() => setExportToast(null), 4500);
      }
    } finally {
      if (!silent) setIsSyncingAlpaca(false);
    }
  };

  const parsedCsvPreview = useMemo(() => {
    if (!csvImportText.trim()) return null;
    return parseBrokerCsvToJournalEntries(csvImportText);
  }, [csvImportText]);

  const handleCsvFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCsvImportText(reader.result);
      }
    };
    reader.readAsText(file);
  };

  const handleConfirmCsvImport = () => {
    if (!parsedCsvPreview || parsedCsvPreview.entries.length === 0) return;
    const enriched = parsedCsvPreview.entries.map(enrichJournalEntryAnalytics);
    const updated = [...enriched, ...entries];
    updateEntriesState(updated);
    if (user) {
      enriched.forEach((entry) => {
        createJournalEntryInFirestore(entry).catch((err) =>
          console.warn('Firestore CSV import create failed:', err)
        );
      });
    }
    setShowCsvImportModal(false);
    setCsvImportText('');
    setExportToast(`Imported ${enriched.length} trades from CSV into your active ledger.`);
    setTimeout(() => setExportToast(null), 4500);
  };

  const handleExportCSV = (entriesToExport: JournalEntry[] = entries) => {
    if (entriesToExport.length === 0) {
      setExportToast('No logged trade records to export.');
      setTimeout(() => setExportToast(null), 3500);
      return;
    }
    const csvData = exportJournalToCSV(entriesToExport);
    const dateStamp = new Date().toISOString().slice(0, 10);
    const fileName = `stageledger_trade_journal_${dateStamp}.csv`;
    downloadCSV(csvData, fileName);
    setExportToast(`Exported ${entriesToExport.length} trade records to ${fileName} for external auditing.`);
    setTimeout(() => setExportToast(null), 4500);
  };

  const handleOpenCloseTrade = (entry: JournalEntry) => {
    setEntryToClose(entry);
    setCloseTradeError(null);
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

  const handleConfirmCloseTrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entryToClose) return;
    setCloseTradeError(null);

    const isAlpacaEntry =
      entryToClose.epochId === 'alpaca-paper' || entryToClose.tags.includes('Alpaca Paper');

    if (isAlpacaEntry) {
      setIsClosingOnAlpaca(true);
      try {
        const qs = new URLSearchParams();
        if (entryToClose.quantity > 0) {
          qs.set('qty', String(entryToClose.quantity));
        }
        const suffix = qs.toString() ? `?${qs.toString()}` : '';
        const resp = await fetchJsonSafe<{ order?: any; error?: string }>(
          `/api/alpaca/positions/${encodeURIComponent(entryToClose.symbol)}${suffix}`,
          {
            method: 'DELETE',
            retryOnHtml: false,
          }
        );
        if (!resp.ok) {
          setCloseTradeError(
            resp.error || `Alpaca Paper close failed (HTTP ${resp.status}). Position remains open.`
          );
          return;
        }
        await handleSyncAlpacaPaper(false);
        setExportToast(
          `Submitted Alpaca Paper close for ${entryToClose.quantity} ${entryToClose.symbol} and synced Local Trade Journal.`
        );
        setTimeout(() => setExportToast(null), 5000);
        setEntryToClose(null);
        if (selectedEntryForView?.id === entryToClose.id) {
          setSelectedEntryForView(null);
        }
      } catch (err: any) {
        setCloseTradeError(err?.message || 'Unable to close position on Alpaca Paper.');
      } finally {
        setIsClosingOnAlpaca(false);
      }
      return;
    }

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
    if (user) {
      updateJournalEntryInFirestore(entryToClose.id, {
        status: closeStatus,
        exitDate: closeExitDate,
        exitPrice: Number(closeExitPrice),
        realizedPnL: Number(pnl.toFixed(2)),
        pnlPercent: Number(pnlPct.toFixed(2)),
        notes: closeNotes.trim(),
      }).catch((err) => console.warn('Firestore update failed:', err));
    }
    setEntryToClose(null);
    if (selectedEntryForView?.id === entryToClose.id) {
      setSelectedEntryForView(null);
    }
  };

  useEffect(() => {
    let active = true;
    const localEntries = loadJournalEntries();
    setEntries(localEntries);

    if (user) {
      loadJournalEntriesFromFirestore()
        .then((remote) => {
          if (!active) return;
          if (remote.length > 0) {
            const { cleaned } = purgeLegacySeededDemoEntries(mergeJournalEntries(localEntries, remote));
            setEntries(cleaned);
            saveJournalEntries(cleaned);
          }
        })
        .catch((err) => console.warn('Failed to load Firestore journal entries:', err));
    }
    const handleJournalUpdated = () => {
      if (!active) return;
      setEntries(loadJournalEntries());
    };
    window.addEventListener('trullas-journal-updated', handleJournalUpdated);

    // Silent Alpaca Paper sync on mount & every 30s while viewing Local Trade Journal
    handleSyncAlpacaPaper(true);
    const pollId = setInterval(() => {
      handleSyncAlpacaPaper(true);
    }, 30000);

    return () => {
      active = false;
      clearInterval(pollId);
      window.removeEventListener('trullas-journal-updated', handleJournalUpdated);
    };
  }, [user]);

  // Ledger Scope Selection (Active, Alpaca Paper Only, or Archived)
  const [selectedEpoch, setSelectedEpoch] = useState<'active' | 'alpaca-paper' | 'legacy-50k'>('active');

  const hasLegacyEntries = useMemo(() => entries.some((e) => e.epochId === 'legacy-50k'), [entries]);
  const nonAlpacaActiveCount = useMemo(
    () =>
      entries.filter(
        (e) =>
          e.epochId !== 'legacy-50k' &&
          e.epochId !== 'alpaca-paper' &&
          !e.tags.includes('Alpaca Paper')
      ).length,
    [entries]
  );

  const updateEntriesState = (updated: JournalEntry[]) => {
    setEntries(updated);
    saveJournalEntries(updated);
  };

  const handleClearNonAlpacaEntries = () => {
    const toRemove = entries.filter(
      (e) =>
        e.epochId !== 'legacy-50k' &&
        e.epochId !== 'alpaca-paper' &&
        !e.tags.includes('Alpaca Paper')
    );
    if (toRemove.length === 0) return;
    const removeIds = new Set(toRemove.map((e) => e.id));
    const remaining = entries.filter((e) => !removeIds.has(e.id));
    updateEntriesState(remaining);
    if (user) {
      toRemove.forEach((e) => {
        deleteJournalEntryFromFirestore(e.id).catch((err) =>
          console.warn('Firestore cleanup delete failed:', err)
        );
      });
    }
    setExportToast(`Cleared ${toRemove.length} non-Alpaca journal ${toRemove.length === 1 ? 'entry' : 'entries'}.`);
    setTimeout(() => setExportToast(null), 4000);
  };

  const epochEntries = useMemo(() => {
    return entries.filter((e) => {
      if (selectedEpoch === 'legacy-50k') {
        return e.epochId === 'legacy-50k';
      }
      if (selectedEpoch === 'alpaca-paper') {
        return e.epochId === 'alpaca-paper' || e.tags.includes('Alpaca Paper');
      }
      return e.epochId !== 'legacy-50k';
    });
  }, [entries, selectedEpoch]);

  const stats: JournalStats = useMemo(() => {
    return calculateJournalStats(epochEntries);
  }, [epochEntries]);

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
      id: `journal-${Date.now()}-${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Date.now().toString(36)}`,
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
    if (user) {
      createJournalEntryInFirestore(newEntry).catch((err) =>
        console.warn('Firestore create failed:', err)
      );
    }
    setShowLogModal(false);

    // Reset Form
    setFormNotes('');
    setFormEntryScreenshot('');
    setFormExitScreenshot('');
  };

  const handleDeleteEntry = (id: string) => {
    const updated = entries.filter((e) => e.id !== id);
    updateEntriesState(updated);
    if (user) {
      deleteJournalEntryFromFirestore(id).catch((err) =>
        console.warn('Firestore delete failed:', err)
      );
    }
    if (selectedEntryForView?.id === id) setSelectedEntryForView(null);
  };

  const journalAttribution = useMemo(
    () => computeJournalRuleAttribution(epochEntries),
    [epochEntries]
  );

  // Filtered List for active epoch
  const filteredEntries = useMemo(() => {
    return epochEntries.filter((item) => {
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
  }, [epochEntries, activeFilter, searchQuery]);

  const journalVirtualizer = useVirtualizer({
    count: filteredEntries.length,
    getScrollElement: () => journalScrollRef.current,
    estimateSize: () => 56,
    overscan: 8,
  });

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
            <span>Stocks Auto-Bot (Alpaca Paper)</span>
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
              <span>Options Auto-Bot (Alpaca Paper)</span>
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
            <span>Local Trade Journal ({entries.length})</span>
          </button>

          <button
            onClick={() => setJournalTab('backtester')}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition ${
              journalTab === 'backtester'
                ? 'bg-teal-600 text-white shadow-lg shadow-teal-600/30'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Strategy Backtester</span>
          </button>
        </div>

        <div className="flex items-center space-x-3 px-3 text-xs text-zinc-400 font-mono">
          <span>
            {journalTab === 'options'
              ? 'Alpaca Paper Options & Golden Zone'
              : journalTab === 'automated'
              ? 'Alpaca Paper 4-Pillars Equity Engine'
              : journalTab === 'backtester'
              ? 'Historical Multi-Asset Backtest'
              : 'Alpaca Paper Sync & Local Trade Journal'}
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
      ) : journalTab === 'backtester' ? (
        <BacktesterView onSelectSymbolForChart={onSelectSymbolForChart} />
      ) : (
        <>
          {/* Header Banner */}
          <div className="bg-gradient-to-r from-zinc-900 via-zinc-900 to-zinc-950 border border-zinc-800 rounded-2xl p-6 sm:p-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium mb-3">
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>Alpaca Paper Sync &amp; Execution Ledger</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                  Local Trade Journal &amp; Performance Ledger
                </h1>
                <p className="mt-2 text-sm text-zinc-400 max-w-2xl leading-relaxed">
                  Automatically records every Alpaca Paper stock and option trade alongside your manual setups, screenshots, R-multiples, and CSV exports.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                <button
                  onClick={() => handleSyncAlpacaPaper(false)}
                  disabled={isSyncingAlpaca}
                  data-testid="sync-alpaca-journal-btn"
                  className="flex items-center space-x-2 px-3.5 py-2.5 bg-indigo-600/90 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-sm transition whitespace-nowrap"
                  title="Sync real fills and open positions from your Alpaca Paper account into the local journal"
                >
                  <RefreshCw className={`w-4 h-4 ${isSyncingAlpaca ? 'animate-spin' : ''}`} />
                  <span>{isSyncingAlpaca ? 'Syncing Alpaca...' : 'Sync Alpaca Paper'}</span>
                </button>

                <button
                  onClick={() => setShowCsvImportModal(true)}
                  data-testid="open-csv-import-btn"
                  className="flex items-center space-x-2 px-3.5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white border border-zinc-700 rounded-lg text-xs font-semibold shadow-sm transition whitespace-nowrap"
                  title="Import broker or TradingView trade export CSV into your journal"
                >
                  <Upload className="w-4 h-4 text-sky-400" />
                  <span>Import CSV</span>
                </button>

                <button
                  onClick={() => handleExportCSV(entries)}
                  data-testid="export-journal-csv-btn"
                  className="flex items-center space-x-2 px-3.5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white border border-zinc-700 rounded-lg text-xs font-semibold shadow-sm transition whitespace-nowrap"
                  title="Export complete logged trade history to CSV file for external performance auditing"
                >
                  <Download className="w-4 h-4 text-emerald-400" />
                  <span>Export CSV</span>
                </button>

                <button
                  onClick={() => setShowLogModal(true)}
                  className="flex items-center space-x-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-md shadow-emerald-600/20 transition whitespace-nowrap"
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

        {/* LEDGER SCOPE SELECTOR */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4 bg-zinc-950/80 border border-zinc-800 p-2.5 rounded-xl">
          <div className="flex items-center space-x-2">
            <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Journal Ledger:</span>
            <div className="flex bg-zinc-900 p-0.5 rounded-lg border border-zinc-800 text-xs">
              <button
                onClick={() => setSelectedEpoch('active')}
                className={`px-3 py-1 rounded-md font-semibold transition ${
                  selectedEpoch === 'active'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Active Journal ({entries.filter((e) => e.epochId !== 'legacy-50k').length})
              </button>
              <button
                onClick={() => setSelectedEpoch('alpaca-paper')}
                className={`px-3 py-1 rounded-md font-semibold transition ${
                  selectedEpoch === 'alpaca-paper'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Alpaca Paper Only ({entries.filter((e) => e.epochId === 'alpaca-paper' || e.tags.includes('Alpaca Paper')).length})
              </button>
              {hasLegacyEntries && (
                <button
                  onClick={() => setSelectedEpoch('legacy-50k')}
                  className={`px-3 py-1 rounded-md font-semibold transition flex items-center space-x-1.5 ${
                    selectedEpoch === 'legacy-50k'
                      ? 'bg-zinc-800 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <span>Archived ({entries.filter((e) => e.epochId === 'legacy-50k').length})</span>
                </button>
              )}
            </div>
            {nonAlpacaActiveCount > 0 && (
              <button
                type="button"
                data-testid="clear-non-alpaca-btn"
                onClick={handleClearNonAlpacaEntries}
                className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 transition"
                title="Remove non-Alpaca manual or legacy entries so Active Journal matches Alpaca Paper history"
              >
                Clear Non-Alpaca ({nonAlpacaActiveCount})
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-400 font-mono">
            <span>as of {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' })} ET</span>
            <span
              className={`px-2 py-0.5 rounded border font-bold ${
                alpacaSyncStatus === 'connected'
                  ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30'
                  : alpacaSyncStatus === 'disconnected'
                  ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                  : 'bg-zinc-800 text-zinc-400 border-zinc-700'
              }`}
            >
              {alpacaSyncStatus === 'connected'
                ? 'ALPACA PAPER SYNCED'
                : alpacaSyncStatus === 'disconnected'
                ? 'ALPACA PAPER DISCONNECTED'
                : 'ALPACA CHECKING...'}
            </span>
            <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-bold">
              {user ? 'CLOUD SYNC: FIRESTORE' : 'LOCAL LEDGER'}
            </span>
            <button
              type="button"
              onClick={handleExportAuditChain}
              data-testid="audit-chain-badge"
              title={`Tamper-evident hash chain (${auditVerification.length} events, head ${auditVerification.headHash.slice(0, 8)}). Click to verify & export JSON.`}
              className={`px-2 py-0.5 rounded border font-bold inline-flex items-center gap-1 transition cursor-pointer ${
                auditVerification.valid
                  ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20'
                  : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
              }`}
            >
              <ShieldCheck className="w-3 h-3" />
              <span>
                {auditVerification.valid
                  ? `AUDIT CHAIN (${auditVerification.length})`
                  : `CHAIN ALERT #${auditVerification.brokenAtSequence ?? '?'}`}
              </span>
            </button>
          </div>
        </div>

        {/* PERFORMANCE STATS HUD */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 mb-6 bg-zinc-900 border border-zinc-800 p-4 rounded-2xl shadow-inner font-mono">
          <div className="border-r border-zinc-800 pr-2">
            <span className="text-[10px] text-zinc-400 block font-sans uppercase">Total Realized P&L</span>
            <div className="text-xl font-bold mt-1">
              <span className={stats.totalRealizedPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                {stats.totalRealizedPnL >= 0 ? '+' : ''}${stats.totalRealizedPnL.toLocaleString()}
              </span>
            </div>
            <span className="text-[10px] text-zinc-500 block mt-0.5 font-sans">
              n = {stats.closedTrades} trades
            </span>
          </div>

          <div className="border-r border-zinc-800 pr-2">
            <span className="text-[10px] text-zinc-400 block font-sans uppercase">Win Rate</span>
            <div className="text-xl font-bold text-white mt-1">
              {stats.winRatePct}%
            </div>
            <span className="text-[10px] text-zinc-400 block mt-0.5 font-sans">
              CI90: [{stats.ci90WinRate[0]}%, {stats.ci90WinRate[1]}%]
            </span>
          </div>

          <div className="border-r border-zinc-800 pr-2">
            <span className="text-[10px] text-zinc-400 block font-sans uppercase">Profit Factor</span>
            <div className={`text-xl font-bold mt-1 ${stats.profitFactorValid ? 'text-indigo-400' : 'text-zinc-500'}`}>
              {stats.profitFactorDisplay}
            </div>
            <span className="text-[10px] text-zinc-500 block mt-0.5 font-sans">
              {stats.profitFactorValid ? 'Audited' : 'Min n ≥ 10 req'}
            </span>
          </div>

          <div className="border-r border-zinc-800 pr-2">
            <span className="text-[10px] text-zinc-400 block font-sans uppercase">Trades (n / n_eff)</span>
            <div className="text-xl font-bold text-white mt-1">
              {stats.closedTrades} <span className="text-xs font-normal text-zinc-400">/ {stats.effectiveDays}d</span>
            </div>
            <span className="text-[10px] text-zinc-500 block mt-0.5 font-sans">
              {stats.openTrades} open
            </span>
          </div>

          <div className="border-r border-zinc-800 pr-2">
            <span className="text-[10px] text-zinc-400 block font-sans uppercase">Avg Win</span>
            <div className="text-xl font-bold text-emerald-400 mt-1">+${stats.averageWinPnL}</div>
            <span className="text-[10px] text-zinc-500 block mt-0.5 font-sans">
              {stats.winningTrades} wins
            </span>
          </div>

          <div>
            <span className="text-[10px] text-zinc-400 block font-sans uppercase">Avg Loss</span>
            <div className="text-xl font-bold text-rose-400 mt-1">-${stats.averageLossPnL}</div>
            <span className="text-[10px] text-zinc-500 block mt-0.5 font-sans">
              {stats.losingTrades} losses
            </span>
          </div>
        </div>

        {/* Setup Attribution & Excursion Summary */}
        {journalAttribution.closedTrades > 0 && (
          <div
            data-testid="journal-setup-attribution"
            className="mt-4 bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2.5"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-zinc-200">
                Setup Attribution &amp; Excursion Audit ({journalAttribution.closedTrades} closed)
              </span>
              <div className="font-mono tabular-nums text-zinc-400">
                {journalAttribution.avgMfePct !== null && (
                  <span className="text-emerald-400">Avg MFE +{journalAttribution.avgMfePct}%</span>
                )}
                {journalAttribution.avgMfePct !== null && journalAttribution.avgMaePct !== null && ' · '}
                {journalAttribution.avgMaePct !== null && (
                  <span className="text-rose-400">Avg MAE -{journalAttribution.avgMaePct}%</span>
                )}
              </div>
            </div>
            <div className="overflow-x-auto border border-zinc-800/80 rounded-lg bg-zinc-950/60">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-zinc-800 text-[10px] uppercase tracking-wider text-zinc-400">
                  <tr>
                    <th className="py-2 px-3">Setup / Rule</th>
                    <th className="py-2 px-3 text-right">Trades</th>
                    <th className="py-2 px-3 text-right">Win Rate</th>
                    <th className="py-2 px-3 text-right">Avg R</th>
                    <th className="py-2 px-3 text-right">Expectancy</th>
                    <th className="py-2 px-3 text-right">Net P&amp;L</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 font-mono tabular-nums">
                  {journalAttribution.bySetup.map((row) => (
                    <tr key={row.rule}>
                      <td className="py-1.5 px-3 text-zinc-200 font-semibold">{row.rule}</td>
                      <td className="py-1.5 px-3 text-right text-zinc-300">
                        {row.trades}
                        {!row.sampleSufficient && (
                          <span className="text-[10px] text-zinc-500 ml-1">(n&lt;10)</span>
                        )}
                      </td>
                      <td className="py-1.5 px-3 text-right text-zinc-200">{row.winRatePct.toFixed(1)}%</td>
                      <td className="py-1.5 px-3 text-right text-amber-400">
                        {row.avgRealizedR !== null
                          ? `${row.avgRealizedR >= 0 ? '+' : ''}${row.avgRealizedR.toFixed(2)}R`
                          : '—'}
                      </td>
                      <td
                        className={`py-1.5 px-3 text-right ${
                          row.expectancyDollars >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {row.expectancyDollars >= 0 ? '+' : '-'}${Math.abs(row.expectancyDollars).toFixed(2)}
                      </td>
                      <td
                        className={`py-1.5 px-3 text-right font-bold ${
                          row.netPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {row.netPnl >= 0 ? '+' : '-'}${Math.abs(row.netPnl).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

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

          <div ref={journalScrollRef} className="overflow-x-auto max-h-[680px] overflow-y-auto">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-zinc-950">
                <tr className="border-b border-zinc-800 bg-zinc-950/95 text-[11px] font-mono text-zinc-400 uppercase tracking-wider select-none">
                  <th className="py-3 px-3 w-8 text-center"></th>
                  <th className="py-3 px-3 font-semibold text-zinc-300">Entry Date</th>
                  <th className="py-3 px-3 font-semibold text-zinc-300">Duration</th>
                  <th className="py-3 px-3 font-semibold text-zinc-300 text-right">MFE %</th>
                  <th className="py-3 px-3 font-semibold text-zinc-300 text-right">MAE %</th>
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
                {(() => {
                  const vItems = journalVirtualizer.getVirtualItems();
                  const paddingTop = vItems.length > 0 ? vItems[0].start : 0;
                  const paddingBottom =
                    vItems.length > 0
                      ? Math.max(0, journalVirtualizer.getTotalSize() - vItems[vItems.length - 1].end)
                      : 0;
                  return (
                    <>
                      {paddingTop > 0 && (
                        <tr aria-hidden="true">
                          <td colSpan={16} style={{ height: `${paddingTop}px`, padding: 0, border: 0 }} />
                        </tr>
                      )}
                      {vItems.map((virtualRow) => {
                        const item = filteredEntries[virtualRow.index];
                        if (!item) return null;
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

                        {/* Entry Date */}
                        <td className="py-3 px-3">
                          <div className="font-bold text-white font-mono">{item.entryDate}</div>
                        </td>

                        {/* Duration */}
                        <td className="py-3 px-3">
                          <div className="text-zinc-300 font-mono">
                            {item.tradeDurationDays || 1}d
                          </div>
                        </td>

                        {/* MFE */}
                        <td className="py-3 px-3 text-right">
                          <div className="text-emerald-400 font-bold font-mono">
                            {item.maxFavorableExcursionPct !== undefined ? `+${item.maxFavorableExcursionPct}%` : '—'}
                          </div>
                        </td>

                        {/* MAE */}
                        <td className="py-3 px-3 text-right">
                          <div className="text-rose-400 font-bold font-mono">
                            {item.drawdownFromPeakPct !== undefined ? `${item.drawdownFromPeakPct}%` : '—'}
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
                          <td colSpan={16} className="p-5">
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
                                    StageLedger 4-Pillars Framework
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
                      {paddingBottom > 0 && (
                        <tr aria-hidden="true">
                          <td colSpan={16} style={{ height: `${paddingBottom}px`, padding: 0, border: 0 }} />
                        </tr>
                      )}
                    </>
                  );
                })()}
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

              {(entryToClose.epochId === 'alpaca-paper' || entryToClose.tags.includes('Alpaca Paper')) && (
                <div className="p-3 rounded-xl bg-indigo-950/40 border border-indigo-500/40 text-xs text-indigo-200 leading-relaxed">
                  <strong>Live Alpaca Paper Execution:</strong> Confirming will submit a real{' '}
                  <span className="font-mono text-white">DELETE /api/alpaca/positions/{entryToClose.symbol}?qty={entryToClose.quantity}</span>{' '}
                  close order to Alpaca Paper and sync the filled exit price back into your journal.
                </div>
              )}

              {closeTradeError && (
                <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-500/40 text-xs text-rose-200">
                  {closeTradeError}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEntryToClose(null)}
                  disabled={isClosingOnAlpaca}
                  className="px-4 py-2 text-xs text-zinc-400 hover:text-white disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isClosingOnAlpaca}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-xs rounded-lg shadow-md shadow-emerald-600/20 transition flex items-center space-x-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {isClosingOnAlpaca
                      ? 'Submitting Alpaca Close...'
                      : entryToClose.epochId === 'alpaca-paper' || entryToClose.tags.includes('Alpaca Paper')
                      ? 'Close on Alpaca Paper'
                      : 'Confirm & Close Trade'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        );
      })()}
      {/* 1-CLICK BROKER / TRADINGVIEW CSV IMPORT MODAL */}
      {showCsvImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl relative overflow-y-auto max-h-[90vh]">
            <button
              type="button"
              onClick={() => setShowCsvImportModal(false)}
              aria-label="Close CSV import modal"
              className="absolute top-5 right-5 text-zinc-400 hover:text-white p-1.5 rounded-lg bg-zinc-800"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center space-x-2 pb-2 border-b border-zinc-800">
              <FileSpreadsheet className="w-5 h-5 text-sky-400" />
              <h3 className="font-bold text-white text-base">Import Broker / TradingView CSV</h3>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              Upload a CSV file or paste rows with headers such as <code className="text-zinc-200">Symbol, Side, Entry Date, Exit Date, Quantity, Entry Price, Exit Price, Stop Loss, Target Price, Notes</code>.
              R-multiples and realized P&amp;L are computed deterministically without modifying your existing trades.
            </p>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <label className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg border border-zinc-700 cursor-pointer transition inline-flex items-center space-x-1.5">
                <Upload className="w-3.5 h-3.5 text-sky-400" />
                <span>Choose .CSV File</span>
                <input
                  type="file"
                  accept=".csv,.txt,text/csv"
                  onChange={handleCsvFileUpload}
                  className="hidden"
                />
              </label>
            </div>

            <div>
              <label htmlFor="csv-paste-area" className="text-xs text-zinc-400 block mb-1">
                CSV Data
              </label>
              <textarea
                id="csv-paste-area"
                rows={5}
                value={csvImportText}
                onChange={(e) => setCsvImportText(e.target.value)}
                placeholder="Symbol,Side,Entry Date,Exit Date,Quantity,Entry Price,Exit Price,Stop Loss,Target Price&#10;NVDA,Long,2026-10-08,2026-10-21,20,124.50,136.80,119.20,136.50"
                className="w-full p-3 bg-zinc-950 border border-zinc-800 rounded-xl text-xs font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-sky-500"
              />
            </div>

            {parsedCsvPreview && (
              <div className="space-y-2 bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-white">
                    Preview: {parsedCsvPreview.entries.length} valid trade{parsedCsvPreview.entries.length === 1 ? '' : 's'}
                    {parsedCsvPreview.errors.length > 0 && (
                      <span className="text-rose-400 ml-2">
                        &middot; {parsedCsvPreview.errors.length} skipped row(s)
                      </span>
                    )}
                  </span>
                  <span className="text-[10px] font-mono text-zinc-400">
                    Mapped: {parsedCsvPreview.detectedColumns.slice(0, 5).join(', ')}
                  </span>
                </div>

                {parsedCsvPreview.errors.length > 0 && (
                  <ul className="text-[11px] text-rose-300 space-y-0.5 max-h-20 overflow-y-auto">
                    {parsedCsvPreview.errors.map((err) => (
                      <li key={err.rowNumber}>
                        Row {err.rowNumber}: {err.reason}
                      </li>
                    ))}
                  </ul>
                )}

                {parsedCsvPreview.entries.length > 0 && (
                  <div className="overflow-x-auto max-h-40">
                    <table className="w-full text-left font-mono text-[11px]">
                      <thead>
                        <tr className="text-zinc-400 border-b border-zinc-800">
                          <th className="py-1 pr-2">Date</th>
                          <th className="py-1 pr-2">Symbol</th>
                          <th className="py-1 pr-2">Status</th>
                          <th className="py-1 pr-2 text-right">Qty</th>
                          <th className="py-1 pr-2 text-right">Entry</th>
                          <th className="py-1 text-right">P&amp;L</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-900">
                        {parsedCsvPreview.entries.slice(0, 8).map((row) => (
                          <tr key={row.id}>
                            <td className="py-1 pr-2 text-zinc-300">{row.entryDate}</td>
                            <td className="py-1 pr-2 font-bold text-white">{row.symbol}</td>
                            <td className="py-1 pr-2 text-zinc-300">{row.status}</td>
                            <td className="py-1 pr-2 text-right text-zinc-300">{row.quantity}</td>
                            <td className="py-1 pr-2 text-right text-zinc-300">${row.entryPrice.toFixed(2)}</td>
                            <td className={`py-1 text-right font-bold ${(row.realizedPnL ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {row.realizedPnL !== undefined ? `${row.realizedPnL >= 0 ? '+' : ''}$${row.realizedPnL.toFixed(2)}` : 'OPEN'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setShowCsvImportModal(false)}
                className="px-4 py-2 text-xs text-zinc-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="confirm-csv-import-btn"
                disabled={!parsedCsvPreview || parsedCsvPreview.entries.length === 0}
                onClick={handleConfirmCsvImport}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold text-xs rounded-lg shadow-md transition flex items-center space-x-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Confirm Import ({parsedCsvPreview?.entries.length || 0} Trades)</span>
              </button>
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
};
