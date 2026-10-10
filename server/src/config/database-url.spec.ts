import { resolveDatabaseUrl } from './database-url';
import { validateEnv } from './env.validation';

const LOCAL =
  'postgresql://postgres:pw@localhost:8080/frappe_script_board?schema=public';
const NEON_POOLED =
  'postgresql://u:pw@ep-cool-art-123-pooler.ap-southeast-1.aws.neon.tech/neondb';
const KEY = 'a'.repeat(64);

describe('resolveDatabaseUrl', () => {
  it('uses the local URL outside production', () => {
    for (const NODE_ENV of [undefined, '', 'development', 'test']) {
      const db = resolveDatabaseUrl({
        NODE_ENV,
        DATABASE_URL_LOCAL: LOCAL,
        DATABASE_URL_PROD: NEON_POOLED,
      });
      expect(db.target).toBe('local');
      expect(db.url).toBe(LOCAL);
      expect(db.directUrl).toBe(LOCAL);
      expect(db.label).toBe('localhost:8080/frappe_script_board');
    }
  });

  it('accepts the old DATABASE_URL as the local URL', () => {
    expect(resolveDatabaseUrl({ DATABASE_URL: LOCAL }).url).toBe(LOCAL);
  });

  it('uses Neon in production, adds sslmode and derives the direct host', () => {
    const db = resolveDatabaseUrl({
      NODE_ENV: 'Production',
      DATABASE_URL_LOCAL: LOCAL,
      DATABASE_URL_PROD: NEON_POOLED,
    });
    expect(db.target).toBe('neon');
    expect(db.url).toContain('-pooler.');
    expect(db.url).toContain('sslmode=require');
    expect(db.directUrl).not.toContain('-pooler');
    expect(db.directUrl).toContain(
      'ep-cool-art-123.ap-southeast-1.aws.neon.tech',
    );
    expect(db.label).not.toContain('pw');
  });

  it('prefers an explicit DIRECT_URL_PROD and keeps an existing sslmode', () => {
    const db = resolveDatabaseUrl({
      NODE_ENV: 'production',
      DATABASE_URL_PROD: NEON_POOLED + '?sslmode=verify-full',
      DIRECT_URL_PROD: 'postgresql://u:pw@direct.example/neondb',
    });
    expect(db.url).toContain('sslmode=verify-full');
    expect(db.directUrl).toBe('postgresql://u:pw@direct.example/neondb');
  });

  it('never falls back to the local database in production', () => {
    expect(() =>
      resolveDatabaseUrl({ NODE_ENV: 'production', DATABASE_URL_LOCAL: LOCAL }),
    ).toThrow(/DATABASE_URL_PROD/);
  });
});

describe('validateEnv', () => {
  it('reports the database target', () => {
    const env = validateEnv({
      NODE_ENV: 'production',
      DATABASE_URL_PROD: NEON_POOLED,
      APP_SECRET_KEY: KEY,
    });
    expect(env.DB_TARGET).toBe('neon');
    expect(env.NODE_ENV).toBe('production');
    expect(env.PORT).toBe(4000);
  });

  it('lists every problem at once', () => {
    expect(() =>
      validateEnv({ NODE_ENV: 'production', APP_SECRET_KEY: 'x' }),
    ).toThrow(/DATABASE_URL_PROD[\s\S]*APP_SECRET_KEY/);
  });
});
