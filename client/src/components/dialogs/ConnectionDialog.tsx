"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { connectionsApi } from "@/lib/api/endpoints";
import { apiError } from "@/lib/api/client";
import { qk, useConnections, useMe } from "@/lib/api/hooks";
import type { ConnectionDto, ConnectionPatch } from "@/lib/api/types";
import { credErr, nameErr, normUrl, splitToken } from "@/lib/analysis/validate";
import { useBoard } from "@/lib/store/board";
import { toast, useUi, type RunKind } from "@/lib/store/ui";
import { DialogBar, Modal } from "@/components/ui/Modal";
import { Field } from "@/components/ui/Field";

const LOCKED = "🔒 Encrypted and hidden. Leave blank to keep the current value.";
const SAVED_TOAST = "Saved. URL, key and secret are encrypted and can't be viewed again.";

const hostOf = (url: string) => { try { return new URL(url).host; } catch { return url; } };
const versionLine = (c: ConnectionDto) => (c.user ? " Connected as " + c.user : "") + (c.frappeVersion ? " · Frappe " + c.frappeVersion : "");

type Errs = { name?: string; url?: string; apiKey?: string; apiSecret?: string };

export function ConnectionDialog({ id, back, then }: { id?: string | null; back?: boolean; then?: RunKind }) {
  const qc = useQueryClient();
  const { signedIn } = useMe();
  const conns = useConnections().data || [];
  const old = id ? conns.find(c => c.id === id) ?? null : null;
  const editing = !!old;

  const [name, setName] = useState(old?.name || ""), [nameTyped, setNameTyped] = useState(false);
  const [url, setUrl] = useState(""), [key, setKey] = useState(""), [secret, setSecret] = useState("");
  const [show, setShow] = useState(false), [saveSecret, setSaveSecret] = useState(old ? old.saveSecret : true);
  const [errs, setErrs] = useState<Errs>({});
  const [msg, setMsg] = useState<{ t: string; bad?: boolean } | null>(old && !old.hasSecret ? { t: "Enter the secret again. It was kept in server memory only." } : null);

  const close = () => (back ? useUi.getState().openDialog({ t: "manage" }) : useUi.getState().closeDialog());
  const setErr = (k: keyof Errs, v: string) => setErrs(e => ({ ...e, [k]: v }));

  // On edit, blank url/key/secret keep the stored (encrypted) values, so only filled fields are checked.
  const vName = (v = name) => nameErr(v, conns, id);
  const vUrl = (v = url) => (editing && !v.trim() ? "" : normUrl(v).err || "");
  const vKey = (v = key) => (editing && !v.trim() ? "" : credErr(v.trim(), "key"));
  const vSec = (v = secret, k = key) => {
    if (editing && !v.trim()) return "";
    const e = credErr(v.trim(), "secret");
    return !e && v.trim() === k.trim() ? "The secret is the same as the key. They are two different values." : e;
  };

  const onToken = (v: string, field: "key" | "secret") => {
    const t = splitToken(v);
    if (t) {
      setKey(t.key); setSecret(t.secret);
      setMsg({ t: "Split the pasted token into key and secret." });
      setErrs(e => ({ ...e, apiKey: e.apiKey ? vKey(t.key) : "", apiSecret: e.apiSecret ? vSec(t.secret, t.key) : "" }));
      return;
    }
    if (field === "key") { setKey(v); if (errs.apiKey) setErr("apiKey", vKey(v)); }
    else { setSecret(v); if (errs.apiSecret) setErr("apiSecret", vSec(v)); }
  };

  const done = (c: ConnectionDto, temporary: boolean) => {
    qc.setQueryData<ConnectionDto[]>(qk.connections, list => {
      const rest = (list || []).filter(x => x.id !== c.id);
      return [...rest, c];
    });
    qc.invalidateQueries({ queryKey: qk.connections });
    qc.invalidateQueries({ queryKey: qk.schema(c.id) });
    useBoard.getState().set({ activeConnectionId: c.id });
    toast((temporary ? "Using " + c.name + " (temporary)." : SAVED_TOAST) + versionLine(c));
    if (back) useUi.getState().openDialog({ t: "manage" }); else useUi.getState().closeDialog();
    if (then) useUi.getState().set({ queuedRun: { kind: then, nonce: Date.now() } });
  };

  const save = useMutation({
    mutationFn: async (temporary: boolean) => {
      const n = name.trim() || (normUrl(url).url ? hostOf(normUrl(url).url as string) : "");
      if (!old) return connectionsApi.create({ name: n, url: normUrl(url).url as string, apiKey: key.trim(), apiSecret: secret.trim(), saveSecret, ...(temporary ? { temporary: true } : {}) });
      const patch: ConnectionPatch = {};
      if (n !== old.name) patch.name = n;
      if (url.trim()) patch.url = normUrl(url).url;
      if (key.trim()) patch.apiKey = key.trim();
      if (secret.trim()) patch.apiSecret = secret.trim();
      if (saveSecret !== old.saveSecret) patch.saveSecret = saveSecret;
      const creds = !!(patch.url || patch.apiKey || patch.apiSecret);
      let c = Object.keys(patch).length ? await connectionsApi.update(old.id, patch) : old;
      // nothing credential-related changed: "Test and save" still re-tests the stored values
      if (!creds) c = await connectionsApi.test(old.id);
      return c;
    },
    onSuccess: (c, temporary) => done(c, temporary),
    onError: e => {
      const a = apiError(e);
      const f: Errs = { ...(a.fields as Errs | undefined) };
      if (/\b401\b|rejected the API key/i.test(a.message)) { f.apiKey ||= "Check this value."; f.apiSecret ||= "Check this value. Generating new keys makes the old secret invalid."; }
      if (/could not reach|\b404\b|endpoint not found/i.test(a.message)) f.url ||= "Check the URL.";
      if (/already saved/i.test(a.message)) f.apiKey ||= "This key on this site is already saved.";
      setErrs(x => ({ ...x, ...f }));
      setMsg({ t: a.message, bad: true });
    },
  });

  const submit = (temporary: boolean) => {
    let n = name;
    if (!n.trim() && !vUrl() && url.trim()) { n = hostOf(normUrl(url).url as string); setName(n); }
    const next: Errs = { name: vName(n), url: vUrl(), apiKey: vKey(), apiSecret: vSec() };
    setErrs(next);
    if (Object.values(next).some(Boolean)) { setMsg({ t: "Fix the fields marked in red.", bad: true }); return; }
    setMsg({ t: "Testing the connection…" });
    save.mutate(temporary);
  };

  const guestNew = !signedIn && !editing;
  return (
    <Modal title={editing ? "Edit connection" : "New connection"} onClose={close}>
      <p>Run sends your script through the board&apos;s server to the site&apos;s System Console, as the user who owns the API key. Only read-only queries are sent, and the changes are always rolled back.</p>
      <form onSubmit={e => { e.preventDefault(); submit(guestNew); }} noValidate>
        <Field label="Name" error={errs.name}>
          <input className={`input mono ${errs.name ? "bad" : ""}`} placeholder="e.g. Sandbox, UAT, Live (read-only)" maxLength={40} autoComplete="off" spellCheck={false} value={name}
            onChange={e => { setName(e.target.value); setNameTyped(true); if (errs.name) setErr("name", vName(e.target.value)); }}
            onBlur={() => name.trim() && setErr("name", vName())} data-autofocus={!old || undefined} />
        </Field>
        <Field label="Site URL" error={errs.url} note={editing ? LOCKED : undefined}>
          <input className={`input mono ${errs.url ? "bad" : ""}`} placeholder={editing ? "Leave blank to keep" : "http://localhost:8000"} autoComplete="off" spellCheck={false} value={url}
            onChange={e => { setUrl(e.target.value); if (errs.url) setErr("url", vUrl(e.target.value)); }}
            onBlur={() => {
              if (!url.trim()) return;
              const e = vUrl();
              setErr("url", e);
              // suggest a name from the host until the user types one
              if (!e && !name.trim() && !nameTyped) { const n = hostOf(normUrl(url).url as string); setName(n); setErr("name", vName(n)); }
            }} />
        </Field>
        <Field label="API key" error={errs.apiKey} note={editing ? LOCKED : undefined}>
          <input className={`input mono ${errs.apiKey ? "bad" : ""}`} placeholder={editing ? "Leave blank to keep" : "15 characters, or paste: token key:secret"} autoComplete="off" spellCheck={false} value={key}
            onChange={e => onToken(e.target.value, "key")} onBlur={() => key.trim() && setErr("apiKey", vKey())} />
        </Field>
        <Field label="API secret" error={errs.apiSecret} note={editing ? LOCKED : undefined}
          after={<button className="btn" type="button" onClick={() => setShow(s => !s)} aria-pressed={show}>{show ? "Hide" : "Show"}</button>}>
          <input className={`input mono min-w-0 flex-1 ${errs.apiSecret ? "bad" : ""}`} type={show ? "text" : "password"} placeholder={editing ? "Leave blank to keep" : undefined} autoComplete="new-password" spellCheck={false} value={secret}
            onChange={e => onToken(e.target.value, "secret")} onBlur={() => secret.trim() && setErr("apiSecret", vSec())} />
        </Field>
        <label className="mt-0.5 flex items-center gap-[7px] text-[13px] text-mute">
          <input type="checkbox" checked={saveSecret} onChange={e => setSaveSecret(e.target.checked)} />
          Save the secret (encrypted). Untick to keep it in server memory only; you type it again after a server restart.
        </label>
        <details className="howto mt-2.5 text-[13px]" open={!conns.length}>
          <summary className="cursor-pointer font-medium">Setup steps</summary>
          <ol>
            <li>In Desk open the user record (User list → the user) → <b>API Access</b> → <b>Generate Keys</b>. Copy the secret straight away, because it is shown only once.</li>
            <li>That user needs the <b>System Manager</b> role.</li>
            <li>v14 and later only: <code>bench set-config -g server_script_enabled 1</code></li>
            <li>Frappe&apos;s header format is <code>token API_KEY:API_SECRET</code>, key first. You can paste that whole line into the API key field.</li>
          </ol>
        </details>
        {guestNew && <p className="mt-2 text-[12.5px]">You are not signed in. <b>Test and use</b> keeps this connection for this browser session only (it disappears after 12 hours idle or a server restart).</p>}
        <DialogBar msg={msg?.t} bad={msg?.bad}>
          <button type="button" className="btn" onClick={close}>{back ? "Back" : "Cancel"}</button>
          {guestNew ? (
            <>
              <button type="button" className="btn" disabled={save.isPending} onClick={() => submit(false)}>Save to my account</button>
              <button type="submit" className="btn btn-primary" disabled={save.isPending}>Test and use</button>
            </>
          ) : (
            <button type="submit" className="btn btn-primary" disabled={save.isPending}>Test and save</button>
          )}
        </DialogBar>
      </form>
    </Modal>
  );
}
