# Security Policy

The TracerNest team and community take the security and integrity of `tracernest-logger` seriously. Because TracerNest runs inside production Node.js applications and handles telemetry, terminal streams, and operations data, our codebase is designed with defense-in-depth principles.

---

## Supported Versions

Only the latest active minor release receives patches for critical, high, and medium severity security vulnerabilities.

| Version | Supported          |
| :------ | :----------------- |
| `1.7.x` | :white_check_mark: |
| `1.6.x` | :white_check_mark: |
| `< 1.6` | :x:                |

We strongly encourage all operators to upgrade to the latest patch release immediately when a security update is published.

---

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues, discussions, or pull requests.**

If you discover a potential security vulnerability in TracerNest Logger, report it through one of the following private channels:

1. **GitHub Private Security Advisory (Preferred):**  
   Navigate to the repository's [Security Advisories](https://github.com/ankit-kumar-khandelwal/tracernest-logger/security/advisories) tab and click **"Report a vulnerability"**. This creates an isolated, encrypted discussion channel with the maintainers.

2. **Direct Security Email:**  
   Send an encrypted or plain email to: **`security@tracernest.dev`**  
   *(Backup contact: `contact@tracernest.dev`)*

### What to Include in Your Report

To help us triage and resolve the issue quickly, include:
- Description of the vulnerability and its potential impact.
- Affected versions and deployment conditions (e.g., direct-to-app, reverse proxy, standalone HTTP).
- Clear, step-by-step Proof of Concept (PoC) code or synthetic reproduction script.
- Any suggested remediation or defensive mitigation.

### Our Response Timeline

- **Initial Acknowledgment:** Within **24 to 48 hours**.
- **Assessment & Triage:** Within **3 business days**.
- **Fix & Patch Release:** Dependent on severity, typically within **7 business days**.
- **Public Disclosure:** Coordinated after a patched release is published to npm, allowing downstream users sufficient time to upgrade.

---

## Security Architecture & Design Principles

TracerNest Logger is engineered with strict operational constraints:

1. **Zero Runtime Dependencies:**  
   The production package has exactly `dependencies: {}`. By eliminating third-party transitive dependencies, TracerNest is immune to supply-chain attacks, malicious dependency takeovers, and prototype pollution vulnerabilities originating from nested packages.

2. **Isolated Cryptographic Keys:**  
   Master keys for AES-256-GCM data encryption at rest are **never stored inside the SQLite database or SQL dump files**. Keys are loaded from user configuration, `process.env.TRACERNEST_SECRET`, or isolated external key files with restricted `0600` filesystem permissions.

3. **Stream Memory Bounding (SEC-09):**  
   All HTTP body parsing enforces strict size caps (1 MiB default). If an incoming request stream crosses the threshold, data event listeners are detached immediately, the stream is safely drained via `req.resume()`, memory accumulators are freed, and an HTTP `413 Payload Too Large` error is returned.

4. **Trusted Proxy Verification & Dual Throttling (SEC-10):**  
   Client IP extraction defaults strictly to the immediate TCP socket peer. Forwarding headers (`X-Forwarded-For`, `CF-Connecting-IP`, etc.) are only evaluated when the immediate socket connection is confirmed in an explicit `trustProxy` allowlist. Rate limiting enforces both peer IP throttling and account-level throttling with bounded memory eviction (FIFO/LRU).

5. **Automatic PII & Secret Redaction:**  
   Terminal outputs and HTTP logs are automatically scanned with high-performance regular expressions to mask API keys, bearer tokens, JWTs, Luhn-valid credit card numbers, and passwords before being buffered or transmitted.

6. **Timing Attack Protection:**  
   Authentication hashes and stateless session tokens are verified using `crypto.timingSafeEqual` to eliminate timing side-channel attacks.

---

## Security Advisories & CVEs

Historical security reviews, audit reports, and vulnerability remediation disclosures are documented in the [`artifacts/security-review.md`](artifacts/security-review.md) ledger.

