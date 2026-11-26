<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\TracerNestController;

/**
 * TracerNest Telemetry & Operations Dashboard Routes for Laravel 13 / 12 / 11
 *
 * Mounts the complete TracerNest single-port operations suite directly
 * on your existing Laravel server port without opening extra ports or processes.
 *
 * Usage in routes/web.php:
 *   require base_path('node_modules/tracernest-logger/integrations/laravel/routes.php');
 */

$pathPrefix = ltrim(config('tracernest.path', '/tracernest'), '/');

Route::prefix($pathPrefix)->group(function () {

    // 1. Single-Page Application (SPA) Web Dashboard & Direct Auth Views
    Route::get('/', [TracerNestController::class, 'dashboard'])->name('tracernest.dashboard');
    Route::get('/login', [TracerNestController::class, 'dashboard']);
    Route::get('/setup', [TracerNestController::class, 'dashboard']);

    // 2. Health & System Diagnostics
    Route::get('/health', [TracerNestController::class, 'health']);
    Route::get('/api/health', [TracerNestController::class, 'health']);
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
});
