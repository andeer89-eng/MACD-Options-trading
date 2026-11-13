import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  collection,
  getDocs,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';

export interface JournalEntry {
  id: string;
  symbol: string;
  companyName?: string;
  setupType: 'BULLISH_TRIPLE' | 'BEARISH_TRIPLE' | 'BULLISH_DOUBLE' | 'BEARISH_DOUBLE' | 'BREAKOUT' | 'CUSTOM';
  timeframe: string;
  status: 'OPEN' | 'CLOSED_WIN' | 'CLOSED_LOSS' | 'BREAKEVEN';
  entryDate: string;
  exitDate?: string;
  entryPrice: number;
  exitPrice?: number;
  stopLoss: number;
  targetPrice: number;
  quantity: number;
  realizedPnL?: number;
  pnlPercent?: number;
  entryScreenshotUrl?: string;
  exitScreenshotUrl?: string;
  notes: string;
  tags: string[];
  executionRating: number;
  createdAt: number;

  // Factual analytics derived strictly from entry/exit values
  tradeDurationDays?: number;
  tradeDurationLabel?: string;
  peakPriceDuringTrade?: number;
  drawdownFromPeakPct?: number;
  maxFavorableExcursionPct?: number;
  macdEntryModelReason?: string;
  macdExitModelReason?: string;
  epochId?: string;
}

export interface JournalStats {
  totalTrades: number;
  openTrades: number;
  closedTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRatePct: number;
  totalRealizedPnL: number;
  averageWinPnL: number;
  averageLossPnL: number;
  profitFactor: number;
  profitFactorValid: boolean;
  profitFactorDisplay: string;
  ci90WinRate: [number, number];
  effectiveDays: number;
  bestTradePnL: number;
  worstTradePnL: number;
}

const STORAGE_KEY = 'trullas_trade_journal_v1';

export function enrichJournalEntryAnalytics(entry: JournalEntry): JournalEntry {
  const start = new Date(entry.entryDate).getTime();
  const end = entry.exitDate ? new Date(entry.exitDate).getTime() : Date.now();
  const durationDays = Number.isFinite(start) && Number.isFinite(end)
    ? Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)))
    : 1;
  const durationLabel = entry.exitDate
    ? `${durationDays} ${durationDays === 1 ? 'Day' : 'Days'}`
    : `${durationDays}d (Active Holding)`;

  const isBull = !entry.setupType.includes('BEAR');
  let maxFavorableExcursionPct = entry.maxFavorableExcursionPct;
  let drawdownFromPeakPct = entry.drawdownFromPeakPct;

  if (
    maxFavorableExcursionPct === undefined &&
    entry.peakPriceDuringTrade !== undefined &&
    entry.entryPrice > 0
  ) {
    maxFavorableExcursionPct = isBull
      ? Number((((entry.peakPriceDuringTrade - entry.entryPrice) / entry.entryPrice) * 100).toFixed(2))
      : Number((((entry.entryPrice - entry.peakPriceDuringTrade) / entry.entryPrice) * 100).toFixed(2));
  }

  if (
    drawdownFromPeakPct === undefined &&
    entry.peakPriceDuringTrade !== undefined &&
    entry.exitPrice !== undefined &&
    entry.peakPriceDuringTrade > 0
  ) {
    const dd = isBull
      ? ((entry.exitPrice - entry.peakPriceDuringTrade) / entry.peakPriceDuringTrade) * 100
      : ((entry.peakPriceDuringTrade - entry.exitPrice) / entry.peakPriceDuringTrade) * 100;
    drawdownFromPeakPct = Number(Math.min(0, dd).toFixed(2));
  }

  return {
    ...entry,
    tradeDurationDays: durationDays,
    tradeDurationLabel: durationLabel,
    maxFavorableExcursionPct,
    drawdownFromPeakPct,
  };
}

function sanitizeFirestoreDocId(rawId: string): string {
  const clean = rawId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  return clean || `entry_${Date.now()}`;
}

function toJournalCreatePayload(entry: JournalEntry, uid: string) {
  const cleanTags = (entry.tags || []).map((t) => t.slice(0, 64)).slice(0, 20);
  const payload: Record<string, any> = {
    ownerId: uid,
    symbol: entry.symbol.toUpperCase().trim().slice(0, 20),
    setupType: entry.setupType.slice(0, 50),
    timeframe: (entry.timeframe || '1d').slice(0, 10),
    status: entry.status,
    entryDate: entry.entryDate.slice(0, 10),
    entryPrice: Number(entry.entryPrice) || 0,
    stopLoss: Number(entry.stopLoss) || 0,
    targetPrice: Number(entry.targetPrice) || 0,
    quantity: Math.max(0.0001, Number(entry.quantity) || 1),
    notes: (entry.notes || '').slice(0, 4000),
    tags: cleanTags,
    executionRating: Math.min(5, Math.max(1, Number(entry.executionRating) || 5)),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (entry.companyName) payload.companyName = entry.companyName.slice(0, 120);
  if (entry.exitDate) payload.exitDate = entry.exitDate.slice(0, 10);
  if (entry.exitPrice !== undefined) payload.exitPrice = Number(entry.exitPrice);
  if (entry.realizedPnL !== undefined) payload.realizedPnL = Number(entry.realizedPnL);
  if (entry.pnlPercent !== undefined) payload.pnlPercent = Number(entry.pnlPercent);
  if (entry.epochId) payload.epochId = entry.epochId.slice(0, 64);

  return payload;
}

export async function loadJournalEntriesFromFirestore(): Promise<JournalEntry[]> {
  const user = auth.currentUser;
  if (!user) return [];
  const colPath = `users/${user.uid}/journalEntries`;
  try {
    const q = query(collection(db, 'users', user.uid, 'journalEntries'), where('ownerId', '==', user.uid));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => {
      const data = d.data() as Record<string, any>;
      const createdAtMs =
        data.createdAt instanceof Timestamp
          ? data.createdAt.toMillis()
          : typeof data.createdAt === 'number'
          ? data.createdAt
          : Date.now();
      return enrichJournalEntryAnalytics({
        id: d.id,
        symbol: data.symbol,
        companyName: data.companyName,
        setupType: data.setupType,
        timeframe: data.timeframe || '1d',
        status: data.status,
        entryDate: data.entryDate,
        exitDate: data.exitDate,
        entryPrice: Number(data.entryPrice) || 0,
        exitPrice: data.exitPrice !== undefined ? Number(data.exitPrice) : undefined,
        stopLoss: Number(data.stopLoss) || 0,
        targetPrice: Number(data.targetPrice) || 0,
        quantity: Number(data.quantity) || 0,
        realizedPnL: data.realizedPnL !== undefined ? Number(data.realizedPnL) : undefined,
        pnlPercent: data.pnlPercent !== undefined ? Number(data.pnlPercent) : undefined,
        notes: data.notes || '',
        tags: Array.isArray(data.tags) ? data.tags : [],
        executionRating: Number(data.executionRating) || 5,
        epochId: data.epochId,
        createdAt: createdAtMs,
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, colPath);
    return [];
  }
}

export async function createJournalEntryInFirestore(entry: JournalEntry): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const docId = sanitizeFirestoreDocId(entry.id);
  const path = `users/${user.uid}/journalEntries/${docId}`;
  try {
    await setDoc(doc(db, 'users', user.uid, 'journalEntries', docId), toJournalCreatePayload(entry, user.uid));
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateJournalEntryInFirestore(
  entryId: string,
  patch: Partial<Pick<JournalEntry, 'status' | 'exitPrice' | 'exitDate' | 'realizedPnL' | 'pnlPercent' | 'notes' | 'tags' | 'executionRating'>>
): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const docId = sanitizeFirestoreDocId(entryId);
  const path = `users/${user.uid}/journalEntries/${docId}`;
  const cleanPatch: Record<string, any> = { updatedAt: serverTimestamp() };
  if (patch.status !== undefined) cleanPatch.status = patch.status;
  if (patch.exitPrice !== undefined) cleanPatch.exitPrice = Number(patch.exitPrice);
  if (patch.exitDate !== undefined) cleanPatch.exitDate = patch.exitDate.slice(0, 10);
  if (patch.realizedPnL !== undefined) cleanPatch.realizedPnL = Number(patch.realizedPnL);
  if (patch.pnlPercent !== undefined) cleanPatch.pnlPercent = Number(patch.pnlPercent);
  if (patch.notes !== undefined) cleanPatch.notes = patch.notes.slice(0, 4000);
  if (patch.tags !== undefined) cleanPatch.tags = patch.tags.map((t) => t.slice(0, 64)).slice(0, 20);
  if (patch.executionRating !== undefined) cleanPatch.executionRating = Math.min(5, Math.max(1, Number(patch.executionRating)));
  try {
    await updateDoc(doc(db, 'users', user.uid, 'journalEntries', docId), cleanPatch);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteJournalEntryFromFirestore(entryId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const docId = sanitizeFirestoreDocId(entryId);
  const path = `users/${user.uid}/journalEntries/${docId}`;
  try {
    await deleteDoc(doc(db, 'users', user.uid, 'journalEntries', docId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function loadJournalEntries(): JournalEntry[] {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.map(enrichJournalEntryAnalytics);
        }
      }
    }
  } catch (err) {
    console.warn('Failed to load trade journal entries from localStorage:', err);
  }
  return [];
}

export function saveJournalEntries(entries: JournalEntry[]): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    }
  } catch (e) {
    console.error('Failed to save trade journal entries:', e);
  }
}

export function calculateJournalStats(entries: JournalEntry[]): JournalStats {
  const totalTrades = entries.length;
  const openTrades = entries.filter((e) => e.status === 'OPEN').length;
  const closed = entries.filter((e) => e.status !== 'OPEN');
  const closedTrades = closed.length;

  const winningTrades = closed.filter((e) => (e.realizedPnL ?? 0) > 0).length;
  const losingTrades = closed.filter((e) => (e.realizedPnL ?? 0) < 0).length;

  const winRatePct = closedTrades > 0 ? Number(((winningTrades / closedTrades) * 100).toFixed(1)) : 0;

  let totalRealizedPnL = 0;
  let totalWinPnL = 0;
  let totalLossPnL = 0;
  let bestTradePnL = -Infinity;
  let worstTradePnL = Infinity;

  for (const item of closed) {
    const pnl = item.realizedPnL ?? 0;
    totalRealizedPnL += pnl;

    if (pnl > 0) {
      totalWinPnL += pnl;
      if (pnl > bestTradePnL) bestTradePnL = pnl;
    } else if (pnl < 0) {
      totalLossPnL += Math.abs(pnl);
      if (pnl < worstTradePnL) worstTradePnL = pnl;
    }
  }

  const averageWinPnL = winningTrades > 0 ? Number((totalWinPnL / winningTrades).toFixed(2)) : 0;
  const averageLossPnL = losingTrades > 0 ? Number((totalLossPnL / losingTrades).toFixed(2)) : 0;

  const profitFactorValid = closedTrades >= 10;
  const profitFactor =
    totalLossPnL > 0
      ? Number((totalWinPnL / totalLossPnL).toFixed(2))
      : totalWinPnL > 0
      ? 99.99
      : 0;

  const profitFactorDisplay = profitFactorValid ? `${profitFactor.toFixed(2)}x` : '—';

  const distinctDates = new Set(closed.map((e) => e.entryDate.split('T')[0]));
  const effectiveDays = distinctDates.size;

  let ci90Low = 0;
  let ci90High = 0;
  if (closedTrades > 0) {
    const p = winningTrades / closedTrades;
    const z = 1.645;
    const se = Math.sqrt((p * (1 - p)) / closedTrades);
    ci90Low = Number(Math.max(0, (p - z * se) * 100).toFixed(1));
    ci90High = Number(Math.min(100, (p + z * se) * 100).toFixed(1));
  }

  return {
    totalTrades,
    openTrades,
    closedTrades,
    winningTrades,
    losingTrades,
    winRatePct,
    totalRealizedPnL: Number(totalRealizedPnL.toFixed(2)),
    averageWinPnL,
    averageLossPnL,
    profitFactor,
    profitFactorValid,
    profitFactorDisplay,
    ci90WinRate: [ci90Low, ci90High],
    effectiveDays,
    bestTradePnL: bestTradePnL === -Infinity ? 0 : Number(bestTradePnL.toFixed(2)),
    worstTradePnL: worstTradePnL === Infinity ? 0 : Number(worstTradePnL.toFixed(2)),
  };
}

function escapeCSVCell(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return '""';
  const str = String(value);
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
}

export function exportJournalToCSV(entries: JournalEntry[]): string {
  const headers = [
    'Trade ID',
    'Symbol',
    'Company Name',
    'Setup Type',
    'Timeframe',
    'Status',
    'Entry Date',
    'Exit Date',
    'Quantity',
    'Entry Price ($)',
    'Exit Price ($)',
    'Stop Loss ($)',
    'Target Price ($)',
    'Realized P&L ($)',
    'Return (%)',
    'Risk/Reward Ratio',
    'Rating (1-5)',
    'Tags',
    'Performance & Audit Notes',
    'Created At',
  ];

  const rows = entries.map((entry) => {
    const risk = Math.abs(entry.entryPrice - entry.stopLoss);
    const reward = Math.abs(entry.targetPrice - entry.entryPrice);
    const rrRatio = risk > 0 ? (reward / risk).toFixed(2) : 'N/A';
    const createdAtIso = entry.createdAt ? new Date(entry.createdAt).toISOString() : '';

    return [
      escapeCSVCell(entry.id),
      escapeCSVCell(entry.symbol),
      escapeCSVCell(entry.companyName || ''),
      escapeCSVCell(entry.setupType),
      escapeCSVCell(entry.timeframe),
      escapeCSVCell(entry.status),
      escapeCSVCell(entry.entryDate),
      escapeCSVCell(entry.exitDate || ''),
      escapeCSVCell(entry.quantity),
      escapeCSVCell(entry.entryPrice.toFixed(2)),
      escapeCSVCell(entry.exitPrice !== undefined ? entry.exitPrice.toFixed(2) : ''),
      escapeCSVCell(entry.stopLoss.toFixed(2)),
      escapeCSVCell(entry.targetPrice.toFixed(2)),
      escapeCSVCell(entry.realizedPnL !== undefined ? entry.realizedPnL.toFixed(2) : ''),
      escapeCSVCell(entry.pnlPercent !== undefined ? `${entry.pnlPercent.toFixed(2)}%` : ''),
      escapeCSVCell(rrRatio),
      escapeCSVCell(entry.executionRating),
      escapeCSVCell(entry.tags ? entry.tags.join(' | ') : ''),
      escapeCSVCell(entry.notes || ''),
      escapeCSVCell(createdAtIso),
    ].join(',');
  });

  return [headers.map((h) => `"${h}"`).join(','), ...rows].join('\r\n');
}

export function downloadCSV(csvContent: string, fileName: string): void {
  if (typeof window === 'undefined') return;
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', fileName);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
