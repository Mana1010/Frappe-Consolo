// Ported from Frappe script board.html (normUrl, splitToken, credErr, serverMsg).

export const jparse = (s: string): unknown => {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};

export function normUrl(u: string | undefined | null): {
  url?: string;
  err?: string;
} {
  u = (u || '').trim();
  if (!u)
    return { err: 'Enter the site URL, for example http://localhost:8000' };
  if (!/^https?:\/\//i.test(u)) {
    if (/^[a-z]+:/i.test(u) && !/^[\w.-]+:\d+/.test(u))
      return { err: 'Use an http:// or https:// address.' };
    u =
      (/^(localhost|127\.|\[::1\]|[\w-]+\.localhost|[\w.-]+\.test)\b/i.test(u)
        ? 'http://'
        : 'https://') + u;
  }
  try {
    const x = new URL(u);
    if (!x.hostname) throw new Error('no host');
    return { url: x.origin };
  } catch {
    return { err: 'That is not a valid URL.' };
  }
}

// accepts "key", or a pasted "token key:secret" / "Authorization: token key:secret"
export function splitToken(
  v: string | undefined | null,
): { key: string; secret: string } | null {
  const m = (v || '').match(
    /^\s*(?:authorization\s*:\s*)?(?:token\s+)?([^\s:]+)\s*:\s*(\S+)\s*$/i,
  );
  return m ? { key: m[1], secret: m[2] } : null;
}

export function credErr(v: string, what: 'key' | 'secret'): string {
  if (!v)
    return what === 'key'
      ? 'Enter the API key.'
      : 'Enter the API secret. Frappe shows it only once, right after Generate Keys.';
  if (/\s/.test(v)) return 'The ' + what + ' cannot contain spaces.';
  if (/:/.test(v))
    return "Paste the key and the secret in their own fields, without the ':'.";
  if (!/^[A-Za-z0-9]+$/.test(v))
    return 'The ' + what + ' should be letters and digits only.';
  if (v.length < 10 || v.length > 64)
    return `That does not look like a Frappe API ${what} (usually 15 characters, this one has ${v.length}).`;
  return '';
}

/** Best human message from a Frappe error body. */
export function serverMsg(data: unknown, txt: string): string {
  const strip = (s: unknown) =>
    String(s)
      .replace(/<[^>]+>/g, '')
      .trim();
  const d = (data && typeof data === 'object' ? data : {}) as Record<
    string,
    unknown
  >;
  try {
    const l = JSON.parse(String(d._server_messages)) as unknown[];
    const m = l
      .map((x) => {
        const o = jparse(String(x)) as { message?: unknown } | null;
        return strip(o?.message || x);
      })
      .filter(Boolean);
    if (m.length) return m.join(' ');
  } catch {
    // not a _server_messages body
  }
  if (typeof d.exception === 'string' && d.exception)
    return strip(d.exception.split('\n').pop());
  if (typeof d.exc_type === 'string' && d.exc_type) return d.exc_type;
  return strip((txt || '').slice(0, 200));
}
