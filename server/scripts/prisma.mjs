// Runs the Prisma CLI against the database NODE_ENV picks (see src/config/database-url.ts).
//   node scripts/prisma.mjs [--local|--prod] <prisma args…>
// --local / --prod override NODE_ENV from server/.env for this one command.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDatabaseUrl } from '../src/config/database-url.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
if (existsSync(join(root, '.env'))) process.loadEnvFile(join(root, '.env'));

const args = process.argv.slice(2);
const flag = args[0] === '--prod' ? 'production' : args[0] === '--local' ? 'development' : null;
if (flag) args.shift();
const nodeEnv = flag ?? process.env.NODE_ENV ?? 'development';

let db;
try {
  db = resolveDatabaseUrl({ ...process.env, NODE_ENV: nodeEnv });
} catch (e) {
  console.error('Invalid server configuration (server/.env):\n  - ' + e.message);
  process.exit(1);
}
console.log(`NODE_ENV=${nodeEnv} → ${db.target === 'neon' ? 'Neon' : 'local PostgreSQL'} (${db.label})`);

// call Prisma's JS entry with node directly: no shell, so spaces in the project path are fine
const cli = join(root, 'node_modules', 'prisma', 'build', 'index.js');
const r = spawnSync(process.execPath, [cli, ...args], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: nodeEnv, DATABASE_URL: db.url, DIRECT_URL: db.directUrl },
});
process.exit(r.status ?? 1);
