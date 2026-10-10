import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const N = 16384,
  R = 8,
  P = 1,
  KEYLEN = 64;

const derive = (pw: string, salt: Buffer, n: number, r: number, p: number) =>
  new Promise<Buffer>((ok, fail) =>
    scrypt(pw, salt, KEYLEN, { N: n, r, p, maxmem: 256 * n * r }, (e, k) =>
      e ? fail(e) : ok(k),
    ),
  );

/** `scrypt$N$r$p$salt$hash`, salt and hash base64. */
export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const k = await derive(pw, salt, N, R, P);
  return [
    'scrypt',
    N,
    R,
    P,
    salt.toString('base64'),
    k.toString('base64'),
  ].join('$');
}

export async function verifyPassword(
  pw: string,
  stored: string,
): Promise<boolean> {
  const [alg, n, r, p, salt, hash] = stored.split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const want = Buffer.from(hash, 'base64');
  const got = await derive(pw, Buffer.from(salt, 'base64'), +n, +r, +p);
  return got.length === want.length && timingSafeEqual(got, want);
}

// verified against when the email is unknown, so both paths take the same time
export const DUMMY_HASH =
  'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$' +
  Buffer.alloc(64).toString('base64');
