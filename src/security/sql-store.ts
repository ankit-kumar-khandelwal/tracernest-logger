import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import type { DatabaseSync, StatementSync } from 'node:sqlite';

// Suppress Node.js ExperimentalWarning for built-in SQLite engine
if (typeof process !== 'undefined' && typeof process.emitWarning === 'function') {
  const origEmitWarning = process.emitWarning;
  if (!(origEmitWarning as any).__tracernest_sqlite_suppressed) {
    const patchedEmitWarning = function (warning: string | Error, ...args: any[]) {
      const msg = typeof warning === 'string' ? warning : warning?.message;
      if (typeof msg === 'string' && msg.includes('SQLite is an experimental feature')) {
        return;
      }
      return (origEmitWarning as any).call(process, warning, ...args);
    };
    (patchedEmitWarning as any).__tracernest_sqlite_suppressed = true;
    process.emitWarning = patchedEmitWarning as any;
  }
}

// Safely load native DatabaseSync constructor with warning suppressed
const NativeDatabaseSync = require('node:sqlite').DatabaseSync as typeof DatabaseSync;
import { AuditLogEntry, DatabaseDialect, ExcludedRouteRule, MySqlConfig, Role, User, UserProfile } from '../types';
import { FastCrypto, EncryptedPayload } from './fast-crypto';
import { CryptoSecurity } from './crypto';

export interface StoredAlertConfig {
  id: string;
  channel: 'email' | 'teams';
  enabled: boolean;
  levelThreshold: 'error' | 'warn' | 'all';
  encryptedPayload: EncryptedPayload;
  createdAt: number;
  updatedAt: number;
}

export interface SqlStoreOptions {
  dataDir?: string;
  sqlFilePath?: string;
  sqliteFilePath?: string;
  keyFilePath?: string;
  masterKey?: string;
  dialect?: DatabaseDialect;
  mysql?: MySqlConfig;
  tablePrefix?: string;
}

export class SqlStore {
  private db: DatabaseSync;
  private sqlFilePath: string;
  private sqliteFilePath: string;
  private keyFilePath: string;
  private masterKey: string;
  public readonly dialect: DatabaseDialect;
  public readonly mysqlConfig?: MySqlConfig;
  public readonly tablePrefix: string;
  public readonly tableUsers: string;
  public readonly tableAlerts: string;
  public readonly tableAudit: string;
  public readonly tableMeta: string;

  constructor(options?: SqlStoreOptions) {
    const dataDir = options?.dataDir || (existsSync('./.tracernest') ? './.tracernest' : (existsSync('./tracernest') ? './tracernest' : './.tracernest'));

    this.sqliteFilePath =
      options?.sqliteFilePath ||
      (existsSync(`${dataDir}/tracernest-logger.sqlite`)
        ? `${dataDir}/tracernest-logger.sqlite`
        : existsSync('./tracernest/tracernest-logger.sqlite')
        ? './tracernest/tracernest-logger.sqlite'
        : existsSync('./tracernest-logger.sqlite')
        ? './tracernest-logger.sqlite'
        : existsSync('./tracenest.sqlite')
        ? './tracenest.sqlite'
        : existsSync('./logvault.sqlite')
        ? './logvault.sqlite'
        : `${dataDir}/tracernest-logger.sqlite`);

    this.sqlFilePath =
      options?.sqlFilePath ||
      (existsSync(`${dataDir}/tracernest-logger.sql`)
        ? `${dataDir}/tracernest-logger.sql`
        : existsSync('./tracernest/tracernest-logger.sql')
        ? './tracernest/tracernest-logger.sql'
        : existsSync('./tracernest-logger.sql')
        ? './tracernest-logger.sql'
        : existsSync('./tracenest.sql')
        ? './tracenest.sql'
        : existsSync('./logvault.sql')
        ? './logvault.sql'
        : `${dataDir}/tracernest-logger.sql`);

    this.keyFilePath =
      options?.keyFilePath ||
      (existsSync(`${dataDir}/.master.key`)
        ? `${dataDir}/.master.key`
        : existsSync(`${dataDir}/tracernest.key`)
        ? `${dataDir}/tracernest.key`
        : `${dataDir}/.master.key`);

    this.dialect = options?.dialect || 'sqlite';
    this.mysqlConfig = options?.mysql;

    let p = options?.tablePrefix || 'tracenest_';
    if (!p.endsWith('_')) p += '_';
    this.tablePrefix = p;
    this.tableUsers = `${this.tablePrefix}users`;
    this.tableAlerts = `${this.tablePrefix}alert_configs`;
    this.tableAudit = `${this.tablePrefix}audit_logs`;
    this.tableMeta = `${this.tablePrefix}system_meta`;

    // Ensure parent directories exist
    const sqliteDir = dirname(this.sqliteFilePath);
    if (sqliteDir && sqliteDir !== '.' && !existsSync(sqliteDir)) {
      try {
        mkdirSync(sqliteDir, { recursive: true });
      } catch (err: any) {
        console.error(`[TracerNest-Logger] ERROR: Cannot create data directory '${sqliteDir}':`, err?.message || err);
        console.error('[TracerNest-Logger] TIP: In Docker, ensure the directory has write permissions (e.g. `chown -R node:node /app/.tracernest`) or set `dataDir: "/tmp/.tracernest"`.');
      }
    }
    const sqlDir = dirname(this.sqlFilePath);
    if (sqlDir && sqlDir !== '.' && !existsSync(sqlDir)) {
      try {
        mkdirSync(sqlDir, { recursive: true });
      } catch (err: any) {
        console.error(`[TracerNest-Logger] ERROR: Cannot create SQL export directory '${sqlDir}':`, err?.message || err);
      }
    }

    // Initialize Native SQLite (used directly or as ultra-fast local tier)
    try {
      this.db = new NativeDatabaseSync(this.sqliteFilePath);
      this.initTables();
    } catch (err: any) {
      console.error(`[TracerNest-Logger] ERROR: Failed to initialize SQLite storage at '${this.sqliteFilePath}':`, err?.message || err);
      console.error('[TracerNest-Logger] TIP: In Docker containers, ensure the directory is writable by the process user (e.g. `chown -R node:node /app/.tracernest`) or set `dataDir: "/tmp/.tracernest"`.');
      throw err;
    }

    // If sqlFilePath exists on disk and sqlite is empty, restore data from sql file
    if (existsSync(this.sqlFilePath) && this.getUserCount() === 0) {
      try {
        const sqlContent = readFileSync(this.sqlFilePath, 'utf8');
        if (sqlContent && sqlContent.trim().length > 0) {
          this.db.exec(sqlContent);
        }
      } catch {
        // Ignore
      }
    }

    // Ensure or retrieve persistent master key for AES-256-GCM encryption
    this.masterKey = this.resolveMasterKey(options?.masterKey);

    // If MySQL is configured, initialize remote tables asynchronously
    if (this.dialect === 'mysql') {
      this.initMySql();
    }

    // Only sync if sql file doesn't exist or database has data
    if (!existsSync(this.sqlFilePath) || this.getUserCount() > 0) {
      this.syncSqlFile();
    }
  }

  private initTables(): void {
    // 0. Enable WAL journal mode & busy timeout for concurrent read/write resilience in containers & clusters
    try {
      this.db.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA busy_timeout = 5000;
        PRAGMA synchronous = NORMAL;
      `);
    } catch {}

    // 1. Initialize tables with configured tablePrefix (default: logg_vault_)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ${this.tableMeta} (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS ${this.tableUsers} (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        role TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        last_login_at INTEGER,
        must_change_password INTEGER DEFAULT 0,
        token_version INTEGER DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS ${this.tableAlerts} (
        id TEXT PRIMARY KEY,
        channel TEXT UNIQUE NOT NULL,
        enabled INTEGER NOT NULL,
        level_threshold TEXT NOT NULL,
        ciphertext TEXT NOT NULL,
        iv TEXT NOT NULL,
        auth_tag TEXT NOT NULL,
        salt TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS ${this.tableAudit} (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        user_id TEXT,
        username TEXT,
        action TEXT NOT NULL,
        ip TEXT,
        details TEXT
      );
    `);

    // Ensure must_change_password and token_version columns exist if upgrading existing database
    try {
      this.db.exec(`ALTER TABLE ${this.tableUsers} ADD COLUMN must_change_password INTEGER DEFAULT 0`);
    } catch {}
    try {
      this.db.exec(`ALTER TABLE ${this.tableUsers} ADD COLUMN token_version INTEGER DEFAULT 1`);
    } catch {}

    // 2. Seamless Migration: If legacy unprefixed tables exist in SQLite, copy records into logg_vault_ tables
    try {
      if (this.tableUsers !== 'users') {
        const oldUsers = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();
        if (oldUsers) {
          this.db.exec(`INSERT OR IGNORE INTO ${this.tableUsers} SELECT * FROM users`);
        }
      }
      if (this.tableAlerts !== 'alert_configs') {
        const oldAlerts = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='alert_configs'").get();
        if (oldAlerts) {
          this.db.exec(`INSERT OR IGNORE INTO ${this.tableAlerts} SELECT * FROM alert_configs`);
        }
      }
      if (this.tableMeta !== 'system_meta') {
        const oldMeta = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='system_meta'").get();
        if (oldMeta) {
          this.db.exec(`INSERT OR IGNORE INTO ${this.tableMeta} SELECT * FROM system_meta`);
        }
      }
    } catch {
      // Ignore migration errors if legacy tables don't exist
    }
  }

  private async initMySql(): Promise<void> {
    const client = this.mysqlConfig?.pool || this.mysqlConfig?.client;
    if (!client || typeof client.query !== 'function') return;

    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${this.tableMeta} (
          \`key\` VARCHAR(191) PRIMARY KEY,
          \`value\` TEXT NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS ${this.tableMeta} (
          \`key\` VARCHAR(128) PRIMARY KEY,
          \`value\` MEDIUMTEXT NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS ${this.tableUsers} (
          id VARCHAR(64) PRIMARY KEY,
          username VARCHAR(191) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          salt VARCHAR(64) NOT NULL,
          role VARCHAR(32) NOT NULL,
          created_at BIGINT NOT NULL,
          last_login_at BIGINT NULL,
          must_change_password TINYINT(1) NOT NULL DEFAULT 0,
          token_version INT NOT NULL DEFAULT 1
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      try {
        await client.query(`ALTER TABLE ${this.tableUsers} ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 0`);
      } catch {}
      try {
        await client.query(`ALTER TABLE ${this.tableUsers} ADD COLUMN token_version INT NOT NULL DEFAULT 1`);
      } catch {}

      await client.query(`
        CREATE TABLE IF NOT EXISTS ${this.tableAlerts} (
          id VARCHAR(64) PRIMARY KEY,
          channel VARCHAR(32) UNIQUE NOT NULL,
          enabled TINYINT(1) NOT NULL,
          level_threshold VARCHAR(32) NOT NULL,
          ciphertext TEXT NOT NULL,
          iv VARCHAR(64) NOT NULL,
          auth_tag VARCHAR(64) NOT NULL,
          salt VARCHAR(64) NOT NULL,
          created_at BIGINT NOT NULL,
          updated_at BIGINT NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS ${this.tableAudit} (
          id VARCHAR(64) PRIMARY KEY,
          timestamp BIGINT NOT NULL,
          user_id VARCHAR(64) NULL,
          username VARCHAR(191) NULL,
          action VARCHAR(64) NOT NULL,
          ip VARCHAR(64) NULL,
          details TEXT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
    } catch (err: any) {
      console.warn('[LogVault] Notice: MySQL table initialization:', err?.message || err);
    }
  }

  private async executeMySqlQuery(sql: string, params: any[] = []): Promise<any> {
    if (this.dialect !== 'mysql') return;
    const client = this.mysqlConfig?.pool || this.mysqlConfig?.client;
    if (client && typeof client.query === 'function') {
      try {
        return await client.query(sql, params);
      } catch (err: any) {
        console.warn('[LogVault] MySQL query warning:', err?.message || err);
      }
    }
  }

  /**
   * Resolves the persistent AES-256-GCM encryption key.
   * SEC-08 Hardening: The master key is strictly managed OUTSIDE the database table,
   * preferring user configuration (options.masterKey / config.secret), environment variables
   * (TRACERNEST_SECRET), or an independent .master.key file with restricted file permissions (0600).
   * It is never stored in system_meta or dumped into .sql artifacts.
   */
  private resolveMasterKey(providedKey?: string): string {
    // 1. User-supplied key via config (options.masterKey / config.secret) or environment variable
    const envKey = process.env.TRACERNEST_SECRET || process.env.TRACERNEST_KEY || process.env.LOGVAULT_SECRET;
    const explicitKey = (providedKey || envKey || '').trim();

    if (explicitKey.length >= 16) {
      this.purgeLegacyDbMasterKey();
      return explicitKey;
    }
    if (explicitKey.length > 0) {
      this.purgeLegacyDbMasterKey();
      return createHash('sha256').update(explicitKey).digest('hex');
    }

    // 2. Check independent external key file on disk (outside the SQLite / MySQL database)
    try {
      if (existsSync(this.keyFilePath)) {
        const fileKey = readFileSync(this.keyFilePath, 'utf8').trim();
        if (fileKey && fileKey.length >= 16) {
          this.purgeLegacyDbMasterKey();
          return fileKey;
        }
      }
    } catch {}

    // 3. Backward-compatible migration: check if an existing installation had master_key stored in system_meta
    let existingMetaKey: string | undefined;
    try {
      const row = this.db.prepare(`SELECT value FROM ${this.tableMeta} WHERE key = ?`).get('master_key') as { value?: string } | undefined;
      if (row && row.value && row.value.trim().length >= 16) {
        existingMetaKey = row.value.trim();
      }
    } catch {}

    const resolvedKey = existingMetaKey || CryptoSecurity.generateSecret(32);

    // Save key to independent external key file outside the database with mode 0600
    try {
      const keyDir = dirname(this.keyFilePath);
      if (keyDir && keyDir !== '.' && !existsSync(keyDir)) {
        mkdirSync(keyDir, { recursive: true });
      }
      writeFileSync(this.keyFilePath, resolvedKey, { encoding: 'utf8', mode: 0o600 });
    } catch (err: any) {
      console.warn('[TracerNest-Logger] Notice: Could not write independent .master.key file:', err?.message || err);
    }

    // Purge master_key from SQLite and MySQL tables to close SEC-08 vulnerability
    this.purgeLegacyDbMasterKey();

    return resolvedKey;
  }

  private purgeLegacyDbMasterKey(): void {
    try {
      this.db.prepare(`DELETE FROM ${this.tableMeta} WHERE key = ?`).run('master_key');
      this.executeMySqlQuery(`DELETE FROM ${this.tableMeta} WHERE \`key\` = ?`, ['master_key']);
    } catch {}
  }

  public getMasterKey(): string {
    return this.masterKey;
  }

  // --- Users CRUD ---

  public getUserCount(): number {
    const row = this.db.prepare(`SELECT COUNT(*) as count FROM ${this.tableUsers}`).get() as { count: number };
    return row.count;
  }

  public createUser(user: User): UserProfile {
    const mustChange = user.mustChangePassword ? 1 : 0;
    const tokenVersion = user.tokenVersion || 1;
    this.db.prepare(`
      INSERT INTO ${this.tableUsers} (id, username, password_hash, salt, role, created_at, last_login_at, must_change_password, token_version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      user.id,
      user.username.toLowerCase(),
      user.passwordHash,
      user.salt,
      user.role.toLowerCase(),
      user.createdAt,
      user.lastLoginAt ?? null,
      mustChange,
      tokenVersion
    );

    this.executeMySqlQuery(`
      REPLACE INTO ${this.tableUsers} (id, username, password_hash, salt, role, created_at, last_login_at, must_change_password, token_version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [user.id, user.username.toLowerCase(), user.passwordHash, user.salt, user.role.toLowerCase(), user.createdAt, user.lastLoginAt ?? null, mustChange, tokenVersion]);

    this.syncSqlFile();

    return {
      id: user.id,
      username: user.username,
      role: user.role,
      permissions: [],
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
      mustChangePassword: Boolean(mustChange),
      tokenVersion
    };
  }

  public getUserByUsername(username: string): User | null {
    const row = this.db.prepare(`SELECT * FROM ${this.tableUsers} WHERE username = ?`).get(username.toLowerCase()) as any;
    if (!row) return null;
    return {
      id: row.id,
      username: row.username,
      passwordHash: row.password_hash,
      salt: row.salt,
      role: row.role,
      createdAt: Number(row.created_at),
      lastLoginAt: row.last_login_at ? Number(row.last_login_at) : undefined,
      mustChangePassword: Boolean(row.must_change_password),
      tokenVersion: row.token_version != null ? Number(row.token_version) : 1
    };
  }

  public getUserById(id: string): User | null {
    const row = this.db.prepare(`SELECT * FROM ${this.tableUsers} WHERE id = ?`).get(id) as any;
    if (!row) return null;
    return {
      id: row.id,
      username: row.username,
      passwordHash: row.password_hash,
      salt: row.salt,
      role: row.role,
      createdAt: Number(row.created_at),
      lastLoginAt: row.last_login_at ? Number(row.last_login_at) : undefined,
      mustChangePassword: Boolean(row.must_change_password),
      tokenVersion: row.token_version != null ? Number(row.token_version) : 1
    };
  }

  public listUsers(): UserProfile[] {
    const rows = this.db.prepare(`SELECT id, username, role, created_at, last_login_at, must_change_password, token_version FROM ${this.tableUsers} ORDER BY created_at ASC`).all() as any[];
    return rows.map(r => ({
      id: r.id,
      username: r.username,
      role: r.role,
      permissions: [],
      createdAt: Number(r.created_at),
      lastLoginAt: r.last_login_at ? Number(r.last_login_at) : undefined,
      mustChangePassword: Boolean(r.must_change_password),
      tokenVersion: r.token_version != null ? Number(r.token_version) : 1
    }));
  }

  public deleteUser(id: string): boolean {
    const res = this.db.prepare(`DELETE FROM ${this.tableUsers} WHERE id = ?`).run(id);
    const deleted = (res as any).changes > 0;
    if (deleted) {
      this.executeMySqlQuery(`DELETE FROM ${this.tableUsers} WHERE id = ?`, [id]);
      this.syncSqlFile();
    }
    return deleted;
  }

  public clearAllUsers(): void {
    this.db.exec(`DELETE FROM ${this.tableUsers}`);
    this.executeMySqlQuery(`DELETE FROM ${this.tableUsers}`);
    this.syncSqlFile();
  }

  public updateUserPassword(id: string, passwordHash: string, salt: string, mustChangePassword = false): boolean {
    const flag = mustChangePassword ? 1 : 0;
    const res = this.db.prepare(`UPDATE ${this.tableUsers} SET password_hash = ?, salt = ?, must_change_password = ?, token_version = COALESCE(token_version, 1) + 1 WHERE id = ?`).run(passwordHash, salt, flag, id);
    const updated = (res as any).changes > 0;
    if (updated) {
      this.executeMySqlQuery(`UPDATE ${this.tableUsers} SET password_hash = ?, salt = ?, must_change_password = ?, token_version = COALESCE(token_version, 1) + 1 WHERE id = ?`, [passwordHash, salt, flag, id]);
      this.syncSqlFile();
    }
    return updated;
  }

  public updateUserRole(id: string, role: Role): boolean {
    const res = this.db.prepare(`UPDATE ${this.tableUsers} SET role = ?, token_version = COALESCE(token_version, 1) + 1 WHERE id = ?`).run(role.toLowerCase(), id);
    const updated = (res as any).changes > 0;
    if (updated) {
      this.executeMySqlQuery(`UPDATE ${this.tableUsers} SET role = ?, token_version = COALESCE(token_version, 1) + 1 WHERE id = ?`, [role.toLowerCase(), id]);
      this.syncSqlFile();
    }
    return updated;
  }

  public revokeUserSessions(id: string): boolean {
    const res = this.db.prepare(`UPDATE ${this.tableUsers} SET token_version = COALESCE(token_version, 1) + 1 WHERE id = ?`).run(id);
    const updated = (res as any).changes > 0;
    if (updated) {
      this.executeMySqlQuery(`UPDATE ${this.tableUsers} SET token_version = COALESCE(token_version, 1) + 1 WHERE id = ?`, [id]);
      this.syncSqlFile();
    }
    return updated;
  }

  public updateLastLogin(id: string, timestamp: number): void {
    this.db.prepare(`UPDATE ${this.tableUsers} SET last_login_at = ? WHERE id = ?`).run(timestamp, id);
    this.executeMySqlQuery(`UPDATE ${this.tableUsers} SET last_login_at = ? WHERE id = ?`, [timestamp, id]);
  }

  // --- Alert Configurations (Encrypted with AES-256-GCM) ---

  public saveAlertConfig(
    channel: 'email' | 'teams',
    enabled: boolean,
    levelThreshold: 'error' | 'warn' | 'all',
    plainSettings: Record<string, any>
  ): void {
    const encrypted = FastCrypto.encrypt(JSON.stringify(plainSettings), this.masterKey);
    const id = `alert_${channel}`;
    const now = Date.now();

    this.db.prepare(`
      INSERT OR REPLACE INTO ${this.tableAlerts} (id, channel, enabled, level_threshold, ciphertext, iv, auth_tag, salt, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM ${this.tableAlerts} WHERE channel = ?), ?), ?)
    `).run(
      id,
      channel,
      enabled ? 1 : 0,
      levelThreshold,
      encrypted.ciphertext,
      encrypted.iv,
      encrypted.authTag,
      encrypted.salt,
      channel,
      now,
      now
    );

    this.executeMySqlQuery(`
      REPLACE INTO ${this.tableAlerts} (id, channel, enabled, level_threshold, ciphertext, iv, auth_tag, salt, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, channel, enabled ? 1 : 0, levelThreshold, encrypted.ciphertext, encrypted.iv, encrypted.authTag, encrypted.salt, now, now]);

    this.syncSqlFile();
  }

  public getAlertConfig(channel: 'email' | 'teams'): {
    channel: 'email' | 'teams';
    enabled: boolean;
    levelThreshold: 'error' | 'warn' | 'all';
    settings: Record<string, any>;
    createdAt: number;
    updatedAt: number;
  } | null {
    const row = this.db.prepare(`SELECT * FROM ${this.tableAlerts} WHERE channel = ?`).get(channel) as any;
    if (!row) return null;

    try {
      const payload: EncryptedPayload = {
        ciphertext: row.ciphertext,
        iv: row.iv,
        authTag: row.auth_tag,
        salt: row.salt
      };
      const decryptedJson = FastCrypto.decrypt(payload, this.masterKey);
      const settings = JSON.parse(decryptedJson);

      return {
        channel: row.channel,
        enabled: Boolean(row.enabled),
        levelThreshold: row.level_threshold,
        settings,
        createdAt: Number(row.created_at),
        updatedAt: Number(row.updated_at)
      };
    } catch {
      return null;
    }
  }

  public listAlertConfigs(): Array<{
    channel: 'email' | 'teams';
    enabled: boolean;
    levelThreshold: 'error' | 'warn' | 'all';
    maskedSettings: Record<string, any>;
    updatedAt: number;
  }> {
    const rows = this.db.prepare(`SELECT channel, enabled, level_threshold, ciphertext, iv, auth_tag, salt, updated_at FROM ${this.tableAlerts}`).all() as any[];
    return rows.map(row => {
      let masked: Record<string, any> = {};
      try {
        const payload: EncryptedPayload = {
          ciphertext: row.ciphertext,
          iv: row.iv,
          authTag: row.auth_tag,
          salt: row.salt
        };
        const settings = JSON.parse(FastCrypto.decrypt(payload, this.masterKey));
        // Mask passwords/webhooks for safe UI presentation
        if (settings.password) settings.password = '••••••••••••';
        if (settings.webhookUrl) {
          const url = settings.webhookUrl;
          settings.webhookUrl = url.length > 25 ? url.substring(0, 18) + '...' + url.slice(-6) : '••••••••';
        }
        masked = settings;
      } catch {
        masked = { error: 'Failed to decrypt credentials' };
      }

      return {
        channel: row.channel,
        enabled: Boolean(row.enabled),
        levelThreshold: row.level_threshold,
        maskedSettings: masked,
        updatedAt: Number(row.updated_at)
      };
    });
  }

  // --- Audit Logs ---

  public saveAuditLog(entry: AuditLogEntry): void {
    this.db.prepare(`
      INSERT INTO ${this.tableAudit} (id, timestamp, user_id, username, action, ip, details)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      entry.id,
      entry.timestamp,
      entry.userId ?? null,
      entry.username ?? null,
      entry.action,
      entry.ip ?? null,
      entry.details ? JSON.stringify(entry.details) : null
    );

    this.executeMySqlQuery(`
      INSERT INTO ${this.tableAudit} (id, timestamp, user_id, username, action, ip, details)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [entry.id, entry.timestamp, entry.userId ?? null, entry.username ?? null, entry.action, entry.ip ?? null, entry.details ? JSON.stringify(entry.details) : null]);
  }

  public getAuditLogs(options?: { limit?: number; offset?: number; action?: string; username?: string }): {
    entries: AuditLogEntry[];
    total: number;
  } {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    const totalRow = this.db.prepare(`SELECT COUNT(*) as count FROM ${this.tableAudit}`).get() as { count: number };
    const rows = this.db.prepare(`SELECT * FROM ${this.tableAudit} ORDER BY timestamp DESC LIMIT ? OFFSET ?`).all(limit, offset) as any[];

    const entries: AuditLogEntry[] = rows.map(r => ({
      id: r.id,
      timestamp: Number(r.timestamp),
      userId: r.user_id || undefined,
      username: r.username || undefined,
      action: r.action,
      ip: r.ip || undefined,
      details: r.details ? JSON.parse(r.details) : undefined
    }));

    return { entries, total: totalRow.count };
  }

  public getExcludedRoutes(): ExcludedRouteRule[] {
    try {
      if (this.dialect === 'sqlite') {
        const row: any = this.db.prepare(`SELECT value FROM ${this.tableMeta} WHERE key = 'excluded_routes'`).get();
        if (row && row.value) {
          const parsed = JSON.parse(row.value);
          return Array.isArray(parsed) ? parsed : [];
        }
      }
    } catch (err: any) {
      console.warn('[LogVault] Notice: Failed to read excluded routes from SQLite:', err?.message || err);
    }
    return [];
  }

  public saveExcludedRoutes(rules: ExcludedRouteRule[]): void {
    const jsonStr = JSON.stringify(rules || []);
    try {
      if (this.dialect === 'sqlite') {
        this.db.prepare(`INSERT OR REPLACE INTO ${this.tableMeta} (key, value) VALUES ('excluded_routes', ?)`).run(jsonStr);
        this.syncSqlFile();
      } else if (this.dialect === 'mysql') {
        this.executeMySqlQuery(
          `INSERT INTO ${this.tableMeta} (\`key\`, \`value\`) VALUES ('excluded_routes', ?) ON DUPLICATE KEY UPDATE \`value\` = VALUES(\`value\`)`,
          [jsonStr]
        );
      }
    } catch (err: any) {
      console.warn('[LogVault] Notice: Failed to save excluded routes:', err?.message || err);
    }
  }

  /**
   * Generates or synchronizes the auto-generated .sql file on disk
   * ensuring all credentials are encrypted (AES-256-GCM) with salt and hashes (Scrypt),
   * outputting tables prefixed with logg_vault_ and providing both SQLite and MySQL DDL.
   */
  public syncSqlFile(): void {
    try {
      const users = this.db.prepare(`SELECT * FROM ${this.tableUsers}`).all() as any[];
      const alerts = this.db.prepare(`SELECT * FROM ${this.tableAlerts}`).all() as any[];

      let sqlContent = `-- ==========================================================================\n`;
      sqlContent += `-- LogVault Secure SQL Store (Auto-generated)\n`;
      sqlContent += `-- Generated: ${new Date().toISOString()}\n`;
      sqlContent += `-- Dialect Support: SQLite & MySQL (InnoDB / utf8mb4)\n`;
      sqlContent += `-- Table Prefix: ${this.tablePrefix}\n`;
      sqlContent += `-- Security Protocol:\n`;
      sqlContent += `--   - User passwords: Scrypt KDF hashed with 128-bit cryptographic salt\n`;
      sqlContent += `--   - Integration credentials: AES-256-GCM AEAD encrypted with salt & auth tags\n`;
      sqlContent += `-- ==========================================================================\n\n`;

      sqlContent += `-- --- SQLite Schema ---\n`;
      sqlContent += `CREATE TABLE IF NOT EXISTS ${this.tableMeta} (\n`;
      sqlContent += `  key TEXT PRIMARY KEY,\n`;
      sqlContent += `  value TEXT NOT NULL\n`;
      sqlContent += `);\n\n`;

      sqlContent += `CREATE TABLE IF NOT EXISTS ${this.tableUsers} (\n`;
      sqlContent += `  id TEXT PRIMARY KEY,\n`;
      sqlContent += `  username TEXT UNIQUE NOT NULL,\n`;
      sqlContent += `  password_hash TEXT NOT NULL,\n`;
      sqlContent += `  salt TEXT NOT NULL,\n`;
      sqlContent += `  role TEXT NOT NULL,\n`;
      sqlContent += `  created_at INTEGER NOT NULL,\n`;
      sqlContent += `  last_login_at INTEGER,\n`;
      sqlContent += `  must_change_password INTEGER DEFAULT 0,\n`;
      sqlContent += `  token_version INTEGER DEFAULT 1\n`;
      sqlContent += `);\n\n`;

      sqlContent += `CREATE TABLE IF NOT EXISTS ${this.tableAlerts} (\n`;
      sqlContent += `  id TEXT PRIMARY KEY,\n`;
      sqlContent += `  channel TEXT UNIQUE NOT NULL,\n`;
      sqlContent += `  enabled INTEGER NOT NULL,\n`;
      sqlContent += `  level_threshold TEXT NOT NULL,\n`;
      sqlContent += `  ciphertext TEXT NOT NULL,\n`;
      sqlContent += `  iv TEXT NOT NULL,\n`;
      sqlContent += `  auth_tag TEXT NOT NULL,\n`;
      sqlContent += `  salt TEXT NOT NULL,\n`;
      sqlContent += `  created_at INTEGER NOT NULL,\n`;
      sqlContent += `  updated_at INTEGER NOT NULL\n`;
      sqlContent += `);\n\n`;

      sqlContent += `CREATE TABLE IF NOT EXISTS ${this.tableAudit} (\n`;
      sqlContent += `  id TEXT PRIMARY KEY,\n`;
      sqlContent += `  timestamp INTEGER NOT NULL,\n`;
      sqlContent += `  user_id TEXT,\n`;
      sqlContent += `  username TEXT,\n`;
      sqlContent += `  action TEXT NOT NULL,\n`;
      sqlContent += `  ip TEXT,\n`;
      sqlContent += `  details TEXT\n`;
      sqlContent += `);\n\n`;

      sqlContent += `-- --- MySQL Equivalent DDL (Copy-pasteable for MySQL Workbench / CLI) ---\n`;
      sqlContent += `-- CREATE TABLE IF NOT EXISTS ${this.tableMeta} (\`key\` VARCHAR(191) PRIMARY KEY, \`value\` TEXT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;\n`;
      sqlContent += `-- CREATE TABLE IF NOT EXISTS ${this.tableUsers} (id VARCHAR(64) PRIMARY KEY, username VARCHAR(191) UNIQUE NOT NULL, password_hash VARCHAR(255) NOT NULL, salt VARCHAR(64) NOT NULL, role VARCHAR(32) NOT NULL, created_at BIGINT NOT NULL, last_login_at BIGINT NULL, must_change_password TINYINT(1) NOT NULL DEFAULT 0, token_version INT NOT NULL DEFAULT 1) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;\n`;
      sqlContent += `-- CREATE TABLE IF NOT EXISTS ${this.tableAlerts} (id VARCHAR(64) PRIMARY KEY, channel VARCHAR(32) UNIQUE NOT NULL, enabled TINYINT(1) NOT NULL, level_threshold VARCHAR(32) NOT NULL, ciphertext TEXT NOT NULL, iv VARCHAR(64) NOT NULL, auth_tag VARCHAR(64) NOT NULL, salt VARCHAR(64) NOT NULL, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;\n`;
      sqlContent += `-- CREATE TABLE IF NOT EXISTS ${this.tableAudit} (id VARCHAR(64) PRIMARY KEY, timestamp BIGINT NOT NULL, user_id VARCHAR(64) NULL, username VARCHAR(191) NULL, action VARCHAR(64) NOT NULL, ip VARCHAR(64) NULL, details TEXT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;\n\n`;

      if (users.length > 0) {
        sqlContent += `-- Persisted User Accounts (Hashed & Salted)\n`;
        for (const u of users) {
          const uLogin = u.last_login_at ? u.last_login_at : 'NULL';
          const mustChange = u.must_change_password ? 1 : 0;
          const tokenVer = u.token_version != null ? u.token_version : 1;
          sqlContent += `INSERT OR REPLACE INTO ${this.tableUsers} (id, username, password_hash, salt, role, created_at, last_login_at, must_change_password, token_version) VALUES ('${u.id}', '${u.username}', '${u.password_hash}', '${u.salt}', '${u.role}', ${u.created_at}, ${uLogin}, ${mustChange}, ${tokenVer});\n`;
        }
        sqlContent += `\n`;
      }

      if (alerts.length > 0) {
        sqlContent += `-- Persisted Alert Integrations (AES-256-GCM Encrypted)\n`;
        for (const a of alerts) {
          sqlContent += `INSERT OR REPLACE INTO ${this.tableAlerts} (id, channel, enabled, level_threshold, ciphertext, iv, auth_tag, salt, created_at, updated_at) VALUES ('${a.id}', '${a.channel}', ${a.enabled}, '${a.level_threshold}', '${a.ciphertext}', '${a.iv}', '${a.auth_tag}', '${a.salt}', ${a.created_at}, ${a.updated_at});\n`;
        }
        sqlContent += `\n`;
      }

      const excludedRules = this.getExcludedRoutes();
      if (excludedRules.length > 0) {
        const escapedMeta = JSON.stringify(excludedRules).replace(/'/g, "''");
        sqlContent += `-- Persisted Excluded / Skipped API Routes\n`;
        sqlContent += `INSERT OR REPLACE INTO ${this.tableMeta} (key, value) VALUES ('excluded_routes', '${escapedMeta}');\n\n`;
      }

      const dir = dirname(this.sqlFilePath);
      if (dir && dir !== '.' && !existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      writeFileSync(this.sqlFilePath, sqlContent, 'utf8');
    } catch {
      // Non-fatal if disk write fails
    }
  }

  public checkHealth(): { connected: boolean; dialect: 'sqlite' | 'mysql'; error?: string } {
    try {
      if (this.dialect === 'sqlite') {
        const row = this.db.prepare('SELECT 1 as alive').get() as any;
        return { connected: Boolean(row && row.alive === 1), dialect: 'sqlite' };
      } else {
        return { connected: true, dialect: 'mysql' };
      }
    } catch (err: any) {
      return { connected: false, dialect: this.dialect, error: err.message };
    }
  }

  public close(): void {
    try {
      this.db.close();
    } catch {}
  }

  public getSqliteFilePath(): string {
    return this.sqliteFilePath;
  }

  public getSqlFilePath(): string {
    return this.sqlFilePath;
  }
}

