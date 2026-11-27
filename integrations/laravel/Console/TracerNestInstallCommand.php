<?php

namespace TracerNest\Console;

use Illuminate\Console\Command;
use TracerNest\TracerNestInstaller;

/**
 * Artisan command to scaffold TracerNest Controller, Middleware, Config,
 * and define TracerNestMiddleware in the Laravel Kernel file.
 *
 * Usage:
 *   php artisan tracernest:install
 *   php artisan tracernest:install --force
 */
class TracerNestInstallCommand extends Command
{
    /**
     * The name and signature of the console command.
     */
    protected $signature = 'tracernest:install {--force : Overwrite existing files if they already exist}';

    /**
     * The console command description.
     */
    protected $description = 'Automatically installs TracerNest Controller, Middleware, Config, and registers in Kernel';

    /**
     * Execute the console command.
     */
    public function handle(): int
    {
        $this->info('╔═══════════════════════════════════════════════════════════════════╗');
        $this->info('║  TracerNest Telemetry & Flight Recorder Laravel 13 Installer     ║');
        $this->info('╚═══════════════════════════════════════════════════════════════════╝');
        $this->newLine();

        $force = (bool) $this->option('force');

        $this->comment('Verifying and scaffolding required components...');

        $results = TracerNestInstaller::run($force);

        $this->line("  • Config File        : <info>{$results['config']}</info>");
        $this->line("  • Controller File    : <info>{$results['controller']}</info>");
        $this->line("  • Middleware File    : <info>{$results['middleware']}</info>");
        $this->line("  • Monolog Handler    : <info>{$results['monolog']}</info>");
        $this->line("  • Kernel Registration: <info>{$results['kernel']}</info>");

        $this->newLine();
        $this->info('✓ TracerNest successfully configured and active in your Laravel application!');
        $this->line('  Dashboard URL: <comment>' . url(config('tracernest.path', '/tracernest')) . '</comment>');

        return Command::SUCCESS;
    }
}
