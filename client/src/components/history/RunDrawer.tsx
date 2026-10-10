"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { errMsg } from "@/lib/api/client";
import { useConnections, useRun } from "@/lib/api/hooks";
import { useBoard, type OutputMode } from "@/lib/store/board";
import { toast, useUi } from "@/lib/store/ui";
import { OutputTools, OutputView, outputText, useSegments } from "@/components/run/OutputView";
import { fmtMs } from "@/components/run/OutputView";
import { AccountingWarning, PlanTable, touchesAccounting } from "@/components/run/PlanTable";
import { EditorSkeleton } from "@/components/board/EditorPane";
import { ModeBadge, StatusBadge } from "./badges";

const CodeEditor = dynamic(() => import("@/components/editor/CodeEditor"), { ssr: false, loading: EditorSkeleton });

export function RunDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const router = useRouter();
  const q = useRun(id);
  const conns = useConnections().data || [];
  const [mode, setMode] = useState<OutputMode>("pretty");
  const panel = useRef<HTMLDivElement>(null);
  const segs = useSegments(q.data?.output);

  useEffect(() => { panel.current?.focus(); }, [id]);

  const run = q.data;
  const openInEditor = () => {
    if (!run) return;
    const c = run.connectionId ? conns.find(x => x.id === run.connectionId) : null;
    useBoard.getState().set({ draft: run.code, ...(c ? { activeConnectionId: c.id } : {}) });
    useUi.getState().set({ pendingLoad: { code: run.code, nonce: Date.now() } });
    toast(c ? "Loaded into the editor · Run uses " + c.name : "Loaded into the editor");
    router.push("/");
  };

  return (
    <>
      <div className="fixed inset-0 z-30 bg-[rgba(10,15,22,.35)]" onClick={onClose} aria-hidden="true" />
      <div ref={panel} role="dialog" aria-modal="true" aria-label="Run details" tabIndex={-1}
        onKeyDown={e => { if (e.key === "Escape") onClose(); }}
        className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[760px] flex-col border-l border-line bg-panel shadow-pop outline-none">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
          <h2 className="m-0 mr-auto text-[15px] font-semibold">Run details</h2>
          <button className="btn btn-primary" disabled={!run} onClick={openInEditor}>Open in editor</button>
          <button className="btn" onClick={onClose}>Close</button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
          {q.isLoading && <div className="space-y-2"><div className="skeleton h-5 w-1/2" /><div className="skeleton h-40" /><div className="skeleton h-24" /></div>}
          {q.isError && <div className="empty text-err">{errMsg(q.error)}</div>}
          {run && (
            <>
              <div className="flex flex-wrap items-center gap-2 text-[13px]">
                <ModeBadge mode={run.mode} /><StatusBadge status={run.status} />
                <span>{run.connectionName}</span>
                <span className="text-mute">{new Date(run.createdAt).toLocaleString()}</span>
                {run.durationMs != null && <span className="text-mute">· {fmtMs(run.durationMs)}</span>}
                {run.changeCount != null && <span className="text-mute">· {run.changeCount} change{run.changeCount === 1 ? "" : "s"}</span>}
              </div>
              {run.dryRunId && <p className="mt-1 mb-0 text-xs text-mute">Confirmed dry run {run.dryRunId}</p>}
              {run.committedRunId && <p className="mt-1 mb-0 text-xs text-mute">Committed by run {run.committedRunId}</p>}
              <h3 className="mt-3 mb-1 text-[12.5px] font-semibold text-mute">Code</h3>
              <div className="h-[260px] overflow-hidden rounded-md border border-line">
                <CodeEditor key={run.id} initial={run.code} readOnly label="Run code (read-only)" />
              </div>
              {run.plan && run.plan.length > 0 && (
                <>
                  <h3 className="mt-3 mb-1 text-[12.5px] font-semibold text-mute">{run.mode === "COMMIT" ? "Applied changes" : "Planned changes"}</h3>
                  {touchesAccounting(run.plan) && <AccountingWarning />}
                  <PlanTable plan={run.plan} />
                </>
              )}
              <div className="mt-3 mb-1 flex flex-wrap items-center gap-2">
                <h3 className="m-0 mr-auto text-[12.5px] font-semibold text-mute">Output</h3>
                {run.output?.trim() && (
                  <OutputTools mode={mode} onMode={setMode} onCopy={async () => {
                    try { await navigator.clipboard.writeText(outputText({ kind: "run", run }, segs, mode)); toast("Output copied"); } catch { toast("Copy blocked by the browser"); }
                  }} />
                )}
              </div>
              <div className="overflow-auto rounded-md border border-line bg-editor p-2.5">
                <OutputView out={{ kind: "run", run }} mode={mode} />
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
