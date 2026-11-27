import { useState, useEffect, useCallback, useRef } from 'react';
import type { AlpacaOverviewDTO, JournalSyncResult } from '../utils/alpacaJournalSync';
import { mapAlpacaOrdersToJournalEntries } from '../utils/alpacaJournalSync';
import {
  JournalEntry,
  loadJournalEntries,
  saveJournalEntries,
  createJournalEntryInFirestore,
  updateJournalEntryInFirestore,
} from '../utils/tradeJournal';
import { auth } from '../lib/firebase';
import { fetchJsonSafe } from '../utils/safeFetchJson';
import { recordAuditEventToLedger, computeConfigDigest } from '../utils/auditLedger';
import { loadSettings } from '../utils/masterPlanCore';
import type { MarketHealthReport } from '../utils/marketHealthEngine';
import {
  storeEntryMarketContextSnapshot,
  type EntryMarketContext,
} from '../utils/entryMarketContext';
import {
  loadActiveMemoryState,
  saveActiveMemoryState,
  syncClosedJournalEntriesToActiveMemory,
} from '../utils/activeLearningEngine';

async function getAlpacaAuthorizationHeaders(): Promise<Record<string, string>> {
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Sign in with an authorized account to access Alpaca Paper.');
  }
  return { Authorization: `Bearer ${await user.getIdToken()}` };
}

export interface AlpacaOptionContractDTO {
  id: string;
  symbol: string;
  name: string;
  underlying_symbol: string;
  expiration_date: string;
  type: 'put' | 'call';
  strike_price: number;
  close_price: number | null;
  open_interest: number | null;
  tradable: boolean;
}

export interface AlpacaOrderInput {
  symbol: string;
  side: 'buy' | 'sell';
  qty: number;
  type?: 'market' | 'limit' | 'stop' | 'stop_limit';
  time_in_force?: 'day' | 'gtc';
  limit_price?: number;
  stop_price?: number;
  client_order_id?: string;
  entryMarketContext?: EntryMarketContext | null;
}

export function syncAlpacaOverviewToLocalJournal(
  overview: AlpacaOverviewDTO,
  marketHealth?: MarketHealthReport | null
): JournalSyncResult {
  const existing = loadJournalEntries();
  if (!overview.configured || !overview.account) {
    return {
      entries: existing,
      addedCount: 0,
      updatedCount: 0,
      totalAlpacaEntries: existing.filter((e) => e.tags.includes('Alpaca Paper')).length,
    };
  }

  const prevById = new Map<string, JournalEntry>(existing.map((e) => [e.id, e]));
  const result = mapAlpacaOrdersToJournalEntries(
    overview.orders,
    overview.positions,
    existing,
    marketHealth
  );

  // Automatically feed newly closed Alpaca lots into Active Learning Memory
  try {
    const currentMem = loadActiveMemoryState();
    const memSync = syncClosedJournalEntriesToActiveMemory(currentMem, result.entries, marketHealth);
    if (memSync.ingestedCount > 0) {
      saveActiveMemoryState(memSync.updatedState);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('trullas-active-memory-updated'));
      }
    }
  } catch (err) {
    console.warn('Auto active-memory sync skipped:', err);
  }

  if (result.addedCount > 0 || result.updatedCount > 0) {
    saveJournalEntries(result.entries);
    recordAuditEventToLedger({
      eventType: 'ALPACA_JOURNAL_SYNCED',
      symbol: 'PORTFOLIO',
      configDigest: computeConfigDigest(loadSettings()),
      payload: {
        addedCount: result.addedCount,
        updatedCount: result.updatedCount,
        totalAlpacaEntries: result.totalAlpacaEntries,
      },
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('trullas-journal-updated', {
          detail: {
            addedCount: result.addedCount,
            updatedCount: result.updatedCount,
            totalAlpacaEntries: result.totalAlpacaEntries,
          },
        })
      );
    }

    if (auth.currentUser) {
      for (const entry of result.entries) {
        if (!entry.tags.includes('Alpaca Paper')) continue;
        const prev = prevById.get(entry.id);
        if (!prev) {
          createJournalEntryInFirestore(entry).catch((err) =>
            console.warn('Firestore Alpaca sync create skipped:', err)
          );
        } else if (
          prev.status !== entry.status ||
          prev.exitPrice !== entry.exitPrice ||
          prev.realizedPnL !== entry.realizedPnL ||
          prev.tags.length !== entry.tags.length
        ) {
          updateJournalEntryInFirestore(entry.id, {
            status: entry.status,
            exitPrice: entry.exitPrice,
            exitDate: entry.exitDate,
            realizedPnL: entry.realizedPnL,
            pnlPercent: entry.pnlPercent,
            notes: entry.notes,
            tags: entry.tags,
            executionRating: entry.executionRating,
          }).catch((err) => console.warn('Firestore Alpaca sync update skipped:', err));
        }
      }
    }
  }

  return result;
}

export async function fetchAlpacaOptionContracts(params: {
  underlying: string;
  type?: 'put' | 'call';
  minDte?: number;
  maxDte?: number;
  maxStrike?: number;
  minStrike?: number;
  limit?: number;
}): Promise<{ ok: boolean; contracts: AlpacaOptionContractDTO[]; error?: string }> {
  const qs = new URLSearchParams({
    underlying: params.underlying,
    type: params.type || 'put',
  });
  if (params.minDte !== undefined) qs.set('minDte', String(params.minDte));
  if (params.maxDte !== undefined) qs.set('maxDte', String(params.maxDte));
  if (params.maxStrike !== undefined) qs.set('maxStrike', String(params.maxStrike));
  if (params.minStrike !== undefined) qs.set('minStrike', String(params.minStrike));
  if (params.limit !== undefined) qs.set('limit', String(params.limit));

  let headers: Record<string, string>;
  try {
    headers = await getAlpacaAuthorizationHeaders();
  } catch (error) {
    return {
      ok: false,
      contracts: [],
      error: error instanceof Error ? error.message : 'Alpaca authentication failed.',
    };
  }
  const resp = await fetchJsonSafe<{ contracts?: AlpacaOptionContractDTO[]; error?: string }>(
    `/api/alpaca/options/contracts?${qs.toString()}`,
    { headers }
  );
  if (!resp.ok) {
    return {
      ok: false,
      contracts: [],
      error: resp.error || `HTTP ${resp.status}`,
    };
  }
  return {
    ok: true,
    contracts: Array.isArray(resp.data?.contracts) ? resp.data.contracts : [],
  };
}

export function useAlpacaPaper(options: { pollMs?: number; marketHealth?: MarketHealthReport | null } = {}) {
  const pollMs = options.pollMs ?? 30000;
  const marketHealthRef = useRef<MarketHealthReport | null>(options.marketHealth ?? null);
  useEffect(() => {
    marketHealthRef.current = options.marketHealth ?? null;
  }, [options.marketHealth]);
  const [overview, setOverview] = useState<AlpacaOverviewDTO | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncSummary, setLastSyncSummary] = useState<{
    addedCount: number;
    updatedCount: number;
    totalAlpacaEntries: number;
    syncedAt: string;
  } | null>(null);

  const mountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const refresh = useCallback(async (): Promise<AlpacaOverviewDTO | null> => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const headers = await getAlpacaAuthorizationHeaders();
      const resp = await fetchJsonSafe<AlpacaOverviewDTO>('/api/alpaca/overview', {
        headers,
        signal: controller.signal,
      });
      if (!mountedRef.current || controller.signal.aborted) return null;

      if (!resp.ok || !resp.data) {
        setError(resp.error || 'Unable to connect to Alpaca Paper proxy.');
        return null;
      }

      const data = resp.data;
      setOverview(data);
      setError(data.error || null);

      if (data.configured && data.account) {
        const sync = syncAlpacaOverviewToLocalJournal(data, marketHealthRef.current);
        setLastSyncSummary({
          addedCount: sync.addedCount,
          updatedCount: sync.updatedCount,
          totalAlpacaEntries: sync.totalAlpacaEntries,
          syncedAt: new Date().toISOString(),
        });
      }
      return data;
    } catch (err: any) {
      if (err?.name === 'AbortError') return null;
      if (mountedRef.current) {
        setError(err?.message || 'Unable to connect to Alpaca Paper proxy.');
      }
      return null;
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!overview?.configured || pollMs <= 0) return;
    const id = setInterval(() => {
      refresh();
    }, pollMs);
    return () => clearInterval(id);
  }, [overview?.configured, pollMs, refresh]);

  const submitOrder = useCallback(
    async (payload: AlpacaOrderInput): Promise<{ ok: boolean; order?: any; error?: string }> => {
      const { entryMarketContext, ...brokerPayload } = payload;
      const configDigest = computeConfigDigest(loadSettings());
      let authHeaders: Record<string, string>;
      try {
        authHeaders = await getAlpacaAuthorizationHeaders();
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : 'Alpaca authentication failed.',
        };
      }
      const resp = await fetchJsonSafe<{ order?: any; error?: string }>('/api/alpaca/orders', {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(brokerPayload),
        retryOnHtml: false,
      });
      if (!resp.ok) {
        const errMsg = resp.error || `Alpaca order rejected (HTTP ${resp.status})`;
        recordAuditEventToLedger({
          eventType: 'ALPACA_ORDER_REJECTED',
          symbol: brokerPayload.symbol,
          clientOrderId: brokerPayload.client_order_id,
          configDigest,
          payload: {
            side: brokerPayload.side,
            qty: brokerPayload.qty,
            type: brokerPayload.type || 'market',
            error: errMsg,
          },
        });
        return { ok: false, error: errMsg };
      }
      const orderId = String(resp.data?.order?.id || '');
      const clientOrderId = brokerPayload.client_order_id || resp.data?.order?.client_order_id;
      if (entryMarketContext) {
        storeEntryMarketContextSnapshot(
          {
            orderId: orderId || null,
            clientOrderId: clientOrderId || null,
            symbol: brokerPayload.symbol,
            entryDate: entryMarketContext.entryDate,
          },
          entryMarketContext
        );
      }
      recordAuditEventToLedger({
        eventType: 'ALPACA_ORDER_SUBMITTED',
        symbol: brokerPayload.symbol,
        clientOrderId,
        configDigest,
        payload: {
          orderId,
          side: brokerPayload.side,
          qty: brokerPayload.qty,
          type: brokerPayload.type || 'market',
          status: String(resp.data?.order?.status || 'accepted'),
          ...(entryMarketContext
            ? {
                entrySentiment: entryMarketContext.sentimentLabel,
                entryHealthScore: entryMarketContext.healthScore,
                entryVix: entryMarketContext.vix,
                entryVixTerm: entryMarketContext.vixTermStructure,
                entryStructural: entryMarketContext.symbolStructuralRegime || entryMarketContext.spyStructuralRegime,
              }
            : {}),
        },
      });
      await refresh();
      return { ok: true, order: resp.data?.order };
    },
    [refresh]
  );

  const closePosition = useCallback(
    async (
      symbol: string,
      opts?: { qty?: number; percentage?: number; cancelOrders?: boolean }
    ): Promise<{ ok: boolean; order?: any; error?: string }> => {
      const configDigest = computeConfigDigest(loadSettings());
      let authHeaders: Record<string, string>;
      try {
        authHeaders = await getAlpacaAuthorizationHeaders();
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : 'Alpaca authentication failed.',
        };
      }
      const qs = new URLSearchParams();
      if (opts?.qty !== undefined && opts.qty > 0) qs.set('qty', String(opts.qty));
      else if (opts?.percentage !== undefined && opts.percentage > 0 && opts.percentage < 100) {
        qs.set('percentage', String(opts.percentage));
      }
      if (opts?.cancelOrders === true) {
        qs.set('cancel_orders', 'true');
      } else if (opts?.cancelOrders === false) {
        qs.set('cancel_orders', 'false');
      }
      const suffix = qs.toString() ? `?${qs.toString()}` : '';
      const resp = await fetchJsonSafe<{ order?: any; error?: string }>(
        `/api/alpaca/positions/${encodeURIComponent(symbol)}${suffix}`,
        {
          method: 'DELETE',
          headers: authHeaders,
          retryOnHtml: false,
        }
      );
      if (!resp.ok) {
        return { ok: false, error: resp.error || `Alpaca close rejected (HTTP ${resp.status})` };
      }
      recordAuditEventToLedger({
        eventType: 'ALPACA_POSITION_CLOSED',
        symbol,
        configDigest,
        payload: {
          orderId: String(resp.data?.order?.id || ''),
          percentage: opts?.percentage ?? 100,
          qty: opts?.qty ?? null,
        },
      });
      await refresh();
      return { ok: true, order: resp.data?.order };
    },
    [refresh]
  );

  const cancelOrder = useCallback(
    async (orderId: string): Promise<{ ok: boolean; error?: string }> => {
      let authHeaders: Record<string, string>;
      try {
        authHeaders = await getAlpacaAuthorizationHeaders();
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : 'Alpaca authentication failed.',
        };
      }
      const resp = await fetchJsonSafe<{ error?: string }>(
        `/api/alpaca/orders/${encodeURIComponent(orderId)}`,
        {
          method: 'DELETE',
          headers: authHeaders,
          retryOnHtml: false,
        }
      );
      if (!resp.ok) {
        return { ok: false, error: resp.error || `Cancel rejected (HTTP ${resp.status})` };
      }
      await refresh();
      return { ok: true };
    },
    [refresh]
  );

  return {
    overview,
    loading,
    error,
    lastSyncSummary,
    refresh,
    submitOrder,
    closePosition,
    cancelOrder,
  };
}
