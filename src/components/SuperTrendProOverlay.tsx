import React, { useEffect, useRef, useState } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import {
  SuperTrendProReport,
  SuperTrendProPoint,
} from '../utils/superTrendPro';
import {
  createChartCoordBridge,
  createPillCollisionPlacer,
  drawOverlayPill,
  estimateOverlayPillSize,
  formatOverlayPrice,
  getPrimaryPaneBounds,
  resolveSuperTrendHudLayout,
  syncCanvasToContainer,
} from '../utils/chartOverlayPrimitives';
import { Eye, EyeOff, TrendingUp } from 'lucide-react';

export interface SuperTrendVisualToggles {
  cloud: boolean;
  emas: boolean;
  zones: boolean;
  signals: boolean;
  mtf: boolean;
  table: boolean;
  legend: boolean;
}

export const DEFAULT_SUPERTREND_TOGGLES: SuperTrendVisualToggles = {
  cloud: true,
  emas: true,
  zones: true,
  signals: true,
  mtf: true,
  table: true,
  legend: true,
};

interface SuperTrendProOverlayProps {
  chart: IChartApi | null;
  mainSeries: ISeriesApi<any> | null;
  containerRef: React.RefObject<HTMLDivElement | null>;
  report: SuperTrendProReport | null;
  toggles?: SuperTrendVisualToggles;
  onToggleLayer?: (key: keyof SuperTrendVisualToggles) => void;
  onHideOverlay?: () => void;
  toolbarTopClass?: string;
  reservePriceLabelLane?: boolean;
}

const fmtPrice = (v: number | null | undefined) => formatOverlayPrice(v, 4);

function drawCalloutWithStem(
  ctx: CanvasRenderingContext2D,
  leftX: number,
  centerY: number,
  text: string,
  fillBg: string,
  targetX: number,
  targetY: number,
  isBull: boolean,
  isPrime?: boolean
): void {
  ctx.save();
  ctx.font = '700 10.5px "Inter", system-ui, sans-serif';
  const metrics = ctx.measureText(text);
  const padX = 8;
  const w = Math.ceil(metrics.width + padX * 2);
  const h = 21;
  const topY = centerY - h / 2;

  // Connecting stem line from pill to candle bar
  const originX = leftX + w * 0.68;
  const originY = isBull ? topY + h : topY;

  ctx.strokeStyle = fillBg;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(originX, originY);
  ctx.lineTo(targetX, targetY);
  ctx.stroke();

  // Crisp arrowhead dot/triangle on bar target
  ctx.fillStyle = fillBg;
  ctx.beginPath();
  ctx.arc(targetX, targetY, 3, 0, Math.PI * 2);
  ctx.fill();

  // Callout pill
  ctx.fillStyle = fillBg;
  ctx.beginPath();
  ctx.roundRect(leftX, topY, w, h, 4);
  ctx.fill();

  if (isPrime) {
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 1.1;
    ctx.stroke();
  }

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, leftX + w / 2, centerY + 0.5);
  ctx.restore();
}

export const SuperTrendProOverlay: React.FC<SuperTrendProOverlayProps> = ({
  chart,
  mainSeries,
  containerRef,
  report,
  toggles: controlledToggles,
  onToggleLayer,
  onHideOverlay,
  toolbarTopClass = 'top-2',
  reservePriceLabelLane = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [internalToggles, setInternalToggles] = useState<SuperTrendVisualToggles>(
    DEFAULT_SUPERTREND_TOGGLES
  );
  const toggles = controlledToggles ?? internalToggles;
  const [paneBox, setPaneBox] = useState<{
    rightOffset: number;
    priceLabelLanePx: number;
    paneHeight: number;
    paneBottomOffset: number;
  }>({
    rightOffset: 68,
    priceLabelLanePx: 0,
    paneHeight: 380,
    paneBottomOffset: 190,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !chart || !mainSeries || !report || report.series.length === 0) {
      return;
    }

    let rafId = 0;

    const renderOverlay = () => {
      if (!canvasRef.current || !containerRef.current || !chart || !mainSeries || !report) return;

      const synced = syncCanvasToContainer(canvasRef.current, containerRef.current);
      if (!synced) return;
      const { width, height: totalHeight, ctx } = synced;
      const { plotWidth, paneHeight } = getPrimaryPaneBounds(chart, width, totalHeight, 0.65);

      const hudLayout = resolveSuperTrendHudLayout({
        totalWidth: width,
        plotWidth,
        paneHeight,
        reservePriceLabelLane,
        showTable: toggles.table,
        showLegend: toggles.legend,
      });

      const nextPaneBottomOffset = Math.max(8, Math.round(totalHeight - paneHeight + 6));
      setPaneBox((prev) =>
        Math.abs(prev.rightOffset - hudLayout.rightOffset) >= 2 ||
        prev.priceLabelLanePx !== hudLayout.priceLabelLanePx ||
        Math.abs(prev.paneHeight - paneHeight) >= 2 ||
        Math.abs(prev.paneBottomOffset - nextPaneBottomOffset) >= 2
          ? {
              rightOffset: hudLayout.rightOffset,
              priceLabelLanePx: hudLayout.priceLabelLanePx,
              paneHeight,
              paneBottomOffset: nextPaneBottomOffset,
            }
          : prev
      );

      // Reserve right-side telemetry card column + right-edge price-line lane so signal pills stay legible
      const effectiveLabelWidth = hudLayout.effectiveLabelWidth;
      const topMargin = toolbarTopClass.includes('9') ? 58 : toolbarTopClass.includes('16') ? 82 : 34;

      const placer = createPillCollisionPlacer({
        plotWidth: effectiveLabelWidth,
        paneHeight,
        topMargin,
        bottomMargin: 10,
        padding: 4,
      });

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, plotWidth, paneHeight);
      ctx.clip();

      const { timeToX, priceToY } = createChartCoordBridge(chart, mainSeries);

      // ─────────────────────────────────────────────────────────────────────────
      // 1. SUPERTREND CLOUD FILL + COLOR-SWITCHING BAND (GREEN UP / RED DOWN)
      // ─────────────────────────────────────────────────────────────────────────
      if (toggles.cloud && report.series.length > 1) {
        interface MappedPt {
          x: number;
          ySt: number;
          yBody: number;
          trend: 1 | -1;
        }
        const segments: MappedPt[][] = [];
        let currentSeg: MappedPt[] = [];

        for (let i = 0; i < report.series.length; i++) {
          const pt: SuperTrendProPoint = report.series[i];
          const x = timeToX(pt.time);
          const ySt = priceToY(pt.supertrend);
          const bodyMid = (pt.open + pt.close) / 2;
          const yBody = priceToY(bodyMid);
          if (x === null || ySt === null || yBody === null) continue;

          if (currentSeg.length > 0 && currentSeg[currentSeg.length - 1].trend !== pt.trend) {
            segments.push(currentSeg);
            currentSeg = [];
          }
          currentSeg.push({ x, ySt, yBody, trend: pt.trend });
        }
        if (currentSeg.length > 0) segments.push(currentSeg);

        for (const seg of segments) {
          if (seg.length === 0) continue;
          const isBull = seg[0].trend === 1;

          // Translucent cloud fill between body midpoint and SuperTrend band
          if (seg.length >= 2) {
            ctx.beginPath();
            ctx.moveTo(seg[0].x, seg[0].yBody);
            for (let i = 1; i < seg.length; i++) {
              ctx.lineTo(seg[i].x, seg[i].yBody);
            }
            for (let i = seg.length - 1; i >= 0; i--) {
              ctx.lineTo(seg[i].x, seg[i].ySt);
            }
            ctx.closePath();
            ctx.fillStyle = isBull
              ? 'rgba(16, 185, 129, 0.17)'
              : 'rgba(239, 68, 68, 0.19)';
            ctx.fill();
          }

          // Crisp colored SuperTrend line
          ctx.beginPath();
          ctx.moveTo(seg[0].x, seg[0].ySt);
          for (let i = 1; i < seg.length; i++) {
            ctx.lineTo(seg[i].x, seg[i].ySt);
          }
          ctx.strokeStyle = isBull ? '#10b981' : '#ef4444';
          ctx.lineWidth = 2.1;
          ctx.lineJoin = 'round';
          ctx.stroke();

          // Flip origin marker dot
          ctx.fillStyle = isBull ? '#10b981' : '#ef4444';
          ctx.beginPath();
          ctx.arc(seg[0].x, seg[0].ySt, 2.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // ─────────────────────────────────────────────────────────────────────────
      // 2. EMA RIBBON: EMA 20 (Cyan) · EMA 50 (Amber) · EMA 200 (White Dotted)
      // ─────────────────────────────────────────────────────────────────────────
      if (toggles.emas && report.series.length > 1) {
        const drawEmaLine = (
          accessor: (p: SuperTrendProPoint) => number,
          color: string,
          lineWidth: number,
          dash: number[] = []
        ) => {
          ctx.save();
          ctx.beginPath();
          let started = false;
          for (const p of report.series) {
            const x = timeToX(p.time);
            const y = priceToY(accessor(p));
            if (x === null || y === null) continue;
            if (!started) {
              ctx.moveTo(x, y);
              started = true;
            } else {
              ctx.lineTo(x, y);
            }
          }
          if (started) {
            ctx.strokeStyle = color;
            ctx.lineWidth = lineWidth;
            ctx.setLineDash(dash);
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.stroke();
          }
          ctx.restore();
        };

        drawEmaLine((p) => p.ema20, 'rgba(56, 189, 248, 0.92)', 1.35);
        drawEmaLine((p) => p.ema50, 'rgba(245, 158, 11, 0.95)', 1.5);
        drawEmaLine((p) => p.ema200, 'rgba(248, 250, 252, 0.96)', 2.2, [2, 5]);
      }

      // ─────────────────────────────────────────────────────────────────────────
      // 3. HORIZONTAL RESISTANCE (RED) & SUPPORT (GOLD) ZONES
      // ─────────────────────────────────────────────────────────────────────────
      if (toggles.zones) {
        const drawZone = (
          zone: { startTime: number; top: number; bot: number; label: string } | null,
          borderColor: string,
          fillColor: string,
          textColor: string
        ) => {
          if (!zone) return;
          const rawStartX = timeToX(zone.startTime);
          const yTopRaw = priceToY(zone.top);
          const yBotRaw = priceToY(zone.bot);
          if (yTopRaw === null || yBotRaw === null) return;

          const endX = Math.max(80, plotWidth - 6);
          const startX =
            rawStartX === null
              ? Math.max(24, endX - 240)
              : Math.max(20, Math.min(endX - 110, rawStartX));

          const midY = (yTopRaw + yBotRaw) / 2;
          const boxH = Math.max(15, Math.min(28, Math.abs(yBotRaw - yTopRaw)));
          const topY = midY - boxH / 2;

          if (topY + boxH < 4 || topY > paneHeight - 4) return;

          ctx.save();
          ctx.fillStyle = fillColor;
          ctx.strokeStyle = borderColor;
          ctx.lineWidth = 1.4;
          ctx.fillRect(startX, topY, endX - startX, boxH);
          ctx.strokeRect(startX, topY, endX - startX, boxH);

          // Center text within the visible zone clear of the right telemetry card when open
          const visibleEndX = toggles.table || toggles.legend
            ? Math.max(startX + 90, effectiveLabelWidth - 8)
            : endX;
          const labelCenterX = startX + (visibleEndX - startX) / 2;

          ctx.font = '700 9.5px "JetBrains Mono", ui-monospace, monospace';
          ctx.fillStyle = textColor;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(zone.label, labelCenterX, topY + boxH / 2 + 0.5);
          ctx.restore();
        };

        drawZone(
          report.resistanceZone,
          'rgba(239, 68, 68, 0.92)',
          'rgba(239, 68, 68, 0.14)',
          '#f87171'
        );
        drawZone(
          report.supportZone,
          'rgba(250, 204, 21, 0.92)',
          'rgba(250, 204, 21, 0.14)',
          '#fde047'
        );
      }

      // ─────────────────────────────────────────────────────────────────────────
      // 4. BUY / SELL CALLOUT PILLS, DOTS, SWEEPS, EARLY/WEAK & DIVERGENCES
      // ─────────────────────────────────────────────────────────────────────────
      if (toggles.signals) {
        const primarySignals = report.signals.filter((s) => s.kind === 'BUY' || s.kind === 'SELL');
        for (const sig of primarySignals) {
          const x = timeToX(sig.time);
          const yTarget = priceToY(sig.price);
          if (x === null || yTarget === null) continue;
          if (x < 6 || x > effectiveLabelWidth + 24) continue;

          const bg = sig.isBull ? '#10b981' : '#ef4444';
          const estW = 84;
          const anchorX = Math.max(6, x - estW * 0.65);
          const placed = placer.tryPlace({
            x: anchorX,
            y: sig.isBull ? yTarget - 34 : yTarget - 32,
            width: estW,
            height: 22,
            align: 'left',
            nudgeOffsets: sig.isBull
              ? [-34, 34, -56, 56, -78]
              : [-32, 32, -54, 54, -76],
          });
          if (!placed) continue;

          drawCalloutWithStem(
            ctx,
            placed.leftX,
            placed.centerY,
            sig.label,
            bg,
            x,
            sig.isBull ? yTarget + 3 : yTarget - 3,
            sig.isBull,
            sig.isPrime
          );
        }

        const secondarySignals = report.signals.filter(
          (s) => s.kind !== 'BUY' && s.kind !== 'SELL'
        );
        for (const sig of secondarySignals) {
          const x = timeToX(sig.time);
          const yRaw = priceToY(sig.price);
          if (x === null || yRaw === null) continue;
          if (x < 6 || x > effectiveLabelWidth) continue;

          if (sig.kind === 'DOTS') {
            const color = sig.score === 3 ? (sig.isBull ? '#10b981' : '#ef4444') : '#f59e0b';
            const placed = placer.tryPlace({
              x,
              y: sig.isBull ? yRaw - 14 : yRaw + 14,
              width: 24,
              height: 14,
              align: 'center',
              nudgeOffsets: [0, -14, 14],
            });
            if (!placed) continue;
            ctx.save();
            ctx.font = '700 11px ui-monospace, monospace';
            ctx.fillStyle = color;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(sig.label, placed.leftX + 12, placed.centerY);
            ctx.restore();
            continue;
          }

          if (sig.kind === 'DIV') {
            const color = sig.isBull ? '#34d399' : '#c084fc';
            const size = estimateOverlayPillSize(ctx, sig.label, 8.5, 2.5);
            const placed = placer.tryPlace({
              x,
              y: sig.isBull ? yRaw + 14 : yRaw - 14,
              width: size.width,
              height: size.height,
              align: 'center',
              nudgeOffsets: [0, -14, 14, -26, 26],
            });
            if (!placed) continue;
            drawOverlayPill(
              ctx,
              placed.leftX,
              placed.centerY,
              sig.label,
              color,
              'rgba(9, 13, 24, 0.86)',
              'rgba(148, 163, 184, 0.25)',
              'left',
              8.5,
              2.5
            );
            continue;
          }

          const symbolColor =
            sig.kind === 'SWEEP'
              ? '#38bdf8'
              : sig.kind === 'EARLY'
                ? '#f59e0b'
                : '#ec4899';
          const placed = placer.tryPlace({
            x,
            y: sig.isBull ? yRaw + 11 : yRaw - 11,
            width: 12,
            height: 12,
            align: 'center',
            nudgeOffsets: [0, -12, 12],
          });
          if (!placed) continue;
          ctx.save();
          ctx.font = '700 11px ui-monospace, monospace';
          ctx.fillStyle = symbolColor;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(sig.label, placed.leftX + 6, placed.centerY);
          ctx.restore();
        }
      }

      // ─────────────────────────────────────────────────────────────────────────
      // 5. MTF SWING TAGS (1D / 2D / 1W / 1M)
      // ─────────────────────────────────────────────────────────────────────────
      if (toggles.mtf && report.mtfTags.length > 0) {
        for (const tag of report.mtfTags) {
          const x = timeToX(tag.time);
          const yRaw = priceToY(tag.price);
          if (x === null || yRaw === null) continue;
          if (x < 6 || x > effectiveLabelWidth) continue;

          const size = estimateOverlayPillSize(ctx, tag.tag, 8.5, 2.5);
          const placed = placer.tryPlace({
            x,
            y: tag.isBull ? yRaw + 15 : yRaw - 15,
            width: size.width,
            height: size.height,
            align: 'center',
            nudgeOffsets: [0, 14, -14, 28, -28],
          });
          if (!placed) continue;

          drawOverlayPill(
            ctx,
            placed.leftX,
            placed.centerY,
            tag.tag,
            '#ffffff',
            tag.isBull ? '#e11d48' : '#059669',
            tag.isBull ? '#fda4af' : '#6ee7b7',
            'left',
            8.5,
            2.5
          );
        }
      }

      ctx.restore();
    };

    const scheduleRender = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(renderOverlay);
    };

    scheduleRender();

    const ts = chart.timeScale();
    ts.subscribeVisibleLogicalRangeChange?.(scheduleRender);
    ts.subscribeVisibleTimeRangeChange?.(scheduleRender);

    const ro = new ResizeObserver(scheduleRender);
    ro.observe(container);

    return () => {
      cancelAnimationFrame(rafId);
      try {
        ts.unsubscribeVisibleLogicalRangeChange?.(scheduleRender);
        ts.unsubscribeVisibleTimeRangeChange?.(scheduleRender);
      } catch {
        // ignore
      }
      ro.disconnect();
    };
  }, [chart, mainSeries, containerRef, report, toggles, toolbarTopClass, reservePriceLabelLane]);

  if (!report) return null;

  const toggleLayer = (key: keyof SuperTrendVisualToggles) => {
    if (onToggleLayer) {
      onToggleLayer(key);
    } else {
      setInternalToggles((prev) => ({ ...prev, [key]: !prev[key] }));
    }
  };

  const d = report.dashboard;
  const showLegendCard = toggles.legend && paneBox.paneHeight >= 470;

  return (
    <>
      <canvas
        ref={canvasRef}
        data-testid="supertrend-pro-canvas"
        className="absolute inset-0 w-full h-full pointer-events-none z-10"
      />

      {/* Top-Left Compact Layer Toggle Bar */}
      <div
        className={`absolute ${toolbarTopClass} left-2 z-20 flex flex-wrap items-center gap-0.5 bg-[#090d18]/90 backdrop-blur-md border border-[#2962FF]/50 rounded-lg px-1.5 py-0.5 text-[9.5px] font-mono shadow-lg ${
          paneBox.priceLabelLanePx > 0 ? 'max-w-[calc(100%-365px)]' : 'max-w-[calc(100%-265px)]'
        }`}
      >
        <span className="text-emerald-400 font-bold flex items-center gap-1 pr-1.5 border-r border-zinc-700/80 shrink-0">
          <TrendingUp className="w-3 h-3" />
          <span>ST v9</span>
          {onHideOverlay && (
            <button
              type="button"
              onClick={onHideOverlay}
              data-testid="hide-supertrend-eye-btn"
              className="ml-0.5 p-0.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-amber-300 transition"
              title="Hide SuperTrend v9 from chart without removing"
              aria-label="Hide SuperTrend v9 from chart"
            >
              <Eye className="w-2.5 h-2.5" />
            </button>
          )}
        </span>
        {(
          [
            ['cloud', 'Cloud'],
            ['emas', 'EMAs'],
            ['zones', 'S·R'],
            ['signals', 'Signals'],
            ['mtf', 'MTF'],
            ['table', 'Table'],
            ['legend', 'Legend'],
          ] as Array<[keyof SuperTrendVisualToggles, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => toggleLayer(key)}
            className={`px-1.5 py-0.5 rounded transition flex items-center gap-0.5 shrink-0 ${
              toggles[key]
                ? 'bg-[#111c38] text-emerald-300 border border-[#2962FF]/50'
                : 'text-zinc-500 hover:text-zinc-300 border border-transparent'
            }`}
          >
            {toggles[key] ? <Eye className="w-2.5 h-2.5" /> : <EyeOff className="w-2.5 h-2.5" />}
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* Top-Right TradingView Blue-Framed Telemetry Table */}
      {toggles.table && (
        <div
          data-testid="supertrend-telemetry-table"
          data-reserved-price-lane={paneBox.priceLabelLanePx}
          style={{ right: `${paneBox.rightOffset}px` }}
          className="absolute top-2 z-20 pointer-events-none rounded border border-[#2962FF]/80 bg-[#090d18]/82 backdrop-blur-sm shadow-xl text-[9.5px] font-mono text-zinc-200 overflow-hidden w-[184px]"
        >
          <div className="flex items-center justify-between border-b border-[#2962FF]/60 bg-[#0d1528]/90 px-2 py-0.5 font-bold text-zinc-100 whitespace-nowrap">
            <span>SuperTrend v9</span>
            <span className="text-sky-300">{d.symbol}</span>
          </div>
          <div className="divide-y divide-[#2962FF]/30">
            <div className="flex items-center justify-between px-2 py-0.5 whitespace-nowrap">
              <span className="text-zinc-400">Trend</span>
              <span className={`font-bold ${d.isBull ? 'text-emerald-400' : 'text-rose-400'}`}>
                {d.trendLabel}
              </span>
            </div>
            <div className="flex items-center justify-between px-2 py-0.5 whitespace-nowrap">
              <span className="text-zinc-400">RSI</span>
              <span className="font-semibold text-zinc-100">{d.rsi.toFixed(1)}</span>
            </div>
            <div className="flex items-center justify-between px-2 py-0.5 whitespace-nowrap">
              <span className="text-zinc-400">Volume</span>
              <span
                className={`font-semibold ${
                  d.volumeState === 'high'
                    ? 'text-emerald-300'
                    : d.volumeState === 'low'
                      ? 'text-zinc-400'
                      : 'text-zinc-200'
                }`}
              >
                {d.volumeState}
              </span>
            </div>
            <div className="flex items-center justify-between px-2 py-0.5 border-b border-[#2962FF]/50 whitespace-nowrap">
              <span className="text-zinc-400">EMAs</span>
              <span
                className={`font-semibold ${
                  d.emasAligned ? 'text-emerald-400' : 'text-amber-300'
                }`}
              >
                {d.emaOrderText.replace(/ > /g, '>').replace(/ < /g, '<')}
              </span>
            </div>
            <div className="flex items-center justify-between px-2 py-0.5 whitespace-nowrap">
              <span className="text-sky-400">EMA 20</span>
              <span className="font-bold text-sky-300">{fmtPrice(d.ema20)}</span>
            </div>
            <div className="flex items-center justify-between px-2 py-0.5 whitespace-nowrap">
              <span className="text-amber-400">EMA 50</span>
              <span className="font-bold text-amber-300">{fmtPrice(d.ema50)}</span>
            </div>
            <div className="flex items-center justify-between px-2 py-0.5 whitespace-nowrap">
              <span className="text-zinc-300">EMA 200</span>
              <span className="font-bold text-white">{fmtPrice(d.ema200)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Bottom-Right TradingView Blue-Framed Signals Legend Card (flush above Pane 0 bottom) */}
      {showLegendCard && (
        <div
          data-testid="supertrend-signals-legend"
          data-reserved-price-lane={paneBox.priceLabelLanePx}
          style={{
            right: `${paneBox.rightOffset}px`,
            bottom: `${paneBox.paneBottomOffset}px`,
          }}
          className="hidden sm:block absolute z-20 pointer-events-none rounded border border-[#2962FF]/80 bg-[#090d18]/82 backdrop-blur-sm shadow-xl text-[9px] font-mono text-zinc-300 overflow-hidden w-[184px]"
        >
          <div className="border-b border-[#2962FF]/60 bg-[#0d1528]/90 px-2 py-0.5 font-bold text-zinc-200 whitespace-nowrap">
            Signals
          </div>
          <div className="divide-y divide-[#2962FF]/25">
            <div className="flex items-center justify-between px-2 py-[1px] whitespace-nowrap">
              <span className="text-emerald-400 font-bold">▲ Buy</span>
              <span className="text-zinc-400">entry</span>
            </div>
            <div className="flex items-center justify-between px-2 py-[1px] whitespace-nowrap">
              <span className="text-amber-400 font-bold">••</span>
              <span className="text-zinc-400">score 2 (2/3)</span>
            </div>
            <div className="flex items-center justify-between px-2 py-[1px] whitespace-nowrap">
              <span className="text-emerald-400 font-bold">•••</span>
              <span className="text-zinc-400">score 3 (3/3)</span>
            </div>
            <div className="flex items-center justify-between px-2 py-[1px] whitespace-nowrap">
              <span className="text-amber-300 font-bold">★ PRIME</span>
              <span className="text-zinc-400">A+ confluence</span>
            </div>
            <div className="flex items-center justify-between px-2 py-[1px] whitespace-nowrap">
              <span className="text-sky-400 font-bold">+ Sweep</span>
              <span className="text-zinc-400">liquidity grab</span>
            </div>
            <div className="flex items-center justify-between px-2 py-[1px] whitespace-nowrap">
              <span className="text-amber-400 font-bold">◆ Early</span>
              <span className="text-zinc-400">buy forming</span>
            </div>
            <div className="flex items-center justify-between px-2 py-[1px] whitespace-nowrap">
              <span className="text-rose-400 font-bold">◆ Weak</span>
              <span className="text-zinc-400">top reversal</span>
            </div>
            <div className="flex items-center justify-between px-2 py-[1px] whitespace-nowrap">
              <span className="text-zinc-400">tags</span>
              <span className="text-zinc-200">MTF 1D 2D 1W 1M</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
