import { DbTarget, resolveDatabaseUrl } from './database-url';

export interface Env {
  NODE_ENV: string;
  DATABASE_URL: string;
  DB_TARGET: DbTarget;
  DB_LABEL: string;
  APP_SECRET_KEY: string;
  PORT: number;
}

/** Fails fast at boot with a message that says which line of server/.env to fix. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const errs: string[] = [];
  const nodeEnv =
    typeof raw.NODE_ENV === 'string' && raw.NODE_ENV.trim()
      ? raw.NODE_ENV.trim()
      : 'development';
  let db = { url: '', target: 'local' as DbTarget, label: '' };
  try {
    db = resolveDatabaseUrl({ ...raw, NODE_ENV: nodeEnv });
  } catch (e) {
    errs.push(e instanceof Error ? e.message : String(e));
  }
  const key =
    typeof raw.APP_SECRET_KEY === 'string' ? raw.APP_SECRET_KEY.trim() : '';
  if (!/^[0-9a-fA-F]{64}$/.test(key))
    errs.push(
      `APP_SECRET_KEY must be 64 hex characters (32 bytes), got ${key ? key.length + ' characters' : 'nothing'}. Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`,
    );
  const portRaw =
    typeof raw.PORT === 'string' || typeof raw.PORT === 'number'
      ? String(raw.PORT)
      : '4000';
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    errs.push(`PORT must be a port number, got "${portRaw}"`);
  if (errs.length)
    throw new Error(
      'Invalid server configuration (server/.env):\n  - ' + errs.join('\n  - '),
    );
  return {
    NODE_ENV: nodeEnv,
    DATABASE_URL: db.url,
    DB_TARGET: db.target,
    DB_LABEL: db.label,
    APP_SECRET_KEY: key,
    PORT: port,
  };
}
