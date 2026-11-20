<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Symfony\Component\HttpFoundation\Response;

/**
 * TracerNest Telemetry Middleware for Laravel 13 / 12 / 11
 *
 * Automatically intercepts incoming HTTP requests, measures execution duration,
 * captures response status codes and bodies, redacts sensitive parameters,
 * and records telemetry to TracerNest via direct MySQL insert or asynchronous HTTP ingest.
 */
class TracerNestMiddleware
{
    /**
     * Handle an incoming request.
     */
    public function handle(Request $request, Closure $next): Response
    {
        $startTime = microtime(true);

        $response = $next($request);

        $durationMs = round((microtime(true) - $startTime) * 1000, 2);

        $this->recordTelemetry($request, $response, $durationMs);

        return $response;
    }

    /**
     * Records the HTTP request and response execution into TracerNest.
     */
    protected function recordTelemetry(Request $request, Response $response, float $durationMs): void
    {
        $statusCode = $response->getStatusCode();
        $level = $statusCode >= 500 ? 'error' : ($statusCode >= 400 ? 'warn' : 'info');
        $method = $request->method();
        $path = $request->path();
        $url = '/' . ltrim($path, '/');
        $clientIp = $request->ip() ?: '127.0.0.1';

        // Check excluded routes
        $excluded = config('tracernest.exclude_routes', ['/up', '/healthz', '/livewire/update']);
        foreach ($excluded as $ex) {
            if ($url === $ex || str_starts_with($url, rtrim($ex, '/') . '/')) {
                return;
            }
        }

        $message = sprintf('HTTP [%s] %s - %d (%.0fms)', $method, $url, $statusCode, $durationMs);

        // Sanitize sensitive request parameters
        $sanitizedInput = $this->sanitizePayload($request->all());

        // Extract response body (capped at 64KB for safety)
        $rawResponse = $response->getContent();
        $responseBody = null;
        if (is_string($rawResponse) && strlen($rawResponse) > 0 && strlen($rawResponse) <= 65536) {
            $responseBody = json_decode($rawResponse, true) ?? $rawResponse;
        }

        $metadata = [
            'framework' => 'laravel',
            'version' => '13',
            'http' => [
                'method' => $method,
                'url' => $url,
                'statusCode' => $statusCode,
                'durationMs' => $durationMs,
                'clientIp' => $clientIp,
                'requestBody' => $sanitizedInput,
                'responseBody' => $responseBody,
            ],
        ];

        // Mode 1: Direct MySQL table write (Zero HTTP overhead, shared database)
        $mode = config('tracernest.mode', 'database');
        $tableName = config('tracernest.table_prefix', 'tracenest_') . 'logs';

        if ($mode === 'database') {
            try {
                DB::table($tableName)->insert([
                    'id' => 'log_lar_' . bin2hex(random_bytes(8)),
                    'timestamp' => (int) (microtime(true) * 1000),
                    'level' => $level,
                    'source' => 'laravel',
                    'message' => $message,
                    'raw' => $message,
                    'metadata' => json_encode($metadata),
                    'tags' => json_encode(['laravel', 'laravel13', 'http']),
                ]);
                return;
            } catch (\Throwable $e) {
                // Silently fallback to HTTP mode if database write encounters an issue
            }
        }

        // Mode 2: Asynchronous HTTP Ingestion to TracerNest Telemetry Server
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
                    'message' => $message,
                    'timestamp' => (int) (microtime(true) * 1000),
                    'metadata' => $metadata,
                    'tags' => ['laravel', 'laravel13', 'http'],
                ]);
        } catch (\Throwable $e) {
            // Silently ignore so logging never disrupts client HTTP responses
        }
    }

    /**
     * Recursively masks sensitive credentials like passwords, tokens, and credit cards.
     */
    protected function sanitizePayload(array $data): array
    {
        $sensitiveKeys = ['password', 'password_confirmation', 'secret', 'token', 'credit_card', 'cvv', 'authorization', 'api_key'];
        foreach ($data as $key => $val) {
            if (is_array($val)) {
                $data[$key] = $this->sanitizePayload($val);
            } elseif (in_array(strtolower($key), $sensitiveKeys, true)) {
                $data[$key] = '••••••••••••';
            }
        }
        return $data;
    }
}
