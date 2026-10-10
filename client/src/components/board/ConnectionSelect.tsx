"use client";

import { useConnections } from "@/lib/api/hooks";
import { useBoard } from "@/lib/store/board";
import { toast, useUi } from "@/lib/store/ui";

/** Native <select> like the HTML: connections by name, then New / Manage entries. */
export function ConnectionSelect() {
  const { data: conns = [], isLoading, isError } = useConnections();
  const activeId = useBoard(s => s.activeConnectionId);
  const active = conns.find(c => c.id === activeId) ?? null;
  const title = active ? active.name + " as " + (active.user || "?") + (active.hasSecret ? "" : " (secret needed)") : "Choose the site Run uses";
  const placeholder = isLoading ? "Loading…" : isError ? "Server offline" : conns.length ? "Choose connection" : "No connection";
  return (
    <label className="btn inline-flex max-w-[170px] cursor-pointer items-center gap-[7px] py-0 pr-1 pl-2.5 focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-accent wide:max-w-[260px]" title={title}>
      <i className={`dot ${active?.hasSecret ? "on" : ""}`} aria-hidden="true" />
      <select aria-label="Connection used by Run" className="max-w-[140px] min-w-0 cursor-pointer truncate border-0 bg-transparent py-[5px] pr-0.5 text-[13px] outline-none wide:max-w-[230px] [&>option]:bg-panel [&>option]:text-ink"
        value={active ? active.id : ""}
        onChange={e => {
          const v = e.target.value, ui = useUi.getState();
          if (v === "__new") ui.openDialog({ t: "conn" });
          else if (v === "__manage") ui.openDialog({ t: "manage" });
          else { const c = conns.find(x => x.id === v); useBoard.getState().set({ activeConnectionId: v }); if (c) toast("Run now uses " + c.name); }
        }}>
        <option value="" hidden>{placeholder}</option>
        {conns.map(c => <option key={c.id} value={c.id}>{c.name}{c.persisted ? "" : " · temporary"}{c.writable ? " · writable" : ""}</option>)}
        <option disabled>──────────</option>
        <option value="__new">+ New connection…</option>
        {conns.length > 0 && <option value="__manage">Manage connections…</option>}
      </select>
    </label>
  );
}
