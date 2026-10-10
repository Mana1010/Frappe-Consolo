import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { applyDatabaseUrl } from './database-url';

// Runs before Nest boots so Prisma sees the URL picked by NODE_ENV.
// Variables already set in the shell win over server/.env.
const file = join(__dirname, '..', '..', '.env');
if (existsSync(file)) process.loadEnvFile(file);
if (!process.env.NODE_ENV) process.env.NODE_ENV = 'development';
try {
  applyDatabaseUrl();
} catch (e) {
  // same readable, stack-free style as the other config errors
  console.error(
    'Invalid server configuration (server/.env):\n  - ' +
      (e instanceof Error ? e.message : String(e)),
  );
  process.exit(1);
}
