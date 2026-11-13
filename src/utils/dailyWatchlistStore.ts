/* =====================================================================
   TRULLAS Master Plan v3 — Daily Watchlist Store (§8 Roadmap Item 7)
   Matches schema `watchlistItems` with state machine:
   NEW → WATCHING → TRIGGERED → EXPIRED / INVALIDATED.
   Starts empty cleanly when no user items saved; synced to Firestore + localStorage.
   ===================================================================== */

import { Levels, DataQuality } from './masterPlanCore';
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

export type WatchlistStatus = 'NEW' | 'WATCHING' | 'TRIGGERED' | 'EXPIRED' | 'INVALIDATED';

export interface WatchlistSmartMoney {
  form4Cluster?: string;
  f13NetQoQ?: string;
  f13LagDays?: number;
}

export interface DailyWatchlistItem {
  rank: number;
  symbol: string;
  sector: string;
  universe: ('sp500' | 'ndx100')[];
  setup: string;
  strategyId: string;
  direction: 'long' | 'short';
  currentPrice: number;
  atr: number;
  entryZone: [number, number];
  status: WatchlistStatus;
  scores: [number, number, number, number];
  totalScore: number;
  why: string[];
  smartMoney: string | null;
  earningsDays: number | null;
  hasDivergence: boolean;
  levels?: Levels;
  dataQuality: DataQuality;
  isPinned?: boolean;
  isStale?: boolean;
  updatedAt: string;
}

const STORAGE_KEY = 'trullas_daily_watchlist_v3';
const ARCHIVE_KEY = 'trullas_daily_watchlist_archive_v3';

export const DEFAULT_WATCHLIST_ITEMS: DailyWatchlistItem[] = [];

let inMemoryWatchlist: DailyWatchlistItem[] = [];
const listeners = new Set<(items: DailyWatchlistItem[]) => void>();

function sanitizeDocId(symbol: string): string {
  const clean = symbol.toUpperCase().trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  return clean.slice(0, 128) || 'ITEM';
}

export async function loadDailyWatchlistFromFirestore(): Promise<DailyWatchlistItem[]> {
  const user = auth.currentUser;
  if (!user) return [];
  const path = `users/${user.uid}/watchlistItems`;
  try {
    const q = query(collection(db, 'users', user.uid, 'watchlistItems'), where('ownerId', '==', user.uid));
    const snap = await getDocs(q);
    const items: DailyWatchlistItem[] = snap.docs.map((d, idx) => {
      const data = d.data() as Record<string, any>;
      const updatedIso =
        data.updatedAt instanceof Timestamp
          ? data.updatedAt.toDate().toISOString()
          : typeof data.updatedAt === 'string'
          ? data.updatedAt
          : new Date().toISOString();
      const price = Number(data.currentPrice) || 0;
      return {
        rank: idx + 1,
        symbol: (data.symbol || d.id).toUpperCase(),
        sector: data.sector || 'Equities',
        universe: ['sp500'],
        setup: data.setup || '4-Pillars Divergence',
        strategyId: data.strategyId || 'four_pillars_div',
        direction: data.direction === 'short' ? 'short' : 'long',
        currentPrice: price,
        atr: Number(data.atr) || 0,
        entryZone: price > 0 ? [Number((price * 0.996).toFixed(2)), Number((price * 1.006).toFixed(2))] : [0, 0],
        status: data.status || 'NEW',
        scores: [0, 0, 0, 0],
        totalScore: Number(data.totalScore) || 0,
        why: [],
        smartMoney: null,
        earningsDays: null,
        hasDivergence: true,
        dataQuality: 'live',
        isPinned: Boolean(data.isPinned),
        updatedAt: updatedIso,
      };
    });
    return items;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}

export async function createWatchlistItemInFirestore(item: DailyWatchlistItem): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const docId = sanitizeDocId(item.symbol);
  const path = `users/${user.uid}/watchlistItems/${docId}`;
  const payload: Record<string, any> = {
    ownerId: user.uid,
    symbol: item.symbol.toUpperCase().trim().slice(0, 20),
    sector: (item.sector || 'Equities').slice(0, 80),
    setup: (item.setup || 'Divergence').slice(0, 120),
    strategyId: (item.strategyId || 'four_pillars_div').slice(0, 64),
    direction: item.direction === 'short' ? 'short' : 'long',
    currentPrice: Math.max(0, Number(item.currentPrice) || 0),
    atr: Math.max(0, Number(item.atr) || 0),
    status: item.status,
    totalScore: Math.min(100, Math.max(0, Number(item.totalScore) || 0)),
    isPinned: Boolean(item.isPinned),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  try {
    await setDoc(doc(db, 'users', user.uid, 'watchlistItems', docId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateWatchlistItemInFirestore(
  symbol: string,
  patch: Partial<Pick<DailyWatchlistItem, 'status' | 'isPinned' | 'totalScore' | 'currentPrice' | 'atr' | 'setup'>>
): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const docId = sanitizeDocId(symbol);
  const path = `users/${user.uid}/watchlistItems/${docId}`;
  const cleanPatch: Record<string, any> = { updatedAt: serverTimestamp() };
  if (patch.status !== undefined) cleanPatch.status = patch.status;
  if (patch.isPinned !== undefined) cleanPatch.isPinned = Boolean(patch.isPinned);
  if (patch.totalScore !== undefined) cleanPatch.totalScore = Math.min(100, Math.max(0, Number(patch.totalScore)));
  if (patch.currentPrice !== undefined) cleanPatch.currentPrice = Math.max(0, Number(patch.currentPrice));
  if (patch.atr !== undefined) cleanPatch.atr = Math.max(0, Number(patch.atr));
  if (patch.setup !== undefined) cleanPatch.setup = patch.setup.slice(0, 120);
  try {
    await updateDoc(doc(db, 'users', user.uid, 'watchlistItems', docId), cleanPatch);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteWatchlistItemFromFirestore(symbol: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const docId = sanitizeDocId(symbol);
  const path = `users/${user.uid}/watchlistItems/${docId}`;
  try {
    await deleteDoc(doc(db, 'users', user.uid, 'watchlistItems', docId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function isValidStatusTransition(from: WatchlistStatus, to: WatchlistStatus): boolean {
  if (from === to) return true;
  switch (from) {
    case 'NEW':
      return to === 'WATCHING' || to === 'TRIGGERED' || to === 'EXPIRED' || to === 'INVALIDATED';
    case 'WATCHING':
      return to === 'TRIGGERED' || to === 'EXPIRED' || to === 'INVALIDATED';
    case 'TRIGGERED':
      return to === 'EXPIRED' || to === 'INVALIDATED';
    case 'EXPIRED':
    case 'INVALIDATED':
      return to === 'NEW';
    default:
      return false;
  }
}

export function saveDailyWatchlist(items: DailyWatchlistItem[]): DailyWatchlistItem[] {
  const seen = new Set<string>();
  const deduped: DailyWatchlistItem[] = [];
  for (const item of items) {
    const sym = item.symbol.toUpperCase().trim();
    if (!seen.has(sym)) {
      seen.add(sym);
      deduped.push({
        ...item,
        symbol: sym,
        updatedAt: item.updatedAt || new Date().toISOString(),
      });
    }
  }
  deduped.sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0));
  deduped.forEach((it, idx) => {
    it.rank = idx + 1;
  });
  inMemoryWatchlist = deduped;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(deduped));
    }
  } catch (err) {
    console.error('[DailyWatchlistStore] Error saving to localStorage:', err);
  }
  notifyWatchlistListeners();
  return [...inMemoryWatchlist];
}

export function subscribeDailyWatchlist(cb: (items: DailyWatchlistItem[]) => void): () => void {
  listeners.add(cb);
  cb([...inMemoryWatchlist]);
  return () => listeners.delete(cb);
}

function notifyWatchlistListeners() {
  const copy = [...inMemoryWatchlist];
  listeners.forEach((cb) => {
    try {
      cb(copy);
    } catch (e) {
      console.error('[DailyWatchlistStore Listener Error]:', e);
    }
  });
}

export function loadDailyWatchlist(): DailyWatchlistItem[] {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          inMemoryWatchlist = parsed;
          return [...inMemoryWatchlist];
        }
      }
    }
  } catch (err) {
    console.warn('[DailyWatchlistStore] Error reading localStorage:', err);
  }
  return [...inMemoryWatchlist];
}

export function transitionWatchlistStatus(
  symbol: string,
  newStatus: WatchlistStatus
): { success: boolean; item?: DailyWatchlistItem; reason?: string } {
  const sym = symbol.toUpperCase().trim();
  const current = inMemoryWatchlist.find((it) => it.symbol === sym);
  if (!current) {
    return { success: false, reason: `Symbol ${sym} not found in watchlist.` };
  }
  if (!isValidStatusTransition(current.status, newStatus)) {
    return {
      success: false,
      reason: `Illegal state transition from ${current.status} to ${newStatus}.`,
    };
  }
  current.status = newStatus;
  current.updatedAt = new Date().toISOString();
  saveDailyWatchlist([...inMemoryWatchlist]);
  updateWatchlistItemInFirestore(sym, { status: newStatus }).catch((e) =>
    console.warn('[Watchlist Firestore status sync error]:', e)
  );
  return { success: true, item: current };
}

export function toggleWatchlistPin(symbol: string): boolean {
  const sym = symbol.toUpperCase().trim();
  const current = inMemoryWatchlist.find((it) => it.symbol === sym);
  if (!current) return false;
  current.isPinned = !current.isPinned;
  current.updatedAt = new Date().toISOString();
  saveDailyWatchlist([...inMemoryWatchlist]);
  updateWatchlistItemInFirestore(sym, { isPinned: current.isPinned }).catch((e) =>
    console.warn('[Watchlist Firestore pin sync error]:', e)
  );
  return Boolean(current.isPinned);
}

export function archiveInactiveWatchlistItems(): DailyWatchlistItem[] {
  const active: DailyWatchlistItem[] = [];
  const toArchive: DailyWatchlistItem[] = [];
  for (const item of inMemoryWatchlist) {
    if (item.status === 'EXPIRED' || item.status === 'INVALIDATED') {
      toArchive.push(item);
    } else {
      active.push(item);
    }
  }
  if (toArchive.length > 0) {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const rawArchive = localStorage.getItem(ARCHIVE_KEY);
        const existingArchive: DailyWatchlistItem[] = rawArchive ? JSON.parse(rawArchive) : [];
        const combined = [...toArchive, ...existingArchive];
        localStorage.setItem(ARCHIVE_KEY, JSON.stringify(combined.slice(0, 200)));
      }
    } catch (e) {
      console.warn('[DailyWatchlistStore] Failed to update archive:', e);
    }
    for (const dead of toArchive) {
      deleteWatchlistItemFromFirestore(dead.symbol).catch((e) =>
        console.warn('[Watchlist Firestore delete error]:', e)
      );
    }
  }
  saveDailyWatchlist(active);
  return active;
}

export function flagStaleWatchlistItems(maxAgeMs: number = 4 * 60 * 60 * 1000): DailyWatchlistItem[] {
  const now = Date.now();
  let changed = false;
  for (const item of inMemoryWatchlist) {
    const itemTime = new Date(item.updatedAt).getTime();
    const isStale = Number.isFinite(itemTime) && now - itemTime > maxAgeMs;
    if (item.isStale !== isStale) {
      item.isStale = isStale;
      changed = true;
    }
  }
  if (changed) {
    saveDailyWatchlist([...inMemoryWatchlist]);
  }
  return [...inMemoryWatchlist];
}
