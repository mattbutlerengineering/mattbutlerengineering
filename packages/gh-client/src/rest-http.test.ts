import { describe, it, expect, vi } from "vitest";
import { apiRequest } from "./rest-http.js";
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
});
