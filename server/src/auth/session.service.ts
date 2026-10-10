import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type { CookieOptions, Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, SESSION_COOKIE, SESSION_TTL_MS } from './auth.types';

export const sha256 = (s: string) =>
  createHash('sha256').update(s).digest('hex');

// sliding expiry: extend at most once an hour to avoid a write per request
const SLIDE_AFTER_MS = 3600 * 1000;

export const cookieOpts = (maxAge?: number): CookieOptions => ({
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
  secure: false, // http://localhost
  ...(maxAge !== undefined && { maxAge }),
});

@Injectable()
export class SessionService {
  constructor(private readonly db: PrismaService) {}

  /** New session; only sha256(token) is stored. */
  async create(userId: string): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await this.db.session.create({
      data: {
        userId,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
    });
    return token;
  }

  /** User for a cookie token, or null. `refreshed` = the cookie should be re-sent. */
  async resolve(
    token: string,
  ): Promise<{ user: AuthUser; refreshed: boolean } | null> {
    const s = await this.db.session.findUnique({
      where: { tokenHash: sha256(token) },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
    if (!s) return null;
    const now = Date.now();
    if (s.expiresAt.getTime() <= now) {
      await this.db.session.deleteMany({ where: { id: s.id } });
      return null;
    }
    const refreshed = now - s.lastUsedAt.getTime() > SLIDE_AFTER_MS;
    if (refreshed)
      await this.db.session.update({
        where: { id: s.id },
        data: {
          lastUsedAt: new Date(now),
          expiresAt: new Date(now + SESSION_TTL_MS),
        },
      });
    return { user: s.user, refreshed };
  }

  async destroy(token: string) {
    await this.db.session.deleteMany({ where: { tokenHash: sha256(token) } });
  }

  setCookie(res: Response, token: string) {
    res.cookie(SESSION_COOKIE, token, cookieOpts(SESSION_TTL_MS));
  }

  clearCookie(res: Response) {
    res.clearCookie(SESSION_COOKIE, cookieOpts());
  }
}
