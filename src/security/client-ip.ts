import { IncomingMessage } from 'node:http';

export type TrustProxyOption =
  | boolean
  | string
  | string[]
  | ((ip: string) => boolean);

/**
 * Normalizes and cleans IPv4 / IPv6 addresses
 */
export function cleanIp(ip: string): string {
  if (!ip || typeof ip !== 'string') return '127.0.0.1';
  let cleaned = ip.trim();

  // Strip enclosing brackets for IPv6 e.g. [::1]:port or [fe80::1]
  if (cleaned.startsWith('[') && cleaned.includes(']')) {
    const closeIdx = cleaned.indexOf(']');
    cleaned = cleaned.substring(1, closeIdx);
  } else if (cleaned.includes(':') && cleaned.split(':').length === 2 && !cleaned.includes('::')) {
    // IPv4 with port e.g. 192.168.1.1:45678
    cleaned = cleaned.split(':')[0];
  }

  // Strip IPv6-mapped IPv4 prefix (::ffff:192.168.1.1 -> 192.168.1.1)
  if (cleaned.startsWith('::ffff:')) {
    cleaned = cleaned.substring(7);
  }

  // Normalize localhost IPv6
  if (cleaned === '::1' || cleaned === '0:0:0:0:0:0:0:1') {
    return '127.0.0.1';
  }

  return cleaned || '127.0.0.1';
}

function ipToLong(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let num = 0;
  for (let i = 0; i < 4; i++) {
    const byte = parseInt(parts[i], 10);
    if (isNaN(byte) || byte < 0 || byte > 255) return null;
    num = (num << 8) + byte;
  }
  return num >>> 0;
}

function matchCidr(ip: string, cidr: string): boolean {
  const [range, bitsStr] = cidr.split('/');
  if (!bitsStr) return cleanIp(ip) === cleanIp(range);
  const bits = parseInt(bitsStr, 10);
  if (isNaN(bits) || bits < 0 || bits > 32) return false;
  const ipNum = ipToLong(cleanIp(ip));
  const rangeNum = ipToLong(cleanIp(range));
  if (ipNum === null || rangeNum === null) return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipNum & mask) === (rangeNum & mask);
}

function isLoopback(ip: string): boolean {
  const cleaned = cleanIp(ip);
  return cleaned === '127.0.0.1' || cleaned === '::1' || cleaned.startsWith('127.');
}

function isPrivateIp(ip: string): boolean {
  const cleaned = cleanIp(ip);
  if (isLoopback(cleaned)) return true;
  if (matchCidr(cleaned, '10.0.0.0/8')) return true;
  if (matchCidr(cleaned, '172.16.0.0/12')) return true;
  if (matchCidr(cleaned, '192.168.0.0/16')) return true;
  if (cleaned.startsWith('fc') || cleaned.startsWith('fd')) return true;
  return false;
}

export function isTrustedProxy(ip: string, trustProxy?: TrustProxyOption): boolean {
  if (!trustProxy) return false;
  const cleaned = cleanIp(ip);

  if (trustProxy === true) {
    return true;
  }

  if (typeof trustProxy === 'function') {
    try {
      return Boolean(trustProxy(cleaned));
    } catch {
      return false;
    }
  }

  if (typeof trustProxy === 'string') {
    if (trustProxy === 'loopback') return isLoopback(cleaned);
    if (trustProxy === 'uniquelocal' || trustProxy === 'private') return isPrivateIp(cleaned);
    if (trustProxy.includes('/')) return matchCidr(cleaned, trustProxy);
    return cleaned === cleanIp(trustProxy);
  }

  if (Array.isArray(trustProxy)) {
    return trustProxy.some((rule) => {
      if (rule === 'loopback') return isLoopback(cleaned);
      if (rule === 'uniquelocal' || rule === 'private') return isPrivateIp(cleaned);
      if (rule.includes('/')) return matchCidr(cleaned, rule);
      return cleaned === cleanIp(rule);
    });
  }

  return false;
}

/**
 * Robust Client IP Extractor with Trusted Proxy Verification
 *
 * SEC-10 Remediation:
 * - Uses the immediate socket peer address by default.
 * - Forwarding headers (X-Forwarded-For, CF-Connecting-IP, etc.) are ONLY honored
 *   if the immediate socket peer is a verified trusted proxy.
 * - Parses proxy chains from the trusted end (right-to-left) to identify the true client.
 */
export function extractClientIp(req: IncomingMessage, trustProxy?: TrustProxyOption): string {
  // 1. Direct socket peer address (immediate connection)
  const socketIp = cleanIp(req.socket?.remoteAddress || (req.connection as any)?.remoteAddress || '127.0.0.1');

  // If proxy trust is not enabled or socket peer is not trusted, use the direct socket IP
  if (!trustProxy || !isTrustedProxy(socketIp, trustProxy)) {
    return socketIp;
  }

  const headers = req.headers;

  // 2. Cloudflare header (highest priority for Cloudflare-proxied traffic)
  const cfIp = headers['cf-connecting-ip'];
  if (typeof cfIp === 'string' && cfIp.trim()) {
    return cleanIp(cfIp);
  }

  // 3. Standard reverse proxy real IP (Nginx, Traefik, Kong)
  const realIp = headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim()) {
    return cleanIp(realIp);
  }

  // 4. Akamai / Cloudflare Enterprise True-Client-IP
  const trueClientIp = headers['true-client-ip'];
  if (typeof trueClientIp === 'string' && trueClientIp.trim()) {
    return cleanIp(trueClientIp);
  }

  // 5. Fastly Client IP
  const fastlyIp = headers['fastly-client-ip'];
  if (typeof fastlyIp === 'string' && fastlyIp.trim()) {
    return cleanIp(fastlyIp);
  }

  // 6. Standard X-Forwarded-For (can be a comma-separated list of IPs: client, proxy1, proxy2)
  const forwardedFor = headers['x-forwarded-for'];
  if (forwardedFor) {
    const raw = typeof forwardedFor === 'string' ? forwardedFor : forwardedFor[0];
    if (raw && raw.trim()) {
      const ips = raw.split(',').map((s) => cleanIp(s.trim())).filter(Boolean);
      if (ips.length > 0) {
        if (trustProxy === true) {
          // If all upstream proxies are trusted, leftmost IP is original client
          return ips[0];
        }
        // Walk backwards from right to left (from trusted end) to find the first untrusted IP
        for (let i = ips.length - 1; i >= 0; i--) {
          if (!isTrustedProxy(ips[i], trustProxy)) {
            return ips[i];
          }
        }
        return ips[0];
      }
    }
  }

  // 7. X-Client-IP / X-Cluster-Client-IP
  const clientIp = headers['x-client-ip'] || headers['x-cluster-client-ip'];
  if (typeof clientIp === 'string' && clientIp.trim()) {
    return cleanIp(clientIp);
  }

  // 8. RFC 7239 Forwarded header: e.g. for="192.0.2.60";proto=http;by=203.0.113.43
  const forwarded = headers['forwarded'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    const match = /for="?([^";,\s]+)"?/i.exec(forwarded);
    if (match && match[1]) {
      return cleanIp(match[1]);
    }
  }

  return socketIp;
}
