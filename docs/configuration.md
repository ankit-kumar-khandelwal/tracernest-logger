# Configuration Reference

TracerNest is configured by passing a `TracerNestLoggerConfig` object when instantiating `TracerNestLogger`.

```typescript
import { TracerNestLogger, TracerNestLoggerConfig } from 'tracernest-logger';

const config: TracerNestLoggerConfig = {
  path: '/tracernest',
  title: 'Production Telemetry Console',
  bufferSize: 5000,
  // ... options
};

const tracer = new TracerNestLogger(config);
```

---

## Complete Options Reference

| Property | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| **`path`** | `string` | `'/tracernest'` | The base URL route where the dashboard and telemetry APIs will be mounted. |
| **`title`** | `string` | `'TracerNest Logger'` | Custom title displayed in the browser tab and dashboard topbar. |
| **`logo`** | `string` | Built-in SVG | Custom SVG or image URL to brand the dashboard interface. |
| **`dataDir`** | `string` | `'./.tracernest'` | Directory path where SQLite files, encrypted SQL mirrors, and encryption keys are stored. |
| **`sqlFilePath`** | `string` | `'./.tracernest/tracernest-logger.sql'` | Target file path for the auto-synchronized encrypted SQL mirror. |
| **`sqliteFilePath`** | `string` | `'./.tracernest/tracernest-logger.sqlite'` | Path to the active SQLite database file. |
| **`masterKey`** / **`secret`** | `string` | Auto-generated | 32+ character passphrase used for AES-256-GCM database encryption and HMAC tokens. |
| **`bufferSize`** | `number` | `5000` | In-memory circular ring buffer capacity. Maximum recommended: `100000`. |
| **`dialect`** | `'sqlite' \| 'mysql'` | `'sqlite'` | Storage engine dialect. Defaults to embedded zero-config SQLite. |
| **`mysql`** | `MySQLConnectionConfig` | `undefined` | Configuration options when using MySQL storage. |
| **`tablePrefix`** | `string` | `'tracernest_'` | Prefix applied to all database tables (`_users`, `_logs`, `_ttl`, `_alerts`, etc.). |
| **`interceptStdout`** | `boolean` | `true` | When `true`, intercepts `process.stdout.write` for application logging. |
| **`interceptStderr`** | `boolean` | `true` | When `true`, intercepts `process.stderr.write` for error logging. |
| **`interceptHttp`** | `boolean` | `true` | When `true`, intercepts incoming HTTP requests and responses. |
| **`maxHttpBodyBytes`** | `number` | `524288` (512 KB) | Maximum request/response body size captured in memory. Oversized payloads are truncated. |
| **`trustProxy`** | `TrustProxyOption` | `false` | Reverse proxy trust configuration for client IP extraction (`boolean`, `string[]`, or custom predicate). |
| **`sensitiveHeaders`** | `string[]` | `[...]` | Additional request header names to redact from logs. |
| **`sensitiveFieldKeys`** | `string[]` | `[...]` | Additional JSON object keys to redact in request and response bodies. |
| **`customRedactionPatterns`** | `RegExp[]` | `[]` | Additional regular expressions to mask in URLs, logs, and payloads. |
| **`excludeRoutes`** | `RouteFilterRule[]` | `[]` | Route patterns, globs, RegExps, or predicates excluded from HTTP logging. |
| **`ttl`** | `TTLRuleConfig[]` | `[]` | Automated log expiration rules based on level, endpoint pattern, or status code. |
| **`healthCheck`** | `'minimal' \| 'detailed'` | `'minimal'` | Public detail level for `/api/health`. Unauthenticated probes default to minimal. |
| **`gracefulShutdown`** | `boolean \| object` | `true` | Automatically hooks `SIGINT`/`SIGTERM` to close HTTP connections and flush SQL stores. |
| **`rateLimit`** | `RateLimitConfig` | Defaults | Memory-bounded rate limiter configuration for login routes. |
| **`customRolePermissions`** | `Record<string, Permission[]>` | `undefined` | Custom overrides for role permissions (`Admin`, `Developer`, `Viewer`). |

---

## Detailed Configuration Examples

### 1. Reverse Proxy Trust Configuration (`trustProxy`)

When running behind reverse proxies (Nginx, AWS ALB, Cloudflare, Traefik), configure `trustProxy` to resolve the true client IP while defending against header spoofing (SEC-10):

```typescript
// Option A: Trust specific internal proxy IP addresses
const tracer = new TracerNestLogger({
  trustProxy: ['127.0.0.1', '10.0.0.1', '10.0.0.2']
});

// Option B: Trust internal CIDR blocks (e.g., Kubernetes pod subnet)
const tracer = new TracerNestLogger({
  trustProxy: ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16']
});

// Option C: Custom validation predicate
const tracer = new TracerNestLogger({
  trustProxy: (remoteIp: string) => remoteIp.startsWith('10.244.')
});
```

---

### 2. Custom Redaction & Sensitive Header Masking

TracerNest redacts standard secrets automatically (`Authorization`, `Cookie`, `X-Api-Key`, `password`, `token`, `ssn`, `creditcard`). Add domain-specific fields:

```typescript
const tracer = new TracerNestLogger({
  sensitiveHeaders: ['x-internal-secret', 'x-tenant-token'],
  sensitiveFieldKeys: ['accountNumber', 'billingZip', 'nationalId'],
  customRedactionPatterns: [
    /SECRET-[A-Z0-9]{16}/gi,
    /\b4[0-9]{12}(?:[0-9]{3})?\b/g // Custom card regex
  ]
});
```

---

### 3. Automated Retention Rules (`ttl`)

Configure automated cleanup rules to prevent database bloat:

```typescript
const tracer = new TracerNestLogger({
  ttl: [
    // Purge successful health checks after 60 seconds
    {
      name: 'Purge Health Checks',
      pattern: '/healthz',
      ttlSeconds: 60
    },
    // Retain 2xx success logs for 24 hours
    {
      name: 'Success Logs',
      statusCode: 200,
      ttlSeconds: 86400
    },
    // Retain errors for 30 days
    {
      name: 'Production Errors',
      level: 'error',
      ttlSeconds: 2592000
    }
  ]
});
```

---

### 4. MySQL Storage Configuration

By default, TracerNest uses zero-config SQLite. To centralize logs into an external MySQL database:

```typescript
const tracer = new TracerNestLogger({
  dialect: 'mysql',
  tablePrefix: 'prod_telemetry_',
  mysql: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: 3306,
    user: process.env.DB_USER || 'tracernest_user',
    password: process.env.DB_PASSWORD || 'SecretPassword!',
    database: 'production_logs'
  }
});
```

