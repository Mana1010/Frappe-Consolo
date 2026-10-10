import { useBoard } from "@/lib/store/board";

export const setNotes = (content: string) => useBoard.getState().set({ notes: { content, updatedAt: new Date().toISOString() } });

/** "To notes" from the Output panel: open the pad and append the text after a blank line. */
export function appendToNotes(text: string) {
  const cur = useBoard.getState().notes?.content || "";
  setNotes((cur.trim() ? cur.replace(/\s*$/, "\n\n") : "") + text);
  useBoard.getState().set({ padOpen: true });
}
