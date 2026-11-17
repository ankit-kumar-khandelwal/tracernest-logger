<div align="center">

# TracerNest Logger

**Zero-Dependency Node.js Application Telemetry Logger & Live Operations Dashboard**

*Built for high-performance Node.js engineering teams with encrypted SQL storage, RBAC, automated HTTP request/response JSON interception, real client IP extraction, server health diagnostics, and graceful shutdown.*

---

[![npm version](https://img.shields.io/npm/v/tracernest-logger)](https://www.npmjs.com/package/tracernest-logger)
[![npm downloads](https://img.shields.io/npm/dm/tracernest-logger)](https://www.npmjs.com/package/tracernest-logger)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-10B981.svg?style=flat-square)](LICENSE)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-10B981.svg?style=flat-square)](package.json)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-38BDF8.svg?style=flat-square)](package.json)
[![TypeScript Ready](https://img.shields.io/badge/TypeScript-Ready-3178C6.svg?style=flat-square)](src/index.ts)

</div>

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Key Features](#key-features)
- [Quick Start](#quick-start)
  - [1. Installation](#1-installation)
  - [2. Express Setup](#2-express-setup)
  - [3. Fastify and Native HTTP Server Setup](#3-fastify-and-native-http-server-setup)
- [Memory Management and Buffer Sizing](#memory-management-and-buffer-sizing)
  - [Buffer Sizing Guidelines](#buffer-sizing-guidelines)
  - [High Memory Safeguard Warning](#high-memory-safeguard-warning)
- [Safe Body Sanitization and ORM Support](#safe-body-sanitization-and-orm-support)
  - [Circular Reference and Stack Overflow Protection](#circular-reference-and-stack-overflow-protection)
  - [Sensitive Data Masking](#sensitive-data-masking)
- [Excluding Sensitive APIs and Routes](#excluding-sensitive-apis-and-routes)
  - [1. Live Management via Web Dashboard](#1-live-management-via-web-dashboard)
  - [2. Code-Based Configuration](#2-code-based-configuration)
- [Dashboard and Telemetry Console](#dashboard-and-telemetry-console)
  - [Midnight Dark Enterprise Interface](#midnight-dark-enterprise-interface)
  - [Real-Time Terminal Log Explorer](#real-time-terminal-log-explorer)
  - [Compact API Requests and JSON Inspector](#compact-api-requests-and-json-inspector)
- [Server Health Diagnostics](#server-health-diagnostics)
- [Production Graceful Shutdown](#production-graceful-shutdown)
- [Real Client IP Behind Reverse Proxies](#real-client-ip-behind-reverse-proxies)
- [Automated TTL Retention Policies](#automated-ttl-retention-policies)
- [Telemetry Data Export](#telemetry-data-export)
- [SQL Storage and Database Setup](#sql-storage-and-database-setup)
  - [SQLite (Built-in Zero-Config)](#sqlite-built-in-zero-config)
  - [MySQL Configuration](#mysql-configuration)
  - [User-Defined Master Encryption Keys](#user-defined-master-encryption-keys)
- [Hardened RBAC and Security Architecture](#hardened-rbac-and-security-architecture)
  - [Role-Based Access Control](#role-based-access-control)
  - [Root Administrator Setup](#root-administrator-setup)
  - [CLI Admin Recovery Tool](#cli-admin-recovery-tool)
- [Configuration Reference](#configuration-reference)
- [Backward Compatibility](#backward-compatibility)
- [Versioning Policy](#versioning-policy)
- [License](#license)

---

## Overview

Modern web APIs and microservices generate significant volumes of telemetry. Reading logs via terminal dumps or shipping them to expensive third-party SaaS vendors introduces latency, recurring costs, compliance risks, and vendor lock-in.

**TracerNest Logger** provides an embedded, self-hosted, **zero-runtime-dependency** live operations telemetry console that runs directly inside your Node.js application. It couples the visual clarity of Errsole with the design refinement of Linear and Vercel, fortified by enterprise-grade AES-256-GCM encryption and Scrypt authentication.

---

## Architecture

```
+------------------------------------------------------------------------+
|                      TRACERNEST LOGGER ARCHITECTURE                    |
|                                                                        |
|   Incoming HTTP Request  --->  Client IP Normalizer (Proxy / CDN)      |
|                                           |                            |
|                                           v                            |
|   Express / Fastify / Node  -->  Safe JSON Body Interception           |
|                                  (Circular & ORM Protection)           |
|                                           |                            |
|                                           v                            |
|   FastCrypto (AES-256-GCM)  -->  Ring Buffer (In-Memory Capacity)      |
|                                           |                            |
|                                           +--------> SQLite / MySQL    |
|                                           |          (Isolated Folder) |
|                                           v                            |
|   Real-Time SSE Stream   --->  Midnight Dark Console (/tracernest)     |
+------------------------------------------------------------------------+
```

---

## Key Features

| Capability | Description |
| :--- | :--- |
| **Zero Runtime Dependencies** | Exactly `dependencies: {}`. Zero external packages, zero supply-chain vulnerabilities, and pristine `npm audit` reports. |
| **Resilient Body Sanitization** | Fully circular-safe object traversal with ORM model normalization (Sequelize, Mongoose, TypeORM) and stack overflow prevention. |
| **Memory Safeguard System** | Automatic inspection of system RAM with diagnostic warnings against excessive buffer allocation. |
| **Midnight Dark Console** | High-density interface built on `#080B12` dark tones, Geist typography, JetBrains Mono code rendering, and Lucide SVG vectors. |
| **Terminal Log Stream** | Real-time terminal log viewer with sticky headers, multi-field regex search, and dynamic counter pills (`ALL`, `INFO`, `WARN`, `ERROR`, `DEBUG`). |
| **Compact API Inspector** | Uniform request cards displaying HTTP method, path, status, latency, client IP, expandable JSON payload drawers, and instant cURL generation. |
| **Real Client IP Normalization** | Extracts verified client IP addresses behind Cloudflare, AWS ALB, Nginx, Caddy, Fastly, and RFC 7239 `Forwarded` proxies. |
| **Server Health Diagnostics** | Authenticated `/api/health` diagnostics monitoring RSS/heap memory, uptime, event loop metrics, and database connectivity. |
| **Graceful Shutdown Manager** | Automatic handling of `SIGTERM` and `SIGINT` signals, connection draining, buffer flushing, and custom teardown hooks. |
| **Automated TTL Policies** | Custom retention rules to purge routine health checks or retain critical errors across configurable time horizons. |
| **Dual SQL Storage** | Out-of-the-box SQLite with isolated folder persistence (`./.tracernest/`), or seamless integration with production MySQL pools. |
| **Role-Based Access Control** | 4-tier RBAC (`admin`, `operator`, `auditor`, `viewer`), Scrypt password hashing, session isolation, and CLI-only admin recovery. |

---

## Quick Start

### 1. Installation

```bash
npm install tracernest-logger
```

*Requires Node.js 18.0.0 or higher.*

---

### 2. Express Setup

```typescript
import express from 'express';
import { TracerNestLogger } from 'tracernest-logger';

const app = express();
app.use(express.json());

// Initialize TracerNest Logger
const tracer = new TracerNestLogger({
  path: '/tracernest',       // Dashboard and API base route
  title: 'Production API Console',
  bufferSize: 5000,          // In-memory circular buffer capacity
  interceptStdout: true,     // Capture console.log automatically
  interceptStderr: true,     // Capture console.error automatically
  interceptHttp: true        // Capture HTTP requests, JSON payloads, and response latencies
});

// Register TracerNest middleware before application routes
app.use(tracer.middleware());

// Application business route
app.post('/api/v1/orders', (req, res) => {
  console.log('[OrderService] Processing order for user:', req.body.userId);
  res.status(201).json({ orderId: 'ord_9981', status: 'created', timestamp: Date.now() });
});

// Start HTTP server
const server = app.listen(3000, () => {
  // Attach graceful shutdown hooks automatically
  tracer.attachServer(server);
  console.log('Application running on http://localhost:3000');
  console.log('TracerNest Console available at http://localhost:3000/tracernest');
});
```

---

### 3. Fastify and Native HTTP Server Setup

TracerNest Logger functions with any native Node.js HTTP framework without requiring Express:

```typescript
import http from 'node:http';
import { TracerNestLogger } from 'tracernest-logger';

const tracer = new TracerNestLogger({ path: '/tracernest' });

const server = http.createServer(async (req, res) => {
  // 1. Let TracerNest handle console and telemetry endpoints
  const handled = await tracer.handleRequest(req, res);
  if (handled) return;

  // 2. Handle application routes
  if (req.url === '/api/ping') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'pong' }));
    return;
  }

  res.writeHead(404).end('Not Found');
});

tracer.attachServer(server);
server.listen(4000);
```

---

## Memory Management and Buffer Sizing

TracerNest Logger retains active logs in an in-memory circular `RingBuffer` for fast O(1) ingestion, real-time filtering, and sub-millisecond SSE broadcasting.

### Buffer Sizing Guidelines

Each enriched log entry (metadata, request/response JSON payloads, headers, client IP, stack traces) consumes approximately **2 KB to 4 KB** of memory depending on payload size.

| Buffer Size | Estimated RAM Footprint | Recommended Environment |
| :--- | :--- | :--- |
| **2,000** | ~6 MB - 8 MB | Microservices, AWS Lambda, Docker containers with <= 512 MB RAM |
| **5,000** *(Default)* | ~15 MB - 20 MB | Standard web applications, REST APIs, general production services |
| **10,000 - 20,000** | ~30 MB - 80 MB | High-traffic monoliths and high-concurrency payment/order gateways |
| **> 50,000** | > 150 MB - 300+ MB | High-memory instances only (Requires caution against Node.js OOM) |

### High Memory Safeguard Warning

At application startup, TracerNest Logger evaluates the configured `bufferSize` against system memory via `os.freemem()` and `os.totalmem()`.

If `bufferSize` exceeds **50,000** entries, or if the estimated memory footprint exceeds **25% of available free RAM**, TracerNest Logger automatically outputs a structured diagnostic warning to `console.warn`:

```text
[TracerNest-Logger WARNING] Configured bufferSize (75,000 entries) is unusually high.
Estimated in-memory log footprint is ~220 MB (Available free RAM: 512 MB, Total system RAM: 2048 MB).
High buffer sizes may cause excessive memory consumption, GC pressure, or process crashes due to Node.js Out-Of-Memory (OOM).
Recommended bufferSize is between 2,000 and 20,000 entries. For historical log analysis, rely on SQLite/MySQL database storage or TTL retention policies.
```

> **Best Practice:** Maintain `bufferSize` between 2,000 and 20,000. For historical audits and long-term analysis, utilize the built-in SQLite/MySQL persistent store and configure automated TTL retention policies rather than inflating in-memory capacity.

---

## Safe Body Sanitization and ORM Support

### Circular Reference and Stack Overflow Protection

When working with Object-Relational Mappers (such as **Sequelize**, **Mongoose**, or **TypeORM**), model instances often contain complex association graphs, database connection pools, query runners, and circular references (e.g., `RoleMaster` -> `rolePrivileges` -> `RolePrivilegesMapping` -> `RoleMaster`).

Passing these instances directly into standard loggers can trigger infinite recursion and crash Node.js with:
`RangeError: Maximum call stack size exceeded`.

TracerNest Logger incorporates a hardened, circular-safe sanitization engine:
1. **Circular Reference Detection:** Tracks visited object graphs using `WeakSet`. Circular links are safely detected and replaced with `"[Circular]"` without recursing.
2. **ORM Model Normalization:** Detects `.toJSON()` implementations on model instances and extracts clean data values, bypassing internal database connection handles.
3. **Depth Capping:** Enforces a maximum recursion depth limit (8 levels). Deeper nesting is safely truncated (`"[Truncated: Max Depth]"`).
4. **Special Type Handling:** Explicitly formats `Buffer` (`"[Buffer X bytes]"`), `Date` (ISO string), `Error` (name, redacted message, redacted stack), `RegExp`, `Socket`, and `Stream` instances.
5. **Collection Bounds:** Limits large arrays and object keys to 250 elements per level, preventing CPU starvation from malicious or oversized inputs.
6. **Top-Level Fail-Safe:** Wraps all body inspection in safe try/catch handlers, guaranteeing that telemetry recording **never crashes the host application under any circumstance**.

### Sensitive Data Masking

Request and response bodies are automatically scanned and redacted:
- **Default Sensitive Keys:** `password`, `token`, `secret`, `apiKey`, `authorization`, `creditCard`, `ssn`, `cvv`, `pin`, `privateKey`.
- **Bearer Tokens & JWTs:** Pattern-matched and masked as `Bearer [REDACTED_TOKEN]`.
- **API Keys:** Masks OpenAI (`sk-`), GitHub (`ghp_`), Stripe (`sk_live_`), and Slack (`xoxb-`) keys.
- **Credit Cards:** Validates 13-19 digit Luhn-compatible card patterns, masking all but the last 4 digits (`****-****-****-1234`).

Custom sensitive keys and headers can be added via configuration:

```typescript
const tracer = new TracerNestLogger({
  sensitiveFieldKeys: ['panNumber', 'bankAccount', 'aadhaar'],
  sensitiveHeaders: ['x-internal-secret', 'x-vendor-token']
});
```

---

## Excluding Sensitive APIs and Routes

Enterprise services process endpoints that handle financial transactions, authentication credentials, or high-frequency health checks that should never be recorded in log files or memory buffers.

TracerNest Logger supports dual-mode route exclusion: **live dynamic management in the web dashboard** and **static code configuration**.

### 1. Live Management via Web Dashboard

Navigate to the **Skip Sensitive APIs** panel in the dashboard:
- **Instant Real-Time Effect:** Exclusion rules take effect immediately without needing to restart the Node.js server.
- **One-Click Quick Skip:** While inspecting any intercepted request in the API Requests view, click **Skip Route** on the card drawer to exclude that endpoint immediately.
- **Method & Wildcard Filters:** Exclude specific HTTP methods (`POST`, `GET`, etc.) or all methods, using exact paths (`/api/auth/login`) or wildcards (`/api/v1/checkout/*`).
- **Pause & Resume:** Temporarily toggle rules between Active and Paused with a single switch.
- **SQL Persistence:** UI-configured rules are stored in the SQL `system_meta` table and persist across application restarts.

### 2. Code-Based Configuration

You can also supply exclusion rules during initialization via `excludeRoutes` (aliases: `excludePaths`, `ignoreRoutes`):

```typescript
const tracer = new TracerNestLogger({
  excludeRoutes: [
    '/api/auth/login',                                // Exact route path
    '/api/payments/*',                                // Wildcard matching all subpaths
    new RegExp('^/api/v1/checkout'),                  // Regular expression
    { path: '/api/webhooks/stripe', method: 'POST' }, // Specific path + HTTP method
    (req) => req.headers['x-skip-log'] === 'true'     // Custom dynamic predicate
  ]
});
```

Excluded routes pass through your server untouched, completely bypassing the log ring buffer, live SSE streams, and SQL storage.

---

## Dashboard and Telemetry Console

### Midnight Dark Enterprise Interface

The console UI is self-contained and served directly from memory with zero external asset dependencies:
- **Color Palette:** Midnight Deep Background (`#080B12`), Card Surfaces (`#111827`), Subtle Borders (`#253047`), and Accent Highlights (`#38BDF8` / `#6366F1`).
- **Typography:** **Geist** for structural readability and **JetBrains Mono** for monospace logs, URLs, IP addresses, and JSON payloads.
- **Iconography:** Clean, thin-stroke Lucide SVG vectors (`stroke-width="1.75"`).
- **Zero Native Popups:** Replaces browser `alert()` and `confirm()` dialogs with customized, non-blocking modal interfaces.

### Real-Time Terminal Log Explorer

- **Structured Log Grid:** Sticky table headers with columns for Timestamp, Level Pill, Source, and Message Content.
- **Live Search & Regex:** Real-time multi-field search across messages, paths, IPs, and nested metadata. Toggle full regex matching with the `.*` control.
- **Interactive Counters:** Reactive filter pills displaying real-time record counts for `ALL`, `INFO`, `WARN`, `ERROR`, and `DEBUG`.
- **Chronological Sorting:** Toggle between **Newest First** and **Oldest First** with one click.
- **Full Inspector Drawer:** Click any log row to open detailed metadata, process IDs, and stack traces.

### Compact API Requests and JSON Inspector

- **Uniform Single-Line Rows:** Displays HTTP Method badge, Request Path, Status Pill, Latency, Client IP, and Timestamp.
- **Side-by-Side Payload View:** Inspect formatted Request JSON and Response JSON side-by-side with syntax highlighting.
- **Copy as cURL:** Copy an executable `curl` command for any intercepted API request including headers and body in one click.

---

## Server Health Diagnostics

TracerNest Logger includes a built-in health diagnostics endpoint accessible at `/api/health` and `/health`:

```bash
curl http://localhost:3000/tracernest/api/health
```

**Sample Response (`200 OK`):**

```json
{
  "status": "healthy",
  "uptime": 172800,
  "uptimeFormatted": "2d 0h 0m 0s",
  "timestamp": "2026-11-17T09:30:00.000Z",
  "process": {
    "pid": 4210,
    "nodeVersion": "v22.10.1",
    "platform": "win32",
    "arch": "x64"
  },
  "memory": {
    "rssMb": 48.2,
    "heapTotalMb": 28.5,
    "heapUsedMb": 18.3,
    "externalMb": 2.1,
    "heapUsagePercent": 64.2
  },
  "database": {
    "dialect": "sqlite",
    "status": "connected"
  },
  "logs": {
    "bufferCount": 1240,
    "capacity": 5000,
    "totalPurged": 850
  }
}
```

The console header displays a real-time status pill (`HEALTHY` in emerald, `DEGRADED` in amber, `UNHEALTHY` in rose) and opens an interactive diagnostic modal displaying live memory and system telemetry.

---

## Production Graceful Shutdown

During deployment rollouts and container scale-downs, Node.js applications receive `SIGTERM` or `SIGINT` signals.

TracerNest Logger includes an integrated `GracefulShutdownManager`:
1. Intercepts `SIGTERM` and `SIGINT` signals automatically.
2. Broadcasts a Server-Sent Event (SSE) shutdown alert to all connected console sessions.
3. Stops accepting new incoming connections and allows in-flight HTTP requests to drain within a configurable timeout (default: `10,000 ms`).
4. Flushes the log ring buffer and commits pending SQL transactions.
5. Restores original `process.stdout` and `process.stderr` streams.
6. Executes registered custom asynchronous cleanup handlers.

```typescript
const tracer = new TracerNestLogger({
  gracefulShutdown: {
    timeoutMs: 15000, // Maximum time to wait for in-flight requests to complete
    onShutdown: async () => {
      console.log('Closing database connection pools...');
      await databasePool.end();
    }
  }
});
```

---

## Real Client IP Behind Reverse Proxies

When hosting behind reverse proxies, CDNs, or load balancers, `req.socket.remoteAddress` reflects the internal proxy IP rather than the client.

TracerNest Logger automatically extracts and verifies the true client IP using prioritized header analysis:

1. `cf-connecting-ip` *(Cloudflare)*
2. `x-real-ip` *(Nginx, Caddy)*
3. `true-client-ip` *(Akamai, Cloudflare Enterprise)*
4. `fastly-client-ip` *(Fastly)*
5. `x-forwarded-for` *(First public IP in comma-separated proxy chain)*
6. `x-client-ip`
7. `forwarded` *(RFC 7239 standard `for=...` directive)*
8. `req.socket.remoteAddress` *(Direct socket fallback)*

IPv6-mapped IPv4 addresses (e.g., `::ffff:192.168.1.1` -> `192.168.1.1`) and IPv6 loopbacks (`::1` -> `127.0.0.1`) are normalized automatically.

---

## Automated TTL Retention Policies

Manage database and memory utilization by defining Time-To-Live (TTL) eviction policies:

```typescript
const tracer = new TracerNestLogger({
  ttl: {
    defaultTtlSeconds: 86400 * 7, // Retain standard logs for 7 days
    cleanupIntervalMs: 60000,      // Run automated background eviction every 60 seconds
    rules: [
      {
        id: 'purge-health-checks',
        name: 'Purge Health Check Pings',
        pattern: '/health|/healthz|/ping',
        ttlSeconds: 60             // Evict health checks after 60 seconds
      },
      {
        id: 'retain-errors',
        name: 'Retain Error Logs',
        level: 'error',
        ttlSeconds: 86400 * 30     // Retain critical errors for 30 days
      }
    ]
  }
});
```

TTL policies can also be managed live in the dashboard under the **TTL & Retention** tab.

---

## Telemetry Data Export

Export telemetry records at any time using the precision export dialog:

- **Three Export Formats:**
  - **Structured JSON (`.json`):** Full metadata, HTTP headers, request/response JSON payloads, and timestamps.
  - **Tabular CSV (`.csv`):** Spreadsheet format compatible with Excel and Google Sheets.
  - **Newline Delimited JSON (`.ndjson`):** Streaming format designed for pipeline ingestion into ELK, Datadog, or Splunk.
- **Selectable Scope:** Export either **Filtered Query Logs** (matching active level, search, or source filters) or the **Entire Ring Buffer**.
- **Secure Download:** Streams via in-memory authenticated blobs with zero credential exposure in URLs.

---

## SQL Storage and Database Setup

### SQLite (Built-in Zero-Config)

By default, TracerNest Logger runs on built-in SQLite with zero external dependencies. All database and rollback journal files are automatically isolated inside a dedicated folder (`./.tracernest/`):
- `./.tracernest/tracernest-logger.sqlite` &mdash; SQLite database.
- `./.tracernest/tracernest-logger.sqlite-journal` &mdash; Transaction rollback journal.
- `./.tracernest/tracernest-logger.sql` &mdash; Auto-synchronized encrypted SQL file.

```typescript
// Default: automatically creates and initializes files inside ./.tracernest/
const tracer = new TracerNestLogger();

// Custom Folder: initialize files inside any directory of your choice
const tracer = new TracerNestLogger({
  dataDir: './tracernest-data'
});

// Explicit Custom Paths
const tracer = new TracerNestLogger({
  dialect: 'sqlite',
  sqliteFilePath: './data/custom.sqlite',
  sqlFilePath: './data/custom.sql'
});
```

### MySQL Configuration

To persist telemetry directly in your production MySQL database:

```typescript
import mysql from 'mysql2/promise';

// Option A: Reusing your application's existing connection pool
const pool = mysql.createPool({ host: 'localhost', user: 'root', database: 'myapp' });

const tracer = new TracerNestLogger({
  dialect: 'mysql',
  tablePrefix: 'tracenest_', // Namespaces all tables safely (e.g., tracenest_users)
  mysql: { pool }
});

// Option B: Providing connection credentials directly
const tracer = new TracerNestLogger({
  dialect: 'mysql',
  mysql: {
    host: '127.0.0.1',
    port: 3306,
    user: 'app_user',
    password: process.env.DB_PASSWORD,
    database: 'telemetry_db'
  }
});
```

All persistent tables are automatically generated on initial startup:
- `tracenest_users` &mdash; Encrypted credentials, roles, and password salts.
- `tracenest_alert_configs` &mdash; Webhook, Slack, Discord, and Email notification rules.
- `tracenest_audit_logs` &mdash; Tamper-evident administrative audit trail.
- `tracenest_system_meta` &mdash; Schema versioning, instance metadata, and dynamic exclusion rules.

### User-Defined Master Encryption Keys

TracerNest Logger uses authenticated **AES-256-GCM** with random 96-bit initialization vectors and 128-bit authentication tags to encrypt integration credentials (SMTP passwords, webhook URLs, and alert settings) at rest.

In accordance with strict security standards (resolving **SEC-08**), **encryption keys are never stored inside the database**. Operators can define their own encryption keys directly in code or via environment variables:

#### 1. Code-Based Key Configuration
```typescript
const tracer = new TracerNestLogger({
  // Provide a custom master key (minimum 16 characters, 32 characters recommended)
  secret: 'my-custom-production-key-32-chars-long!',
  // or via alias:
  // masterKey: 'my-custom-production-key-32-chars-long!'
});
```

#### 2. Environment Variable Configuration (Recommended for 12-Factor Deployments)
Set `TRACERNEST_SECRET` in your environment (e.g., Kubernetes Secret, AWS SSM Parameter Store, or Docker `.env`):

```bash
export TRACERNEST_SECRET="your-high-entropy-master-encryption-key-here"
```

#### 3. Automatic Independent Key Generation
If no key is explicitly supplied, TracerNest Logger automatically generates an independent 256-bit cryptographically secure key and stores it in an isolated, protected file (`./.tracernest/.master.key` with restricted `0600` filesystem permissions) **outside the database**. This ensures that an unauthorized copy or dump of the SQLite `.sqlite` or `.sql` file cannot be decrypted without the separate external key.

---

## Hardened RBAC and Security Architecture

### Role-Based Access Control

TracerNest Logger enforces role-based access control across four predefined roles:

| Role | Permissions |
| :--- | :--- |
| **`admin`** | Full access: inspect logs, stream, export, manage users, configure alerts, edit TTL retention, manage excluded routes, and inspect system metrics. |
| **`operator`** | Read logs, stream live SSE, trigger test alerts, and view diagnostics. Cannot manage users or delete records. |
| **`auditor`** | Read-only access to audit logs, user change events, and security access logs. |
| **`viewer`** | Read-only access to application logs. |

### Root Administrator Setup

Upon visiting the console for the first time, TracerNest Logger detects that no administrative account exists and displays the **First-Time Administrator Setup** screen. Passwords are salted with 128-bit cryptographic salts and hashed using **Scrypt**.

Authentication sessions are maintained in browser `sessionStorage`, ensuring tokens are automatically cleared when the browser tab is closed.

### CLI Admin Recovery Tool

To protect against remote account takeovers, **web-based password reset endpoints are disabled** and return `403 Forbidden`.

If an administrator loses their credentials, access can only be restored directly on the server through the terminal CLI:

```bash
npx tracernest-reset-admin
```

*(or via npm script: `npm run reset--admin--user`)*

**CLI Interactive Output:**

```
============================================================
       TRACERNEST LOGGER: SECURE ADMIN RECOVERY UTILITY
============================================================
Target SQLite DB : ./.tracernest/tracernest-logger.sqlite
Encrypted SQL    : ./.tracernest/tracernest-logger.sql

Root administrator account found: "admin"
Enter new temporary password (leave empty to generate secure OTP):

Generated Cryptographically Secure One-Time Password:
------------------------------------------------------------
  Username : admin
  One-Time : Tn9#kL2!vQ8@mZ4$
------------------------------------------------------------
[SUCCESS] Root administrator password successfully updated!
Mandatory password rotation will be enforced upon initial login.
```

### Reverse Proxy and Trusted Proxy Allowlist (SEC-10 Hardening)

In direct-to-application deployments, clients can forge forwarding headers (such as `X-Forwarded-For` or `CF-Connecting-IP`) in an attempt to spoof their identity or evade rate limiters.

To eliminate this vulnerability (**SEC-10**), TracerNest Logger **defaults to the immediate TCP socket peer address** (`trustProxy: false`). Forwarding headers are only inspected when the immediate connection originates from a verified, trusted reverse proxy:

```typescript
const tracer = new TracerNestLogger({
  // Configure trusted proxies (Nginx, Cloudflare, AWS ALB, Caddy)
  trustProxy: ['127.0.0.1', '10.0.0.0/8', '172.16.0.0/12']
  
  // Or trust all upstream reverse proxies (when protected by cloud load balancer):
  // trustProxy: true
  
  // Or loopback only:
  // trustProxy: 'loopback'
  
  // Or custom validation predicate:
  // trustProxy: (ip) => ip.startsWith('10.244.')
});
```

When a trusted proxy chain is verified, proxy headers are traversed backwards from the trusted end (right-to-left), ensuring the first untrusted caller is identified as the client and preventing attacker-injected prefixes from succeeding.

### Dual Login Throttling and Bounded Limiter Memory

Login endpoints enforce dual-keyed protection:
1. **Peer IP Throttling (`login:ip:<ip>`):** Rapid authentication requests from the same network connection are rate limited after 5 failed attempts per 15-minute window.
2. **Account-Keyed Throttling (`login:user:<username>`):** Distributed brute-force attacks that attempt passwords against a specific administrative username across multiple IPs are automatically throttled after 5 failed attempts.
3. **Bounded Memory Storage:** The rate limiter memory cache is strictly capped (`maxEntries: 10000`), automatically evicting expired keys and using FIFO eviction when full to prevent memory exhaustion attacks.

### Safe Request Body Streaming and Bounding (SEC-09 Hardening)

To prevent denial-of-service and memory exhaustion via oversized request payloads (**SEC-09**):
- **Upfront Content-Length Checking:** Requests with a `Content-Length` header exceeding the 1 MiB limit are rejected immediately with `413 Payload Too Large` without buffering.
- **Active Stream Disconnect:** For chunked transfers, if accumulated bytes exceed 1 MiB, stream data listeners are removed immediately, buffered memory is reclaimed, the stream is drained via `req.resume()`, and `413 Payload Too Large` is returned to the client.

---

## Configuration Reference

Options accepted by `new TracerNestLogger(options)`:

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `path` | `string` | `'/tracernest'` | Base route path where the console dashboard and API are hosted. |
| `title` | `string` | `'TracerNest-Logger Console'` | Application title displayed in the browser tab and sidebar header. |
| `logo` | `string` | `DEFAULT_LOGO` | Custom logo image URL, Data URI (base64/SVG), or local file path. |
| `dialect` | `'sqlite' \| 'mysql'` | `'sqlite'` | Database engine for persistent metadata and user accounts. |
| `dataDir` | `string` | `'./.tracernest'` | Dedicated folder directory where SQLite database, journal, and SQL export files are initialized. |
| `sqliteFilePath` | `string` | `'./.tracernest/tracernest-logger.sqlite'` | Explicit file path for SQLite database. |
| `sqlFilePath` | `string` | `'./.tracernest/tracernest-logger.sql'` | Explicit file path for the auto-synchronized encrypted SQL file. |
| `mysql` | `MySqlConfig` | `undefined` | MySQL connection credentials or an existing `mysql2` client/pool. |
| `tablePrefix` | `string` | `'tracenest_'` | Prefix applied to all TracerNest database tables. |
| `bufferSize` | `number` | `5000` | Maximum number of log records retained in the circular ring buffer (2,000 - 20,000 recommended). |
| `interceptStdout` | `boolean` | `true` | Automatically capture and route `process.stdout` into the console. |
| `interceptStderr` | `boolean` | `true` | Automatically capture and route `process.stderr` into the console. |
| `interceptHttp` | `boolean` | `true` | Automatically intercept and log HTTP request/response JSON payloads. |
| `excludeRoutes` | `RouteFilterRule[]` | `[]` | Route paths, wildcards (`'/api/auth/*'`), RegExps, method objects, or predicates to exclude from logging. |
| `excludePaths` | `RouteFilterRule[]` | `[]` | Alias for `excludeRoutes`. |
| `sensitiveHeaders` | `string[]` | `[...]` | Additional custom HTTP header names to mask as `[REDACTED]` in request logs. |
| `sensitiveFieldKeys` | `string[]` | `[...]` | Additional JSON field keys/fragments to mask in request and response bodies. |
| `maxHttpBodyBytes` | `number` | `524288` (512 KB) | Maximum request/response body size buffered for inspection. |
| `redactSensitive` | `boolean` | `true` | Automatically masks credit cards, bearer tokens, API keys, and passwords. |
| `customRedactionPatterns` | `RegExp[]` | `[]` | Additional regex patterns to redact before storing logs. |
| `ttl` | `TTLConfig` | See TTL section | Time-To-Live retention rules and eviction schedules. |
| `gracefulShutdown` | `boolean \| GracefulShutdownOptions` | `true` | Automatically listens for `SIGTERM`/`SIGINT` and handles connection draining. |
| `healthCheck` | `boolean` | `true` | Enables the `/api/health` diagnostics endpoint. |
| `trustProxy` | `boolean \| string \| string[] \| Function` | `false` | Trusted proxy allowlist for reverse proxy deployments (SEC-10). When false, socket peer address is used. |
| `rateLimit` | `RateLimiterOptions` | `{ maxAttempts: 5, windowMs: 900000, maxEntries: 10000 }` | Rate limiting options for authentication attempts. |
| `csp` | `string \| boolean` | `undefined` | Custom Content-Security-Policy string, or `false` to disable built-in CSP headers. |
| `sessionDurationSeconds` | `number` | `86400` (24h) | Stateless HMAC token expiration window in seconds. |
| `secret` | `string` | `Auto-generated` | Master secret key used for HMAC signing and AES-256-GCM SQL data encryption at rest. Can also be set via `process.env.TRACERNEST_SECRET`. |
| `masterKey` | `string` | `Auto-generated` | Alias for `secret`: user-defined key for encrypting SQL alert credentials at rest. |

---

## Backward Compatibility

TracerNest Logger provides full backward compatibility for legacy imports:

```typescript
// Modern Import (Recommended)
import { TracerNestLogger } from 'tracernest-logger';

// Backward-Compatible Named Imports
import { TraceNest, LogVault } from 'tracernest-logger';
```

---

## Versioning Policy

TracerNest Logger follows [Semantic Versioning (SemVer)](https://semver.org/):
- **Major (X.0.0):** Breaking API changes or schema modifications requiring explicit migration steps.
- **Minor (1.X.0):** New features, performance enhancements, and backward-compatible additions.
- **Patch (1.0.X):** Bug fixes, security hardening, and documentation updates.

Current Release: **`1.6.0`**

---

## Community & Contributing

We welcome contributions of all forms from the community!
- **[Contributing Guide](CONTRIBUTING.md):** Development setup, zero-dependency policy, and PR submission guidelines.
- **[Code of Conduct](CODE_OF_CONDUCT.md):** Standards and expectations for an inclusive, welcoming community.
- **[Security Policy](SECURITY.md):** Responsible vulnerability reporting and security architecture details.
- **[Changelog](CHANGELOG.md):** Release history and migration notes.

---

## License

This project is licensed under the [Apache License, Version 2.0](LICENSE) &mdash; free for use in commercial applications, open-source projects, and enterprise infrastructure.
