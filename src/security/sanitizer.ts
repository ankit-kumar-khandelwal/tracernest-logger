export class Sanitizer {
  private static readonly ANSI_REGEX =
    // eslint-disable-next-line no-control-regex
    /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;

  private static readonly SENSITIVE_PATTERNS: Array<{
    pattern: RegExp;
    replacement: string | ((match: string) => string);
  }> = [
    // Bearer / JWT Tokens
    {
      pattern: /Bearer\s+([a-zA-Z0-9\-._~+/]+=*)/gi,
      replacement: 'Bearer [REDACTED_TOKEN]'
    },
    // Generic API Keys (e.g. OpenAI sk-, GitHub ghp_, Slack xoxb-, Stripe sk_live_)
    {
      pattern: /(?:sk-[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{20,}|xox[baprs]-[a-zA-Z0-9]{10,}|sk_live_[a-zA-Z0-9]{20,})/g,
      replacement: '[REDACTED_API_KEY]'
    },
    // JSON password, secret, token, apiKey, authorization fields
    {
      pattern: /"(password|passwd|secret|apiKey|api_key|authToken|accessToken|privateKey)"\s*:\s*"([^"]+)"/gi,
      replacement: '"$1": "[REDACTED]"'
    },
    // URL Query parameters with sensitive names (SEC-07)
    {
      pattern: /([?&](?:password|passwd|token|secret|apiKey|api_key|authToken|auth_token|accessToken|access_token|refreshToken|refresh_token|privateKey|private_key|key|code|auth|credential|cvv|pin|sig|signature)=)([^&\s]+)/gi,
      replacement: '$1[REDACTED]'
    },
    // Credit card numbers (13 to 19 digits, optionally spaced or hyphenated)
    {
      pattern: /\b(?:\d[ -]*?){13,19}\b/g,
      replacement: (match: string) => {
        const digitsOnly = match.replace(/\D/g, '');
        if (digitsOnly.length >= 13 && digitsOnly.length <= 19) {
          // Keep last 4 digits
          return `****-****-****-${digitsOnly.slice(-4)}`;
        }
        return match;
      }
    }
  ];

  /**
   * Escape HTML entities to prevent Stored XSS attacks
   */
  public static escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Strips all ANSI color/control codes, yielding plain clean text
   */
  public static stripAnsi(str: string): string {
    if (!str) return '';
    return str.replace(this.ANSI_REGEX, '');
  }

  /**
   * Sanitizes sensitive fields using standard and custom patterns
   */
  public static redactSensitive(text: string, customPatterns?: RegExp[]): string {
    if (!text || typeof text !== 'string') return '';
    try {
      // Guard against massive string inputs that could cause excessive memory or regex backtracking
      let result = text.length > 512 * 1024 ? text.slice(0, 512 * 1024) + '... [TRUNCATED]' : text;

      for (const { pattern, replacement } of this.SENSITIVE_PATTERNS) {
        if (pattern.global) pattern.lastIndex = 0;
        result = result.replace(pattern, replacement as any);
      }

      if (customPatterns && customPatterns.length > 0) {
        for (const pattern of customPatterns) {
          if (pattern.global) pattern.lastIndex = 0;
          result = result.replace(pattern, '[REDACTED]');
        }
      }

      return result;
    } catch {
      return text;
    }
  }

  /**
   * Converts ANSI terminal codes into safe HTML spans while escaping HTML entities
   */
  public static ansiToSafeHtml(rawText: string): string {
    if (!rawText) return '';

    // First strip dangerous terminal control sequences (cursor home, clear screen, bell)
    const sanitized = rawText
      .replace(/\x07/g, '') // bell
      .replace(/\x1b\[2J/g, '') // clear screen
      .replace(/\x1b\[[0-9;]*[HJK]/g, ''); // cursor positioning

    // Tokenize ANSI codes vs plain text
    const parts = sanitized.split(/(\x1b\[[0-9;]*m)/g);

    const colorMap: Record<number, string> = {
      30: '#64748b', // black / muted
      31: '#ef4444', // red
      32: '#22c55e', // green
      33: '#eab308', // yellow
      34: '#3b82f6', // blue
      35: '#a855f7', // magenta
      36: '#06b6d4', // cyan
      37: '#f8fafc', // white
      90: '#94a3b8', // bright black / gray
      91: '#f87171', // bright red
      92: '#4ade80', // bright green
      93: '#fde047', // bright yellow
      94: '#60a5fa', // bright blue
      95: '#c084fc', // bright magenta
      96: '#22d3ee', // bright cyan
      97: '#ffffff'  // bright white
    };

    let html = '';
    let openSpanCount = 0;

    for (const part of parts) {
      if (!part) continue;

      const ansiMatch = part.match(/^\x1b\[([0-9;]*)m$/);
      if (ansiMatch) {
        const codes = (ansiMatch[1] || '0').split(';').map(c => parseInt(c, 10));

        for (const code of codes) {
          if (code === 0) {
            // Reset all styles
            while (openSpanCount > 0) {
              html += '</span>';
              openSpanCount--;
            }
          } else if (code === 1) {
            // Bold
            html += '<span style="font-weight:600;">';
            openSpanCount++;
          } else if (code === 4) {
            // Underline
            html += '<span style="text-decoration:underline;">';
            openSpanCount++;
          } else if (colorMap[code]) {
            html += `<span style="color:${colorMap[code]};">`;
            openSpanCount++;
          }
        }
      } else {
        // Text node - ALWAYS escape HTML characters to prevent XSS
        html += this.escapeHtml(part);
      }
    }

    // Close any unclosed spans
    while (openSpanCount > 0) {
      html += '</span>';
      openSpanCount--;
    }

    return html;
  }
}
