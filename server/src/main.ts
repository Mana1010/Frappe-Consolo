import './config/load-env';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { setupApp } from './app.setup';

async function bootstrap() {
  // no CORS: the browser only talks to Next.js, which proxies /api here
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  setupApp(app).enableShutdownHooks();
  const config = app.get(ConfigService);
  const port = config.getOrThrow<number>('PORT');
  await app.listen(port, '127.0.0.1');
  const log = new Logger('Bootstrap');
  log.log(`API on http://127.0.0.1:${port}/api`);
  log.log(
    `NODE_ENV=${config.get<string>('NODE_ENV')} → database: ${config.get<string>('DB_TARGET') === 'neon' ? 'Neon' : 'local PostgreSQL'} (${config.get<string>('DB_LABEL')})`,
  );
}

bootstrap().catch((e: unknown) => {
  // config errors are already readable; don't bury them in a stack trace
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
