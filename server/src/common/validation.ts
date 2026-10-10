import { ValidationError, ValidationPipe } from '@nestjs/common';
import { badRequest } from './errors';

const first = (e: ValidationError): string =>
  Object.values(e.constraints ?? {})[0] ??
  (e.children?.length ? first(e.children[0]) : 'Invalid value.');

export const validationPipe = () =>
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errs) => {
      const fields: Record<string, string> = {};
      for (const e of errs) fields[e.property] = first(e);
      return badRequest(Object.values(fields).join(' '), fields);
    },
  });
