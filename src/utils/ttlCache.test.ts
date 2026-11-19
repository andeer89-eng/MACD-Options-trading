import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BoundedTtlCache } from './ttlCache.ts';

describe('BoundedTtlCache', () => {
  it('stores and retrieves unexpired values and updates LRU recency', () => {
    let now = 1000;
    const cache = new BoundedTtlCache<string, number>({
      maxEntries: 2,
      ttlMs: 5000,
      nowFn: () => now,
    });

    cache.set('A', 1);
    cache.set('B', 2);
    assert.strictEqual(cache.size, 2);

    // Access A so B becomes least-recently-used
    assert.strictEqual(cache.get('A'), 1);

    cache.set('C', 3);
    assert.strictEqual(cache.size, 2);
    assert.strictEqual(cache.get('A'), 1);
    assert.strictEqual(cache.get('B'), undefined);
    assert.strictEqual(cache.get('C'), 3);
  });

  it('evicts expired entries on access and tracks clean size on pruneExpired()', () => {
    let now = 10_000;
    const cache = new BoundedTtlCache<string, string>({
      maxEntries: 5,
      ttlMs: 1000,
      nowFn: () => now,
    });

    cache.set('k1', 'v1');
    now += 600;
    cache.set('k2', 'v2');

    assert.strictEqual(cache.get('k1'), 'v1');
    now += 500; // k1 age = 1100ms (expired), k2 age = 500ms (valid)

    assert.strictEqual(cache.get('k1'), undefined);
    assert.strictEqual(cache.get('k2'), 'v2');

    now += 600; // k2 age = 1100ms (expired)
    const pruned = cache.pruneExpired();
    assert.strictEqual(pruned, 1);
    assert.strictEqual(cache.size, 0);
  });
});
