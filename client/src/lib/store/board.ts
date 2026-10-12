import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type Theme = "light" | "dark";
export type OutputMode = "pretty" | "table" | "raw";
export type SidebarTab = "schema" | "cheat" | "snips" | "saved";
export interface PadRect { left: number; top: number; w?: number; h?: number }

/** Per-viewer preferences, persisted to localStorage under "fsb-board". */
interface BoardState {
  activeConnectionId: string | null;
  theme: Theme | null;
  outputMode: OutputMode;
  dockHeight: number | null;
  sidebarTab: SidebarTab;
  draft: string | null;
  padOpen: boolean;
  padAuto: boolean;
  padRect: PadRect | null;
  /** Guest notes and the offline fallback for signed-in users. */
  notes: { content: string; updatedAt: string } | null;
  /** Doctype preview panel: width in px, and collapsed to a tab on the right edge. */
  previewWidth: number | null;
  previewHidden: boolean;
  set: (p: Partial<Omit<BoardState, "set">>) => void;
}

export const BOARD_KEY = "fsb-board";

export const useBoard = create<BoardState>()(
  persist(
    set => ({
      activeConnectionId: null,
      theme: null,
      outputMode: "pretty",
      dockHeight: null,
      sidebarTab: "schema",
      draft: null,
      padOpen: false,
      padAuto: true,
      padRect: null,
      notes: null,
      previewWidth: null,
      previewHidden: false,
      set: p => set(p),
    }),
    {
      name: BOARD_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: s => Object.fromEntries(Object.entries(s).filter(([k]) => k !== "set")) as Omit<BoardState, "set">,
      skipHydration: true,
    },
  ),
);
