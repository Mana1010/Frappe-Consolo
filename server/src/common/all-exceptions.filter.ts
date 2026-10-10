import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

// unique-constraint columns → request fields (fingerprint stands for url + apiKey)
const FIELD_OF: Record<string, string> = { fingerprint: 'apiKey' };

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly log = new Logger('Http');

  catch(e: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const { status, body } = this.toBody(e);
    if (status >= 500) this.log.error(e instanceof Error ? e.stack : e);
    res.status(status).json(body);
  }

  private toBody(e: unknown): {
    status: number;
    body: Record<string, unknown>;
  } {
    if (e instanceof HttpException) {
      const status = e.getStatus(),
        r = e.getResponse();
      if (typeof r === 'string')
        return { status, body: { statusCode: status, message: r } };
      const o = r as Record<string, unknown>;
      const message = Array.isArray(o.message)
        ? o.message.join('; ')
        : (o.message ?? e.message);
      return { status, body: { ...o, statusCode: status, message } };
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002') {
        const target = e.meta?.target;
        const cols = Array.isArray(target) ? (target as string[]) : [];
        const fields: Record<string, string> = {};
        for (const c of cols)
          if (c !== 'ownerId' && c !== 'userId')
            fields[FIELD_OF[c] ?? c] = 'This value is already used.';
        return {
          status: 409,
          body: {
            statusCode: 409,
            message: 'This already exists.',
            fields,
          },
        };
      }
      if (e.code === 'P2025')
        return {
          status: 404,
          body: { statusCode: 404, message: 'Not found.' },
        };
    }
    if (
      e instanceof Prisma.PrismaClientInitializationError ||
      (e instanceof Prisma.PrismaClientKnownRequestError &&
        /^P10\d\d$/.test(e.code))
    )
      return {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        body: {
          statusCode: 503,
          code: 'DB_UNAVAILABLE',
          message:
            'The database is not reachable. Check DATABASE_URL in server/.env and that PostgreSQL is running.',
        },
      };
    return {
      status: 500,
      body: { statusCode: 500, message: 'Internal server error.' },
    };
  }
}
