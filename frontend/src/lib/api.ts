export const API_BASE = import.meta.env.VITE_API_URL || "/api";

const REFRESH_PATH = "/auth/refresh";
const HTTP_UNAUTHORIZED = 401;
// A 401 from these endpoints means bad credentials, not an expired session.
const NO_REFRESH_PATHS = new Set(["/auth/login", "/auth/register", REFRESH_PATH]);

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

let pendingRefresh: Promise<boolean> | null = null;

/** Renew the session cookies, sharing one request between concurrent callers. */
function refreshSession(): Promise<boolean> {
  pendingRefresh ??= fetch(`${API_BASE}${REFRESH_PATH}`, { method: "POST", credentials: "include" })
    .then((res) => res.ok)
    .catch(() => false)
    .finally(() => {
      pendingRefresh = null;
    });
  return pendingRefresh;
}

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers);
  if (options?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const send = () => fetch(`${API_BASE}${path}`, { ...options, headers, credentials: "include" });

  let res = await send();
  if (res.status === HTTP_UNAUTHORIZED && !NO_REFRESH_PATHS.has(path) && (await refreshSession())) {
    res = await send();
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new ApiError(error.detail || "Request failed", res.status);
  }

  if (res.status === 204) return undefined as unknown as T;
  return res.json();
}
