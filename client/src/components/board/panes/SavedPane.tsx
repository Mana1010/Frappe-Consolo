"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { scriptsApi } from "@/lib/api/endpoints";
import { errMsg } from "@/lib/api/client";
import { qk, useConnections, useMe, useScripts } from "@/lib/api/hooks";
import type { ScriptDto } from "@/lib/api/types";
import { useBoard } from "@/lib/store/board";
import { toast, useUi } from "@/lib/store/ui";
import { editorBridge } from "@/components/editor/bridge";
import { SignInPrompt } from "@/components/ui/SignInPrompt";
import { closeDrawerIfNarrow } from "../Sidebar";

export function SavedPane() {
  const { signedIn, isLoading: meLoading } = useMe();
  if (meLoading) return <div className="skeleton h-8" />;
  if (!signedIn) return <SignInPrompt what="Saved scripts live in your account. Sign in to save this script and reuse it later." reason="Sign in to save scripts." />;
  return <SavedList />;
}

function SavedList() {
  const qc = useQueryClient();
  const scripts = useScripts(true);
  const conns = useConnections().data || [];
  const [name, setName] = useState("");

  const save = useMutation({
    mutationFn: () => scriptsApi.create({
      name: name.trim() || "Script " + new Date().toLocaleTimeString(),
      code: editorBridge.getCode(),
      // temporary connections are session-only, so scripts only link to saved ones
      connectionId: conns.find(c => c.id === useBoard.getState().activeConnectionId && c.persisted)?.id ?? null,
    }),
    onSuccess: () => { setName(""); qc.invalidateQueries({ queryKey: qk.scripts }); toast("Saved"); },
    onError: e => toast(errMsg(e)),
  });
  const del = useMutation({
    mutationFn: (id: string) => scriptsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.scripts }),
    onError: e => toast(errMsg(e)),
  });

  const load = (s: ScriptDto) => {
    editorBridge.setCode(s.code);
    closeDrawerIfNarrow();
    // switch Run to the connection this script was saved with, if it still exists
    const c = s.connectionId ? conns.find(x => x.id === s.connectionId) : null;
    if (c && c.id !== useBoard.getState().activeConnectionId) { useBoard.getState().set({ activeConnectionId: c.id }); toast("Run now uses " + c.name); }
  };

  return (
    <>
      <form className="mb-2 flex gap-1.5" onSubmit={e => { e.preventDefault(); save.mutate(); }}>
        <input className="input min-w-0 flex-1" placeholder="Name this script" aria-label="Script name" value={name} maxLength={120} onChange={e => setName(e.target.value)} />
        <button className="btn" type="submit" disabled={save.isPending}>Save</button>
      </form>
      {scripts.isLoading && <div className="space-y-1.5"><div className="skeleton h-12" /><div className="skeleton h-12" /></div>}
      {scripts.isError && <div className="empty text-err">{errMsg(scripts.error)}</div>}
      {scripts.data && !scripts.data.length && <div className="empty">Nothing saved yet. Name the script and press Save.</div>}
      {scripts.data?.map(s => (
        <div key={s.id} className="mb-1.5 flex items-start gap-2 rounded-md border border-line bg-editor px-2 py-[7px]">
          <button className="min-w-0 flex-1 border-0 bg-transparent p-0 text-left" onClick={() => load(s)}>
            <b className="font-semibold break-words">{s.name}</b>
            <p className="m-0 mt-0.5 text-[12.5px] text-mute">{new Date(s.updatedAt || s.createdAt).toLocaleString()}{s.connectionName ? " · " + s.connectionName : ""}</p>
          </button>
          <button className="border-0 bg-transparent px-1 text-mute hover:text-err" aria-label={"Delete " + s.name}
            onClick={() => useUi.getState().openDialog({ t: "confirm", title: `Delete “${s.name}”?`, yes: "Delete", onYes: () => del.mutate(s.id) })}>✕</button>
        </div>
      ))}
    </>
  );
}
