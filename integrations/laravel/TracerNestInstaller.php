<?php

namespace TracerNest;

/**
 * TracerNest Automated Runtime Scaffolding & Kernel Integration
 *
 * Automatically verifies, scaffolds, and publishes required files:
 * 1. config/tracernest.php
 * 2. app/Http/Controllers/TracerNestController.php
 * 3. app/Http/Middleware/TracerNestMiddleware.php
 * 4. app/Logging/TracerNestMonologHandler.php
 *
 * And automatically registers TracerNestMiddleware in the Laravel HTTP Kernel:
 * - app/Http/Kernel.php (Laravel 9, 10 & legacy setups)
 * - bootstrap/app.php (Laravel 11, 12, 13)
 * - In-memory runtime Kernel push ($kernel->pushMiddleware)
 */
class TracerNestInstaller
{
    protected static bool $alreadyRan = false;

    /**
     * Executes automatic runtime scaffolding and Kernel registration.
     */
    public static function run(bool $force = false): array
    {
        if (self::$alreadyRan && !$force) {
            return ['status' => 'already_run'];
        }
        self::$alreadyRan = true;

        $results = [
            'config' => self::createConfigFile($force),
            'controller' => self::createControllerFile($force),
            'dashboard' => self::createDashboardFile($force),
            'middleware' => self::createMiddlewareFile($force),
            'monolog' => self::createMonologHandlerFile($force),
            'kernel' => self::defineInKernel(),
        ];

        self::registerRuntimeMiddleware();

        return $results;
    }

    /**
     * Resolves the Laravel application base path.
     */
    public static function getBasePath(string $relative = ''): string
    {
        if (function_exists('base_path')) {
            return base_path($relative);
        }

        $dir = __DIR__;
        for ($i = 0; $i < 6; $i++) {
            if (file_exists($dir . '/artisan') || file_exists($dir . '/composer.json')) {
                return rtrim($dir . '/' . ltrim($relative, '/'), '/');
            }
            $parent = dirname($dir);
            if ($parent === $dir) {
                break;
            }
            $dir = $parent;
        }

        return rtrim(getcwd() . '/' . ltrim($relative, '/'), '/');
    }

    /**
     * Automatically creates config/tracernest.php if not present.
     */
    public static function createConfigFile(bool $force = false): string
    {
        $target = function_exists('config_path') 
            ? config_path('tracernest.php') 
            : self::getBasePath('config/tracernest.php');

        $source = __DIR__ . '/tracernest.php';

        return self::copyIfMissing($source, $target, $force, 'config/tracernest.php');
    }

    /**
     * Automatically creates app/Http/Controllers/TracerNestController.php if not present.
     */
    public static function createControllerFile(bool $force = false): string
    {
        $target = function_exists('app_path') 
            ? app_path('Http/Controllers/TracerNestController.php') 
            : self::getBasePath('app/Http/Controllers/TracerNestController.php');

        $source = __DIR__ . '/TracerNestController.php';

        return self::copyIfMissing($source, $target, $force, 'app/Http/Controllers/TracerNestController.php');
    }

    /**
     * Automatically creates app/Http/Controllers/dashboard.html if not present.
     */
    public static function createDashboardFile(bool $force = false): string
    {
        $target = function_exists('app_path') 
            ? app_path('Http/Controllers/dashboard.html') 
            : self::getBasePath('app/Http/Controllers/dashboard.html');

        $source = __DIR__ . '/dashboard.html';

        return self::copyIfMissing($source, $target, $force, 'app/Http/Controllers/dashboard.html');
    }

    /**
     * Automatically creates app/Http/Middleware/TracerNestMiddleware.php if not present.
     */
    public static function createMiddlewareFile(bool $force = false): string
    {
        $target = function_exists('app_path') 
            ? app_path('Http/Middleware/TracerNestMiddleware.php') 
            : self::getBasePath('app/Http/Middleware/TracerNestMiddleware.php');

        $source = __DIR__ . '/TracerNestMiddleware.php';

        return self::copyIfMissing($source, $target, $force, 'app/Http/Middleware/TracerNestMiddleware.php');
    }

    /**
     * Automatically creates app/Logging/TracerNestMonologHandler.php if not present.
     */
    public static function createMonologHandlerFile(bool $force = false): string
    {
        $target = function_exists('app_path') 
            ? app_path('Logging/TracerNestMonologHandler.php') 
            : self::getBasePath('app/Logging/TracerNestMonologHandler.php');

        $source = __DIR__ . '/TracerNestMonologHandler.php';

        return self::copyIfMissing($source, $target, $force, 'app/Logging/TracerNestMonologHandler.php');
    }

    /**
     * Safely copies source file to target directory if missing or forced.
     */
    protected static function copyIfMissing(string $source, string $target, bool $force, string $label): string
    {
        if (!file_exists($source)) {
            return "skipped (source missing: {$source})";
        }

        if (file_exists($target) && !$force) {
            return "exists ({$label})";
        }

        $dir = dirname($target);
        if (!is_dir($dir)) {
            @mkdir($dir, 0755, true);
        }

        if (@copy($source, $target)) {
            return "created ({$label})";
        }

        return "failed to write ({$label})";
    }

    /**
     * Defines TracerNestMiddleware in Laravel Kernel file:
     * - Checks app/Http/Kernel.php (Laravel 9/10/legacy)
     * - Checks bootstrap/app.php (Laravel 11, 12, 13)
     */
    public static function defineInKernel(): string
    {
        $status = [];

        // 1. Check Laravel 9/10 Kernel: app/Http/Kernel.php
        $kernelPath = function_exists('app_path') 
            ? app_path('Http/Kernel.php') 
            : self::getBasePath('app/Http/Kernel.php');

        if (file_exists($kernelPath) && is_writable($kernelPath)) {
            $content = file_get_contents($kernelPath);
            if (!str_contains($content, 'TracerNestMiddleware')) {
                // Insert into global middleware stack $middleware = [ ...
                $pattern = '/(protected\s+\$middleware\s*=\s*\[)([^\]]*?)(\];)/s';
                if (preg_match($pattern, $content)) {
                    $replacement = "$1$2    \\App\\Http\\Middleware\\TracerNestMiddleware::class,\n$3";
                    $updated = preg_replace($pattern, $replacement, $content, 1);
                    if ($updated && file_put_contents($kernelPath, $updated) !== false) {
                        $status[] = 'defined in app/Http/Kernel.php';
                    }
                }
            } else {
                $status[] = 'already present in app/Http/Kernel.php';
            }
        }

        // 2. Check Laravel 11/12/13: bootstrap/app.php
        $bootstrapAppPath = self::getBasePath('bootstrap/app.php');
        if (file_exists($bootstrapAppPath) && is_writable($bootstrapAppPath)) {
            $content = file_get_contents($bootstrapAppPath);
            if (!str_contains($content, 'TracerNestMiddleware')) {
                // Case A: withMiddleware closure exists
                if (preg_match('/(->withMiddleware\s*\(\s*function\s*\(\s*Middleware\s*\$middleware\s*\)\s*\{)/s', $content)) {
                    $replacement = "$1\n        \$middleware->append(\\App\\Http\\Middleware\\TracerNestMiddleware::class);";
                    $updated = preg_replace('/(->withMiddleware\s*\(\s*function\s*\(\s*Middleware\s*\$middleware\s*\)\s*\{)/s', $replacement, $content, 1);
                    if ($updated && file_put_contents($bootstrapAppPath, $updated) !== false) {
                        $status[] = 'defined in bootstrap/app.php';
                    }
                } elseif (preg_match('/(->withMiddleware\s*\(\s*function\s*\(\s*\$middleware\s*\)\s*\{)/s', $content)) {
                    $replacement = "$1\n        \$middleware->append(\\App\\Http\\Middleware\\TracerNestMiddleware::class);";
                    $updated = preg_replace('/(->withMiddleware\s*\(\s*function\s*\(\s*\$middleware\s*\)\s*\{)/s', $replacement, $content, 1);
                    if ($updated && file_put_contents($bootstrapAppPath, $updated) !== false) {
                        $status[] = 'defined in bootstrap/app.php';
                    }
                }
            } else {
                $status[] = 'already present in bootstrap/app.php';
            }
        }

        if (empty($status)) {
            return 'in-memory runtime registered';
        }

        return implode(', ', $status);
    }

    /**
     * Dynamically registers the middleware into the active HTTP Kernel in memory.
     * Guarantees that TracerNest intercepts requests even if physical file write permissions are restricted.
     */
    public static function registerRuntimeMiddleware(): void
    {
        if (!function_exists('app')) {
            return;
        }

        try {
            $app = app();
            if ($app && $app->bound(\Illuminate\Contracts\Http\Kernel::class)) {
                $kernel = $app->make(\Illuminate\Contracts\Http\Kernel::class);
                if (method_exists($kernel, 'pushMiddleware')) {
                    $kernel->pushMiddleware(\App\Http\Middleware\TracerNestMiddleware::class);
                }
            }

            if ($app && $app->bound('router')) {
                $router = $app->make('router');
                if (method_exists($router, 'pushMiddlewareToGroup')) {
                    $router->pushMiddlewareToGroup('web', \App\Http\Middleware\TracerNestMiddleware::class);
                }
            }
        } catch (\Throwable $e) {
            // Silently continue
        }
    }
}
