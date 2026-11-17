import { randomBytes } from 'node:crypto';
import { AuditLogEntry } from '../types';
import { SqlStore } from '../security/sql-store';

export class AuditLogger {
  private sqlStore?: SqlStore;
  private inMemoryCache: AuditLogEntry[] = [];
  private maxCache: number;

  constructor(maxCache = 1000, sqlStore?: SqlStore) {
    this.maxCache = maxCache;
    this.sqlStore = sqlStore;
  }

  public setSqlStore(store: SqlStore): void {
    this.sqlStore = store;
  }

  public log(event: {
    action: string;
    userId?: string;
    username?: string;
    ip?: string;
    details?: Record<string, unknown>;
  }): AuditLogEntry {
    const entry: AuditLogEntry = {
      id: `audit_${Date.now()}_${randomBytes(4).toString('hex')}`,
      timestamp: Date.now(),
      action: event.action,
      userId: event.userId,
      username: event.username,
      ip: event.ip,
      details: event.details
    };

    this.inMemoryCache.push(entry);
    if (this.inMemoryCache.length > this.maxCache) {
      this.inMemoryCache.shift();
    }

    if (this.sqlStore) {
      try {
        this.sqlStore.saveAuditLog(entry);
      } catch {
        // Fallback to in-memory
      }
    }

    return entry;
  }

  public query(options?: {
    limit?: number;
    offset?: number;
    action?: string;
    username?: string;
  }): { entries: AuditLogEntry[]; total: number } {
    if (this.sqlStore) {
      try {
        return this.sqlStore.getAuditLogs(options);
      } catch {
        // Fallback to in-memory cache if SQL store is closed or unavailable
      }
    }

    let filtered = this.inMemoryCache;
    if (options?.action) {
      const act = options.action.toLowerCase();
      filtered = filtered.filter(e => e.action.toLowerCase().includes(act));
    }
    if (options?.username) {
      const u = options.username.toLowerCase();
      filtered = filtered.filter(e => e.username && e.username.toLowerCase().includes(u));
    }

    const total = filtered.length;
    const reversed = [...filtered].reverse();
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? 50;

    return { entries: reversed.slice(offset, offset + limit), total };
  }
}
