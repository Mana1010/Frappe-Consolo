# Frappe Script Board — server

NestJS 11 + Prisma 6 API for the script board. The browser talks only to Next.js, which proxies `/api/*` here; this server calls Frappe server-to-server, so Frappe needs no `allow_cors` and API secrets never reach the browser. It listens on `127.0.0.1` only, with no CORS.

## Setup

```bash
npm install
# edit .env: replace YOUR_PASSWORD in DATABASE_URL (PostgreSQL on localhost:8080)
npm run db:migrate        # prisma migrate deploy (creates the tables)
npm run start:dev         # http://127.0.0.1:4000/api
```

`npm install` runs `prisma generate` via the client's postinstall. If npm blocks install scripts, run `npm run prisma:generate` yourself.

## Environment (`.env`, template in `.env.example`)

| Var | Meaning |
| --- | --- |
| `DATABASE_URL` | `postgresql://postgres:YOUR_PASSWORD@localhost:8080/frappe_script_board?schema=public` |
| `APP_SECRET_KEY` | 64 hex chars. It encrypts each connection's URL, key and secret (AES-256-GCM) and derives the duplicate-check fingerprint. If you change it, saved connections can't be decrypted any more. |
| `PORT` | default `4000` |

The server checks this config at boot and exits with a clear message if something is wrong. If the database can't be reached, the server still starts: guest features keep working, and anything that needs the database returns 503 `DB_UNAVAILABLE`.

## Scripts

| Script | What it does |
| --- | --- |
| `start:dev` / `build` / `start:prod` | watch mode / compile to `dist` / run `dist/main` |
| `test` | Jest unit tests (guard, crypto, auth, connections, protocol, Frappe helpers) |
| `lint` | ESLint + Prettier (`src/guard/guard.ts` is excluded; it stays byte-identical to the client copy) |
| `prisma:generate` / `db:migrate` | `prisma generate` / `prisma migrate deploy` |
| `smoke` | end-to-end guest flow against the mock Frappe on `127.0.0.1:8765` (`MOCK_URL` overrides). The database is stubbed out. |

## Module map (`src/`)

- `config/`: env validation.
- `common/`: error shape `{ statusCode, message, code?, fields? }`, the global exception filter (Prisma P2002 → 409 with `fields`, P2025 → 404, DB down → 503) and the validation pipe.
- `prisma/`: `PrismaService`.
- `crypto/`: AES-256-GCM `iv:tag:ciphertext` and the HKDF/HMAC fingerprint.
- `auth/`: scrypt passwords, sessions (`fsb_session` cookie, only sha256 stored, 30-day sliding expiry), the `fsb_guest` cookie middleware, `@RequireAuth()` (→ 401 `AUTH_REQUIRED`), a login rate limit, and `/auth/*`.
- `frappe/`: axios client (`get_logged_user`, `get_versions`, `execute_code`), error mapping with the HTML board's messages, and the `normUrl` / `splitToken` / `credErr` / `serverMsg` ports.
- `connections/`: saved connections (encrypted, scoped to the owner), temporary `tmp_…` connections held in memory per guest id (12 h idle expiry), the in-memory secret map for `saveSecret=false`, and the persist endpoint.
- `schema/`: schema sync script and parser. Temporary connections cache it in memory, saved ones in `SchemaCache`.
- `scripts/`, `notes/`: per-user CRUD. Sign-in is required.
- `runs/`: READ, DRY_RUN and COMMIT. `protocol.ts` holds the PRELUDE and the epilogues, marker parsing and traceback renumbering. History is per user, and guest READ runs are not stored.
- `guard/guard.ts`: shared read-only and write-mode scanner. This copy is authoritative.

## Local vs Neon database

`NODE_ENV` in `server/.env` picks the database (the server logs which one at boot):

| NODE_ENV | Database | Variable |
|---|---|---|
| `development` (default) | local PostgreSQL (pgAdmin, port 8080) | `DATABASE_URL_LOCAL` |
| `production` | Neon | `DATABASE_URL_PROD` (+ optional `DIRECT_URL_PROD`) |

- Neon URLs get `sslmode=require` if missing. For a pooled `-pooler` URL, migrations use the direct host automatically (or set `DIRECT_URL_PROD`).
- Production never falls back to the local database.
- `npm run db:migrate` follows `NODE_ENV`; `npm run db:migrate:local` / `db:migrate:prod` force one. Also `db:status`, `db:studio`.
- Use the same `APP_SECRET_KEY` everywhere that shares a database, or saved connections can't be decrypted.
