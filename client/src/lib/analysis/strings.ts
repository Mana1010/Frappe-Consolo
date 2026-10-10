import type { Tok } from "./guard";
import { fieldItems, rank } from "./complete";
import type { Analysis, CompletionItem, CompletionResult, Schema } from "./types";

/*
 * Completions inside a plain "string": doctype names where a call expects a doctype,
 * field names where it expects fields. Both come from the synced schema (or the fallback).
 */

interface Frame { ch: string; pos: number; commas: number; lastComma: number }

/** Where a string sits: the call around it, which argument, keyword, and list/dict nesting. */
export interface StringSlot {
  call: string;
  /** positional index of the argument (keyword args count too, as in callAt) */
  arg: number;
  /** keyword name when inside `kw=...` */
  kw: string | null;
  /** first-argument doctype of the call, when it is a literal string */
  doctype: string | null;
  /** innermost container the string is in: "(" call args, "[" list, "{" dict */
  inside: "(" | "[" | "{";
  /** for dicts: is the string a key (true) or a value (false) */
  dictKey: boolean;
  /** for dicts: the key this string is the value of (e.g. "doctype") */
  dictValueOf: string | null;
  /** index inside the innermost list (0 = first item) */
  listIndex: number;
  /** the list is itself inside another list, e.g. filters=[["field", "=", 1]] */
  nestedList: boolean;
}

export function stringSlotAt(text: string, strStart: number, toks: Tok[]): StringSlot | null {
  const stack: Frame[] = [];
  let ti = 0;
  for (let i = 0; i < strStart; i++) {
    while (ti < toks.length && toks[ti].e <= i) ti++;
    const k = toks[ti];
    if (k && k.s <= i && i < k.e && (k.t === "str" || k.t === "tstr" || k.t === "comment")) { i = Math.min(k.e, strStart) - 1; continue; }
    const ch = text[i];
    if ("([{".includes(ch)) stack.push({ ch, pos: i, commas: 0, lastComma: i });
    else if (")]}".includes(ch)) stack.pop();
    else if (ch === "," && stack.length) { const f = stack[stack.length - 1]; f.commas++; f.lastComma = i; }
  }
  let ci = -1;
  for (let j = stack.length - 1; j >= 0; j--) if (stack[j].ch === "(") { ci = j; break; }
  if (ci < 0) return null;
  const cf = stack[ci], name = text.slice(0, cf.pos).match(/([A-Za-z_][\w.]*)\s*$/);
  if (!name) return null;
  const top = stack[stack.length - 1];
  // keyword of the current call argument: text between the last comma (or "(") and the string / inner bracket
  const argEnd = ci === stack.length - 1 ? strStart : stack[ci + 1].pos;
  const kw = text.slice(cf.lastComma + 1, argEnd).match(/^\s*([A-Za-z_]\w*)\s*=\s*$/);
  const first = text.slice(cf.pos + 1).match(/^\s*["']([^"'\n]+)["']/);
  const seg = text.slice(top.lastComma + 1, strStart);
  const dictKey = top.ch === "{" && !seg.includes(":");
  const dv = top.ch === "{" && !dictKey ? seg.match(/["'](\w+)["']\s*:\s*$/) : null;
  return {
    call: name[1],
    arg: cf.commas,
    kw: kw ? kw[1] : null,
    doctype: first && first.index !== undefined && cf.pos + 1 + first[0].length <= strStart ? first[1] : null,
    inside: top.ch as StringSlot["inside"],
    dictKey,
    dictValueOf: dv ? dv[1] : null,
    listIndex: top.ch === "[" ? top.commas : 0,
    nestedList: top.ch === "[" && stack.length - 2 > ci && stack[stack.length - 2].ch === "[",
  };
}

// calls whose first argument is a doctype (matched on the last name segment)
const DOCTYPE_FIRST = new Set(("get_doc get_cached_doc get_last_doc new_doc get_all get_list get_meta get_value get_values get_single_value " +
  "get_cached_value exists count set_value update_doc delete_doc rename_doc").split(" "));

/** Which kind of value belongs in this string slot, and for which doctype. */
export function slotKind(slot: StringSlot, an: Analysis): { kind: "doctype" } | { kind: "field"; doctype: string; childTablesOnly?: boolean } | null {
  const parts = slot.call.split("."), fn = parts[parts.length - 1], recv = parts.length === 2 ? parts[0] : null;
  // doc.get("…"), doc.set("…"), doc.append("…") on a variable that holds a known doctype
  if (recv && recv !== "frappe" && recv !== "json" && an.docTypes[recv] && slot.inside === "(" && slot.arg === 0) {
    if (fn === "get" || fn === "set" || fn === "getone") return { kind: "field", doctype: an.docTypes[recv] };
    if (fn === "append") return { kind: "field", doctype: an.docTypes[recv], childTablesOnly: true };
    return null;
  }
  if (!DOCTYPE_FIRST.has(fn) || (recv !== null && !/^frappe(\.db)?$/.test(parts.slice(0, -1).join(".")))) return null;
  // get_doc({"doctype": "…"}): the value of the "doctype" key
  if (slot.inside === "{" && slot.dictValueOf === "doctype") return { kind: "doctype" };
  if (slot.inside === "(" && slot.arg === 0 && !slot.kw) return { kind: "doctype" };
  const dt = slot.doctype;
  if (!dt) return null;
  const field = { kind: "field" as const, doctype: dt };
  const kw = slot.kw;
  // keyword arguments that hold field names
  if (kw === "fields" || kw === "pluck" || kw === "order_by" || kw === "group_by" || kw === "fieldname") return field;
  if (kw === "filters" || kw === "or_filters") return slot.inside === "{" ? (slot.dictKey ? field : null) : slot.nestedList && slot.listIndex === 0 ? field : null;
  if (kw) return null;
  // positional: get_value(dt, filters_or_name, fieldname), set_value(dt, name, field_or_dict, value), get_all(dt, filters, fields)
  const a = slot.arg;
  if (fn === "get_value" || fn === "get_values" || fn === "get_cached_value" || fn === "set_value") {
    if (a === 2) return slot.inside === "{" ? (slot.dictKey ? field : null) : field;
    if (a === 1 && slot.inside === "{" && slot.dictKey) return field;
    return null;
  }
  if (fn === "get_single_value") return a === 1 ? field : null;
  if (fn === "update_doc") return a === 2 && slot.inside === "{" && slot.dictKey ? field : null;
  if (fn === "exists" || fn === "count") return a === 1 && slot.inside === "{" && slot.dictKey ? field : null;
  if (fn === "get_all" || fn === "get_list") {
    if (a === 1) return slot.inside === "{" ? (slot.dictKey ? field : null) : slot.nestedList && slot.listIndex === 0 ? field : null;
    if (a === 2) return field;
  }
  return null;
}

export function doctypeItems(schema: Schema, singlesOnly = false): CompletionItem[] {
  const names = Object.keys(schema).filter(n => !singlesOnly || schema[n].issingle);
  // regular doctypes before child tables and singles; alphabetical within each group
  const rankOf = (n: string) => (schema[n].istable ? 2 : schema[n].issingle ? 1 : 0);
  names.sort((a, b) => rankOf(a) - rankOf(b) || a.localeCompare(b));
  return names.map(n => ({
    label: n, insert: n, kind: "tbl" as const,
    detail: schema[n].istable ? "child table" : schema[n].issingle ? "single" : "doctype",
    doc: schema[n].cols.length + " fields.",
  }));
}

/**
 * Completions for the caret inside the plain string token `tok`.
 * `start` in the result is an absolute document offset.
 */
export function stringCompletions(text: string, caret: number, tok: Tok, toks: Tok[], an: Analysis, schema: Schema, forced: boolean): CompletionResult | null {
  const slot = stringSlotAt(text, tok.s, toks);
  if (!slot) return null;
  const k = slotKind(slot, an);
  if (!k) return null;
  const contentStart = tok.s + 1, typed = text.slice(contentStart, caret);
  if (typed.includes("\n")) return null;
  if (k.kind === "doctype") {
    const fn = slot.call.split(".").pop();
    const items = rank(doctypeItems(schema, fn === "get_single_value"), typed);
    // doctype names contain spaces, so the whole string content is the query
    return items.length ? { items, start: contentStart } : null;
  }
  let items = fieldItems(schema, k.doctype);
  if (k.childTablesOnly) items = items.filter(f => /^Table/.test(f.detail || ""));
  if (!items.length) return null;
  // order_by="posting_date desc, name": complete the last word only
  const w = (typed.match(/\w*$/) as RegExpMatchArray)[0];
  if (!w && !forced && typed.length > 0 && !/[\s,]$/.test(typed)) return null;
  const r = rank(items, w);
  return r.length ? { items: r, start: caret - w.length } : null;
}
