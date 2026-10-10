import type { LiveDoctype } from "@/lib/analysis/schema";

export interface UserDto { id: string; email: string; name: string | null }

/** v2.1: url, apiKey and secret are never returned. Label connections by name only. */
export interface ConnectionDto {
  id: string;
  name: string;
  /** false for temporary (guest-session, in-memory) connections; their ids start with "tmp_". */
  persisted: boolean;
  user: string | null;
  frappeVersion: string | null;
  saveSecret: boolean;
  hasSecret: boolean;
  writable: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectionInput {
  name: string;
  url: string;
  apiKey: string;
  apiSecret: string;
  saveSecret: boolean;
  temporary?: boolean;
}

export type ConnectionPatch = Partial<Omit<ConnectionInput, "temporary">> & { writable?: boolean; confirmName?: string };

export interface SchemaDto { syncedAt: string; doctypeCount: number; doctypes: LiveDoctype[] }

export interface ScriptDto {
  id: string;
  name: string;
  code: string;
  connectionId: string | null;
  connectionName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NoteDto { content: string; updatedAt: string }

export type RunMode = "READ" | "DRY_RUN" | "COMMIT";
export type RunStatus = "OK" | "ERROR" | "BLOCKED" | "FAILED" | "ABORTED";

export interface Change {
  doctype: string;
  name: string;
  field: string;
  before: unknown;
  after: unknown;
  how: "db" | "doc";
  ignore_validate: boolean;
}

export interface RunDto {
  /** null for guest READ runs (not stored). */
  id: string | null;
  mode: RunMode;
  status: RunStatus;
  connectionId: string | null;
  connectionName: string;
  output: string | null;
  error: string | null;
  blocked: { line: number; what: string }[] | null;
  plan: Change[] | null;
  changeCount: number | null;
  dryRunId: string | null;
  committedRunId: string | null;
  durationMs: number | null;
  createdAt: string;
  code: string;
  /** list endpoint only */
  codePreview?: string;
}

export interface RunPage { items: RunDto[]; nextCursor: string | null }

export interface RunFilters { connectionId?: string; mode?: RunMode | ""; status?: RunStatus | "" }
