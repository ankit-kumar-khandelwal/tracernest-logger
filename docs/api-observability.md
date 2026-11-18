# API Request and Response Observability

Production issues often stem from unexpected input payloads or unexpected downstream response states. Standard access logs (`morgan`, Nginx) record the URL and status code, but omit the request body, headers, and response payload.

TracerNest's HTTP observability layer captures complete, actionable API execution context while strictly sanitizing sensitive data.

---

## What Gets Captured per Request

For every incoming HTTP request passing through `tracer.middleware()`, TracerNest records:

1. **HTTP Method & URL:** `GET`, `POST`, `PUT`, `DELETE`, `PATCH`, etc.
2. **Sanitized Path & Query:** Query parameters are stripped of passwords, tokens, API keys, and authorization codes (SEC-07).
3. **Execution Timing:** Exact duration from request arrival to response completion (`durationMs`).
4. **HTTP Status Code:** Full status code (e.g., `200`, `201`, `400`, `404`, `500`).
5. **Client IP Address:** Resolved safely using direct socket address or trusted proxy reverse traversal (SEC-10).
6. **Sanitized Request Headers:** Redacts `Authorization`, `Cookie`, `X-Api-Key`, `Set-Cookie`, and custom configured headers.
7. **Request Payload (Body):** Captures incoming JSON payloads up to 512 KB, with recursive secret masking and circular reference protection.
8. **Response Payload (Body):** Captures JSON response bodies produced by `res.json()`, `res.send()`, or native `res.write()`/`res.end()`.

---

## Safe Body Sanitization & ORM Support

Many Node.js applications use Object-Relational Mappers (ORMs) such as Sequelize, Mongoose, TypeORM, or Prisma. When serializing ORM model instances or complex business graphs, objects often contain **circular references** (e.g., `User.orders[0].user`).

Passing circular objects to naive serializers triggers:
```text
RangeError: Maximum call stack size exceeded
```

### TracerNest's Defensive Serialization Pipeline
TracerNest implements a multi-layer recursive sanitizer:
- **Circular Reference Tracking:** Uses a `WeakSet` to track visited object references across recursive traversal. If an object is revisited, TracerNest replaces it with `"[Circular]"`, preventing call stack exhaustion.
- **Maximum Depth Cap:** Recursion is strictly capped at a depth of 8 levels.
- **Object Key Bounds:** Scans at most 250 keys per object level.
- **Array Length Bounds:** Scans at most 250 items per array.
- **Fail-Safe Fallback:** If any unexpected error occurs during object traversal, TracerNest catches the exception, converts the object to a string, applies regex sanitization, and continues without interrupting the host application.

---

## Query String Parameter Redaction (SEC-07)

Tokens and credentials accidentally passed in query strings are dangerous because they frequently leak into web server access logs.

TracerNest automatically redacts sensitive query parameters before storing or displaying URLs:
```text
Original:   /api/auth/callback?code=xyz987&state=admin&token=eyJh...
Captured:   /api/auth/callback?code=[REDACTED]&state=admin&token=[REDACTED]
```

Parameters containing `token`, `secret`, `key`, `password`, `auth`, `code`, `sig`, `signature`, `credential`, `jwt`, `apikey`, `cvv`, or `pin` are automatically replaced with `[REDACTED]`.

---

## Excluding High-Frequency & Sensitive Routes

In high-traffic applications, logging every automated health probe (`/healthz`, `/metrics`, static assets) consumes memory and clutters the dashboard.

TracerNest provides two ways to exclude routes:

### 1. Code-Based Exclusion (`excludeRoutes`)

```typescript
const tracer = new TracerNestLogger({
  excludeRoutes: [
    // A. Exact path or prefix string
    '/healthz',
    '/static/',

    // B. Glob wildcard
    '/assets/**',
    '/public/*',

    // C. Regular expression
    /^\/api\/v1\/internal\//,

    // D. Object rule with method filter
    { path: '/api/auth/login', method: 'POST' },

    // E. Custom predicate function
    (req) => req.headers['x-internal-probe'] === 'true'
  ]
});
```

### 2. Live Dynamic Exclusion via the Dashboard

Operators with `routes:manage` permissions can add, toggle, or delete route exclusion rules directly from the dashboard UI without redeploying application code.

- Navigate to **Settings > Excluded Routes**.
- Specify the path pattern (e.g., `/api/webhooks/*`) and HTTP method.
- The rule is persisted in the database and applied immediately to the running HTTP logger.

