import { api } from "./client";
import type { ConnectionDto, ConnectionInput, ConnectionPatch, NoteDto, RunDto, RunFilters, RunPage, SchemaDto, ScriptDto, UserDto } from "./types";

const d = <T,>(p: Promise<{ data: T }>) => p.then(r => r.data);

export const authApi = {
  me: () => d<{ user: UserDto | null }>(api.get("/auth/me")).then(r => r.user),
  login: (body: { email: string; password: string }) => d<{ user: UserDto }>(api.post("/auth/login", body)),
  register: (body: { email: string; password: string; name?: string }) => d<{ user: UserDto }>(api.post("/auth/register", body)),
  logout: () => api.post("/auth/logout"),
};

export const connectionsApi = {
  list: () => d<ConnectionDto[]>(api.get("/connections")),
  create: (body: ConnectionInput) => d<ConnectionDto>(api.post("/connections", body)),
  update: (id: string, body: ConnectionPatch) => d<ConnectionDto>(api.patch(`/connections/${id}`, body)),
  remove: (id: string) => api.delete(`/connections/${id}`),
  secret: (id: string, apiSecret: string) => d<ConnectionDto>(api.post(`/connections/${id}/secret`, { apiSecret })),
  test: (id: string) => d<ConnectionDto>(api.post(`/connections/${id}/test`)),
  persist: (id: string) => d<ConnectionDto>(api.post(`/connections/${id}/persist`)),
  schema: (id: string) => d<SchemaDto | null>(api.get(`/connections/${id}/schema`)).then(r => r || null),
  syncSchema: (id: string) => d<SchemaDto>(api.post(`/connections/${id}/schema/sync`, undefined, { timeout: 300_000 })),
};

export const scriptsApi = {
  list: () => d<ScriptDto[]>(api.get("/scripts")),
  create: (body: { name: string; code: string; connectionId?: string | null }) => d<ScriptDto>(api.post("/scripts", body)),
  update: (id: string, body: Partial<{ name: string; code: string; connectionId: string | null }>) => d<ScriptDto>(api.patch(`/scripts/${id}`, body)),
  remove: (id: string) => api.delete(`/scripts/${id}`),
};

export const notesApi = {
  get: () => d<NoteDto>(api.get("/notes")),
  put: (content: string) => d<NoteDto>(api.put("/notes", { content })),
};

export const runsApi = {
  read: (connectionId: string, code: string) => d<RunDto>(api.post("/runs/read", { connectionId, code })),
  dryRun: (connectionId: string, code: string) => d<RunDto>(api.post("/runs/dry-run", { connectionId, code })),
  commit: (dryRunId: string, confirm: string) => d<RunDto>(api.post(`/runs/${dryRunId}/commit`, { confirm })),
  list: (f: RunFilters, cursor?: string | null) => {
    const params: Record<string, string> = { take: "50" };
    if (f.connectionId) params.connectionId = f.connectionId;
    if (f.mode) params.mode = f.mode;
    if (f.status) params.status = f.status;
    if (cursor) params.cursor = cursor;
    return d<RunPage>(api.get("/runs", { params }));
  },
  get: (id: string) => d<RunDto>(api.get(`/runs/${id}`)),
};
