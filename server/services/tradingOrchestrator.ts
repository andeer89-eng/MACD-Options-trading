import { randomUUID } from 'node:crypto';

export type TradingBotId = 'STOCK' | 'OPTION';

export interface TradingCycleLease {
  ownerId: string;
  botId: TradingBotId;
  workerId: string;
  fencingToken: number;
  expiresAt: number;
}

export interface TradingCycleLeaseStore {
  acquireTradingCycleLease(input: {
    ownerId: string;
    botId: TradingBotId;
    workerId: string;
    leaseMs: number;
  }): Promise<TradingCycleLease | null>;
  renewTradingCycleLease(input: {
    ownerId: string;
    botId: TradingBotId;
    workerId: string;
    fencingToken: number;
    leaseMs: number;
  }): Promise<boolean>;
  isTradingCycleLeaseValid(input: {
    ownerId: string;
    botId: TradingBotId;
    workerId: string;
    fencingToken: number;
  }): Promise<boolean>;
  releaseTradingCycleLease(input: {
    ownerId: string;
    botId: TradingBotId;
    workerId: string;
    fencingToken: number;
  }): Promise<boolean>;
}

export type TradingCycleResult<T> =
  | { status: 'completed'; fencingToken: number; value: T }
  | { status: 'skipped'; reason: 'NOT_ARMED' | 'LEASE_HELD' }
  | { status: 'aborted'; reason: 'LEASE_LOST' };

/**
 * Executes one owner-scoped bot cycle under a Firestore-backed lease.
 * This module deliberately does not schedule cycles or submit broker orders:
 * callers must provide a server-side strategy adapter and an explicit armed
 * predicate. A lost lease aborts the adapter and prevents a successful result.
 */
export function createTradingOrchestrator(options: {
  leaseStore: TradingCycleLeaseStore;
  workerId?: string;
  leaseMs?: number;
  heartbeatMs?: number;
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
}) {
  const workerId = options.workerId || `trading-worker-${randomUUID()}`;
  const leaseMs = options.leaseMs ?? 60_000;
  const heartbeatMs = options.heartbeatMs ?? Math.floor(leaseMs / 3);
  const setIntervalFn = options.setIntervalFn ?? setInterval;
  const clearIntervalFn = options.clearIntervalFn ?? clearInterval;

  if (!Number.isFinite(leaseMs) || leaseMs < 10_000 || leaseMs > 300_000 ||
      !Number.isFinite(heartbeatMs) || heartbeatMs < 1_000 || heartbeatMs >= leaseMs) {
    throw new Error('Invalid trading orchestrator lease/heartbeat configuration.');
  }

  async function runCycle<T>(input: {
    ownerId: string;
    botId: TradingBotId;
    isArmed: () => Promise<boolean>;
    execute: (context: {
      signal: AbortSignal;
      fencingToken: number;
      assertLease: () => void;
      verifyLease: () => Promise<void>;
    }) => Promise<T>;
  }): Promise<TradingCycleResult<T>> {
    if (!await input.isArmed()) return { status: 'skipped', reason: 'NOT_ARMED' };
    const lease = await options.leaseStore.acquireTradingCycleLease({
      ownerId: input.ownerId,
      botId: input.botId,
      workerId,
      leaseMs,
    });
    if (!lease) return { status: 'skipped', reason: 'LEASE_HELD' };

    const controller = new AbortController();
    let leaseLost = false;
    let heartbeatInFlight = false;
    const assertLease = () => {
      if (leaseLost || controller.signal.aborted) throw new Error('Trading cycle lease was lost; stale worker is fenced.');
    };
    const verifyLease = async () => {
      assertLease();
      const valid = await options.leaseStore.isTradingCycleLeaseValid({
        ownerId: input.ownerId,
        botId: input.botId,
        workerId,
        fencingToken: lease.fencingToken,
      });
      if (!valid) {
        leaseLost = true;
        controller.abort(new Error('Trading cycle lease was lost.'));
        assertLease();
      }
    };
    const heartbeat = setIntervalFn(() => {
      if (heartbeatInFlight || leaseLost) return;
      heartbeatInFlight = true;
      void options.leaseStore.renewTradingCycleLease({
        ownerId: input.ownerId,
        botId: input.botId,
        workerId,
        fencingToken: lease.fencingToken,
        leaseMs,
      }).then((renewed) => {
        if (!renewed) {
          leaseLost = true;
          controller.abort(new Error('Trading cycle lease was lost.'));
        }
      }).catch(() => {
        leaseLost = true;
        controller.abort(new Error('Trading cycle lease renewal failed.'));
      }).finally(() => {
        heartbeatInFlight = false;
      });
    }, heartbeatMs);

    try {
      const value = await input.execute({
        signal: controller.signal,
        fencingToken: lease.fencingToken,
        assertLease,
        verifyLease,
      });
      if (leaseLost) return { status: 'aborted', reason: 'LEASE_LOST' };
      await verifyLease();
      assertLease();
      return { status: 'completed', fencingToken: lease.fencingToken, value };
    } catch (error) {
      if (leaseLost) return { status: 'aborted', reason: 'LEASE_LOST' };
      throw error;
    } finally {
      clearIntervalFn(heartbeat);
      controller.abort();
      await options.leaseStore.releaseTradingCycleLease({
        ownerId: input.ownerId,
        botId: input.botId,
        workerId,
        fencingToken: lease.fencingToken,
      }).catch(() => false);
    }
  }

  return { workerId, runCycle };
}
