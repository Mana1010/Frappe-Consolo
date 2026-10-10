"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { connectionsApi } from "@/lib/api/endpoints";
import { errMsg } from "@/lib/api/client";
import { qk, useConnections, useMe } from "@/lib/api/hooks";
import type { ConnectionDto, ConnectionPatch } from "@/lib/api/types";
import { nameErr } from "@/lib/analysis/validate";
import { useAuthPrompt } from "@/lib/store/auth-prompt";
import { useBoard } from "@/lib/store/board";
import { toast, useUi } from "@/lib/store/ui";
import { DialogBar, Modal } from "@/components/ui/Modal";

const DEFAULT_NOTE = "Pick the connection Run uses. Click a name to rename it. Saved scripts remember the connection they were saved with.";

export function ManageDialog({ note }: { note?: string }) {
  const { data: conns = [], isLoading } = useConnections();
  const { signedIn } = useMe();
  const temp = conns.filter(c => !c.persisted), saved = conns.filter(c => c.persisted);
  const ui = useUi.getState();
  return (
    <Modal title="Connections" onClose={ui.closeDialog} wide>
      <p>{note || DEFAULT_NOTE} Name them by what they point at, for example <i>Sandbox</i>, <i>UAT</i> or <i>Live (read-only)</i>.</p>
      {isLoading && <div className="skeleton mt-2 h-14" />}
      {!isLoading && !conns.length && <div className="empty">No connections yet.</div>}
      {temp.length > 0 && (
        <section aria-label="Temporary connections">
          <h3 className="mt-3 text-[12.5px] font-semibold text-mute">Temporary <span className="font-normal">· this browser only, gone after 12 h idle or a server restart</span></h3>
          {temp.map(c => <ConnRow key={c.id + c.name} c={c} all={conns} signedIn={signedIn} />)}
        </section>
      )}
      {(saved.length > 0 || signedIn) && (
        <section aria-label="Saved connections">
          <h3 className="mt-3 text-[12.5px] font-semibold text-mute">Saved <span className="font-normal">· in your account, URL, key and secret encrypted</span></h3>
          {saved.map(c => <ConnRow key={c.id + c.name} c={c} all={conns} signedIn={signedIn} />)}
          {!saved.length && <div className="empty">Nothing saved yet. Use “Save to my account” on a temporary connection, or create a new one.</div>}
        </section>
      )}
      {!signedIn && (
        <p className="mt-3 text-[12.5px]">
          Sign in to save connections, scripts and run history, and to use write mode.{" "}
          <button className="btn btn-sm" onClick={() => useAuthPrompt.getState().request("Sign in to save connections to your account.")}>Sign in</button>
        </p>
      )}
      <DialogBar>
        <button className="btn" onClick={() => ui.openDialog({ t: "conn", back: true })}>New connection</button>
        <button className="btn btn-primary" onClick={ui.closeDialog}>Done</button>
      </DialogBar>
    </Modal>
  );
}

function ConnRow({ c, all, signedIn }: { c: ConnectionDto; all: ConnectionDto[]; signedIn: boolean }) {
  const qc = useQueryClient();
  const activeId = useBoard(s => s.activeConnectionId);
  const [name, setName] = useState(c.name), [err, setErr] = useState("");
  const [armed, setArmed] = useState(false), [confirmW, setConfirmW] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const refresh = () => qc.invalidateQueries({ queryKey: qk.connections });
  const patch = useMutation({
    mutationFn: (p: ConnectionPatch) => connectionsApi.update(c.id, p),
    onSuccess: (n, p) => {
      refresh();
      if (p.name) toast("Renamed to " + n.name);
      if (p.writable === true) { toast(n.name + " is writable. Dry run changes is now in the top bar."); setConfirmW(null); }
      if (p.writable === false) toast(n.name + " is read-only again.");
    },
    onError: (e, p) => { if (p.name) { setErr(errMsg(e)); setName(c.name); } else toast(errMsg(e)); },
  });
  const del = useMutation({
    mutationFn: () => connectionsApi.remove(c.id),
    onSuccess: () => {
      if (activeId === c.id) useBoard.getState().set({ activeConnectionId: null });
      refresh();
      toast("Deleted " + c.name);
    },
    onError: e => toast(errMsg(e)),
  });
  const persist = useMutation({
    mutationFn: () => connectionsApi.persist(c.id),
    onSuccess: n => {
      // persisting returns a new id
      if (useBoard.getState().activeConnectionId === c.id) useBoard.getState().set({ activeConnectionId: n.id });
      refresh();
      toast("Saved " + n.name + " to your account. URL, key and secret are encrypted and can't be viewed again.");
    },
    onError: e => toast(errMsg(e)),
  });

  const commitName = () => {
    const e = nameErr(name, all, c.id);
    setErr(e);
    if (e || name.trim() === c.name) return;
    patch.mutate({ name: name.trim() });
  };
  const use = () => { useBoard.getState().set({ activeConnectionId: c.id }); toast("Run now uses " + c.name); };
  const secret = c.hasSecret ? (c.saveSecret ? "secret saved" : "secret in server memory") : null;
  const on = c.id === activeId;

  return (
    <div className={`mt-[7px] rounded-lg border bg-editor p-2 ${on ? "border-accent" : "border-line"}`}>
      <div className="flex flex-wrap items-start gap-2">
        <input type="radio" name="cuse" className="mt-2 flex-none accent-(--accent)" checked={on} onChange={use} aria-label={"Use " + c.name} />
        <div className="min-w-0 flex-1 basis-48">
          <input className={`w-full rounded-[5px] border bg-transparent px-1.5 py-[3px] text-[13.5px] font-semibold hover:border-line focus:border-accent focus:bg-panel focus:outline-none ${err ? "border-err" : "border-transparent"}`}
            value={name} maxLength={40} aria-label="Connection name" spellCheck={false}
            onChange={e => { setName(e.target.value); if (err) setErr(nameErr(e.target.value, all, c.id)); }}
            onBlur={commitName}
            onKeyDown={e => {
              if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
              if (e.key === "Escape") { e.preventDefault(); setName(c.name); setErr(""); requestAnimationFrame(() => (e.target as HTMLInputElement).blur()); }
            }} />
          <small className="block truncate px-[7px] text-xs text-mute">
            {(c.user || "?") + " · " + (c.frappeVersion ? "Frappe " + c.frappeVersion : "version unknown") + " · "}
            {secret ? secret : <span className="text-warn">secret needed</span>}
            {c.writable && <> · <span className="text-warn">writable</span></>}
          </small>
          {err && <small className="block px-[7px] text-xs text-err">{err}</small>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {!c.persisted && <button className="btn btn-sm" disabled={persist.isPending} onClick={() => persist.mutate()}>Save to my account</button>}
          <button className="btn btn-sm" onClick={() => useUi.getState().openDialog({ t: "conn", id: c.id, back: true })}>Edit</button>
          <button className={`btn btn-sm ${armed ? "btn-danger" : ""}`} disabled={del.isPending}
            onClick={() => {
              if (!armed) { setArmed(true); timer.current = setTimeout(() => setArmed(false), 4000); return; }
              del.mutate();
            }}>{armed ? "Confirm delete" : "Delete"}</button>
        </div>
      </div>
      {c.persisted && signedIn && (
        <div className="mt-1.5 pl-7">
          <label className="flex items-center gap-2 text-[12.5px] text-mute">
            <input type="checkbox" role="switch" checked={c.writable || confirmW !== null} disabled={patch.isPending}
              onChange={e => { if (e.target.checked) setConfirmW(""); else if (confirmW !== null) setConfirmW(null); else patch.mutate({ writable: false }); }} />
            Writable — allow <b className="!text-ink">Dry run changes</b> and Commit on this connection
          </label>
          {confirmW !== null && !c.writable && (
            <form className="mt-1.5 flex flex-wrap items-center gap-1.5" onSubmit={e => { e.preventDefault(); if (confirmW === c.name) patch.mutate({ writable: true, confirmName: confirmW }); }}>
              <label className="w-full text-[12.5px] text-ink" htmlFor={"cw-" + c.id}>Type <b>{c.name}</b> to confirm. Commits on this site write real data.</label>
              <input id={"cw-" + c.id} className="input mono max-w-64 flex-1" value={confirmW} autoComplete="off" spellCheck={false} autoFocus
                onChange={e => setConfirmW(e.target.value)} onKeyDown={e => { if (e.key === "Escape") { e.preventDefault(); setConfirmW(null); } }} />
              <button type="submit" className="btn btn-sm btn-danger" disabled={confirmW !== c.name || patch.isPending}>Make writable</button>
              <button type="button" className="btn btn-sm" onClick={() => setConfirmW(null)}>Cancel</button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
