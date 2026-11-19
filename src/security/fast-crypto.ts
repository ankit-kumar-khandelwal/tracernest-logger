import { randomBytes, createCipheriv, createDecipheriv, hkdfSync } from 'node:crypto';

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  authTag: string;
  salt: string;
}

export class FastCrypto {
  private static readonly CIPHER_ALGO = 'aes-256-gcm';
  private static readonly KEY_LEN = 32; // 256 bits
  private static readonly IV_LEN = 12; // 96 bits recommended for GCM
  private static readonly SALT_LEN = 16;
  private static readonly INFO_BUFFER = Buffer.from('tracenest-aead-v1', 'utf8');
  private static readonly LEGACY_INFO_BUFFER = Buffer.from('logvault-aead-v1', 'utf8');

  /**
   * Lightning-fast, hardware-accelerated AES-256-GCM encryption with unique salt and IV
   */
  public static encrypt(plaintext: string, masterKey: string): EncryptedPayload {
    if (typeof plaintext !== 'string') {
      plaintext = JSON.stringify(plaintext);
    }

    const salt = randomBytes(this.SALT_LEN);
    const iv = randomBytes(this.IV_LEN);

    // HKDF-SHA256 key derivation executes in sub-microseconds
    const derivedKey = Buffer.from(
      hkdfSync(
        'sha256',
        masterKey,
        salt,
        this.INFO_BUFFER,
        this.KEY_LEN
      )
    );

    const cipher = createCipheriv(this.CIPHER_ALGO, derivedKey, iv);
    let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
    ciphertext += cipher.final('hex');

    const authTag = cipher.getAuthTag().toString('hex');

    return {
      ciphertext,
      iv: iv.toString('hex'),
      authTag,
      salt: salt.toString('hex')
    };
  }

  /**
   * Lightning-fast AES-256-GCM authenticated decryption with tamper detection
   */
  public static decrypt(payload: EncryptedPayload, masterKey: string): string {
    const salt = Buffer.from(payload.salt, 'hex');
    const iv = Buffer.from(payload.iv, 'hex');
    const authTag = Buffer.from(payload.authTag, 'hex');

    const derivedKey = Buffer.from(
      hkdfSync(
        'sha256',
        masterKey,
        salt,
        this.INFO_BUFFER,
        this.KEY_LEN
      )
    );

    try {
      const decipher = createDecipheriv(this.CIPHER_ALGO, derivedKey, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(payload.ciphertext, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (err) {
      // Fallback for legacy payloads encrypted with logvault-aead-v1
      try {
        const legacyKey = Buffer.from(
          hkdfSync('sha256', masterKey, salt, this.LEGACY_INFO_BUFFER, this.KEY_LEN)
        );
        const legacyDecipher = createDecipheriv(this.CIPHER_ALGO, legacyKey, iv);
        legacyDecipher.setAuthTag(authTag);
        let dec = legacyDecipher.update(payload.ciphertext, 'hex', 'utf8');
        dec += legacyDecipher.final('utf8');
        return dec;
      } catch {}
      throw err;
    }
  }

  /**
   * Serializes an encrypted payload into a compact portable string
   */
  public static serialize(payload: EncryptedPayload): string {
    return `${payload.salt}$${payload.iv}$${payload.authTag}$${payload.ciphertext}`;
  }

  /**
   * Deserializes a compact string back into an EncryptedPayload
   */
  public static deserialize(serialized: string): EncryptedPayload {
    const parts = serialized.split('$');
    if (parts.length !== 4) {
      throw new Error('Invalid encrypted payload format');
    }
    return {
      salt: parts[0],
      iv: parts[1],
      authTag: parts[2],
      ciphertext: parts[3]
    };
  }

  /**
   * Decrypts an EncryptedPayload and parses it back to JSON if valid JSON, otherwise returns plaintext string
   */
  public static decryptPayload(payload: any, masterKey: string): any {
    if (!payload) return payload;
    if (typeof payload === 'string' && payload.includes('$') && payload.split('$').length === 4) {
      payload = this.deserialize(payload);
    }
    if (!payload || typeof payload !== 'object' || !payload.ciphertext || !payload.iv || !payload.authTag || !payload.salt) {
      return payload;
    }
    const decryptedStr = this.decrypt(payload as EncryptedPayload, masterKey);
    try {
      return JSON.parse(decryptedStr);
    } catch {
      return decryptedStr;
    }
  }
}
