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

        // Mode 1: Direct MySQL table write (Zero HTTP overhead, shared database)
        $mode = config('tracernest.mode', 'database');
        $tableName = config('tracernest.table_prefix', 'tracenest_') . 'logs';

        if ($mode === 'database') {
            try {
                DB::table($tableName)->insert([
                    'id' => 'log_mon_' . bin2hex(random_bytes(8)),
                    'timestamp' => (int) ($record->datetime->getTimestamp() * 1000),
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
        $apiKey = config('tracernest.key');

        try {
            Http::timeout(1)
                ->withHeaders([
                    'x-tracernest-key' => $apiKey,
                    'Content-Type' => 'application/json',
                ])
                ->post($endpoint . '/api/logs/ingest', [
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
