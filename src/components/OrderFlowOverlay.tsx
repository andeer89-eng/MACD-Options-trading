import React, { useEffect, useRef, useState } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import {
  OfsReport,
  OFS_COLORS,
  formatOfsK,
} from '../utils/orderFlowStrategy';
import {
  buildMeterBlocks,
  createChartCoordBridge,
  createPillCollisionPlacer,
  drawOverlayPill,
  estimateOverlayPillSize,
  formatOverlayPrice,
  getPrimaryPaneBounds,
  syncCanvasToContainer,
} from '../utils/chartOverlayPrimitives';
import { Eye, EyeOff, Layers, Minimize2, Maximize2 } from 'lucide-react';

export interface OfsVisualToggles {
  wave: boolean;
  valueArea: boolean;
  zone: boolean;
  footprint: boolean;
  liquidity: boolean;
  inefficiency: boolean;
  trades: boolean;
  hud: boolean;
}

export const DEFAULT_OFS_TOGGLES: OfsVisualToggles = {
  wave: true,
  valueArea: true,
  zone: true,
  footprint: true,
  liquidity: true,
  inefficiency: true,
  trades: true,
  hud: true,
};

interface OrderFlowOverlayProps {
  chart: IChartApi | null;
  mainSeries: ISeriesApi<any> | null;
  containerRef: React.RefObject<HTMLDivElement | null>;
  report: OfsReport | null;
  toggles?: OfsVisualToggles;
  onToggleLayer?: (key: keyof OfsVisualToggles) => void;
  onHideOverlay?: () => void;
  toolbarTopClass?: string;
}

const fmtPrice = (v: number | null | undefined) => formatOverlayPrice(v, 4);
const drawPill = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  textColor: string,
  bgColor: string = 'rgba(11, 15, 28, 0.90)',
  borderColor?: string,
  align: 'left' | 'center' | 'right' = 'center',
  fontSize: number = 10
) => drawOverlayPill(ctx, x, y, text, textColor, bgColor, borderColor, align, fontSize, 4);

export const OrderFlowOverlay: React.FC<OrderFlowOverlayProps> = ({
  chart,
  mainSeries,
  containerRef,
  report,
  toggles: controlledToggles,
  onToggleLayer,
  onHideOverlay,
  toolbarTopClass = 'top-2',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [internalToggles, setInternalToggles] = useState<OfsVisualToggles>(DEFAULT_OFS_TOGGLES);
  const toggles = controlledToggles ?? internalToggles;

  // Pixel-synchronized redraw loop hooked to lightweight-charts timeScale & container size
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !chart || !mainSeries || !report || report.candles.length === 0) {
      return;
    }

    let rafId = 0;

    const renderOverlay = () => {
      if (!canvasRef.current || !containerRef.current || !chart || !mainSeries || !report) return;

      const synced = syncCanvasToContainer(canvasRef.current, containerRef.current);
      if (!synced) return;
      const { width, height: totalHeight, ctx } = synced;
      const { plotWidth, paneHeight } = getPrimaryPaneBounds(chart, width, totalHeight, 0.65);
      const topMargin = toolbarTopClass.includes('9') ? 58 : 34;
      const placer = createPillCollisionPlacer({
        plotWidth,
        paneHeight,
        topMargin,
        bottomMargin: 8,
        padding: 4,
      });

      const tryDrawPlacedPill = (
        x: number,
        y: number,
        text: string,
        textColor: string,
        bgColor: string = 'rgba(11, 15, 28, 0.90)',
        borderColor?: string,
        align: 'left' | 'center' | 'right' = 'center',
        fontSize: number = 9,
        nudgeOffsets: number[] = [0, -18, 18, -34, 34]
      ) => {
        const size = estimateOverlayPillSize(ctx, text, fontSize, 4);
        const placed = placer.tryPlace({
          x,
          y,
          width: size.width,
          height: size.height,
          align,
          nudgeOffsets,
        });
        if (!placed) return;
        drawPill(ctx, placed.leftX, placed.centerY, text, textColor, bgColor, borderColor, 'left', fontSize);
      };

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, plotWidth, paneHeight);
      ctx.clip();

      const { timeToX, priceToY } = createChartCoordBridge(chart, mainSeries);

      // Estimate pixel width per bar for crisp Footprint rendering
      let barPx = 8;
      if (report.candles.length >= 2) {
        const xA = timeToX(Math.floor(report.candles[report.candles.length - 2].timestamp / 1000));
        const xB = timeToX(Math.floor(report.candles[report.candles.length - 1].timestamp / 1000));
        if (xA !== null && xB !== null && Math.abs(xB - xA) > 1) {
          barPx = Math.abs(xB - xA);
        }
      }

      // ─────────────────────────────────────────────────────────────────────────
      // 1. VALUE AREA BAND (VAH · POC · VAL with Indigo glow & Gold POC)
      // ─────────────────────────────────────────────────────────────────────────
      if (toggles.valueArea && report.valueAreaSeries.length > 1) {
        const vaPts: Array<{ x: number; yHigh: number; yLow: number; yPoc: number }> = [];
        for (const p of report.valueAreaSeries) {
          const x = timeToX(p.time);
          const yHigh = priceToY(p.vaHigh);
          const yLow = priceToY(p.vaLow);
          const yPoc = priceToY(p.vaPOC);
          if (x !== null && yHigh !== null && yLow !== null && yPoc !== null) {
            vaPts.push({ x, yHigh, yLow, yPoc });
          }
        }
        if (vaPts.length > 1) {
          // Fill Indigo band
          ctx.beginPath();
          ctx.moveTo(vaPts[0].x, vaPts[0].yHigh);
          for (let i = 1; i < vaPts.length; i++) ctx.lineTo(vaPts[i].x, vaPts[i].yHigh);
          for (let i = vaPts.length - 1; i >= 0; i--) ctx.lineTo(vaPts[i].x, vaPts[i].yLow);
          ctx.closePath();
          ctx.fillStyle = 'rgba(83, 109, 254, 0.11)';
          ctx.fill();

          // VAH line
          ctx.beginPath();
          ctx.moveTo(vaPts[0].x, vaPts[0].yHigh);
          for (let i = 1; i < vaPts.length; i++) ctx.lineTo(vaPts[i].x, vaPts[i].yHigh);
          ctx.strokeStyle = 'rgba(83, 109, 254, 0.78)';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 3]);
          ctx.stroke();

          // VAL line
          ctx.beginPath();
          ctx.moveTo(vaPts[0].x, vaPts[0].yLow);
          for (let i = 1; i < vaPts.length; i++) ctx.lineTo(vaPts[i].x, vaPts[i].yLow);
          ctx.stroke();
          ctx.setLineDash([]);

          // POC Gold Glow + Crisp Gold Line
          ctx.beginPath();
          ctx.moveTo(vaPts[0].x, vaPts[0].yPoc);
          for (let i = 1; i < vaPts.length; i++) ctx.lineTo(vaPts[i].x, vaPts[i].yPoc);
          ctx.strokeStyle = 'rgba(255, 196, 0, 0.24)';
          ctx.lineWidth = 7;
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(vaPts[0].x, vaPts[0].yPoc);
          for (let i = 1; i < vaPts.length; i++) ctx.lineTo(vaPts[i].x, vaPts[i].yPoc);
          ctx.strokeStyle = OFS_COLORS.cGold;
          ctx.lineWidth = 1.8;
          ctx.stroke();

          // Label tags for VALUE AREA & POC
          const lastV = vaPts[vaPts.length - 1];
          const midV = vaPts[Math.max(0, Math.floor(vaPts.length * 0.18))];
          const valNow = report.dashboard.valueArea.val;
          const pocNow = report.dashboard.valueArea.poc;
          if (midV && valNow !== null) {
            ctx.save();
            ctx.font = '700 10px "JetBrains Mono", monospace';
            ctx.fillStyle = 'rgba(83, 109, 254, 0.9)';
            ctx.fillText('VALUE AREA', Math.max(10, midV.x), Math.min(paneHeight - 8, midV.yLow - 6));
            ctx.restore();
          }
          if (pocNow !== null) {
            tryDrawPlacedPill(
              Math.min(plotWidth - 10, lastV.x + 8),
              lastV.yPoc,
              `POC ${fmtPrice(pocNow)}`,
              '#070B16',
              OFS_COLORS.cGold,
              undefined,
              'right',
              10,
              [0, -18, 18]
            );
          }
        }
      }

      // ─────────────────────────────────────────────────────────────────────────
      // 2. ORDER FLOW PRESSURE WAVE (Cyan Buyers Ribbon vs Purple Sellers Ribbon)
      // ─────────────────────────────────────────────────────────────────────────
      if (toggles.wave && report.waves.length > 2) {
        const wPts: Array<{
          x: number;
          yMid: number;
          yUpO: number;
          yUpI: number;
          yDnI: number;
          yDnO: number;
          state: 1 | -1 | 0;
        }> = [];
        for (const w of report.waves) {
          const x = timeToX(w.time);
          const yMid = priceToY(w.wMid);
          const yUpO = priceToY(w.wUpOuter);
          const yUpI = priceToY(w.wUpInner);
          const yDnI = priceToY(w.wDnInner);
          const yDnO = priceToY(w.wDnOuter);
          if (x !== null && yMid !== null && yUpO !== null && yUpI !== null && yDnI !== null && yDnO !== null) {
            wPts.push({ x, yMid, yUpO, yUpI, yDnI, yDnO, state: w.flowState });
          }
        }

        if (wPts.length > 2) {
          // Outer & inner Cyan buyer wave fill
          ctx.beginPath();
          ctx.moveTo(wPts[0].x, wPts[0].yMid);
          for (let i = 1; i < wPts.length; i++) ctx.lineTo(wPts[i].x, wPts[i].yMid);
          for (let i = wPts.length - 1; i >= 0; i--) ctx.lineTo(wPts[i].x, wPts[i].yUpO);
          ctx.closePath();
          ctx.fillStyle = 'rgba(0, 229, 255, 0.08)';
          ctx.fill();

          ctx.beginPath();
          ctx.moveTo(wPts[0].x, wPts[0].yMid);
          for (let i = 1; i < wPts.length; i++) ctx.lineTo(wPts[i].x, wPts[i].yMid);
          for (let i = wPts.length - 1; i >= 0; i--) ctx.lineTo(wPts[i].x, wPts[i].yUpI);
          ctx.closePath();
          ctx.fillStyle = 'rgba(0, 229, 255, 0.12)';
          ctx.fill();

          // Outer & inner Purple seller wave fill
          ctx.beginPath();
          ctx.moveTo(wPts[0].x, wPts[0].yMid);
          for (let i = 1; i < wPts.length; i++) ctx.lineTo(wPts[i].x, wPts[i].yMid);
          for (let i = wPts.length - 1; i >= 0; i--) ctx.lineTo(wPts[i].x, wPts[i].yDnO);
          ctx.closePath();
          ctx.fillStyle = 'rgba(168, 85, 247, 0.08)';
          ctx.fill();

          ctx.beginPath();
          ctx.moveTo(wPts[0].x, wPts[0].yMid);
          for (let i = 1; i < wPts.length; i++) ctx.lineTo(wPts[i].x, wPts[i].yMid);
          for (let i = wPts.length - 1; i >= 0; i--) ctx.lineTo(wPts[i].x, wPts[i].yDnI);
          ctx.closePath();
          ctx.fillStyle = 'rgba(168, 85, 247, 0.13)';
          ctx.fill();

          // Outer & inner boundary strokes
          const strokeCurve = (getY: (p: (typeof wPts)[0]) => number, color: string, lw: number) => {
            ctx.beginPath();
            ctx.moveTo(wPts[0].x, getY(wPts[0]));
            for (let i = 1; i < wPts.length; i++) ctx.lineTo(wPts[i].x, getY(wPts[i]));
            ctx.strokeStyle = color;
            ctx.lineWidth = lw;
            ctx.stroke();
          };

          strokeCurve((p) => p.yUpO, 'rgba(0, 229, 255, 0.42)', 1);
          strokeCurve((p) => p.yUpI, 'rgba(0, 229, 255, 0.85)', 1.5);
          strokeCurve((p) => p.yDnO, 'rgba(168, 85, 247, 0.42)', 1);
          strokeCurve((p) => p.yDnI, 'rgba(168, 85, 247, 0.85)', 1.5);

          // Dynamic-colored core curve
          for (let i = 1; i < wPts.length; i++) {
            ctx.beginPath();
            ctx.moveTo(wPts[i - 1].x, wPts[i - 1].yMid);
            ctx.lineTo(wPts[i].x, wPts[i].yMid);
            ctx.strokeStyle = wPts[i].state >= 0 ? OFS_COLORS.cCyan : OFS_COLORS.cPurple;
            ctx.lineWidth = 2;
            ctx.stroke();
          }
        }
      }

      // ─────────────────────────────────────────────────────────────────────────
      // 3. DISCOUNT / PREMIUM FIB ZONE (0.705 – 0.788 – 0.886) + LEG ANCHOR
      // ─────────────────────────────────────────────────────────────────────────
      const zone = report.dashboard.activeZone;
      if (toggles.zone && zone) {
        const yTop = priceToY(zone.top);
        const yBot = priceToY(zone.bottom);
        const yMid = priceToY(zone.mid);
        const x0Raw = timeToX(zone.legEndTime);
        const xLeg0 = timeToX(zone.legStartTime);
        const yLeg0 = priceToY(zone.side === 1 ? zone.legLow : zone.legHigh);
        const yLeg1 = priceToY(zone.side === 1 ? zone.legHigh : zone.legLow);

        if (yTop !== null && yBot !== null) {
          const xStart = Math.max(12, x0Raw ?? plotWidth * 0.28);
          const xEnd = plotWidth - 4;
          const zColor = zone.side === 1 ? OFS_COLORS.cBull : OFS_COLORS.cBear;
          const boxTop = Math.min(yTop, yBot);
          const boxH = Math.max(4, Math.abs(yBot - yTop));

          ctx.fillStyle = zone.side === 1 ? 'rgba(0, 255, 156, 0.11)' : 'rgba(255, 45, 85, 0.11)';
          ctx.fillRect(xStart, boxTop, Math.max(20, xEnd - xStart), boxH);
          ctx.strokeStyle = zone.side === 1 ? 'rgba(0, 255, 156, 0.55)' : 'rgba(255, 45, 85, 0.55)';
          ctx.lineWidth = 1.2;
          ctx.strokeRect(xStart, boxTop, Math.max(20, xEnd - xStart), boxH);

          if (yMid !== null) {
            ctx.beginPath();
            ctx.moveTo(xStart, yMid);
            ctx.lineTo(xEnd, yMid);
            ctx.strokeStyle = 'rgba(255, 159, 28, 0.85)';
            ctx.setLineDash([5, 4]);
            ctx.stroke();
            ctx.setLineDash([]);
          }

          if (xLeg0 !== null && x0Raw !== null && yLeg0 !== null && yLeg1 !== null) {
            ctx.beginPath();
            ctx.moveTo(xLeg0, yLeg0);
            ctx.lineTo(x0Raw, yLeg1);
            ctx.strokeStyle = 'rgba(192, 198, 212, 0.5)';
            ctx.setLineDash([2, 3]);
            ctx.stroke();
            ctx.setLineDash([]);
          }

          const volTxt =
            zone.volumeProfileClass === 'THIN'
              ? 'Thin volume (LVN)'
              : zone.volumeProfileClass === 'UNTESTED'
              ? 'Untested'
              : 'Normal volume';
          const zLabel = `${zone.side === 1 ? 'DISCOUNT' : 'PREMIUM'} · 0.705–0.886 · ${volTxt}`;
          tryDrawPlacedPill(
            Math.min(plotWidth - 220, xStart + 12),
            zone.side === 1 ? boxTop + boxH + 12 : Math.max(16, boxTop - 12),
            zLabel,
            zColor,
            'rgba(11, 15, 28, 0.92)',
            zColor,
            'left',
            9.5,
            [0, -18, 18]
          );
        }
      }

      // ─────────────────────────────────────────────────────────────────────────
      // 4. BUY-SIDE / SELL-SIDE LIQUIDITY ZONES (BSL / SSL & Sweeps)
      // ─────────────────────────────────────────────────────────────────────────
      if (toggles.liquidity) {
        for (const liq of report.liquidityZones) {
          const yTop = priceToY(liq.top);
          const yBot = priceToY(liq.bot);
          const yMid = priceToY(liq.price);
          const xStart = timeToX(liq.startTime) ?? 20;
          const xEnd = liq.swept && liq.sweptTime ? (timeToX(liq.sweptTime) ?? plotWidth - 6) : plotWidth - 6;
          if (yTop === null || yBot === null || yMid === null) continue;

          const col = liq.isHigh ? OFS_COLORS.cBear : OFS_COLORS.cBull;
          const topY = Math.min(yTop, yBot);
          const h = Math.max(3, Math.abs(yBot - yTop));

          ctx.fillStyle = liq.isHigh ? 'rgba(255, 45, 85, 0.14)' : 'rgba(0, 255, 156, 0.14)';
          ctx.fillRect(xStart, topY, Math.max(20, xEnd - xStart), h);
          ctx.strokeStyle = col;
          ctx.lineWidth = 1;
          ctx.setLineDash(liq.swept ? [4, 4] : []);
          ctx.strokeRect(xStart, topY, Math.max(20, xEnd - xStart), h);
          ctx.setLineDash([]);

          if (!liq.swept) {
            tryDrawPlacedPill(
              Math.max(12, xStart + 6),
              liq.isHigh ? topY - 10 : topY + h + 10,
              `${liq.isHigh ? 'BSL' : 'SSL'} · ${liq.touches > 1 ? `Eq x${liq.touches}` : liq.isHigh ? 'High' : 'Low'} (${fmtPrice(liq.price)})`,
              col,
              'rgba(11, 15, 28, 0.88)',
              'rgba(255,255,255,0.08)',
              'left',
              9,
              [0, -18, 18]
            );
          } else if (liq.sweptTime) {
            const sx = timeToX(liq.sweptTime);
            const sy = priceToY(liq.sweepExtreme ?? liq.price);
            if (sx !== null && sy !== null) {
              tryDrawPlacedPill(
                sx,
                liq.isHigh ? sy - 14 : sy + 14,
                liq.isHigh ? 'BSL Swept ⟲' : 'SSL Swept ⟲',
                col,
                'rgba(11, 15, 28, 0.92)',
                col,
                'center',
                9,
                [0, -18, 18]
              );
            }
          }
        }
      }

      // ─────────────────────────────────────────────────────────────────────────
      // 5. INEFFICIENCY CORRIDORS & IMPULSE CANDLES
      // ─────────────────────────────────────────────────────────────────────────
      if (toggles.inefficiency) {
        const visibleGaps = report.inefficiencies.filter((g) => g.active).slice(-2);
        for (const gap of visibleGaps) {
          const yTop = priceToY(gap.top);
          const yBot = priceToY(gap.bot);
          const xStart = timeToX(gap.startTime);
          const xEnd = gap.active ? plotWidth - 6 : timeToX(gap.endTime) ?? plotWidth - 6;
          if (yTop === null || yBot === null || xStart === null) continue;
          const col = gap.dir === 1 ? OFS_COLORS.cCyan : OFS_COLORS.cPurple;
          const boxT = Math.min(yTop, yBot);
          const boxH = Math.max(3, Math.abs(yBot - yTop));

          ctx.fillStyle = gap.dir === 1 ? 'rgba(0, 229, 255, 0.08)' : 'rgba(168, 85, 247, 0.09)';
          ctx.fillRect(xStart, boxT, Math.max(16, xEnd - xStart), boxH);
          ctx.strokeStyle = col;
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 3]);
          ctx.strokeRect(xStart, boxT, Math.max(16, xEnd - xStart), boxH);
          ctx.setLineDash([]);

          tryDrawPlacedPill(
            Math.min(plotWidth - 150, Math.max(20, xStart + 18)),
            boxT + boxH / 2,
            gap.label,
            col,
            'rgba(11, 15, 28, 0.88)',
            undefined,
            'left',
            9,
            [0, -16, 16]
          );
        }

        for (const imp of report.impulses.slice(-3)) {
          const x = timeToX(imp.time);
          const yH = priceToY(imp.high);
          const yL = priceToY(imp.low);
          if (x === null || yH === null || yL === null || x < 12 || x > plotWidth - 12) continue;
          const col = imp.up ? OFS_COLORS.cBull : OFS_COLORS.cBear;
          const hw = Math.max(4, barPx * 0.44);
          ctx.strokeStyle = col;
          ctx.lineWidth = 1.4;
          ctx.strokeRect(x - hw, yH - 3, hw * 2, Math.max(6, yL - yH + 6));
          tryDrawPlacedPill(
            x,
            imp.up ? yL + 14 : yH - 14,
            `⚡ Impulse ${imp.deltaPct >= 0 ? '+' : ''}${Math.round(imp.deltaPct)}%`,
            OFS_COLORS.cSilver,
            'rgba(11, 15, 28, 0.90)',
            col,
            'center',
            9,
            [0, -18, 18]
          );
        }
      }

      // ─────────────────────────────────────────────────────────────────────────
      // 6. 6-ROW FOOTPRINTS & DELTA TAGS ON RECENT CANDLES
      // ─────────────────────────────────────────────────────────────────────────
      if (toggles.footprint && report.footprints.length > 0) {
        const showNumbers = barPx >= 19;
        const cellHalfW = Math.max(5.5, Math.min(26, barPx * 0.45));
        let lastDeltaPillX = -999;

        for (const fp of report.footprints) {
          const x = timeToX(fp.time);
          if (x === null || x < 0 || x > plotWidth) continue;

          if (barPx >= 6) {
            for (const row of fp.rows) {
              const yTop = priceToY(row.top);
              const yBot = priceToY(row.bot);
              if (yTop === null || yBot === null) continue;
              const rh = Math.max(3, Math.abs(yBot - yTop));
              const rt = Math.min(yTop, yBot);

              // Left cell: Sellers (red / bright magenta on 400%+ imbalance)
              ctx.fillStyle = row.sellImbalance
                ? 'rgba(255, 43, 214, 0.78)'
                : `rgba(255, 45, 85, ${(0.22 + row.sellIntensity * 0.50).toFixed(2)})`;
              ctx.fillRect(x - cellHalfW, rt, cellHalfW - 0.5, rh);

              // Right cell: Buyers (green / bright cyan on 400%+ imbalance)
              ctx.fillStyle = row.buyImbalance
                ? 'rgba(0, 229, 255, 0.80)'
                : `rgba(0, 255, 156, ${(0.22 + row.buyIntensity * 0.50).toFixed(2)})`;
              ctx.fillRect(x + 0.5, rt, cellHalfW - 0.5, rh);

              // Gold POC outline around highest-volume row of the candle
              if (row.isPoc) {
                ctx.strokeStyle = OFS_COLORS.cGold;
                ctx.lineWidth = 1.2;
                ctx.strokeRect(x - cellHalfW, rt, cellHalfW * 2, rh);
              }

              if (showNumbers && rh >= 9) {
                ctx.save();
                ctx.font = '700 7.5px "JetBrains Mono", monospace';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = row.sellImbalance ? '#FFFFFF' : '#E2E8F0';
                ctx.textAlign = 'right';
                ctx.fillText(formatOfsK(row.sellVol), x - 1.5, rt + rh / 2);
                ctx.fillStyle = row.buyImbalance ? '#001A20' : '#E2E8F0';
                ctx.textAlign = 'left';
                ctx.fillText(formatOfsK(row.buyVol), x + 1.5, rt + rh / 2);
                ctx.restore();
              }
            }
          }

          // Delta Pill beneath footprint bars (skip overlapping adjacent labels when narrow)
          const yLow = priceToY(fp.low);
          if (yLow !== null && barPx >= 10 && x - lastDeltaPillX >= 44) {
            lastDeltaPillX = x;
            const dc = fp.delta >= 0 ? OFS_COLORS.cBull : OFS_COLORS.cBear;
            tryDrawPlacedPill(
              x,
              Math.min(paneHeight - 12, yLow + 15),
              `Δ ${fp.delta >= 0 ? '+' : '−'}${formatOfsK(fp.delta)}`,
              dc,
              'rgba(11, 15, 28, 0.92)',
              dc,
              'center',
              9,
              [0, 16, -16]
            );
          }
        }
      }

      // ─────────────────────────────────────────────────────────────────────────
      // 7. ABSORPTION FOOTPRINTS, FIRST SHIFTS & TRAPPED TRADERS / ENTRY BOXES
      // ─────────────────────────────────────────────────────────────────────────
      for (const ab of report.absorptions) {
        const x = timeToX(ab.time);
        const y = priceToY(ab.price);
        if (x === null || y === null) continue;
        const col = ab.side === 1 ? OFS_COLORS.cCyan : OFS_COLORS.cMagenta;

        // Outer glow circle + inner dot
        ctx.beginPath();
        ctx.arc(x, y, 10, 0, Math.PI * 2);
        ctx.fillStyle = ab.side === 1 ? 'rgba(0, 229, 255, 0.22)' : 'rgba(255, 43, 214, 0.22)';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = col;
        ctx.fill();

        tryDrawPlacedPill(
          x,
          ab.side === 1 ? y + 26 : y - 26,
          ab.label,
          col,
          'rgba(11, 15, 28, 0.92)',
          col,
          'center',
          9,
          [0, -20, 20]
        );
      }

      for (const sh of report.firstShifts) {
        const x = timeToX(sh.time);
        const y = priceToY(sh.price);
        if (x === null || y === null) continue;
        const col = sh.side === 1 ? OFS_COLORS.cCyan : OFS_COLORS.cMagenta;
        ctx.fillStyle = col;
        ctx.fillRect(x - 3.5, sh.side === 1 ? y + 7 : y - 13, 7, 7);
      }

      if (toggles.trades) {
        for (const tr of report.trades) {
          const xEntry = timeToX(tr.entryTime);
          const xEnd = tr.exitTime ? timeToX(tr.exitTime) : Math.min(plotWidth - 10, (xEntry ?? 0) + barPx * 10);
          const yEntry = priceToY(tr.entryPrice);
          const yStop = priceToY(tr.stopPrice);
          const yTarget = priceToY(tr.targetPrice);
          const xAbs = timeToX(tr.absTime);
          const yAbsTop = priceToY(tr.absTop);
          const yAbsBot = priceToY(tr.absBot);

          // Trapped Traders Highlight Box
          if (xAbs !== null && xEntry !== null && yAbsTop !== null && yAbsBot !== null) {
            const trapCol = tr.side === 1 ? OFS_COLORS.cCyan : OFS_COLORS.cMagenta;
            const bx = Math.min(xAbs, xEntry) - 4;
            const bw = Math.max(30, Math.abs(xEntry - xAbs) + barPx * 3);
            const bt = Math.min(yAbsTop, yAbsBot);
            const bh = Math.max(12, Math.abs(yAbsBot - yAbsTop));
            ctx.fillStyle = tr.side === 1 ? 'rgba(0, 229, 255, 0.10)' : 'rgba(255, 43, 214, 0.10)';
            ctx.fillRect(bx, bt, bw, bh);
            ctx.strokeStyle = trapCol;
            ctx.lineWidth = 1;
            ctx.strokeRect(bx, bt, bw, bh);
            tryDrawPlacedPill(
              bx + bw + 4,
              bt + bh / 2,
              tr.side === 1 ? 'Trapped Sellers ⚠' : 'Trapped Buyers ⚠',
              trapCol,
              'rgba(11, 15, 28, 0.90)',
              trapCol,
              'left',
              9,
              [0, -18, 18]
            );
          }

          if (xEntry !== null && xEnd !== null && yEntry !== null && yStop !== null && yTarget !== null) {
            const boxRight = Math.max(xEntry + 24, xEnd);
            // Risk Box (Red)
            const rTop = Math.min(yEntry, yStop);
            const rH = Math.max(3, Math.abs(yStop - yEntry));
            ctx.fillStyle = 'rgba(255, 45, 85, 0.14)';
            ctx.fillRect(xEntry, rTop, boxRight - xEntry, rH);
            ctx.strokeStyle = 'rgba(255, 45, 85, 0.5)';
            ctx.lineWidth = 1;
            ctx.strokeRect(xEntry, rTop, boxRight - xEntry, rH);

            // Reward Box (Green)
            const gTop = Math.min(yEntry, yTarget);
            const gH = Math.max(3, Math.abs(yTarget - yEntry));
            ctx.fillStyle = 'rgba(0, 255, 156, 0.13)';
            ctx.fillRect(xEntry, gTop, boxRight - xEntry, gH);
            ctx.strokeStyle = 'rgba(0, 255, 156, 0.5)';
            ctx.strokeRect(xEntry, gTop, boxRight - xEntry, gH);

            // Entry label
            const sideCol = tr.side === 1 ? OFS_COLORS.cBull : OFS_COLORS.cBear;
            tryDrawPlacedPill(
              xEntry,
              tr.side === 1 ? yEntry + 28 : yEntry - 28,
              `${tr.side === 1 ? '▲ LONG' : '▼ SHORT'} · 2nd Failure\nR:R 1:${tr.targetR.toFixed(1)} · ${tr.targetSource}`,
              sideCol,
              'rgba(11, 15, 28, 0.94)',
              sideCol,
              'center',
              9,
              [0, -24, 24]
            );

            // Live Stop Pill (only for active/most recent trade)
            if (!tr.exitTime) {
              ctx.beginPath();
              ctx.moveTo(xEntry, yStop);
              ctx.lineTo(plotWidth - 8, yStop);
              ctx.strokeStyle = tr.beMoved || tr.trailing ? OFS_COLORS.cGold : OFS_COLORS.cBear;
              ctx.lineWidth = 1.6;
              ctx.stroke();

              tryDrawPlacedPill(
                plotWidth - 10,
                yStop,
                `${tr.beMoved ? 'STOP @ ENTRY' : 'STOP'} ${fmtPrice(tr.stopPrice)}`,
                tr.beMoved ? '#1A1400' : '#FFFFFF',
                tr.beMoved ? OFS_COLORS.cGold : OFS_COLORS.cBear,
                undefined,
                'right',
                9,
                [0, -18, 18]
              );
            } else if (tr.exitR !== undefined) {
              const oc =
                tr.status === 'TARGET_HIT' || tr.status === 'TRAIL_STOP'
                  ? OFS_COLORS.cBull
                  : tr.status === 'STOPPED'
                  ? OFS_COLORS.cBear
                  : OFS_COLORS.cGold;
              tryDrawPlacedPill(
                boxRight,
                tr.side === 1 ? yTarget - 14 : yTarget + 14,
                `${tr.status === 'TARGET_HIT' ? 'Target ' : tr.status === 'STOPPED' ? 'Stopped ' : 'Exit '}${tr.exitR >= 0 ? '+' : ''}${tr.exitR.toFixed(1)}R`,
                oc,
                'rgba(11, 15, 28, 0.94)',
                oc,
                'center',
                9,
                [0, -18, 18]
              );
            }
          }
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
        // Ignore teardown issues
      }
      ro.disconnect();
    };
  }, [chart, mainSeries, containerRef, report, toggles]);

  if (!report) return null;

  const toggleLayer = (key: keyof OfsVisualToggles) => {
    if (onToggleLayer) {
      onToggleLayer(key);
    } else {
      setInternalToggles((prev) => ({ ...prev, [key]: !prev[key] }));
    }
  };

  return (
    <>
      {/* Synchronized Price-Pane Canvas Layer */}
      <canvas
        ref={canvasRef}
        data-testid="ofs-overlay-canvas"
        className="absolute inset-0 w-full h-full pointer-events-none z-10"
      />

      {/* Layer Controls Strip (Top-Left inside Chart Studio) */}
      <div className={`absolute ${toolbarTopClass} left-2 z-20 flex flex-wrap items-center gap-0.5 bg-[#0B1226]/92 backdrop-blur-md border border-[#00E5FF]/30 rounded-lg px-1.5 py-0.5 text-[9.5px] font-mono shadow-lg max-w-[calc(100%-78px)]`}>
        <span className="text-[#00E5FF] font-bold flex items-center gap-1 pr-1.5 border-r border-zinc-700/80 shrink-0">
          <Layers className="w-3 h-3" />
          <span>OFS</span>
          {onHideOverlay && (
            <button
              type="button"
              onClick={onHideOverlay}
              data-testid="hide-ofs-eye-btn"
              className="ml-0.5 p-0.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-amber-300 transition"
              title="Hide Order Flow from chart without removing"
              aria-label="Hide Order Flow from chart"
            >
              <Eye className="w-2.5 h-2.5" />
            </button>
          )}
        </span>
        {(
          [
            ['wave', 'Wave'],
            ['valueArea', 'VA·POC'],
            ['zone', '0.705'],
            ['footprint', 'Footprint'],
            ['liquidity', 'BSL·SSL'],
            ['inefficiency', 'FVG·Imp'],
            ['hud', 'HUD'],
          ] as Array<[keyof OfsVisualToggles, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => toggleLayer(key)}
            className={`px-1.5 py-0.5 rounded transition flex items-center gap-0.5 shrink-0 ${
              toggles[key]
                ? 'bg-[#121C38] text-[#00E5FF] border border-[#00E5FF]/40'
                : 'text-zinc-500 hover:text-zinc-300 border border-transparent'
            }`}
          >
            {toggles[key] ? <Eye className="w-2.5 h-2.5" /> : <EyeOff className="w-2.5 h-2.5" />}
            <span>{label}</span>
          </button>
        ))}
      </div>
    </>
  );
};

export const OrderFlowHudPanel: React.FC<{ report: OfsReport | null }> = ({ report }) => {
  const [compactHud, setCompactHud] = useState(false);

  if (!report) return null;

  const d = report.dashboard;
  const activeOrLast = d.activeTrade || d.lastTrade;
  const flowMeter = buildMeterBlocks(d.flowSharePct);
  const buyMeter = buildMeterBlocks(d.buyAggressionPct);
  const sellMeter = buildMeterBlocks(d.sellAggressionPct);
  const partMeter = buildMeterBlocks(d.participationRelVol !== null ? (d.participationRelVol / 2) * 100 : 50);
  const aqMeter = buildMeterBlocks(d.absorptionQuality ?? 0);
  const progressMeter = buildMeterBlocks((d.setupProgress / 6) * 100, 6);

  return (
    <aside
      data-testid="ofs-dashboard-hud"
      className="hidden lg:flex flex-col w-[274px] shrink-0 h-full overflow-y-auto border-l border-[#00E5FF]/25 bg-[#070B16] text-[10.5px] font-mono select-none"
    >
      {/* Header */}
      <div className="bg-[#0B1226] px-2.5 py-2 border-b border-[#00E5FF]/20 flex items-center justify-between">
        <div className="text-center flex-1">
          <div className="text-[#00E5FF] font-extrabold tracking-wide text-[11px]">
            ◆ ORDER FLOW STRATEGY
          </div>
          <div className="text-[8.5px] text-[#C0C6D4] tracking-wider">
            AUCTION · ORDER FLOW · TRAPPED TRADERS
          </div>
        </div>
        <button
          type="button"
          onClick={() => setCompactHud((p) => !p)}
          aria-label={compactHud ? 'Expand Order Flow HUD' : 'Compact Order Flow HUD'}
          className="p-1 text-zinc-400 hover:text-white rounded hover:bg-[#121C38]"
          title={compactHud ? 'Show Full HUD' : 'Compact HUD'}
        >
          {compactHud ? <Maximize2 className="w-3 h-3" /> : <Minimize2 className="w-3 h-3" />}
        </button>
      </div>

      {/* Core Market & Setup State Rows */}
      <div className="divide-y divide-[#00E5FF]/10">
        <div className="grid grid-cols-3 px-2.5 py-1">
          <span className="text-[#C0C6D4]">Market</span>
          <span className="text-[#00E5FF] font-bold">{d.market}</span>
          <span className="text-right text-[#00E5FF] font-bold">TF {d.timeframe}</span>
        </div>
        {!compactHud && (
          <div className="grid grid-cols-3 px-2.5 py-1">
            <span className="text-[#C0C6D4]">Price</span>
            <span className="text-[#C0C6D4] tabular-nums">{fmtPrice(d.lastPrice)}</span>
            <span className="text-right text-[#6B7280] tabular-nums">ATR {fmtPrice(d.atr)}</span>
          </div>
        )}
        <div className="flex items-center justify-between px-2.5 py-1">
          <span className="text-[#C0C6D4]">Structure</span>
          <span
            className="font-bold"
            style={{
              color:
                d.structure === 1
                  ? OFS_COLORS.cBull
                  : d.structure === -1
                  ? OFS_COLORS.cBear
                  : OFS_COLORS.cSilver,
            }}
          >
            ● {d.structureLabel}
          </span>
        </div>
        <div className="flex items-center justify-between px-2.5 py-1 gap-2">
          <span className="text-[#C0C6D4] shrink-0">Setup State</span>
          <span
            className="flex-1 text-center font-bold px-1.5 py-0.5 rounded truncate"
            style={{
              backgroundColor: d.setupStateSolid
                ? d.setupStateTone === 'bull'
                  ? OFS_COLORS.cBull
                  : OFS_COLORS.cBear
                : 'rgba(18, 28, 56, 0.9)',
              color: d.setupStateSolid
                ? d.setupStateTone === 'bull'
                  ? '#00140B'
                  : '#FFFFFF'
                : d.setupStateTone === 'bull'
                ? OFS_COLORS.cBull
                : d.setupStateTone === 'bear'
                ? OFS_COLORS.cBear
                : d.setupStateTone === 'amber'
                ? OFS_COLORS.cAmber
                : d.setupStateTone === 'value'
                ? OFS_COLORS.cValue
                : OFS_COLORS.cCyan,
            }}
          >
            {d.setupStateText}
          </span>
        </div>
        <div className="flex items-center justify-between px-2.5 py-1 gap-2">
          <span className="text-[#C0C6D4] shrink-0">Next</span>
          <span className="text-[#C0C6D4] text-right truncate text-[10px]">{d.nextStepText}</span>
        </div>
      </div>

      {/* ORDER FLOW METERS */}
      {!compactHud && (
        <>
          <div className="bg-[#121C38] px-2.5 py-1 text-[#FFC400] font-bold tracking-wider text-[10px]">
            ORDER FLOW
          </div>
          <div className="divide-y divide-[#00E5FF]/10">
            <div className="grid grid-cols-[1.15fr_1fr_auto] items-center px-2.5 py-1 gap-1.5">
              <span className="text-[#C0C6D4]">Flow Pressure</span>
              <span className="text-[9px] tracking-tighter">
                <span style={{ color: d.flowNet >= 0 ? OFS_COLORS.cCyan : OFS_COLORS.cPurple }}>
                  {flowMeter.filled}
                </span>
                <span className="text-[#6B7280]/50">{flowMeter.empty}</span>
              </span>
              <span
                className="text-right font-bold tabular-nums"
                style={{ color: d.flowNet >= 0 ? OFS_COLORS.cCyan : OFS_COLORS.cPurple }}
              >
                {d.flowNet >= 0 ? '+' : ''}
                {Math.round(d.flowNet * 100)} {d.flowNet >= 0 ? 'buy' : 'sell'}
              </span>
            </div>

            <div className="grid grid-cols-[1.15fr_1fr_auto] items-center px-2.5 py-1 gap-1.5">
              <span className="text-[#C0C6D4]">Buy Aggression</span>
              <span className="text-[9px] tracking-tighter">
                <span className="text-[#00FF9C]">{buyMeter.filled}</span>
                <span className="text-[#6B7280]/50">{buyMeter.empty}</span>
              </span>
              <span className="text-right font-bold text-[#00FF9C] tabular-nums">{d.buyAggressionPct}%</span>
            </div>

            <div className="grid grid-cols-[1.15fr_1fr_auto] items-center px-2.5 py-1 gap-1.5">
              <span className="text-[#C0C6D4]">Sell Aggression</span>
              <span className="text-[9px] tracking-tighter">
                <span className="text-[#FF2D55]">{sellMeter.filled}</span>
                <span className="text-[#6B7280]/50">{sellMeter.empty}</span>
              </span>
              <span className="text-right font-bold text-[#FF2D55] tabular-nums">{d.sellAggressionPct}%</span>
            </div>

            <div className="grid grid-cols-[1.15fr_1fr_auto] items-center px-2.5 py-1 gap-1.5">
              <span className="text-[#C0C6D4]">Participation</span>
              <span className="text-[9px] tracking-tighter">
                <span style={{ color: d.participationOk ? OFS_COLORS.cCyan : OFS_COLORS.cAmber }}>
                  {partMeter.filled}
                </span>
                <span className="text-[#6B7280]/50">{partMeter.empty}</span>
              </span>
              <span
                className="text-right font-bold tabular-nums"
                style={{ color: d.participationOk ? OFS_COLORS.cCyan : OFS_COLORS.cAmber }}
              >
                {d.participationRelVol !== null ? `${d.participationRelVol.toFixed(1)}x` : 'n/a'}
              </span>
            </div>

            <div className="grid grid-cols-[1.15fr_1fr_auto] items-center px-2.5 py-1 gap-1.5">
              <span className="text-[#C0C6D4]">Absorption Q</span>
              <span className="text-[9px] tracking-tighter">
                <span className="text-[#FF9F1C]">{aqMeter.filled}</span>
                <span className="text-[#6B7280]/50">{aqMeter.empty}</span>
              </span>
              <span className="text-right font-bold text-[#FF9F1C] tabular-nums">
                {d.absorptionQuality !== null ? `AQ ${d.absorptionQuality}` : '—'}
              </span>
            </div>

            <div className="flex items-center justify-between px-2.5 py-1">
              <span className="text-[#C0C6D4]">Session Delta</span>
              <span
                className="font-bold tabular-nums"
                style={{ color: d.sessionDelta >= 0 ? OFS_COLORS.cBull : OFS_COLORS.cBear }}
              >
                {d.sessionDelta >= 0 ? '+' : '−'}
                {formatOfsK(d.sessionDelta)} · {d.sessionDelta >= 0 ? 'buyers' : 'sellers'}
              </span>
            </div>
          </div>
        </>
      )}

      {/* 4-STEP PROCESS */}
      <div className="bg-[#121C38] px-2.5 py-1 text-[#FFC400] font-bold tracking-wider text-[10px]">
        4-STEP PROCESS
      </div>
      <div className="divide-y divide-[#00E5FF]/10">
        <div className="grid grid-cols-[1.15fr_1fr_auto] items-center px-2.5 py-1 gap-1.5">
          <span className="text-[#C0C6D4]">Setup Progress</span>
          <span className="text-[9px] tracking-tighter">
            <span className="text-[#00FF9C]">{progressMeter.filled}</span>
            <span className="text-[#6B7280]/50">{progressMeter.empty}</span>
          </span>
          <span className="text-right font-bold text-[#00FF9C] tabular-nums">{d.setupProgress} / 6</span>
        </div>
        {(
          [
            ['① Environment', d.steps.environment],
            ['② Location', d.steps.location],
            ['③ Confirmation', d.steps.confirmation],
            ['④ Risk Rules', d.steps.riskRules],
          ] as const
        ).map(([title, step]) => (
          <div key={title} className="grid grid-cols-[1.05fr_1.3fr_16px] items-center px-2.5 py-1 gap-1">
            <span className="text-[#C0C6D4]">{title}</span>
            <span className="text-right text-zinc-200 truncate text-[9.5px]">{step.label}</span>
            <span
              className="text-right font-bold"
              style={{
                color:
                  step.state === 1
                    ? OFS_COLORS.cBull
                    : step.state === 0
                    ? OFS_COLORS.cAmber
                    : OFS_COLORS.cGrey,
              }}
            >
              {step.state === 1 ? '✓' : step.state === 0 ? '◐' : '✕'}
            </span>
          </div>
        ))}
      </div>

      {/* KEY LEVELS */}
      {!compactHud && (
        <>
          <div className="bg-[#121C38] px-2.5 py-1 text-[#FFC400] font-bold tracking-wider text-[10px]">
            KEY LEVELS
          </div>
          <div className="divide-y divide-[#00E5FF]/10">
            <div className="flex items-center justify-between px-2.5 py-1">
              <span className="text-[#C0C6D4]">Value Area</span>
              <span className="text-[#536DFE] font-bold tabular-nums">
                {fmtPrice(d.valueArea.val)} – {fmtPrice(d.valueArea.vah)}
              </span>
            </div>
            <div className="flex items-center justify-between px-2.5 py-1">
              <span className="text-[#C0C6D4]">Point of Control</span>
              <span className="text-[#FFC400] font-bold tabular-nums">{fmtPrice(d.valueArea.poc)}</span>
            </div>
            <div className="flex items-center justify-between px-2.5 py-1">
              <span className="text-[#C0C6D4]">
                {d.activeZone?.side === -1 ? 'Premium Zone' : d.activeZone?.side === 1 ? 'Discount Zone' : 'Fib Zone'}
              </span>
              <span
                className="font-bold tabular-nums"
                style={{
                  color:
                    d.activeZone?.side === 1
                      ? OFS_COLORS.cBull
                      : d.activeZone?.side === -1
                      ? OFS_COLORS.cBear
                      : OFS_COLORS.cGrey,
                }}
              >
                {d.activeZone ? `${fmtPrice(d.activeZone.bottom)} – ${fmtPrice(d.activeZone.top)}` : '—'}
              </span>
            </div>
            <div className="flex items-center justify-between px-2.5 py-1">
              <span className="text-[#C0C6D4]">Buy-Side Liquidity</span>
              <span className="text-[#FF2D55] font-bold tabular-nums">
                {d.nearestBSL ? `${fmtPrice(d.nearestBSL.price)} · BSL` : '—'}
              </span>
            </div>
            <div className="flex items-center justify-between px-2.5 py-1">
              <span className="text-[#C0C6D4]">Sell-Side Liquidity</span>
              <span className="text-[#00FF9C] font-bold tabular-nums">
                {d.nearestSSL ? `${fmtPrice(d.nearestSSL.price)} · SSL` : '—'}
              </span>
            </div>
          </div>
        </>
      )}

      {/* ACTIVE / LAST TRADE */}
      {activeOrLast && (
        <>
          <div className="bg-[#121C38] px-2.5 py-1 text-[#FFC400] font-bold tracking-wider text-[10px]">
            {d.activeTrade ? 'ACTIVE TRADE' : 'LAST TRADE'}
          </div>
          <div className="divide-y divide-[#00E5FF]/10">
            <div className="flex items-center justify-between px-2.5 py-1">
              <span className="text-[#C0C6D4]">Position</span>
              <span
                className="font-bold"
                style={{ color: activeOrLast.side === 1 ? OFS_COLORS.cBull : OFS_COLORS.cBear }}
              >
                {activeOrLast.side === 1 ? '▲ LONG' : '▼ SHORT'} · {activeOrLast.status.replace(/_/g, ' ')}
              </span>
            </div>
            <div className="flex items-center justify-between px-2.5 py-1">
              <span className="text-[#C0C6D4]">Entry / Stop</span>
              <span className="text-[#C0C6D4] tabular-nums">
                {fmtPrice(activeOrLast.entryPrice)} /{' '}
                <strong className="text-[#FFC400]">{fmtPrice(activeOrLast.stopPrice)}</strong>
              </span>
            </div>
            <div className="flex items-center justify-between px-2.5 py-1">
              <span className="text-[#C0C6D4]">Target · {activeOrLast.targetSource}</span>
              <span className="text-[#00FF9C] font-bold tabular-nums">
                {fmtPrice(activeOrLast.targetPrice)} · {activeOrLast.targetR}R
              </span>
            </div>
            <div className="flex items-center justify-between px-2.5 py-1">
              <span className="text-[#C0C6D4]">{d.activeTrade ? 'Open P&L' : 'Result'}</span>
              <span
                className="font-bold tabular-nums"
                style={{
                  color:
                    (activeOrLast.exitR ?? activeOrLast.openR) >= 0 ? OFS_COLORS.cBull : OFS_COLORS.cBear,
                }}
              >
                {(activeOrLast.exitR ?? activeOrLast.openR) >= 0 ? '+' : ''}
                {(activeOrLast.exitR ?? activeOrLast.openR).toFixed(2)}R
              </span>
            </div>
          </div>
        </>
      )}

      {/* Footer note matching original */}
      <div className="mt-auto bg-[#0B1226] px-2.5 py-1.5 text-[8.5px] text-[#6B7280] flex items-center justify-between border-t border-[#00E5FF]/15">
        <span>{d.usedLowerTimeframe ? 'Lower-TF LTF order flow · not advice' : 'Bar-range order flow est. · not advice'}</span>
      </div>
    </aside>
  );
};
