import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly log = new Logger('Prisma');

  async onModuleInit() {
    // boot anyway so the API can answer 503 with a clear message instead of a crash loop
    try {
      await this.$connect();
    } catch (e) {
      this.log.error(
        'Could not connect to PostgreSQL. Check DATABASE_URL in server/.env, then run npm run db:migrate. ' +
          (e instanceof Error ? e.message.split('\n').pop() : String(e)),
      );
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
