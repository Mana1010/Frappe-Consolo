"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { connectionsApi } from "@/lib/api/endpoints";
import { errMsg } from "@/lib/api/client";
import { qk, useActiveConnection, useEffectiveSchema, useSchemaQuery } from "@/lib/api/hooks";
import { toast } from "@/lib/store/ui";
import { editorBridge } from "@/components/editor/bridge";
import { closeDrawerIfNarrow } from "../Sidebar";

const MAX_LIST = 150;

export function SchemaPane() {
  const qc = useQueryClient();
  const conn = useActiveConnection();
  const { schema, live } = useEffectiveSchema();
  const sq = useSchemaQuery(conn?.id);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());

  const sync = useMutation({
    mutationFn: () => connectionsApi.syncSchema(conn!.id),
    onSuccess: s => { qc.setQueryData(qk.schema(conn!.id), s); toast("Schema synced: " + s.doctypeCount + " doctypes"); },
    onError: e => toast(errMsg(e)),
  });

  const rows = useMemo(() => {
    const ql = q.trim().toLowerCase(), out: { t: string; cols: string[]; all: number; istable?: boolean }[] = [];
    for (const t of Object.keys(schema).sort()) {
      const all = schema[t].cols, tm = t.toLowerCase().includes(ql), cs = ql && !tm ? all.filter(c => c.includes(ql)) : all;
      if (ql && !tm && !cs.length) continue;
      out.push({ t, cols: cs, all: all.length, istable: schema[t].istable });
    }
    return out;
  }, [schema, q]);

  const searching = !!q.trim();
  return (
    <>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <button className="btn btn-sm" disabled={!conn || sync.isPending} onClick={() => sync.mutate()} title={conn ? "Read all doctypes and fields from " + conn.name : "Choose a connection first"}>
          {sync.isPending ? <><span className="spin" />Syncing…</> : "Sync schema"}
        </button>
        <span className="min-w-0 flex-1 text-xs text-mute">
          {sq.isLoading ? "Loading schema…" : live ? <>Synced {new Date(live.syncedAt).toLocaleString()} · {live.doctypeCount} doctypes</> : <>Built-in sample ({Object.keys(schema).length} doctypes). Sync to load your site&apos;s schema.</>}
        </span>
      </div>
      <input className="input mb-2" placeholder="Search tables and columns" aria-label="Search schema" value={q} onChange={e => setQ(e.target.value)} />
      {sq.isLoading && <div className="space-y-1.5"><div className="skeleton h-5" /><div className="skeleton h-5 w-4/5" /><div className="skeleton h-5 w-3/5" /></div>}
      {!rows.length && <div className="empty">No match.</div>}
      {rows.slice(0, MAX_LIST).map(r => {
        const isOpen = (searching && rows.length <= 30) || open.has(r.t);
        return (
          <details key={r.t} className="mb-1" open={isOpen} onToggle={e => {
            const o = (e.currentTarget as HTMLDetailsElement).open;
            setOpen(s => { if (o === s.has(r.t)) return s; const n = new Set(s); if (o) n.add(r.t); else n.delete(r.t); return n; });
          }}>
            <summary className="cursor-pointer px-0.5 py-1 font-medium">{r.t}<small className="ml-1 font-normal text-mute">{r.all}{r.istable ? " · child" : ""}</small></summary>
            {isOpen && (
              <div className="flex flex-wrap gap-[3px] pb-2 pl-3.5">
                {r.cols.map(c => (
                  <button key={c} className="chip" title={schema[r.t].types?.[c]} onClick={() => { editorBridge.insertText(c); closeDrawerIfNarrow(); }}>{c}</button>
                ))}
              </div>
            )}
          </details>
        );
      })}
      {rows.length > MAX_LIST && <div className="empty">Showing {MAX_LIST} of {rows.length}. Refine the search.</div>}
    </>
  );
}
