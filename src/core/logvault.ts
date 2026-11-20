import { createServer, Server, IncomingMessage, ServerResponse } from 'node:http';
import { TracerNestLoggerConfig, TraceNestConfig, LogVaultConfig, LogLevel, ExcludedRouteRule } from '../types';
import { DEFAULT_TRACERNEST_LOGO, DEFAULT_TRACENEST_LOGO, DEFAULT_APP_TITLE, DEFAULT_BASE_PATH, DEFAULT_DATA_DIR, DEFAULT_SQL_PATH, DEFAULT_SQLITE_PATH, DEFAULT_TABLE_PREFIX } from '../constants';
import { CryptoSecurity } from '../security/crypto';
import { RBACManager } from '../security/rbac';
import { SqlStore } from '../security/sql-store';
import { UserStore } from '../security/user-store';
import { RateLimiter } from '../security/rate-limiter';
import { RingBuffer } from './ring-buffer';
import { TerminalInterceptor } from './interceptor';
import { StreamManager } from './stream-manager';
import { AuditLogger } from './audit';
import { AlertDispatcher } from '../alerts/alert-dispatcher';
import { TTLManager } from './ttl-manager';
import { HttpLogger } from '../middleware/http-logger';
import { HttpHandler } from '../middleware/handler';
import { GracefulShutdownManager } from './graceful-shutdown';

export class TracerNestLogger {
  public readonly config: TracerNestLoggerConfig;
  public readonly secret: string;
  public readonly rbac: RBACManager;
  public readonly sqlStore: SqlStore;
  public readonly userStore: UserStore;
  public readonly alertDispatcher: AlertDispatcher;
  public readonly ttlManager: TTLManager;
  public readonly ringBuffer: RingBuffer;
  public readonly interceptor: TerminalInterceptor;
  public readonly streamManager: StreamManager;
  public readonly auditLogger: AuditLogger;
  public readonly rateLimiter: RateLimiter;
  public readonly httpLogger: HttpLogger;
  public readonly httpHandler: HttpHandler;
  public readonly shutdownManager: GracefulShutdownManager;
  public readonly basePath: string;
  public readonly publicPath: string;

  private server: Server | null = null;

  constructor(config: TracerNestLoggerConfig = {}) {
    const dataDir = config.dataDir || config.storageDir || config.folder || config.initFolder || (config as any).dir || DEFAULT_DATA_DIR;
    const defaultSqlPath = `${dataDir}/tracernest-logger.sql`;
    const defaultSqlitePath = `${dataDir}/tracernest-logger.sqlite`;

    const effectiveConfig: TracerNestLoggerConfig = {
      path: DEFAULT_BASE_PATH,
      title: DEFAULT_APP_TITLE,
      logo: DEFAULT_TRACERNEST_LOGO,
      dataDir,
      storageDir: dataDir,
      folder: dataDir,
      initFolder: dataDir,
      sqlFilePath: config.sqlFilePath || defaultSqlPath,
      sqliteFilePath: config.sqliteFilePath || defaultSqlitePath,
      tablePrefix: DEFAULT_TABLE_PREFIX,
      ...config
    };
    this.config = effectiveConfig;

    // 1. Initialize SQL Storage (SQLite + auto-synchronized encrypted SQL file, or MySQL)
    const userEncryptionKey = effectiveConfig.encryptionKey || effectiveConfig.secret || effectiveConfig.masterKey;
    this.sqlStore = new SqlStore({
      dataDir,
      storageDir: dataDir,
      folder: dataDir,
      initFolder: dataDir,
      sqlFilePath: effectiveConfig.sqlFilePath,
      sqliteFilePath: effectiveConfig.sqliteFilePath,
      masterKey: userEncryptionKey,
      dialect: effectiveConfig.dialect,
      mysql: effectiveConfig.mysql,
      tablePrefix: effectiveConfig.tablePrefix
    });

    this.secret = userEncryptionKey || this.sqlStore.getMasterKey();

    // Determine payload encryption for shared request/response bodies:
    // Automatically enabled whenever ANY active encryption key exists (user-provided or auto-generated masterKey),
    // unless explicitly disabled via effectiveConfig.encryptPayloads === false.
    const activeEncryptionKey = userEncryptionKey || this.secret;
    const shouldEncryptPayloads = effectiveConfig.encryptPayloads !== false && Boolean(activeEncryptionKey);

    // 2. Initialize Security & Core Components
    this.rbac = new RBACManager(effectiveConfig.customRolePermissions);
    this.userStore = new UserStore(this.sqlStore);

    // Pre-seed initial administrator account if configured and database has no users
    const adminUser = effectiveConfig.initialAdmin?.username;
    const adminPass = effectiveConfig.initialAdmin?.password;
    if (adminUser && adminPass && !this.userStore.hasUsers()) {
      try {
        this.userStore.createUser(adminUser, adminPass, 'admin');
        console.log(`[TracerNest-Logger] Initial administrator account '${adminUser}' provisioned successfully.`);
      } catch (err: any) {
        console.warn(`[TracerNest-Logger] Notice: Could not auto-provision initial admin:`, err?.message || err);
      }
    }

    this.alertDispatcher = new AlertDispatcher(this.sqlStore);
    const shouldPersistLogs = effectiveConfig.persistLogs !== false;
    this.ringBuffer = new RingBuffer(
      effectiveConfig.bufferSize ?? 5000,
      this.sqlStore,
      shouldPersistLogs
    );

    // Automatically reload persisted terminal and HTTP logs upon server startup
    if (shouldPersistLogs) {
      try {
        const persistedLogs = this.sqlStore.getRecentLogs(effectiveConfig.bufferSize ?? 5000);
        if (persistedLogs.length > 0) {
          this.ringBuffer.loadPersistedLogs(persistedLogs);
        }
      } catch (err: any) {
        console.warn('[TracerNest-Logger] Notice: Could not reload persisted logs:', err?.message || err);
      }
    }

    this.streamManager = new StreamManager();
    this.auditLogger = new AuditLogger(1000, this.sqlStore);
    this.rateLimiter = new RateLimiter(effectiveConfig.rateLimit);

    // 3. Initialize TTL Manager
    this.ttlManager = new TTLManager({
      config: effectiveConfig.ttl,
      ringBuffer: this.ringBuffer,
      sqlStore: this.sqlStore,
      maxPersistedLogs: effectiveConfig.maxPersistedLogs
    });

    // 4. HTTP Application Request/Response Interceptor
    let basePath = effectiveConfig.path || effectiveConfig.basePath || DEFAULT_BASE_PATH;
    if (!basePath.startsWith('/')) basePath = '/' + basePath;
    if (basePath.endsWith('/') && basePath.length > 1) basePath = basePath.slice(0, -1);
    this.basePath = basePath;

    let publicPath = effectiveConfig.publicPath;
    if (!publicPath && effectiveConfig.apiPrefix) {
      const pfx = effectiveConfig.apiPrefix.startsWith('/') ? effectiveConfig.apiPrefix : '/' + effectiveConfig.apiPrefix;
      const cleanPfx = pfx.replace(/\/+$/, '');
      publicPath = `${cleanPfx}/${basePath.replace(/^\/+/, '')}`;
    }
    this.publicPath = publicPath || basePath;

    this.httpLogger = new HttpLogger({
      ringBuffer: this.ringBuffer,
      streamManager: this.streamManager,
      ttlManager: this.ttlManager,
      alertDispatcher: this.alertDispatcher,
      basePath,
      trustProxy: effectiveConfig.trustProxy,
      maxBodyBytes: effectiveConfig.maxHttpBodyBytes,
      sensitiveHeaders: effectiveConfig.sensitiveHeaders,
      sensitiveFieldKeys: effectiveConfig.sensitiveFieldKeys,
      excludeRoutes: effectiveConfig.excludeRoutes || effectiveConfig.excludePaths || effectiveConfig.ignoreRoutes,
      customPatterns: effectiveConfig.customRedactionPatterns,
      encryptionKey: activeEncryptionKey,
      encryptPayloads: shouldEncryptPayloads
    });

    // Load persisted UI-configured excluded routes
    try {
      const persistedExcludedRoutes = this.sqlStore.getExcludedRoutes();
      this.httpLogger.setDynamicExcludedRoutes(persistedExcludedRoutes);
    } catch {}

    // 5. Terminal Interceptor (stdout & stderr hook)
    this.interceptor = new TerminalInterceptor({
      redactSensitive: effectiveConfig.redactSensitive ?? true,
      customPatterns: effectiveConfig.customRedactionPatterns,
      callback: (entry) => {
        // Apply TTL rule
        this.ttlManager.applyTTL(entry);
        this.ringBuffer.push(entry);
        this.streamManager.broadcast(entry);
        // Asynchronously check and send Email / Teams alerts if configured
        this.alertDispatcher.dispatch(entry);
      }
    });

    if (effectiveConfig.interceptStdout !== false || effectiveConfig.interceptStderr !== false) {
      this.interceptor.attach(
        effectiveConfig.interceptStdout !== false,
        effectiveConfig.interceptStderr !== false
      );
    }

    // 6. HTTP Middleware & Dashboard Handler
    this.httpHandler = new HttpHandler({
      config: effectiveConfig,
      userStore: this.userStore,
      sqlStore: this.sqlStore,
      alertDispatcher: this.alertDispatcher,
      ttlManager: this.ttlManager,
      rbac: this.rbac,
      ringBuffer: this.ringBuffer,
      streamManager: this.streamManager,
      auditLogger: this.auditLogger,
      rateLimiter: this.rateLimiter,
      secret: this.secret,
      httpLogger: this.httpLogger
    });

    // 7. Graceful Shutdown Management
    const shutdownOpts = typeof effectiveConfig.gracefulShutdown === 'object' ? effectiveConfig.gracefulShutdown : {};
    this.shutdownManager = new GracefulShutdownManager(this, undefined, shutdownOpts);
    if (effectiveConfig.gracefulShutdown !== false) {
      this.shutdownManager.attach();
    }
  }

  /**
   * Express / Connect compatible middleware combining LogVault Dashboard/API
   * with automatic application HTTP request & response JSON logging
   */
  public middleware(): (req: IncomingMessage, res: ServerResponse, next: (err?: any) => void) => void {
    const handlerMiddleware = this.httpHandler.middleware();
    const httpLoggerMiddleware = this.httpLogger.middleware();

    return (req, res, next) => {
      // If interceptHttp is disabled, only mount the handler
      if (this.config.interceptHttp === false) {
        return handlerMiddleware(req, res, next);
      }

      if (this.httpHandler.isMatch(req)) {
        return handlerMiddleware(req, res, next);
      }

      // Otherwise, wrap with the HTTP request/response interceptor
      httpLoggerMiddleware(req, res, next);
    };
  }

  /**
   * Raw HTTP request handler
   */
  public async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    return this.httpHandler.handleRequest(req, res);
  }

  /**
   * Attach directly to an existing Node.js HTTP server instance
   */
  public attach(server: Server): void {
    this.shutdownManager.setServer(server);
    const existingListeners = server.listeners('request').slice(0);
    server.removeAllListeners('request');

    server.on('request', async (req: IncomingMessage, res: ServerResponse) => {
      const handled = await this.httpHandler.handleRequest(req, res);
      if (!handled) {
        for (const listener of existingListeners) {
          listener.call(server, req, res);
        }
      }
    });
  }

  /**
   * Start a dedicated HTTP server for LogVault on a standalone port
   */
  public listen(port: number, host = '0.0.0.0', callback?: () => void): Server {
    this.server = createServer((req: IncomingMessage, res: ServerResponse) => {
      this.httpHandler.handleRequest(req, res).then(handled => {
        if (!handled) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found');
        }
      });
    });

    this.shutdownManager.setServer(this.server);
    this.server.listen(port, host, callback);
    return this.server;
  }

  /**
   * Programmatic logging helper
   */
  public log(level: LogLevel, message: string, metadata?: Record<string, unknown>): void {
    const entry: any = {
      id: `log_${Date.now()}_${CryptoSecurity.generateSecret(4)}`,
      timestamp: Date.now(),
      level,
      source: 'api' as const,
      message,
      raw: message,
      metadata
    };
    this.ttlManager.applyTTL(entry);
    this.ringBuffer.push(entry);
    this.streamManager.broadcast(entry);
    this.alertDispatcher.dispatch(entry);
  }

  /**
   * Retrieves all UI-configured dynamic excluded routes
   */
  public getExcludedRoutes(): ExcludedRouteRule[] {
    return this.sqlStore.getExcludedRoutes();
  }

  /**
   * Dynamically adds a new excluded route rule and applies it immediately
   */
  public addExcludedRoute(rule: Omit<ExcludedRouteRule, 'id' | 'createdAt'>): ExcludedRouteRule {
    const rules = this.sqlStore.getExcludedRoutes();
    const newRule: ExcludedRouteRule = {
      id: `excl_${Date.now()}_${CryptoSecurity.generateSecret(3)}`,
      path: rule.path.trim(),
      method: (rule.method || 'ALL').toUpperCase(),
      description: rule.description?.trim(),
      enabled: rule.enabled !== false,
      createdAt: Date.now()
    };
    rules.unshift(newRule);
    this.sqlStore.saveExcludedRoutes(rules);
    this.httpLogger.setDynamicExcludedRoutes(rules);
    return newRule;
  }

  /**
   * Deletes a dynamically configured excluded route by id
   */
  public deleteExcludedRoute(id: string): boolean {
    const rules = this.sqlStore.getExcludedRoutes();
    const filtered = rules.filter(r => r.id !== id);
    if (filtered.length === rules.length) return false;
    this.sqlStore.saveExcludedRoutes(filtered);
    this.httpLogger.setDynamicExcludedRoutes(filtered);
    return true;
  }

  /**
   * Toggles the enabled state of an excluded route
   */
  public toggleExcludedRoute(id: string, enabled?: boolean): boolean {
    const rules = this.sqlStore.getExcludedRoutes();
    const rule = rules.find(r => r.id === id);
    if (!rule) return false;
    rule.enabled = enabled !== undefined ? enabled : !rule.enabled;
    this.sqlStore.saveExcludedRoutes(rules);
    this.httpLogger.setDynamicExcludedRoutes(rules);
    return true;
  }

  /**
   * Triggers a graceful shutdown manually
   */
  public async gracefulShutdown(signal?: string): Promise<void> {
    return this.shutdownManager.shutdown(signal);
  }

  /**
   * Cleanly stop interception, SSE streams, background rate limiter, TTL manager, SQL store, and server
   */
  public stop(): void {
    this.shutdownManager.detach();
    this.interceptor.restore();
    this.streamManager.destroy();
    this.ttlManager.destroy();
    this.rateLimiter.destroy();
    this.sqlStore.close();
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}

/**
 * Backward-compatible aliases for TracerNestLogger
 */
export class TraceNest extends TracerNestLogger {}
export class LogVault extends TracerNestLogger {}
