# Application Health & System Diagnostics

TracerNest provides built-in system diagnostics and liveness health checks to help operators monitor the health of the Node.js runtime and host environment.

---

## Dual-Tier Health Check Architecture (SEC-05)

Exposing detailed server internals (Node version, process ID, memory metrics, OS platform) on unauthenticated public endpoints exposes systems to information disclosure and server fingerprinting (CWE-200).

TracerNest addresses this via a **dual-tier health endpoint**:

### 1. Unauthenticated Public Liveness Probe
Requests to `GET /tracernest/api/health` without an authentication token return a minimal status payload suitable for load balancers and Kubernetes liveness probes:

```json
{
  "status": "healthy",
  "uptime": 14285,
  "uptimeFormatted": "3h 58m 5s",
  "timestamp": "2026-11-18T12:00:00.000Z"
}
```
HTTP status returned:
- `200 OK`: When database is connected and error rate is within normal limits.
- `503 Service Unavailable`: When database connection is down or degraded.

### 2. Authenticated Deep Diagnostic Payload
When an authenticated operator or bearer token accesses `GET /tracernest/api/health`, TracerNest delivers comprehensive diagnostics:

```json
{
  "status": "healthy",
  "uptime": 14285,
  "uptimeFormatted": "3h 58m 5s",
  "timestamp": "2026-11-18T12:00:00.000Z",
  "process": {
    "pid": 3884,
    "nodeVersion": "v22.10.0",
    "platform": "win32",
    "arch": "x64"
  },
  "memory": {
    "heapUsedMb": 68.42,
    "heapTotalMb": 112.5,
    "rssMb": 145.2,
    "heapUsagePercent": 61
  },
  "database": {
    "status": "connected",
    "dialect": "sqlite",
    "hasUsers": true
  },
  "logs": {
    "bufferCount": 1240,
    "capacity": 5000,
    "bufferUsagePercent": 25,
    "totalPurged": 450,
    "throughputPerSec": 14.2
  }
}
```

---

## The Dashboard Diagnostic Dialog

The dashboard provides a real-time health indicator in the navigation topbar:
- **Green Dot (`Health: OK`):** System healthy, database connected.
- **Yellow Dot (`Health: DEGRADED`):** Error count exceeds threshold (>500 errors).
- **Red Dot (`Health: UNHEALTHY`):** Storage engine disconnected.

Clicking the health indicator opens the **Server Health & Diagnostic Modal**:
- Real-time memory gauge (heap used, total heap, RSS).
- Live storage engine status.
- Uptime duration counter.
- Process identifier and Node.js runtime version.
- Telemetry buffer utilization and purge counter.
- **Re-run Diagnostics** button to trigger a live probe on demand.

