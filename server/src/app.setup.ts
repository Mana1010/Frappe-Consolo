import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { validationPipe } from './common/validation';

/** Everything main.ts configures besides listen(); shared with the smoke test. */
export function setupApp(app: NestExpressApplication) {
  // scripts and notes can be up to 1 MB of text; JSON escaping can roughly double that
  app.useBodyParser('json', { limit: '3mb' });
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.useGlobalPipes(validationPipe());
  app.useGlobalFilters(new AllExceptionsFilter());
  return app;
}
