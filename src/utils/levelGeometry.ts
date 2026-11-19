import type { Levels } from './masterPlanCore.ts';

export interface LevelLadderGeometry {
  minPrice: number;
  maxPrice: number;
  entryLeftPct: number;
  entryWidthPct: number;
  stopPct: number;
  invalidationPct: number;
  currentPct: number;
  tp1Pct: number;
  tp2Pct: number | null;
}

export function computeLevelLadderGeometry(
  levels: Levels,
  currentPrice: number
): LevelLadderGeometry {
  const tp1 = levels.targets[0]?.price ?? currentPrice;
  const tp2 = levels.targets[1]?.price ?? null;

  const points = [
    levels.stop.price,
    levels.invalidation.price,
    levels.entryZone.lo,
    levels.entryZone.hi,
    currentPrice,
    tp1,
    ...(tp2 !== null ? [tp2] : []),
  ].filter((v) => Number.isFinite(v));

  const rawMin = points.length > 0 ? Math.min(...points) : currentPrice * 0.95;
  const rawMax = points.length > 0 ? Math.max(...points) : currentPrice * 1.05;
  const rawSpan = Math.max(rawMax - rawMin, Math.max(Math.abs(currentPrice) * 0.01, 0.01));
  const pad = rawSpan * 0.08;
  const minPrice = rawMin - pad;
  const maxPrice = rawMax + pad;
  const span = maxPrice - minPrice;

  const toPct = (price: number): number => {
    const pct = ((price - minPrice) / span) * 100;
    return Number(Math.max(6, Math.min(94, pct)).toFixed(2));
  };

  const entryLeftPct = toPct(levels.entryZone.lo);
  const entryRightPct = toPct(levels.entryZone.hi);

  return {
    minPrice,
    maxPrice,
    entryLeftPct,
    entryWidthPct: Number(Math.max(1.5, entryRightPct - entryLeftPct).toFixed(2)),
    stopPct: toPct(levels.stop.price),
    invalidationPct: toPct(levels.invalidation.price),
    currentPct: toPct(currentPrice),
    tp1Pct: toPct(tp1),
    tp2Pct: tp2 !== null ? toPct(tp2) : null,
  };
}
