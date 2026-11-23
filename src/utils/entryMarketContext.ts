import type {
  MarketHealthDailyPoint,
  MarketHealthReport,
  MarketSafetyStatus,
  SentimentLabel,
} from './marketHealthEngine';
import type { MarketStructuralSummary, StructuralRegime } from './marketStructuralContext';

export type VixRegimeBucket =
  | 'LOW_VIX_<16'
  | 'NORMAL_VIX_16_22'
  | 'ELEVATED_VIX_22_28'
  | 'CRISIS_VIX_>28'
  | 'UNKNOWN';

export interface EntryMarketContext {
  capturedAt: string;
  entryDate: string; // YYYY-MM-DD
  source: 'LIVE_ORDER' | 'BACKFILL_1M' | 'MANUAL_ENTRY';
  healthScore: number;
  sentimentLabel: SentimentLabel;
  safetyStatus: MarketSafetyStatus;
  vix: number | null;
  vixBucket: VixRegimeBucket;
  vixTermStructure: 'CONTANGO' | 'FLAT' | 'BACKWARDATION' | 'UNAVAILABLE';
  netVolume1MBillions: number | null;
  buySellRatio1M: number | null;
  breadthPct: number | null;
  spyStructuralRegime: StructuralRegime | null;
  qqqStructuralRegime: StructuralRegime | null;
  symbolStructuralRegime: StructuralRegime | null;
  initialRiskDollars: number | null;
  assetMode: 'EQUITY' | 'OPTIONS';
}

export interface ShadowSignalRecord {
  id: string;
  createdAt: string;
  date: string; // YYYY-MM-DD
  symbol: string;
  setupType: string;
  assetMode: 'EQUITY' | 'OPTIONS';
  signalPrice: number;
  blockCategory: 'CRASH_DEFENSE' | 'VOLUME_GAP' | 'QUALITY_GATE' | 'SECTOR_CAP' | 'OTHER';
  blockReason: string;
  entryMarketContext: EntryMarketContext | null;
  evaluatedAt?: string;
  latestPrice?: number;
  horizonDays?: number;
  counterfactualReturnPct?: number;
  verdict?: 'SAVED_LOSS' | 'MISSED_GAIN' | 'FLAT' | 'PENDING';
}

const ENTRY_CTX_STORAGE_KEY = 'trullas_entry_market_contexts_v1';
const SHADOW_SIGNALS_STORAGE_KEY = 'trullas_shadow_signals_v1';

export function classifyVixBucket(vix: number | null | undefined): VixRegimeBucket {
  if (typeof vix !== 'number' || !Number.isFinite(vix) || vix <= 0) return 'UNKNOWN';
  if (vix < 16) return 'LOW_VIX_<16';
  if (vix < 22) return 'NORMAL_VIX_16_22';
  if (vix < 28) return 'ELEVATED_VIX_22_28';
  return 'CRISIS_VIX_>28';
}

export function formatVixBucketLabel(bucket: VixRegimeBucket): string {
  switch (bucket) {
    case 'LOW_VIX_<16':
      return 'VIX < 16 (Low Vol)';
    case 'NORMAL_VIX_16_22':
      return 'VIX 16–22 (Normal)';
    case 'ELEVATED_VIX_22_28':
      return 'VIX 22–28 (Elevated)';
    case 'CRISIS_VIX_>28':
      return 'VIX > 28 (Stress)';
    default:
      return 'VIX N/A';
  }
}

export function formatStructuralRegimeLabel(regime: StructuralRegime | null | undefined): string {
  switch (regime) {
    case 'AT_INSTITUTIONAL_BUY_ZONE':
      return 'Inst Buy Zone';
    case 'IN_VOLUME_GAP':
      return 'Volume Gap (LVN)';
    case 'ABOVE_VALUE_TREND':
      return 'Above Value Trend';
    case 'BELOW_STRUCTURAL_SUPPORT':
      return 'Below Support';
    default:
      return 'No Struct Tag';
  }
}

export function formatEntryMarketContextBadge(ctx: EntryMarketContext | null | undefined): string {
  if (!ctx) return 'Regime N/A';
  const parts: string[] = [`${ctx.sentimentLabel} (${ctx.healthScore})`];
  if (ctx.vix !== null && Number.isFinite(ctx.vix)) {
    parts.push(`VIX ${ctx.vix.toFixed(1)}`);
  }
  if (ctx.vixTermStructure !== 'UNAVAILABLE') {
    parts.push(ctx.vixTermStructure);
  }
  const struct = ctx.symbolStructuralRegime || ctx.spyStructuralRegime;
  if (struct) {
    parts.push(formatStructuralRegimeLabel(struct));
  }
  return parts.join(' · ');
}

export function buildEntryMarketContextFromReport(
  report: MarketHealthReport | null | undefined,
  opts?: {
    entryDate?: string;
    symbolStructural?: MarketStructuralSummary | null;
    initialRiskDollars?: number | null;
    assetMode?: 'EQUITY' | 'OPTIONS';
    source?: EntryMarketContext['source'];
  }
): EntryMarketContext | null {
  if (!report || !report.current) return null;
  const cur = report.current;
  const dateStr = (opts?.entryDate || report.asOf || new Date().toISOString()).slice(0, 10);

  return {
    capturedAt: new Date().toISOString(),
    entryDate: dateStr,
    source: opts?.source || 'LIVE_ORDER',
    healthScore: Math.round(cur.score),
    sentimentLabel: cur.label,
    safetyStatus: cur.safetyStatus,
    vix: cur.vix,
    vixBucket: classifyVixBucket(cur.vix),
    vixTermStructure: cur.vixTermStructure,
    netVolume1MBillions: Number.isFinite(cur.netVolume1MBillions) ? cur.netVolume1MBillions : null,
    buySellRatio1M: Number.isFinite(cur.buySellRatio1M) ? cur.buySellRatio1M : null,
    breadthPct: Number.isFinite(cur.breadthPct) ? cur.breadthPct : null,
    spyStructuralRegime: report.structuralContext?.spy?.regime ?? null,
    qqqStructuralRegime: report.structuralContext?.qqq?.regime ?? null,
    symbolStructuralRegime: opts?.symbolStructural?.regime ?? null,
    initialRiskDollars:
      typeof opts?.initialRiskDollars === 'number' &&
      Number.isFinite(opts.initialRiskDollars) &&
      opts.initialRiskDollars > 0
        ? Number(opts.initialRiskDollars.toFixed(2))
        : null,
    assetMode: opts?.assetMode || 'EQUITY',
  };
}

function deriveSafetyFromDailyPoint(pt: MarketHealthDailyPoint): MarketSafetyStatus {
  const vix = pt.vix ?? 0;
  const termBackwardated = pt.vixTermRatio !== null && pt.vixTermRatio < 0.96;
  if (pt.sentimentScore < 32 || (vix >= 28 && termBackwardated)) {
    return 'CRASH_DEFENSE';
  }
  if (pt.sentimentScore < 46 || vix >= 22 || (pt.vixTermRatio !== null && pt.vixTermRatio < 0.98)) {
    return 'CAUTIOUS';
  }
  return 'SAFE_RISK_ON';
}

/**
 * Deterministically backfills entry market context for historical trades using `MarketHealthReport.history1M`
 * (matching exact trading date or nearest prior trading session within 5 calendar days).
 */
export function backfillEntryMarketContextFromHistory(
  entryDate: string,
  report: MarketHealthReport | null | undefined,
  opts?: {
    initialRiskDollars?: number | null;
    assetMode?: 'EQUITY' | 'OPTIONS';
  }
): EntryMarketContext | null {
  if (!report) return null;
  const targetDate = String(entryDate || '').slice(0, 10);
  if (!targetDate) return null;

  if (report.asOf === targetDate) {
    return buildEntryMarketContextFromReport(report, {
      entryDate: targetDate,
      initialRiskDollars: opts?.initialRiskDollars,
      assetMode: opts?.assetMode,
      source: 'BACKFILL_1M',
    });
  }

  const history = Array.isArray(report.history1M) ? report.history1M : [];
  if (history.length === 0) return null;

  const targetMs = new Date(`${targetDate}T12:00:00Z`).getTime();
  if (!Number.isFinite(targetMs)) return null;

  let bestPoint: MarketHealthDailyPoint | null = null;
  let bestDiffDays = Infinity;

  for (const pt of history) {
    if (!pt?.date) continue;
    if (pt.date === targetDate) {
      bestPoint = pt;
      bestDiffDays = 0;
      break;
    }
    const ptMs = new Date(`${pt.date}T12:00:00Z`).getTime();
    if (!Number.isFinite(ptMs)) continue;
    const diffDays = (targetMs - ptMs) / 86_400_000;
    // Only use same day or prior trading session (never future bars -> zero look-ahead bias)
    if (diffDays >= 0 && diffDays <= 5 && diffDays < bestDiffDays) {
      bestDiffDays = diffDays;
      bestPoint = pt;
    }
  }

  if (!bestPoint) return null;

  const vixTermStructure: EntryMarketContext['vixTermStructure'] =
    bestPoint.vixTermRatio === null
      ? 'UNAVAILABLE'
      : bestPoint.vixTermRatio >= 1.02
      ? 'CONTANGO'
      : bestPoint.vixTermRatio < 0.98
      ? 'BACKWARDATION'
      : 'FLAT';

  return {
    capturedAt: new Date().toISOString(),
    entryDate: bestPoint.date,
    source: 'BACKFILL_1M',
    healthScore: Math.round(bestPoint.sentimentScore),
    sentimentLabel: bestPoint.label,
    safetyStatus: deriveSafetyFromDailyPoint(bestPoint),
    vix: bestPoint.vix,
    vixBucket: classifyVixBucket(bestPoint.vix),
    vixTermStructure,
    netVolume1MBillions: Number.isFinite(bestPoint.netFlowBillions) ? bestPoint.netFlowBillions : null,
    buySellRatio1M: null,
    breadthPct: Number.isFinite(bestPoint.breadthPct) ? bestPoint.breadthPct : null,
    spyStructuralRegime: null,
    qqqStructuralRegime: null,
    symbolStructuralRegime: null,
    initialRiskDollars:
      typeof opts?.initialRiskDollars === 'number' &&
      Number.isFinite(opts.initialRiskDollars) &&
      opts.initialRiskDollars > 0
        ? Number(opts.initialRiskDollars.toFixed(2))
        : null,
    assetMode: opts?.assetMode || 'EQUITY',
  };
}

// ============================================================================
// Persistent Entry Context Snapshot Store (keyed by orderId / clientOrderId / sym+date)
// ============================================================================

export function loadEntryMarketContextStore(): Record<string, EntryMarketContext> {
  if (typeof window === 'undefined' || !window.localStorage) return {};
  try {
    const raw = window.localStorage.getItem(ENTRY_CTX_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, EntryMarketContext>) : {};
  } catch {
    return {};
  }
}

function saveEntryMarketContextStore(store: Record<string, EntryMarketContext>): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const keys = Object.keys(store);
    if (keys.length > 400) {
      const trimmed: Record<string, EntryMarketContext> = {};
      for (const k of keys.slice(-300)) {
        trimmed[k] = store[k];
      }
      window.localStorage.setItem(ENTRY_CTX_STORAGE_KEY, JSON.stringify(trimmed));
      return;
    }
    window.localStorage.setItem(ENTRY_CTX_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Ignore storage quota errors
  }
}

export function buildEntryContextLookupKeys(params: {
  orderId?: string | null;
  clientOrderId?: string | null;
  symbol?: string | null;
  entryDate?: string | null;
}): string[] {
  const keys: string[] = [];
  if (params.orderId) keys.push(`ord:${params.orderId}`);
  if (params.clientOrderId) keys.push(`coid:${params.clientOrderId}`);
  if (params.symbol && params.entryDate) {
    keys.push(`symdate:${params.symbol.trim().toUpperCase()}|${params.entryDate.slice(0, 10)}`);
  }
  return keys;
}

export function storeEntryMarketContextSnapshot(
  params: {
    orderId?: string | null;
    clientOrderId?: string | null;
    symbol?: string | null;
    entryDate?: string | null;
  },
  context: EntryMarketContext | null | undefined
): void {
  if (!context) return;
  const keys = buildEntryContextLookupKeys(params);
  if (keys.length === 0) return;
  const store = loadEntryMarketContextStore();
  for (const key of keys) {
    store[key] = context;
  }
  saveEntryMarketContextStore(store);
}

export function lookupEntryMarketContextSnapshot(
  params: {
    orderId?: string | null;
    clientOrderId?: string | null;
    symbol?: string | null;
    entryDate?: string | null;
  },
  storeOverride?: Record<string, EntryMarketContext>
): EntryMarketContext | null {
  const store = storeOverride ?? loadEntryMarketContextStore();
  const keys = buildEntryContextLookupKeys(params);
  for (const k of keys) {
    if (store[k]) return store[k];
  }
  return null;
}

// ============================================================================
// Shadow / Counterfactual Signal Ledger (tracks blocked / skipped candidates)
// ============================================================================

export function classifyBlockReasonCategory(
  reason: string
): ShadowSignalRecord['blockCategory'] {
  const upper = String(reason || '').toUpperCase();
  if (upper.includes('CRASH DEFENSE') || upper.includes('MARKET HEALTH')) return 'CRASH_DEFENSE';
  if (upper.includes('VOLUME GAP') || upper.includes('LVN')) return 'VOLUME_GAP';
  if (upper.includes('QUALITY') || upper.includes('SCORE') || upper.includes('ACTIVE MEMORY GUARD'))
    return 'QUALITY_GATE';
  if (upper.includes('SECTOR')) return 'SECTOR_CAP';
  return 'OTHER';
}

export function loadShadowSignals(): ShadowSignalRecord[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(SHADOW_SIGNALS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ShadowSignalRecord[]) : [];
  } catch {
    return [];
  }
}

export function saveShadowSignals(records: ShadowSignalRecord[]): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(SHADOW_SIGNALS_STORAGE_KEY, JSON.stringify(records.slice(0, 150)));
  } catch {
    // Ignore storage quota errors
  }
}

export function appendShadowSignalsPure(
  existing: ShadowSignalRecord[],
  incoming: Array<{
    symbol: string;
    setupType: string;
    assetMode: 'EQUITY' | 'OPTIONS';
    signalPrice: number;
    blockReason: string;
    entryMarketContext: EntryMarketContext | null;
    date?: string;
  }>
): ShadowSignalRecord[] {
  if (!incoming || incoming.length === 0) return existing;
  const nowIso = new Date().toISOString();
  const byDedupKey = new Map<string, ShadowSignalRecord>();
  for (const rec of existing) {
    byDedupKey.set(`${rec.symbol}|${rec.date}|${rec.blockCategory}`, rec);
  }

  for (const item of incoming) {
    if (!item.symbol || !Number.isFinite(item.signalPrice) || item.signalPrice <= 0) continue;
    const sym = item.symbol.trim().toUpperCase();
    const dateStr = (item.date || nowIso).slice(0, 10);
    const cat = classifyBlockReasonCategory(item.blockReason);
    const dedupKey = `${sym}|${dateStr}|${cat}`;
    if (byDedupKey.has(dedupKey)) continue;

    byDedupKey.set(dedupKey, {
      id: `shadow-${sym}-${dateStr}-${cat}`,
      createdAt: nowIso,
      date: dateStr,
      symbol: sym,
      setupType: item.setupType || 'BULLISH TRIPLE',
      assetMode: item.assetMode,
      signalPrice: Number(item.signalPrice.toFixed(2)),
      blockCategory: cat,
      blockReason: item.blockReason,
      entryMarketContext: item.entryMarketContext,
      verdict: 'PENDING',
    });
  }

  return Array.from(byDedupKey.values())
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 150);
}

/**
 * Updates counterfactual outcomes for previously blocked signals using current market prices.
 * Strictly marks >= 1 day elapsed signals as SAVED_LOSS (price dropped >= 1%), MISSED_GAIN (price rose >= 1.5%), or FLAT.
 */
export function evaluateShadowSignalsWithPrices(
  records: ShadowSignalRecord[],
  priceBySymbol: Record<string, number>,
  nowMs: number = Date.now()
): ShadowSignalRecord[] {
  const nowIso = new Date(nowMs).toISOString();
  return records.map((rec) => {
    const curPrice = priceBySymbol[rec.symbol.toUpperCase()];
    if (typeof curPrice !== 'number' || !Number.isFinite(curPrice) || curPrice <= 0 || rec.signalPrice <= 0) {
      return rec;
    }
    const createdMs = new Date(rec.createdAt).getTime();
    const elapsedDays = Number.isFinite(createdMs)
      ? Math.max(0, Math.floor((nowMs - createdMs) / 86_400_000))
      : 0;
    const retPct = Number((((curPrice - rec.signalPrice) / rec.signalPrice) * 100).toFixed(2));
    const isBear = rec.setupType.toUpperCase().includes('BEAR');
    const directionalRet = isBear ? -retPct : retPct;

    let verdict: ShadowSignalRecord['verdict'] = 'PENDING';
    if (elapsedDays >= 1) {
      if (directionalRet <= -1.0) verdict = 'SAVED_LOSS';
      else if (directionalRet >= 1.5) verdict = 'MISSED_GAIN';
      else verdict = 'FLAT';
    }

    return {
      ...rec,
      evaluatedAt: nowIso,
      latestPrice: Number(curPrice.toFixed(2)),
      horizonDays: elapsedDays,
      counterfactualReturnPct: directionalRet,
      verdict,
    };
  });
}
