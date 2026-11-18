# Security & Privacy Architecture

Because TracerNest operates directly inside the host Node.js application and records request payloads, headers, and logs, **security is a first-class architectural requirement**.

---

## 1. Authentication & Session Security

- **Password Hashing:** Passwords are never stored in plaintext. They are hashed using Node.js native `crypto.scrypt` with a unique 16-byte cryptographically secure salt, producing a 64-byte derived key.
- **Timing-Safe Verification (SEC-01):** Password hash comparisons use `crypto.timingSafeEqual` to eliminate side-channel timing attack vectors.
- **Stateless HMAC-SHA256 Tokens:** Authenticated sessions use signed tokens generated via `crypto.createHmac('sha256', secret)`.
- **Token Invalidation on Role Change (SEC-02):** Each user record maintains an integer `tokenVersion`. If an administrator changes a user's role or revokes access, `tokenVersion` increments, invalidating all outstanding tokens immediately.

---

## 2. Role-Based Access Control (RBAC)

TracerNest provides three default privilege tiers:

| Role | Permissions | Typical Audience |
| :--- | :--- | :--- |
| **Admin** | Full system control (`logs:view`, `logs:export`, `users:manage`, `alerts:manage`, `ttl:manage`, `routes:manage`, `diagnostics:view`) | Principal Engineers, DevOps Leads, Platform Admins |
| **Developer** | Operational analysis (`logs:view`, `logs:export`, `diagnostics:view`, `routes:manage`) | Backend Developers, QA Engineers, Support Leads |
| **Viewer** | Read-only inspection (`logs:view`, `diagnostics:view`) | Auditors, Product Managers, Junior Engineers |

Operators can customize or extend default permissions by passing `customRolePermissions` in the configuration.

---

## 3. Reverse Proxy & Rate Limiting Hardening (SEC-10)

Exposing a login endpoint without defense against proxy header spoofing allows attackers to evade IP-based rate limiting by rotating fake `X-Forwarded-For` addresses.

### Direct Socket Peer Address by Default
When `trustProxy: false` (the default), TracerNest strictly extracts the client IP from the actual TCP socket connection (`req.socket.remoteAddress`). Headers like `X-Forwarded-For` or `CF-Connecting-IP` sent by attackers are completely ignored.

### Trusted-End Reverse Proxy Traversal
When `trustProxy` is configured (with specific IPs, CIDR blocks, or a predicate function), TracerNest parses `X-Forwarded-For` backwards from right to left (from the trusted proxy boundary toward the client). The first untrusted IP address encountered is resolved as the verified client IP, completely defusing attacker-injected header prefixes.

### Dual-Keyed Login Throttling
Login attempts on `/api/auth/login` consume rate-limit tokens from two independent buckets:
1. `login:ip:<clientIp>`: Throttles credential stuffing originating from a single IP.
2. `login:user:<normalizedUsername>`: Throttles distributed brute-force attacks against a single user account across multiple IPs.

### Memory-Bounded Rate Limiter Table
The rate limiter table enforces a hard capacity limit (`maxEntries: 10000`). If an attacker floods the system with millions of unique synthetic IP keys to exhaust memory, expired entries are cleaned up immediately, and if still full, the oldest 10% of entries are evicted (FIFO/LRU), guaranteeing memory bounds.

---

## 4. Request Body Stream Bounding (SEC-09)

Attackers targeting monitoring endpoints can attempt to send unbounded chunked streams to cause out-of-memory crashes.

TracerNest defends against this at the network socket layer:
1. **Upfront Content-Length Enforcement:** If `content-length` exceeds the configured threshold (1 MiB default for API routes, 512 KB for log interception), the request is rejected immediately.
2. **Byte Counting on Streams:** Tracks cumulative byte counts across stream chunks (`Buffer.byteLength`).
3. **Listener Detachment:** The instant the threshold is breached, all `data`, `end`, and `error` listeners are detached immediately.
4. **Memory Nullification:** Accumulator buffers are nullified (`body = ''`) to allow immediate garbage collection.
5. **Stream Drainage:** Invokes `req.resume()` to drain remaining incoming network bytes without stalling the socket, and returns HTTP `413 Payload Too Large`.

---

## 5. Storage Security & Encryption

- **Encrypted SQL Mirrors:** When running SQLite, TracerNest maintains an auto-synchronized `.sql` file encrypted with AES-256-GCM.
- **User-Defined Master Keys (SEC-08):** Teams can supply their own master encryption key (`masterKey` / `secret` or via `TRACERNEST_MASTER_KEY` environment variable). The key is never written to the encrypted database tables.
- **CLI Recovery Utility:** If an administrator forgets their credentials, the embedded CLI tool (`npx tracernest-reset-admin`) allows resetting the root password directly from the host terminal.

---

## Production Security Checklist

Before deploying TracerNest to a production environment, complete this checklist:

- [ ] **Configure a Master Encryption Key:** Set `masterKey` to a random 32+ character passphrase stored securely in your secret manager (e.g., AWS Secrets Manager, Vault).
- [ ] **Configure `trustProxy` Correctly:** If running behind Nginx, Cloudflare, or an AWS ALB, supply your proxy CIDR or IP range to `trustProxy`. If connecting directly, leave it `false`.
- [ ] **Change the Default Base Path:** Consider changing `path` from `/tracernest` to an internal or obfuscated path (e.g., `/ops-telemetry-portal`).
- [ ] **Restrict Network Access:** Use reverse proxy rules or firewall policies to restrict access to the dashboard path to internal VPN or corporate IP ranges where possible.
- [ ] **Audit Sensitive Route Exclusions:** Exclude authentication routes (`/api/auth/login`, `/api/auth/reset-password`) or payment gateway webhooks from request body capture using `excludeRoutes`.
- [ ] **Enable TLS / HTTPS:** Always terminate HTTPS at your load balancer or reverse proxy so dashboard sessions are encrypted in transit.

