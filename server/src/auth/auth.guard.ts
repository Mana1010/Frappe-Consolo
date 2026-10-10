import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { authRequired } from '../common/errors';
import { REQUIRE_AUTH } from './auth.decorators';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ec: ExecutionContext): boolean {
    const msg = this.reflector.getAllAndOverride<string | undefined>(
      REQUIRE_AUTH,
      [ec.getHandler(), ec.getClass()],
    );
    if (msg && !ec.switchToHttp().getRequest<Request>().authUser)
      throw authRequired(msg);
    return true;
  }
}
