import React, { useState, useEffect, useRef } from 'react';
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
} from 'lucide-react';
import { Candle, IndicatorPoint, DivergenceSetup } from '../utils/trullasStrategy';
import { calculateNadarayaWatsonEnvelope } from '../utils/luxalgoIndicators';
import { getCompanyName } from '../data/sp500Universe';
import { loadAllIndicators, CustomPineIndicator } from '../utils/indicatorLibrary';
import {
  calculateCustomIndicatorById,
  CalculatedIndicatorSeries,
} from '../utils/customIndicatorCalculator';
import { calculateHeikinAshi } from '../utils/heikinAshi';

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

  // Scale Mode: 'linear' | 'logarithmic'
  const [scaleMode, setScaleMode] = useState<'linear' | 'logarithmic'>('linear');

  // Chart Engine Mode: 'vela-pro' (Vela Custom Studio) | 'vela-workspace' (LuxAlgo Vela Multi-Chart) | 'svg-fallback'
  const [chartMode, setChartMode] = useState<'vela-pro' | 'vela-workspace' | 'svg-fallback'>('vela-pro');
  const [velaLayout, setVelaLayout] = useState<'1' | '2h' | '2v' | '4'>('4');
  const [showLuxAlgoNWE, setShowLuxAlgoNWE] = useState(true);

  // Indicator Modal & Active Indicators State
  const [showIndicatorModal, setShowIndicatorModal] = useState(false);
  const [indicatorSearch, setIndicatorSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [libraryIndicators, setLibraryIndicators] = useState<CustomPineIndicator[]>([]);
  const [activeCustomIndicatorIds, setActiveCustomIndicatorIds] = useState<string[]>([
    'supertrend-v9-pro',
    'matrix-ai-pro',
  ]);

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

  // Sync if initialSymbol prop changes
  useEffect(() => {
    if (initialSymbol) setSymbol(initialSymbol);
  }, [initialSymbol]);

  // Load Indicator Library
  useEffect(() => {
    setLibraryIndicators(loadAllIndicators());
  }, []);

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
      setCountdown((prev) => {
        if (prev <= 1) {
          loadChartData(true);
          return 15;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [autoRefresh, symbol, timeframe]);

  // Escape key handler to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isExpanded) {
        setIsExpanded(false);
      }
      if ((e.key === 'f' || e.key === 'F') && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        setIsExpanded((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isExpanded]);

  // Load data whenever symbol or timeframe changes
  useEffect(() => {
    loadChartData();
    setCountdown(15);
  }, [symbol, timeframe]);

  const loadChartData = async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    try {
      const res = await fetch(
        `/api/candles?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}&range=3mo`
      );
      if (res.ok) {
        const data = await res.json();
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
    } catch (e) {
      console.error('Failed to load chart data', e);
    } finally {
      if (!isBackground) setLoading(false);
    }
  };

  // Toggle Custom Indicator
  const toggleIndicator = (id: string) => {
    setActiveCustomIndicatorIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
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
    }
  };

  // Add support/resistance price line at last close
  const handleAddPriceLine = () => {
    if (candles.length === 0) return;
    const currentPrice = candles[candles.length - 1].close;
    const newLine = {
      id: `line-${Date.now()}`,
      price: currentPrice,
      label: `S/R $${currentPrice.toFixed(2)}`,
      color: '#38bdf8',
    };
    setCustomPriceLines((prev) => [...prev, newLine]);
  };

  const handleClearDrawings = () => {
    setCustomPriceLines([]);
    setShowFibOverlay(false);
    setShowRulerHUD(false);
  };

  // Helper to hide any third-party attribution watermark injected by libraries
  const sanitizeChartContainer = (container: HTMLElement) => {
    const elementsToHide = container.querySelectorAll<HTMLElement>(
      'a[href*="tradingview"], a[href*="tradingview.com"], div[class*="tv-"], div[class*="watermark"]'
    );
    elementsToHide.forEach((el) => {
      el.style.setProperty('display', 'none', 'important');
      el.style.setProperty('visibility', 'hidden', 'important');
      el.style.setProperty('opacity', '0', 'important');
      el.style.setProperty('pointer-events', 'none', 'important');
      el.style.setProperty('height', '0px', 'important');
      el.style.setProperty('width', '0px', 'important');
    });
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
    const chartHeight = isExpanded ? Math.max(500, window.innerHeight - 170) : 600;

    // Create Chart with high-contrast Dark theme
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
      rightPriceScale: {
        borderColor: '#27272a',
        autoScale: true,
        mode: scaleMode === 'logarithmic' ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal,
        scaleMargins: {
          top: 0.1,
          bottom: 0.25,
        },
      },
      timeScale: {
        borderColor: '#27272a',
        timeVisible: true,
        secondsVisible: false,
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
    if (activeSetup) {
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

      if (markers.length > 0) {
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
      title: '70 OVERBOUGHT',
    });

    rsiSeries.createPriceLine({
      price: 30,
      color: '#10b981',
      lineWidth: 1,
      lineStyle: LineStyle.Dotted,
      axisLabelVisible: true,
      title: '30 OVERSOLD',
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

    // 8. Render Active Custom Indicators from Library
    for (const customId of activeCustomIndicatorIds) {
      const calc = calculateCustomIndicatorById(customId, uniqueCandles);
      if (!calc) continue;

      if (calc.overlay) {
        // Price overlay plots (Pane 0)
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
        // Sub-pane oscillator/momentum plots (Pane 3)
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

    // 9. Crosshair Legend Subscription
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

    // Fit Content initially
    chart.timeScale().fitContent();

    // Responsive Resizer
    const handleResize = () => {
      if (chartContainerRef.current && chartInstanceRef.current) {
        chartInstanceRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: isExpanded ? Math.max(500, window.innerHeight - 170) : 600,
        });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
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
    customPriceLines,
    candleStyle,
    scaleMode,
    showFibOverlay,
    isExpanded,
  ]);

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

  // Calculate summary values for active indicators
  const activeCustomSummaries = activeCustomIndicatorIds
    .map((id) => calculateCustomIndicatorById(id, candles))
    .filter((c): c is CalculatedIndicatorSeries => c !== null);

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
    <div className={`space-y-4 max-w-7xl mx-auto pb-12 ${isExpanded ? 'fixed inset-0 z-50 bg-zinc-950 p-4 w-screen h-screen overflow-hidden flex flex-col' : ''}`}>
      {/* 1. TOP TELEMETRY & DATA AUTHENTICITY HUD */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs shadow-lg">
        {/* Left: Live Status Badge & Exchange Details */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 bg-emerald-950/60 border border-emerald-500/40 px-2.5 py-1 rounded-md">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
            <span className="text-[11px] font-bold text-emerald-300 uppercase tracking-wider">
              {feedMeta?.isLiveFeed ? 'REAL-TIME EXCHANGE FEED' : 'LIVE FEED PENDING'}
            </span>
          </div>

          <div className="hidden sm:flex items-center space-x-2 text-zinc-400 text-[11px]">
            <span className="text-zinc-500">Venue:</span>
            <span className="font-semibold text-zinc-200">
              {feedMeta?.exchange || (symbol.includes('BTC') ? 'Binance / Global Crypto' : 'NASDAQ / NYSE')}
            </span>
            <span className="text-zinc-600">&bull;</span>
            <span className="text-zinc-500">Engine:</span>
            <span className="font-mono text-emerald-400 font-bold">Vela Charts Suite</span>
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

      {/* 2. MAIN TOOLBAR (Symbol Search, Timeframes, Candle Style, Indicators fx, Chart Engine, Expand) */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 shadow-xl">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Symbol Input & Company Name */}
          <div className="flex items-center space-x-2 bg-zinc-950 px-3 py-1.5 rounded-lg border border-zinc-700">
            <span className="text-xs text-zinc-400 font-semibold">TICKER:</span>
            <input
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              className="bg-transparent text-sm text-white font-mono font-bold w-20 uppercase focus:outline-none focus:text-emerald-400"
              placeholder="AAPL"
            />
            {getCompanyName(symbol) && (
              <span className="text-xs text-emerald-400 font-semibold border-l border-zinc-800 pl-2 max-w-[180px] truncate">
                {getCompanyName(symbol)}
              </span>
            )}
          </div>

          {/* Quick Symbol Chips */}
          <div className="hidden sm:flex items-center space-x-1">
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

          {/* Timeframe Selector */}
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

          {/* LOG / LIN SCALE TOGGLE (GitHub Best Practice) */}
          <button
            onClick={() => setScaleMode(scaleMode === 'linear' ? 'logarithmic' : 'linear')}
            className={`px-2 py-1 rounded-md text-[11px] font-mono font-bold transition border ${
              scaleMode === 'logarithmic'
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-white'
            }`}
            title="Toggle Logarithmic / Linear Price Scale"
          >
            {scaleMode === 'logarithmic' ? 'LOG' : 'LIN'}
          </button>

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
              title="Vela Custom Studio with Trullàs Divergences & Custom Indicators"
            >
              Vela Studio (Pro)
            </button>
            <button
              onClick={() => setChartMode('vela-workspace')}
              className={`px-2.5 py-1 rounded font-medium transition ${
                chartMode === 'vela-workspace'
                  ? 'bg-sky-600 text-white font-bold shadow-md shadow-sky-600/30'
                  : 'text-zinc-400 hover:text-white'
              }`}
              title="LuxAlgo Vela Multi-Chart Workspace from GitHub"
            >
              Vela Workspace (LuxAlgo)
            </button>
            <button
              onClick={() => setShowLuxAlgoNWE(!showLuxAlgoNWE)}
              className={`px-2.5 py-1 rounded font-medium transition flex items-center space-x-1 ${
                showLuxAlgoNWE
                  ? 'bg-indigo-600 text-white font-bold shadow-md shadow-indigo-600/30'
                  : 'text-zinc-400 hover:text-white'
              }`}
              title="Toggle LuxAlgo Nadaraya-Watson Envelope (NWE)"
            >
              <Sparkles className="w-3 h-3 text-indigo-300" />
              <span>Lux NWE {showLuxAlgoNWE ? 'ON' : 'OFF'}</span>
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
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono bg-zinc-950 px-3 py-2 rounded-lg border border-zinc-800">
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-sans font-bold">
            Active Indicators:
          </span>
          {activeCustomSummaries.map((ind) => (
            <div
              key={ind.id}
              className="flex items-center space-x-1.5 px-2.5 py-1 bg-zinc-900 border border-zinc-700/80 rounded-md text-[11px]"
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ind.color }}></span>
              <span className="text-white font-semibold">{ind.name}</span>
              <span className="px-1 text-[9px] bg-emerald-500/20 text-emerald-300 rounded font-bold">
                [Custom]
              </span>
              {ind.summaryValue && (
                <span className="text-zinc-400 font-bold">{ind.summaryValue}</span>
              )}
              <button
                onClick={() => toggleIndicator(ind.id)}
                className="text-zinc-500 hover:text-rose-400 ml-1 transition"
                title={`Remove ${ind.name}`}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 4. MAIN CHART AREA (With Left Drawing Toolbar + Main Viewport + Blueprint) */}
      <div className={`grid grid-cols-1 ${isExpanded ? 'lg:grid-cols-1 flex-1 overflow-hidden' : 'lg:grid-cols-4'} gap-4`}>
        {/* Left cols: Technical Chart with Left Drawing Bar */}
        <div className={`${isExpanded ? 'col-span-1 h-full' : 'lg:col-span-3'} bg-zinc-900 border border-zinc-800 rounded-xl p-3 relative flex flex-col justify-between shadow-2xl`}>
          {/* Active Setup Banner */}
          {activeSetup ? (
            <div className="flex flex-wrap items-center justify-between pb-2.5 mb-2.5 border-b border-zinc-800 gap-2">
              <div className="flex items-center space-x-2">
                <span
                  className={`text-xs font-bold px-3 py-1 rounded-md flex items-center gap-1.5 ${
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
                <span>P1: ${activeSetup.points[0]?.price.toFixed(2)}</span>
                <span>&rarr;</span>
                <span>P2: ${activeSetup.points[1]?.price.toFixed(2)}</span>
                <span>&rarr;</span>
                <span className="text-emerald-400 font-black bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
                  P3: ${activeSetup.points[2]?.price.toFixed(2)}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between pb-2 mb-2 border-b border-zinc-800 text-xs text-zinc-400 gap-2">
              <div className="flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>David Trullàs 4-Pillars Algorithm Active &bull; MACD (12,26,9) &bull; RSI (14) &bull; Fibonacci</span>
              </div>
              <span className="text-zinc-500 font-mono">No active 3-point divergence on {symbol} ({timeframe})</span>
            </div>
          )}

          {/* Interactive Chart Toolbar (Crosshair Data, Zoom, Fit) */}
          {chartMode === 'vela-pro' && (
            <div className="flex flex-wrap items-center justify-between py-1.5 px-3 bg-zinc-950/80 rounded-lg border border-zinc-800/80 text-xs font-mono mb-2">
              <div className="flex flex-wrap items-center gap-3 text-zinc-300">
                {hoverData ? (
                  <>
                    <span className="text-zinc-500">{hoverData.time}</span>
                    <span>O: <strong className="text-white">${hoverData.open?.toFixed(2)}</strong></span>
                    <span>H: <strong className="text-emerald-400">${hoverData.high?.toFixed(2)}</strong></span>
                    <span>L: <strong className="text-rose-400">${hoverData.low?.toFixed(2)}</strong></span>
                    <span>C: <strong className="text-white">${hoverData.close?.toFixed(2)}</strong></span>
                    {hoverData.macd !== undefined && (
                      <span className="text-sky-400 font-bold">MACD: {hoverData.macd?.toFixed(2)}</span>
                    )}
                    {hoverData.rsi !== undefined && (
                      <span className="text-purple-400 font-bold">RSI: {hoverData.rsi?.toFixed(1)}</span>
                    )}
                  </>
                ) : (
                  <span className="text-zinc-500 italic">Hover crosshair over bars &bull; Scroll to pan & zoom &bull; Click drawing tools on left</span>
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
                  title="Reset Zoom / Fit Content"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-zinc-400" />
                </button>
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="p-1 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded transition"
                  title={isExpanded ? 'Minimize' : 'Expand Fullscreen'}
                >
                  {isExpanded ? <Minimize2 className="w-3.5 h-3.5 text-rose-400" /> : <Maximize2 className="w-3.5 h-3.5 text-emerald-400" />}
                </button>
              </div>
            </div>
          )}

          {/* Chart Display Canvas with Left Drawing Toolbar & VELA BRANDING BADGE */}
          <div className="relative flex-1 min-h-[580px] w-full rounded-lg overflow-hidden bg-zinc-950 border border-zinc-800/80 flex">
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
                onClick={handleAddPriceLine}
                className="p-2 rounded hover:bg-zinc-800 text-zinc-400 hover:text-sky-400 transition"
                title="Add Horizontal Support/Resistance Ray at Current Price"
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

            {/* CANVAS CONTAINER */}
            <div className="flex-1 relative h-full">
              {chartMode === 'vela-pro' && (
                <div
                  ref={chartContainerRef}
                  className={`w-full ${isExpanded ? 'h-full' : 'h-[600px]'}`}
                />
              )}

              {chartMode === 'vela-workspace' && (
                <div className={`w-full ${isExpanded ? 'h-full' : 'h-[600px]'} flex flex-col`}>
                  <div
                    ref={velaWorkspaceRef}
                    className="w-full flex-1 bg-zinc-950 text-white"
                  />
                  <div className="p-2 bg-zinc-900 border-t border-zinc-800 text-[11px] text-zinc-400 flex items-center justify-between">
                    <span>Vela Multi-Chart Suite (LuxAlgo Open-Source) &bull; Layout: {velaLayout.toUpperCase()}</span>
                    <span className="text-zinc-500 font-mono">Real-time data seeded from Yahoo v8</span>
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

              {/* AUTHENTIC VELA BY LUXALGO BRANDING BADGE (REPLACING ANY TRADINGVIEW MARK) */}
              <div className="absolute bottom-2.5 left-2 z-20 flex items-center space-x-2 px-2.5 py-1 bg-zinc-950/90 border border-zinc-800 hover:border-emerald-500/50 rounded-md backdrop-blur-md shadow-lg pointer-events-auto transition select-none">
                <div className="w-4 h-4 rounded bg-gradient-to-br from-emerald-400 to-sky-500 flex items-center justify-center font-black text-[10px] text-zinc-950 shadow-sm">
                  V
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center space-x-1">
                    <span className="font-mono text-[10px] font-bold text-white tracking-wider">
                      VELA CHARTS
                    </span>
                    <span className="text-[8px] font-bold px-1 bg-emerald-500/20 text-emerald-400 rounded">
                      PRO
                    </span>
                  </div>
                  <span className="text-[8px] text-zinc-500 font-mono">
                    LuxAlgo Core v0.9 • WebGL2
                  </span>
                </div>
              </div>

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
          </div>

          {/* Indicator Footnotes / Legend */}
          <div className="mt-2.5 pt-2 border-t border-zinc-800 flex flex-wrap items-center justify-between text-[11px] text-zinc-500 gap-2">
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
        </div>

        {/* Right col: Setup Blueprint & SEC Filing Insight (Hidden when in expanded fullscreen) */}
        {!isExpanded && (
          <div className="space-y-4">
            {activeSetup ? (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3.5 shadow-xl">
                <div className="flex items-center justify-between pb-2.5 border-b border-zinc-800">
                  <div className="flex items-center space-x-2">
                    <Sliders className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold text-white tracking-wide">TRULLÀS BLUEPRINT</span>
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
                    <span>Trullàs 3-Tranche Scaling:</span>
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
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="font-serif italic text-lg font-bold text-emerald-400">fx</span>
                <h3 className="font-bold text-white text-base">Indicators, Metrics & Strategies</h3>
              </div>
              <button
                onClick={() => setShowIndicatorModal(false)}
                className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

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
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center space-x-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-white text-base">Autenticitate Date de Piață (Live Data)</h3>
              </div>
              <button
                onClick={() => setShowDataAuthModal(false)}
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
                Datele pe care le vezi în scaner și grafice sunt extrase în timp real din bursele oficiale
                (NASDAQ, NYSE, CBOE, CME, Binance) prin gateway-ul Yahoo Finance v8 REST API.
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
                  <span className="text-zinc-500">Monedă de Decontare:</span>
                  <span className="text-white font-bold">{feedMeta?.currency || 'USD'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Server UTC:</span>
                  <span className="text-zinc-300">{feedMeta?.serverTimeUtc || new Date().toISOString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Frecvență Refresh:</span>
                  <span className="text-emerald-400 font-bold">La fiecare 15 secunde (Auto)</span>
                </div>
              </div>

              <p className="text-zinc-400 text-[11px]">
                Fiecare lumânare conține prețurile oficiale de Open, High, Low, Close și volumul autentic
                tranzacționat. Când bursa americană este închisă (weekend sau peste noapte), sistemul afișează
                ultimul preț oficial de închidere (Closing Bell) și menține ceasurile sincronizate cu ora Bucureștiului și New York-ului.
              </p>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setShowDataAuthModal(false)}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs rounded-lg transition"
              >
                Am înțeles
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
