"use client";

import { useEffect, useRef } from "react";
import { closeBrackets, closeBracketsKeymap, completionKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { python } from "@codemirror/lang-python";
import { bracketMatching, indentOnInput, indentUnit } from "@codemirror/language";
import { lintGutter, lintKeymap } from "@codemirror/lint";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { EditorState, type Extension } from "@codemirror/state";
import { drawSelection, EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from "@codemirror/view";
import { boardHighlight } from "./highlight";
import { boardIntelligence, type EditorHooks } from "./intelligence";
import { editorBridge } from "./bridge";

export interface CodeEditorProps {
  initial: string;
  readOnly?: boolean;
  /** Board editor: wire up completion, lint, hints and the global bridge. */
  hooks?: EditorHooks;
  onChange?: (code: string) => void;
  label?: string;
}

const base: Extension = [
  lineNumbers(),
  python(),
  boardHighlight,
  indentUnit.of("    "),
  EditorState.tabSize.of(4),
  EditorView.contentAttributes.of({ spellcheck: "false", autocapitalize: "off", autocorrect: "off" }),
];

export default function CodeEditor({ initial, readOnly, hooks, onChange, label = "Script editor" }: CodeEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  // callbacks change every render; the view reads them through refs so it is created once
  const hooksRef = useRef(hooks), changeRef = useRef(onChange);
  // latest text, so a view re-created after <Activity> hides/shows the route keeps the user's edits
  const docRef = useRef(initial);
  useEffect(() => { hooksRef.current = hooks; changeRef.current = onChange; });

  useEffect(() => {
    if (!host.current) return;
    const proxy: EditorHooks = {
      getCtx: () => hooksRef.current!.getCtx(),
      onDiags: d => hooksRef.current?.onDiags?.(d),
      onHint: h => hooksRef.current?.onHint?.(h),
      onCaret: (l, c) => hooksRef.current?.onCaret?.(l, c),
      onRun: () => hooksRef.current?.onRun?.(),
    };
    const extensions: Extension[] = [base, EditorView.contentAttributes.of({ "aria-label": label })];
    if (readOnly) extensions.push(EditorState.readOnly.of(true), EditorView.editable.of(false));
    else {
      extensions.push(
        highlightActiveLineGutter(), history(), drawSelection(), indentOnInput(), bracketMatching(), closeBrackets(),
        highlightActiveLine(), highlightSelectionMatches(), lintGutter(),
        keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, ...completionKeymap, ...lintKeymap]),
        EditorView.updateListener.of(u => {
          if (!u.docChanged) return;
          docRef.current = u.state.doc.toString();
          changeRef.current?.(docRef.current);
        }),
      );
      if (hooksRef.current) extensions.push(boardIntelligence(proxy));
    }
    const view = new EditorView({ parent: host.current, state: EditorState.create({ doc: docRef.current, extensions }) });
    const isBoard = !readOnly && !!hooksRef.current;
    if (isBoard) { editorBridge.attach(view); view.focus(); }
    return () => { if (isBoard) editorBridge.attach(null); view.destroy(); };
  }, [readOnly, label]);

  return <div ref={host} className="fsb-editor h-full min-h-0 min-w-0" />;
}
