import type {
  AlpacaEquityOrderCandidate,
  AlpacaOrderDTO,
  AlpacaPositionDTO,
} from './alpacaJournalSync';

const WORKING_ORDER_STATUSES = new Set([
  'new',
  'accepted',
  'pending_new',
  'partially_filled',
  'held',
  'accepted_for_bidding',
  'stopped',
  'calculated',
]);

export interface ClosePositionStep {
  symbol: string;
  percentage: number;
  reason: string;
  cancelOrders: boolean;
  isReversal?: boolean;
}

export interface CancelOrderStep {
  orderId: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: string;
  reason: string;
}

export interface SubmitOrderStep {
  candidate: AlpacaEquityOrderCandidate;
  dependsOnClearanceForSymbol: string;
}

export interface DeterministicOrderPlan {
  cancelSteps: CancelOrderStep[];
  closeSteps: ClosePositionStep[];
  submitSteps: SubmitOrderStep[];
}

export interface ReversalCloseRequest {
  symbol: string;
  targetDirection: 'BULLISH' | 'BEARISH';
  reason: string;
}

export function isWorkingAlpacaOrderStatus(status: string): boolean {
  return WORKING_ORDER_STATUSES.has(String(status || '').toLowerCase());
}

export function findWorkingOrdersForSymbol(
  orders: AlpacaOrderDTO[],
  symbol: string
): AlpacaOrderDTO[] {
  const cleanSym = symbol.trim().toUpperCase();
  return (orders || []).filter(
    (o) => o.symbol.toUpperCase() === cleanSym && isWorkingAlpacaOrderStatus(o.status)
  );
}

/**
 * Deterministic 3-Phase Broker Execution Planner:
 * Phase 1: Cancel conflicting or stale working orders on symbols being exited, reversed, or entered
 * Phase 2: Close existing positions (exits / opposite-side reversals) with cancel_orders=true on full exits
 * Phase 3: Submit validated new entries only after Phase 1 & Phase 2 cleared cleanly for that symbol
 */
export function buildDeterministicOrderPlan(params: {
  openOrders: AlpacaOrderDTO[];
  equityPositions: AlpacaPositionDTO[];
  positionsToClose: Array<{ symbol: string; percentage: number; reason: string; isReversal?: boolean }>;
  reversalRequests?: ReversalCloseRequest[];
  ordersToPlace: AlpacaEquityOrderCandidate[];
}): DeterministicOrderPlan {
  const { openOrders, equityPositions, positionsToClose, reversalRequests = [], ordersToPlace } = params;

  const positionBySymbol = new Map<string, AlpacaPositionDTO>();
  for (const pos of equityPositions || []) {
    positionBySymbol.set(pos.symbol.toUpperCase(), pos);
  }

  // Merge explicit closes and opposite-side reversal closes without duplicating symbols
  const closeMap = new Map<string, ClosePositionStep>();
  for (const exitItem of positionsToClose || []) {
    const sym = exitItem.symbol.trim().toUpperCase();
    const pct = Math.max(1, Math.min(100, exitItem.percentage));
    closeMap.set(sym, {
      symbol: sym,
      percentage: pct,
      reason: exitItem.reason,
      cancelOrders: pct >= 100,
      isReversal: exitItem.isReversal,
    });
  }

  for (const rev of reversalRequests) {
    const sym = rev.symbol.trim().toUpperCase();
    const held = positionBySymbol.get(sym);
    if (!held) continue;
    const isOpposite =
      (rev.targetDirection === 'BEARISH' && held.side === 'long') ||
      (rev.targetDirection === 'BULLISH' && held.side === 'short');
    if (isOpposite && !closeMap.has(sym)) {
      closeMap.set(sym, {
        symbol: sym,
        percentage: 100,
        reason: rev.reason,
        cancelOrders: true,
        isReversal: true,
      });
    }
  }

  const closeSteps = Array.from(closeMap.values());
  const closeSymbols = new Set(closeSteps.map((c) => c.symbol));
  const reversalSymbols = new Set(reversalRequests.map((r) => r.symbol.trim().toUpperCase()));

  // Phase 1: Cancel working orders that conflict with exits, reversals, or new entries
  const cancelMap = new Map<string, CancelOrderStep>();
  for (const ord of openOrders || []) {
    if (!isWorkingAlpacaOrderStatus(ord.status)) continue;
    const sym = ord.symbol.trim().toUpperCase();

    if (closeSymbols.has(sym)) {
      cancelMap.set(ord.id, {
        orderId: ord.id,
        symbol: sym,
        side: ord.side,
        type: ord.type,
        reason: `Clear working ${ord.side.toUpperCase()} ${ord.type} order before closing ${sym}`,
      });
      continue;
    }

    if (reversalSymbols.has(sym)) {
      cancelMap.set(ord.id, {
        orderId: ord.id,
        symbol: sym,
        side: ord.side,
        type: ord.type,
        reason: `Cancel stale working order on reversal signal for ${sym}`,
      });
      continue;
    }

    const matchingEntry = (ordersToPlace || []).find((e) => e.symbol.toUpperCase() === sym);
    if (matchingEntry && ord.side !== matchingEntry.side) {
      cancelMap.set(ord.id, {
        orderId: ord.id,
        symbol: sym,
        side: ord.side,
        type: ord.type,
        reason: `Cancel opposite-side working ${ord.side.toUpperCase()} order before ${matchingEntry.side.toUpperCase()} ${sym}`,
      });
    }
  }

  const submitSteps: SubmitOrderStep[] = (ordersToPlace || []).map((candidate) => ({
    candidate,
    dependsOnClearanceForSymbol: candidate.symbol.trim().toUpperCase(),
  }));

  return {
    cancelSteps: Array.from(cancelMap.values()),
    closeSteps,
    submitSteps,
  };
}

export interface PipelineExecutionAdapters {
  cancelOrder: (orderId: string) => Promise<{ ok: boolean; error?: string }>;
  closePosition: (
    symbol: string,
    opts?: { qty?: number; percentage?: number; cancelOrders?: boolean }
  ) => Promise<{ ok: boolean; error?: string }>;
  submitOrder: (payload: {
    symbol: string;
    side: 'buy' | 'sell';
    qty: number;
    type: 'market' | 'limit';
    time_in_force: 'day';
    client_order_id?: string;
  }) => Promise<{ ok: boolean; error?: string }>;
}

export interface DeterministicPipelineExecutionResult {
  cancelledCount: number;
  closedCount: number;
  submittedCount: number;
  haltedSymbols: string[];
  submittedSymbols: string[];
  closedSymbols: string[];
  logs: string[];
  errors: string[];
}

export async function executeDeterministicOrderPlan(
  plan: DeterministicOrderPlan,
  adapters: PipelineExecutionAdapters
): Promise<DeterministicPipelineExecutionResult> {
  let cancelledCount = 0;
  let closedCount = 0;
  let submittedCount = 0;
  const failedSymbols = new Set<string>();
  const haltedSymbols: string[] = [];
  const submittedSymbols: string[] = [];
  const closedSymbols: string[] = [];
  const logs: string[] = [];
  const errors: string[] = [];

  // Phase 1: Explicitly cancel conflicting / working orders first
  for (const step of plan.cancelSteps) {
    const res = await adapters.cancelOrder(step.orderId);
    if (res.ok) {
      cancelledCount++;
      logs.push(`#1 Cancelled ${step.symbol} order (${step.side.toUpperCase()} ${step.type})`);
    } else {
      const errMsg = res.error || 'Cancel failed';
      // 404/already-filled means the order is no longer working, so do not block safe exit;
      // any genuine broker error halts downstream dependent steps for that symbol.
      const isAlreadyGone = /404|not found|already filled|canceled/i.test(errMsg);
      if (isAlreadyGone) {
        logs.push(`#1 Order ${step.orderId} (${step.symbol}) already inactive`);
      } else {
        failedSymbols.add(step.symbol);
        if (!haltedSymbols.includes(step.symbol)) haltedSymbols.push(step.symbol);
        errors.push(`#1 Cancel failed ${step.symbol}: ${errMsg}`);
      }
    }
  }

  // Phase 2: Close positions (with cancelOrders=true on full exit)
  for (const step of plan.closeSteps) {
    if (failedSymbols.has(step.symbol)) {
      errors.push(`#2 Halted close for ${step.symbol}: Phase 1 order cancel failed`);
      continue;
    }

    const res = await adapters.closePosition(step.symbol, {
      percentage: step.percentage,
      cancelOrders: step.cancelOrders,
    });
    if (res.ok) {
      closedCount++;
      closedSymbols.push(step.symbol);
      logs.push(`#2 Closed ${step.symbol} (${step.reason})`);
    } else {
      failedSymbols.add(step.symbol);
      if (!haltedSymbols.includes(step.symbol)) haltedSymbols.push(step.symbol);
      errors.push(`#2 Close failed ${step.symbol}: ${res.error || 'Rejected'}`);
    }
  }

  // Phase 3: Submit new orders only for cleared symbols
  for (const step of plan.submitSteps) {
    const sym = step.dependsOnClearanceForSymbol;
    if (failedSymbols.has(sym)) {
      if (!haltedSymbols.includes(sym)) haltedSymbols.push(sym);
      errors.push(`#3 Halted ${step.candidate.side.toUpperCase()} ${sym}: prior cancel/close did not clear`);
      continue;
    }

    const c = step.candidate;
    const res = await adapters.submitOrder({
      symbol: c.symbol,
      side: c.side,
      qty: c.qty,
      type: c.type,
      time_in_force: c.time_in_force,
      client_order_id: c.client_order_id,
    });
    if (res.ok) {
      submittedCount++;
      submittedSymbols.push(c.symbol);
      logs.push(`#3 Submitted ${c.side.toUpperCase()} ${c.qty} ${c.symbol}`);
    } else {
      errors.push(`#3 Entry rejected ${c.symbol}: ${res.error || 'Rejected'}`);
    }
  }

  return {
    cancelledCount,
    closedCount,
    submittedCount,
    haltedSymbols,
    submittedSymbols,
    closedSymbols,
    logs,
    errors,
  };
}

/**
 * Helper for Options Auto-Bot: cancels any working open orders for an OCC option contract
 * before executing a Buy-to-Close or submitting a new Sell-to-Open order.
 */
export async function cancelWorkingOrdersForContract(params: {
  symbol: string;
  openOrders: AlpacaOrderDTO[];
  cancelOrder: (orderId: string) => Promise<{ ok: boolean; error?: string }>;
}): Promise<{ ok: boolean; cancelledCount: number; errors: string[] }> {
  const working = findWorkingOrdersForSymbol(params.openOrders, params.symbol);
  let cancelledCount = 0;
  const errors: string[] = [];

  for (const ord of working) {
    const res = await params.cancelOrder(ord.id);
    if (res.ok) {
      cancelledCount++;
    } else {
      const msg = res.error || 'Cancel failed';
      if (!/404|not found|already filled|canceled/i.test(msg)) {
        errors.push(`Cancel ${ord.symbol} (${ord.id}) failed: ${msg}`);
      }
    }
  }

  return { ok: errors.length === 0, cancelledCount, errors };
}
