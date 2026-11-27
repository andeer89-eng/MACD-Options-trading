import { useState, useEffect, useRef, useCallback } from 'react';
import { Candle, IndicatorPoint, DivergenceSetup, filterActiveDivergences } from '../utils/trullasStrategy';
import { fetchJsonSafe } from '../utils/safeFetchJson';

export interface FeedMetadata {
  isLiveFeed: boolean;
  source: string;
  exchange: string;
  currency: string;
  regularMarketPrice?: number;
  chartPreviousClose?: number;
  exchangeTimezone: string;
  lastCandleTimestamp?: number;
  serverTimeUtc: string;
}

interface UseChartDataParams {
  symbol: string;
  timeframe: string;
  chartRange: string;
  isOfsActive: boolean;
}

export function useChartData({
  symbol,
  timeframe,
  chartRange,
  isOfsActive,
}: UseChartDataParams) {
  const [loading, setLoading] = useState(false);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [indicatorPoints, setIndicatorPoints] = useState<IndicatorPoint[]>([]);
  const [divergences, setDivergences] = useState<DivergenceSetup[]>([]);
  const [secData, setSecData] = useState<any>(null);
  const [feedMeta, setFeedMeta] = useState<FeedMetadata | null>(null);
  const [activeSetup, setActiveSetup] = useState<DivergenceSetup | null>(null);
  const [ltfCandles, setLtfCandles] = useState<Candle[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [countdown, setCountdown] = useState(15);

  const chartReqIdRef = useRef<number>(0);
  const chartAbortRef = useRef<AbortController | null>(null);
  const ltfAbortRef = useRef<AbortController | null>(null);

  const fetchLtfData = useCallback(async () => {
    ltfAbortRef.current?.abort();
    if (!isOfsActive || !(timeframe === '5m' || timeframe === '15m' || timeframe === '1h')) {
      setLtfCandles([]);
      return;
    }
    const controller = new AbortController();
    ltfAbortRef.current = controller;
    const ltfTf = timeframe === '1h' ? '5m' : '1m';
    const ltfRange = ltfTf === '1m' ? '5d' : '1mo';
    try {
      const ltfResp = await fetchJsonSafe<{ candles?: Candle[] }>(
        `/api/candles?symbol=${encodeURIComponent(symbol)}&timeframe=${ltfTf}&range=${ltfRange}`,
        { signal: controller.signal }
      );
      if (controller.signal.aborted) return;
      setLtfCandles(ltfResp.ok && Array.isArray(ltfResp.data?.candles) ? ltfResp.data.candles : []);
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return;
      if (!controller.signal.aborted) setLtfCandles([]);
    }
  }, [isOfsActive, symbol, timeframe]);

  const loadChartData = useCallback(
    async (isBackground = false) => {
      const reqId = ++chartReqIdRef.current;
      chartAbortRef.current?.abort();
      const controller = new AbortController();
      chartAbortRef.current = controller;

      if (!isBackground) setLoading(true);
      try {
        const rangeByTimeframe: Record<string, string> = {
          '1m': '5d',
          '5m': '1mo',
          '15m': '1mo',
          '1h': '6mo',
          '1d': '1y',
        };
        const reqRange = chartRange || rangeByTimeframe[timeframe] || '1y';

        const resp = await fetchJsonSafe<{
          candles?: Candle[];
          indicatorPoints?: IndicatorPoint[];
          divergences?: DivergenceSetup[];
          sec?: any;
          feedMeta?: FeedMetadata;
        }>(
          `/api/candles?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}&range=${reqRange}`,
          { signal: controller.signal }
        );
        if (reqId !== chartReqIdRef.current) return;
        if (resp.ok && resp.data) {
          const data = resp.data;
          const nextCandles = data.candles || [];
          const activeDivergences = filterActiveDivergences(data.divergences || [], nextCandles);
          setCandles(nextCandles);
          setIndicatorPoints(data.indicatorPoints || []);
          setDivergences(activeDivergences);
          setSecData(data.sec || null);
          setFeedMeta(data.feedMeta || null);
          setActiveSetup(activeDivergences.length > 0 ? activeDivergences[0] : null);
        }
        if (isBackground) {
          void fetchLtfData();
        }
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') return;
        console.error('Failed to load chart data', e);
      } finally {
        if (!isBackground && reqId === chartReqIdRef.current) setLoading(false);
      }
    },
    [symbol, timeframe, chartRange, fetchLtfData]
  );

  // Auto-refresh countdown timer (every 15s)
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      setCountdown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [autoRefresh, symbol, timeframe, chartRange]);

  useEffect(() => {
    if (!autoRefresh || countdown > 0) return;
    setCountdown(15);
    loadChartData(true);
  }, [autoRefresh, countdown, loadChartData]);

  // Reload whenever symbol, timeframe, or chartRange changes
  useEffect(() => {
    loadChartData();
    setCountdown(15);
  }, [symbol, timeframe, chartRange]);

  useEffect(() => {
    return () => {
      chartAbortRef.current?.abort();
      ltfAbortRef.current?.abort();
    };
  }, []);

  // Load LTF bars cleanly whenever OFS status, symbol, or timeframe changes
  useEffect(() => {
    void fetchLtfData();
    return () => {
      ltfAbortRef.current?.abort();
    };
  }, [fetchLtfData]);

  return {
    loading,
    candles,
    indicatorPoints,
    divergences,
    secData,
    feedMeta,
    activeSetup,
    setActiveSetup,
    ltfCandles,
    autoRefresh,
    setAutoRefresh,
    countdown,
    loadChartData,
  };
}
