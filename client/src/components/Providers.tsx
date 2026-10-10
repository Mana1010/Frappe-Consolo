"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { apiError } from "@/lib/api/client";
import { useBoard } from "@/lib/store/board";
import { useUi } from "@/lib/store/ui";
import { Toast } from "@/components/ui/Toast";
import { AuthDialog } from "@/components/dialogs/AuthDialog";

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        staleTime: 15_000,
        // client errors and a dead server will not fix themselves on retry
        retry: (n, e) => { const a = apiError(e); return !a.serverDown && (a.status == null || a.status >= 500) && n < 1; },
      },
    },
  });
}

function ThemeSync() {
  const theme = useBoard(s => s.theme);
  useEffect(() => {
    const root = document.documentElement;
    if (theme) { root.dataset.theme = theme; return; }
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => { root.dataset.theme = mq.matches ? "dark" : "light"; };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(makeClient);
  useEffect(() => {
    // persisted state is read after mount so server and first client render match
    Promise.resolve(useBoard.persist.rehydrate()).then(() => useUi.getState().set({ hydrated: true }));
  }, []);
  return (
    <QueryClientProvider client={client}>
      <ThemeSync />
      {children}
      <AuthDialog />
      <Toast />
    </QueryClientProvider>
  );
}
