import React, { useState, useEffect } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { Watchlist, getWatchlists, addWatchlist, deleteWatchlist, addSymbolToWatchlist, removeSymbolFromWatchlist } from '../utils/watchlist';

interface WatchlistManagerProps {
  onWatchlistSelect: (symbols: string[] | null) => void;
}

export const WatchlistManager: React.FC<WatchlistManagerProps> = ({ onWatchlistSelect }) => {
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [newName, setNewName] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newSymbol, setNewSymbol] = useState('');

  useEffect(() => {
    setWatchlists(getWatchlists());
  }, []);

  const handleCreate = () => {
    if (newName.trim()) {
      addWatchlist(newName);
      setWatchlists(getWatchlists());
      setNewName('');
    }
  };

  const handleDelete = (id: string) => {
    deleteWatchlist(id);
    setWatchlists(getWatchlists());
    if (selectedId === id) {
      setSelectedId(null);
      onWatchlistSelect(null);
    }
  };

  const handleAddSymbol = (id: string) => {
    if (newSymbol.trim()) {
      addSymbolToWatchlist(id, newSymbol.toUpperCase());
      setWatchlists(getWatchlists());
      setNewSymbol('');
    }
  };

  const handleSelect = (watchlist: Watchlist) => {
    setSelectedId(watchlist.id);
    onWatchlistSelect(watchlist.symbols);
  };

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 text-white">
      <h3 className="text-lg font-bold mb-4">Watchlist Manager</h3>
      <div className="flex gap-2 mb-4">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New list name"
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 flex-grow"
        />
        <button onClick={handleCreate} className="bg-blue-600 hover:bg-blue-700 rounded p-1">
          <Plus size={20} />
        </button>
      </div>

      <div className="space-y-2">
        {watchlists.map((w, wIdx) => (
          <div key={`wl-${w.id}-${wIdx}`} className={`p-2 rounded ${selectedId === w.id ? 'bg-blue-900' : 'bg-gray-800'}`}>
            <div className="flex justify-between items-center mb-2">
              <span className="cursor-pointer" onClick={() => handleSelect(w)}>{w.name}</span>
              <button onClick={() => handleDelete(w.id)}><Trash2 size={16} className="text-red-400" /></button>
            </div>
            {selectedId === w.id && (
              <div className="space-y-1">
                <div className="flex gap-1">
                    <input
                      value={newSymbol}
                      onChange={(e) => setNewSymbol(e.target.value)}
                      placeholder="Symbol"
                      className="bg-gray-700 rounded px-1 py-0.5 text-sm w-full"
                    />
                    <button onClick={() => handleAddSymbol(w.id)} className="bg-green-600 rounded px-2">+</button>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {w.symbols.map((s, sIdx) => (
                    <span key={`wl-sym-${w.id}-${s}-${sIdx}`} className="bg-gray-600 rounded px-2 py-0.5 text-xs flex items-center">
                      {s}
                      <button onClick={() => removeSymbolFromWatchlist(w.id, s)} className="ml-1"><X size={12}/></button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
