import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApiError, conflict } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from './auth.types';
import { LoginDto, RegisterDto } from './dto/auth.dto';
import { DUMMY_HASH, hashPassword, verifyPassword } from './password';
import { RateLimiter } from './rate-limit';
import { SessionService } from './session.service';

const pick = (u: AuthUser): AuthUser => ({
  id: u.id,
  email: u.email,
  name: u.name,
});

@Injectable()
export class AuthService {
  private readonly limiter = new RateLimiter(10, 15 * 60 * 1000);

  constructor(
    private readonly db: PrismaService,
    private readonly sessions: SessionService,
  ) {}

  private limit(email: string, ip: string) {
    if (!this.limiter.hit(email + '|' + ip))
      throw new ApiError(
        HttpStatus.TOO_MANY_REQUESTS,
        'Too many attempts. Try again in 15 minutes.',
        { code: 'RATE_LIMITED' },
      );
  }

  async register(dto: RegisterDto, ip: string) {
    const email = dto.email.trim().toLowerCase();
    this.limit(email, ip);
    const taken = 'An account with this email already exists. Sign in instead.';
    if (await this.db.user.findUnique({ where: { email } }))
      throw conflict(taken, { email: taken });
    try {
      const u = await this.db.user.create({
        data: {
          email,
          name: dto.name?.trim() || null,
          passwordHash: await hashPassword(dto.password),
        },
      });
      return { user: pick(u), token: await this.sessions.create(u.id) };
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      )
        throw conflict(taken, { email: taken });
      throw e;
    }
  }

  async login(dto: LoginDto, ip: string) {
    const email = dto.email.trim().toLowerCase();
    this.limit(email, ip);
    const u = await this.db.user.findUnique({ where: { email } });
    const ok = await verifyPassword(
      dto.password,
      u?.passwordHash ?? DUMMY_HASH,
    );
    if (!u || !ok)
      throw new ApiError(
        HttpStatus.UNAUTHORIZED,
        'Email or password is wrong',
        {
          code: 'INVALID_CREDENTIALS',
        },
      );
    return { user: pick(u), token: await this.sessions.create(u.id) };
  }
}
