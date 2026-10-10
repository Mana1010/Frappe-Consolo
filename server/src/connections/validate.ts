import { badRequest, Fields } from '../common/errors';
import { FrappeCreds } from '../frappe/frappe.service';
import { credErr, normUrl, splitToken } from '../frappe/frappe.util';

/** Same rules as the HTML dialog; a pasted "token key:secret" in either field is split. */
export function checkCreds(input: {
  url?: string;
  apiKey?: string;
  apiSecret?: string;
}): FrappeCreds {
  let key = (input.apiKey ?? '').trim(),
    secret = (input.apiSecret ?? '').trim();
  const t = splitToken(key) ?? splitToken(secret);
  if (t) ({ key, secret } = t);
  const u = normUrl(input.url);
  const fields: Fields = {};
  if (u.err) fields.url = u.err;
  const ke = credErr(key, 'key');
  if (ke) fields.apiKey = ke;
  let se = credErr(secret, 'secret');
  if (!se && secret === key)
    se = 'The secret is the same as the key. They are two different values.';
  if (se) fields.apiSecret = se;
  if (Object.keys(fields).length)
    throw badRequest('Fix the fields marked in red.', fields);
  return { url: u.url!, key, secret };
}

/** Format rules only; uniqueness needs the database. */
export function nameFormatErr(name: string): string {
  if (!name) return 'Give the connection a name.';
  if (name.length > 40) return 'Keep the name to 40 characters or fewer.';
  return '';
}
