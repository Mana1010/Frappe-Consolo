import { API, DOCAPI, PYBI, PYKW, SNIPPETS, SQLWORDS } from "./data";
import { parseTables, sig } from "./analyze";
import type { Analysis, ApiEntry, CompletionItem, CompletionResult, Schema } from "./types";

const subseq = (s: string, q: string) => { let i = 0; for (const c of s) if (c === q[i]) i++; return i === q.length; };

/** Prefix matches first, then substring, then subsequence; shorter labels first. Max 40. */
export function rank(items: CompletionItem[], q: string): CompletionItem[] {
  if (!q) return items.slice(0, 40);
  const ql = q.toLowerCase(), out: [number, CompletionItem][] = [];
  for (const it of items) {
    const l = it.label.toLowerCase();
    let s = -1;
    if (l.startsWith(ql)) s = 0; else if (l.includes(ql)) s = 1; else if (subseq(l, ql)) s = 2;
    if (s >= 0) out.push([s, it]);
  }
  out.sort((a, b) => a[0] - b[0] || a[1].label.length - b[1].label.length);
  const r = out.map(x => x[1]).slice(0, 40);
  return r.length === 1 && r[0].label === q ? [] : r;
}

function apiItem(e: ApiEntry): CompletionItem {
  const label = e.n.split(".").pop() as string;
  const ins = e.ins || (e.kind === "method" || e.kind === "class" ? label + "($0)" : label);
  return { label, insert: ins, kind: e.kind, detail: e.params ? "(" + e.params.join(", ") + ")" : e.kind, doc: e.doc, sig: sig(e) };
}

/** Field completions for a doctype from the synced (or fallback) schema. */
export function fieldItems(schema: Schema, doctype: string): CompletionItem[] {
  const t = schema[doctype];
  if (!t) return [];
  const types = t.types || {};
  return t.cols.map(c => ({ label: c, insert: c, kind: "field" as const, detail: types[c] || doctype, doc: "Field of " + doctype + "." + (types[c] ? " " + types[c] + "." : "") }));
}

const ROW_METHODS = new Set(["doc.get", "doc.as_dict"]);

export function membersOf(chain: string, an: Analysis, schema: Schema = {}): CompletionItem[] {
  const direct = API.filter(e => e.n.startsWith(chain + ".") && !e.n.slice(chain.length + 1).includes("."));
  if (direct.length) return direct.map(apiItem);
  const dt = an.docTypes[chain];
  // documents get the document API; child rows from a loop only get() and as_dict()
  const methods = an.docVars.has(chain) ? DOCAPI : dt ? DOCAPI.filter(e => ROW_METHODS.has(e.n)) : [];
  if (methods.length || dt) {
    const out = methods.map(e => {
      const it = apiItem(e);
      it.label = e.n.slice(4);
      if (e.ins === undefined && e.kind === "method") it.insert = it.label + "($0)";
      else if (e.kind === "prop") it.insert = it.label;
      return it;
    });
    // methods first (few), then the doctype's fields; rank() re-sorts once the user types
    return dt ? out.concat(fieldItems(schema, dt).filter(f => !out.some(o => o.label === f.label))) : out;
  }
  if (an.rows[chain]) return an.rows[chain].map(f => ({ label: f, insert: f, kind: "field" as const, detail: "field of " + chain, doc: "Selected column in the query that produced " + chain + "." }));
  return [];
}

/** Python completions. `before` is the current line up to the caret; start is relative to it. */
export function pyCompletions(before: string, text: string, an: Analysis, forced: boolean, schema: Schema = {}): CompletionResult | null {
  const m = before.match(/([A-Za-z_]\w*(?:\.\w+)*)\.(\w*)$/);
  if (m) {
    const items = rank(membersOf(m[1], an, schema), m[2]);
    return items.length ? { items, start: before.length - m[2].length } : null;
  }
  const w = (before.match(/[A-Za-z_]\w*$/) || [""])[0];
  if (!w && !forced) return null;
  const items: CompletionItem[] = [];
  items.push({ label: "frappe", insert: "frappe", kind: "module", detail: "module", doc: "The Frappe framework object. Always available in the console." });
  items.push({ label: "json", insert: "json", kind: "module", detail: "module", doc: "json.dumps and json.loads are available in the v13 console." });
  for (const n of ["set_value", "update_doc"]) items.push(apiItem(API.find(e => e.n === n) as ApiEntry));
  SNIPPETS.forEach(s => items.push({ label: s.label, insert: s.body, kind: "snip", detail: "snippet", doc: s.doc }));
  PYKW.forEach(k => items.push({ label: k, insert: k, kind: "kw", detail: "keyword" }));
  PYBI.forEach(k => items.push(k === "log"
    ? { label: "log", insert: "log($0)", kind: "bi", detail: "console output", doc: "Prints to the Output panel. print() does not work in the System Console. Takes ONE value.", sig: "log(text)" }
    : { label: k, insert: k + "($0)", kind: "bi", detail: "builtin" }));
  const seen = new Set<string>(), vre = /(?:^|\n)[ \t]*(\w+)\s*=[^=]|for\s+(\w+)\s+in\b|def\s+(\w+)/g;
  let vm: RegExpExecArray | null;
  while ((vm = vre.exec(text))) {
    const n = vm[1] || vm[2] || vm[3];
    if (n && n !== w && !seen.has(n) && !PYKW.has(n)) { seen.add(n); items.push({ label: n, insert: n, kind: "var", detail: "variable" }); }
  }
  const r = rank(items, w);
  return r.length ? { items: r, start: before.length - w.length } : null;
}

/** SQL completions inside a triple-quoted string. `before`/`full` are relative to the string body. */
export function sqlCompletions(before: string, full: string, schema: Schema, forced: boolean, nextChar: string): CompletionResult | null {
  const tbls = Object.keys(schema);
  const bt = ((before.split("\n").pop() as string).match(/`/g) || []).length % 2 === 1 ? before.match(/`([^`\n]*)$/) : null;
  if (bt) {
    const items = rank(tbls.map(t => ({ label: "tab" + t, insert: "tab" + t + (nextChar === "`" ? "" : "`"), kind: "tbl" as const, detail: "table", doc: schema[t].cols.length + " columns" })), bt[1]);
    return items.length ? { items, start: before.length - bt[1].length } : null;
  }
  const parsed = parseTables(full);
  const dm = before.match(/\b([A-Za-z_]\w*)\.(\w*)$/);
  if (dm) {
    const t = parsed.find(p => p.alias === dm[1]);
    if (!t || !schema[t.table]) return null;
    const types = schema[t.table].types || {};
    const items = rank(schema[t.table].cols.map(c => ({ label: c, insert: c, kind: "col" as const, detail: t.table, doc: "Column of `tab" + t.table + "`." + (types[c] ? " " + types[c] + "." : "") })), dm[2]);
    return items.length ? { items, start: before.length - dm[2].length } : null;
  }
  const fm = before.match(/\b(?:FROM|JOIN|UPDATE|INTO)\s+(\w*)$/i);
  if (fm) {
    const items = rank(tbls.map(t => ({ label: "tab" + t, insert: "`tab" + t + "`", kind: "tbl" as const, detail: "table", doc: schema[t].cols.length + " columns" })), fm[1]);
    return items.length ? { items, start: before.length - fm[1].length } : null;
  }
  const w = (before.match(/[A-Za-z_%(]\w*$/) || [""])[0];
  if (!w && !forced) return null;
  const items: CompletionItem[] = [], seen = new Set<string>();
  parsed.forEach(p => { if (p.alias) items.push({ label: p.alias, insert: p.alias, kind: "alias", detail: p.table }); });
  parsed.forEach(p => (schema[p.table]?.cols || []).forEach(c => { if (!seen.has(c)) { seen.add(c); items.push({ label: c, insert: c, kind: "col", detail: p.table }); } }));
  items.push({ label: "%(name)s", insert: "%($0)s", kind: "sql", detail: "named value", doc: "Named placeholder. Pass a dict as the second argument of frappe.db.sql." });
  SQLWORDS.forEach(k => items.push({ label: k, insert: k.endsWith("(") ? k + "$0)" : k, kind: "sql", detail: "SQL" }));
  const r = rank(items, w);
  return r.length ? { items: r, start: before.length - w.length } : null;
}
