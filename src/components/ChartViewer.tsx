import React, { useState, useEffect, useRef } from 'react';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
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
  RefreshCw,
  FileText,
  Calculator,
  Sliders,
  Eye,
  Info,
  Sparkles,
} from 'lucide-react';
import { Candle, IndicatorPoint, DivergenceSetup } from '../utils/trullasStrategy';
import { calculateNadarayaWatsonEnvelope } from '../utils/luxalgoIndicators';
import { getCompanyName } from '../data/sp500Universe';

interface ChartViewerProps {
  initialSymbol?: string;
  onOpenCalculator?: (setup: DivergenceSetup) => void;
}

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
  const [activeSetup, setActiveSetup] = useState<DivergenceSetup | null>(null);

  // Active Chart Mode: 'vela-pro' (TradingView/Vela Engine) | 'vela-workspace' (LuxAlgo Vela Suite) | 'svg-fallback'
  const [chartMode, setChartMode] = useState<'vela-pro' | 'vela-workspace' | 'svg-fallback'>('vela-pro');
  const [showLuxAlgoNWE, setShowLuxAlgoNWE] = useState(true);

  // Chart Container References
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const velaWorkspaceRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

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

  // Load data whenever symbol or timeframe changes
  useEffect(() => {
    loadChartData();
  }, [symbol, timeframe]);

  const loadChartData = async () => {
    setLoading(true);
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
        if (data.divergences && data.divergences.length > 0) {
          setActiveSetup(data.divergences[0]);
        } else {
          setActiveSetup(null);
        }
      }
    } catch (e) {
      console.error('Failed to load chart data', e);
    } finally {
      setLoading(false);
    }
  };

  // ============================================================================
  // RENDER LIGHTWEIGHT / VELA CANDLESTICK ENGINE
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
    const containerWidth = container.clientWidth || 800;

    // Create Chart with high-contrast Dark theme
    const chart = createChart(container, {
      width: containerWidth,
      height: 600,
      layout: {
        background: { type: ColorType.Solid, color: '#09090b' },
        textColor: '#a1a1aa',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      },
      grid: {
        vertLines: { color: '#18181b', style: LineStyle.Dotted },
        horzLines: { color: '#18181b', style: LineStyle.Dotted },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: '#38bdf8',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#0284c7',
        },
        horzLine: {
          color: '#38bdf8',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#0284c7',
        },
      },
      rightPriceScale: {
        borderColor: '#27272a',
        autoScale: true,
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

    // 1. Candlestick Series (Pane 0)
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#f43f5e',
      borderVisible: true,
      borderUpColor: '#10b981',
      borderDownColor: '#f43f5e',
      wickUpColor: '#34d399',
      wickDownColor: '#fb7185',
    }, 0);
    candlestickSeriesRef.current = candlestickSeries;

    const formattedCandles = uniqueCandles.map((c) => ({
      time: Math.floor(c.timestamp / 1000) as any,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    candlestickSeries.setData(formattedCandles);

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
      uniqueCandles.map((c) => ({
        time: Math.floor(c.timestamp / 1000) as any,
        value: c.volume,
        color: c.close >= c.open ? 'rgba(16, 185, 129, 0.4)' : 'rgba(244, 63, 94, 0.4)',
      }))
    );

    // 3. Setup Overlays: Fibonacci Retracement PriceLines & Divergence Markers
    if (activeSetup) {
      // 23.6% Trigger
      candlestickSeries.createPriceLine({
        price: activeSetup.triggerPrice,
        color: '#10b981',
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: `TRIGGER 23.6% ($${activeSetup.triggerPrice.toFixed(2)})`,
      });

      // 38.2% TP1
      candlestickSeries.createPriceLine({
        price: activeSetup.targets.tp1,
        color: '#38bdf8',
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
        title: `TP1 38.2% ($${activeSetup.targets.tp1.toFixed(2)})`,
      });

      // 61.8% Golden Pocket TP2
      candlestickSeries.createPriceLine({
        price: activeSetup.targets.tp2,
        color: '#f59e0b',
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: `TP2 GOLDEN 61.8% ($${activeSetup.targets.tp2.toFixed(2)})`,
      });

      // Stop Loss
      candlestickSeries.createPriceLine({
        price: activeSetup.stopLoss,
        color: '#f43f5e',
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: `STOP LOSS ($${activeSetup.stopLoss.toFixed(2)})`,
      });

      // $P_1, P_2, P_3$ Swing Point Markers
      const isBull = activeSetup.type.includes('BULLISH');
      const markers: any[] = [];

      if (activeSetup.points[0]) {
        const c = uniqueCandles[activeSetup.points[0].index];
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
        const c = uniqueCandles[activeSetup.points[1].index];
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
        const c = uniqueCandles[activeSetup.points[2].index];
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
          createSeriesMarkers(candlestickSeries, markers);
        } catch (e) {
          console.warn('Series marker creation error:', e);
        }
      }
    }

    // 4. Pillar 1: MACD Pane (Pane 1)
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

    // 5. Pillar 2: RSI Pane (Pane 2)
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

    // RSI 70 & 30 reference levels
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

    // 5.5 Optional LuxAlgo Nadaraya-Watson Envelope Overlay (Pane 0)
    if (showLuxAlgoNWE && uniqueCandles.length >= 10) {
      const nwe = calculateNadarayaWatsonEnvelope(uniqueCandles, 8.0, 2.5);

      const upperSeries = chart.addSeries(LineSeries, {
        color: 'rgba(244, 63, 94, 0.85)',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        priceLineVisible: false,
        title: 'LuxAlgo NWE Upper',
      }, 0);

      const midSeries = chart.addSeries(LineSeries, {
        color: 'rgba(56, 189, 248, 0.85)',
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        priceLineVisible: false,
        title: 'LuxAlgo NWE yHat',
      }, 0);

      const lowerSeries = chart.addSeries(LineSeries, {
        color: 'rgba(16, 185, 129, 0.85)',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        priceLineVisible: false,
        title: 'LuxAlgo NWE Lower',
      }, 0);

      const upperData = [];
      const midData = [];
      const lowerData = [];

      for (let i = 0; i < uniqueCandles.length; i++) {
        const time = Math.floor(uniqueCandles[i].timestamp / 1000) as any;
        if (nwe.upper[i] !== undefined) upperData.push({ time, value: nwe.upper[i] });
        if (nwe.yhat[i] !== undefined) midData.push({ time, value: nwe.yhat[i] });
        if (nwe.lower[i] !== undefined) lowerData.push({ time, value: nwe.lower[i] });
      }

      upperSeries.setData(upperData);
      midSeries.setData(midData);
      lowerSeries.setData(lowerData);
    }

    // 6. Crosshair Move Subscription (Updates top legend)
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData) {
        setHoverData(null);
        return;
      }

      const candleVal = param.seriesData.get(candlestickSeries) as any;
      const volVal = param.seriesData.get(volumeSeries) as any;
      const macdVal = param.seriesData.get(macdSeries) as any;
      const signalVal = param.seriesData.get(signalSeries) as any;
      const histVal = param.seriesData.get(histSeries) as any;
      const rsiVal = param.seriesData.get(rsiSeries) as any;

      if (candleVal) {
        setHoverData({
          time: new Date((param.time as number) * 1000).toLocaleDateString(),
          open: candleVal.open,
          high: candleVal.high,
          low: candleVal.low,
          close: candleVal.close,
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

    // 7. Responsive Resizer
    const handleResize = () => {
      if (chartContainerRef.current && chartInstanceRef.current) {
        chartInstanceRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
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
  }, [chartMode, candles, indicatorPoints, activeSetup, showLuxAlgoNWE]);

  // ============================================================================
  // RENDER VELA WORKSPACE (LUXALGO OPEN-SOURCE GITHUB ENGINE)
  // ============================================================================
  useEffect(() => {
    if (chartMode !== 'vela-workspace' || !velaWorkspaceRef.current) {
      return;
    }

    let workspace: any = null;
    let isMounted = true;

    async function initVelaWorkspace() {
      try {
        const { VelaWorkspace } = await import('@luxalgo/vela/workspace');
        if (!isMounted || !velaWorkspaceRef.current) return;

        velaWorkspaceRef.current.innerHTML = '';
        workspace = new VelaWorkspace(velaWorkspaceRef.current, {
          symbol: symbol.includes('-') ? symbol.replace('-', '') : `${symbol}USDT`,
          timeframe: timeframe === '1d' ? 'D' : timeframe.toUpperCase(),
          theme: 'dark',
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
  }, [chartMode, symbol, timeframe]);

  // Current quote helper
  const currentCandle = candles[candles.length - 1];
  const prevCandle = candles[candles.length - 2];
  const lastIndicator = indicatorPoints[indicatorPoints.length - 1];
  const priceChange = currentCandle && prevCandle ? currentCandle.close - prevCandle.close : 0;
  const priceChangePct = prevCandle && prevCandle.close > 0 ? (priceChange / prevCandle.close) * 100 : 0;

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

  // Fixed SVG calculations for the fallback mode (ensures no squashing!)
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

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Chart Control Bar */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-xl">
        {/* Left: Symbol Search, Timeframes, Presets */}
        <div className="flex flex-wrap items-center gap-3">
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

          {/* Engine Selector */}
          <div className="flex items-center space-x-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800 text-xs">
            <button
              onClick={() => setChartMode('vela-pro')}
              className={`px-3 py-1 rounded font-medium transition ${
                chartMode === 'vela-pro'
                  ? 'bg-emerald-600 text-white font-bold shadow-md shadow-emerald-600/30'
                  : 'text-zinc-400 hover:text-white'
              }`}
              title="Interactive Candlesticks with Trullàs Divergences & Fibonacci Grids"
            >
              Vela Candlesticks (Pro)
            </button>
            <button
              onClick={() => setChartMode('vela-workspace')}
              className={`px-3 py-1 rounded font-medium transition ${
                chartMode === 'vela-workspace'
                  ? 'bg-sky-600 text-white font-bold shadow-md shadow-sky-600/30'
                  : 'text-zinc-400 hover:text-white'
              }`}
              title="LuxAlgo Vela Workspace from GitHub"
            >
              Vela Workspace (LuxAlgo)
            </button>
            <button
              onClick={() => setShowLuxAlgoNWE(!showLuxAlgoNWE)}
              className={`px-3 py-1 rounded font-medium transition flex items-center space-x-1.5 ${
                showLuxAlgoNWE
                  ? 'bg-indigo-600 text-white font-bold shadow-md shadow-indigo-600/30'
                  : 'text-zinc-400 hover:text-white'
              }`}
              title="Toggle LuxAlgo Nadaraya-Watson Envelope (NWE) overlay"
            >
              <Sparkles className="w-3 h-3 text-indigo-300" />
              <span>Lux NWE {showLuxAlgoNWE ? 'ON' : 'OFF'}</span>
            </button>
          </div>

          <button
            onClick={loadChartData}
            disabled={loading}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Right: Live Quote & Indicator Pill */}
        {currentCandle && (
          <div className="flex items-center space-x-4 text-xs font-mono bg-zinc-950 px-3 py-1.5 rounded-lg border border-zinc-800">
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
            <div className="hidden md:block">
              <span className="text-zinc-500">MACD: </span>
              <span className={lastIndicator?.macd >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                {lastIndicator?.macd.toFixed(3) || '0.00'}
              </span>
            </div>
            <div className="hidden md:block">
              <span className="text-zinc-500">RSI(14): </span>
              <span className="text-amber-400 font-bold">{lastIndicator?.rsi.toFixed(1) || '50.0'}</span>
            </div>
          </div>
        )}
      </div>

      {/* Main Grid: Left = Candlestick Engine, Right = David Trullàs Blueprint & SEC filings */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left 3 cols: Technical Chart */}
        <div className="lg:col-span-3 bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-5 relative flex flex-col justify-between shadow-2xl">
          {/* Active Setup Banner or Window Summary */}
          {activeSetup ? (
            <div className="flex flex-wrap items-center justify-between pb-3 mb-3 border-b border-zinc-800 gap-2">
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
            <div className="flex flex-wrap items-center justify-between pb-3 mb-3 border-b border-zinc-800 text-xs text-zinc-400 gap-2">
              <div className="flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>David Trullàs 4-Pillars Algorithm Active &bull; MACD (12,26,9) &bull; RSI (14) &bull; Fibonacci</span>
              </div>
              <span className="text-zinc-500 font-mono">No active 3-point divergence on {symbol} ({timeframe})</span>
            </div>
          )}

          {/* Interactive Chart Toolbar (Zoom, Fit, Legend) */}
          {chartMode === 'vela-pro' && (
            <div className="flex flex-wrap items-center justify-between py-2 px-3 bg-zinc-950/80 rounded-lg border border-zinc-800/80 text-xs font-mono mb-3">
              {/* Live Crosshair Values */}
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
                  <span className="text-zinc-500 italic">Hover over candles for precise crosshair inspection &bull; Scroll/drag to pan & zoom</span>
                )}
              </div>

              {/* Zoom Buttons */}
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
                  title="Reset / Fit Content"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Chart Display Container */}
          <div className="relative min-h-[580px] w-full rounded-lg overflow-hidden bg-zinc-950 border border-zinc-800/80">
            {chartMode === 'vela-pro' && (
              <div ref={chartContainerRef} className="w-full h-[600px]" />
            )}

            {chartMode === 'vela-workspace' && (
              <div className="w-full h-[600px] flex flex-col">
                <div
                  ref={velaWorkspaceRef}
                  className="w-full flex-1 bg-zinc-950 text-white"
                />
                <div className="p-2.5 bg-zinc-900 border-t border-zinc-800 text-[11px] text-zinc-400 flex items-center justify-between">
                  <span>Vela Open-Source Workspace by LuxAlgo &bull; WebGL2 accelerated canvas</span>
                  <span className="text-zinc-500 font-mono">github.com/LuxAlgo/vela</span>
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
                  {/* Candlesticks with corrected min/max scaling */}
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
          </div>

          {/* Indicator Footnotes / Legend */}
          <div className="mt-3 pt-3 border-t border-zinc-800 flex flex-wrap items-center justify-between text-[11px] text-zinc-500 gap-2">
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
              Pillars: MACD (12,26,9) &bull; RSI (14) &bull; Volume Exhaustion &bull; Fibonacci
            </div>
          </div>
        </div>

        {/* Right 1 col: Setup Blueprint & SEC Filing Insight */}
        <div className="space-y-5">
          {activeSetup ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4 shadow-xl">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                <div className="flex items-center space-x-2">
                  <Sliders className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold text-white tracking-wide">TRULLÀS BLUEPRINT</span>
                </div>
                <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
                  Score: {activeSetup.qualityScore}%
                </span>
              </div>

              {/* Exact Geometry */}
              <div className="space-y-2.5 text-xs font-mono">
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
              <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800/80 space-y-2 text-[11px]">
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
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3 shadow-xl">
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
                <div className="text-[10px] text-zinc-400 italic pt-1">
                  Insider tracking: Form 4 records executive purchases and sales.
                </div>
              </div>
            ) : (
              <p className="text-xs text-zinc-400 leading-relaxed">
                Free SEC EDGAR filings are queried for US stocks using official SEC CIK numbers. For crypto/forex, volume and volatility filters apply.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
