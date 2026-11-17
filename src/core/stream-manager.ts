import { ServerResponse } from 'node:http';
import { LogEntry, LogLevel } from '../types';

interface StreamClient {
  id: string;
  res: ServerResponse;
  levelFilter?: LogLevel | 'all';
  searchFilter?: string;
  connectedAt: number;
}

export class StreamManager {
  private clients: Map<string, StreamClient> = new Map();
  private heartbeatTimer: NodeJS.Timeout | null = null;

  constructor() {
    // Send keepalive ping every 15 seconds
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, 15000);
    if (this.heartbeatTimer.unref) {
      this.heartbeatTimer.unref();
    }
  }

  /**
   * Register a new SSE client
   */
  public addClient(
    id: string,
    res: ServerResponse,
    options?: { level?: LogLevel | 'all'; search?: string }
  ): void {
    // Set headers for SSE stream with no-cache and anti-buffering headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no' // Disables proxy response buffering in NGINX
    });

    // Send initial handshake event
    res.write(`event: ready\ndata: ${JSON.stringify({ clientId: id, status: 'connected' })}\n\n`);

    const client: StreamClient = {
      id,
      res,
      levelFilter: options?.level,
      searchFilter: options?.search?.toLowerCase(),
      connectedAt: Date.now()
    };

    this.clients.set(id, client);

    // Clean up when client disconnects
    res.on('close', () => {
      this.clients.delete(id);
    });

    res.on('error', () => {
      this.clients.delete(id);
    });
  }

  /**
   * Broadcast a new log entry to all eligible connected clients
   */
  public broadcast(entry: LogEntry): void {
    if (this.clients.size === 0) return;

    const dataPayload = `event: log\ndata: ${JSON.stringify(entry)}\n\n`;

    for (const [id, client] of this.clients.entries()) {
      try {
        // Filter by level if requested
        if (
          client.levelFilter &&
          client.levelFilter !== 'all' &&
          client.levelFilter !== entry.level
        ) {
          continue;
        }

        // Filter by search query if requested
        if (client.searchFilter && !entry.message.toLowerCase().includes(client.searchFilter)) {
          continue;
        }

        client.res.write(dataPayload);
      } catch {
        // Failed to write to disconnected client; remove it
        this.clients.delete(id);
      }
    }
  }

  /**
   * Send ping comments to keep connections alive and purge dead connections
   */
  private sendHeartbeat(): void {
    for (const [id, client] of this.clients.entries()) {
      try {
        client.res.write(': ping\n\n');
      } catch {
        this.clients.delete(id);
      }
    }
  }

  /**
   * Return number of currently active SSE streams
   */
  public getActiveCount(): number {
    return this.clients.size;
  }

  public destroy(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    for (const client of this.clients.values()) {
      try {
        client.res.end();
      } catch {
        // Ignore
      }
    }
    this.clients.clear();
  }
}

