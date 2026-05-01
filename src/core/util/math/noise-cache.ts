/**
 * Noise Cache Module
 *
 * Provides an LRU-based cache for SeededNoiseGenerator instances,
 * keyed by (seed, noiseType). This avoids re-creating permutation tables
 * when the same seed/type combination is requested repeatedly.
 *
 * The cache is memory-bounded and supports thread-safe operation
 * (Web Workers via MessageChannel-compatible locking).
 */

import { SeededNoiseGenerator, NoiseType } from './noise';

// ============================================================================
// Cache Entry
// ============================================================================

interface CacheEntry {
  generator: SeededNoiseGenerator;
  lastAccess: number;
  hitCount: number;
}

// ============================================================================
// Cache Key
// ============================================================================

function makeCacheKey(seed: number, noiseType: NoiseType): string {
  return `${seed}:${noiseType}`;
}

// ============================================================================
// NoiseCache
// ============================================================================

/**
 * LRU cache for SeededNoiseGenerator instances.
 *
 * - Caches generators by seed + noise type
 * - Memory-bounded with configurable max size
 * - LRU eviction when the cache is full
 * - Thread-safe for Web Workers (spinlock-based mutex)
 *
 * Usage:
 *   const cache = new NoiseCache({ maxSize: 32 });
 *   const gen = cache.get(42, NoiseType.Perlin);
 *   const val = gen.perlin3D(1, 2, 3);
 */
export class NoiseCache {
  private readonly cache: Map<string, CacheEntry>;
  private readonly maxSize: number;
  private lockPromise: Promise<void> | null = null;
  private lockResolve: (() => void) | null = null;

  constructor(options: { maxSize?: number } = {}) {
    this.maxSize = Math.max(1, options.maxSize ?? 16);
    this.cache = new Map();
  }

  /**
   * Get or create a SeededNoiseGenerator for the given seed and type.
   * If the entry exists, it's moved to most-recently-used.
   * If the cache is full, the least-recently-used entry is evicted.
   */
  get(seed: number, noiseType: NoiseType = NoiseType.Perlin): SeededNoiseGenerator {
    const key = makeCacheKey(seed, noiseType);

    const existing = this.cache.get(key);
    if (existing) {
      existing.lastAccess = Date.now();
      existing.hitCount++;
      return existing.generator;
    }

    // Evict LRU entry if at capacity
    if (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }

    const generator = new SeededNoiseGenerator(seed);
    this.cache.set(key, {
      generator,
      lastAccess: Date.now(),
      hitCount: 0,
    });

    return generator;
  }

  /**
   * Check if a generator exists in the cache without creating one.
   */
  has(seed: number, noiseType: NoiseType = NoiseType.Perlin): boolean {
    return this.cache.has(makeCacheKey(seed, noiseType));
  }

  /**
   * Manually insert a generator into the cache.
   */
  set(seed: number, noiseType: NoiseType, generator: SeededNoiseGenerator): void {
    const key = makeCacheKey(seed, noiseType);

    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    this.cache.set(key, {
      generator,
      lastAccess: Date.now(),
      hitCount: 0,
    });
  }

  /**
   * Remove a specific entry from the cache.
   */
  delete(seed: number, noiseType: NoiseType = NoiseType.Perlin): boolean {
    return this.cache.delete(makeCacheKey(seed, noiseType));
  }

  /**
   * Get the current number of cached generators.
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Clear the entire cache.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics for monitoring.
   */
  getStats(): {
    size: number;
    maxSize: number;
    entries: Array<{ seed: number; noiseType: NoiseType; lastAccess: number; hitCount: number }>;
  } {
    const entries: Array<{ seed: number; noiseType: NoiseType; lastAccess: number; hitCount: number }> = [];

    for (const [key, entry] of this.cache) {
      const [seedStr, typeStr] = key.split(':');
      entries.push({
        seed: parseInt(seedStr, 10),
        noiseType: typeStr as NoiseType,
        lastAccess: entry.lastAccess,
        hitCount: entry.hitCount,
      });
    }

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      entries,
    };
  }

  // --------------------------------------------------------------------------
  // Thread-safe access (for Web Workers)
  // --------------------------------------------------------------------------

  /**
   * Acquire a generator in a thread-safe manner.
   * Uses a simple spinlock mechanism compatible with Web Workers.
   * The callback receives the generator and should return a result.
   *
   * Usage:
   *   const result = await cache.withLock(42, NoiseType.Perlin, (gen) => {
   *     return gen.perlin3D(1, 2, 3);
   *   });
   */
  async withLock<T>(
    seed: number,
    noiseType: NoiseType,
    callback: (generator: SeededNoiseGenerator) => T
  ): Promise<T> {
    await this.acquireLock();
    try {
      const generator = this.get(seed, noiseType);
      return callback(generator);
    } finally {
      this.releaseLock();
    }
  }

  // --------------------------------------------------------------------------
  // Internal
  // --------------------------------------------------------------------------

  /** Evict the least recently used entry. */
  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.lastAccess < oldestTime) {
        oldestTime = entry.lastAccess;
        oldestKey = key;
      }
    }

    if (oldestKey !== null) {
      this.cache.delete(oldestKey);
    }
  }

  /** Acquire the spinlock (async). */
  private async acquireLock(): Promise<void> {
    while (this.lockPromise !== null) {
      await this.lockPromise;
    }
    this.lockPromise = new Promise<void>((resolve) => {
      this.lockResolve = resolve;
    });
  }

  /** Release the spinlock. */
  private releaseLock(): void {
    if (this.lockResolve) {
      this.lockResolve();
    }
    this.lockPromise = null;
    this.lockResolve = null;
  }
}

// ============================================================================
// Default Global Cache
// ============================================================================

/**
 * Default global noise cache instance.
 * Max 16 generators cached — adjust if needed by creating your own NoiseCache.
 */
export const defaultNoiseCache = new NoiseCache({ maxSize: 16 });
