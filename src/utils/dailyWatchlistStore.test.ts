import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  loadDailyWatchlist,
  saveDailyWatchlist,
  transitionWatchlistStatus,
  toggleWatchlistPin,
  archiveInactiveWatchlistItems,
  isValidStatusTransition,
  DailyWatchlistItem,
} from './dailyWatchlistStore';

const FIXTURE_WATCHLIST: DailyWatchlistItem[] = [
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
    entryZone: [191.0, 193.0],
    status: 'WATCHING',
    scores: [27, 18, 17, 16],
    totalScore: 78,
    why: ['Stage 2'],
    smartMoney: null,
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
    setup: '4-Pillars bullish divergence',
    strategyId: 'four_pillars_div',
    direction: 'long',
    currentPrice: 812.1,
    atr: 16.5,
    entryZone: [809.0, 816.0],
    status: 'NEW',
    scores: [22, 27, 14, 12],
    totalScore: 75,
    why: ['MACD triple divergence'],
    smartMoney: null,
    earningsDays: 31,
    hasDivergence: true,
    dataQuality: 'live',
    isPinned: false,
    updatedAt: new Date().toISOString(),
  },
  {
    rank: 3,
    symbol: 'CAT',
    sector: 'Industrials',
    universe: ['sp500'],
    setup: 'Weinstein breakout',
    strategyId: 'weinstein_breakout',
    direction: 'long',
    currentPrice: 382.3,
    atr: 7.4,
    entryZone: [381.0, 385.0],
    status: 'NEW',
    scores: [28, 20, 16, 19],
    totalScore: 83,
    why: ['Stage 2 confirmed'],
    smartMoney: null,
    earningsDays: 40,
    hasDivergence: false,
    dataQuality: 'live',
    isPinned: false,
    updatedAt: new Date().toISOString(),
  },
];

describe('TRULLAS Daily Watchlist Persistence (Item 7 Acceptance Tests)', () => {
  beforeEach(() => {
    saveDailyWatchlist(FIXTURE_WATCHLIST.map((it) => ({ ...it })));
  });

  it('validates state transitions conforming to state machine rules', () => {
    assert.strictEqual(isValidStatusTransition('NEW', 'WATCHING'), true);
    assert.strictEqual(isValidStatusTransition('NEW', 'TRIGGERED'), true);
    assert.strictEqual(isValidStatusTransition('NEW', 'INVALIDATED'), true);
    assert.strictEqual(isValidStatusTransition('WATCHING', 'TRIGGERED'), true);
    assert.strictEqual(isValidStatusTransition('WATCHING', 'EXPIRED'), true);
    assert.strictEqual(isValidStatusTransition('TRIGGERED', 'EXPIRED'), true);
    assert.strictEqual(isValidStatusTransition('EXPIRED', 'NEW'), true);

    assert.strictEqual(isValidStatusTransition('TRIGGERED', 'WATCHING'), false);
    assert.strictEqual(isValidStatusTransition('EXPIRED', 'TRIGGERED'), false);
  });

  it('transitions symbol status and updates in-memory list', () => {
    const res = transitionWatchlistStatus('LLY', 'WATCHING');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.item?.status, 'WATCHING');

    const res2 = transitionWatchlistStatus('LLY', 'TRIGGERED');
    assert.strictEqual(res2.success, true);
    assert.strictEqual(res2.item?.status, 'TRIGGERED');

    const resIllegal = transitionWatchlistStatus('LLY', 'WATCHING');
    assert.strictEqual(resIllegal.success, false);
  });

  it('deduplicates symbols and ranks by total score', () => {
    const list: DailyWatchlistItem[] = [
      { ...FIXTURE_WATCHLIST[0], symbol: 'NVDA', totalScore: 90 },
      { ...FIXTURE_WATCHLIST[0], symbol: 'NVDA', totalScore: 95 },
      { ...FIXTURE_WATCHLIST[0], symbol: 'MSFT', totalScore: 85 },
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
    const items = loadDailyWatchlist();
    const ge = items.find((i) => i.symbol === 'GE');
    assert.strictEqual(ge?.isPinned, false);

    transitionWatchlistStatus('CAT', 'EXPIRED');
    const activeOnly = archiveInactiveWatchlistItems();
    assert.strictEqual(activeOnly.some((i) => i.symbol === 'CAT'), false);
  });
});
