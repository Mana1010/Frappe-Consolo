import { balanced, blank, lineOf, readOnlyScan, writeModeScan, type Tok } from "./guard";
import { DICTM, NOT_IN_V13, UTIL_NAMES } from "./data";
import { parseTables } from "./analyze";
import type { Analysis, Diag, Level, Schema } from "./types";

export interface CheckOpts {
  /** Lint with writeModeScan (writable connection and the script uses the write helpers). */
  writeMode?: boolean;
  /** The active connection is writable. */
  writable?: boolean;
  /** Frappe version of the active connection, e.g. "13.58.22"; null when unknown. */
  version?: string | null;
}

const HELPER_CALL = /(^|[^.\w])(set_value|update_doc)\s*\(/m;

/** True when the script calls the write-mode helpers as bare functions. */
export const usesWriteHelpers = (code: string) => HELPER_CALL.test(code);

/** v13 rules apply when the version is 13.x or not known yet (the target site is v13). */
const isV13 = (v?: string | null) => !v || v.startsWith("13.");

export function runChecks(text: string, toks: Tok[], schema: Schema, an: Analysis, opts: CheckOpts = {}): Diag[] {
  const out: Diag[] = [], add = (line: number, level: Level, msg: string) => out.push({ line, level, msg });
  const code = blank(text, toks);
  const st: { c: string; i: number }[] = [], pairs: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
  for (let i = 0; i < code.length; i++) {
    const c = code[i];
    if ("([{".includes(c)) st.push({ c, i });
    else if (")]}".includes(c)) { const t = st.pop(); if (!t || t.c !== pairs[c]) add(lineOf(text, i), "error", "Unmatched '" + c + "'"); }
  }
  st.forEach(t => add(lineOf(text, t.i), "error", "'" + t.c + "' is never closed"));
  toks.forEach(k => { if (k.t === "tstr" && !k.closed) add(lineOf(text, k.s), "error", "Triple-quoted string is never closed"); });
  if (/^\t/m.test(text) && /^ +\S/m.test(text)) add(lineOf(text, text.search(/^\t/m)), "warn", "Tabs and spaces are mixed. Python will raise an indentation error.");
  let m: RegExpExecArray | null;
  const imp = /^[ \t]*(?:from\s+\S+\s+import|import)\s+\S.*$/gm;
  while ((m = imp.exec(code))) add(lineOf(text, m.index), "warn", "Imports may be blocked in the System Console sandbox (v13). Prefer frappe.utils.flt(...) style calls.");
  const imported = new Set((code.match(/^[ \t]*from\s+\S+\s+import\s+.*$/gm) || []).join(" ").split(/[\s,()]+/));
  UTIL_NAMES.forEach(n => {
    if (imported.has(n)) return;
    const re = new RegExp("(^|[^.\\w])" + n + "\\s*\\(", "gm");
    while ((m = re.exec(code))) add(lineOf(text, m.index + m[1].length), "warn", "'" + n + "' is not defined in the console. Use frappe.utils." + n + "(...).");
  });
  const pr1 = /(^|[^.\w])print\s*\(/gm;
  while ((m = pr1.exec(code))) add(lineOf(text, m.index + m[1].length), "error", "print() does not work in the v13 System Console. Use log(text), e.g. log(json.dumps(rows, default=str)).");
  const lg = /(^|[^.\w])log\s*\(/gm;
  while ((m = lg.exec(code))) {
    const inner = balanced(code, m.index + m[0].length - 1);
    let d = 0, multi = false;
    for (const ch of inner) { if ("([{".includes(ch)) d++; else if (")]}".includes(ch)) d--; else if (ch === "," && d === 0) { multi = true; break; } }
    if (multi) add(lineOf(text, m.index + m[1].length), "warn", "log() takes one value. Join them: log(str(a) + \" \" + str(b)).");
  }
  if (isV13(opts.version)) {
    for (const [name, alt] of Object.entries(NOT_IN_V13)) {
      const re = new RegExp("(^|[^.\\w])" + name.replace(/\./g, "\\s*\\.\\s*") + "\\b", "gm");
      while ((m = re.exec(code))) add(lineOf(text, m.index + m[1].length), "warn", name + " does not exist in the v13 console. Use " + alt + ".");
    }
  }
  if (opts.writeMode) writeModeScan(text).forEach(h => add(h.line, "warn", "Dry run blocks this: " + h.what));
  else {
    readOnlyScan(text).forEach(h => add(h.line, "warn", "Run blocks this (read-only): " + h.what));
    const hm = new RegExp(HELPER_CALL.source, "gm");
    while ((m = hm.exec(code))) add(lineOf(text, m.index + m[1].length), "warn", opts.writable
      ? m[2] + "() is a write-mode helper. Use Dry run changes, not Run."
      : m[2] + "() is a write-mode helper. It only works with Dry run changes on a writable connection.");
  }
  toks.forEach(k => {
    if (k.t !== "tstr" && k.t !== "str") return;
    const content = k.t === "tstr" ? k.v.slice(3, k.closed ? -3 : undefined) : k.v.slice(1, k.closed ? -1 : undefined);
    if (!/^\s*(select|update|delete|insert|with)\b/i.test(content)) return;
    const base = lineOf(text, k.s), at = (off: number) => base + content.slice(0, off).split("\n").length - 1;
    if (isV13(opts.version) && /^\s*\(?\s*with\s+(?:recursive\s+)?[`\w]+\s+as\s*\(/i.test(content)) add(at(content.search(/with/i)), "warn", "WITH is not allowed by the v13 console (only SELECT).");
    let w = content.search(/\b(update|delete\s+from|insert\s+into)\b/i);
    if (w >= 0) add(at(w), "warn", "Raw SQL write. It skips validations and GL posting, and the restricted console usually rejects non-SELECT queries.");
    if (/^\s*,\s*(?!\w+\s*=)\S/.test(text.slice(k.e))) {
      const pr = /%%|%\(\w+\)s|%s|%/g;
      let pm: RegExpExecArray | null;
      while ((pm = pr.exec(content))) if (pm[0] === "%") { add(at(pm.index), "warn", "A literal % must be written %% when values are passed to frappe.db.sql."); break; }
    }
    w = content.search(/\b(from|join|update|into)\s+tab[A-Za-z]/i);
    if (w >= 0) add(at(w), "warn", "Wrap table names in backticks: `tabSales Invoice`.");
    const tr = /`tab([^`]+)`/g;
    let tm: RegExpExecArray | null;
    while ((tm = tr.exec(content))) if (!schema[tm[1]]) add(at(tm.index), "info", "Table '" + tm[1] + "' is not in the schema list. Sync the schema under Schema.");
    const parsed = parseTables(content), s2 = content.replace(/'[^']*'/g, x => " ".repeat(x.length)), cr = /\b([A-Za-z_]\w*)\.(\w+)\b/g;
    let cm: RegExpExecArray | null;
    while ((cm = cr.exec(s2))) {
      const c = cm, t = parsed.find(p => p.alias === c[1]);
      if (t && schema[t.table] && !schema[t.table].cols.includes(c[2])) add(at(c.index), "info", "'" + c[2] + "' is not in the " + t.table + " schema (the list may be incomplete).");
    }
  });
  const ar = /\b([A-Za-z_]\w*)\.([A-Za-z_]\w*)\b/g;
  while ((m = ar.exec(code))) {
    const f = an.rows[m[1]];
    if (f && f.length && !f.includes(m[2]) && !DICTM.has(m[2]) && m[1] !== "frappe") add(lineOf(text, m.index), "info", m[1] + "." + m[2] + " is not a column in the query. It would be None at runtime.");
  }
  const seen = new Set<string>();
  return out.filter(d => { const k = d.line + d.msg; if (seen.has(k)) return false; seen.add(k); return true; }).sort((a, b) => a.line - b.line);
}
