"use client";

import { useEffect } from "react";
import { useUi } from "@/lib/store/ui";

export function Toast() {
  const toast = useUi(s => s.toast);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => useUi.getState().set({ toast: null }), Math.min(6000, 1800 + toast.msg.length * 35));
    return () => clearTimeout(t);
  }, [toast]);
  if (!toast) return null;
  return (
    <div role="status" aria-live="polite" className="fixed left-1/2 z-50 max-w-[calc(100vw-32px)] -translate-x-1/2 rounded-lg bg-ink px-3.5 py-1.5 text-[13px] text-bg shadow-pop" style={{ bottom: "calc(20px + env(safe-area-inset-bottom, 0px))" }}>
      {toast.msg}
    </div>
  );
}
