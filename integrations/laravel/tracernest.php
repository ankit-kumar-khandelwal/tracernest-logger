<?php

return [

    /*
    |--------------------------------------------------------------------------
    | TracerNest Telemetry Mode
    |--------------------------------------------------------------------------
    |
    | 'database' : Writes telemetry logs directly to TracerNest's MySQL table
    |              ('tracenest_logs') using Laravel's existing DB connection.
    |              Zero network HTTP latency. (Recommended when using MySQL).
    |
    | 'http'     : Sends telemetry logs via asynchronous HTTP POST to the
    |              TracerNest standalone dashboard server.
    |
    */
    'mode' => env('TRACERNEST_MODE', 'database'),

    /*
    |--------------------------------------------------------------------------
    | TracerNest Telemetry Server Endpoint (HTTP Mode)
    |--------------------------------------------------------------------------
    |
    | URL where the TracerNest standalone server is running.
    |
    */
    'endpoint' => env('TRACERNEST_ENDPOINT', 'http://127.0.0.1:8001/tracernest'),

    /*
    |--------------------------------------------------------------------------
    | TracerNest Master / Ingest API Key
    |--------------------------------------------------------------------------
    |
    | The master encryption key or API key configured on TracerNest.
    |
    */
    'key' => env('TRACERNEST_KEY', env('APP_KEY')),

    /*
    |--------------------------------------------------------------------------
    | Database Table Prefix
    |--------------------------------------------------------------------------
    |
    | Table name prefix used in TracerNest database (default: 'tracenest_').
    |
    */
    'table_prefix' => env('TRACERNEST_TABLE_PREFIX', 'tracenest_'),

    /*
    |--------------------------------------------------------------------------
    | Excluded Routes
    |--------------------------------------------------------------------------
    |
    | API routes that should be excluded from HTTP request/response capture.
    |
    */
    'exclude_routes' => [
        '/up',
        '/healthz',
        '/livewire/update',
        '/sanctum/csrf-cookie',
    ],

];
