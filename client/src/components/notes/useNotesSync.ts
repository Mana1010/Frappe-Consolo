"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { notesApi } from "@/lib/api/endpoints";
import { qk, useMe } from "@/lib/api/hooks";
import { useBoard } from "@/lib/store/board";
import { useUi } from "@/lib/store/ui";

export type SyncState = "local" | "synced" | "saving" | "offline";

/**
 * Signed-in users: the pad syncs to /api/notes (debounced). The localStorage copy is always kept,
 * so the pad still works when the API is down; on load the newer of the two wins.
 * Guests: localStorage only.
 */
export function useNotesSync(): SyncState {
  const { signedIn } = useMe();
  const hydrated = useUi(s => s.hydrated);
  const notes = useBoard(s => s.notes);
  const [state, setState] = useState<SyncState>("local");
  const q = useQuery({ queryKey: qk.notes, queryFn: notesApi.get, enabled: signedIn && hydrated, staleTime: Infinity, retry: false });
  const reconciled = useRef<string | null>(null), lastSent = useRef<string | null>(null);

  // reconcile once per loaded server copy
  useEffect(() => {
    if (!q.data || reconciled.current === q.data.updatedAt) return;
    reconciled.current = q.data.updatedAt;
    const local = useBoard.getState().notes;
    const serverNewer = !local || new Date(q.data.updatedAt) >= new Date(local.updatedAt);
    if (serverNewer || local.content === q.data.content) {
      lastSent.current = q.data.content;
      if (local?.content !== q.data.content) useBoard.getState().set({ notes: { content: q.data.content, updatedAt: q.data.updatedAt } });
    }
  }, [q.data]);

  // debounced upload of local edits
  useEffect(() => {
    if (!signedIn || !q.isSuccess || !notes || notes.content === lastSent.current) return;
    const content = notes.content;
    const t = setTimeout(() => {
      setState("saving");
      notesApi.put(content).then(
        r => { lastSent.current = content; reconciled.current = r.updatedAt; setState("synced"); },
        () => setState("offline"),
      );
    }, 800);
    return () => clearTimeout(t);
  }, [notes, signedIn, q.isSuccess]);

  if (!signedIn) return "local";
  if (q.isError) return "offline";
  return state === "local" ? "synced" : state;
}
