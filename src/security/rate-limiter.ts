export interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export interface RateLimiterOptions {
  windowMs?: number;
  maxAttempts?: number;
  maxEntries?: number;
}

/**
 * High-performance, memory-bounded in-memory Rate Limiter
 *
 * SEC-10 Remediation:
 * - Bounds maximum capacity (`maxEntries`) to prevent map memory exhaustion attacks.
 * - Evicts expired and oldest entries when full.
 * - Enforces key length truncation.
 */
export class RateLimiter {
  private windowMs: number;
  private maxAttempts: number;
  private maxEntries: number;
  private store: Map<string, RateLimitEntry> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(options?: RateLimiterOptions) {
    this.windowMs = options?.windowMs ?? 15 * 60 * 1000; // 15 mins
    this.maxAttempts = options?.maxAttempts ?? 5; // 5 attempts per window
    this.maxEntries = options?.maxEntries ?? 10000; // Cap map size to bound memory retention

    // Run cleanup every 5 minutes to prevent memory leaks
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
    if (this.cleanupInterval && typeof this.cleanupInterval.unref === 'function') {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Check if a key is rate limited. Increments counter on attempt.
   */
  public consume(key: string): { allowed: boolean; remaining: number; retryAfterSec: number } {
    const normalizedKey = typeof key === 'string' ? key.slice(0, 128) : String(key);
    const now = Date.now();
    const entry = this.store.get(normalizedKey);

    if (!entry || now > entry.resetAt) {
      // Ensure capacity is strictly bounded before inserting new keys
      if (this.store.size >= this.maxEntries) {
        this.cleanup();
        // If still at capacity after purging expired keys, evict oldest 10%
        if (this.store.size >= this.maxEntries) {
          const evictCount = Math.max(1, Math.floor(this.maxEntries * 0.1));
          let count = 0;
          for (const k of this.store.keys()) {
            this.store.delete(k);
            count++;
            if (count >= evictCount) break;
          }
        }
      }

      // First attempt in this window
      this.store.set(normalizedKey, { count: 1, resetAt: now + this.windowMs });
      return { allowed: true, remaining: this.maxAttempts - 1, retryAfterSec: 0 };
    }

    if (entry.count >= this.maxAttempts) {
      const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000);
      return { allowed: false, remaining: 0, retryAfterSec };
    }

    entry.count += 1;
    return {
      allowed: true,
      remaining: this.maxAttempts - entry.count,
      retryAfterSec: 0
    };
  }

  /**
   * Reset rate limit for a successful login
   */
  public reset(key: string): void {
    const normalizedKey = typeof key === 'string' ? key.slice(0, 128) : String(key);
    this.store.delete(normalizedKey);
  }

  public get size(): number {
    return this.store.size;
  }

  public cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.resetAt) {
        this.store.delete(key);
      }
    }
  }

  public destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.store.clear();
  }
}
