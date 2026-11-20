import { useEffect, useState } from 'react';

export interface MarketPulsePayload {
  type: 'connected' | 'pulse';
  serverTimeUtc: string;
  uptimeSeconds: number;
  usedRequests: number;
  cachedSymbolsCount: number;
  consecutiveSuccessfulScans: number;
  lastScanTimestampIso: string | null;
  status: 'OPTIMAL' | 'DEGRADED';
}

export function useMarketStream(enabled: boolean = true) {
  const [connected, setConnected] = useState(false);
  const [lastPulse, setLastPulse] = useState<MarketPulsePayload | null>(null);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || typeof EventSource === 'undefined') {
      return;
    }

    const source = new EventSource('/api/stream');

    const handlePulse = (evt: MessageEvent) => {
      try {
        const parsed = JSON.parse(evt.data) as MarketPulsePayload;
        setConnected(true);
        setLastPulse(parsed);
        window.dispatchEvent(new CustomEvent('market-stream-pulse', { detail: parsed }));
      } catch {
        // Ignore malformed frame
      }
    };

    source.addEventListener('market-pulse', handlePulse as EventListener);
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);

    return () => {
      source.removeEventListener('market-pulse', handlePulse as EventListener);
      source.close();
      setConnected(false);
    };
  }, [enabled]);

  return { connected, lastPulse };
}
