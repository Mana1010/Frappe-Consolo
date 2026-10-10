"use client";

import { useEffect, useRef, useState, type ClipboardEvent, type CSSProperties, type PointerEvent as RPointerEvent } from "react";
import { formatLoose, type FormatMode } from "@/lib/output/parse";
import { useBoard } from "@/lib/store/board";
import { setNotes } from "./notes";
import { useNotesSync, type SyncState } from "./useNotesSync";

const SYNC_LABEL: Record<SyncState, string> = { local: "Saved in this browser", synced: "Synced to your account", saving: "Saving…", offline: "Server unreachable, saved in this browser" };

/** Floating, draggable, resizable scratch pad (port of the HTML notes pad). */
export function NotesPad() {
  const open = useBoard(s => s.padOpen), auto = useBoard(s => s.padAuto), rect = useBoard(s => s.padRect);
  const content = useBoard(s => s.notes?.content ?? "");
  const sync = useNotesSync();
  const [min, setMin] = useState(false);
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null);
  const pad = useRef<HTMLDivElement>(null), ta = useRef<HTMLTextAreaElement>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const pendingSel = useRef<number | null>(null);

  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 3500); return () => clearTimeout(t); }, [msg]);
  useEffect(() => { if (open) ta.current?.focus(); }, [open]);
  useEffect(() => {
    if (pendingSel.current != null && ta.current) { ta.current.setSelectionRange(pendingSel.current, pendingSel.current); pendingSel.current = null; }
  });

  if (!open) return null;

  const place = (t: string, s: number, e: number) => {
    setNotes(content.slice(0, s) + t + content.slice(e));
    pendingSel.current = s + t.length;
  };
  const run = (mode: FormatMode) => {
    const el = ta.current; if (!el) return;
    const hasSel = el.selectionEnd > el.selectionStart, s = hasSel ? el.selectionStart : 0, e = hasSel ? el.selectionEnd : content.length;
    const r = formatLoose(content.slice(s, e), mode);
    if (!r) { setMsg({ t: "Nothing to format. Select or paste an object or list.", err: true }); return; }
    if ("error" in r) { setMsg({ t: "Could not parse: " + r.error, err: true }); return; }
    place(r.text, s, e);
    setMsg({ t: mode === "compact" ? "Compacted" : mode === "table" ? "Table view" : "Formatted" });
  };
  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    if (!auto) return;
    const r = formatLoose(e.clipboardData.getData("text"));
    if (!r || "error" in r) return;
    e.preventDefault();
    place(r.text, e.currentTarget.selectionStart, e.currentTarget.selectionEnd);
    setMsg({ t: r.count > 1 ? "Formatted " + r.count + " objects" : "Formatted" });
  };
  const copy = async () => {
    const el = ta.current, t = el && el.selectionEnd > el.selectionStart ? content.slice(el.selectionStart, el.selectionEnd) : content;
    try { await navigator.clipboard.writeText(t); setMsg({ t: "Copied" }); } catch { el?.select(); setMsg({ t: "Press Ctrl+C" }); }
  };

  const save = () => {
    const r = pad.current?.getBoundingClientRect(); if (!r) return;
    useBoard.getState().set({ padRect: { left: Math.round(r.left), top: Math.round(r.top), w: Math.round(r.width), h: min ? rect?.h : Math.round(r.height) } });
  };
  const onDown = (e: RPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button,label,input")) return;
    const r = pad.current!.getBoundingClientRect();
    drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    setPos({ left: Math.min(Math.max(0, e.clientX - drag.current.dx), window.innerWidth - 80), top: Math.min(Math.max(0, e.clientY - drag.current.dy), window.innerHeight - 40) });
  };
  const onUp = () => { if (!drag.current) return; drag.current = null; save(); };

  const p = pos || (rect && rect.left < (typeof window !== "undefined" ? window.innerWidth - 80 : 9999) ? rect : null);
  const style = {
    ...(p ? { "--pad-left": p.left + "px", "--pad-top": p.top + "px", "--pad-right": "auto", "--pad-bottom": "auto" } : {}),
    ...(rect?.w ? { "--pad-w": rect.w + "px" } : {}),
    ...(rect?.h && !min ? { "--pad-h": rect.h + "px" } : {}),
  } as CSSProperties;

  return (
    <div ref={pad} role="dialog" aria-label="Notes pad" className={`pad ${min ? "min" : ""}`} style={style} onMouseUp={() => { if (!drag.current && !min) save(); }}>
      <div className="pad-h" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <b>Notes pad</b><span className="flex-1" />
        <label title="Format objects and lists when you paste them"><input type="checkbox" checked={auto} onChange={e => useBoard.getState().set({ padAuto: e.target.checked })} /> Auto-format paste</label>
        <button aria-label={min ? "Restore" : "Minimize"} title={min ? "Restore" : "Minimize"} onClick={() => setMin(m => !m)}>{min ? "□" : "−"}</button>
        <button aria-label="Close" title="Close" onClick={() => useBoard.getState().set({ padOpen: false })}>✕</button>
      </div>
      {!min && (
        <div className="flex min-h-0 flex-1 flex-col">
          <textarea ref={ta} aria-label="Notes" spellCheck={false} wrap="off" value={content} onChange={e => setNotes(e.target.value)} onPaste={onPaste}
            placeholder={"Paste an object or list here.\nJSON and console output (single quotes, None, datetime.date(...)) are formatted for you."}
            className="min-h-0 w-full flex-1 resize-none overflow-auto border-0 bg-editor px-3 py-2.5 font-mono text-[12.5px] leading-normal whitespace-pre outline-none [tab-size:2]" />
          <div className="flex flex-none flex-wrap items-center gap-[5px] border-t border-line px-2 py-1.5">
            <button className="btn btn-sm" onClick={() => run("pretty")}>Format</button>
            <button className="btn btn-sm" onClick={() => run("compact")}>Compact</button>
            <button className="btn btn-sm" onClick={() => run("table")}>Table</button>
            <button className="btn btn-sm" onClick={copy}>Copy</button>
            <button className="btn btn-sm" onClick={() => { setNotes(""); ta.current?.focus(); }}>Clear</button>
            <span role="status" className={`ml-auto max-w-[46%] truncate text-xs ${msg?.err ? "text-err" : "text-mute"}`} title={msg?.t || SYNC_LABEL[sync]}>{msg?.t || SYNC_LABEL[sync]}</span>
          </div>
        </div>
      )}
    </div>
  );
}
