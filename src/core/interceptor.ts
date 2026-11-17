import { randomBytes } from 'node:crypto';
import { LogEntry, LogLevel } from '../types';
import { Sanitizer } from '../security/sanitizer';

export type LogCallback = (entry: LogEntry) => void;

export class TerminalInterceptor {
  private originalStdoutWrite: typeof process.stdout.write;
  private originalStderrWrite: typeof process.stderr.write;
  private isAttached: boolean = false;
  private isIntercepting: boolean = false;
  private callback?: LogCallback;
  private redactSensitive: boolean;
  private customPatterns?: RegExp[];

  constructor(options?: {
    callback?: LogCallback;
    redactSensitive?: boolean;
    customPatterns?: RegExp[];
  }) {
    this.originalStdoutWrite = process.stdout.write.bind(process.stdout);
    this.originalStderrWrite = process.stderr.write.bind(process.stderr);
    this.callback = options?.callback;
    this.redactSensitive = options?.redactSensitive ?? true;
    this.customPatterns = options?.customPatterns;
  }

  public setCallback(callback: LogCallback): void {
    this.callback = callback;
  }

  public attach(interceptStdout = true, interceptStderr = true): void {
    if (this.isAttached) return;
    this.isAttached = true;

    if (interceptStdout) {
      process.stdout.write = (
        chunk: any,
        encoding?: any,
        callback?: any
      ): boolean => {
        if (!this.isIntercepting) {
          this.isIntercepting = true;
          try {
            this.handleOutput(chunk, 'stdout');
          } catch {
            // Guard against any logging exception disrupting application writes
          } finally {
            this.isIntercepting = false;
          }
        }
        return this.originalStdoutWrite(chunk, encoding, callback);
      };
    }

    if (interceptStderr) {
      process.stderr.write = (
        chunk: any,
        encoding?: any,
        callback?: any
      ): boolean => {
        if (!this.isIntercepting) {
          this.isIntercepting = true;
          try {
            this.handleOutput(chunk, 'stderr');
          } catch {
            // Guard
          } finally {
            this.isIntercepting = false;
          }
        }
        return this.originalStderrWrite(chunk, encoding, callback);
      };
    }
  }

  private handleOutput(chunk: any, source: 'stdout' | 'stderr'): void {
    if (!chunk) return;

    const rawString = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    // Ignore pure newline or empty flush writes
    if (rawString.trim().length === 0) return;

    // Detect log level
    const level = this.detectLogLevel(rawString, source);

    // Strip ANSI codes for clean indexing
    let cleanMessage = Sanitizer.stripAnsi(rawString).trim();
    let sanitizedRaw = rawString.trim();

    // Redact sensitive patterns if enabled (SEC-06: ensure raw field cannot bypass redaction)
    if (this.redactSensitive) {
      cleanMessage = Sanitizer.redactSensitive(cleanMessage, this.customPatterns);
      sanitizedRaw = Sanitizer.redactSensitive(sanitizedRaw, this.customPatterns);
    }

    // Try parsing structured metadata if JSON
    let metadata: Record<string, unknown> | undefined;
    try {
      if (cleanMessage.startsWith('{') && cleanMessage.endsWith('}')) {
        const parsed = JSON.parse(cleanMessage);
        if (typeof parsed === 'object' && parsed !== null) {
          metadata = parsed;
        }
      }
    } catch {
      // Not JSON, ignore
    }

    const entry: LogEntry = {
      id: `log_${Date.now()}_${randomBytes(4).toString('hex')}`,
      timestamp: Date.now(),
      level,
      source,
      message: cleanMessage,
      raw: sanitizedRaw,
      metadata
    };

    if (this.callback) {
      this.callback(entry);
    }
  }

  private detectLogLevel(text: string, source: 'stdout' | 'stderr'): LogLevel {
    const stripped = Sanitizer.stripAnsi(text).trim();

    // Check JSON logger formats (Pino, Winston, Bunyan)
    if (stripped.startsWith('{') && stripped.endsWith('}')) {
      try {
        const json = JSON.parse(stripped);
        if (json.level) {
          // Pino numeric levels: 10=trace, 20=debug, 30=info, 40=warn, 50=error, 60=fatal
          if (typeof json.level === 'number') {
            if (json.level >= 50) return 'error';
            if (json.level >= 40) return 'warn';
            if (json.level >= 30) return 'info';
            return 'debug';
          }
          if (typeof json.level === 'string') {
            const l = json.level.toLowerCase();
            if (l.includes('err') || l.includes('fatal')) return 'error';
            if (l.includes('warn')) return 'warn';
            if (l.includes('info')) return 'info';
            if (l.includes('debug') || l.includes('trace')) return 'debug';
          }
        }
      } catch {
        // Not valid JSON
      }
    }

    // Text prefix regex checks
    if (/\b(FATAL|CRITICAL|ERROR|ERR|EXCEPTION)\b/i.test(stripped)) {
      return 'error';
    }
    if (/\b(WARN|WARNING)\b/i.test(stripped)) {
      return 'warn';
    }
    if (/\b(DEBUG|TRACE)\b/i.test(stripped)) {
      return 'debug';
    }
    if (/\b(INFO|SUCCESS)\b/i.test(stripped)) {
      return 'info';
    }

    // Default based on stream source
    return source === 'stderr' ? 'error' : 'info';
  }

  public restore(): void {
    if (!this.isAttached) return;
    process.stdout.write = this.originalStdoutWrite;
    process.stderr.write = this.originalStderrWrite;
    this.isAttached = false;
  }
}

