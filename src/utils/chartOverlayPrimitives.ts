import type { IChartApi, ISeriesApi } from 'lightweight-charts';

/**
 * Shared canvas overlay primitives & coordinate bridges for OrderFlowOverlay and
 * QuantumMarketXrayOverlay, keeping DPR scaling, Pane 0 bounds clipping, meter bars,
 * price formatting, and pill labels consistent across indicator layers.
 */

export type OverlayHudKind = 'ofs' | 'qmx';

export function resolveVisibleHudDock(params: {
  ofsHudEnabled: boolean;
  qmxHudEnabled: boolean;
  preferredHud: OverlayHudKind;
  isExpanded: boolean;
}): {
  showSwitcher: boolean;
  renderOfsHud: boolean;
  renderQmxHud: boolean;
} {
  const { ofsHudEnabled, qmxHudEnabled, preferredHud, isExpanded } = params;
  if (!ofsHudEnabled && !qmxHudEnabled) {
    return { showSwitcher: false, renderOfsHud: false, renderQmxHud: false };
  }
  if (ofsHudEnabled && !qmxHudEnabled) {
    return { showSwitcher: false, renderOfsHud: true, renderQmxHud: false };
  }
  if (!ofsHudEnabled && qmxHudEnabled) {
    return { showSwitcher: false, renderOfsHud: false, renderQmxHud: true };
  }
  // Both enabled: dock a compact single tabbed HUD in standard view to avoid crushing the price chart;
  // in expanded fullscreen where width is abundant, allow tabbed switching without crowding either.
  void isExpanded;
  return {
    showSwitcher: true,
    renderOfsHud: preferredHud === 'ofs',
    renderQmxHud: preferredHud === 'qmx',
  };
}

export function buildMeterBlocks(
  pct: number,
  count: number = 10
): { filled: string; empty: string } {
  const safeCount = Math.max(1, Math.floor(count));
  const safePct = Number.isFinite(pct) ? pct : 0;
  const clamped = Math.max(0, Math.min(100, safePct));
  const filledCount = Math.round((clamped / 100) * safeCount);
  return {
    filled: '█'.repeat(filledCount),
    empty: '░'.repeat(Math.max(0, safeCount - filledCount)),
  };
}

export function formatOverlayPrice(
  value: number | null | undefined,
  subDollarDecimals: number = 4
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  if (Math.abs(value) >= 10) return value.toFixed(2);
  return value.toFixed(subDollarDecimals);
}

export function drawOverlayPill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  textColor: string,
  bgColor: string = 'rgba(11, 15, 28, 0.90)',
  borderColor?: string,
  align: 'left' | 'center' | 'right' = 'center',
  fontSize: number = 10,
  padY: number = 4
): void {
  ctx.save();
  ctx.font = `700 ${fontSize}px "JetBrains Mono", ui-monospace, monospace`;
  const lines = text.split('\n');
  const lineH = fontSize + 3;
  const maxW = Math.max(...lines.map((l) => ctx.measureText(l).width));
  const padX = 6;
  const w = maxW + padX * 2;
  const h = lines.length * lineH + padY * 2 - 2;

  let leftX = x - w / 2;
  if (align === 'left') leftX = x;
  else if (align === 'right') leftX = x - w;

  const topY = y - h / 2;

  ctx.fillStyle = bgColor;
  ctx.beginPath();
  ctx.roundRect(leftX, topY, w, h, 4);
  ctx.fill();

  if (borderColor) {
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  ctx.fillStyle = textColor;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'center';
  lines.forEach((line, idx) => {
    ctx.fillText(line, leftX + w / 2, topY + padY + idx * lineH);
  });
  ctx.restore();
}

export function syncCanvasToContainer(
  canvas: HTMLCanvasElement,
  container: HTMLElement,
  dpr: number = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
): { width: number; height: number; ctx: CanvasRenderingContext2D } | null {
  const width = container.clientWidth;
  const height = container.clientHeight;
  if (width <= 0 || height <= 0) return null;

  const targetW = Math.floor(width * dpr);
  const targetH = Math.floor(height * dpr);
  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW;
    canvas.height = targetH;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  return { width, height, ctx };
}

export function getPrimaryPaneHeight(
  chart: IChartApi,
  totalHeight: number,
  fallbackRatio: number = 0.65
): number {
  try {
    const panes = chart.panes?.();
    if (panes && panes.length > 0) {
      const el = panes[0].getHTMLElement?.();
      if (el && el.clientHeight > 40) {
        return el.clientHeight;
      }
    }
  } catch {
    // Fallback if chart panes are mid-teardown
  }
  return Math.round(totalHeight * fallbackRatio);
}

export function getPrimaryPaneBounds(
  chart: IChartApi,
  totalWidth: number,
  totalHeight: number,
  fallbackRatio: number = 0.65
): { plotWidth: number; paneHeight: number } {
  try {
    const size = chart.paneSize?.(0);
    if (size && size.width > 60 && size.height > 40) {
      return {
        plotWidth: Math.floor(size.width),
        paneHeight: Math.floor(size.height),
      };
    }
  } catch {
    // Fallback if chart panes are mid-teardown
  }
  return {
    plotWidth: Math.max(100, Math.floor(totalWidth - 58)),
    paneHeight: getPrimaryPaneHeight(chart, totalHeight, fallbackRatio),
  };
}

export interface PillPlacementRect {
  leftX: number;
  centerY: number;
  topY: number;
  width: number;
  height: number;
}

export interface PillCollisionPlacer {
  tryPlace: (params: {
    x: number;
    y: number;
    width: number;
    height: number;
    align?: 'left' | 'center' | 'right';
    nudgeOffsets?: number[];
  }) => { leftX: number; centerY: number } | null;
}

export function createPillCollisionPlacer(bounds: {
  plotWidth: number;
  paneHeight: number;
  topMargin?: number;
  bottomMargin?: number;
  padding?: number;
}): PillCollisionPlacer {
  const {
    plotWidth,
    paneHeight,
    topMargin = 28,
    bottomMargin = 6,
    padding = 4,
  } = bounds;
  const placed: PillPlacementRect[] = [];

  return {
    tryPlace({
      x,
      y,
      width,
      height,
      align = 'center',
      nudgeOffsets = [0, -20, 20, -40, 40],
    }) {
      if (plotWidth < width + 8 || paneHeight < topMargin + bottomMargin + height) {
        return null;
      }

      let rawLeftX = x - width / 2;
      if (align === 'left') rawLeftX = x;
      else if (align === 'right') rawLeftX = x - width;

      const leftX = Math.max(4, Math.min(plotWidth - width - 4, rawLeftX));

      for (const offset of nudgeOffsets) {
        const centerY = y + offset;
        const topY = centerY - height / 2;
        const bottomY = topY + height;

        if (topY < topMargin || bottomY > paneHeight - bottomMargin) {
          continue;
        }

        const collides = placed.some((p) => {
          const horizOverlap =
            leftX < p.leftX + p.width + padding &&
            leftX + width + padding > p.leftX;
          const vertOverlap =
            topY < p.topY + p.height + padding &&
            bottomY + padding > p.topY;
          return horizOverlap && vertOverlap;
        });

        if (!collides) {
          placed.push({ leftX, centerY, topY, width, height });
          return { leftX, centerY };
        }
      }

      return null;
    },
  };
}

export function estimateOverlayPillSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  fontSize: number = 10,
  padY: number = 4
): { width: number; height: number } {
  ctx.save();
  ctx.font = `700 ${fontSize}px "JetBrains Mono", ui-monospace, monospace`;
  const lines = text.split('\n');
  const lineH = fontSize + 3;
  const maxW = Math.max(...lines.map((l) => ctx.measureText(l).width));
  ctx.restore();
  return {
    width: Math.ceil(maxW + 12),
    height: Math.ceil(lines.length * lineH + padY * 2 - 2),
  };
}

export type QmxOverlayLabelKind = 'zone' | 'sweep' | 'exhaustion' | 'vacuum' | 'trap';

export function compactQmxOverlayLabel(
  kind: QmxOverlayLabelKind,
  rawLabel: string
): string {
  const clean = rawLabel.trim();
  const numMatch = clean.match(/(\d+(?:\.\d+)?)\s*$/);
  const score = numMatch ? numMatch[1] : '';

  if (kind === 'zone') {
    const prefix = /^SSL/i.test(clean) ? 'SSL' : 'BSL';
    return score ? `${prefix} · ${score}` : prefix;
  }

  if (kind === 'sweep') {
    const arrow = /Bull/i.test(clean) ? '▲' : '▼';
    return score ? `SWEEP ${arrow} ${score}` : `SWEEP ${arrow}`;
  }

  if (kind === 'exhaustion') {
    const arrow = /Bear/i.test(clean) ? '▼' : '▲';
    const parts = clean.split('·');
    const scorePart = parts.length > 1 ? parts[parts.length - 1].trim() : score;
    return scorePart ? `EXH ${arrow} ${scorePart}` : `EXH ${arrow}`;
  }

  if (kind === 'vacuum') {
    const arrow = clean.includes('▼') || /Bear/i.test(clean) ? '▼' : '▲';
    const state = /FILLED/i.test(clean)
      ? 'FILLED'
      : /PART/i.test(clean)
        ? 'PART'
        : 'OPEN';
    return `VAC ${arrow} ${state}`;
  }

  if (kind === 'trap') {
    const arrow = /Bull/i.test(clean) ? '▲' : '▼';
    return score ? `TRAP ${arrow} ${score}` : `TRAP ${arrow}`;
  }

  return clean;
}

export interface ChartCoordBridge {
  timeToX: (unixSec: number) => number | null;
  priceToY: (price: number) => number | null;
}

export function createChartCoordBridge(
  chart: IChartApi,
  mainSeries: ISeriesApi<any>
): ChartCoordBridge {
  const ts = chart.timeScale();
  return {
    timeToX: (unixSec: number): number | null => {
      try {
        const x = ts.timeToCoordinate(unixSec as any);
        return typeof x === 'number' && Number.isFinite(x) ? x : null;
      } catch {
        return null;
      }
    },
    priceToY: (price: number): number | null => {
      try {
        const y = mainSeries.priceToCoordinate(price);
        return typeof y === 'number' && Number.isFinite(y) ? y : null;
      } catch {
        return null;
      }
    },
  };
}
