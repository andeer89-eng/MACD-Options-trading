import React, { useEffect, useRef } from 'react';
import {
  HeatmapItem,
  SizingMode,
  ColorMode,
  Timeframe,
  ColorScheme,
  TreemapNode,
  computeSquarifiedTreemap,
} from '../utils/heatmapEngine';

interface HeatmapCanvasWebGLProps {
  items: HeatmapItem[];
  sizingMode: SizingMode;
  colorMode: ColorMode;
  timeframe: Timeframe;
  colorScheme: ColorScheme;
  hoveredSymbol: string | null;
  onHoverSymbol: (sym: string | null, sector: string | null) => void;
  onSelectTile: (item: HeatmapItem) => void;
}

export const HeatmapCanvasWebGL: React.FC<HeatmapCanvasWebGLProps> = ({
  items,
  sizingMode,
  colorMode,
  timeframe,
  colorScheme,
  hoveredSymbol,
  onHoverSymbol,
  onSelectTile,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const layoutNodesRef = useRef<{ item: HeatmapItem; x: number; y: number; w: number; h: number }[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle Resize & DevicePixelRatio for 60 FPS HD Crispness
    const updateCanvasDimensions = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      canvas.width = rect.width * dpr;
      canvas.height = Math.max(600, rect.height) * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${Math.max(600, rect.height)}px`;
      ctx.scale(dpr, dpr);
    };

    updateCanvasDimensions();
    window.addEventListener('resize', updateCanvasDimensions);

    // Compute Squarified Treemap Layout Nodes
    const parentWidth = canvas.parentElement?.clientWidth || 1200;
    const parentHeight = 650;
    const tree = computeSquarifiedTreemap(items, parentWidth, parentHeight, sizingMode, 'SECTOR');

    const flatNodes: { item: HeatmapItem; x: number; y: number; w: number; h: number }[] = [];
    tree.children?.forEach((grp) => {
      grp.children?.forEach((node) => {
        if (node.item) {
          flatNodes.push({
            item: node.item,
            x: node.x,
            y: node.y,
            w: node.width,
            h: node.height,
          });
        }
      });
    });
    layoutNodesRef.current = flatNodes;

    // 60 FPS Render Loop
    let pulseAngle = 0;
    const renderLoop = () => {
      pulseAngle += 0.05;
      const w = parentWidth;
      const h = parentHeight;

      ctx.clearRect(0, 0, w, h);

      // Background Baseline
      ctx.fillStyle = '#121318';
      ctx.fillRect(0, 0, w, h);

      flatNodes.forEach((node) => {
        const { item, x, y, w: nw, h: nh } = node;
        const isHovered = hoveredSymbol === item.symbol;

        // Calculate Tile Fill Color
        let fillColor = '#1e1f26';
        let strokeColor = '#27272a';
        let textColor = '#ffffff';

        const chg = item.timeframeChanges[timeframe] || 0;

        if (colorMode === 'NET_PRICE_CHANGE') {
          if (chg >= 3.0) fillColor = colorScheme === 'STANDARD' ? '#059669' : '#0891b2';
          else if (chg > 0.5) fillColor = colorScheme === 'STANDARD' ? '#064e3b' : '#164e63';
          else if (chg <= -3.0) fillColor = colorScheme === 'STANDARD' ? '#e11d48' : '#d97706';
          else if (chg < -0.5) fillColor = colorScheme === 'STANDARD' ? '#881337' : '#78350f';
        } else if (colorMode === 'RSI_MOMENTUM') {
          if (item.rsi <= 30) fillColor = '#10b981';
          else if (item.rsi <= 40) fillColor = '#064e3b';
          else if (item.rsi >= 70) fillColor = '#e11d48';
          else if (item.rsi >= 60) fillColor = '#881337';
        } else if (colorMode === 'INSTITUTIONAL_FLOW') {
          if (item.netDeltaFlowMillions >= 100) fillColor = '#059669';
          else if (item.netDeltaFlowMillions > 0) fillColor = '#064e3b';
          else if (item.netDeltaFlowMillions <= -100) fillColor = '#e11d48';
          else if (item.netDeltaFlowMillions < 0) fillColor = '#881337';
        } else if (colorMode === 'SHORT_SQUEEZE_RISK') {
          if (item.squeezeRiskScore >= 75) fillColor = '#7e22ce';
          else if (item.squeezeRiskScore >= 50) fillColor = '#3730a3';
        } else if (item.hasEarningsSoon) {
          fillColor = '#d97706';
        }

        // Hover Effect
        if (isHovered) {
          strokeColor = '#818cf8';
          ctx.shadowColor = '#818cf8';
          ctx.shadowBlur = 12;
        } else {
          ctx.shadowBlur = 0;
        }

        // Draw Rect
        ctx.fillStyle = fillColor;
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = isHovered ? 2 : 1;

        ctx.beginPath();
        ctx.roundRect(x + 1, y + 1, nw - 2, nh - 2, 6);
        ctx.fill();
        ctx.stroke();

        // Anomaly Pulse Ring
        if (item.anomalyAlert) {
          const radius = 3 + Math.sin(pulseAngle) * 1.5;
          ctx.fillStyle = '#f59e0b';
          ctx.beginPath();
          ctx.arc(x + nw - 10, y + 10, Math.max(1, radius), 0, Math.PI * 2);
          ctx.fill();
        }

        // Text Drawing (Symbol & Metric)
        if (nw > 35 && nh > 25) {
          ctx.shadowBlur = 0;
          ctx.fillStyle = textColor;
          ctx.font = 'bold 12px monospace';
          ctx.textAlign = 'left';
          ctx.fillText(item.symbol, x + 6, y + 18);

          if (nh > 45) {
            const mainValStr =
              colorMode === 'NET_PRICE_CHANGE'
                ? `${chg >= 0 ? '+' : ''}${chg.toFixed(1)}%`
                : colorMode === 'RSI_MOMENTUM'
                ? `RSI ${item.rsi}`
                : `${item.netDeltaFlowMillions >= 0 ? '+' : ''}$${item.netDeltaFlowMillions.toFixed(0)}M`;

            ctx.font = 'bold 11px sans-serif';
            ctx.fillStyle = chg >= 0 ? '#34d399' : '#f87171';
            ctx.fillText(mainValStr, x + 6, y + 34);
          }

          if (nh > 65 && nw > 75) {
            ctx.font = '10px monospace';
            ctx.fillStyle = '#a1a1aa';
            ctx.fillText(`$${item.price.toFixed(2)}`, x + 6, y + 48);
          }

          // Minified Sparkline Path
          if (nw > 90 && nh > 50 && item.sparkline.length > 2) {
            const sparkX = x + nw - 45;
            const sparkY = y + 12;
            const sparkW = 38;
            const sparkH = 20;

            const min = Math.min(...item.sparkline);
            const max = Math.max(...item.sparkline);
            const range = Math.max(0.1, max - min);

            ctx.strokeStyle = chg >= 0 ? '#34d399' : '#f87171';
            ctx.lineWidth = 1.5;
            ctx.beginPath();

            item.sparkline.forEach((val, i) => {
              const px = sparkX + (i / (item.sparkline.length - 1)) * sparkW;
              const py = sparkY + sparkH - ((val - min) / range) * sparkH;
              if (i === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
            });
            ctx.stroke();
          }
        }
      });

      animationFrameRef.current = requestAnimationFrame(renderLoop);
    };

    animationFrameRef.current = requestAnimationFrame(renderLoop);

    // Canvas Mouse Event Listeners
    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      let hitItem: HeatmapItem | null = null;
      for (const node of flatNodes) {
        if (mouseX >= node.x && mouseX <= node.x + node.w && mouseY >= node.y && mouseY <= node.y + node.h) {
          hitItem = node.item;
          break;
        }
      }

      if (hitItem) {
        canvas.style.cursor = 'pointer';
        onHoverSymbol(hitItem.symbol, hitItem.sector);
      } else {
        canvas.style.cursor = 'default';
        onHoverSymbol(null, null);
      }
    };

    const handleClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      for (const node of flatNodes) {
        if (mouseX >= node.x && mouseX <= node.x + node.w && mouseY >= node.y && mouseY <= node.y + node.h) {
          onSelectTile(node.item);
          break;
        }
      }
    };

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('click', handleClick);

    return () => {
      window.removeEventListener('resize', updateCanvasDimensions);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('click', handleClick);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [items, sizingMode, colorMode, timeframe, colorScheme, hoveredSymbol]);

  return (
    <div className="w-full h-[650px] relative rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950 shadow-2xl">
      <canvas ref={canvasRef} className="w-full h-full block cursor-pointer" />
    </div>
  );
};
