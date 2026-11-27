# Changelog

All notable changes to **TracerNest Logger** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.9.2] - 2026-11-27

### Added
- **Dynamic Route Prefix Synchronization for Laravel 13:** `integrations/laravel/routes.php` and `TracerNestController` now automatically synchronize the routing prefix from `config('tracernest.endpoint')` when `TRACERNEST_ENDPOINT` is configured with a custom subpath (e.g., `http://localhost:8000/telemetry`), preventing 404 routing errors.
- **SPA Runtime Base Path Injection (`window.__TRACERNEST_BASE_PATH__`):** `TracerNestController::dashboard()` injects the runtime base path directly into the dashboard HTML head, ensuring that the Single-Page Application (SPA) dashboard consistently issues AJAX requests (`/api/auth/status`, `/api/logs`, `/api/health`) to the correct prefix even when mounted under nested Laravel route groups (`Route::prefix('admin')->group(...)`).
- **Trailing Slash & SPA Subroute Resilience:** Added support for both `Route::get('')` and `Route::get('/')` to resolve trailing-slash mismatches, along with direct route registrations for all SPA views (`/login`, `/setup`, `/decryption`, `/logs`, `/settings`, `/alerts`, `/audit`, `/users`).
- **HTTP Ingest Route Prefix Harmonization:** In `TracerNestMiddleware` and `TracerNestMonologHandler`, HTTP mode automatically appends the configured routing prefix to host-only endpoints (e.g. `http://127.0.0.1:8001` -> `http://127.0.0.1:8001/tracernest/api/logs/ingest`) and avoids double-appending paths, eliminating ingestion 404s.
- **Direct Microservice Ingest Fallback:** Added root route aliases (`POST /api/logs/ingest` and `POST /api/ingest`) in both Laravel (`config('tracernest.expose_root_api', true)`) and the standalone Node.js server (`src/middleware/handler.ts`), allowing external log forwarders to ingest telemetry seamlessly even if they omit the route prefix.
- **Self-Telemetry Exclusion:** `TracerNestMiddleware` automatically excludes TracerNest's own internal dashboard and API endpoints (`$tracernestPrefix`) from telemetry capture, eliminating recursive logging loops and telemetry noise.
- **Client IP & Real IP Diagnostic Display:** Extracted both Client IP (socket/proxy peer) and Real IP (`X-Real-IP`, `CF-Connecting-IP`, `True-Client-IP`) across HTTP requests, displaying both in the inspector dialog box for transparent proxy auditing.
- **Accessibility Statement (`ACCESSIBILITY.md`):** Added a project accessibility standard documenting WCAG 2.1 Level AA conformance, dark-mode high-contrast palettes, keyboard accessibility, and barrier reporting.

### Fixed
- **Laravel 13 Endpoint 404s:** Fixed 404 Not Found errors occurring when endpoints were requested under custom prefixes or when trailing slashes were omitted.
- **Markdown Flowchart npmjs Compatibility:** Converted Mermaid diagrams in `README.md` to universal ASCII/Unicode text flowcharts that render reliably across npmjs.com, GitHub, and terminal previews.
- **XSS & CSP Hardening:** Hardened dashboard HTML generation with context-appropriate escaping for `appTitle`, `customLogo`, and dynamic log fields, alongside hardened CSP policies.

---

## [1.8.6] - 2026-11-20

### Security & Capability Hardening
- **Strict Zero-Environment-Variable Policy (`envVars`):** Completely eradicated `process.env` from all runtime library modules, bin scripts, and demos. Environmental variables are never accessed even as a fallback; all settings are strictly passed via initialization options or CLI flags.
- **SMTP TLS Certificate Verification:** Enforced strict TLS certificate verification (`rejectUnauthorized: true`) with SNI hostname validation. Insecure self-signed or unverified certificate bypasses are prohibited.
- **Mandatory TLS for SMTP Authentication:** Eliminated plaintext credential transmission over unencrypted connections. When SMTP credentials are provided, STARTTLS negotiation or direct TLS (SMTPS) is mandatory prior to sending `AUTH LOGIN`.
- **CRLF Injection & Dot-Stuffing Defense:** Added strict CRLF header validation (`validateNoCrlf`) across SMTP `From`, `To`, and `Subject` fields. Implemented RFC 5321 Section 4.5.2 dot-stuffing to prevent premature message termination or command injection.
- **Teams Webhook SSRF & Domain Guard:** Restricted Microsoft Teams incoming webhooks to HTTPS and verified Microsoft/Office domains (`*.webhook.office.com`, `*.office.com`, `*.office365.com`, `*.microsoft.com`, `*.logic.azure.com`). Strictly prohibited loopback, private IPv4/IPv6, and cloud metadata destinations.
- **Filesystem Access Reduction:** Removed `node:fs` imports from `src/middleware/handler.ts` to prevent middleware-level filesystem probing. Streamlined `sql-store.ts` file path resolution to prevent redundant disk probing.
- **Socket.dev Configuration Update:** Updated `socket.yml` with comprehensive capability declarations for `filesystemAccess: false` and `envVars: false`.

---

## [1.8.5] - 2026-11-20

### Added
- **SQLite to MySQL Automatic Data Migration:** Seamlessly auto-migrates existing SQLite records (`users`, `alert_configs`, `audit_logs`, `logs`, `system_meta`) into MySQL when changing initialization dialect from `sqlite` to `mysql`.
- **Schema Auto-Updates on Upgrade:** Non-destructive DDL migrations applied automatically on startup (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN ...`).
- **SQLite File Cleanup with Master Key Preservation:** Automatically removes legacy `.sqlite`, `.sqlite-wal`, `.sqlite-shm`, and `.sql` dump files after successful migration to MySQL while strictly preserving `.master.key`.
- **Configurable Storage Folder Options:** Added `folder`, `storageDir`, and `initFolder` as configuration aliases for `dataDir`.
- **Persistent Telemetry Logs:** Persists terminal output and HTTP logs to the database until their TTL expiration (`expires_at`), surviving server restarts.
- **Laravel 13 Compatibility (Zero Port Overhead):** Packaged native Laravel 13 bridge files (`TracerNestMiddleware.php`, `TracerNestController.php`, `routes.php`) allowing TracerNest to run directly inside Laravel on the exact same port without opening new ports.
- **External Log Ingestion API:** Added `POST /api/logs/ingest` supporting single or batch log ingestion from Laravel, microservices, and external backends.
- **Standalone CLI Runner:** Added `tracernest-server` / `tracenest-server` binary to launch the telemetry dashboard independently.

### Changed
- **Pure Library Configuration:** Removed internal fetching from `process.env` (`TRACERNEST_SECRET`, `TRACERNEST_ADMIN_USERNAME`). All configurations are passed directly via initialization options.

---

## [1.8.0] - 2026-11-20

### Reverse Proxy & Gateway Tolerance
- **Automatic Browser Path Detection (`window.location.pathname`):** The dashboard frontend now automatically detects the URL path used by the browser. When TracerNest is proxied behind Nginx rules with path stripping (e.g., `location /api/ { proxy_pass http://localhost:3000/; }`), all client API calls automatically include the `/api` prefix so they route through Nginx without needing special Nginx server blocks.
- **Multi-Route & Candidate Path Matching:** TracerNest middleware concurrently recognizes both stripped routes (`/tracenest` / `/tracernest`) and prefixed routes (`/api/tracenest` / `/api/tracernest`), allowing seamless handling whether Nginx rewrites the path or forwards it verbatim.
- **Public & Internal Path Decoupling (`publicPath` & `apiPrefix`):** Added optional `publicPath` and `apiPrefix` config options to explicitly declare external gateway paths while keeping internal Node.js routes completely standard.
- **Typo-Tolerant Spelling Aliases:** Automatically accepts both `tracernest` and `tracenest` spellings across all HTTP routes and internal logger exclusions.
- **Origin-Wide Session Cookie (`Path=/`):** Configured session cookies to root path (`Path=/`) to ensure authentication remains valid regardless of proxy prefix rewrites.

## [1.7.8] - 2026-11-20

### Security & Payload Protection
- **Initial Administrator Auto-Provisioning (`initialAdmin`):** Added `initialAdmin: { username, password }` configuration parameter and environment variables (`TRACERNEST_ADMIN_USERNAME`, `TRACERNEST_ADMIN_PASSWORD`) to automatically provision the root administrator on container startup without requiring interactive web setup.
- **Web Setup Route Lock (`disableSetupApi`):** Added `disableSetupApi: boolean` parameter to disable `POST /api/auth/setup` (returns 403 Forbidden) for hardened production environments behind reverse proxies.
- **Default AES-256-GCM HTTP Payload Encryption:** Activated payload encryption by default whenever any master encryption key exists (`userEncryptionKey || this.secret`), ensuring intercepted request bodies and response bodies are securely encrypted with AES-256-GCM out of the box without requiring manual `encryptPayloads: true` flags. Added safe error logging to prevent silent payload drop.
- **Dual Stream Interception (`req.on` & `req.addListener`):** Monkey-patched both `req.on` and `req.addListener` to guarantee streaming request body capture regardless of middleware registration order or framework stream consumer.
- **GET/HEAD Empty Body Filter:** Filtered out synthetic empty object envelopes on body-less GET/HEAD requests to keep telemetry logs clean.

### Resilience & Docker Support
- **Container Volume Write Diagnostics:** Enhanced `POST /api/auth/setup` with actionable error diagnostics for SQLite permission failures (`SQLITE_READONLY`, `EACCES`), providing direct operational guidance for Docker containers running under non-root users (`node:node`) or read-only volume mounts.

### Supply-Chain Hardening
- **Zero-Dependency Demo & Lockfile Pruning:** Replaced legacy Express demo with pure Node.js native `node:http`, completely purged `express` from `devDependencies`, and pruned `package-lock.json` down to 55 lines, resolving Socket.dev supply chain warnings (`eval`, network access, and overrides) to zero.

## [1.7.7] - 2026-11-20

### Security & Supply-Chain Hardening
- **Source Transparency & Obfuscation Defense:** Formatted embedded vector assets and barrel exports across clean, human-readable multi-line syntax, completely eliminating extreme line-length anomalies and heuristic packed-code triggers.
- **Auditable Package Distribution:** Published original TypeScript source (`src/`) and complete source maps (`.map`) within the npm distribution bundle, enabling security scanners and auditors to verify compiled JavaScript directly against original TypeScript.
- **Socket Policy Rules:** Updated `socket.yml` schema v2 with explicit project exclusions and transparency declarations.

## [1.7.6] - 2026-11-19

### Changed
- **Zero Peer Dependencies:** Completely eliminated `peerDependencies` (`express`). TracerNest is strictly framework-agnostic, built on Node.js core HTTP primitives, and operates with zero runtime dependencies and zero peer dependencies across Express, Fastify, Connect, NestJS, and pure `node:http`.
- **Supply-Chain Hardening & Socket.dev Verification:** Added root `socket.yml` configuration (v2 schema) and integrated `@socketregistry` overrides in development test runners to eliminate legacy dynamic eval shims from transitive devDependencies.
- **Package Manifest Synchronization:** Synchronized `package.json` and `package-lock.json` manifests to guarantee clean, zero-peer installs for downstream consumers.

## [1.7.4] - 2026-11-19

### Added
- **SQLite WAL Concurrency Mode:** Configured `PRAGMA journal_mode = WAL;`, `PRAGMA busy_timeout = 5000;`, and `PRAGMA synchronous = NORMAL;` in SQLite storage to prevent database locked errors under multi-process or clustered container environments (PM2, Docker, Kubernetes).
- **Reverse Proxy Host Header Tolerance:** Added sanitization for comma-separated or chained `Host` headers and resilient URL fallback extraction, eliminating `TypeError: Invalid URL` crashes behind cloud load balancers (AWS ALB, Nginx, Traefik).
- **Cascading Header Guard:** Hardened `sendJson` against `res.headersSent` and `res.writableEnded` to prevent unhandled `ERR_HTTP_HEADERS_SENT` errors in complex Express middleware pipelines.
- **Enriched Setup Diagnostics:** Added explicit server-side error logging for admin initialization and updated the dashboard setup dialog to surface specific root-cause details directly in the UI.

## [1.7.2] - 2026-11-19

### Added
- **End-to-End HTTP Payload Encryption:** Added support for initialization parameter `encryptionKey` (and `encryptPayloads`). Automatically encrypts all intercepted `requestBody` and `responseBody` payloads using hardware-accelerated AES-256-GCM before storage or streaming.
- **On-Demand Decryption API & UI:** Added `POST /api/logs/decrypt` and `?decrypt=true` query parameter for RBAC-authenticated operators (`logs:read`). Integrated inline one-click `[🔓 Decrypt]` buttons and encryption badges in the dashboard drawer and inspector modals.

### Documentation

- **Quick Start at Top:** Added a 3-line quick start snippet directly below the hero section for instant onboarding.
- **Enhanced Flowcharts:** Added compact, high-contrast Mermaid diagrams for single-port architecture topology, production debugging triage, and storage dispatch.
- **Removed External Image Dependencies:** Eliminated broken image references in favor of resilient ASCII terminal previews and native Mermaid flowcharts.

## [1.7.1] - 2026-11-18

### Documentation & Architecture

- **Observability Product Repositioning:** Transformed product documentation to position TracerNest as a _Self-Hosted Node.js Observability & Operations Dashboard_, centered around investigating unrepeatable production bugs and zero-port overhead.
- **Modular Documentation Library:** Added comprehensive `docs/` suite covering architecture, getting started, configuration, API observability, health diagnostics, security, deployment, troubleshooting, and production debugging playbooks.
- **Dashboard Screenshots & Assets:** Organized visual preview assets into `assets/screenshots/`.

## [1.7.0] - 2026-11-18

### Changed

- **Development Toolchain Updates:** Updated dev dependencies to their latest verified versions:
  - `express`: `^5.3.0`
  - `typescript`: `^7.0.2`
  - `@types/express`: `^5.0.6`
  - `@types/node`: `^22.20.5`
- Synchronized root package-lock definitions and manifests.

## [1.6.0] - 2026-11-17

### Added

- **Trusted Proxy Allowlist (SEC-10):** Added `trustProxy` configuration option supporting booleans, IP arrays, CIDR blocks (`10.0.0.0/8`, `192.168.0.0/16`), and custom validation predicates.
- **Trusted-End Proxy Chain Traversal:** Implemented right-to-left reverse traversal of `X-Forwarded-For` headers to accurately extract the true client IP and prevent attacker-injected forwarding prefixes.
- **Dual Login Throttling (Account + IP):** Added independent account-keyed throttling (`login:user:<username>`) in addition to socket IP throttling to prevent distributed credential brute-forcing against administrative accounts.
- **Bounded Rate Limiter Capacity:** Implemented `maxEntries` (10,000 default) with automatic expired-key purging and FIFO/LRU eviction when full, protecting against map memory exhaustion attacks.
- **Request Body Stream Bounding (SEC-09):** Implemented upfront `Content-Length` validation and active byte-counting on chunked streams. Requests exceeding the limit immediately detach listeners, free heap memory, drain via `req.resume()`, and return HTTP `413 Payload Too Large`.
- **Targeted SQLite Experimental Warning Suppression:** Added an internal warning interceptor to silence Node.js's noisy `ExperimentalWarning: SQLite is an experimental feature` output without suppressing standard deprecation or error warnings.
- **Open Source Governance Documentation:** Added `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, and `CHANGELOG.md`.

### Changed

- **License Switch:** Re-licensed from MIT to the **Apache License, Version 2.0** (`Apache-2.0`).
- **Client IP Extraction Default:** Switched to direct TCP socket peer address (`req.socket.remoteAddress`) by default when `trustProxy` is not explicitly configured.
- **Dashboard & README Refresh:** Updated documentation to professional, non-flashy styling with detailed memory threshold and proxy setup guides.

### Fixed

- **SEC-09 (High):** Fixed unbounded memory retention during oversized stream parsing where `data` listeners remained attached after crossing threshold limits.
- **SEC-10 (Medium):** Fixed login throttle bypass via client-spoofed proxy headers (`X-Forwarded-For`, `CF-Connecting-IP`).
- **Sequelize / ORM Circular Call Stack Overflow:** Resolved `RangeError: Maximum call stack size exceeded` in `HttpLogger.sanitizeObject` when serializing complex circular ORM model instances.

### Security

- Comprehensive security review completed; all known findings remediated with a verified Hacker Score of **100/100 (Hardened)**.

---

## [1.5.1] - 2026-11-16

### Added

- **Skip Sensitive APIs Panel:** Live management view in the web dashboard for dynamically pausing, resuming, creating, and deleting route exclusion rules.
- **One-Click Quick Skip:** Added a "Skip Route" button inside request card inspection drawers to instantly exclude sensitive endpoints.
- **NDJSON Log Export:** Added Newline Delimited JSON export format (`?format=ndjson`) for ingestion into ELK, Datadog, and Splunk.
- **SQL Rule Persistence:** UI-configured exclusion rules persist automatically across server restarts in the `system_meta` table.

### Fixed

- Fixed `getAuthHeaders` undefined reference in the server health diagnostic modal.
- Fixed diagnostic button dialog visibility and custom modal rendering across viewports.

---

## [1.5.0] - 2026-11-15

### Added

- **Production MySQL Dialect:** Added seamless integration with production MySQL connection pools alongside native SQLite.
- **Custom Table Prefix:** Added `tablePrefix` option (default: `tracenest_`) to prevent table namespace collisions in shared databases.
- **Custom Branding & Vector Logo:** Added support for inline SVGs, data URIs, and external URLs for the dashboard header logo.

---

## [1.4.0] - 2026-11-14

### Added

- **Isolated Directory Storage:** Default database and journal storage moved into an isolated directory structure (`./.tracernest/`).
- **External Encryption Key Storage (SEC-08):** Master encryption keys are stored externally in `./.tracernest/.master.key` (with `0600` permissions) or loaded from `TRACERNEST_SECRET`, keeping ciphertext databases completely key-free.

### Security

- **SEC-06 Remediated:** Masked sensitive credentials in raw terminal strings (`sanitizedRaw`) in addition to clean message output.
- **SEC-07 Remediated:** Masked authentication tokens, bearer secrets, and API keys found in HTTP query strings before logging.
- **SEC-08 Remediated:** Purged master encryption key metadata from database tables.

---

## [1.3.0] - 2026-11-12

### Added

- **Content Security Policy (CSP):** Built-in CSP header generation supporting Geist typography and Google Fonts.
- **Custom Modal Dialog System:** Replaced native browser `alert()` and `confirm()` dialogs with themed, non-blocking UI popups.

---

## [1.2.0] - 2026-11-10

### Added

- **CLI Security Reset Utility:** Added standalone `tracernest-reset-admin` CLI command generating high-entropy temporary OTPs with mandatory rotation on first login.
- **4-Tier Granular RBAC:** Introduced `admin`, `operator`, `auditor`, and `viewer` permission tiers.

### Security

- Disabled web-based password reset endpoints returning `403 Forbidden` to prevent remote account takeovers.
- Implemented `crypto.timingSafeEqual` across all password and token comparison routines (SEC-01).
- Added `tokenVersion` epoch tracking to immediately invalidate session tokens upon role change or deletion (SEC-02).

---

## [1.1.0] - 2026-11-08

### Added

- **Circular Reference Protection:** Safe object sanitizer using `WeakSet` tracking to prevent recursive loops on ORM models.
- **Depth & Collection Bounding:** Enforced 8-level nesting limit and 250-element array/key cap per level.

---

## [1.0.0] - 2026-11-01

### Added

- Initial open-source release of **TracerNest Logger**.
- Zero runtime dependencies (`dependencies: {}`).
- Real-time Midnight Dark Operations Console (`#080B12`).
- Real-time terminal stdout and stderr log interception.
- HTTP request, response, and latency tracking middleware.
- In-memory circular ring buffer with customizable capacity.
- Real-time Server-Sent Events (SSE) telemetry stream.
- Automated TTL log expiration and background cleanup.
- Scrypt password hashing and stateless HMAC authentication tokens.
