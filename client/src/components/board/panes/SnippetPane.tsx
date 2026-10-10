"use client";

import { SNIPPETS } from "@/lib/analysis/data";
import { editorBridge } from "@/components/editor/bridge";
import { closeDrawerIfNarrow } from "../Sidebar";

export function SnippetPane() {
  return (
    <>
      <p className="empty mt-0">Also available as completions: type the name and press Enter.</p>
      {SNIPPETS.map(s => (
        <button key={s.label} className="mb-1.5 block w-full rounded-md border border-line bg-editor px-2 py-[7px] text-left hover:border-accent"
          onClick={() => { editorBridge.insertText(s.body); closeDrawerIfNarrow(); }}>
          <b className="font-mono font-semibold">{s.label}</b>
          <p className="m-0 mt-0.5 text-[12.5px] text-mute">{s.doc}</p>
        </button>
      ))}
    </>
  );
}
