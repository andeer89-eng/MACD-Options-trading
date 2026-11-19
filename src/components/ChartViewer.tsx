import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  AreaSeries,
  BarSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  LineType,
  PriceScaleMode,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
} from 'lightweight-charts';
import {
  TrendingUp,
  TrendingDown,
  Layers,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  RefreshCw,
  FileText,
  Calculator,
  Sliders,
  Eye,
  Info,
  Sparkles,
  RotateCcw,
  Check,
  X,
  Activity,
  Clock,
  ShieldCheck,
  Crosshair,
  Minus,
  GitCommit,
  Target,
  Ruler,
  Trash2,
  Search,
  Grid,
  Columns,
  Square,
  BarChart2,
  LineChart,
  CheckSquare,
  Plus,
  Code2,
  AlertTriangle,
  Play,
} from 'lucide-react';
import { Candle, IndicatorPoint, DivergenceSetup } from '../utils/trullasStrategy';
import { calculateNadarayaWatsonEnvelope } from '../utils/luxalgoIndicators';
import { getCompanyName } from '../data/sp500Universe';
import {
  loadAllIndicators,
  saveAllIndicators,
  importCustomPineIndicator,
  CustomPineIndicator,
  IndicatorCategory,
} from '../utils/indicatorLibrary';
import {
  calculateCustomIndicatorById,
  calculateOrderFlowCustomIndicator,
  CalculatedIndicatorSeries,
} from '../utils/customIndicatorCalculator';
import {
  executePineScriptIndicator,
  buildSampleValidationCandles,
  type PineExecutionResult,
} from '../utils/pineScriptExecutor';
import { PineScriptOverlay } from './PineScriptOverlay';
import { calculateHeikinAshi } from '../utils/heikinAshi';
import { calculateOrderFlowStrategy, OfsReport } from '../utils/orderFlowStrategy';
import {
  OrderFlowOverlay,
  OrderFlowHudPanel,
  OfsVisualToggles,
  DEFAULT_OFS_TOGGLES,
} from './OrderFlowOverlay';
import { calculateQuantumMarketXray, QmxReport } from '../utils/quantumMarketXray';
import {
  QuantumMarketXrayOverlay,
  QuantumMarketXrayHudPanel,
  QmxVisualToggles,
  DEFAULT_QMX_TOGGLES,
} from './QuantumMarketXrayOverlay';
import {
  OverlayHudKind,
  resolveVisibleHudDock,
} from '../utils/chartOverlayPrimitives';
import { calculateSuperTrendPro, SuperTrendProReport } from '../utils/superTrendPro';
import {
  SuperTrendProOverlay,
  SuperTrendVisualToggles,
  DEFAULT_SUPERTREND_TOGGLES,
} from './SuperTrendProOverlay';

interface ChartViewerProps {
  initialSymbol?: string;
  onOpenCalculator?: (setup: DivergenceSetup) => void;
}

interface FeedMetadata {
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

export type CandleStyleType = 'candles' | 'heikin-ashi' | 'hollow' | 'line' | 'area';

export const ChartViewer: React.FC<ChartViewerProps> = ({
  initialSymbol = 'AAPL',
  onOpenCalculator,
}) => {
  const [symbol, setSymbol] = useState(initialSymbol);
  const [timeframe, setTimeframe] = useState('1d');
  const [chartRange, setChartRange] = useState('1y');
  const [loading, setLoading] = useState(false);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [indicatorPoints, setIndicatorPoints] = useState<IndicatorPoint[]>([]);
  const [divergences, setDivergences] = useState<DivergenceSetup[]>([]);
  const [secData, setSecData] = useState<any>(null);
  const [feedMeta, setFeedMeta] = useState<FeedMetadata | null>(null);
  const [activeSetup, setActiveSetup] = useState<DivergenceSetup | null>(null);

  // Fullscreen / Expanded View State
  const [isExpanded, setIsExpanded] = useState(false);

  // Candle Style Mode: 'candles' | 'heikin-ashi' | 'hollow' | 'line' | 'area'
  const [candleStyle, setCandleStyle] = useState<CandleStyleType>('candles');

  // Scale Mode: 'linear' | 'logarithmic' | 'percentage'
  const [scaleMode, setScaleMode] = useState<'linear' | 'logarithmic' | 'percentage'>('linear');
  const [autoScale, setAutoScale] = useState<boolean>(true);

  // Chart Engine Mode: 'vela-pro' (Vela Custom Studio) | 'vela-workspace' (LuxAlgo Vela Multi-Chart) | 'svg-fallback'
  const [chartMode, setChartMode] = useState<'vela-pro' | 'vela-workspace' | 'svg-fallback'>('vela-pro');
  const [velaLayout, setVelaLayout] = useState<'1' | '2h' | '2v' | '4'>('4');
  const [showLuxAlgoNWE, setShowLuxAlgoNWE] = useState(true);

  // Indicator Modal & Active Indicators State
  const ACTIVE_INDICATORS_STORAGE_KEY = 'stageledger_active_chart_indicators';
  const [showIndicatorModal, setShowIndicatorModal] = useState(false);
  const [indicatorSearch, setIndicatorSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [libraryIndicators, setLibraryIndicators] = useState<CustomPineIndicator[]>([]);
  const [activeCustomIndicatorIds, setActiveCustomIndicatorIds] = useState<string[]>(() => {
    if (typeof window === 'undefined') return ['supertrend-v9-pro', 'matrix-ai-pro'];
    try {
      const saved = localStorage.getItem(ACTIVE_INDICATORS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore storage errors
    }
    return ['supertrend-v9-pro', 'matrix-ai-pro'];
  });
  const [ltfCandles, setLtfCandles] = useState<Candle[]>([]);

  // Live Bucharest & ET Clocks
  const [bucharestTime, setBucharestTime] = useState('');
  const [marketTime, setMarketTime] = useState('');
  const [showDataAuthModal, setShowDataAuthModal] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [countdown, setCountdown] = useState(15);

  // Drawing Toolbar Active Tool & User Placed Drawings
  const [activeDrawTool, setActiveDrawTool] = useState<string | null>('crosshair');
  const [customPriceLines, setCustomPriceLines] = useState<{ id: string; price: number; label: string; color: string }[]>([]);
  const [showFibOverlay, setShowFibOverlay] = useState(false);
  const [showRulerHUD, setShowRulerHUD] = useState(false);

  // Chart Container References
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const velaWorkspaceRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<IChartApi | null>(null);
  const mainPriceSeriesRef = useRef<ISeriesApi<any> | null>(null);
  const savedLogicalRangeRef = useRef<{ from: number; to: number } | null>(null);
  const lastViewportKeyRef = useRef<string>('');
  const activeDrawToolRef = useRef<string | null>(activeDrawTool);
  const chartReqIdRef = useRef<number>(0);
  const chartAbortRef = useRef<AbortController | null>(null);
  const [chartApi, setChartApi] = useState<IChartApi | null>(null);
  const [mainSeriesApi, setMainSeriesApi] = useState<ISeriesApi<any> | null>(null);
  const [ofsToggles, setOfsToggles] = useState<OfsVisualToggles>(DEFAULT_OFS_TOGGLES);
  const [qmxToggles, setQmxToggles] = useState<QmxVisualToggles>(DEFAULT_QMX_TOGGLES);
  const [superTrendToggles, setSuperTrendToggles] = useState<SuperTrendVisualToggles>(DEFAULT_SUPERTREND_TOGGLES);
  const [preferredHud, setPreferredHud] = useState<OverlayHudKind>('ofs');

  // Universal Pine Script runtime results keyed by indicator ID
  const [pineResultsMap, setPineResultsMap] = useState<Record<string, PineExecutionResult>>({});

  // Inline Pine Script importer state inside fx Indicators modal
  const [showInlineImporter, setShowInlineImporter] = useState(false);
  const [inlinePineCode, setInlinePineCode] = useState('');
  const [inlinePineName, setInlinePineName] = useState('');
  const [inlinePineCategory, setInlinePineCategory] = useState<IndicatorCategory>('Trend');
  const [inlinePineTesting, setInlinePineTesting] = useState(false);
  const [inlinePineError, setInlinePineError] = useState<string | null>(null);
  const [inlinePineStatus, setInlinePineStatus] = useState<{
    valid: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    activeDrawToolRef.current = activeDrawTool;
  }, [activeDrawTool]);

  // Hover Crosshair Legend values
  const [hoverData, setHoverData] = useState<{
    time?: string;
    open?: number;
    high?: number;
    low?: number;
    close?: number;
    volume?: number;
    macd?: number;
    signal?: number;
    hist?: number;
    rsi?: number;
  } | null>(null);

  const isOfsActive = activeCustomIndicatorIds.some(
    (id) => id.toLowerCase().includes('ofs') || id.toLowerCase().includes('order-flow-strategy')
  );

  const isQmxActive = activeCustomIndicatorIds.some((id) => {
    const norm = id.toLowerCase();
    if (norm.includes('qmx') || norm.includes('quantum')) return true;
    const matchInd = libraryIndicators.find((l) => l.id === id);
    if (matchInd && (matchInd.name.toLowerCase().includes('quantum') || matchInd.name.toLowerCase().includes('qmx'))) {
      return true;
    }
    return false;
  });

  const isSuperTrendActive = activeCustomIndicatorIds.some((id) =>
    id.toLowerCase().includes('supertrend')
  );

  // Sync if initialSymbol prop changes
  useEffect(() => {
    if (initialSymbol) setSymbol(initialSymbol);
  }, [initialSymbol]);

  // Load Indicator Library & sync active indicator changes across views
  useEffect(() => {
    setLibraryIndicators(loadAllIndicators());
    const handleSync = () => {
      setLibraryIndicators(loadAllIndicators());
      try {
        const saved = localStorage.getItem(ACTIVE_INDICATORS_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) setActiveCustomIndicatorIds(parsed);
        }
      } catch {
        // ignore storage errors
      }
    };
    window.addEventListener('stageledger:indicators-changed', handleSync);
    return () => window.removeEventListener('stageledger:indicators-changed', handleSync);
  }, []);

  // Strictly sorted, deduplicated candles shared across chart, Pine runtime & flagship overlays
  const uniqueChartCandles = useMemo(() => {
    const sorted = [...candles].sort((a, b) => a.timestamp - b.timestamp);
    const seen = new Set<number>();
    const out: Candle[] = [];
    for (const c of sorted) {
      const sec = Math.floor(c.timestamp / 1000);
      if (!seen.has(sec)) {
        seen.add(sec);
        out.push(c);
      }
    }
    return out;
  }, [candles]);

  const isFlagshipCustomId = (id: string) => {
    const norm = id.toLowerCase();
    if (norm.includes('supertrend')) return true;
    if (norm.includes('ofs') || norm.includes('order-flow-strategy')) return true;
    if (norm.includes('qmx') || norm.includes('quantum')) return true;
    const matchInd = libraryIndicators.find((l) => l.id === id);
    if (
      matchInd &&
      (matchInd.name.toLowerCase().includes('quantum') ||
        matchInd.name.toLowerCase().includes('qmx'))
    ) {
      return true;
    }
    return false;
  };

  // Dynamically compile & execute all active Pine Script indicators (built-ins + any newly imported scripts)
  useEffect(() => {
    if (uniqueChartCandles.length === 0) {
      setPineResultsMap((prev) => (Object.keys(prev).length === 0 ? prev : {}));
      return;
    }

    const runnableIds = activeCustomIndicatorIds.filter((id) => !isFlagshipCustomId(id));
    if (runnableIds.length === 0) {
      setPineResultsMap((prev) => (Object.keys(prev).length === 0 ? prev : {}));
      return;
    }

    let cancelled = false;
    (async () => {
      const nextEntries = await Promise.all(
        runnableIds.map(async (id) => {
          const ind = libraryIndicators.find((item) => item.id === id);
          if (!ind || !ind.pineCode?.trim()) {
            return [id, null] as const;
          }
          const res = await executePineScriptIndicator(ind, uniqueChartCandles, {
            symbol,
            timeframe,
          });
          return [id, res] as const;
        })
      );

      if (cancelled) return;
      const nextMap: Record<string, PineExecutionResult> = {};
      for (const [id, res] of nextEntries) {
        if (res) nextMap[id] = res;
      }
      setPineResultsMap(nextMap);
    })();

    return () => {
      cancelled = true;
    };
  }, [activeCustomIndicatorIds, libraryIndicators, uniqueChartCandles, symbol, timeframe]);

  // Live Clocks Timer
  useEffect(() => {
    const updateClocks = () => {
      const now = new Date();
      try {
        setBucharestTime(
          now.toLocaleTimeString('ro-RO', {
            timeZone: 'Europe/Bucharest',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }) + ' EET'
        );
        setMarketTime(
          now.toLocaleTimeString('en-US', {
            timeZone: 'America/New_York',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }) + ' ET'
        );
      } catch {
        setBucharestTime(now.toLocaleTimeString());
        setMarketTime(now.toLocaleTimeString());
      }
    };
    updateClocks();
    const timer = setInterval(updateClocks, 1000);
    return () => clearInterval(timer);
  }, []);

  // Auto-refresh timer (every 15s)
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
  }, [autoRefresh, countdown, symbol, timeframe, chartRange]);

  // Escape / F / Alt+R keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const targetTag = target?.tagName;
      if (targetTag && ['INPUT', 'TEXTAREA', 'SELECT'].includes(targetTag)) return;
      if (target?.isContentEditable) return;

      if (e.key === 'Escape') {
        if (showIndicatorModal) {
          setShowIndicatorModal(false);
          return;
        }
        if (showDataAuthModal) {
          setShowDataAuthModal(false);
          return;
        }
        if (activeDrawToolRef.current !== 'crosshair') {
          setActiveDrawTool('crosshair');
          return;
        }
        if (isExpanded) {
          setIsExpanded(false);
        }
        return;
      }
      if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'f' || e.key === 'F')) {
        setIsExpanded((prev) => !prev);
      }
      if (e.altKey && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault();
        if (chartInstanceRef.current) {
          chartInstanceRef.current.timeScale().fitContent();
          chartInstanceRef.current.priceScale('right').applyOptions({ autoScale: true });
          setAutoScale(true);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isExpanded, showIndicatorModal, showDataAuthModal]);

  // Load data whenever symbol, timeframe, or chartRange changes
  useEffect(() => {
    loadChartData();
    setCountdown(15);
  }, [symbol, timeframe, chartRange]);

  useEffect(() => {
    return () => {
      chartAbortRef.current?.abort();
    };
  }, []);

  const loadChartData = async (isBackground = false) => {
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

      // Fetch real Lower-Timeframe (LTF) bars when OFS is active on intraday charts
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
  };

  // Load LTF bars immediately when OFS is toggled ON while viewing an intraday chart
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

  // Toggle Custom Indicator
  const toggleIndicator = (id: string) => {
    const norm = id.toLowerCase();
    const wasActive = activeCustomIndicatorIds.includes(id);
    if (!wasActive) {
      if (norm.includes('ofs') || norm.includes('order-flow-strategy')) {
        setPreferredHud('ofs');
      } else if (norm.includes('qmx') || norm.includes('quantum')) {
        setPreferredHud('qmx');
      }
    }
    setActiveCustomIndicatorIds((prev) => {
      const next = prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id];
      try {
        localStorage.setItem(ACTIVE_INDICATORS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

  // Zoom control helpers
  const handleZoomIn = () => {
    if (chartInstanceRef.current) {
      const ts = chartInstanceRef.current.timeScale();
      const range = ts.getVisibleLogicalRange();
      if (range) {
        const mid = (range.from + range.to) / 2;
        const half = (range.to - range.from) * 0.35;
        ts.setVisibleLogicalRange({ from: mid - half, to: mid + half });
      }
    }
  };

  const handleZoomOut = () => {
    if (chartInstanceRef.current) {
      const ts = chartInstanceRef.current.timeScale();
      const range = ts.getVisibleLogicalRange();
      if (range) {
        const mid = (range.from + range.to) / 2;
        const half = (range.to - range.from) * 0.75;
        ts.setVisibleLogicalRange({ from: mid - half, to: mid + half });
      }
    }
  };

  const handleFitContent = () => {
    if (chartInstanceRef.current) {
      chartInstanceRef.current.timeScale().fitContent();
      chartInstanceRef.current.priceScale('right').applyOptions({ autoScale: true });
      setAutoScale(true);
    }
  };

  // Add support/resistance price line at specific price or last close
  const handleAddPriceLine = (explicitPrice?: number) => {
    if (candles.length === 0 && explicitPrice === undefined) return;
    const targetPrice =
      typeof explicitPrice === 'number' && Number.isFinite(explicitPrice)
        ? explicitPrice
        : candles[candles.length - 1].close;
    const newLine = {
      id: `line-${Date.now()}-${Math.round(targetPrice * 100)}`,
      price: targetPrice,
      label: `S/R $${targetPrice.toFixed(2)}`,
      color: '#38bdf8',
    };
    setCustomPriceLines((prev) => [...prev, newLine]);
  };

  const handleClearDrawings = () => {
    setCustomPriceLines([]);
    setShowFibOverlay(false);
    setShowRulerHUD(false);
    setActiveDrawTool('crosshair');
  };

  // ============================================================================
  // RENDER VELA CUSTOM STUDIO (HIGH-PERFORMANCE CANVAS ENGINE)
  // ============================================================================
  useEffect(() => {
    if (chartMode !== 'vela-pro' || !chartContainerRef.current || candles.length === 0) {
      return;
    }

    // Clean up previous chart instance
    if (chartInstanceRef.current) {
      chartInstanceRef.current.remove();
      chartInstanceRef.current = null;
    }

    const container = chartContainerRef.current;
    container.innerHTML = '';
    const containerWidth = container.clientWidth || 800;
    const containerHeight = container.clientHeight > 100 ? container.clientHeight : 0;
    const chartHeight =
      containerHeight > 0
        ? containerHeight
        : isExpanded
        ? Math.max(480, window.innerHeight - 160)
        : 600;

    // Create Chart with high-contrast Dark theme & full TradingView scroll/scale ergonomics
    const chart = createChart(container, {
      width: containerWidth,
      height: chartHeight,
      layout: {
        background: { type: ColorType.Solid, color: '#09090b' },
        textColor: '#a1a1aa',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        attributionLogo: false,
      } as any,
      grid: {
        vertLines: { color: '#18181b', style: LineStyle.Dotted },
        horzLines: { color: '#18181b', style: LineStyle.Dotted },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: '#10b981',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#059669',
        },
        horzLine: {
          color: '#10b981',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#059669',
        },
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: { time: true, price: true },
        axisDoubleClickReset: { time: true, price: true },
      },
      kineticScroll: {
        mouse: true,
        touch: true,
      },
      rightPriceScale: {
        borderColor: '#27272a',
        autoScale,
        mode:
          scaleMode === 'logarithmic'
            ? PriceScaleMode.Logarithmic
            : scaleMode === 'percentage'
            ? PriceScaleMode.Percentage
            : PriceScaleMode.Normal,
        scaleMargins: {
          top: 0.08,
          bottom: 0.22,
        },
      },
      timeScale: {
        borderColor: '#27272a',
        timeVisible: true,
        secondsVisible: false,
        rightBarStaysOnScroll: true,
        rightOffset: isSuperTrendActive ? 18 : 2,
      },
    });
    chartInstanceRef.current = chart;

    // Prepare strictly sorted, deduplicated candle data
    const sortedCandles = [...candles].sort((a, b) => a.timestamp - b.timestamp);
    const uniqueCandles: Candle[] = [];
    const seenTimes = new Set<number>();

    for (const c of sortedCandles) {
      const sec = Math.floor(c.timestamp / 1000);
      if (!seenTimes.has(sec)) {
        seenTimes.add(sec);
        uniqueCandles.push(c);
      }
    }

    // Determine candles according to style (Standard vs Heikin-Ashi)
    const effectiveCandles =
      candleStyle === 'heikin-ashi' ? calculateHeikinAshi(uniqueCandles) : uniqueCandles;

    // 1. Add Main Price Series depending on selected candleStyle
    let mainSeries: any;

    if (candleStyle === 'line') {
      mainSeries = chart.addSeries(LineSeries, {
        color: '#10b981',
        lineWidth: 2,
        priceLineVisible: true,
      }, 0);
      mainSeries.setData(
        effectiveCandles.map((c) => ({
          time: Math.floor(c.timestamp / 1000) as any,
          value: c.close,
        }))
      );
    } else if (candleStyle === 'area') {
      mainSeries = chart.addSeries(AreaSeries, {
        topColor: 'rgba(16, 185, 129, 0.4)',
        bottomColor: 'rgba(16, 185, 129, 0.0)',
        lineColor: '#10b981',
        lineWidth: 2,
        priceLineVisible: true,
      }, 0);
      mainSeries.setData(
        effectiveCandles.map((c) => ({
          time: Math.floor(c.timestamp / 1000) as any,
          value: c.close,
        }))
      );
    } else if (candleStyle === 'hollow') {
      mainSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#09090b',
        downColor: '#f43f5e',
        borderVisible: true,
        borderUpColor: '#10b981',
        borderDownColor: '#f43f5e',
        wickUpColor: '#10b981',
        wickDownColor: '#f43f5e',
      }, 0);
      mainSeries.setData(
        effectiveCandles.map((c) => ({
          time: Math.floor(c.timestamp / 1000) as any,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }))
      );
    } else {
      // Standard Candles & Heikin-Ashi
      mainSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#10b981',
        downColor: '#f43f5e',
        borderVisible: true,
        borderUpColor: '#10b981',
        borderDownColor: '#f43f5e',
        wickUpColor: '#34d399',
        wickDownColor: '#fb7185',
      }, 0);
      mainSeries.setData(
        effectiveCandles.map((c) => ({
          time: Math.floor(c.timestamp / 1000) as any,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }))
      );
    }
    mainPriceSeriesRef.current = mainSeries;

    // 2. Volume Series (Pane 0 bottom overlay)
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: '', // Overlay
    }, 0);

    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    });

    volumeSeries.setData(
      effectiveCandles.map((c) => ({
        time: Math.floor(c.timestamp / 1000) as any,
        value: c.volume,
        color: c.close >= c.open ? 'rgba(16, 185, 129, 0.4)' : 'rgba(244, 63, 94, 0.4)',
      }))
    );

    // 3. Setup Overlays: Fibonacci Retracement PriceLines & Divergence Markers
    const lastClosePrice = effectiveCandles[effectiveCandles.length - 1]?.close ?? 0;
    const setupNearCurrentPrice =
      activeSetup &&
      lastClosePrice > 0 &&
      Math.abs(activeSetup.triggerPrice - lastClosePrice) / lastClosePrice <= 0.18;

    if (activeSetup && setupNearCurrentPrice) {
      mainSeries.createPriceLine({
        price: activeSetup.triggerPrice,
        color: '#10b981',
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: `TRIGGER 23.6% ($${activeSetup.triggerPrice.toFixed(2)})`,
      });

      mainSeries.createPriceLine({
        price: activeSetup.targets.tp1,
        color: '#38bdf8',
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
        title: `TP1 38.2% ($${activeSetup.targets.tp1.toFixed(2)})`,
      });

      mainSeries.createPriceLine({
        price: activeSetup.targets.tp2,
        color: '#f59e0b',
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: `TP2 GOLDEN 61.8% ($${activeSetup.targets.tp2.toFixed(2)})`,
      });

      mainSeries.createPriceLine({
        price: activeSetup.stopLoss,
        color: '#f43f5e',
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: `STOP LOSS ($${activeSetup.stopLoss.toFixed(2)})`,
      });

      const isBull = activeSetup.type.includes('BULLISH');
      const markers: any[] = [];

      if (activeSetup.points[0]) {
        const c = effectiveCandles[activeSetup.points[0].index];
        if (c) {
          markers.push({
            time: Math.floor(c.timestamp / 1000) as any,
            position: isBull ? 'belowBar' : 'aboveBar',
            color: '#38bdf8',
            shape: isBull ? 'arrowUp' : 'arrowDown',
            text: 'P1',
          });
        }
      }
      if (activeSetup.points[1]) {
        const c = effectiveCandles[activeSetup.points[1].index];
        if (c) {
          markers.push({
            time: Math.floor(c.timestamp / 1000) as any,
            position: isBull ? 'belowBar' : 'aboveBar',
            color: '#a855f7',
            shape: isBull ? 'arrowUp' : 'arrowDown',
            text: 'P2',
          });
        }
      }
      if (activeSetup.points[2]) {
        const c = effectiveCandles[activeSetup.points[2].index];
        if (c) {
          markers.push({
            time: Math.floor(c.timestamp / 1000) as any,
            position: isBull ? 'belowBar' : 'aboveBar',
            color: isBull ? '#10b981' : '#f43f5e',
            shape: isBull ? 'arrowUp' : 'arrowDown',
            text: 'P3: TRIGGER READY',
          });
        }
      }

      if (markers.length > 0 && setupNearCurrentPrice) {
        try {
          createSeriesMarkers(mainSeries, markers);
        } catch (e) {
          console.warn('Series marker creation error:', e);
        }
      }
    }

    // Custom S/R drawings created by user
    for (const pl of customPriceLines) {
      mainSeries.createPriceLine({
        price: pl.price,
        color: pl.color,
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: pl.label,
      });
    }

    // 4. Fibonacci Retracement Grid Overlay (if toggled)
    if (showFibOverlay && effectiveCandles.length > 0) {
      const highs = effectiveCandles.map((c) => c.high);
      const lows = effectiveCandles.map((c) => c.low);
      const maxH = Math.max(...highs);
      const minL = Math.min(...lows);
      const diff = maxH - minL;

      const fibLevels = [
        { ratio: 1.0, color: '#f43f5e', name: 'Fib 100%' },
        { ratio: 0.786, color: '#fb923c', name: 'Fib 78.6%' },
        { ratio: 0.618, color: '#f59e0b', name: 'Golden Pocket 61.8%' },
        { ratio: 0.5, color: '#eab308', name: 'Fib 50.0%' },
        { ratio: 0.382, color: '#38bdf8', name: 'Fib 38.2%' },
        { ratio: 0.236, color: '#10b981', name: 'Fib 23.6%' },
        { ratio: 0.0, color: '#10b981', name: 'Fib 0%' },
      ];

      for (const fib of fibLevels) {
        const p = minL + diff * fib.ratio;
        mainSeries.createPriceLine({
          price: p,
          color: fib.color,
          lineWidth: fib.ratio === 0.618 ? 2 : 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: `${fib.name} ($${p.toFixed(2)})`,
        });
      }
    }

    // 5. Pillar 1: MACD Pane (Pane 1)
    const macdSeries = chart.addSeries(LineSeries, {
      color: '#38bdf8',
      lineWidth: 2,
      priceLineVisible: false,
    }, 1);

    const signalSeries = chart.addSeries(LineSeries, {
      color: '#fb923c',
      lineWidth: 1,
      priceLineVisible: false,
    }, 1);

    const histSeries = chart.addSeries(HistogramSeries, {
      priceLineVisible: false,
    }, 1);

    const macdData = [];
    const signalData = [];
    const histData = [];

    for (let i = 0; i < uniqueCandles.length; i++) {
      const time = Math.floor(uniqueCandles[i].timestamp / 1000) as any;
      const ind = indicatorPoints[i];
      if (ind) {
        macdData.push({ time, value: ind.macd });
        signalData.push({ time, value: ind.signal });
        histData.push({
          time,
          value: ind.histogram,
          color: ind.histogram >= 0 ? 'rgba(16, 185, 129, 0.75)' : 'rgba(244, 63, 94, 0.75)',
        });
      }
    }

    macdSeries.setData(macdData);
    signalSeries.setData(signalData);
    histSeries.setData(histData);

    histSeries.createPriceLine({
      price: 0,
      color: '#52525b',
      lineWidth: 1,
      lineStyle: LineStyle.Dotted,
      axisLabelVisible: false,
      title: '0',
    });

    // 6. Pillar 2: RSI Pane (Pane 2)
    const rsiSeries = chart.addSeries(LineSeries, {
      color: '#c084fc',
      lineWidth: 2,
      priceLineVisible: false,
    }, 2);

    const rsiData = [];
    for (let i = 0; i < uniqueCandles.length; i++) {
      const time = Math.floor(uniqueCandles[i].timestamp / 1000) as any;
      const ind = indicatorPoints[i];
      if (ind) {
        rsiData.push({ time, value: ind.rsi });
      }
    }
    rsiSeries.setData(rsiData);

    rsiSeries.createPriceLine({
      price: 70,
      color: '#f43f5e',
      lineWidth: 1,
      lineStyle: LineStyle.Dotted,
      axisLabelVisible: true,
      title: '70 OB',
    });

    rsiSeries.createPriceLine({
      price: 50,
      color: '#52525b',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: false,
      title: '50',
    });

    rsiSeries.createPriceLine({
      price: 30,
      color: '#10b981',
      lineWidth: 1,
      lineStyle: LineStyle.Dotted,
      axisLabelVisible: true,
      title: '30 OS',
    });

    // 7. LuxAlgo Nadaraya-Watson Envelope (NWE) overlay
    if (showLuxAlgoNWE) {
      const nwe = calculateNadarayaWatsonEnvelope(uniqueCandles, 8.0, 2.5);
      if (nwe && nwe.yhat && nwe.yhat.length > 0) {
        const nweCenterSeries = chart.addSeries(LineSeries, {
          color: 'rgba(56, 189, 248, 0.7)',
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          priceLineVisible: false,
        }, 0);

        const nweUpperSeries = chart.addSeries(LineSeries, {
          color: 'rgba(244, 63, 94, 0.8)',
          lineWidth: 1,
          priceLineVisible: false,
        }, 0);

        const nweLowerSeries = chart.addSeries(LineSeries, {
          color: 'rgba(16, 185, 129, 0.8)',
          lineWidth: 1,
          priceLineVisible: false,
        }, 0);

        const centerData = [];
        const upperData = [];
        const lowerData = [];

        for (let i = 0; i < nwe.timestamps.length; i++) {
          const t = Math.floor(nwe.timestamps[i] / 1000) as any;
          centerData.push({ time: t, value: nwe.yhat[i] });
          upperData.push({ time: t, value: nwe.upper[i] });
          lowerData.push({ time: t, value: nwe.lower[i] });
        }

        nweCenterSeries.setData(centerData);
        nweUpperSeries.setData(upperData);
        nweLowerSeries.setData(lowerData);
      }
    }

    // 8. Render Active Custom Indicators from Library (Universal PineTS + Flagship Fallbacks)
    for (const customId of activeCustomIndicatorIds) {
      if (isFlagshipCustomId(customId)) {
        // Flagship overlays (SuperTrendProOverlay, OrderFlowOverlay, QuantumMarketXrayOverlay) render their own full suites
        continue;
      }

      const pineRes = pineResultsMap[customId];
      if (pineRes) {
        if (!pineRes.ok) continue;
        const paneIdx = pineRes.overlay ? 0 : 3;
        let subPaneAnchorSeries: ISeriesApi<any> | null = null;

        for (const plot of pineRes.plots) {
          if (plot.style === 'circles' || plot.style === 'cross' || plot.style === 'linebr') {
            if (pineRes.overlay) {
              // Handled on Pane 0 canvas by PineScriptOverlay
              continue;
            }
            const ptSeries = chart.addSeries(LineSeries, {
              color: plot.color,
              lineWidth: (plot.lineWidth as any) || 2,
              lineVisible: plot.style === 'linebr',
              pointMarkersVisible: plot.style !== 'linebr',
              priceLineVisible: false,
            }, paneIdx);
            ptSeries.setData(
              plot.points.map((pt) => ({
                time: pt.time as any,
                value: pt.value,
              }))
            );
            if (!subPaneAnchorSeries) subPaneAnchorSeries = ptSeries;
          } else if (plot.style === 'histogram' || plot.style === 'columns') {
            const histSubSeries = chart.addSeries(HistogramSeries, {
              color: plot.color,
              priceLineVisible: false,
            }, paneIdx);
            histSubSeries.setData(
              plot.points.map((pt) => ({
                time: pt.time as any,
                value: pt.value,
                color: pt.color || plot.color,
              }))
            );
            if (!subPaneAnchorSeries) subPaneAnchorSeries = histSubSeries;
          } else if (plot.style === 'area') {
            const areaSeries = chart.addSeries(AreaSeries, {
              lineColor: plot.color,
              topColor: plot.color.startsWith('#') ? `${plot.color}44` : 'rgba(56, 189, 248, 0.25)',
              bottomColor: 'rgba(0, 0, 0, 0)',
              lineWidth: (plot.lineWidth as any) || 2,
              priceLineVisible: false,
            }, paneIdx);
            areaSeries.setData(
              plot.points.map((pt) => ({
                time: pt.time as any,
                value: pt.value,
              }))
            );
            if (!subPaneAnchorSeries) subPaneAnchorSeries = areaSeries;
          } else {
            const plotSeries = chart.addSeries(LineSeries, {
              color: plot.color,
              lineWidth: (plot.lineWidth as any) || 2,
              lineType: plot.style === 'stepline' ? LineType.WithSteps : LineType.Simple,
              priceLineVisible: false,
            }, paneIdx);
            plotSeries.setData(
              plot.points.map((pt) => ({
                time: pt.time as any,
                value: pt.value,
                ...(pt.color ? { color: pt.color } : {}),
              }))
            );
            if (!subPaneAnchorSeries) subPaneAnchorSeries = plotSeries;
          }
        }

        // Render hline(...) levels cleanly
        if (pineRes.hlines.length > 0) {
          let hlineTarget: ISeriesApi<any> | null = pineRes.overlay
            ? mainSeries
            : subPaneAnchorSeries;
          if (!hlineTarget && !pineRes.overlay && uniqueCandles.length >= 2) {
            const basePrice = pineRes.hlines[0].price;
            const anchor = chart.addSeries(LineSeries, {
              color: 'rgba(0,0,0,0)',
              lineVisible: false,
              priceLineVisible: false,
              lastValueVisible: false,
            }, 3);
            anchor.setData([
              { time: Math.floor(uniqueCandles[0].timestamp / 1000) as any, value: basePrice },
              { time: Math.floor(uniqueCandles[uniqueCandles.length - 1].timestamp / 1000) as any, value: basePrice },
            ]);
            hlineTarget = anchor;
            subPaneAnchorSeries = anchor;
          }
          if (hlineTarget) {
            for (const hl of pineRes.hlines) {
              hlineTarget.createPriceLine({
                price: hl.price,
                color: hl.color,
                lineWidth: (hl.lineWidth as any) || 1,
                lineStyle:
                  hl.style === 'dashed'
                    ? LineStyle.Dashed
                    : hl.style === 'dotted'
                      ? LineStyle.Dotted
                      : LineStyle.Solid,
                axisLabelVisible: true,
                title: hl.title,
              });
            }
          }
        }

        // Render plotshape / plotchar markers on sub-pane indicators directly via series markers
        if (!pineRes.overlay && pineRes.shapes.length > 0 && subPaneAnchorSeries) {
          try {
            const subMarkers = pineRes.shapes.map((sh) => ({
              time: sh.time as any,
              position: (sh.location === 'BelowBar' || sh.location === 'Bottom'
                ? 'belowBar'
                : 'aboveBar') as 'belowBar' | 'aboveBar',
              color: sh.color,
              shape: (sh.shape.includes('down') ? 'arrowDown' : sh.shape.includes('up') ? 'arrowUp' : 'circle') as
                | 'arrowDown'
                | 'arrowUp'
                | 'circle',
              text: sh.text || sh.char || '',
            }));
            createSeriesMarkers(subPaneAnchorSeries, subMarkers);
          } catch {
            // ignore marker collision edge cases
          }
        }
        continue;
      }

      // Immediate fallback while async PineTS execution resolves on first frame
      const calc = calculateCustomIndicatorById(customId, uniqueCandles);
      if (!calc) continue;

      if (calc.overlay) {
        for (const plot of calc.plots) {
          const plotSeries = chart.addSeries(LineSeries, {
            color: plot.color,
            lineWidth: (plot.lineWidth as any) || 2,
            priceLineVisible: false,
          }, 0);
          plotSeries.setData(
            plot.points.map((pt) => ({
              time: pt.time as any,
              value: pt.value,
            }))
          );
        }
      } else {
        for (const plot of calc.plots) {
          if (plot.type === 'histogram') {
            const histSubSeries = chart.addSeries(HistogramSeries, {
              priceLineVisible: false,
            }, 3);
            histSubSeries.setData(
              plot.points.map((pt) => ({
                time: pt.time as any,
                value: pt.value,
                color: pt.color || plot.color,
              }))
            );
          } else {
            const lineSubSeries = chart.addSeries(LineSeries, {
              color: plot.color,
              lineWidth: (plot.lineWidth as any) || 2,
              priceLineVisible: false,
            }, 3);
            lineSubSeries.setData(
              plot.points.map((pt) => ({
                time: pt.time as any,
                value: pt.value,
              }))
            );
          }
        }
      }
    }

    // 9. Interactive Click-to-Place Horizontal S/R Line + Crosshair Legend Subscription
    chart.subscribeClick((param) => {
      if (activeDrawToolRef.current === 'hline' && param?.point) {
        const clickedPrice = mainSeries.coordinateToPrice(param.point.y);
        if (typeof clickedPrice === 'number' && Number.isFinite(clickedPrice)) {
          handleAddPriceLine(clickedPrice);
          setActiveDrawTool('crosshair');
        }
      }
    });

    chart.subscribeCrosshairMove((param) => {
      if (!param || !param.time || !param.seriesData) {
        setHoverData(null);
        return;
      }

      const candleVal = param.seriesData.get(mainSeries) as any;
      const volVal = param.seriesData.get(volumeSeries) as any;
      const macdVal = param.seriesData.get(macdSeries) as any;
      const signalVal = param.seriesData.get(signalSeries) as any;
      const histVal = param.seriesData.get(histSeries) as any;
      const rsiVal = param.seriesData.get(rsiSeries) as any;

      if (candleVal) {
        const isOpenHighLowClose = candleVal.open !== undefined;
        setHoverData({
          time: new Date((param.time as number) * 1000).toLocaleDateString(),
          open: isOpenHighLowClose ? candleVal.open : candleVal.value,
          high: isOpenHighLowClose ? candleVal.high : candleVal.value,
          low: isOpenHighLowClose ? candleVal.low : candleVal.value,
          close: isOpenHighLowClose ? candleVal.close : candleVal.value,
          volume: volVal?.value,
          macd: macdVal?.value,
          signal: signalVal?.value,
          hist: histVal?.value,
          rsi: rsiVal?.value,
        });
      }
    });

    // Allocate balanced proportional vertical stretch factors so Candles, MACD, and RSI all read crisply
    try {
      const panes = (chart as any).panes?.() || [];
      if (panes.length > 0) {
        if (panes[0] && typeof panes[0].setStretchFactor === 'function') {
          panes[0].setStretchFactor(isOfsActive || isQmxActive ? 4.8 : 4.5);
        }
        if (panes[1] && typeof panes[1].setStretchFactor === 'function') {
          panes[1].setStretchFactor(1.0); // MACD pane
        }
        if (panes[2] && typeof panes[2].setStretchFactor === 'function') {
          panes[2].setStretchFactor(1.0); // RSI pane
        }
        if (panes[3] && typeof panes[3].setStretchFactor === 'function') {
          panes[3].setStretchFactor(0.9); // Custom sub-pane if any
        }
      }
    } catch {
      // ignore if unsupported
    }

    // Preserve user's visible logical scroll/zoom range across background data polls & overlay changes
    const viewportKey = `${symbol}:${timeframe}:${chartMode}`;
    chart.timeScale().applyOptions({
      rightOffset: isSuperTrendActive ? 18 : isOfsActive || isQmxActive ? 6 : 4,
    });
    let trackRangeReady = false;

    if (lastViewportKeyRef.current === viewportKey && savedLogicalRangeRef.current) {
      chart.timeScale().setVisibleLogicalRange(savedLogicalRangeRef.current);
      trackRangeReady = true;
    } else {
      lastViewportKeyRef.current = viewportKey;
      const isIntradayTf = timeframe === '1m' || timeframe === '5m' || timeframe === '15m' || timeframe === '1h';
      if ((isOfsActive || isQmxActive || isIntradayTf) && uniqueCandles.length > 42) {
        const visibleCount = isOfsActive || isQmxActive ? 46 : 120;
        chart.timeScale().setVisibleLogicalRange({
          from: Math.max(0, uniqueCandles.length - visibleCount),
          to: uniqueCandles.length + 5,
        });
      } else {
        chart.timeScale().fitContent();
      }
      savedLogicalRangeRef.current = chart.timeScale().getVisibleLogicalRange();
      trackRangeReady = true;
    }

    const handleLogicalRangeChange = () => {
      if (!trackRangeReady || !chartInstanceRef.current) return;
      const r = chartInstanceRef.current.timeScale().getVisibleLogicalRange();
      if (r && Number.isFinite(r.from) && Number.isFinite(r.to)) {
        savedLogicalRangeRef.current = { from: r.from, to: r.to };
      }
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(handleLogicalRangeChange);

    setChartApi(chart);
    setMainSeriesApi(mainSeries);

    // Responsive Resizer (handles window resize, fullscreen toggle & HUD open/close container resize)
    const handleResize = () => {
      if (chartContainerRef.current && chartInstanceRef.current) {
        const cw = chartContainerRef.current.clientWidth;
        const ch = chartContainerRef.current.clientHeight;
        if (cw > 0 && ch > 80) {
          chartInstanceRef.current.applyOptions({
            width: cw,
            height: ch,
          });
        }
      }
    };
    const rafResizeId = requestAnimationFrame(handleResize);
    window.addEventListener('resize', handleResize);
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => handleResize());
      ro.observe(container);
    }

    return () => {
      cancelAnimationFrame(rafResizeId);
      window.removeEventListener('resize', handleResize);
      if (ro) ro.disconnect();
      try {
        chart.timeScale().unsubscribeVisibleLogicalRangeChange(handleLogicalRangeChange);
      } catch {
        // ignore teardown
      }
      setChartApi(null);
      setMainSeriesApi(null);
      if (chartInstanceRef.current) {
        chartInstanceRef.current.remove();
        chartInstanceRef.current = null;
      }
    };
  }, [
    chartMode,
    candles,
    indicatorPoints,
    activeSetup,
    showLuxAlgoNWE,
    activeCustomIndicatorIds,
    pineResultsMap,
    customPriceLines,
    candleStyle,
    showFibOverlay,
  ]);

  // Apply price scale mode (LIN / LOG / %) & autoScale dynamically without recreating chart or resetting scroll
  useEffect(() => {
    if (!chartInstanceRef.current) return;
    chartInstanceRef.current.priceScale('right').applyOptions({
      autoScale,
      mode:
        scaleMode === 'logarithmic'
          ? PriceScaleMode.Logarithmic
          : scaleMode === 'percentage'
          ? PriceScaleMode.Percentage
          : PriceScaleMode.Normal,
    });
  }, [scaleMode, autoScale]);

  // Smoothly resize existing chart instance after fullscreen/layout transitions settle
  useEffect(() => {
    if (!chartInstanceRef.current || !chartContainerRef.current) return;
    const rafId = requestAnimationFrame(() => {
      if (chartInstanceRef.current && chartContainerRef.current) {
        const cw = chartContainerRef.current.clientWidth;
        const ch = chartContainerRef.current.clientHeight;
        if (cw > 0 && ch > 80) {
          chartInstanceRef.current.applyOptions({ width: cw, height: ch });
        }
      }
    });
    return () => cancelAnimationFrame(rafId);
  }, [isExpanded, activeCustomIndicatorIds.length]);

  // ============================================================================
  // RENDER VELA WORKSPACE (LUXALGO OPEN-SOURCE GITHUB ENGINE)
  // ============================================================================
  useEffect(() => {
    if (chartMode !== 'vela-workspace' || !velaWorkspaceRef.current || candles.length === 0) {
      return;
    }

    let workspace: any = null;
    let isMounted = true;

    async function initVelaWorkspace() {
      try {
        const { VelaWorkspace } = await import('@luxalgo/vela/workspace');
        if (!isMounted || !velaWorkspaceRef.current) return;

        velaWorkspaceRef.current.innerHTML = '';

        const toVelaBars = (arr: any[]) =>
          arr.map((c) => ({
            time: c.timestamp,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: c.volume,
          }));

        const ohlcvBars = toVelaBars(candles);

        const cellSymbols = ['SPY', 'QQQ', 'BTC-USD'];
        const extraBarsMap: Record<string, any[]> = {};

        if (velaLayout !== '1') {
          await Promise.all(
            cellSymbols.map(async (cellSym) => {
              if (cellSym === symbol) {
                extraBarsMap[cellSym] = ohlcvBars;
                return;
              }
              try {
                const res = await fetch(
                  `/api/candles?symbol=${encodeURIComponent(cellSym)}&timeframe=${encodeURIComponent(timeframe)}`
                );
                if (!res.ok) {
                  extraBarsMap[cellSym] = [];
                  return;
                }
                const payload = await res.json();
                extraBarsMap[cellSym] = Array.isArray(payload?.candles) ? toVelaBars(payload.candles) : [];
              } catch {
                extraBarsMap[cellSym] = [];
              }
            })
          );
        }

        if (!isMounted || !velaWorkspaceRef.current) return;

        workspace = new VelaWorkspace(velaWorkspaceRef.current, {
          symbol: symbol,
          timeframe: timeframe === '1d' ? 'D' : timeframe.toUpperCase(),
          theme: 'dark',
          layout: velaLayout,
          data: ohlcvBars,
          cells: {
            c1: { symbol: symbol, data: ohlcvBars },
            c2: { symbol: 'SPY', data: extraBarsMap['SPY'] ?? [] },
            c3: { symbol: 'QQQ', data: extraBarsMap['QQQ'] ?? [] },
            c4: { symbol: 'BTC-USD', data: extraBarsMap['BTC-USD'] ?? [] },
          },
          drawingToolbar: true,
          live: false,
        });
      } catch (err) {
        console.warn('Vela Workspace initialization note:', err);
      }
    }

    initVelaWorkspace();

    return () => {
      isMounted = false;
      if (workspace && typeof workspace.destroy === 'function') {
        workspace.destroy();
      }
    };
  }, [chartMode, symbol, timeframe, velaLayout, candles]);

  // Current quote helper
  const currentCandle = candles[candles.length - 1];
  const prevCandle = candles[candles.length - 2];
  const lastIndicator = indicatorPoints[indicatorPoints.length - 1];
  const priceChange = currentCandle && prevCandle ? currentCandle.close - prevCandle.close : 0;
  const priceChangePct = prevCandle && prevCandle.close > 0 ? (priceChange / prevCandle.close) * 100 : 0;

  // Filtered indicators in modal
  const filteredIndicators = libraryIndicators.filter((ind) => {
    const matchesSearch =
      ind.name.toLowerCase().includes(indicatorSearch.toLowerCase()) ||
      ind.description.toLowerCase().includes(indicatorSearch.toLowerCase()) ||
      ind.author.toLowerCase().includes(indicatorSearch.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || ind.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Active Pine Script overlay results routed to universal canvas/table renderer
  const activePineOverlayResults = useMemo(
    () =>
      activeCustomIndicatorIds
        .filter((id) => !isFlagshipCustomId(id))
        .map((id) => pineResultsMap[id])
        .filter((r): r is PineExecutionResult => Boolean(r && r.ok && r.overlay)),
    [activeCustomIndicatorIds, pineResultsMap, libraryIndicators]
  );

  // Order Flow Strategy Report (full Auction + LTF + Footprint + Liquidity + Trade Engine)
  const ofsReport: OfsReport | null = useMemo(() => {
    if (!isOfsActive || uniqueChartCandles.length === 0) return null;
    return calculateOrderFlowStrategy(uniqueChartCandles, ltfCandles, { symbol, timeframe });
  }, [isOfsActive, uniqueChartCandles, ltfCandles, symbol, timeframe]);

  // Quantum Market X-Ray Report (Live Market Intelligence, Ribbon, Sweeps, Traps, Exhaustion, Targets)
  const qmxReport: QmxReport | null = useMemo(() => {
    if (!isQmxActive || uniqueChartCandles.length === 0) return null;
    return calculateQuantumMarketXray(uniqueChartCandles, { symbol, timeframe });
  }, [isQmxActive, uniqueChartCandles, symbol, timeframe]);

  // SuperTrend v9 PRO Report (Dynamic Green/Red Cloud, EMA 20/50/200, S/R Zones, MTF & Telemetry Table)
  const superTrendReport: SuperTrendProReport | null = useMemo(() => {
    if (!isSuperTrendActive || uniqueChartCandles.length === 0) return null;
    return calculateSuperTrendPro(uniqueChartCandles, { symbol, timeframe });
  }, [isSuperTrendActive, uniqueChartCandles, symbol, timeframe]);

  type ActiveIndicatorSummaryPill = {
    id: string;
    name: string;
    color: string;
    summaryValue?: string;
    summaryStatus: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    isError?: boolean;
  };

  // Calculate summary values for active indicators (Flagship + Any Imported Pine Script)
  const activeCustomSummaries: ActiveIndicatorSummaryPill[] = activeCustomIndicatorIds
    .map((id): ActiveIndicatorSummaryPill | null => {
      const norm = id.toLowerCase();
      if (norm.includes('supertrend') && superTrendReport) {
        const d = superTrendReport.dashboard;
        return {
          id,
          name: 'SuperTrend v9 PRO',
          color: d.isBull ? '#10b981' : '#ef4444',
          summaryValue: `${d.trendLabel} · RSI ${d.rsi.toFixed(1)} · ${d.emaOrderText}`,
          summaryStatus: d.isBull ? 'BULLISH' : 'BEARISH',
        };
      }
      if (norm.includes('ofs') || norm.includes('order-flow-strategy')) {
        const ofsSummary = calculateOrderFlowCustomIndicator(uniqueChartCandles, ltfCandles, symbol, timeframe);
        return {
          id,
          name: ofsSummary.name,
          color: ofsSummary.color,
          summaryValue: ofsSummary.summaryValue,
          summaryStatus: ofsSummary.summaryStatus ?? 'NEUTRAL',
        };
      }
      if (norm.includes('qmx') || norm.includes('quantum')) {
        const rep = calculateQuantumMarketXray(uniqueChartCandles, { symbol, timeframe });
        const d = rep.dashboard;
        const matchInd = libraryIndicators.find((l) => l.id === id);
        return {
          id,
          name: matchInd?.name || 'QUANTUM MARKET X-RAY (QMX)',
          color: d.marketBias === 'Bullish' ? '#00FFA3' : '#FF2D55',
          summaryValue: `${d.phase} · Bull ${d.scores.bullishEvidencePct}% / Bear ${d.scores.bearishEvidencePct}%`,
          summaryStatus:
            d.marketBias === 'Bullish' ? 'BULLISH' : d.marketBias === 'Bearish' ? 'BEARISH' : 'NEUTRAL',
        };
      }
      const matchInd = libraryIndicators.find((l) => l.id === id);
      if (matchInd && (matchInd.name.toLowerCase().includes('quantum') || matchInd.name.toLowerCase().includes('qmx'))) {
        const rep = calculateQuantumMarketXray(uniqueChartCandles, { symbol, timeframe });
        const d = rep.dashboard;
        return {
          id,
          name: matchInd.name,
          color: d.marketBias === 'Bullish' ? '#00FFA3' : '#FF2D55',
          summaryValue: `${d.phase} · Bull ${d.scores.bullishEvidencePct}% / Bear ${d.scores.bearishEvidencePct}%`,
          summaryStatus:
            d.marketBias === 'Bullish' ? 'BULLISH' : d.marketBias === 'Bearish' ? 'BEARISH' : 'NEUTRAL',
        };
      }

      const pineRes = pineResultsMap[id];
      if (pineRes) {
        if (!pineRes.ok) {
          return {
            id,
            name: pineRes.name || matchInd?.name || id,
            color: '#f43f5e',
            summaryValue: `Error: ${(pineRes.error || 'Compilation failed').slice(0, 56)}`,
            summaryStatus: 'NEUTRAL',
            isError: true,
          };
        }
        return {
          id,
          name: pineRes.name,
          color: pineRes.plots[0]?.color || '#38bdf8',
          summaryValue: pineRes.summaryValue,
          summaryStatus: pineRes.summaryStatus,
        };
      }

      const fallback = calculateCustomIndicatorById(id, uniqueChartCandles);
      if (fallback) {
        return {
          id,
          name: fallback.name,
          color: fallback.color,
          summaryValue: fallback.summaryValue,
          summaryStatus: fallback.summaryStatus ?? 'NEUTRAL',
        };
      }
      if (matchInd) {
        return {
          id,
          name: matchInd.name,
          color: '#38bdf8',
          summaryValue: 'Compiling Pine Script...',
          summaryStatus: 'NEUTRAL',
        };
      }
      return null;
    })
    .filter((c): c is ActiveIndicatorSummaryPill => c !== null);

  // Handlers for inline Pine Script importer inside fx Indicators modal
  const handleTestInlinePine = async () => {
    if (!inlinePineCode.trim()) {
      setInlinePineError('Paste TradingView Pine Script code first.');
      return;
    }
    setInlinePineTesting(true);
    setInlinePineError(null);
    setInlinePineStatus(null);
    try {
      const testCandles =
        uniqueChartCandles.length >= 25
          ? uniqueChartCandles
          : buildSampleValidationCandles(80, 150);
      const res = await executePineScriptIndicator(
        {
          id: 'inline-preview',
          name: inlinePineName.trim() || 'Custom Indicator',
          pineCode: inlinePineCode,
        },
        testCandles,
        { symbol, timeframe }
      );
      if (res.ok) {
        const parts = [
          res.overlay ? 'Overlay' : 'Sub-Pane',
          `${res.plots.length} plot(s)`,
          res.fills.length > 0 ? `${res.fills.length} fill(s)` : '',
          res.shapes.length > 0 ? `${res.shapes.length} signal(s)` : '',
          res.boxes.length > 0 ? `${res.boxes.length} box(es)` : '',
          res.tables.length > 0 ? `${res.tables.length} table(s)` : '',
          res.hlines.length > 0 ? `${res.hlines.length} hline(s)` : '',
        ].filter(Boolean);
        setInlinePineStatus({ valid: true, message: parts.join(' · ') });
      } else {
        setInlinePineStatus({ valid: false, message: res.error || 'Execution failed' });
      }
    } catch (e: any) {
      setInlinePineStatus({ valid: false, message: e?.message || 'Execution failed' });
    } finally {
      setInlinePineTesting(false);
    }
  };

  const handleImportInlinePine = (e: React.FormEvent) => {
    e.preventDefault();
    setInlinePineError(null);
    const res = importCustomPineIndicator(inlinePineCode, {
      name: inlinePineName.trim() || undefined,
      category: inlinePineCategory,
    });
    if (!res.success || !res.indicator) {
      setInlinePineError(res.error || 'Invalid Pine Script declaration.');
      return;
    }
    const nextLibrary = [res.indicator, ...libraryIndicators];
    setLibraryIndicators(nextLibrary);
    saveAllIndicators(nextLibrary);

    const nextActive = activeCustomIndicatorIds.includes(res.indicator.id)
      ? activeCustomIndicatorIds
      : [...activeCustomIndicatorIds, res.indicator.id];
    setActiveCustomIndicatorIds(nextActive);
    try {
      localStorage.setItem(ACTIVE_INDICATORS_STORAGE_KEY, JSON.stringify(nextActive));
    } catch {
      // ignore storage errors
    }

    setInlinePineCode('');
    setInlinePineName('');
    setInlinePineStatus(null);
    setInlinePineError(null);
    setShowInlineImporter(false);
  };

  // Fallback SVG logic
  const candleLows = candles.map((c) => c.low).filter((v) => typeof v === 'number' && !isNaN(v));
  const candleHighs = candles.map((c) => c.high).filter((v) => typeof v === 'number' && !isNaN(v));
  const rawMinPrice = candleLows.length > 0 ? Math.min(...candleLows) : 100;
  const rawMaxPrice = candleHighs.length > 0 ? Math.max(...candleHighs) : 200;
  const pricePadding = (rawMaxPrice - rawMinPrice) * 0.08 || 5;
  const fixedMinPrice = Math.max(0.01, rawMinPrice - pricePadding);
  const fixedMaxPrice = rawMaxPrice + pricePadding;
  const fixedPriceRange = fixedMaxPrice - fixedMinPrice || 1;

  const svgWidth = 840;
  const svgPriceHeight = 260;
  const svgPadX = 50;
  const getSvgX = (i: number) => svgPadX + (i / Math.max(1, candles.length - 1)) * (svgWidth - svgPadX * 2);
  const getSvgY = (p: number) =>
    svgPriceHeight - ((p - fixedMinPrice) / fixedPriceRange) * (svgPriceHeight - 40) - 20;

  // Measurement Ruler Stats (High to Low of active range)
  const rangeDeltaPrice = rawMaxPrice - rawMinPrice;
  const rangeDeltaPct = rawMinPrice > 0 ? (rangeDeltaPrice / rawMinPrice) * 100 : 0;

  return (
    <div className={isExpanded ? 'fixed inset-0 z-50 bg-zinc-950 p-2 w-screen h-[100dvh] overflow-hidden flex flex-col gap-1.5' : 'space-y-4 max-w-7xl mx-auto pb-12'}>
      {/* 1. TOP TELEMETRY & DATA AUTHENTICITY HUD (Hidden or compact in fullscreen) */}
      {!isExpanded && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs shadow-lg">
        {/* Left: Live Status Badge & Exchange Details */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 bg-emerald-950/60 border border-emerald-500/40 px-2.5 py-1 rounded-md">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span className="text-[11px] font-bold text-emerald-300 uppercase tracking-wider">
              {feedMeta?.isLiveFeed ? 'YAHOO DELAYED FEED (10–20M)' : 'LIVE FEED PENDING'}
            </span>
          </div>

          <div className="hidden sm:flex items-center space-x-2 text-zinc-400 text-[11px]">
            <span className="text-zinc-500">Venue:</span>
            <span className="font-semibold text-zinc-200">
              {feedMeta?.exchange || (symbol.includes('BTC') ? 'Binance / Global Crypto' : 'NASDAQ / NYSE')}
            </span>
            <span className="text-zinc-600">&bull;</span>
            <span className="text-zinc-500">Engine:</span>
            <span className="font-mono text-emerald-400 font-bold">StageLedger Studio</span>
          </div>

          <button
            onClick={() => setShowDataAuthModal(true)}
            className="flex items-center space-x-1 text-[11px] text-sky-400 hover:text-sky-300 hover:underline transition"
            title="Inspect Data Authenticity & Verification"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
            <span>How Real Is This Data?</span>
          </button>
        </div>

        {/* Right: Dual Clocks (Bucharest & ET) + Auto-Refresh */}
        <div className="flex items-center space-x-4 font-mono text-[11px] text-zinc-400">
          <div className="flex items-center space-x-1.5 bg-zinc-950 px-2.5 py-1 rounded border border-zinc-800 text-zinc-300">
            <Clock className="w-3 h-3 text-amber-400" />
            <span className="text-zinc-500">Bucharest:</span>
            <span className="text-white font-bold">{bucharestTime || '--:--:--'}</span>
          </div>

          <div className="hidden md:flex items-center space-x-1.5 bg-zinc-950 px-2.5 py-1 rounded border border-zinc-800 text-zinc-300">
            <Activity className="w-3 h-3 text-emerald-400" />
            <span className="text-zinc-500">Wall St (ET):</span>
            <span className="text-white font-bold">{marketTime || '--:--:--'}</span>
          </div>

          <div className="flex items-center space-x-1.5 text-zinc-400">
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase transition ${
                autoRefresh ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-zinc-800 text-zinc-500'
              }`}
              title="Toggle Auto Refresh every 15 seconds"
            >
              {autoRefresh ? `Auto: ${countdown}s` : 'Paused'}
            </button>
          </div>
        </div>
      </div>
      )}

      {/* 2. MAIN TOOLBAR (Symbol Search, Timeframes, Candle Style, Indicators fx, Chart Engine, Expand) */}
      <div className={`bg-zinc-900 border border-zinc-800 rounded-xl ${isExpanded ? 'px-2.5 py-1.5 gap-2 shrink-0' : 'p-3 gap-3'} flex flex-wrap items-center justify-between shadow-xl`}>
        <div className={`flex flex-wrap items-center ${isExpanded ? 'gap-1.5' : 'gap-2.5'}`}>
          {/* Symbol Input & Company Name */}
          <div className={`flex items-center space-x-2 bg-zinc-950 ${isExpanded ? 'px-2 py-1' : 'px-3 py-1.5'} rounded-lg border border-zinc-700`}>
            <span className="text-xs text-zinc-400 font-semibold">TICKER:</span>
            <input
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              className="bg-transparent text-sm text-white font-mono font-bold w-20 uppercase focus:outline-none focus:text-emerald-400"
              placeholder="AAPL"
            />
            {getCompanyName(symbol) && (
              <span className={`text-xs text-emerald-400 font-semibold border-l border-zinc-800 pl-2 ${isExpanded ? 'hidden xl:inline max-w-[130px]' : 'max-w-[180px]'} truncate`}>
                {getCompanyName(symbol)}
              </span>
            )}
          </div>

          {/* Quick Symbol Chips */}
          <div className={`${isExpanded ? 'hidden 2xl:flex' : 'hidden sm:flex'} items-center space-x-1`}>
            {['AAPL', 'NVDA', 'TSLA', 'MSFT', 'AMD', 'SPY', 'QQQ', 'BTC-USD'].map((s) => (
              <button
                key={s}
                onClick={() => setSymbol(s)}
                className={`px-2 py-1 text-[11px] font-mono rounded transition ${
                  symbol === s
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-zinc-950 text-zinc-400 hover:text-white border border-zinc-800'
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Timeframe & History Range Selectors */}
          <div className="flex items-center space-x-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800">
            {['1m', '5m', '15m', '1h', '1d'].map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-2.5 py-1 text-xs font-semibold rounded font-mono transition ${
                  timeframe === tf
                    ? 'bg-zinc-800 text-emerald-400 border border-zinc-700 shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          <div className="flex items-center space-x-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800">
            {['1m', '3m', '6m', '1y', '2y', '5y', 'max'].map((rg) => (
              <button
                key={rg}
                onClick={() => setChartRange(rg)}
                className={`px-2 py-1 text-[11px] font-semibold rounded font-mono uppercase transition ${
                  chartRange === rg
                    ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40'
                    : 'text-zinc-400 hover:text-white'
                }`}
                title={`Historical Range: ${rg.toUpperCase()}`}
              >
                {rg}
              </button>
            ))}
          </div>

          {/* CANDLE STYLE SELECTOR (GitHub Best Practice: Candles, Heikin-Ashi, Hollow, Line, Area) */}
          <div className="flex items-center space-x-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800 text-xs">
            <button
              onClick={() => setCandleStyle('candles')}
              className={`px-2 py-1 rounded transition ${
                candleStyle === 'candles'
                  ? 'bg-zinc-800 text-emerald-400 font-bold border border-zinc-700'
                  : 'text-zinc-400 hover:text-white'
              }`}
              title="Standard Candlesticks"
            >
              Candles
            </button>
            <button
              onClick={() => setCandleStyle('heikin-ashi')}
              className={`px-2 py-1 rounded transition ${
                candleStyle === 'heikin-ashi'
                  ? 'bg-emerald-600/30 text-emerald-300 font-bold border border-emerald-500/40'
                  : 'text-zinc-400 hover:text-white'
              }`}
              title="Heikin-Ashi Smoothed Trend Candles"
            >
              Heikin-Ashi
            </button>
            <button
              onClick={() => setCandleStyle('hollow')}
              className={`px-2 py-1 rounded transition ${
                candleStyle === 'hollow'
                  ? 'bg-zinc-800 text-emerald-400 font-bold border border-zinc-700'
                  : 'text-zinc-400 hover:text-white'
              }`}
              title="Hollow Candlesticks"
            >
              Hollow
            </button>
            <button
              onClick={() => setCandleStyle('line')}
              className={`px-2 py-1 rounded transition ${
                candleStyle === 'line'
                  ? 'bg-zinc-800 text-sky-400 font-bold border border-zinc-700'
                  : 'text-zinc-400 hover:text-white'
              }`}
              title="Line Chart"
            >
              Line
            </button>
            <button
              onClick={() => setCandleStyle('area')}
              className={`px-2 py-1 rounded transition ${
                candleStyle === 'area'
                  ? 'bg-zinc-800 text-sky-400 font-bold border border-zinc-700'
                  : 'text-zinc-400 hover:text-white'
              }`}
              title="Mountain Area Chart"
            >
              Area
            </button>
          </div>

          {/* LIN / LOG / % + AUTO SCALE CONTROLS */}
          <div className="flex items-center bg-zinc-950 p-0.5 rounded-lg border border-zinc-800 text-[11px] font-mono">
            {(
              [
                ['linear', 'LIN'],
                ['logarithmic', 'LOG'],
                ['percentage', '%'],
              ] as const
            ).map(([modeKey, modeLabel]) => (
              <button
                key={modeKey}
                type="button"
                onClick={() => setScaleMode(modeKey)}
                className={`px-2 py-0.5 rounded font-bold transition ${
                  scaleMode === modeKey
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'text-zinc-400 hover:text-white border border-transparent'
                }`}
                title={`Switch Price Scale to ${modeLabel}`}
              >
                {modeLabel}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setAutoScale((prev) => !prev)}
              className={`ml-0.5 px-1.5 py-0.5 rounded font-bold transition border ${
                autoScale
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
                  : 'text-zinc-500 border-transparent hover:text-zinc-300'
              }`}
              title="Toggle Y-Axis AutoScale (Double-click price axis to reset)"
            >
              A
            </button>
          </div>

          {/* fx INDICATORS MODAL BUTTON */}
          <button
            onClick={() => setShowIndicatorModal(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-lg text-xs font-bold transition shadow-md shadow-emerald-700/30"
            title="Open Indicators & Custom Library"
          >
            <span className="font-serif italic font-bold">fx</span>
            <span>Indicators</span>
            {activeCustomIndicatorIds.length > 0 && (
              <span className="ml-1 bg-white/20 text-[10px] px-1.5 py-0.2 rounded-full font-mono">
                {activeCustomIndicatorIds.length}
              </span>
            )}
          </button>

          {/* Engine Selector */}
          <div className="flex items-center space-x-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800 text-xs">
            <button
              onClick={() => setChartMode('vela-pro')}
              className={`px-2.5 py-1 rounded font-medium transition ${
                chartMode === 'vela-pro'
                  ? 'bg-emerald-600 text-white font-bold shadow-md shadow-emerald-600/30'
                  : 'text-zinc-400 hover:text-white'
              }`}
              title="Single Chart Studio with 4-Pillars Divergences & Custom Indicators"
            >
              Single Chart Studio
            </button>
            <button
              onClick={() => setChartMode('vela-workspace')}
              className={`px-2.5 py-1 rounded font-medium transition ${
                chartMode === 'vela-workspace'
                  ? 'bg-sky-600 text-white font-bold shadow-md shadow-sky-600/30'
                  : 'text-zinc-400 hover:text-white'
              }`}
              title="Multi-Chart Grid Workspace"
            >
              Multi-Chart Grid
            </button>
            <button
              onClick={() => setShowLuxAlgoNWE(!showLuxAlgoNWE)}
              className={`px-2.5 py-1 rounded font-medium transition flex items-center space-x-1 ${
                showLuxAlgoNWE
                  ? 'bg-indigo-600 text-white font-bold shadow-md shadow-indigo-600/30'
                  : 'text-zinc-400 hover:text-white'
              }`}
              title="Toggle Nadaraya-Watson Kernel Envelope (NWE)"
            >
              <Sparkles className="w-3 h-3 text-indigo-300" />
              <span>Kernel NWE {showLuxAlgoNWE ? 'ON' : 'OFF'}</span>
            </button>
            <button
              data-testid="toggle-ofs-btn"
              onClick={() => toggleIndicator('ofs-order-flow-strategy-v6')}
              className={`px-2.5 py-1 rounded font-medium transition flex items-center space-x-1 ${
                isOfsActive
                  ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40 shadow-md shadow-cyan-500/10'
                  : 'text-zinc-400 hover:text-white'
              }`}
              title="Toggle Order Flow Strategy [Auction · Order Flow · Trapped Traders]"
            >
              <BarChart2 className="w-3 h-3 text-cyan-400" />
              <span>Order Flow {isOfsActive ? 'ON' : 'OFF'}</span>
            </button>
            <button
              data-testid="toggle-qmx-btn"
              onClick={() => {
                const existingQmxId =
                  activeCustomIndicatorIds.find(
                    (id) => id.toLowerCase().includes('qmx') || id.toLowerCase().includes('quantum')
                  ) ||
                  libraryIndicators.find(
                    (l) => l.name.toUpperCase().includes('QUANTUM') && activeCustomIndicatorIds.includes(l.id)
                  )?.id ||
                  libraryIndicators.find((l) => l.name.toUpperCase().includes('QUANTUM'))?.id ||
                  'qmx-quantum-market-xray';
                toggleIndicator(existingQmxId);
              }}
              className={`px-2.5 py-1 rounded font-medium transition flex items-center space-x-1 ${
                isQmxActive
                  ? 'bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40 shadow-md shadow-emerald-500/10'
                  : 'text-zinc-400 hover:text-white'
              }`}
              title="Toggle Quantum Market X-Ray (QMX) [Live Market Intelligence]"
            >
              <Activity className="w-3 h-3 text-emerald-400" />
              <span>Quantum QMX {isQmxActive ? 'ON' : 'OFF'}</span>
            </button>
          </div>

          {/* Vela Workspace Layout Selector (visible when workspace active) */}
          {chartMode === 'vela-workspace' && (
            <div className="flex items-center space-x-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800 text-xs">
              <span className="text-[10px] text-zinc-500 uppercase px-1 font-semibold">Layout:</span>
              <button
                onClick={() => setVelaLayout('1')}
                className={`p-1 rounded ${velaLayout === '1' ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30' : 'text-zinc-400'}`}
                title="Single Chart (1)"
              >
                <Square className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setVelaLayout('2h')}
                className={`p-1 rounded ${velaLayout === '2h' ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30' : 'text-zinc-400'}`}
                title="Split Horizontal (2h)"
              >
                <Columns className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setVelaLayout('4')}
                className={`p-1 rounded ${velaLayout === '4' ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30' : 'text-zinc-400'}`}
                title="Quad Grid 2x2 (4)"
              >
                <Grid className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <button
            onClick={() => loadChartData()}
            disabled={loading}
            className="flex items-center space-x-1 px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium transition"
            title="Force reload latest quotes"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Right: Live Quote Pill & EXPAND FULLSCREEN BUTTON */}
        <div className="flex items-center space-x-3">
          {currentCandle && (
            <div className="hidden sm:flex items-center space-x-3 text-xs font-mono bg-zinc-950 px-3 py-1.5 rounded-lg border border-zinc-800">
              <div>
                <span className="text-zinc-500">Price: </span>
                <span className="text-white font-bold text-sm">${currentCandle.close.toFixed(2)}</span>
                <span
                  className={`ml-1.5 font-bold ${
                    priceChange >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {priceChange >= 0 ? '+' : ''}
                  {priceChange.toFixed(2)} ({priceChangePct.toFixed(2)}%)
                </span>
              </div>
              <div className="hidden xl:block">
                <span className="text-zinc-500">MACD: </span>
                <span className={lastIndicator?.macd >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                  {lastIndicator?.macd.toFixed(3) || '0.00'}
                </span>
              </div>
              <div className="hidden xl:block">
                <span className="text-zinc-500">RSI: </span>
                <span className="text-amber-400 font-bold">{lastIndicator?.rsi.toFixed(1) || '50.0'}</span>
              </div>
            </div>
          )}

          {/* DEDICATED FULLSCREEN / EXPAND BUTTON */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className={`p-2 rounded-lg border transition flex items-center gap-1.5 text-xs font-bold ${
              isExpanded
                ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 hover:bg-rose-500/30'
                : 'bg-zinc-800 text-zinc-200 border-zinc-700 hover:bg-zinc-700 hover:text-white'
            }`}
            title={isExpanded ? 'Exit Fullscreen (Esc or F)' : 'Expand Chart to Fullscreen (F)'}
          >
            {isExpanded ? (
              <>
                <Minimize2 className="w-4 h-4 text-rose-400" />
                <span className="hidden md:inline">Exit Fullscreen</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-4 h-4 text-emerald-400" />
                <span className="hidden md:inline">Expand / Fullscreen</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 3. ACTIVE CUSTOM INDICATORS PILLS BAR */}
      {activeCustomSummaries.length > 0 && (
        <div className={`flex flex-wrap items-center gap-2 text-xs font-mono bg-zinc-950 ${isExpanded ? 'px-2.5 py-1 shrink-0' : 'px-3 py-2'} rounded-lg border border-zinc-800`}>
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-sans font-bold">
            Active Indicators:
          </span>
          {activeCustomSummaries.map((ind) => (
            <div
              key={ind.id}
              data-testid={`active-indicator-pill-${ind.id}`}
              className={`flex items-center space-x-1.5 px-2 py-0.5 bg-zinc-900 rounded-md text-[11px] border ${
                ind.isError ? 'border-rose-500/60 bg-rose-950/30' : 'border-zinc-700/80'
              }`}
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ind.color }}></span>
              <span className="text-white font-semibold">{ind.name}</span>
              <span
                className={`px-1 text-[9px] rounded font-bold ${
                  ind.isError
                    ? 'bg-rose-500/20 text-rose-300'
                    : 'bg-emerald-500/20 text-emerald-300'
                }`}
              >
                {ind.isError ? '[Pine Error]' : '[Custom]'}
              </span>
              {ind.summaryValue && (
                <span className={`font-bold ${ind.isError ? 'text-rose-300' : 'text-zinc-400'}`}>
                  {ind.summaryValue}
                </span>
              )}
              <button
                onClick={() => toggleIndicator(ind.id)}
                className="text-zinc-500 hover:text-rose-400 ml-1 transition"
                aria-label={`Remove ${ind.name}`}
                title={`Remove ${ind.name}`}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 4. MAIN CHART AREA (With Left Drawing Toolbar + Main Viewport + Blueprint) */}
      <div className={`grid grid-cols-1 ${isExpanded ? 'lg:grid-cols-1 flex-1 min-h-0 overflow-hidden' : 'lg:grid-cols-4'} gap-4`}>
        {/* Left cols: Technical Chart with Left Drawing Bar */}
        <div className={`${isExpanded ? 'col-span-1 h-full min-h-0 overflow-hidden p-2' : 'lg:col-span-3 p-3'} bg-zinc-900 border border-zinc-800 rounded-xl relative flex flex-col shadow-2xl`}>
          {/* Active Setup Banner */}
          {activeSetup ? (
            <div className={`flex flex-wrap items-center justify-between ${isExpanded ? 'pb-1.5 mb-1.5' : 'pb-2.5 mb-2.5'} border-b border-zinc-800 gap-2 shrink-0`}>
              <div className="flex items-center space-x-2">
                <span
                  className={`text-xs font-bold px-2.5 py-0.5 rounded-md flex items-center gap-1.5 ${
                    activeSetup.type.includes('BULLISH')
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm shadow-emerald-500/10'
                      : 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm shadow-rose-500/10'
                  }`}
                >
                  {activeSetup.type.includes('BULLISH') ? (
                    <TrendingUp className="w-3.5 h-3.5" />
                  ) : (
                    <TrendingDown className="w-3.5 h-3.5" />
                  )}
                  {activeSetup.type.replace('_', ' ')}
                </span>
                <span className="text-xs text-zinc-400">
                  Confluence Quality: <strong className="text-emerald-400">{activeSetup.qualityScore}%</strong>
                </span>
                <span className="text-xs bg-zinc-800 px-2 py-0.5 rounded text-zinc-300 font-mono">
                  R:R = 1 : {activeSetup.riskRewardRatio}
                </span>
              </div>
              <div className="text-xs font-mono text-zinc-300 flex items-center gap-2">
                {activeSetup.points[0] && <span>P1: ${activeSetup.points[0].price.toFixed(2)}</span>}
                {activeSetup.points[1] && (
                  <>
                    <span>&rarr;</span>
                    <span
                      className={
                        !activeSetup.points[2]
                          ? 'text-emerald-400 font-black bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30'
                          : ''
                      }
                    >
                      P2: ${activeSetup.points[1].price.toFixed(2)}
                    </span>
                  </>
                )}
                {activeSetup.points[2] && (
                  <>
                    <span>&rarr;</span>
                    <span className="text-emerald-400 font-black bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
                      P3: ${activeSetup.points[2].price.toFixed(2)}
                    </span>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className={`flex flex-wrap items-center justify-between ${isExpanded ? 'pb-1.5 mb-1.5' : 'pb-2 mb-2'} border-b border-zinc-800 text-xs text-zinc-400 gap-2 shrink-0`}>
              <div className="flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                <span>David Trullàs 4-Pillars Algorithm Active &bull; MACD (12,26,9) &bull; RSI (14) &bull; Fibonacci</span>
              </div>
              <span className="text-zinc-500 font-mono">No active 3-point divergence on {symbol} ({timeframe})</span>
            </div>
          )}

          {/* Interactive Chart Toolbar (Live OHLCV + MACD + RSI Legend, S/R Status, Zoom, Fit) */}
          {chartMode === 'vela-pro' && (() => {
            const legendBar = hoverData ?? (currentCandle ? {
              time: new Date(currentCandle.timestamp).toLocaleDateString(),
              open: currentCandle.open,
              high: currentCandle.high,
              low: currentCandle.low,
              close: currentCandle.close,
              volume: currentCandle.volume,
              macd: lastIndicator?.macd,
              rsi: lastIndicator?.rsi,
            } : null);
            const barDeltaPct =
              legendBar?.open && legendBar.open > 0 && legendBar.close !== undefined
                ? ((legendBar.close - legendBar.open) / legendBar.open) * 100
                : 0;
            const barUp = (legendBar?.close ?? 0) >= (legendBar?.open ?? 0);

            return (
              <div className={`flex flex-wrap items-center justify-between py-1 px-2.5 bg-zinc-950/90 rounded-lg border border-zinc-800/80 text-[11px] font-mono ${isExpanded ? 'mb-1.5' : 'mb-2'} shrink-0 gap-2`}>
                <div className="flex flex-wrap items-center gap-2.5 text-zinc-300">
                  {legendBar ? (
                    <>
                      <span className="text-emerald-400 font-bold">{symbol} &middot; {timeframe}</span>
                      <span className="text-zinc-500">{legendBar.time}</span>
                      <span>O <strong className={barUp ? 'text-emerald-300' : 'text-rose-300'}>${legendBar.open?.toFixed(2)}</strong></span>
                      <span>H <strong className="text-emerald-400">${legendBar.high?.toFixed(2)}</strong></span>
                      <span>L <strong className="text-rose-400">${legendBar.low?.toFixed(2)}</strong></span>
                      <span>C <strong className={barUp ? 'text-emerald-300' : 'text-rose-300'}>${legendBar.close?.toFixed(2)}</strong></span>
                      <span className={`font-bold ${barUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {barDeltaPct >= 0 ? '+' : ''}{barDeltaPct.toFixed(2)}%
                      </span>
                      {legendBar.volume !== undefined && (
                        <span className="hidden sm:inline text-zinc-400">
                          Vol <strong className="text-zinc-200">{(legendBar.volume / 1e6).toFixed(2)}M</strong>
                        </span>
                      )}
                      {legendBar.macd !== undefined && (
                        <span className="text-sky-400 font-bold">MACD {legendBar.macd.toFixed(2)}</span>
                      )}
                      {legendBar.rsi !== undefined && (
                        <span className="text-purple-400 font-bold">RSI {legendBar.rsi.toFixed(1)}</span>
                      )}
                    </>
                  ) : (
                    <span className="text-zinc-500 italic">Loading bars...</span>
                  )}

                  {activeDrawTool === 'hline' && (
                    <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/40 font-sans font-semibold">
                      Click chart to place S/R line &bull; Esc cancels
                    </span>
                  )}

                  {customPriceLines.length > 0 && (
                    <span className="flex items-center gap-1">
                      {customPriceLines.slice(-3).map((pl) => (
                        <button
                          key={pl.id}
                          type="button"
                          onClick={() => setCustomPriceLines((prev) => prev.filter((item) => item.id !== pl.id))}
                          className="px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30 hover:bg-rose-500/20 hover:text-rose-300 hover:border-rose-500/40 text-[10px] flex items-center gap-1 transition"
                          title="Click to remove this horizontal S/R line"
                        >
                          <span>{pl.label}</span>
                          <X className="w-2.5 h-2.5" />
                        </button>
                      ))}
                    </span>
                  )}
                </div>

                {/* Zoom & Fit Action Buttons */}
                <div className="flex items-center space-x-1">
                  <button
                    onClick={handleZoomIn}
                    className="p-1 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded transition"
                    title="Zoom In (+)"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={handleZoomOut}
                    className="p-1 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded transition"
                    title="Zoom Out (-)"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={handleFitContent}
                    className="p-1 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded transition"
                    title="Reset Zoom / Fit Content (Alt+R)"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-zinc-400" />
                  </button>
                  <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="p-1 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded transition"
                    title={isExpanded ? 'Minimize (Esc)' : 'Expand Fullscreen (F)'}
                  >
                    {isExpanded ? <Minimize2 className="w-3.5 h-3.5 text-rose-400" /> : <Maximize2 className="w-3.5 h-3.5 text-emerald-400" />}
                  </button>
                </div>
              </div>
            );
          })()}

          {/* Chart Display Canvas with Left Drawing Toolbar (flex-1 min-h-0 in fullscreen prevents bottom RSI clipping!) */}
          <div className={`relative ${isExpanded ? 'flex-1 min-h-0' : 'h-[calc(100vh-200px)] min-h-[600px]'} w-full rounded-lg overflow-hidden bg-zinc-950 border border-zinc-800/80 flex`}>
            {/* TRADINGVIEW-STYLE LEFT DRAWING TOOLBAR */}
            <div className="w-10 bg-zinc-900/90 border-r border-zinc-800 flex flex-col items-center py-2 space-y-2 z-10 select-none">
              <button
                onClick={() => setActiveDrawTool('crosshair')}
                className={`p-2 rounded hover:bg-zinc-800 transition ${
                  activeDrawTool === 'crosshair' ? 'bg-emerald-500/20 text-emerald-400' : 'text-zinc-400'
                }`}
                title="Crosshair Tool"
              >
                <Crosshair className="w-4 h-4" />
              </button>

              <button
                onClick={() => {
                  if (activeDrawTool === 'hline') {
                    handleAddPriceLine();
                    setActiveDrawTool('crosshair');
                  } else {
                    setActiveDrawTool('hline');
                  }
                }}
                className={`p-2 rounded hover:bg-zinc-800 transition ${
                  activeDrawTool === 'hline' ? 'bg-sky-500/20 text-sky-400' : 'text-zinc-400 hover:text-sky-400'
                }`}
                title="Horizontal S/R Ray — Click chart to place at price level (or click icon twice for spot price)"
              >
                <Minus className="w-4 h-4" />
              </button>

              <button
                onClick={() => setShowFibOverlay(!showFibOverlay)}
                className={`p-2 rounded hover:bg-zinc-800 transition ${
                  showFibOverlay ? 'bg-amber-500/20 text-amber-400' : 'text-zinc-400'
                }`}
                title="Toggle Fibonacci Retracement Grid (0%, 23.6%, 38.2%, 50%, 61.8%, 78.6%, 100%)"
              >
                <GitCommit className="w-4 h-4" />
              </button>

              <button
                onClick={() => setShowRulerHUD(!showRulerHUD)}
                className={`p-2 rounded hover:bg-zinc-800 transition ${
                  showRulerHUD ? 'bg-sky-500/20 text-sky-400' : 'text-zinc-400'
                }`}
                title="Toggle Range Measurement Ruler"
              >
                <Ruler className="w-4 h-4" />
              </button>

              <button
                onClick={() => {
                  if (activeSetup && onOpenCalculator) {
                    onOpenCalculator(activeSetup);
                  }
                }}
                className="p-2 rounded hover:bg-zinc-800 text-zinc-400 hover:text-emerald-400 transition"
                title="Long/Short Risk-Reward Calculator"
              >
                <Target className="w-4 h-4" />
              </button>

              <div className="w-6 border-b border-zinc-800 my-1"></div>

              <button
                onClick={handleClearDrawings}
                className="p-2 rounded hover:bg-rose-500/20 text-zinc-500 hover:text-rose-400 transition"
                title="Clear All Custom S/R Lines & Drawings"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            {/* CANVAS CONTAINER + DOCKED ORDER FLOW / QMX HUD */}
            <div className="flex-1 relative h-full min-h-0 flex min-w-0 overflow-hidden">
              <div className={`flex-1 relative h-full min-h-0 min-w-0 ${activeDrawTool === 'hline' ? 'cursor-crosshair' : ''}`}>
                {chartMode === 'vela-pro' && (
                  <>
                    <div
                      ref={chartContainerRef}
                      data-testid="vela-chart-container"
                      className="w-full h-full min-h-0"
                    />
                    {isOfsActive && ofsReport && (
                      <OrderFlowOverlay
                        chart={chartApi}
                        mainSeries={mainSeriesApi}
                        containerRef={chartContainerRef}
                        report={ofsReport}
                        toggles={ofsToggles}
                        onToggleLayer={(key) =>
                          setOfsToggles((prev) => ({ ...prev, [key]: !prev[key] }))
                        }
                        toolbarTopClass="top-2"
                      />
                    )}
                    {isQmxActive && qmxReport && (
                      <QuantumMarketXrayOverlay
                        chart={chartApi}
                        mainSeries={mainSeriesApi}
                        containerRef={chartContainerRef}
                        report={qmxReport}
                        toggles={qmxToggles}
                        onToggleLayer={(key) =>
                          setQmxToggles((prev) => ({ ...prev, [key]: !prev[key] }))
                        }
                        toolbarTopClass={isOfsActive && ofsReport ? 'top-9' : 'top-2'}
                      />
                    )}
                    {isSuperTrendActive && superTrendReport && (
                      <SuperTrendProOverlay
                        chart={chartApi}
                        mainSeries={mainSeriesApi}
                        containerRef={chartContainerRef}
                        report={superTrendReport}
                        toggles={superTrendToggles}
                        onToggleLayer={(key) =>
                          setSuperTrendToggles((prev) => ({ ...prev, [key]: !prev[key] }))
                        }
                        toolbarTopClass={
                          isOfsActive && ofsReport && isQmxActive && qmxReport
                            ? 'top-16'
                            : (isOfsActive && ofsReport) || (isQmxActive && qmxReport)
                              ? 'top-9'
                              : 'top-2'
                        }
                      />
                    )}
                    {activePineOverlayResults.length > 0 && (
                      <PineScriptOverlay
                        chart={chartApi}
                        mainSeries={mainSeriesApi}
                        containerRef={chartContainerRef}
                        results={activePineOverlayResults}
                      />
                    )}
                  </>
                )}

              {chartMode === 'vela-workspace' && (
                <div className={`w-full ${isExpanded ? 'h-full' : 'h-[600px]'} flex flex-col`}>
                  <div
                    ref={velaWorkspaceRef}
                    className="w-full flex-1 bg-zinc-950 text-white"
                  />
                  <div className="p-2 bg-zinc-900 border-t border-zinc-800 text-[11px] text-zinc-400 flex items-center justify-between">
                    <span>Multi-Chart Grid &bull; Layout: {velaLayout.toUpperCase()}</span>
                    <span className="text-zinc-500 font-mono">OHLCV seeded from Yahoo v8 (10–20m delayed)</span>
                  </div>
                </div>
              )}

              {chartMode === 'svg-fallback' && (
                <div className="w-full overflow-x-auto p-2">
                  <svg
                    viewBox={`0 0 ${svgWidth} ${svgPriceHeight + 40}`}
                    className="w-full h-auto min-w-[700px] select-none font-mono"
                  >
                    <rect x="0" y="0" width={svgWidth} height={svgPriceHeight} fill="#09090b" rx="6" />
                    {candles.map((c, i) => {
                      const x = getSvgX(i);
                      const yOpen = getSvgY(c.open);
                      const yClose = getSvgY(c.close);
                      const yHigh = getSvgY(c.high);
                      const yLow = getSvgY(c.low);
                      const isGreen = c.close >= c.open;
                      return (
                        <g key={c.timestamp}>
                          <line
                            x1={x}
                            y1={yHigh}
                            x2={x}
                            y2={yLow}
                            stroke={isGreen ? '#10b981' : '#f43f5e'}
                            strokeWidth="1.2"
                          />
                          <rect
                            x={x - 3}
                            y={Math.min(yOpen, yClose)}
                            width="6"
                            height={Math.max(2, Math.abs(yClose - yOpen))}
                            fill={isGreen ? '#10b981' : '#f43f5e'}
                          />
                        </g>
                      );
                    })}
                  </svg>
                </div>
              )}

              {/* RULER / MEASUREMENT HUD (WHEN RULER ACTIVE) */}
              {showRulerHUD && (
                <div className="absolute top-3 right-3 z-20 bg-zinc-950/95 border border-sky-500/40 p-2.5 rounded-lg text-xs font-mono shadow-xl backdrop-blur-md space-y-1">
                  <div className="flex items-center space-x-1.5 text-sky-400 font-bold border-b border-zinc-800 pb-1">
                    <Ruler className="w-3.5 h-3.5" />
                    <span>Range Measurement:</span>
                  </div>
                  <div className="flex justify-between gap-4 text-zinc-300">
                    <span className="text-zinc-500">&Delta; Price:</span>
                    <span className="font-bold text-emerald-400">+${rangeDeltaPrice.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between gap-4 text-zinc-300">
                    <span className="text-zinc-500">&Delta; %:</span>
                    <span className="font-bold text-emerald-400">+{rangeDeltaPct.toFixed(2)}%</span>
                  </div>
                  <div className="flex justify-between gap-4 text-zinc-300">
                    <span className="text-zinc-500">Bars in view:</span>
                    <span className="font-bold text-white">{candles.length}</span>
                  </div>
                </div>
              )}
              </div>

              {(() => {
                if (chartMode !== 'vela-pro') return null;
                const ofsHudEnabled = Boolean(isOfsActive && ofsReport && ofsToggles.hud);
                const qmxHudEnabled = Boolean(isQmxActive && qmxReport && qmxToggles.hud);
                const dock = resolveVisibleHudDock({
                  ofsHudEnabled,
                  qmxHudEnabled,
                  preferredHud,
                  isExpanded,
                });
                if (!dock.renderOfsHud && !dock.renderQmxHud) return null;
                return (
                  <div className="hidden lg:flex flex-col h-full min-h-0 overflow-hidden shrink-0 border-l border-[#00E5FF]/25 bg-[#070B16]">
                    {dock.showSwitcher && (
                      <div
                        data-testid="hud-dock-switcher"
                        className="grid grid-cols-2 gap-1 p-1.5 bg-[#0B1226] border-b border-[#00E5FF]/20 text-[10px] font-mono shrink-0"
                      >
                        <button
                          type="button"
                          onClick={() => setPreferredHud('ofs')}
                          className={`px-2 py-1 rounded font-bold transition ${
                            dock.renderOfsHud
                              ? 'bg-[#00E5FF]/20 text-[#00E5FF] border border-[#00E5FF]/40'
                              : 'text-zinc-400 hover:text-white border border-transparent'
                          }`}
                        >
                          Order Flow HUD
                        </button>
                        <button
                          type="button"
                          onClick={() => setPreferredHud('qmx')}
                          className={`px-2 py-1 rounded font-bold transition ${
                            dock.renderQmxHud
                              ? 'bg-[#00FFA3]/20 text-[#00FFA3] border border-[#00FFA3]/40'
                              : 'text-zinc-400 hover:text-white border border-transparent'
                          }`}
                        >
                          Quantum X-Ray HUD
                        </button>
                      </div>
                    )}
                    <div className="flex-1 min-h-0 overflow-hidden">
                      {dock.renderOfsHud && ofsReport && <OrderFlowHudPanel report={ofsReport} />}
                      {dock.renderQmxHud && qmxReport && <QuantumMarketXrayHudPanel report={qmxReport} />}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Indicator Footnotes / Legend (hidden in fullscreen so 100% of vertical space goes to Candles/MACD/RSI/Time Axis) */}
          {!isExpanded && (
            <div className="mt-2.5 pt-2 border-t border-zinc-800 flex flex-wrap items-center justify-between text-[11px] text-zinc-500 gap-2 shrink-0">
              <div className="flex items-center space-x-4">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500"></span>
                  <span>Bullish Candle / 23.6% Trigger</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-rose-500"></span>
                  <span>Bearish Candle / Stop Loss</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-amber-500"></span>
                  <span>61.8% Golden Pocket TP2</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-sky-400"></span>
                  <span>MACD Line / 38.2% TP1</span>
                </span>
              </div>
              <div className="font-mono text-zinc-500">
                Style: <strong className="text-emerald-400 uppercase">{candleStyle}</strong> &bull; Scale: <strong className="text-amber-400 uppercase">{scaleMode}</strong> &bull; Engine: Vela Studio
              </div>
            </div>
          )}
        </div>

        {/* Right col: Setup Blueprint & SEC Filing Insight (Hidden when in expanded fullscreen) */}
        {!isExpanded && (
          <div className="space-y-4">
            {activeSetup ? (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3.5 shadow-xl">
                <div className="flex items-center justify-between pb-2.5 border-b border-zinc-800">
                  <div className="flex items-center space-x-2">
                    <Sliders className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold text-white tracking-wide">SETUP BLUEPRINT</span>
                  </div>
                  <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
                    Score: {activeSetup.qualityScore}%
                  </span>
                </div>

                {/* Exact Geometry */}
                <div className="space-y-2 text-xs font-mono">
                  <div className="flex justify-between items-center py-1 border-b border-zinc-800/60">
                    <span className="text-zinc-400">Trigger (23.6%):</span>
                    <span className="text-emerald-400 font-bold">${activeSetup.triggerPrice.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-zinc-800/60">
                    <span className="text-zinc-400">Stop Loss:</span>
                    <span className="text-rose-400 font-bold">${activeSetup.stopLoss.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-zinc-800/60">
                    <span className="text-zinc-400">Target 1 (38.2%):</span>
                    <span className="text-blue-400 font-bold">${activeSetup.targets.tp1.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-zinc-800/60">
                    <span className="text-zinc-400">Target 2 (61.8%):</span>
                    <span className="text-amber-400 font-bold">${activeSetup.targets.tp2.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-zinc-800/60">
                    <span className="text-zinc-400">Risk/Reward:</span>
                    <span className="text-white font-bold bg-zinc-800 px-2 py-0.5 rounded">
                      1 : {activeSetup.riskRewardRatio}
                    </span>
                  </div>
                </div>

                {/* 3-Tranche Scaling Plan */}
                <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800/80 space-y-1.5 text-[11px]">
                  <div className="font-semibold text-zinc-200 flex items-center justify-between">
                    <span>3-Tranche Scaling:</span>
                    <span className="text-emerald-400 text-[10px]">33 / 33 / 34</span>
                  </div>
                  <div className="text-zinc-400 space-y-1">
                    <div className="flex items-start gap-1.5">
                      <span className="text-emerald-400 font-bold">1.</span>
                      <span>{activeSetup.scalingTranches.tranche1}</span>
                    </div>
                    <div className="flex items-start gap-1.5">
                      <span className="text-sky-400 font-bold">2.</span>
                      <span>{activeSetup.scalingTranches.tranche2}</span>
                    </div>
                    <div className="flex items-start gap-1.5">
                      <span className="text-amber-400 font-bold">3.</span>
                      <span>{activeSetup.scalingTranches.tranche3}</span>
                    </div>
                  </div>
                </div>

                {onOpenCalculator && (
                  <button
                    onClick={() => onOpenCalculator(activeSetup)}
                    className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs rounded-lg transition shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
                  >
                    <Calculator className="w-4 h-4" />
                    <span>Position Sizing Calculator</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 text-center text-xs text-zinc-400 shadow-xl">
                <Layers className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                <div className="font-semibold text-white">No Divergence in Current Window</div>
                <p className="mt-1 text-zinc-500 leading-relaxed">
                  Switch timeframe (e.g. 15m, 1h, 1d) or pick an active setup from the Live Scanner tab.
                </p>
              </div>
            )}

            {/* SEC EDGAR Intelligence Card */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2.5 shadow-xl">
              <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                <div className="flex items-center space-x-2">
                  <FileText className="w-4 h-4 text-violet-400" />
                  <span className="text-xs font-bold text-white">SEC EDGAR Filings</span>
                </div>
                <span className="text-[10px] text-zinc-500 font-mono">Free SEC REST API</span>
              </div>

              {secData && secData.available ? (
                <div className="space-y-2">
                  <div className="text-xs text-zinc-300">
                    Issuer: <span className="text-white font-medium">{secData.entityName || symbol}</span>
                  </div>
                  <div className="space-y-1.5">
                    {secData.filings.slice(0, 3).map((f: any, idx: number) => (
                      <div
                        key={idx}
                        className="p-2 rounded bg-zinc-950 border border-zinc-800/80 text-[11px] flex items-center justify-between"
                      >
                        <div>
                          <span className="font-bold text-violet-400">Form {f.form}</span>
                          <div className="text-zinc-400 text-[10px] truncate max-w-[170px]">
                            {f.description}
                          </div>
                        </div>
                        <span className="text-zinc-500 text-[10px] font-mono">{f.filingDate}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-zinc-400 leading-relaxed">
                  SEC EDGAR filings are queried for US stocks using official SEC CIK numbers.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 5. INDICATORS PICKER MODAL (fx Indicators, Metrics & Strategies) */}
      {showIndicatorModal && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setShowIndicatorModal(false)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden"
          >
            {/* Modal Header */}
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between gap-3">
              <div className="flex items-center space-x-2">
                <span className="font-serif italic text-lg font-bold text-emerald-400">fx</span>
                <h3 className="font-bold text-white text-base">Indicators, Metrics & Strategies</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-testid="toggle-inline-pine-importer"
                  onClick={() => setShowInlineImporter((prev) => !prev)}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                    showInlineImporter
                      ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/40'
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500/40'
                  }`}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{showInlineImporter ? 'Close Importer' : 'Import Pine Script'}</span>
                </button>
                <button
                  onClick={() => setShowIndicatorModal(false)}
                  aria-label="Close Indicators Modal"
                  className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Inline Pine Script v4/v5/v6 Importer Drawer */}
            {showInlineImporter && (
              <form
                onSubmit={handleImportInlinePine}
                className="p-4 border-b border-indigo-500/30 bg-zinc-950/95 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-indigo-300">
                    <Code2 className="w-3.5 h-3.5" />
                    Paste TradingView Pine Script (v4 / v5 / v6)
                  </span>
                  <span className="text-[10px] font-mono text-zinc-500">
                    Executes live on chart via PineTS
                  </span>
                </div>

                {inlinePineError && (
                  <div className="p-2 rounded bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>{inlinePineError}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                  <input
                    type="text"
                    placeholder="Title (optional — auto-detected from script)"
                    value={inlinePineName}
                    onChange={(e) => setInlinePineName(e.target.value)}
                    className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
                  />
                  <select
                    value={inlinePineCategory}
                    onChange={(e) => setInlinePineCategory(e.target.value as IndicatorCategory)}
                    className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="Trend">Trend &amp; Momentum</option>
                    <option value="Oscillator">Oscillator</option>
                    <option value="Reversal">Reversal &amp; Exhaustion</option>
                    <option value="SMC">Smart Money Concepts</option>
                    <option value="Volatility">Volatility &amp; ATR</option>
                    <option value="Volume">Volume &amp; Flow</option>
                  </select>
                </div>

                <textarea
                  rows={5}
                  data-testid="inline-pine-textarea"
                  placeholder={`//@version=6\nindicator("My Custom Cloud", overlay=true)\nfast = ta.ema(close, 9)\nslow = ta.ema(close, 21)\np1 = plot(fast, "Fast", color=fast > slow ? color.emerald : color.rose)\np2 = plot(slow, "Slow", color=color.sky)\nfill(p1, p2, color=fast > slow ? color.new(color.green, 82) : color.new(color.red, 82))`}
                  value={inlinePineCode}
                  onChange={(e) => {
                    setInlinePineCode(e.target.value);
                    if (inlinePineError) setInlinePineError(null);
                  }}
                  className="w-full p-2.5 bg-zinc-900 border border-zinc-800 rounded-lg font-mono text-xs text-indigo-300 focus:outline-none focus:border-indigo-500"
                />

                {inlinePineStatus && (
                  <div
                    className={`p-2 rounded text-[11px] font-mono border ${
                      inlinePineStatus.valid
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                        : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                    }`}
                  >
                    {inlinePineStatus.valid ? 'READY: ' : 'ERROR: '}
                    {inlinePineStatus.message}
                  </div>
                )}

                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    data-testid="inline-pine-test-btn"
                    onClick={handleTestInlinePine}
                    disabled={inlinePineTesting || !inlinePineCode.trim()}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-medium border border-zinc-700 transition disabled:opacity-50"
                  >
                    <Play className="w-3 h-3 text-indigo-400" />
                    <span>{inlinePineTesting ? 'Testing...' : 'Test Script'}</span>
                  </button>
                  <button
                    type="submit"
                    data-testid="inline-pine-apply-btn"
                    className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition"
                  >
                    Import &amp; Apply to Chart
                  </button>
                </div>
              </form>
            )}

            {/* Search & Category Filter */}
            <div className="p-4 border-b border-zinc-800 space-y-3 bg-zinc-950/50">
              <div className="relative">
                <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="Search indicators by name or keyword..."
                  value={indicatorSearch}
                  onChange={(e) => setIndicatorSearch(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div className="flex flex-wrap gap-1.5">
                {['All', 'Trend', 'Oscillator', 'Volatility', 'SMC', 'Reversal', 'Volume'].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-2.5 py-1 text-xs rounded-md font-medium transition ${
                      selectedCategory === cat
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Indicator List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2 divide-y divide-zinc-800/50">
              {filteredIndicators.map((ind) => {
                const isActive = activeCustomIndicatorIds.includes(ind.id);
                return (
                  <div
                    key={ind.id}
                    className="pt-2.5 first:pt-0 flex items-start justify-between gap-4 p-2 rounded-lg hover:bg-zinc-800/40 transition"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-white text-sm">{ind.name}</span>
                        {!ind.isBuiltIn ? (
                          <span className="px-1.5 py-0.5 text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded font-mono font-bold">
                            [Custom]
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 text-[10px] bg-sky-500/20 text-sky-300 border border-sky-500/40 rounded font-mono">
                            Built-in
                          </span>
                        )}
                        <span className="text-[10px] text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded font-mono">
                          {ind.category}
                        </span>
                        <span className="text-[10px] text-zinc-500">
                          {ind.overlay ? 'Overlay' : 'Sub-Pane'}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 leading-snug">{ind.description}</p>
                      <div className="text-[10px] text-zinc-500 font-mono">By {ind.author}</div>
                    </div>

                    <button
                      onClick={() => toggleIndicator(ind.id)}
                      className={`px-3 py-1.5 text-xs font-bold rounded-lg transition whitespace-nowrap flex items-center space-x-1 ${
                        isActive
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30'
                          : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                      }`}
                    >
                      {isActive ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-rose-300" />
                          <span>Active (Remove)</span>
                        </>
                      ) : (
                        <span>+ Add to Chart</span>
                      )}
                    </button>
                  </div>
                );
              })}

              {filteredIndicators.length === 0 && (
                <div className="p-8 text-center text-zinc-500 text-sm">
                  No indicators found matching "{indicatorSearch}"
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3.5 border-t border-zinc-800 bg-zinc-950 flex items-center justify-between text-xs text-zinc-400">
              <span>{activeCustomIndicatorIds.length} custom indicators active on chart</span>
              <button
                onClick={() => setShowIndicatorModal(false)}
                className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg font-medium transition"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. DATA AUTHENTICITY & VERIFICATION MODAL */}
      {showDataAuthModal && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setShowDataAuthModal(false)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center space-x-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-white text-base">Market Data Authenticity (Live Feed)</h3>
              </div>
              <button
                onClick={() => setShowDataAuthModal(false)}
                aria-label="Close Data Authenticity Modal"
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-zinc-300 leading-relaxed">
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
                <strong className="text-emerald-300 block mb-1">
                  100% Real Institutional Exchange Feeds:
                </strong>
                Data displayed in the scanner and charts is streamed from official exchanges
                (NASDAQ, NYSE, CBOE, CME, Binance) via the Yahoo Finance v8 REST API gateway.
              </div>

              <div className="space-y-2 bg-zinc-950 p-3 rounded-lg border border-zinc-800 font-mono text-[11px]">
                <div className="flex justify-between">
                  <span className="text-zinc-500">API Endpoint:</span>
                  <span className="text-zinc-300">query1.finance.yahoo.com/v8/finance/chart</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Venue / Exchange:</span>
                  <span className="text-white font-bold">{feedMeta?.exchange || 'NASDAQ'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Settlement Currency:</span>
                  <span className="text-white font-bold">{feedMeta?.currency || 'USD'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Server UTC:</span>
                  <span className="text-zinc-300">{feedMeta?.serverTimeUtc || new Date().toISOString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Refresh Interval:</span>
                  <span className="text-emerald-400 font-bold">Every 15 seconds (Auto)</span>
                </div>
              </div>

              <p className="text-zinc-400 text-[11px]">
                Every candlestick contains official Open, High, Low, Close prices and verified
                traded volume. When US equity markets are closed (weekends or overnight), the platform displays
                the official closing bell price and keeps the Bucharest and New York clocks synchronized.
              </p>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setShowDataAuthModal(false)}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs rounded-lg transition"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
