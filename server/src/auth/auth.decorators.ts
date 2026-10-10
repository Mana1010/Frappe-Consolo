import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { Request } from 'express';
import { ReqCtx } from './auth.types';

export const REQUIRE_AUTH = 'fsb:requireAuth';

/** Guests get 401 { code: "AUTH_REQUIRED", message } (the client shows `message` as the sign-in reason). */
export const RequireAuth = (message = 'Sign in to continue.') =>
  SetMetadata(REQUIRE_AUTH, message);

export const Ctx = createParamDecorator(
  (_: unknown, ec: ExecutionContext): ReqCtx => {
    const req = ec.switchToHttp().getRequest<Request>();
    return { user: req.authUser ?? null, guestId: req.guestId ?? '' };
  },
);
