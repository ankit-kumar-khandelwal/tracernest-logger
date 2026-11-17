import { randomBytes } from 'node:crypto';
import { LogEntry, TTLConfig, TTLRule } from '../types';
import { RingBuffer } from './ring-buffer';
import { SqlStore } from '../security/sql-store';
import { SafeRegex } from '../security/safe-regex';

export class TTLManager {
  private rules: Map<string, TTLRule> = new Map();
  private defaultTtlSeconds?: number;
  private sweepTimer: NodeJS.Timeout | null = null;
  private ringBuffer?: RingBuffer;
  private sqlStore?: SqlStore;
  private totalPurgedCount: number = 0;

  constructor(options?: {
    config?: TTLConfig;
    ringBuffer?: RingBuffer;
    sqlStore?: SqlStore;
  }) {
    this.ringBuffer = options?.ringBuffer;
    this.sqlStore = options?.sqlStore;
    this.defaultTtlSeconds = options?.config?.defaultTtlSeconds;

    // Load initial rules from config
    if (options?.config?.rules && options.config.rules.length > 0) {
      for (const r of options.config.rules) {
        this.addRule(r);
      }
    }

    // Default sensible TTL presets if none configured:
    // e.g. debug: 1 hour (3600), info: 24 hours (86400), warn: 7 days, error: 30 days
    if (this.rules.size === 0 && !this.defaultTtlSeconds) {
      this.addRule({
        name: 'Auto-purge Debug Logs',
        level: 'debug',
        source: 'all',
        ttlSeconds: 3600 // 1 hour
      });
      this.addRule({
        name: 'Auto-purge HTTP 2xx Info Logs',
        level: 'info',
        source: 'http',
        ttlSeconds: 86400 // 24 hours
      });
    }

    // Start automated background sweep
    const intervalMs = options?.config?.sweepIntervalMs ?? 30000;
    this.sweepTimer = setInterval(() => {
      this.sweep();
    }, intervalMs);

    if (this.sweepTimer.unref) {
      this.sweepTimer.unref();
    }
  }

  public setRingBuffer(ringBuffer: RingBuffer): void {
    this.ringBuffer = ringBuffer;
  }

  /**
   * Applies the first matching TTL rule to a new log entry and sets expiresAt
   */
  public applyTTL(entry: LogEntry): void {
    const rulesList = Array.from(this.rules.values());

    for (const rule of rulesList) {
      if (this.matchesRule(rule, entry)) {
        entry.expiresAt = entry.timestamp + (rule.ttlSeconds * 1000);
        return;
      }
    }

    // Fallback to default TTL if set
    if (this.defaultTtlSeconds && this.defaultTtlSeconds > 0) {
      entry.expiresAt = entry.timestamp + (this.defaultTtlSeconds * 1000);
    }
  }

  private matchesRule(rule: TTLRule, entry: LogEntry): boolean {
    // 1. Level check
    if (rule.level && rule.level !== 'all' && rule.level !== entry.level) {
      return false;
    }

    // 2. Source check
    if (rule.source && rule.source !== 'all' && rule.source !== entry.source) {
      return false;
    }

    // 3. Pattern check (URL or message) (SEC-04: Uses SafeRegex pre-compiled pattern)
    if (rule.pattern && rule.pattern.trim().length > 0) {
      const p = rule.pattern.trim();
      let matched = false;

      if (rule.compiledRegex) {
        matched = SafeRegex.test(rule.compiledRegex, entry.message);
        if (!matched && entry.metadata?.http?.url) {
          matched = SafeRegex.test(rule.compiledRegex, entry.metadata.http.url);
        }
      } else {
        matched = entry.message.toLowerCase().includes(p.toLowerCase());
        if (!matched && entry.metadata?.http?.url) {
          matched = entry.metadata.http.url.toLowerCase().includes(p.toLowerCase());
        }
      }

      if (!matched) return false;
    }

    return true;
  }

  public addRule(rule: Omit<TTLRule, 'id'> & { id?: string }): TTLRule {
    const id = rule.id || `ttl_${Date.now()}_${randomBytes(3).toString('hex')}`;
    let compiledRegex: RegExp | undefined = undefined;

    if (rule.pattern && rule.pattern.trim().length > 0) {
      const trimmedPattern = rule.pattern.trim();
      if (!SafeRegex.isSafe(trimmedPattern)) {
        throw new Error('Unsafe TTL pattern: potentially catastrophic backtracking construct or pattern exceeds 128 characters');
      }
      compiledRegex = SafeRegex.safeCompile(trimmedPattern, 'i') || undefined;
    }

    const fullRule: TTLRule = {
      id,
      name: rule.name || `TTL Rule (${rule.level || 'all'} - ${rule.ttlSeconds}s)`,
      level: rule.level || 'all',
      source: rule.source || 'all',
      pattern: rule.pattern,
      compiledRegex,
      ttlSeconds: rule.ttlSeconds,
      createdAt: Date.now()
    };

    this.rules.set(id, fullRule);
    return fullRule;
  }

  public deleteRule(id: string): boolean {
    return this.rules.delete(id);
  }

  public listRules(): TTLRule[] {
    return Array.from(this.rules.values());
  }

  public getDefaultTtl(): number | undefined {
    return this.defaultTtlSeconds;
  }

  public setDefaultTtl(seconds?: number): void {
    this.defaultTtlSeconds = seconds;
  }

  /**
   * Executes a purge sweep of all expired logs in the ring buffer
   */
  public sweep(): number {
    if (!this.ringBuffer) return 0;

    const purged = this.ringBuffer.purgeExpired(Date.now());
    this.totalPurgedCount += purged;
    return purged;
  }

  public getTotalPurged(): number {
    return this.totalPurgedCount;
  }

  public destroy(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }
}

