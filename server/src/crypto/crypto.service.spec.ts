import { randomBytes } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { CryptoService, decrypt, encrypt, fingerprint } from './crypto.service';

describe('crypto', () => {
  const key = randomBytes(32);

  it('round-trips, including unicode', () => {
    for (const s of ['zyx987654321abc', '', 'ünïcødé ✓ 🔑'])
      expect(decrypt(key, encrypt(key, s))).toBe(s);
  });

  it('uses a fresh iv each time and the iv:tag:ciphertext format', () => {
    const a = encrypt(key, 'same'),
      b = encrypt(key, 'same');
    expect(a).not.toBe(b);
    expect(a.split(':')).toHaveLength(3);
  });

  it('rejects tampering and the wrong key', () => {
    const [iv, tag, ct] = encrypt(key, 'secret').split(':');
    const flipped = Buffer.from(ct, 'base64');
    flipped[0] ^= 1;
    expect(() =>
      decrypt(key, [iv, tag, flipped.toString('base64')].join(':')),
    ).toThrow();
    expect(() => decrypt(randomBytes(32), encrypt(key, 'x'))).toThrow();
  });

  it('service returns null instead of throwing', () => {
    const svc = new CryptoService({
      getOrThrow: () => key.toString('hex'),
    } as unknown as ConfigService);
    expect(svc.decrypt(svc.encrypt('abc'))).toBe('abc');
    expect(svc.decrypt('garbage')).toBeNull();
  });

  it('fingerprint is stable per key and differs by owner, url, key', () => {
    const k2 = Buffer.from('ab'.repeat(32), 'hex');
    const fp = fingerprint(k2, 'u1', 'http://localhost:8000', 'abc');
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
    expect(fingerprint(k2, 'u1', 'http://localhost:8000', 'abc')).toBe(fp);
    // pinned so an accidental change to the derivation is caught (it would break duplicate detection)
    expect(fp).toBe(
      'f9fad91219d88df11b4a10610f3a1e171e2f4292207da12febf031fae8c6054b',
    );
    expect(fingerprint(k2, 'u2', 'http://localhost:8000', 'abc')).not.toBe(fp);
    expect(fingerprint(k2, 'u1', 'http://localhost:8001', 'abc')).not.toBe(fp);
    expect(fingerprint(k2, 'u1', 'http://localhost:8000', 'abd')).not.toBe(fp);
    expect(fingerprint(key, 'u1', 'http://localhost:8000', 'abc')).not.toBe(fp);
  });
});
