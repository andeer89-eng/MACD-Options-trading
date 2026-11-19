export interface BoundedTtlCacheOptions {
  maxEntries: number;
  ttlMs: number;
  nowFn?: () => number;
}

interface CacheRecord<V> {
  value: V;
  storedAt: number;
}

/**
 * Bounded O(1) LRU + TTL in-memory cache.
 * Prevents unbounded heap growth in long-running server processes.
 */
export class BoundedTtlCache<K, V> {
  private readonly store = new Map<K, CacheRecord<V>>();
  private readonly maxEntries: number;
  private readonly ttlMs: number;
  private readonly nowFn: () => number;

  constructor(options: BoundedTtlCacheOptions) {
    this.maxEntries = Math.max(1, Math.floor(options.maxEntries));
    this.ttlMs = Math.max(1, Math.floor(options.ttlMs));
    this.nowFn = options.nowFn ?? Date.now;
  }

  get size(): number {
    return this.store.size;
  }

  get(key: K): V | undefined {
    const rec = this.store.get(key);
    if (!rec) return undefined;

    if (this.nowFn() - rec.storedAt >= this.ttlMs) {
      this.store.delete(key);
      return undefined;
    }

    // Refresh recency order for LRU eviction
    this.store.delete(key);
    this.store.set(key, rec);
    return rec.value;
  }

  has(key: K): boolean {
    return this.get(key) !== undefined;
  }

  set(key: K, value: V): void {
    if (this.store.has(key)) {
      this.store.delete(key);
    } else if (this.store.size >= this.maxEntries) {
      this.pruneExpired();
      while (this.store.size >= this.maxEntries) {
        const oldestKey = this.store.keys().next().value;
        if (oldestKey === undefined) break;
        this.store.delete(oldestKey);
      }
    }

    this.store.set(key, {
      value,
      storedAt: this.nowFn(),
    });
  }

  delete(key: K): boolean {
    return this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  pruneExpired(): number {
    const now = this.nowFn();
    let removed = 0;
    for (const [key, rec] of this.store.entries()) {
      if (now - rec.storedAt >= this.ttlMs) {
        this.store.delete(key);
        removed += 1;
      }
    }
    return removed;
  }
}
