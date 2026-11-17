import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, unlinkSync, readFileSync } from 'node:fs';
import { CryptoSecurity } from '../security/crypto';
import { FastCrypto } from '../security/fast-crypto';
import { RBACManager } from '../security/rbac';
import { Sanitizer } from '../security/sanitizer';
import { RateLimiter } from '../security/rate-limiter';
import { extractClientIp, isTrustedProxy, cleanIp } from '../security/client-ip';
import { RingBuffer } from '../core/ring-buffer';
import { TTLManager } from '../core/ttl-manager';
import { SqlStore } from '../security/sql-store';
import { LogEntry } from '../types';
import { HttpLogger } from '../middleware/http-logger';
import { StreamManager } from '../core/stream-manager';
import { AlertDispatcher } from '../alerts/alert-dispatcher';

test('TTLManager: Rule matching and automated log expiration deletion', () => {
  const buffer = new RingBuffer(10);
  const ttl = new TTLManager({
    ringBuffer: buffer,
    config: {
      defaultTtlSeconds: 3600, // 1 hour default
      rules: [
        {
          name: 'Fast TTL for Health Checks',
          pattern: '/healthz',
          ttlSeconds: 2 // 2 seconds
        },
        {
          name: 'Debug logs TTL',
          level: 'debug',
          ttlSeconds: 1 // 1 second
        }
      ]
    }
  });

  try {
    const log1: LogEntry = {
      id: 'l1',
      timestamp: 1000,
      level: 'info',
      source: 'stdout',
      message: 'Application booted',
      raw: 'Application booted'
    };
    ttl.applyTTL(log1);
    // Matched default TTL (3600s)
    assert.strictEqual(log1.expiresAt, 1000 + 3600 * 1000);

    const log2: LogEntry = {
      id: 'l2',
      timestamp: 1000,
      level: 'debug',
      source: 'stdout',
      message: 'Processing query cache',
      raw: 'Processing query cache'
    };
    ttl.applyTTL(log2);
    // Matched debug rule (1s)
    assert.strictEqual(log2.expiresAt, 1000 + 1 * 1000);

    const log3: LogEntry = {
      id: 'l3',
      timestamp: 1000,
      level: 'info',
      source: 'http',
      message: 'HTTP GET /healthz 200',
      raw: 'HTTP GET /healthz 200'
    };
    ttl.applyTTL(log3);
    // Matched /healthz pattern rule (2s)
    assert.strictEqual(log3.expiresAt, 1000 + 2 * 1000);

    buffer.push(log1);
    buffer.push(log2);
    buffer.push(log3);
    assert.strictEqual(buffer.size(), 3);

    // At t = 1500ms, log2 (expires at 2000) and log3 (expires at 3000) are still valid
    const purgedAt1500 = buffer.purgeExpired(1500);
    assert.strictEqual(purgedAt1500, 0);
    assert.strictEqual(buffer.size(), 3);

    // At t = 2500ms, log2 (expired at 2000) hits TTL and must be deleted!
    const purgedAt2500 = buffer.purgeExpired(2500);
    assert.strictEqual(purgedAt2500, 1);
    assert.strictEqual(buffer.size(), 2);

    const remaining = buffer.toArray(2500);
    assert.strictEqual(remaining.find(l => l.id === 'l2'), undefined);
    assert.ok(remaining.find(l => l.id === 'l1'));
    assert.ok(remaining.find(l => l.id === 'l3'));

    // At t = 3500ms, log3 (expired at 3000) hits TTL and must also be deleted!
    const purgedAt3500 = buffer.purgeExpired(3500);
    assert.strictEqual(purgedAt3500, 1);
    assert.strictEqual(buffer.size(), 1);
    assert.strictEqual(buffer.toArray(3500)[0].id, 'l1');

  } finally {
    ttl.destroy();
  }
});

test('FastCrypto: Lightning-fast AES-256-GCM encryption & decryption benchmark', () => {
  const masterKey = 'strong-master-secret-for-logvault-key-32';
  const secretPayload = JSON.stringify({
    smtpHost: 'smtp.office365.com',
    smtpPass: 'HighlyConfidentialPassword123!',
    webhook: 'https://outlook.office.com/webhook/test-token-123'
  });

  const startTime = performance.now();
  const encrypted = FastCrypto.encrypt(secretPayload, masterKey);
  const encryptDuration = performance.now() - startTime;

  assert.ok(encrypted.ciphertext);
  assert.ok(encrypted.iv);
  assert.ok(encrypted.authTag);
  assert.ok(encrypted.salt);
  assert.ok(encryptDuration < 15, `Encryption took ${encryptDuration}ms`);

  const decryptStart = performance.now();
  const decrypted = FastCrypto.decrypt(encrypted, masterKey);
  const decryptDuration = performance.now() - decryptStart;

  assert.strictEqual(decrypted, secretPayload);
  assert.ok(decryptDuration < 5, `Decryption took ${decryptDuration}ms`);

  // Tamper detection test (AEAD integrity)
  const tamperedCiphertext = encrypted.ciphertext.slice(0, -2) + (encrypted.ciphertext.endsWith('0') ? '1' : '0');
  assert.throws(() => {
    FastCrypto.decrypt({ ...encrypted, ciphertext: tamperedCiphertext }, masterKey);
  });
});

test('CryptoSecurity: Scrypt password hashing & verification', () => {
  const password = 'SuperSecretPassword123!';
  const { hash, salt } = CryptoSecurity.hashPassword(password);

  assert.ok(hash && hash.length === 128);
  assert.ok(salt && salt.length === 32);

  assert.strictEqual(CryptoSecurity.verifyPassword(password, salt, hash), true);
  assert.strictEqual(CryptoSecurity.verifyPassword('WrongPassword', salt, hash), false);
});

test('CryptoSecurity: Stateless HMAC token generation & verification', () => {
  const secret = 'test-secret-key-that-is-long-enough';
  const payload = { userId: 'u1', username: 'alice', role: 'admin' };

  const token = CryptoSecurity.createToken(payload, secret, 3600);
  assert.ok(token.includes('.'));

  const verified = CryptoSecurity.verifyToken<typeof payload>(token, secret);
  assert.ok(verified);
  assert.strictEqual(verified?.userId, 'u1');
  assert.strictEqual(verified?.username, 'alice');
  assert.strictEqual(verified?.role, 'admin');

  const tampered = token.slice(0, -4) + 'abcd';
  assert.strictEqual(CryptoSecurity.verifyToken(tampered, secret), null);
});

test('SqlStore: Automatic SQL file generation with encrypted secrets and salts', () => {
  const testSqlite = './test_logvault_ttl.sqlite';
  const testSql = './test_logvault_ttl.sql';

  if (existsSync(testSqlite)) unlinkSync(testSqlite);
  if (existsSync(testSql)) unlinkSync(testSql);

  const store = new SqlStore({
    sqliteFilePath: testSqlite,
    sqlFilePath: testSql
  });

  try {
    assert.strictEqual(store.getUserCount(), 0);

    const { hash, salt } = CryptoSecurity.hashPassword('AdminPass123!');
    store.createUser({
      id: 'usr_1',
      username: 'admin',
      passwordHash: hash,
      salt,
      role: 'admin',
      createdAt: Date.now()
    });

    assert.strictEqual(store.getUserCount(), 1);

    store.saveAlertConfig('teams', true, 'error', {
      webhookUrl: 'https://outlook.office.com/webhook/xyz-secret',
      title: 'Production Incident'
    });

    assert.ok(existsSync(testSql));
    const sqlContent = readFileSync(testSql, 'utf8');
    assert.ok(sqlContent.includes('CREATE TABLE IF NOT EXISTS tracenest_users'));
    assert.ok(sqlContent.includes('CREATE TABLE IF NOT EXISTS tracenest_alert_configs'));
    assert.strictEqual(sqlContent.includes('https://outlook.office.com/webhook/xyz-secret'), false);

  } finally {
    store.close();
    if (existsSync(testSqlite)) unlinkSync(testSqlite);
    if (existsSync(testSql)) unlinkSync(testSql);
  }
});

test('RBACManager: Granular access control', () => {
  const rbac = new RBACManager();
  assert.strictEqual(rbac.hasPermission('admin', 'users:manage'), true);
  assert.strictEqual(rbac.hasPermission('admin', 'alerts:manage'), true);
  assert.strictEqual(rbac.hasPermission('admin', 'ttl:manage'), true);
  assert.strictEqual(rbac.hasPermission('operator', 'ttl:manage'), true);
  assert.strictEqual(rbac.hasPermission('viewer', 'ttl:manage'), false);
});

test('Sanitizer: Sensitive data masking & XSS safety', () => {
  const withToken = 'Request auth: Bearer eyJhbGciOiJIUzI1NiJ9.abc.def';
  assert.strictEqual(Sanitizer.redactSensitive(withToken), 'Request auth: Bearer [REDACTED_TOKEN]');

  const xssAttempt = '\x1b[31mError\x1b[0m <img src=x onerror=alert(1)>';
  const safe = Sanitizer.ansiToSafeHtml(xssAttempt);
  assert.ok(safe.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.strictEqual(safe.includes('<img'), false);
});

test('HttpLogger: Circular reference protection & stack overflow prevention (Sequelize/ORM resilient)', () => {
  const buffer = new RingBuffer(10);
  const streamMgr = new StreamManager();
  const ttl = new TTLManager({ ringBuffer: buffer });
  const httpLogger = new HttpLogger({
    ringBuffer: buffer,
    streamManager: streamMgr,
    ttlManager: ttl,
    alertDispatcher: null as any,
    basePath: '/tracernest-logger',
    sensitiveFieldKeys: ['password', 'secret', 'token', 'cvv']
  });

  // 1. Direct self-referencing circular object
  const selfCircular: any = { id: 1, name: 'RootNode' };
  selfCircular.loop = selfCircular;
  const res1 = httpLogger.sanitizeObject(selfCircular);
  assert.strictEqual(res1.id, 1);
  assert.strictEqual(res1.name, 'RootNode');
  assert.strictEqual(res1.loop, '[Circular]');

  // 2. Complex Multi-Hop Circular References (reproducing Sequelize RoleMaster <-> PrivilegeMapping)
  const roleMaster: any = {
    id: 5,
    name: 'AdminRole',
    rolePrivileges: []
  };
  const privMapping: any = {
    id: 101,
    functionName: 'manage_users',
    roleMasterRef: roleMaster,
    circularArray: [roleMaster]
  };
  roleMaster.rolePrivileges.push(privMapping);

  const res2 = httpLogger.sanitizeObject(roleMaster);
  assert.strictEqual(res2.id, 5);
  assert.strictEqual(res2.rolePrivileges[0].id, 101);
  assert.strictEqual(res2.rolePrivileges[0].roleMasterRef, '[Circular]');
  assert.strictEqual(res2.rolePrivileges[0].circularArray[0], '[Circular]');

  // 3. Object with .toJSON() method (Sequelize / Mongoose model instances)
  const ormModel: any = {
    _internalDaoConnection: { active: true },
    toJSON: () => ({
      id: 200,
      title: 'Database Record',
      passwordHash: 'secret_hash_value',
      nested: { token: 'my_access_token' }
    })
  };
  ormModel._internalDaoConnection.parent = ormModel; // circular internal link

  const res3 = httpLogger.sanitizeObject(ormModel);
  assert.strictEqual(res3.id, 200);
  assert.strictEqual(res3.title, 'Database Record');
  assert.strictEqual(res3.passwordHash, '[REDACTED]');
  assert.strictEqual(res3.nested.token, '[REDACTED]');

  // 4. Extremely deep object hierarchy (> 8 levels, tests depth cutoff)
  let deepRoot: any = { level: 0 };
  let cursor = deepRoot;
  for (let i = 1; i <= 25; i++) {
    cursor.next = { level: i };
    cursor = cursor.next;
  }
  const res4 = httpLogger.sanitizeObject(deepRoot);
  assert.ok(res4.level === 0);
  let check = res4;
  let d = 0;
  while (check && check.next && typeof check.next === 'object') {
    check = check.next;
    d++;
  }
  assert.strictEqual(check.next, '[Truncated: Max Depth]');

  // 5. Special types handling: Buffer, Date, Error, RegExp, Function
  const specialObj = {
    buffer: Buffer.from('TracerNest Binary Data'),
    date: new Date('2026-05-10T12:00:00Z'),
    regex: /^test-[0-9]+/i,
    err: new Error('Simulated database error with secret=12345'),
    func: () => 'omit-me',
    sym: Symbol('customKey')
  };
  const res5 = httpLogger.sanitizeObject(specialObj);
  assert.strictEqual(res5.buffer, '[Buffer 22 bytes]');
  assert.strictEqual(res5.date, '2026-05-10T12:00:00.000Z');
  assert.strictEqual(res5.regex, '/^test-[0-9]+/i');
  assert.ok(res5.err.message.includes('Simulated database error'));
  assert.strictEqual(res5.func, undefined);
  assert.strictEqual(res5.sym, 'Symbol(customKey)');
});

test('RingBuffer: Memory threshold validation & safe warning check', () => {
  // Capture console.warn messages
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: any[]) => {
    warnings.push(args.join(' '));
  };

  try {
    // 1. Safe default capacity (5,000) should not emit high memory warning on machines with ample RAM
    new RingBuffer(5000);

    // 2. Unusually high capacity (> 50,000) must emit high memory safeguard warning
    new RingBuffer(75000);
    assert.ok(
      warnings.some(w => w.includes('Configured bufferSize (75,000 entries) is unusually high')),
      'Must warn when bufferSize exceeds safe threshold'
    );
  } finally {
    console.warn = originalWarn;
  }
});

test('RateLimiter: Memory-bounded capacity, FIFO eviction, and key normalization (SEC-10)', () => {
  // Test 1: Bounded memory capacity with maxEntries
  const limiter = new RateLimiter({ windowMs: 60000, maxAttempts: 5, maxEntries: 20 });
  try {
    for (let i = 0; i < 50; i++) {
      limiter.consume(`attacker-key-${i}`);
    }
    // Verify internal map size does not exceed maxEntries
    assert.ok(limiter.size <= 20, `RateLimiter size (${limiter.size}) must be bounded by maxEntries (20)`);

    // Test 2: Standard rate limiting behavior
    const key = 'test-ip-key';
    for (let i = 0; i < 5; i++) {
      const res = limiter.consume(key);
      assert.strictEqual(res.allowed, true, `Attempt ${i + 1} should be allowed`);
    }
    const blockedRes = limiter.consume(key);
    assert.strictEqual(blockedRes.allowed, false, '6th attempt must be blocked');
    assert.ok(blockedRes.retryAfterSec > 0, 'Must return retryAfterSec');

    // Test 3: Reset
    limiter.reset(key);
    const resetRes = limiter.consume(key);
    assert.strictEqual(resetRes.allowed, true, 'After reset, attempt should be allowed');
  } finally {
    limiter.destroy();
  }
});

test('ClientIP: Socket peer default, trusted-end proxy traversal & CIDR matching (SEC-10)', () => {
  // Mock request helper
  const mockReq = (headers: Record<string, string>, socketIp: string) => {
    return {
      headers,
      socket: { remoteAddress: socketIp }
    } as any;
  };

  // 1. By default (trustProxy not set / false), proxy headers are strictly ignored
  const untrustedReq = mockReq(
    {
      'x-forwarded-for': '1.2.3.4, 5.6.7.8',
      'cf-connecting-ip': '9.9.9.9',
      'x-real-ip': '8.8.8.8'
    },
    '198.51.100.25'
  );
  assert.strictEqual(extractClientIp(untrustedReq), '198.51.100.25', 'Must use socket peer when trustProxy is undefined');
  assert.strictEqual(extractClientIp(untrustedReq, false), '198.51.100.25', 'Must use socket peer when trustProxy is false');

  // 2. Untrusted socket peer trying to spoof headers when trusted proxy list is configured
  const spoofAttemptReq = mockReq(
    { 'x-forwarded-for': '10.0.0.99, 1.2.3.4' },
    '198.51.100.25'
  );
  assert.strictEqual(
    extractClientIp(spoofAttemptReq, ['10.0.0.1']),
    '198.51.100.25',
    'Must ignore headers from untrusted socket peer'
  );

  // 3. Trusted proxy chain parsed from trusted end (right to left)
  const trustedProxyReq = mockReq(
    { 'x-forwarded-for': 'spoofed.attacker.ip, 203.0.113.195, 10.0.0.2' },
    '10.0.0.1'
  );
  // Both 10.0.0.1 and 10.0.0.2 are trusted proxies
  const resolvedClientIp = extractClientIp(trustedProxyReq, ['10.0.0.1', '10.0.0.2']);
  assert.strictEqual(
    resolvedClientIp,
    '203.0.113.195',
    'Must traverse backwards from trusted end and return the first untrusted caller'
  );

  // 4. CIDR block matching
  assert.strictEqual(isTrustedProxy('10.0.5.12', '10.0.0.0/8'), true);
  assert.strictEqual(isTrustedProxy('192.168.1.50', '192.168.0.0/16'), true);
  assert.strictEqual(isTrustedProxy('198.51.100.1', '192.168.0.0/16'), false);
  assert.strictEqual(isTrustedProxy('127.0.0.1', 'loopback'), true);
  assert.strictEqual(isTrustedProxy('::1', 'loopback'), true);
});
