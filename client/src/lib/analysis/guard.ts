/*
 * Read-only and write-mode guards for System Console scripts.
 * This file is shared verbatim between server/src/guard/guard.ts (authoritative)
 * and client/src/lib/analysis/guard.ts (live Checks only). Keep them identical.
 */

export type TokType = "comment" | "tstr" | "str" | "num" | "id" | "op";
export interface Tok { t: TokType; s: number; e: number; v: string; closed: boolean }
export interface GuardHit { line: number; what: string }

const TOK = /(#[^\n]*)|("""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$))|("(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?)|(\d+(?:\.\d+)?)|([A-Za-z_]\w*)|([\s\S])/g;

export function tokens(text: string): Tok[] {
  const out: Tok[] = [];
  const re = new RegExp(TOK.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m[0] === "") { re.lastIndex++; continue; }
    const t: TokType = m[1] !== undefined ? "comment" : m[2] !== undefined ? "tstr" : m[3] !== undefined ? "str" : m[4] !== undefined ? "num" : m[5] !== undefined ? "id" : "op";
    const v = m[0];
    let closed = true;
    if (t === "tstr") closed = v.length >= 6 && v.endsWith(v.slice(0, 3));
    else if (t === "str") closed = v.length >= 2 && v.endsWith(v[0]) && !v.endsWith("\\" + v[0]);
    out.push({ t, s: m.index, e: m.index + v.length, v, closed });
  }
  return out;
}

/** Text with strings and comments replaced by spaces (newlines kept), so offsets still match. */
export function blank(text: string, toks: Tok[]): string {
  let out = "", last = 0;
  for (const k of toks) if (k.t === "str" || k.t === "tstr" || k.t === "comment") { out += text.slice(last, k.s) + k.v.replace(/[^\n]/g, " "); last = k.e; }
  return out + text.slice(last);
}

export const lineOf = (text: string, i: number) => text.slice(0, i).split("\n").length;

/** Contents of the bracket group that opens at t[i] (without the brackets). */
export function balanced(t: string, i: number): string {
  let d = 0;
  for (let j = i; j < t.length; j++) { const c = t[j]; if ("([{".includes(c)) d++; else if (")]}".includes(c)) { d--; if (d === 0) return t.slice(i + 1, j); } }
  return t.slice(i + 1);
}

// Allowlist, not a blocklist: anything not listed here is refused before the script is sent.
const RO_FRAPPE = new Set(("frappe.db.sql frappe.db.sql_list frappe.db.get_value frappe.db.get_values frappe.db.get_single_value frappe.db.exists frappe.db.count frappe.db.escape " +
  "frappe.get_all frappe.get_list frappe.get_doc frappe.get_cached_doc frappe.get_last_doc frappe.get_meta frappe.get_cached_value frappe.utils " +
  "frappe.as_json frappe.parse_json frappe._dict frappe._ frappe.session.user frappe.format frappe.format_value frappe.date_format").split(" "));
const RO_JSON = new Set(["json.dumps", "json.loads"]);
const RO_METHODS = new Set(("get keys values items append extend pop insert index count sort reverse copy update setdefault remove clear add discard " +
  "union intersection difference issubset issuperset join split rsplit splitlines partition strip lstrip rstrip lower upper title capitalize " +
  "replace startswith endswith format find rfind zfill ljust rjust center isdigit isalpha isalnum isspace encode decode " +
  "as_dict as_json get_formatted strftime isoformat date time weekday total_seconds quantize").split(" "));
const RO_BAD = new Set("getattr setattr delattr exec eval compile open __import__ globals locals vars input breakpoint".split(" "));
// method names that write; referencing them without calling (f = doc.save) is refused too
const RO_WRITE_ATTR = new Set("save submit cancel insert delete db_set db_insert db_update run_method commit set_value set_single_value rename sql_ddl truncate".split(" "));
const RO_SQL_START = /^\(?\s*(select|with)\b/i;
const RO_SQL_BAD = /\bfor\s+update\b|\block\s+in\s+share\s+mode\b|\binto\s+(?:outfile|dumpfile|@)|\b(?:insert|replace)\s+(?:(?:low_priority|delayed|high_priority|ignore)\s+)*into\b|\bupdate\s+[`\w][\s\S]*?\bset\b|\bdelete\s+(?:(?:low_priority|quick|ignore)\s+)*from\b|\b(?:alter|drop|truncate|create|rename|grant|revoke)\s+[`\w]|\bcall\s+\w+\s*\(|\bhandler\s+\w|\bload\s+(?:data|xml)\b|\bset\s+@|\b(?:sleep|benchmark|get_lock)\s*\(/i;

/** Write-mode helpers injected by the server; see SPEC.md "Write-mode protocol". */
export const WRITE_HELPERS = new Set(["set_value", "update_doc"]);
const WRITE_HINT = ". In write mode use set_value(...) or update_doc(...) so the change is previewed";

interface ScanOpts { writeMode?: boolean }

function scan(text: string, opts: ScanOpts): GuardHit[] {
  const writeMode = !!opts.writeMode;
  const toks = tokens(text), code = blank(text, toks), out: GuardHit[] = [];
  const add = (k: Tok, what: string) => out.push({ line: lineOf(text, k.s), what });
  const ct = toks.filter(k => k.t !== "comment" && !(k.t === "op" && /\s/.test(k.v)));
  const isOp = (k: Tok | undefined, v: string) => !!k && k.t === "op" && k.v === v;
  const writeHint = (what: string) => writeMode ? what + WRITE_HINT : what;
  for (let i = 0; i < ct.length; i++) {
    const k = ct[i], prev = ct[i - 1], next = ct[i + 1];
    if (k.t !== "id") continue;
    if (k.v.includes("__")) { add(k, "'" + k.v + "' (double-underscore names are not allowed)"); continue; }
    if (isOp(prev, ".")) {
      // attribute on something that is not a frappe/json chain (those are consumed below)
      if (isOp(next, "(")) {
        if (k.v === "insert") {
          // list.insert(i, x) is fine, doc.insert() / doc.insert(ignore_permissions=True) is a write
          const inner = balanced(code, next!.s);
          let d = 0, comma = false;
          for (const ch of inner) { if ("([{".includes(ch)) d++; else if (")]}".includes(ch)) d--; else if (ch === "," && d === 0) comma = true; }
          if (!comma || /(^|[^=!<>])=(?!=)/.test(inner)) add(k, writeHint(".insert() writes a document"));
        } else if (!RO_METHODS.has(k.v)) add(k, writeHint("." + k.v + "() is not on the read-only list"));
      } else if (RO_WRITE_ATTR.has(k.v)) add(k, writeHint("." + k.v + " (a write method)"));
      continue;
    }
    if (writeMode) {
      if (k.v.startsWith("fsb_")) { add(k, "names starting with fsb_ are reserved"); continue; }
      if (WRITE_HELPERS.has(k.v)) {
        if (prev && prev.t === "id" && prev.v === "def") { add(k, "redefining " + k.v + "() is not allowed"); continue; }
        if (isOp(next, "=") && !isOp(ct[i + 2], "=")) { add(k, "assigning to " + k.v + " is not allowed"); continue; }
        if (isOp(next, "(")) continue;
        add(k, k.v + " can only be called directly"); continue;
      }
    }
    if (k.v === "import" || (k.v === "from" && ct.slice(i + 1, i + 6).some(x => x.t === "id" && x.v === "import"))) { add(k, "import statements"); continue; }
    if (RO_BAD.has(k.v)) { add(k, k.v + "() can reach blocked calls"); continue; }
    if (k.v !== "frappe" && k.v !== "json") continue;
    // frappe.a.b.c: keep the longest allowed prefix, the rest is checked as normal attributes
    const parts = [k.v]; let j = i;
    while (isOp(ct[j + 1], ".") && ct[j + 2] && ct[j + 2].t === "id") { parts.push(ct[j + 2].v); j += 2; }
    let n = 0;
    for (let p = parts.length; p >= 1; p--) {
      const name = parts.slice(0, p).join(".");
      if (k.v === "json" ? RO_JSON.has(name) : (RO_FRAPPE.has(name) || (p === 3 && parts[1] === "utils"))) { n = p; break; }
    }
    if (!n) { add(k, writeHint(parts.slice(0, Math.min(parts.length, 3)).join(".") + " is not on the read-only list")); i = j; continue; }
    const name = parts.slice(0, n).join("."), endI = i + (n - 1) * 2, after = ct[endI + 1], after2 = ct[endI + 2];
    if (isOp(after, "=") && !isOp(after2, "=")) add(k, "assigning to " + name);
    if ((name === "frappe.db.sql" || name === "frappe.db.sql_list") && isOp(after, "(")) {
      const q = after2, q2 = ct[endI + 3];
      if (!q || (q.t !== "str" && q.t !== "tstr") || !(isOp(q2, ",") || isOp(q2, ")"))) add(k, name + "(...) needs the query as one literal string. Pass values with %(name)s placeholders");
      else {
        const body = q.t === "tstr" ? q.v.slice(3, q.closed ? -3 : undefined) : q.v.slice(1, q.closed ? -1 : undefined);
        // blank quoted values and comments without changing offsets, so match positions map back to lines
        const clean = body.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|--[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\//g, x => x.replace(/[^\n]/g, " "));
        const bad = clean.match(RO_SQL_BAD), qLine = (off: number) => lineOf(text, q.s) + body.slice(0, off).split("\n").length - 1;
        if (!RO_SQL_START.test(clean.trim())) add(q, "SQL must start with SELECT or WITH");
        else if (/;\s*\S/.test(clean)) add(q, "only one SQL statement per query");
        else if (bad) out.push({ line: qLine(bad.index ?? 0), what: "SQL " + bad[0].trim().split(/\s+/).slice(0, 2).join(" ").toUpperCase() + " (not a read)" });
      }
    }
    i = endI;
  }
  const seen = new Set<string>();
  return out.filter(o => { const key = o.line + o.what; if (seen.has(key)) return false; seen.add(key); return true; }).sort((a, b) => a.line - b.line);
}

/** Hits for anything outside the read-only allowlist. Empty array = safe to send with commit 0. */
export const readOnlyScan = (text: string): GuardHit[] => scan(text, {});

/** Read-only allowlist plus the set_value/update_doc helpers; direct writes stay blocked. */
export const writeModeScan = (text: string): GuardHit[] => scan(text, { writeMode: true });
