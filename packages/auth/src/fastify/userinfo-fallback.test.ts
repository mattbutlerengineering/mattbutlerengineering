import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchUserInfoClaims, resolveProfileClaims } from "./userinfo-fallback.js";
import type { AuthUser } from "../types/index.js";

const baseRawPayload = {
  sub: "auth0|user-123",
  iss: "https://test.auth0.com/",
  aud: "https://api.example.com",
  exp: 0,
  iat: 0,
};

describe("fetchUserInfoClaims", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches claims from the userinfo endpoint with the given bearer token", async () => {
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

    const result = await fetchUserInfoClaims("https://test.auth0.com", "abc123");

    expect(fetchMock).toHaveBeenCalledWith("https://test.auth0.com/userinfo", {
      headers: { Authorization: "Bearer abc123" },
      signal: expect.any(AbortSignal),
    });
    expect(result).toEqual({
      email: "owner@example.com",
      emailVerified: true,
      name: "Owner",
      picture: "https://example.com/pic.jpg",
    });
  });

  it("normalizes a trailing slash on the authority", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    await fetchUserInfoClaims("https://test.auth0.com/", "abc123");

    expect(fetchMock).toHaveBeenCalledWith("https://test.auth0.com/userinfo", expect.anything());
  });

  it("returns null when the response is not ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));

    const result = await fetchUserInfoClaims("https://test.auth0.com", "abc123");

    expect(result).toBeNull();
  });

  it("returns null when fetch throws (network error)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

    const result = await fetchUserInfoClaims("https://test.auth0.com", "abc123");

    expect(result).toBeNull();
  });

  it("ignores non-string/non-boolean claim shapes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ email: 123, email_verified: "yes" }),
      })
    );

    const result = await fetchUserInfoClaims("https://test.auth0.com", "abc123");

    expect(result).toEqual({
      email: undefined,
      emailVerified: undefined,
      name: undefined,
      picture: undefined,
    });
  });
});

describe("resolveProfileClaims", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the user unchanged when it already has an email", async () => {
    const user: AuthUser = {
      id: "auth0|user-123",
      email: "already@example.com",
      raw: baseRawPayload,
    };
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveProfileClaims(
      { headers: { authorization: "Bearer abc123" } },
      user,
      "https://test.auth0.com"
    );

    expect(result).toBe(user);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns undefined unchanged when there is no user", async () => {
    const result = await resolveProfileClaims({ headers: {} }, undefined, "https://test.auth0.com");

    expect(result).toBeUndefined();
  });

  it("returns the user unchanged when there is no bearer token on the request", async () => {
    const user: AuthUser = { id: "auth0|user-123", raw: baseRawPayload };

    const result = await resolveProfileClaims({ headers: {} }, user, "https://test.auth0.com");

    expect(result).toBe(user);
  });

  it("merges userinfo claims onto the user when the token lacks an email", async () => {
    const user: AuthUser = { id: "auth0|user-123", raw: baseRawPayload };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          email: "recovered@example.com",
          email_verified: true,
          name: "Recovered Name",
          picture: "https://example.com/pic.jpg",
        }),
      })
    );

    const result = await resolveProfileClaims(
      { headers: { authorization: "Bearer abc123" } },
      user,
      "https://test.auth0.com"
    );

    expect(result).toEqual({
      ...user,
      email: "recovered@example.com",
      emailVerified: true,
      name: "Recovered Name",
      picture: "https://example.com/pic.jpg",
    });
  });

  it("returns the user unchanged when the userinfo call fails", async () => {
    const user: AuthUser = { id: "auth0|user-123", raw: baseRawPayload };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));

    const result = await resolveProfileClaims(
      { headers: { authorization: "Bearer abc123" } },
      user,
      "https://test.auth0.com"
    );

    expect(result).toBe(user);
  });
});
