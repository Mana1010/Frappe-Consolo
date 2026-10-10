"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef } from "react";
import { useActiveConnection, useEffectiveSchema } from "@/lib/api/hooks";
import { DEFAULT_SCRIPT } from "@/lib/analysis/data";
import { useBoard } from "@/lib/store/board";
import { useUi } from "@/lib/store/ui";
import type { EditorCtx, EditorHooks } from "@/components/editor/intelligence";
import { editorBridge } from "@/components/editor/bridge";

export const EditorSkeleton = () => (
  <div className="h-full space-y-2 bg-editor p-4" aria-busy="true" aria-label="Loading editor">
    <div className="skeleton h-4 w-2/3" /><div className="skeleton h-4 w-1/2" /><div className="skeleton h-4 w-3/4" /><div className="skeleton h-4 w-1/3" />
  </div>
);

const CodeEditor = dynamic(() => import("@/components/editor/CodeEditor"), { ssr: false, loading: EditorSkeleton });

export function EditorPane({ onRun }: { onRun: () => void }) {
  const hydrated = useUi(s => s.hydrated);
  const { schema } = useEffectiveSchema();
  const conn = useActiveConnection();
  const ctx = useRef<EditorCtx>({ schema, writable: false, version: null });
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // the editor reads context through a ref; re-lint when it changes
  useEffect(() => {
    ctx.current = { schema, writable: !!conn?.writable, version: conn?.frappeVersion ?? null };
    editorBridge.relint();
  }, [schema, conn?.writable, conn?.frappeVersion]);

  const hooks = useMemo<EditorHooks>(() => ({
    getCtx: () => ctx.current,
    onDiags: diags => useUi.getState().set({ diags }),
    onHint: hint => useUi.getState().set({ hint }),
    onCaret: (line, col) => useUi.getState().set({ caret: { line, col } }),
    onRun,
  }), [onRun]);

  const onChange = useMemo(() => (code: string) => {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => useBoard.getState().set({ draft: code }), 400);
  }, []);

  if (!hydrated) return <EditorSkeleton />;
  return <CodeEditor initial={useBoard.getState().draft ?? DEFAULT_SCRIPT} hooks={hooks} onChange={onChange} />;
}
