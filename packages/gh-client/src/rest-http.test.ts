import { describe, it, expect, vi } from "vitest";
import { apiRequest, GhAuthError, GhRateLimitError, describeGhError } from "./rest-http.js";
import type { RestContext } from "./rest-http.js";
import type { SyncHttp } from "./sync-http.js";

function makeCtx(http: SyncHttp): RestContext {
  return { token: "gho_test", owner: "owner", repo: "repo", http };
}

describe("apiRequest", () => {
  it("sends an authenticated request and parses the JSON body", () => {
    const http: SyncHttp = vi
      .fn()
      .mockReturnValue({ status: 200, body: JSON.stringify({ ok: true }) });
    const result = apiRequest(makeCtx(http), "GET", "/repos/owner/repo/issues/1");

    expect(result).toEqual({ status: 200, json: { ok: true } });
    const [req] = (http as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(req.url).toBe("https://api.github.com/repos/owner/repo/issues/1");
    expect(req.headers.authorization).toBe("Bearer gho_test");
    expect(req.headers.accept).toBe("application/vnd.github+json");
    expect(req.headers["content-type"]).toBeUndefined();
  });

  it("sets content-type only when a body is sent", () => {
    const http: SyncHttp = vi.fn().mockReturnValue({ status: 201, body: "{}" });
    apiRequest(makeCtx(http), "POST", "/repos/owner/repo/issues", { title: "t" });

    const [req] = (http as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(req.headers["content-type"]).toBe("application/json");
    expect(req.body).toBe(JSON.stringify({ title: "t" }));
  });

  it("passes a full URL through unchanged (Search API shape)", () => {
    const http: SyncHttp = vi.fn().mockReturnValue({ status: 200, body: "{}" });
    apiRequest(makeCtx(http), "GET", "https://api.github.com/search/issues?q=x");
    expect((http as ReturnType<typeof vi.fn>).mock.calls[0][0].url).toBe(
      "https://api.github.com/search/issues?q=x"
    );
  });

  it("throws on a network failure (status 0)", () => {
    const http: SyncHttp = vi.fn().mockReturnValue({ status: 0, body: "ENOTFOUND" });
    expect(() => apiRequest(makeCtx(http), "GET", "/repos/owner/repo")).toThrow(/network error/);
  });

  it("throws on a 4xx/5xx response", () => {
    const http: SyncHttp = vi.fn().mockReturnValue({ status: 404, body: "Not Found" });
    expect(() => apiRequest(makeCtx(http), "GET", "/repos/owner/repo/issues/999")).toThrow(
      /-> 404/
    );
  });

  it("treats an ignoreStatuses code as success with a null json body", () => {
    const http: SyncHttp = vi.fn().mockReturnValue({ status: 404, body: "" });
    const result = apiRequest(
      makeCtx(http),
      "DELETE",
      "/repos/owner/repo/issues/1/labels/x",
      undefined,
      {
        ignoreStatuses: [404],
      }
    );
    expect(result).toEqual({ status: 404, json: null });
  });

  it("throws GhAuthError (not a generic Error) on a 401 response", () => {
    const http: SyncHttp = vi
      .fn()
      .mockReturnValue({ status: 401, body: '{"message":"Bad credentials"}' });
    expect(() => apiRequest(makeCtx(http), "GET", "/repos/owner/repo/issues")).toThrow(GhAuthError);
  });

  it("throws GhAuthError on a permission-denied 403 response", () => {
    const http: SyncHttp = vi.fn().mockReturnValue({
      status: 403,
      body: '{"message":"Resource not accessible by integration","documentation_url":"https://docs.github.com/rest"}',
    });
    expect(() => apiRequest(makeCtx(http), "GET", "/repos/owner/repo/issues")).toThrow(GhAuthError);
  });

  it("throws GhAuthError on a plain 403 response with no body", () => {
    const http: SyncHttp = vi.fn().mockReturnValue({ status: 403, body: "Forbidden" });
    expect(() => apiRequest(makeCtx(http), "GET", "/repos/owner/repo/issues")).toThrow(GhAuthError);
  });

  it("throws GhRateLimitError (not GhAuthError) on a primary rate-limit 403 response", () => {
    const http: SyncHttp = vi.fn().mockReturnValue({
      status: 403,
      body: '{"message":"API rate limit exceeded for user ID 12345.","documentation_url":"https://docs.github.com/rest/overview/resources-in-the-rest-api#rate-limiting"}',
    });
    try {
      apiRequest(makeCtx(http), "GET", "/repos/owner/repo/issues");
      expect.unreachable("apiRequest should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(GhRateLimitError);
      expect(err).not.toBeInstanceOf(GhAuthError);
    }
  });

  it("throws GhRateLimitError on a secondary rate-limit 403 response", () => {
    const http: SyncHttp = vi.fn().mockReturnValue({
      status: 403,
      body: '{"message":"You have exceeded a secondary rate limit. Please wait a few minutes before you try again.","documentation_url":"https://docs.github.com/rest/overview/resources-in-the-rest-api#secondary-rate-limits"}',
    });
    expect(() => apiRequest(makeCtx(http), "GET", "/repos/owner/repo/issues")).toThrow(
      GhRateLimitError
    );
  });

  it("throws GhRateLimitError (not GhAuthError) on an abuse-detection 403 response", () => {
    const http: SyncHttp = vi.fn().mockReturnValue({
      status: 403,
      body: '{"message":"You have triggered an abuse detection mechanism. Please wait a few minutes before you try again.","documentation_url":"https://docs.github.com/rest/overview/resources-in-the-rest-api#secondary-rate-limits"}',
    });
    try {
      apiRequest(makeCtx(http), "GET", "/repos/owner/repo/issues");
      expect.unreachable("apiRequest should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(GhRateLimitError);
      expect(err).not.toBeInstanceOf(GhAuthError);
    }
  });

  it("does not throw GhAuthError for a non-auth 4xx/5xx response", () => {
    const http: SyncHttp = vi.fn().mockReturnValue({ status: 500, body: "Server Error" });
    try {
      apiRequest(makeCtx(http), "GET", "/repos/owner/repo/issues");
      expect.unreachable("apiRequest should have thrown");
    } catch (err) {
      expect(err).not.toBeInstanceOf(GhAuthError);
    }
  });
});

describe("describeGhError", () => {
  it("names the auth-capability gap distinctly for a GhAuthError", () => {
    const err = new GhAuthError("GET", "/repos/owner/repo/issues", 401, "Bad credentials");
    expect(describeGhError(err)).toMatch(/auth/i);
    expect(describeGhError(err)).toContain("401");
  });

  it("names the rate-limit gap distinctly for a GhRateLimitError, without implying a bad credential", () => {
    const err = new GhRateLimitError(
      "GET",
      "/repos/owner/repo/issues",
      403,
      "API rate limit exceeded for user ID 12345."
    );
    const description = describeGhError(err);
    expect(description).toMatch(/rate limit/i);
    expect(description).toContain("403");
    expect(description).not.toMatch(/credential is not valid/i);
  });

  it("falls back to the error's own message for any other Error", () => {
    expect(describeGhError(new Error("boom"))).toBe("boom");
  });

  it("stringifies a non-Error throw value", () => {
    expect(describeGhError("plain string failure")).toBe("plain string failure");
  });
});
