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
   * Pure Node.js zero-dependency SMTP client
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
    return new Promise((resolve, reject) => {
      const port = Number(config.port) || (config.secure ? 465 : 587);
      const isDirectTls = config.secure || port === 465;

      let socket: any;
      if (isDirectTls) {
        socket = tlsConnect({ host: config.host, port, rejectUnauthorized: false });
      } else {
        socket = netConnect({ host: config.host, port });
      }

      socket.setTimeout(10000); // 10s timeout

      let step = 0;
      let buffer = '';

      const send = (cmd: string) => {
        socket.write(cmd + '\r\n');
      };

      socket.on('data', (chunk: Buffer) => {
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
            // Connected
            send(`EHLO ${config.host}`);
            step = 1;
          } else if (step === 1 && code === 250) {
            if (config.user && config.password) {
              send('AUTH LOGIN');
              step = 2;
            } else {
              send(`MAIL FROM:<${config.from}>`);
              step = 4;
            }
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
            send(`MAIL FROM:<${config.from}>`);
            step = 4;
          } else if (step === 4 && code === 250) {
            // Recipients (can be comma-separated)
            const recipients = config.to.split(',').map(r => r.trim()).filter(Boolean);
            for (const r of recipients) {
              send(`RCPT TO:<${r}>`);
            }
            send('DATA');
            step = 5;
          } else if (step === 5 && code === 354) {
            // Send payload
            const rawMessage = [
              `From: ${config.from}`,
              `To: ${config.to}`,
              `Subject: ${config.subject}`,
              'MIME-Version: 1.0',
              'Content-Type: text/plain; charset=UTF-8',
              '',
              config.body,
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
      });

      socket.on('error', (err: any) => reject(err));
      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error('SMTP Connection timed out'));
      });
    });
  }

  /**
   * Sends Microsoft Teams Adaptive Card / MessageCard via Incoming Webhook
   */
  public async sendTeams(webhookUrl: string, payload: {
    title: string;
    level: string;
    message: string;
    timestamp: number;
    source: string;
  }): Promise<void> {
    if (!webhookUrl || !webhookUrl.startsWith('http')) {
      throw new Error('Invalid Microsoft Teams Webhook URL');
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
            { name: 'Stream Source', value: payload.source },
            { name: 'Environment Host', value: process.env.HOSTNAME || 'localhost' }
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

