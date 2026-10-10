import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { useAuthPrompt } from "@/lib/store/auth-prompt";

export const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
  timeout: 180_000,
});

export interface ApiErrorInfo {
  status: number | null;
  message: string;
  code?: string;
  fields?: Record<string, string>;
  /** The Next rewrite could not reach the NestJS server. */
  serverDown: boolean;
}

export const SERVER_DOWN_MSG =
  "Server not reachable at /api — start the server";

interface ServerBody {
  statusCode?: number;
  message?: string | string[];
  code?: string;
  fields?: Record<string, string>;
}

export function apiError(e: unknown): ApiErrorInfo {
  if (!axios.isAxiosError(e))
    return {
      status: null,
      message: (e as Error)?.message || String(e),
      serverDown: false,
    };
  const res = e.response;
  const body = (
    res?.data && typeof res.data === "object" ? res.data : null
  ) as ServerBody | null;
  // No response, or a proxy failure page instead of the server's JSON error shape.
  const serverDown =
    !res || (res.status >= 500 && !(body && "statusCode" in body));
  if (serverDown)
    return {
      status: res?.status ?? null,
      message:
        e.code === "ECONNABORTED"
          ? "The server did not answer in time."
          : SERVER_DOWN_MSG,
      serverDown: true,
    };
  const msg = body?.message;
  return {
    status: res.status,
    message: Array.isArray(msg) ? msg.join(" ") : msg || e.message,
    code: body?.code,
    fields: body?.fields,
    serverDown: false,
  };
}

export const errMsg = (e: unknown) => apiError(e).message;

type RetryConfig = InternalAxiosRequestConfig & { _authRetried?: boolean };

// Guest hits a save endpoint: ask the user to sign in, then replay the request transparently.
api.interceptors.response.use(undefined, (err: AxiosError) => {
  const cfg = err.config as RetryConfig | undefined;
  const body = err.response?.data as ServerBody | undefined;
  if (
    err.response?.status === 401 &&
    body?.code === "AUTH_REQUIRED" &&
    cfg &&
    !cfg._authRetried &&
    !cfg.url?.startsWith("/auth/")
  ) {
    return new Promise((resolve, reject) => {
      useAuthPrompt.getState().request(
        typeof body.message === "string"
          ? body.message
          : "Sign in to continue.",
        () =>
          api
            .request({ ...cfg, _authRetried: true } as RetryConfig)
            .then(resolve, reject),
        () => reject(err),
      );
    });
  }
  return Promise.reject(err);
});
