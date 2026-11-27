import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, unlinkSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { IncomingMessage, ServerResponse } from 'node:http';
import { EventEmitter } from 'node:events';
import { Socket } from 'node:net';
import vm from 'node:vm';
import { TracerNestLogger, TraceNest, LogVault, DEFAULT_TRACERNEST_LOGO, DEFAULT_TRACERNEST_BANNER, DEFAULT_TRACENEST_LOGO, DEFAULT_TRACENEST_BANNER, extractRealIp } from '../index';
import { getDashboardHtml } from '../ui/dashboard-html';

interface MockResponseResult {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  json: () => any;
}

function createMockReqRes(options: {
  method?: string;
  url: string;
  headers?: Record<string, string>;
  body?: any;
}): { req: IncomingMessage; res: ServerResponse; getResponse: () => MockResponseResult } {
  const socket = new Socket();
  const req = new IncomingMessage(socket);
  req.method = options.method || 'GET';
  req.url = options.url;
  req.headers = { host: 'localhost', ...(options.headers || {}) };

  let statusCode = 200;
  const headers: Record<string, string> = {};
  let body = '';

  const resEmitter = new EventEmitter();

  const res = Object.assign(resEmitter, {
    statusCode: 200,
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = value;
    },
    writeHead(code: number, hdrs?: Record<string, string>) {
      statusCode = code;
      this.statusCode = code;
      if (hdrs) {
        for (const [k, v] of Object.entries(hdrs)) {
          headers[k.toLowerCase()] = v;
        }
      }
      return this;
    },
    write(chunk: any) {
      if (chunk) body += chunk.toString();
      return true;
    },
    end(chunk?: any) {
      if (chunk) body += chunk.toString();
      resEmitter.emit('finish');
      return this;
    }
  }) as unknown as ServerResponse;

  if (options.body) {
    const raw = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
    req.push(raw);
    (req as any).body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
  }
  req.push(null);

  return {
    req,
    res,
    getResponse: () => ({
      statusCode,
      headers,
      body,
      json: () => JSON.parse(body)
    })
  };
}

test('Integration: HTTP Request/Response JSON logging, TTL rules & Admin Setup', async () => {
  const testSqlite = './integ_logvault_http.sqlite';
  const testSql = './integ_logvault_http.sql';

  if (existsSync(testSqlite)) unlinkSync(testSqlite);
  if (existsSync(testSql)) unlinkSync(testSql);

  const vault = new LogVault({
    path: '/logvault',
    sqliteFilePath: testSqlite,
    sqlFilePath: testSql,
    interceptHttp: true
  });

  try {
    // 1. Initial setup - create admin user
    const mockSetup = createMockReqRes({
      method: 'POST',
      url: '/logvault/api/auth/setup',
      headers: { 'content-type': 'application/json' },
      body: { username: 'admin', password: 'AdminPassword123!' }
    });
    await vault.handleRequest(mockSetup.req, mockSetup.res);
    const setupData = mockSetup.getResponse().json();
    const token = setupData.token;
    assert.ok(token);

    // 2. Test HTTP Request & Response Interception
    const middleware = vault.middleware();

    const mockAppReqRes = createMockReqRes({
      method: 'POST',
      url: '/api/v1/checkout?promo=cybermonday',
      headers: { 'content-type': 'application/json' },
      body: {
        userId: 'u_99',
        password: 'SuperSecretUserPassword',
        card: '4532-1100-2200-3344',
        items: ['Cloud Compute x2']
      }
    });

    // Execute application middleware handler
    await new Promise<void>((resolve) => {
      middleware(mockAppReqRes.req, mockAppReqRes.res, () => {
        // Application route handler sends response JSON
        mockAppReqRes.res.statusCode = 201;
        mockAppReqRes.res.end(JSON.stringify({
          status: 'success',
          orderId: 'ord_123',
          tracking: 'TRK-99001'
        }));
        resolve();
      });
    });

    // 3. Query logs with ?decrypt=true to verify HTTP request/response JSON was captured and decrypted
    const mockQueryLogs = createMockReqRes({
      url: '/logvault/api/logs?source=http&decrypt=true',
      headers: { authorization: `Bearer ${token}` }
    });
    await vault.handleRequest(mockQueryLogs.req, mockQueryLogs.res);
    const logsData = mockQueryLogs.getResponse().json();

    assert.ok(logsData.logs.length >= 1);
    const httpLog = logsData.logs[0];
    assert.strictEqual(httpLog.source, 'http');
    assert.ok(httpLog.metadata?.http);

    const httpMeta = httpLog.metadata.http;
    assert.strictEqual(httpMeta.method, 'POST');
    assert.strictEqual(httpMeta.url, '/api/v1/checkout?promo=cybermonday');
    assert.strictEqual(httpMeta.statusCode, 201);
    assert.ok(typeof httpMeta.durationMs === 'number');

    // Verify response JSON was captured
    assert.strictEqual(httpMeta.responseBody?.status, 'success');
    assert.strictEqual(httpMeta.responseBody?.orderId, 'ord_123');

    // Verify sensitive request fields were AUTO-REDACTED!
    assert.strictEqual(httpMeta.requestBody?.password, '[REDACTED]');
    assert.strictEqual(httpMeta.requestBody?.card, '****-****-****-3344');
    assert.strictEqual(httpMeta.requestBody?.userId, 'u_99');

    // 4. Test TTL Rules API
    // Create custom TTL rule for checkout logs (delete after 30 seconds)
    const mockCreateTtl = createMockReqRes({
      method: 'POST',
      url: '/logvault/api/ttl/rules',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`
      },
      body: {
        name: 'Auto-delete Checkout Logs',
        pattern: '/api/v1/checkout',
        ttlSeconds: 30
      }
    });
    await vault.handleRequest(mockCreateTtl.req, mockCreateTtl.res);
    assert.strictEqual(mockCreateTtl.getResponse().statusCode, 201);
    const rule = mockCreateTtl.getResponse().json().rule;
    assert.strictEqual(rule.name, 'Auto-delete Checkout Logs');
    assert.strictEqual(rule.ttlSeconds, 30);

    // List TTL rules
    const mockListTtl = createMockReqRes({
      url: '/logvault/api/ttl',
      headers: { authorization: `Bearer ${token}` }
    });
    await vault.handleRequest(mockListTtl.req, mockListTtl.res);
    const ttlList = mockListTtl.getResponse().json();
    assert.ok(ttlList.rules.some((r: any) => r.name === 'Auto-delete Checkout Logs'));

    // Trigger manual purge sweep
    const mockPurge = createMockReqRes({
      method: 'POST',
      url: '/logvault/api/ttl/purge',
      headers: { authorization: `Bearer ${token}` }
    });
    await vault.handleRequest(mockPurge.req, mockPurge.res);
    assert.strictEqual(mockPurge.getResponse().statusCode, 200);

  } finally {
    vault.stop();
    if (existsSync(testSqlite)) unlinkSync(testSqlite);
    if (existsSync(testSql)) unlinkSync(testSql);
  }
});

test('Integration: Authentication Lifecycle, Express Compatibility & Reset', async () => {
  const testSqlite = './integ_auth_test.sqlite';
  const testSql = './integ_auth_test.sql';

  if (existsSync(testSqlite)) unlinkSync(testSqlite);
  if (existsSync(testSql)) unlinkSync(testSql);

  const vault = new LogVault({
    path: '/logvault',
    sqliteFilePath: testSqlite,
    sqlFilePath: testSql
  });

  try {
    // 1. Initial Status: Uninitialized
    const mockStatus1 = createMockReqRes({
      url: '/logvault/api/auth/status'
    });
    await vault.handleRequest(mockStatus1.req, mockStatus1.res);
    assert.strictEqual(mockStatus1.getResponse().statusCode, 200);
    assert.strictEqual(mockStatus1.getResponse().json().initialized, false);

    // 2. Initial Setup: Create Root Administrator
    const mockSetup = createMockReqRes({
      method: 'POST',
      url: '/logvault/api/auth/setup',
      headers: { 'content-type': 'application/json' },
      body: { username: 'admin', password: 'SecuredPassword2026!' }
    });
    await vault.handleRequest(mockSetup.req, mockSetup.res);
    assert.strictEqual(mockSetup.getResponse().statusCode, 201);
    const setupRes = mockSetup.getResponse().json();
    assert.strictEqual(setupRes.user.username, 'admin');
    assert.strictEqual(setupRes.user.role, 'admin');
    assert.ok(setupRes.token);

    // 3. Status is now initialized
    const mockStatus2 = createMockReqRes({
      url: '/logvault/api/auth/status'
    });
    await vault.handleRequest(mockStatus2.req, mockStatus2.res);
    assert.strictEqual(mockStatus2.getResponse().json().initialized, true);

    // 4. Second Setup attempt should fail
    const mockSetupFail = createMockReqRes({
      method: 'POST',
      url: '/logvault/api/auth/setup',
      headers: { 'content-type': 'application/json' },
      body: { username: 'admin2', password: 'Password123!' }
    });
    await vault.handleRequest(mockSetupFail.req, mockSetupFail.res);
    assert.strictEqual(mockSetupFail.getResponse().statusCode, 400);

    // 5. Standard Login with Valid Credentials
    const mockLoginSuccess = createMockReqRes({
      method: 'POST',
      url: '/logvault/api/auth/login',
      headers: { 'content-type': 'application/json' },
      body: { username: 'admin', password: 'SecuredPassword2026!' }
    });
    await vault.handleRequest(mockLoginSuccess.req, mockLoginSuccess.res);
    assert.strictEqual(mockLoginSuccess.getResponse().statusCode, 200);
    const loginRes = mockLoginSuccess.getResponse().json();
    assert.ok(loginRes.token);
    assert.strictEqual(loginRes.user.username, 'admin');
    assert.ok(loginRes.user.permissions.includes('users:manage'));

    // 6. Login with Invalid Credentials
    const mockLoginFail = createMockReqRes({
      method: 'POST',
      url: '/logvault/api/auth/login',
      headers: { 'content-type': 'application/json' },
      body: { username: 'admin', password: 'WrongPassword!' }
    });
    await vault.handleRequest(mockLoginFail.req, mockLoginFail.res);
    assert.strictEqual(mockLoginFail.getResponse().statusCode, 401);

    // 7. Express Upstream Body Parser Compatibility:
    // When express.json() already parsed the body, the stream is ended and (req as any).body is present
    const mockExpressLogin = createMockReqRes({
      method: 'POST',
      url: '/logvault/api/auth/login',
      headers: { 'content-type': 'application/json' }
    });
    (mockExpressLogin.req as any).body = { username: 'admin', password: 'SecuredPassword2026!' };
    (mockExpressLogin.req as any).complete = true;

    await vault.handleRequest(mockExpressLogin.req, mockExpressLogin.res);
    assert.strictEqual(mockExpressLogin.getResponse().statusCode, 200);
    assert.ok(mockExpressLogin.getResponse().json().token);

    // 8. Express Router Mount Compatibility:
    // When mounted as app.use('/logvault', middleware), req.baseUrl is '/logvault' and req.url is '/api/auth/login'
    const mockMountLogin = createMockReqRes({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'content-type': 'application/json' },
      body: { username: 'admin', password: 'SecuredPassword2026!' }
    });
    (mockMountLogin.req as any).baseUrl = '/logvault';
    (mockMountLogin.req as any).originalUrl = '/logvault/api/auth/login';

    await vault.handleRequest(mockMountLogin.req, mockMountLogin.res);
    assert.strictEqual(mockMountLogin.getResponse().statusCode, 200);
    assert.ok(mockMountLogin.getResponse().json().token);

    // 9. Web Reset Disabled: POST /api/auth/reset returns 403 Forbidden
    const mockReset = createMockReqRes({
      method: 'POST',
      url: '/logvault/api/auth/reset'
    });
    await vault.handleRequest(mockReset.req, mockReset.res);
    assert.strictEqual(mockReset.getResponse().statusCode, 403);
    assert.ok(mockReset.getResponse().json().error.includes('Web reset is disabled'));

    // 10. CLI Admin Reset: resetAdminTemporaryPassword creates temporary one-time password
    const tempPassword = 'LV-TempSecret99!';
    const resetUser = vault.userStore.resetAdminTemporaryPassword(tempPassword);
    assert.strictEqual(resetUser.username, 'admin');
    assert.strictEqual(Boolean(resetUser.mustChangePassword), true);

    // 11. Login with temporary password returns mustChangePassword: true
    const mockTempLogin = createMockReqRes({
      method: 'POST',
      url: '/logvault/api/auth/login',
      headers: { 'content-type': 'application/json' },
      body: { username: 'admin', password: tempPassword }
    });
    await vault.handleRequest(mockTempLogin.req, mockTempLogin.res);
    assert.strictEqual(mockTempLogin.getResponse().statusCode, 200);
    const tempLoginRes = mockTempLogin.getResponse().json();
    assert.strictEqual(tempLoginRes.mustChangePassword, true);
    assert.strictEqual(tempLoginRes.user.mustChangePassword, true);
    const tempToken = tempLoginRes.token;

    // 12. GET /api/auth/me reflects mustChangePassword
    const mockMe = createMockReqRes({
      url: '/logvault/api/auth/me',
      headers: { authorization: `Bearer ${tempToken}` }
    });
    await vault.handleRequest(mockMe.req, mockMe.res);
    assert.strictEqual(mockMe.getResponse().statusCode, 200);
    assert.strictEqual(mockMe.getResponse().json().user.mustChangePassword, true);

    // 13. POST /api/auth/change-password validates length >= 6
    const mockChangeShort = createMockReqRes({
      method: 'POST',
      url: '/logvault/api/auth/change-password',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${tempToken}`
      },
      body: { newPassword: '123' }
    });
    await vault.handleRequest(mockChangeShort.req, mockChangeShort.res);
    assert.strictEqual(mockChangeShort.getResponse().statusCode, 400);

    // 14. POST /api/auth/change-password successfully updates permanent password
    const mockChangeSuccess = createMockReqRes({
      method: 'POST',
      url: '/logvault/api/auth/change-password',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${tempToken}`
      },
      body: { newPassword: 'BrandNewPermanentPassword2026!' }
    });
    await vault.handleRequest(mockChangeSuccess.req, mockChangeSuccess.res);
    assert.strictEqual(mockChangeSuccess.getResponse().statusCode, 200);
    assert.strictEqual(mockChangeSuccess.getResponse().json().success, true);

    // 15. Login with old temp password now fails
    const mockOldTempLogin = createMockReqRes({
      method: 'POST',
      url: '/logvault/api/auth/login',
      headers: { 'content-type': 'application/json' },
      body: { username: 'admin', password: tempPassword }
    });
    await vault.handleRequest(mockOldTempLogin.req, mockOldTempLogin.res);
    assert.strictEqual(mockOldTempLogin.getResponse().statusCode, 401);

    // 16. Login with new permanent password succeeds and mustChangePassword is false
    const mockNewLogin = createMockReqRes({
      method: 'POST',
      url: '/logvault/api/auth/login',
      headers: { 'content-type': 'application/json' },
      body: { username: 'admin', password: 'BrandNewPermanentPassword2026!' }
    });
    await vault.handleRequest(mockNewLogin.req, mockNewLogin.res);
    assert.strictEqual(mockNewLogin.getResponse().statusCode, 200);
    const newLoginRes = mockNewLogin.getResponse().json();
    assert.strictEqual(newLoginRes.mustChangePassword, false);
    assert.strictEqual(newLoginRes.user.mustChangePassword, false);

  } finally {
    vault.stop();
    if (existsSync(testSqlite)) unlinkSync(testSqlite);
    if (existsSync(testSql)) unlinkSync(testSql);
  }
});

test('Integration: MySQL Dialect, Table Prefix, and Custom Logo', async () => {
  const testSqlite = './integ_mysql_logo.sqlite';
  const testSql = './integ_mysql_logo.sql';

  if (existsSync(testSqlite)) unlinkSync(testSqlite);
  if (existsSync(testSql)) unlinkSync(testSql);

  // 1. Test custom tablePrefix and custom logo
  const vault = new LogVault({
    path: '/logvault',
    sqliteFilePath: testSqlite,
    sqlFilePath: testSql,
    tablePrefix: 'logg_vault_',
    logo: 'https://example.com/corp-logo.png'
  });

  try {
    // Check dashboard rendering contains custom logo, login page by default, and log popup modal
    const mockDash = createMockReqRes({
      url: '/logvault'
    });
    await vault.handleRequest(mockDash.req, mockDash.res);
    assert.strictEqual(mockDash.getResponse().statusCode, 200);
    assert.ok(mockDash.getResponse().body.includes('https://example.com/corp-logo.png'));
    assert.ok(mockDash.getResponse().body.includes('brand-mark-custom'));
    assert.ok(mockDash.getResponse().body.includes('id="authScreen"'));
    assert.ok(mockDash.getResponse().body.includes('id="appDashboard" style="display:none;'));
    assert.ok(mockDash.getResponse().body.includes('id="logDetailModal"'));
    assert.ok(mockDash.getResponse().body.includes('id="changePasswordModal"'));
    assert.ok(mockDash.getResponse().body.includes("sessionStorage.getItem('logvault_token')"));
    assert.ok(!mockDash.getResponse().body.includes('handleResetAdmin'));
    assert.ok(!mockDash.getResponse().body.includes('localStorage.getItem'));

    // Check direct /logvault/login route serves login page
    const mockLoginRoute = createMockReqRes({
      url: '/logvault/login'
    });
    await vault.handleRequest(mockLoginRoute.req, mockLoginRoute.res);
    assert.strictEqual(mockLoginRoute.getResponse().statusCode, 200);
    assert.ok(mockLoginRoute.getResponse().body.includes('id="authScreen"'));

    // Check table prefix in generated SQL file
    vault.sqlStore.createUser({
      id: 'test_u1',
      username: 'corp_admin',
      passwordHash: 'hash',
      salt: 'salt1234salt1234salt1234salt1234',
      role: 'admin',
      createdAt: Date.now()
    });

    assert.ok(existsSync(testSql));
    const content = require('node:fs').readFileSync(testSql, 'utf8');
    assert.ok(content.includes('logg_vault_users'));
    assert.ok(content.includes('logg_vault_alert_configs'));
    assert.ok(content.includes('logg_vault_audit_logs'));
    assert.ok(content.includes('logg_vault_system_meta'));

    // 2. Test MySQL Dialect with Mock Pool
    const executedQueries: string[] = [];
    const mockPool = {
      query: async (sql: string, params?: any[]) => {
        executedQueries.push(sql);
        return [[]];
      },
      execute: async (sql: string, params?: any[]) => {
        executedQueries.push(sql);
        return [[]];
      }
    };

    const mysqlVault = new LogVault({
      path: '/logvault',
      dialect: 'mysql',
      mysql: { pool: mockPool },
      sqliteFilePath: './test_dummy.sqlite'
    });

    assert.strictEqual(mysqlVault.sqlStore.dialect, 'mysql');
    mysqlVault.stop();
    if (existsSync('./test_dummy.sqlite')) unlinkSync('./test_dummy.sqlite');

  } finally {
    vault.stop();
    if (existsSync(testSqlite)) unlinkSync(testSqlite);
    if (existsSync(testSql)) unlinkSync(testSql);
  }
});

test('Integration: Log Timing Sorting, Client IP Proxy Extraction, Server Health Check & Graceful Shutdown', async () => {
  const testSqlite = './integ_health_sort.sqlite';
  const testSql = './integ_health_sort.sql';

  if (existsSync(testSqlite)) unlinkSync(testSqlite);
  if (existsSync(testSql)) unlinkSync(testSql);

  const vault = new LogVault({
    path: '/logvault',
    sqliteFilePath: testSqlite,
    sqlFilePath: testSql,
    interceptHttp: true,
    trustProxy: true,
    gracefulShutdown: { exitProcess: false }
  });

  try {
    // 1. Initial admin setup
    const mockSetup = createMockReqRes({
      method: 'POST',
      url: '/logvault/api/auth/setup',
      headers: { 'content-type': 'application/json' },
      body: { username: 'admin', password: 'SecuredPassword2026!' }
    });
    await vault.handleRequest(mockSetup.req, mockSetup.res);
    const token = mockSetup.getResponse().json().token;
    assert.ok(token);

    // 2. Client IP Extraction from Proxy Headers
    const middleware = vault.middleware();

    const mockProxiedReqRes = createMockReqRes({
      method: 'POST',
      url: '/api/v1/user/profile',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '203.0.113.195, 10.0.0.1',
        'user-agent': 'Mozilla/5.0 Client'
      },
      body: { name: 'Alice', role: 'developer' }
    });

    await new Promise<void>((resolve) => {
      middleware(mockProxiedReqRes.req, mockProxiedReqRes.res, () => {
        mockProxiedReqRes.res.statusCode = 200;
        mockProxiedReqRes.res.end(JSON.stringify({ status: 'ok', updated: true }));
        resolve();
      });
    });

    // Verify intercepted log captured the true client IP (not proxy IP)
    const mockQueryClientIp = createMockReqRes({
      url: '/logvault/api/logs?source=http',
      headers: { authorization: `Bearer ${token}` }
    });
    await vault.handleRequest(mockQueryClientIp.req, mockQueryClientIp.res);
    const httpLogs = mockQueryClientIp.getResponse().json().logs;
    assert.ok(httpLogs.length >= 1);
    assert.strictEqual(httpLogs[0].metadata?.http?.clientIp, '203.0.113.195');

    // 3. Log Timing Sorting (Ascending vs Descending)
    // Add multiple entries with distinct timestamps
    vault.ringBuffer.clear();
    const t0 = Date.now();
    vault.ringBuffer.push({
      id: 'log_1',
      timestamp: t0 - 2000,
      level: 'info',
      source: 'stdout',
      message: 'First chronologically (Oldest)',
      raw: 'First chronologically (Oldest)'
    });
    vault.ringBuffer.push({
      id: 'log_2',
      timestamp: t0 - 1000,
      level: 'warn',
      source: 'stdout',
      message: 'Middle chronologically',
      raw: 'Middle chronologically'
    });
    vault.ringBuffer.push({
      id: 'log_3',
      timestamp: t0,
      level: 'error',
      source: 'stdout',
      message: 'Last chronologically (Newest)',
      raw: 'Last chronologically (Newest)'
    });

    // Test Descending (default: newest first)
    const mockQueryDesc = createMockReqRes({
      url: '/logvault/api/logs?order=desc',
      headers: { authorization: `Bearer ${token}` }
    });
    await vault.handleRequest(mockQueryDesc.req, mockQueryDesc.res);
    const descLogs = mockQueryDesc.getResponse().json().logs;
    assert.strictEqual(descLogs.length, 3);
    assert.strictEqual(descLogs[0].id, 'log_3'); // Newest first
    assert.strictEqual(descLogs[2].id, 'log_1'); // Oldest last

    // Test Ascending (oldest first)
    const mockQueryAsc = createMockReqRes({
      url: '/logvault/api/logs?order=asc',
      headers: { authorization: `Bearer ${token}` }
    });
    await vault.handleRequest(mockQueryAsc.req, mockQueryAsc.res);
    const ascLogs = mockQueryAsc.getResponse().json().logs;
    assert.strictEqual(ascLogs.length, 3);
    assert.strictEqual(ascLogs[0].id, 'log_1'); // Oldest first
    assert.strictEqual(ascLogs[2].id, 'log_3'); // Newest last

    // 4. Server Health Check Endpoint (SEC-05: Unauthenticated minimal probe vs Authenticated detailed diagnostic)
    const mockHealthUnauth = createMockReqRes({
      url: '/logvault/api/health'
    });
    await vault.handleRequest(mockHealthUnauth.req, mockHealthUnauth.res);
    assert.strictEqual(mockHealthUnauth.getResponse().statusCode, 200);
    const unauthData = mockHealthUnauth.getResponse().json();
    assert.strictEqual(unauthData.status, 'healthy');
    assert.ok(typeof unauthData.uptime === 'number');
    assert.ok(unauthData.uptimeFormatted);
    assert.strictEqual(unauthData.process, undefined, 'Unauthenticated health check must not leak process info');
    assert.strictEqual(unauthData.memory, undefined, 'Unauthenticated health check must not leak memory info');

    // Authenticated health check with Bearer token receives full diagnostics
    const mockHealthAuth = createMockReqRes({
      url: '/logvault/api/health',
      headers: { authorization: `Bearer ${token}` }
    });
    await vault.handleRequest(mockHealthAuth.req, mockHealthAuth.res);
    assert.strictEqual(mockHealthAuth.getResponse().statusCode, 200);
    const healthData = mockHealthAuth.getResponse().json();
    assert.strictEqual(healthData.status, 'healthy');
    assert.ok(healthData.memory.heapUsedMb > 0);
    assert.strictEqual(healthData.database.status, 'connected');
    assert.strictEqual(healthData.database.dialect, 'sqlite');
    assert.strictEqual(healthData.database.hasUsers, true);
    assert.ok(healthData.logs.bufferCount >= 0);

    // 5. Automated Log Removal (TTL Sweep)
    vault.ringBuffer.clear();
    const expiredEntry = {
      id: 'log_expired_test',
      timestamp: Date.now() - 5000,
      expiresAt: Date.now() - 1000, // Expired 1 second ago
      level: 'debug' as const,
      source: 'stdout' as const,
      message: 'This log should be automatically purged',
      raw: 'This log should be automatically purged'
    };
    vault.ringBuffer.push(expiredEntry);
    assert.strictEqual(vault.ringBuffer.size(), 1);

    // Perform sweep
    const purgedCount = vault.ttlManager.sweep();
    assert.strictEqual(purgedCount, 1);
    assert.strictEqual(vault.ringBuffer.size(), 0);

    // 6. Graceful Shutdown
    await vault.gracefulShutdown('SIGTERM');
    const auditLogs = vault.auditLogger.query({ limit: 10 }).entries;
    assert.ok(auditLogs.some((a) => a.action === 'SERVER_GRACEFUL_SHUTDOWN'));

  } finally {
    vault.stop();
    if (existsSync(testSqlite)) unlinkSync(testSqlite);
    if (existsSync(testSql)) unlinkSync(testSql);
  }
});

test('Integration: Errsole-Style Listing, Real-Time Filter Counts & Multi-Field Search', async () => {
  const testSqlite = './integ_logvault_errsole.sqlite';
  const testSql = './integ_logvault_errsole.sql';

  if (existsSync(testSqlite)) unlinkSync(testSqlite);
  if (existsSync(testSql)) unlinkSync(testSql);

  const vault = new LogVault({
    path: '/logvault',
    sqliteFilePath: testSqlite,
    sqlFilePath: testSql
  });

  try {
    // Setup admin user & obtain auth token
    const mockSetup = createMockReqRes({
      method: 'POST',
      url: '/logvault/api/auth/setup',
      headers: { 'content-type': 'application/json' },
      body: { username: 'errsoleAdmin', password: 'ErrsolePassword123!' }
    });
    await vault.handleRequest(mockSetup.req, mockSetup.res);
    const setupData = mockSetup.getResponse().json();
    const token = setupData.token;

    // Seed diverse logs into ring buffer
    const now = Date.now();
    vault.ringBuffer.push({
      id: 'log_err_1',
      timestamp: now - 3000,
      level: 'error',
      source: 'stderr',
      message: 'Database connection failed on cluster node 4',
      raw: 'Database connection failed on cluster node 4'
    });

    vault.ringBuffer.push({
      id: 'log_warn_1',
      timestamp: now - 2000,
      level: 'warn',
      source: 'stdout',
      message: 'High memory threshold warning: 85% reached',
      raw: 'High memory threshold warning: 85% reached'
    });

    vault.ringBuffer.push({
      id: 'log_info_1',
      timestamp: now - 1000,
      level: 'info',
      source: 'stdout',
      message: 'Worker thread pool resized to 8 workers',
      raw: 'Worker thread pool resized to 8 workers'
    });

    vault.ringBuffer.push({
      id: 'log_http_1',
      timestamp: now,
      level: 'info',
      source: 'http',
      message: 'POST /api/v2/checkout 201 Created (142ms)',
      raw: 'POST /api/v2/checkout 201 Created (142ms)',
      metadata: {
        http: {
          method: 'POST',
          url: '/api/v2/checkout',
          path: '/api/v2/checkout',
          statusCode: 201,
          durationMs: 142,
          clientIp: '198.51.100.42',
          requestBody: { cartId: 'c_9988', currency: 'USD' },
          responseBody: { orderId: 'ord_123', status: 'CONFIRMED' }
        }
      }
    });

    // 1. Verify Query Counts (all, http, error, warn, info, debug)
    const mockQueryAll = createMockReqRes({
      url: '/logvault/api/logs',
      headers: { authorization: `Bearer ${token}` }
    });
    await vault.handleRequest(mockQueryAll.req, mockQueryAll.res);
    const dataAll = mockQueryAll.getResponse().json();

    assert.strictEqual(dataAll.total, 4);
    assert.strictEqual(dataAll.counts.all, 4);
    assert.strictEqual(dataAll.counts.error, 1);
    assert.strictEqual(dataAll.counts.warn, 1);
    assert.strictEqual(dataAll.counts.info, 2);
    assert.strictEqual(dataAll.counts.debug, 0);
    assert.strictEqual(dataAll.counts.http, 1);

    // 2. Search by Client IP (Errsole-grade multi-field search)
    const mockSearchIp = createMockReqRes({
      url: '/logvault/api/logs?search=198.51.100.42',
      headers: { authorization: `Bearer ${token}` }
    });
    await vault.handleRequest(mockSearchIp.req, mockSearchIp.res);
    const dataIp = mockSearchIp.getResponse().json();
    assert.strictEqual(dataIp.logs.length, 1);
    assert.strictEqual(dataIp.logs[0].id, 'log_http_1');

    // 3. Search by JSON Payload Key/Value
    const mockSearchJson = createMockReqRes({
      url: '/logvault/api/logs?search=c_9988',
      headers: { authorization: `Bearer ${token}` }
    });
    await vault.handleRequest(mockSearchJson.req, mockSearchJson.res);
    const dataJson = mockSearchJson.getResponse().json();
    assert.strictEqual(dataJson.logs.length, 1);
    assert.strictEqual(dataJson.logs[0].id, 'log_http_1');

    // 4. Search by Regex pattern
    const mockSearchRegex = createMockReqRes({
      url: '/logvault/api/logs?search=cluster.*node&isRegex=true',
      headers: { authorization: `Bearer ${token}` }
    });
    await vault.handleRequest(mockSearchRegex.req, mockSearchRegex.res);
    const dataRegex = mockSearchRegex.getResponse().json();
    assert.strictEqual(dataRegex.logs.length, 1);
    assert.strictEqual(dataRegex.logs[0].id, 'log_err_1');

    // 5. Source filtering
    const mockSourceHttp = createMockReqRes({
      url: '/logvault/api/logs?source=http',
      headers: { authorization: `Bearer ${token}` }
    });
    await vault.handleRequest(mockSourceHttp.req, mockSourceHttp.res);
    const dataHttp = mockSourceHttp.getResponse().json();
    assert.strictEqual(dataHttp.logs.length, 1);
    assert.strictEqual(dataHttp.logs[0].id, 'log_http_1');

    // 6. Verify Dashboard HTML embedded <script> syntax validity in V8
    const dashboardHtml = getDashboardHtml('/logvault', 'LogVault Test');
    const scriptMatch = dashboardHtml.match(/<script>([\s\S]*?)<\/script>/);
    assert.ok(scriptMatch, 'Dashboard HTML must contain a <script> tag');
    assert.doesNotThrow(() => {
      new vm.Script(scriptMatch[1]);
    }, 'Embedded dashboard JavaScript must be 100% syntactically valid in V8 engine');

  } finally {
    vault.stop();
    if (existsSync(testSqlite)) unlinkSync(testSqlite);
    if (existsSync(testSql)) unlinkSync(testSql);
  }
});

test('Integration: TracerNest-Logger Naming, Default Logo and Image Branding, and Backward Compatibility', async () => {
  const testSqlite = './integ_tracernest_brand.sqlite';
  const testSql = './integ_tracernest_brand.sql';

  if (existsSync(testSqlite)) unlinkSync(testSqlite);
  if (existsSync(testSql)) unlinkSync(testSql);

  const app = new TracerNestLogger({
    sqliteFilePath: testSqlite,
    sqlFilePath: testSql
  });

  try {
    // 1. Verify default configuration uses TracerNest-Logger naming & assets
    assert.strictEqual(app.config.path, '/tracernest-logger');
    assert.strictEqual(app.config.title, 'TracerNest-Logger Console');
    assert.strictEqual(app.config.tablePrefix, 'tracernest_');
    assert.ok(app.config.logo && app.config.logo.startsWith('data:image/svg+xml;base64,'));
    assert.ok(DEFAULT_TRACERNEST_LOGO.startsWith('data:image/svg+xml;base64,'));
    assert.ok(Buffer.from(DEFAULT_TRACERNEST_LOGO.replace('data:image/svg+xml;base64,', ''), 'base64').toString().includes('<svg'));
    assert.ok(Buffer.from(DEFAULT_TRACERNEST_BANNER.replace('data:image/svg+xml;base64,', ''), 'base64').toString().includes('TracerNest'));

    // 2. Verify backward compatibility: TraceNest and LogVault are instances of TracerNestLogger
    const legacyTraceNest = new TraceNest({
      path: '/tracenest',
      sqliteFilePath: testSqlite,
      sqlFilePath: testSql
    });
    assert.ok(legacyTraceNest instanceof TracerNestLogger);
    legacyTraceNest.stop();

    const legacyVault = new LogVault({
      path: '/logvault',
      sqliteFilePath: testSqlite,
      sqlFilePath: testSql
    });
    assert.ok(legacyVault instanceof TracerNestLogger);
    legacyVault.stop();

    // 3. Verify HTML output embeds default TracerNest logo and banner
    const html = getDashboardHtml('/tracernest-logger', 'TracerNest-Logger Console');
    assert.ok(html.includes('TracerNest-Logger Console'));
    assert.ok(html.includes('Welcome to TracerNest'));
    assert.ok(html.includes('Sign in to TracerNest'));
    assert.ok(html.includes('LOGGER'));
    assert.ok(html.includes('<link rel="icon" type="image/svg+xml"'));
    assert.ok(html.includes('data:image/svg+xml;base64,'));

    // 4. Verify embedded script parses 100% cleanly in V8
    const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
    assert.ok(scriptMatch);
    assert.doesNotThrow(() => {
      new vm.Script(scriptMatch[1]);
    });

  } finally {
    app.stop();
    if (existsSync(testSqlite)) unlinkSync(testSqlite);
    if (existsSync(testSql)) unlinkSync(testSql);
  }
});

test('Integration: Content Security Policy (CSP) & Google Fonts Support', async () => {
  const testSqlite = './csp_test.sqlite';
  const testSql = './csp_test.sql';

  // 1. Test default CSP allows Google Fonts & local assets
  const appDefault = new TracerNestLogger({
    path: '/tracernest-logger',
    sqliteFilePath: testSqlite,
    sqlFilePath: testSql
  });

  try {
    const mockDefault = createMockReqRes({ url: '/tracernest-logger' });
    await appDefault.handleRequest(mockDefault.req, mockDefault.res);
    const respDefault = mockDefault.getResponse();

    const csp = respDefault.headers['content-security-policy'];
    assert.ok(csp, 'CSP header should be present by default');
    assert.ok(csp.includes("https://fonts.googleapis.com"), 'CSP must allow style-src from https://fonts.googleapis.com');
    assert.ok(csp.includes("https://fonts.gstatic.com"), 'CSP must allow font-src from https://fonts.gstatic.com');
    assert.ok(csp.includes("img-src 'self' data:"), 'CSP must allow img-src data: for vector icons');

    // Verify HTML has paired <style> and </style> tags
    assert.ok(respDefault.body.includes('<style>\n    :root {'), 'HTML must have opening <style> tag before :root');
    assert.ok(respDefault.body.includes('</style>\n</head>'), 'HTML must have closing </style> tag');
  } finally {
    appDefault.stop();
    if (existsSync(testSqlite)) unlinkSync(testSqlite);
    if (existsSync(testSql)) unlinkSync(testSql);
  }

  // 2. Test csp: false disables CSP header
  const appNoCsp = new TracerNestLogger({
    path: '/tracernest-logger',
    sqliteFilePath: testSqlite,
    sqlFilePath: testSql,
    csp: false
  });

  try {
    const mockNoCsp = createMockReqRes({ url: '/tracernest-logger' });
    await appNoCsp.handleRequest(mockNoCsp.req, mockNoCsp.res);
    const respNoCsp = mockNoCsp.getResponse();

    assert.equal(respNoCsp.headers['content-security-policy'], undefined, 'CSP header must be omitted when csp is false');
  } finally {
    appNoCsp.stop();
    if (existsSync(testSqlite)) unlinkSync(testSqlite);
    if (existsSync(testSql)) unlinkSync(testSql);
  }

  // 3. Test custom CSP string
  const customCsp = "default-src 'self'; script-src 'self' 'nonce-12345'";
  const appCustomCsp = new TracerNestLogger({
    path: '/tracernest-logger',
    sqliteFilePath: testSqlite,
    sqlFilePath: testSql,
    csp: customCsp
  });

  try {
    const mockCustomCsp = createMockReqRes({ url: '/tracernest-logger' });
    await appCustomCsp.handleRequest(mockCustomCsp.req, mockCustomCsp.res);
    const respCustomCsp = mockCustomCsp.getResponse();

    assert.equal(respCustomCsp.headers['content-security-policy'], customCsp, 'Custom CSP header must match');
  } finally {
    appCustomCsp.stop();
    if (existsSync(testSqlite)) unlinkSync(testSqlite);
    if (existsSync(testSql)) unlinkSync(testSql);
  }
});

test('Integration: Custom Dialog System & Zero Native Popups', () => {
  const html = getDashboardHtml('/tracernest-logger', 'TracerNest-Logger Console');

  // 1. Verify custom modal dialog elements are embedded
  assert.ok(html.includes('id="exportModal"'), 'Must contain custom export dialog modal');
  assert.ok(html.includes('id="confirmModal"'), 'Must contain custom confirmation dialog modal');
  assert.ok(html.includes('id="healthModal"'), 'Must contain custom server health diagnostic modal');
  assert.ok(html.includes('export-format-card'), 'Must contain interactive export format cards');
  assert.ok(html.includes('id="exportOptJson"'), 'Must contain JSON export option');
  assert.ok(html.includes('id="exportOptCsv"'), 'Must contain CSV export option');
  assert.ok(html.includes('id="exportOptNdjson"'), 'Must contain NDJSON export option');
  assert.ok(html.includes('id="exportScopeFiltered"'), 'Must contain Filtered Scope option');
  assert.ok(html.includes('id="exportScopeAll"'), 'Must contain All Scope option');
  assert.ok(html.includes('dialog-export'), 'Must use dialog-export styling');
  assert.ok(html.includes('function getAuthHeaders('), 'Must define getAuthHeaders helper in client script');

  // 2. Extract client-side script and verify zero native alert/confirm/prompt calls
  const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(scriptMatch, 'Dashboard must have inline script');
  const scriptContent = scriptMatch[1];

  const popupRegex = /\b(alert|confirm|prompt)\s*\(/g;
  const matches = [...scriptContent.matchAll(popupRegex)];
  assert.equal(matches.length, 0, 'There must be zero native alert, confirm, or prompt calls in the client script');

  // 3. Verify V8 script compilation
  assert.doesNotThrow(() => {
    new vm.Script(scriptContent);
  }, 'Dashboard client script must compile cleanly in V8 engine');
});

test('Integration: Data Directory & Isolated Folder File Initialization', async () => {
  const testDataDir = './test_isolated_dir';

  if (existsSync(testDataDir)) {
    rmSync(testDataDir, { recursive: true, force: true });
  }

  const app = new TracerNestLogger({
    path: '/tracernest-logger',
    dataDir: testDataDir
  });

  try {
    // Verify directory was automatically created
    assert.ok(existsSync(testDataDir), 'Data directory must be automatically created');

    // Create admin user to trigger SQL file export
    const mockSetup = createMockReqRes({
      method: 'POST',
      url: '/tracernest-logger/api/auth/setup',
      headers: { 'content-type': 'application/json' },
      body: { username: 'dir_admin', password: 'Password123!' }
    });
    await app.handleRequest(mockSetup.req, mockSetup.res);

    // Verify files were created inside testDataDir
    const files = readdirSync(testDataDir);
    assert.ok(files.some(f => f.endsWith('.sqlite')), 'SQLite database must be created inside folder');
    assert.ok(files.some(f => f.endsWith('.sql')), 'Synchronized SQL file must be created inside folder');

    // Verify no test files leaked into root
    assert.equal(existsSync('./test_isolated_dir.sqlite'), false);
    assert.equal(existsSync('./test_isolated_dir.sql'), false);
  } finally {
    app.stop();
    if (existsSync(testDataDir)) {
      rmSync(testDataDir, { recursive: true, force: true });
    }
  }
});

test('Integration: Server Health Diagnostic Button and Dialog Architecture', () => {
  const html = getDashboardHtml('/tracernest-logger', 'TracerNest-Logger Console');

  // 1. Topbar Run Diagnostic Button
  assert.ok(html.includes('id="healthBadge"'), 'Must have topbar health badge/button');
  assert.ok(html.includes('health-diagnostic-btn'), 'Must have health-diagnostic-btn styling');
  assert.ok(html.includes('Run Diagnostic'), 'Must show Run Diagnostic action label');
  assert.ok(html.includes('id="topbarHealthDot"'), 'Must have live pulse status dot');

  // 2. Metrics View Dedicated Diagnostic Button
  assert.ok(html.includes('id="btnRunDiagnostic"'), 'Must have btnRunDiagnostic in viewMetrics');
  assert.ok(html.includes('id="btnRunDiagnosticLabel"'), 'Must have diagnostic label');

  // 3. Health Diagnostic Dialog Modal
  assert.ok(html.includes('id="healthModal"'), 'Must render healthModal dialog');
  assert.ok(html.includes('diag-dialog'), 'Must have diag-dialog modern SaaS container styling');
  assert.ok(html.includes('id="hmStatusDot"'), 'Must have hmStatusDot');
  assert.ok(html.includes('id="hmStatusTitle"'), 'Must have hmStatusTitle');
  assert.ok(html.includes('id="hmUptimeBadge"'), 'Must have hmUptimeBadge');
  assert.ok(html.includes('id="hmLatencyBadge"'), 'Must have hmLatencyBadge');
  assert.ok(html.includes('id="hmDatabaseVal"'), 'Must have hmDatabaseVal');
  assert.ok(html.includes('id="hmProcessVal"'), 'Must have hmProcessVal');
  assert.ok(html.includes('id="hmMemoryVal"'), 'Must have hmMemoryVal');
  assert.ok(html.includes('id="hmMemoryBar"'), 'Must have hmMemoryBar progress bar');
  assert.ok(html.includes('id="hmBufferVal"'), 'Must have hmBufferVal');
  assert.ok(html.includes('id="hmBufferBar"'), 'Must have hmBufferBar progress bar');
  assert.ok(html.includes('id="hmTtlPurgedVal"'), 'Must have hmTtlPurgedVal');
  assert.ok(html.includes('id="btnModalRerun"'), 'Must have btnModalRerun');

  // 4. Modal Z-Index and Overlay Integrity
  assert.ok(html.includes('z-index: 1200'), 'Modal overlay must have z-index 1200');
  assert.ok(html.includes('function openHealthModal(h, latencyMs)'), 'Must have openHealthModal with latency');
  assert.ok(html.includes('async function runHealthDiagnostic()'), 'Must have runHealthDiagnostic function');
});

test('Integration: Security Review Remediations (SEC-01, SEC-02, SEC-03)', async () => {
  const testDataDir = './test_security_review_dir';
  if (existsSync(testDataDir)) rmSync(testDataDir, { recursive: true, force: true });

  const app = new TracerNestLogger({
    dataDir: testDataDir,
    path: '/tracernest-logger',
    bufferSize: 100
  });

  try {
    // 1. Initial Setup
    const mockSetup = createMockReqRes({
      method: 'POST',
      url: '/tracernest-logger/api/auth/setup',
      headers: { 'content-type': 'application/json' },
      body: { username: 'sec_admin', password: 'AdminPassword123!' }
    });
    await app.handleRequest(mockSetup.req, mockSetup.res);
    const adminToken = mockSetup.getResponse().json().token;
    assert.ok(adminToken, 'Admin setup must return token');

    // Create user bob (operator)
    const mockCreateBob = createMockReqRes({
      method: 'POST',
      url: '/tracernest-logger/api/users',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${adminToken}` },
      body: { username: 'bob_operator', password: 'BobPassword123!', role: 'operator' }
    });
    await app.handleRequest(mockCreateBob.req, mockCreateBob.res);
    const bobId = mockCreateBob.getResponse().json().user.id;

    // Login bob
    const mockLoginBob = createMockReqRes({
      method: 'POST',
      url: '/tracernest-logger/api/auth/login',
      headers: { 'content-type': 'application/json' },
      body: { username: 'bob_operator', password: 'BobPassword123!' }
    });
    await app.handleRequest(mockLoginBob.req, mockLoginBob.res);
    const bobToken = mockLoginBob.getResponse().json().token;

    // --- SEC-01 TESTS: Tokens in URL query parameters strictly rejected ---
    // A: Query string token in regular API endpoint must return 401
    const mockQueryTokenAttempt = createMockReqRes({
      method: 'GET',
      url: `/tracernest-logger/api/logs?token=${encodeURIComponent(bobToken)}`
    });
    await app.handleRequest(mockQueryTokenAttempt.req, mockQueryTokenAttempt.res);
    assert.strictEqual(mockQueryTokenAttempt.getResponse().statusCode, 401, 'Query-string token must be rejected with 401');

    // B: Query string token in Export endpoint must return 401
    const mockExportTokenAttempt = createMockReqRes({
      method: 'GET',
      url: `/tracernest-logger/api/logs/export?format=json&token=${encodeURIComponent(bobToken)}`
    });
    await app.handleRequest(mockExportTokenAttempt.req, mockExportTokenAttempt.res);
    assert.strictEqual(mockExportTokenAttempt.getResponse().statusCode, 401, 'Query-string token in export must be rejected with 401');

    // C: Header authentication succeeds
    const mockHeaderAuth = createMockReqRes({
      method: 'GET',
      url: '/tracernest-logger/api/logs',
      headers: { authorization: `Bearer ${bobToken}` }
    });
    await app.handleRequest(mockHeaderAuth.req, mockHeaderAuth.res);
    assert.strictEqual(mockHeaderAuth.getResponse().statusCode, 200, 'Header authentication must succeed');

    // D: One-time single-use stream ticket for EventSource (SEC-01)
    const mockTicketReq = createMockReqRes({
      method: 'POST',
      url: '/tracernest-logger/api/logs/stream/ticket',
      headers: { authorization: `Bearer ${bobToken}` }
    });
    await app.handleRequest(mockTicketReq.req, mockTicketReq.res);
    assert.strictEqual(mockTicketReq.getResponse().statusCode, 200);
    const streamTicket = mockTicketReq.getResponse().json().ticket;
    assert.ok(streamTicket, 'Stream ticket must be returned');

    // First use of stream ticket succeeds
    const mockStream1 = createMockReqRes({
      method: 'GET',
      url: `/tracernest-logger/api/logs/stream?ticket=${streamTicket}`
    });
    await app.handleRequest(mockStream1.req, mockStream1.res);
    assert.strictEqual(mockStream1.getResponse().statusCode, 200, 'Single-use stream ticket must connect stream');

    // Replay of the same stream ticket fails (single-use enforced!)
    const mockStreamReplay = createMockReqRes({
      method: 'GET',
      url: `/tracernest-logger/api/logs/stream?ticket=${streamTicket}`
    });
    await app.handleRequest(mockStreamReplay.req, mockStreamReplay.res);
    assert.strictEqual(mockStreamReplay.getResponse().statusCode, 401, 'Replayed stream ticket must be rejected');

    // --- SEC-02 TESTS: Session revocation on role change, user deletion & password change ---
    // Create admin david
    const mockCreateDavid = createMockReqRes({
      method: 'POST',
      url: '/tracernest-logger/api/users',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${adminToken}` },
      body: { username: 'david_admin', password: 'DavidPassword123!', role: 'admin' }
    });
    await app.handleRequest(mockCreateDavid.req, mockCreateDavid.res);
    const davidId = mockCreateDavid.getResponse().json().user.id;

    // Login david
    const mockLoginDavid = createMockReqRes({
      method: 'POST',
      url: '/tracernest-logger/api/auth/login',
      headers: { 'content-type': 'application/json' },
      body: { username: 'david_admin', password: 'DavidPassword123!' }
    });
    await app.handleRequest(mockLoginDavid.req, mockLoginDavid.res);
    const davidOldToken = mockLoginDavid.getResponse().json().token;

    // David can manage users initially
    const mockDavidCheck = createMockReqRes({
      method: 'GET',
      url: '/tracernest-logger/api/users',
      headers: { authorization: `Bearer ${davidOldToken}` }
    });
    await app.handleRequest(mockDavidCheck.req, mockDavidCheck.res);
    assert.strictEqual(mockDavidCheck.getResponse().statusCode, 200, 'David initially has admin access');

    // Demote david to viewer
    const mockDemoteDavid = createMockReqRes({
      method: 'PUT',
      url: `/tracernest-logger/api/users/${davidId}`,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${adminToken}` },
      body: { role: 'viewer' }
    });
    await app.handleRequest(mockDemoteDavid.req, mockDemoteDavid.res);
    assert.strictEqual(mockDemoteDavid.getResponse().statusCode, 200);

    // Old token with 'admin' role claim must be REVOKED (token_version incremented)
    const mockDavidStaleAttempt = createMockReqRes({
      method: 'GET',
      url: '/tracernest-logger/api/users',
      headers: { authorization: `Bearer ${davidOldToken}` }
    });
    await app.handleRequest(mockDavidStaleAttempt.req, mockDavidStaleAttempt.res);
    assert.strictEqual(mockDavidStaleAttempt.getResponse().statusCode, 401, 'Demoted user stale token must be rejected with 401');

    // Delete user bob
    const mockDeleteBob = createMockReqRes({
      method: 'DELETE',
      url: `/tracernest-logger/api/users/${bobId}`,
      headers: { authorization: `Bearer ${adminToken}` }
    });
    await app.handleRequest(mockDeleteBob.req, mockDeleteBob.res);
    assert.strictEqual(mockDeleteBob.getResponse().statusCode, 200);

    // Deleted user bob's existing token must be REJECTED immediately
    const mockBobDeletedAttempt = createMockReqRes({
      method: 'GET',
      url: '/tracernest-logger/api/logs',
      headers: { authorization: `Bearer ${bobToken}` }
    });
    await app.handleRequest(mockBobDeletedAttempt.req, mockBobDeletedAttempt.res);
    assert.strictEqual(mockBobDeletedAttempt.getResponse().statusCode, 401, 'Deleted user active token must be rejected with 401');

    // Password change token revocation
    // Login david with new session
    const mockLoginDavid2 = createMockReqRes({
      method: 'POST',
      url: '/tracernest-logger/api/auth/login',
      headers: { 'content-type': 'application/json' },
      body: { username: 'david_admin', password: 'DavidPassword123!' }
    });
    await app.handleRequest(mockLoginDavid2.req, mockLoginDavid2.res);
    const davidTokenBeforePasswordChange = mockLoginDavid2.getResponse().json().token;

    // David changes password
    const mockChangePass = createMockReqRes({
      method: 'POST',
      url: '/tracernest-logger/api/auth/change-password',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${davidTokenBeforePasswordChange}` },
      body: { newPassword: 'BrandNewDavidPass123!' }
    });
    await app.handleRequest(mockChangePass.req, mockChangePass.res);
    assert.strictEqual(mockChangePass.getResponse().statusCode, 200);
    const davidFreshToken = mockChangePass.getResponse().json().token;
    assert.ok(davidFreshToken, 'Change password must return fresh token');

    // Old token before password change is now REVOKED
    const mockOldTokenAttempt = createMockReqRes({
      method: 'GET',
      url: '/tracernest-logger/api/logs',
      headers: { authorization: `Bearer ${davidTokenBeforePasswordChange}` }
    });
    await app.handleRequest(mockOldTokenAttempt.req, mockOldTokenAttempt.res);
    assert.strictEqual(mockOldTokenAttempt.getResponse().statusCode, 401, 'Old token before password change must be rejected');

    // Fresh token works
    const mockFreshTokenAttempt = createMockReqRes({
      method: 'GET',
      url: '/tracernest-logger/api/logs',
      headers: { authorization: `Bearer ${davidFreshToken}` }
    });
    await app.handleRequest(mockFreshTokenAttempt.req, mockFreshTokenAttempt.res);
    assert.strictEqual(mockFreshTokenAttempt.getResponse().statusCode, 200, 'Fresh token must succeed');

    // --- SEC-03 TESTS: Metrics endpoint permission check ---
    // User with logs:read (admin or viewer) can access metrics
    const mockAdminMetrics = createMockReqRes({
      method: 'GET',
      url: '/tracernest-logger/api/metrics',
      headers: { authorization: `Bearer ${adminToken}` }
    });
    await app.handleRequest(mockAdminMetrics.req, mockAdminMetrics.res);
    assert.strictEqual(mockAdminMetrics.getResponse().statusCode, 200, 'Admin can access metrics');

    // Register a custom restricted role without logs:read
    app.rbac.registerRole('restricted_audit_only', ['audit:read']);
    const mockCreateRestricted = createMockReqRes({
      method: 'POST',
      url: '/tracernest-logger/api/users',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${adminToken}` },
      body: { username: 'restricted_user', password: 'Restricted123!', role: 'restricted_audit_only' }
    });
    await app.handleRequest(mockCreateRestricted.req, mockCreateRestricted.res);
    assert.strictEqual(mockCreateRestricted.getResponse().statusCode, 201);

    const mockLoginRestricted = createMockReqRes({
      method: 'POST',
      url: '/tracernest-logger/api/auth/login',
      headers: { 'content-type': 'application/json' },
      body: { username: 'restricted_user', password: 'Restricted123!' }
    });
    await app.handleRequest(mockLoginRestricted.req, mockLoginRestricted.res);
    const restrictedToken = mockLoginRestricted.getResponse().json().token;

    // Restricted role without logs:read must be rejected with 403 Forbidden!
    const mockRestrictedMetrics = createMockReqRes({
      method: 'GET',
      url: '/tracernest-logger/api/metrics',
      headers: { authorization: `Bearer ${restrictedToken}` }
    });
    await app.handleRequest(mockRestrictedMetrics.req, mockRestrictedMetrics.res);
    assert.strictEqual(mockRestrictedMetrics.getResponse().statusCode, 403, 'Role without logs:read must be rejected with 403 on /api/metrics');

    // --- SEC-04 TESTS: ReDoS Prevention (Regex query fallback & TTL pattern rejection) ---
    // 1. Pathological backtracking pattern in log search with isRegex=true
    const mockRedosSearch = createMockReqRes({
      method: 'GET',
      url: '/tracernest-logger/api/logs?isRegex=true&search=' + encodeURIComponent('(a+)+$'),
      headers: { authorization: `Bearer ${adminToken}` }
    });
    await app.handleRequest(mockRedosSearch.req, mockRedosSearch.res);
    assert.strictEqual(mockRedosSearch.getResponse().statusCode, 200, 'ReDoS query must not crash and safely return');

    // 2. Reject catastrophic backtracking pattern when creating TTL rule
    const mockRedosTtl = createMockReqRes({
      method: 'POST',
      url: '/tracernest-logger/api/ttl/rules',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${adminToken}` },
      body: {
        name: 'Evil TTL Rule',
        pattern: '([a-zA-Z0-9]+)+$',
        ttlSeconds: 60
      }
    });
    await app.handleRequest(mockRedosTtl.req, mockRedosTtl.res);
    assert.strictEqual(mockRedosTtl.getResponse().statusCode, 400, 'Catastrophic ReDoS pattern in TTL rule must be rejected with 400');
    assert.ok(mockRedosTtl.getResponse().json().error.includes('Unsafe TTL pattern'));

    // --- SEC-05 TESTS: Unauthenticated Health Check Minimal Liveness vs Authenticated Diagnostic ---
    const mockPublicHealth = createMockReqRes({
      method: 'GET',
      url: '/tracernest-logger/api/health'
    });
    await app.handleRequest(mockPublicHealth.req, mockPublicHealth.res);
    assert.strictEqual(mockPublicHealth.getResponse().statusCode, 200);
    const pubHealth = mockPublicHealth.getResponse().json();
    assert.strictEqual(pubHealth.status, 'healthy');
    assert.ok(typeof pubHealth.uptime === 'number');
    assert.ok(pubHealth.uptimeFormatted);
    assert.strictEqual(pubHealth.process, undefined, 'Public probe must omit process metadata');
    assert.strictEqual(pubHealth.memory, undefined, 'Public probe must omit memory metadata');
    assert.strictEqual(pubHealth.database, undefined, 'Public probe must omit database metadata');

    const mockAuthHealth = createMockReqRes({
      method: 'GET',
      url: '/tracernest-logger/api/health',
      headers: { authorization: `Bearer ${adminToken}` }
    });
    await app.handleRequest(mockAuthHealth.req, mockAuthHealth.res);
    assert.strictEqual(mockAuthHealth.getResponse().statusCode, 200);
    const privHealth = mockAuthHealth.getResponse().json();
    assert.ok(privHealth.process.pid > 0, 'Authenticated diagnostic must include process info');
    assert.ok(privHealth.memory.heapUsedMb > 0, 'Authenticated diagnostic must include memory info');
    assert.strictEqual(privHealth.database.status, 'connected', 'Authenticated diagnostic must include database status');

  } finally {
    app.stop();
    if (existsSync(testDataDir)) rmSync(testDataDir, { recursive: true, force: true });
  }
});

test('Integration: Sensitive Route Exclusion / Non-Tracking & NDJSON Export', async () => {
  const testDataDir = './test_exclude_routes_dir';
  if (existsSync(testDataDir)) rmSync(testDataDir, { recursive: true, force: true });

  const app = new TracerNestLogger({
    dataDir: testDataDir,
    path: '/tracernest-logger',
    excludeRoutes: [
      '/api/auth/login',
      '/api/payments/*',
      new RegExp('^/api/v1/checkout'),
      { path: '/api/webhooks/stripe', method: 'POST' },
      (req) => req.headers['x-skip-log'] === 'true'
    ]
  });

  try {
    const mw = app.middleware();

    // 1. Initial Setup to get admin token
    const mockSetup = createMockReqRes({
      method: 'POST',
      url: '/tracernest-logger/api/auth/setup',
      headers: { 'content-type': 'application/json' },
      body: { username: 'export_admin', password: 'AdminPassword123!' }
    });
    await app.handleRequest(mockSetup.req, mockSetup.res);
    const adminToken = mockSetup.getResponse().json().token;

    // Helper to simulate request through application middleware
    const runMiddleware = (options: { method?: string; url: string; headers?: Record<string, string>; body?: any }) => {
      const mock = createMockReqRes(options);
      let nextCalled = false;
      mw(mock.req, mock.res, () => {
        nextCalled = true;
        mock.res.writeHead(200, { 'content-type': 'application/json' });
        mock.res.end(JSON.stringify({ status: 'ok' }));
      });
      return { mock, nextCalled };
    };

    // 2. Test Excluded Routes - None of these should be saved into the ring buffer!
    runMiddleware({ method: 'POST', url: '/api/auth/login', body: { username: 'test', password: 'secret' } });
    runMiddleware({ method: 'POST', url: '/api/payments/charge', body: { amount: 100 } });
    runMiddleware({ method: 'GET', url: '/api/v1/checkout/review' });
    runMiddleware({ method: 'POST', url: '/api/webhooks/stripe', body: { event: 'charge.succeeded' } });
    runMiddleware({ method: 'GET', url: '/api/sensitive-calc', headers: { 'x-skip-log': 'true' } });

    // Allow asynchronous finish event to run
    await new Promise(r => setTimeout(r, 60));

    // Assert ringBuffer has 0 HTTP logs for excluded routes
    const excludedLogs = app.ringBuffer.toArray().filter(l => l.source === 'http');
    assert.strictEqual(excludedLogs.length, 0, 'Excluded routes must not be logged');

    // 3. Test Included Route - This SHOULD be logged!
    runMiddleware({ method: 'GET', url: '/api/v1/products', body: { filter: 'electronics' } });
    await new Promise(r => setTimeout(r, 60));

    const includedLogs = app.ringBuffer.toArray().filter(l => l.source === 'http');
    assert.strictEqual(includedLogs.length, 1, 'Non-excluded route must be logged in buffer');
    assert.strictEqual(includedLogs[0].metadata?.http?.url, '/api/v1/products');

    // 4. Test NDJSON Export endpoint
    const mockNdjson = createMockReqRes({
      method: 'GET',
      url: '/tracernest-logger/api/logs/export?format=ndjson',
      headers: { authorization: `Bearer ${adminToken}` }
    });
    await app.handleRequest(mockNdjson.req, mockNdjson.res);
    assert.strictEqual(mockNdjson.getResponse().statusCode, 200);
    assert.strictEqual(mockNdjson.getResponse().headers['content-type'], 'application/x-ndjson; charset=utf-8');
    const ndjsonBody = mockNdjson.getResponse().body.trim();
    assert.ok(ndjsonBody.length > 0, 'NDJSON export must return lines');
    const firstObj = JSON.parse(ndjsonBody.split('\n')[0]);
    assert.ok(firstObj.id, 'NDJSON line must parse as valid log object');

    // 5. Test CSV Export endpoint
    const mockCsv = createMockReqRes({
      method: 'GET',
      url: '/tracernest-logger/api/logs/export?format=csv',
      headers: { authorization: `Bearer ${adminToken}` }
    });
    await app.handleRequest(mockCsv.req, mockCsv.res);
    assert.strictEqual(mockCsv.getResponse().statusCode, 200);
    assert.strictEqual(mockCsv.getResponse().headers['content-type'], 'text/csv; charset=utf-8');
    assert.ok(mockCsv.getResponse().body.startsWith('id,timestamp,iso_time,level,source,message,url,status'));

    // 6. Test JSON Export endpoint
    const mockJson = createMockReqRes({
      method: 'GET',
      url: '/tracernest-logger/api/logs/export?format=json',
      headers: { authorization: `Bearer ${adminToken}` }
    });
    await app.handleRequest(mockJson.req, mockJson.res);
    assert.strictEqual(mockJson.getResponse().statusCode, 200);
    assert.strictEqual(mockJson.getResponse().headers['content-type'], 'application/json; charset=utf-8');
    const parsedLogs = JSON.parse(mockJson.getResponse().body);
    assert.ok(Array.isArray(parsedLogs));

  } finally {
    app.stop();
    if (existsSync(testDataDir)) rmSync(testDataDir, { recursive: true, force: true });
  }
});

test('Integration: UI Configured Sensitive Route Exclusions (CRUD, Real-time Dynamic Interception & Dashboard UI)', async () => {
  const testDataDir = './test_ui_exclude_routes_dir';
  if (existsSync(testDataDir)) rmSync(testDataDir, { recursive: true, force: true });

  const app = new TracerNestLogger({
    dataDir: testDataDir,
    path: '/tracernest-logger',
    excludeRoutes: ['/api/static-skip']
  });

  try {
    const mw = app.middleware();

    // 1. Initial Setup to get admin token
    const mockSetup = createMockReqRes({
      method: 'POST',
      url: '/tracernest-logger/api/auth/setup',
      headers: { 'content-type': 'application/json' },
      body: { username: 'ui_admin', password: 'AdminPassword123!' }
    });
    await app.handleRequest(mockSetup.req, mockSetup.res);
    assert.strictEqual(mockSetup.getResponse().statusCode, 201);
    const adminToken = JSON.parse(mockSetup.getResponse().body).token;
    assert.ok(adminToken);

    // 2. GET /api/excluded-routes - verify initial state
    const mockGetInitial = createMockReqRes({
      method: 'GET',
      url: '/tracernest-logger/api/excluded-routes',
      headers: { authorization: `Bearer ${adminToken}` }
    });
    await app.handleRequest(mockGetInitial.req, mockGetInitial.res);
    assert.strictEqual(mockGetInitial.getResponse().statusCode, 200);
    const initialData = JSON.parse(mockGetInitial.getResponse().body);
    assert.strictEqual(initialData.rules.length, 0);
    assert.strictEqual(initialData.staticCount, 1);

    // 3. POST /api/excluded-routes - create new exclusion rule via UI endpoint
    const mockCreate = createMockReqRes({
      method: 'POST',
      url: '/tracernest-logger/api/excluded-routes',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${adminToken}`
      },
      body: {
        path: '/api/v1/billing/*',
        method: 'POST',
        description: 'Customer credit card transactions'
      }
    });
    await app.handleRequest(mockCreate.req, mockCreate.res);
    assert.strictEqual(mockCreate.getResponse().statusCode, 201);
    const createdRule = JSON.parse(mockCreate.getResponse().body).rule;
    assert.ok(createdRule.id);
    assert.strictEqual(createdRule.path, '/api/v1/billing/*');
    assert.strictEqual(createdRule.method, 'POST');
    assert.strictEqual(createdRule.enabled, true);

    // 4. Test Real-Time Dynamic Skip Interception
    const runMiddleware = (options: { method?: string; url: string; headers?: Record<string, string>; body?: any }) => {
      const mock = createMockReqRes(options);
      mw(mock.req, mock.res, () => {
        mock.res.writeHead(200, { 'content-type': 'application/json' });
        mock.res.end(JSON.stringify({ status: 'ok' }));
      });
      return mock;
    };

    // This POST to /api/v1/billing/charge should be skipped in real-time!
    runMiddleware({ method: 'POST', url: '/api/v1/billing/charge', body: { card: '4111...' } });
    await new Promise(r => setTimeout(r, 60));

    let httpLogs = app.ringBuffer.toArray().filter(l => l.source === 'http' && l.metadata?.http?.url?.includes('billing'));
    assert.strictEqual(httpLogs.length, 0, 'Dynamic exclusion rule must skip matching POST route');

    // GET to /api/v1/billing/charge should NOT be skipped because the rule is POST-only
    runMiddleware({ method: 'GET', url: '/api/v1/billing/charge' });
    await new Promise(r => setTimeout(r, 60));

    httpLogs = app.ringBuffer.toArray().filter(l => l.source === 'http' && l.metadata?.http?.url?.includes('billing'));
    assert.strictEqual(httpLogs.length, 1, 'GET route must be logged when rule is POST-only');

    // 5. PATCH /api/excluded-routes/:id/toggle - pause the rule
    const mockToggle = createMockReqRes({
      method: 'PATCH',
      url: `/tracernest-logger/api/excluded-routes/${createdRule.id}/toggle`,
      headers: { authorization: `Bearer ${adminToken}` }
    });
    await app.handleRequest(mockToggle.req, mockToggle.res);
    assert.strictEqual(mockToggle.getResponse().statusCode, 200);
    const toggledRule = JSON.parse(mockToggle.getResponse().body).rule;
    assert.strictEqual(toggledRule.enabled, false);

    // Now POST to /api/v1/billing/charge should be logged because rule is paused!
    runMiddleware({ method: 'POST', url: '/api/v1/billing/charge', body: { card: 'resumed' } });
    await new Promise(r => setTimeout(r, 60));

    httpLogs = app.ringBuffer.toArray().filter(l => l.source === 'http' && l.metadata?.http?.url?.includes('billing') && l.metadata?.http?.method === 'POST');
    assert.strictEqual(httpLogs.length, 1, 'Paused rule must allow logging to resume');

    // 6. DELETE /api/excluded-routes/:id - remove the rule
    const mockDelete = createMockReqRes({
      method: 'DELETE',
      url: `/tracernest-logger/api/excluded-routes/${createdRule.id}`,
      headers: { authorization: `Bearer ${adminToken}` }
    });
    await app.handleRequest(mockDelete.req, mockDelete.res);
    assert.strictEqual(mockDelete.getResponse().statusCode, 200);

    const mockGetAfterDelete = createMockReqRes({
      method: 'GET',
      url: '/tracernest-logger/api/excluded-routes',
      headers: { authorization: `Bearer ${adminToken}` }
    });
    await app.handleRequest(mockGetAfterDelete.req, mockGetAfterDelete.res);
    const afterDeleteData = JSON.parse(mockGetAfterDelete.getResponse().body);
    assert.strictEqual(afterDeleteData.rules.length, 0);

    // 7. Verify Dashboard UI contains exclusions view and components
    const mockUi = createMockReqRes({
      method: 'GET',
      url: '/tracernest-logger'
    });
    await app.handleRequest(mockUi.req, mockUi.res);
    assert.strictEqual(mockUi.getResponse().statusCode, 200);
    const uiHtml = mockUi.getResponse().body;
    assert.ok(uiHtml.includes('id="viewExclusions"'), 'Dashboard UI must contain viewExclusions panel');
    assert.ok(uiHtml.includes('id="navExclusions"'), 'Dashboard UI must contain navExclusions sidebar link');
    assert.ok(uiHtml.includes('loadExcludedRoutes'), 'Dashboard UI must contain loadExcludedRoutes JS function');
    assert.ok(uiHtml.includes('promptQuickExcludeRoute'), 'Dashboard UI must contain promptQuickExcludeRoute JS function');

  } finally {
    app.stop();
    if (existsSync(testDataDir)) rmSync(testDataDir, { recursive: true, force: true });
  }
});

test('Integration: Security Review Remediations (SEC-06, SEC-07, SEC-08)', async () => {
  const testDataDir = './test_sec_remediations_dir';
  if (existsSync(testDataDir)) rmSync(testDataDir, { recursive: true, force: true });

  const customMasterKey = 'my-super-secret-user-encryption-key-32chars!';
  const app = new TracerNestLogger({
    dataDir: testDataDir,
    path: '/tracernest-logger',
    secret: customMasterKey,
    interceptStdout: true,
    interceptHttp: true
  });

  try {
    const mw = app.middleware();

    // 1. SEC-06 Verification: Terminal raw field redaction
    process.stdout.write('Synthetic terminal log: {"password":"synthetic-test-secret", "user":"admin"}\n');
    await new Promise(r => setTimeout(r, 60));

    const terminalLogs = app.ringBuffer.toArray().filter(l => l.source === 'stdout');
    assert.ok(terminalLogs.length > 0, 'Must capture terminal output');
    const targetLog = terminalLogs.find(l => l.raw.includes('Synthetic') || l.message.includes('Synthetic'));
    assert.ok(targetLog, 'Target synthetic log must exist in buffer');

    assert.ok(targetLog.message.includes('"password": "[REDACTED]"'), 'Clean message must be redacted');
    assert.strictEqual(targetLog.message.includes('synthetic-test-secret'), false, 'Message must not contain secret');
    assert.ok(targetLog.raw.includes('"password": "[REDACTED]"'), 'Raw field MUST also be redacted (SEC-06 fix)');
    assert.strictEqual(targetLog.raw.includes('synthetic-test-secret'), false, 'Raw field must never leak secret');

    // 2. SEC-07 Verification: HTTP query-string credentials redaction
    const mockReqRes = createMockReqRes({
      method: 'GET',
      url: '/api/v1/user/profile?access_token=SYNTHETIC_JWT_TOKEN_12345&apiKey=sk_live_998877&page=2'
    });
    mw(mockReqRes.req, mockReqRes.res, () => {
      mockReqRes.res.writeHead(200, { 'content-type': 'application/json' });
      mockReqRes.res.end(JSON.stringify({ status: 'ok' }));
    });
    await new Promise(r => setTimeout(r, 60));

    const httpLogs = app.ringBuffer.toArray().filter(l => l.source === 'http' && l.metadata?.http?.path === '/api/v1/user/profile');
    assert.strictEqual(httpLogs.length, 1, 'Must capture HTTP request');
    const capturedHttp = httpLogs[0];
    const safeUrl = capturedHttp.metadata?.http?.url || '';

    assert.ok(safeUrl.includes('access_token=[REDACTED]'), 'URL query access_token must be redacted (SEC-07 fix)');
    assert.ok(safeUrl.includes('apiKey=[REDACTED]'), 'URL query apiKey must be redacted (SEC-07 fix)');
    assert.strictEqual(safeUrl.includes('SYNTHETIC_JWT_TOKEN_12345'), false, 'URL must not contain synthetic token');
    assert.strictEqual(safeUrl.includes('sk_live_998877'), false, 'URL must not contain synthetic API key');
    assert.ok(capturedHttp.message.includes('access_token=[REDACTED]'), 'Log message must also have redacted URL');
    assert.strictEqual(capturedHttp.message.includes('SYNTHETIC_JWT_TOKEN_12345'), false, 'Log message must not contain secret');

    // 3. SEC-08 Verification: Master encryption key stored OUTSIDE the database
    // Ensure user-defined key was used
    assert.strictEqual(app.sqlStore.getMasterKey(), customMasterKey, 'Must use user-defined encryption key');

    // Save an alert integration with confidential credentials
    app.sqlStore.saveAlertConfig('email', true, 'error', {
      smtpHost: 'smtp.mailgun.org',
      smtpUser: 'postmaster@domain.com',
      password: 'ConfidentialSmtpPassword999!'
    });

    // Verify decryption works seamlessly with user's key
    const alertConfig = app.sqlStore.getAlertConfig('email');
    assert.ok(alertConfig);
    assert.strictEqual(alertConfig.settings.password, 'ConfidentialSmtpPassword999!');

    // Inspect SQLite database directly:
    // Assert that 'master_key' is NOT present in the tableMeta table!
    const metaRows: any[] = (app.sqlStore as any).db.prepare(`SELECT * FROM ${app.sqlStore.tableMeta}`).all();
    const masterKeyRow = metaRows.find(r => r.key === 'master_key');
    assert.strictEqual(masterKeyRow, undefined, 'master_key MUST NOT be stored in system_meta table (SEC-08 fix)');

    // Inspect .sql export file if present: assert master_key is not in it
    const sqlFilePath = app.sqlStore.getSqlFilePath();
    if (existsSync(sqlFilePath)) {
      const sqlText = readFileSync(sqlFilePath, 'utf8');
      assert.strictEqual(sqlText.includes('master_key'), false, 'master_key must never be dumped in .sql export');
    }

  } finally {
    app.stop();
    if (existsSync(testDataDir)) rmSync(testDataDir, { recursive: true, force: true });
  }
});

test('Integration: Security Review Remediations (SEC-09, SEC-10) - Request Body Bounding & Dual-Throttled Proxy Defense', async () => {
  const testDataDir = './test_sec09_sec10_data';
  if (existsSync(testDataDir)) rmSync(testDataDir, { recursive: true, force: true });

  const app = new LogVault({
    dataDir: testDataDir,
    path: '/logvault',
    interceptHttp: true,
    // trustProxy is omitted -> defaults to false (SEC-10)
    gracefulShutdown: { exitProcess: false }
  });

  try {
    // Initial admin setup
    const mockSetup = createMockReqRes({
      method: 'POST',
      url: '/logvault/api/auth/setup',
      body: { username: 'admin', password: 'RootPassword2026!' }
    });
    await app.handleRequest(mockSetup.req, mockSetup.res);
    assert.strictEqual(mockSetup.getResponse().statusCode, 201);

    // ==========================================
    // 1. SEC-09 Verification: Request body size limit bounding
    // ==========================================

    // Test 1a: Pre-parsed body exceeding limit (1 MiB)
    const oversizedParsed = createMockReqRes({
      method: 'POST',
      url: '/logvault/api/auth/login',
      body: JSON.stringify({ padding: 'a'.repeat(1024 * 1024 + 10) })
    });
    await app.handleRequest(oversizedParsed.req, oversizedParsed.res);
    assert.strictEqual(oversizedParsed.getResponse().statusCode, 413, 'Must reject oversized body with HTTP 413');
    assert.ok(oversizedParsed.getResponse().body.includes('Payload Too Large'));

    // Test 1b: Content-Length header exceeding limit (1 MiB)
    const oversizedContentLength = createMockReqRes({
      method: 'POST',
      url: '/logvault/api/auth/login',
      headers: {
        'content-length': '2097152' // 2 MiB
      }
    });
    await app.handleRequest(oversizedContentLength.req, oversizedContentLength.res);
    assert.strictEqual(oversizedContentLength.getResponse().statusCode, 413, 'Must reject Content-Length > 1MB with 413');

    // Test 1c: Streaming body exceeding 1 MiB during transfer
    // Simulates an attacker sending large stream chunks
    const socket = new Socket();
    const streamingReq = new IncomingMessage(socket);
    streamingReq.method = 'POST';
    streamingReq.url = '/logvault/api/auth/login';
    streamingReq.headers = { host: 'localhost', 'content-type': 'application/json' };

    let streamStatus = 200;
    let streamBody = '';
    const resEmitter = new EventEmitter();
    const streamingRes = Object.assign(resEmitter, {
      statusCode: 200,
      setHeader() { },
      writeHead(code: number) {
        streamStatus = code;
        this.statusCode = code;
        return this;
      },
      write(chunk: any) {
        if (chunk) streamBody += chunk.toString();
        return true;
      },
      end(chunk?: any) {
        if (chunk) streamBody += chunk.toString();
        resEmitter.emit('finish');
        return this;
      }
    }) as unknown as ServerResponse;

    const handleReqPromise = app.handleRequest(streamingReq, streamingRes);

    // Push chunk 1 (600 KB) - below limit
    streamingReq.push(Buffer.alloc(600 * 1024, 'x'));
    // Push chunk 2 (600 KB) - crosses 1 MiB limit!
    streamingReq.push(Buffer.alloc(600 * 1024, 'y'));

    await handleReqPromise;

    // Check response is 413
    assert.strictEqual(streamStatus, 413, 'Streaming oversized body must trigger 413');
    assert.ok(streamBody.includes('Payload Too Large'));

    // Verify listeners were removed and memory is not retained for future chunks
    assert.strictEqual(streamingReq.listenerCount('data'), 0, 'Data listeners must be completely detached upon threshold breach');

    // Even if client continues streaming further bytes, no memory accumulation occurs
    streamingReq.push(Buffer.alloc(500 * 1024, 'z'));
    streamingReq.push(null);

    // ==========================================
    // 2. SEC-10 Verification: Proxy header spoofing & dual login throttling
    // ==========================================

    // Test 2a: Attacker with fixed socket IP tries to evade rate limiter by sending random X-Forwarded-For headers
    const attackerSocket = new Socket();
    Object.defineProperty(attackerSocket, 'remoteAddress', { value: '198.51.100.99' });

    for (let i = 1; i <= 5; i++) {
      const spoofReq = new IncomingMessage(attackerSocket);
      spoofReq.method = 'POST';
      spoofReq.url = '/logvault/api/auth/login';
      spoofReq.headers = {
        host: 'localhost',
        'x-forwarded-for': `10.0.0.${i}, 172.16.0.${i}`,
        'cf-connecting-ip': `203.0.113.${i}`
      };
      (spoofReq as any).body = { username: 'user_target', password: 'WrongPassword!' };
      spoofReq.push(null);

      const mockRes = createMockReqRes({ url: '/logvault/api/auth/login' }).res;
      let statusCode = 0;
      (mockRes as any).writeHead = (code: number) => { statusCode = code; };
      (mockRes as any).end = () => { };

      await app.handleRequest(spoofReq, mockRes);
      assert.strictEqual(statusCode, 401, `Attempt ${i} should return 401`);
    }

    // Attempt 6 from the same socket IP (with yet another spoofed X-Forwarded-For header)
    const spoofReq6 = new IncomingMessage(attackerSocket);
    spoofReq6.method = 'POST';
    spoofReq6.url = '/logvault/api/auth/login';
    spoofReq6.headers = {
      host: 'localhost',
      'x-forwarded-for': '1.2.3.4'
    };
    (spoofReq6 as any).body = { username: 'user_target', password: 'WrongPassword!' };
    spoofReq6.push(null);

    let statusCode6 = 0;
    let resBody6 = '';
    const mockRes6 = createMockReqRes({ url: '/logvault/api/auth/login' }).res;
    (mockRes6 as any).writeHead = (code: number) => { statusCode6 = code; };
    (mockRes6 as any).end = (chunk: any) => { if (chunk) resBody6 += chunk; };

    await app.handleRequest(spoofReq6, mockRes6);
    assert.strictEqual(statusCode6, 429, '6th attempt must be blocked with HTTP 429 even with different XFF header');
    assert.ok(resBody6.includes('Too many login attempts'), 'Must enforce IP rate limiter based on socket peer address');

    // Test 2b: Dual Throttling - Account-keyed login throttle against distributed brute-force
    // An attacker attempts 5 failed logins for 'admin' from 5 different socket IPs
    for (let i = 1; i <= 5; i++) {
      const distributedSocket = new Socket();
      Object.defineProperty(distributedSocket, 'remoteAddress', { value: `192.0.2.${i}` });

      const distReq = new IncomingMessage(distributedSocket);
      distReq.method = 'POST';
      distReq.url = '/logvault/api/auth/login';
      distReq.headers = { host: 'localhost' };
      (distReq as any).body = { username: 'admin', password: 'WrongPassword123!' };
      distReq.push(null);

      const mockRes = createMockReqRes({ url: '/logvault/api/auth/login' }).res;
      let distStatusCode = 0;
      (mockRes as any).writeHead = (code: number) => { distStatusCode = code; };
      (mockRes as any).end = () => { };

      await app.handleRequest(distReq, mockRes);
      assert.strictEqual(distStatusCode, 401, `Distributed attempt ${i} returns 401`);
    }

    // 6th attempt for 'admin' from yet another socket IP (IP 6)
    const distributedSocket6 = new Socket();
    Object.defineProperty(distributedSocket6, 'remoteAddress', { value: '192.0.2.6' });

    const distReq6 = new IncomingMessage(distributedSocket6);
    distReq6.method = 'POST';
    distReq6.url = '/logvault/api/auth/login';
    distReq6.headers = { host: 'localhost' };
    (distReq6 as any).body = { username: 'admin', password: 'WrongPassword123!' };
    distReq6.push(null);

    let distStatusCode6 = 0;
    let distResBody6 = '';
    const mockResDist6 = createMockReqRes({ url: '/logvault/api/auth/login' }).res;
    (mockResDist6 as any).writeHead = (code: number) => { distStatusCode6 = code; };
    (mockResDist6 as any).end = (chunk: any) => { if (chunk) distResBody6 += chunk; };

    await app.handleRequest(distReq6, mockResDist6);
    assert.strictEqual(distStatusCode6, 429, '6th attempt for admin from new IP must be blocked by account-keyed throttle');
    assert.ok(distResBody6.includes('Too many login attempts for this account'), 'Account throttle must trigger HTTP 429');

  } finally {
    app.stop();
    if (existsSync(testDataDir)) rmSync(testDataDir, { recursive: true, force: true });
  }
});

test('Integration: Request & Response Payload AES-256-GCM Encryption with Initialization Key', async () => {
  const testDataDir = './test_data_encryption_' + Date.now();
  const encryptionKey = 'super-secret-vault-encryption-key-32b!';

  const tracer = new TracerNestLogger({
    path: '/tracernest',
    dataDir: testDataDir,
    encryptionKey: encryptionKey,
    interceptHttp: true
  });

  try {
    // 1. Initial admin user registration
    const mockSetup = createMockReqRes({
      method: 'POST',
      url: '/tracernest/api/auth/setup',
      headers: { 'content-type': 'application/json' },
      body: { username: 'encadmin', password: 'MasterPassword123!', role: 'admin' }
    });
    await tracer.handleRequest(mockSetup.req, mockSetup.res);
    const setupResult = mockSetup.getResponse();
    assert.strictEqual(setupResult.statusCode, 201, 'Admin registration must succeed');
    const token = setupResult.json().token;
    assert.ok(token, 'Must return auth token');

    // 2. Simulate intercepted HTTP API transaction
    const interceptedReq = createMockReqRes({
      method: 'POST',
      url: '/api/v1/confidential-records',
      headers: { 'content-type': 'application/json' },
      body: {
        recordId: 'REC-9941',
        ssnOrTaxId: '000-12-3456',
        patientHealthData: 'classified-medical-history',
        notes: 'Top Secret Payload'
      }
    });

    const interceptedMw = tracer.middleware();
    await new Promise<void>((resolve) => {
      interceptedMw(interceptedReq.req, interceptedReq.res, () => {
        interceptedReq.res.writeHead(201, { 'content-type': 'application/json' });
        interceptedReq.res.write(JSON.stringify({
          status: 'success',
          createdRecordId: 'REC-9941',
          transactionMessage: 'Confidential transaction approved by auditor',
          internalBatchCode: 'batch_classified_abc123'
        }));
        interceptedReq.res.end();
        resolve();
      });
    });

    // Allow async persistence & buffer capture
    await new Promise((r) => setTimeout(r, 100));

    // 3. Query logs via raw API without decrypt flag
    const mockLogsReq = createMockReqRes({
      method: 'GET',
      url: '/tracernest/api/logs',
      headers: { authorization: `Bearer ${token}` }
    });
    await tracer.handleRequest(mockLogsReq.req, mockLogsReq.res);
    const logsResult = mockLogsReq.getResponse();
    assert.strictEqual(logsResult.statusCode, 200, 'GET /api/logs must succeed');

    const rawLogs = logsResult.json().logs;
    const apiLog = rawLogs.find((l: any) => l.metadata?.http?.url === '/api/v1/confidential-records');
    assert.ok(apiLog, 'Must find confidential-records log entry');
    assert.strictEqual(apiLog.metadata.http.encrypted, true, 'Metadata must denote encrypted: true');

    // Verify requestBody is encrypted:
    const reqBody = apiLog.metadata.http.requestBody;
    assert.ok(reqBody, 'requestBody must be present');
    assert.strictEqual(reqBody.encrypted, true, 'requestBody object must have encrypted: true');
    assert.strictEqual(reqBody.algorithm, 'aes-256-gcm', 'requestBody must declare aes-256-gcm');
    assert.ok(reqBody.ciphertext, 'requestBody must have ciphertext');
    assert.ok(reqBody.iv, 'requestBody must have iv');
    assert.ok(reqBody.authTag, 'requestBody must have authTag');

    // Verify raw body string representation does NOT leak plaintext
    const stringified = JSON.stringify(apiLog);
    assert.ok(!stringified.includes('Top Secret Payload'), 'Plaintext request payload must NEVER appear in un-decrypted logs');
    assert.ok(!stringified.includes('batch_classified_abc123'), 'Plaintext response payload must NEVER appear in un-decrypted logs');

    // Verify responseBody is encrypted:
    const resBody = apiLog.metadata.http.responseBody;
    assert.ok(resBody, 'responseBody must be present');
    assert.strictEqual(resBody.encrypted, true, 'responseBody object must have encrypted: true');
    assert.ok(resBody.ciphertext, 'responseBody must have ciphertext');

    // 4. Test On-Demand Decryption endpoint: POST /api/logs/decrypt
    const mockDecryptReq = createMockReqRes({
      method: 'POST',
      url: '/tracernest/api/logs/decrypt',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`
      },
      body: { payload: reqBody }
    });
    await tracer.handleRequest(mockDecryptReq.req, mockDecryptReq.res);
    const decryptResult = mockDecryptReq.getResponse();
    assert.strictEqual(decryptResult.statusCode, 200, 'POST /api/logs/decrypt must succeed');
    const decryptedJson = decryptResult.json();
    assert.strictEqual(decryptedJson.success, true);
    assert.strictEqual(decryptedJson.decrypted.notes, 'Top Secret Payload', 'Must decrypt request payload back to original JSON');
    assert.strictEqual(decryptedJson.decrypted.recordId, 'REC-9941');

    // 5. Test Decryption of response body
    const mockDecryptRes = createMockReqRes({
      method: 'POST',
      url: '/tracernest/api/logs/decrypt',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`
      },
      body: { payload: resBody }
    });
    await tracer.handleRequest(mockDecryptRes.req, mockDecryptRes.res);
    const decryptedResResult = mockDecryptRes.getResponse();
    assert.strictEqual(decryptedResResult.statusCode, 200);
    assert.strictEqual(decryptedResResult.json().decrypted.internalBatchCode, 'batch_classified_abc123');
    assert.strictEqual(decryptedResResult.json().decrypted.transactionMessage, 'Confidential transaction approved by auditor');

    // 6. Test Tampered Ciphertext handling
    const tamperedPayload = { ...reqBody, ciphertext: 'bad' + reqBody.ciphertext.slice(3) };
    const mockTamperReq = createMockReqRes({
      method: 'POST',
      url: '/tracernest/api/logs/decrypt',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`
      },
      body: { payload: tamperedPayload }
    });
    await tracer.handleRequest(mockTamperReq.req, mockTamperReq.res);
    const tamperResult = mockTamperReq.getResponse();
    assert.strictEqual(tamperResult.statusCode, 400, 'Tampered ciphertext must fail decryption with HTTP 400');
    assert.strictEqual(tamperResult.json().success, false);

    // 7. Test GET /api/logs with ?decrypt=true
    const mockLogsDecryptedReq = createMockReqRes({
      method: 'GET',
      url: '/tracernest/api/logs?decrypt=true',
      headers: { authorization: `Bearer ${token}` }
    });
    await tracer.handleRequest(mockLogsDecryptedReq.req, mockLogsDecryptedReq.res);
    const logsDecryptedResult = mockLogsDecryptedReq.getResponse();
    assert.strictEqual(logsDecryptedResult.statusCode, 200);
    const decryptedLogs = logsDecryptedResult.json().logs;
    const decryptedApiLog = decryptedLogs.find((l: any) => l.metadata?.http?.url === '/api/v1/confidential-records');
    assert.ok(decryptedApiLog);
    assert.strictEqual(decryptedApiLog.metadata.http.requestBody.notes, 'Top Secret Payload', 'GET /api/logs?decrypt=true must return decrypted request body');
    assert.strictEqual(decryptedApiLog.metadata.http.responseBody.internalBatchCode, 'batch_classified_abc123', 'GET /api/logs?decrypt=true must return decrypted response body');

    // 8. Test Export with ?decrypt=true
    const mockExportReq = createMockReqRes({
      method: 'GET',
      url: '/tracernest/api/logs/export?format=json&decrypt=true',
      headers: { authorization: `Bearer ${token}` }
    });
    await tracer.handleRequest(mockExportReq.req, mockExportReq.res);
    const exportResult = mockExportReq.getResponse();
    assert.strictEqual(exportResult.statusCode, 200);
    assert.ok(exportResult.body.includes('Top Secret Payload'), 'Export with decrypt=true must include decrypted content');

  } finally {
    tracer.stop();
    if (existsSync(testDataDir)) rmSync(testDataDir, { recursive: true, force: true });
  }
});

test('Integration: Auto-provision Initial Administrator via initialAdmin Config & disableSetupApi', async () => {
  const testDataDir = './test_data_init_admin_' + Date.now();

  const tracer = new TracerNestLogger({
    path: '/tracernest',
    dataDir: testDataDir,
    initialAdmin: {
      username: 'preseededadmin',
      password: 'PreSeededPassword123!'
    },
    disableSetupApi: true
  });

  try {
    // 1. Verify GET /api/auth/status reports initialized: true and setupDisabled: true
    const mockStatus = createMockReqRes({
      method: 'GET',
      url: '/tracernest/api/auth/status'
    });
    await tracer.handleRequest(mockStatus.req, mockStatus.res);
    const statusRes = mockStatus.getResponse();
    assert.strictEqual(statusRes.statusCode, 200);
    assert.strictEqual(statusRes.json().initialized, true, 'Database must be initialized via initialAdmin');
    assert.strictEqual(statusRes.json().setupDisabled, true, 'setupDisabled must be true');

    // 2. Verify POST /api/auth/setup is blocked with 403 Forbidden
    const mockSetup = createMockReqRes({
      method: 'POST',
      url: '/tracernest/api/auth/setup',
      headers: { 'content-type': 'application/json' },
      body: { username: 'attacker', password: 'HackPassword123!' }
    });
    await tracer.handleRequest(mockSetup.req, mockSetup.res);
    const setupRes = mockSetup.getResponse();
    assert.strictEqual(setupRes.statusCode, 403, 'POST /api/auth/setup must return 403 when disableSetupApi is true');

    // 3. Verify the preseeded admin can login successfully
    const mockLogin = createMockReqRes({
      method: 'POST',
      url: '/tracernest/api/auth/login',
      headers: { 'content-type': 'application/json' },
      body: { username: 'preseededadmin', password: 'PreSeededPassword123!' }
    });
    await tracer.handleRequest(mockLogin.req, mockLogin.res);
    const loginRes = mockLogin.getResponse();
    assert.strictEqual(loginRes.statusCode, 200, 'Pre-seeded admin must be able to log in');
    assert.ok(loginRes.json().token);
    assert.strictEqual(loginRes.json().user.username, 'preseededadmin');
    assert.strictEqual(loginRes.json().user.role, 'admin');

  } finally {
    tracer.stop();
    if (existsSync(testDataDir)) rmSync(testDataDir, { recursive: true, force: true });
  }
});

test('Integration: Reverse Proxy Prefix Stripping, Dual Route Matching & Spelling Aliases', async () => {
  const testDataDir = './test_data_proxy_' + Date.now();

  const tracer = new TracerNestLogger({
    path: '/tracenest', // Notice without 'r'
    apiPrefix: '/api',  // External gateway prefix
    dataDir: testDataDir
  });

  try {
    // 1. Check candidate paths: must include /api/tracenest, /api/tracernest, /tracenest, /tracernest
    const candidates = tracer.httpHandler.getCandidateBasePaths();
    assert.ok(candidates.includes('/api/tracenest'), 'Must include /api/tracenest');
    assert.ok(candidates.includes('/api/tracernest'), 'Must include /api/tracernest');
    assert.ok(candidates.includes('/tracenest'), 'Must include /tracenest');
    assert.ok(candidates.includes('/tracernest'), 'Must include /tracernest');

    // 2. Request through Nginx that stripped /api/ (Node receives /tracenest/api/auth/status)
    const mockStripped = createMockReqRes({
      method: 'GET',
      url: '/tracenest/api/auth/status'
    });
    assert.strictEqual(tracer.httpHandler.isMatch(mockStripped.req), true);
    await tracer.handleRequest(mockStripped.req, mockStripped.res);
    assert.strictEqual(mockStripped.getResponse().statusCode, 200);

    // 3. Request through proxy preserving /api/ (Node receives /api/tracenest/api/auth/status)
    const mockUnstripped = createMockReqRes({
      method: 'GET',
      url: '/api/tracenest/api/auth/status'
    });
    assert.strictEqual(tracer.httpHandler.isMatch(mockUnstripped.req), true);
    await tracer.handleRequest(mockUnstripped.req, mockUnstripped.res);
    assert.strictEqual(mockUnstripped.getResponse().statusCode, 200);

    // 4. Request using 'tracernest' spelling (Node receives /tracernest/api/auth/status)
    const mockAlternate = createMockReqRes({
      method: 'GET',
      url: '/tracernest/api/auth/status'
    });
    assert.strictEqual(tracer.httpHandler.isMatch(mockAlternate.req), true);
    await tracer.handleRequest(mockAlternate.req, mockAlternate.res);
    assert.strictEqual(mockAlternate.getResponse().statusCode, 200);

    // 5. Dashboard HTML must include automatic BASE_PATH detection
    const mockHtml = createMockReqRes({
      method: 'GET',
      url: '/tracenest'
    });
    await tracer.handleRequest(mockHtml.req, mockHtml.res);
    const htmlRes = mockHtml.getResponse();
    assert.strictEqual(htmlRes.statusCode, 200);
    assert.ok(htmlRes.body.includes('window.location.pathname'));
    assert.ok(htmlRes.body.includes('BASE_PATH'));
  } finally {
    tracer.stop();
    if (existsSync(testDataDir)) rmSync(testDataDir, { recursive: true, force: true });
  }
});

test('Integration: List View Payload Decryption & Enhanced Full Inspect Log Modal UI', async () => {
  const html = getDashboardHtml('/tracenest', 'TracerNest Console');

  // 1. Verify absence of undefined allLogs reference in client script
  assert.ok(!html.includes('allLogs.find'), 'Must not reference undefined allLogs in script');
  assert.ok(html.includes('logsCache.find(l => l.id === logId)'), 'Must look up logs from logsCache');

  // 2. Verify list view decryption capabilities in both API view and standard log drawer
  assert.ok(html.includes('isPayloadEncrypted'), 'Must define isPayloadEncrypted helper');
  assert.ok(html.includes('extractEncryptedPayload'), 'Must define extractEncryptedPayload helper');
  assert.ok(html.includes('decryptPayloadInCard'), 'Must define decryptPayloadInCard function');
  assert.ok(html.includes('data-enc-badge'), 'Must support dynamic encryption badge tracking in list view');

  // 3. Verify enhanced Full Inspect Log Modal elements and modern UI structure
  assert.ok(html.includes('Full Inspect Log'), 'Modal title must be Full Inspect Log');
  assert.ok(html.includes('id="lmHttpBanner"'), 'Must have dedicated HTTP summary banner');
  assert.ok(html.includes('id="lmHttpBannerMethod"'), 'Must display HTTP method in banner');
  assert.ok(html.includes('id="lmHttpBannerStatus"'), 'Must display HTTP status code in banner');
  assert.ok(html.includes('id="lmHttpBannerUrl"'), 'Must display full HTTP path/URL in banner');
  assert.ok(html.includes('id="lmHttpBannerLatency"'), 'Must display latency pill in banner');
  assert.ok(html.includes('id="lmHttpBannerIp"'), 'Must display client IP pill in banner');

  // 4. Verify interactive modal tabs
  assert.ok(html.includes('id="lmTabNav"'), 'Must contain modal tab navigation');
  assert.ok(html.includes('id="lmTabBtnPayloads"'), 'Must contain Payloads tab button');
  assert.ok(html.includes('id="lmTabBtnHeaders"'), 'Must contain HTTP Headers tab button');
  assert.ok(html.includes('id="lmTabBtnDetails"'), 'Must contain Log Details tab button');
  assert.ok(html.includes('id="lmTabBtnRaw"'), 'Must contain Raw JSON tab button');
  assert.ok(html.includes('switchModalTab'), 'Must define switchModalTab function');

  // 5. Verify payload cards and decrypt button in modal
  assert.ok(html.includes('modal-payload-grid'), 'Must use responsive modal payload grid');
  assert.ok(html.includes('modal-code-viewer'), 'Must use spacious dark monospace code viewer');
  assert.ok(html.includes('id="btnDecryptModalReq"'), 'Must have request payload decrypt button');
  assert.ok(html.includes('id="btnDecryptModalRes"'), 'Must have response payload decrypt button');
  assert.ok(html.includes('id="lmHeadersContainer"'), 'Must have headers inspector container');

  // 6. Verify full script compiles cleanly in V8 engine without any syntax errors
  const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(scriptMatch, 'Must contain <script> tag');
  assert.doesNotThrow(() => {
    new vm.Script(scriptMatch[1]);
  }, 'Dashboard client script with list view decryption and enhanced modal must compile cleanly in V8');
});

test('Integration: Persistent Terminal and HTTP Logs Across Server Restarts', async () => {
  const testDataDir = './test_persist_logs_' + Date.now();
  if (existsSync(testDataDir)) rmSync(testDataDir, { recursive: true, force: true });

  try {
    // 1. Initial server run: start logger instance
    const tracer1 = new TracerNestLogger({
      dataDir: testDataDir,
      persistLogs: true,
      interceptStdout: false,
      interceptStderr: false,
      interceptHttp: false
    });

    tracer1.ringBuffer.push({
      id: 'test_term_1',
      timestamp: Date.now() - 5000,
      level: 'info',
      source: 'stdout',
      message: 'Server starting on port 3000',
      raw: 'Server starting on port 3000'
    });

    tracer1.ringBuffer.push({
      id: 'test_http_1',
      timestamp: Date.now() - 2000,
      level: 'info',
      source: 'http',
      message: 'HTTP [POST] /api/v1/login - 200 (15ms)',
      raw: 'HTTP [POST] /api/v1/login - 200 (15ms)',
      metadata: {
        http: {
          method: 'POST',
          url: '/api/v1/login',
          path: '/api/v1/login',
          statusCode: 200,
          durationMs: 15,
          clientIp: '127.0.0.1'
        }
      }
    });

    assert.strictEqual(tracer1.ringBuffer.size(), 2, 'First instance should have 2 logs in memory');
    assert.strictEqual(tracer1.sqlStore.getLogsCount(), 2, 'First instance should have 2 logs in database');

    tracer1.stop();
    tracer1.sqlStore.close();

    // 2. Simulate server restart: new instance pointing to same persistent database
    const tracer2 = new TracerNestLogger({
      dataDir: testDataDir,
      persistLogs: true,
      interceptStdout: false,
      interceptStderr: false,
      interceptHttp: false
    });

    assert.strictEqual(tracer2.ringBuffer.size(), 2, 'Second instance must reload both persisted logs into ringBuffer upon restart');
    const logs = tracer2.ringBuffer.toArray();
    assert.strictEqual(logs[0].id, 'test_term_1');
    assert.strictEqual(logs[0].message, 'Server starting on port 3000');
    assert.strictEqual(logs[0].source, 'stdout');
    assert.strictEqual(logs[1].id, 'test_http_1');
    assert.strictEqual(logs[1].metadata?.http?.url, '/api/v1/login');
    assert.strictEqual(logs[1].source, 'http');

    // 3. New logs emitted on restarted server are appended and persisted
    tracer2.ringBuffer.push({
      id: 'test_term_2',
      timestamp: Date.now(),
      level: 'warn',
      source: 'stderr',
      message: 'High connection pool usage detected',
      raw: 'High connection pool usage detected'
    });

    assert.strictEqual(tracer2.ringBuffer.size(), 3, 'Must contain 3 logs after appending new entry');
    assert.strictEqual(tracer2.sqlStore.getLogsCount(), 3, 'Database must contain 3 persisted logs');

    // 4. Verify TTL lifecycle: Logs must remain in database UNTIL TTL is completed
    const now = Date.now();
    tracer2.ringBuffer.push({
      id: 'test_ttl_short',
      timestamp: now,
      expiresAt: now + 50, // TTL completes in 50ms
      level: 'debug',
      source: 'api',
      message: 'Short-lived debug log',
      raw: 'Short-lived debug log'
    });

    tracer2.ringBuffer.push({
      id: 'test_ttl_long',
      timestamp: now,
      expiresAt: now + 3600000, // TTL completes in 1 hour
      level: 'info',
      source: 'stdout',
      message: 'Long-lived info log',
      raw: 'Long-lived info log'
    });

    // Before 50ms: TTL is NOT completed -> both logs must remain in database
    tracer2.ttlManager.sweep();
    assert.strictEqual(tracer2.sqlStore.getActiveLogsCount(now), 5, 'All 5 logs must remain in DB before TTL completes');
    const queryBefore = tracer2.ringBuffer.query({ limit: 100 }, now);
    assert.strictEqual(queryBefore.total, 5, 'All active logs must be queryable from DB');

    // Wait 70ms for test_ttl_short TTL to complete
    await new Promise(r => setTimeout(r, 70));

    // After 70ms: test_ttl_short TTL is completed -> swept and purged
    const swept = tracer2.ttlManager.sweep();
    assert.ok(swept >= 1, 'Should have purged at least the expired log');
    assert.strictEqual(tracer2.sqlStore.getActiveLogsCount(), 4, 'Only 4 unexpired logs must remain in DB');
    const queryAfter = tracer2.ringBuffer.query({ limit: 100 });
    assert.strictEqual(queryAfter.total, 4, 'Only unexpired logs returned from DB');
    assert.ok(queryAfter.logs.some(l => l.id === 'test_ttl_long'), 'Log with incomplete TTL must still be in DB');
    assert.ok(!queryAfter.logs.some(l => l.id === 'test_ttl_short'), 'Log with completed TTL must be purged from DB');

    // 5. Test ringBuffer.clear() clears database as well
    tracer2.ringBuffer.clear();
    assert.strictEqual(tracer2.ringBuffer.size(), 0);
    assert.strictEqual(tracer2.sqlStore.getLogsCount(), 0);

    tracer2.stop();
    tracer2.sqlStore.close();
  } finally {
    if (existsSync(testDataDir)) rmSync(testDataDir, { recursive: true, force: true });
  }
});

test('Integration: SQLite to MySQL Auto-Migration, Schema Updates, SQLite Cleanup & Master Key Preservation with Custom Folder', async () => {
  const customInitFolder = './test_migration_folder_' + Date.now();
  if (existsSync(customInitFolder)) rmSync(customInitFolder, { recursive: true, force: true });

  try {
    // 1. Initial run: Application starts in SQLite mode inside a custom folder
    const sqliteInstance = new TracerNestLogger({
      folder: customInitFolder,
      dialect: 'sqlite',
      interceptStdout: false,
      interceptStderr: false,
      interceptHttp: false
    });

    // Seed SQLite data: Users, Alerts, Excluded Routes, Telemetry Logs
    sqliteInstance.userStore.createUser('migrated_admin', 'Pass1234!', 'admin');
    sqliteInstance.sqlStore.saveAlertConfig('email', true, 'error', {
      smtpHost: 'smtp.sendgrid.net',
      smtpPort: 587,
      to: 'ops@acme.corp'
    });
    sqliteInstance.sqlStore.saveExcludedRoutes([
      { id: 'ex_1', path: '/api/v1/health', enabled: true, createdAt: Date.now() }
    ]);
    sqliteInstance.ringBuffer.push({
      id: 'log_sqlite_migrated',
      timestamp: Date.now() - 1000,
      level: 'warn',
      source: 'stdout',
      message: 'Initial startup log in SQLite mode',
      raw: 'Initial startup log in SQLite mode'
    });

    // Verify all files were created in customInitFolder
    const sqliteFilePath = `${customInitFolder}/tracernest-logger.sqlite`;
    const sqlFilePath = `${customInitFolder}/tracernest-logger.sql`;
    const masterKeyPath = `${customInitFolder}/.master.key`;

    assert.ok(existsSync(sqliteFilePath), 'SQLite database file should exist before migration');
    assert.ok(existsSync(masterKeyPath), '.master.key must exist in custom initialization folder');
    const originalMasterKey = readFileSync(masterKeyPath, 'utf8').trim();
    assert.ok(originalMasterKey.length >= 16, 'Original master key must be a valid secret');

    // Stop SQLite instance and close db so handles are released
    sqliteInstance.stop();
    sqliteInstance.sqlStore.close();

    // 2. Developer updates initialization in app.js from SQLite to MySQL
    const mysqlStorage: Record<string, any[]> = {
      users: [],
      alert_configs: [],
      audit_logs: [],
      logs: [],
      system_meta: []
    };
    const executedQueries: string[] = [];

    const mockPool = {
      query: async (sql: string, params?: any[]) => {
        executedQueries.push(sql);

        // Normalize SQL
        const cleanSql = sql.replace(/\s+/g, ' ').trim();

        if (cleanSql.includes('INSERT INTO') && cleanSql.includes('users') || cleanSql.includes('REPLACE INTO') && cleanSql.includes('users')) {
          if (params) {
            const [id, username, password_hash, salt, role, created_at, last_login_at, must_change_password, token_version] = params;
            mysqlStorage.users = mysqlStorage.users.filter(u => u.id !== id && u.username !== username);
            mysqlStorage.users.push({ id, username, password_hash, salt, role, created_at, last_login_at, must_change_password, token_version });
          }
          return [[]];
        }

        if (cleanSql.includes('INSERT INTO') && cleanSql.includes('alert_configs') || cleanSql.includes('REPLACE INTO') && cleanSql.includes('alert_configs')) {
          if (params) {
            const [id, channel, enabled, level_threshold, ciphertext, iv, auth_tag, salt, created_at, updated_at] = params;
            mysqlStorage.alert_configs = mysqlStorage.alert_configs.filter(a => a.channel !== channel);
            mysqlStorage.alert_configs.push({ id, channel, enabled, level_threshold, ciphertext, iv, auth_tag, salt, created_at, updated_at });
          }
          return [[]];
        }

        if (cleanSql.includes('INSERT INTO') && cleanSql.includes('logs') || cleanSql.includes('REPLACE INTO') && cleanSql.includes('logs')) {
          if (params) {
            const [id, timestamp, expires_at, level, source, message, raw, metadata, tags] = params;
            mysqlStorage.logs = mysqlStorage.logs.filter(l => l.id !== id);
            mysqlStorage.logs.push({ id, timestamp, expires_at, level, source, message, raw, metadata, tags });
          }
          return [[]];
        }

        if (cleanSql.includes('INSERT INTO') && cleanSql.includes('system_meta') || cleanSql.includes('REPLACE INTO') && cleanSql.includes('system_meta')) {
          if (params) {
            const [key, value] = params;
            mysqlStorage.system_meta = mysqlStorage.system_meta.filter(m => m.key !== key);
            mysqlStorage.system_meta.push({ key, value });
          }
          return [[]];
        }

        if (cleanSql.includes('SELECT * FROM') && cleanSql.includes('users')) {
          return [mysqlStorage.users];
        }

        if (cleanSql.includes('SELECT * FROM') && cleanSql.includes('alert_configs')) {
          return [mysqlStorage.alert_configs];
        }

        if (cleanSql.includes('SELECT * FROM') && cleanSql.includes('system_meta')) {
          return [mysqlStorage.system_meta];
        }

        if (cleanSql.includes('FROM') && cleanSql.includes('logs')) {
          return [mysqlStorage.logs];
        }

        return [[]];
      }
    };

    const mysqlInstance = new TracerNestLogger({
      folder: customInitFolder,
      dialect: 'mysql',
      mysql: { pool: mockPool },
      interceptStdout: false,
      interceptStderr: false,
      interceptHttp: false
    });

    // Wait for asynchronous MySQL initialization and SQLite-to-MySQL auto-migration to complete
    await mysqlInstance.sqlStore.initMySql();

    // 3. Verify SQLite data was migrated into MySQL
    assert.strictEqual(mysqlStorage.users.length, 1, 'User must be migrated to MySQL');
    assert.strictEqual(mysqlStorage.users[0].username, 'migrated_admin');
    assert.strictEqual(mysqlStorage.alert_configs.length, 1, 'Alert config must be migrated to MySQL');
    assert.strictEqual(mysqlStorage.alert_configs[0].channel, 'email');
    assert.strictEqual(mysqlStorage.logs.length, 1, 'Log entry must be migrated to MySQL');
    assert.strictEqual(mysqlStorage.logs[0].id, 'log_sqlite_migrated');

    // 4. Verify SQLite database & SQL mirror files are deleted
    assert.strictEqual(existsSync(sqliteFilePath), false, 'SQLite database file (.sqlite) must be deleted after migration');
    assert.strictEqual(existsSync(sqlFilePath), false, 'Synchronized SQL file (.sql) must be deleted after migration');

    // 5. Verify .master.key is strictly PRESERVED and untouched
    assert.ok(existsSync(masterKeyPath), '.master.key file MUST be preserved after migration');
    const preservedMasterKey = readFileSync(masterKeyPath, 'utf8').trim();
    assert.strictEqual(preservedMasterKey, originalMasterKey, 'Preserved master key must match original exactly');

    // 6. Verify fast local in-memory tier is populated from MySQL for synchronous reads
    const syncedUser = mysqlInstance.sqlStore.getUserByUsername('migrated_admin');
    assert.ok(syncedUser, 'Migrated user must be accessible via synchronous get');
    assert.strictEqual(syncedUser?.username, 'migrated_admin');

    const syncedAlert = mysqlInstance.sqlStore.getAlertConfig('email');
    assert.ok(syncedAlert, 'Migrated alert config must be decryptable and accessible');
    assert.strictEqual(syncedAlert?.channel, 'email');
    assert.strictEqual(syncedAlert?.settings?.smtpHost, 'smtp.sendgrid.net');

    // 7. Verify newly installed package schema updates (ALTER TABLE ADD COLUMN) were executed
    const alterUserQueries = executedQueries.filter(q => q.includes('ALTER TABLE') && q.includes('ADD COLUMN'));
    assert.ok(alterUserQueries.length >= 4, 'Schema update queries (ALTER TABLE ADD COLUMN) must be executed');

    mysqlInstance.stop();
    mysqlInstance.sqlStore.close();
  } finally {
    if (existsSync(customInitFolder)) rmSync(customInitFolder, { recursive: true, force: true });
  }
});

test('Integration: Laravel 13 Telemetry Ingestion API (POST /api/logs/ingest)', async () => {
  const testDir = './test_laravel_ingest_' + Date.now();
  if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });

  const masterSecret = '0123456789abcdef0123456789abcdef';
  const tracer = new TracerNestLogger({
    folder: testDir,
    masterKey: masterSecret,
    interceptStdout: false,
    interceptStderr: false,
    interceptHttp: false
  });

  try {
    // 1. Ingestion without auth -> 401
    const unauthReq = createMockReqRes({
      method: 'POST',
      url: '/tracernest-logger/api/logs/ingest',
      body: { message: 'Attempt unauthorized log' }
    });
    await tracer.handleRequest(unauthReq.req, unauthReq.res);
    assert.strictEqual(unauthReq.getResponse().statusCode, 401);

    // 2. Ingestion with valid x-tracernest-key header -> 200
    const laravelReq = createMockReqRes({
      method: 'POST',
      url: '/tracernest-logger/api/logs/ingest',
      headers: {
        'x-tracernest-key': masterSecret
      },
      body: {
        level: 'error',
        source: 'laravel',
        message: 'HTTP [POST] /api/v1/orders - 500 (45ms)',
        metadata: {
          framework: 'laravel',
          version: '13',
          http: {
            method: 'POST',
            url: '/api/v1/orders',
            statusCode: 500,
            durationMs: 45,
            clientIp: '198.51.100.22',
            requestBody: { items: [{ id: 'item_1', qty: 2 }] },
            responseBody: { error: 'Payment gateway timeout' }
          }
        },
        tags: ['laravel', 'laravel13', 'orders']
      }
    });

    await tracer.handleRequest(laravelReq.req, laravelReq.res);
    assert.strictEqual(laravelReq.getResponse().statusCode, 200);
    const ingestRes = laravelReq.getResponse().json();
    assert.strictEqual(ingestRes.success, true);
    assert.strictEqual(ingestRes.count, 1);

    // 3. Batch Ingestion of Laravel Monolog logs
    const batchReq = createMockReqRes({
      method: 'POST',
      url: '/tracernest-logger/api/logs/ingest',
      headers: {
        'authorization': `Bearer ${masterSecret}`
      },
      body: {
        logs: [
          {
            level: 'info',
            source: 'laravel',
            message: 'Queue worker job processed: SendOrderConfirmationEmail',
            metadata: { framework: 'laravel', version: '13', queue: 'default' },
            tags: ['laravel', 'queue']
          },
          {
            level: 'warn',
            source: 'laravel',
            message: 'Redis cache hit ratio below 80%',
            metadata: { framework: 'laravel', version: '13', cache: 'redis' },
            tags: ['laravel', 'cache']
          }
        ]
      }
    });

    await tracer.handleRequest(batchReq.req, batchReq.res);
    assert.strictEqual(batchReq.getResponse().statusCode, 200);
    const batchRes = batchReq.getResponse().json();
    assert.strictEqual(batchRes.count, 2);

    // 4. Verify ringBuffer and query API contain the ingested Laravel logs
    const queried = tracer.ringBuffer.query({ source: 'laravel' });
    assert.strictEqual(queried.total, 3, 'All 3 Laravel logs should be stored and queryable');
    const orderLog = queried.logs.find(l => l.message.includes('/api/v1/orders'));
    assert.ok(orderLog, 'Laravel HTTP error log must exist in ring buffer');
    assert.strictEqual(orderLog?.level, 'error');
    assert.strictEqual(orderLog?.metadata?.framework, 'laravel');
    assert.strictEqual(orderLog?.metadata?.version, '13');

    // Verify payload encryption on request/response body
    assert.ok(orderLog?.metadata?.http?.requestBody?.encrypted || orderLog?.metadata?.http?.requestBody?.__encrypted, 'Payload must be encrypted with AES-256-GCM');

    // 5. Verify direct root fallback ingestion (without basePath prefix e.g. POST /api/logs/ingest)
    const directRootReq = createMockReqRes({
      method: 'POST',
      url: '/api/logs/ingest',
      headers: {
        'x-tracernest-key': masterSecret
      },
      body: {
        level: 'info',
        source: 'laravel',
        message: 'Direct root fallback ingest without prefix'
      }
    });
    const handled = await tracer.handleRequest(directRootReq.req, directRootReq.res);
    assert.strictEqual(handled, true);
    assert.strictEqual(directRootReq.getResponse().statusCode, 200);

    // 6. Verify database persistence
    assert.strictEqual(tracer.sqlStore.getLogsCount(), 4, 'Logs must be persisted to SQL store');

    tracer.stop();
    tracer.sqlStore.close();
  } finally {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
  }
});

test('Security: AlertDispatcher SMTP CRLF, Dot-Stuffing & Teams Webhook SSRF Validation', async () => {
  const testDir = `./test_security_alerts_${Date.now()}`;
  const tracer = new TracerNestLogger({
    dataDir: testDir,
    masterKey: '0123456789abcdef0123456789abcdef'
  });

  try {
    const dispatcher = (tracer as any).alertDispatcher;
    assert.ok(dispatcher, 'AlertDispatcher must exist');

    // 1. CRLF Injection Defense in SMTP
    await assert.rejects(
      async () => {
        await dispatcher.sendEmail({
          host: 'smtp.example.com',
          port: 465,
          secure: true,
          from: 'admin@example.com\r\nBcc: victim@example.com',
          to: 'alerts@example.com',
          subject: 'Incident Alert',
          body: 'Log message'
        });
      },
      /CRLF injection attempt detected/,
      'SMTP sendEmail must reject CRLF characters in from address'
    );

    await assert.rejects(
      async () => {
        await dispatcher.sendEmail({
          host: 'smtp.example.com',
          port: 465,
          secure: true,
          from: 'admin@example.com',
          to: 'alerts@example.com\r\nSubject: Injected Subject',
          subject: 'Incident Alert',
          body: 'Log message'
        });
      },
      /CRLF injection attempt detected/,
      'SMTP sendEmail must reject CRLF characters in to address'
    );

    await assert.rejects(
      async () => {
        await dispatcher.sendEmail({
          host: 'smtp.example.com',
          port: 465,
          secure: true,
          from: 'admin@example.com',
          to: 'alerts@example.com',
          subject: 'Header\r\nInjected: True',
          body: 'Log message'
        });
      },
      /CRLF injection attempt detected/,
      'SMTP sendEmail must reject CRLF characters in subject'
    );

    // 2. Microsoft Teams Webhook HTTPS & Domain Whitelist Validation
    await assert.rejects(
      async () => {
        await dispatcher.sendTeams('http://office.com/webhook', {
          title: 'Alert',
          level: 'error',
          message: 'Error message',
          timestamp: Date.now(),
          source: 'test'
        });
      },
      /Microsoft Teams Webhook URL must use HTTPS/,
      'Teams sendTeams must reject unencrypted HTTP URLs'
    );

    await assert.rejects(
      async () => {
        await dispatcher.sendTeams('https://evil-server.attacker.com/steal-logs', {
          title: 'Alert',
          level: 'error',
          message: 'Error message',
          timestamp: Date.now(),
          source: 'test'
        });
      },
      /Only verified Microsoft\/Office webhook domains are permitted/,
      'Teams sendTeams must reject untrusted / third-party arbitrary destination domains'
    );

    await assert.rejects(
      async () => {
        await dispatcher.sendTeams('https://169.254.169.254/latest/meta-data', {
          title: 'Alert',
          level: 'error',
          message: 'Error message',
          timestamp: Date.now(),
          source: 'test'
        });
      },
      /Only verified Microsoft\/Office webhook domains are permitted/,
      'Teams sendTeams must reject cloud metadata endpoints and SSRF IP destinations'
    );

    // 3. Verify handler.ts does not require or export node:fs
    const handlerSource = readFileSync('./src/middleware/handler.ts', 'utf8');
    assert.strictEqual(
      handlerSource.includes("from 'node:fs'"),
      false,
      'handler.ts must NOT import node:fs'
    );

    tracer.stop();
    tracer.sqlStore.close();
  } finally {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
  }
});

test('Integration: Security Hardening - Dashboard HTML Escaping, Safe basePath, and CSP Hardening', async () => {
  // 1. Verify appTitle context-appropriate escaping
  const maliciousTitle = '</title><script>alert("xss-title")</script>" onfocus="alert(1)';
  const htmlWithBadTitle = getDashboardHtml('/logvault', maliciousTitle);
  assert.ok(!htmlWithBadTitle.includes('</title><script>alert("xss-title")</script>'), 'appTitle must not allow </title> breakout');
  assert.ok(htmlWithBadTitle.includes('&lt;/title&gt;&lt;script&gt;alert(&quot;xss-title&quot;)&lt;/script&gt;'), 'appTitle must be HTML entity escaped in <title>');
  assert.ok(!htmlWithBadTitle.includes('title="' + maliciousTitle + '"'), 'appTitle attribute must be escaped');

  // 2. Verify customLogo validation & SVG script rejection
  const maliciousSvg = '<svg onload="alert(1)"><script>alert("xss")</script><circle cx="10" cy="10" r="5"/></svg>';
  const htmlWithBadSvg = getDashboardHtml('/logvault', 'Vault', maliciousSvg);
  assert.ok(!htmlWithBadSvg.includes(Buffer.from(maliciousSvg).toString('base64')), 'Malicious SVG containing scripts/onload must be rejected');
  assert.ok(htmlWithBadSvg.includes(DEFAULT_TRACERNEST_LOGO), 'Rejected malicious SVG must safely fallback to DEFAULT_TRACERNEST_LOGO');

  const jsUrlLogo = 'javascript:alert(1)';
  const htmlWithJsLogo = getDashboardHtml('/logvault', 'Vault', jsUrlLogo);
  assert.ok(!htmlWithJsLogo.includes('href="javascript:alert(1)"'), 'javascript: URI in customLogo must not be rendered');
  assert.ok(!htmlWithJsLogo.includes('src="javascript:alert(1)"'), 'javascript: URI in customLogo must not be rendered in img src');

  const quoteBreakoutLogo = '" onerror="alert(1)" class="xss';
  const htmlWithQuoteLogo = getDashboardHtml('/logvault', 'Vault', quoteBreakoutLogo);
  assert.ok(!htmlWithQuoteLogo.includes('src="" onerror="alert(1)"'), 'Quote breakout in customLogo must be sanitized or escaped');

  // 3. Verify basePath safe JSON embedding in client JavaScript
  const scriptBreakoutBasePath = '/vault</script><script>alert("breakout")</script>';
  const htmlWithBreakoutPath = getDashboardHtml(scriptBreakoutBasePath, 'Vault');
  assert.ok(!htmlWithBreakoutPath.includes('return "/vault</script>'), 'basePath must not contain unescaped </script> tag inside JS string');
  assert.ok(htmlWithBreakoutPath.includes('\\u003c/script\\u003e'), 'basePath < and > must be unicode-escaped for safe inline JS embedding');

  // 4. Verify CSP header contains hardened directives
  const testSqlite = './integ_csp_harden.sqlite';
  const testSql = './integ_csp_harden.sql';
  if (existsSync(testSqlite)) unlinkSync(testSqlite);
  if (existsSync(testSql)) unlinkSync(testSql);

  const app = new TracerNestLogger({
    path: '/logvault',
    sqliteFilePath: testSqlite,
    sqlFilePath: testSql
  });

  try {
    const mock = createMockReqRes({ url: '/logvault' });
    await app.handleRequest(mock.req, mock.res);
    const resp = mock.getResponse();
    const csp = resp.headers['content-security-policy'];
    assert.ok(csp, 'CSP header must be present');
    assert.ok(csp.includes("object-src 'none'"), 'CSP must forbid plugins via object-src none');
    assert.ok(csp.includes("base-uri 'self'"), 'CSP must restrict base-uri to self');
    assert.ok(csp.includes("frame-ancestors 'none'"), 'CSP must prevent framing via frame-ancestors none');
    assert.ok(csp.includes("connect-src 'self'"), 'CSP must enforce connect-src self');
  } finally {
    app.stop();
    if (existsSync(testSqlite)) unlinkSync(testSqlite);
    if (existsSync(testSql)) unlinkSync(testSql);
  }
});

test('Integration: Client IP & Real IP Extraction and Dialog Box Display', async () => {
  // 1. Verify extractRealIp utility function
  const reqWithXRealIp = {
    headers: { 'x-real-ip': '198.51.100.99' },
    socket: { remoteAddress: '127.0.0.1' }
  } as any;
  assert.strictEqual(extractRealIp(reqWithXRealIp), '198.51.100.99');

  const reqWithCfIp = {
    headers: { 'cf-connecting-ip': '203.0.113.88' },
    socket: { remoteAddress: '10.0.0.1' }
  } as any;
  assert.strictEqual(extractRealIp(reqWithCfIp), '203.0.113.88');

  const reqDirect = {
    headers: {},
    socket: { remoteAddress: '127.0.0.1' }
  } as any;
  assert.strictEqual(extractRealIp(reqDirect), '127.0.0.1');

  // 2. Verify HttpLogger captures both clientIp and realIp in metadata
  const testDir = `./test_ip_dialog_${Date.now()}`;
  const vault = new TracerNestLogger({
    dataDir: testDir,
    path: '/logvault'
  });

  try {
    const middleware = vault.middleware();
    const mockReqRes = createMockReqRes({
      method: 'GET',
      url: '/api/v1/test-ip',
      headers: {
        'x-real-ip': '198.51.100.44',
        'user-agent': 'Mozilla/5.0'
      }
    });

    await new Promise<void>((resolve) => {
      middleware(mockReqRes.req, mockReqRes.res, () => {
        mockReqRes.res.statusCode = 200;
        mockReqRes.res.end(JSON.stringify({ ok: true }));
        resolve();
      });
    });

    const logs = vault.ringBuffer.query({ source: 'http' }).logs;
    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].metadata?.http?.clientIp, '127.0.0.1');
    assert.strictEqual(logs[0].metadata?.http?.realIp, '198.51.100.44');

    // 3. Verify getDashboardHtml dialog box elements for Client IP along with Real IP
    const html = getDashboardHtml('/logvault');
    assert.ok(html.includes('id="lmHttpBannerIp"'), 'Modal must have Client IP in banner');
    assert.ok(html.includes('id="lmHttpBannerRealIp"'), 'Modal must have Real IP in banner');
    assert.ok(html.includes('id="lmReqClientInfo"'), 'Modal must have Client IP in request payload header');
    assert.ok(html.includes('id="lmReqRealIpInfo"'), 'Modal must have Real IP in request payload header');
    assert.ok(html.includes('id="lmMetaIpItem"'), 'Modal must have Client IP in meta bar');
    assert.ok(html.includes('id="lmMetaRealIpItem"'), 'Modal must have Real IP in meta bar');

    vault.stop();
  } finally {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
  }
});






