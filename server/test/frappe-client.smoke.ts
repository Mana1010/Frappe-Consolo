/*
 * Smoke test against the mock Frappe (scratchpad mock_frappe.py on 127.0.0.1:8765).
 * No database: PrismaService is replaced by a stub that throws if touched, so only
 * guest flows (temporary connections, READ runs) go through the real HTTP stack.
 *   python mock_frappe.py &   then   npm run smoke
 */
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import { execFileSync } from 'node:child_process';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/app.setup';
import { FrappeError } from '../src/frappe/frappe.errors';
import { FrappeService } from '../src/frappe/frappe.service';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  commitEpilogue,
  DRY_EPILOGUE,
  dryOutcome,
  wrap,
} from '../src/runs/protocol';

const MOCK = process.env.MOCK_URL ?? 'http://127.0.0.1:8765';
const KEY = 'abcdef123456789',
  SECRET = 'zyx987654321abc';

let failed = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  if (!ok) failed++;
  console.log(
    (ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : ' ' + JSON.stringify(detail)),
  );
};
const codeOf = async (p: Promise<unknown>) =>
  p.then(
    () => 'no error',
    (e: unknown) => (e instanceof FrappeError ? e.code : String(e)),
  );

async function frappeClient() {
  const f = new FrappeService();
  const good = { url: MOCK, key: KEY, secret: SECRET };
  check(
    'get_logged_user',
    (await f.getLoggedUser(good)) === 'tristan@servio.ph',
  );
  const t = await f.test({ url: MOCK, key: SECRET, secret: KEY });
  check(
    'swap retry',
    t.swapped && t.creds.key === KEY && t.user === 'tristan@servio.ph',
    t,
  );
  check(
    'get_versions failure → null',
    t.frappeVersion === null,
    t.frappeVersion,
  );
  const t2 = await f.test({
    url: MOCK,
    key: 'readonly1234567',
    secret: 'uatsecret987654',
  });
  check(
    'second key pair',
    t2.user === 'uat.reader@servio.ph' && !t2.swapped,
    t2,
  );
  check(
    '401 mapped',
    (await codeOf(
      f.test({ url: MOCK, key: 'x'.repeat(15), secret: 'y'.repeat(15) }),
    )) === 'FRAPPE_UNAUTHORIZED',
  );
  check(
    'network mapped',
    (await codeOf(f.getLoggedUser({ ...good, url: 'http://127.0.0.1:9' }))) ===
      'FRAPPE_NETWORK',
  );
  const plain = await f.executeCode(good, 'log("hi")', false);
  check('execute_code output', plain.startsWith('2 checked'), plain);
  const tb = await f.executeCode(good, 'boom()', false);
  check(
    'execute_code traceback',
    tb.startsWith('Traceback (most recent call last)'),
    tb,
  );
  const js = await f.executeCode(good, 'log(frappe.as_json(rows))', false);
  check('execute_code json', Array.isArray(JSON.parse(js)), js.slice(0, 40));
  check('no plan marker → FAILED', dryOutcome(plain, 1).status === 'FAILED');
}

async function guestHttp() {
  const deny = new Proxy(
    {},
    {
      get: (_, p) => {
        // lifecycle hooks Nest probes for, and promise checks
        if (
          typeof p === 'symbol' ||
          p === 'then' ||
          /^(on|before)[A-Z]/.test(p)
        )
          return undefined;
        throw new Error('database touched in guest flow: ' + String(p));
      },
    },
  );
  const mod = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(deny)
    .compile();
  const app = setupApp(
    mod.createNestApplication<NestExpressApplication>({ bodyParser: false }),
  );
  await app.init();
  const a = request.agent(app.getHttpServer());
  try {
    const me = await a.get('/api/auth/me');
    check('me as guest', me.status === 200 && me.body.user === null, me.body);
    check(
      'guest cookie issued',
      String(me.headers['set-cookie']).includes('fsb_guest='),
      me.headers['set-cookie'],
    );

    const body = { name: 'Mock', url: MOCK, apiKey: SECRET, apiSecret: KEY };
    const save = await a.post('/api/connections').send(body);
    check(
      'guest save → 401 AUTH_REQUIRED',
      save.status === 401 && save.body.code === 'AUTH_REQUIRED',
      save.body,
    );

    const bad = await a
      .post('/api/connections')
      .send({ ...body, apiKey: 'a b', temporary: true });
    check(
      'field validation → 400 fields',
      bad.status === 400 && !!bad.body.fields?.apiKey,
      bad.body,
    );
    const extra = await a
      .post('/api/connections/test')
      .send({ ...body, nope: 1 });
    check('unknown property rejected', extra.status === 400, extra.body);

    const tmp = await a
      .post('/api/connections')
      .send({ ...body, temporary: true });
    const conn = tmp.body as Record<string, unknown>;
    check(
      'temporary create (swapped)',
      tmp.status === 201 &&
        String(conn.id).startsWith('tmp_') &&
        conn.persisted === false,
      conn,
    );
    const leaked = JSON.stringify(conn);
    check(
      'dto hides url/key/secret',
      !leaked.includes(KEY) &&
        !leaked.includes(SECRET) &&
        !leaked.includes('8765'),
      conn,
    );

    const list = await a.get('/api/connections');
    check(
      'list has the temporary one',
      list.body.length === 1 && list.body[0].id === conn.id,
      list.body,
    );
    const other = await request(app.getHttpServer()).get('/api/connections');
    check('other browser sees nothing', other.body.length === 0, other.body);

    const run = await a
      .post('/api/runs/read')
      .send({ connectionId: conn.id, code: 'log("hi")' });
    check(
      'guest READ run OK, not stored',
      run.status === 200 &&
        run.body.status === 'OK' &&
        run.body.id === null &&
        run.body.connectionName === 'Mock',
      run.body,
    );
    const err = await a
      .post('/api/runs/read')
      .send({ connectionId: conn.id, code: 'boom()' });
    check('READ traceback → ERROR', err.body.status === 'ERROR', err.body);
    const blk = await a
      .post('/api/runs/read')
      .send({ connectionId: conn.id, code: 'frappe.db.commit()' });
    check(
      'READ guard → BLOCKED',
      blk.status === 200 &&
        blk.body.status === 'BLOCKED' &&
        blk.body.blocked.length === 1,
      blk.body,
    );

    const dry = await a
      .post('/api/runs/dry-run')
      .send({ connectionId: conn.id, code: 'x = 1' });
    check(
      'guest dry run → 401',
      dry.status === 401 && dry.body.code === 'AUTH_REQUIRED',
      dry.body,
    );
    const scripts = await a.get('/api/scripts');
    check(
      'guest scripts → 401',
      scripts.status === 401 && scripts.body.code === 'AUTH_REQUIRED',
      scripts.body,
    );
    const wr = await a
      .patch('/api/connections/' + conn.id)
      .send({ writable: true, confirmName: 'Mock' });
    check('writable on temporary → 400', wr.status === 400, wr.body);
    const ren = await a
      .patch('/api/connections/' + conn.id)
      .send({ name: 'Mock 2', url: '', apiKey: '' });
    check(
      'rename keeps blank credentials',
      ren.status === 200 && ren.body.name === 'Mock 2',
      ren.body,
    );
    const saved = await a.get('/api/connections/c_not_mine/schema');
    check('saved id as guest → 401', saved.status === 401, saved.body);
    const sch = await a.get('/api/connections/' + conn.id + '/schema');
    check(
      'schema never synced → null',
      sch.status === 200 && sch.text === 'null',
      sch.text,
    );

    const del = await a.delete('/api/connections/' + conn.id);
    check('delete temporary', del.status === 204);
    const gone = await a
      .post('/api/runs/read')
      .send({ connectionId: conn.id, code: 'log(1)' });
    check('deleted → 404', gone.status === 404, gone.body);
  } finally {
    await app.close();
  }
}

function pythonCompiles() {
  const code =
    'rows = frappe.get_all("Customer")\nfor r in rows:\n    set_value("Customer", r.name, "disabled", 1)';
  const plan = '[{"after": "a\\"b\\\\c \\u00e9", "field": "x"}]';
  const src = [wrap(code, DRY_EPILOGUE), wrap(code, commitEpilogue(plan))];
  try {
    execFileSync(
      'python',
      [
        '-I',
        '-c',
        'import sys, json\nfor s in json.load(sys.stdin): compile(s, "<serverscript>", "exec")',
      ],
      {
        input: JSON.stringify(src),
      },
    );
    check('wrapped scripts compile in Python', true);
  } catch (e) {
    check('wrapped scripts compile in Python', false, String(e));
  }
}

(async () => {
  await frappeClient();
  await guestHttp();
  pythonCompiles();
  console.log(failed ? failed + ' FAILED' : 'smoke ok');
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
