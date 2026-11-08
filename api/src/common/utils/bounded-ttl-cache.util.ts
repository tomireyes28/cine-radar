interface TtlEntry<V> {
  value: V;
  expiresAt: number;
}

/**
 * Memory-bounded LRU cache with per-entry TTL expiration.
 * Refreshes key recency on `get()` so hot entries stay resident while oldest entries are evicted.
 */
export class BoundedTtlCache<K, V> {
  private readonly store = new Map<K, TtlEntry<V>>();

  constructor(private readonly maxEntries: number) {
    if (!Number.isInteger(maxEntries) || maxEntries < 1) {
      throw new Error('BoundedTtlCache maxEntries must be a positive integer');
    }
  }

  get size(): number {
    return this.store.size;
  }

  has(key: K, now: number = Date.now()): boolean {
    const entry = this.store.get(key);
    if (!entry) return false;
    if (now >= entry.expiresAt) {
      this.store.delete(key);
      return false;
    }
    return true;
  }

  get(key: K, now: number = Date.now()): { hit: true; value: V } | { hit: false } {
    const entry = this.store.get(key);
    if (!entry) {
      return { hit: false };
    }
    if (now >= entry.expiresAt) {
      this.store.delete(key);
      return { hit: false };
    }
    // Refresh LRU order
    this.store.delete(key);
    this.store.set(key, entry);
    return { hit: true, value: entry.value };
  }

  set(key: K, value: V, ttlMs: number, now: number = Date.now()): void {
    if (ttlMs <= 0) {
      this.store.delete(key);
      return;
    }

    if (this.store.has(key)) {
      this.store.delete(key);
    } else if (this.store.size >= this.maxEntries) {
      const oldestKey = this.store.keys().next();
      if (!oldestKey.done) {
        this.store.delete(oldestKey.value);
      }
    }

    this.store.set(key, {
      value,
      expiresAt: now + ttlMs,
    });
  }

  delete(key: K): boolean {
    return this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}
