# Troubleshooting & Common Issues

This guide addresses frequent operational questions and edge cases encountered when running TracerNest.

---

## 1. High Memory Safeguard Warning

### Symptom
On application startup, you observe a warning in your terminal:
```text
[TracerNest WARNING] bufferSize (150000) exceeds recommended memory threshold (100,000).
High buffer allocation may cause unexpected heap pressure or OOM conditions under heavy traffic.
```

### Cause
`bufferSize` specifies how many log entries TracerNest retains in memory in its circular ring buffer. Setting this value above 100,000 entries can consume hundreds of megabytes of RAM depending on average log payload size.

### Resolution
Lower `bufferSize` to a recommended range (5,000 to 20,000 entries):
```typescript
const tracer = new TracerNestLogger({
  bufferSize: 10000 // Recommended standard capacity
});
```

---

## 2. Missing Request or Response Bodies

### Symptom
HTTP request or response bodies show `undefined` or empty `{}` in the dashboard log viewer.

### Causes & Fixes
1. **Middleware Ordering:** If `tracer.middleware()` is registered *after* application routes, incoming requests reach route handlers before TracerNest can intercept the readable stream.
   *Fix:* Register `app.use(tracer.middleware())` near the top of your Express app setup.
2. **Excluded Routes:** The route matches an entry in `excludeRoutes` or a dynamically configured UI exclusion rule.
   *Fix:* Check **Settings > Excluded Routes** in the dashboard.
3. **Payload Exceeded Limit:** If the body exceeds 512 KB, TracerNest truncates the body to preserve memory.
   *Fix:* Increase `maxHttpBodyBytes` if necessary (e.g., `maxHttpBodyBytes: 1048576` for 1 MB).

---

## 3. Real Client IP Shows `127.0.0.1` Behind Reverse Proxy

### Symptom
All incoming logs display the client IP as `127.0.0.1` or the internal proxy IP address.

### Cause
By default, TracerNest prioritizes security (SEC-10) and only reads the direct socket peer address (`req.socket.remoteAddress`) unless `trustProxy` is configured.

### Resolution
Configure `trustProxy` to tell TracerNest that your reverse proxy is trusted to forward client headers:
```typescript
const tracer = new TracerNestLogger({
  trustProxy: true // or supply specific proxy CIDR: ['10.0.0.0/8']
});
```

---

## 4. Emergency Administrator Password Reset

### Symptom
The administrator forgot their password, or access to the dashboard is locked out.

### Resolution
TracerNest includes a built-in CLI recovery utility. Run it from your project root inside your terminal:

```bash
npx tracernest-reset-admin
```
or
```bash
node ./node_modules/tracernest-logger/dist/bin/reset-admin.js
```

The CLI tool will prompt you for a new administrator password and update the encrypted credentials directly in the local SQLite/MySQL store.

---

## 5. Live SSE Logs Stalling Behind Nginx

### Symptom
Logs do not update in real-time until the browser page is manually refreshed.

### Cause
Nginx or your load balancer is buffering the HTTP response chunks instead of streaming them immediately to the browser client.

### Resolution
Ensure your Nginx configuration disables buffering for the TracerNest path:
```nginx
location /tracernest {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Connection '';
    proxy_buffering off;
    proxy_cache off;
    chunked_transfer_encoding on;
}
```

---

## 6. HTTP 500 Error During First-Time Setup / CORS Rejection

### Symptom
Submitting the setup form (`POST /api/tracernest/api/auth/setup` or `POST /tracernest/api/auth/setup`) fails with HTTP 500 when accessing the dashboard via an IP address (e.g. AWS Elastic IP `https://65.0.109.218/api/tracernest`).

### Cause
If `app.use(tracer.middleware())` is registered **after** your application's `app.use(cors(corsOptions))` middleware, any request originating from an origin not explicitly listed in your CORS whitelist (such as your server's public IP) throws a CORS error (`Origin is not allowed by CORS`), which Express routes to your global error handler and responds with HTTP 500.

### Resolution
1. **Mount TracerNest FIRST**: Move `app.use(tracer.middleware())` above `app.use(cors(...))` and all route handlers.
2. **Whitelist the Host IP**: If you must run CORS first, add your server's host IP (e.g. `https://65.0.109.218` and `http://65.0.109.218`) to your CORS `allowedOrigins` list.
3. **Use Startup Pre-Seeding**: Alternatively, configure `initialAdmin: { username: 'admin', password: '...' }` in your `TracerNestLogger` options to completely eliminate the web setup step.

