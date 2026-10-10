export type Kind = "method" | "prop" | "module" | "class" | "kw" | "bi" | "snip" | "col" | "tbl" | "var" | "alias" | "field" | "sql";

export interface ApiEntry {
  n: string;
  params: string[] | null;
  doc: string;
  ins?: string | null;
  kind: Kind;
}

export interface CompletionItem {
  label: string;
  insert: string;
  kind: Kind;
  detail?: string;
  doc?: string;
  sig?: string;
}

export interface CompletionResult {
  items: CompletionItem[];
  /** Offset (in the text passed to the completer) where the replaced word starts. */
  start: number;
}

export interface SchemaTable {
  cols: string[];
  custom?: boolean;
  istable?: boolean;
  issingle?: boolean;
  /** fieldname -> "Fieldtype" or "Link → Target" (live schema only) */
  types?: Record<string, string>;
}
export type Schema = Record<string, SchemaTable>;

export interface Analysis {
  docVars: Set<string>;
  rows: Record<string, string[]>;
}

export type Level = "error" | "warn" | "info";
export interface Diag {
  line: number;
  level: Level;
  msg: string;
}

export interface Snippet {
  label: string;
  doc: string;
  body: string;
}

export interface Cheat {
  g: string;
  t: string;
  d: string;
  c: string;
  w?: 1;
}
