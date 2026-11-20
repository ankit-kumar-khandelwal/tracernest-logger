# Production Deployment Guide

TracerNest is designed to integrate into modern Node.js deployment topologies with zero extra operational baggage.

---

## Deployment Architectures

### 1. Single-Instance / Monolith Deployment
In standard VPS, single Docker container, or small VM environments:
- Use the default embedded SQLite engine (`dataDir: './.tracernest'`).
- Ensure the `./.tracernest` directory is mapped to a persistent Docker volume so telemetry survives container restarts.
- The dashboard is accessible directly through your primary domain (`https://api.example.com/tracernest`).

### 2. Multi-Container / Kubernetes / Auto-Scaled Deployments
In horizontal auto-scaled environments (Kubernetes, AWS ECS, Google Cloud Run) where multiple pods/containers run simultaneously:
- **Storage Selection:** Switch dialect to **MySQL** (`dialect: 'mysql'`) pointing to an Amazon RDS, Google Cloud SQL, or managed MySQL cluster.
- **Shared Telemetry Database:** All running instances write logs and read user records from the central database.
- **Mandatory Master Key in Initialization:** You **MUST** pass a persistent `masterKey` in the `TracerNestLogger` constructor options. In containers, file systems are ephemeral; passing `masterKey` directly during initialization guarantees it persists whenever containers are recreated newly and ensures all instances share the identical key to decrypt records and verify sessions.
- **Sticky Sessions for SSE (Optional):** If streaming live logs across auto-scaled instances, enable sticky sessions (cookie-based affinity) on your ingress/load-balancer so browser SSE streams remain attached to an active pod.

---

## Reverse Proxy Configurations

### Nginx Configuration

```nginx
server {
    listen 443 ssl http2;
    server_name api.example.com;

    # SSL certificates...

    # Standard Application Traffic
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # TracerNest Dashboard with Server-Sent Events (SSE) support
    location /tracernest {
        # Optional: Restrict to internal corporate VPN
        # allow 10.0.0.0/8;
        # deny all;

        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Critical for SSE live log streaming:
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding on;
    }
}
```

---

## Dockerfile & Volume Example

```dockerfile
FROM node:22-alpine
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .
RUN npm run build

# Create data directory with write permissions for persistent SQLite
RUN mkdir -p /app/.tracernest && chown -R node:node /app/.tracernest
VOLUME ["/app/.tracernest"]

USER node
EXPOSE 3000

CMD ["node", "dist/server.js"]
```

---

## Graceful Shutdown Management

Node.js servers in cloud environments receive termination signals (`SIGTERM` on Kubernetes pod deletion, `SIGINT` on Ctrl+C). Abruptly killing the process risks truncating active SQL writes or dropping in-flight requests.

TracerNest includes a built-in **Graceful Shutdown Manager**:
- Automatically intercepts `SIGTERM` and `SIGINT` signals.
- Halts incoming HTTP logger interception.
- Drains active Server-Sent Events (SSE) connections with a clean termination event.
- Closes the active SQLite / MySQL connection pool.
- Invokes host server `server.close()` to allow in-flight HTTP requests to complete.
- Implements an automated timeout safeguard (10 seconds default) before forcing process exit.

```typescript
const tracer = new TracerNestLogger({
  gracefulShutdown: {
    timeoutMs: 10000,
    onShutdown: async () => {
      console.log('Performing custom application cleanup...');
    }
  }
});
```

