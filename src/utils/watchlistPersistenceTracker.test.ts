import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeConsecutiveStreak,
  recordTop50PresenceSnapshot,
  loadPresenceStore,
  StorageLike,
} from './watchlistPersistenceTracker';

function createMemoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
  };
}

test('computeConsecutiveStreak counts consecutive trading days across weekends cleanly', () => {
  // Thu, Fri, Mon, Tue -> gap Fri->Mon is 3 days -> unbroken 4-day streak
  assert.equal(
    computeConsecutiveStreak(['2026-11-19', '2026-11-20', '2026-11-23', '2026-11-24']),
    4
  );

  // Break > 3 days resets streak to recent consecutive run
  assert.equal(
    computeConsecutiveStreak(['2026-11-10', '2026-11-23', '2026-11-24']),
    2
  );
});

test('recordTop50PresenceSnapshot tracks daysInWatchlist, rankDelta, bestRank, and separate Bullish/Bearish histories', () => {
  const storage = createMemoryStorage();

  // Day 1 (Fri 2026-11-20)
  const day1 = recordTop50PresenceSnapshot(
    [
      { symbol: 'NVDA', rank: 5, score: 86 },
      { symbol: 'AAPL', rank: 1, score: 91 },
    ],
    'long',
    '2026-11-20',
    storage
  );
  assert.equal(day1.get('NVDA')?.daysInWatchlist, 1);
  assert.equal(day1.get('NVDA')?.consecutiveDays, 1);
  assert.equal(day1.get('NVDA')?.rankDelta, null);
  assert.equal(day1.get('NVDA')?.isNewToday, true);

  // Day 2 (Mon 2026-11-23): NVDA climbs from #5 to #2 -> rankDelta = +3
  const day2 = recordTop50PresenceSnapshot(
    [
      { symbol: 'AAPL', rank: 1, score: 92 },
      { symbol: 'NVDA', rank: 2, score: 89 },
    ],
    'long',
    '2026-11-23',
    storage
  );
  assert.equal(day2.get('NVDA')?.daysInWatchlist, 2);
  assert.equal(day2.get('NVDA')?.consecutiveDays, 2);
  assert.equal(day2.get('NVDA')?.bestRank, 2);
  assert.equal(day2.get('NVDA')?.rankDelta, 3);
  assert.equal(day2.get('NVDA')?.isNewToday, false);

  // Same-day scan refresh keeps priorDayRank delta vs Friday (#5 -> #2 = +3)
  const sameDayRefresh = recordTop50PresenceSnapshot(
    [
      { symbol: 'AAPL', rank: 1, score: 92 },
      { symbol: 'NVDA', rank: 2, score: 90 },
    ],
    'long',
    '2026-11-23',
    storage
  );
  assert.equal(sameDayRefresh.get('NVDA')?.daysInWatchlist, 2);
  assert.equal(sameDayRefresh.get('NVDA')?.rankDelta, 3);

  // Bearish tracking for NVDA is isolated from Bullish tracking
  const bearDay1 = recordTop50PresenceSnapshot(
    [{ symbol: 'NVDA', rank: 10, score: 74 }],
    'short',
    '2026-11-23',
    storage
  );
  assert.equal(bearDay1.get('NVDA')?.daysInWatchlist, 1);
  const store = loadPresenceStore(storage);
  assert.equal(store['long:NVDA'].totalDaysInWatchlist, 2);
  assert.equal(store['short:NVDA'].totalDaysInWatchlist, 1);
});
