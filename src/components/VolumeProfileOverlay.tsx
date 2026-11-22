import React, { useEffect, useRef } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import type { Candle } from '../utils/trullasStrategy';
import {
  computeVolumeProfile,
  VolumeProfileResult,
} from '../utils/volumeProfileEngine';
import {
  createChartCoordBridge,
  formatOverlayPrice,
  getPrimaryPaneBounds,
  syncCanvasToContainer,
} from '../utils/chartOverlayPrimitives';

interface VolumeProfileOverlayProps {
  chart: IChartApi | null;
  mainSeries: ISeriesApi<any> | null;
  containerRef: React.RefObject<HTMLDivElement | null>;
  candles: Candle[];
  visible: boolean;
  rightPaddingPx?: number;
  onProfileUpdate?: (profile: VolumeProfileResult | null) => void;
}

/**
 * Visible-Range Volume Profile (VRVP) Canvas Overlay modeled after TradingView &
 * lightweight-orderflow-charts: computes 48-row volume-at-price histogram across
 * currently visible bars and renders POC (Gold), VAH/VAL 70% Value Area band,
 * Buy/Sell split bars, and HVN/LVN structural markers inside Pane 0.
 */
export const VolumeProfileOverlay: React.FC<VolumeProfileOverlayProps> = ({
  chart,
  mainSeries,
  containerRef,
  candles,
  visible,
  rightPaddingPx = 0,
  onProfileUpdate,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastSignatureRef = useRef<string>('');
  const onProfileUpdateRef = useRef(onProfileUpdate);
  onProfileUpdateRef.current = onProfileUpdate;

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!visible || !canvas || !container || !chart || !mainSeries || candles.length === 0) {
      if (!visible && onProfileUpdateRef.current) {
        const full = computeVolumeProfile(candles, { rows: 48, valueAreaPct: 0.7 });
        onProfileUpdateRef.current(full);
      }
      return;
    }

    let rafId = 0;

    const renderProfile = () => {
      if (!canvasRef.current || !containerRef.current || !chart || !mainSeries || candles.length === 0) {
        return;
      }

      const synced = syncCanvasToContainer(canvasRef.current, containerRef.current);
      if (!synced) return;
      const { width, height: totalHeight, ctx } = synced;
      const { plotWidth, paneHeight } = getPrimaryPaneBounds(chart, width, totalHeight, 0.65);

      const ts = chart.timeScale();
      let visibleCandles = candles;
      try {
        const range = ts.getVisibleLogicalRange?.();
        if (range && Number.isFinite(range.from) && Number.isFinite(range.to)) {
          const fromIdx = Math.max(0, Math.floor(range.from));
          const toIdx = Math.min(candles.length - 1, Math.ceil(range.to));
          if (toIdx - fromIdx >= 5) {
            visibleCandles = candles.slice(fromIdx, toIdx + 1);
          }
        }
      } catch {
        visibleCandles = candles;
      }

      const profile = computeVolumeProfile(visibleCandles, { rows: 48, valueAreaPct: 0.7 });
      if (!profile) {
        onProfileUpdateRef.current?.(null);
        return;
      }

      const sig = `${profile.poc}|${profile.vah}|${profile.val}|${profile.barCount}|${visibleCandles[visibleCandles.length - 1]?.timestamp}`;
      if (sig !== lastSignatureRef.current) {
        lastSignatureRef.current = sig;
        onProfileUpdateRef.current?.(profile);
      }

      const { priceToY } = createChartCoordBridge(chart, mainSeries);

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, plotWidth, paneHeight);
      ctx.clip();

      // 1. Shaded 70% Value Area Region (VAL <-> VAH)
      const yVah = priceToY(profile.vah);
      const yVal = priceToY(profile.val);
      const yPoc = priceToY(profile.poc);

      if (yVah !== null && yVal !== null) {
        const topVa = Math.min(yVah, yVal);
        const heightVa = Math.max(2, Math.abs(yVal - yVah));
        ctx.fillStyle = 'rgba(56, 189, 248, 0.055)';
        ctx.fillRect(0, topVa, plotWidth, heightVa);
      }

      // 2. Right-anchored horizontal Volume Histogram Bars (clear of axis & floating ST table)
      const profileRightX = Math.max(120, plotWidth - Math.max(8, rightPaddingPx));
      const maxBarWidth = Math.min(130, Math.max(54, plotWidth * 0.16));
      const maxBinVol = Math.max(1, profile.pocVolume);

      for (const bin of profile.bins) {
        const yTop = priceToY(bin.top);
        const yBot = priceToY(bin.bottom);
        if (yTop === null || yBot === null) continue;

        const barTop = Math.min(yTop, yBot);
        const barH = Math.max(1.5, Math.abs(yBot - yTop) - 1);
        if (barTop + barH < 0 || barTop > paneHeight) continue;

        const totalRatio = Math.min(1, bin.volume / maxBinVol);
        const totalW = totalRatio * maxBarWidth;
        if (totalW < 1) continue;

        const buyRatio = bin.volume > 0 ? bin.buyVolume / bin.volume : 0.5;
        const buyW = totalW * buyRatio;
        const sellW = totalW - buyW;
        const startX = profileRightX - totalW;

        if (bin.isPoc) {
          ctx.fillStyle = 'rgba(245, 158, 11, 0.72)';
          ctx.fillRect(startX, barTop, totalW, barH);
        } else if (bin.inValueArea) {
          ctx.fillStyle = 'rgba(16, 185, 129, 0.34)';
          ctx.fillRect(startX, barTop, buyW, barH);
          ctx.fillStyle = 'rgba(244, 63, 94, 0.34)';
          ctx.fillRect(startX + buyW, barTop, sellW, barH);
        } else {
          ctx.fillStyle = 'rgba(148, 163, 184, 0.16)';
          ctx.fillRect(startX, barTop, totalW, barH);
        }
      }

      // 3. Draw VAH / VAL dashed lines & Gold POC ray
      const drawLevelLine = (
        y: number | null,
        color: string,
        label: string,
        dashed: boolean,
        lineWidth: number
      ) => {
        if (y === null || y < 10 || y > paneHeight - 10) return;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(profileRightX, y);
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        if (dashed) ctx.setLineDash([5, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Left-side compact price tag so it never overlaps right-side cards or axis labels
        ctx.font = '700 9.5px "JetBrains Mono", ui-monospace, monospace';
        const textW = ctx.measureText(label).width + 10;
        ctx.fillStyle = 'rgba(9, 9, 11, 0.88)';
        ctx.beginPath();
        ctx.roundRect(48, y - 8, textW, 16, 3);
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 0.9;
        ctx.stroke();

        ctx.fillStyle = color;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, 53, y + 0.5);
        ctx.restore();
      };

      drawLevelLine(yVah, 'rgba(56, 189, 248, 0.78)', `VAH $${formatOverlayPrice(profile.vah, 2)}`, true, 1.2);
      drawLevelLine(yVal, 'rgba(56, 189, 248, 0.78)', `VAL $${formatOverlayPrice(profile.val, 2)}`, true, 1.2);
      drawLevelLine(yPoc, '#F59E0B', `POC $${formatOverlayPrice(profile.poc, 2)}`, false, 1.8);

      ctx.restore();
    };

    const scheduleRender = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(renderProfile);
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
        // ignore chart disposal race
      }
      ro.disconnect();
    };
  }, [chart, mainSeries, containerRef, candles, visible, rightPaddingPx]);

  if (!visible) return null;

  return (
    <canvas
      ref={canvasRef}
      data-testid="volume-profile-canvas"
      className="absolute inset-0 w-full h-full pointer-events-none z-[8]"
    />
  );
};
