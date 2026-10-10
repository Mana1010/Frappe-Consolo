import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { validateEnv } from './config/env.validation';
import { ConnectionsModule } from './connections/connections.module';
import { CryptoModule } from './crypto/crypto.module';
import { FrappeModule } from './frappe/frappe.module';
import { NotesModule } from './notes/notes.module';
import { PrismaModule } from './prisma/prisma.module';
import { RunsModule } from './runs/runs.module';
import { SchemaModule } from './schema/schema.module';
import { ScriptsModule } from './scripts/scripts.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
    PrismaModule,
    CryptoModule,
    FrappeModule,
    AuthModule,
    ConnectionsModule,
    SchemaModule,
    ScriptsModule,
    NotesModule,
    RunsModule,
  ],
})
export class AppModule {}
