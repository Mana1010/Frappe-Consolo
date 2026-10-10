import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
} from 'node:crypto';

/** AES-256-GCM, stored as base64 `iv:tag:ciphertext`. */
export function encrypt(key: Buffer, plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), ct].map((b) => b.toString('base64')).join(':');
}

export function decrypt(key: Buffer, enc: string): string {
  const [iv, tag, ct] = enc.split(':').map((p) => Buffer.from(p, 'base64'));
  if (!iv || !tag || !ct) throw new Error('Malformed encrypted value');
  const d = createDecipheriv('aes-256-gcm', key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
}

/** Stable, non-reversible id of (owner, url, apiKey) for duplicate detection. */
export function fingerprint(
  key: Buffer,
  ownerId: string,
  url: string,
  apiKey: string,
): string {
  const fk = Buffer.from(hkdfSync('sha256', key, '', 'fsb-fingerprint', 32));
  return createHmac('sha256', fk)
    .update(ownerId + '|' + url + '|' + apiKey)
    .digest('hex');
}

@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    this.key = Buffer.from(config.getOrThrow<string>('APP_SECRET_KEY'), 'hex');
  }

  fingerprint(ownerId: string, url: string, apiKey: string) {
    return fingerprint(this.key, ownerId, url, apiKey);
  }

  encrypt(plain: string) {
    return encrypt(this.key, plain);
  }

  /** null when the value cannot be decrypted (e.g. APP_SECRET_KEY changed). */
  decrypt(enc: string): string | null {
    try {
      return decrypt(this.key, enc);
    } catch {
      return null;
    }
  }
}
