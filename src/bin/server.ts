#!/usr/bin/env node

/**
 * TracerNest Telemetry Server CLI
 *
 * Standalone telemetry server and dashboard runner designed for standalone services,
 * microservices, and modern PHP frameworks like Laravel 13.
 *
 * Usage:
 *   npx tracernest-server [options]
 *   npm run telemetry
 */

import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { TracerNestLogger } from '../core/logvault';

export function runServer(cliArgs: string[] = process.argv.slice(2)): void {
  function getArg(flag: string, shortFlag?: string): string | undefined {
    for (let i = 0; i < cliArgs.length; i++) {
      if (cliArgs[i] === flag || (shortFlag && cliArgs[i] === shortFlag)) {
        return cliArgs[i + 1];
      }
      if (cliArgs[i].startsWith(flag + '=')) {
        return cliArgs[i].slice(flag.length + 1);
      }
    }
    return undefined;
  }

  if (cliArgs.includes('--help') || cliArgs.includes('-h')) {
    console.log(`
================================================================================
🪺  TracerNest Telemetry Server CLI
================================================================================

Usage:
  npx tracernest-server [options]

Options:
  --port, -p <number>     Server port (default: 8001)
  --host <host>           Host to bind (default: 0.0.0.0)
  --path <path>           Dashboard mount URL path (default: /tracernest)
  --folder, -d <folder>   Storage folder directory (default: ./.tracernest)
  --dialect <dialect>     Database dialect: sqlite or mysql (default: sqlite)
  --key <masterKey>       Persistent 32+ character master encryption key
  --title <title>         Dashboard title (default: TracerNest Telemetry)
  --prefix <prefix>       Database table prefix (default: tracenest_)
  --help                  Display this help manual

Examples:
  npx tracernest-server
  npx tracernest-server --port 8001 --dialect mysql
  npx tracernest-server --port 9000 --folder ./storage/tracernest
`);
    process.exit(0);
  }

  const port = parseInt(getArg('--port', '-p') || '8001', 10);
  const host = getArg('--host') || '0.0.0.0';
  const mountPath = getArg('--path') || '/tracernest';
  const folder = getArg('--folder') || getArg('--dir', '-d') || './.tracernest';
  const dialect = (getArg('--dialect') as any) === 'mysql' ? 'mysql' : 'sqlite';
  const masterKey = getArg('--key');
  const title = getArg('--title') || 'TracerNest Telemetry';
  const tablePrefix = getArg('--prefix') || 'tracenest_';

  const isLaravelProject = existsSync(resolve(process.cwd(), 'artisan'));

  console.log('\n================================================================================');
  console.log('🪺  TracerNest Telemetry Server');
  console.log('================================================================================');
  if (isLaravelProject) {
    console.log('⚡ Laravel project detected in current workspace!');
    console.log('   TracerNest is running as your real-time telemetry flight recorder.');
  }

  const tracer = new TracerNestLogger({
    path: mountPath,
    title,
    folder,
    dialect,
    masterKey,
    tablePrefix,
    interceptStdout: false,
    interceptStderr: false,
    interceptHttp: false
  });

  const server = createServer((req, res) => {
    tracer.handleRequest(req, res).then(handled => {
      if (!handled && !res.headersSent) {
        if (req.url === '/' || req.url === '') {
          res.writeHead(302, { Location: mountPath });
          res.end();
          return;
        }
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not Found', path: req.url }));
      }
    }).catch(err => {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal Server Error', message: err?.message }));
      }
    });
  });

  server.listen(port, host, () => {
    const displayHost = host === '0.0.0.0' ? '127.0.0.1' : host;
    console.log(`\n  Dashboard URL : http://${displayHost}:${port}${mountPath}`);
    console.log(`  Ingest API    : http://${displayHost}:${port}${mountPath}/api/logs/ingest`);
    console.log(`  Storage Mode  : ${dialect.toUpperCase()} (${folder})`);
    console.log(`  Security      : AES-256-GCM AEAD encryption active\n`);
    console.log('Ready to receive telemetry. Press Ctrl+C to terminate.');
  });

  const shutdown = () => {
    console.log('\n[TracerNest] Shutting down gracefully...');
    server.close(() => {
      tracer.stop();
      tracer.sqlStore.close();
      console.log('[TracerNest] Server stopped cleanly.');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// Auto-run if executed directly as a script
if (require.main === module) {
  runServer();
}
