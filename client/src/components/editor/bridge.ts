import { forceLinting } from "@codemirror/lint";
import { EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { formatIndent } from "@/lib/analysis/indent";

/* The board's single editor, so the sidebar, dock and dialogs can drive it without prop drilling. */
let view: EditorView | null = null;

export function formatView(v: EditorView): number {
  const doc = v.state.doc, { text, changed } = formatIndent(doc.toString());
  if (!changed) return 0;
  // formatting never adds or removes lines, so keep the caret on its line and shift it with the indent
  const head = v.state.selection.main.head, line = doc.lineAt(head), next = text.split("\n")[line.number - 1];
  const col = head - line.from, oldIndent = (line.text.match(/^[ \t]*/) as RegExpMatchArray)[0].length;
  const newIndent = (next.match(/^ */) as RegExpMatchArray)[0].length;
  const newCol = Math.max(0, Math.min(next.length, col <= oldIndent ? newIndent : col + newIndent - oldIndent));
  const before = text.split("\n").slice(0, line.number - 1).join("\n").length + (line.number > 1 ? 1 : 0);
  v.dispatch({ changes: { from: 0, to: doc.length, insert: text }, selection: { anchor: before + newCol }, scrollIntoView: true, userEvent: "input.format" });
  return changed;
}

export const editorBridge = {
  attach(v: EditorView | null) { view = v; },
  getCode: () => view?.state.doc.toString() ?? "",
  setCode(code: string) {
    if (!view) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: code }, selection: { anchor: 0 }, scrollIntoView: true });
    view.focus();
  },
  /** Insert at the caret, keeping the line's indent on new lines; "$0" marks where the caret ends. */
  insertText(t: string) {
    if (!view) return;
    const { from, to } = view.state.selection.main;
    const line = view.state.doc.lineAt(from), indent = (line.text.slice(0, from - line.from).match(/^[ \t]*/) || [""])[0];
    let ins = t.replace(/\n/g, "\n" + indent);
    const ci = ins.indexOf("$0");
    ins = ins.replace("$0", "");
    const p = from + (ci >= 0 ? ci : ins.length);
    view.dispatch({ changes: { from, to, insert: ins }, selection: { anchor: p }, scrollIntoView: true, userEvent: "input" });
    view.focus();
  },
  goLine(n: number) {
    if (!view) return;
    const line = view.state.doc.line(Math.max(1, Math.min(n, view.state.doc.lines)));
    view.dispatch({ selection: EditorSelection.cursor(line.from), effects: EditorView.scrollIntoView(line.from, { y: "center" }) });
    view.focus();
  },
  /** Fix indentation (see formatIndent). Returns how many lines changed; Ctrl+Z undoes it. */
  format(): number {
    return view ? formatView(view) : 0;
  },
  relint() { if (view) forceLinting(view); },
  focus() { view?.focus(); },
};
