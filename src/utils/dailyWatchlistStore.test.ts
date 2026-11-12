import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  loadDailyWatchlist,
  saveDailyWatchlist,
  transitionWatchlistStatus,
  toggleWatchlistPin,
  archiveInactiveWatchlistItems,
  isValidStatusTransition,
  DEFAULT_WATCHLIST_ITEMS,
  DailyWatchlistItem,
} from './dailyWatchlistStore';

describe('TRULLAS Daily Watchlist Persistence (Item 7 Acceptance Tests)', () => {
  beforeEach(() => {
    // Reset to defaults
    saveDailyWatchlist([...DEFAULT_WATCHLIST_ITEMS]);
  });

  it('validates state transitions conforming to state machine rules', () => {
    // Valid transitions
    assert.strictEqual(isValidStatusTransition('NEW', 'WATCHING'), true);
    assert.strictEqual(isValidStatusTransition('NEW', 'TRIGGERED'), true);
    assert.strictEqual(isValidStatusTransition('NEW', 'INVALIDATED'), true);
    assert.strictEqual(isValidStatusTransition('WATCHING', 'TRIGGERED'), true);
    assert.strictEqual(isValidStatusTransition('WATCHING', 'EXPIRED'), true);
    assert.strictEqual(isValidStatusTransition('TRIGGERED', 'EXPIRED'), true);
    assert.strictEqual(isValidStatusTransition('EXPIRED', 'NEW'), true);

    // Invalid transitions
    assert.strictEqual(isValidStatusTransition('TRIGGERED', 'WATCHING'), false);
    assert.strictEqual(isValidStatusTransition('EXPIRED', 'TRIGGERED'), false);
  });

  it('transitions symbol status and updates in-memory list', () => {
    const res = transitionWatchlistStatus('LLY', 'WATCHING');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.item?.status, 'WATCHING');

    // Trigger next transition
    const res2 = transitionWatchlistStatus('LLY', 'TRIGGERED');
    assert.strictEqual(res2.success, true);
    assert.strictEqual(res2.item?.status, 'TRIGGERED');

    // Attempt illegal transition backwards
    const resIllegal = transitionWatchlistStatus('LLY', 'WATCHING');
    assert.strictEqual(resIllegal.success, false);
  });

  it('deduplicates symbols and ranks by total score', () => {
    const list: DailyWatchlistItem[] = [
      {
        ...DEFAULT_WATCHLIST_ITEMS[0],
        symbol: 'NVDA',
        totalScore: 90,
      },
      {
        ...DEFAULT_WATCHLIST_ITEMS[0],
        symbol: 'NVDA', // Duplicate NVDA
        totalScore: 95,
      },
      {
        ...DEFAULT_WATCHLIST_ITEMS[0],
        symbol: 'MSFT',
        totalScore: 85,
      },
    ];

    const saved = saveDailyWatchlist(list);
    assert.strictEqual(saved.length, 2);
    assert.strictEqual(saved[0].symbol, 'NVDA');
    assert.strictEqual(saved[0].rank, 1);
    assert.strictEqual(saved[1].symbol, 'MSFT');
    assert.strictEqual(saved[1].rank, 2);
  });

  it('toggles pin and archives expired items', () => {
    toggleWatchlistPin('GE');
    let items = loadDailyWatchlist();
    const ge = items.find((i) => i.symbol === 'GE');
    assert.strictEqual(ge?.isPinned, false); // was true, now false

    // Set an item to EXPIRED and archive
    transitionWatchlistStatus('CAT', 'EXPIRED');
    const activeOnly = archiveInactiveWatchlistItems();
    assert.strictEqual(activeOnly.some((i) => i.symbol === 'CAT'), false);
  });
});
