"use client";

import { Fragment, useState } from "react";
import { CHEATS } from "@/lib/analysis/data";
import { toast } from "@/lib/store/ui";
import { editorBridge } from "@/components/editor/bridge";
import { closeDrawerIfNarrow } from "../Sidebar";

/** CAPITAL placeholders are highlighted like the HTML's hiCode(). */
function Code({ c }: { c: string }) {
  return <>{c.split(/\b([A-Z][A-Z0-9]{2,})\b/).map((p, i) => (i % 2 ? <mark key={i} className="cheat-mark">{p}</mark> : <Fragment key={i}>{p}</Fragment>))}</>;
}

export function CheatPane() {
  const [q, setQ] = useState("");
  const ql = q.trim().toLowerCase();
  const list = CHEATS.filter(x => !ql || (x.t + " " + x.d + " " + x.g + " " + x.c).toLowerCase().includes(ql));
  return (
    <>
      <input className="input mb-2" placeholder="Search, e.g. get, set, loop" aria-label="Search cheatsheet" value={q} onChange={e => setQ(e.target.value)} />
      <p className="empty mt-0">Replace the CAPITAL placeholders with your own values.</p>
      {!list.length && <div className="empty">No match.</div>}
      {list.map((x, i) => {
        const head = i === 0 || list[i - 1].g !== x.g ? x.g : null;
        return (
          <Fragment key={i}>
            {head && <h3 className="mt-3 mb-[5px] text-[12.5px] font-semibold text-mute">{head}</h3>}
            <div className="mb-[7px] overflow-hidden rounded-md border border-line bg-editor">
              <div className="flex items-center gap-1.5 px-2 pt-1.5">
                <b className="min-w-0 flex-1 font-semibold">{x.t}</b>
                {x.w && <span className="badge text-warn">writes</span>}
              </div>
              {x.d && <p className="mx-2 mt-0.5 mb-0 text-[12.5px] text-mute">{x.d}</p>}
              <pre className="mt-1.5 overflow-auto border-t border-line px-2 py-[7px] font-mono text-xs leading-normal whitespace-pre text-(--a)"><Code c={x.c} /></pre>
              <div className="flex gap-1.5 px-2 pb-[7px]">
                <button className="btn btn-sm" onClick={() => { editorBridge.insertText(x.c); closeDrawerIfNarrow(); toast("Inserted"); }}>Insert</button>
                <button className="btn btn-sm" onClick={async () => { try { await navigator.clipboard.writeText(x.c); toast("Copied"); } catch { toast("Copy blocked, use Insert instead"); } }}>Copy</button>
              </div>
            </div>
          </Fragment>
        );
      })}
    </>
  );
}
