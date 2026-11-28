import test from 'node:test';
import assert from 'node:assert/strict';
import { createTradingOrchestrator, type TradingCycleLeaseStore } from './tradingOrchestrator.ts';

function createLeaseStore(overrides: Partial<TradingCycleLeaseStore> = {}) {
  const active = new Map<string, number>();
  let nextToken = 0;
  const store: TradingCycleLeaseStore = {
    acquireTradingCycleLease: async ({ ownerId, botId }) => {
      const key = ownerId + ':' + botId;
      if (active.has(key)) return null;
      const token = ++nextToken;
      active.set(key, token);
      return { ownerId, botId, workerId: 'worker-test', fencingToken: token, expiresAt: Date.now() + 60_000 };
    },
    renewTradingCycleLease: async ({ ownerId, botId, fencingToken }) =>
      active.get(ownerId + ':' + botId) === fencingToken,
    isTradingCycleLeaseValid: async ({ ownerId, botId, fencingToken }) =>
      active.get(ownerId + ':' + botId) === fencingToken,
    releaseTradingCycleLease: async ({ ownerId, botId, fencingToken }) => {
      const key = ownerId + ':' + botId;
      if (active.get(key) !== fencingToken) return false;
      active.delete(key);
      return true;
    },
    ...overrides,
  };
  return store;
}

test('orchestrator refuses to run unarmed bots and never acquires a lease', async () => {
  let acquired = 0;
  const leaseStore = createLeaseStore({
    acquireTradingCycleLease: async () => { acquired++; return null; },
  });
  const orchestrator = createTradingOrchestrator({ leaseStore, workerId: 'worker-test' });
  const result = await orchestrator.runCycle({
    ownerId: 'owner-a',
    botId: 'STOCK',
    isArmed: async () => false,
    execute: async () => assert.fail('unarmed cycle must not execute'),
  });
  assert.deepEqual(result, { status: 'skipped', reason: 'NOT_ARMED' });
  assert.equal(acquired, 0);
});

test('orchestrator serializes same owner/bot but keeps STOCK and OPTION independent', async () => {
  const leaseStore = createLeaseStore();
  const orchestrator = createTradingOrchestrator({ leaseStore, workerId: 'worker-test' });
  let release!: () => void;
  const wait = new Promise<void>((resolve) => { release = resolve; });
  const first = orchestrator.runCycle({
    ownerId: 'owner-a', botId: 'STOCK', isArmed: async () => true,
    execute: async () => { await wait; return 'stock-cycle'; },
  });
  await new Promise(resolve => setImmediate(resolve));
  const duplicate = await orchestrator.runCycle({
    ownerId: 'owner-a', botId: 'STOCK', isArmed: async () => true,
    execute: async () => 'duplicate',
  });
  assert.deepEqual(duplicate, { status: 'skipped', reason: 'LEASE_HELD' });
  const options = await orchestrator.runCycle({
    ownerId: 'owner-a', botId: 'OPTION', isArmed: async () => true,
    execute: async () => 'option-cycle',
  });
  assert.equal(options.status, 'completed');
  release();
  const completed = await first;
  assert.equal(completed.status, 'completed');
});

test('orchestrator aborts result when lease renewal is lost', async () => {
  let intervalCallback: (() => void) | null = null;
  const leaseStore = createLeaseStore({
    renewTradingCycleLease: async () => false,
    isTradingCycleLeaseValid: async () => false,
  });
  const orchestrator = createTradingOrchestrator({
    leaseStore,
    workerId: 'worker-test',
    leaseMs: 30_000,
    heartbeatMs: 1_000,
    setIntervalFn: ((callback: () => void) => {
      intervalCallback = callback;
      return 1 as unknown as ReturnType<typeof setInterval>;
    }) as typeof setInterval,
    clearIntervalFn: (() => undefined) as typeof clearInterval,
  });
  const resultPromise = orchestrator.runCycle({
    ownerId: 'owner-a', botId: 'STOCK', isArmed: async () => true,
    execute: async ({ signal }) => {
      intervalCallback?.();
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(signal.aborted, true);
      return 'stale-result';
    },
  });
  const result = await resultPromise;
  assert.deepEqual(result, { status: 'aborted', reason: 'LEASE_LOST' });
});

test('orchestrator always releases the lease after adapter failure', async () => {
  let released = 0;
  const leaseStore = createLeaseStore({
    releaseTradingCycleLease: async () => { released++; return true; },
  });
  const orchestrator = createTradingOrchestrator({ leaseStore, workerId: 'worker-test' });
  await assert.rejects(() => orchestrator.runCycle({
    ownerId: 'owner-a', botId: 'STOCK', isArmed: async () => true,
    execute: async () => { throw new Error('adapter failed'); },
  }), /adapter failed/);
  assert.equal(released, 1);
});

test('strategy adapter can verify the persisted fencing token immediately before an order', async () => {
  let verified = 0;
  const leaseStore = createLeaseStore({
    isTradingCycleLeaseValid: async ({ fencingToken }) => {
      verified++;
      return fencingToken === 1;
    },
  });
  const orchestrator = createTradingOrchestrator({ leaseStore, workerId: 'worker-test' });
  const result = await orchestrator.runCycle({
    ownerId: 'owner-a', botId: 'STOCK', isArmed: async () => true,
    execute: async ({ verifyLease }) => {
      await verifyLease();
      return 'ready-to-submit';
    },
  });
  assert.equal(result.status, 'completed');
  assert.equal(verified, 2, 'adapter pre-submit verification plus final completion verification');
});

test('orchestrator fences a stale worker when persisted lease verification fails', async () => {
  const leaseStore = createLeaseStore({
    isTradingCycleLeaseValid: async () => false,
  });
  const orchestrator = createTradingOrchestrator({ leaseStore, workerId: 'worker-test' });
  const result = await orchestrator.runCycle({
    ownerId: 'owner-a', botId: 'STOCK', isArmed: async () => true,
    execute: async ({ verifyLease }) => {
      await assert.rejects(() => verifyLease(), /lease was lost/);
      return 'must-not-be-accepted';
    },
  });
  assert.deepEqual(result, { status: 'aborted', reason: 'LEASE_LOST' });
});
