import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import { GUEST_COOKIE, SESSION_COOKIE, SESSION_TTL_MS } from './auth.types';
import { cookieOpts, SessionService } from './session.service';

const GUEST_ID = /^[A-Za-z0-9_-]{16,64}$/;

/** Sets req.authUser from fsb_session and req.guestId from fsb_guest (issuing one if missing). */
@Injectable()
export class AuthMiddleware implements NestMiddleware {
  private readonly log = new Logger('Auth');

  constructor(private readonly sessions: SessionService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const cookies = (req.cookies ?? {}) as Record<string, unknown>;
    const token = cookies[SESSION_COOKIE];
    req.authUser = null;
    if (typeof token === 'string' && token) {
      try {
        const r = await this.sessions.resolve(token);
        if (r) {
          req.authUser = r.user;
          if (r.refreshed) this.sessions.setCookie(res, token);
        } else this.sessions.clearCookie(res);
      } catch (e) {
        // database down: carry on as a guest so temporary connections still work
        this.log.warn('Session lookup failed: ' + (e as Error).message);
      }
    }
    let gid = cookies[GUEST_COOKIE];
    if (typeof gid !== 'string' || !GUEST_ID.test(gid)) {
      gid = randomBytes(18).toString('base64url');
      res.cookie(GUEST_COOKIE, gid, cookieOpts(SESSION_TTL_MS));
    }
    req.guestId = gid as string;
    next();
  }
}
