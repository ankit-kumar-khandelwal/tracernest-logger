<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\TracerNestController;

/**
 * TracerNest Telemetry & Operations Dashboard Routes for Laravel 13 / 12 / 11
 *
 * Mounts the complete TracerNest single-port operations suite directly
 * on your existing Laravel server port without opening extra ports.
 *
 * Automatically resolves the route prefix from:
 * 1. config('tracernest.path')
 * 2. Path component of config('tracernest.endpoint') (e.g. 'http://localhost:8000/telemetry' -> 'telemetry')
 * 3. Default fallback: 'tracernest'
 *
 * Usage in routes/web.php:
 *   require base_path('node_modules/tracernest-logger/integrations/laravel/routes.php');
 */

// Automatically scaffold Controller, Middleware, and Config files on runtime and register in Kernel
if (class_exists(\TracerNest\TracerNestInstaller::class)) {
    \TracerNest\TracerNestInstaller::run();
} else {
    $installerPath = __DIR__ . '/TracerNestInstaller.php';
    if (file_exists($installerPath)) {
        require_once $installerPath;
        if (class_exists(\TracerNest\TracerNestInstaller::class)) {
            \TracerNest\TracerNestInstaller::run();
        }
    }
}

$rawPath = config('tracernest.path');
$endpoint = config('tracernest.endpoint');

// If 'tracernest.path' is not explicitly set or is default '/tracernest',
// but 'tracernest.endpoint' is configured with a custom path, synchronize and use the endpoint's path:
if ((empty($rawPath) || $rawPath === '/tracernest') && !empty($endpoint)) {
    $parsedPath = parse_url($endpoint, PHP_URL_PATH);
    if (!empty($parsedPath) && $parsedPath !== '/') {
        $rawPath = $parsedPath;
    }
}

// Fallback to default '/tracernest'
$rawPath = $rawPath ?: '/tracernest';
$pathPrefix = trim($rawPath, '/');

$registerRoutes = function () {
    // 1. Single-Page Application (SPA) Web Dashboard & Direct Auth Views
    // Both '' and '/' are registered to prevent 404s on trailing slash mismatches
    Route::get('', [TracerNestController::class, 'dashboard'])->name('tracernest.dashboard');
    Route::get('/', [TracerNestController::class, 'dashboard']);
    Route::get('/login', [TracerNestController::class, 'dashboard']);
    Route::get('/setup', [TracerNestController::class, 'dashboard']);
    Route::get('/decryption', [TracerNestController::class, 'dashboard']);
    Route::get('/logs', [TracerNestController::class, 'dashboard']);
    Route::get('/settings', [TracerNestController::class, 'dashboard']);
    Route::get('/alerts', [TracerNestController::class, 'dashboard']);
    Route::get('/audit', [TracerNestController::class, 'dashboard']);
    Route::get('/users', [TracerNestController::class, 'dashboard']);

    // 2. Health & System Diagnostics
    Route::get('/health', [TracerNestController::class, 'health']);
    Route::get('/api/health', [TracerNestController::class, 'health']);
    Route::get('/metrics', [TracerNestController::class, 'metrics']);
    Route::get('/api/metrics', [TracerNestController::class, 'metrics']);

    // 3. Authentication & Account Lifecycle
    Route::get('/api/auth/status', [TracerNestController::class, 'authStatus']);
    Route::post('/api/auth/setup', [TracerNestController::class, 'setup']);
    Route::post('/api/auth/login', [TracerNestController::class, 'login']);
    Route::post('/api/auth/reset', [TracerNestController::class, 'reset']);
    Route::get('/api/auth/me', [TracerNestController::class, 'me']);
    Route::post('/api/auth/change-password', [TracerNestController::class, 'changePassword']);
    Route::post('/api/auth/logout', [TracerNestController::class, 'logout']);

    // 4. Logs Telemetry, Decryption & Stream Ticket
    Route::get('/api/logs', [TracerNestController::class, 'queryLogs']);
    Route::get('/api/logs/stream', [TracerNestController::class, 'streamLogs']);
    Route::post('/api/logs/stream/ticket', [TracerNestController::class, 'streamTicket']);
    Route::delete('/api/logs', [TracerNestController::class, 'clearLogs']);
    Route::get('/api/logs/export', [TracerNestController::class, 'exportLogs']);
    Route::post('/api/logs/decrypt', [TracerNestController::class, 'decryptPayload']);
    Route::post('/api/logs/decrypt-payload', [TracerNestController::class, 'decryptPayload']);
    Route::post('/api/logs/ingest', [TracerNestController::class, 'ingest']);
    Route::post('/api/ingest', [TracerNestController::class, 'ingest']);

    // 5. Data Retention & TTL Policies
    Route::get('/api/ttl', [TracerNestController::class, 'listTtlRules']);
    Route::post('/api/ttl/rules', [TracerNestController::class, 'createTtlRule']);
    Route::delete('/api/ttl/rules/{id}', [TracerNestController::class, 'deleteTtlRule']);
    Route::post('/api/ttl/purge', [TracerNestController::class, 'purgeTtl']);

    // 6. User Management & RBAC
    Route::get('/api/users', [TracerNestController::class, 'listUsers']);
    Route::post('/api/users', [TracerNestController::class, 'createUser']);
    Route::delete('/api/users/{id}', [TracerNestController::class, 'deleteUser']);
    Route::match(['put', 'patch'], '/api/users/{id}', [TracerNestController::class, 'updateUserRole']);

    // 7. Alert Integrations (Email, Webhooks, Microsoft Teams)
    Route::get('/api/alerts', [TracerNestController::class, 'listAlerts']);
    Route::post('/api/alerts', [TracerNestController::class, 'saveAlerts']);
    Route::post('/api/alerts/test', [TracerNestController::class, 'testAlert']);

    // 8. Security Audit Logs
    Route::get('/api/audit', [TracerNestController::class, 'queryAudit']);

    // 9. Dynamic Route Exclusions (CRUD & Toggle)
    Route::get('/api/excluded-routes', [TracerNestController::class, 'listExcludedRoutes']);
    Route::post('/api/excluded-routes', [TracerNestController::class, 'createExcludedRoute']);
    Route::match(['post', 'patch'], '/api/excluded-routes/{id}/toggle', [TracerNestController::class, 'toggleExcludedRoute']);
    Route::delete('/api/excluded-routes/{id}', [TracerNestController::class, 'deleteExcludedRoute']);
};

// Mount routes under resolved prefix (or root if empty)
if ($pathPrefix !== '') {
    Route::prefix($pathPrefix)->group($registerRoutes);

    // Optional Direct Root Fallbacks for Microservice Ingestion
    // Prevents 404 when callers post directly to /api/logs/ingest without prefix
    if (config('tracernest.expose_root_api', true)) {
        Route::post('/api/logs/ingest', [TracerNestController::class, 'ingest']);
        Route::post('/api/ingest', [TracerNestController::class, 'ingest']);
    }
} else {
    Route::group([], $registerRoutes);
}
