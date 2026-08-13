import crypto from 'node:crypto';
import fs from 'node:fs';

export interface EncryptedValue {
  ciphertext: string;
  iv: string;
  tag: string;
  keyId: string;
}

export class SecretConfigurationError extends Error {}
export class SecretDecryptionError extends Error {}

function decodeKey(raw: string): Buffer {
  const value = raw.trim();
  const key = /^[0-9a-fA-F]{64}$/.test(value) ? Buffer.from(value, 'hex') : Buffer.from(value, 'base64');
  if (key.length !== 32) {
    throw new SecretConfigurationError('PBX_MASTER_KEY muss genau 32 Byte (Base64 oder 64 Hex-Zeichen) enthalten.');
  }
  return key;
}

export function keyId(key: Buffer): string {
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
}

export class SecretCipher {
  readonly id: string;

  constructor(private readonly key: Buffer) {
    if (key.length !== 32) throw new SecretConfigurationError('AES-256-GCM benötigt einen 32-Byte-Schlüssel.');
    this.id = keyId(key);
  }

  static fromEncoded(value: string): SecretCipher {
    return new SecretCipher(decodeKey(value));
  }

  encrypt(plaintext: string, context: string): EncryptedValue {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(context, 'utf8'));
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return {
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      keyId: this.id,
    };
  }

  decrypt(value: EncryptedValue, context: string): string {
    if (value.keyId !== this.id) {
      throw new SecretDecryptionError(`SIP-Secret wurde mit einem anderen Master-Key (${value.keyId}) verschlüsselt.`);
    }
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, Buffer.from(value.iv, 'base64'));
      decipher.setAAD(Buffer.from(context, 'utf8'));
      decipher.setAuthTag(Buffer.from(value.tag, 'base64'));
      return Buffer.concat([
        decipher.update(Buffer.from(value.ciphertext, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new SecretDecryptionError(`SIP-Secret für "${context}" konnte nicht authentifiziert werden.`);
    }
  }
}

export function loadSecretCipher(env: NodeJS.ProcessEnv = process.env): SecretCipher {
  const file = env.PBX_MASTER_KEY_FILE;
  const encoded = file ? fs.readFileSync(file, 'utf8') : env.PBX_MASTER_KEY;
  if (!encoded) {
    throw new SecretConfigurationError(
      'Kein PBX-Master-Key konfiguriert. PBX_MASTER_KEY_FILE oder PBX_MASTER_KEY ist für den Start erforderlich.'
    );
  }
  return SecretCipher.fromEncoded(encoded);
}

export function generateEncodedMasterKey(): string {
  return crypto.randomBytes(32).toString('base64');
}
