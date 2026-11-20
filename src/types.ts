export * from './constants';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface HttpLogMetadata {
  method: string;
  url: string;
  path: string;
  statusCode: number;
  durationMs: number;
  clientIp: string;
  headers?: Record<string, string>;
  requestBody?: any;
  responseBody?: any;
  encrypted?: boolean;
  decrypted?: boolean;
}

export interface LogEntry {
  id: string;
  timestamp: number;
  expiresAt?: number; // Epoch timestamp when log expires via TTL
  level: LogLevel;
  source: 'stdout' | 'stderr' | 'api' | 'http' | 'internal';
  message: string;
  raw: string;
  metadata?: Record<string, unknown> & { http?: HttpLogMetadata };
  tags?: string[];
}

export type Role = 'admin' | 'operator' | 'auditor' | 'viewer' | string;

export type Permission =
  | 'logs:read'
  | 'logs:stream'
  | 'logs:clear'
  | 'logs:export'
  | 'users:manage'
  | 'alerts:manage'
  | 'ttl:manage'
  | 'audit:read'
  | 'system:manage';

export interface User {
  id: string;
  username: string;
  passwordHash: string;
  salt: string;
  role: Role;
  createdAt: number;
  lastLoginAt?: number;
  mustChangePassword?: boolean;
  tokenVersion?: number;
}

export interface UserProfile {
  id: string;
  username: string;
  role: Role;
  permissions: Permission[];
  createdAt: number;
  lastLoginAt?: number;
  mustChangePassword?: boolean;
  tokenVersion?: number;
}

export interface AuditLogEntry {
  id: string;
  timestamp: number;
  userId?: string;
  username?: string;
  action: string;
  details?: Record<string, unknown>;
  ip?: string;
}

export interface LogQueryOptions {
  search?: string;
  isRegex?: boolean;
  level?: LogLevel | 'all';
  from?: number;
  to?: number;
  limit?: number;
  offset?: number;
  source?: string;
  order?: 'asc' | 'desc';
  sortBy?: 'timestamp' | 'level';
}

export interface LogQueryResult {
  logs: LogEntry[];
  total: number;
  offset: number;
  limit: number;
  counts?: {
    all: number;
    error: number;
    warn: number;
    info: number;
    debug: number;
    http: number;
  };
}

export interface TracerNestLoggerStats {
  totalLogs: number;
  errorCount: number;
  warnCount: number;
  infoCount: number;
  debugCount: number;
  logsPerSecond: number;
  bufferUsagePercent: number;
  memoryUsageMb: number;
  uptimeSeconds: number;
  expiredLogsPurged: number;
}

export type TraceNestStats = TracerNestLoggerStats;
export type LogVaultStats = TracerNestLoggerStats;

export interface TTLRule {
  id?: string;
  name?: string;
  level?: LogLevel | 'all';
  source?: 'stdout' | 'stderr' | 'api' | 'http' | 'internal' | 'all';
  pattern?: string; // Regex or substring to match in message or URL
  compiledRegex?: RegExp;
  ttlSeconds: number; // Duration before deletion
  createdAt?: number;
}

export interface TTLConfig {
  /**
   * Default expiration in seconds for logs that do not match specific rules.
   * If undefined or 0, logs without matching rules do not expire by time (only FIFO buffer capacity).
   */
  defaultTtlSeconds?: number;

  /**
   * Specific rules targeting particular log levels, sources, or patterns.
   */
  rules?: TTLRule[];

  /**
   * How often the background eviction sweep runs (in ms). Default: 30000 (30 seconds)
   */
  sweepIntervalMs?: number;
}

export type AlertChannel = 'email' | 'teams';
export type AlertLevel = 'error' | 'warn' | 'all';

export interface EmailSettings {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password?: string;
  from: string;
  to: string;
}

export interface TeamsSettings {
  webhookUrl: string;
  title?: string;
}

export interface AlertIntegrationRecord {
  channel: AlertChannel;
  enabled: boolean;
  levelThreshold: AlertLevel;
  createdAt: number;
  updatedAt: number;
  settings: EmailSettings | TeamsSettings;
}

export type DatabaseDialect = 'sqlite' | 'mysql';

export interface MySqlConfig {
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  ssl?: any;
  /** Existing mysql2 pool or connection instance from the host application */
  client?: any;
  pool?: any;
}

export type RouteFilterRule =
  | string
  | RegExp
  | { path: string | RegExp; method?: string }
  | ((req: import('node:http').IncomingMessage) => boolean);

export interface ExcludedRouteRule {
  id: string;
  path: string;
  method?: string; // 'ALL' | 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  description?: string;
  enabled: boolean;
  createdAt: number;
}

export type TrustProxyOption =
  | boolean
  | string
  | string[]
  | ((ip: string) => boolean);

export interface TracerNestLoggerConfig {
  /**
   * Path where the dashboard and API are mounted (e.g. '/tracernest-logger', '/tracenest', or '/api/tracenest')
   * Default: '/tracernest-logger'
   */
  path?: string;

  /**
   * Alias for `path`: Base path where the dashboard and API are hosted.
   */
  basePath?: string;

  /**
   * Optional public URL path exposed to browser clients through Nginx or API gateways (e.g. '/api/tracenest').
   * If not specified, automatically derived from browser location or `apiPrefix` + `path`.
   */
  publicPath?: string;

  /**
   * Optional global API prefix to prepend to all routes (e.g. '/api' -> '/api/tracenest')
   * Useful when Nginx or an API gateway forwards all backend requests under an '/api' route.
   */
  apiPrefix?: string;

  /**
   * Database dialect to use for persistent storage.
   * Options: 'sqlite' | 'mysql'
   * Default: 'sqlite'
   */
  dialect?: DatabaseDialect;

  /**
   * MySQL configuration when dialect is 'mysql'.
   * Can accept host/port/user/password/database or an existing mysql2 client/pool from your host application.
   */
  mysql?: MySqlConfig;

  /**
   * Prefix for persistent database table names.
   * Default: 'tracenest_'
   * Tables created:
   *   - tracenest_users
   *   - tracenest_alert_configs
   *   - tracenest_audit_logs
   *   - tracenest_system_meta
   */
  tablePrefix?: string;

  /**
   * Custom logo image URL, Data URI (base64/SVG), or local file path.
   * If omitted, TracerNest-Logger's built-in vector telemetry logo is used automatically.
   */
  logo?: string;

  /**
   * Secret or master key used for HMAC tokens and AES-256-GCM SQL data encryption.
   * Can also be set via process.env.TRACERNEST_SECRET.
   */
  secret?: string;

  /**
   * Alias for secret: user-defined master key for encrypting SQL data at rest.
   */
  masterKey?: string;

  /**
   * Primary encryption key used for AES-256-GCM encryption of intercepted HTTP request
   * and response payloads, SQL data at rest, and HMAC tokens.
   */
  encryptionKey?: string;

  /**
   * Explicitly enable or disable AES-256-GCM encryption for captured HTTP request and response payloads.
   * Defaults to `true` whenever an `encryptionKey`, `masterKey`, or `secret` is provided in initialization parameters.
   */
  encryptPayloads?: boolean;

  /**
   * Dedicated folder directory where SQLite database, journal, and SQL export files are initialized.
   * Default: './.tracernest'
   */
  dataDir?: string;

  /**
   * File path where the SQL schema and encrypted data are saved.
   * Default: './.tracernest/tracernest-logger.sql'
   */
  sqlFilePath?: string;

  /**
   * File path for the native SQLite database.
   * Default: './.tracernest/tracernest-logger.sqlite'
   */
  sqliteFilePath?: string;

  /**
   * Maximum number of log entries to retain in the in-memory circular ring buffer.
   * Default: 5000
   */
  bufferSize?: number;

  /**
   * Automatically persist terminal logs (stdout/stderr) and intercepted HTTP logs to SQLite or MySQL.
   * On server restarts, the latest logs are automatically reloaded into memory and displayed on the dashboard.
   * Default: true
   */
  persistLogs?: boolean;

  /**
   * Maximum number of historical logs to retain in persistent database storage.
   * Default: 50000
   */
  maxPersistedLogs?: number;

  /**
   * Automatically redact sensitive information (credit cards, passwords, authorization tokens, API keys)
   * Default: true
   */
  redactSensitive?: boolean;

  /**
   * Custom regular expressions to mask in log messages
   */
  customRedactionPatterns?: RegExp[];

  /**
   * Intercept process.stdout. Default: true
   */
  interceptStdout?: boolean;

  /**
   * Intercept process.stderr. Default: true
   */
  interceptStderr?: boolean;

  /**
   * Automatically intercept application HTTP requests and log URL, request JSON, response JSON, and latency.
   * Default: true
   */
  interceptHttp?: boolean;

  /**
   * Additional HTTP header names to redact in HTTP request logging.
   * Default includes: authorization, cookie, x-api-key, set-cookie, proxy-authorization, x-auth-token, x-access-token, x-csrf-token, x-xsrf-token
   */
  sensitiveHeaders?: string[];

  /**
   * Additional JSON object keys / field name fragments to mask as [REDACTED] in request and response bodies.
   * Default includes: password, passwd, secret, token, apikey, api_key, auth, creditcard, cardnumber, cvv, cvc, ssn, privatekey, passcode, pin, access_token, refresh_token
   */
  sensitiveFieldKeys?: string[];

  /**
   * Application route paths, wildcards (e.g. '/api/auth/*'), RegExps, or predicates to exclude completely
   * from HTTP request/response interception and telemetry logging (ideal for sensitive auth/payment endpoints).
   *
   * Example:
   *   excludeRoutes: [
   *     '/api/auth/login',
   *     '/api/payments/*',
   *     new RegExp('^/api/v1/checkout'),
   *     { path: '/api/webhooks/stripe', method: 'POST' },
   *     (req) => req.headers['x-skip-logging'] === 'true'
   *   ]
   */
  excludeRoutes?: RouteFilterRule[];

  /**
   * Alias for `excludeRoutes`.
   */
  excludePaths?: RouteFilterRule[];

  /**
   * Alias for `excludeRoutes`.
   */
  ignoreRoutes?: RouteFilterRule[];

  /**
   * Maximum body size in bytes to buffer and parse for HTTP request/response JSON logging.
   * Default: 524288 (512 KB)
   */
  maxHttpBodyBytes?: number;

  /**
   * Time-To-Live (TTL) configuration for automated log deletion based on levels and patterns.
   */
  ttl?: TTLConfig;

  /**
   * Rate limiting configuration for login attempts
   */
  rateLimit?: {
    windowMs?: number;
    maxAttempts?: number;
    maxEntries?: number;
  };

  /**
   * Trusted proxy configuration for reverse proxy deployments (Nginx, ALB, Cloudflare, etc.).
   * - false: Only trust socket peer remoteAddress (safest for direct-to-app deployments).
   * - true: Trust all upstream proxies and honor proxy headers.
   * - string: Single trusted proxy IP, keyword ('loopback', 'uniquelocal'), or CIDR block (e.g. '127.0.0.1', '10.0.0.0/8').
   * - string[]: Array of trusted proxy IPs, keywords, or CIDR blocks.
   * - (ip: string) => boolean: Custom predicate function.
   * Default: false (peer socket remoteAddress is used unless explicitly trusted).
   */
  trustProxy?: TrustProxyOption;

  /**
   * Session validity in seconds. Default: 86400 (24 hours)
   */
  sessionDurationSeconds?: number;

  /**
   * Custom application title displayed on the dashboard
   */
  title?: string;

  /**
   * Custom RBAC role-to-permissions map to extend or override default roles
   */
  customRolePermissions?: Record<string, Permission[]>;

  /**
   * Automatically attach graceful shutdown handlers (SIGTERM, SIGINT)
   * Default: true
   */
  gracefulShutdown?: boolean | GracefulShutdownOptions;

  /**
   * Enable/configure built-in server health check endpoint (/api/health)
   * Options:
   *  - true: Enabled. Unauthenticated requests receive minimal status/uptime (SEC-05); authenticated requests receive full diagnostics.
   *  - false: Disabled.
   *  - 'detailed': Unauthenticated requests also receive full diagnostics (recommended only for trusted internal private networks).
   * Default: true
   */
  healthCheck?: boolean | 'minimal' | 'detailed';

  /**
   * Custom Content-Security-Policy (CSP) header string, or false to disable built-in CSP headers.
   * Default: Permits dashboard assets and Google Fonts typography ('https://fonts.googleapis.com' and 'https://fonts.gstatic.com').
   */
  csp?: string | boolean;

  /**
   * Pre-seed or auto-provision root administrator credentials on startup.
   * If provided and no users exist in the database, TracerNest automatically creates this admin account,
   * completely eliminating the need for the interactive web setup API behind Nginx/Docker.
   * Can also be set via process.env.TRACERNEST_ADMIN_USERNAME and process.env.TRACERNEST_ADMIN_PASSWORD.
   */
  initialAdmin?: {
    username: string;
    password: string;
  };

  /**
   * Disable the interactive web first-time setup API (`POST /api/auth/setup`).
   * When true, administrators can only be provisioned via `initialAdmin` config, environment variables, or CLI reset utility.
   * Recommended for locked-down production Nginx reverse proxy deployments.
   * Default: false
   */
  disableSetupApi?: boolean;
}

export type TraceNestConfig = TracerNestLoggerConfig;
export type LogVaultConfig = TracerNestLoggerConfig;

export interface ServerHealthInfo {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  uptimeFormatted: string;
  timestamp: string;
  process?: {
    pid: number;
    nodeVersion: string;
    platform: string;
    arch: string;
  };
  memory?: {
    heapUsedMb: number;
    heapTotalMb: number;
    rssMb: number;
    heapUsagePercent: number;
  };
  database?: {
    status: 'connected' | 'error';
    dialect: 'sqlite' | 'mysql';
    hasUsers: boolean;
  };
  logs?: {
    bufferCount: number;
    capacity: number;
    bufferUsagePercent: number;
    totalPurged: number;
    throughputPerSec: number;
  };
}

export interface GracefulShutdownOptions {
  timeoutMs?: number; // Maximum time to wait for shutdown before forced exit, default 5000ms
  signals?: ('SIGTERM' | 'SIGINT' | 'beforeExit')[];
  onShutdown?: () => Promise<void> | void;
  exitProcess?: boolean; // Default: true when signal arrives
}
