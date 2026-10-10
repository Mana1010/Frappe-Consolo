import { HttpException, HttpStatus } from '@nestjs/common';

export type Fields = Record<string, string>;

/** Error body is always { statusCode, message, code?, fields? }. */
export class ApiError extends HttpException {
  constructor(
    status: number,
    message: string,
    extra: { code?: string; fields?: Fields } = {},
  ) {
    super({ statusCode: status, message, ...extra }, status);
  }
}

export const badRequest = (message: string, fields?: Fields) =>
  new ApiError(HttpStatus.BAD_REQUEST, message, fields ? { fields } : {});
export const conflict = (message: string, fields?: Fields, code?: string) =>
  new ApiError(HttpStatus.CONFLICT, message, { fields, code });
export const notFound = (what: string) =>
  new ApiError(HttpStatus.NOT_FOUND, what + ' not found.');
export const secretRequired = () =>
  new ApiError(
    HttpStatus.CONFLICT,
    'Enter the API secret for this connection. It was kept in memory only and the server has restarted.',
    { code: 'SECRET_REQUIRED' },
  );
export const authRequired = (message = 'Sign in to continue.') =>
  new ApiError(HttpStatus.UNAUTHORIZED, message, { code: 'AUTH_REQUIRED' });
