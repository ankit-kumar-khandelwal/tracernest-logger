import { connect as netConnect } from 'node:net';
import { connect as tlsConnect } from 'node:tls';
import { LogEntry } from '../types';
import { SqlStore } from '../security/sql-store';

export class AlertDispatcher {
  private sqlStore: SqlStore;
  private lastAlertTimestamps: Map<string, number> = new Map();
  private cooldownMs: number = 30000; // 30s cooldown between automated alerts to prevent flooding

  constructor(sqlStore: SqlStore) {
    this.sqlStore = sqlStore;
  }

  /**
   * Evaluates and dispatches alerts for intercepted logs asynchronously
   */
  public async dispatch(entry: LogEntry): Promise<void> {
    // Only process errors or warnings
    if (entry.level !== 'error' && entry.level !== 'warn') {
      return;
    }

    try {
      const emailConfig = this.sqlStore.getAlertConfig('email');
      if (emailConfig && emailConfig.enabled && this.matchesThreshold(entry.level, emailConfig.levelThreshold)) {
        this.throttleAndSend('email', () => this.sendEmailAlert(emailConfig.settings as any, entry));
      }

      const teamsConfig = this.sqlStore.getAlertConfig('teams');
      if (teamsConfig && teamsConfig.enabled && this.matchesThreshold(entry.level, teamsConfig.levelThreshold)) {
        this.throttleAndSend('teams', () => this.sendTeamsAlert(teamsConfig.settings as any, entry));
      }
    } catch {
      // Alerts must never throw or disrupt application execution
    }
  }

  private matchesThreshold(level: 'error' | 'warn', threshold: 'error' | 'warn' | 'all'): boolean {
    if (threshold === 'all') return true;
    if (threshold === 'warn') return level === 'warn' || level === 'error';
    return level === 'error';
  }

  private throttleAndSend(channel: string, sendFn: () => Promise<void>): void {
    const now = Date.now();
    const last = this.lastAlertTimestamps.get(channel) || 0;
    if (now - last < this.cooldownMs) {
      return; // Throttled
    }
    this.lastAlertTimestamps.set(channel, now);
    sendFn().catch(() => {});
  }

  /**
   * Pure Node.js zero-dependency secure SMTP client
   * Implements strict CRLF validation, RFC 5321 dot-stuffing, mandatory TLS for credentials,
   * and strict TLS certificate verification.
   */
  public async sendEmail(config: {
    host: string;
    port: number;
    secure?: boolean;
    user?: string;
    password?: string;
    from: string;
    to: string;
    subject: string;
    body: string;
  }): Promise<void> {
    // 1. CRLF Injection Guard & Sanitization
    const sanitizeHeader = (name: string, val: string): string => {
      if (!val || typeof val !== 'string') {
        throw new Error(`SMTP field '${name}' is required`);
      }
      if (/[\r\n]/.test(val)) {
        throw new Error(`CRLF injection attempt detected in SMTP field '${name}'`);
      }
      return val.trim();
    };

    const cleanHost = sanitizeHeader('host', config.host);
    const cleanFrom = sanitizeHeader('from', config.from);
    const cleanSubject = sanitizeHeader('subject', config.subject);

    // Parse and validate recipient addresses
    const rawRecipients = sanitizeHeader('to', config.to);
    const recipients = rawRecipients
      .split(',')
      .map(r => r.trim())
      .filter(Boolean);

    if (recipients.length === 0) {
      throw new Error('At least one recipient address is required in SMTP to field');
    }

    for (const r of recipients) {
      if (/[\r\n<>"]/.test(r)) {
        throw new Error(`Invalid characters detected in recipient address '${r}'`);
      }
    }

    // 2. RFC 5321 Dot-Stuffing on Message Body
    // Any line beginning with a dot '.' in message data must be prepended with another dot '..'
    const sanitizedBody = (config.body || '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n')
      .map(line => line.startsWith('.') ? '.' + line : line)
      .join('\r\n');

    const port = Number(config.port) || (config.secure ? 465 : 587);
    const isDirectTls = config.secure || port === 465;
    const hasAuth = Boolean(config.user && config.password);

    return new Promise((resolve, reject) => {
      let socket: any;
      let isTlsEncrypted = isDirectTls;

      try {
        if (isDirectTls) {
          // Direct TLS: strictly enforce certificate validation and SNI servername
          socket = tlsConnect({
            host: cleanHost,
            port,
            rejectUnauthorized: true,
            servername: cleanHost
          });
        } else {
          socket = netConnect({ host: cleanHost, port });
        }
      } catch (err) {
        return reject(err);
      }

      socket.setTimeout(10000); // 10s timeout

      let step = 0;
      let buffer = '';

      const send = (cmd: string) => {
        socket.write(cmd + '\r\n');
      };

      const handleData = (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split('\r\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line) continue;
          const code = parseInt(line.substring(0, 3), 10);
          if (isNaN(code)) continue;

          // Multi-line SMTP response check (e.g. 250-SIZE)
          if (line[3] === '-') continue;

          if (step === 0 && (code === 220 || code === 200)) {
            // Connected: Send initial EHLO
            send(`EHLO ${cleanHost}`);
            step = 1;
          } else if (step === 1 && code === 250) {
            if (hasAuth && !isTlsEncrypted) {
              // Never transmit credentials over unencrypted connection! Enforce STARTTLS
              send('STARTTLS');
              step = 10;
            } else if (hasAuth) {
              // Connection already TLS encrypted: proceed to AUTH LOGIN
              send('AUTH LOGIN');
              step = 2;
            } else {
              // No credentials required
              send(`MAIL FROM:<${cleanFrom}>`);
              step = 4;
            }
          } else if (step === 10 && code === 220) {
            // STARTTLS accepted: upgrade plaintext socket to secure TLS with certificate validation
            socket.removeAllListeners('data');
            const tlsSocket = tlsConnect({
              socket,
              host: cleanHost,
              rejectUnauthorized: true,
              servername: cleanHost
            });

            tlsSocket.setTimeout(10000);
            tlsSocket.on('data', handleData);
            tlsSocket.on('error', (err: any) => reject(err));
            tlsSocket.on('timeout', () => {
              tlsSocket.destroy();
              reject(new Error('SMTP Connection timed out during TLS handshake'));
            });

            socket = tlsSocket;
            isTlsEncrypted = true;

            // Per RFC 3207: must re-issue EHLO after STARTTLS
            send(`EHLO ${cleanHost}`);
            step = 11;
          } else if (step === 11 && code === 250) {
            // Re-EHLO complete under TLS: proceed to AUTH LOGIN
            send('AUTH LOGIN');
            step = 2;
          } else if (step === 2 && code === 334) {
            // Username prompt
            send(Buffer.from(config.user || '').toString('base64'));
            step = 3;
          } else if (step === 3 && code === 334) {
            // Password prompt
            send(Buffer.from(config.password || '').toString('base64'));
            step = 35;
          } else if (step === 35 && (code === 235 || code === 250)) {
            // Auth success
            send(`MAIL FROM:<${cleanFrom}>`);
            step = 4;
          } else if (step === 4 && code === 250) {
            // Recipients
            for (const r of recipients) {
              send(`RCPT TO:<${r}>`);
            }
            send('DATA');
            step = 5;
          } else if (step === 5 && code === 354) {
            // Send payload with dot-stuffed body and strictly validated headers
            const rawMessage = [
              `From: <${cleanFrom}>`,
              `To: ${recipients.map(r => `<${r}>`).join(', ')}`,
              `Subject: ${cleanSubject}`,
              'MIME-Version: 1.0',
              'Content-Type: text/plain; charset=UTF-8',
              'Content-Transfer-Encoding: 8bit',
              '',
              sanitizedBody,
              '.'
            ].join('\r\n');

            send(rawMessage);
            step = 6;
          } else if (step === 6 && code === 250) {
            send('QUIT');
            step = 7;
            socket.end();
            resolve();
          } else if (code >= 400) {
            socket.destroy();
            reject(new Error(`SMTP Error [${code}]: ${line}`));
          }
        }
      };

      socket.on('data', handleData);
      socket.on('error', (err: any) => reject(err));
      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error('SMTP Connection timed out'));
      });
    });
  }

  /**
   * Sends Microsoft Teams Adaptive Card / MessageCard via Incoming Webhook
   * Validates destination HTTPS domain and prevents SSRF to internal/private networks
   */
  public async sendTeams(webhookUrl: string, payload: {
    title: string;
    level: string;
    message: string;
    timestamp: number;
    source: string;
  }): Promise<void> {
    if (!webhookUrl || typeof webhookUrl !== 'string') {
      throw new Error('Microsoft Teams Webhook URL is required');
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(webhookUrl.trim());
    } catch {
      throw new Error('Invalid Microsoft Teams Webhook URL');
    }

    if (parsedUrl.protocol !== 'https:') {
      throw new Error('Microsoft Teams Webhook URL must use HTTPS');
    }

    const host = parsedUrl.hostname.toLowerCase();

    // Verify webhook destination is on authentic Microsoft Teams / Office 365 domains
    const isAllowedHost =
      host.endsWith('.webhook.office.com') ||
      host.endsWith('.office.com') ||
      host.endsWith('.office365.com') ||
      host.endsWith('.microsoft.com') ||
      host.endsWith('.logic.azure.com') ||
      host === 'webhook.office.com' ||
      host === 'outlook.office.com' ||
      host === 'outlook.office365.com';

    if (!isAllowedHost) {
      throw new Error(`Invalid Microsoft Teams Webhook domain '${host}'. Only verified Microsoft/Office webhook domains are permitted.`);
    }

    // SSRF Guard: Disallow private IP addresses and loopback addresses
    if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|169\.254\.|::1|0\.0\.0\.0)/.test(host)) {
      throw new Error('Private or loopback IP addresses are strictly prohibited for webhooks');
    }

    const themeColor = payload.level === 'error' ? 'ef4444' : 'f59e0b';
    const isoTime = new Date(payload.timestamp).toISOString();

    const teamsMessage = {
      '@type': 'MessageCard',
      '@context': 'https://schema.org/extensions',
      summary: payload.title,
      themeColor,
      title: payload.title,
      sections: [
        {
          activityTitle: `TracerNest-Logger Incident Alert: [${payload.level.toUpperCase()}]`,
          activitySubtitle: `Reported at ${isoTime}`,
          facts: [
            { name: 'Severity Level', value: payload.level.toUpperCase() },
            { name: 'Stream Source', value: payload.source || 'TracerNest' }
          ],
          text: `\`\`\`\n${payload.message.slice(0, 1500)}\n\`\`\``
        }
      ]
    };

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(teamsMessage)
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Teams Webhook returned ${res.status}: ${errText}`);
    }
  }

  private async sendEmailAlert(config: any, entry: LogEntry): Promise<void> {
    const subject = `[TracerNest-Logger Alert] ${entry.level.toUpperCase()}: ${entry.message.substring(0, 60)}`;
    const body = `TracerNest-Logger Security & Monitoring Incident Report\n` +
      `--------------------------------------------------\n` +
      `Severity  : ${entry.level.toUpperCase()}\n` +
      `Timestamp : ${new Date(entry.timestamp).toISOString()}\n` +
      `Source    : ${entry.source}\n` +
      `Log ID    : ${entry.id}\n\n` +
      `Message:\n${entry.message}\n\n` +
      `--------------------------------------------------\n` +
      `View live logs on your TracerNest-Logger dashboard.`;

    await this.sendEmail({
      host: config.host,
      port: config.port,
      secure: config.secure,
      user: config.user,
      password: config.password,
      from: config.from,
      to: config.to,
      subject,
      body
    });
  }

  private async sendTeamsAlert(config: any, entry: LogEntry): Promise<void> {
    await this.sendTeams(config.webhookUrl, {
      title: config.title || `🚨 TracerNest-Logger Alert: ${entry.level.toUpperCase()} Log Detected`,
      level: entry.level,
      message: entry.message,
      timestamp: entry.timestamp,
      source: entry.source
    });
  }

  /**
   * Test alert dispatcher for manual verification from dashboard
   */
  public async testAlert(channel: 'email' | 'teams'): Promise<{ success: boolean; message: string }> {
    const config = this.sqlStore.getAlertConfig(channel);
    if (!config) {
      return { success: false, message: `No configuration found for ${channel}` };
    }

    const testEntry: LogEntry = {
      id: `test_${Date.now()}`,
      timestamp: Date.now(),
      level: 'error',
      source: 'internal',
      message: `[TracerNest-Logger Test Alert] This is an automated test message verifying your ${channel.toUpperCase()} integration channel.`,
      raw: 'Test alert'
    };

    try {
      if (channel === 'email') {
        await this.sendEmailAlert(config.settings, testEntry);
      } else {
        await this.sendTeamsAlert(config.settings, testEntry);
      }
      return { success: true, message: `Test alert dispatched successfully to ${channel.toUpperCase()}!` };
    } catch (err: any) {
      return { success: false, message: err.message || 'Failed to dispatch test alert' };
    }
  }
}

