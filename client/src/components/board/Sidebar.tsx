"use client";

import { useBoard, type SidebarTab } from "@/lib/store/board";
import { useUi } from "@/lib/store/ui";
import { SchemaPane } from "./panes/SchemaPane";
import { CheatPane } from "./panes/CheatPane";
import { SnippetPane } from "./panes/SnippetPane";
import { SavedPane } from "./panes/SavedPane";

const TABS: [SidebarTab, string][] = [
  ["schema", "Schema"],
  ["cheat", "Cheatsheet"],
  ["snips", "Snippets"],
  ["saved", "Saved"],
];

/** Closes the drawer on narrow screens after something was inserted. */
export const closeDrawerIfNarrow = () => {
  if (window.innerWidth <= 860) useUi.getState().set({ sidebarOpen: false });
};

export function Sidebar() {
  const tab = useBoard((s) => s.sidebarTab),
    open = useUi((s) => s.sidebarOpen);
  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-11 bg-[rgba(10,15,22,.35)] wide:hidden"
          onClick={() => useUi.getState().set({ sidebarOpen: false })}
          aria-hidden="true"
        />
      )}
      <aside
        id="side"
        aria-label="Reference panel"
        className={`${open ? "flex" : "hidden"} fixed inset-y-0 left-0 z-[12] w-[min(88vw,320px)] min-h-0 flex-col border-r border-line bg-panel shadow-pop wide:static wide:z-auto wide:flex wide:w-auto wide:shadow-none`}
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
        onKeyDown={(e) => {
          if (e.key === "Escape" && open)
            useUi.getState().set({ sidebarOpen: false });
        }}
      >
        <div
          role="tablist"
          aria-label="Panel"
          className="tabbar flex flex-none border-b border-line"
        >
          {TABS.map(([id, label]) => (
            <button
              key={id}
              role="tab"
              id={"st-" + id}
              aria-controls={"sp-" + id}
              aria-selected={tab === id}
              onClick={() => useBoard.getState().set({ sidebarTab: id })}
              className="flex-1 px-1 py-[9px] text-[13px]"
            >
              {label}
            </button>
          ))}
        </div>
        <section
          role="tabpanel"
          id={"sp-" + tab}
          aria-labelledby={"st-" + tab}
          className="min-h-0 flex-1 overflow-auto p-2.5"
        >
          {tab === "schema" ? (
            <SchemaPane />
          ) : tab === "cheat" ? (
            <CheatPane />
          ) : tab === "snips" ? (
            <SnippetPane />
          ) : (
            <SavedPane />
          )}
        </section>
      </aside>
    </>
  );
}
