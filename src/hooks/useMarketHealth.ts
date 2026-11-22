import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchJsonSafe } from '../utils/safeFetchJson';
import type { MarketHealthReport } from '../utils/marketHealthEngine';

export function useMarketHealth(options: { autoPollMs?: number } = {}) {
  const autoPollMs = options.autoPollMs ?? 120_000;
  const [report, setReport] = useState<MarketHealthReport | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const refresh = useCallback(async (forceRefresh: boolean = false): Promise<MarketHealthReport | null> => {
    try {
      const resp = await fetchJsonSafe<MarketHealthReport & { error?: string }>(
        `/api/market-health${forceRefresh ? '?refresh=true' : ''}`
      );
      if (!mountedRef.current) return null;
      if (resp.ok && resp.data && resp.data.isLive) {
        setReport(resp.data);
        setError(null);
        return resp.data;
      }
      setError(resp.data?.error || resp.error || 'Market Health feed unavailable.');
      return null;
    } catch (e: any) {
      if (mountedRef.current) {
        setError(e?.message || 'Unable to load Market Health telemetry.');
      }
      return null;
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    refresh(false);
    const onGlobalRefresh = () => refresh(true);
    window.addEventListener('market-data-refreshed', onGlobalRefresh);

    const timer =
      autoPollMs > 0
        ? setInterval(() => {
            if (typeof document !== 'undefined' && document.hidden) return;
            refresh(false);
          }, autoPollMs)
        : null;

    return () => {
      mountedRef.current = false;
      window.removeEventListener('market-data-refreshed', onGlobalRefresh);
      if (timer) clearInterval(timer);
    };
  }, [autoPollMs, refresh]);

  return { report, loading, error, refresh };
}
