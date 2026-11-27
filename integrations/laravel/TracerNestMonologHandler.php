<?php

namespace App\Logging;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Monolog\Handler\AbstractProcessingHandler;
use Monolog\LogRecord;

/**
 * TracerNest Monolog 3 Handler for Laravel 13 / 12 / 11
 *
 * Directs Log::info(), Log::error(), Log::warning(), and exception traces
 * directly into TracerNest (either via direct MySQL table insertion or HTTP ingest).
 */
class TracerNestMonologHandler extends AbstractProcessingHandler
{
    protected function write(LogRecord $record): void
    {
        if (!config('tracernest.enabled', true)) {
            return;
        }

        $levelName = strtolower($record->level->getName());
        $level = match ($levelName) {
            'emergency', 'alert', 'critical', 'error' => 'error',
            'warning', 'notice' => 'warn',
            'debug' => 'debug',
            default => 'info',
        };

        $context = $record->context;
        if (isset($context['exception']) && $context['exception'] instanceof \Throwable) {
            $e = $context['exception'];
            $context['exception'] = [
                'class' => get_class($e),
                'message' => $e->getMessage(),
                'file' => $e->getFile(),
                'line' => $e->getLine(),
                'trace' => array_slice(explode("\n", $e->getTraceAsString()), 0, 15),
            ];
        }

        $metadata = [
            'framework' => 'laravel',
            'version' => '13',
            'channel' => $record->channel,
            'context' => $context,
            'extra' => $record->extra,
        ];

        $retentionDays = (int) config('tracernest.retention_days', 30);
        $expiresAt = $retentionDays > 0 ? (int) ((microtime(true) + ($retentionDays * 86400)) * 1000) : null;

        // Mode 1: Direct MySQL table write (Zero HTTP overhead, shared database)
        $mode = config('tracernest.mode', 'database');
        $tableName = config('tracernest.table_prefix', 'tracenest_') . 'logs';
        $connection = config('tracernest.connection', null);

        if ($mode === 'database') {
            try {
                DB::connection($connection)->table($tableName)->insert([
                    'id' => 'log_mon_' . bin2hex(random_bytes(8)),
                    'timestamp' => (int) ($record->datetime->getTimestamp() * 1000),
                    'expires_at' => $expiresAt,
                    'level' => $level,
                    'source' => 'laravel',
                    'message' => $record->message,
                    'raw' => $record->message,
                    'metadata' => json_encode($metadata),
                    'tags' => json_encode(['laravel', 'laravel13', 'monolog', $record->channel]),
                ]);
                return;
            } catch (\Throwable $e) {
                // Silently fallback to HTTP mode if database write encounters an issue
            }
        }

        // Mode 2: Asynchronous HTTP Ingestion to TracerNest Server
        $endpoint = rtrim(config('tracernest.endpoint', 'http://127.0.0.1:8001/tracernest'), '/');
        $rawPath = config('tracernest.path');
        if ((empty($rawPath) || $rawPath === '/tracernest') && !empty($endpoint)) {
            $epPath = parse_url($endpoint, PHP_URL_PATH);
            if (!empty($epPath) && $epPath !== '/') {
                $rawPath = $epPath;
            }
        }
        $tracernestPrefix = '/' . trim($rawPath ?: '/tracernest', '/');

        // Automatically synchronize and take the prefix of routing if endpoint has no path component
        $parsedEndpoint = parse_url($endpoint);
        $endpointPath = $parsedEndpoint['path'] ?? '';
        if (empty($endpointPath) || $endpointPath === '/') {
            $endpoint = rtrim($endpoint, '/') . $tracernestPrefix;
        }

        // Avoid double-appending /api/logs/ingest if already present
        $ingestUrl = $endpoint;
        if (!str_ends_with($ingestUrl, '/api/logs/ingest') && !str_ends_with($ingestUrl, '/api/ingest')) {
            $ingestUrl = rtrim($ingestUrl, '/') . '/api/logs/ingest';
        }

        $apiKey = config('tracernest.key');

        try {
            Http::timeout(1)
                ->withHeaders([
                    'x-tracernest-key' => $apiKey,
                    'Content-Type' => 'application/json',
                ])
                ->post($ingestUrl, [
                    'level' => $level,
                    'source' => 'laravel',
                    'message' => $record->message,
                    'timestamp' => (int) ($record->datetime->getTimestamp() * 1000),
                    'metadata' => $metadata,
                    'tags' => ['laravel', 'laravel13', 'monolog', $record->channel],
                ]);
        } catch (\Throwable $e) {
            // Silently ignore to never disrupt application execution
        }
    }
}
