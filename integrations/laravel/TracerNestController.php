<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * TracerNest Telemetry Controller for Laravel 13 / 12 / 11
 *
 * Serves the TracerNest telemetry dashboard UI and handles all telemetry API endpoints
 * directly on your existing Laravel port without opening any additional ports or processes.
 */
class TracerNestController
{
    protected string $tableName;
    protected string $secret;

    public function __construct()
    {
        $this->tableName = config('tracernest.table_prefix', 'tracenest_') . 'logs';
        $this->secret = config('tracernest.key', env('APP_KEY', 'default-tracernest-secret-key-32'));
        $this->ensureSchema();
    }

    /**
     * Ensures TracerNest tables exist in Laravel's active database connection.
     */
    protected function ensureSchema(): void
    {
        try {
            $prefix = config('tracernest.table_prefix', 'tracenest_');
            $logsTable = $prefix . 'logs';
            $usersTable = $prefix . 'users';

            $driver = DB::connection()->getDriverName();

            if (!DB::getSchemaBuilder()->hasTable($logsTable)) {
                if ($driver === 'sqlite') {
                    DB::statement("
                        CREATE TABLE IF NOT EXISTS {$logsTable} (
                            id TEXT PRIMARY KEY,
                            timestamp INTEGER NOT NULL,
                            expires_at INTEGER,
                            level TEXT NOT NULL,
                            source TEXT NOT NULL,
                            message TEXT NOT NULL,
                            raw TEXT,
                            metadata TEXT,
                            tags TEXT
                        );
                        CREATE INDEX IF NOT EXISTS idx_{$logsTable}_ts ON {$logsTable} (timestamp DESC);
                        CREATE INDEX IF NOT EXISTS idx_{$logsTable}_level ON {$logsTable} (level);
                        CREATE INDEX IF NOT EXISTS idx_{$logsTable}_source ON {$logsTable} (source);
                    ");
                } else {
                    DB::statement("
                        CREATE TABLE IF NOT EXISTS {$logsTable} (
                            id VARCHAR(64) PRIMARY KEY,
                            timestamp BIGINT NOT NULL,
                            expires_at BIGINT NULL,
                            level VARCHAR(16) NOT NULL,
                            source VARCHAR(32) NOT NULL,
                            message TEXT NOT NULL,
                            raw MEDIUMTEXT NULL,
                            metadata MEDIUMTEXT NULL,
                            tags TEXT NULL,
                            INDEX idx_logs_ts (timestamp DESC),
                            INDEX idx_logs_level (level),
                            INDEX idx_logs_source (source)
                        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
                    ");
                }
            }

            if (!DB::getSchemaBuilder()->hasTable($usersTable)) {
                if ($driver === 'sqlite') {
                    DB::statement("
                        CREATE TABLE IF NOT EXISTS {$usersTable} (
                            id TEXT PRIMARY KEY,
                            username TEXT UNIQUE NOT NULL,
                            password_hash TEXT NOT NULL,
                            salt TEXT NOT NULL,
                            role TEXT NOT NULL,
                            created_at INTEGER NOT NULL,
                            last_login_at INTEGER,
                            must_change_password INTEGER DEFAULT 0,
                            token_version INTEGER DEFAULT 1
                        );
                    ");
                } else {
                    DB::statement("
                        CREATE TABLE IF NOT EXISTS {$usersTable} (
                            id VARCHAR(64) PRIMARY KEY,
                            username VARCHAR(191) UNIQUE NOT NULL,
                            password_hash VARCHAR(255) NOT NULL,
                            salt VARCHAR(64) NOT NULL,
                            role VARCHAR(32) NOT NULL,
                            created_at BIGINT NOT NULL,
                            last_login_at BIGINT NULL,
                            must_change_password TINYINT(1) NOT NULL DEFAULT 0,
                            token_version INT NOT NULL DEFAULT 1
                        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
                    ");
                }
            }
        } catch (\Throwable $e) {
            // Silently continue if permissions restrict DDL
        }
    }

    /**
     * Serves the pre-compiled TracerNest Single-Page Application (SPA) dashboard.
     */
    public function dashboard(): Response
    {
        $possiblePaths = [
            __DIR__ . '/dashboard.html',
            base_path('node_modules/tracernest-logger/integrations/laravel/dashboard.html'),
            base_path('node_modules/tracernest-logger/dist/ui/dashboard.html'),
            public_path('vendor/tracernest/dashboard.html'),
        ];

        $html = null;
        foreach ($possiblePaths as $path) {
            if (file_exists($path)) {
                $html = file_get_contents($path);
                break;
            }
        }

        if (!$html) {
            return response(
                '<h1>TracerNest Dashboard HTML asset not found</h1><p>Run <code>npm install tracernest-logger</code> to bundle assets.</p>',
                500,
                ['Content-Type' => 'text/html']
            );
        }

        return response($html, 200, [
            'Content-Type' => 'text/html; charset=UTF-8',
            'Cache-Control' => 'no-cache, no-store, must-revalidate',
            'X-Frame-Options' => 'DENY',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    /**
     * Authenticates an admin user and issues an HMAC token.
     */
    public function login(Request $request): JsonResponse
    {
        $username = strtolower(trim((string) $request->input('username', '')));
        $password = (string) $request->input('password', '');

        if (!$username || !$password) {
            return response()->json(['error' => 'Username and password required'], 400);
        }

        $usersTable = config('tracernest.table_prefix', 'tracenest_') . 'users';
        $userCount = DB::table($usersTable)->count();

        // Auto-provision initial administrator if no users exist
        if ($userCount === 0) {
            $salt = bin2hex(random_bytes(16));
            $hash = hash_pbkdf2('sha256', $password, $salt, 10000, 64);

            DB::table($usersTable)->insert([
                'id' => 'user_admin_' . bin2hex(random_bytes(4)),
                'username' => $username,
                'password_hash' => $hash,
                'salt' => $salt,
                'role' => 'admin',
                'created_at' => (int) (microtime(true) * 1000),
                'must_change_password' => 0,
                'token_version' => 1,
            ]);
        }

        $user = DB::table($usersTable)->where('username', $username)->first();

        if (!$user) {
            return response()->json(['error' => 'Invalid username or password'], 401);
        }

        // Verify password hash
        $expectedHash = hash_pbkdf2('sha256', $password, $user->salt, 10000, 64);
        if (!hash_equals($user->password_hash, $expectedHash) && !password_verify($password, $user->password_hash)) {
            return response()->json(['error' => 'Invalid username or password'], 401);
        }

        $expiresAt = time() + 86400; // 24 hours
        $payload = "{$user->id}:{$user->username}:{$user->role}:{$expiresAt}:" . ($user->token_version ?? 1);
        $signature = hash_hmac('sha256', $payload, $this->secret);
        $token = base64_encode("{$payload}:{$signature}");

        return response()->json([
            'token' => $token,
            'user' => [
                'id' => $user->id,
                'username' => $user->username,
                'role' => $user->role,
                'permissions' => ['*'],
                'mustChangePassword' => false,
            ],
            'mustChangePassword' => false,
        ])->cookie('tracernest_token', $token, 1440, '/', null, $request->isSecure(), true);
    }

    /**
     * Validates current authenticated operator session.
     */
    public function me(Request $request): JsonResponse
    {
        $user = $this->authenticate($request);
        if (!$user) {
            return response()->json(['error' => 'Unauthorized: Valid Bearer token required'], 401);
        }

        return response()->json([
            'user' => [
                'id' => $user->id,
                'username' => $user->username,
                'role' => $user->role,
                'permissions' => ['*'],
                'mustChangePassword' => false,
            ],
        ]);
    }

    /**
     * Queries and paginates telemetry logs with real-time filtering and metrics.
     */
    public function queryLogs(Request $request): JsonResponse
    {
        $user = $this->authenticate($request);
        if (!$user) {
            return response()->json(['error' => 'Unauthorized: Valid Bearer token required'], 401);
        }

        $now = (int) (microtime(true) * 1000);
        $query = DB::table($this->tableName)->where(function ($q) use ($now) {
            $q->whereNull('expires_at')->orWhere('expires_at', '>', $now);
        });

        $level = $request->input('level');
        if ($level && $level !== 'all') {
            $query->where('level', $level);
        }

        $source = $request->input('source');
        if ($source && $source !== 'all') {
            $query->where('source', $source);
        }

        $from = $request->input('from');
        if ($from) {
            $query->where('timestamp', '>=', (int) $from);
        }

        $to = $request->input('to');
        if ($to) {
            $query->where('timestamp', '<=', (int) $to);
        }

        $search = trim((string) $request->input('search', ''));
        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                $term = "%{$search}%";
                $q->where('message', 'like', $term)
                  ->orWhere('raw', 'like', $term)
                  ->orWhere('metadata', 'like', $term);
            });
        }

        $total = (clone $query)->count();

        // Calculate counts
        $countsQuery = DB::table($this->tableName)->where(function ($q) use ($now) {
            $q->whereNull('expires_at')->orWhere('expires_at', '>', $now);
        });
        $allCount = (clone $countsQuery)->count();
        $errorCount = (clone $countsQuery)->where('level', 'error')->count();
        $warnCount = (clone $countsQuery)->where('level', 'warn')->count();
        $infoCount = (clone $countsQuery)->where('level', 'info')->count();
        $debugCount = (clone $countsQuery)->where('level', 'debug')->count();
        $httpCount = (clone $countsQuery)->where(function ($q) {
            $q->where('source', 'http')->orWhere('metadata', 'like', '%"http"%');
        })->count();

        $counts = [
            'all' => $allCount,
            'error' => $errorCount,
            'warn' => $warnCount,
            'info' => $infoCount,
            'debug' => $debugCount,
            'http' => $httpCount,
        ];

        $limit = min((int) $request->input('limit', 100), 500);
        $offset = (int) $request->input('offset', 0);
        $order = strtolower((string) $request->input('order', 'desc')) === 'asc' ? 'asc' : 'desc';

        $rows = $query->orderBy('timestamp', $order)->offset($offset)->limit($limit)->get();

        $logs = $rows->map(function ($r) {
            return [
                'id' => $r->id,
                'timestamp' => (int) $r->timestamp,
                'expiresAt' => $r->expires_at ? (int) $r->expires_at : null,
                'level' => $r->level,
                'source' => $r->source,
                'message' => $r->message,
                'raw' => $r->raw ?? $r->message,
                'metadata' => $r->metadata ? json_decode($r->metadata, true) : null,
                'tags' => $r->tags ? json_decode($r->tags, true) : [],
            ];
        });

        return response()->json([
            'logs' => $logs,
            'total' => $total,
            'offset' => $offset,
            'limit' => $limit,
            'counts' => $counts,
        ]);
    }

    /**
     * Server-Sent Events (SSE) live streaming on Laravel's existing port.
     */
    public function streamLogs(Request $request): StreamedResponse
    {
        $lastTimestamp = (int) ($request->input('since') ?: (microtime(true) * 1000) - 2000);

        return response()->stream(function () use ($lastTimestamp) {
            echo ": connected\n\n";
            if (ob_get_level() > 0) ob_flush();
            flush();

            $seen = [];
            $currentTs = $lastTimestamp;
            $start = time();

            // Stream for up to 25 seconds before cleanly letting client reconnect
            while (time() - $start < 25) {
                if (connection_aborted()) break;

                $rows = DB::table($this->tableName)
                    ->where('timestamp', '>', $currentTs)
                    ->orderBy('timestamp', 'asc')
                    ->limit(20)
                    ->get();

                foreach ($rows as $r) {
                    if (isset($seen[$r->id])) continue;
                    $seen[$r->id] = true;
                    $currentTs = max($currentTs, (int) $r->timestamp);

                    $payload = [
                        'id' => $r->id,
                        'timestamp' => (int) $r->timestamp,
                        'level' => $r->level,
                        'source' => $r->source,
                        'message' => $r->message,
                        'raw' => $r->raw ?? $r->message,
                        'metadata' => $r->metadata ? json_decode($r->metadata, true) : null,
                        'tags' => $r->tags ? json_decode($r->tags, true) : [],
                    ];

                    echo "event: log\n";
                    echo "data: " . json_encode($payload) . "\n\n";
                }

                if (ob_get_level() > 0) ob_flush();
                flush();
                usleep(500000); // 500ms poll interval
            }
        }, 200, [
            'Content-Type' => 'text/event-stream',
            'Cache-Control' => 'no-cache, no-transform',
            'Connection' => 'keep-alive',
            'X-Accel-Buffering' => 'no',
        ]);
    }

    /**
     * Server System & Database Diagnostics endpoint.
     */
    public function health(): JsonResponse
    {
        $load = function_exists('sys_getloadavg') ? sys_getloadavg() : [0, 0, 0];
        $totalLogs = DB::table($this->tableName)->count();

        return response()->json([
            'status' => 'healthy',
            'framework' => 'Laravel 13',
            'php' => PHP_VERSION,
            'database' => [
                'driver' => DB::connection()->getDriverName(),
                'connected' => true,
                'totalLogs' => $totalLogs,
            ],
            'memory' => [
                'usageBytes' => memory_get_usage(true),
                'peakBytes' => memory_get_peak_usage(true),
            ],
            'loadAverage' => $load,
        ]);
    }

    /**
     * Truncates historical logs upon operator request.
     */
    public function clearLogs(Request $request): JsonResponse
    {
        $user = $this->authenticate($request);
        if (!$user) {
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        DB::table($this->tableName)->truncate();
        return response()->json(['success' => true, 'message' => 'Telemetry logs cleared']);
    }

    /**
     * Verifies stateless HMAC session tokens.
     */
    protected function authenticate(Request $request): ?object
    {
        $token = $request->bearerToken() ?: $request->cookie('tracernest_token') ?: $request->input('token');
        if (!$token) return null;

        $decoded = base64_decode($token, true);
        if (!$decoded) return null;

        $parts = explode(':', $decoded);
        if (count($parts) < 6) return null;

        [$userId, $username, $role, $expiresAt, $tokenVersion, $signature] = $parts;

        if (time() > (int) $expiresAt) return null;

        $payload = "{$userId}:{$username}:{$role}:{$expiresAt}:{$tokenVersion}";
        $expectedSig = hash_hmac('sha256', $payload, $this->secret);

        if (!hash_equals($expectedSig, $signature)) return null;

        return (object) [
            'id' => $userId,
            'username' => $username,
            'role' => $role,
        ];
    }
}
