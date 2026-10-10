"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { authApi } from "@/lib/api/endpoints";
import { errMsg } from "@/lib/api/client";
import { qk, useMe } from "@/lib/api/hooks";
import { useAuthPrompt } from "@/lib/store/auth-prompt";
import { toast, useUi } from "@/lib/store/ui";

/** "Sign in" for guests; email + Sign out menu for users. */
export function AccountMenu() {
  const { user, isLoading } = useMe();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", off);
    return () => document.removeEventListener("mousedown", off);
  }, [open]);

  if (isLoading) return <span className="skeleton inline-block h-[30px] w-16" aria-hidden="true" />;
  if (!user) return <button className="btn" onClick={() => useAuthPrompt.getState().request(null)}>Sign in</button>;

  const signOut = async () => {
    setOpen(false);
    try { await authApi.logout(); } catch (e) { toast(errMsg(e)); return; }
    qc.setQueryData(qk.me, null);
    useUi.getState().set({ dryRun: null, commit: null });
    await qc.invalidateQueries();
    toast("Signed out");
  };
  return (
    <div ref={box} className="relative" onKeyDown={e => { if (e.key === "Escape") setOpen(false); }}>
      <button className="btn max-w-[180px] truncate" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)} title={user.email}>
        {user.name || user.email.split("@")[0]} ▾
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-30 mt-1 min-w-[220px] rounded-lg border border-line bg-panel p-1.5 shadow-pop">
          <div className="truncate px-2 py-1 text-xs text-mute">{user.email}</div>
          <button role="menuitem" autoFocus className="block w-full rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-sel" onClick={signOut}>Sign out</button>
        </div>
      )}
    </div>
  );
}
