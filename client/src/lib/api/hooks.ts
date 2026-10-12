"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { authApi, connectionsApi, runsApi, scriptsApi } from "./endpoints";
import { apiError } from "./client";
import type { RunFilters } from "./types";
import { useBoard } from "@/lib/store/board";
import { schemaFromLive } from "@/lib/analysis/schema";
import { SCHEMA0 } from "@/lib/analysis/data";

export const qk = {
  me: ["me"] as const,
  connections: ["connections"] as const,
  schema: (id: string) => ["schema", id] as const,
  sample: (id: string, doctype: string) => ["sample", id, doctype] as const,
  scripts: ["scripts"] as const,
  notes: ["notes"] as const,
  runs: (f: RunFilters) => ["runs", f] as const,
  run: (id: string) => ["run", id] as const,
};

export function useMe() {
  const q = useQuery({ queryKey: qk.me, queryFn: authApi.me, staleTime: 60_000 });
  return { ...q, user: q.data ?? null, signedIn: !!q.data };
}

export function useConnections() {
  return useQuery({ queryKey: qk.connections, queryFn: connectionsApi.list });
}

/** True when the last connections request failed because the API server is down. */
export function useServerDown() {
  const q = useConnections();
  return q.isError && apiError(q.error).serverDown;
}

export function useActiveConnection() {
  const id = useBoard(s => s.activeConnectionId);
  const { data } = useConnections();
  return useMemo(() => (data || []).find(c => c.id === id) ?? null, [data, id]);
}

export function useSchemaQuery(id: string | null | undefined) {
  return useQuery({ queryKey: qk.schema(id || ""), queryFn: () => connectionsApi.schema(id as string), enabled: !!id, staleTime: 5 * 60_000, retry: false });
}

/** Live schema of the active connection, or the built-in fallback. */
export function useEffectiveSchema() {
  const conn = useActiveConnection();
  const q = useSchemaQuery(conn?.id);
  return useMemo(() => ({ schema: q.data ? schemaFromLive(q.data.doctypes) : SCHEMA0, live: q.data ?? null }), [q.data]);
}

/** First record of a doctype on a connection (only fetched when there is a usable secret). */
export function useSampleQuery(id: string | null | undefined, doctype: string | null, enabled: boolean) {
  return useQuery({
    queryKey: qk.sample(id || "", doctype || ""),
    queryFn: () => connectionsApi.sample(id as string, doctype as string),
    enabled: enabled && !!id && !!doctype,
    staleTime: 60_000,
    retry: false,
  });
}

export function useScripts(enabled: boolean) {
  return useQuery({ queryKey: qk.scripts, queryFn: scriptsApi.list, enabled });
}

export function useRuns(f: RunFilters, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: qk.runs(f),
    queryFn: ({ pageParam }) => runsApi.list(f, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: last => last.nextCursor,
    enabled,
  });
}

export function useRun(id: string | null) {
  return useQuery({ queryKey: qk.run(id || ""), queryFn: () => runsApi.get(id as string), enabled: !!id });
}
