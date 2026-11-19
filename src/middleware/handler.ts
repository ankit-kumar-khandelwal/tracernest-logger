import { IncomingMessage, ServerResponse } from 'node:http';
import { URL } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { LogVaultConfig, Permission, UserProfile, ServerHealthInfo, ExcludedRouteRule } from '../types';
import { CryptoSecurity } from '../security/crypto';
import { RBACManager } from '../security/rbac';
import { UserStore } from '../security/user-store';
import { SqlStore } from '../security/sql-store';
import { RateLimiter } from '../security/rate-limiter';
import { RingBuffer } from '../core/ring-buffer';
import { StreamManager } from '../core/stream-manager';
import { AuditLogger } from '../core/audit';
import { AlertDispatcher } from '../alerts/alert-dispatcher';
import { TTLManager } from '../core/ttl-manager';
import { HttpLogger } from './http-logger';
import { extractClientIp } from '../security/client-ip';
import { FastCrypto } from '../security/fast-crypto';
import { getDashboardHtml } from '../ui/dashboard-html';

export class HttpHandler {
  private config: LogVaultConfig;
  private basePath: string;
  private secret: string;
  private userStore: UserStore;
  private sqlStore: SqlStore;
  private alertDispatcher: AlertDispatcher;
  private ttlManager: TTLManager;
  private rbac: RBACManager;
  private ringBuffer: RingBuffer;
  private streamManager: StreamManager;
  private auditLogger: AuditLogger;
  private rateLimiter: RateLimiter;
  private httpLogger?: HttpLogger;
  private streamTickets = new Map<string, { userId: string; expiresAt: number }>();
  private sessionDurationSeconds: number;

  constructor(dependencies: {
    config: LogVaultConfig;
    userStore: UserStore;
    sqlStore: SqlStore;
    alertDispatcher: AlertDispatcher;
    ttlManager: TTLManager;
    rbac: RBACManager;
    ringBuffer: RingBuffer;
    streamManager: StreamManager;
    auditLogger: AuditLogger;
    rateLimiter: RateLimiter;
    secret: string;
    httpLogger?: HttpLogger;
  }) {
    this.config = dependencies.config;
    this.userStore = dependencies.userStore;
    this.sqlStore = dependencies.sqlStore;
    this.alertDispatcher = dependencies.alertDispatcher;
    this.ttlManager = dependencies.ttlManager;
    this.rbac = dependencies.rbac;
    this.ringBuffer = dependencies.ringBuffer;
    this.streamManager = dependencies.streamManager;
    this.auditLogger = dependencies.auditLogger;
    this.rateLimiter = dependencies.rateLimiter;
    this.secret = dependencies.secret;
    this.httpLogger = dependencies.httpLogger;

    let p = dependencies.config.path || '/logvault';
    if (!p.startsWith('/')) p = '/' + p;
    if (p.endsWith('/') && p.length > 1) p = p.slice(0, -1);
    this.basePath = p;

    this.sessionDurationSeconds = dependencies.config.sessionDurationSeconds ?? 86400;
  }

  public middleware(): (req: IncomingMessage, res: ServerResponse, next: (err?: any) => void) => void {
    return (req, res, next) => {
      const expressBaseUrl = (req as any).baseUrl || '';
      const originalUrl = (req as any).originalUrl || req.url || '/';
      const url = req.url || '/';

      const isLogVaultRoute =
        (expressBaseUrl === this.basePath || expressBaseUrl.endsWith(this.basePath)) ||
        (url === this.basePath || url.startsWith(this.basePath + '/') || url.startsWith(this.basePath + '?')) ||
        (originalUrl === this.basePath || originalUrl.startsWith(this.basePath + '/') || originalUrl.startsWith(this.basePath + '?'));

      if (isLogVaultRoute) {
        this.handleRequest(req, res).then(handled => {
          if (!handled) next();
        }).catch(err => {
          console.error('[TracerNest-Logger] Internal Handler Error:', err);
          this.sendJson(res, 500, { error: 'Internal server error', details: err?.message || String(err) });
        });
      } else {
        next();
      }
    };
  }

  public async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const expressBaseUrl = (req as any).baseUrl || '';
    const originalUrl = (req as any).originalUrl || req.url || '/';
    const rawUrl = req.url || '/';
    const rawHost = (req.headers.host || 'localhost').split(',')[0].trim();
    const host = rawHost || 'localhost';

    let subPath = '';
    try {
      if (expressBaseUrl === this.basePath || expressBaseUrl.endsWith(this.basePath)) {
        // Express router stripped basePath from req.url
        const parsed = new URL(rawUrl, `http://${host}`);
        subPath = parsed.pathname;
      } else if (rawUrl === this.basePath || rawUrl.startsWith(this.basePath + '/') || rawUrl.startsWith(this.basePath + '?')) {
        const parsed = new URL(rawUrl, `http://${host}`);
        subPath = parsed.pathname.slice(this.basePath.length);
      } else if (originalUrl === this.basePath || originalUrl.startsWith(this.basePath + '/') || originalUrl.startsWith(this.basePath + '?')) {
        const parsed = new URL(originalUrl, `http://${host}`);
        subPath = parsed.pathname.slice(this.basePath.length);
      } else {
        return false;
      }
    } catch {
      const cleanRaw = rawUrl.split('?')[0];
      if (cleanRaw.startsWith(this.basePath)) {
        subPath = cleanRaw.slice(this.basePath.length);
      } else {
        subPath = cleanRaw;
      }
    }

    if (!subPath || !subPath.startsWith('/')) {
      subPath = '/' + (subPath || '');
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawUrl, `http://${host}`);
    } catch {
      parsedUrl = new URL('/', 'http://localhost');
    }
    const method = (req.method || 'GET').toUpperCase();

    this.setSecurityHeaders(res);

    // 1. Dashboard UI Root & Direct Auth Pages
    if (method === 'GET' && (subPath === '/' || subPath === '' || subPath === '/login' || subPath === '/setup')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      const logoUri = this.resolveLogo(this.config.logo);
      res.end(getDashboardHtml(this.basePath, this.config.title, logoUri));
      return true;
    }

    // 2. Auth Status: Checks if system has users (first-time setup detection)
    if (method === 'GET' && subPath === '/api/auth/status') {
      const initialized = this.userStore.hasUsers();
      this.sendJson(res, 200, { initialized });
      return true;
    }

    // 2.1 Server Health Check Diagnostic (SEC-05: Minimal public liveness probe; detailed diagnostics require authentication or explicit config)
    if (method === 'GET' && (subPath === '/api/health' || subPath === '/health')) {
      const authUser = this.authenticateRequest(req, parsedUrl);
      const allowPublicDetailed = this.config.healthCheck === 'detailed';
      const isDetailed = Boolean(authUser) || allowPublicDetailed;
      const health = this.getHealthInfo(isDetailed);
      const statusCode = health.status === 'unhealthy' ? 503 : 200;
      this.sendJson(res, statusCode, health);
      return true;
    }

    // 3. First-Time Setup: Create Root Administrator
    if (method === 'POST' && (subPath === '/api/auth/setup' || subPath === '/api/auth/setup/')) {
      if (this.userStore.hasUsers()) {
        this.sendJson(res, 400, { error: 'System is already initialized. Please sign in or use reset.' });
        return true;
      }

      const body = await this.readJsonBody(req, res);
      if (body === null) return true;
      const username = body?.username;
      const password = body?.password;

      if (!username || !password) {
        this.sendJson(res, 400, { error: 'Username and password are required' });
        return true;
      }

      try {
        const adminProfile = this.userStore.createUser(username, password, 'admin');
        const token = CryptoSecurity.createToken(
          {
            userId: adminProfile.id,
            username: adminProfile.username,
            role: 'admin',
            tokenVersion: adminProfile.tokenVersion || 1
          },
          this.secret,
          this.sessionDurationSeconds
        );

        this.auditLogger.log({
          action: 'ROOT_ADMIN_SETUP',
          userId: adminProfile.id,
          username: adminProfile.username,
          ip: this.getClientIp(req),
          details: { message: 'First-time setup completed in encrypted SQL store' }
        });

        const isHttps = req.headers['x-forwarded-proto'] === 'https' || (req.socket as any)?.encrypted;
        res.setHeader('Set-Cookie', `tracernest_token=${encodeURIComponent(token)}; Path=${this.basePath || '/'}; HttpOnly; SameSite=Lax${isHttps ? '; Secure' : ''}`);

        this.sendJson(res, 201, {
          token,
          user: {
            ...adminProfile,
            permissions: this.rbac.getPermissions('admin')
          }
        });
      } catch (err: any) {
        console.error('[TracerNest-Logger] Setup error creating admin user:', err?.message || err);
        this.sendJson(res, 400, { error: err.message || 'Failed to create root administrator' });
      }
      return true;
    }

    // 4. Standard Login
    if (method === 'POST' && subPath === '/api/auth/login') {
      const clientIp = this.getClientIp(req);
      const ipLimit = this.rateLimiter.consume(`login:ip:${clientIp}`);

      if (!ipLimit.allowed) {
        this.sendJson(res, 429, {
          error: `Too many login attempts. Please try again in ${ipLimit.retryAfterSec} seconds.`
        });
        return true;
      }

      const body = await this.readJsonBody(req, res);
      if (body === null) return true;
      const username = body?.username;
      const password = body?.password;

      if (!username || !password) {
        this.sendJson(res, 400, { error: 'Username and password are required' });
        return true;
      }

      // SEC-10: Dual throttling - Account-keyed login throttle to protect against distributed brute-force
      const normalizedUsername = typeof username === 'string' ? username.toLowerCase().trim() : '';
      const userLimit = this.rateLimiter.consume(`login:user:${normalizedUsername}`);
      if (!userLimit.allowed) {
        this.sendJson(res, 429, {
          error: `Too many login attempts for this account. Please try again in ${userLimit.retryAfterSec} seconds.`
        });
        return true;
      }

      const user = this.userStore.verifyCredentials(username, password);
      if (!user) {
        this.auditLogger.log({
          action: 'AUTH_LOGIN_FAILED',
          username,
          ip: clientIp
        });
        this.sendJson(res, 401, { error: 'Invalid username or password' });
        return true;
      }

      this.rateLimiter.reset(`login:ip:${clientIp}`);
      this.rateLimiter.reset(`login:${clientIp}`);
      this.rateLimiter.reset(`login:user:${normalizedUsername}`);

      const permissions = this.rbac.getPermissions(user.role);
      const token = CryptoSecurity.createToken(
        {
          userId: user.id,
          username: user.username,
          role: user.role,
          tokenVersion: user.tokenVersion || 1
        },
        this.secret,
        this.sessionDurationSeconds
      );

      this.auditLogger.log({
        action: 'AUTH_LOGIN_SUCCESS',
        userId: user.id,
        username: user.username,
        ip: clientIp
      });

      const isHttps = req.headers['x-forwarded-proto'] === 'https' || (req.socket as any)?.encrypted;
      res.setHeader('Set-Cookie', `tracernest_token=${encodeURIComponent(token)}; Path=${this.basePath || '/'}; HttpOnly; SameSite=Lax${isHttps ? '; Secure' : ''}`);

      this.sendJson(res, 200, {
        token,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          mustChangePassword: Boolean(user.mustChangePassword),
          permissions
        },
        mustChangePassword: Boolean(user.mustChangePassword)
      });
      return true;
    }

    // 4.1 Reset Setup via Web Disabled (Only server-side CLI command permitted)
    if (method === 'POST' && subPath === '/api/auth/reset') {
      this.sendJson(res, 403, {
        error: 'Web reset is disabled for security. Run "npm run reset--admin--user" in your server terminal to reset credentials.'
      });
      return true;
    }

    // Authenticate subsequent API routes
    let user = this.authenticateRequest(req, parsedUrl);

    // SEC-01: Support short-lived single-use ticket for EventSource SSE stream
    if (!user && subPath === '/api/logs/stream' && parsedUrl.searchParams.has('ticket')) {
      const ticket = parsedUrl.searchParams.get('ticket')!;
      const ticketUserId = this.consumeStreamTicket(ticket);
      if (ticketUserId) {
        const dbUser = this.userStore.getUserById(ticketUserId);
        if (dbUser) {
          user = {
            id: dbUser.id,
            username: dbUser.username,
            role: dbUser.role,
            permissions: this.rbac.getPermissions(dbUser.role),
            createdAt: dbUser.createdAt,
            lastLoginAt: dbUser.lastLoginAt,
            mustChangePassword: dbUser.mustChangePassword,
            tokenVersion: dbUser.tokenVersion
          };
        }
      }
    }

    if (!user) {
      this.sendJson(res, 401, { error: 'Unauthorized: Valid Bearer token required' });
      return true;
    }

    // 5. Current User Info
    if (method === 'GET' && subPath === '/api/auth/me') {
      const userRecord = this.userStore.getUserById(user.id);
      const permissions = this.rbac.getPermissions(user.role);
      this.sendJson(res, 200, {
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          mustChangePassword: Boolean(userRecord?.mustChangePassword),
          permissions
        }
      });
      return true;
    }

    // 5.1 Change Password (Required when temporary reset password is used)
    if (method === 'POST' && subPath === '/api/auth/change-password') {
      const body = await this.readJsonBody(req, res);
      if (body === null) return true;
      const newPassword = body?.newPassword;

      if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
        this.sendJson(res, 400, { error: 'New password must be at least 6 characters' });
        return true;
      }

      try {
        this.userStore.changePassword(user.id, newPassword);

        this.auditLogger.log({
          action: 'AUTH_PASSWORD_CHANGED',
          userId: user.id,
          username: user.username,
          ip: this.getClientIp(req),
          details: { message: 'Password changed successfully in SQL store' }
        });

        const refreshedUser = this.userStore.getUserById(user.id);
        const freshToken = CryptoSecurity.createToken(
          {
            userId: user.id,
            username: user.username,
            role: user.role,
            tokenVersion: refreshedUser?.tokenVersion || 1
          },
          this.secret,
          this.sessionDurationSeconds
        );

        const isHttps = req.headers['x-forwarded-proto'] === 'https' || (req.socket as any)?.encrypted;
        res.setHeader('Set-Cookie', `tracernest_token=${encodeURIComponent(freshToken)}; Path=${this.basePath || '/'}; HttpOnly; SameSite=Lax${isHttps ? '; Secure' : ''}`);

        this.sendJson(res, 200, {
          success: true,
          message: 'Password updated successfully',
          token: freshToken
        });
      } catch (err: any) {
        this.sendJson(res, 400, { error: err.message || 'Failed to update password' });
      }
      return true;
    }

    // 5.2 Logout (Clear session cookie)
    if (method === 'POST' && subPath === '/api/auth/logout') {
      res.setHeader('Set-Cookie', `tracernest_token=; Path=${this.basePath || '/'}; Expires=Thu, 01 Jan 1970 00:00:01 GMT; HttpOnly; SameSite=Lax`);
      this.sendJson(res, 200, { success: true, message: 'Logged out successfully' });
      return true;
    }

    // 5.3 Generate Short-Lived Single-Use Stream Ticket for EventSource (SEC-01)
    if (method === 'POST' && subPath === '/api/logs/stream/ticket') {
      if (!this.checkPermission(res, user.role, 'logs:stream')) return true;
      const ticket = this.createStreamTicket(user.id);
      this.sendJson(res, 200, { ticket, expiresIn: 15 });
      return true;
    }

    // 6. Query Logs
    if (method === 'GET' && subPath === '/api/logs') {
      if (!this.checkPermission(res, user.role, 'logs:read')) return true;

      const search = parsedUrl.searchParams.get('search') || undefined;
      const isRegex = parsedUrl.searchParams.get('isRegex') === 'true';
      const level = (parsedUrl.searchParams.get('level') as any) || undefined;
      const source = (parsedUrl.searchParams.get('source') as any) || undefined;
      const from = parsedUrl.searchParams.get('from') ? parseInt(parsedUrl.searchParams.get('from')!, 10) : undefined;
      const to = parsedUrl.searchParams.get('to') ? parseInt(parsedUrl.searchParams.get('to')!, 10) : undefined;
      const limit = parsedUrl.searchParams.get('limit') ? parseInt(parsedUrl.searchParams.get('limit')!, 10) : 100;
      const offset = parsedUrl.searchParams.get('offset') ? parseInt(parsedUrl.searchParams.get('offset')!, 10) : 0;
      const orderParam = (parsedUrl.searchParams.get('order') || parsedUrl.searchParams.get('sort'))?.toLowerCase();
      const order = orderParam === 'asc' || orderParam === 'time_asc' ? 'asc' : 'desc';
      const sortBy = parsedUrl.searchParams.get('sortBy') === 'level' ? 'level' : 'timestamp';

      const result = this.ringBuffer.query({
        search,
        isRegex,
        level,
        source,
        from,
        to,
        limit: Math.min(limit, 1000),
        offset,
        order,
        sortBy
      });

      if (parsedUrl.searchParams.get('decrypt') === 'true') {
        result.logs = result.logs.map(l => this.decryptLogEntry(l));
      }

      this.sendJson(res, 200, result);
      return true;
    }

    // 6.1 On-Demand Payload Decryption Endpoint
    if (method === 'POST' && (subPath === '/api/logs/decrypt' || subPath === '/api/logs/decrypt-payload')) {
      if (!this.checkPermission(res, user.role, 'logs:read')) return true;
      const body = await this.readJsonBody(req, res);
      if (!body) return true;

      const payload = body.payload || body;
      const key = body.key || this.secret;
      try {
        const decrypted = FastCrypto.decryptPayload(payload, key);
        this.sendJson(res, 200, { success: true, decrypted });
      } catch (err: any) {
        this.sendJson(res, 400, { success: false, error: err.message || 'Decryption failed' });
      }
      return true;
    }

    // 7. Live SSE Log Stream
    if (method === 'GET' && subPath === '/api/logs/stream') {
      if (!this.checkPermission(res, user.role, 'logs:stream')) return true;

      const level = (parsedUrl.searchParams.get('level') as any) || undefined;
      const search = parsedUrl.searchParams.get('search') || undefined;
      const clientId = `client_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      this.streamManager.addClient(clientId, res, { level, search });
      return true;
    }

    // 8. Clear Buffer
    if (method === 'DELETE' && subPath === '/api/logs') {
      if (!this.checkPermission(res, user.role, 'logs:clear')) return true;

      const clearedCount = this.ringBuffer.size();
      this.ringBuffer.clear();

      this.auditLogger.log({
        action: 'LOGS_CLEARED',
        userId: user.id,
        username: user.username,
        ip: this.getClientIp(req),
        details: { count: clearedCount }
      });

      this.sendJson(res, 200, { message: 'Buffer cleared successfully', clearedCount });
      return true;
    }

    // 9. Export Logs
    if (method === 'GET' && subPath === '/api/logs/export') {
      if (!this.checkPermission(res, user.role, 'logs:export')) return true;

      const rawFmt = (parsedUrl.searchParams.get('format') || 'json').toLowerCase();
      const format = rawFmt === 'csv' ? 'csv' : rawFmt === 'ndjson' ? 'ndjson' : 'json';
      const search = parsedUrl.searchParams.get('search') || undefined;
      const isRegex = parsedUrl.searchParams.get('isRegex') === 'true';
      const level = (parsedUrl.searchParams.get('level') as any) || undefined;
      const source = (parsedUrl.searchParams.get('source') as any) || undefined;
      const from = parsedUrl.searchParams.get('from') ? parseInt(parsedUrl.searchParams.get('from')!, 10) : undefined;
      const to = parsedUrl.searchParams.get('to') ? parseInt(parsedUrl.searchParams.get('to')!, 10) : undefined;

      const result = this.ringBuffer.query({ search, isRegex, level, source, from, to, limit: 10000 });
      if (parsedUrl.searchParams.get('decrypt') === 'true') {
        result.logs = result.logs.map(l => this.decryptLogEntry(l));
      }
      const filename = `tracernest-export-${Date.now()}.${format}`;

      this.auditLogger.log({
        action: 'LOGS_EXPORTED',
        userId: user.id,
        username: user.username,
        ip: this.getClientIp(req),
        details: { format, count: result.logs.length }
      });

      if (format === 'csv') {
        const header = 'id,timestamp,iso_time,level,source,message,url,status\n';
        const rows = result.logs.map(l => {
          const escapedMsg = `"${l.message.replace(/"/g, '""')}"`;
          const url = l.metadata?.http?.url ? `"${l.metadata.http.url}"` : '""';
          const status = l.metadata?.http?.statusCode ?? '';
          return `${l.id},${l.timestamp},"${new Date(l.timestamp).toISOString()}",${l.level},${l.source},${escapedMsg},${url},${status}`;
        }).join('\n');

        res.writeHead(200, {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`
        });
        res.end(header + rows);
        return true;
      }

      if (format === 'ndjson') {
        res.writeHead(200, {
          'Content-Type': 'application/x-ndjson; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`
        });
        const ndjsonLines = result.logs.map(l => JSON.stringify(l)).join('\n');
        res.end(ndjsonLines);
        return true;
      }

      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`
      });
      res.end(JSON.stringify(result.logs, null, 2));
      return true;
    }

    // 10. Metrics (SEC-03: Gated by logs:read permission check)
    if (method === 'GET' && subPath === '/api/metrics') {
      if (!this.checkPermission(res, user.role, 'logs:read')) return true;
      const stats = this.ringBuffer.getStats();
      this.sendJson(res, 200, { stats });
      return true;
    }

    // 11. TTL System: Get Config and Rules
    if (method === 'GET' && subPath === '/api/ttl') {
      if (!this.checkPermission(res, user.role, 'logs:read')) return true;
      const rules = this.ttlManager.listRules();
      const defaultTtlSeconds = this.ttlManager.getDefaultTtl();
      const totalPurged = this.ttlManager.getTotalPurged();
      this.sendJson(res, 200, { rules, defaultTtlSeconds, totalPurged });
      return true;
    }

    // 12. TTL System: Create Rule
    if (method === 'POST' && subPath === '/api/ttl/rules') {
      if (!this.checkPermission(res, user.role, 'ttl:manage')) return true;
      const body = await this.readJsonBody(req, res);
      if (body === null) return true;
      const ttlSeconds = parseInt(body?.ttlSeconds, 10);

      if (isNaN(ttlSeconds) || ttlSeconds <= 0) {
        this.sendJson(res, 400, { error: 'Valid positive ttlSeconds is required' });
        return true;
      }

      try {
        const rule = this.ttlManager.addRule({
          name: body.name,
          level: body.level || 'all',
          source: body.source || 'all',
          pattern: body.pattern,
          ttlSeconds
        });

        this.auditLogger.log({
          action: 'TTL_RULE_CREATED',
          userId: user.id,
          username: user.username,
          details: { rule }
        });

        this.sendJson(res, 201, { rule });
      } catch (err: any) {
        this.sendJson(res, 400, { error: err.message });
      }
      return true;
    }

    // 13. TTL System: Delete Rule
    if (method === 'DELETE' && subPath.startsWith('/api/ttl/rules/')) {
      if (!this.checkPermission(res, user.role, 'ttl:manage')) return true;
      const ruleId = subPath.replace('/api/ttl/rules/', '').trim();
      const success = this.ttlManager.deleteRule(ruleId);
      if (success) {
        this.auditLogger.log({
          action: 'TTL_RULE_DELETED',
          userId: user.id,
          username: user.username,
          details: { ruleId }
        });
        this.sendJson(res, 200, { message: 'TTL rule deleted' });
      } else {
        this.sendJson(res, 404, { error: 'TTL rule not found' });
      }
      return true;
    }

    // 14. TTL System: Manual Purge Sweep
    if (method === 'POST' && subPath === '/api/ttl/purge') {
      if (!this.checkPermission(res, user.role, 'ttl:manage')) return true;
      const purged = this.ttlManager.sweep();
      this.auditLogger.log({
        action: 'TTL_MANUAL_PURGE',
        userId: user.id,
        username: user.username,
        details: { purgedCount: purged }
      });
      this.sendJson(res, 200, { purged, remaining: this.ringBuffer.size() });
      return true;
    }

    // 15. Users Management: List
    if (method === 'GET' && subPath === '/api/users') {
      if (!this.checkPermission(res, user.role, 'users:manage')) return true;
      const users = this.userStore.listUsers();
      this.sendJson(res, 200, { users });
      return true;
    }

    // 16. Users Management: Create
    if (method === 'POST' && subPath === '/api/users') {
      if (!this.checkPermission(res, user.role, 'users:manage')) return true;
      const body = await this.readJsonBody(req, res);
      if (body === null) return true;
      try {
        const newUser = this.userStore.createUser(body.username, body.password, body.role);
        this.auditLogger.log({
          action: 'USER_CREATED',
          userId: user.id,
          username: user.username,
          details: { createdUser: newUser.username, role: newUser.role }
        });
        this.sendJson(res, 201, { user: newUser });
      } catch (err: any) {
        this.sendJson(res, 400, { error: err.message });
      }
      return true;
    }

    // 17. Users Management: Delete
    if (method === 'DELETE' && subPath.startsWith('/api/users/')) {
      if (!this.checkPermission(res, user.role, 'users:manage')) return true;
      const targetId = subPath.replace('/api/users/', '').trim();
      try {
        const success = this.userStore.deleteUser(targetId);
        if (success) {
          this.auditLogger.log({
            action: 'USER_DELETED',
            userId: user.id,
            username: user.username,
            details: { targetUserId: targetId }
          });
          this.sendJson(res, 200, { message: 'User deleted' });
        } else {
          this.sendJson(res, 404, { error: 'User not found' });
        }
      } catch (err: any) {
        this.sendJson(res, 400, { error: err.message });
      }
      return true;
    }

    // 17.1 Users Management: Update Role (SEC-02: Revokes old sessions and assigns new role)
    if ((method === 'PUT' || method === 'PATCH') && subPath.startsWith('/api/users/')) {
      if (!this.checkPermission(res, user.role, 'users:manage')) return true;
      const targetId = subPath.replace('/api/users/', '').split('/')[0].trim();
      const body = await this.readJsonBody(req, res);
      if (body === null) return true;
      const newRole = body?.role;
      if (!newRole || !this.rbac.listRoles().includes(newRole.toLowerCase())) {
        this.sendJson(res, 400, { error: 'Invalid or missing role' });
        return true;
      }
      try {
        const success = this.userStore.updateRole(targetId, newRole);
        if (success) {
          this.auditLogger.log({
            action: 'USER_ROLE_UPDATED',
            userId: user.id,
            username: user.username,
            details: { targetUserId: targetId, newRole }
          });
          this.sendJson(res, 200, { message: 'User role updated', role: newRole });
        } else {
          this.sendJson(res, 404, { error: 'User not found' });
        }
      } catch (err: any) {
        this.sendJson(res, 400, { error: err.message });
      }
      return true;
    }

    // 18. Alert Integrations: List
    if (method === 'GET' && subPath === '/api/alerts') {
      if (!this.checkPermission(res, user.role, 'alerts:manage')) return true;
      const configs = this.sqlStore.listAlertConfigs();
      this.sendJson(res, 200, { configs });
      return true;
    }

    // 19. Alert Integrations: Save / Update
    if (method === 'POST' && subPath === '/api/alerts') {
      if (!this.checkPermission(res, user.role, 'alerts:manage')) return true;
      const body = await this.readJsonBody(req, res);
      if (body === null) return true;
      const channel = body?.channel as 'email' | 'teams';
      const enabled = Boolean(body?.enabled);
      const levelThreshold = body?.levelThreshold || 'error';
      const settings = body?.settings || {};

      if (!channel || (channel !== 'email' && channel !== 'teams')) {
        this.sendJson(res, 400, { error: 'Invalid alert channel' });
        return true;
      }

      this.sqlStore.saveAlertConfig(channel, enabled, levelThreshold, settings);

      this.auditLogger.log({
        action: 'ALERT_CONFIG_UPDATED',
        userId: user.id,
        username: user.username,
        ip: this.getClientIp(req),
        details: { channel, enabled, levelThreshold }
      });

      this.sendJson(res, 200, { message: `${channel.toUpperCase()} configuration encrypted and saved to SQL!` });
      return true;
    }

    // 20. Alert Integrations: Test
    if (method === 'POST' && subPath === '/api/alerts/test') {
      if (!this.checkPermission(res, user.role, 'alerts:manage')) return true;
      const body = await this.readJsonBody(req, res);
      if (body === null) return true;
      const channel = body?.channel as 'email' | 'teams';

      if (!channel) {
        this.sendJson(res, 400, { error: 'Channel is required' });
        return true;
      }

      const result = await this.alertDispatcher.testAlert(channel);
      this.sendJson(res, 200, result);
      return true;
    }

    // 21. Security Audit Logs
    if (method === 'GET' && subPath === '/api/audit') {
      if (!this.checkPermission(res, user.role, 'audit:read')) return true;
      const result = this.auditLogger.query({ limit: 100 });
      this.sendJson(res, 200, result);
      return true;
    }

    // 22. Excluded Routes: List
    if (method === 'GET' && subPath === '/api/excluded-routes') {
      if (!this.checkPermission(res, user.role, 'logs:read')) return true;
      const rules = this.sqlStore.getExcludedRoutes();
      const staticRules = (this.config.excludeRoutes || this.config.excludePaths || this.config.ignoreRoutes || []);
      this.sendJson(res, 200, { rules, staticCount: staticRules.length });
      return true;
    }

    // 23. Excluded Routes: Create
    if (method === 'POST' && subPath === '/api/excluded-routes') {
      if (!this.checkPermission(res, user.role, 'users:manage')) return true;
      const body = await this.readJsonBody(req, res);
      if (body === null) return true;
      const rawPath = body?.path?.trim();
      if (!rawPath) {
        this.sendJson(res, 400, { error: 'Route path is required (e.g. /api/auth/login or /api/payments/*)' });
        return true;
      }
      const path = rawPath.startsWith('/') || rawPath.startsWith('*') ? rawPath : '/' + rawPath;
      const methodChoice = (body?.method || 'ALL').toUpperCase();
      const description = (body?.description || '').trim();

      const rules = this.sqlStore.getExcludedRoutes();
      const existing = rules.find(r => r.path === path && (r.method || 'ALL') === methodChoice);
      if (existing) {
        this.sendJson(res, 400, { error: 'An exclusion rule for this path and method already exists' });
        return true;
      }

      const newRule: ExcludedRouteRule = {
        id: `excl_${Date.now()}_${randomBytes(3).toString('hex')}`,
        path,
        method: methodChoice,
        description,
        enabled: true,
        createdAt: Date.now()
      };
      rules.unshift(newRule);
      this.sqlStore.saveExcludedRoutes(rules);
      if (this.httpLogger) {
        this.httpLogger.setDynamicExcludedRoutes(rules);
      }

      this.auditLogger.log({
        action: 'EXCLUDED_ROUTE_ADDED',
        userId: user.id,
        username: user.username,
        ip: this.getClientIp(req),
        details: { path, method: methodChoice, description }
      });

      this.sendJson(res, 201, { rule: newRule });
      return true;
    }

    // 24. Excluded Routes: Toggle Enabled
    if ((method === 'PATCH' || method === 'POST') && subPath.startsWith('/api/excluded-routes/') && subPath.endsWith('/toggle')) {
      if (!this.checkPermission(res, user.role, 'users:manage')) return true;
      const ruleId = subPath.replace('/api/excluded-routes/', '').replace('/toggle', '').trim();
      const rules = this.sqlStore.getExcludedRoutes();
      const rule = rules.find(r => r.id === ruleId);
      if (!rule) {
        this.sendJson(res, 404, { error: 'Exclusion rule not found' });
        return true;
      }
      rule.enabled = !rule.enabled;
      this.sqlStore.saveExcludedRoutes(rules);
      if (this.httpLogger) {
        this.httpLogger.setDynamicExcludedRoutes(rules);
      }

      this.auditLogger.log({
        action: 'EXCLUDED_ROUTE_TOGGLED',
        userId: user.id,
        username: user.username,
        details: { ruleId, enabled: rule.enabled }
      });

      this.sendJson(res, 200, { rule });
      return true;
    }

    // 25. Excluded Routes: Delete
    if (method === 'DELETE' && subPath.startsWith('/api/excluded-routes/')) {
      if (!this.checkPermission(res, user.role, 'users:manage')) return true;
      const ruleId = subPath.replace('/api/excluded-routes/', '').trim();
      const rules = this.sqlStore.getExcludedRoutes();
      const filtered = rules.filter(r => r.id !== ruleId);
      if (filtered.length === rules.length) {
        this.sendJson(res, 404, { error: 'Exclusion rule not found' });
        return true;
      }
      this.sqlStore.saveExcludedRoutes(filtered);
      if (this.httpLogger) {
        this.httpLogger.setDynamicExcludedRoutes(filtered);
      }

      this.auditLogger.log({
        action: 'EXCLUDED_ROUTE_DELETED',
        userId: user.id,
        username: user.username,
        ip: this.getClientIp(req),
        details: { ruleId }
      });

      this.sendJson(res, 200, { message: 'Exclusion rule deleted' });
      return true;
    }

    this.sendJson(res, 404, { error: 'Route not found in LogVault' });
    return true;
  }

  private createStreamTicket(userId: string): string {
    const now = Date.now();
    for (const [t, data] of this.streamTickets.entries()) {
      if (now > data.expiresAt) this.streamTickets.delete(t);
    }
    const ticket = randomBytes(24).toString('hex');
    this.streamTickets.set(ticket, {
      userId,
      expiresAt: now + 15000 // 15 seconds TTL
    });
    return ticket;
  }

  private consumeStreamTicket(ticket: string): string | null {
    const data = this.streamTickets.get(ticket);
    if (!data) return null;
    this.streamTickets.delete(ticket); // Single use only
    if (Date.now() > data.expiresAt) {
      return null;
    }
    return data.userId;
  }

  private authenticateRequest(req: IncomingMessage, url: URL): UserProfile | null {
    let token: string | null = null;

    // 1. Authorization header: "Bearer <token>"
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    }

    // 2. Cookie fallback for browser same-origin requests (e.g. SSE EventSource)
    if (!token && req.headers.cookie) {
      const match = req.headers.cookie.match(/(?:^|;\s*)tracernest_token=([^;]+)/);
      if (match) {
        token = decodeURIComponent(match[1]).trim();
      }
    }

    // SEC-01: No fallback to url.searchParams.get('token')!
    // Query string bearer tokens are strictly rejected to prevent URL leakage in proxy/browser logs.

    if (!token) return null;

    const payload = CryptoSecurity.verifyToken<{ userId: string; username: string; role: string; tokenVersion?: number }>(token, this.secret);
    if (!payload || !payload.userId) return null;

    // SEC-02: Resolve current user from database to prevent stale / revoked sessions
    const user = this.userStore.getUserById(payload.userId);
    if (!user) {
      // User account was deleted or does not exist
      return null;
    }

    // SEC-02: Check token version revocation (invalidated on password change or role modification)
    const currentTokenVersion = user.tokenVersion || 1;
    const tokenVersionClaim = payload.tokenVersion || 1;
    if (currentTokenVersion !== tokenVersionClaim) {
      // Session has been revoked
      return null;
    }

    // SEC-02: Use live database role rather than stale token payload
    const activeRole = user.role;

    return {
      id: user.id,
      username: user.username,
      role: activeRole,
      permissions: this.rbac.getPermissions(activeRole),
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
      mustChangePassword: user.mustChangePassword,
      tokenVersion: user.tokenVersion
    };
  }

  private checkPermission(res: ServerResponse, role: string, permission: Permission): boolean {
    if (!this.rbac.hasPermission(role, permission)) {
      this.sendJson(res, 403, {
        error: `Forbidden: Role '${role}' lacks permission '${permission}'`
      });
      return false;
    }
    return true;
  }

  private setSecurityHeaders(res: ServerResponse): void {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');

    if (this.config.csp === false) {
      return;
    }

    if (typeof this.config.csp === 'string') {
      res.setHeader('Content-Security-Policy', this.config.csp);
      return;
    }

    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self' 'unsafe-inline'; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "font-src 'self' data: https://fonts.gstatic.com; " +
      "img-src 'self' data:; " +
      "connect-src 'self'"
    );
  }

  public getHealthInfo(isDetailed: boolean = true): ServerHealthInfo {
    const uptimeSec = Math.round(process.uptime());
    const days = Math.floor(uptimeSec / 86400);
    const hours = Math.floor((uptimeSec % 86400) / 3600);
    const mins = Math.floor((uptimeSec % 3600) / 60);
    const secs = uptimeSec % 60;
    const uptimeFormatted = `${days > 0 ? days + 'd ' : ''}${hours > 0 ? hours + 'h ' : ''}${mins > 0 ? mins + 'm ' : ''}${secs}s`;

    const dbHealth = this.sqlStore.checkHealth();
    const stats = this.ringBuffer.getStats();

    const isDegraded = !dbHealth.connected || stats.errorCount > 500;
    const status = !dbHealth.connected ? 'unhealthy' : (isDegraded ? 'degraded' : 'healthy');

    // Minimal public health check (SEC-05: prevents unauthenticated host fingerprinting)
    if (!isDetailed) {
      return {
        status,
        uptime: uptimeSec,
        uptimeFormatted,
        timestamp: new Date().toISOString()
      };
    }

    const mem = process.memoryUsage();
    return {
      status,
      uptime: uptimeSec,
      uptimeFormatted,
      timestamp: new Date().toISOString(),
      process: {
        pid: process.pid,
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch
      },
      memory: {
        heapUsedMb: Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100,
        heapTotalMb: Math.round((mem.heapTotal / 1024 / 1024) * 100) / 100,
        rssMb: Math.round((mem.rss / 1024 / 1024) * 100) / 100,
        heapUsagePercent: Math.round((mem.heapUsed / mem.heapTotal) * 100)
      },
      database: {
        status: dbHealth.connected ? 'connected' : 'error',
        dialect: dbHealth.dialect,
        hasUsers: this.userStore.hasUsers()
      },
      logs: {
        bufferCount: this.ringBuffer.size(),
        capacity: this.config.bufferSize || 5000,
        bufferUsagePercent: stats.bufferUsagePercent,
        totalPurged: stats.expiredLogsPurged,
        throughputPerSec: stats.logsPerSecond
      }
    };
  }

  private decryptLogEntry(entry: any): any {
    if (!entry.metadata?.http) return entry;
    const http = entry.metadata.http;
    const key = this.secret;
    if (!key) return entry;

    let decryptedReq = http.requestBody;
    if (http.requestBody && (http.requestBody.encrypted || http.requestBody.__encrypted)) {
      try {
        decryptedReq = FastCrypto.decryptPayload(http.requestBody, key);
      } catch {}
    }

    let decryptedRes = http.responseBody;
    if (http.responseBody && (http.responseBody.encrypted || http.responseBody.__encrypted)) {
      try {
        decryptedRes = FastCrypto.decryptPayload(http.responseBody, key);
      } catch {}
    }

    return {
      ...entry,
      metadata: {
        ...entry.metadata,
        http: {
          ...http,
          requestBody: decryptedReq,
          responseBody: decryptedRes,
          decrypted: true
        }
      }
    };
  }

  private getClientIp(req: IncomingMessage): string {
    return extractClientIp(req, this.config.trustProxy);
  }

  private sendJson(res: ServerResponse, statusCode: number, data: any): void {
    if (res.headersSent || (res as any).writableEnded) return;
    try {
      const payload = JSON.stringify(data);
      res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(payload)
      });
      res.end(payload);
    } catch (err: any) {
      console.error('[TracerNest-Logger] sendJson failure:', err?.message || err);
    }
  }

  /**
   * Safely parse incoming JSON request body with strict size bounding.
   *
   * SEC-09 Remediation:
   * - Validates Content-Length header up front if provided.
   * - Strict byte bound (default: 1 MiB).
   * - Immediately removes stream listeners and nullifies body accumulator upon threshold breach.
   * - Safely drains/resumes stream to prevent socket hang.
   * - Responds with HTTP 413 Payload Too Large and resolves null so caller can terminate cleanly.
   */
  private async readJsonBody(req: IncomingMessage, res?: ServerResponse, maxBytes: number = 1024 * 1024): Promise<any | null> {
    // 0. Pre-check Content-Length header if provided
    const contentLengthHeader = req.headers['content-length'];
    if (contentLengthHeader) {
      const contentLength = parseInt(contentLengthHeader, 10);
      if (!isNaN(contentLength) && contentLength > maxBytes) {
        if (typeof req.resume === 'function') {
          req.resume(); // Drain and discard
        }
        if (res && !res.headersSent) {
          this.sendJson(res, 413, { error: 'Payload Too Large: Request body exceeds size limit' });
        }
        return null;
      }
    }

    // 1. If body was already parsed by upstream body parser (express.json(), bodyParser, etc.)
    if ((req as any).body !== undefined) {
      if (typeof (req as any).body === 'object' && (req as any).body !== null) {
        try {
          if (Buffer.byteLength(JSON.stringify((req as any).body)) > maxBytes) {
            if (res && !res.headersSent) {
              this.sendJson(res, 413, { error: 'Payload Too Large: Request body exceeds size limit' });
            }
            return null;
          }
        } catch {}
        return (req as any).body;
      }
      if (typeof (req as any).body === 'string') {
        if (Buffer.byteLength((req as any).body) > maxBytes) {
          if (res && !res.headersSent) {
            this.sendJson(res, 413, { error: 'Payload Too Large: Request body exceeds size limit' });
          }
          return null;
        }
        if ((req as any).body.trim().length > 0) {
          try {
            return JSON.parse((req as any).body);
          } catch {
            return {};
          }
        }
        return {};
      }
    }

    // 2. If stream has already finished or has ended
    if (req.complete || (req as any).readableEnded || !(req as any).readable) {
      return (req as any).body || {};
    }

    // 3. Otherwise read from incoming stream with safety timeout and strict byte bound
    return new Promise((resolve) => {
      let body = '';
      let receivedBytes = 0;
      let limitExceeded = false;
      let settled = false;

      const cleanup = () => {
        clearTimeout(timer);
        req.removeListener('data', onData);
        req.removeListener('end', onEnd);
        req.removeListener('error', onError);
        req.removeListener('close', onClose);
      };

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve((req as any).body || {});
      }, 5000);

      const onData = (chunk: Buffer | string) => {
        if (limitExceeded || settled) return;
        const chunkLen = typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length;
        receivedBytes += chunkLen;
        if (receivedBytes > maxBytes) {
          limitExceeded = true;
          settled = true;
          cleanup();
          body = ''; // Stop retaining chunks immediately and reclaim memory

          // Safely resume stream so incoming bytes drain and socket does not stall
          if (typeof req.resume === 'function') {
            req.resume();
          }

          if (res && !res.headersSent) {
            this.sendJson(res, 413, { error: 'Payload Too Large: Request body exceeds size limit' });
          }
          resolve(null);
          return;
        }
        body += chunk;
      };

      const onEnd = () => {
        if (settled) return;
        settled = true;
        cleanup();
        try {
          resolve(body ? JSON.parse(body) : (req as any).body || {});
        } catch {
          resolve((req as any).body || {});
        } finally {
          body = '';
        }
      };

      const onError = () => {
        if (settled) return;
        settled = true;
        cleanup();
        body = '';
        resolve((req as any).body || {});
      };

      const onClose = () => {
        if (settled) return;
        settled = true;
        cleanup();
        body = '';
        resolve((req as any).body || {});
      };

      req.on('data', onData);
      req.on('end', onEnd);
      req.on('error', onError);
      req.on('close', onClose);
    });
  }

  private resolveLogo(logo?: string): string | undefined {
    if (!logo) return undefined;
    const trimmed = logo.trim();
    if (trimmed.startsWith('<svg')) {
      return `data:image/svg+xml;base64,${Buffer.from(trimmed).toString('base64')}`;
    }
    if (trimmed.startsWith('data:image/svg+xml;utf8,') && (trimmed.includes('"') || trimmed.includes('<'))) {
      const raw = trimmed.slice('data:image/svg+xml;utf8,'.length);
      return `data:image/svg+xml;base64,${Buffer.from(raw).toString('base64')}`;
    }
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:') || trimmed.startsWith('/')) {
      return trimmed;
    }
    try {
      if (existsSync(trimmed)) {
        const ext = trimmed.split('.').pop()?.toLowerCase();
        const mimeType = ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png';
        const fileContent = readFileSync(trimmed);
        return `data:${mimeType};base64,${fileContent.toString('base64')}`;
      }
    } catch {}
    return trimmed;
  }
}
