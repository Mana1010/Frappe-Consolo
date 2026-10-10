"use client";

import { useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { useActiveConnection, useMe } from "@/lib/api/hooks";
import { useBoard } from "@/lib/store/board";
import { toast, useUi, type DockTab } from "@/lib/store/ui";
import { editorBridge } from "@/components/editor/bridge";
import { OutputTools, OutputView, outputText, useSegments } from "@/components/run/OutputView";
import { appendToNotes } from "@/components/notes/notes";
import { ChangesPane } from "./ChangesPane";
import { HintPanel } from "./HintPanel";

const clampDock = (h: number) => Math.round(Math.min(Math.max(h, 110), window.innerHeight * 0.75));

function ChecksPane() {
  const diags = useUi(s => s.diags);
  if (!diags.length) return <div className="text-[12.5px] text-ok">No issues found.</div>;
  return (
    <>
      {diags.map((d, i) => (
        <button key={i} className={`dg lv-${d.level}`} onClick={() => editorBridge.goLine(d.line)}>
          <i /><span className="l">Ln {d.line}</span><span>{d.msg}</span>
        </button>
      ))}
    </>
  );
}

function OutputPane() {
  const out = useUi(s => s.out), mode = useBoard(s => s.outputMode);
  const conn = useActiveConnection();
  const empty = conn
    ? <>Press Run or Ctrl+Enter to execute on {conn.name}. Print results with <code>log(json.dumps(rows, default=str))</code> or <code>log(rows)</code>; both come back as clean JSON.</>
    : <>Choose a connection in the top bar, then press Run. Print results with <code>log(json.dumps(rows, default=str))</code> or <code>log(rows)</code>.</>;
  return <OutputView out={out} mode={mode} onLine={editorBridge.goLine} empty={empty} />;
}

function DockOutputTools() {
  const out = useUi(s => s.out), mode = useBoard(s => s.outputMode);
  const segs = useSegments(out.kind === "run" ? out.run.output : null);
  const text = outputText(out, segs, mode);
  if (!(out.kind === "run" && out.run.output?.trim())) return null;
  return (
    <OutputTools mode={mode} onMode={m => useBoard.getState().set({ outputMode: m })}
      onCopy={async () => { try { await navigator.clipboard.writeText(text); toast("Output copied"); } catch { toast("Copy blocked by the browser"); } }}
      onNotes={() => { if (text) appendToNotes(text); }} />
  );
}

export function Dock() {
  const tab = useUi(s => s.dockTab), diags = useUi(s => s.diags), dryRun = useUi(s => s.dryRun);
  const dockHeight = useBoard(s => s.dockHeight);
  const { signedIn } = useMe();
  const conn = useActiveConnection();
  const [drag, setDrag] = useState<number | null>(null);
  const start = useRef<{ y: number; h: number } | null>(null), dockEl = useRef<HTMLDivElement>(null);

  const onDown = (e: RPointerEvent<HTMLDivElement>) => {
    start.current = { y: e.clientY, h: dockEl.current?.getBoundingClientRect().height || 190 };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const onMove = (e: RPointerEvent<HTMLDivElement>) => { if (start.current) setDrag(clampDock(start.current.h + start.current.y - e.clientY)); };
  const onUp = () => { if (!start.current) return; start.current = null; if (drag) useBoard.getState().set({ dockHeight: drag }); setDrag(null); };

  const height = drag ?? (dockHeight ? clampDock(dockHeight) : null);
  const showChanges = signedIn && (conn?.writable || !!dryRun);
  const setTab = (t: DockTab) => useUi.getState().set({ dockTab: t });
  const tabs: [DockTab, string][] = [["diags", diags.length ? `Checks (${diags.length})` : "Checks"], ["out", "Output"]];
  if (showChanges) tabs.push(["changes", dryRun?.status === "OK" && dryRun.changeCount ? `Changes (${dryRun.changeCount})` : "Changes"]);
  const active = tab === "changes" && !showChanges ? "out" : tab;

  return (
    <div ref={dockEl} className="relative grid h-[240px] grid-cols-1 grid-rows-[auto_minmax(0,1fr)] border-t border-line bg-panel wide:h-[190px] wide:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] wide:grid-rows-1"
      style={height ? { height } : undefined}>
      <div role="separator" aria-orientation="horizontal" aria-label="Resize the dock" title="Drag to resize"
        className="absolute inset-x-0 -top-[5px] z-[3] h-[9px] cursor-row-resize touch-none" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
      <HintPanel />
      <div className="flex min-h-0 min-w-0 flex-col border-t border-line wide:border-t-0 wide:border-l">
        <div role="tablist" aria-label="Dock" className="tabbar flex flex-none flex-wrap items-center gap-0.5 px-2 pt-[3px]">
          {tabs.map(([id, label]) => (
            <button key={id} role="tab" id={"dt-" + id} aria-controls={"dp-" + id} aria-selected={active === id} onClick={() => setTab(id)} className="px-2 py-[3px] text-[12.5px] !font-semibold">{label}</button>
          ))}
          <span className="flex-1" />
          {active === "out" && <DockOutputTools />}
        </div>
        <div role="tabpanel" id={"dp-" + active} aria-labelledby={"dt-" + active} className="min-h-0 flex-1 overflow-auto px-3 pt-1.5 pb-2">
          {active === "diags" ? <ChecksPane /> : active === "out" ? <OutputPane /> : <ChangesPane />}
        </div>
      </div>
    </div>
  );
}
