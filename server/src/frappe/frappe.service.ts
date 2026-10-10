import { Injectable } from '@nestjs/common';
import axios, { AxiosError, Method } from 'axios';
import { FrappeError } from './frappe.errors';
import { jparse, serverMsg } from './frappe.util';

export interface FrappeCreds {
  url: string;
  key: string;
  secret: string;
}

export interface TestResult {
  user: string;
  frappeVersion: string | null;
  swapped: boolean;
  /** the credentials that worked (key and secret exchanged when `swapped`) */
  creds: FrappeCreds;
}

export const TEST_TIMEOUT = 20_000;
export const RUN_TIMEOUT = 120_000;
export const EXEC =
  '/api/method/frappe.desk.doctype.system_console.system_console.execute_code';
const LOGGED_USER = '/api/method/frappe.auth.get_logged_user';
const VERSIONS = '/api/method/frappe.utils.change_log.get_versions';

@Injectable()
export class FrappeService {
  private readonly http = axios.create({
    proxy: false,
    maxRedirects: 0,
    responseType: 'text',
    transformResponse: [(d: unknown) => d],
    validateStatus: () => true,
  });

  async call(
    c: FrappeCreds,
    path: string,
    opts: { method?: Method; body?: URLSearchParams; timeout?: number } = {},
  ): Promise<Record<string, unknown>> {
    const timeout = opts.timeout ?? RUN_TIMEOUT;
    let status: number, txt: string;
    try {
      const res = await this.http.request<unknown>({
        url: c.url + path,
        method: opts.method ?? 'GET',
        data: opts.body?.toString(),
        timeout,
        headers: {
          Authorization: 'token ' + c.key + ':' + c.secret,
          Accept: 'application/json',
          ...(opts.body && {
            'Content-Type': 'application/x-www-form-urlencoded',
          }),
        },
      });
      status = res.status;
      txt = typeof res.data === 'string' ? res.data : '';
    } catch (e) {
      const ax = e as AxiosError;
      if (ax.code === 'ECONNABORTED' || ax.code === 'ETIMEDOUT')
        throw new FrappeError(
          `The site did not answer within ${Math.round(timeout / 1000)} seconds.`,
          'FRAPPE_TIMEOUT',
        );
      // server-to-server now, so CORS is never the cause (unlike the HTML board's message)
      throw new FrappeError(
        `Could not reach ${c.url} (${ax.code || ax.message}). Check that the site is running and the URL is right.`,
        'FRAPPE_NETWORK',
      );
    }
    const parsed = jparse(txt);
    const data = (parsed && typeof parsed === 'object' ? parsed : {}) as Record<
      string,
      unknown
    >;
    if (status >= 200 && status < 300) return data;
    const sm = serverMsg(data, txt);
    if (status === 401)
      throw new FrappeError(
        'The site rejected the API key or secret (401).',
        'FRAPPE_UNAUTHORIZED',
        401,
      );
    if (status === 403)
      throw new FrappeError(
        'The key is valid, but this user may not run the System Console (403). It needs the System Manager role.' +
          (sm ? ' Server says: ' + sm : ''),
        'FRAPPE_FORBIDDEN',
        403,
      );
    if (status === 404)
      throw new FrappeError(
        'Endpoint not found (404). Check that the URL points at the Frappe site itself.',
        'FRAPPE_NOT_FOUND',
        404,
      );
    throw new FrappeError(
      'Server error ' + status + (sm ? ': ' + sm : '.'),
      'FRAPPE_SERVER_ERROR',
      status,
    );
  }

  async getLoggedUser(c: FrappeCreds, timeout = TEST_TIMEOUT) {
    const data = await this.call(c, LOGGED_USER, { timeout });
    return typeof data.message === 'string' ? data.message : '';
  }

  async getVersion(c: FrappeCreds, timeout = TEST_TIMEOUT) {
    const data = await this.call(c, VERSIONS, { timeout });
    const m = data.message as { frappe?: { version?: unknown } } | undefined;
    const v = m?.frappe?.version;
    return typeof v === 'string' ? v : null;
  }

  /** Runs code in the System Console and returns its output text. */
  async executeCode(
    c: FrappeCreds,
    code: string,
    commit: boolean,
    timeout = RUN_TIMEOUT,
  ): Promise<string> {
    const body = new URLSearchParams({
      doc: JSON.stringify({
        doctype: 'System Console',
        console: code,
        type: 'Python',
        commit: commit ? 1 : 0,
      }),
    });
    const data = await this.call(c, EXEC, { method: 'POST', body, timeout });
    const m = data.message;
    if (typeof m === 'string') return m;
    if (m && typeof m === 'object') {
      const out = (m as { output?: unknown }).output;
      return typeof out === 'string' ? out : '';
    }
    throw new FrappeError(
      'The site answered without a System Console result.',
      'FRAPPE_BAD_RESPONSE',
    );
  }

  /** get_logged_user (retrying once with key and secret swapped on 401), then get_versions (best effort). */
  async test(c: FrappeCreds): Promise<TestResult> {
    let user: string,
      creds = c,
      swapped = false;
    try {
      user = await this.getLoggedUser(c);
    } catch (e) {
      if (!(e instanceof FrappeError) || e.code !== 'FRAPPE_UNAUTHORIZED')
        throw e;
      // people often paste secret:key; try the other order once before giving up
      const alt = { url: c.url, key: c.secret, secret: c.key };
      try {
        user = await this.getLoggedUser(alt);
      } catch {
        throw e;
      }
      creds = alt;
      swapped = true;
    }
    if (!user || user === 'Guest')
      throw new FrappeError(
        'The site answered, but the key did not sign anyone in.',
        'FRAPPE_GUEST',
      );
    const frappeVersion = await this.getVersion(creds).catch(() => null);
    return { user, frappeVersion, swapped, creds };
  }
}
