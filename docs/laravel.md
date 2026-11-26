# Laravel 13 Telemetry & Observability Integration

TracerNest provides native, first-class telemetry observability and real-time flight recording for **Laravel 13** (as well as Laravel 12 and 11).

> [!IMPORTANT]
> **NO EXTRA PORTS REQUIRED**: TracerNest mounts directly inside your existing Laravel application on the **exact same port** (e.g. `http://localhost:8000/tracernest` or `https://myapp.com/tracernest`). **No extra ports, second servers, background daemons, or cloud subscriptions are required.**

---

## 🏛️ Architecture & Topology (Zero Port Overhead)

In Laravel 13, TracerNest integrates directly into Laravel's HTTP pipeline and shared database connection. Incoming API traffic is intercepted by `TracerNestMiddleware`, while dashboard requests to `/tracernest` are served directly by `TracerNestController` on the exact same HTTP port:

```text
+-----------------------------------------------------------------------------------+
|                        Client Browser / Mobile App / API                          |
+-----------------------------------------------------------------------------------+
                                         │
                                         ▼ [Single Application Port: e.g. 8000 / 443]
+───────────────────────────────────────────────────────────────────────────────────+
| Laravel 13 Application Runtime (PHP 8.2+ / Octane / FrankenPHP / Nginx)           |
|                                                                                   |
|  ┌─────────────────────────────────────────────────────────────────────────────┐  |
|  │ Laravel Router                                                              │  |
|  └───────┬─────────────────────────────────────────────────────────────┬───────┘  |
|          │                                                             │          |
|          ▼ [Standard API & Web Routes]                                 ▼ [/tracernest/*]
|  ┌────────────────────────────────────────┐       ┌────────────────────────────┐  |
|  │ TracerNestMiddleware                   │       │ TracerNestController       │  |
|  │ • Intercepts Method, URL, Status       │       │ • Serves Embedded SPA UI   │  |
|  │ • Captures Duration (0.01ms precision) │       │ • Streams Real-time SSE    │  |
|  │ • Redacts Passwords, Tokens & Cards    │       │ • Executes Filter Queries  │  |
|  │ • Respects Body Size & Excluded Routes │       │ • Authenticates Operators  │  |
|  └───────────────────┬────────────────────┘       └────────────┬───────────────┘  |
|                      │                                         │                  |
|                      ▼                                         ▼                  |
|  ┌─────────────────────────────────────────────────────────────────────────────┐  |
|  │ Shared Database Connection (Laravel DB::connection())                       │  |
|  │ Table: tracenest_logs (Zero Network Overhead / 0ms Direct Insert)           │  |
|  └─────────────────────────────────────────────────────────────────────────────┘  |
+───────────────────────────────────────────────────────────────────────────────────+
```

---

## ⚡ Quick Start: 3 Simple Steps

### Step 1: Install TracerNest in Your Laravel Project

Every Laravel project includes a root `package.json` for frontend assets (Vite/Tailwind). Run in your Laravel root directory:

```bash
npm install tracernest-logger
```

*(This downloads the pre-built, zero-dependency TracerNest single-page dashboard and PHP bridge files into `node_modules/tracernest-logger/`).*

---

### Step 2: Copy the Integration Bridge Files

Copy the bridge files into your Laravel `app/` and `config/` directories:

```bash
# 1. Copy Telemetry Middleware
mkdir -p app/Http/Middleware
cp node_modules/tracernest-logger/integrations/laravel/TracerNestMiddleware.php app/Http/Middleware/

# 2. Copy Telemetry Controller
mkdir -p app/Http/Controllers
cp node_modules/tracernest-logger/integrations/laravel/TracerNestController.php app/Http/Controllers/

# 3. Copy Configuration File
cp node_modules/tracernest-logger/integrations/laravel/tracernest.php config/
```

---

### Step 3: Register in Laravel 13

#### A. Mount Dashboard Routes in `routes/web.php`
Add **one line** to `routes/web.php`:

```php
use Illuminate\Support\Facades\Route;

// Mount TracerNest Dashboard directly on your existing Laravel port
require base_path('node_modules/tracernest-logger/integrations/laravel/routes.php');
```

#### B. Register Middleware in `bootstrap/app.php`
In Laravel 13, global middleware is registered inside `bootstrap/app.php`:

```php
// bootstrap/app.php
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        // Automatically capture incoming HTTP requests, response payloads & durations
        $middleware->append(\App\Http\Middleware\TracerNestMiddleware::class);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        //
    })->create();
```

---

### Step 4: Open Your Dashboard

Start your Laravel server as usual:

```bash
php artisan serve
```
*(Or access via Laravel Herd, Docker, FrankenPHP, Laravel Octane, or Nginx).*

Navigate to:
```text
http://localhost:8000/tracernest
```

🎉 **That's it!**
* **Zero new ports opened.**
* **Zero extra background daemons.**
* The first time you visit `/tracernest`, enter an initial administrator username and password to create the master operator account.
* Every HTTP request, error, and response body will stream live in real time.

---

## ⚙️ Configuration & Options Reference

TracerNest provides comprehensive configuration options that can be set either via **Environment Variables (`.env`)** or by customizing **`config/tracernest.php`**.

### Environment Variables (`.env`)

Add any of the following variables to your `.env` file to customize TracerNest behavior:

```ini
# ==============================================================================
# TracerNest Telemetry Configuration for Laravel 13
# ==============================================================================

# Master switch: set to false to completely disable telemetry (e.g. in testing)
TRACERNEST_ENABLED=true

# Storage Mode: 'database' (direct MySQL/SQLite, recommended) or 'http' (remote ingest)
TRACERNEST_MODE=database

# Custom database connection name from config/database.php (null uses default connection)
TRACERNEST_DB_CONNECTION=mysql

# Database table name prefix (default: 'tracenest_')
TRACERNEST_TABLE_PREFIX=tracenest_

# URL path where the dashboard is mounted (default: '/tracernest')
TRACERNEST_PATH=/tracernest

# Master signing & encryption key (defaults to your Laravel APP_KEY)
TRACERNEST_KEY=base64:your-laravel-app-key-here

# Log retention TTL in days (logs older than this are automatically purged, 0 = unlimited)
TRACERNEST_RETENTION_DAYS=30

# Maximum request & response body size captured in bytes (default: 65536 = 64KB)
TRACERNEST_BODY_LIMIT=65536

# Remote ingestion endpoint (only used when TRACERNEST_MODE=http)
TRACERNEST_ENDPOINT=http://127.0.0.1:8001/tracernest
```

---

### Detailed Options Catalog (`config/tracernest.php`)

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `enabled` | `bool` | `true` | Master toggle to enable or disable telemetry capture globally. |
| `mode` | `string` | `'database'` | Telemetry write mode: `'database'` (zero-overhead direct insert) or `'http'` (remote server ingest). |
| `connection` | `string\|null` | `null` | Name of the database connection from `config/database.php` (e.g. `'mysql'`, `'sqlite'`). `null` uses default DB. |
| `table_prefix` | `string` | `'tracenest_'` | Prefix for generated database tables (`tracenest_logs`, `tracenest_users`). |
| `path` | `string` | `'/tracernest'` | URI prefix for the web dashboard on your Laravel server. |
| `key` | `string` | `env('APP_KEY')` | Secret key used for HMAC session tokens and AES-256-GCM payload encryption. |
| `endpoint` | `string` | `'http://127.0.0.1:8001/tracernest'` | Target URL when operating in remote `'http'` mode. |
| `exclude_routes` | `array` | `['/up', '/healthz', ...]` | Array of route paths or wildcard patterns (`'/livewire/*'`) excluded from telemetry capture. |
| `sanitize_fields`| `array` | `['password', 'token', ...]` | Array of JSON and query parameter keys masked with `••••••••••••` before saving. |
| `body_size_limit`| `int` | `65536` (64 KB) | Byte limit for request and response body storage to protect database and RAM overhead. |
| `retention_days` | `int` | `30` | Number of days to retain logs before automated expiration (`expires_at`). |

---

### Customizing Excluded Routes & Sensitive Data Redaction

In `config/tracernest.php`, you can customize route exclusions and parameters to redact:

```php
// config/tracernest.php

return [
    // ...
    
    // Exclude health probes, internal routes, and high-frequency polling from telemetry:
    'exclude_routes' => [
        '/up',                      // Laravel 11/12/13 health endpoint
        '/healthz',                 // Kubernetes liveness probe
        '/livewire/update',         // Livewire AJAX updates
        '/sanctum/csrf-cookie',     // CSRF initialization
        '/horizon/*',               // Laravel Horizon dashboard
        '/telescope/*',             // Laravel Telescope
    ],

    // Automatically mask sensitive keys in request payloads & query strings:
    'sanitize_fields' => [
        'password',
        'password_confirmation',
        'current_password',
        'secret',
        'token',
        'api_key',
        'access_token',
        'refresh_token',
        'authorization',
        'credit_card',
        'card_number',
        'cvv',
        'cvc',
        'ssn',
    ],
];
```

---

## 📝 Laravel Monolog 3 Logging Integration

To automatically stream standard Laravel logs (`Log::info()`, `Log::error()`, `Log::warning()`) and unhandled PHP exception stack traces directly into TracerNest:

### 1. Copy the Monolog Handler
```bash
mkdir -p app/Logging
cp node_modules/tracernest-logger/integrations/laravel/TracerNestMonologHandler.php app/Logging/
```

### 2. Register the Channel in `config/logging.php`
Add `tracernest` to your logging channels array and append it to your `stack` channel:

```php
// config/logging.php

'channels' => [
    'stack' => [
        'driver' => 'stack',
        'channels' => ['single', 'tracernest'],
        'ignore_exceptions' => false,
    ],

    'tracernest' => [
        'driver' => 'custom',
        'via' => \App\Logging\TracerNestMonologHandler::class,
        'level' => env('LOG_LEVEL', 'debug'),
    ],
    
    // ... other channels
],
```

Now, every log entry written via `Log::error('Order checkout failed', ['order_id' => 123])` is immediately recorded into TracerNest with its full context, channel name, and exception stack trace!

---

## 🚀 Production Deployment & Scaling

### Laravel Octane (FrankenPHP / RoadRunner / Swoole)
TracerNest is fully compatible with **Laravel Octane**. Because `TracerNestMiddleware` measures durations per request using `microtime(true)` and commits directly to the active database connection, it runs non-blockingly without state leakage between Octane worker loops.

### MySQL Database Tuning
For high-traffic production workloads ($> 1,000$ requests/sec):
* TracerNest uses indexed columns (`timestamp`, `level`, `source`) and automatically applies schema optimizations.
* Enable `retention_days` (e.g. `14` or `30`) to keep the `tracenest_logs` table lean and fast.
* You can configure a dedicated read/write database connection via `TRACERNEST_DB_CONNECTION=telemetry_db` to isolate telemetry writes from application business data.

---

## 🔒 Security Best Practices for Laravel Operators

1. **Protect the `/tracernest` Route in Production:**
   You can wrap the routes in `routes/web.php` with an authentication or role-check middleware if desired:
   ```php
   Route::middleware(['web', 'auth', 'can:access-telemetry'])->group(function () {
       require base_path('node_modules/tracernest-logger/integrations/laravel/routes.php');
   });
   ```
2. **Reverse Proxy & Load Balancers:**
   Ensure `TrustProxies` is properly enabled in Laravel (`bootstrap/app.php`) so `TracerNestMiddleware` extracts the true client IP via `X-Forwarded-For` or `CF-Connecting-IP`.
3. **Payload Redaction:**
   Always review `sanitize_fields` in `config/tracernest.php` whenever new payment or PII parameters are added to your application.
