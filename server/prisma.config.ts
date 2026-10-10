import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'prisma/config';
import { applyDatabaseUrl } from './src/config/database-url';

// Prisma skips its own .env loading when this file exists, so load it here and let
// NODE_ENV pick the database: plain `npx prisma …` then behaves like `npm run db:*`.
const envFile = join(process.cwd(), '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);
if (!process.env.NODE_ENV) process.env.NODE_ENV = 'development';
const db = applyDatabaseUrl();
console.log(
  `NODE_ENV=${process.env.NODE_ENV} → ${db.target === 'neon' ? 'Neon' : 'local PostgreSQL'} (${db.label})`,
);

export default defineConfig({ schema: join('prisma', 'schema.prisma') });
