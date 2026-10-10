"use client";

import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";

interface ModalProps {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  z?: number;
}

/** Accessible dialog: aria-modal, Escape and backdrop close, focus moved in and restored on close. */
export function Modal({ title, onClose, children, wide, z = 40 }: ModalProps) {
  const card = useRef<HTMLDivElement>(null), titleId = useId();
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const el = card.current;
    const first = el?.querySelector<HTMLElement>("[data-autofocus], input:not([type=radio]):not([type=checkbox]):not([disabled]), textarea, button.btn-primary");
    (first || el)?.focus();
    return () => { prev?.focus?.(); };
  }, []);
  // React handler (not native) so inner inputs can preventDefault an Escape first
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const el = card.current;
    if (e.key === "Escape" && !e.defaultPrevented) { e.stopPropagation(); onClose(); }
    if (e.key === "Tab" && el) {
      // keep focus inside the dialog
      const f = [...el.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input:not([disabled]), select, textarea, summary, [tabindex]:not([tabindex='-1'])")].filter(x => x.offsetParent !== null);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  };
  return (
    <div className="fixed inset-0 grid place-items-center bg-[rgba(10,15,22,.5)] p-4" style={{ zIndex: z }} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={card} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onKeyDown={onKey}
        className={`card max-h-[88vh] w-full overflow-auto rounded-[10px] border border-line bg-panel px-[18px] py-4 shadow-pop outline-none ${wide ? "max-w-[720px]" : "max-w-[620px]"}`}>
        <h2 id={titleId}>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function DialogBar({ msg, bad, good, children }: { msg?: ReactNode; bad?: boolean; good?: boolean; children: ReactNode }) {
  return (
    <div className="mt-2.5 flex flex-wrap items-center justify-end gap-1.5">
      <span role="status" className={`mr-auto min-w-0 text-[13px] ${bad ? "text-err" : good ? "text-ok" : "text-mute"}`}>{msg}</span>
      {children}
    </div>
  );
}
