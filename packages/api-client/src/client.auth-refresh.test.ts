import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiClient, ApiClientError } from "./client.js";

/**
 * #8258: a host's seat/cancel PATCH from a long-open timeline answered 401
 * because the bearer it carried had expired. On a 401 to a request that
 * carried the client's own token, the client refreshes the token once and
 * replays the request exactly once.
 */
const mockFetch = vi.fn<typeof fetch>();
vi.stubGlobal("fetch", mockFetch);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const unauthorized = () =>
  jsonResponse({ type: "about:blank", title: "Unauthorized", status: 401, detail: "Auth" }, 401);

/** A fake origin that accepts only `Bearer fresh`. */
function originAccepting(validToken: string) {
  return async (_url: string | URL | Request, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    return headers.Authorization === `Bearer ${validToken}`
      ? jsonResponse({ id: "r1", status: "seated" })
      : unauthorized();
  };
}

function authHeaderOf(call: number): string | undefined {
  const init = mockFetch.mock.calls[call]?.[1];
  return ((init?.headers ?? {}) as Record<string, string>).Authorization;
}

describe("ApiClient — refresh the access token once on 401", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("refreshes and replays a PATCH once when the token has expired", async () => {
    mockFetch.mockImplementation(originAccepting("fresh"));
    const refreshAccessToken = vi.fn().mockResolvedValue("fresh");
    const onError = vi.fn();
    const client = new ApiClient({
      baseUrl: "https://api.test.com",
      getAccessToken: () => "expired",
      refreshAccessToken,
      onError,
    });

    const result = await client.patch("/v1/reservations/r1", { status: "seated" });

    expect(result).toEqual({ id: "r1", status: "seated" });
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(authHeaderOf(0)).toBe("Bearer expired");
    expect(authHeaderOf(1)).toBe("Bearer fresh");
    expect(mockFetch.mock.calls[1]?.[1]?.body).toBe(JSON.stringify({ status: "seated" }));
    expect(onError).not.toHaveBeenCalled();
  });

  it("replays at most once: a second 401 surfaces as the error", async () => {
    mockFetch.mockImplementation(async () => unauthorized());
    const refreshAccessToken = vi.fn().mockResolvedValue("still-bad");
    const onError = vi.fn();
    const client = new ApiClient({
      baseUrl: "https://api.test.com",
      getAccessToken: () => "expired",
      refreshAccessToken,
      onError,
    });

    const error = await client.patch("/v1/reservations/r1", {}).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiClientError);
    expect((error as ApiClientError).statusCode).toBe(401);
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("does not replay when the refresh yields no token", async () => {
    mockFetch.mockImplementation(async () => unauthorized());
    const refreshAccessToken = vi.fn().mockResolvedValue(null);
    const client = new ApiClient({
      baseUrl: "https://api.test.com",
      getAccessToken: () => "expired",
      refreshAccessToken,
    });

    await expect(client.post("/v1/reservations/r1/cancel", {})).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("does not replay when the refresh throws, and still surfaces the 401", async () => {
    mockFetch.mockImplementation(async () => unauthorized());
    const client = new ApiClient({
      baseUrl: "https://api.test.com",
      getAccessToken: () => "expired",
      refreshAccessToken: vi.fn().mockRejectedValue(new Error("login_required")),
    });

    await expect(client.patch("/v1/reservations/r1", {})).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("never refreshes a request that carried no token (signed-out GET /users/me)", async () => {
    mockFetch.mockImplementation(async () => unauthorized());
    const refreshAccessToken = vi.fn().mockResolvedValue("fresh");
    const client = new ApiClient({
      baseUrl: "https://api.test.com",
      getAccessToken: () => null,
      refreshAccessToken,
    });

    await expect(client.get("/v1/users/me")).rejects.toMatchObject({ statusCode: 401 });
    expect(refreshAccessToken).not.toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("never refreshes when the caller supplied its own Authorization header", async () => {
    mockFetch.mockImplementation(async () => unauthorized());
    const refreshAccessToken = vi.fn().mockResolvedValue("fresh");
    const client = new ApiClient({
      baseUrl: "https://api.test.com",
      getAccessToken: () => "user",
      refreshAccessToken,
    });

    await expect(
      client.request("/public/v1/manage", { method: "GET" }, undefined, {
        headers: { Authorization: "Bearer manage-token" },
      })
    ).rejects.toMatchObject({ statusCode: 401 });
    expect(refreshAccessToken).not.toHaveBeenCalled();
  });

  it("never refreshes on a non-401 status", async () => {
    mockFetch.mockImplementation(async () =>
      jsonResponse({ type: "about:blank", title: "Forbidden", status: 403 }, 403)
    );
    const refreshAccessToken = vi.fn().mockResolvedValue("fresh");
    const client = new ApiClient({
      baseUrl: "https://api.test.com",
      getAccessToken: () => "expired",
      refreshAccessToken,
    });

    await expect(client.patch("/v1/reservations/r1", {})).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(refreshAccessToken).not.toHaveBeenCalled();
  });

  it("shares one refresh across concurrent 401s", async () => {
    mockFetch.mockImplementation(originAccepting("fresh"));
    let resolveRefresh: (token: string) => void = () => undefined;
    const refreshAccessToken = vi.fn(
      () => new Promise<string>((resolve) => (resolveRefresh = resolve))
    );
    const client = new ApiClient({
      baseUrl: "https://api.test.com",
      getAccessToken: () => "expired",
      refreshAccessToken,
    });

    const refreshEntry = vi.spyOn(
      client as unknown as { refreshToken: () => Promise<string | null> },
      "refreshToken"
    );

    const a = client.patch("/v1/reservations/a", {});
    const b = client.patch("/v1/reservations/b", {});
    // Resolve only once both 401s are waiting on the refresh.
    await vi.waitFor(() => expect(refreshEntry).toHaveBeenCalledTimes(2));
    resolveRefresh("fresh");

    await expect(Promise.all([a, b])).resolves.toHaveLength(2);
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });
});
