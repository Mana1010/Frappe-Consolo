"use client";

import Link from "next/link";
import { useState } from "react";
import { errMsg } from "@/lib/api/client";
import { useConnections, useMe, useRuns } from "@/lib/api/hooks";
import type { RunFilters, RunMode, RunStatus } from "@/lib/api/types";
import { AccountMenu } from "@/components/AccountMenu";
import { Brand, toggleTheme } from "@/components/board/TopBar";
import { fmtMs } from "@/components/run/OutputView";
import { ServerBanner } from "@/components/ui/ServerBanner";
import { SignInPrompt } from "@/components/ui/SignInPrompt";
import { MODES, ModeBadge, STATUSES, StatusBadge, modeLabel } from "./badges";
import { RunDrawer } from "./RunDrawer";

export function HistoryPage() {
  const { signedIn, isLoading } = useMe();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex flex-wrap items-center gap-x-3.5 gap-y-2 border-b border-line bg-panel px-3.5 py-2.25">
        <Brand />
        <p className="m-0 hidden flex-[1_1_260px] text-[12.5px] text-mute wide:block">
          Run history: every Run, Dry run and Commit made from your account.
        </p>
        <nav
          aria-label="History actions"
          className="ml-auto flex flex-wrap items-center gap-1.5"
        >
          <Link className="btn" href="/">
            ← Board
          </Link>
          <button className="btn" onClick={toggleTheme}>
            Theme
          </button>
          <AccountMenu />
        </nav>
      </header>
      <ServerBanner />
      <main className="mx-auto w-full max-w-300 flex-1 px-3.5 py-4">
        <h2 className="mt-0 mb-3 text-lg font-semibold">History</h2>
        {isLoading ? (
          <div className="skeleton h-24" />
        ) : signedIn ? (
          <RunList />
        ) : (
          <SignInPrompt
            what="Run history is kept in your account. Sign in to see past runs, dry runs and commits. Runs made without an account are not stored."
            reason="Sign in to see your run history."
          />
        )}
      </main>
    </div>
  );
}

function RunList() {
  const [f, setF] = useState<RunFilters>({
    connectionId: "",
    mode: "",
    status: "",
  });
  const [openId, setOpenId] = useState<string | null>(null);
  const conns = useConnections().data || [];
  const q = useRuns(f, true);
  const items = q.data?.pages.flatMap((p) => p.items) || [];

  const sel = "input w-auto min-w-0 max-w-full py-1 text-[13px]";
  return (
    <>
      <div
        className="mb-3 flex flex-wrap items-end gap-2"
        role="group"
        aria-label="Filters"
      >
        <label className="flex flex-col text-xs text-mute">
          Connection
          <select
            className={sel}
            value={f.connectionId}
            onChange={(e) => setF({ ...f, connectionId: e.target.value })}
          >
            <option value="">All connections</option>
            {conns
              .filter((c) => c.persisted)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>
        <label className="flex flex-col text-xs text-mute">
          Mode
          <select
            className={sel}
            value={f.mode}
            onChange={(e) =>
              setF({ ...f, mode: e.target.value as RunMode | "" })
            }
          >
            <option value="">All modes</option>
            {MODES.map((m) => (
              <option key={m} value={m}>
                {modeLabel(m)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-xs text-mute">
          Status
          <select
            className={sel}
            value={f.status}
            onChange={(e) =>
              setF({ ...f, status: e.target.value as RunStatus | "" })
            }
          >
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.toLowerCase()}
              </option>
            ))}
          </select>
        </label>
        {(f.connectionId || f.mode || f.status) && (
          <button
            className="btn btn-sm mb-0.5"
            onClick={() => setF({ connectionId: "", mode: "", status: "" })}
          >
            Reset
          </button>
        )}
      </div>

      {q.isLoading && (
        <div className="space-y-1.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton h-9" />
          ))}
        </div>
      )}
      {q.isError && <div className="empty text-err">{errMsg(q.error)}</div>}
      {q.isSuccess && !items.length && (
        <div className="empty">
          No runs yet
          {f.connectionId || f.mode || f.status ? " for these filters" : ""}.
          Runs from the board show up here.
        </div>
      )}

      {items.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-line bg-editor">
          <table className="ptable min-w-[720px]">
            <thead>
              <tr>
                <th className="pl-3">Time</th>
                <th>Connection</th>
                <th>Mode</th>
                <th>Status</th>
                <th>Duration</th>
                <th>Changes</th>
                <th>Code</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr
                  key={r.id}
                  className="cursor-pointer hover:bg-sel"
                  onClick={() => setOpenId(r.id)}
                >
                  <td className="pl-3 whitespace-nowrap">
                    <button
                      className="border-0 bg-transparent p-0 text-left underline-offset-2 hover:underline"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenId(r.id);
                      }}
                    >
                      {new Date(r.createdAt).toLocaleString()}
                    </button>
                  </td>
                  <td className="whitespace-nowrap">{r.connectionName}</td>
                  <td>
                    <ModeBadge mode={r.mode} />
                  </td>
                  <td>
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="whitespace-nowrap text-mute">
                    {fmtMs(r.durationMs)}
                  </td>
                  <td className="text-mute">{r.changeCount ?? ""}</td>
                  <td
                    className="mono max-w-[360px] truncate text-mute"
                    title={r.codePreview}
                  >
                    {(r.codePreview || r.code || "").replace(/\s+/g, " ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {q.hasNextPage && (
        <div className="mt-3 text-center">
          <button
            className="btn"
            disabled={q.isFetchingNextPage}
            onClick={() => q.fetchNextPage()}
          >
            {q.isFetchingNextPage ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
      {openId && <RunDrawer id={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}
