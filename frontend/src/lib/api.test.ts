import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "./api";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function requestedPaths(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls.map(([url]) => String(url));
}

describe("api session refresh", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("refreshes the session and retries once after a 401", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { detail: "Invalid or expired token" }))
      .mockResolvedValueOnce(jsonResponse(200, { access_token: "new" }))
      .mockResolvedValueOnce(jsonResponse(200, { id: "1" }));

    await expect(api<{ id: string }>("/auth/me")).resolves.toEqual({ id: "1" });

    expect(requestedPaths(fetchMock)).toEqual(["/api/auth/me", "/api/auth/refresh", "/api/auth/me"]);
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "POST", credentials: "include" });
  });

  it("surfaces the 401 when the session cannot be refreshed", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { detail: "Invalid or expired token" }))
      .mockResolvedValueOnce(jsonResponse(401, { detail: "Invalid or expired refresh token" }));

    const error = await api("/jobs").catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry more than once", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { detail: "Invalid or expired token" }))
      .mockResolvedValueOnce(jsonResponse(200, { access_token: "new" }))
      .mockResolvedValueOnce(jsonResponse(401, { detail: "Invalid or expired token" }));

    await expect(api("/jobs")).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("shares one refresh between concurrent requests", async () => {
    let refreshed = false;
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/auth/refresh") {
        refreshed = true;
        return jsonResponse(200, { access_token: "new" });
      }
      return refreshed
        ? jsonResponse(200, { ok: true })
        : jsonResponse(401, { detail: "Invalid or expired token" });
    });

    await Promise.all([api("/jobs"), api("/applications")]);

    const refreshCalls = requestedPaths(fetchMock).filter((path) => path === "/api/auth/refresh");
    expect(refreshCalls).toHaveLength(1);
  });

  it("does not refresh when credentials are rejected at login", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { detail: "Invalid email or password" }));

    await expect(api("/auth/login", { method: "POST", body: "{}" })).rejects.toMatchObject({
      message: "Invalid email or password",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
