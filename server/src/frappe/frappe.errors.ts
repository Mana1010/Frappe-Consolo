import { ApiError, Fields } from '../common/errors';

export type FrappeErrorCode =
  | 'FRAPPE_UNAUTHORIZED'
  | 'FRAPPE_FORBIDDEN'
  | 'FRAPPE_NOT_FOUND'
  | 'FRAPPE_SERVER_ERROR'
  | 'FRAPPE_NETWORK'
  | 'FRAPPE_TIMEOUT'
  | 'FRAPPE_GUEST'
  | 'FRAPPE_BAD_RESPONSE';

export class FrappeError extends Error {
  constructor(
    message: string,
    readonly code: FrappeErrorCode,
    readonly status?: number,
  ) {
    super(message);
  }
}

const HTTP_STATUS: Record<FrappeErrorCode, number> = {
  FRAPPE_UNAUTHORIZED: 400,
  FRAPPE_FORBIDDEN: 400,
  FRAPPE_NOT_FOUND: 400,
  FRAPPE_GUEST: 400,
  FRAPPE_SERVER_ERROR: 502,
  FRAPPE_BAD_RESPONSE: 502,
  FRAPPE_NETWORK: 502,
  FRAPPE_TIMEOUT: 504,
};

/** A failed connection test as an API error; field hints match the HTML dialog. */
export function testFailure(e: unknown): unknown {
  if (!(e instanceof FrappeError)) return e;
  const fields: Fields | undefined =
    e.code === 'FRAPPE_UNAUTHORIZED'
      ? {
          apiKey: 'Check this value.',
          apiSecret:
            'Check this value. Generating new keys makes the old secret invalid.',
        }
      : e.code === 'FRAPPE_NOT_FOUND' || e.code === 'FRAPPE_NETWORK'
        ? { url: 'Check this value.' }
        : undefined;
  return new ApiError(HTTP_STATUS[e.code], e.message, { code: e.code, fields });
}

/** Message for a failed run, with the same extra hints the HTML board showed. */
export function runFailureMessage(e: FrappeError): string {
  let msg = e.message;
  if (/ServerScriptNotEnabled|server script/i.test(msg))
    msg += '\n\nEnable it with:  bench set-config -g server_script_enabled 1';
  if (e.code === 'FRAPPE_UNAUTHORIZED')
    msg +=
      '\nOpen the connection menu → Manage connections → Edit, and check the key and secret.';
  return msg;
}
