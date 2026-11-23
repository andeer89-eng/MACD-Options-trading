export type BotCandidateSource = 'CHART' | 'SCANNER' | 'WATCHLIST';

export type BotCandidateStatus = 'QUEUED' | 'EXECUTED' | 'BLOCKED';

export interface BotQueuedCandidate {
  id: string;
  symbol: string;
  direction: 'BULLISH' | 'BEARISH';
  source: BotCandidateSource;
  setupType: string;
  qualityScore: number;
  currentPrice: number;
  atr?: number;
  sector?: string;
  hrN?: number;
  addedAt: string;
  status: BotCandidateStatus;
  lastNote?: string;
}

export interface EnqueueBotCandidateInput {
  symbol: string;
  direction: 'BULLISH' | 'BEARISH';
  source: BotCandidateSource;
  setupType?: string;
  qualityScore?: number;
  currentPrice: number;
  atr?: number;
  sector?: string;
  hrN?: number;
  addedAt?: string;
}

export const BOT_CANDIDATE_QUEUE_KEY = 'stageledger_bot_candidate_queue_v1';
export const BOT_QUEUE_EVENT = 'stageledger:bot-queue-updated';
const MAX_BOT_QUEUE_ITEMS = 25;

export function isAlpacaEquityEligibleSymbol(symbol: string): boolean {
  const sym = symbol.trim().toUpperCase();
  if (!sym) return false;
  if (sym.includes('=F') || sym.includes('-USD') || sym.includes('=X') || sym.startsWith('^')) {
    return false;
  }
  return /^[A-Z]{1,6}([.-][A-Z])?$/.test(sym);
}

export function upsertBotCandidate(
  queue: BotQueuedCandidate[],
  input: EnqueueBotCandidateInput
): { ok: true; queue: BotQueuedCandidate[]; item: BotQueuedCandidate } | { ok: false; queue: BotQueuedCandidate[]; error: string } {
  const sym = input.symbol.trim().toUpperCase();
  if (!isAlpacaEquityEligibleSymbol(sym)) {
    return {
      ok: false,
      queue,
      error: `Symbol "${sym || input.symbol}" is not eligible for US Equity Alpaca Paper execution.`,
    };
  }
  if (!Number.isFinite(input.currentPrice) || input.currentPrice <= 0) {
    return {
      ok: false,
      queue,
      error: `Cannot queue ${sym}: live price must be positive.`,
    };
  }

  const nowIso = input.addedAt || new Date().toISOString();
  const score = Number.isFinite(input.qualityScore)
    ? Math.max(0, Math.min(100, Math.round(Number(input.qualityScore))))
    : 75;

  const newItem: BotQueuedCandidate = {
    id: `cand_${sym}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    symbol: sym,
    direction: input.direction,
    source: input.source,
    setupType: input.setupType?.trim() || `${input.direction}_SETUP`,
    qualityScore: score,
    currentPrice: Number(input.currentPrice.toFixed(4)),
    ...(input.atr && Number.isFinite(input.atr) && input.atr > 0
      ? { atr: Number(input.atr.toFixed(4)) }
      : {}),
    ...(input.sector ? { sector: input.sector } : {}),
    ...(typeof input.hrN === 'number' && Number.isFinite(input.hrN) ? { hrN: input.hrN } : {}),
    addedAt: nowIso,
    status: 'QUEUED',
  };

  // Replace any older item for the same symbol so queue stays clean and latest direction wins
  const filtered = queue.filter((q) => q.symbol.toUpperCase() !== sym);
  const next = [newItem, ...filtered].slice(0, MAX_BOT_QUEUE_ITEMS);
  return { ok: true, queue: next, item: newItem };
}

export function removeBotCandidate(queue: BotQueuedCandidate[], idOrSymbol: string): BotQueuedCandidate[] {
  const target = idOrSymbol.trim().toUpperCase();
  return queue.filter((q) => q.id !== idOrSymbol && q.symbol.toUpperCase() !== target);
}

export function markBotCandidateOutcome(
  queue: BotQueuedCandidate[],
  symbol: string,
  status: BotCandidateStatus,
  lastNote?: string
): BotQueuedCandidate[] {
  const cleanSym = symbol.trim().toUpperCase();
  return queue.map((q) =>
    q.symbol.toUpperCase() === cleanSym
      ? {
          ...q,
          status,
          ...(lastNote !== undefined ? { lastNote } : {}),
        }
      : q
  );
}

export function mergeQueuedCandidatesWithMarketItems<
  T extends {
    symbol: string;
    sector?: string;
    currentPrice: number;
    atr?: number;
    setups?: any[];
    dataQuality?: string;
    fetchedAtMs?: number;
    stale?: boolean;
  }
>(queue: BotQueuedCandidate[], marketItems: T[]): Array<T & { queuedCandidate?: BotQueuedCandidate }> {
  const activeQueued = queue.filter((q) => q.status === 'QUEUED' && isAlpacaEquityEligibleSymbol(q.symbol));
  if (activeQueued.length === 0) return marketItems;

  const marketBySymbol = new Map<string, T>();
  for (const item of marketItems) {
    marketBySymbol.set(item.symbol.toUpperCase(), item);
  }

  const prioritized: Array<T & { queuedCandidate?: BotQueuedCandidate }> = [];
  const consumedSymbols = new Set<string>();

  for (const cand of activeQueued) {
    const sym = cand.symbol.toUpperCase();
    consumedSymbols.add(sym);
    const liveItem = marketBySymbol.get(sym);

    const syntheticSetup = {
      type: cand.setupType || `${cand.direction}_CHART_CANDIDATE`,
      qualityScore: cand.qualityScore,
      source: cand.source,
    };

    if (liveItem) {
      const existingSetups = Array.isArray(liveItem.setups) ? liveItem.setups : [];
      // If user explicitly queued a setup from Chart/Scanner, place that queued setup first
      // while preserving fresher live price/ATR/dataQuality from marketItems
      const mergedSetups =
        cand.source === 'CHART' || existingSetups.length === 0
          ? [syntheticSetup, ...existingSetups]
          : existingSetups;

      prioritized.push({
        ...liveItem,
        sector: liveItem.sector || cand.sector,
        atr: liveItem.atr || cand.atr,
        setups: mergedSetups,
        queuedCandidate: cand,
      });
    } else {
      prioritized.push({
        symbol: sym,
        sector: cand.sector,
        currentPrice: cand.currentPrice,
        atr: cand.atr,
        dataQuality: 'live',
        fetchedAtMs: Date.now(),
        setups: [syntheticSetup],
        queuedCandidate: cand,
      } as unknown as T & { queuedCandidate?: BotQueuedCandidate });
    }
  }

  for (const item of marketItems) {
    if (!consumedSymbols.has(item.symbol.toUpperCase())) {
      prioritized.push(item);
    }
  }

  return prioritized;
}

function emitQueueUpdated(queue: BotQueuedCandidate[]): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(BOT_QUEUE_EVENT, { detail: { count: queue.length } }));
  }
}

export function loadBotCandidateQueue(): BotQueuedCandidate[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(BOT_CANDIDATE_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveBotCandidateQueue(queue: BotQueuedCandidate[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(BOT_CANDIDATE_QUEUE_KEY, JSON.stringify(queue));
    emitQueueUpdated(queue);
  } catch {
    // ignore storage errors
  }
}

export function enqueueBotCandidate(input: EnqueueBotCandidateInput) {
  const current = loadBotCandidateQueue();
  const res = upsertBotCandidate(current, input);
  if (res.ok) {
    saveBotCandidateQueue(res.queue);
  }
  return res;
}

export function removeQueuedBotCandidate(idOrSymbol: string): BotQueuedCandidate[] {
  const next = removeBotCandidate(loadBotCandidateQueue(), idOrSymbol);
  saveBotCandidateQueue(next);
  return next;
}

export function clearBotCandidateQueue(): void {
  saveBotCandidateQueue([]);
}
