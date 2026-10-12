"use client";

import { useActiveConnection } from "@/lib/api/hooks";
import { useUi } from "@/lib/store/ui";

export function StatusBar() {
  const caret = useUi(s => s.caret), diags = useUi(s => s.diags);
  const conn = useActiveConnection();
  const n = diags.filter(d => d.level !== "info").length;
  return (
    <div className="flex gap-3.5 overflow-hidden border-t border-line bg-panel px-3 py-[3px] text-xs whitespace-nowrap text-mute">
      <span>Ln {caret.line}, Col {caret.col}</span>
      {n > 0 && <span>{n} to review</span>}
      {conn?.frappeVersion && <span className="hidden wide:inline">Frappe {conn.frappeVersion}</span>}
      <span className="flex-1" />
      <span className="hidden truncate wide:inline">Ctrl+Enter run · Ctrl+Space suggestions · Shift+Alt+F format · Ctrl+/ comment · Tab indent</span>
    </div>
  );
}
