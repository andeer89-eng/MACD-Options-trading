import React, { useEffect, useRef, useState } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import {
  QmxReport,
  QMX_COLORS,
} from '../utils/quantumMarketXray';
import {
  buildMeterBlocks,
  compactQmxOverlayLabel,
  createChartCoordBridge,
  createPillCollisionPlacer,
  drawOverlayPill,
  estimateOverlayPillSize,
  formatOverlayPrice,
  getPrimaryPaneBounds,
  syncCanvasToContainer,
} from '../utils/chartOverlayPrimitives';
import { Eye, EyeOff, Layers, Minimize2, Maximize2 } from 'lucide-react';

export interface QmxVisualToggles {
  ribbon: boolean;
  zones: boolean;
  sweeps: boolean;
  traps: boolean;
  exhaustion: boolean;
  vacuums: boolean;
  targets: boolean;
  hud: boolean;
}

export const DEFAULT_QMX_TOGGLES: QmxVisualToggles = {
  ribbon: true,
  zones: true,
  sweeps: true,
  traps: true,
  exhaustion: true,
  vacuums: true,
  targets: true,
  hud: true,
};

interface QuantumMarketXrayOverlayProps {
  chart: IChartApi | null;
  mainSeries: ISeriesApi<any> | null;
  containerRef: React.RefObject<HTMLDivElement | null>;
  report: QmxReport | null;
  toggles?: QmxVisualToggles;
  onToggleLayer?: (key: keyof QmxVisualToggles) => void;
  onHideOverlay?: () => void;
  toolbarTopClass?: string;
}

const fmtPrice = (v: number | null | undefined) => formatOverlayPrice(v, 3);
const drawPill = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  textColor: string,
  bgColor: string = 'rgba(11, 15, 28, 0.92)',
  borderColor?: string,
  align: 'left' | 'center' | 'right' = 'center',
  fontSize: number = 9.5
) => drawOverlayPill(ctx, x, y, text, textColor, bgColor, borderColor, align, fontSize, 3.5);

export const QuantumMarketXrayOverlay: React.FC<QuantumMarketXrayOverlayProps> = ({
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
  const [internalToggles, setInternalToggles] = useState<QmxVisualToggles>(DEFAULT_QMX_TOGGLES);
  const toggles = controlledToggles ?? internalToggles;

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
      const { plotWidth, paneHeight } = getPrimaryPaneBounds(chart, width, totalHeight, 0.7);
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
        bgColor: string = 'rgba(11, 15, 28, 0.92)',
        borderColor?: string,
        align: 'left' | 'center' | 'right' = 'center',
        fontSize: number = 9,
        nudgeOffsets: number[] = [0, -18, 18, -34, 34]
      ) => {
        const size = estimateOverlayPillSize(ctx, text, fontSize, 3.5);
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

      // ─────────────────────────────────────────────────────────────────────────
      // 1. QUANTUM INTELLIGENCE RIBBON (Cyan Upper Band vs Magenta Lower Band)
      // ─────────────────────────────────────────────────────────────────────────
      if (toggles.ribbon && report.ribbon.length > 2) {
        const rPts: Array<{ x: number; yUp: number; yDn: number; yMid: number; isBull: boolean }> = [];
        for (const pt of report.ribbon) {
          const x = timeToX(pt.time);
          const yUp = priceToY(pt.upper);
          const yDn = priceToY(pt.lower);
          const yMid = priceToY(pt.mid);
          if (x !== null && yUp !== null && yDn !== null && yMid !== null) {
            rPts.push({ x, yUp, yDn, yMid, isBull: pt.isBull });
          }
        }

        if (rPts.length > 2) {
          // Fill upper translucent cyan ribbon
          ctx.beginPath();
          ctx.moveTo(rPts[0].x, rPts[0].yMid);
          for (let i = 1; i < rPts.length; i++) ctx.lineTo(rPts[i].x, rPts[i].yMid);
          for (let i = rPts.length - 1; i >= 0; i--) ctx.lineTo(rPts[i].x, rPts[i].yUp);
          ctx.closePath();
          ctx.fillStyle = 'rgba(0, 255, 163, 0.08)';
          ctx.fill();

          // Fill lower translucent magenta ribbon
          ctx.beginPath();
          ctx.moveTo(rPts[0].x, rPts[0].yMid);
          for (let i = 1; i < rPts.length; i++) ctx.lineTo(rPts[i].x, rPts[i].yMid);
          for (let i = rPts.length - 1; i >= 0; i--) ctx.lineTo(rPts[i].x, rPts[i].yDn);
          ctx.closePath();
          ctx.fillStyle = 'rgba(255, 43, 214, 0.08)';
          ctx.fill();

          // Upper boundary curve (Neon Teal / Cyan)
          ctx.beginPath();
          ctx.moveTo(rPts[0].x, rPts[0].yUp);
          for (let i = 1; i < rPts.length; i++) ctx.lineTo(rPts[i].x, rPts[i].yUp);
          ctx.strokeStyle = 'rgba(0, 229, 255, 0.85)';
          ctx.lineWidth = 1.6;
          ctx.stroke();

          // Lower boundary curve (Neon Magenta)
          ctx.beginPath();
          ctx.moveTo(rPts[0].x, rPts[0].yDn);
          for (let i = 1; i < rPts.length; i++) ctx.lineTo(rPts[i].x, rPts[i].yDn);
          ctx.strokeStyle = 'rgba(255, 43, 214, 0.85)';
          ctx.lineWidth = 1.6;
          ctx.stroke();

          // Smooth midline
          for (let i = 1; i < rPts.length; i++) {
            ctx.beginPath();
            ctx.moveTo(rPts[i - 1].x, rPts[i - 1].yMid);
            ctx.lineTo(rPts[i].x, rPts[i].yMid);
            ctx.strokeStyle = rPts[i].isBull ? 'rgba(0, 255, 163, 0.9)' : 'rgba(255, 45, 85, 0.9)';
            ctx.lineWidth = 1.8;
            ctx.stroke();
          }
        }
      }

      // ─────────────────────────────────────────────────────────────────────────
      // 2. TARGET RAYS (T1, T2, T3 Projection rays — highest label priority)
      // ─────────────────────────────────────────────────────────────────────────
      if (toggles.targets) {
        for (const tg of report.targets) {
          const x0 = timeToX(tg.startTime);
          const yT = priceToY(tg.targetPrice);
          const yA = priceToY(tg.anchorPrice);
          if (x0 === null || yT === null || yA === null) continue;

          const col = tg.isBull ? QMX_COLORS.teal : QMX_COLORS.magenta;

          // Projection ray to right price scale
          ctx.beginPath();
          ctx.moveTo(x0, yA);
          ctx.lineTo(plotWidth - 8, yT);
          ctx.strokeStyle = col;
          ctx.lineWidth = 1.3;
          ctx.setLineDash([4, 4]);
          ctx.stroke();
          ctx.setLineDash([]);

          // Target line
          ctx.beginPath();
          ctx.moveTo(Math.min(x0 + 40, plotWidth - 20), yT);
          ctx.lineTo(plotWidth - 4, yT);
          ctx.strokeStyle = col;
          ctx.lineWidth = 1;
          ctx.stroke();

          tryDrawPlacedPill(
            plotWidth - 8,
            yT,
            tg.label,
            col,
            'rgba(11, 15, 28, 0.94)',
            col,
            'right',
            9,
            [0, -18, 18]
          );
        }
      }

      // ─────────────────────────────────────────────────────────────────────────
      // 3. LIQUIDITY ZONES (BSL & SSL Zones with Strength Score)
      // ─────────────────────────────────────────────────────────────────────────
      if (toggles.zones) {
        const recentZones = report.liquidityZones.slice(-6);
        for (const zone of report.liquidityZones) {
          const yTop = priceToY(zone.top);
          const yBot = priceToY(zone.bot);
          const xStart = Math.max(4, timeToX(zone.startTime) ?? 16);
          const xEnd = plotWidth - 4;
          if (yTop === null || yBot === null || xStart >= xEnd) continue;

          const topY = Math.min(yTop, yBot);
          const h = Math.max(3, Math.abs(yBot - yTop));
          const col = zone.isHigh ? QMX_COLORS.red : QMX_COLORS.cyan;

          ctx.fillStyle = zone.isHigh ? 'rgba(255, 45, 85, 0.11)' : 'rgba(0, 255, 163, 0.11)';
          ctx.fillRect(xStart, topY, Math.max(12, xEnd - xStart), h);
          ctx.strokeStyle = col;
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.strokeRect(xStart, topY, Math.max(12, xEnd - xStart), h);
          ctx.setLineDash([]);

          if (recentZones.includes(zone)) {
            const label = compactQmxOverlayLabel('zone', zone.label);
            tryDrawPlacedPill(
              Math.max(12, xStart + 10),
              zone.isHigh ? topY - 10 : topY + h + 10,
              label,
              col,
              'rgba(11, 15, 28, 0.92)',
              col,
              'left',
              9,
              [0, -18, 18, -36]
            );
          }
        }
      }

      // ─────────────────────────────────────────────────────────────────────────
      // 4. LIQUIDITY SWEEPS (Bullish / Bearish Sweeps with glowing circles)
      // ─────────────────────────────────────────────────────────────────────────
      if (toggles.sweeps) {
        for (const sw of [...report.sweeps].reverse()) {
          const x = timeToX(sw.time);
          const y = priceToY(sw.price);
          if (x === null || y === null || x < 10 || x > plotWidth - 10) continue;
          const col = sw.isBull ? QMX_COLORS.cyan : QMX_COLORS.red;

          // Glowing Outer Circle + Inner Core Dot
          ctx.beginPath();
          ctx.arc(x, y, 8, 0, Math.PI * 2);
          ctx.fillStyle = sw.isBull ? 'rgba(0, 255, 163, 0.25)' : 'rgba(255, 45, 85, 0.25)';
          ctx.fill();

          ctx.beginPath();
          ctx.arc(x, y, 3.8, 0, Math.PI * 2);
          ctx.fillStyle = col;
          ctx.fill();

          tryDrawPlacedPill(
            x,
            sw.isBull ? y + 20 : y - 20,
            compactQmxOverlayLabel('sweep', sw.label),
            col,
            'rgba(11, 15, 28, 0.92)',
            col,
            'center',
            8.5,
            sw.isBull ? [0, 18, -18, 34] : [0, -18, 18, -34]
          );
        }
      }

      // ─────────────────────────────────────────────────────────────────────────
      // 5. SMART MONEY TRAPS (Trapped Buyers & Trapped Sellers boxes)
      // ─────────────────────────────────────────────────────────────────────────
      if (toggles.traps) {
        for (const tr of [...report.traps].reverse()) {
          const x0 = timeToX(tr.startTime);
          const x1 = timeToX(tr.endTime);
          const yH = priceToY(tr.high);
          const yL = priceToY(tr.low);
          if (x0 === null || x1 === null || yH === null || yL === null) continue;

          const topY = Math.min(yH, yL);
          const h = Math.max(6, Math.abs(yL - yH));
          const w = Math.max(24, Math.min(plotWidth - x0, Math.abs(x1 - x0) + 16));
          const col = tr.isBuyers ? QMX_COLORS.magenta : QMX_COLORS.teal;

          ctx.fillStyle = tr.isBuyers ? 'rgba(255, 43, 214, 0.12)' : 'rgba(0, 229, 255, 0.12)';
          ctx.fillRect(x0 - 4, topY, w, h);
          ctx.strokeStyle = col;
          ctx.lineWidth = 1;
          ctx.strokeRect(x0 - 4, topY, w, h);

          tryDrawPlacedPill(
            x0 + w / 2,
            tr.isBuyers ? topY - 12 : topY + h + 12,
            compactQmxOverlayLabel('trap', tr.label),
            col,
            'rgba(11, 15, 28, 0.92)',
            col,
            'center',
            8.5,
            [0, -18, 18]
          );
        }
      }

      // ─────────────────────────────────────────────────────────────────────────
      // 6. EXHAUSTION CLOUDS (Early & Confirmed Exhaustion Signals)
      // ─────────────────────────────────────────────────────────────────────────
      if (toggles.exhaustion) {
        for (const exh of [...report.exhaustions].reverse()) {
          const x = timeToX(exh.time);
          const y = priceToY(exh.price);
          if (x === null || y === null || x < 15 || x > plotWidth - 15) continue;
          const col = exh.isBull ? QMX_COLORS.teal : QMX_COLORS.purple;

          ctx.beginPath();
          ctx.arc(x, y, 4.5, 0, Math.PI * 2);
          ctx.fillStyle = col;
          ctx.fill();

          tryDrawPlacedPill(
            x,
            exh.isBull ? y - 16 : y + 16,
            compactQmxOverlayLabel('exhaustion', exh.label),
            col,
            'rgba(11, 15, 28, 0.94)',
            col,
            'center',
            8.5,
            exh.isBull ? [0, -18, 18] : [0, 18, -18]
          );
        }
      }

      // ─────────────────────────────────────────────────────────────────────────
      // 7. VACUUM CORRIDORS (Liquidity Voids & Imbalance corridors)
      // ─────────────────────────────────────────────────────────────────────────
      if (toggles.vacuums) {
        for (const vac of report.vacuums.slice(-6).reverse()) {
          const x0 = timeToX(vac.startTime);
          const x1 = timeToX(vac.endTime);
          const yTop = priceToY(vac.top);
          const yBot = priceToY(vac.bot);
          if (x0 === null || x1 === null || yTop === null || yBot === null) continue;

          const topY = Math.min(yTop, yBot);
          const h = Math.max(4, Math.abs(yBot - yTop));
          const maxAvailW = Math.max(12, plotWidth - 4 - x0);
          const w = Math.min(maxAvailW, Math.max(30, Math.abs(x1 - x0) + 20));
          const col = vac.isBull ? QMX_COLORS.teal : QMX_COLORS.purple;

          ctx.fillStyle = vac.isBull ? 'rgba(0, 229, 255, 0.08)' : 'rgba(168, 85, 247, 0.08)';
          ctx.fillRect(x0, topY, w, h);
          ctx.strokeStyle = col;
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          ctx.strokeRect(x0, topY, w, h);
          ctx.setLineDash([]);

          tryDrawPlacedPill(
            x0 + w / 2,
            topY + h / 2,
            compactQmxOverlayLabel('vacuum', vac.label),
            col,
            'rgba(11, 15, 28, 0.92)',
            col,
            'center',
            8.5,
            [0, -16, 16]
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
  }, [chart, mainSeries, containerRef, report, toggles]);

  if (!report) return null;

  const toggleLayer = (key: keyof QmxVisualToggles) => {
    if (onToggleLayer) {
      onToggleLayer(key);
    } else {
      setInternalToggles((prev) => ({ ...prev, [key]: !prev[key] }));
    }
  };

  return (
    <>
      <canvas
        ref={canvasRef}
        data-testid="qmx-overlay-canvas"
        className="absolute inset-0 w-full h-full pointer-events-none z-10"
      />

      {/* Layer Controls Strip (Top-Left inside Chart Studio, never clips HUD or scrolls horizontally) */}
      <div className={`absolute ${toolbarTopClass} left-2 z-20 flex flex-wrap items-center gap-0.5 bg-[#0B1226]/92 backdrop-blur-md border border-[#00FFA3]/30 rounded-lg px-1.5 py-0.5 text-[9.5px] font-mono shadow-lg max-w-[calc(100%-78px)]`}>
        <span className="text-[#00FFA3] font-bold flex items-center gap-1 pr-1.5 border-r border-zinc-700/80 shrink-0">
          <Layers className="w-3 h-3" />
          <span>QMX</span>
          {onHideOverlay && (
            <button
              type="button"
              onClick={onHideOverlay}
              data-testid="hide-qmx-eye-btn"
              className="ml-0.5 p-0.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-amber-300 transition"
              title="Hide Quantum QMX from chart without removing"
              aria-label="Hide Quantum QMX from chart"
            >
              <Eye className="w-2.5 h-2.5" />
            </button>
          )}
        </span>
        {(
          [
            ['ribbon', 'Ribbon'],
            ['zones', 'BSL·SSL'],
            ['sweeps', 'Sweeps'],
            ['traps', 'Traps'],
            ['exhaustion', 'Exh'],
            ['vacuums', 'Vacuum'],
            ['targets', 'Targets'],
            ['hud', 'HUD'],
          ] as Array<[keyof QmxVisualToggles, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => toggleLayer(key)}
            className={`px-1.5 py-0.5 rounded transition flex items-center gap-0.5 shrink-0 ${
              toggles[key]
                ? 'bg-[#121C38] text-[#00FFA3] border border-[#00FFA3]/40'
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

export const QuantumMarketXrayHudPanel: React.FC<{ report: QmxReport | null }> = ({ report }) => {
  const [compactHud, setCompactHud] = useState(false);

  if (!report) return null;

  const d = report.dashboard;
  const s = d.scores;

  const bullMeter = buildMeterBlocks(s.bullishEvidencePct);
  const bearMeter = buildMeterBlocks(s.bearishEvidencePct);
  const liqMeter = buildMeterBlocks(s.liquidityStrengthPct);
  const trapMeter = buildMeterBlocks(s.trapRiskPct);
  const dispMeter = buildMeterBlocks(s.displacementPct);
  const confMeter = buildMeterBlocks(s.marketConfidencePct);

  return (
    <aside
      data-testid="qmx-dashboard-hud"
      className="hidden lg:flex flex-col w-[274px] shrink-0 h-full overflow-y-auto border-l border-[#00E5FF]/25 bg-[#070B16] text-[10.5px] font-mono select-none"
    >
      {/* Header */}
      <div className="bg-[#0B1226] px-2.5 py-2 border-b border-[#00E5FF]/20 flex items-center justify-between">
        <div className="text-center flex-1">
          <div className="text-[#00E5FF] font-extrabold tracking-wide text-[11px] flex items-center justify-center gap-1">
            <span>👑</span>
            <span>QUANTUM MARKET X-RAY</span>
          </div>
          <div className="text-[8.5px] text-[#C0C6D4] tracking-wider">
            LIVE MARKET INTELLIGENCE
          </div>
        </div>
        <button
          type="button"
          onClick={() => setCompactHud((p) => !p)}
          aria-label={compactHud ? 'Expand QMX HUD' : 'Compact QMX HUD'}
          className="p-1 text-zinc-400 hover:text-white rounded hover:bg-[#121C38]"
          title={compactHud ? 'Show Full HUD' : 'Compact HUD'}
        >
          {compactHud ? <Maximize2 className="w-3 h-3" /> : <Minimize2 className="w-3 h-3" />}
        </button>
      </div>

      {/* Core Market Info */}
      <div className="divide-y divide-[#00E5FF]/10">
        <div className="grid grid-cols-3 px-2.5 py-1">
          <span className="text-[#C0C6D4]">Market</span>
          <span className="text-[#00E5FF] font-bold">{d.market}</span>
          <span className="text-right text-[#00E5FF] font-bold">TF {d.timeframe}</span>
        </div>
        {!compactHud && (
          <div className="grid grid-cols-3 px-2.5 py-1">
            <span className="text-[#C0C6D4]">Price</span>
            <span className="text-[#C0C6D4] tabular-nums">{fmtPrice(d.price)}</span>
            <span className="text-right text-[#6B7280] tabular-nums">ATR {fmtPrice(d.atr)}</span>
          </div>
        )}
        <div className="flex items-center justify-between px-2.5 py-1">
          <span className="text-[#C0C6D4]">Market Bias</span>
          <span
            className="font-bold flex items-center gap-1"
            style={{
              color:
                d.marketBias === 'Bullish'
                  ? QMX_COLORS.cyan
                  : d.marketBias === 'Bearish'
                  ? QMX_COLORS.red
                  : QMX_COLORS.silver,
            }}
          >
            <span>●</span>
            <span>{d.marketBias}</span>
          </span>
        </div>
        <div className="flex items-center justify-between px-2.5 py-1">
          <span className="text-[#C0C6D4]">Phase</span>
          <span
            className="font-bold"
            style={{
              color: d.phase.includes('Bearish')
                ? QMX_COLORS.red
                : d.phase.includes('Bullish')
                ? QMX_COLORS.cyan
                : QMX_COLORS.gold,
            }}
          >
            {d.phase}
          </span>
        </div>
      </div>

      {/* INTELLIGENCE SCORE */}
      <div className="bg-[#121C38] px-2.5 py-1 text-[#FFC400] font-bold tracking-wider text-[10px]">
        INTELLIGENCE SCORE
      </div>
      <div className="divide-y divide-[#00E5FF]/10">
        <div className="grid grid-cols-[1.15fr_1fr_auto] items-center px-2.5 py-1 gap-1.5">
          <span className="text-[#C0C6D4]">Bullish Evidence</span>
          <span className="text-[9px] tracking-tighter">
            <span className="text-[#00FF9C]">{bullMeter.filled}</span>
            <span className="text-[#6B7280]/50">{bullMeter.empty}</span>
          </span>
          <span className="text-right font-bold text-[#00FF9C] tabular-nums">{s.bullishEvidencePct}%</span>
        </div>

        <div className="grid grid-cols-[1.15fr_1fr_auto] items-center px-2.5 py-1 gap-1.5">
          <span className="text-[#C0C6D4]">Bearish Evidence</span>
          <span className="text-[9px] tracking-tighter">
            <span className="text-[#FF2D55]">{bearMeter.filled}</span>
            <span className="text-[#6B7280]/50">{bearMeter.empty}</span>
          </span>
          <span className="text-right font-bold text-[#FF2D55] tabular-nums">{s.bearishEvidencePct}%</span>
        </div>

        <div className="grid grid-cols-[1.15fr_1fr_auto] items-center px-2.5 py-1 gap-1.5">
          <span className="text-[#C0C6D4]">Liquidity Strength</span>
          <span className="text-[9px] tracking-tighter">
            <span className="text-[#00E5FF]">{liqMeter.filled}</span>
            <span className="text-[#6B7280]/50">{liqMeter.empty}</span>
          </span>
          <span className="text-right font-bold text-[#00E5FF] tabular-nums">{s.liquidityStrengthPct}%</span>
        </div>

        <div className="grid grid-cols-[1.15fr_1fr_auto] items-center px-2.5 py-1 gap-1.5">
          <span className="text-[#C0C6D4]">Trap Risk</span>
          <span className="text-[9px] tracking-tighter">
            <span className="text-[#FF9F1C]">{trapMeter.filled}</span>
            <span className="text-[#6B7280]/50">{trapMeter.empty}</span>
          </span>
          <span className="text-right font-bold text-[#FF9F1C] tabular-nums">{s.trapRiskPct}%</span>
        </div>

        <div className="grid grid-cols-[1.15fr_1fr_auto] items-center px-2.5 py-1 gap-1.5">
          <span className="text-[#C0C6D4]">Displacement</span>
          <span className="text-[9px] tracking-tighter">
            <span className="text-[#00FFA3]">{dispMeter.filled}</span>
            <span className="text-[#6B7280]/50">{dispMeter.empty}</span>
          </span>
          <span className="text-right font-bold text-[#00FFA3] tabular-nums">{s.displacementPct}%</span>
        </div>

        <div className="grid grid-cols-[1.15fr_1fr_auto] items-center px-2.5 py-1 gap-1.5">
          <span className="text-[#C0C6D4]">Market Confidence</span>
          <span className="text-[9px] tracking-tighter">
            <span className="text-[#38BDF8]">{confMeter.filled}</span>
            <span className="text-[#6B7280]/50">{confMeter.empty}</span>
          </span>
          <span className="text-right font-bold text-[#38BDF8] tabular-nums">{s.marketConfidencePct}%</span>
        </div>
      </div>

      {/* MARKET CONDITIONS */}
      <div className="bg-[#121C38] px-2.5 py-1 text-[#FFC400] font-bold tracking-wider text-[10px]">
        MARKET CONDITIONS
      </div>
      <div className="divide-y divide-[#00E5FF]/10">
        <div className="flex items-center justify-between px-2.5 py-1">
          <span className="text-[#C0C6D4]">Volatility</span>
          <span className="font-bold text-white">{d.conditions.volatility}</span>
        </div>
        <div className="flex items-center justify-between px-2.5 py-1">
          <span className="text-[#C0C6D4]">Pressure</span>
          <span
            className="font-bold"
            style={{
              color: d.conditions.pressureValue >= 0 ? QMX_COLORS.cyan : QMX_COLORS.red,
            }}
          >
            {d.conditions.pressureLabel}
          </span>
        </div>
        <div className="flex items-center justify-between px-2.5 py-1">
          <span className="text-[#C0C6D4]">Liquidity</span>
          <span className="font-bold text-[#00E5FF]">{d.conditions.liquidity}</span>
        </div>
        <div className="flex items-center justify-between px-2.5 py-1">
          <span className="text-[#C0C6D4]">Exhaustion</span>
          <span className="font-bold text-[#FF9F1C]">{d.conditions.exhaustion}</span>
        </div>
      </div>

      {/* MTF OVERVIEW */}
      <div className="bg-[#121C38] px-2.5 py-1 text-[#FFC400] font-bold tracking-wider text-[10px]">
        MTF OVERVIEW
      </div>
      <div className="divide-y divide-[#00E5FF]/10">
        <div className="grid grid-cols-3 px-2.5 py-0.5 text-[9px] text-[#6B7280] font-bold uppercase">
          <span>TF</span>
          <span>Bias</span>
          <span className="text-right">State</span>
        </div>
        {d.mtfOverview.map((row) => (
          <div key={row.timeframe} className="grid grid-cols-3 px-2.5 py-1">
            <span className="text-white font-bold">{row.timeframe}</span>
            <span
              style={{
                color:
                  row.bias === 'Bullish'
                    ? QMX_COLORS.cyan
                    : row.bias === 'Bearish'
                    ? QMX_COLORS.red
                    : '#94A3B8',
              }}
            >
              {row.bias}
            </span>
            <span className="text-right text-[#C0C6D4]">{row.state}</span>
          </div>
        ))}
      </div>

      {/* KEY LEVELS */}
      <div className="bg-[#121C38] px-2.5 py-1 text-[#FFC400] font-bold tracking-wider text-[10px]">
        KEY LEVELS
      </div>
      <div className="divide-y divide-[#00E5FF]/10">
        <div className="flex items-center justify-between px-2.5 py-1">
          <span className="text-[#C0C6D4]">Buy-Side Liquidity</span>
          <span className="text-[#FF2D55] font-bold tabular-nums">{fmtPrice(d.keyLevels.bslPrice)}</span>
        </div>
        <div className="flex items-center justify-between px-2.5 py-1">
          <span className="text-[#C0C6D4]">Sell-Side Liquidity</span>
          <span className="text-[#00FFA3] font-bold tabular-nums">{fmtPrice(d.keyLevels.sslPrice)}</span>
        </div>
        <div className="flex items-center justify-between px-2.5 py-1">
          <span className="text-[#C0C6D4]">Nearest Target ↑</span>
          <span className="text-[#00E5FF] font-bold tabular-nums">{fmtPrice(d.keyLevels.nearestTargetUp)}</span>
        </div>
        <div className="flex items-center justify-between px-2.5 py-1">
          <span className="text-[#C0C6D4]">Nearest Target ↓</span>
          <span className="text-[#FF2BD6] font-bold tabular-nums">{fmtPrice(d.keyLevels.nearestTargetDown)}</span>
        </div>
      </div>

      {/* Footer Disclaimer */}
      <div className="mt-auto p-2 bg-[#050810] border-t border-[#00E5FF]/20 text-[8px] text-[#6B7280] text-center">
        Analytical estimates - not advice
      </div>
    </aside>
  );
};
