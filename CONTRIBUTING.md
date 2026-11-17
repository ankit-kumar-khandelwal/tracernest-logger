# Contributing to TracerNest Logger

Thank you for your interest in contributing to **TracerNest Logger**! Open-source contributions from the community help make TracerNest faster, more secure, and more reliable for everyone.

By contributing to this repository, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

---

## Non-Negotiable Core Principle: Zero Runtime Dependencies

`tracernest-logger` has an absolute constraint: **`dependencies: {}`**.

- **No external runtime dependencies** may be added to `package.json`.
- All features must rely exclusively on native Node.js built-in modules (`node:crypto`, `node:fs`, `node:http`, `node:path`, `node:sqlite`, `node:events`, `node:os`, `node:stream`, etc.).
- Dev dependencies (such as `@types/*`, `typescript`, and `express` for tests) are permitted for compilation and testing only.
- Pull requests introducing third-party runtime dependencies will not be accepted.

---

## Development Setup

### Prerequisites

- **Node.js**: Version `18.0.0` or higher (Node 20+ LTS or 22+ recommended).
- **npm**: Version `9.0.0` or higher.
- **Git**

### Clone & Install

1. Fork the repository on GitHub and clone your fork locally:
   ```bash
   git clone https://github.com/<your-username>/tracernest-logger.git
   cd tracernest-logger
   ```

2. Install dev dependencies:
   ```bash
   npm install
   ```

3. Build the TypeScript source:
   ```bash
   npm run build
   ```

4. Run the test suite:
   ```bash
   npm test
   ```

---

## Available Scripts

| Script | Purpose |
| :----- | :------ |
| `npm run build` | Compiles TypeScript source from `src/` to `dist/`. |
| `npm run watch` | Runs `tsc -w` to automatically compile changes on file save. |
| `npm test` | Runs the automated test suite via native `node --test`. |
| `npm run prepublishOnly` | Full build and test verification pipeline executed prior to publishing. |
| `npm run demo` | Compiles and starts the interactive demo application (`dist/demo.js`). |

---

## Development Workflow & Coding Standards

### 1. Branching
- Create a feature or bugfix branch branching off `main`:
  ```bash
  git checkout -b fix/issue-description
  # or
  git checkout -b feat/new-feature
  ```

### 2. Code Quality & Security Guidelines
- **Type Safety:** Always enable strict TypeScript typing (`strict: true`). Avoid using `any` unless interacting with dynamic framework payloads.
- **Stream Safety:** When consuming incoming HTTP streams, always enforce size bounds, error listeners, and proper listener cleanup to avoid memory leaks.
- **Sensitive Data Handling:** Never log raw passwords, authorization tokens, or encryption keys. Route payloads through `Sanitizer.redactSensitive()`.
- **Resource Cleanup:** Background timers, rate limiter cleanup intervals, and file watchers must implement `.unref()` and a `.destroy()` lifecycle method to allow Node processes to exit gracefully.

### 3. Writing Tests
Every feature addition or bug fix **must** be accompanied by automated tests:
- **Unit tests:** Placed in `src/tests/logvault.test.ts` for standalone modules (sanitizer, crypto, rate limiter, TTL, ring buffer).
- **Integration tests:** Placed in `src/tests/integration.test.ts` for end-to-end HTTP request interception, authentication, RBAC, and storage tests.
- Run tests locally with `npm test` before pushing.

---

## Submitting a Pull Request (PR)

1. **Keep PRs Focused:** Submit one PR per logical bug fix or feature. Avoid bundling unrelated refactorings or cosmetic changes into a single PR.
2. **Verify Pre-Publish Checks:** Ensure the full pipeline passes:
   ```bash
   npm run prepublishOnly
   ```
3. **Commit Messages:** Write clear, concise commit messages following standard conventions:
   - `fix: prevent memory leak in request body streaming`
   - `feat: add custom regex exclusion rule support`
   - `docs: update trusted proxy configuration examples`
4. **Open Pull Request:** Push your branch to GitHub and open a PR against `main`. Provide a descriptive summary of your changes, referencing any relevant issue numbers.

---

## Community & Questions

If you have questions, encounter a bug, or want to propose a new feature, feel free to open a [GitHub Issue](https://github.com/tracernest/tracernest-logger/issues) or reach out to `contact@tracernest.dev`.

