import { randomBytes } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import type { Connection } from '@prisma/client';
import type { ReqCtx } from '../auth/auth.types';
import { CryptoService } from '../crypto/crypto.service';
import { FrappeService } from '../frappe/frappe.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConnectionsService } from './connections.service';
import { SecretStore } from './secret-store.service';
import { TEMP_IDLE_MS, TempStore } from './temp-store.service';

const KEY = 'abcdef123456789',
  SECRET = 'zyx987654321abc';
const input = { url: 'localhost:8000', apiKey: KEY, apiSecret: SECRET };
const user = { id: 'u1', email: 'a@b.c', name: null };

function setup() {
  const rows: Connection[] = [];
  const db = {
    connection: {
      findMany: jest.fn(({ where }: { where: { ownerId: string } }) =>
        Promise.resolve(rows.filter((r) => r.ownerId === where.ownerId)),
      ),
      findFirst: jest.fn(() => Promise.resolve(null)),
      create: jest.fn(({ data }: { data: Partial<Connection> }) => {
        const now = new Date();
        const r = {
          id: 'c' + rows.length,
          writable: false,
          createdAt: now,
          updatedAt: now,
          ...data,
        } as Connection;
        rows.push(r);
        return Promise.resolve(r);
      }),
    },
  } as unknown as PrismaService;
  const crypto = new CryptoService({
    getOrThrow: () => randomBytes(32).toString('hex'),
  } as unknown as ConfigService);
  const frappe = {
    test: jest.fn((c: { url: string; key: string; secret: string }) =>
      Promise.resolve({
        user: 'tristan@servio.ph',
        frappeVersion: '13.58.22',
        swapped: false,
        creds: c,
      }),
    ),
  } as unknown as FrappeService;
  const temps = new TempStore();
  const svc = new ConnectionsService(
    db,
    crypto,
    frappe,
    new SecretStore(),
    temps,
  );
  return { svc, rows, temps };
}

const guest: ReqCtx = { user: null, guestId: 'guest-aaaaaaaaaaaaaaaa' };
const signedIn: ReqCtx = { user, guestId: guest.guestId };

describe('ConnectionsService', () => {
  it('requires sign-in to save, but lets guests create temporary ones', async () => {
    const { svc } = setup();
    await expect(
      svc.create(guest, { name: 'Sandbox', ...input }),
    ).rejects.toMatchObject({
      response: {
        statusCode: 401,
        code: 'AUTH_REQUIRED',
        message: 'Sign in to save this connection',
      },
    });
    const t = await svc.create(guest, {
      name: 'Sandbox',
      ...input,
      temporary: true,
    });
    expect(t.id).toMatch(/^tmp_/);
    expect(t).toMatchObject({
      persisted: false,
      hasSecret: true,
      writable: false,
    });
  });

  it('never exposes url, key or secret', async () => {
    const { svc, rows } = setup();
    const d = await svc.create(signedIn, { name: 'Sandbox', ...input });
    expect(Object.keys(d).sort()).toEqual(
      [
        'createdAt',
        'frappeVersion',
        'hasSecret',
        'id',
        'name',
        'persisted',
        'saveSecret',
        'updatedAt',
        'user',
        'writable',
      ].sort(),
    );
    const stored = JSON.stringify(rows[0]);
    for (const plain of [KEY, SECRET, 'localhost:8000']) {
      expect(JSON.stringify(d)).not.toContain(plain);
      expect(stored).not.toContain(plain);
    }
    expect(rows[0].fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it('lists temporary connections of this browser first, then the saved ones', async () => {
    const { svc } = setup();
    await svc.create(signedIn, { name: 'Saved A', ...input });
    await svc.create(guest, { name: 'Temp B', ...input, temporary: true });
    expect((await svc.list(guest)).map((c) => c.name)).toEqual(['Temp B']);
    expect(
      (await svc.list(signedIn)).map((c) => [c.name, c.persisted]),
    ).toEqual([
      ['Temp B', false],
      ['Saved A', true],
    ]);
    // another browser sees nothing of either
    expect(
      await svc.list({ user: null, guestId: 'other-bbbbbbbbbbbbbbbb' }),
    ).toEqual([]);
  });

  it('asks guests to sign in for saved connections and blocks writable on temporary ones', async () => {
    const { svc } = setup();
    await expect(svc.resolve(guest, 'c0')).rejects.toMatchObject({
      response: { code: 'AUTH_REQUIRED' },
    });
    const t = await svc.create(guest, { name: 'T', ...input, temporary: true });
    await expect(
      svc.update(guest, t.id, { writable: true, confirmName: 'T' }),
    ).rejects.toMatchObject({ response: { statusCode: 400 } });
  });

  it('rejects duplicate temporary names and keys', async () => {
    const { svc } = setup();
    await svc.create(guest, { name: 'T', ...input, temporary: true });
    await expect(
      svc.create(guest, { name: 't', ...input, temporary: true }),
    ).rejects.toMatchObject({
      response: {
        statusCode: 409,
        fields: { name: expect.any(String) as string },
      },
    });
    await expect(
      svc.create(guest, { name: 'U', ...input, temporary: true }),
    ).rejects.toMatchObject({
      response: {
        statusCode: 409,
        message: 'Already saved as "T". Edit that one instead.',
      },
    });
  });

  it('expires temporary connections after 12 idle hours', () => {
    const temps = new TempStore();
    const now = Date.now();
    temps.put('g', { id: 'tmp_1' } as never, now);
    expect(temps.list('g', now + TEMP_IDLE_MS - 1)).toHaveLength(1);
    expect(temps.list('g', now + 2 * TEMP_IDLE_MS)).toHaveLength(0);
    temps.onModuleDestroy();
  });
});
