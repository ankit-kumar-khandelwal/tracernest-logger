<?php

namespace TracerNest;

use Illuminate\Support\ServiceProvider;
use TracerNest\Console\TracerNestInstallCommand;

/**
 * TracerNest Laravel Service Provider
 *
 * Automatically discovered by Laravel via package discovery.
 * On runtime boot:
 * 1. Checks and automatically scaffolds Controller, Middleware, and Config files.
 * 2. Defines TracerNestMiddleware in the Laravel Kernel.
 * 3. Registers dashboard and API routes.
 * 4. Provides 'php artisan tracernest:install' command.
 */
class TracerNestServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $configPath = __DIR__ . '/tracernest.php';
        if (file_exists($configPath)) {
            $this->mergeConfigFrom($configPath, 'tracernest');
        }
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // 1. Auto-create Controller, Middleware, and Config files & define in Kernel
        TracerNestInstaller::run();

        // 2. Automatically load TracerNest routes
        $routesPath = __DIR__ . '/routes.php';
        if (file_exists($routesPath)) {
            $this->loadRoutesFrom($routesPath);
        }

        // 3. Register Publishing Tags & Artisan Commands
        if ($this->app->runningInConsole()) {
            $this->publishes([
                __DIR__ . '/tracernest.php' => config_path('tracernest.php'),
            ], 'tracernest-config');

            $this->publishes([
                __DIR__ . '/TracerNestController.php' => app_path('Http/Controllers/TracerNestController.php'),
            ], 'tracernest-controller');

            $this->publishes([
                __DIR__ . '/TracerNestMiddleware.php' => app_path('Http/Middleware/TracerNestMiddleware.php'),
            ], 'tracernest-middleware');

            $this->publishes([
                __DIR__ . '/TracerNestMonologHandler.php' => app_path('Logging/TracerNestMonologHandler.php'),
            ], 'tracernest-monolog');

            $this->publishes([
                __DIR__ . '/tracernest.php' => config_path('tracernest.php'),
                __DIR__ . '/TracerNestController.php' => app_path('Http/Controllers/TracerNestController.php'),
                __DIR__ . '/TracerNestMiddleware.php' => app_path('Http/Middleware/TracerNestMiddleware.php'),
                __DIR__ . '/TracerNestMonologHandler.php' => app_path('Logging/TracerNestMonologHandler.php'),
            ], 'tracernest');

            $this->commands([
                TracerNestInstallCommand::class,
            ]);
        }
    }
}
