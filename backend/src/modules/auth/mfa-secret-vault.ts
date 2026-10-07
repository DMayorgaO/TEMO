import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// Independent key and per-user binding keep database copies from exposing TOTP seeds.
export class MfaSecretVault {
  private readonly key: Buffer;

  constructor(keyBase64: string) {
    if (!/^[A-Za-z0-9+/]{43}=$/.test(keyBase64)) throw new Error('Clave MFA invalida.');
    this.key = Buffer.from(keyBase64, 'base64');
    if (this.key.length !== 32 || this.key.toString('base64') !== keyBase64) throw new Error('Clave MFA invalida.');
  }

  encrypt(userId: string, secret: string): string {
    if (!userId || !/^[A-Z2-7]{32,128}$/.test(secret)) throw new Error('Secreto MFA invalido.');
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(`temo:mfa:v1:${userId}`));
    const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.');
  }

  decrypt(userId: string, envelope: string): string {
    try {
      if (!userId || envelope.length > 512) throw new Error();
      const parts = envelope.split('.');
      if (parts.length !== 4 || parts[0] !== 'v1' || parts.slice(1).some(part => !/^[A-Za-z0-9_-]+$/.test(part))) throw new Error();
      const [iv, tag, ciphertext] = parts.slice(1).map(part => Buffer.from(part, 'base64url'));
      if (iv.length !== 12 || tag.length !== 16) throw new Error();
      const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
      decipher.setAAD(Buffer.from(`temo:mfa:v1:${userId}`));
      decipher.setAuthTag(tag);
      const secret = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
      if (!/^[A-Z2-7]{32,128}$/.test(secret)) throw new Error();
      return secret;
    } catch {
      throw new Error('No fue posible validar el secreto MFA.');
    }
  }
}
