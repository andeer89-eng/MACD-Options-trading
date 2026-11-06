export type VolatilityLevel = 'low' | 'moderate' | 'high';

export interface AlertFilterCriteria {
  minQualityScore: number; // 0 to 100
  volatilityLevels: VolatilityLevel[]; // e.g. ['low', 'moderate', 'high']
  divergenceType: 'ALL' | 'BULLISH' | 'BEARISH' | 'TRIPLE';
  searchQuery: string;
  minAtrPercent: number; // e.g. 0.0% to 5.0%
  priceNearSupport: boolean;
}

export interface AlertItemData {
  id: string;
  timestamp: number;
  symbol: string;
  type: string;
  price: number;
  score: number;
  trigger: number;
  stopLoss: number;
  target2: number;
  atr?: number;
  atrPercent?: number;
  volatilityLevel?: VolatilityLevel;
  companyName?: string;
  sector?: string;
  timeframe?: string;
  priceNearSupport?: boolean;
}

export const DEFAULT_ALERT_FILTERS: AlertFilterCriteria = {
  minQualityScore: 0,
  volatilityLevels: ['low', 'moderate', 'high'],
  divergenceType: 'ALL',
  searchQuery: '',
  minAtrPercent: 0,
  priceNearSupport: false,
};

/**
 * Determine volatility category based on ATR % of asset price.
 * Low / Stagnant: < 1.0%
 * Moderate: 1.0% to 2.0%
 * High: > 2.0%
 */
export function determineVolatilityLevel(atrPercent?: number): VolatilityLevel {
  if (atrPercent === undefined || atrPercent === null || Number.isNaN(atrPercent)) {
    return 'moderate'; // Default neutral fallback
  }
  if (atrPercent < 1.0) {
    return 'low';
  }
  if (atrPercent <= 2.0) {
    return 'moderate';
  }
  return 'high';
}

/**
 * Get human-readable description for volatility level.
 */
export function getVolatilityLevelMeta(level: VolatilityLevel): {
  label: string;
  range: string;
  color: string;
  badgeBg: string;
} {
  switch (level) {
    case 'low':
      return {
        label: 'Low / Stagnant',
        range: '< 1.0% ATR',
        color: 'text-zinc-400',
        badgeBg: 'bg-zinc-800/80 border-zinc-700 text-zinc-300',
      };
    case 'moderate':
      return {
        label: 'Moderate',
        range: '1.0% - 2.0% ATR',
        color: 'text-blue-400',
        badgeBg: 'bg-blue-500/10 border-blue-500/30 text-blue-300',
      };
    case 'high':
      return {
        label: 'High / Volatile',
        range: '> 2.0% ATR',
        color: 'text-amber-400',
        badgeBg: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
      };
  }
}

/**
 * Check if the active filters deviate from default (for showing active filter badges).
 */
export function isFilterActive(filters: AlertFilterCriteria): boolean {
  return (
    filters.minQualityScore > 0 ||
    filters.volatilityLevels.length < 3 ||
    filters.divergenceType !== 'ALL' ||
    filters.searchQuery.trim().length > 0 ||
    filters.minAtrPercent > 0 ||
    filters.priceNearSupport
  );
}

/**
 * Count how many filters are actively restricting alerts.
 */
export function countActiveFilters(filters: AlertFilterCriteria): number {
  let count = 0;
  if (filters.minQualityScore > 0) count++;
  if (filters.volatilityLevels.length < 3) count++;
  if (filters.divergenceType !== 'ALL') count++;
  if (filters.searchQuery.trim().length > 0) count++;
  if (filters.minAtrPercent > 0) count++;
  if (filters.priceNearSupport) count++;
  return count;
}

/**
 * Pure filtering function for alert stream items.
 */
export function filterAlertList(
  alerts: AlertItemData[],
  filters: AlertFilterCriteria
): AlertItemData[] {
  if (!alerts || alerts.length === 0) return [];

  const query = filters.searchQuery.trim().toUpperCase();

  return alerts.filter((alert) => {
    // 1. MACD Quality Score filter
    if (alert.score < filters.minQualityScore) {
      return false;
    }

    // 2. Volatility level filter
    const effectiveVolLevel = alert.volatilityLevel || determineVolatilityLevel(alert.atrPercent);
    if (!filters.volatilityLevels.includes(effectiveVolLevel)) {
      return false;
    }

    // 3. Minimum ATR percent filter
    if (filters.minAtrPercent > 0) {
      const atrPct = alert.atrPercent ?? 0;
      if (atrPct < filters.minAtrPercent) {
        return false;
      }
    }

    // 4. Divergence Type filter
    if (filters.divergenceType !== 'ALL') {
      const typeUpper = alert.type.toUpperCase();
      if (filters.divergenceType === 'BULLISH' && !typeUpper.includes('BULLISH')) {
        return false;
      }
      if (filters.divergenceType === 'BEARISH' && !typeUpper.includes('BEARISH')) {
        return false;
      }
      if (filters.divergenceType === 'TRIPLE' && !typeUpper.includes('TRIPLE')) {
        return false;
      }
    }

    // 5. Symbol or Company Search Query
    if (query) {
      const symMatch = alert.symbol.toUpperCase().includes(query);
      const nameMatch = alert.companyName ? alert.companyName.toUpperCase().includes(query) : false;
      if (!symMatch && !nameMatch) {
        return false;
      }
    }

    // 6. Price Near Support filter
    if (filters.priceNearSupport && !alert.priceNearSupport) {
      return false;
    }

    return true;
  });
}
