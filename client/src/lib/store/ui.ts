import { create } from "zustand";
import type { RunDto } from "@/lib/api/types";
import type { Diag } from "@/lib/analysis/types";

export type OutState =
  | { kind: "idle" }
  | { kind: "running"; label: string; what: "Run" | "Dry run" | "Commit" }
  | { kind: "run"; run: RunDto }
  | { kind: "fail"; message: string; label: string; at: string };

export type Dialog =
  | { t: "conn"; id?: string | null; back?: boolean; then?: RunKind }
  | { t: "manage"; note?: string }
  | { t: "secret"; id: string; then?: RunKind }
  | { t: "help" }
  | { t: "confirm"; title: string; yes: string; onYes: () => void };

export type RunKind = "read" | "dry";
export type DockTab = "diags" | "out" | "changes";

export interface Hint { title: string; sig?: string; doc?: string; arg?: number; params?: string[] | null }

interface UiState {
  hydrated: boolean;
  dialog: Dialog | null;
  toast: { msg: string; id: number } | null;
  sidebarOpen: boolean;
  dockTab: DockTab;
  out: OutState;
  /** Latest dry run and the commit that followed it (Changes tab). */
  dryRun: RunDto | null;
  commit: RunDto | null;
  diags: Diag[];
  hint: Hint | null;
  caret: { line: number; col: number };
  /** Code to load into the editor (History → Open in editor, Saved scripts). */
  pendingLoad: { code: string; nonce: number } | null;
  /** A run requested from a dialog (e.g. after entering the secret). */
  queuedRun: { kind: RunKind; nonce: number } | null;
  busy: RunKind | "commit" | null;
  /** Doctype shown in the preview panel; null = panel closed. */
  previewDoctype: string | null;
  set:(p: Partial<Omit<UiState, "set" | "showToast" | "openDialog" | "closeDialog">>) => void;
  showToast: (msg: string) => void;
  openDialog: (d: Dialog) => void;
  closeDialog: () => void;
}

export const useUi = create<UiState>(set => ({
  hydrated: false,
  dialog: null,
  toast: null,
  sidebarOpen: false,
  dockTab: "diags",
  out: { kind: "idle" },
  dryRun: null,
  commit: null,
  diags: [],
  hint: null,
  caret: { line: 1, col: 1 },
  pendingLoad: null,
  queuedRun: null,
  busy: null,
  previewDoctype: null,
  set: p => set(p),
  showToast: msg => set({ toast: { msg, id: Date.now() } }),
  openDialog: d => set({ dialog: d }),
  closeDialog: () => set({ dialog: null }),
}));

export const toast = (msg: string) => useUi.getState().showToast(msg);
