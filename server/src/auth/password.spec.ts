import { DUMMY_HASH, hashPassword, verifyPassword } from './password';

describe('scrypt passwords', () => {
  it('hashes in scrypt$N$r$p$salt$hash form and verifies', async () => {
    const h = await hashPassword('correct horse');
    const [alg, n, r, p, salt, hash] = h.split('$');
    expect([alg, n, r, p]).toEqual(['scrypt', '16384', '8', '1']);
    expect(Buffer.from(salt, 'base64')).toHaveLength(16);
    expect(Buffer.from(hash, 'base64')).toHaveLength(64);
    expect(await verifyPassword('correct horse', h)).toBe(true);
    expect(await verifyPassword('correct horsE', h)).toBe(false);
  });

  it('salts every hash', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'));
  });

  it('rejects malformed hashes and the dummy hash', async () => {
    expect(await verifyPassword('x', 'bcrypt$whatever')).toBe(false);
    expect(await verifyPassword('', DUMMY_HASH)).toBe(false);
  });
});
