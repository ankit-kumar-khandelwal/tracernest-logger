import http from 'node:http';
import { TracerNestLogger } from './index';

const PORT = 3000;

// Initialize TracerNestLogger with TTL and automated HTTP Request/Response tracking
const tracerNest = new TracerNestLogger({
  path: '/tracernest-logger',
  title: 'TracerNest-Logger Console',
  bufferSize: 10000,
  redactSensitive: true,
  dataDir: './.tracernest',
  dialect: 'sqlite', // 'sqlite' or 'mysql'
  tablePrefix: 'tracernest_',
  interceptHttp: true, // Automatically logs URL, method, request JSON, response JSON, and latency
  encryptPayloads: true, // Hardware-accelerated AES-256-GCM encryption for request & response bodies
  ttl: {
    defaultTtlSeconds: 86400, // 24 hours default
    sweepIntervalMs: 5000,    // Run purge sweep every 5 seconds for demonstration
    rules: [
      {
        name: 'Auto-delete Health Checks',
        level: 'all',
        pattern: '/healthz',
        ttlSeconds: 10 // Delete /healthz logs after 10 seconds!
      },
      {
        name: 'Short TTL for Debug logs',
        level: 'debug',
        ttlSeconds: 60 // Delete debug logs after 60 seconds
      }
    ]
  }
});

const middleware = tracerNest.middleware();

// Create native zero-dependency HTTP server
const server = http.createServer((req, res) => {
  // Mount TracerNestLogger middleware (Dashboard + HTTP Request/Response Interceptor)
  middleware(req, res, async () => {
    const url = req.url || '/';
    const method = req.method || 'GET';

    // --- Demo Application Routes ---
    if (method === 'GET' && url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`
        <html>
          <body style="font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background:#060911; color:#f8fafc; padding:2.5rem; line-height:1.6;">
            <h2 style="color:#38bdf8;">🚀 Backend Application Running with TracerNest-Logger</h2>
            <p style="color:#94a3b8;">TracerNest-Logger is capturing telemetry logs, HTTP requests, response JSON, and enforcing TTL log policies.</p>
            <p style="margin-top:1.25rem;">
              <a href="/tracernest-logger" style="background:#0284c7; color:#fff; text-decoration:none; padding:0.5rem 1rem; border-radius:6px; font-weight:600; font-size:0.95rem; display:inline-block;">
                Open TracerNest-Logger Dashboard (/tracernest-logger)
              </a>
            </p>

            <div style="margin-top:2rem; background:#0f172a; border:1px solid #1e293b; padding:1.25rem; border-radius:8px; max-width:650px;">
              <h3 style="font-size:1rem; margin-bottom:0.5rem; color:#fff;">Interactive API Test Links:</h3>
              <p><a href="/api/test-order" style="color:#38bdf8; text-decoration:none;">📦 Simulate POST /api/orders (Request & Response JSON logged)</a></p>
              <p><a href="/api/test-login" style="color:#fbbf24; text-decoration:none;">🔑 Simulate POST /api/auth/login (Password auto-redacted in log)</a></p>
              <p><a href="/api/healthz" style="color:#34d399; text-decoration:none;">⏱️ Trigger /healthz (Auto-deleted after 10s by TTL rule)</a></p>
              <p><a href="/api/simulate-error" style="color:#f87171; text-decoration:none;">🚨 Simulate 500 Server Error (Triggers Teams/Email alert)</a></p>
            </div>
          </body>
        </html>
      `);
      return;
    }

    // Simulates an API order with request & response JSON
    if (method === 'POST' && url === '/api/orders') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        let parsed: any = {};
        try { parsed = JSON.parse(body); } catch {}
        const orderId = 'ord_' + Math.floor(Math.random() * 8000 + 1000);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          orderId,
          trackingNumber: 'TRK-' + Math.floor(Math.random() * 90000 + 10000),
          items: parsed.items || ['Enterprise Cloud License (1yr)'],
          total: parsed.total || 499.00
        }));
      });
      return;
    }

    if (method === 'GET' && url === '/api/test-order') {
      try {
        await fetch(`http://127.0.0.1:${PORT}/api/orders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerId: 'cust_882',
            items: ['Pro Subscription x5'],
            total: 250.00
          })
        });
      } catch {}
      res.writeHead(302, { Location: '/tracernest-logger' });
      res.end();
      return;
    }

    // Simulates a login endpoint with sensitive password to prove auto-redaction
    if (method === 'POST' && url === '/api/auth/client-login') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'authenticated',
        userId: 'usr_client_01',
        sessionToken: 'Bearer eyJhbGciOiJIUzI1NiJ9.demoTokenData'
      }));
      return;
    }

    if (method === 'GET' && url === '/api/test-login') {
      try {
        await fetch(`http://127.0.0.1:${PORT}/api/auth/client-login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: 'alice_smith',
            password: 'HighlyConfidentialPassword123!',
            creditCard: '4532-8891-2314-9902'
          })
        });
      } catch {}
      res.writeHead(302, { Location: '/tracernest-logger' });
      res.end();
      return;
    }

    // Health check endpoint that gets purged after 10 seconds via TTL
    if (method === 'GET' && url === '/api/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'healthy', uptime: process.uptime(), timestamp: Date.now() }));
      return;
    }

    // Server error endpoint
    if (method === 'GET' && url === '/api/simulate-error') {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'InternalServerError',
        message: 'Database query timeout while locking row #4492',
        timestamp: Date.now()
      }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'NotFound' }));
  });
});

// Start server
server.listen(PORT, () => {
  tracerNest.shutdownManager.setServer(server);
  console.log('\x1b[34m[SYSTEM]\x1b[0m Server initialized on http://localhost:' + PORT);
  console.log('\x1b[36m[SYSTEM]\x1b[0m TracerNest-Logger Dashboard active at http://localhost:' + PORT + '/tracernest-logger');

  // Background simulator: Emits terminal logs AND real HTTP API requests with Request/Response JSON
  let simCycle = 0;
  setInterval(async () => {
    simCycle++;
    const r = Math.random();

    // 1. Terminal stdout/stderr logs
    if (r < 0.4) {
      console.log(`[INFO] Worker process completed batch queue #${Math.floor(Math.random() * 20)}`);
    } else if (r < 0.7) {
      console.warn(`\x1b[33m[WARN]\x1b[0m Memory threshold warning: buffer reaching ${(Math.random() * 10 + 75).toFixed(1)}% capacity`);
    } else if (r < 0.85) {
      console.error(`\x1b[31m[ERROR]\x1b[0m Failed to reach external payment gateway on attempt #3`);
    }

    // 2. Automated Background HTTP API Traffic (Capturing Request & Response JSON)
    try {
      if (simCycle % 2 === 0) {
        await fetch(`http://127.0.0.1:${PORT}/api/orders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerId: 'cust_' + Math.floor(Math.random() * 900 + 100),
            items: ['Enterprise Cloud Seat x' + Math.floor(Math.random() * 5 + 1), 'Dedicated Load Balancer'],
            total: Math.floor(Math.random() * 500 + 199),
            paymentMethod: 'invoice-net30'
          })
        });
      } else if (simCycle % 3 === 0) {
        await fetch(`http://127.0.0.1:${PORT}/api/auth/client-login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: 'operator_' + Math.floor(Math.random() * 10 + 1),
            password: 'HighlyConfidentialPassword' + Math.floor(Math.random() * 1000),
            apiKey: 'sk_live_' + Math.random().toString(36).substring(2, 12)
          })
        });
      } else if (simCycle % 5 === 0) {
        await fetch(`http://127.0.0.1:${PORT}/api/healthz`);
      }
    } catch {
      // Ignore background simulation fetch errors
    }
  }, 3500);
});
