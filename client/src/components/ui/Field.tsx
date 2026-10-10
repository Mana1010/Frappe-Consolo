import { useId, type ReactElement, type ReactNode, cloneElement } from "react";

interface FieldProps {
  label: string;
  error?: string;
  note?: ReactNode;
  children: ReactElement<{ id?: string; "aria-invalid"?: boolean; "aria-describedby"?: string }>;
  /** extra controls next to the input (e.g. Show/Hide) */
  after?: ReactNode;
}

/** Label + input + inline error line, matching the HTML's .field layout. */
export function Field({ label, error, note, children, after }: FieldProps) {
  const id = useId(), errId = id + "-err";
  const input = cloneElement(children, { id, "aria-invalid": !!error || undefined, "aria-describedby": errId });
  return (
    <div className="mt-2.5">
      <label htmlFor={id} className="mb-[3px] block text-[12.5px] font-medium text-ink">{label}</label>
      {after ? <div className="flex gap-1.5">{input}{after}</div> : input}
      {note && <small className="block text-xs text-mute">{note}</small>}
      <small id={errId} className="block min-h-[17px] text-xs text-err">{error}</small>
    </div>
  );
}
