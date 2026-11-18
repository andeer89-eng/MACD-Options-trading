import React, { useEffect, useRef, useState } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import type {
  PineExecutionResult,
  PineTableObject,
} from '../utils/pineScriptExecutor';
import {
  createChartCoordBridge,
  createPillCollisionPlacer,
  drawOverlayPill,
  estimateOverlayPillSize,
  getPrimaryPaneBounds,
  syncCanvasToContainer,
} from '../utils/chartOverlayPrimitives';

interface PineScriptOverlayProps {
  chart: IChartApi | null;
  mainSeries: ISeriesApi<any> | null;
  containerRef: React.RefObject<HTMLDivElement | null>;
  results: PineExecutionResult[];
}

function drawPolygonFillSegment(
  ctx: CanvasRenderingContext2D,
  pts: Array<{ x: number; y1: number; y2: number }>,
  fillColor: string
) {
  if (pts.length < 2) return;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y1);
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i].x, pts[i].y1);
  }
  for (let i = pts.length - 1; i >= 0; i--) {
    ctx.lineTo(pts[i].x, pts[i].y2);
  }
  ctx.closePath();
  ctx.fillStyle = fillColor;
  ctx.fill();
  ctx.restore();
}

export const PineScriptOverlay: React.FC<PineScriptOverlayProps> = ({
  chart,
  mainSeries,
  containerRef,
  results,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [paneBox, setPaneBox] = useState<{
    rightOffset: number;
    paneHeight: number;
    paneBottomOffset: number;
  }>({
    rightOffset: 68,
    paneHeight: 380,
    paneBottomOffset: 190,
  });

  const overlayResults = results.filter((r) => r.ok && r.overlay);
  const allTables: Array<{ key: string; table: PineTableObject; title: string }> = [];
  for (const res of overlayResults) {
    res.tables.forEach((tb, idx) => {
      allTables.push({
        key: `${res.indicatorId}-tbl-${idx}`,
        table: tb,
        title: res.name,
      });
    });
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !chart || !mainSeries) {
      return;
    }

    let rafId = 0;

    const renderOverlay = () => {
      if (!canvasRef.current || !containerRef.current || !chart || !mainSeries) return;

      const synced = syncCanvasToContainer(canvasRef.current, containerRef.current);
      if (!synced) return;
      const { width, height: totalHeight, ctx } = synced;
      const { plotWidth, paneHeight } = getPrimaryPaneBounds(chart, width, totalHeight, 0.65);

      const nextRightOffset = Math.max(58, Math.round(width - plotWidth + 8));
      const nextPaneBottomOffset = Math.max(8, Math.round(totalHeight - paneHeight + 6));
      setPaneBox((prev) =>
        Math.abs(prev.rightOffset - nextRightOffset) >= 2 ||
        Math.abs(prev.paneHeight - paneHeight) >= 2 ||
        Math.abs(prev.paneBottomOffset - nextPaneBottomOffset) >= 2
          ? {
              rightOffset: nextRightOffset,
              paneHeight,
              paneBottomOffset: nextPaneBottomOffset,
            }
          : prev
      );

      if (overlayResults.length === 0) return;

      const placer = createPillCollisionPlacer({
        plotWidth,
        paneHeight,
        topMargin: 32,
        bottomMargin: 8,
        padding: 3,
      });

      const { timeToX, priceToY } = createChartCoordBridge(chart, mainSeries);

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, plotWidth, paneHeight);
      ctx.clip();

      // Estimate bar spacing from any plot or logical spacing
      let barWidth = 8;
      for (const r of overlayResults) {
        const refPts = r.plots[0]?.points;
        if (refPts && refPts.length >= 2) {
          const x1 = timeToX(refPts[refPts.length - 2].time);
          const x2 = timeToX(refPts[refPts.length - 1].time);
          if (x1 !== null && x2 !== null && Math.abs(x2 - x1) > 1) {
            barWidth = Math.max(3, Math.min(28, Math.abs(x2 - x1)));
            break;
          }
        }
      }

      for (const res of overlayResults) {
        // 1. Background Bands (bgcolor)
        if (res.bgBands.length > 0) {
          for (const bg of res.bgBands) {
            const x = timeToX(bg.time);
            if (x === null || x < -barWidth || x > plotWidth + barWidth) continue;
            ctx.fillStyle = bg.color;
            ctx.fillRect(x - barWidth / 2, 0, barWidth, paneHeight);
          }
        }

        // 2. Fill Bands (fill(p1, p2, color)) grouped by contiguous color
        for (const fill of res.fills) {
          let segColor = '';
          let segPts: Array<{ x: number; y1: number; y2: number }> = [];
          for (const pt of fill.points) {
            const x = timeToX(pt.time);
            const y1 = priceToY(pt.y1);
            const y2 = priceToY(pt.y2);
            if (x === null || y1 === null || y2 === null) continue;
            if (segPts.length > 0 && pt.color !== segColor) {
              drawPolygonFillSegment(ctx, segPts, segColor);
              // Repeat boundary point cleanly so adjacent segments touch
              segPts = [segPts[segPts.length - 1]];
            }
            segColor = pt.color;
            segPts.push({ x, y1, y2 });
          }
          if (segPts.length >= 2) {
            drawPolygonFillSegment(ctx, segPts, segColor);
          }
        }

        // 3. Special Discontinuous / Point Plots (circles, cross, linebr)
        for (const plot of res.plots) {
          if (plot.style === 'circles' || plot.style === 'cross') {
            for (const pt of plot.points) {
              const x = timeToX(pt.time);
              const y = priceToY(pt.value);
              if (x === null || y === null || x < 0 || x > plotWidth) continue;
              ctx.save();
              const col = pt.color || plot.color;
              if (plot.style === 'circles') {
                ctx.fillStyle = col;
                ctx.beginPath();
                ctx.arc(x, y, Math.max(2, plot.lineWidth), 0, Math.PI * 2);
                ctx.fill();
              } else {
                ctx.strokeStyle = col;
                ctx.lineWidth = Math.max(1.2, plot.lineWidth * 0.8);
                const r = 3;
                ctx.beginPath();
                ctx.moveTo(x - r, y);
                ctx.lineTo(x + r, y);
                ctx.moveTo(x, y - r);
                ctx.lineTo(x, y + r);
                ctx.stroke();
              }
              ctx.restore();
            }
          } else if (plot.style === 'linebr') {
            let prev: { x: number; y: number; color: string } | null = null;
            for (const pt of plot.points) {
              const x = timeToX(pt.time);
              const y = priceToY(pt.value);
              if (x === null || y === null) {
                prev = null;
                continue;
              }
              const col = pt.color || plot.color;
              if (prev && prev.color === col) {
                ctx.save();
                ctx.strokeStyle = col;
                ctx.lineWidth = plot.lineWidth;
                ctx.beginPath();
                ctx.moveTo(prev.x, prev.y);
                ctx.lineTo(x, y);
                ctx.stroke();
                ctx.restore();
              }
              prev = { x, y, color: col };
            }
          }
        }

        // 4. Pine Boxes (box.new)
        for (const bx of res.boxes) {
          const x1Raw = timeToX(bx.leftTime);
          const x2Raw = timeToX(bx.rightTime);
          const yTop = priceToY(bx.top);
          const yBot = priceToY(bx.bottom);
          if (yTop === null || yBot === null) continue;

          let leftX = x1Raw ?? 0;
          let rightX = x2Raw ?? plotWidth - 6;
          if (bx.extend === 'right' || bx.extend === 'both') rightX = plotWidth - 4;
          if (bx.extend === 'left' || bx.extend === 'both') leftX = 4;
          if (rightX < leftX) [leftX, rightX] = [rightX, leftX];
          if (rightX < 0 || leftX > plotWidth) continue;

          const topY = Math.min(yTop, yBot);
          const boxH = Math.max(8, Math.abs(yBot - yTop));

          ctx.save();
          ctx.fillStyle = bx.bgcolor;
          ctx.strokeStyle = bx.borderColor;
          ctx.lineWidth = bx.borderWidth;
          if (bx.borderStyle === 'dashed') ctx.setLineDash([5, 4]);
          else if (bx.borderStyle === 'dotted') ctx.setLineDash([2, 3]);
          ctx.fillRect(leftX, topY, rightX - leftX, boxH);
          ctx.strokeRect(leftX, topY, rightX - leftX, boxH);
          ctx.setLineDash([]);

          if (bx.text) {
            ctx.font = '700 9.5px "JetBrains Mono", ui-monospace, monospace';
            ctx.fillStyle = bx.textColor;
            ctx.textBaseline =
              bx.textValign === 'top' ? 'top' : bx.textValign === 'bottom' ? 'bottom' : 'middle';
            ctx.textAlign = bx.textHalign;
            const tx =
              bx.textHalign === 'left'
                ? leftX + 6
                : bx.textHalign === 'right'
                  ? rightX - 6
                  : leftX + (rightX - leftX) / 2;
            const ty =
              bx.textValign === 'top'
                ? topY + 4
                : bx.textValign === 'bottom'
                  ? topY + boxH - 4
                  : topY + boxH / 2;
            ctx.fillText(bx.text, tx, ty);
          }
          ctx.restore();
        }

        // 5. Pine Lines (line.new)
        for (const ln of res.lines) {
          const x1 = timeToX(ln.x1Time);
          const y1 = priceToY(ln.y1);
          const x2 = timeToX(ln.x2Time);
          const y2 = priceToY(ln.y2);
          if (x1 === null || y1 === null || x2 === null || y2 === null) continue;

          let sx = x1;
          let sy = y1;
          let ex = x2;
          let ey = y2;
          const dx = x2 - x1;
          if (Math.abs(dx) > 0.5) {
            const slope = (y2 - y1) / dx;
            if (ln.extend === 'right' || ln.extend === 'both') {
              ex = plotWidth;
              ey = y1 + (ex - x1) * slope;
            }
            if (ln.extend === 'left' || ln.extend === 'both') {
              sx = 0;
              sy = y1 + (sx - x1) * slope;
            }
          }

          ctx.save();
          ctx.strokeStyle = ln.color;
          ctx.lineWidth = ln.width;
          if (ln.style === 'dashed') ctx.setLineDash([5, 4]);
          else if (ln.style === 'dotted') ctx.setLineDash([2, 3]);
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(ex, ey);
          ctx.stroke();
          ctx.restore();
        }

        // 6. Plotshape / Plotchar / Plotarrow Markers
        for (const sh of res.shapes) {
          const x = timeToX(sh.time);
          const y = priceToY(sh.price);
          if (x === null || y === null || x < 4 || x > plotWidth - 4) continue;

          const isBelow = sh.location === 'BelowBar' || sh.location === 'Bottom';
          const textTag = sh.text || sh.char;

          // Draw compact shape icon
          ctx.save();
          ctx.fillStyle = sh.color;
          const iconY = isBelow ? y + 10 : y - 10;
          if (sh.shape.includes('triangle_up') || sh.shape.includes('arrow_up') || sh.shape.includes('label_up')) {
            ctx.beginPath();
            ctx.moveTo(x, iconY - 5);
            ctx.lineTo(x - 4.5, iconY + 4);
            ctx.lineTo(x + 4.5, iconY + 4);
            ctx.closePath();
            ctx.fill();
          } else if (sh.shape.includes('triangle_down') || sh.shape.includes('arrow_down') || sh.shape.includes('label_down')) {
            ctx.beginPath();
            ctx.moveTo(x, iconY + 5);
            ctx.lineTo(x - 4.5, iconY - 4);
            ctx.lineTo(x + 4.5, iconY - 4);
            ctx.closePath();
            ctx.fill();
          } else if (sh.shape.includes('square')) {
            ctx.fillRect(x - 3.5, iconY - 3.5, 7, 7);
          } else if (sh.shape.includes('diamond')) {
            ctx.beginPath();
            ctx.moveTo(x, iconY - 4.5);
            ctx.lineTo(x + 4.5, iconY);
            ctx.lineTo(x, iconY + 4.5);
            ctx.lineTo(x - 4.5, iconY);
            ctx.closePath();
            ctx.fill();
          } else {
            ctx.beginPath();
            ctx.arc(x, iconY, 3.5, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();

          if (textTag) {
            const size = estimateOverlayPillSize(ctx, textTag, 8.5, 2.5);
            const placed = placer.tryPlace({
              x,
              y: isBelow ? y + 24 : y - 24,
              width: size.width,
              height: size.height,
              align: 'center',
              nudgeOffsets: isBelow ? [0, 14, -14, 28] : [0, -14, 14, -28],
            });
            if (placed) {
              drawOverlayPill(
                ctx,
                placed.leftX,
                placed.centerY,
                textTag,
                sh.textColor,
                sh.color,
                undefined,
                'left',
                8.5,
                2.5
              );
            }
          }
        }

        // 7. Pine Strategy Trades (strategy.entry / strategy.close)
        for (const tr of res.strategyTrades) {
          const x = timeToX(tr.time);
          const y = priceToY(tr.price);
          if (x === null || y === null || x < 4 || x > plotWidth - 4) continue;
          const isLongEntry = tr.kind === 'entry' && tr.direction === 'long';
          const bg =
            tr.kind === 'exit'
              ? '#64748b'
              : isLongEntry
                ? '#10b981'
                : '#ef4444';
          const size = estimateOverlayPillSize(ctx, tr.label, 8.5, 2.5);
          const placed = placer.tryPlace({
            x,
            y: isLongEntry ? y + 18 : y - 18,
            width: size.width,
            height: size.height,
            align: 'center',
            nudgeOffsets: [0, -16, 16, -32, 32],
          });
          if (placed) {
            drawOverlayPill(
              ctx,
              placed.leftX,
              placed.centerY,
              tr.label,
              '#ffffff',
              bg,
              undefined,
              'left',
              8.5,
              2.5
            );
          }
        }

        // 8. Pine Labels (label.new)
        for (const lb of res.labels) {
          const x = timeToX(lb.time);
          const y = priceToY(lb.y);
          if (x === null || y === null || x < 4 || x > plotWidth - 4) continue;
          const size = estimateOverlayPillSize(ctx, lb.text, 9, 3);
          const placed = placer.tryPlace({
            x,
            y,
            width: size.width,
            height: size.height,
            align: 'center',
            nudgeOffsets: [0, -16, 16, -32, 32],
          });
          if (placed) {
            drawOverlayPill(
              ctx,
              placed.leftX,
              placed.centerY,
              lb.text,
              lb.textColor,
              lb.color,
              undefined,
              'left',
              9,
              3
            );
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
        // ignore
      }
      ro.disconnect();
    };
  }, [chart, mainSeries, containerRef, overlayResults]);

  if (overlayResults.length === 0) return null;

  return (
    <>
      <canvas
        ref={canvasRef}
        data-testid="pinescript-universal-canvas"
        className="absolute inset-0 w-full h-full pointer-events-none z-10"
      />

      {allTables.map(({ key, table, title }) => {
        const pos = table.position.toLowerCase();
        const stylePos: React.CSSProperties = {};
        if (pos.includes('left')) {
          stylePos.left = '12px';
        } else {
          stylePos.right = `${paneBox.rightOffset}px`;
        }
        if (pos.includes('bottom')) {
          stylePos.bottom = `${paneBox.paneBottomOffset}px`;
        } else if (pos.includes('middle')) {
          stylePos.top = `${Math.max(40, Math.round(paneBox.paneHeight * 0.4))}px`;
        } else {
          stylePos.top = '10px';
        }

        return (
          <div
            key={key}
            data-testid="pinescript-table-card"
            style={{
              ...stylePos,
              borderColor: table.borderColor,
              backgroundColor: table.bgcolor,
            }}
            className="absolute z-20 pointer-events-none rounded border shadow-xl text-[9.5px] font-mono overflow-hidden backdrop-blur-sm max-w-[220px]"
          >
            <div className="px-2 py-0.5 text-[9px] font-bold text-zinc-200 bg-black/40 border-b border-white/10 truncate">
              {title}
            </div>
            <table className="w-full border-collapse">
              <tbody>
                {table.cells.map((row, rIdx) => (
                  <tr key={rIdx} className="border-t border-white/10 first:border-t-0">
                    {row.map((cell, cIdx) => (
                      <td
                        key={cIdx}
                        style={{
                          color: cell.textColor,
                          backgroundColor: cell.bgcolor,
                          textAlign: cell.textHalign,
                        }}
                        className="px-2 py-0.5 whitespace-nowrap"
                      >
                        {cell.text}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </>
  );
};
