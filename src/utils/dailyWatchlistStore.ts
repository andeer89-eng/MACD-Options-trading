/* =====================================================================
   TRULLAS Master Plan v3 — Daily Watchlist Store (§8 Roadmap Item 7)
   Matches schema `watchlist_items` with state machine:
   NEW → WATCHING → TRIGGERED → EXPIRED / INVALIDATED.
   Persisted in Firestore with localStorage fallback and stale detection.
   ===================================================================== */

import { Levels, DataQuality, loadSettings } from './masterPlanCore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, getDocs, doc, setDoc, deleteDoc, query } from 'firebase/firestore';

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
  earningsDays: number;
  hasDivergence: boolean;
  levels?: Levels;
  dataQuality: DataQuality;
  isPinned?: boolean;
  isStale?: boolean;
  updatedAt: string;
}

const STORAGE_KEY = 'trullas_daily_watchlist_v3';
const ARCHIVE_KEY = 'trullas_daily_watchlist_archive_v3';

// Default initial state matching trullas-today-prototype.html
export const DEFAULT_WATCHLIST_ITEMS: DailyWatchlistItem[] = [
  // ... (keeping existing items)
  {
    rank: 1,
    symbol: 'GE',
    sector: 'Industrials',
    universe: ['sp500'],
    setup: 'Weinstein breakout',
    strategyId: 'weinstein_breakout',
    direction: 'long',
    currentPrice: 191.4,
    atr: 3.1,
    entryZone: [1.002, 1.012],
    status: 'WATCHING',
    scores: [27, 18, 17, 16],
    totalScore: 78,
    why: ['Stage 2, MA30 ascending', 'Breakout above 6-week base', 'ATR 2.4% — healthy volatility'],
    smartMoney: 'Form 4: 3-insider cluster / 30d',
    earningsDays: 23,
    hasDivergence: false,
    dataQuality: 'live',
    isPinned: true,
    updatedAt: new Date().toISOString(),
  },
  {
    rank: 2,
    symbol: 'LLY',
    sector: 'Health Care',
    universe: ['sp500'],
    setup: '4-Pillars divergență bullish',
    strategyId: 'four_pillars_div',
    direction: 'long',
    currentPrice: 812.1,
    atr: 16.5,
    entryZone: [0.996, 1.006],
    status: 'NEW',
    scores: [22, 27, 14, 12],
    totalScore: 75,
    why: ['MACD triple divergence on 1d', 'Stage 1→2 transition', 'Volume below 20d avg'],
    smartMoney: '13F: net +1.8% QoQ (lag ≥ 45d)',
    earningsDays: 31,
    hasDivergence: true,
    dataQuality: 'live',
    isPinned: false,
    updatedAt: new Date().toISOString(),
  },
  {
    rank: 3,
    symbol: 'JPM',
    sector: 'Financials',
    universe: ['sp500'],
    setup: 'AVWAP reclaim',
    strategyId: 'avwap_reclaim',
    direction: 'long',
    currentPrice: 218.75,
    atr: 3.95,
    entryZone: [1.0, 1.008],
    status: 'NEW',
    scores: [20, 15, 15, 18],
    totalScore: 68,
    why: ['Reclaim AVWAP (earnings anchor)', 'Late Stage 2', 'Institutional volume surge'],
    smartMoney: null,
    earningsDays: 12,
    hasDivergence: false,
    dataQuality: 'live',
    isPinned: false,
    updatedAt: new Date().toISOString(),
  },
  {
    rank: 4,
    symbol: 'CAT',
    sector: 'Industrials',
    universe: ['sp500'],
    setup: 'Weinstein breakout',
    strategyId: 'weinstein_breakout',
    direction: 'long',
    currentPrice: 382.3,
    atr: 7.4,
    entryZone: [1.003, 1.015],
    status: 'NEW',
    scores: [28, 20, 16, 19],
    totalScore: 83,
    why: ['Stage 2 confirmed on weekly', '9-week base, close above pivot', 'Volume +60% vs avg'],
    smartMoney: null,
    earningsDays: 40,
    hasDivergence: false,
    dataQuality: 'live',
    isPinned: false,
    updatedAt: new Date().toISOString(),
  },
  {
    rank: 5,
    symbol: 'AAPL',
    sector: 'Information Technology',
    universe: ['sp500', 'ndx100'],
    setup: '4-Pillars divergență bullish',
    strategyId: 'four_pillars_div',
    direction: 'long',
    currentPrice: 224.5,
    atr: 4.8,
    entryZone: [0.997, 1.004],
    status: 'WATCHING',
    scores: [24, 26, 15, 15],
    totalScore: 80,
    why: ['Triple divergence on 1d', 'AVWAP support confluence', 'ATR volatility normal'],
    smartMoney: 'Form 4: scheduled 10b5-1 sale',
    earningsDays: 4,
    hasDivergence: true,
    dataQuality: 'live',
    isPinned: false,
    updatedAt: new Date().toISOString(),
  },
  {
    rank: 6,
    symbol: 'TSLA',
    sector: 'Consumer Discretionary',
    universe: ['sp500', 'ndx100'],
    setup: 'Epuizare bullish',
    strategyId: 'exhaustion',
    direction: 'long',
    currentPrice: 248.2,
    atr: 9.6,
    entryZone: [0.998, 1.006],
    status: 'NEW',
    scores: [18, 24, 13, 17],
    totalScore: 72,
    why: ['Exhaustion sell-off after 5 consecutive down days', 'Below MA30', 'High ATR volatility'],
    smartMoney: null,
    earningsDays: 19,
    hasDivergence: true,
    dataQuality: 'live',
    isPinned: false,
    updatedAt: new Date().toISOString(),
  },
  {
    rank: 7,
    symbol: 'XOM',
    sector: 'Energy',
    universe: ['sp500'],
    setup: 'Weinstein breakout',
    strategyId: 'weinstein_breakout',
    direction: 'long',
    currentPrice: 118.4,
    atr: 2.4,
    entryZone: [0.995, 1.005],
    status: 'TRIGGERED',
    scores: [27, 19, 15, 20],
    totalScore: 81,
    why: ['Breakout confirmed on close', 'Volume +85% vs avg', 'Leading sector in RRG'],
    smartMoney: null,
    earningsDays: 35,
    hasDivergence: false,
    dataQuality: 'live',
    isPinned: false,
    updatedAt: new Date().toISOString(),
  },
  {
    rank: 8,
    symbol: 'PG',
    sector: 'Consumer Staples',
    universe: ['sp500'],
    setup: '4-Pillars divergență bearish',
    strategyId: 'four_pillars_div',
    direction: 'short',
    currentPrice: 168.8,
    atr: 2.1,
    entryZone: [0.994, 1.0],
    status: 'WATCHING',
    scores: [21, 23, 12, 14],
    totalScore: 70,
    why: ['Bearish MACD divergence on 1d', 'Stage 3 flattening MA30', 'Lagging sector in RRG'],
    smartMoney: null,
    earningsDays: 16,
    hasDivergence: true,
    dataQuality: 'live',
    isPinned: false,
    updatedAt: new Date().toISOString(),
  },
];

let inMemoryWatchlist: DailyWatchlistItem[] = [...DEFAULT_WATCHLIST_ITEMS];
const listeners = new Set<(items: DailyWatchlistItem[]) => void>();

export async function syncWatchlistItemToFirestore(item: DailyWatchlistItem): Promise<void> {
  if (!auth.currentUser) return;
  try {
    await setDoc(doc(db, 'users', auth.currentUser.uid, 'watchlistItems', item.symbol), item);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${auth.currentUser.uid}/watchlistItems/${item.symbol}`);
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
  if (auth.currentUser) {
    deduped.forEach(syncWatchlistItemToFirestore);
  }
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
        if (Array.isArray(parsed) && parsed.length > 0) {
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
  return { success: true, item: current };
}

export function toggleWatchlistPin(symbol: string): boolean {
  const sym = symbol.toUpperCase().trim();
  const current = inMemoryWatchlist.find((it) => it.symbol === sym);
  if (!current) return false;
  current.isPinned = !current.isPinned;
  current.updatedAt = new Date().toISOString();
  saveDailyWatchlist([...inMemoryWatchlist]);
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
  }
  saveDailyWatchlist(active);
  return active;
}

export function flagStaleWatchlistItems(maxAgeMs: number = 4 * 60 * 60 * 1000): DailyWatchlistItem[] {
  const now = Date.now();
  let changed = false;
  for (const item of inMemoryWatchlist) {
    const itemTime = new Date(item.updatedAt).getTime();
    const isStale = now - itemTime > maxAgeMs;
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
