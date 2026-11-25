import type { MarketHealthCnnBenchmark, SentimentLabel } from './marketHealthEngine.ts';

export interface ExternalFearGreedPoint {
  date: string;
  score: number;
  label: SentimentLabel;
  vix: number | null;
}

export interface ExternalFearGreedSeries {
  provider: 'feargreedtracker.com' | 'cnn.io';
  providerLabel: string;
  currentScore: number;
  previousCloseScore: number | null;
  oneWeekAgoScore: number | null;
  oneMonthAgoScore: number | null;
  scoreDelta1D: number | null;
  asOf: string;
  historyByDate: Record<string, ExternalFearGreedPoint>;
  cnnPillars?: MarketHealthCnnBenchmark['pillars'];
}

function clampScore(val: number): number {
  if (!Number.isFinite(val)) return 50;
  return Math.max(0, Math.min(100, Math.round(val)));
}

function toSentimentLabel(score: number): SentimentLabel {
  const s = clampScore(score);
  if (s <= 24) return 'Extreme Fear';
  if (s <= 44) return 'Fear';
  if (s <= 55) return 'Neutral';
  if (s <= 74) return 'Greed';
  return 'Extreme Greed';
}

function extractBalancedJsonArray(text: string, marker: string): string | null {
  const idx = text.indexOf(marker);
  if (idx === -1) return null;
  const start = text.indexOf('[', idx + marker.length);
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  return null;
}

/**
 * Parses HTML from https://feargreedtracker.com/fear-greed-index-stock-market
 * Extracts both the full historicalData RSC payload (300+ daily points)
 * and the rendered meter/delta values as a resilient fallback.
 */
export function parseFearGreedTrackerHtml(html: string): ExternalFearGreedSeries | null {
  if (!html || typeof html !== 'string') return null;

  const historyByDate: Record<string, ExternalFearGreedPoint> = {};
  const orderedPoints: ExternalFearGreedPoint[] = [];

  // Next.js App Router escapes JSON inside self.__next_f.push([1,"..."])
  const unescaped = html.replace(/\\"/g, '"');
  const rawArray = extractBalancedJsonArray(unescaped, '"historicalData":');

  if (rawArray) {
    try {
      const parsed = JSON.parse(rawArray) as Array<Record<string, unknown>>;
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          const date = typeof item?.date === 'string' ? item.date.trim() : '';
          const rawScore = item?.score;
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
          if (typeof rawScore !== 'number' || !Number.isFinite(rawScore)) continue;
          const score = clampScore(rawScore);
          const vix =
            typeof item?.vix_price === 'number' && Number.isFinite(item.vix_price)
              ? Number(item.vix_price.toFixed(2))
              : null;
          const pt: ExternalFearGreedPoint = {
            date,
            score,
            label: toSentimentLabel(score),
            vix,
          };
          historyByDate[date] = pt;
        }
      }
    } catch {
      // Fall through to ARIA meter fallback below
    }
  }

  for (const key of Object.keys(historyByDate).sort()) {
    orderedPoints.push(historyByDate[key]);
  }

  // Extract rendered meter attribute as cross-check / fallback: aria-valuenow="17"
  const meterMatch = html.match(/aria-label="Fear\s*(?:&amp;|&)\s*Greed Index"[^>]*aria-valuenow="(\d+)"/i)
    || html.match(/aria-valuenow="(\d+)"\s+aria-valuetext="[^"]*(?:Fear|Greed|Neutral)[^"]*"/i);
  const ariaScore = meterMatch ? clampScore(Number(meterMatch[1])) : null;

  if (orderedPoints.length > 0) {
    const latest = orderedPoints[orderedPoints.length - 1];
    const prev = orderedPoints.length >= 2 ? orderedPoints[orderedPoints.length - 2] : null;
    const week = orderedPoints.length >= 6 ? orderedPoints[orderedPoints.length - 6] : null;
    const month = orderedPoints.length >= 22 ? orderedPoints[orderedPoints.length - 22] : null;
    const currentScore = ariaScore !== null ? ariaScore : latest.score;

    // Ensure latest date reflects headline currentScore if meter ticked slightly ahead
    historyByDate[latest.date] = {
      ...latest,
      score: currentScore,
      label: toSentimentLabel(currentScore),
    };

    return {
      provider: 'feargreedtracker.com',
      providerLabel: 'feargreedtracker.com (CNN Fear & Greed)',
      currentScore,
      previousCloseScore: prev ? prev.score : null,
      oneWeekAgoScore: week ? week.score : null,
      oneMonthAgoScore: month ? month.score : null,
      scoreDelta1D: prev ? currentScore - prev.score : null,
      asOf: latest.date,
      historyByDate,
    };
  }

  if (ariaScore !== null) {
    const today = new Date().toISOString().split('T')[0];
    const deltaMatch = html.match(/([+-])\s*(\d+)\s*points/i);
    const delta = deltaMatch
      ? (deltaMatch[1] === '-' ? -1 : 1) * Number(deltaMatch[2])
      : null;
    const prevScore = delta !== null ? clampScore(ariaScore - delta) : null;
    historyByDate[today] = {
      date: today,
      score: ariaScore,
      label: toSentimentLabel(ariaScore),
      vix: null,
    };
    return {
      provider: 'feargreedtracker.com',
      providerLabel: 'feargreedtracker.com (CNN Fear & Greed)',
      currentScore: ariaScore,
      previousCloseScore: prevScore,
      oneWeekAgoScore: null,
      oneMonthAgoScore: null,
      scoreDelta1D: delta,
      asOf: today,
      historyByDate,
    };
  }

  return null;
}

/**
 * Parses official CNN Fear & Greed graphdata JSON as fallback + 7-pillar details.
 */
export function parseCnnFearGreedGraphData(json: unknown): ExternalFearGreedSeries | null {
  if (!json || typeof json !== 'object') return null;
  const payload = json as Record<string, any>;
  const fg = payload.fear_and_greed;
  if (!fg || typeof fg.score !== 'number' || !Number.isFinite(fg.score)) return null;

  const numOrNull = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? Number(v.toFixed(1)) : null;

  const historyByDate: Record<string, ExternalFearGreedPoint> = {};
  const rawHist = payload.fear_and_greed_historical?.data;
  if (Array.isArray(rawHist)) {
    for (const pt of rawHist) {
      if (!pt || typeof pt.x !== 'number' || typeof pt.y !== 'number') continue;
      if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) continue;
      const date = new Date(pt.x).toISOString().split('T')[0];
      const score = clampScore(pt.y);
      historyByDate[date] = {
        date,
        score,
        label: toSentimentLabel(score),
        vix: null,
      };
    }
  }

  const dates = Object.keys(historyByDate).sort();
  const currentScore = clampScore(fg.score);
  const asOf =
    typeof fg.timestamp === 'string' && /^\d{4}-\d{2}-\d{2}/.test(fg.timestamp)
      ? fg.timestamp.slice(0, 10)
      : dates[dates.length - 1] || new Date().toISOString().split('T')[0];

  const prevClose =
    typeof fg.previous_close === 'number' && Number.isFinite(fg.previous_close)
      ? clampScore(fg.previous_close)
      : dates.length >= 2
      ? historyByDate[dates[dates.length - 2]].score
      : null;

  return {
    provider: 'cnn.io',
    providerLabel: 'CNN Fear & Greed Feed',
    currentScore,
    previousCloseScore: prevClose,
    oneWeekAgoScore:
      typeof fg.previous_1_week === 'number' && Number.isFinite(fg.previous_1_week)
        ? clampScore(fg.previous_1_week)
        : null,
    oneMonthAgoScore:
      typeof fg.previous_1_month === 'number' && Number.isFinite(fg.previous_1_month)
        ? clampScore(fg.previous_1_month)
        : null,
    scoreDelta1D: prevClose !== null ? currentScore - prevClose : null,
    asOf,
    historyByDate,
    cnnPillars: {
      marketMomentumSp500: numOrNull(payload.market_momentum_sp500?.score),
      stockPriceStrength: numOrNull(payload.stock_price_strength?.score),
      stockPriceBreadth: numOrNull(payload.stock_price_breadth?.score),
      putCallOptions: numOrNull(payload.put_call_options?.score),
      marketVolatilityVix: numOrNull(payload.market_volatility_vix?.score),
      junkBondDemand: numOrNull(payload.junk_bond_demand?.score),
      safeHavenDemand: numOrNull(payload.safe_haven_demand?.score),
    },
  };
}

export function mergeExternalFearGreedData(
  primary: ExternalFearGreedSeries | null,
  cnnFallback: ExternalFearGreedSeries | null
): ExternalFearGreedSeries | null {
  if (primary) {
    return {
      ...primary,
      cnnPillars: primary.cnnPillars || cnnFallback?.cnnPillars,
    };
  }
  return cnnFallback;
}
