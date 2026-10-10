# Frappe Script Board v2 — build spec

Migration of `Frappe script board.html` (single-file, browser-only) to:

- `client/` — Next.js 16 (App Router, TypeScript, `src/` dir), Tailwind CSS 4, TanStack React Query 5, Zustand 5, axios, CodeMirror 6.
- `server/` — NestJS 11 (pin `@nestjs/*` to 11.x), Prisma 6 (pin `prisma` and `@prisma/client` to 6.19.x, classic `prisma-client-js` generator), PostgreSQL, axios, class-validator.

The old HTML file stays untouched as a reference. **Port its logic, do not invent new behaviour** unless this spec says so. The HTML file is the source of truth for: tokenizer, SQL-in-string highlighting, completions (frappe API list, schema-aware SQL, query-variable fields), checks, cheatsheet, snippets, read-only guard, output parsing (`parseOut`, `prettyJson`, `toTable`, `parseAll`, `formatLoose`), key/secret validation (`credErr`, `splitToken`, `normUrl`), notes pad.

Single user, no login. Runs on the user's Windows PC.

## v2.1 CHANGES — optional sign-in + encrypted connection fields (these SUPERSEDE earlier sections wherever they conflict)

### Guests vs signed-in users
- Anyone can use the app without an account (**guest**). Guests can create **temporary connections** and run READ queries.
- Anything that **saves** requires sign-in: saving a connection to the database, saving/updating/deleting scripts, run history, write mode (writable connections, dry run, commit), schema cache in the DB, notes on the server.
- When a guest triggers a save, the API returns **401 `{ code: "AUTH_REQUIRED", message }`**. The client opens the Sign in / Create account dialog with a reason line (e.g. "Sign in to save this connection"), and after success **retries the original action automatically**.
- Guest data: temporary connections (incl. their secret and schema) live in server memory keyed by the guest session, expire after 12 h of inactivity, and are lost on server restart. Guest READ runs are executed but **not stored** (RunDto still returned, with `id: null`). Guest notes pad and draft stay in localStorage only.
- After sign-in, the guest's temporary connections remain usable in that browser and are listed as "Temporary" with a **Save to my account** action (`POST /connections/:id/persist`). Nothing is moved into the account without that explicit action.

### Auth (server)
- Local accounts: email (lowercased, unique) + password (min 8 chars) + optional name. Hash with Node's built-in `crypto.scrypt` (N=16384, r=8, p=1, 16-byte salt, 64-byte key; store `scrypt$N$r$p$salt$hash` base64). No native modules.
- Sessions: opaque random token (32 bytes) in an **httpOnly, SameSite=Lax, path=/ cookie `fsb_session`** (not Secure, since it's http://localhost), 30-day expiry, sliding on use. Store only `sha256(token)` in the DB. Logout deletes the session.
- Guests get an httpOnly cookie `fsb_guest` (random id) issued by middleware on the first request without a valid session. Signed-in requests may also carry it (so temporary connections stay usable).
- Use `cookie-parser`. A global guard/decorator sets `req.user` (or null) and `req.guestId`; `@RequireAuth()` endpoints throw the AUTH_REQUIRED 401.
- Simple in-memory rate limit on login/register: max 10 attempts per 15 minutes per (email + IP) → 429.
- Endpoints: `POST /auth/register {email, password, name?}` → sets cookie, `{ user }`; `POST /auth/login {email, password}` → `{ user }` (generic "Email or password is wrong"); `POST /auth/logout` → 204; `GET /auth/me` → `{ user: { id, email, name } | null }`.

### Encrypted connection fields
- `url`, `apiKey` and `apiSecret` are ALL stored encrypted (AES-256-GCM with `APP_SECRET_KEY`): columns `urlEnc`, `apiKeyEnc`, `secretEnc` (secretEnc null when saveSecret=false → in-memory map as before).
- Duplicate detection without plaintext: `fingerprint = HMAC-SHA256(key derived from APP_SECRET_KEY via HKDF "fsb-fingerprint", ownerId + "|" + url + "|" + apiKey)` hex, `@@unique([ownerId, fingerprint])`. Name unique per owner: `@@unique([ownerId, name])` (case-insensitive check in code).
- The API **never returns** url, apiKey or secret (not even partially) for any connection, saved or temporary. `ConnectionDto` becomes:
  `{ id, name, persisted: boolean, user, frappeVersion, saveSecret, hasSecret, writable, createdAt, updatedAt }` (no url/host/apiKeyHint). Labels everywhere use the connection **name** only (output meta: "Sandbox · 1.2 s · …").
- `PATCH /connections/:id`: url/apiKey/apiSecret are optional; **blank/omitted = keep the stored value**. If any is provided, decrypt the stored ones, merge, re-test, re-encrypt, recompute fingerprint.
- Client edit form for an existing connection: URL, API key and secret inputs start EMPTY with an info line under each: "🔒 Encrypted and hidden. Leave blank to keep the current value." After a successful create/update show a toast "Saved. URL, key and secret are encrypted and can't be viewed again." The secret Show/Hide toggle only reveals what the user is typing now.
- Writable is only allowed for persisted connections owned by the signed-in user.
- `POST /connections` gains `temporary?: boolean`. Guest + `temporary: true` → in-memory temporary connection (DTO `persisted: false`). Guest + `temporary` false/omitted → 401 AUTH_REQUIRED ("Sign in to save this connection"). Signed-in → persisted by default, or temporary if asked.
- `POST /connections/:id/persist` (auth required) → moves a temporary connection of this browser's guest session into the user's account (encrypt, fingerprint, name-uniqueness check) and removes the in-memory copy → `ConnectionDto` with `persisted: true` and a NEW id (client switches the active id).
- `GET /connections` returns the user's saved connections (if signed in) plus this guest session's temporary ones, temporary first.
- Temporary connection ids are prefixed `tmp_` so both sides can tell them apart.

### Data model delta (replace the models in "Data model" accordingly)
```prisma
model User {
  id           String   @id @default(cuid())
  email        String   @unique
  name         String?
  passwordHash String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  sessions     Session[]
  connections  Connection[]
  scripts      Script[]
  runs         Run[]
  note         Note?
}
model Session {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash String   @unique
  expiresAt DateTime
  createdAt DateTime @default(now())
  lastUsedAt DateTime @default(now())
  @@index([userId])
}
model Connection {
  id            String   @id @default(cuid())
  ownerId       String
  owner         User     @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  name          String
  urlEnc        String
  apiKeyEnc     String
  secretEnc     String?
  fingerprint   String
  saveSecret    Boolean  @default(true)
  user          String?
  frappeVersion String?
  writable      Boolean  @default(false)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  scripts       Script[]
  runs          Run[]
  schema        SchemaCache?
  @@unique([ownerId, name])
  @@unique([ownerId, fingerprint])
}
// Script: add ownerId (required, relation to User, onDelete Cascade). Run: add userId (required, relation, onDelete Cascade).
// Note: replace `id Int @id @default(1)` with `userId String @id` (relation to User, onDelete Cascade).
```
Every query is scoped to the signed-in user (404 for other users' rows).

### Client delta
- Top bar: "Sign in" button for guests; for users, an account menu (email, Sign out).
- Auth dialog: tabs Sign in / Create account, inline validation, shows the reason when opened by AUTH_REQUIRED, retries the pending action on success, then invalidates all queries.
- Connection dialog for guests: primary button "Test and use" (temporary); secondary "Save to my account" (prompts sign-in). For users: "Test and save". Manage dialog shows Temporary vs Saved sections; temporary rows have "Save to my account".
- Saved tab, History page, Writable toggle, Dry run: guests see a sign-in prompt instead.
- Axios interceptor: on 401 AUTH_REQUIRED → open the auth dialog with the reason and a retry callback.

## Why the migration
The browser no longer talks to Frappe. The browser talks only to the Next.js origin; Next.js rewrites `/api/*` to the NestJS server; NestJS calls Frappe server-to-server. So Frappe needs **no `allow_cors`**, secrets never reach the browser, and the read-only guard is enforced on the server (the client copy is only for live feedback).

## Ports and processes
- Frappe (existing): `http://localhost:8000` (v13.58.22, inside WSL).
- PostgreSQL (existing Windows service, v18): `localhost:8080` (unusual port, yes).
- NestJS: `http://127.0.0.1:4000`, global prefix `api`. Bind to `127.0.0.1` only. No CORS needed (requests come through the Next rewrite); do not enable CORS.
- Next.js: `http://localhost:3000`. `next.config.ts` rewrites `/api/:path*` → `${process.env.API_URL ?? "http://127.0.0.1:4000"}/api/:path*`. axios instance uses `baseURL: "/api"`.

## Facts about the target Frappe v13 System Console (verified from the user's bench source)
- Endpoint: `POST /api/method/frappe.desk.doctype.system_console.system_console.execute_code`, form-encoded field `doc` = JSON `{"doctype":"System Console","console":<code>,"commit":0|1}`. Response `{"message": {..., "output": "<text>"}}`.
- `run()`: executes via `safe_exec`; on exception `output` = traceback (starts with `Traceback (most recent call last)`); then **commits if commit=1 even after an exception**, else rolls back; then inserts a Console Log and commits.
- Auth header: `Authorization: token <api_key>:<api_secret>` (key first).
- Logged-in user: `GET /api/method/frappe.auth.get_logged_user` → `{"message": "<user>"}`.
- Versions: `GET /api/method/frappe.utils.change_log.get_versions` → `{"message": {"frappe": {"version": "13.58.22", ...}, "erpnext": {...}}}`.
- Sandbox globals that exist on v13: `log` (one value, any type), `json.loads`, `json.dumps`, `_dict`, `frappe.get_doc/get_cached_doc/get_list/get_all/get_meta/copy_doc/format/format_value/utils.*(data utils)/session.user/throw/msgprint/log_error/qb/call/enqueue/sendmail/rename_doc/...`, `frappe.db.{get_list,get_all,get_value,set_value,get_single_value,get_default,exists,count,escape,sql,commit,rollback}`.
- **NOT available on v13**: `frappe.as_json`, `frappe.parse_json`, `frappe.db.sql_list`, `frappe.db.get_values`, `frappe.get_last_doc`, `frappe.get_cached_value`, `frappe.new_doc`. Calling a missing name raises `AttributeError: module has no attribute 'x'` only when called.
- `frappe.db.sql` in the sandbox only accepts queries whose stripped lowercase text **starts with `select`** (so `WITH` fails on v13).
- Names starting with `_` are rejected by RestrictedPython (except `_dict`). Item keys starting with `_` are rejected.
- `doc.flags.ignore_validate = True` is honoured by `Document.save()`.
- Recommended way to print rows as JSON on every version: `log(json.dumps(rows, default=str))`. Update all docs/snippets/cheats/hints that mention `frappe.as_json` to this.

## Data model (server/prisma/schema.prisma)
```prisma
model Connection {
  id            String   @id @default(cuid())
  name          String   @unique
  url           String              // origin only, e.g. http://localhost:8000
  apiKey        String
  secretEnc     String?             // AES-256-GCM, null when saveSecret=false
  saveSecret    Boolean  @default(true)
  user          String?             // from get_logged_user at last test
  frappeVersion String?             // from get_versions at last test, e.g. "13.58.22"
  writable      Boolean  @default(false)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  scripts       Script[]
  runs          Run[]
  schema        SchemaCache?
  @@unique([url, apiKey])
}
model Script {
  id           String      @id @default(cuid())
  name         String
  code         String      @db.Text
  connectionId String?
  connection   Connection? @relation(fields: [connectionId], references: [id], onDelete: SetNull)
  createdAt    DateTime    @default(now())
  updatedAt    DateTime    @updatedAt
}
enum RunMode   { READ DRY_RUN COMMIT }
enum RunStatus { OK ERROR BLOCKED FAILED ABORTED }
model Run {
  id             String      @id @default(cuid())
  connectionId   String?
  connection     Connection? @relation(fields: [connectionId], references: [id], onDelete: SetNull)
  connectionName String
  mode           RunMode
  status         RunStatus
  code           String      @db.Text
  output         String?     @db.Text   // raw user-visible console output (protocol markers removed)
  error          String?     @db.Text   // request/guard error message
  blocked        Json?                  // [{line, what}] when BLOCKED
  plan           Json?                  // DRY_RUN: planned changes; COMMIT: applied changes
  planText       String?     @db.Text   // DRY_RUN only: exact JSON text returned by Frappe (embedded verbatim in the commit run)
  changeCount    Int?
  dryRunId       String?                // COMMIT: the DRY_RUN it confirmed
  committedRunId String?                // DRY_RUN: set once committed (a dry run can be committed once)
  durationMs     Int?
  createdAt      DateTime    @default(now())
  @@index([createdAt])
}
model SchemaCache {
  connectionId String     @id
  connection   Connection @relation(fields: [connectionId], references: [id], onDelete: Cascade)
  data         Json       // { doctypes: [{ name, istable, issingle, fields: [{ f, t, o, l }] }] }
  doctypeCount Int
  syncedAt     DateTime   @default(now())
}
model Note {
  id        Int      @id @default(1)
  content   String   @db.Text
  updatedAt DateTime @updatedAt
}
```

## Server config (`server/.env`, with `server/.env.example` committed)
```
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:8080/frappe_script_board?schema=public"
APP_SECRET_KEY="<64 hex chars = 32 bytes; generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\">"
PORT=4000
```
Create `server/.env` with a freshly generated `APP_SECRET_KEY` and the placeholder password `YOUR_PASSWORD` (the user fills it in). Add `.env` to `.gitignore`. On boot, fail fast with a clear message if `APP_SECRET_KEY` is missing/not 64 hex chars.

Secrets: encrypt with AES-256-GCM (`iv:tag:ciphertext` base64). When `saveSecret=false`, keep the secret only in an in-memory `Map<connectionId, secret>` (lost on server restart) and set `secretEnc=null`.

## REST API (all under `/api`; JSON; errors as `{ statusCode, message, code? }`)
Never return `apiKey` in full or the secret. Connection DTO returned to the client:
```ts
type ConnectionDto = { id; name; url; host; apiKeyHint /* first 4 + "…" */; user; frappeVersion; saveSecret; hasSecret /* saved, or in memory */; writable; createdAt; updatedAt }
```

### Connections
- `GET /connections` → `ConnectionDto[]` ordered by name.
- `POST /connections/test` body `{ url, apiKey, apiSecret }` → `{ user, frappeVersion, swapped }`. Validates fields (port `normUrl`, `splitToken`, `credErr` rules → 400 with field-specific messages `{ message, fields: { url?, apiKey?, apiSecret? } }`). Calls get_logged_user; on 401 retries once with key/secret swapped (`swapped: true` and the caller should store swapped values). Then get_versions (ignore failure → `frappeVersion: null`). Guest → error.
- `POST /connections` body `{ name, url, apiKey, apiSecret, saveSecret }` → runs the same test, stores (swapped if needed), returns `ConnectionDto`. Name rules: trimmed, 1–40 chars, unique case-insensitively (409 `{ fields: { name } }`). Duplicate url+apiKey → 409 "Already saved as …".
- `PATCH /connections/:id` body any of `{ name, url, apiKey, apiSecret, saveSecret, writable, confirmName }`.
  - Changing url/apiKey/apiSecret re-tests (as POST). Omitting `apiSecret` keeps the existing secret.
  - `writable: true` requires `confirmName` equal to the connection's current name (else 400 "Type the connection name to confirm"). `writable: false` needs nothing.
- `DELETE /connections/:id` → 204 (runs keep `connectionName`; scripts get `connectionId=null`).
- `POST /connections/:id/secret` body `{ apiSecret }` → re-tests and keeps in memory (or saved if saveSecret) → `ConnectionDto`. Used when `hasSecret=false`.
- `POST /connections/:id/test` → re-test stored credentials, updates user/frappeVersion → `ConnectionDto`.

### Schema
- `GET /connections/:id/schema` → `{ syncedAt, doctypeCount, doctypes: [...] } | null` (null if never synced).
- `POST /connections/:id/schema/sync` → runs one read-only script through execute_code (commit 0):
  ```python
  rows = frappe.db.sql("""
      SELECT df.parent AS dt, df.fieldname AS f, df.fieldtype AS t, df.options AS o, df.label AS l
      FROM `tabDocField` df
      WHERE df.parenttype = 'DocType'
        AND df.fieldtype NOT IN ('Section Break', 'Column Break', 'Tab Break', 'HTML', 'Button', 'Heading', 'Fold')
      ORDER BY df.parent, df.idx
  """, as_dict=True)
  custom = frappe.db.sql("""
      SELECT dt, fieldname AS f, fieldtype AS t, options AS o, label AS l
      FROM `tabCustom Field`
      WHERE fieldtype NOT IN ('Section Break', 'Column Break', 'Tab Break', 'HTML', 'Button', 'Heading', 'Fold')
  """, as_dict=True)
  doctypes = frappe.db.sql("""SELECT name, istable, issingle FROM `tabDocType`""", as_dict=True)
  log(json.dumps({"fields": rows, "custom": custom, "doctypes": doctypes}, default=str))
  ```
  Parse, merge custom fields after standard ones, store in SchemaCache, return like GET. Fields `o`/`l` may be null — drop nulls to save space.

### Scripts
- `GET /scripts` (newest first, include `connectionName`), `POST /scripts` `{ name, code, connectionId? }`, `PATCH /scripts/:id` `{ name?, code?, connectionId? }`, `DELETE /scripts/:id`.

### Notes pad
- `GET /notes` → `{ content, updatedAt }` (create row id=1 if missing). `PUT /notes` `{ content }` (max 1 MB).

### Runs
Common response:
```ts
type RunDto = { id; mode: "READ"|"DRY_RUN"|"COMMIT"; status: "OK"|"ERROR"|"BLOCKED"|"FAILED"|"ABORTED";
  connectionId; connectionName; output: string|null; error: string|null; blocked: {line:number; what:string}[]|null;
  plan: Change[]|null; changeCount: number|null; dryRunId: string|null; committedRunId: string|null;
  durationMs: number|null; createdAt; code: string }
type Change = { doctype: string; name: string; field: string; before: unknown; after: unknown; how: "db"|"doc"; ignore_validate: boolean }
```
- `POST /runs/read` `{ connectionId, code }`:
  1. Server `readOnlyScan(code)`; if hits → store Run BLOCKED, return 200 with status BLOCKED (not an HTTP error).
  2. Needs a secret (else 409 `code: "SECRET_REQUIRED"`).
  3. execute_code commit 0. Output starting with/containing a line `Traceback (most recent call last)` → ERROR else OK. HTTP/network failure → FAILED with mapped message (same wording as the HTML `call()`: 401, 403 System Manager, 404, network/timeout, `ServerScriptNotEnabled` hint `bench set-config -g server_script_enabled 1`).
  4. Store Run, return RunDto.
- `POST /runs/dry-run` `{ connectionId, code }`:
  1. Connection must be `writable` (else 403 "This connection is read-only. Make it writable in Manage connections.").
  2. `writeModeScan(code)` (see Guard). Hits → BLOCKED.
  3. Send `PRELUDE + code + DRY_EPILOGUE` with commit 0 (protocol below). Extract the plan marker line, strip markers from the user-visible output. ERROR if traceback. Store `plan` (parsed) and `planText` (exact JSON text after the marker), `changeCount`.
- `POST /runs/:dryRunId/commit` `{ confirm }`:
  1. Load the DRY_RUN (must be status OK, same connection still writable, `committedRunId` null, created < 15 minutes ago, changeCount > 0). Use the **code stored on the dry run**, never code from the request.
  2. `confirm` must equal `String(changeCount)` or `"COMMIT"` (case-sensitive) else 400.
  3. Re-run `writeModeScan` on the stored code (defence in depth).
  4. Send `PRELUDE + code + COMMIT_EPILOGUE(planText)` with **commit 1**.
  5. Parse markers: `@@FSB_APPLIED@@<n>` → status OK, plan = dry run plan; `@@FSB_ABORT@@<msg>` → ABORTED with error msg; traceback → ERROR (nothing was written: the planning phase only reads); else FAILED.
  6. Store COMMIT run with `dryRunId`; set the dry run's `committedRunId` (even when aborted, so it can't be retried blindly; the user re-runs the dry run).
- `GET /runs?connectionId=&mode=&status=&cursor=&take=50` → `{ items: RunDto[] (without code/output for list — include `codePreview` first 120 chars), nextCursor }`.
- `GET /runs/:id` → full RunDto.

### Write-mode protocol (Python injected around the user's code)
User-facing helpers, documented in the client (cheatsheet group "Write mode", help, hint docs):
- `set_value(doctype, name, field, value)` or `set_value(doctype, name, {field: value, ...})` — direct DB write via `frappe.db.set_value`: **skips validation, hooks and GL posting**.
- `update_doc(doctype, name, {field: value, ...}, ignore_validate=False)` — loads the document, updates fields, `save()`; runs validation unless `ignore_validate=True`.
These only **record** the intended change during the script. Nothing is written while the user's code runs. Writes happen after the script, in one block, only in the commit run, only if the plan is identical to the confirmed dry run.

PRELUDE:
```python
fsb_plan = []
def fsb_record(doctype, name, values, how, ignore_validate):
    if not isinstance(values, dict) or not values:
        frappe.throw("Pass the changes as a dict of field: value")
    current = frappe.db.get_value(doctype, name, list(values.keys()), as_dict=True)
    if not current:
        frappe.throw("Not found: " + str(doctype) + " " + str(name))
    for f in sorted(values.keys()):
        fsb_plan.append({"doctype": doctype, "name": name, "field": f, "before": current.get(f), "after": values[f], "how": how, "ignore_validate": ignore_validate})
def set_value(doctype, name, field, value=None):
    fsb_record(doctype, name, field if isinstance(field, dict) else {field: value}, "db", False)
def update_doc(doctype, name, values, ignore_validate=False):
    fsb_record(doctype, name, values, "doc", bool(ignore_validate))
```
DRY_EPILOGUE:
```python
log("@@FSB_PLAN@@" + json.dumps(fsb_plan, default=str, sort_keys=True))
```
COMMIT_EPILOGUE (`<PLAN_LITERAL>` = `JSON.stringify(planText)`, a valid Python string literal):
```python
fsb_expected = json.loads(<PLAN_LITERAL>)
fsb_actual = json.loads(json.dumps(fsb_plan, default=str, sort_keys=True))
if fsb_actual != fsb_expected:
    log("@@FSB_ABORT@@The data changed since the dry run, so nothing was written. Run the dry run again.")
else:
    try:
        fsb_docs = {}
        for c in fsb_plan:
            if c["how"] == "db":
                frappe.db.set_value(c["doctype"], c["name"], c["field"], c["after"])
            else:
                k = (c["doctype"], c["name"])
                if k not in fsb_docs:
                    fsb_docs[k] = {"values": {}, "ignore_validate": c["ignore_validate"]}
                fsb_docs[k]["values"][c["field"]] = c["after"]
        for k in fsb_docs:
            d = frappe.get_doc(k[0], k[1])
            d.update(fsb_docs[k]["values"])
            if fsb_docs[k]["ignore_validate"]:
                d.flags.ignore_validate = True
            d.save()
        log("@@FSB_APPLIED@@" + str(len(fsb_plan)))
    except Exception as e:
        frappe.db.rollback()
        log("@@FSB_ABORT@@Writing failed, so everything was rolled back: " + str(e))
```
Markers are on their own `log()` line. Strip every `@@FSB_…@@` line from `output` shown to the user. Line numbers: the user's code starts after the prelude, so when the output is a traceback, rewrite `line N` references inside `File "<serverscript>"` frames to `N - PRELUDE_LINE_COUNT` when N is inside the user code range (best effort).

## Guard (server is authoritative; client keeps an identical copy for live Checks)
Put the guard in `server/src/guard/guard.ts` and the same file in `client/src/lib/analysis/guard.ts` (plus the tokenizer it needs). Port `readOnlyScan` from the HTML **exactly**, with these v13 adjustments:
- `RO_FRAPPE` additionally allows `json.dumps`, `json.loads` (top-level `json` name, chain `json.dumps` / `json.loads` only; bare `json` or other `json.*` blocked like frappe chains) and `_dict`.
- Keep `frappe.as_json` etc. allowed in the guard (harmless) — version awareness is a Checks warning, not a block.
- `RO_SQL_START` stays `select|with`; Checks warns "WITH is not allowed by the v13 console (only SELECT)" when the connection's `frappeVersion` starts with `13.`.

`writeModeScan(code)` = `readOnlyScan` plus:
- bare calls `set_value(...)` and `update_doc(...)` allowed (they are the helpers);
- any identifier starting with `fsb_` → blocked ("names starting with fsb_ are reserved");
- `def set_value` / `def update_doc` / assigning to `set_value` or `update_doc` → blocked;
- direct writes (`frappe.db.set_value`, `.save()`, `.insert()`, `.submit()`, `.cancel()`, `.db_set()`, `frappe.db.commit`, `frappe.db.rollback`, …) stay blocked with the hint "In write mode use set_value(...) or update_doc(...) so the change is previewed".
Unit-test both scanners (Jest on server) with the 34 cases from the previous work (see `server/src/guard/guard.spec.ts`; include: list.insert(0,x) allowed; doc.insert() blocked; aliases `c = frappe.db.commit`, `db = frappe.db`, `f = frappe`; `doc.save` reference; getattr; dunder; import; SQL UPDATE / stacked `;` / variable query / `+` concat / `.format` / FOR UPDATE / INTO OUTFILE / WITH…DELETE / SLEEP(; assigning frappe.session.user; REPLACE()/INSERT() string functions inside SELECT allowed) plus write-mode cases.

## Client UI (port the HTML layout and behaviour; same look: IBM Plex Sans/Mono via `next/font/google`, the same color tokens light + dark, theme toggle persisted)
Layout (desktop): top bar · left sidebar (tabs Schema / Cheatsheet / Snippets / Saved) · editor · bottom dock (Hint | tabs Checks / Output / Changes) · status bar. Mobile (<860px): sidebar becomes a drawer ("Panel" button), dock stacks, top bar wraps. No horizontal page scroll.

Top bar: brand · note · Notes pad · History (link `/history`) · Help · Theme · Clear · Copy script · **connection select** (native `<select>`: connections by name with a "· writable" suffix for writable ones; `+ New connection…`; `Manage connections…`) with a status dot (green = has secret) · **Run** (primary, Ctrl+Enter) · **Dry run changes** (only when the active connection is writable; amber/warning style).

Editor: CodeMirror 6 in a client-only component (`dynamic(..., { ssr: false })`):
- `@codemirror/lang-python` for indentation/brackets; a custom `HighlightStyle` with the HTML's token colors; plus a ViewPlugin that marks SQL inside triple-quoted strings (keywords, backtick tables, `%(x)s` params, quoted values) exactly like `hlSql`.
- Autocomplete source = port of `pyCompletions` + `sqlCompletions` + `membersOf` + snippets, with `$0` caret placement (use CodeMirror `snippet()` or manual caret). Schema-aware SQL completion uses the **live schema** of the active connection when synced (fallback: the HTML's `SCHEMA0` but with the company-specific custom columns removed — keep only standard ERPNext fields).
- Lint (`@codemirror/lint`) from the ported `runChecks` (+ guard hits as "Run blocks this (read-only): …" warnings; in write context the write-mode scan). Gutter markers per severity. Update the `print()` and `as_json` messages for v13 as noted above.
- Ctrl+/ toggle comment, Tab indent 4 spaces, Ctrl+Space completion, Ctrl+Enter run.
- Draft autosaved to localStorage (per-viewer convenience) and restored.
- Hint panel: signature help from `callAt` + `resolveApi` (port), add API entries for `set_value`/`update_doc` helpers and `json.dumps`/`json.loads`.

Dock tabs:
- **Checks** — list, click → jump to line.
- **Output** — port `drawOut`: meta line (connection label · duration · time · rows · "rolled back" or "committed"), JSON (highlighted) / Table / Raw views, Copy, To notes; blocked list with jump-to-line; tracebacks in red. Uses `parseOut` on `output`.
- **Changes** (write mode) — the dry-run plan as a table: Doctype · Name · Field · Before → After · How (db = "skips validation" badge, doc = "validated" or "validation skipped"). Warning banner when any doctype is in `Sales Invoice, Purchase Invoice, Journal Entry, Payment Entry, GL Entry, Stock Ledger Entry` ("Direct changes to accounting documents don't update the GL. Prefer cancel + amend."). Confirm box: "Type 3 (the number of changes) or COMMIT to write them to <connection name>" + Commit button (danger). After commit show the result (applied / aborted with message). Dry run with 0 changes → "Nothing would change."

Sidebar: Schema tab lists the live schema (search, collapsible doctypes, chips insert column names) with "Sync schema" button + synced time; Cheatsheet (port CHEATS with `as_json` → `json.dumps(rows, default=str)`, add group "Write mode" with set_value/update_doc examples); Snippets (port, fix `asjson` snippet); Saved (scripts from the API, shows connection name; clicking loads code and switches the active connection if it still exists; save uses the active connection; delete with confirm).

Dialogs (port behaviour and messages from the HTML `openConn` / `openManager`):
- New/Edit connection: Name, Site URL, API key, API secret (Show/Hide), "Save the secret" checkbox, Setup steps (**remove** the allow_cors step — no longer needed; keep Generate Keys + System Manager; v14+ server_script_enabled), token paste split, inline validation, Test and save (server does the test + swap). Show detected Frappe version after save.
- Manage connections: radio to choose active, inline rename (Enter saves / Esc cancels, uniqueness error), Edit, Delete (click twice), secret status, version, user, **Writable toggle** (turning on opens a confirm: type the connection name). "Live (read-only)" style naming hint.
- Secret needed: when the active connection has `hasSecret=false`, Run opens a small dialog to enter the secret (`POST /connections/:id/secret`).
- Help: rewrite for v2 (server-side, no CORS, read-only guard, write mode protocol, v13 notes).

History page `/history`: table of runs (time, connection, mode badge, status badge, duration, changes, code preview), filters (connection, mode, status), infinite "Load more"; click → detail drawer with code (read-only CodeMirror), output view, plan table; "Open in editor" button.

State: Zustand store persisted to localStorage: `activeConnectionId`, `theme`, `outputMode`, `dockHeight`, `sidebarTab`, `draft`. React Query for all server data; invalidate on mutations. Toasts (small custom component). Errors from axios shown with the server's `message`.

## Root files
- `README.md`: what it is, prerequisites (Node 20+, PostgreSQL), setup (`cd server && npm i && edit .env && npx prisma migrate dev && npm run start:dev`; `cd client && npm i && npm run dev`), Frappe-side setup (API keys, System Manager; no allow_cors), safety model (read-only guard, rollback, write-mode dry run → confirm → atomic apply, audit log), v13 notes.
- Keep `Frappe script board.html` and `SPEC.md`.
