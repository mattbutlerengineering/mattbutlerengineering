import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiClient } from "./client.js";
import { AccessTokensClient } from "./access-tokens.js";

const mockFetch = vi.fn<typeof fetch>();
vi.stubGlobal("fetch", mockFetch);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const client = new AccessTokensClient(
  new ApiClient({ baseUrl: "https://api.test.com", maxRetries: 0 })
);

const token = {
  id: "tok-1",
  name: "Claude Desktop",
  prefix: "mbe_pat_abcd",
  createdAt: "2026-11-25T12:00:00.000Z",
  lastUsedAt: null,
  expiresAt: null,
};

function lastCall(): [string, string, unknown] {
  const [url, init] = mockFetch.mock.calls.at(-1) ?? [];
  const body = init?.body ? JSON.parse(String(init.body)) : undefined;
  return [init?.method ?? "GET", String(url), body];
}

describe("AccessTokensClient", () => {
  beforeEach(() => mockFetch.mockReset());

  it("lists tokens", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: [token] }));
    await expect(client.list()).resolves.toEqual([token]);
    expect(lastCall().slice(0, 2)).toEqual(["GET", "https://api.test.com/api/v1/me/tokens"]);
  });

  it("mints a token and returns the one-time plaintext", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ data: { ...token, token: "mbe_pat_secret" } }, 201)
    );
    const minted = await client.mint({ name: "Claude Desktop", expiresInDays: 90 });
    expect(minted.token).toBe("mbe_pat_secret");
    expect(lastCall()).toEqual([
      "POST",
      "https://api.test.com/api/v1/me/tokens",
      { name: "Claude Desktop", expiresInDays: 90 },
    ]);
  });

  it("revokes a token by id", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(null, 204));
    await client.revoke("tok/1");
    expect(lastCall().slice(0, 2)).toEqual([
      "DELETE",
      "https://api.test.com/api/v1/me/tokens/tok%2F1",
    ]);
  });
});
