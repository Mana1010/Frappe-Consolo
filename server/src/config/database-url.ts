export type DbTarget = 'local' | 'neon';

export interface ResolvedDb {
  target: DbTarget;
  url: string;
  /** Non-pooled URL for migrations (Neon's pooler can't hold the advisory locks Prisma migrate uses). */
  directUrl: string;
  /** host/db only, safe to log */
  label: string;
}

const isProd = (nodeEnv: unknown) =>
  typeof nodeEnv === 'string' && nodeEnv.trim().toLowerCase() === 'production';

/**
 * NODE_ENV=production → DATABASE_URL_PROD (Neon); anything else → DATABASE_URL_LOCAL (local PostgreSQL).
 * Plain DATABASE_URL is still accepted as the local URL so older .env files keep working.
 */
export function resolveDatabaseUrl(env: Record<string, unknown>): ResolvedDb {
  const str = (k: string) => (typeof env[k] === 'string' ? env[k].trim() : '');
  const prod = isProd(env.NODE_ENV);
  const key = prod ? 'DATABASE_URL_PROD' : 'DATABASE_URL_LOCAL';
  const raw = prod ? str(key) : str(key) || str('DATABASE_URL');
  if (!/^postgres(ql)?:\/\//.test(raw))
    throw new Error(
      prod
        ? 'NODE_ENV is production, so DATABASE_URL_PROD must be your Neon connection string (postgresql://…neon.tech/…?sslmode=require). Copy it from console.neon.tech → Connect.'
        : 'DATABASE_URL_LOCAL must be a postgresql:// URL, e.g. postgresql://postgres:YOUR_PASSWORD@localhost:8080/frappe_script_board?schema=public',
    );
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error(`${key} is not a valid URL.`);
  }
  const neon = /\.neon\.tech$/i.test(u.hostname);
  if (neon && !u.searchParams.has('sslmode'))
    u.searchParams.set('sslmode', 'require');
  const pooled = /-pooler\./i.test(u.hostname);

  let direct = prod ? str('DIRECT_URL_PROD') : '';
  if (!direct) {
    const d = new URL(u.toString());
    // Neon's direct endpoint is the pooled host without "-pooler"
    if (pooled) d.hostname = d.hostname.replace(/-pooler\./i, '.');
    direct = d.toString();
  }
  return {
    target: prod ? 'neon' : 'local',
    url: u.toString(),
    directUrl: direct,
    label: `${u.hostname}${u.port ? ':' + u.port : ''}${u.pathname}`,
  };
}

/** Puts the resolved URLs where Prisma (schema env("DATABASE_URL") / env("DIRECT_URL")) expects them. */
export function applyDatabaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): ResolvedDb {
  const db = resolveDatabaseUrl(env);
  env.DATABASE_URL = db.url;
  env.DIRECT_URL = db.directUrl;
  return db;
}
