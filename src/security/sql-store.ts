import { writeFileSync, readFileSync, existsSync, mkdirSync, unlinkSync, readdirSync } from 'node:fs';
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
import { AuditLogEntry, DatabaseDialect, ExcludedRouteRule, LogEntry, LogLevel, LogQueryOptions, LogQueryResult, MySqlConfig, Role, TTLRule, User, UserProfile } from '../types';
import { FastCrypto, EncryptedPayload } from './fast-crypto';
import { CryptoSecurity } from './crypto';
import { SafeRegex } from './safe-regex';

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
  storageDir?: string;
  folder?: string;
  initFolder?: string;
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
  public readonly tableLogs: string;
  private stmtInsertLog?: StatementSync;
  private initMySqlPromise: Promise<void> | null = null;

  constructor(options?: SqlStoreOptions) {
    const userSpecifiedDir = options?.dataDir || options?.storageDir || options?.folder || options?.initFolder;
    const dataDir = userSpecifiedDir || (existsSync('./.tracernest') ? './.tracernest' : './.tracernest');

    this.sqliteFilePath = options?.sqliteFilePath || join(dataDir, 'tracernest-logger.sqlite');
    this.sqlFilePath = options?.sqlFilePath || join(dataDir, 'tracernest-logger.sql');
    this.keyFilePath = options?.keyFilePath || join(dataDir, '.master.key');

    this.dialect = options?.dialect || 'sqlite';
    this.mysqlConfig = options?.mysql;

    let p = options?.tablePrefix || 'tracenest_';
    if (!p.endsWith('_')) p += '_';
    this.tablePrefix = p;
    this.tableUsers = `${this.tablePrefix}users`;
    this.tableAlerts = `${this.tablePrefix}alert_configs`;
    this.tableAudit = `${this.tablePrefix}audit_logs`;
    this.tableMeta = `${this.tablePrefix}system_meta`;
    this.tableLogs = `${this.tablePrefix}logs`;

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

    const sqliteExists = existsSync(this.sqliteFilePath);

    // Initialize Native SQLite (used directly or as ultra-fast local tier)
    try {
      if (this.dialect === 'mysql' && !sqliteExists) {
        // In MySQL mode without pre-existing SQLite database file, run in-memory tier directly
        this.db = new NativeDatabaseSync(':memory:');
      } else {
        this.db = new NativeDatabaseSync(this.sqliteFilePath);
      }
      this.initTables();
    } catch (err: any) {
      console.error(`[TracerNest-Logger] ERROR: Failed to initialize SQLite storage at '${this.sqliteFilePath}':`, err?.message || err);
      console.error('[TracerNest-Logger] TIP: In Docker containers, ensure the directory is writable by the process user (e.g. `chown -R node:node /app/.tracernest`) or set `dataDir: "/tmp/.tracernest"`.');
      throw err;
    }

    // If sqlFilePath exists on disk and sqlite is empty, restore data from sql file
    if (this.dialect === 'sqlite' && existsSync(this.sqlFilePath) && this.getUserCount() === 0) {
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

    // If MySQL is configured, initialize remote tables & perform SQLite->MySQL auto-migration asynchronously
    if (this.dialect === 'mysql') {
      this.initMySql();
    }

    // Only sync if sql file doesn't exist or database has data (and dialect is SQLite)
    if (this.dialect === 'sqlite' && (!existsSync(this.sqlFilePath) || this.getUserCount() > 0)) {
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

      CREATE TABLE IF NOT EXISTS ${this.tableLogs} (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        expires_at INTEGER,
        level TEXT NOT NULL,
        source TEXT NOT NULL,
        message TEXT NOT NULL,
        raw TEXT,
        metadata TEXT,
        tags TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_${this.tableLogs}_ts ON ${this.tableLogs} (timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_${this.tableLogs}_level ON ${this.tableLogs} (level);
      CREATE INDEX IF NOT EXISTS idx_${this.tableLogs}_source ON ${this.tableLogs} (source);
      CREATE INDEX IF NOT EXISTS idx_${this.tableLogs}_expires ON ${this.tableLogs} (expires_at);
    `);

    // Ensure must_change_password and token_version columns exist if upgrading existing database
    try {
      this.db.exec(`ALTER TABLE ${this.tableUsers} ADD COLUMN must_change_password INTEGER DEFAULT 0`);
    } catch {}
    try {
      this.db.exec(`ALTER TABLE ${this.tableUsers} ADD COLUMN token_version INTEGER DEFAULT 1`);
    } catch {}
    try {
      this.db.exec(`ALTER TABLE ${this.tableLogs} ADD COLUMN expires_at INTEGER`);
    } catch {}
    try {
      this.db.exec(`ALTER TABLE ${this.tableLogs} ADD COLUMN raw TEXT`);
    } catch {}
    try {
      this.db.exec(`ALTER TABLE ${this.tableLogs} ADD COLUMN metadata TEXT`);
    } catch {}
    try {
      this.db.exec(`ALTER TABLE ${this.tableLogs} ADD COLUMN tags TEXT`);
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

  public async initMySql(): Promise<void> {
    if (this.initMySqlPromise) {
      return this.initMySqlPromise;
    }

    this.initMySqlPromise = (async () => {
      const client = this.mysqlConfig?.pool || this.mysqlConfig?.client;
      if (!client || typeof client.query !== 'function') return;

      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS ${this.tableMeta} (
            \`key\` VARCHAR(191) PRIMARY KEY,
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

        // Ensure newly introduced columns exist if upgrading package on an existing MySQL database
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

        await client.query(`
          CREATE TABLE IF NOT EXISTS ${this.tableLogs} (
            id VARCHAR(64) PRIMARY KEY,
            timestamp BIGINT NOT NULL,
            expires_at BIGINT NULL,
            level VARCHAR(16) NOT NULL,
            source VARCHAR(32) NOT NULL,
            message TEXT NOT NULL,
            raw MEDIUMTEXT NULL,
            metadata MEDIUMTEXT NULL,
            tags TEXT NULL,
            INDEX idx_logs_ts (timestamp DESC),
            INDEX idx_logs_level (level),
            INDEX idx_logs_source (source),
            INDEX idx_logs_expires (expires_at)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // Ensure newly introduced columns exist on logs table if upgrading package
        try { await client.query(`ALTER TABLE ${this.tableLogs} ADD COLUMN expires_at BIGINT NULL`); } catch {}
        try { await client.query(`ALTER TABLE ${this.tableLogs} ADD COLUMN raw MEDIUMTEXT NULL`); } catch {}
        try { await client.query(`ALTER TABLE ${this.tableLogs} ADD COLUMN metadata MEDIUMTEXT NULL`); } catch {}
        try { await client.query(`ALTER TABLE ${this.tableLogs} ADD COLUMN tags TEXT NULL`); } catch {}

        // 2. Automatic SQLite -> MySQL Migration
        // If the developer changed initialization from SQLite to MySQL in app.js, auto-migrate all SQLite data to MySQL
        const sqliteFilePresent = existsSync(this.sqliteFilePath);
        const hasData = this.hasSqliteDataToMigrate();

        if (sqliteFilePresent || hasData) {
          if (hasData) {
            console.log('[TracerNest-Logger] Migrating existing SQLite data to MySQL...');
            await this.migrateSqliteToMySql(client);
            console.log('[TracerNest-Logger] SQLite data migrated to MySQL successfully.');
          }

          // 3. Clean up SQLite database, journals, and SQL dump files, strictly preserving .master.key
          this.deleteSqliteFilesPreservingKey();

          // 4. Switch local fast tier to in-memory SQLite
          try {
            this.db.close();
          } catch {}
          this.db = new NativeDatabaseSync(':memory:');
          this.stmtInsertLog = undefined;
          this.initTables();
        }

        // 5. Synchronize local fast tier from MySQL
        await this.syncFromMySql(client);
      } catch (err: any) {
        console.warn('[TracerNest-Logger] Notice: MySQL table initialization:', err?.message || err);
      }
    })();

    return this.initMySqlPromise;
  }

  private hasSqliteDataToMigrate(): boolean {
    try {
      const u = (this.db.prepare(`SELECT COUNT(*) as count FROM ${this.tableUsers}`).get() as any)?.count || 0;
      const a = (this.db.prepare(`SELECT COUNT(*) as count FROM ${this.tableAlerts}`).get() as any)?.count || 0;
      const aud = (this.db.prepare(`SELECT COUNT(*) as count FROM ${this.tableAudit}`).get() as any)?.count || 0;
      const l = (this.db.prepare(`SELECT COUNT(*) as count FROM ${this.tableLogs}`).get() as any)?.count || 0;
      const m = (this.db.prepare(`SELECT COUNT(*) as count FROM ${this.tableMeta}`).get() as any)?.count || 0;
      return (u + a + aud + l + m) > 0;
    } catch {
      return false;
    }
  }

  private async migrateSqliteToMySql(client: any): Promise<void> {
    try {
      // 1. Users
      const users = this.db.prepare(`SELECT * FROM ${this.tableUsers}`).all() as any[];
      for (const u of users) {
        await client.query(`
          INSERT INTO ${this.tableUsers}
            (id, username, password_hash, salt, role, created_at, last_login_at, must_change_password, token_version)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            password_hash = VALUES(password_hash),
            salt = VALUES(salt),
            role = VALUES(role),
            last_login_at = VALUES(last_login_at),
            must_change_password = VALUES(must_change_password),
            token_version = VALUES(token_version)
        `, [
          u.id,
          u.username,
          u.password_hash,
          u.salt,
          u.role,
          u.created_at,
          u.last_login_at ?? null,
          u.must_change_password ?? 0,
          u.token_version ?? 1
        ]);
      }

      // 2. Alert configurations
      const alerts = this.db.prepare(`SELECT * FROM ${this.tableAlerts}`).all() as any[];
      for (const a of alerts) {
        await client.query(`
          INSERT INTO ${this.tableAlerts}
            (id, channel, enabled, level_threshold, ciphertext, iv, auth_tag, salt, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            enabled = VALUES(enabled),
            level_threshold = VALUES(level_threshold),
            ciphertext = VALUES(ciphertext),
            iv = VALUES(iv),
            auth_tag = VALUES(auth_tag),
            salt = VALUES(salt),
            updated_at = VALUES(updated_at)
        `, [
          a.id,
          a.channel,
          a.enabled,
          a.level_threshold,
          a.ciphertext,
          a.iv,
          a.auth_tag,
          a.salt,
          a.created_at,
          a.updated_at
        ]);
      }

      // 3. Audit logs
      const audits = this.db.prepare(`SELECT * FROM ${this.tableAudit}`).all() as any[];
      for (const aud of audits) {
        await client.query(`
          INSERT INTO ${this.tableAudit}
            (id, timestamp, user_id, username, action, ip, details)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            action = VALUES(action),
            details = VALUES(details)
        `, [
          aud.id,
          aud.timestamp,
          aud.user_id ?? null,
          aud.username ?? null,
          aud.action,
          aud.ip ?? null,
          aud.details ?? null
        ]);
      }

      // 4. Telemetry and HTTP logs
      const logs = this.db.prepare(`SELECT * FROM ${this.tableLogs}`).all() as any[];
      for (const l of logs) {
        await client.query(`
          INSERT INTO ${this.tableLogs}
            (id, timestamp, expires_at, level, source, message, raw, metadata, tags)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            timestamp = VALUES(timestamp),
            expires_at = VALUES(expires_at),
            level = VALUES(level),
            source = VALUES(source),
            message = VALUES(message),
            raw = VALUES(raw),
            metadata = VALUES(metadata),
            tags = VALUES(tags)
        `, [
          l.id,
          l.timestamp,
          l.expires_at ?? null,
          l.level,
          l.source,
          l.message,
          l.raw ?? null,
          l.metadata ?? null,
          l.tags ?? null
        ]);
      }

      // 5. System metadata (excluding master_key)
      const metas = this.db.prepare(`SELECT * FROM ${this.tableMeta}`).all() as any[];
      for (const m of metas) {
        if (m.key === 'master_key') continue;
        await client.query(`
          INSERT INTO ${this.tableMeta} (\`key\`, \`value\`)
          VALUES (?, ?)
          ON DUPLICATE KEY UPDATE \`value\` = VALUES(\`value\`)
        `, [m.key, m.value]);
      }
    } catch (err: any) {
      console.error('[TracerNest-Logger] ERROR during SQLite -> MySQL migration:', err?.message || err);
      throw err;
    }
  }

  private deleteSqliteFilesPreservingKey(): void {
    try {
      // 1. Close current db so Windows releases file locks
      try {
        this.db.close();
      } catch {}

      // 2. Remove primary SQLite file and its journals/dumps
      const directFiles = [
        this.sqliteFilePath,
        `${this.sqliteFilePath}-wal`,
        `${this.sqliteFilePath}-shm`,
        this.sqlFilePath
      ];

      for (const filePath of directFiles) {
        try {
          if (filePath && existsSync(filePath)) {
            // Strictly protect master key file under all circumstances
            if (filePath.endsWith('.key') || filePath.includes('master-key') || filePath.includes('master.key')) {
              continue;
            }
            unlinkSync(filePath);
          }
        } catch {}
      }

      // 3. Scan directory of sqliteFilePath to remove any remaining sqlite/sql files (preserving key files)
      const sqliteDir = dirname(this.sqliteFilePath);
      if (sqliteDir && existsSync(sqliteDir)) {
        try {
          const files = readdirSync(sqliteDir);
          for (const file of files) {
            // Never delete master key file
            if (
              file === '.master.key' ||
              file.endsWith('.key') ||
              file.includes('master-key') ||
              file.includes('master.key')
            ) {
              continue;
            }
            if (
              file.endsWith('.sqlite') ||
              file.endsWith('.sqlite-wal') ||
              file.endsWith('.sqlite-shm') ||
              file.endsWith('.sql') ||
              file.endsWith('.db') ||
              file.endsWith('.sqlite3')
            ) {
              try {
                unlinkSync(join(sqliteDir, file));
              } catch {}
            }
          }
        } catch {}
      }

      // 4. Verify that .master.key remains safely on disk
      if (existsSync(this.keyFilePath)) {
        console.log(`[TracerNest-Logger] SQLite files cleaned up. Master encryption key preserved at '${this.keyFilePath}'.`);
      }
    } catch (err: any) {
      console.warn('[TracerNest-Logger] Notice: SQLite file cleanup:', err?.message || err);
    }
  }

  private async syncFromMySql(client: any): Promise<void> {
    try {
      const helper = async (sql: string, params: any[] = []) => {
        const res = await client.query(sql, params);
        if (Array.isArray(res)) {
          return Array.isArray(res[0]) ? res[0] : res;
        }
        return res?.rows || [];
      };

      // Users
      const users = await helper(`SELECT * FROM ${this.tableUsers}`);
      if (Array.isArray(users) && users.length > 0) {
        const stmt = this.db.prepare(`
          INSERT OR REPLACE INTO ${this.tableUsers}
          (id, username, password_hash, salt, role, created_at, last_login_at, must_change_password, token_version)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const u of users) {
          stmt.run(
            u.id,
            u.username,
            u.password_hash || u.passwordHash,
            u.salt,
            u.role,
            Number(u.created_at || u.createdAt),
            u.last_login_at ? Number(u.last_login_at) : null,
            u.must_change_password ? 1 : 0,
            u.token_version != null ? Number(u.token_version) : 1
          );
        }
      }

      // Alerts
      const alerts = await helper(`SELECT * FROM ${this.tableAlerts}`);
      if (Array.isArray(alerts) && alerts.length > 0) {
        const stmt = this.db.prepare(`
          INSERT OR REPLACE INTO ${this.tableAlerts}
          (id, channel, enabled, level_threshold, ciphertext, iv, auth_tag, salt, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const a of alerts) {
          stmt.run(
            a.id,
            a.channel,
            a.enabled ? 1 : 0,
            a.level_threshold || a.levelThreshold,
            a.ciphertext,
            a.iv,
            a.auth_tag || a.authTag,
            a.salt,
            Number(a.created_at || a.createdAt),
            Number(a.updated_at || a.updatedAt)
          );
        }
      }

      // System Meta
      const metas = await helper(`SELECT * FROM ${this.tableMeta}`);
      if (Array.isArray(metas) && metas.length > 0) {
        const stmt = this.db.prepare(`
          INSERT OR REPLACE INTO ${this.tableMeta} (key, value)
          VALUES (?, ?)
        `);
        for (const m of metas) {
          if (m.key === 'master_key') continue;
          stmt.run(m.key, m.value);
        }
      }

      // Active Logs
      const now = Date.now();
      const logs = await helper(`
        SELECT * FROM ${this.tableLogs}
        WHERE expires_at IS NULL OR expires_at > ?
        ORDER BY timestamp DESC
        LIMIT 5000
      `, [now]);
      if (Array.isArray(logs) && logs.length > 0) {
        const stmt = this.db.prepare(`
          INSERT OR REPLACE INTO ${this.tableLogs}
          (id, timestamp, expires_at, level, source, message, raw, metadata, tags)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const l of logs) {
          stmt.run(
            l.id,
            Number(l.timestamp),
            l.expires_at ? Number(l.expires_at) : null,
            l.level,
            l.source,
            l.message,
            l.raw || null,
            l.metadata ? (typeof l.metadata === 'string' ? l.metadata : JSON.stringify(l.metadata)) : null,
            l.tags ? (typeof l.tags === 'string' ? l.tags : JSON.stringify(l.tags)) : null
          );
        }
      }
    } catch (err: any) {
      console.warn('[TracerNest-Logger] Notice: MySQL fast-tier synchronization:', err?.message || err);
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
   * preferring user configuration (options.masterKey / config.secret)
   * or an independent .master.key file with restricted file permissions (0600).
   * It is never stored in system_meta or dumped into .sql artifacts.
   */
  private resolveMasterKey(providedKey?: string): string {
    // 1. User-supplied key via initialization options (options.masterKey / config.secret)
    const explicitKey = (providedKey || '').trim();

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

  // --- Persistent Telemetry Logs (stdout, stderr, http, api) ---

  public saveLog(entry: LogEntry): void {
    try {
      const metaStr = entry.metadata ? JSON.stringify(entry.metadata) : null;
      const tagsStr = entry.tags ? JSON.stringify(entry.tags) : null;
      const rawStr = entry.raw || entry.message || '';

      if (!this.stmtInsertLog) {
        this.stmtInsertLog = this.db.prepare(`
          INSERT OR REPLACE INTO ${this.tableLogs}
          (id, timestamp, expires_at, level, source, message, raw, metadata, tags)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
      }

      this.stmtInsertLog.run(
        entry.id,
        entry.timestamp,
        entry.expiresAt ?? null,
        entry.level,
        entry.source,
        entry.message,
        rawStr,
        metaStr,
        tagsStr
      );

      this.executeMySqlQuery(`
        INSERT INTO ${this.tableLogs}
        (id, timestamp, expires_at, level, source, message, raw, metadata, tags)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          timestamp = VALUES(timestamp),
          expires_at = VALUES(expires_at),
          level = VALUES(level),
          source = VALUES(source),
          message = VALUES(message),
          raw = VALUES(raw),
          metadata = VALUES(metadata),
          tags = VALUES(tags)
      `, [
        entry.id,
        entry.timestamp,
        entry.expiresAt ?? null,
        entry.level,
        entry.source,
        entry.message,
        rawStr,
        metaStr,
        tagsStr
      ]);
    } catch {
      // Non-blocking so logging operations never throw or disrupt the application
    }
  }

  public getRecentLogs(limit = 5000, now = Date.now()): LogEntry[] {
    try {
      // Subquery grabs the latest unexpired logs (DESC), outer query re-sorts chronologically (ASC)
      // so they can be pushed in order into the in-memory circular buffer on server startup
      const rows = this.db.prepare(`
        SELECT * FROM (
          SELECT * FROM ${this.tableLogs}
          WHERE expires_at IS NULL OR expires_at > ?
          ORDER BY timestamp DESC
          LIMIT ?
        ) ORDER BY timestamp ASC
      `).all(now, limit) as any[];

      return rows.map(r => {
        let metadata: any = undefined;
        if (r.metadata) {
          try {
            metadata = JSON.parse(r.metadata);
          } catch {
            metadata = { raw: r.metadata };
          }
        }
        let tags: string[] | undefined = undefined;
        if (r.tags) {
          try {
            tags = JSON.parse(r.tags);
          } catch {}
        }
        return {
          id: r.id,
          timestamp: Number(r.timestamp),
          expiresAt: r.expires_at ? Number(r.expires_at) : undefined,
          level: r.level as LogLevel,
          source: r.source as any,
          message: r.message,
          raw: r.raw || r.message,
          metadata,
          tags
        };
      });
    } catch {
      return [];
    }
  }

  public purgeExpiredLogs(now = Date.now()): number {
    try {
      const res = this.db.prepare(`
        DELETE FROM ${this.tableLogs}
        WHERE expires_at IS NOT NULL AND expires_at <= ?
      `).run(now) as any;

      this.executeMySqlQuery(`
        DELETE FROM ${this.tableLogs}
        WHERE expires_at IS NOT NULL AND expires_at <= ?
      `, [now]);

      return res?.changes ?? 0;
    } catch {
      return 0;
    }
  }

  public clearLogs(): void {
    try {
      this.db.exec(`DELETE FROM ${this.tableLogs}`);
      this.executeMySqlQuery(`TRUNCATE TABLE ${this.tableLogs}`);
    } catch {}
  }

  public getLogsCount(): number {
    try {
      const row = this.db.prepare(`SELECT COUNT(*) as count FROM ${this.tableLogs}`).get() as { count: number };
      return row?.count ?? 0;
    } catch {
      return 0;
    }
  }

  public getActiveLogsCount(now = Date.now()): number {
    try {
      const row = this.db.prepare(`
        SELECT COUNT(*) as count FROM ${this.tableLogs}
        WHERE expires_at IS NULL OR expires_at > ?
      `).get(now) as any;
      return Number(row?.count ?? 0);
    } catch {
      return 0;
    }
  }

  public getLogCounts(now = Date.now()): {
    all: number;
    error: number;
    warn: number;
    info: number;
    debug: number;
    http: number;
  } {
    try {
      const row = this.db.prepare(`
        SELECT
          COUNT(*) as all_count,
          SUM(CASE WHEN level = 'error' THEN 1 ELSE 0 END) as error_count,
          SUM(CASE WHEN level = 'warn' THEN 1 ELSE 0 END) as warn_count,
          SUM(CASE WHEN level = 'info' THEN 1 ELSE 0 END) as info_count,
          SUM(CASE WHEN level = 'debug' THEN 1 ELSE 0 END) as debug_count,
          SUM(CASE WHEN source = 'http' OR metadata LIKE '%"http"%' THEN 1 ELSE 0 END) as http_count
        FROM ${this.tableLogs}
        WHERE expires_at IS NULL OR expires_at > ?
      `).get(now) as any;

      return {
        all: Number(row?.all_count ?? 0),
        error: Number(row?.error_count ?? 0),
        warn: Number(row?.warn_count ?? 0),
        info: Number(row?.info_count ?? 0),
        debug: Number(row?.debug_count ?? 0),
        http: Number(row?.http_count ?? 0)
      };
    } catch {
      return { all: 0, error: 0, warn: 0, info: 0, debug: 0, http: 0 };
    }
  }

  public getAllActiveLogs(now = Date.now(), limit = 10000): LogEntry[] {
    try {
      const rows = this.db.prepare(`
        SELECT * FROM ${this.tableLogs}
        WHERE expires_at IS NULL OR expires_at > ?
        ORDER BY timestamp ASC
        LIMIT ?
      `).all(now, limit) as any[];

      return rows.map(r => {
        let metadata: any = undefined;
        if (r.metadata) {
          try { metadata = JSON.parse(r.metadata); } catch { metadata = { raw: r.metadata }; }
        }
        let tags: string[] | undefined = undefined;
        if (r.tags) {
          try { tags = JSON.parse(r.tags); } catch {}
        }
        return {
          id: r.id,
          timestamp: Number(r.timestamp),
          expiresAt: r.expires_at ? Number(r.expires_at) : undefined,
          level: r.level as LogLevel,
          source: r.source as any,
          message: r.message,
          raw: r.raw || r.message,
          metadata,
          tags
        };
      });
    } catch {
      return [];
    }
  }

  public queryLogs(options: LogQueryOptions = {}, now = Date.now()): LogQueryResult {
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

    const baseWhere = ['(expires_at IS NULL OR expires_at > ?)'];
    const params: any[] = [now];

    if (level && level !== 'all') {
      baseWhere.push('level = ?');
      params.push(level);
    }

    if (source && source !== 'all') {
      baseWhere.push('source = ?');
      params.push(source);
    }

    if (from !== undefined) {
      baseWhere.push('timestamp >= ?');
      params.push(from);
    }

    if (to !== undefined) {
      baseWhere.push('timestamp <= ?');
      params.push(to);
    }

    let regex: RegExp | null = null;
    if (search && search.trim().length > 0) {
      const s = search.trim();
      if (isRegex) {
        regex = SafeRegex.safeCompile(s, 'i');
        if (!regex) {
          baseWhere.push('(message LIKE ? OR raw LIKE ? OR metadata LIKE ?)');
          const sParam = `%${s}%`;
          params.push(sParam, sParam, sParam);
        }
      } else {
        baseWhere.push('(message LIKE ? OR raw LIKE ? OR metadata LIKE ?)');
        const sParam = `%${s}%`;
        params.push(sParam, sParam, sParam);
      }
    }

    const whereClause = baseWhere.join(' AND ');
    const counts = this.getLogCounts(now);

    if (regex) {
      const allRows = this.db.prepare(`
        SELECT * FROM ${this.tableLogs}
        WHERE ${whereClause}
        ORDER BY timestamp ${order === 'asc' ? 'ASC' : 'DESC'}
      `).all(...params) as any[];

      const matched: LogEntry[] = [];
      for (const r of allRows) {
        let metadata: any = undefined;
        if (r.metadata) {
          try { metadata = JSON.parse(r.metadata); } catch { metadata = { raw: r.metadata }; }
        }
        let tags: string[] | undefined = undefined;
        if (r.tags) {
          try { tags = JSON.parse(r.tags); } catch {}
        }
        const entry: LogEntry = {
          id: r.id,
          timestamp: Number(r.timestamp),
          expiresAt: r.expires_at ? Number(r.expires_at) : undefined,
          level: r.level as LogLevel,
          source: r.source as any,
          message: r.message,
          raw: r.raw || r.message,
          metadata,
          tags
        };

        const matchesMsg = SafeRegex.test(regex, entry.message);
        const matchesUrl = entry.metadata?.http?.url ? SafeRegex.test(regex, entry.metadata.http.url) : false;
        const matchesIp = entry.metadata?.http?.clientIp ? SafeRegex.test(regex, entry.metadata.http.clientIp) : false;
        const matchesMeta = entry.metadata ? SafeRegex.test(regex, JSON.stringify(entry.metadata)) : false;

        if (matchesMsg || matchesUrl || matchesIp || matchesMeta) {
          matched.push(entry);
        }
      }

      if (sortBy === 'level') {
        const levelRank: Record<LogLevel, number> = { error: 4, warn: 3, info: 2, debug: 1 };
        matched.sort((a, b) => {
          const diff = (levelRank[b.level] || 0) - (levelRank[a.level] || 0);
          return order === 'asc' ? -diff : diff;
        });
      }

      const total = matched.length;
      const paginated = matched.slice(offset, offset + limit);
      return { logs: paginated, total, offset, limit, counts };
    }

    const countRow = this.db.prepare(`
      SELECT COUNT(*) as total FROM ${this.tableLogs}
      WHERE ${whereClause}
    `).get(...params) as { total: number };

    const total = countRow?.total ?? 0;
    const orderDirection = order === 'asc' ? 'ASC' : 'DESC';
    let orderByClause = `timestamp ${orderDirection}`;
    if (sortBy === 'level') {
      orderByClause = `CASE level WHEN 'error' THEN 4 WHEN 'warn' THEN 3 WHEN 'info' THEN 2 WHEN 'debug' THEN 1 ELSE 0 END ${orderDirection}, timestamp DESC`;
    }

    const queryParams = [...params, limit, offset];
    const rows = this.db.prepare(`
      SELECT * FROM ${this.tableLogs}
      WHERE ${whereClause}
      ORDER BY ${orderByClause}
      LIMIT ? OFFSET ?
    `).all(...queryParams) as any[];

    const logs: LogEntry[] = rows.map(r => {
      let metadata: any = undefined;
      if (r.metadata) {
        try { metadata = JSON.parse(r.metadata); } catch { metadata = { raw: r.metadata }; }
      }
      let tags: string[] | undefined = undefined;
      if (r.tags) {
        try { tags = JSON.parse(r.tags); } catch {}
      }
      return {
        id: r.id,
        timestamp: Number(r.timestamp),
        expiresAt: r.expires_at ? Number(r.expires_at) : undefined,
        level: r.level as LogLevel,
        source: r.source as any,
        message: r.message,
        raw: r.raw || r.message,
        metadata,
        tags
      };
    });

    return { logs, total, offset, limit, counts };
  }

  public applyRuleToExistingLogs(rule: TTLRule): void {
    try {
      const conditions: string[] = ['expires_at IS NULL'];
      const params: any[] = [];

      if (rule.level && rule.level !== 'all') {
        conditions.push('level = ?');
        params.push(rule.level);
      }
      if (rule.source && rule.source !== 'all') {
        conditions.push('source = ?');
        params.push(rule.source);
      }
      if (rule.pattern && !rule.compiledRegex) {
        conditions.push('(message LIKE ? OR metadata LIKE ?)');
        const p = `%${rule.pattern.trim()}%`;
        params.push(p, p);
      }

      const ttlMs = rule.ttlSeconds * 1000;
      this.db.prepare(`
        UPDATE ${this.tableLogs}
        SET expires_at = timestamp + ?
        WHERE ${conditions.join(' AND ')}
      `).run(ttlMs, ...params);
    } catch {}
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
    if (this.dialect === 'mysql') {
      return;
    }
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

      sqlContent += `CREATE TABLE IF NOT EXISTS ${this.tableLogs} (\n`;
      sqlContent += `  id TEXT PRIMARY KEY,\n`;
      sqlContent += `  timestamp INTEGER NOT NULL,\n`;
      sqlContent += `  expires_at INTEGER,\n`;
      sqlContent += `  level TEXT NOT NULL,\n`;
      sqlContent += `  source TEXT NOT NULL,\n`;
      sqlContent += `  message TEXT NOT NULL,\n`;
      sqlContent += `  raw TEXT,\n`;
      sqlContent += `  metadata TEXT,\n`;
      sqlContent += `  tags TEXT\n`;
      sqlContent += `);\n\n`;

      sqlContent += `-- --- MySQL Equivalent DDL (Copy-pasteable for MySQL Workbench / CLI) ---\n`;
      sqlContent += `-- CREATE TABLE IF NOT EXISTS ${this.tableMeta} (\`key\` VARCHAR(191) PRIMARY KEY, \`value\` TEXT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;\n`;
      sqlContent += `-- CREATE TABLE IF NOT EXISTS ${this.tableUsers} (id VARCHAR(64) PRIMARY KEY, username VARCHAR(191) UNIQUE NOT NULL, password_hash VARCHAR(255) NOT NULL, salt VARCHAR(64) NOT NULL, role VARCHAR(32) NOT NULL, created_at BIGINT NOT NULL, last_login_at BIGINT NULL, must_change_password TINYINT(1) NOT NULL DEFAULT 0, token_version INT NOT NULL DEFAULT 1) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;\n`;
      sqlContent += `-- CREATE TABLE IF NOT EXISTS ${this.tableAlerts} (id VARCHAR(64) PRIMARY KEY, channel VARCHAR(32) UNIQUE NOT NULL, enabled TINYINT(1) NOT NULL, level_threshold VARCHAR(32) NOT NULL, ciphertext TEXT NOT NULL, iv VARCHAR(64) NOT NULL, auth_tag VARCHAR(64) NOT NULL, salt VARCHAR(64) NOT NULL, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;\n`;
      sqlContent += `-- CREATE TABLE IF NOT EXISTS ${this.tableAudit} (id VARCHAR(64) PRIMARY KEY, timestamp BIGINT NOT NULL, user_id VARCHAR(64) NULL, username VARCHAR(191) NULL, action VARCHAR(64) NOT NULL, ip VARCHAR(64) NULL, details TEXT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;\n`;
      sqlContent += `-- CREATE TABLE IF NOT EXISTS ${this.tableLogs} (id VARCHAR(64) PRIMARY KEY, timestamp BIGINT NOT NULL, expires_at BIGINT NULL, level VARCHAR(16) NOT NULL, source VARCHAR(32) NOT NULL, message TEXT NOT NULL, raw MEDIUMTEXT NULL, metadata MEDIUMTEXT NULL, tags TEXT NULL, INDEX idx_logs_ts (timestamp DESC), INDEX idx_logs_level (level), INDEX idx_logs_source (source)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;\n\n`;

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

