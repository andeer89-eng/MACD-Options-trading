import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_WATCHLISTS,
  Watchlist,
  createWatchlist,
  updateWatchlist,
  deleteWatchlist,
  addSymbolsToWatchlist,
  removeSymbolFromWatchlist,
  exportWatchlistsToJSON,
  importWatchlistsFromJSON,
  exportWatchlistToCSV,
} from './watchlistManager.ts';

describe('Watchlist Manager Utility Tests', () => {
  test('DEFAULT_WATCHLISTS contains preset watchlists including Tech-Watch and Blue-Chips', () => {
    assert.ok(DEFAULT_WATCHLISTS.length >= 4, 'Should have at least 4 default preset watchlists');
    const techWatch = DEFAULT_WATCHLISTS.find((wl) => wl.name === 'Tech-Watch');
    assert.ok(techWatch, 'Tech-Watch preset should exist');
    assert.ok(techWatch.symbols.includes('NVDA'), 'Tech-Watch should include NVDA');

    const blueChips = DEFAULT_WATCHLISTS.find((wl) => wl.name === 'Blue-Chips');
    assert.ok(blueChips, 'Blue-Chips preset should exist');
    assert.ok(blueChips.symbols.includes('JPM'), 'Blue-Chips should include JPM');
  });

  test('createWatchlist creates a new custom watchlist and sanitizes symbols', () => {
    const initial = [...DEFAULT_WATCHLISTS];
    const { updatedWatchlists, newWatchlist } = createWatchlist(
      initial,
      '  My Growth List  ',
      'High growth software stocks',
      ['aapl', 'nvda', 'AAPL', 'pltr', ''],
      'emerald'
    );

    assert.equal(updatedWatchlists.length, initial.length + 1);
    assert.equal(newWatchlist.name, 'My Growth List');
    assert.deepEqual(newWatchlist.symbols, ['AAPL', 'NVDA', 'PLTR'], 'Symbols should be uppercase and deduplicated');
    assert.equal(newWatchlist.isDefault, false);
  });

  test('updateWatchlist modifies name, description and symbols', () => {
    const initial = [...DEFAULT_WATCHLISTS];
    const targetId = initial[0].id;
    const updated = updateWatchlist(initial, targetId, {
      name: 'Renamed S&P Leaders',
      symbols: ['msft', 'aapl', 'tsla'],
    });

    const modified = updated.find((wl) => wl.id === targetId);
    assert.ok(modified);
    assert.equal(modified.name, 'Renamed S&P Leaders');
    assert.deepEqual(modified.symbols, ['MSFT', 'AAPL', 'TSLA']);
  });

  test('deleteWatchlist prevents deleting default watchlists unless force=true', () => {
    const initial = [...DEFAULT_WATCHLISTS];
    const defaultId = initial[0].id;

    const attempted = deleteWatchlist(initial, defaultId, false);
    assert.equal(attempted.length, initial.length, 'Default watchlist should not be deleted without force=true');

    const forced = deleteWatchlist(initial, defaultId, true);
    assert.equal(forced.length, initial.length - 1, 'Default watchlist deleted with force=true');
  });

  test('addSymbolsToWatchlist adds single or comma-separated symbols cleanly', () => {
    const initial = [...DEFAULT_WATCHLISTS];
    const targetId = initial[0].id;

    const step1 = addSymbolsToWatchlist(initial, targetId, 'amd, tsla');
    const modified1 = step1.find((wl) => wl.id === targetId);
    assert.ok(modified1?.symbols.includes('AMD'));
    assert.ok(modified1?.symbols.includes('TSLA'));

    const step2 = addSymbolsToWatchlist(step1, targetId, ['META', 'NVDA']);
    const modified2 = step2.find((wl) => wl.id === targetId);
    assert.ok(modified2?.symbols.includes('META'));
  });

  test('removeSymbolFromWatchlist removes specified symbol', () => {
    const initial = [...DEFAULT_WATCHLISTS];
    const targetId = 'wl-tech-watch';
    const updated = removeSymbolFromWatchlist(initial, targetId, 'AAPL');

    const modified = updated.find((wl) => wl.id === targetId);
    assert.ok(!modified?.symbols.includes('AAPL'), 'AAPL should be removed from Tech-Watch');
  });

  test('exportWatchlistsToJSON and importWatchlistsFromJSON cycle cleanly', () => {
    const initial = [...DEFAULT_WATCHLISTS];
    const jsonStr = exportWatchlistsToJSON(initial);

    assert.ok(jsonStr.includes('Tech-Watch'));

    const imported = importWatchlistsFromJSON([], jsonStr);
    assert.equal(imported.length, initial.length);
    assert.ok(imported.some((wl) => wl.name === 'Tech-Watch'));
  });

  test('exportWatchlistToCSV generates valid CSV content', () => {
    const wl = DEFAULT_WATCHLISTS[1]; // Tech-Watch
    const csv = exportWatchlistToCSV(wl);

    assert.ok(csv.includes('Watchlist Name,Symbol,Description'));
    assert.ok(csv.includes('"Tech-Watch"'));
    assert.ok(csv.includes('"NVDA"'));
  });
});
