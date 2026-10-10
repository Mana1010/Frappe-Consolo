import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Ctx } from './auth.decorators';
import { SESSION_COOKIE } from './auth.types';
import type { ReqCtx } from './auth.types';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';
import { SessionService } from './session.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
  ) {}

  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, token } = await this.auth.register(dto, req.ip ?? '');
    this.sessions.setCookie(res, token);
    return { user };
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, token } = await this.auth.login(dto, req.ip ?? '');
    this.sessions.setCookie(res, token);
    return { user };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = (req.cookies as Record<string, unknown> | undefined)?.[
      SESSION_COOKIE
    ];
    if (typeof token === 'string' && token) await this.sessions.destroy(token);
    this.sessions.clearCookie(res);
  }

  @Get('me')
  me(@Ctx() ctx: ReqCtx) {
    return { user: ctx.user };
  }
}
