import { balanced, type Tok } from "./guard";
import { API, DOCAPI, SQLRESERVED } from "./data";
import type { Analysis, ApiEntry, Schema } from "./types";

export type Ctx = { t: "comment"; tok: Tok } | { t: "tstr"; tok: Tok; closed: boolean } | { t: "str"; tok: Tok } | null;

/** What kind of token the caret at pos is inside (comment, triple string, string) or null for code. */
export function ctxAt(toks: Tok[], pos: number): Ctx {
  for (const k of toks) {
    if (k.s >= pos) break;
    if (k.t === "comment" && pos <= k.e) return { t: "comment", tok: k };
    if (k.t === "tstr" && k.s + 3 <= pos && pos <= (k.closed ? k.e - 3 : k.e)) return { t: "tstr", tok: k, closed: k.closed };
    if (k.t === "str" && pos < k.e + (k.closed ? 0 : 1) && pos > k.s) return { t: "str", tok: k };
  }
  return null;
}

export interface TableRef { table: string; alias: string | null }

export function parseTables(sql: string): TableRef[] {
  const res: TableRef[] = [], re = /\b(?:FROM|JOIN|UPDATE|INTO)\s+`tab([^`]+)`(?:\s+(?:AS\s+)?(\w+))?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql))) {
    let a: string | null = m[2] || null;
    if (a && SQLRESERVED.has(a.toLowerCase())) a = null;
    res.push({ table: m[1], alias: a });
  }
  return res;
}

/** Column names produced by the SELECT list (aliases, last identifiers, expanded stars). */
export function selectFields(sql: string, schema: Schema): string[] {
  const m = sql.match(/\bselect\b([\s\S]*?)\bfrom\b/i);
  if (!m) return [];
  const tbl = parseTables(sql), out: string[] = [], parts: string[] = [];
  let depth = 0, cur = "";
  for (const ch of m[1]) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { parts.push(cur); cur = ""; } else cur += ch;
  }
  parts.push(cur);
  for (let p of parts) {
    p = p.trim();
    if (!p) continue;
    const a = p.match(/\bas\s+`?(\w+)`?\s*$/i);
    if (a) { out.push(a[1]); continue; }
    const star = p.match(/^(?:(\w+)\.)?\*$/);
    if (star) {
      for (const t of tbl) if (!star[1] || t.alias === star[1]) (schema[t.table]?.cols || []).forEach(c => out.push(c));
      continue;
    }
    const last = p.match(/(\w+)`?\s*$/);
    if (last) out.push(last[1]);
  }
  return [...new Set(out)];
}

/** Variables holding documents, and variables holding query rows with their column names. */
export function analyze(text: string, schema: Schema): Analysis {
  const docVars = new Set<string>(), rows: Record<string, string[]> = {};
  let m: RegExpExecArray | null;
  const re1 = /(\w+)\s*=\s*frappe\.(?:get_doc|new_doc|copy_doc|get_cached_doc|get_last_doc)\(/g;
  while ((m = re1.exec(text))) docVars.add(m[1]);
  const re2 = /(\w+)\s*=\s*frappe\.db\.sql\(\s*("""|''')([\s\S]*?)\2/g;
  while ((m = re2.exec(text))) rows[m[1]] = selectFields(m[3], schema);
  const re3 = /(\w+)\s*=\s*frappe\.get_(?:all|list)\(/g;
  while ((m = re3.exec(text))) {
    const inner = balanced(text, m.index + m[0].length - 1), f = inner.match(/fields\s*=\s*\[([^\]]*)\]/);
    rows[m[1]] = f ? [...f[1].matchAll(/["']([^"']+)["']/g)].map(x => x[1]) : ["name"];
  }
  for (let k = 0; k < 4; k++) {
    const re = /for\s+(\w+)\s+in\s+(\w+)\b/g;
    while ((m = re.exec(text))) if (rows[m[2]] && !rows[m[1]]) rows[m[1]] = rows[m[2]];
    const re4 = /for\s+\w+\s*,\s*(\w+)\s+in\s+enumerate\(\s*(\w+)\s*\)/g;
    while ((m = re4.exec(text))) if (rows[m[2]] && !rows[m[1]]) rows[m[1]] = rows[m[2]];
    const re5 = /(\w+)\s*=\s*\[\s*(\w+)\s+for\s+\2\s+in\s+(\w+)/g;
    while ((m = re5.exec(text))) if (rows[m[3]] && !rows[m[1]]) rows[m[1]] = rows[m[3]];
  }
  return { docVars, rows };
}

/** The call the caret is inside, e.g. { name: "frappe.db.get_value", arg: 1 }. */
export function callAt(text: string, caret: number, toks: Tok[]): { name: string; arg: number } | null {
  const stack: { ch: string; pos: number; commas: number }[] = [];
  let ti = 0;
  for (let i = 0; i < caret; i++) {
    while (ti < toks.length && toks[ti].e <= i) ti++;
    const k = toks[ti];
    if (k && k.s <= i && i < k.e && (k.t === "str" || k.t === "tstr" || k.t === "comment")) { i = Math.min(k.e, caret) - 1; continue; }
    const ch = text[i];
    if ("([{".includes(ch)) stack.push({ ch, pos: i, commas: 0 });
    else if (")]}".includes(ch)) stack.pop();
    else if (ch === "," && stack.length) stack[stack.length - 1].commas++;
  }
  for (let j = stack.length - 1; j >= 0; j--) if (stack[j].ch === "(") {
    const m = text.slice(0, stack[j].pos).match(/([A-Za-z_][\w.]*)\s*$/);
    return m ? { name: m[1], arg: stack[j].commas } : null;
  }
  return null;
}

export function resolveApi(name: string, an?: Analysis | null): ApiEntry | null {
  const e = API.find(x => x.n === name);
  if (e) return e;
  const parts = name.split(".");
  if (parts.length === 1) return API.find(x => x.n === "frappe.utils." + name) || null;
  if (an && an.docVars.has(parts[0]) && parts.length === 2) return DOCAPI.find(x => x.n === "doc." + parts[1]) || null;
  return null;
}

export const sig = (e: ApiEntry) => e.n + (e.params ? "(" + e.params.join(", ") + ")" : "");
