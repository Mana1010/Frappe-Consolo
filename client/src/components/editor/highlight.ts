import { RangeSetBuilder, type Extension } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { tokens } from "@/lib/analysis/guard";
import { PYBI, PYKW, SQLKW } from "@/lib/analysis/data";

/*
 * Port of the HTML's hl()/hlSql(): context-aware classes (frappe, builtins, calls, attributes)
 * plus SQL inside triple-quoted strings. Done as one decoration plugin rather than a lezer
 * HighlightStyle so the colours match the original token-for-token.
 */

const SQLTOK = /(`[^`\n]*`?)|(%\(\w+\)s|%s|%%)|('(?:[^'\\]|\\.)*'?)|(\b[A-Za-z_]\w*\b)|([\s\S])/g;
const marks = new Map<string, Decoration>();
const mark = (cls: string) => {
  let m = marks.get(cls);
  if (!m) { m = Decoration.mark({ class: cls }); marks.set(cls, m); }
  return m;
};

type Span = [from: number, to: number, cls: string];

function sqlSpans(raw: string, base: number, out: Span[]) {
  const open = raw.slice(0, 3);
  let body = raw.slice(3), closeLen = 0;
  if (raw.length >= 6 && body.endsWith(open)) { closeLen = 3; body = body.slice(0, -3); }
  out.push([base, base + 3, "tk-s"]);
  const re = new RegExp(SQLTOK.source, "g");
  let m: RegExpExecArray | null, pos = base + 3;
  while ((m = re.exec(body))) {
    const cls = m[1] ? "tk-s tk-tb" : m[2] ? "tk-s tk-pm" : m[3] ? "tk-s tk-sv" : m[4] && SQLKW.has(m[4].toLowerCase()) ? "tk-s tk-sk" : "tk-s";
    const from = base + 3 + m.index, to = from + m[0].length;
    const last = out[out.length - 1];
    if (last && last[2] === cls && last[1] === from) last[1] = to; else out.push([from, to, cls]);
    pos = to;
  }
  if (closeLen) out.push([pos, pos + 3, "tk-s"]);
}

export function highlightSpans(text: string): Span[] {
  const toks = tokens(text), out: Span[] = [];
  for (let i = 0; i < toks.length; i++) {
    const k = toks[i];
    if (k.t === "comment") out.push([k.s, k.e, "tk-c"]);
    else if (k.t === "tstr") sqlSpans(k.v, k.s, out);
    else if (k.t === "str") out.push([k.s, k.e, "tk-s"]);
    else if (k.t === "num") out.push([k.s, k.e, "tk-n"]);
    else if (k.t === "id") {
      const prev = toks[i - 1], next = toks[i + 1];
      const afterDot = !!prev && prev.t === "op" && prev.v === ".";
      let cls = "";
      if (!afterDot && PYKW.has(k.v)) cls = k.v === "None" || k.v === "True" || k.v === "False" ? "tk-n" : "tk-k";
      else if (!afterDot && k.v === "frappe") cls = "tk-fr";
      else if (!afterDot && PYBI.has(k.v)) cls = "tk-b";
      else if (next && next.t === "op" && next.v === "(") cls = "tk-f";
      else if (afterDot) cls = "tk-a";
      if (cls) out.push([k.s, k.e, cls]);
    }
  }
  return out;
}

function build(view: EditorView): DecorationSet {
  const b = new RangeSetBuilder<Decoration>();
  for (const [from, to, cls] of highlightSpans(view.state.doc.toString())) if (to > from) b.add(from, to, mark(cls));
  return b.finish();
}

export const boardHighlight: Extension = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = build(view); }
    update(u: ViewUpdate) { if (u.docChanged) this.decorations = build(u.view); }
  },
  { decorations: v => v.decorations },
);
