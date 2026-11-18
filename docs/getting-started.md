# Getting Started with TracerNest

This guide walks you through installing, configuring, and verifying TracerNest in your Node.js application.

---

## 1. Prerequisites

- **Node.js:** `>= 18.0.0` (Supports Node 18, 20, 22+)
- **Operating Systems:** Linux, macOS, Windows
- **Frameworks Supported:** Express (`>= 4.0.0`), Fastify, Connect, or native Node.js `http.Server`

---

## 2. Installation

Install TracerNest into your application via npm:

```bash
npm install tracernest-logger
```

*Note: TracerNest maintains strictly **zero runtime dependencies**. Installing `tracernest-logger` adds zero third-party packages to your `node_modules` production bundle.*

---

## 3. Integration Patterns

### A. Express.js Integration (Recommended)

Mount TracerNest using standard Express middleware. The dashboard and API interception will automatically route through your existing Express application.

```typescript
import express from 'express';
import { TracerNestLogger } from 'tracernest-logger';

const app = express();
const PORT = process.env.PORT || 3000;

// Upstream body parsers (optional, TracerNest natively captures bodies even without them)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize TracerNest Logger
const tracer = new TracerNestLogger({
  path: '/tracernest',              // Dashboard route path
  title: 'Production API Monitor',  // Custom dashboard title
  bufferSize: 5000,                 // In-memory circular buffer capacity
  dataDir: './.tracernest'          // Encrypted SQLite and master key directory
});

// Register TracerNest middleware
// Must be registered before your application routes to intercept requests!
app.use(tracer.middleware());

// Application Routes
app.get('/api/users', (req, res) => {
  console.log('[API] Querying active user list');
  res.json([
    { id: 'usr_1', name: 'Alice', role: 'engineer' },
    { id: 'usr_2', name: 'Bob', role: 'architect' }
  ]);
});

app.post('/api/orders', (req, res) => {
  console.warn('[Orders] Processing new order checkout');
  res.status(201).json({ status: 'created', orderId: 'ord_98231' });
});

// Start Server
const server = app.listen(PORT, () => {
  console.log(`Application running at http://localhost:${PORT}`);
  console.log(`TracerNest Dashboard available at http://localhost:${PORT}/tracernest`);
});
```

---

### B. Fastify Integration

Fastify utilizes a plugin architecture. Use Fastify's `use()` hook or route handler to bridge TracerNest:

```typescript
import Fastify from 'fastify';
import { TracerNestLogger } from 'tracernest-logger';

const fastify = Fastify({ logger: false });
const tracer = new TracerNestLogger({ path: '/tracernest' });

// Fastify raw request hook
fastify.addHook('onRequest', async (req, reply) => {
  const handled = await tracer.handleRequest(req.raw, reply.raw);
  if (handled) {
    reply.hijack(); // Handled internally by TracerNest
  }
});

// Route
fastify.get('/api/ping', async () => {
  return { status: 'pong' };
});

fastify.listen({ port: 3000 }, (err) => {
  if (err) throw err;
  console.log('Fastify server listening on http://localhost:3000/tracernest');
});
```

---

### C. Native Node.js `http.Server` Integration

Attach TracerNest directly to an existing native HTTP server instance:

```typescript
import { createServer } from 'node:http';
import { TracerNestLogger } from 'tracernest-logger';

const tracer = new TracerNestLogger({ path: '/tracernest' });

const server = createServer(async (req, res) => {
  // Let TracerNest handle dashboard routes
  const handled = await tracer.handleRequest(req, res);
  if (handled) return;

  // Custom application logic
  if (req.url === '/api/hello') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Hello from native HTTP!' }));
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

// Optional: Attach automatic shutdown and server listener management
tracer.attach(server);

server.listen(3000, () => {
  console.log('Server running at http://localhost:3000/tracernest');
});
```

---

### D. Dedicated Standalone Port (Optional)

If your architecture requires isolating the operations console onto an internal network port:

```typescript
import { TracerNestLogger } from 'tracernest-logger';

const tracer = new TracerNestLogger({ path: '/tracernest' });

// Starts a dedicated internal HTTP server on port 8001
tracer.listen(8001, '127.0.0.1', () => {
  console.log('TracerNest standalone dashboard listening at http://127.0.0.1:8001/tracernest');
});
```

---

## 4. Initial Administrator Setup

1. Open your browser and navigate to `http://localhost:3000/tracernest`.
2. When launching for the first time with an empty database, TracerNest displays the **Root Administrator Onboarding** dialog.
3. Configure:
   - **Full Name:** Operator name.
   - **Username:** Administrative account username.
   - **Password:** Strong password (minimum 8 characters).
4. Click **Create Administrator Account**.
5. Once authenticated, the dashboard will open immediately to the live log stream.

---

## 5. Verification Checklist

To verify your installation:

1. **Verify Live Log Interception:**
   Run a `console.log('Test log message')` in your application. Observe the log line appear in real time on the dashboard.
2. **Verify HTTP Request/Response Capture:**
   Send an HTTP request via `curl`:
   ```bash
   curl -X POST http://localhost:3000/api/orders \
     -H "Content-Type: application/json" \
     -d '{"item":"Widget","qty":2}'
   ```
   Check the dashboard to see the HTTP entry, status code `201`, duration in milliseconds, client IP, request body, and response payload.
3. **Verify Health Check:**
   Click the **Health: OK** indicator in the dashboard topbar to execute an authenticated server health diagnostic.

