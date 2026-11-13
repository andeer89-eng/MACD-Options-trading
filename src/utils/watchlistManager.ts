/**
 * Watchlist Manager Utility
 * Allows creating, updating, persisting, exporting, and filtering custom symbol watchlists.
 */

export interface Watchlist {
  id: string;
  name: string;
  description: string;
  symbols: string[];
  isDefault?: boolean;
  color?: 'emerald' | 'indigo' | 'blue' | 'amber' | 'cyan' | 'rose' | 'purple' | 'violet';
  createdAt: string;
  updatedAt: string;
}

export const WATCHLISTS_STORAGE_KEY = 'trullas_watchlists_v1';
export const ACTIVE_WATCHLIST_KEY = 'trullas_active_watchlist_id_v1';

export const DEFAULT_WATCHLISTS: Watchlist[] = [
  {
    id: 'wl-sp500-top',
    name: 'S&P 500 Megacaps',
    description: 'Top market-cap technology and growth leaders in the S&P 500 index.',
    symbols: ['AAPL', 'NVDA', 'MSFT', 'AMZN', 'GOOGL', 'META', 'TSLA', 'AVGO'],
    isDefault: true,
    color: 'emerald',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'wl-tech-watch',
    name: 'Tech-Watch',
    description: 'High-beta tech leaders, AI hardware, enterprise cloud, and software platforms.',
    symbols: ['AAPL', 'NVDA', 'MSFT', 'AMZN', 'GOOGL', 'META', 'TSLA', 'AMD', 'PLTR', 'AVGO', 'INTC', 'CRM', 'ORCL', 'QCOM', 'MU'],
    isDefault: true,
    color: 'indigo',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'wl-blue-chips',
    name: 'Blue-Chips',
    description: 'Core dividend-paying industry titans, major money-center banks, and defensive healthcare leaders.',
    symbols: ['JPM', 'LLY', 'XOM', 'JNJ', 'PG', 'BAC', 'COST', 'WMT', 'UNH', 'HD', 'CVX', 'BRK.B', 'KO', 'PEP', 'MCD'],
    isDefault: true,
    color: 'blue',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'wl-semis',
    name: 'Semiconductors',
    description: 'Global semiconductor foundries, chip designers, equipment makers, and memory suppliers.',
    symbols: ['NVDA', 'AMD', 'AVGO', 'TSM', 'INTC', 'MU', 'QCOM', 'AMAT', 'LRCX', 'KLAC', 'ARM'],
    isDefault: true,
    color: 'amber',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'wl-financials',
    name: 'Financials & Banking',
    description: 'Money-center banks, investment banks, credit networks, and asset managers.',
    symbols: ['JPM', 'BAC', 'WFC', 'C', 'GS', 'MS', 'BLK', 'V', 'MA', 'AXP'],
    isDefault: true,
    color: 'cyan',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

/**
 * Loads watchlists from localStorage or initializes default presets.
 */
export function loadWatchlists(): Watchlist[] {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(WATCHLISTS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    }
  } catch (err) {
    console.error('Failed to load watchlists from localStorage:', err);
  }
  return [...DEFAULT_WATCHLISTS];
}

/**
 * Saves array of watchlists to localStorage.
 */
export function saveWatchlists(watchlists: Watchlist[]): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(WATCHLISTS_STORAGE_KEY, JSON.stringify(watchlists));
    }
  } catch (err) {
    console.error('Failed to save watchlists to localStorage:', err);
  }
}

/**
 * Creates a new custom watchlist.
 */
export function createWatchlist(
  watchlists: Watchlist[],
  name: string,
  description: string = '',
  symbols: string[] = [],
  color: Watchlist['color'] = 'purple'
): { updatedWatchlists: Watchlist[]; newWatchlist: Watchlist } {
  const sanitizedSymbols = Array.from(
    new Set(symbols.map((s) => s.trim().toUpperCase()).filter((s) => s.length > 0))
  );

  const now = new Date().toISOString();
  const newWatchlist: Watchlist = {
    id: `wl-custom-${Date.now()}`,
    name: name.trim() || 'Custom Watchlist',
    description: description.trim() || 'User custom ticker basket',
    symbols: sanitizedSymbols,
    isDefault: false,
    color,
    createdAt: now,
    updatedAt: now,
  };

  const updatedWatchlists = [...watchlists, newWatchlist];
  saveWatchlists(updatedWatchlists);
  return { updatedWatchlists, newWatchlist };
}

/**
 * Updates an existing watchlist properties or symbols.
 */
export function updateWatchlist(
  watchlists: Watchlist[],
  id: string,
  updates: Partial<Omit<Watchlist, 'id' | 'createdAt'>>
): Watchlist[] {
  const now = new Date().toISOString();
  const updatedWatchlists = watchlists.map((wl) => {
    if (wl.id === id) {
      const sanitizedSymbols = updates.symbols
        ? Array.from(
            new Set(updates.symbols.map((s) => s.trim().toUpperCase()).filter((s) => s.length > 0))
          )
        : wl.symbols;

      return {
        ...wl,
        ...updates,
        symbols: sanitizedSymbols,
        updatedAt: now,
      };
    }
    return wl;
  });

  saveWatchlists(updatedWatchlists);
  return updatedWatchlists;
}

/**
 * Deletes a watchlist by ID (prevents deletion if it's default unless force=true).
 */
export function deleteWatchlist(
  watchlists: Watchlist[],
  id: string,
  force: boolean = false
): Watchlist[] {
  const target = watchlists.find((wl) => wl.id === id);
  if (!target) return watchlists;
  if (target.isDefault && !force) return watchlists;

  const updated = watchlists.filter((wl) => wl.id !== id);
  saveWatchlists(updated);
  return updated;
}

/**
 * Adds one or more symbols to a watchlist.
 */
export function addSymbolsToWatchlist(
  watchlists: Watchlist[],
  id: string,
  newSymbols: string[] | string
): Watchlist[] {
  const symbolsArray = Array.isArray(newSymbols)
    ? newSymbols
    : newSymbols.split(/[\s,]+/).filter((s) => s.length > 0);

  const now = new Date().toISOString();
  const updatedWatchlists = watchlists.map((wl) => {
    if (wl.id === id) {
      const existingSet = new Set(wl.symbols);
      symbolsArray.forEach((s) => {
        const clean = s.trim().toUpperCase();
        if (clean) existingSet.add(clean);
      });

      return {
        ...wl,
        symbols: Array.from(existingSet),
        updatedAt: now,
      };
    }
    return wl;
  });

  saveWatchlists(updatedWatchlists);
  return updatedWatchlists;
}

/**
 * Removes a symbol from a watchlist.
 */
export function removeSymbolFromWatchlist(
  watchlists: Watchlist[],
  id: string,
  symbolToRemove: string
): Watchlist[] {
  const target = symbolToRemove.trim().toUpperCase();
  const now = new Date().toISOString();

  const updatedWatchlists = watchlists.map((wl) => {
    if (wl.id === id) {
      return {
        ...wl,
        symbols: wl.symbols.filter((s) => s !== target),
        updatedAt: now,
      };
    }
    return wl;
  });

  saveWatchlists(updatedWatchlists);
  return updatedWatchlists;
}

/**
 * Gets or sets the active selected watchlist ID in localStorage.
 */
export function getActiveWatchlistId(watchlists: Watchlist[]): string {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const savedId = window.localStorage.getItem(ACTIVE_WATCHLIST_KEY);
      if (savedId && watchlists.some((wl) => wl.id === savedId)) {
        return savedId;
      }
    }
  } catch (err) {
    // fallback
  }
  return watchlists[0]?.id || 'wl-sp500-top';
}

export function setActiveWatchlistId(id: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(ACTIVE_WATCHLIST_KEY, id);
    }
  } catch (err) {
    // fallback
  }
}

/**
 * Exports all custom watchlists to a formatted JSON string for backup/sharing.
 */
export function exportWatchlistsToJSON(watchlists: Watchlist[]): string {
  return JSON.stringify(
    {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      watchlists,
    },
    null,
    2
  );
}

/**
 * Imports watchlists from a JSON string.
 */
export function importWatchlistsFromJSON(
  existingWatchlists: Watchlist[],
  jsonStr: string
): Watchlist[] {
  try {
    const parsed = JSON.parse(jsonStr);
    const importedLists: any[] = Array.isArray(parsed) ? parsed : parsed.watchlists;

    if (!Array.isArray(importedLists)) {
      throw new Error('Invalid JSON structure: expected array of watchlists.');
    }

    const currentMap = new Map<string, Watchlist>();
    existingWatchlists.forEach((wl) => currentMap.set(wl.id, wl));

    const now = new Date().toISOString();
    importedLists.forEach((imp, impIdx) => {
      if (imp.name && Array.isArray(imp.symbols)) {
        const cleanSymbols = Array.from(
          new Set(imp.symbols.map((s: string) => String(s).trim().toUpperCase()).filter(Boolean))
        );
        const id = imp.id && !imp.id.startsWith('wl-sp500-') ? imp.id : `wl-imported-${Date.now()}-${impIdx + 1}`;

        currentMap.set(id, {
          id,
          name: String(imp.name).trim(),
          description: String(imp.description || 'Imported custom list'),
          symbols: cleanSymbols as string[],
          isDefault: false,
          color: imp.color || 'purple',
          createdAt: imp.createdAt || now,
          updatedAt: now,
        });
      }
    });

    const merged = Array.from(currentMap.values());
    saveWatchlists(merged);
    return merged;
  } catch (err: any) {
    throw new Error(`Failed to import watchlists: ${err.message}`);
  }
}

/**
 * Converts a single watchlist to CSV string format.
 */
export function exportWatchlistToCSV(watchlist: Watchlist): string {
  const headers = ['Watchlist Name', 'Symbol', 'Description'];
  const rows = watchlist.symbols.map((sym) => [
    `"${watchlist.name.replace(/"/g, '""')}"`,
    `"${sym}"`,
    `"${watchlist.description.replace(/"/g, '""')}"`,
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}
