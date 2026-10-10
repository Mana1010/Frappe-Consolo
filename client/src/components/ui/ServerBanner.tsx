"use client";

import { useQueryClient } from "@tanstack/react-query";
import { SERVER_DOWN_MSG } from "@/lib/api/client";
import { useServerDown } from "@/lib/api/hooks";

export function ServerBanner() {
  const down = useServerDown();
  const qc = useQueryClient();
  if (!down) return null;
  return (
    <div role="alert" className="flex flex-wrap items-center gap-2 border-b border-err bg-[color-mix(in_srgb,var(--err)_12%,var(--panel))] px-3.5 py-1.5 text-[13px] text-err">
      <span className="min-w-0 flex-1"><b>{SERVER_DOWN_MSG}</b> <span className="text-mute">(cd server &amp;&amp; npm run start:dev). Editing, checks and the cheatsheet still work.</span></span>
      <button className="btn btn-sm" onClick={() => qc.refetchQueries()}>Retry</button>
    </div>
  );
}
