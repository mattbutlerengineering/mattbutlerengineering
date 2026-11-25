import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchUserInfoClaims } from "./auth0-userinfo.js";

describe("fetchUserInfoClaims", () => {
  const originalAuthority = process.env.AUTH_AUTHORITY;

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.AUTH_AUTHORITY = originalAuthority;
  });

  it("returns null when AUTH_AUTHORITY is not configured", async () => {
    delete process.env.AUTH_AUTHORITY;

    const result = await fetchUserInfoClaims("some-token");

    expect(result).toBeNull();
  });

  it("fetches claims from the userinfo endpoint with the given bearer token", async () => {
    process.env.AUTH_AUTHORITY = "https://test.auth0.com";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        email: "owner@example.com",
        email_verified: true,
        name: "Owner",
        picture: "https://example.com/pic.jpg",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchUserInfoClaims("abc123");

    expect(fetchMock).toHaveBeenCalledWith("https://test.auth0.com/userinfo", {
      headers: { Authorization: "Bearer abc123" },
    });
    expect(result).toEqual({
      email: "owner@example.com",
      emailVerified: true,
      name: "Owner",
      picture: "https://example.com/pic.jpg",
    });
  });

  it("normalizes a trailing slash on AUTH_AUTHORITY", async () => {
    process.env.AUTH_AUTHORITY = "https://test.auth0.com/";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    await fetchUserInfoClaims("abc123");

    expect(fetchMock).toHaveBeenCalledWith("https://test.auth0.com/userinfo", expect.anything());
  });

  it("returns null when the response is not ok", async () => {
    process.env.AUTH_AUTHORITY = "https://test.auth0.com";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));

    const result = await fetchUserInfoClaims("abc123");

    expect(result).toBeNull();
  });

  it("returns null when fetch throws (network error)", async () => {
    process.env.AUTH_AUTHORITY = "https://test.auth0.com";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

    const result = await fetchUserInfoClaims("abc123");

    expect(result).toBeNull();
  });

  it("ignores non-string/non-boolean claim shapes", async () => {
    process.env.AUTH_AUTHORITY = "https://test.auth0.com";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ email: 123, email_verified: "yes" }),
      })
    );

    const result = await fetchUserInfoClaims("abc123");

    expect(result).toEqual({
      email: undefined,
      emailVerified: undefined,
      name: undefined,
      picture: undefined,
    });
  });
});
