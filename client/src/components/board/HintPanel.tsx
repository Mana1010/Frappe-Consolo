"use client";

import { useUi } from "@/lib/store/ui";

export function HintPanel() {
  const h = useUi(s => s.hint);
  return (
    <div className="max-h-16 min-w-0 overflow-auto px-3 py-2 wide:max-h-none" aria-live="polite">
      {!h ? (
        <>
          <h2 className="mb-1 text-[12.5px] font-semibold text-mute">Hint</h2>
          <p className="m-0 text-[12.5px] text-mute">Type <code>frappe.</code> for the API, or press Ctrl+Space. Inside a SQL string, tables and columns complete (<code>si.</code> lists columns of the aliased table). Variables from your queries complete their columns too.</p>
        </>
      ) : (
        <>
          <h2 className="mb-1 text-[12.5px] font-semibold text-mute">{h.title}</h2>
          {h.params !== undefined ? (
            <div className="font-mono text-[12.5px] break-words">
              {h.title}
              {h.params && <>({h.params.map((p, i) => <span key={i}>{i ? ", " : ""}{i === h.arg ? <b className="text-accent underline underline-offset-[3px]">{p}</b> : p}</span>)})</>}
            </div>
          ) : h.sig ? <div className="font-mono text-[12.5px] break-words">{h.sig}</div> : null}
          {h.doc && <p className="mt-[3px] mb-0 text-[12.5px] text-mute">{h.doc}</p>}
        </>
      )}
    </div>
  );
}
