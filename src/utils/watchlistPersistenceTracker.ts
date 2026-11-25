/* =====================================================================
   StageLedger — Top-50 Watchlist Persistence & Multi-Day Streak Tracker
   Tracks honestly when each ticker entered the Bullish / Bearish Top 50,
   how many distinct days it stayed in the Top 50, consecutive streak days
   (accounting cleanly for weekends), and rank movement vs previous session.
   Never fabricates backdated multi-day history for newly discovered names.
   ===================================================================== */

export interface WatchlistPresenceRecord {
  key: string; // `${direction}:${symbol}`
  symbol: string;
  direction: 'long' | 'short';
  firstSeenDate: string; // YYYY-MM-DD (NY time)
  lastSeenDate: string; // YYYY-MM-DD (NY time)
  seenDates: string[]; // sorted unique YYYY-MM-DD
  totalDaysInWatchlist: number;
  consecutiveDays: number;
  previousDayRank: number | null;
  lastRank: number;
  bestRank: number;
  lastScore: number;
}

export interface PresenceAnnotation {
  daysInWatchlist: number;
  consecutiveDays: number;
  firstSeenDate: string;
  lastSeenDate: string;
  bestRank: number;
  rankDelta: number | null; // +N = climbed N places vs prior day; null = new today
  isNewToday: boolean;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STORAGE_KEY = 'stageledger_top50_presence_v1';
const MAX_STORED_DATES = 120;
const inMemoryFallback = new Map<string, WatchlistPresenceRecord>();

export function getTradingDateKey(date: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export function diffCalendarDays(earlierDateStr: string, laterDateStr: string): number {
  const t1 = Date.parse(`${earlierDateStr}T00:00:00Z`);
  const t2 = Date.parse(`${laterDateStr}T00:00:00Z`);
  if (!Number.isFinite(t1) || !Number.isFinite(t2)) return 999;
  return Math.round((t2 - t1) / 86_400_000);
}

/**
 * Counts consecutive active trading appearances up to the latest date.
 * Gaps <= 3 calendar days (Fri -> Mon weekend or 1 holiday) preserve streak continuity.
 */
export function computeConsecutiveStreak(sortedDates: string[]): number {
  if (!Array.isArray(sortedDates) || sortedDates.length === 0) return 0;
  let streak = 1;
  for (let i = sortedDates.length - 1; i > 0; i--) {
    const gap = diffCalendarDays(sortedDates[i - 1], sortedDates[i]);
    if (gap >= 1 && gap <= 3) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

function getDefaultStorage(): StorageLike | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // Restricted storage environment
  }
  return null;
}

export function loadPresenceStore(storage?: StorageLike | null): Record<string, WatchlistPresenceRecord> {
  const store = storage ?? getDefaultStorage();
  if (store) {
    try {
      const raw = store.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, WatchlistPresenceRecord>;
        }
      }
    } catch {
      // Corrupt JSON fallback
    }
  }
  const obj: Record<string, WatchlistPresenceRecord> = {};
  for (const [k, v] of inMemoryFallback.entries()) {
    obj[k] = v;
  }
  return obj;
}

function savePresenceStore(
  records: Record<string, WatchlistPresenceRecord>,
  storage?: StorageLike | null
): void {
  inMemoryFallback.clear();
  for (const [k, v] of Object.entries(records)) {
    inMemoryFallback.set(k, v);
  }
  const store = storage ?? getDefaultStorage();
  if (store) {
    try {
      store.setItem(STORAGE_KEY, JSON.stringify(records));
    } catch {
      // Ignore quota exceeded silently
    }
  }
}

export function recordTop50PresenceSnapshot(
  items: Array<{ symbol: string; rank: number; score: number }>,
  direction: 'long' | 'short',
  dateKey: string = getTradingDateKey(),
  storage?: StorageLike | null
): Map<string, PresenceAnnotation> {
  const records = loadPresenceStore(storage);
  const annotations = new Map<string, PresenceAnnotation>();

  let changed = false;
  for (const item of items) {
    const sym = String(item.symbol || '').toUpperCase().trim();
    if (!sym || item.rank <= 0) continue;
    const key = `${direction}:${sym}`;
    const existing = records[key];

    if (!existing) {
      const next: WatchlistPresenceRecord = {
        key,
        symbol: sym,
        direction,
        firstSeenDate: dateKey,
        lastSeenDate: dateKey,
        seenDates: [dateKey],
        totalDaysInWatchlist: 1,
        consecutiveDays: 1,
        previousDayRank: null,
        lastRank: item.rank,
        bestRank: item.rank,
        lastScore: item.score,
      };
      records[key] = next;
      changed = true;
      annotations.set(sym, {
        daysInWatchlist: 1,
        consecutiveDays: 1,
        firstSeenDate: dateKey,
        lastSeenDate: dateKey,
        bestRank: item.rank,
        rankDelta: null,
        isNewToday: true,
      });
    } else {
      const seenSet = new Set(Array.isArray(existing.seenDates) ? existing.seenDates : []);
      const isNewCalendarDay = existing.lastSeenDate !== dateKey;
      const priorDayRank = isNewCalendarDay ? existing.lastRank : existing.previousDayRank;

      if (!seenSet.has(dateKey)) {
        seenSet.add(dateKey);
      }
      const sortedDates = Array.from(seenSet).sort().slice(-MAX_STORED_DATES);
      const consecutiveDays = computeConsecutiveStreak(sortedDates);
      const bestRank = Math.min(existing.bestRank || item.rank, item.rank);
      const totalDaysInWatchlist = sortedDates.length;

      if (
        isNewCalendarDay ||
        existing.lastRank !== item.rank ||
        existing.lastScore !== item.score ||
        existing.bestRank !== bestRank
      ) {
        records[key] = {
          ...existing,
          lastSeenDate: dateKey,
          seenDates: sortedDates,
          totalDaysInWatchlist,
          consecutiveDays,
          previousDayRank: priorDayRank,
          lastRank: item.rank,
          bestRank,
          lastScore: item.score,
        };
        changed = true;
      }

      const rankDelta = priorDayRank !== null ? priorDayRank - item.rank : null;
      annotations.set(sym, {
        daysInWatchlist: totalDaysInWatchlist,
        consecutiveDays,
        firstSeenDate: existing.firstSeenDate || sortedDates[0] || dateKey,
        lastSeenDate: dateKey,
        bestRank,
        rankDelta,
        isNewToday: totalDaysInWatchlist === 1 && existing.firstSeenDate === dateKey,
      });
    }
  }

  // Prune stale presence entries not seen in > 45 calendar days so localStorage stays compact
  const pruneCutoff = 45;
  for (const [key, rec] of Object.entries(records)) {
    if (diffCalendarDays(rec.lastSeenDate, dateKey) > pruneCutoff) {
      delete records[key];
      changed = true;
    }
  }

  if (changed) {
    savePresenceStore(records, storage);
  }

  return annotations;
}

/**
 * Pure read-only lookup for rendering presence telemetry without mutating storage.
 */
export function getPresenceAnnotation(
  symbol: string,
  direction: 'long' | 'short',
  currentRank: number,
  dateKey: string = getTradingDateKey(),
  storage?: StorageLike | null
): PresenceAnnotation {
  const sym = String(symbol || '').toUpperCase().trim();
  const records = loadPresenceStore(storage);
  const existing = records[`${direction}:${sym}`];
  if (!existing) {
    return {
      daysInWatchlist: 1,
      consecutiveDays: 1,
      firstSeenDate: dateKey,
      lastSeenDate: dateKey,
      bestRank: currentRank,
      rankDelta: null,
      isNewToday: true,
    };
  }
  const priorDayRank = existing.lastSeenDate !== dateKey ? existing.lastRank : existing.previousDayRank;
  const rankDelta = priorDayRank !== null ? priorDayRank - currentRank : null;
  return {
    daysInWatchlist: existing.totalDaysInWatchlist || 1,
    consecutiveDays: existing.consecutiveDays || 1,
    firstSeenDate: existing.firstSeenDate,
    lastSeenDate: existing.lastSeenDate,
    bestRank: Math.min(existing.bestRank || currentRank, currentRank),
    rankDelta,
    isNewToday: existing.totalDaysInWatchlist === 1 && existing.firstSeenDate === dateKey,
  };
}
