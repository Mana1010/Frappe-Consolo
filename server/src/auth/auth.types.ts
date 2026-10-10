export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
}

/** Who is calling: the signed-in user (or null) and this browser's guest id. */
export interface ReqCtx {
  user: AuthUser | null;
  guestId: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    authUser?: AuthUser | null;
    guestId?: string;
  }
}

export const SESSION_COOKIE = 'fsb_session';
export const GUEST_COOKIE = 'fsb_guest';
export const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;
