"use client";

import { useCallback, useEffect } from "react";
import { useUi } from "@/lib/store/ui";
import { editorBridge } from "@/components/editor/bridge";
import { DialogHost } from "@/components/dialogs/DialogHost";
import { NotesPad } from "@/components/notes/NotesPad";
import { ServerBanner } from "@/components/ui/ServerBanner";
import { Dock } from "./Dock";
import { EditorPane } from "./EditorPane";
import { Sidebar } from "./Sidebar";
import { StatusBar } from "./StatusBar";
import { TopBar } from "./TopBar";
import { useRunner } from "./useRunner";

export function Board() {
  const { run } = useRunner();
  const queued = useUi((s) => s.queuedRun),
    pending = useUi((s) => s.pendingLoad),
    hydrated = useUi((s) => s.hydrated);
  const runRead = useCallback(() => {
    run("read");
  }, [run]);

  // a dialog (secret, new connection, sign-in) asked for the run to continue
  useEffect(() => {
    if (!queued) return;
    useUi.getState().set({ queuedRun: null });
    run(queued.kind);
  }, [queued, run]);

  // History → Open in editor
  useEffect(() => {
    if (!pending || !hydrated) return;
    const t = setTimeout(() => {
      editorBridge.setCode(pending.code);
      useUi.getState().set({ pendingLoad: null });
    }, 0);
    return () => clearTimeout(t);
  }, [pending, hydrated]);

  return (
    <div className="grid h-dvh grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden">
      <TopBar onRun={run} />
      <ServerBanner />
      <div className="grid min-h-0 grid-cols-[minmax(0,1fr)] wide:grid-cols-[300px_minmax(0,1fr)]">
        <Sidebar />
        <main className="grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_auto_auto]">
          <div className="min-h-0 min-w-0 bg-editor">
            <EditorPane onRun={runRead} />
          </div>
          <Dock />
          <StatusBar />
        </main>
      </div>
      <NotesPad />
      <DialogHost />
    </div>
  );
}
