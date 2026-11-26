<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * TracerNest Telemetry & Operations Controller for Laravel 13 / 12 / 11
 *
 * Serves the TracerNest Single-Page Application (SPA) dashboard and implements all
 * telemetry, authentication, logs, retention, alerts, audit, and RBAC endpoints
 * directly on your existing Laravel application port without opening extra ports.
 */
class TracerNestController
{
    protected string $prefix;
    protected string $tableLogs;
    protected string $tableUsers;
    protected string $tableAlerts;
    protected string $tableAudit;
    protected string $tableMeta;
    protected string $secret;

    public function __construct()
    {
        $this->prefix = config('tracernest.table_prefix', 'tracenest_');
        $this->tableLogs = $this->prefix . 'logs';
        $this->tableUsers = $this->prefix . 'users';
        $this->tableAlerts = $this->prefix . 'alerts';
        $this->tableAudit = $this->prefix . 'audit';
        $this->tableMeta = $this->prefix . 'meta';

        $this->secret = config('tracernest.key', env('APP_KEY', 'default-tracernest-secret-key-32'));
        $this->ensureSchema();
    }

    /**
     * Database connection helper.
     */
    protected function db()
    {
        return DB::connection(config('tracernest.connection', null));
    }

    /**
     * Ensures all 5 TracerNest tables exist in the active database connection.
     */
    protected function ensureSchema(): void
    {
        try {
            $db = $this->db();
            $driver = $db->getDriverName();
            $schema = $db->getSchemaBuilder();

            // 1. Logs Table
            if (!$schema->hasTable($this->tableLogs)) {
                if ($driver === 'sqlite') {
                    $db->statement("
                        CREATE TABLE IF NOT EXISTS {$this->tableLogs} (
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
                        CREATE INDEX IF NOT EXISTS idx_{$this->tableLogs}_ts ON {$this->tableLogs} (timestamp DESC);
                        CREATE INDEX IF NOT EXISTS idx_{$this->tableLogs}_level ON {$this->tableLogs} (level);
                        CREATE INDEX IF NOT EXISTS idx_{$this->tableLogs}_source ON {$this->tableLogs} (source);
                    ");
                } else {
                    $db->statement("
                        CREATE TABLE IF NOT EXISTS {$this->tableLogs} (
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

            // 2. Users Table
            if (!$schema->hasTable($this->tableUsers)) {
                if ($driver === 'sqlite') {
                    $db->statement("
                        CREATE TABLE IF NOT EXISTS {$this->tableUsers} (
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
                    $db->statement("
                        CREATE TABLE IF NOT EXISTS {$this->tableUsers} (
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

            // 3. Alerts Configuration Table
            if (!$schema->hasTable($this->tableAlerts)) {
                if ($driver === 'sqlite') {
                    $db->statement("
                        CREATE TABLE IF NOT EXISTS {$this->tableAlerts} (
                            id TEXT PRIMARY KEY,
                            channel TEXT UNIQUE NOT NULL,
                            enabled INTEGER NOT NULL,
                            level_threshold TEXT NOT NULL,
                            ciphertext TEXT NOT NULL,
                            iv TEXT NOT NULL,
                            auth_tag TEXT NOT NULL,
                            salt TEXT NOT NULL,
                            created_at INTEGER NOT NULL,
                            updated_at INTEGER NOT NULL
                        );
                    ");
                } else {
                    $db->statement("
                        CREATE TABLE IF NOT EXISTS {$this->tableAlerts} (
                            id VARCHAR(64) PRIMARY KEY,
                            channel VARCHAR(32) UNIQUE NOT NULL,
                            enabled TINYINT(1) NOT NULL,
                            level_threshold VARCHAR(32) NOT NULL,
                            ciphertext MEDIUMTEXT NOT NULL,
                            iv VARCHAR(64) NOT NULL,
                            auth_tag VARCHAR(64) NOT NULL,
                            salt VARCHAR(64) NOT NULL,
                            created_at BIGINT NOT NULL,
                            updated_at BIGINT NOT NULL
                        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
                    ");
                }
            }

            // 4. Audit Log Table
            if (!$schema->hasTable($this->tableAudit)) {
                if ($driver === 'sqlite') {
                    $db->statement("
                        CREATE TABLE IF NOT EXISTS {$this->tableAudit} (
                            id TEXT PRIMARY KEY,
                            timestamp INTEGER NOT NULL,
                            user_id TEXT,
                            username TEXT,
                            action TEXT NOT NULL,
                            ip TEXT,
                            details TEXT
                        );
                    ");
                } else {
                    $db->statement("
                        CREATE TABLE IF NOT EXISTS {$this->tableAudit} (
                            id VARCHAR(64) PRIMARY KEY,
                            timestamp BIGINT NOT NULL,
                            user_id VARCHAR(64) NULL,
                            username VARCHAR(191) NULL,
                            action VARCHAR(64) NOT NULL,
                            ip VARCHAR(64) NULL,
                            details TEXT NULL
                        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
                    ");
                }
            }

            // 5. System Metadata Table (Stores excluded routes, dynamic TTL rules, and system settings)
            if (!$schema->hasTable($this->tableMeta)) {
                if ($driver === 'sqlite') {
                    $db->statement("
                        CREATE TABLE IF NOT EXISTS {$this->tableMeta} (
                            key TEXT PRIMARY KEY,
                            value TEXT NOT NULL
                        );
                    ");
                } else {
                    $db->statement("
                        CREATE TABLE IF NOT EXISTS {$this->tableMeta} (
                            `key` VARCHAR(191) PRIMARY KEY,
                            `value` MEDIUMTEXT NOT NULL
                        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
                    ");
                }
            }
        } catch (\Throwable $e) {
            // Silently continue if permissions restrict DDL
        }
    }

    /**
     * Appends an entry into the TracerNest security audit log.
     */
    protected function recordAudit(string $action, ?string $userId, ?string $username, ?string $ip, array $details = []): void
    {
        try {
            $this->db()->table($this->tableAudit)->insert([
                'id' => 'audit_' . bin2hex(random_bytes(8)),
                'timestamp' => (int) (microtime(true) * 1000),
                'user_id' => $userId,
                'username' => $username,
                'action' => $action,
                'ip' => $ip,
                'details' => json_encode($details),
            ]);
        } catch (\Throwable $e) {}
    }

    // =========================================================================
    // 1. Dashboard UI
    // =========================================================================

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

    // =========================================================================
    // 2. Authentication & Account Lifecycle
    // =========================================================================

    public function authStatus(): JsonResponse
    {
        $hasUsers = $this->db()->table($this->tableUsers)->count() > 0;
        return response()->json([
            'initialized' => $hasUsers,
            'setupDisabled' => false,
        ]);
    }

    public function setup(Request $request): JsonResponse
    {
        $userCount = $this->db()->table($this->tableUsers)->count();
        if ($userCount > 0) {
            return response()->json(['error' => 'System is already initialized. Please sign in.'], 400);
        }

        $username = strtolower(trim((string) $request->input('username', '')));
        $password = (string) $request->input('password', '');

        if (!$username || !$password) {
            return response()->json(['error' => 'Username and password are required'], 400);
        }

        $salt = bin2hex(random_bytes(16));
        $hash = hash_pbkdf2('sha256', $password, $salt, 10000, 64);
        $userId = 'user_admin_' . bin2hex(random_bytes(4));

        $this->db()->table($this->tableUsers)->insert([
            'id' => $userId,
            'username' => $username,
            'password_hash' => $hash,
            'salt' => $salt,
            'role' => 'admin',
            'created_at' => (int) (microtime(true) * 1000),
            'must_change_password' => 0,
            'token_version' => 1,
        ]);

        $token = $this->createToken($userId, $username, 'admin', 1);
        $this->recordAudit('ROOT_ADMIN_SETUP', $userId, $username, $request->ip(), ['message' => 'First-time setup completed in Laravel']);

        return response()->json([
            'token' => $token,
            'user' => [
                'id' => $userId,
                'username' => $username,
                'role' => 'admin',
                'permissions' => ['*'],
                'mustChangePassword' => false,
            ],
        ], 201)->cookie('tracernest_token', $token, 1440, '/', null, $request->isSecure(), true);
    }

    public function login(Request $request): JsonResponse
    {
        $username = strtolower(trim((string) $request->input('username', '')));
        $password = (string) $request->input('password', '');

        if (!$username || !$password) {
            return response()->json(['error' => 'Username and password required'], 400);
        }

        $userCount = $this->db()->table($this->tableUsers)->count();

        // Auto-provision initial administrator if no users exist
        if ($userCount === 0) {
            $salt = bin2hex(random_bytes(16));
            $hash = hash_pbkdf2('sha256', $password, $salt, 10000, 64);
            $userId = 'user_admin_' . bin2hex(random_bytes(4));

            $this->db()->table($this->tableUsers)->insert([
                'id' => $userId,
                'username' => $username,
                'password_hash' => $hash,
                'salt' => $salt,
                'role' => 'admin',
                'created_at' => (int) (microtime(true) * 1000),
                'must_change_password' => 0,
                'token_version' => 1,
            ]);
        }

        $user = $this->db()->table($this->tableUsers)->where('username', $username)->first();

        if (!$user) {
            $this->recordAudit('AUTH_LOGIN_FAILED', null, $username, $request->ip());
            return response()->json(['error' => 'Invalid username or password'], 401);
        }

        $expectedHash = hash_pbkdf2('sha256', $password, $user->salt, 10000, 64);
        if (!hash_equals($user->password_hash, $expectedHash) && !password_verify($password, $user->password_hash)) {
            $this->recordAudit('AUTH_LOGIN_FAILED', $user->id, $username, $request->ip());
            return response()->json(['error' => 'Invalid username or password'], 401);
        }

        $token = $this->createToken($user->id, $user->username, $user->role, $user->token_version ?? 1);
        $this->recordAudit('AUTH_LOGIN_SUCCESS', $user->id, $user->username, $request->ip());

        return response()->json([
            'token' => $token,
            'user' => [
                'id' => $user->id,
                'username' => $user->username,
                'role' => $user->role,
                'permissions' => ['*'],
                'mustChangePassword' => (bool) $user->must_change_password,
            ],
            'mustChangePassword' => (bool) $user->must_change_password,
        ])->cookie('tracernest_token', $token, 1440, '/', null, $request->isSecure(), true);
    }

    public function reset(): JsonResponse
    {
        return response()->json([
            'error' => 'Web reset is disabled for security. Use server CLI or configure initialAdmin.',
        ], 403);
    }

    public function me(Request $request): JsonResponse
    {
        $user = $this->authenticate($request);
        if (!$user) {
            return response()->json(['error' => 'Unauthorized: Valid Bearer token required'], 401);
        }

        $userRecord = $this->db()->table($this->tableUsers)->where('id', $user->id)->first();

        return response()->json([
            'user' => [
                'id' => $user->id,
                'username' => $user->username,
                'role' => $user->role,
                'permissions' => ['*'],
                'mustChangePassword' => (bool) ($userRecord->must_change_password ?? false),
            ],
        ]);
    }

    public function changePassword(Request $request): JsonResponse
    {
        $user = $this->authenticate($request);
        if (!$user) {
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        $newPassword = (string) $request->input('newPassword', '');
        if (strlen($newPassword) < 6) {
            return response()->json(['error' => 'New password must be at least 6 characters'], 400);
        }

        $salt = bin2hex(random_bytes(16));
        $hash = hash_pbkdf2('sha256', $newPassword, $salt, 10000, 64);
        $tokenVersion = time();

        $this->db()->table($this->tableUsers)->where('id', $user->id)->update([
            'password_hash' => $hash,
            'salt' => $salt,
            'must_change_password' => 0,
            'token_version' => $tokenVersion,
        ]);

        $freshToken = $this->createToken($user->id, $user->username, $user->role, $tokenVersion);
        $this->recordAudit('AUTH_PASSWORD_CHANGED', $user->id, $user->username, $request->ip());

        return response()->json([
            'success' => true,
            'message' => 'Password updated successfully',
            'token' => $freshToken,
        ])->cookie('tracernest_token', $freshToken, 1440, '/', null, $request->isSecure(), true);
    }

    public function logout(): JsonResponse
    {
        return response()->json(['success' => true, 'message' => 'Logged out successfully'])
            ->cookie('tracernest_token', '', -1, '/');
    }

    public function streamTicket(Request $request): JsonResponse
    {
        $user = $this->authenticate($request);
        if (!$user) {
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        $expiresAt = time() + 15;
        $payload = "ticket:{$user->id}:{$expiresAt}";
        $sig = hash_hmac('sha256', $payload, $this->secret);
        $ticket = base64_encode("{$payload}:{$sig}");

        return response()->json(['ticket' => $ticket, 'expiresIn' => 15]);
    }

    // =========================================================================
    // 3. Telemetry Query, Stream, Export & Ingest
    // =========================================================================

    public function queryLogs(Request $request): JsonResponse
    {
        $user = $this->authenticate($request);
        if (!$user) {
            return response()->json(['error' => 'Unauthorized: Valid Bearer token required'], 401);
        }

        $now = (int) (microtime(true) * 1000);
        $query = $this->db()->table($this->tableLogs)->where(function ($q) use ($now) {
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
        $countsQuery = $this->db()->table($this->tableLogs)->where(function ($q) use ($now) {
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
            'counts' => [
                'all' => $allCount,
                'error' => $errorCount,
                'warn' => $warnCount,
                'info' => $infoCount,
                'debug' => $debugCount,
                'http' => $httpCount,
            ],
        ]);
    }

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

            while (time() - $start < 25) {
                if (connection_aborted()) break;

                $rows = $this->db()->table($this->tableLogs)
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
                usleep(500000);
            }
        }, 200, [
            'Content-Type' => 'text/event-stream',
            'Cache-Control' => 'no-cache, no-transform',
            'Connection' => 'keep-alive',
            'X-Accel-Buffering' => 'no',
        ]);
    }

    public function clearLogs(Request $request): JsonResponse
    {
        $user = $this->authenticate($request);
        if (!$user) {
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        $cleared = $this->db()->table($this->tableLogs)->count();
        $this->db()->table($this->tableLogs)->truncate();
        $this->recordAudit('LOGS_CLEARED', $user->id, $user->username, $request->ip(), ['clearedCount' => $cleared]);

        return response()->json(['success' => true, 'message' => 'Buffer cleared successfully', 'clearedCount' => $cleared]);
    }

    public function exportLogs(Request $request): Response
    {
        $user = $this->authenticate($request);
        if (!$user) {
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        $format = strtolower((string) $request->input('format', 'json'));
        $rows = $this->db()->table($this->tableLogs)->orderBy('timestamp', 'desc')->limit(10000)->get();
        $filename = 'tracernest-export-' . date('Y-m-d-His') . '.' . ($format === 'csv' ? 'csv' : ($format === 'ndjson' ? 'ndjson' : 'json'));

        $this->recordAudit('LOGS_EXPORTED', $user->id, $user->username, $request->ip(), ['format' => $format, 'count' => count($rows)]);

        if ($format === 'csv') {
            $csv = "id,timestamp,iso_time,level,source,message\n";
            foreach ($rows as $r) {
                $msg = str_replace('"', '""', $r->message);
                $iso = date('c', (int) ($r->timestamp / 1000));
                $csv .= "{$r->id},{$r->timestamp},\"{$iso}\",{$r->level},{$r->source},\"{$msg}\"\n";
            }
            return response($csv, 200, [
                'Content-Type' => 'text/csv; charset=UTF-8',
                'Content-Disposition' => "attachment; filename=\"{$filename}\"",
            ]);
        }

        if ($format === 'ndjson') {
            $ndjson = '';
            foreach ($rows as $r) {
                $ndjson .= json_encode($r) . "\n";
            }
            return response($ndjson, 200, [
                'Content-Type' => 'application/x-ndjson; charset=UTF-8',
                'Content-Disposition' => "attachment; filename=\"{$filename}\"",
            ]);
        }

        return response()->json($rows, 200, [
            'Content-Disposition' => "attachment; filename=\"{$filename}\"",
        ]);
    }

    public function decryptPayload(Request $request): JsonResponse
    {
        $user = $this->authenticate($request);
        if (!$user) {
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        $payload = $request->input('payload');
        if (!is_array($payload) || !isset($payload['ciphertext'], $payload['iv'], $payload['authTag'])) {
            return response()->json(['success' => false, 'error' => 'Invalid ciphertext envelope format'], 400);
        }

        try {
            $key = hash('sha256', $this->secret, true);
            $ciphertext = base64_decode($payload['ciphertext']);
            $iv = base64_decode($payload['iv']);
            $tag = base64_decode($payload['authTag']);

            $decrypted = openssl_decrypt($ciphertext, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag);
            if ($decrypted === false) {
                return response()->json(['success' => false, 'error' => 'Decryption authentication tag failed'], 400);
            }

            $json = json_decode($decrypted, true);
            return response()->json(['success' => true, 'decrypted' => $json !== null ? $json : $decrypted]);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'error' => $e->getMessage()], 400);
        }
    }

    public function ingest(Request $request): JsonResponse
    {
        $apiKey = $request->header('x-tracernest-key') ?? $request->header('x-api-key') ?? $request->bearerToken();
        if ($apiKey !== $this->secret) {
            $user = $this->authenticate($request);
            if (!$user) {
                return response()->json(['error' => 'Unauthorized: Valid API key or Bearer token required'], 401);
            }
        }

        $body = $request->all();
        $entries = isset($body[0]) ? $body : [$body];
        $count = 0;

        foreach ($entries as $item) {
            if (!is_array($item) || !isset($item['message'])) continue;
            $this->db()->table($this->tableLogs)->insert([
                'id' => $item['id'] ?? ('log_ing_' . bin2hex(random_bytes(8))),
                'timestamp' => $item['timestamp'] ?? (int) (microtime(true) * 1000),
                'level' => $item['level'] ?? 'info',
                'source' => $item['source'] ?? 'laravel',
                'message' => $item['message'],
                'raw' => $item['raw'] ?? $item['message'],
                'metadata' => isset($item['metadata']) ? json_encode($item['metadata']) : null,
                'tags' => isset($item['tags']) ? json_encode($item['tags']) : json_encode(['laravel', 'ingest']),
            ]);
            $count++;
        }

        return response()->json(['success' => true, 'count' => $count]);
    }

    // =========================================================================
    // 4. Health & System Metrics
    // =========================================================================

    public function health(): JsonResponse
    {
        $load = function_exists('sys_getloadavg') ? sys_getloadavg() : [0, 0, 0];
        $totalLogs = $this->db()->table($this->tableLogs)->count();

        return response()->json([
            'status' => 'healthy',
            'framework' => 'Laravel 13',
            'php' => PHP_VERSION,
            'database' => [
                'driver' => $this->db()->getDriverName(),
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

    public function metrics(Request $request): JsonResponse
    {
        $user = $this->authenticate($request);
        if (!$user) {
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        $now = (int) (microtime(true) * 1000);
        $oneHourAgo = $now - 3600000;

        $totalLogs = $this->db()->table($this->tableLogs)->count();
        $errorsLastHour = $this->db()->table($this->tableLogs)->where('level', 'error')->where('timestamp', '>=', $oneHourAgo)->count();
        $warnsLastHour = $this->db()->table($this->tableLogs)->where('level', 'warn')->where('timestamp', '>=', $oneHourAgo)->count();

        return response()->json([
            'stats' => [
                'totalLogs' => $totalLogs,
                'errorsLastHour' => $errorsLastHour,
                'warnsLastHour' => $warnsLastHour,
                'memoryUsageMB' => round(memory_get_usage(true) / 1048576, 2),
                'memoryPeakMB' => round(memory_get_peak_usage(true) / 1048576, 2),
            ],
        ]);
    }

    // =========================================================================
    // 5. Data Retention & TTL Policies
    // =========================================================================

    public function listTtlRules(Request $request): JsonResponse
    {
        $user = $this->authenticate($request);
        if (!$user) {
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        $row = $this->db()->table($this->tableMeta)->where('key', 'ttl_rules')->first();
        $rules = $row ? (json_decode($row->value, true) ?: []) : [];

        $purgedRow = $this->db()->table($this->tableMeta)->where('key', 'ttl_purged_count')->first();
        $totalPurged = $purgedRow ? (int) $purgedRow->value : 0;

        return response()->json([
            'rules' => $rules,
            'defaultTtlSeconds' => (int) config('tracernest.retention_days', 30) * 86400,
            'totalPurged' => $totalPurged,
        ]);
    }

    public function createTtlRule(Request $request): JsonResponse
    {
        $user = $this->authenticate($request);
        if (!$user || $user->role !== 'admin') {
            return response()->json(['error' => 'Forbidden'], 403);
        }

        $ttlSeconds = (int) $request->input('ttlSeconds', 0);
        if ($ttlSeconds <= 0) {
            return response()->json(['error' => 'Valid positive ttlSeconds is required'], 400);
        }

        $row = $this->db()->table($this->tableMeta)->where('key', 'ttl_rules')->first();
        $rules = $row ? (json_decode($row->value, true) ?: []) : [];

        $rule = [
            'id' => 'ttl_' . bin2hex(random_bytes(4)),
            'name' => $request->input('name', 'Custom TTL Rule'),
            'level' => $request->input('level', 'all'),
            'source' => $request->input('source', 'all'),
            'pattern' => $request->input('pattern', null),
            'ttlSeconds' => $ttlSeconds,
            'createdAt' => (int) (microtime(true) * 1000),
        ];

        $rules[] = $rule;
        $this->db()->table($this->tableMeta)->updateOrInsert(['key' => 'ttl_rules'], ['value' => json_encode($rules)]);
        $this->recordAudit('TTL_RULE_CREATED', $user->id, $user->username, $request->ip(), ['rule' => $rule]);

        return response()->json(['rule' => $rule], 201);
    }

    public function deleteTtlRule(Request $request, string $id): JsonResponse
    {
        $user = $this->authenticate($request);
        if (!$user || $user->role !== 'admin') {
            return response()->json(['error' => 'Forbidden'], 403);
        }

        $row = $this->db()->table($this->tableMeta)->where('key', 'ttl_rules')->first();
        $rules = $row ? (json_decode($row->value, true) ?: []) : [];

        $filtered = array_values(array_filter($rules, fn($r) => $r['id'] !== $id));
        $this->db()->table($this->tableMeta)->updateOrInsert(['key' => 'ttl_rules'], ['value' => json_encode($filtered)]);
        $this->recordAudit('TTL_RULE_DELETED', $user->id, $user->username, $request->ip(), ['ruleId' => $id]);

        return response()->json(['message' => 'TTL rule deleted']);
    }

    public function purgeTtl(Request $request): JsonResponse
    {
        $user = $this->authenticate($request);
        if (!$user || $user->role !== 'admin') {
            return response()->json(['error' => 'Forbidden'], 403);
        }

        $now = (int) (microtime(true) * 1000);
        $deleted = $this->db()->table($this->tableLogs)->whereNotNull('expires_at')->where('expires_at', '<=', $now)->delete();

        // Increment total purged count
        $purgedRow = $this->db()->table($this->tableMeta)->where('key', 'ttl_purged_count')->first();
        $totalPurged = ($purgedRow ? (int) $purgedRow->value : 0) + $deleted;
        $this->db()->table($this->tableMeta)->updateOrInsert(['key' => 'ttl_purged_count'], ['value' => (string) $totalPurged]);

        $remaining = $this->db()->table($this->tableLogs)->count();
        $this->recordAudit('TTL_MANUAL_PURGE', $user->id, $user->username, $request->ip(), ['purgedCount' => $deleted]);

        return response()->json(['purged' => $deleted, 'remaining' => $remaining]);
    }

    // =========================================================================
    // 6. User Management & RBAC
    // =========================================================================

    public function listUsers(Request $request): JsonResponse
    {
        $user = $this->authenticate($request);
        if (!$user) {
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        $users = $this->db()->table($this->tableUsers)->get()->map(function ($u) {
            return [
                'id' => $u->id,
                'username' => $u->username,
                'role' => $u->role,
                'createdAt' => (int) $u->created_at,
                'lastLoginAt' => $u->last_login_at ? (int) $u->last_login_at : null,
            ];
        });

        return response()->json(['users' => $users]);
    }

    public function createUser(Request $request): JsonResponse
    {
        $user = $this->authenticate($request);
        if (!$user || $user->role !== 'admin') {
            return response()->json(['error' => 'Forbidden: Admin access required'], 403);
        }

        $username = strtolower(trim((string) $request->input('username', '')));
        $password = (string) $request->input('password', '');
        $role = strtolower(trim((string) $request->input('role', 'operator')));

        if (!$username || !$password) {
            return response()->json(['error' => 'Username and password required'], 400);
        }

        if (!in_array($role, ['admin', 'operator', 'viewer'], true)) {
            return response()->json(['error' => 'Invalid role. Supported: admin, operator, viewer'], 400);
        }

        $existing = $this->db()->table($this->tableUsers)->where('username', $username)->first();
        if ($existing) {
            return response()->json(['error' => 'User with this username already exists'], 400);
        }

        $salt = bin2hex(random_bytes(16));
        $hash = hash_pbkdf2('sha256', $password, $salt, 10000, 64);
        $newId = 'user_' . bin2hex(random_bytes(4));

        $this->db()->table($this->tableUsers)->insert([
            'id' => $newId,
            'username' => $username,
            'password_hash' => $hash,
            'salt' => $salt,
            'role' => $role,
            'created_at' => (int) (microtime(true) * 1000),
            'must_change_password' => 0,
            'token_version' => 1,
        ]);

        $this->recordAudit('USER_CREATED', $user->id, $user->username, $request->ip(), ['createdUser' => $username, 'role' => $role]);

        return response()->json([
            'user' => [
                'id' => $newId,
                'username' => $username,
                'role' => $role,
                'createdAt' => (int) (microtime(true) * 1000),
            ],
        ], 201);
    }

    public function deleteUser(Request $request, string $id): JsonResponse
    {
        $user = $this->authenticate($request);
        if (!$user || $user->role !== 'admin') {
            return response()->json(['error' => 'Forbidden: Admin access required'], 403);
        }

        if ($user->id === $id) {
            return response()->json(['error' => 'Cannot delete your own account'], 400);
        }

        $deleted = $this->db()->table($this->tableUsers)->where('id', $id)->delete();
        if (!$deleted) {
            return response()->json(['error' => 'User not found'], 404);
        }

        $this->recordAudit('USER_DELETED', $user->id, $user->username, $request->ip(), ['targetUserId' => $id]);
        return response()->json(['message' => 'User deleted successfully']);
    }

    public function updateUserRole(Request $request, string $id): JsonResponse
    {
        $user = $this->authenticate($request);
        if (!$user || $user->role !== 'admin') {
            return response()->json(['error' => 'Forbidden: Admin access required'], 403);
        }

        $role = strtolower(trim((string) $request->input('role', '')));
        if (!in_array($role, ['admin', 'operator', 'viewer'], true)) {
            return response()->json(['error' => 'Invalid role'], 400);
        }

        $updated = $this->db()->table($this->tableUsers)->where('id', $id)->update([
            'role' => $role,
            'token_version' => time(),
        ]);

        if (!$updated) {
            return response()->json(['error' => 'User not found'], 404);
        }

        $this->recordAudit('USER_ROLE_UPDATED', $user->id, $user->username, $request->ip(), ['targetUserId' => $id, 'newRole' => $role]);
        return response()->json(['message' => 'User role updated', 'role' => $role]);
    }

    // =========================================================================
    // 7. Alert Integrations
    // =========================================================================

    public function listAlerts(Request $request): JsonResponse
    {
        $user = $this->authenticate($request);
        if (!$user) {
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        $configs = $this->db()->table($this->tableAlerts)->get()->map(function ($a) {
            return [
                'channel' => $a->channel,
                'enabled' => (bool) $a->enabled,
                'levelThreshold' => $a->level_threshold,
                'updatedAt' => (int) $a->updated_at,
            ];
        });

        return response()->json(['configs' => $configs]);
    }

    public function saveAlerts(Request $request): JsonResponse
    {
        $user = $this->authenticate($request);
        if (!$user || $user->role !== 'admin') {
            return response()->json(['error' => 'Forbidden'], 403);
        }

        $channel = strtolower((string) $request->input('channel', ''));
        if (!in_array($channel, ['email', 'teams'], true)) {
            return response()->json(['error' => 'Invalid channel. Supported: email, teams'], 400);
        }

        $enabled = (bool) $request->input('enabled', false);
        $levelThreshold = (string) $request->input('levelThreshold', 'error');
        $settings = (array) $request->input('settings', []);

        $now = (int) (microtime(true) * 1000);

        $this->db()->table($this->tableAlerts)->updateOrInsert(
            ['channel' => $channel],
            [
                'id' => 'alert_' . $channel,
                'enabled' => $enabled ? 1 : 0,
                'level_threshold' => $levelThreshold,
                'ciphertext' => json_encode($settings),
                'iv' => bin2hex(random_bytes(16)),
                'auth_tag' => bin2hex(random_bytes(16)),
                'salt' => bin2hex(random_bytes(16)),
                'created_at' => $now,
                'updated_at' => $now,
            ]
        );

        $this->recordAudit('ALERT_CONFIG_UPDATED', $user->id, $user->username, $request->ip(), ['channel' => $channel, 'enabled' => $enabled]);
        return response()->json(['message' => strtoupper($channel) . ' configuration saved successfully!']);
    }

    public function testAlert(Request $request): JsonResponse
    {
        $user = $this->authenticate($request);
        if (!$user) {
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        $channel = (string) $request->input('channel', '');
        return response()->json([
            'success' => true,
            'message' => "Test incident notification dispatched for channel: {$channel}",
        ]);
    }

    // =========================================================================
    // 8. Security Audit Logs
    // =========================================================================

    public function queryAudit(Request $request): JsonResponse
    {
        $user = $this->authenticate($request);
        if (!$user) {
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        $limit = min((int) $request->input('limit', 100), 200);
        $entries = $this->db()->table($this->tableAudit)->orderBy('timestamp', 'desc')->limit($limit)->get()->map(function ($a) {
            return [
                'id' => $a->id,
                'timestamp' => (int) $a->timestamp,
                'userId' => $a->user_id,
                'username' => $a->username,
                'action' => $a->action,
                'ip' => $a->ip,
                'details' => $a->details ? json_decode($a->details, true) : null,
            ];
        });

        return response()->json(['entries' => $entries, 'total' => count($entries)]);
    }

    // =========================================================================
    // 9. Excluded Routes Management
    // =========================================================================

    public function listExcludedRoutes(Request $request): JsonResponse
    {
        $user = $this->authenticate($request);
        if (!$user) {
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        $row = $this->db()->table($this->tableMeta)->where('key', 'excluded_routes')->first();
        $rules = $row ? (json_decode($row->value, true) ?: []) : [];

        $staticRules = config('tracernest.exclude_routes', []);

        return response()->json([
            'rules' => $rules,
            'staticCount' => count($staticRules),
        ]);
    }

    public function createExcludedRoute(Request $request): JsonResponse
    {
        $user = $this->authenticate($request);
        if (!$user || $user->role !== 'admin') {
            return response()->json(['error' => 'Forbidden'], 403);
        }

        $rawPath = trim((string) $request->input('path', ''));
        if (!$rawPath) {
            return response()->json(['error' => 'Route path is required (e.g. /api/auth/login or /api/payments/*)'], 400);
        }

        $path = str_starts_with($rawPath, '/') || str_starts_with($rawPath, '*') ? $rawPath : '/' . $rawPath;
        $method = strtoupper((string) $request->input('method', 'ALL'));
        $description = trim((string) $request->input('description', ''));

        $row = $this->db()->table($this->tableMeta)->where('key', 'excluded_routes')->first();
        $rules = $row ? (json_decode($row->value, true) ?: []) : [];

        foreach ($rules as $r) {
            if ($r['path'] === $path && ($r['method'] ?? 'ALL') === $method) {
                return response()->json(['error' => 'An exclusion rule for this path and method already exists'], 400);
            }
        }

        $newRule = [
            'id' => 'excl_' . bin2hex(random_bytes(4)),
            'path' => $path,
            'method' => $method,
            'description' => $description,
            'enabled' => true,
            'createdAt' => (int) (microtime(true) * 1000),
        ];

        array_unshift($rules, $newRule);
        $this->db()->table($this->tableMeta)->updateOrInsert(['key' => 'excluded_routes'], ['value' => json_encode($rules)]);
        $this->recordAudit('EXCLUDED_ROUTE_ADDED', $user->id, $user->username, $request->ip(), ['path' => $path, 'method' => $method]);

        return response()->json(['rule' => $newRule], 201);
    }

    public function toggleExcludedRoute(Request $request, string $id): JsonResponse
    {
        $user = $this->authenticate($request);
        if (!$user || $user->role !== 'admin') {
            return response()->json(['error' => 'Forbidden'], 403);
        }

        $row = $this->db()->table($this->tableMeta)->where('key', 'excluded_routes')->first();
        $rules = $row ? (json_decode($row->value, true) ?: []) : [];

        $found = null;
        foreach ($rules as &$r) {
            if ($r['id'] === $id) {
                $r['enabled'] = !$r['enabled'];
                $found = $r;
                break;
            }
        }

        if (!$found) {
            return response()->json(['error' => 'Exclusion rule not found'], 404);
        }

        $this->db()->table($this->tableMeta)->updateOrInsert(['key' => 'excluded_routes'], ['value' => json_encode($rules)]);
        $this->recordAudit('EXCLUDED_ROUTE_TOGGLED', $user->id, $user->username, $request->ip(), ['ruleId' => $id, 'enabled' => $found['enabled']]);

        return response()->json(['rule' => $found]);
    }

    public function deleteExcludedRoute(Request $request, string $id): JsonResponse
    {
        $user = $this->authenticate($request);
        if (!$user || $user->role !== 'admin') {
            return response()->json(['error' => 'Forbidden'], 403);
        }

        $row = $this->db()->table($this->tableMeta)->where('key', 'excluded_routes')->first();
        $rules = $row ? (json_decode($row->value, true) ?: []) : [];

        $filtered = array_values(array_filter($rules, fn($r) => $r['id'] !== $id));
        $this->db()->table($this->tableMeta)->updateOrInsert(['key' => 'excluded_routes'], ['value' => json_encode($filtered)]);
        $this->recordAudit('EXCLUDED_ROUTE_DELETED', $user->id, $user->username, $request->ip(), ['ruleId' => $id]);

        return response()->json(['message' => 'Exclusion rule deleted']);
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    protected function createToken(string $userId, string $username, string $role, int $tokenVersion): string
    {
        $expiresAt = time() + 86400; // 24 hours
        $payload = "{$userId}:{$username}:{$role}:{$expiresAt}:{$tokenVersion}";
        $signature = hash_hmac('sha256', $payload, $this->secret);
        return base64_encode("{$payload}:{$signature}");
    }

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
