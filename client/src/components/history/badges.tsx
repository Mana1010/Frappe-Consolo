import type { RunMode, RunStatus } from "@/lib/api/types";

const MODE: Record<RunMode, [string, string]> = { READ: ["Read", "text-info"], DRY_RUN: ["Dry run", "text-warn"], COMMIT: ["Commit", "text-err"] };
const STATUS: Record<RunStatus, string> = { OK: "text-ok", ERROR: "text-err", FAILED: "text-err", BLOCKED: "text-warn", ABORTED: "text-warn" };

export const ModeBadge = ({ mode }: { mode: RunMode }) => <span className={`badge ${MODE[mode][1]}`}>{MODE[mode][0]}</span>;
export const StatusBadge = ({ status }: { status: RunStatus }) => <span className={`badge ${STATUS[status]}`}>{status.toLowerCase()}</span>;
export const MODES = Object.keys(MODE) as RunMode[];
export const STATUSES = Object.keys(STATUS) as RunStatus[];
export const modeLabel = (m: RunMode) => MODE[m][0];
