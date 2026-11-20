<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\TracerNestController;

/**
 * TracerNest Telemetry Routes for Laravel 13
 *
 * Mounts the dashboard and API directly on your existing Laravel port.
 *
 * Usage in routes/web.php:
 *   require base_path('node_modules/tracernest-logger/integrations/laravel/routes.php');
 */
Route::prefix('tracernest')->group(function () {
    // 1. Dashboard Web UI
    Route::get('/', [TracerNestController::class, 'dashboard'])->name('tracernest.dashboard');

    // 2. Telemetry API Endpoints (Runs on the same port)
    Route::post('/api/auth/login', [TracerNestController::class, 'login']);
    Route::get('/api/auth/me', [TracerNestController::class, 'me']);
    Route::get('/api/logs', [TracerNestController::class, 'queryLogs']);
    Route::get('/api/logs/stream', [TracerNestController::class, 'streamLogs']);
    Route::get('/api/health', [TracerNestController::class, 'health']);
    Route::delete('/api/logs', [TracerNestController::class, 'clearLogs']);
});
