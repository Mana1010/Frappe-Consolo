import { acceptCompletion, autocompletion, completionStatus, selectedCompletion, type Completion, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import { indentLess, indentMore } from "@codemirror/commands";
import { linter, type Diagnostic } from "@codemirror/lint";
import { EditorSelection, Prec, type Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { tokens } from "@/lib/analysis/guard";
import { analyze, callAt, ctxAt, resolveApi } from "@/lib/analysis/analyze";
import { pyCompletions, sqlCompletions } from "@/lib/analysis/complete";
import { stringCompletions } from "@/lib/analysis/strings";
import { formatView } from "./bridge";
import { runChecks, usesWriteHelpers } from "@/lib/analysis/checks";
import { KINDCH } from "@/lib/analysis/data";
import type { CompletionItem, Diag, Schema } from "@/lib/analysis/types";
import type { Hint } from "@/lib/store/ui";

export interface EditorCtx {
  schema: Schema;
  /** Active connection is writable (write-mode lint applies when the script uses the helpers). */
  writable: boolean;
  version: string | null;
}

export interface EditorHooks {
  getCtx: () => EditorCtx;
  onDiags?: (d: Diag[]) => void;
  onHint?: (h: Hint | null) => void;
  onCaret?: (line: number, col: number) => void;
  onRun?: () => void;
}

type ItemCompletion = Completion & { item: CompletionItem };

function applyItem(view: EditorView, completion: Completion, from: number, to: number) {
  const it = (completion as ItemCompletion).item, doc = view.state.doc, line = doc.lineAt(from);
  const indent = (line.text.match(/^[ \t]*/) || [""])[0];
  let ins = it.insert.replace(/\n/g, "\n" + indent);
  const ci = ins.indexOf("$0");
  ins = ins.replace("$0", "");
  let p = from + (ci >= 0 ? ci : ins.length);
  // the table name was inserted without its closing backtick because one already follows: step over it
  if (it.kind === "tbl" && ci < 0 && doc.sliceString(to, to + 1) === "`") p++;
  view.dispatch({ changes: { from, to, insert: ins }, selection: { anchor: p }, userEvent: "input.complete", scrollIntoView: true });
}

const toCompletion = (it: CompletionItem): ItemCompletion => ({
  label: it.label,
  detail: it.detail,
  type: it.kind,
  item: it,
  apply: applyItem,
  info: it.doc || it.sig ? () => {
    const el = document.createElement("div");
    el.className = "pdoc";
    if (it.sig) { const c = document.createElement("code"); c.textContent = it.sig; el.appendChild(c); }
    el.appendChild(document.createTextNode(it.doc || ""));
    return el;
  } : undefined,
});

function completionSource(hooks: EditorHooks) {
  return (ctx: CompletionContext): CompletionResult | null => {
    const text = ctx.state.doc.toString(), caret = ctx.pos, toks = tokens(text), c = ctxAt(toks, caret);
    const { schema } = hooks.getCtx();
    if (c && c.t === "comment") return null;
    if (!ctx.explicit && ctx.state.selection.main.from !== ctx.state.selection.main.to) return null;
    let res: { items: CompletionItem[]; from: number } | null = null;
    if (c && c.t === "str") {
      // doctype / field names inside call arguments, e.g. frappe.get_doc("Sal|
      const r = stringCompletions(text, caret, c.tok, toks, analyze(text, schema), schema, ctx.explicit);
      if (r) res = { items: r.items, from: r.start };
    } else if (c && c.t === "tstr") {
      const k = c.tok, full = text.slice(k.s + 3, c.closed ? k.e - 3 : k.e), b = text.slice(k.s + 3, caret);
      const r = sqlCompletions(b, full, schema, ctx.explicit, text[caret] || "");
      if (r) res = { items: r.items, from: k.s + 3 + r.start };
    } else {
      const line = ctx.state.doc.lineAt(caret), r = pyCompletions(text.slice(line.from, caret), text, analyze(text, schema), ctx.explicit, schema);
      if (r) res = { items: r.items, from: line.from + r.start };
    }
    if (!res || !res.items.length) return null;
    return { from: res.from, options: res.items.map(toCompletion), filter: false };
  };
}

/** Lint context: write-mode scan when the connection is writable and the script uses the helpers. */
export function checksFor(text: string, ctx: EditorCtx): Diag[] {
  const toks = tokens(text);
  return runChecks(text, toks, ctx.schema, analyze(text, ctx.schema), {
    writeMode: ctx.writable && usesWriteHelpers(text),
    writable: ctx.writable,
    version: ctx.version,
  });
}

function lintSource(hooks: EditorHooks) {
  return (view: EditorView): Diagnostic[] => {
    const doc = view.state.doc, diags = checksFor(doc.toString(), hooks.getCtx());
    hooks.onDiags?.(diags);
    return diags.map(d => {
      const line = doc.line(Math.min(d.line, doc.lines));
      return { from: line.from, to: line.to, severity: d.level === "warn" ? "warning" : d.level, message: d.msg };
    });
  };
}

function hintAt(view: EditorView, hooks: EditorHooks): Hint | null {
  const sel = selectedCompletion(view.state) as ItemCompletion | null;
  if (sel && sel.item && (sel.item.doc || sel.item.sig)) return { title: sel.item.label, sig: sel.item.sig, doc: sel.item.doc };
  const text = view.state.doc.toString(), caret = view.state.selection.main.head;
  const c = callAt(text, caret, tokens(text));
  if (!c) return null;
  const e = resolveApi(c.name, analyze(text, hooks.getCtx().schema));
  if (!e) return null;
  const title = e.n.startsWith("doc.") ? c.name : e.n;
  return { title, params: e.params, arg: c.arg, doc: e.doc };
}

const insertSpaces = (view: EditorView) => {
  const { state } = view;
  if (state.selection.ranges.some(r => !r.empty && state.doc.lineAt(r.from).number !== state.doc.lineAt(r.to).number)) return indentMore(view);
  view.dispatch(state.changeByRange(r => ({ changes: { from: r.from, to: r.to, insert: "    " }, range: EditorSelection.cursor(r.from + 4) })), { userEvent: "input" });
  return true;
};

/** Typing ` inside a SQL string inserts a pair, or steps over the closing one. */
const backtickPair = EditorView.inputHandler.of((view, from, to, text) => {
  if (text !== "`" || from !== to) return false;
  const doc = view.state.doc.toString(), c = ctxAt(tokens(doc), from);
  if (!c || c.t !== "tstr") return false;
  if (doc[from] === "`") view.dispatch({ selection: { anchor: from + 1 } });
  else view.dispatch({ changes: { from, insert: "``" }, selection: { anchor: from + 1 }, userEvent: "input.type" });
  return true;
});

export function boardIntelligence(hooks: EditorHooks): Extension {
  let lastHint = "";
  return [
    autocompletion({
      override: [completionSource(hooks)],
      icons: false,
      optionClass: c => "k-" + (c.type || ""),
      addToOptions: [{ position: 20, render: c => { const s = document.createElement("span"); s.className = "kd"; s.textContent = KINDCH[c.type || ""] || "·"; return s; } }],
      maxRenderedOptions: 40,
    }),
    linter(lintSource(hooks), { delay: 250 }),
    backtickPair,
    Prec.highest(keymap.of([
      { key: "Mod-Enter", run: () => { hooks.onRun?.(); return true; } },
      { key: "Shift-Alt-f", run: v => { formatView(v); return true; } },
      { key: "Tab", run: v => (completionStatus(v.state) === "active" ? acceptCompletion(v) : insertSpaces(v)), shift: indentLess },
    ])),
    EditorView.updateListener.of(u => {
      if (!u.docChanged && !u.selectionSet && u.transactions.length === 0) return;
      const head = u.state.selection.main.head, line = u.state.doc.lineAt(head);
      hooks.onCaret?.(line.number, head - line.from + 1);
      const h = hintAt(u.view, hooks), key = JSON.stringify(h);
      if (key !== lastHint) { lastHint = key; hooks.onHint?.(h); }
    }),
  ];
}
