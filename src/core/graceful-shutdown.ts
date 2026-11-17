import { Server } from 'node:http';
import { GracefulShutdownOptions } from '../types';
import type { TracerNestLogger, TraceNest, LogVault } from './logvault';

export class GracefulShutdownManager {
  private vault: TracerNestLogger;
  private server?: Server;
  private options: GracefulShutdownOptions;
  private isShuttingDown: boolean = false;
  private boundHandlers: Map<string, (...args: any[]) => void> = new Map();

  constructor(vault: TracerNestLogger, server?: Server, options: GracefulShutdownOptions = {}) {
    this.vault = vault;
    this.server = server;
    this.options = {
      timeoutMs: options.timeoutMs ?? 5000,
      signals: options.signals ?? ['SIGTERM', 'SIGINT'],
      exitProcess: options.exitProcess !== false,
      onShutdown: options.onShutdown
    };
  }

  public setServer(server: Server): void {
    this.server = server;
  }

  public attach(): void {
    const signals = this.options.signals || ['SIGTERM', 'SIGINT'];
    for (const signal of signals) {
      const handler = () => {
        this.shutdown(signal).catch((err) => {
          console.error(`[TracerNest-Logger] Error during graceful shutdown (${signal}):`, err);
          if (this.options.exitProcess) {
            process.exit(1);
          }
        });
      };
      this.boundHandlers.set(signal, handler);
      process.once(signal as any, handler);
    }
  }

  public detach(): void {
    for (const [signal, handler] of this.boundHandlers.entries()) {
      process.removeListener(signal as any, handler);
    }
    this.boundHandlers.clear();
  }

  public async shutdown(signal?: string): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    const sigText = signal ? ` on ${signal}` : '';

    try {
      this.vault.auditLogger.log({
        action: 'SERVER_GRACEFUL_SHUTDOWN',
        details: { signal: signal || 'manual', timestamp: Date.now() }
      });
    } catch {}

    // 1. Broadcast shutdown event to active SSE streams so browser dashboards show reconnection notice
    try {
      this.vault.streamManager.broadcast({
        id: `shutdown_${Date.now()}`,
        timestamp: Date.now(),
        level: 'warn',
        source: 'internal',
        message: `🛡️ [TracerNest-Logger] Server is performing graceful shutdown${sigText}...`,
        raw: `🛡️ [TracerNest-Logger] Server is performing graceful shutdown${sigText}...`
      });
    } catch {}

    // 2. Execute custom onShutdown hook if user provided one
    if (this.options.onShutdown) {
      try {
        await Promise.resolve(this.options.onShutdown());
      } catch (err: any) {
        console.error('[TracerNest-Logger] User onShutdown callback error:', err.message);
      }
    }

    // 3. Close the HTTP server if attached or created
    const serverToClose = this.server;
    if (serverToClose) {
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          resolve();
        }, Math.min(this.options.timeoutMs || 5000, 3000));
        if (timeout.unref) timeout.unref();

        serverToClose.close(() => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }

    // 4. Flush and stop TracerNest-Logger components
    this.vault.stop();

    if (this.options.exitProcess && signal) {
      process.exit(0);
    }
  }
}

