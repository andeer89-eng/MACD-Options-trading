export interface Watchlist {
  id: string;
  name: string;
  symbols: string[];
}

const STORAGE_KEY = 'trullas_watchlists';

export const getWatchlists = (): Watchlist[] => {
  const data = localStorage.getItem(STORAGE_KEY);
  return data ? JSON.parse(data) : [];
};

export const saveWatchlists = (watchlists: Watchlist[]): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(watchlists));
};

export const addWatchlist = (name: string): Watchlist => {
  const watchlists = getWatchlists();
  const newWatchlist: Watchlist = {
    id: crypto.randomUUID(),
    name,
    symbols: [],
  };
  saveWatchlists([...watchlists, newWatchlist]);
  return newWatchlist;
};

export const deleteWatchlist = (id: string): void => {
  const watchlists = getWatchlists();
  saveWatchlists(watchlists.filter(w => w.id !== id));
};

export const addSymbolToWatchlist = (watchlistId: string, symbol: string): void => {
  const watchlists = getWatchlists();
  const updated = watchlists.map(w => {
    if (w.id === watchlistId && !w.symbols.includes(symbol)) {
      return { ...w, symbols: [...w.symbols, symbol] };
    }
    return w;
  });
  saveWatchlists(updated);
};

export const removeSymbolFromWatchlist = (watchlistId: string, symbol: string): void => {
  const watchlists = getWatchlists();
  const updated = watchlists.map(w => {
    if (w.id === watchlistId) {
      return { ...w, symbols: w.symbols.filter(s => s !== symbol) };
    }
    return w;
  });
  saveWatchlists(updated);
};
