import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { NextFunction, Request, Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { NotesController } from '../notes/notes.controller';
import { ScriptsController } from '../scripts/scripts.controller';
import { AuthGuard } from './auth.guard';
import { AuthMiddleware } from './auth.middleware';
import { GUEST_COOKIE, SESSION_COOKIE } from './auth.types';
import { SessionService, sha256 } from './session.service';

interface SessionRow {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  lastUsedAt: Date;
}

const user = { id: 'u1', email: 'a@b.c', name: null };

/** Just enough of Prisma's session delegate for SessionService. */
function fakeDb() {
  const rows: SessionRow[] = [];
  const session = {
    create: jest.fn(
      ({ data }: { data: Omit<SessionRow, 'id' | 'lastUsedAt'> }) => {
        rows.push({ id: 's' + rows.length, lastUsedAt: new Date(), ...data });
        return Promise.resolve(rows[rows.length - 1]);
      },
    ),
    findUnique: jest.fn(({ where }: { where: { tokenHash: string } }) => {
      const r = rows.find((x) => x.tokenHash === where.tokenHash);
      return Promise.resolve(r ? { ...r, user } : null);
    }),
    update: jest.fn(
      ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<SessionRow>;
      }) => {
        Object.assign(
          rows.find((x) => x.id === where.id)!,
          data,
        );
        return Promise.resolve();
      },
    ),
    deleteMany: jest.fn(({ where }: { where: Partial<SessionRow> }) => {
      const i = rows.findIndex(
        (x) => x.id === where.id || x.tokenHash === where.tokenHash,
      );
      if (i >= 0) rows.splice(i, 1);
      return Promise.resolve({ count: i >= 0 ? 1 : 0 });
    }),
  };
  return { rows, db: { session } as unknown as PrismaService };
}

function fakeRes() {
  const cookies: Record<string, { value: string; opts: object }> = {};
  const cleared: string[] = [];
  const res = {
    cookie: (n: string, value: string, opts: object) =>
      (cookies[n] = { value, opts }),
    clearCookie: (n: string) => cleared.push(n),
  } as unknown as Response;
  return { res, cookies, cleared };
}

describe('session cookie flow', () => {
  it('stores only sha256(token) and resolves the user from the cookie', async () => {
    const { rows, db } = fakeDb();
    const sessions = new SessionService(db);
    const token = await sessions.create('u1');
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(rows[0].tokenHash).toBe(sha256(token));
    expect(JSON.stringify(rows)).not.toContain(token);

    const mw = new AuthMiddleware(sessions);
    const req = { cookies: { [SESSION_COOKIE]: token } } as unknown as Request;
    const { res, cookies } = fakeRes();
    const next = jest.fn() as NextFunction;
    await mw.use(req, res, next);
    expect(req.authUser).toEqual(user);
    expect(next).toHaveBeenCalled();
    // a guest id is issued alongside, httpOnly + Lax
    expect(req.guestId).toBe(cookies[GUEST_COOKIE].value);
    expect(cookies[GUEST_COOKIE].opts).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    });
  });

  it('slides the expiry once the session has been idle for an hour', async () => {
    const { rows, db } = fakeDb();
    const sessions = new SessionService(db);
    const token = await sessions.create('u1');
    expect((await sessions.resolve(token))?.refreshed).toBe(false);
    rows[0].lastUsedAt = new Date(Date.now() - 2 * 3600 * 1000);
    const before = rows[0].expiresAt.getTime();
    expect((await sessions.resolve(token))?.refreshed).toBe(true);
    expect(rows[0].expiresAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('drops expired sessions and clears the cookie; logout deletes the row', async () => {
    const { rows, db } = fakeDb();
    const sessions = new SessionService(db);
    const token = await sessions.create('u1');
    rows[0].expiresAt = new Date(Date.now() - 1);
    const req = {
      cookies: { [SESSION_COOKIE]: token, [GUEST_COOKIE]: 'g'.repeat(24) },
    } as unknown as Request;
    const { res, cleared, cookies } = fakeRes();
    await new AuthMiddleware(sessions).use(req, res, jest.fn());
    expect(req.authUser).toBeNull();
    expect(cleared).toContain(SESSION_COOKIE);
    expect(rows).toHaveLength(0);
    // an existing valid guest id is kept, not reissued
    expect(req.guestId).toBe('g'.repeat(24));
    expect(cookies[GUEST_COOKIE]).toBeUndefined();

    const t2 = await sessions.create('u1');
    await sessions.destroy(t2);
    expect(await sessions.resolve(t2)).toBeNull();
  });

  it('treats an unknown token as a guest', async () => {
    const { db } = fakeDb();
    const req = { cookies: { [SESSION_COOKIE]: 'nope' } } as unknown as Request;
    await new AuthMiddleware(new SessionService(db)).use(
      req,
      fakeRes().res,
      jest.fn(),
    );
    expect(req.authUser).toBeNull();
    expect(req.guestId).toBeTruthy();
  });
});

describe('AuthGuard', () => {
  const ctxFor = (cls: object, handler: () => unknown, authUser: unknown) =>
    ({
      getClass: () => cls,
      getHandler: () => handler,
      switchToHttp: () => ({ getRequest: () => ({ authUser }) }),
    }) as unknown as ExecutionContext;
  const guard = new AuthGuard(new Reflector());

  it('returns 401 AUTH_REQUIRED for guests on saving routes', () => {
    /* eslint-disable @typescript-eslint/unbound-method */
    for (const [cls, h] of [
      [ScriptsController, ScriptsController.prototype.create],
      [NotesController, NotesController.prototype.put],
    ] as const) {
      try {
        guard.canActivate(ctxFor(cls, h, null));
        throw new Error('expected 401');
      } catch (e) {
        const err = e as { getStatus(): number; getResponse(): object };
        expect(err.getStatus()).toBe(401);
        expect(err.getResponse()).toMatchObject({ code: 'AUTH_REQUIRED' });
      }
      expect(guard.canActivate(ctxFor(cls, h, user))).toBe(true);
    }
    /* eslint-enable @typescript-eslint/unbound-method */
  });
});
