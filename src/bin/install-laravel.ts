#!/usr/bin/env node

/**
 * TracerNest Telemetry & Flight Recorder Laravel 13 Installer CLI
 *
 * Automatically scaffolds Controller, Middleware, Config, and registers
 * TracerNestMiddleware in Laravel's Kernel file (app/Http/Kernel.php or bootstrap/app.php).
 *
 * Usage:
 *   npx tracernest-install-laravel
 *   npx tracernest-install-laravel --force
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';

export function runLaravelInstaller(cliArgs: string[] = process.argv.slice(2)): void {
  const force = cliArgs.includes('--force') || cliArgs.includes('-f');
  let targetDir = process.cwd();

  for (let i = 0; i < cliArgs.length; i++) {
    if (cliArgs[i] === '--path' || cliArgs[i] === '-p') {
      targetDir = resolve(cliArgs[i + 1] || targetDir);
    } else if (cliArgs[i].startsWith('--path=')) {
      targetDir = resolve(cliArgs[i].slice(7));
    }
  }

  console.log('\x1b[36m╔═══════════════════════════════════════════════════════════════════╗\x1b[0m');
  console.log('\x1b[36m║  TracerNest Telemetry & Flight Recorder Laravel 13 Installer     ║\x1b[0m');
  console.log('\x1b[36m╚═══════════════════════════════════════════════════════════════════╝\x1b[0m\n');

  // Verify Laravel root directory
  const isLaravel = existsSync(join(targetDir, 'artisan')) || existsSync(join(targetDir, 'bootstrap', 'app.php'));
  if (!isLaravel) {
    console.warn(`\x1b[33mWarning:\x1b[0m Directory '${targetDir}' does not appear to be a Laravel root folder (artisan not found).`);
  }

  // Locate integrations/laravel folder
  const possibleSourceDirs = [
    resolve(__dirname, '..', '..', 'integrations', 'laravel'),
    resolve(__dirname, '..', 'integrations', 'laravel'),
    resolve(targetDir, 'node_modules', 'tracernest-logger', 'integrations', 'laravel'),
    resolve(__dirname, 'integrations', 'laravel')
  ];

  let sourceDir = '';
  for (const dir of possibleSourceDirs) {
    if (existsSync(join(dir, 'TracerNestMiddleware.php'))) {
      sourceDir = dir;
      break;
    }
  }

  if (!sourceDir) {
    console.error('\x1b[31mError:\x1b[0m Could not locate TracerNest Laravel integration assets.');
    process.exit(1);
  }

  function copyFile(relSource: string, relTarget: string, label: string): string {
    const src = join(sourceDir, relSource);
    const dst = join(targetDir, relTarget);

    if (!existsSync(src)) {
      return `\x1b[33mskipped (missing source: ${relSource})\x1b[0m`;
    }

    if (existsSync(dst) && !force) {
      return `\x1b[90malready exists (${relTarget})\x1b[0m`;
    }

    const parent = dirname(dst);
    if (!existsSync(parent)) {
      mkdirSync(parent, { recursive: true });
    }

    try {
      copyFileSync(src, dst);
      return `\x1b[32mcreated (${relTarget})\x1b[0m`;
    } catch (e: any) {
      return `\x1b[31mfailed (${e.message})\x1b[0m`;
    }
  }

  console.log('Scaffolding TracerNest components:');
  const configRes = copyFile('tracernest.php', 'config/tracernest.php', 'config');
  const ctrlRes = copyFile('TracerNestController.php', 'app/Http/Controllers/TracerNestController.php', 'controller');
  const dashRes = copyFile('dashboard.html', 'app/Http/Controllers/dashboard.html', 'dashboard');
  const midRes = copyFile('TracerNestMiddleware.php', 'app/Http/Middleware/TracerNestMiddleware.php', 'middleware');
  const monoRes = copyFile('TracerNestMonologHandler.php', 'app/Logging/TracerNestMonologHandler.php', 'monolog');

  console.log(`  • Config File        : ${configRes}`);
  console.log(`  • Controller File    : ${ctrlRes}`);
  console.log(`  • Dashboard HTML     : ${dashRes}`);
  console.log(`  • Middleware File    : ${midRes}`);
  console.log(`  • Monolog Handler    : ${monoRes}`);

  // Register in Kernel: app/Http/Kernel.php or bootstrap/app.php
  let kernelRes = '\x1b[90mnot required (runtime dynamic push)\x1b[0m';

  // 1. Check Laravel 9/10 app/Http/Kernel.php
  const kernelFile = join(targetDir, 'app', 'Http', 'Kernel.php');
  if (existsSync(kernelFile)) {
    try {
      const content = readFileSync(kernelFile, 'utf8');
      if (!content.includes('TracerNestMiddleware')) {
        const pattern = /(protected\s+\$middleware\s*=\s*\[)([\s\S]*?)(\];)/;
        if (pattern.test(content)) {
          const updated = content.replace(pattern, `$1$2    \\App\\Http\\Middleware\\TracerNestMiddleware::class,\n$3`);
          writeFileSync(kernelFile, updated, 'utf8');
          kernelRes = '\x1b[32mdefined in app/Http/Kernel.php\x1b[0m';
        }
      } else {
        kernelRes = '\x1b[90malready present in app/Http/Kernel.php\x1b[0m';
      }
    } catch {}
  }

  // 2. Check Laravel 11/12/13 bootstrap/app.php
  const bootstrapFile = join(targetDir, 'bootstrap', 'app.php');
  if (existsSync(bootstrapFile)) {
    try {
      const content = readFileSync(bootstrapFile, 'utf8');
      if (!content.includes('TracerNestMiddleware')) {
        if (/->withMiddleware\s*\(\s*function\s*\(\s*Middleware\s*\$middleware\s*\)\s*\{/.test(content)) {
          const updated = content.replace(
            /(->withMiddleware\s*\(\s*function\s*\(\s*Middleware\s*\$middleware\s*\)\s*\{)/,
            `$1\n        $middleware->append(\\App\\Http\\Middleware\\TracerNestMiddleware::class);`
          );
          writeFileSync(bootstrapFile, updated, 'utf8');
          kernelRes = '\x1b[32mdefined in bootstrap/app.php\x1b[0m';
        } else if (/->withMiddleware\s*\(\s*function\s*\(\s*\$middleware\s*\)\s*\{/.test(content)) {
          const updated = content.replace(
            /(->withMiddleware\s*\(\s*function\s*\(\s*\$middleware\s*\)\s*\{)/,
            `$1\n        $middleware->append(\\App\\Http\\Middleware\\TracerNestMiddleware::class);`
          );
          writeFileSync(bootstrapFile, updated, 'utf8');
          kernelRes = '\x1b[32mdefined in bootstrap/app.php\x1b[0m';
        }
      } else {
        kernelRes = '\x1b[90malready present in bootstrap/app.php\x1b[0m';
      }
    } catch {}
  }

  console.log(`  • Kernel Registration: ${kernelRes}`);

  // 3. Register routes in routes/web.php
  const webRoutesFile = join(targetDir, 'routes', 'web.php');
  if (existsSync(webRoutesFile)) {
    try {
      const content = readFileSync(webRoutesFile, 'utf8');
      if (!content.includes('tracernest-logger/integrations/laravel/routes.php')) {
        const snippet = `\n// TracerNest Operations Dashboard & Telemetry Routes\nrequire base_path('node_modules/tracernest-logger/integrations/laravel/routes.php');\n`;
        writeFileSync(webRoutesFile, content + snippet, 'utf8');
        console.log(`  • Web Routes File    : \x1b[32mmounted in routes/web.php\x1b[0m`);
      } else {
        console.log(`  • Web Routes File    : \x1b[90malready mounted in routes/web.php\x1b[0m`);
      }
    } catch {}
  }

  console.log('\n\x1b[32m✓ TracerNest integration successfully installed!\x1b[0m');
  console.log('  Start your Laravel server (\x1b[36mphp artisan serve\x1b[0m) and navigate to:');
  console.log('  \x1b[33mhttp://localhost:8000/tracernest\x1b[0m\n');
}

if (require.main === module) {
  runLaravelInstaller();
}
