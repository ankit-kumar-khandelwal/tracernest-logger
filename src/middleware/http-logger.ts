import { IncomingMessage, ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { LogEntry, LogLevel, HttpLogMetadata, RouteFilterRule, ExcludedRouteRule, TrustProxyOption } from '../types';
import { Sanitizer } from '../security/sanitizer';
import { FastCrypto } from '../security/fast-crypto';
import { RingBuffer } from '../core/ring-buffer';
import { StreamManager } from '../core/stream-manager';
import { TTLManager } from '../core/ttl-manager';
import { AlertDispatcher } from '../alerts/alert-dispatcher';
import { extractClientIp } from '../security/client-ip';

export class HttpLogger {
  private ringBuffer: RingBuffer;
  private streamManager: StreamManager;
  private ttlManager: TTLManager;
  private alertDispatcher: AlertDispatcher;
  private maxBodyBytes: number;
  private basePath: string;
  private sensitiveHeaders: Set<string>;
  private sensitiveFieldKeys: string[];
  private excludeRoutes: RouteFilterRule[];
  private dynamicExcludedRules: ExcludedRouteRule[] = [];
  private customPatterns?: RegExp[];
  private trustProxy?: TrustProxyOption;
  private encryptionKey?: string;
  private encryptPayloads: boolean;

  constructor(options: {
    ringBuffer: RingBuffer;
    streamManager: StreamManager;
    ttlManager: TTLManager;
    alertDispatcher: AlertDispatcher;
    basePath: string;
    trustProxy?: TrustProxyOption;
    maxBodyBytes?: number;
    sensitiveHeaders?: string[];
    sensitiveFieldKeys?: string[];
    excludeRoutes?: RouteFilterRule[];
    customPatterns?: RegExp[];
    encryptionKey?: string;
    encryptPayloads?: boolean;
  }) {
    this.ringBuffer = options.ringBuffer;
    this.streamManager = options.streamManager;
    this.ttlManager = options.ttlManager;
    this.alertDispatcher = options.alertDispatcher;
    this.basePath = options.basePath;
    this.trustProxy = options.trustProxy;
    this.maxBodyBytes = options.maxBodyBytes ?? 512 * 1024; // 512 KB
    this.excludeRoutes = options.excludeRoutes || [];
    this.customPatterns = options.customPatterns;
    this.encryptionKey = options.encryptionKey;
    this.encryptPayloads = options.encryptPayloads ?? Boolean(options.encryptionKey);

    const defaultSensitiveHeaders = [
      'authorization',
      'cookie',
      'x-api-key',
      'set-cookie',
      'proxy-authorization',
      'x-auth-token',
      'x-access-token',
      'x-csrf-token',
      'x-xsrf-token',
      'apikey',
      'secret',
      'token'
    ];
    this.sensitiveHeaders = new Set([
      ...defaultSensitiveHeaders,
      ...(options.sensitiveHeaders || []).map(h => h.toLowerCase().trim())
    ]);

    const defaultSensitiveKeys = [
      'password',
      'passwd',
      'secret',
      'token',
      'apikey',
      'api_key',
      'auth',
      'creditcard',
      'cardnumber',
      'card_number',
      'cvv',
      'cvc',
      'ssn',
      'privatekey',
      'private_key',
      'passcode',
      'pin',
      'access_token',
      'refresh_token',
      'credential',
      'signature'
    ];
    this.sensitiveFieldKeys = [
      ...defaultSensitiveKeys,
      ...(options.sensitiveFieldKeys || []).map(k => k.toLowerCase().trim())
    ];
  }

  public setDynamicExcludedRoutes(rules: ExcludedRouteRule[]): void {
    this.dynamicExcludedRules = Array.isArray(rules) ? rules : [];
  }

  public getDynamicExcludedRoutes(): ExcludedRouteRule[] {
    return this.dynamicExcludedRules;
  }

  /**
   * Encrypts an HTTP request or response payload with AES-256-GCM using the initialization key
   */
  public encryptPayload(data: any): any {
    if (!this.encryptionKey) return data;
    try {
      const plaintext = typeof data === 'string' ? data : JSON.stringify(data);
      const enc = FastCrypto.encrypt(plaintext, this.encryptionKey);
      return {
        __encrypted: true,
        encrypted: true,
        algorithm: 'aes-256-gcm',
        ciphertext: enc.ciphertext,
        iv: enc.iv,
        authTag: enc.authTag,
        salt: enc.salt
      };
    } catch (err: any) {
      console.error('[TracerNest-Logger] Payload encryption error:', err?.message || err);
      return data;
    }
  }

  /**
   * Decrypts an encrypted payload with AES-256-GCM using the initialization key
   */
  public decryptPayload(payload: any, keyOverride?: string): any {
    const key = keyOverride || this.encryptionKey;
    if (!key) return payload;
    return FastCrypto.decryptPayload(payload, key);
  }

  public middleware(): (req: IncomingMessage, res: ServerResponse, next: (err?: any) => void) => void {
    return (req, res, next) => {
      const expressBaseUrl = (req as any).baseUrl || '';
      const originalUrl = (req as any).originalUrl || req.url || '/';
      const rawUrl = req.url || '/';
      const url = originalUrl;

      // Skip internal TraceNest dashboard and API requests (matching base path, /api prefix, and alternate spellings)
      const candidatePaths = [
        this.basePath,
        this.basePath.startsWith('/api') ? this.basePath.replace(/^\/api(\/|$)/, '/') : `/api${this.basePath}`,
        this.basePath.replace(/tracernest/g, 'tracenest'),
        this.basePath.replace(/tracenest/g, 'tracernest')
      ].filter(Boolean);

      const isInternalTraceNest = candidatePaths.some(bp =>
        expressBaseUrl === bp ||
        expressBaseUrl.endsWith(bp) ||
        rawUrl === bp ||
        rawUrl.startsWith(bp + '/') ||
        rawUrl.startsWith(bp + '?') ||
        originalUrl === bp ||
        originalUrl.startsWith(bp + '/') ||
        originalUrl.startsWith(bp + '?')
      );

      if (isInternalTraceNest || this.isRouteExcluded(req, url)) {
        return next();
      }

      const startTime = Date.now();
      const method = (req.method || 'GET').toUpperCase();
      const clientIp = this.getClientIp(req);
      const safeHeaders = this.sanitizeHeaders(req.headers);

      // 1. Capture Request Body
      let reqBodyBuffer = '';
      let reqBodyExceeded = false;
      const existingBody = (req as any).body;

      if (!existingBody && req.readable) {
        const originalOn = req.on.bind(req);
        const wrappedListener = function (this: any, event: string, listener: (...args: any[]) => void): any {
          if (event === 'data') {
            const dataWrapper = (chunk: any) => {
              if (!reqBodyExceeded && chunk) {
                const chunkStr = typeof chunk === 'string' ? chunk : Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
                if (reqBodyBuffer.length + chunkStr.length <= 512 * 1024) {
                  reqBodyBuffer += chunkStr;
                } else {
                  reqBodyExceeded = true;
                }
              }
              listener(chunk);
            };
            return originalOn('data', dataWrapper);
          }
          return originalOn(event, listener);
        };
        req.on = wrappedListener;
        req.addListener = wrappedListener;
      }

      // 2. Intercept Response Body & Status Code (handling Express res.json, res.send, and native res.write/res.end)
      let expressJsonData: any = undefined;
      const originalJson = (res as any).json?.bind(res);
      if (originalJson) {
        (res as any).json = function (obj: any) {
          expressJsonData = obj;
          return originalJson(obj);
        };
      }

      let expressSendData: any = undefined;
      const originalSend = (res as any).send?.bind(res);
      if (originalSend) {
        (res as any).send = function (body: any) {
          expressSendData = body;
          return originalSend(body);
        };
      }

      const originalWrite = res.write ? res.write.bind(res) : undefined;
      const originalEnd = res.end ? res.end.bind(res) : undefined;
      let resBodyBuffer = '';
      let resBodyExceeded = false;

      if (originalWrite) {
        res.write = function (chunk: any, encoding?: any, callback?: any): boolean {
          if (!resBodyExceeded && chunk) {
            const chunkStr = typeof chunk === 'string' ? chunk : Buffer.isBuffer(chunk) ? chunk.toString('utf8') : '';
            if (resBodyBuffer.length + chunkStr.length <= 512 * 1024) {
              resBodyBuffer += chunkStr;
            } else {
              resBodyExceeded = true;
            }
          }
          return originalWrite(chunk, encoding, callback);
        };
      }

      if (originalEnd) {
        res.end = function (chunk?: any, encoding?: any, callback?: any): any {
          if (!resBodyExceeded && chunk && typeof chunk !== 'function') {
            const chunkStr = typeof chunk === 'string' ? chunk : Buffer.isBuffer(chunk) ? chunk.toString('utf8') : '';
            if (resBodyBuffer.length + chunkStr.length <= 512 * 1024) {
              resBodyBuffer += chunkStr;
            } else {
              resBodyExceeded = true;
            }
          }
          return originalEnd(chunk, encoding, callback);
        };
      }

      // 3. On response finished: assemble structured log
      res.on('finish', () => {
        const durationMs = Date.now() - startTime;
        const statusCode = res.statusCode || 200;

        // Process request body: check (req as any).body first, then existingBody, then stream buffer
        let parsedReqBody: any = undefined;
        const currentReqBody = (req as any).body !== undefined ? (req as any).body : existingBody;
        if (currentReqBody !== undefined && currentReqBody !== null) {
          const isGetOrHead = method === 'GET' || method === 'HEAD';
          const isEmptyObj = typeof currentReqBody === 'object' && Object.keys(currentReqBody).length === 0;
          if (!(isGetOrHead && isEmptyObj && reqBodyBuffer.trim().length === 0)) {
            parsedReqBody = this.sanitizeObject(currentReqBody);
          }
        } else if (reqBodyBuffer.trim().length > 0) {
          try {
            parsedReqBody = this.sanitizeObject(JSON.parse(reqBodyBuffer));
          } catch {
            parsedReqBody = Sanitizer.redactSensitive(reqBodyBuffer.trim(), this.customPatterns);
          }
        }

        // Process response body: check captured res.json(), then res.send(), then stream buffer
        let parsedResBody: any = undefined;
        if (expressJsonData !== undefined) {
          parsedResBody = this.sanitizeObject(expressJsonData);
        } else if (expressSendData !== undefined) {
          if (typeof expressSendData === 'object') {
            parsedResBody = this.sanitizeObject(expressSendData);
          } else if (typeof expressSendData === 'string' && expressSendData.trim().length > 0) {
            try {
              parsedResBody = this.sanitizeObject(JSON.parse(expressSendData));
            } catch {
              parsedResBody = Sanitizer.redactSensitive(expressSendData.trim(), this.customPatterns);
            }
          }
        } else if (resBodyBuffer.trim().length > 0) {
          try {
            parsedResBody = this.sanitizeObject(JSON.parse(resBodyBuffer));
          } catch {
            parsedResBody = Sanitizer.redactSensitive(resBodyBuffer.trim(), this.customPatterns);
          }
        }

        // Determine log level
        let level: LogLevel = 'info';
        if (statusCode >= 500) {
          level = 'error';
        } else if (statusCode >= 400) {
          level = 'warn';
        }

        const safeUrl = this.sanitizeUrl(url);

        let finalReqBody = parsedReqBody;
        if (this.encryptPayloads && this.encryptionKey && parsedReqBody !== undefined && parsedReqBody !== null) {
          finalReqBody = this.encryptPayload(parsedReqBody);
        }

        let finalResBody = parsedResBody;
        if (this.encryptPayloads && this.encryptionKey && parsedResBody !== undefined && parsedResBody !== null) {
          finalResBody = this.encryptPayload(parsedResBody);
        }

        const isEncrypted = Boolean(
          this.encryptPayloads &&
          this.encryptionKey &&
          ((finalReqBody && finalReqBody.encrypted) || (finalResBody && finalResBody.encrypted))
        );

        const httpMeta: HttpLogMetadata = {
          method,
          url: safeUrl,
          path: safeUrl.split('?')[0],
          statusCode,
          durationMs,
          clientIp,
          headers: safeHeaders,
          requestBody: finalReqBody,
          responseBody: finalResBody,
          encrypted: isEncrypted
        };

        const message = `HTTP [${method}] ${safeUrl} - ${statusCode} (${durationMs}ms)`;

        const entry: LogEntry = {
          id: `http_${Date.now()}_${randomBytes(4).toString('hex')}`,
          timestamp: Date.now(),
          level,
          source: 'http',
          message,
          raw: message,
          metadata: {
            http: httpMeta
          }
        };

        // Apply TTL (e.g. auto-delete 2xx after 24h, delete healthz after 5min)
        this.ttlManager.applyTTL(entry);

        // Push to ring buffer & live stream
        this.ringBuffer.push(entry);
        this.streamManager.broadcast(entry);

        // Trigger real-time alert if threshold met (e.g. 500 error)
        this.alertDispatcher.dispatch(entry);
      });

      next();
    };
  }

  private isRouteExcluded(req: IncomingMessage, url: string): boolean {
    if (!this.excludeRoutes || this.excludeRoutes.length === 0) return false;
    const expressBaseUrl = ((req as any).baseUrl || '').trim();
    const originalUrl = ((req as any).originalUrl || req.url || '/').trim();
    const reqPath = ((req as any).path || '').trim();
    const cleanUrl = url.split('?')[0].trim();
    const cleanOrig = originalUrl.split('?')[0].trim();
    const combinedExpress = expressBaseUrl ? (expressBaseUrl + (reqPath.startsWith('/') ? reqPath : '/' + reqPath)) : '';

    const candidatePaths = Array.from(new Set([cleanUrl, cleanOrig, reqPath, combinedExpress])).filter(Boolean);
    const method = (req.method || 'GET').toUpperCase();

    for (const rule of this.excludeRoutes) {
      if (!rule) continue;

      // 1. Custom predicate function
      if (typeof rule === 'function') {
        try {
          if (rule(req)) return true;
        } catch {
          // Ignore predicate execution errors safely
        }
        continue;
      }

      // 2. Regular Expression
      if (rule instanceof RegExp) {
        if (candidatePaths.some(p => rule.test(p)) || rule.test(url) || rule.test(originalUrl)) {
          return true;
        }
        continue;
      }

      // 3. Object rule with optional method e.g. { path: '/api/auth/login', method: 'POST' }
      if (typeof rule === 'object' && rule !== null && 'path' in rule) {
        if (rule.method && rule.method.toUpperCase() !== method) {
          continue;
        }
        const pathRule = rule.path;
        if (pathRule instanceof RegExp) {
          if (candidatePaths.some(p => pathRule.test(p))) return true;
        } else if (typeof pathRule === 'string') {
          if (this.matchPathString(pathRule, candidatePaths)) return true;
        }
        continue;
      }

      // 4. String rule (exact, prefix directory, or glob wildcard)
      if (typeof rule === 'string') {
        if (this.matchPathString(rule, candidatePaths)) return true;
      }
    }

    // 5. Dynamic exclusion rules configured via UI dashboard
    for (const dRule of this.dynamicExcludedRules) {
      if (!dRule || !dRule.enabled) continue;
      if (dRule.method && dRule.method !== 'ALL' && dRule.method.toUpperCase() !== method) {
        continue;
      }
      if (this.matchPathString(dRule.path, candidatePaths)) {
        return true;
      }
    }
    return false;
  }

  private matchPathString(ruleStr: string, candidatePaths: string[]): boolean {
    const trimmed = ruleStr.trim();
    if (!trimmed) return false;

    // Glob wildcards e.g. '/api/auth/*' or '/payments/**'
    if (trimmed.includes('*')) {
      const regexStr = '^' + trimmed
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*/g, '.*')
        .replace(/\*/g, '[^/?#]*') + '$';
      const wildcardRegex = new RegExp(regexStr, 'i');
      return candidatePaths.some(p => wildcardRegex.test(p));
    }

    // Exact or prefix directory matching
    for (const p of candidatePaths) {
      if (p === trimmed) return true;
      const prefix = trimmed.endsWith('/') ? trimmed : trimmed + '/';
      if (p.startsWith(prefix)) return true;
    }
    return false;
  }

  private sanitizeHeaders(headers: Record<string, any>): Record<string, string> {
    const safe: Record<string, string> = {};

    for (const [key, val] of Object.entries(headers)) {
      if (!val) continue;
      const lower = key.toLowerCase();
      if (this.sensitiveHeaders.has(lower)) {
        safe[key] = '[REDACTED]';
      } else {
        safe[key] = String(val);
      }
    }
    return safe;
  }

  /**
   * Sanitizes request URLs by masking sensitive query parameters (SEC-07),
   * preventing tokens, API keys, and credentials from persisting in URLs or log messages.
   */
  public sanitizeUrl(rawUrl: string): string {
    if (!rawUrl || typeof rawUrl !== 'string') return '/';
    try {
      const qIndex = rawUrl.indexOf('?');
      if (qIndex === -1) {
        return Sanitizer.redactSensitive(rawUrl, this.customPatterns);
      }

      const pathname = rawUrl.slice(0, qIndex);
      const search = rawUrl.slice(qIndex + 1);
      if (!search) return pathname;

      let hash = '';
      let queryPart = search;
      const hashIndex = search.indexOf('#');
      if (hashIndex !== -1) {
        queryPart = search.slice(0, hashIndex);
        hash = search.slice(hashIndex);
      }

      const params = queryPart.split('&');
      const sanitizedParams = params.map(param => {
        if (!param) return '';
        const eqIndex = param.indexOf('=');
        const key = eqIndex === -1 ? param : param.slice(0, eqIndex);
        const val = eqIndex === -1 ? '' : param.slice(eqIndex + 1);

        let lowerKey = key.toLowerCase();
        try {
          lowerKey = decodeURIComponent(key).toLowerCase();
        } catch {}

        const isSensitiveKey =
          this.sensitiveFieldKeys.some(k => lowerKey.includes(k)) ||
          lowerKey.includes('token') ||
          lowerKey.includes('secret') ||
          lowerKey.includes('key') ||
          lowerKey.includes('password') ||
          lowerKey.includes('passwd') ||
          lowerKey.includes('auth') ||
          lowerKey.includes('code') ||
          lowerKey.includes('sig') ||
          lowerKey.includes('signature') ||
          lowerKey.includes('credential') ||
          lowerKey.includes('access') ||
          lowerKey.includes('refresh') ||
          lowerKey.includes('jwt') ||
          lowerKey.includes('apikey') ||
          lowerKey.includes('api_key') ||
          lowerKey.includes('pin') ||
          lowerKey.includes('cvv');

        if (isSensitiveKey) {
          return key + '=[REDACTED]';
        }

        // Also redact any sensitive tokens or patterns appearing inside param values
        try {
          const decodedVal = decodeURIComponent(val);
          const sanitizedVal = Sanitizer.redactSensitive(decodedVal, this.customPatterns);
          return eqIndex === -1 ? key : key + '=' + (sanitizedVal !== decodedVal ? '[REDACTED]' : val);
        } catch {
          const sanitizedVal = Sanitizer.redactSensitive(val, this.customPatterns);
          return eqIndex === -1 ? key : key + '=' + sanitizedVal;
        }
      });

      const safeSearch = sanitizedParams.filter(Boolean).join('&');
      const fullSafe = pathname + (safeSearch ? '?' + safeSearch : '') + hash;
      return Sanitizer.redactSensitive(fullSafe, this.customPatterns);
    } catch {
      return Sanitizer.redactSensitive(rawUrl, this.customPatterns);
    }
  }

  private static readonly MAX_SANITIZE_DEPTH = 8;
  private static readonly MAX_OBJECT_KEYS = 250;
  private static readonly MAX_ARRAY_ITEMS = 250;

  /**
   * Recursively sanitizes JSON request and response payloads, masking passwords, API tokens,
   * and sensitive custom fields while preventing stack overflows from circular references,
   * ORM models (Sequelize, Mongoose), deeply nested graphs, or special objects.
   */
  public sanitizeObject(obj: any): any {
    if (obj === null || obj === undefined) return obj;
    try {
      return this.sanitizeObjectInternal(obj, new WeakSet(), 0);
    } catch {
      // Absolute fail-safe fallback: never crash or throw uncaughtException during logging
      try {
        if (typeof obj === 'string') {
          return Sanitizer.redactSensitive(obj, this.customPatterns);
        }
        return '[Unserializable Data]';
      } catch {
        return '[Unserializable Data]';
      }
    }
  }

  private sanitizeObjectInternal(obj: any, seen: WeakSet<object>, depth: number): any {
    if (obj === null || obj === undefined) return obj;

    // 1. Primitive types
    const type = typeof obj;
    if (type === 'string') {
      const truncated = obj.length > 256 * 1024 ? obj.slice(0, 256 * 1024) + '... [TRUNCATED]' : obj;
      return Sanitizer.redactSensitive(truncated, this.customPatterns);
    }
    if (type === 'number' || type === 'boolean') {
      return obj;
    }
    if (type === 'bigint') {
      return obj.toString();
    }
    if (type === 'symbol') {
      return obj.toString();
    }
    if (type === 'function') {
      return undefined;
    }

    // 2. Maximum recursion depth protection (stops RangeError call stack overflow)
    if (depth >= HttpLogger.MAX_SANITIZE_DEPTH) {
      return '[Truncated: Max Depth]';
    }

    // 3. Circular reference detection
    if (type === 'object') {
      if (seen.has(obj)) {
        return '[Circular]';
      }
      seen.add(obj);
    }

    // 4. Special Object Types
    if (Buffer.isBuffer(obj)) {
      return `[Buffer ${obj.length} bytes]`;
    }
    if (obj instanceof Date) {
      return obj.toISOString();
    }
    if (obj instanceof RegExp) {
      return obj.toString();
    }
    if (obj instanceof Error) {
      return {
        name: obj.name,
        message: Sanitizer.redactSensitive(obj.message || '', this.customPatterns),
        stack: Sanitizer.redactSensitive(obj.stack || '', this.customPatterns)
      };
    }

    // Stream, Socket, EventEmitter, Promise detection
    if (typeof obj.pipe === 'function' || typeof obj.then === 'function' || (obj.constructor && (obj.constructor.name === 'Socket' || obj.constructor.name === 'TLSSocket'))) {
      return `[${obj.constructor?.name || 'Complex Object'}]`;
    }

    // 5. ORM instances (Sequelize, Mongoose, etc.) with .toJSON()
    // Calling .toJSON() extracts clean data attributes without circular internal DAO links
    if (typeof obj.toJSON === 'function') {
      try {
        const jsonVal = obj.toJSON();
        if (jsonVal !== obj && jsonVal !== null && jsonVal !== undefined) {
          return this.sanitizeObjectInternal(jsonVal, seen, depth);
        }
      } catch {
        // If .toJSON() throws or fails, proceed with standard object inspection
      }
    }

    // 6. Arrays
    if (Array.isArray(obj)) {
      const len = obj.length;
      const maxItems = HttpLogger.MAX_ARRAY_ITEMS;
      const sliceLen = Math.min(len, maxItems);
      const result: any[] = [];
      for (let i = 0; i < sliceLen; i++) {
        try {
          result.push(this.sanitizeObjectInternal(obj[i], seen, depth + 1));
        } catch {
          result.push('[Unreadable Item]');
        }
      }
      if (len > maxItems) {
        result.push(`... [${len - maxItems} more items truncated]`);
      }
      return result;
    }

    // 7. Plain or Class Instances
    const result: Record<string, any> = {};
    let keys: string[] = [];
    try {
      keys = Object.keys(obj);
    } catch {
      return '[Unenumerable Object]';
    }

    const maxKeys = HttpLogger.MAX_OBJECT_KEYS;
    const keyLen = keys.length;
    const processLen = Math.min(keyLen, maxKeys);

    for (let i = 0; i < processLen; i++) {
      const k = keys[i];
      const lower = k.toLowerCase();
      const isSensitive = this.sensitiveFieldKeys.some(key => lower.includes(key));
      if (isSensitive) {
        result[k] = '[REDACTED]';
      } else {
        try {
          const v = obj[k];
          result[k] = this.sanitizeObjectInternal(v, seen, depth + 1);
        } catch {
          result[k] = '[Unreadable Property]';
        }
      }
    }

    if (keyLen > maxKeys) {
      result['_tracernest_truncated'] = `[${keyLen - maxKeys} more properties truncated]`;
    }

    return result;
  }

  private getClientIp(req: IncomingMessage): string {
    return extractClientIp(req, this.trustProxy);
  }
}

