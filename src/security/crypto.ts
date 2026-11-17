import { randomBytes, scryptSync, createHmac, timingSafeEqual } from 'node:crypto';

export class CryptoSecurity {
  /**
   * Generates a cryptographically strong random hex secret
   */
  public static generateSecret(bytes = 32): string {
    return randomBytes(bytes).toString('hex');
  }

  /**
   * Generates a cryptographically strong random salt
   */
  public static generateSalt(bytes = 16): string {
    return randomBytes(bytes).toString('hex');
  }

  /**
   * Hashes a password using OWASP-recommended Scrypt KDF
   */
  public static hashPassword(password: string, salt?: string): { hash: string; salt: string } {
    const userSalt = salt || this.generateSalt();
    const derivedKey = scryptSync(password, userSalt, 64, {
      N: 16384,
      r: 8,
      p: 1,
      maxmem: 32 * 1024 * 1024
    });
    return {
      hash: derivedKey.toString('hex'),
      salt: userSalt
    };
  }

  /**
   * Verifies a password against its salt and hash using timing-safe comparison
   */
  public static verifyPassword(password: string, salt: string, expectedHash: string): boolean {
    try {
      const derivedKey = scryptSync(password, salt, 64, {
        N: 16384,
        r: 8,
        p: 1,
        maxmem: 32 * 1024 * 1024
      });
      const expectedBuffer = Buffer.from(expectedHash, 'hex');
      if (derivedKey.length !== expectedBuffer.length) {
        return false;
      }
      return timingSafeEqual(derivedKey, expectedBuffer);
    } catch {
      return false;
    }
  }

  /**
   * Encodes a string or buffer into URL-safe base64
   */
  private static base64UrlEncode(data: string | Buffer): string {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    return buf.toString('base64url');
  }

  /**
   * Decodes a URL-safe base64 string
   */
  private static base64UrlDecode(str: string): string {
    return Buffer.from(str, 'base64url').toString('utf8');
  }

  /**
   * Signs a payload and returns a tamper-proof session token (HMAC-SHA256)
   */
  public static createToken(payload: Record<string, unknown>, secret: string, expiresInSeconds: number): string {
    const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const body = {
      ...payload,
      iat: Math.floor(Date.now() / 1000),
      exp
    };

    const encodedHeader = this.base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const encodedPayload = this.base64UrlEncode(JSON.stringify(body));
    const signingInput = `${encodedHeader}.${encodedPayload}`;

    const signature = createHmac('sha256', secret)
      .update(signingInput)
      .digest();
    const encodedSignature = this.base64UrlEncode(signature);

    return `${signingInput}.${encodedSignature}`;
  }

  /**
   * Verifies and extracts token payload safely with timing-safe signature comparison
   */
  public static verifyToken<T = Record<string, unknown>>(token: string, secret: string): T | null {
    if (!token || typeof token !== 'string') return null;

    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [header, payload, signature] = parts;
    const signingInput = `${header}.${payload}`;

    const expectedSignature = createHmac('sha256', secret)
      .update(signingInput)
      .digest();
    const actualSignature = Buffer.from(signature, 'base64url');

    if (expectedSignature.length !== actualSignature.length) {
      return null;
    }

    if (!timingSafeEqual(expectedSignature, actualSignature)) {
      return null;
    }

    try {
      const decodedHeader = JSON.parse(this.base64UrlDecode(header));
      if (!decodedHeader || typeof decodedHeader !== 'object' || decodedHeader.alg !== 'HS256' || decodedHeader.typ !== 'JWT') {
        return null;
      }

      const decodedPayload = JSON.parse(this.base64UrlDecode(payload));
      if (!decodedPayload || typeof decodedPayload !== 'object') {
        return null;
      }
      const now = Math.floor(Date.now() / 1000);
      if (typeof decodedPayload.exp !== 'number' || decodedPayload.exp < now) {
        return null; // Required valid expiration claim
      }
      return decodedPayload as T;
    } catch {
      return null;
    }
  }
}

