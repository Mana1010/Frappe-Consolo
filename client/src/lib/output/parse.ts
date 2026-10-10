/* JSON / Python-repr prettifier and console output parsing, ported from the HTML. */

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

/** Parse a sequence of JSON or Python-repr values (single quotes, None, True, Decimal(...), datetime.date(...)). */
export function parseAll(src: string): Json[] {
  let i = 0;
  const s = src;
  const ws = () => { while (i < s.length && /\s/.test(s[i])) i++; };
  const fail = (m: string): never => { throw new Error(m + " (position " + i + ": " + JSON.stringify(s.slice(Math.max(0, i - 12), i + 12)) + ")"); };
  function str(): string {
    const q = s[i++];
    let out = "";
    const map: Record<string, string> = { n: "\n", t: "\t", r: "\r", "\\": "\\", "'": "'", '"': '"' };
    while (i < s.length && s[i] !== q) {
      if (s[i] === "\\") {
        const n = s[i + 1];
        if (n === "u" && /^[0-9a-fA-F]{4}$/.test(s.slice(i + 2, i + 6))) { out += String.fromCharCode(parseInt(s.slice(i + 2, i + 6), 16)); i += 6; continue; }
        out += map[n] !== undefined ? map[n] : n;
        i += 2;
      } else out += s[i++];
    }
    if (i >= s.length) fail("Unterminated string");
    i++;
    return out;
  }
  function num(): number {
    const m = s.slice(i).match(/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/);
    if (!m) return fail("Bad number");
    i += m[0].length;
    return parseFloat(m[0]);
  }
  const pad2 = (n: Json) => String(n).padStart(2, "0");
  function ident(): Json {
    const name = (s.slice(i).match(/^[A-Za-z_][\w.]*/) as RegExpMatchArray)[0];
    i += name.length;
    ws();
    if (s[i] !== "(") {
      if (name === "None" || name === "null") return null;
      if (name === "True" || name === "true") return true;
      if (name === "False" || name === "false") return false;
      return name;
    }
    i++;
    const args: Json[] = [], kw: Record<string, Json> = {};
    ws();
    while (i < s.length && s[i] !== ")") {
      const km = s.slice(i).match(/^([A-Za-z_]\w*)\s*=(?!=)/);
      if (km) { i += km[0].length; kw[km[1]] = value(); } else args.push(value());
      ws();
      if (s[i] === ",") { i++; ws(); }
    }
    if (s[i] !== ")") fail("Expected )");
    i++;
    const base = name.split(".").pop();
    if (base === "date" && args.length === 3) return args[0] + "-" + pad2(args[1]) + "-" + pad2(args[2]);
    if (base === "datetime" && args.length >= 3) return args[0] + "-" + pad2(args[1]) + "-" + pad2(args[2]) + (args.length >= 4 ? " " + pad2(args[3]) + ":" + pad2(args[4] || 0) + ":" + pad2(args[5] || 0) : "");
    if (base === "time" && args.length >= 1) return pad2(args[0]) + ":" + pad2(args[1] || 0) + ":" + pad2(args[2] || 0);
    if (base === "Decimal" && args.length === 1) { const n = Number(args[0]); return isNaN(n) ? String(args[0]) : n; }
    if (base === "_dict" || base === "dict") return Object.assign({}, args[0] && typeof args[0] === "object" ? args[0] : {}, kw) as Json;
    return name + "(" + args.map(a => JSON.stringify(a)).concat(Object.keys(kw).map(k => k + "=" + JSON.stringify(kw[k]))).join(", ") + ")";
  }
  function arr(close: string): Json[] {
    i++;
    const out: Json[] = [];
    ws();
    if (s[i] === close) { i++; return out; }
    for (;;) {
      out.push(value());
      ws();
      if (s[i] === ",") { i++; ws(); if (s[i] === close) { i++; return out; } continue; }
      if (s[i] === close) { i++; return out; }
      fail("Expected , or " + close);
    }
  }
  function obj(): Json {
    i++;
    ws();
    if (s[i] === "}") { i++; return {}; }
    let k = value();
    ws();
    if (s[i] !== ":") {
      // a Python set literal: {1, 2}
      const a = [k];
      for (;;) { ws(); if (s[i] === ",") { i++; ws(); if (s[i] === "}") break; a.push(value()); } else break; }
      ws();
      if (s[i] !== "}") fail("Expected }");
      i++;
      return a;
    }
    const o: Record<string, Json> = {};
    for (;;) {
      ws();
      if (s[i] !== ":") fail("Expected :");
      i++;
      o[String(k)] = value();
      ws();
      if (s[i] === ",") { i++; ws(); if (s[i] === "}") { i++; return o; } k = value(); continue; }
      if (s[i] === "}") { i++; return o; }
      fail("Expected , or }");
    }
  }
  function value(): Json {
    ws();
    const c = s[i];
    if (c === undefined) return fail("Unexpected end");
    if (c === "{") return obj();
    if (c === "[") return arr("]");
    if (c === "(") return arr(")");
    if (c === '"' || c === "'") return str();
    if (/[-+\d.]/.test(c)) return num();
    if (/[A-Za-z_]/.test(c)) return ident();
    return fail("Unexpected '" + c + "'");
  }
  const out: Json[] = [];
  for (;;) { ws(); if (i >= s.length) break; out.push(value()); ws(); if (s[i] === ",") i++; }
  return out;
}

export function prettyJson(v: Json | undefined, ind = "", width = 78): string {
  const prim = (x: unknown) => x === null || typeof x !== "object";
  if (prim(v)) return JSON.stringify(v) as string;
  const inner = ind + "  ";
  if (Array.isArray(v)) {
    if (!v.length) return "[]";
    const flat = "[" + v.map(x => prettyJson(x, "", width)).join(", ") + "]";
    if (v.every(prim) && ind.length + flat.length <= width) return flat;
    return "[\n" + v.map(x => inner + prettyJson(x, inner, width)).join(",\n") + "\n" + ind + "]";
  }
  const o = v as Record<string, Json>, keys = Object.keys(o);
  if (!keys.length) return "{}";
  const flat = "{" + keys.map(k => JSON.stringify(k) + ": " + prettyJson(o[k], "", width)).join(", ") + "}";
  if (keys.every(k => prim(o[k])) && ind.length + flat.length <= 60) return flat;
  return "{\n" + keys.map(k => inner + JSON.stringify(k) + ": " + prettyJson(o[k], inner, width)).join(",\n") + "\n" + ind + "}";
}

/** Plain-text table for a list of objects (falls back to prettyJson). */
export function toTable(v: Json): string {
  const rows = Array.isArray(v) ? v : [v];
  if (!rows.length || !rows.every(r => r && typeof r === "object" && !Array.isArray(r))) return prettyJson(v);
  const objs = rows as Record<string, Json>[], cols: string[] = [];
  objs.forEach(r => Object.keys(r).forEach(k => { if (!cols.includes(k)) cols.push(k); }));
  const cell = (x: Json | undefined) => x === null || x === undefined ? "None" : typeof x === "object" ? JSON.stringify(x) : String(x);
  const w = cols.map(c => Math.max(c.length, ...objs.map(r => cell(r[c]).length)));
  const line = (a: string[]) => a.map((x, i) => x.padEnd(w[i])).join(" | ").trimEnd();
  return [line(cols), w.map(n => "-".repeat(n)).join("-+-")].concat(objs.map(r => line(cols.map(c => cell(r[c]))))).join("\n");
}

export type FormatMode = "pretty" | "compact" | "table";

/** null when the text is not an object/list, {error} on a parse failure, {text} on success. */
export function formatLoose(text: string, mode: FormatMode = "pretty"): null | { error: string } | { text: string; count: number } {
  const t = text.trim();
  if (!t || (!/^[\[{(]/.test(t) && !/^[A-Za-z_][\w.]*\s*\(/.test(t))) return null;
  let vals: Json[];
  try { vals = parseAll(t); } catch (e) { return { error: (e as Error).message }; }
  if (!vals.length || vals.some(v => v === null || typeof v !== "object")) return null;
  const f = mode === "compact" ? (v: Json) => JSON.stringify(v) : mode === "table" ? toTable : (v: Json) => prettyJson(v);
  return { text: vals.map(f).join("\n\n"), count: vals.length };
}

/** Index just past the bracket that closes s[i], skipping quoted strings; -1 if never closed. */
function closeOf(s: string, i: number): number {
  let d = 0, q: string | null = null;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (q) { if (c === "\\") j++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'") q = c;
    else if ("[{(".includes(c)) d++;
    else if ("]})".includes(c)) { d--; if (d === 0) return j + 1; }
  }
  return -1;
}

export type Segment = { t: string } | { v: Json };

/** Split console output into {v} segments for JSON / Python-repr objects and {t} segments for everything else. */
export function parseOut(raw: string): Segment[] {
  const s = raw.replace(/\r/g, ""), out: Segment[] = [];
  let i = 0, text = "";
  const flush = () => { if (text.trim()) out.push({ t: text.replace(/\n+$/, "") }); text = ""; };
  while (i < s.length) {
    let le = s.indexOf("\n", i);
    if (le < 0) le = s.length;
    const line = s.slice(i, le), lead = (line.match(/^\s*/) as RegExpMatchArray)[0].length;
    if ("[{(".includes(line[lead] || " ")) {
      const e = closeOf(s, i + lead);
      if (e > 0) {
        let n2 = s.indexOf("\n", e);
        if (n2 < 0) n2 = s.length;
        if (!s.slice(e, n2).trim()) {
          let vs: Json[] | null = null;
          try { vs = [JSON.parse(s.slice(i + lead, e))]; } catch { try { vs = parseAll(s.slice(i + lead, e)); } catch { /* plain text */ } }
          if (vs && vs.length === 1 && vs[0] && typeof vs[0] === "object") { flush(); out.push({ v: vs[0] }); i = n2 + 1; continue; }
        }
      }
    }
    text += line + "\n";
    i = le + 1;
  }
  flush();
  return out;
}

export type JsonPart = { text: string; cls?: "jk" | "js" | "jn" | "jl" };

/** Tokenize pretty JSON text for highlighting (keys, strings, numbers, literals). */
export function hlJson(t: string): JsonPart[] {
  const re = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)/g;
  const out: JsonPart[] = [];
  let last = 0, m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    if (m.index > last) out.push({ text: t.slice(last, m.index) });
    last = re.lastIndex;
    if (m[1]) { out.push({ text: m[1], cls: m[2] ? "jk" : "js" }); if (m[2]) out.push({ text: m[2] }); }
    else if (m[3]) out.push({ text: m[3], cls: "jl" });
    else out.push({ text: m[4], cls: "jn" });
  }
  if (last < t.length) out.push({ text: t.slice(last) });
  return out;
}

/** Text the Copy / To notes buttons use for the current view mode. */
export function segmentsText(raw: string, segs: Segment[], mode: "pretty" | "table" | "raw"): string {
  if (mode === "raw") return raw;
  return segs.map(g => "t" in g ? g.t : mode === "table" ? toTable(g.v) : prettyJson(g.v)).join("\n\n");
}
