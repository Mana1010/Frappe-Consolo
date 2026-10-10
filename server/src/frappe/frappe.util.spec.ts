import { FrappeError, runFailureMessage, testFailure } from './frappe.errors';
import { credErr, normUrl, serverMsg, splitToken } from './frappe.util';

describe('normUrl', () => {
  it.each([
    ['localhost:8000', 'http://localhost:8000'],
    ['  http://localhost:8000/app/user?x=1 ', 'http://localhost:8000'],
    ['127.0.0.1:8000', 'http://127.0.0.1:8000'],
    ['site1.localhost', 'http://site1.localhost'],
    ['erp.test', 'http://erp.test'],
    ['erp.example.com', 'https://erp.example.com'],
    ['HTTPS://ERP.example.com/desk', 'https://erp.example.com'],
  ])('%s → %s', (input, url) => expect(normUrl(input)).toEqual({ url }));

  it.each([
    ['', 'Enter the site URL, for example http://localhost:8000'],
    ['ftp://x.com', 'Use an http:// or https:// address.'],
    ['http://', 'That is not a valid URL.'],
  ])('rejects %j', (input, err) => expect(normUrl(input)).toEqual({ err }));
});

describe('splitToken', () => {
  it('splits pasted tokens', () => {
    const want = { key: 'abcdef123456789', secret: 'zyx987654321abc' };
    expect(splitToken('abcdef123456789:zyx987654321abc')).toEqual(want);
    expect(splitToken('token abcdef123456789:zyx987654321abc')).toEqual(want);
    expect(
      splitToken('Authorization: token abcdef123456789 : zyx987654321abc'),
    ).toEqual(want);
  });
  it('leaves a plain key alone', () => {
    expect(splitToken('abcdef123456789')).toBeNull();
    expect(splitToken('')).toBeNull();
  });
});

describe('credErr', () => {
  it('accepts a normal key', () =>
    expect(credErr('abcdef123456789', 'key')).toBe(''));
  it.each([
    ['', 'key', 'Enter the API key.'],
    [
      '',
      'secret',
      'Enter the API secret. Frappe shows it only once, right after Generate Keys.',
    ],
    ['abc def123456', 'key', 'The key cannot contain spaces.'],
    [
      'abc:def123456',
      'key',
      "Paste the key and the secret in their own fields, without the ':'.",
    ],
    [
      'abc-def123456',
      'secret',
      'The secret should be letters and digits only.',
    ],
    [
      'abc',
      'key',
      'That does not look like a Frappe API key (usually 15 characters, this one has 3).',
    ],
  ] as const)('%j (%s)', (v, what, msg) => expect(credErr(v, what)).toBe(msg));
});

describe('serverMsg', () => {
  it('reads _server_messages and strips html', () => {
    const body = {
      _server_messages: JSON.stringify([
        JSON.stringify({ message: '<b>Not permitted</b>' }),
      ]),
    };
    expect(serverMsg(body, '')).toBe('Not permitted');
  });
  it('falls back to exception, exc_type, then text', () => {
    expect(
      serverMsg(
        { exception: 'Traceback\nframe\nfrappe.PermissionError: nope' },
        '',
      ),
    ).toBe('frappe.PermissionError: nope');
    expect(serverMsg({ exc_type: 'ServerScriptNotEnabled' }, '')).toBe(
      'ServerScriptNotEnabled',
    );
    expect(serverMsg({}, '<h1>Bad gateway</h1>')).toBe('Bad gateway');
  });
});

describe('error mapping', () => {
  it('adds the server-script hint and the 401 hint to run failures', () => {
    expect(
      runFailureMessage(
        new FrappeError(
          'Server error 500: ServerScriptNotEnabled',
          'FRAPPE_SERVER_ERROR',
          500,
        ),
      ),
    ).toContain('bench set-config -g server_script_enabled 1');
    expect(
      runFailureMessage(
        new FrappeError('x (401).', 'FRAPPE_UNAUTHORIZED', 401),
      ),
    ).toContain('Manage connections → Edit');
  });
  it('marks key and secret fields on a 401 test', () => {
    const e = testFailure(new FrappeError('x', 'FRAPPE_UNAUTHORIZED', 401)) as {
      getStatus(): number;
      getResponse(): Record<string, unknown>;
    };
    expect(e.getStatus()).toBe(400);
    expect(e.getResponse()).toMatchObject({
      code: 'FRAPPE_UNAUTHORIZED',
      fields: { apiKey: 'Check this value.' },
    });
  });
});
