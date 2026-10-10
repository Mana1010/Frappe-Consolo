import { HttpException } from '@nestjs/common';
import { checkCreds, nameFormatErr } from './validate';

const fieldsOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return ((e as HttpException).getResponse() as { fields: object }).fields;
  }
  throw new Error('expected a 400');
};

describe('checkCreds', () => {
  it('normalizes the url and trims', () => {
    expect(
      checkCreds({
        url: 'localhost:8000/app',
        apiKey: ' abcdef123456789 ',
        apiSecret: 'zyx987654321abc',
      }),
    ).toEqual({
      url: 'http://localhost:8000',
      key: 'abcdef123456789',
      secret: 'zyx987654321abc',
    });
  });

  it('splits a token pasted into either field', () => {
    const want = { key: 'abcdef123456789', secret: 'zyx987654321abc' };
    expect(
      checkCreds({
        url: 'localhost:8000',
        apiKey: 'token abcdef123456789:zyx987654321abc',
      }),
    ).toMatchObject(want);
    expect(
      checkCreds({
        url: 'localhost:8000',
        apiSecret: 'abcdef123456789:zyx987654321abc',
      }),
    ).toMatchObject(want);
  });

  it('returns field-specific messages', () => {
    expect(fieldsOf(() => checkCreds({}))).toEqual({
      url: 'Enter the site URL, for example http://localhost:8000',
      apiKey: 'Enter the API key.',
      apiSecret:
        'Enter the API secret. Frappe shows it only once, right after Generate Keys.',
    });
    expect(
      fieldsOf(() =>
        checkCreds({
          url: 'localhost',
          apiKey: 'abcdef123456789',
          apiSecret: 'abcdef123456789',
        }),
      ),
    ).toEqual({
      apiSecret:
        'The secret is the same as the key. They are two different values.',
    });
  });

  it('checks the name format', () => {
    expect(nameFormatErr('')).toBe('Give the connection a name.');
    expect(nameFormatErr('x'.repeat(41))).toBe(
      'Keep the name to 40 characters or fewer.',
    );
    expect(nameFormatErr('Live (read-only)')).toBe('');
  });
});
