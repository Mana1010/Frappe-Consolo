"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import { errMsg } from "@/lib/api/client";
import { qk, useActiveConnection, useEffectiveSchema, useSampleQuery } from "@/lib/api/hooks";
import { doctypeTemplate } from "@/lib/analysis/template";
import { prettyJson, type Json as JsonValue } from "@/lib/output/parse";
import { useBoard } from "@/lib/store/board";
import { toast, useUi } from "@/lib/store/ui";
import { Json } from "@/components/run/OutputView";

const MIN_W = 280, DEFAULT_W = 420;
const maxW = () => Math.max(MIN_W, Math.min(1100, Math.round(window.innerWidth * 0.75)));

/** Right-side panel with the first record of a doctype (or an empty template). */
export function PreviewPanel() {
  const doctype = useUi(s => s.previewDoctype);
  const hidden = useBoard(s => s.previewHidden), width = useBoard(s => s.previewWidth) ?? DEFAULT_W;
  const conn = useActiveConnection();
  const { schema } = useEffectiveSchema();
  const qc = useQueryClient();
  const canFetch = !!conn && conn.hasSecret;
  const q = useSampleQuery(conn?.id, doctype, canFetch && !hidden);
  const drag = useRef<{ x: number; w: number } | null>(null);

  // keep a remembered width usable after the window gets smaller
  useEffect(() => {
    const fit = () => { const w = useBoard.getState().previewWidth; if (w && w > maxW()) useBoard.getState().set({ previewWidth: maxW() }); };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  const view = useMemo(() => {
    if (!doctype) return null;
    if (canFetch && q.data?.doc) return { json: q.data.doc as JsonValue, note: "First record: " + String(q.data.doc.name ?? ""), kind: "record" as const };
    const tpl = doctypeTemplate(schema, doctype) as JsonValue;
    if (!conn) return { json: tpl, note: "No connection: fields from the built-in schema, values empty.", kind: "template" as const };
    if (!conn.hasSecret) return { json: tpl, note: "Enter this connection's secret to load a real record. Showing empty fields.", kind: "template" as const };
    if (q.data && !q.data.doc) return { json: tpl, note: "No " + doctype + " records yet. Showing every field with an empty value.", kind: "template" as const };
    return { json: tpl, note: q.isError ? "" : "Loading the first record…", kind: "template" as const };
  }, [doctype, canFetch, q.data, q.isError, conn, schema]);

  if (!doctype || !view) return null;

  const close = () => useUi.getState().set({ previewDoctype: null });
  const text = prettyJson(view.json);

  if (hidden)
    return (
      <button className="preview-tab" onClick={() => useBoard.getState().set({ previewHidden: false })} title={"Show the " + doctype + " preview"} aria-label={"Show the " + doctype + " preview"}>
        <span>{"{ } " + doctype}</span>
      </button>
    );

  const onDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, w: width };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    // dragging the left edge leftwards makes the panel wider
    const w = Math.max(MIN_W, Math.min(maxW(), drag.current.w + drag.current.x - e.clientX));
    useBoard.getState().set({ previewWidth: Math.round(w) });
  };
  const onKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 80 : 20;
    if (e.key === "ArrowLeft") useBoard.getState().set({ previewWidth: Math.min(maxW(), width + step) });
    else if (e.key === "ArrowRight") useBoard.getState().set({ previewWidth: Math.max(MIN_W, width - step) });
    else return;
    e.preventDefault();
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); toast("JSON copied"); } catch { toast("Copy blocked by the browser"); }
  };

  return (
    <aside className="preview-panel" style={{ width }} aria-label={doctype + " preview"}>
      <div className="preview-grip" role="separator" aria-orientation="vertical" aria-label="Resize the preview panel" aria-valuenow={width} aria-valuemin={MIN_W} aria-valuemax={1100}
        tabIndex={0} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={() => { drag.current = null; }} onKeyDown={onKey} />
      <header className="flex flex-none items-center gap-1.5 border-b border-line px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-semibold">{doctype}</div>
          <div className={"truncate text-xs " + (view.kind === "record" ? "text-ok" : "text-mute")}>{view.note}</div>
        </div>
        <button className="btn btn-sm" disabled={!canFetch || q.isFetching} title="Fetch again"
          onClick={() => qc.invalidateQueries({ queryKey: qk.sample(conn!.id, doctype) })}>{q.isFetching ? <span className="spin" /> : "Refresh"}</button>
        <button className="btn btn-sm" onClick={copy}>Copy</button>
        <button className="btn btn-sm" onClick={() => useBoard.getState().set({ previewHidden: true })} title="Hide the panel (it stays one click away on the right edge)" aria-label="Hide preview">»</button>
        <button className="btn btn-sm" onClick={close} title="Close" aria-label="Close preview">✕</button>
      </header>
      {q.isError && canFetch && <div className="border-b border-line px-3 py-2 text-xs text-err">{errMsg(q.error)} Showing empty fields instead.</div>}
      <div className="min-h-0 flex-1 overflow-auto px-3 py-2">
        <pre className="out-pre"><Json text={text} /></pre>
      </div>
    </aside>
  );
}
