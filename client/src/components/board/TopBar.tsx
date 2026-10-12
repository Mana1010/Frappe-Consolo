"use client";

import Link from "next/link";
import { useActiveConnection, useMe } from "@/lib/api/hooks";
import { useBoard } from "@/lib/store/board";
import { toast, useUi } from "@/lib/store/ui";
import { editorBridge } from "@/components/editor/bridge";
import { AccountMenu } from "@/components/AccountMenu";
import { ConnectionSelect } from "./ConnectionSelect";

export function Brand() {
  return (
    <div className="flex items-center gap-[9px]">
      <span className="grid h-[22px] w-[22px] place-items-center rounded-md bg-accent font-mono text-xs font-semibold text-accent-ink" aria-hidden="true">py</span>
      <h1 className="m-0 text-[15px] font-semibold tracking-[.1px]">Frappe script board</h1>
    </div>
  );
}

export function toggleTheme() {
  const dark = document.documentElement.dataset.theme === "dark";
  useBoard.getState().set({ theme: dark ? "light" : "dark" });
}

export function TopBar({ onRun }: { onRun: (k: "read" | "dry") => void }) {
  const conn = useActiveConnection();
  const { signedIn } = useMe();
  const busy = useUi(s => s.busy);
  const ui = useUi.getState;

  const copy = async () => {
    try { await navigator.clipboard.writeText(editorBridge.getCode()); toast("Script copied"); } catch { toast("Select the text and press Ctrl+C"); }
  };
  const format = () => {
    const n = editorBridge.format();
    toast(n ? "Formatted " + n + " line" + (n === 1 ? "" : "s") + " (Ctrl+Z to undo)" : "Indentation already looks good");
    editorBridge.focus();
  };
  const clear = () => {
    const go = () => { editorBridge.setCode(""); };
    if (!editorBridge.getCode().trim()) go(); else ui().openDialog({ t: "confirm", title: "Clear the editor?", yes: "Clear", onYes: go });
  };

  return (
    <header className="flex flex-wrap items-center gap-x-3.5 gap-y-2 border-b border-line bg-panel px-3.5 py-[9px]">
      <Brand />
      <p className="m-0 hidden flex-[1_1_260px] text-[12.5px] text-mute wide:block">Run executes read-only queries on your connected site. Changes are always rolled back.</p>
      <nav aria-label="Board actions" className="flex flex-wrap items-center gap-1.5">
        <button className="btn wide:hidden" aria-controls="side" aria-expanded={useUi(s => s.sidebarOpen)} onClick={() => ui().set({ sidebarOpen: !ui().sidebarOpen })}>Panel</button>
        <button className="btn" aria-pressed={useBoard(s => s.padOpen)} onClick={() => useBoard.getState().set({ padOpen: !useBoard.getState().padOpen })}>Notes pad</button>
        <Link className="btn" href="/history">History</Link>
        <button className="btn" onClick={() => ui().openDialog({ t: "help" })}>Help</button>
        <button className="btn" onClick={toggleTheme}>Theme</button>
        <button className="btn" onClick={clear}>Clear</button>
        <button className="btn" onClick={format} title="Fix indentation: 4 spaces per level, tabs to spaces (Shift+Alt+F)">Format</button>
        <button className="btn" onClick={copy}>Copy script</button>
        <ConnectionSelect />
        <button className="btn btn-primary" disabled={!!busy} onClick={() => onRun("read")} title="Run on the connected site (Ctrl+Enter)">{busy === "read" ? "Running…" : "Run"}</button>
        {conn?.writable && signedIn && (
          <button className="btn btn-warn" disabled={!!busy} onClick={() => onRun("dry")} title="Run with set_value/update_doc recorded, then review the changes before committing">
            {busy === "dry" ? "Dry run…" : "Dry run changes"}
          </button>
        )}
        <AccountMenu />
      </nav>
    </header>
  );
}
