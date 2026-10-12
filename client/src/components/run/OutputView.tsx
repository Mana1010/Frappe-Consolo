"use client";

import { useMemo, type ReactNode } from "react";
import { hlJson, parseOut, prettyJson, segmentsText, toTable, type Segment } from "@/lib/output/parse";
import type { RunDto } from "@/lib/api/types";
import type { OutputMode } from "@/lib/store/board";
import type { OutState } from "@/lib/store/ui";

export const fmtMs = (ms: number | null | undefined) => ms == null ? "" : ms < 1000 ? ms + " ms" : (ms / 1000).toFixed(1) + " s";

const isTraceback = (s: string | null) => !!s && /^Traceback \(most recent call last\)/m.test(s);

export function Json({ text }: { text: string }) {
  return <>{hlJson(text).map((p, i) => (p.cls ? <span key={i} className={p.cls}>{p.text}</span> : p.text))}</>;
}

/** Segments for the run's output, memoised by output text. */
export function useSegments(raw: string | null | undefined) {
  return useMemo(() => (raw ? parseOut(raw) : []), [raw]);
}

/** Text for Copy / To notes in the current view mode, or "" when there is nothing to copy. */
export function outputText(out: OutState, segs: Segment[], mode: OutputMode) {
  if (out.kind === "fail") return out.message;
  if (out.kind !== "run") return "";
  const raw = out.run.output ?? "";
  if (!raw.trim()) return out.run.error ?? "";
  return segmentsText(raw, segs, mode);
}

function Blocked({ run, onLine }: { run: RunDto; onLine?: (n: number) => void }) {
  const what = run.mode === "READ" ? "Run only accepts read-only queries" : "Dry run only accepts read-only code plus set_value(...) and update_doc(...)";
  return (
    <>
      <div className="mb-1.5 text-xs text-err">Not sent. {what}, and these lines use something outside the allowed list. Nothing reached the site.</div>
      {(run.blocked || []).map((h, i) => (
        <button key={i} className="dg lv-error" onClick={() => onLine?.(h.line)} disabled={!onLine}>
          <i /><span className="l">Ln {h.line}</span><span>{h.what}</span>
        </button>
      ))}
    </>
  );
}

interface Props {
  out: OutState;
  mode: OutputMode;
  onLine?: (n: number) => void;
  empty?: ReactNode;
}

/** Port of the HTML drawOut(): meta line, then JSON / Table / Raw rendering of the console output. */
export function OutputView({ out, mode, onLine, empty }: Props) {
  const raw = out.kind === "run" ? out.run.output : null;
  const segs = useSegments(raw);

  if (out.kind === "idle") return <div className="empty">{empty}</div>;
  if (out.kind === "running") return <div className="mb-1.5 text-xs text-mute"><span className="spin" />{out.what === "Commit" ? "Committing on " : out.what === "Dry run" ? "Dry run on " : "Running on "}{out.label}…</div>;
  if (out.kind === "fail") return (
    <>
      <div className="mb-1.5 text-xs text-err">Request failed · {out.label} · {out.at}</div>
      <pre className="out-pre tb">{out.message}</pre>
    </>
  );

  const run = out.run;
  if (run.status === "BLOCKED") return <Blocked run={run} onLine={onLine} />;

  const text = raw ?? "";
  const one = segs.length === 1 && "v" in segs[0] && Array.isArray(segs[0].v) ? segs[0].v.length : null;
  const nVals = segs.filter(g => "v" in g).length;
  const ok = run.status === "OK";
  let meta = run.connectionName + (run.durationMs != null ? " · " + fmtMs(run.durationMs) : "") + " · " + new Date(run.createdAt).toLocaleTimeString();
  if (ok) meta += one != null ? " · " + one + " row" + (one === 1 ? "" : "s") : nVals ? " · " + nVals + " value" + (nVals === 1 ? "" : "s") : "";
  if (ok && run.mode === "DRY_RUN") meta += " · " + (run.changeCount ?? 0) + " change" + (run.changeCount === 1 ? "" : "s") + " planned · rolled back";
  else if (ok && run.mode === "COMMIT") meta += " · committed";
  else if (ok) meta += " · rolled back";
  const prefix = run.status === "ERROR" ? (run.mode === "COMMIT" ? "Python error, nothing was written · " : "Python error · ")
    : run.status === "ABORTED" ? "Aborted, nothing was written · "
    : run.status === "FAILED" ? "Request failed · " : "";

  let body: ReactNode;
  if (run.status === "FAILED" || run.status === "ABORTED") {
    let msg = run.error || text || "No details.";
    if (/\b401\b/.test(msg)) msg += "\nOpen the connection menu → Manage connections → Edit, and check the key and secret.";
    body = <><pre className="out-pre tb">{msg}</pre>{text && run.error ? <pre className="out-pre txt">{text}</pre> : null}</>;
  } else if (!text.trim()) {
    body = run.mode === "COMMIT"
      ? <div className="empty">Applied {run.changeCount ?? run.plan?.length ?? 0} change{run.changeCount === 1 ? "" : "s"}.</div>
      : <div className="empty">The script ran but printed nothing. Add <code>log(json.dumps(rows, default=str))</code> to see the result.</div>;
  } else if (run.status === "ERROR" || isTraceback(text) || mode === "raw") {
    body = <pre className={`out-pre ${run.status === "ERROR" ? "tb" : "txt"}`}>{text}</pre>;
  } else {
    body = segs.map((g, i) => "t" in g
      ? <pre key={i} className="out-pre txt">{g.t}</pre>
      : mode === "table" ? <pre key={i} className="out-pre">{toTable(g.v)}</pre>
      : <pre key={i} className="out-pre"><Json text={prettyJson(g.v)} /></pre>);
  }
  return (
    <>
      <div className={`mb-1.5 text-xs ${ok ? "text-mute" : "text-err"}`}>{prefix}{meta}</div>
      {body}
    </>
  );
}

export function OutputTools({ mode, onMode, onCopy, onNotes }: { mode: OutputMode; onMode: (m: OutputMode) => void; onCopy: () => void; onNotes?: () => void }) {
  const b = (m: OutputMode, label: string) => (
    <button className={`btn btn-sm ${mode === m ? "bg-sel" : ""}`} aria-pressed={mode === m} onClick={() => onMode(m)}>{label}</button>
  );
  return (
    <span className="flex flex-wrap gap-1">
      {b("pretty", "JSON")}{b("table", "Table")}{b("raw", "Raw")}
      <button className="btn btn-sm" onClick={onCopy}>Copy</button>
      {onNotes && <button className="btn btn-sm" onClick={onNotes}>To notes</button>}
    </span>
  );
}
