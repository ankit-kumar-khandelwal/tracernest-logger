<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Master Telemetry Enable / Disable Switch
    |--------------------------------------------------------------------------
    |
    | When set to false, TracerNest completely bypasses request interception
    | and Monolog writing. Useful for testing or disabling in specific environments.
    |
    */
    'enabled' => env('TRACERNEST_ENABLED', true),

    /*
    |--------------------------------------------------------------------------
    | TracerNest Telemetry Mode
    |--------------------------------------------------------------------------
    |
    | 'database' : Writes telemetry logs directly to TracerNest's tables
    |              ('tracenest_logs') using Laravel's existing DB connection.
    |              Zero network HTTP latency. 0ms overhead. (Recommended).
    |
    | 'http'     : Sends telemetry logs via asynchronous HTTP POST to a remote
    |              or standalone TracerNest server.
    |
    */
    'mode' => env('TRACERNEST_MODE', 'database'),

    /*
    |--------------------------------------------------------------------------
    | Database Connection
    |--------------------------------------------------------------------------
    |
    | The name of the database connection from config/database.php to use.
    | Set to null to use your default application database connection.
    | Supported: 'mysql', 'sqlite', 'mariadb', 'pgsql'.
    |
    */
    'connection' => env('TRACERNEST_DB_CONNECTION', null),

    /*
    |--------------------------------------------------------------------------
    | Database Table Prefix
    |--------------------------------------------------------------------------
    |
    | Table name prefix used in TracerNest database (default: 'tracenest_').
    | Creates 'tracenest_logs', 'tracenest_users', etc.
    |
    */
    'table_prefix' => env('TRACERNEST_TABLE_PREFIX', 'tracenest_'),

    /*
    |--------------------------------------------------------------------------
    | Dashboard Mount Path Prefix
    |--------------------------------------------------------------------------
    |
    | The URL path where the TracerNest dashboard will be accessible on your
    | existing Laravel server. Default is '/tracernest'.
    |
    */
    'path' => env('TRACERNEST_PATH', '/tracernest'),

    /*
    |--------------------------------------------------------------------------
    | TracerNest Master / Secret Key
    |--------------------------------------------------------------------------
    |
    | The master secret key used to sign session tokens and encrypt payloads.
    | Defaults to your Laravel APP_KEY.
    |
    */
    'key' => env('TRACERNEST_KEY', env('APP_KEY')),

    /*
    |--------------------------------------------------------------------------
    | Standalone Server Endpoint (HTTP Mode Only)
    |--------------------------------------------------------------------------
    |
    | URL where the remote TracerNest standalone server is running.
    | Only utilized when 'mode' => 'http'.
    |
    */
    'endpoint' => env('TRACERNEST_ENDPOINT', 'http://127.0.0.1:8001/tracernest'),

    /*
    |--------------------------------------------------------------------------
    | Excluded Routes
    |--------------------------------------------------------------------------
    |
    | Routes and URL prefixes that should be completely excluded from HTTP
    | request and response telemetry recording (e.g., health probes, livewire).
    |
    */
    'exclude_routes' => [
        '/up',
        '/healthz',
        '/health',
        '/livewire/update',
        '/sanctum/csrf-cookie',
        '/_ignition/*',
    ],

    /*
    |--------------------------------------------------------------------------
    | Sensitive Field Redaction Keys
    |--------------------------------------------------------------------------
    |
    | JSON body and query parameter keys whose values are masked with
    | '••••••••••••' before being stored or broadcast.
    |
    */
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

    /*
    |--------------------------------------------------------------------------
    | Payload Capture Size Limit
    |--------------------------------------------------------------------------
    |
    | Maximum byte size of request and response bodies captured into telemetry.
    | Payloads exceeding this threshold are safely truncated to protect RAM.
    | Default: 65536 bytes (64 KB).
    |
    */
    'body_size_limit' => (int) env('TRACERNEST_BODY_LIMIT', 65536),

    /*
    |--------------------------------------------------------------------------
    | Log Retention Days (TTL)
    |--------------------------------------------------------------------------
    |
    | Number of days to retain logs in database before expiration.
    | Default: 30 days. Set to 0 to retain indefinitely.
    |
    */
    'retention_days' => (int) env('TRACERNEST_RETENTION_DAYS', 30),

];
