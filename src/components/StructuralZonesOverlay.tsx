import React, { useEffect, useRef } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import type { MarketStructuralSummary } from '../utils/marketStructuralContext';
import {
  createChartCoordBridge,
  formatOverlayPrice,
  getPrimaryPaneBounds,
  syncCanvasToContainer,
} from '../utils/chartOverlayPrimitives';

interface StructuralZonesOverlayProps {
  chart: IChartApi | null;
  mainSeries: ISeriesApi<any> | null;
  containerRef: React.RefObject<HTMLDivElement | null>;
  structural: MarketStructuralSummary | null;
  visible: boolean;
  rightPaddingPx?: number;
}

/**
 * Renders Feature 2 on Pane 0:
 *  - Institutional Buy Zone (HVN Support + Bullish OB + VAL/Weekly Band cluster)
 *  - Volume Gap (LVN Air Pockets where historical volume participation is thin)
 * Synced to the price axis with full eye toggle support.
 */
export const StructuralZonesOverlay: React.FC<StructuralZonesOverlayProps> = ({
  chart,
  mainSeries,
  containerRef,
  structural,
  visible,
  rightPaddingPx = 12,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!visible || !canvasRef.current || !containerRef.current || !chart || !mainSeries || !structural) {
      return;
    }

    let rafId = 0;

    const renderZones = () => {
      if (!canvasRef.current || !containerRef.current || !chart || !mainSeries || !structural) return;
      const synced = syncCanvasToContainer(canvasRef.current, containerRef.current);
      if (!synced) return;
      const { width, height: totalHeight, ctx } = synced;
      const { plotWidth, paneHeight } = getPrimaryPaneBounds(chart, width, totalHeight, 0.65);
      const { priceToY } = createChartCoordBridge(chart, mainSeries);
      const zoneRightX = Math.max(140, plotWidth - Math.max(8, rightPaddingPx));

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, plotWidth, paneHeight);
      ctx.clip();

      // 1. Render LVN Volume Gap Air Pockets
      for (const gap of structural.volumeGaps.slice(0, 3)) {
        const yHi = priceToY(gap.high);
        const yLo = priceToY(gap.low);
        if (yHi === null || yLo === null) continue;
        const top = Math.min(yHi, yLo);
        const h = Math.max(10, Math.abs(yLo - yHi));
        if (top + h < 0 || top > paneHeight) continue;

        ctx.save();
        ctx.fillStyle = gap.isSpotInside
          ? 'rgba(245, 158, 11, 0.11)'
          : 'rgba(168, 85, 247, 0.065)';
        ctx.strokeStyle = gap.isSpotInside
          ? 'rgba(245, 158, 11, 0.65)'
          : 'rgba(168, 85, 247, 0.42)';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 4]);
        ctx.fillRect(0, top, zoneRightX, h);
        ctx.strokeRect(0, top, zoneRightX, h);
        ctx.setLineDash([]);

        if (h >= 14) {
          ctx.font = '700 9.5px "JetBrains Mono", ui-monospace, monospace';
          const tag = gap.isSpotInside
            ? `VOL GAP (AIR POCKET) $${formatOverlayPrice(gap.low, 2)}–$${formatOverlayPrice(gap.high, 2)}`
            : `VOL GAP $${formatOverlayPrice(gap.low, 2)}–$${formatOverlayPrice(gap.high, 2)}`;
          ctx.fillStyle = gap.isSpotInside ? '#fbbf24' : '#c084fc';
          ctx.textAlign = 'right';
          ctx.textBaseline = 'middle';
          ctx.fillText(tag, zoneRightX - 10, top + Math.min(12, h / 2));
        }
        ctx.restore();
      }

      // 2. Render Institutional Buy Zone (Smart Money + HVN Confluence)
      if (structural.institutionalBuyZone) {
        const ibz = structural.institutionalBuyZone;
        const yHi = priceToY(ibz.high);
        const yLo = priceToY(ibz.low);
        if (yHi !== null && yLo !== null) {
          const top = Math.min(yHi, yLo);
          const h = Math.max(14, Math.abs(yLo - yHi));
          if (top + h >= 0 && top <= paneHeight) {
            ctx.save();
            ctx.fillStyle = 'rgba(59, 130, 246, 0.14)';
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.72)';
            ctx.lineWidth = 1.2;
            ctx.fillRect(0, top, zoneRightX, h);
            ctx.strokeRect(0, top, zoneRightX, h);

            ctx.font = '700 9.5px "JetBrains Mono", ui-monospace, monospace';
            const srcShort = ibz.anchorSources[0]?.replace('Weekly/Macro ', '') || 'HVN';
            const label = `INST BUY $${formatOverlayPrice(ibz.low, 2)}–$${formatOverlayPrice(ibz.high, 2)} (${srcShort})`;
            const textW = ctx.measureText(label).width + 12;
            const maxAvail = Math.max(100, zoneRightX - 115);
            const pillW = Math.min(textW, maxAvail);
            const pillX = Math.max(108, zoneRightX - 8 - pillW);
            const pillY = Math.max(10, Math.min(paneHeight - 20, top + 6));
            ctx.fillStyle = 'rgba(9, 9, 11, 0.90)';
            ctx.beginPath();
            ctx.roundRect(pillX, pillY, pillW, 16, 3);
            ctx.fill();
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.72)';
            ctx.lineWidth = 0.9;
            ctx.stroke();

            ctx.fillStyle = '#38bdf8';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, pillX + pillW / 2, pillY + 8.5, pillW - 8);
            ctx.restore();
          }
        }
      }

      ctx.restore();
    };

    const scheduleRender = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(renderZones);
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
  }, [chart, mainSeries, containerRef, structural, visible, rightPaddingPx]);

  if (!visible || !structural) return null;

  return (
    <canvas
      ref={canvasRef}
      data-testid="structural-zones-canvas"
      className="absolute inset-0 w-full h-full pointer-events-none z-[6]"
    />
  );
};
