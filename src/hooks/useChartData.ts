import { useState, useEffect, useRef, useCallback } from 'react';
import { Candle, IndicatorPoint, DivergenceSetup } from '../utils/trullasStrategy';

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

        const res = await fetch(
          `/api/candles?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}&range=${reqRange}`,
          { signal: controller.signal }
        );
        if (reqId !== chartReqIdRef.current) return;
        if (res.ok) {
          const data = await res.json();
          if (reqId !== chartReqIdRef.current) return;
          setCandles(data.candles || []);
          setIndicatorPoints(data.indicatorPoints || []);
          setDivergences(data.divergences || []);
          setSecData(data.sec || null);
          setFeedMeta(data.feedMeta || null);
          if (data.divergences && data.divergences.length > 0) {
            setActiveSetup(data.divergences[0]);
          } else {
            setActiveSetup(null);
          }
        }

        if (isOfsActive && (timeframe === '5m' || timeframe === '15m' || timeframe === '1h')) {
          const ltfTf = timeframe === '1h' ? '5m' : '1m';
          const ltfRange = ltfTf === '1m' ? '5d' : '1mo';
          try {
            const ltfRes = await fetch(
              `/api/candles?symbol=${encodeURIComponent(symbol)}&timeframe=${ltfTf}&range=${ltfRange}`,
              { signal: controller.signal }
            );
            if (reqId !== chartReqIdRef.current) return;
            if (ltfRes.ok) {
              const ltfJson = await ltfRes.json();
              if (reqId !== chartReqIdRef.current) return;
              setLtfCandles(Array.isArray(ltfJson.candles) ? ltfJson.candles : []);
            } else {
              setLtfCandles([]);
            }
          } catch (err) {
            if ((err as Error)?.name === 'AbortError') return;
            if (reqId === chartReqIdRef.current) setLtfCandles([]);
          }
        } else {
          setLtfCandles([]);
        }
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') return;
        console.error('Failed to load chart data', e);
      } finally {
        if (!isBackground && reqId === chartReqIdRef.current) setLoading(false);
      }
    },
    [symbol, timeframe, chartRange, isOfsActive]
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
    };
  }, []);

  // Load LTF bars immediately when OFS toggles ON on intraday timeframes
  useEffect(() => {
    if (!isOfsActive || !(timeframe === '5m' || timeframe === '15m' || timeframe === '1h')) {
      setLtfCandles([]);
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    const ltfTf = timeframe === '1h' ? '5m' : '1m';
    const ltfRange = ltfTf === '1m' ? '5d' : '1mo';
    fetch(`/api/candles?symbol=${encodeURIComponent(symbol)}&timeframe=${ltfTf}&range=${ltfRange}`, {
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!cancelled) {
          setLtfCandles(Array.isArray(json?.candles) ? json.candles : []);
        }
      })
      .catch((err) => {
        if ((err as Error)?.name === 'AbortError') return;
        if (!cancelled) setLtfCandles([]);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isOfsActive, symbol, timeframe]);

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
