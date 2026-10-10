"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { connectionsApi } from "@/lib/api/endpoints";
import { apiError } from "@/lib/api/client";
import { qk, useConnections } from "@/lib/api/hooks";
import type { ConnectionDto } from "@/lib/api/types";
import { credErr, splitToken } from "@/lib/analysis/validate";
import { toast, useUi, type RunKind } from "@/lib/store/ui";
import { DialogBar, Modal } from "@/components/ui/Modal";
import { Field } from "@/components/ui/Field";

/** Shown when the active connection has no secret (not saved and lost from server memory). */
export function SecretDialog({ id, then }: { id: string; then?: RunKind }) {
  const qc = useQueryClient();
  const conn = useConnections().data?.find(c => c.id === id);
  const [secret, setSecret] = useState(""), [show, setShow] = useState(false);
  const [err, setErr] = useState(""), [msg, setMsg] = useState<string | null>(null);
  const close = useUi.getState().closeDialog;

  const m = useMutation({
    mutationFn: () => connectionsApi.secret(id, secret.trim()),
    onSuccess: c => {
      // update the cache now so a queued run sees hasSecret immediately
      qc.setQueryData<ConnectionDto[]>(qk.connections, list => (list || []).map(x => (x.id === c.id ? c : x)));
      qc.invalidateQueries({ queryKey: qk.connections });
      toast("Secret accepted for " + c.name + (c.user ? ", connected as " + c.user : ""));
      close();
      if (then) useUi.getState().set({ queuedRun: { kind: then, nonce: Date.now() } });
    },
    onError: e => { const a = apiError(e); setMsg(a.message); if (a.fields?.apiSecret) setErr(a.fields.apiSecret); else if (/401|rejected/i.test(a.message)) setErr("Check this value. Generating new keys makes the old secret invalid."); },
  });

  return (
    <Modal title="Secret needed" onClose={close}>
      <p>
        The API secret for <b>{conn?.name || "this connection"}</b> is not available. It was kept in server memory only
        {conn?.saveSecret ? "" : " (Save the secret is off)"}, and the server has restarted since. Enter it again to continue.
      </p>
      <form noValidate onSubmit={e => {
        e.preventDefault();
        const ev = credErr(secret.trim(), "secret");
        setErr(ev);
        if (!ev) { setMsg("Testing the connection…"); m.mutate(); }
      }}>
        <Field label="API secret" error={err} after={<button type="button" className="btn" onClick={() => setShow(s => !s)} aria-pressed={show}>{show ? "Hide" : "Show"}</button>}>
          <input className={`input mono min-w-0 flex-1 ${err ? "bad" : ""}`} type={show ? "text" : "password"} autoComplete="new-password" spellCheck={false} value={secret}
            onChange={e => { const t = splitToken(e.target.value); setSecret(t ? t.secret : e.target.value); if (err) setErr(""); }} />
        </Field>
        <DialogBar msg={msg} bad={!!msg && !m.isPending}>
          <button type="button" className="btn" onClick={close}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={m.isPending}>{then ? "Use and run" : "Use secret"}</button>
        </DialogBar>
      </form>
    </Modal>
  );
}
