import React, { useEffect, useRef } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import type { SuperKumoReport } from '../utils/superKumoMpro';
import {
  createChartCoordBridge,
  createPillCollisionPlacer,
  drawOverlayPill,
  estimateOverlayPillSize,
  formatOverlayPrice,
  getPrimaryPaneBounds,
  syncCanvasToContainer,
} from '../utils/chartOverlayPrimitives';

interface SuperKumoOverlayProps {
  chart: IChartApi | null;
  mainSeries: ISeriesApi<any> | null;
  containerRef: React.RefObject<HTMLDivElement | null>;
  report: SuperKumoReport | null;
  visible: boolean;
  rightPaddingPx?: number;
}

function fillCloudSegment(
  ctx: CanvasRenderingContext2D,
  pts: Array<{ x: number; yA: number; yB: number }>,
  fillColor: string
) {
  if (pts.length < 2) return;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].yA);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].yA);
  for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(pts[i].x, pts[i].yB);
  ctx.closePath();
  ctx.fillStyle = fillColor;
  ctx.fill();
  ctx.restore();
}

export const SuperKumoOverlay: React.FC<SuperKumoOverlayProps> = ({
  chart,
  mainSeries,
  containerRef,
  report,
  visible,
  rightPaddingPx = 12,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!visible || !canvasRef.current || !containerRef.current || !chart || !mainSeries || !report) {
      return;
    }

    let rafId = 0;
    const render = () => {
      if (!canvasRef.current || !containerRef.current || !chart || !mainSeries || !report) return;
      const synced = syncCanvasToContainer(canvasRef.current, containerRef.current);
      if (!synced) return;
      const { width, height: totalHeight, ctx } = synced;
      const { plotWidth, paneHeight } = getPrimaryPaneBounds(chart, width, totalHeight, 0.65);
      const { timeToX, priceToY } = createChartCoordBridge(chart, mainSeries);

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, plotWidth, paneHeight);
      ctx.clip();

      // 1. S/R Horizontal Zone Bands (Blue Support / Orange Resistance)
      const rightEdge = Math.max(120, plotWidth - Math.max(8, rightPaddingPx));
      for (const z of report.zones) {
        const yHi = priceToY(z.high);
        const yLo = priceToY(z.low);
        const yMid = priceToY(z.level);
        if (yHi === null || yLo === null || yMid === null) continue;
        const top = Math.min(yHi, yLo);
        const h = Math.max(6, Math.abs(yLo - yHi));
        if (top + h < 0 || top > paneHeight) continue;

        const isRes = z.kind === 'R';
        ctx.fillStyle = isRes ? 'rgba(245, 158, 11, 0.10)' : 'rgba(56, 189, 248, 0.10)';
        ctx.strokeStyle = isRes ? 'rgba(245, 158, 11, 0.55)' : 'rgba(56, 189, 248, 0.55)';
        ctx.lineWidth = 1;
        ctx.fillRect(0, top, rightEdge, h);
        ctx.strokeRect(0, top, rightEdge, h);

        if (yMid >= 12 && yMid <= paneHeight - 12) {
          ctx.font = '700 9.5px "JetBrains Mono", ui-monospace, monospace';
          ctx.fillStyle = isRes ? '#fbbf24' : '#38bdf8';
          ctx.textAlign = 'right';
          ctx.textBaseline = 'middle';
          ctx.fillText(`${z.kind} $${formatOverlayPrice(z.level, 2)}`, rightEdge - 8, yMid);
        }
      }

      // 2. Ichimoku Kumo Cloud Fill
      let segBull: boolean | null = null;
      let segPts: Array<{ x: number; yA: number; yB: number }> = [];
      for (const b of report.bars) {
        const x = timeToX(b.time);
        const yA = priceToY(b.kumoA);
        const yB = priceToY(b.kumoB);
        if (x === null || yA === null || yB === null) continue;
        const isBull = b.kumoA >= b.kumoB;
        if (segBull !== null && isBull !== segBull) {
          fillCloudSegment(
            ctx,
            segPts,
            segBull ? 'rgba(16, 185, 129, 0.14)' : 'rgba(244, 63, 94, 0.14)'
          );
          segPts = segPts.length > 0 ? [segPts[segPts.length - 1]] : [];
        }
        segBull = isBull;
        segPts.push({ x, yA, yB });
      }
      if (segPts.length >= 2 && segBull !== null) {
        fillCloudSegment(
          ctx,
          segPts,
          segBull ? 'rgba(16, 185, 129, 0.14)' : 'rgba(244, 63, 94, 0.14)'
        );
      }

      // 3. Tenkan (teal) & Kijun (orange) lines
      const drawLine = (vals: Array<{ time: number; val: number }>, color: string, widthPx: number) => {
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = widthPx;
        ctx.beginPath();
        let started = false;
        for (const p of vals) {
          const x = timeToX(p.time);
          const y = priceToY(p.val);
          if (x === null || y === null) continue;
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
        if (started) ctx.stroke();
        ctx.restore();
      };

      drawLine(report.bars.map((b) => ({ time: b.time, val: b.tenkan })), 'rgba(20, 184, 166, 0.9)', 1.4);
      drawLine(report.bars.map((b) => ({ time: b.time, val: b.kijun })), 'rgba(249, 115, 22, 0.9)', 1.5);

      // 4. Active Trail Stop dashed line
      if (report.dashboard.trailStop !== null) {
        const yTrail = priceToY(report.dashboard.trailStop);
        if (yTrail !== null && yTrail >= 10 && yTrail <= paneHeight - 10) {
          ctx.save();
          ctx.strokeStyle = '#94a3b8';
          ctx.lineWidth = 1.1;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(Math.max(40, rightEdge - 240), yTrail);
          ctx.lineTo(rightEdge, yTrail);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.font = '700 9.5px "JetBrains Mono", ui-monospace, monospace';
          ctx.fillStyle = '#cbd5e1';
          ctx.textAlign = 'right';
          ctx.textBaseline = 'bottom';
          ctx.fillText(`Trail stop $${report.dashboard.trailStop.toFixed(2)}`, rightEdge - 6, yTrail - 3);
          ctx.restore();
        }
      }

      // 5. Collision-free Signal Pills (BUY, SELL, EARLY, PB ADD, DCA)
      const placer = createPillCollisionPlacer({
        plotWidth,
        paneHeight,
        topMargin: 28,
        bottomMargin: 8,
        padding: 3,
      });

      const recentSignals = report.signals.slice(-14);
      for (const sig of recentSignals) {
        const x = timeToX(sig.time);
        const y = priceToY(sig.price);
        if (x === null || y === null || x < 12 || x > plotWidth - 20) continue;

        const isBull = sig.direction === 'BULL';
        const bg =
          sig.kind === 'BUY' || sig.kind === 'BUY_MORE'
            ? '#059669'
            : sig.kind === 'SELL' || sig.kind === 'SELL_MORE'
              ? '#e11d48'
              : sig.kind === 'EARLY_BUY'
                ? '#0d9488'
                : sig.kind === 'EARLY_SELL'
                  ? '#9f1239'
                  : sig.kind === 'DCA'
                    ? '#2563eb'
                    : '#7c3aed';

        const size = estimateOverlayPillSize(ctx, sig.label, 9.5, 3);
        const desiredY = isBull ? y + 18 : y - 18;
        const pos = placer.tryPlace({
          x,
          y: desiredY,
          width: size.width,
          height: size.height,
          align: 'center',
          nudgeOffsets: isBull ? [0, 18, 36, -18] : [0, -18, -36, 18],
        });
        if (!pos) continue;

        drawOverlayPill(ctx, pos.leftX, pos.centerY, sig.label, '#ffffff', bg, undefined, 'left', 9.5, 3);
      }

      ctx.restore();
    };

    const scheduleRender = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(render);
    };

    scheduleRender();
    const ts = chart.timeScale();
    ts.subscribeVisibleLogicalRangeChange?.(scheduleRender);
    ts.subscribeVisibleTimeRangeChange?.(scheduleRender);
    const ro = new ResizeObserver(scheduleRender);
    ro.observe(containerRef.current);

    return () => {
      cancelAnimationFrame(rafId);
      try {
        ts.unsubscribeVisibleLogicalRangeChange?.(scheduleRender);
        ts.unsubscribeVisibleTimeRangeChange?.(scheduleRender);
      } catch {
        // ignore disposal race
      }
      ro.disconnect();
    };
  }, [chart, mainSeries, containerRef, report, visible, rightPaddingPx]);

  if (!visible || !report) return null;

  return (
    <canvas
      ref={canvasRef}
      data-testid="superkumo-canvas"
      className="absolute inset-0 w-full h-full pointer-events-none z-[7]"
    />
  );
};
