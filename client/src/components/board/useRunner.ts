"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { apiError } from "@/lib/api/client";
import { runsApi } from "@/lib/api/endpoints";
import { qk } from "@/lib/api/hooks";
import type { ConnectionDto, UserDto } from "@/lib/api/types";
import { useAuthPrompt } from "@/lib/store/auth-prompt";
import { useBoard } from "@/lib/store/board";
import { toast, useUi, type RunKind } from "@/lib/store/ui";
import { editorBridge } from "@/components/editor/bridge";

/** Run / Dry run / Commit, reading the latest state at call time (dialogs queue runs after they change it). */
export function useRunner() {
  const qc = useQueryClient();

  const run = useCallback(async (kind: RunKind) => {
    const ui = useUi.getState();
    if (ui.busy) return;
    const code = editorBridge.getCode();
    if (!code.trim()) { toast("Nothing to run"); return; }
    const conns = qc.getQueryData<ConnectionDto[]>(qk.connections) || [];
    const conn = conns.find(c => c.id === useBoard.getState().activeConnectionId);
    if (!conn) {
      if (conns.length) ui.openDialog({ t: "manage", note: "Choose the connection " + (kind === "dry" ? "Dry run" : "Run") + " should use, then press it again." });
      else ui.openDialog({ t: "conn", then: kind });
      return;
    }
    if (kind === "dry") {
      if (!qc.getQueryData<UserDto | null>(qk.me)) { useAuthPrompt.getState().request("Sign in to use write mode (dry run and commit).", () => useUi.getState().set({ queuedRun: { kind, nonce: Date.now() } })); return; }
      if (!conn.writable) { toast("This connection is read-only. Make it writable in Manage connections."); return; }
    }
    if (!conn.hasSecret) { ui.openDialog({ t: "secret", id: conn.id, then: kind }); return; }
    if (ui.diags.some(d => d.level === "error")) { toast("Fix the errors in Checks first"); ui.set({ dockTab: "diags" }); return; }

    const at = new Date().toLocaleTimeString();
    ui.set({ busy: kind, out: { kind: "running", label: conn.name, what: kind === "read" ? "Run" : "Dry run" }, dockTab: "out" });
    try {
      const r = kind === "read" ? await runsApi.read(conn.id, code) : await runsApi.dryRun(conn.id, code);
      if (kind === "dry") useUi.getState().set({ out: { kind: "run", run: r }, dryRun: r, commit: null, dockTab: r.status === "OK" ? "changes" : "out" });
      else useUi.getState().set({ out: { kind: "run", run: r } });
      if (r.id) qc.invalidateQueries({ queryKey: ["runs"] });
    } catch (e) {
      const a = apiError(e);
      if (a.code === "SECRET_REQUIRED") {
        qc.invalidateQueries({ queryKey: qk.connections });
        useUi.getState().set({ out: { kind: "idle" } });
        useUi.getState().openDialog({ t: "secret", id: conn.id, then: kind });
        return;
      }
      useUi.getState().set({ out: { kind: "fail", message: a.message, label: conn.name, at } });
    } finally {
      useUi.getState().set({ busy: null });
    }
  }, [qc]);

  /** Returns an error message for the Changes tab, or null on a completed request. */
  const commit = useCallback(async (confirm: string): Promise<string | null> => {
    const ui = useUi.getState(), dry = ui.dryRun;
    if (!dry?.id || ui.busy) return null;
    const at = new Date().toLocaleTimeString();
    ui.set({ busy: "commit", out: { kind: "running", label: dry.connectionName, what: "Commit" } });
    try {
      const r = await runsApi.commit(dry.id, confirm);
      useUi.getState().set({ commit: r, out: { kind: "run", run: r }, dryRun: { ...dry, committedRunId: r.id } });
      qc.invalidateQueries({ queryKey: ["runs"] });
      return null;
    } catch (e) {
      const a = apiError(e);
      useUi.getState().set({ out: { kind: "fail", message: a.message, label: dry.connectionName, at } });
      return a.message;
    } finally {
      useUi.getState().set({ busy: null });
    }
  }, [qc]);

  return { run, commit };
}
