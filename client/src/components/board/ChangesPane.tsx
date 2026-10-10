"use client";

import { useEffect, useState } from "react";
import { useActiveConnection, useMe } from "@/lib/api/hooks";
import { useUi } from "@/lib/store/ui";
import { editorBridge } from "@/components/editor/bridge";
import { AccountingWarning, PlanTable, touchesAccounting } from "@/components/run/PlanTable";
import { SignInPrompt } from "@/components/ui/SignInPrompt";
import { useRunner } from "./useRunner";

const FIFTEEN_MIN = 15 * 60_000;

function CommitResult() {
  const c = useUi(s => s.commit);
  if (!c) return null;
  if (c.status === "OK") return <div className="mt-2 rounded-md border border-ok px-2.5 py-1.5 text-[12.5px] text-ok">Applied {c.changeCount ?? c.plan?.length ?? 0} change{c.changeCount === 1 ? "" : "s"} to {c.connectionName}. Committed.</div>;
  const why = c.status === "ABORTED" ? c.error : c.status === "ERROR" ? "The script raised an error, so nothing was written. See Output." : c.error || "The commit request failed. See Output.";
  return <div className="mt-2 rounded-md border border-err px-2.5 py-1.5 text-[12.5px] text-err">Not committed. {why} Run the dry run again to retry.</div>;
}

export function ChangesPane() {
  const { signedIn } = useMe();
  const conn = useActiveConnection();
  const dry = useUi(s => s.dryRun), busy = useUi(s => s.busy);
  const { commit } = useRunner();
  const [confirm, setConfirm] = useState(""), [err, setErr] = useState<string | null>(null);
  // re-render every 30 s so the 15-minute commit window is reflected
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);

  if (!signedIn) return <SignInPrompt what="Write mode needs an account: dry run, review the planned changes, then commit." reason="Sign in to use write mode (dry run and commit)." />;
  if (!dry) return (
    <div className="empty">
      {conn?.writable
        ? <>Write a script that calls <code>set_value(...)</code> or <code>update_doc(...)</code>, then press <b>Dry run changes</b>. Nothing is written until you confirm here.</>
        : <>Write mode needs a writable connection. Mark a saved connection Writable in Manage connections.</>}
    </div>
  );
  if (dry.status !== "OK") return <div className="empty">The dry run did not finish ({dry.status.toLowerCase()}), so there is nothing to commit. See Output.</div>;
  const plan = dry.plan || [];
  if (!plan.length) return <div className="empty">Nothing would change.</div>;

  const n = String(dry.changeCount ?? plan.length);
  const expired = now - new Date(dry.createdAt).getTime() > FIFTEEN_MIN;
  const changedSince = editorBridge.getCode() !== dry.code;
  const done = !!dry.committedRunId;
  const ok = confirm === n || confirm === "COMMIT";

  return (
    <div>
      {touchesAccounting(plan) && <AccountingWarning />}
      <PlanTable plan={plan} />
      {changedSince && !done && <p className="mt-1.5 mb-0 text-xs text-warn">The editor changed since this dry run. Commit applies the code of the dry run, not the editor.</p>}
      {!done && (
        expired ? <p className="mt-2 text-[12.5px] text-warn">This dry run is older than 15 minutes. Run it again before committing.</p> : (
          <form className="mt-2 flex flex-wrap items-center gap-1.5" onSubmit={async e => {
            e.preventDefault();
            if (!ok) return;
            setErr(null);
            const m = await commit(confirm);
            if (m) setErr(m); else setConfirm("");
          }}>
            <label htmlFor="commit-confirm" className="w-full text-[12.5px] text-ink">Type <b>{n}</b> (the number of changes) or <b>COMMIT</b> to write them to <b>{dry.connectionName}</b></label>
            <input id="commit-confirm" className="input mono max-w-40" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="off" spellCheck={false} />
            <button type="submit" className="btn btn-danger-solid" disabled={!ok || !!busy}>{busy === "commit" ? "Committing…" : "Commit"}</button>
            {err && <span role="alert" className="text-[12.5px] text-err">{err}</span>}
          </form>
        )
      )}
      <CommitResult />
    </div>
  );
}
