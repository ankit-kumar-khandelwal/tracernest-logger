import { freemem, totalmem } from 'os';
import { LogEntry, LogLevel, LogQueryOptions, LogQueryResult, TraceNestStats, LogVaultStats } from '../types';
import { SafeRegex } from '../security/safe-regex';
import { SqlStore } from '../security/sql-store';

export class RingBuffer {
  private buffer: Array<LogEntry | null>;
  private capacity: number;
  private head: number = 0;
  private tail: number = 0;
  private count: number = 0;
  private totalPurgedCount: number = 0;
  private sqlStore?: SqlStore;
  private persistLogs: boolean;

  // Level counters for fast metric calculation
  private levelCounts: Record<LogLevel, number> = {
    debug: 0,
    info: 0,
    warn: 0,
    error: 0
  };

  // Sliding window timestamps for logs-per-second calculation (last 60s)
  private recentTimestamps: number[] = [];
  private startTime: number = Date.now();

  constructor(capacity = 5000, sqlStore?: SqlStore, persistLogs = true) {
    if (typeof capacity !== 'number' || isNaN(capacity) || capacity <= 0) {
      throw new Error('Capacity must be greater than 0');
    }

    RingBuffer.checkMemoryThreshold(capacity);

    this.capacity = capacity;
    this.buffer = new Array(capacity).fill(null);
    this.sqlStore = sqlStore;
    this.persistLogs = persistLogs;
  }

  public setSqlStore(sqlStore: SqlStore, persistLogs = true): void {
    this.sqlStore = sqlStore;
    this.persistLogs = persistLogs;
  }

  /**
   * Bulk-loads previously persisted historical logs into the ring buffer without re-persisting them.
   */
  public loadPersistedLogs(entries: LogEntry[]): void {
    for (const entry of entries) {
      this.push(entry, false);
    }
  }

  /**
   * Verifies configured buffer size against available system memory and recommended thresholds.
   * Emits a prominent warning if the in-memory buffer risks high memory consumption or Out-Of-Memory (OOM).
   */
  public static checkMemoryThreshold(capacity: number): void {
    try {
      const freeBytes = freemem();
      const totalBytes = totalmem();
      // Assume ~3KB average per enriched log entry (metadata + headers + bodies)
      const estimatedBytes = capacity * 3072;
      const estimatedMb = Math.round(estimatedBytes / (1024 * 1024));
      const freeMb = Math.round(freeBytes / (1024 * 1024));
      const totalMb = Math.round(totalBytes / (1024 * 1024));

      const isHighAbsolute = capacity > 50000;
      const isHighRelativeFree = freeBytes > 0 && estimatedBytes > freeBytes * 0.25;
      const isHighRelativeTotal = totalBytes > 0 && estimatedBytes > totalBytes * 0.15;

      if (isHighAbsolute || isHighRelativeFree || isHighRelativeTotal) {
        console.warn(
          `[TracerNest-Logger WARNING] Configured bufferSize (${capacity.toLocaleString()} entries) is unusually high. ` +
          `Estimated in-memory log footprint is ~${estimatedMb} MB (Available free RAM: ${freeMb} MB, Total system RAM: ${totalMb} MB). ` +
          `High buffer sizes may cause excessive memory consumption, GC pressure, or process crashes due to Node.js Out-Of-Memory (OOM). ` +
          `Recommended bufferSize is between 2,000 and 20,000 entries. For historical log analysis, rely on SQLite/MySQL database storage or TTL retention policies.`
        );
      }
    } catch {
      // Non-blocking in sandboxed environments
    }
  }

  /**
   * Appends a log entry in O(1) time
   */
  public push(entry: LogEntry, persist = true): void {
    if (this.count === this.capacity) {
      // Buffer is full; overwrite the oldest entry at tail
      const oldEntry = this.buffer[this.tail];
      if (oldEntry && this.levelCounts[oldEntry.level] > 0) {
        this.levelCounts[oldEntry.level]--;
      }
      this.tail = (this.tail + 1) % this.capacity;
    } else {
      this.count++;
    }

    this.buffer[this.head] = entry;
    this.head = (this.head + 1) % this.capacity;

    if (this.levelCounts[entry.level] !== undefined) {
      this.levelCounts[entry.level]++;
    }

    // Keep recent timestamps for throughput computation
    const now = entry.timestamp || Date.now();
    this.recentTimestamps.push(now);
    const cutoff = now - 60000;
    while (this.recentTimestamps.length > 0 && this.recentTimestamps[0] < cutoff) {
      this.recentTimestamps.shift();
    }

    // Persist to SQLite / MySQL database if enabled
    if (persist && this.persistLogs && this.sqlStore) {
      try {
        this.sqlStore.saveLog(entry);
      } catch {}
    }
  }

  /**
   * Returns all current entries ordered chronologically (oldest to newest),
   * filtering out any expired entries based on TTL
   */
  public toArray(now = Date.now()): LogEntry[] {
    if (this.sqlStore && this.persistLogs) {
      try {
        const dbLogs = this.sqlStore.getAllActiveLogs(now);
        if (dbLogs.length > 0) return dbLogs;
      } catch {}
    }

    const result: LogEntry[] = [];
    if (this.count === 0) return result;

    let index = this.tail;
    for (let i = 0; i < this.count; i++) {
      const item = this.buffer[index];
      if (item !== null) {
        // Skip expired items
        if (!item.expiresAt || item.expiresAt > now) {
          result.push(item);
        }
      }
      index = (index + 1) % this.capacity;
    }
    return result;
  }

  /**
   * Queries logs with filtering, search, and pagination (excluding expired TTL logs)
   */
  public query(options: LogQueryOptions = {}, now = Date.now()): LogQueryResult {
    if (this.sqlStore && this.persistLogs) {
      try {
        return this.sqlStore.queryLogs(options, now);
      } catch {
        // Fallback to in-memory if database query fails
      }
    }

    const {
      search,
      isRegex,
      level,
      from,
      to,
      source,
      limit = 100,
      offset = 0,
      order = 'desc',
      sortBy = 'timestamp'
    } = options;

    let regex: RegExp | null = null;
    let searchLower = search && !isRegex ? search.toLowerCase() : null;

    if (search && isRegex) {
      regex = SafeRegex.safeCompile(search, 'i');
      if (!regex) {
        // SEC-04: Gracefully fall back to literal search if regex is unsafe or malformed
        searchLower = search.toLowerCase();
      }
    }

    const matched: LogEntry[] = [];
    const entries = this.toArray(now);

    const counts = {
      all: entries.length,
      error: 0,
      warn: 0,
      info: 0,
      debug: 0,
      http: 0
    };
    for (const e of entries) {
      if (e.source === 'http' || e.metadata?.http) {
        counts.http++;
      }
      if (counts[e.level] !== undefined) {
        counts[e.level]++;
      }
    }

    // Iterate backwards (newest to oldest)
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];

      // Level filter
      if (level && level !== 'all' && entry.level !== level) {
        continue;
      }

      // Time range filter
      if (from && entry.timestamp < from) {
        continue;
      }
      if (to && entry.timestamp > to) {
        continue;
      }

      // Source filter
      if (source && entry.source !== source) {
        continue;
      }

      // Search query (message, url, client IP, or json metadata)
      if (regex) {
        const matchesMsg = SafeRegex.test(regex, entry.message);
        const matchesUrl = entry.metadata?.http?.url ? SafeRegex.test(regex, entry.metadata.http.url) : false;
        const matchesIp = entry.metadata?.http?.clientIp ? SafeRegex.test(regex, entry.metadata.http.clientIp) : false;
        const matchesMeta = entry.metadata ? SafeRegex.test(regex, JSON.stringify(entry.metadata)) : false;
        if (!matchesMsg && !matchesUrl && !matchesIp && !matchesMeta) {
          continue;
        }
      } else if (searchLower) {
        const matchesMsg = entry.message.toLowerCase().includes(searchLower);
        const matchesUrl = entry.metadata?.http?.url ? entry.metadata.http.url.toLowerCase().includes(searchLower) : false;
        const matchesIp = entry.metadata?.http?.clientIp ? entry.metadata.http.clientIp.toLowerCase().includes(searchLower) : false;
        const matchesMeta = entry.metadata ? JSON.stringify(entry.metadata).toLowerCase().includes(searchLower) : false;
        if (!matchesMsg && !matchesUrl && !matchesIp && !matchesMeta) {
          continue;
        }
      }

      matched.push(entry);
    }

    if (sortBy === 'level') {
      const levelRank: Record<LogLevel, number> = { error: 4, warn: 3, info: 2, debug: 1 };
      matched.sort((a, b) => {
        const diff = (levelRank[b.level] || 0) - (levelRank[a.level] || 0);
        return order === 'asc' ? -diff : diff;
      });
    } else if (order === 'asc') {
      matched.reverse();
    }

    const total = matched.length;
    const paginated = matched.slice(offset, offset + limit);

    return {
      logs: paginated,
      total,
      offset,
      limit,
      counts
    };
  }

  /**
   * Purges all expired logs from the buffer based on their expiresAt timestamp
   */
  public purgeExpired(now = Date.now()): number {
    const validEntries: LogEntry[] = [];
    let purged = 0;

    let index = this.tail;
    for (let i = 0; i < this.count; i++) {
      const item = this.buffer[index];
      if (item !== null) {
        if (item.expiresAt && item.expiresAt <= now) {
          purged++;
        } else {
          validEntries.push(item);
        }
      }
      index = (index + 1) % this.capacity;
    }

    if (purged === 0) return 0;

    // Rebuild buffer with valid entries
    this.buffer = new Array(this.capacity).fill(null);
    this.head = 0;
    this.tail = 0;
    this.count = 0;
    this.levelCounts = { debug: 0, info: 0, warn: 0, error: 0 };

    for (const item of validEntries) {
      this.push(item, false);
    }

    if (this.persistLogs && this.sqlStore) {
      try {
        this.sqlStore.purgeExpiredLogs(now);
      } catch {}
    }

    this.totalPurgedCount += purged;
    return purged;
  }

  /**
   * Calculates real-time system and buffer statistics
   */
  public getStats(): TraceNestStats {
    const now = Date.now();
    const cutoff = now - 60000;
    while (this.recentTimestamps.length > 0 && this.recentTimestamps[0] < cutoff) {
      this.recentTimestamps.shift();
    }
    const logsPerSecond = Number((this.recentTimestamps.length / 60).toFixed(2));

    const mem = process.memoryUsage();
    const memoryUsageMb = Number((mem.heapUsed / (1024 * 1024)).toFixed(2));
    const uptimeSeconds = Math.floor((now - this.startTime) / 1000);

    let totalLogs = this.count;
    let errorCount = this.levelCounts.error;
    let warnCount = this.levelCounts.warn;
    let infoCount = this.levelCounts.info;
    let debugCount = this.levelCounts.debug;

    if (this.sqlStore && this.persistLogs) {
      try {
        const counts = this.sqlStore.getLogCounts(now);
        totalLogs = counts.all;
        errorCount = counts.error;
        warnCount = counts.warn;
        infoCount = counts.info;
        debugCount = counts.debug;
      } catch {}
    }

    return {
      totalLogs,
      errorCount,
      warnCount,
      infoCount,
      debugCount,
      logsPerSecond,
      bufferUsagePercent: Math.min(100, Math.round((totalLogs / this.capacity) * 100)),
      memoryUsageMb,
      uptimeSeconds,
      expiredLogsPurged: this.totalPurgedCount
    };
  }

  /**
   * Clears the buffer completely
   */
  public clear(): number {
    const previousCount = this.count;
    this.buffer = new Array(this.capacity).fill(null);
    this.head = 0;
    this.tail = 0;
    this.count = 0;
    this.levelCounts = { debug: 0, info: 0, warn: 0, error: 0 };
    this.recentTimestamps = [];
    if (this.persistLogs && this.sqlStore) {
      try {
        this.sqlStore.clearLogs();
      } catch {}
    }
    return previousCount;
  }

  public size(): number {
    if (this.sqlStore && this.persistLogs) {
      try {
        return this.sqlStore.getLogsCount();
      } catch {}
    }
    return this.count;
  }

  public getCapacity(): number {
    return this.capacity;
  }
}
