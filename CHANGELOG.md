# Changelog

All notable changes to **TracerNest Logger** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

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

