import { describe, it, expect, vi, afterEach } from "vitest";
import { buildJwksUrl, probeJwks, resolveJwksUrl } from "./auth0-jwks.js";

describe("probeJwks", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns ok on a 2xx answer", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const result = await probeJwks("https://x/jwks", { timeoutMs: 100, fetchFn });
    expect(result.kind).toBe("ok");
    expect(fetchFn).toHaveBeenCalledWith("https://x/jwks", { signal: expect.any(AbortSignal) });
  });

  it("returns http with the status on a non-2xx answer", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    const result = await probeJwks("https://x/jwks", { timeoutMs: 100, fetchFn });
    expect(result).toMatchObject({ kind: "http", status: 503 });
  });

  it("returns network, carrying the original error, and never throws", async () => {
    const error = new Error("boom");
    const fetchFn = vi.fn().mockRejectedValue(error);
    const result = await probeJwks("https://x/jwks", { timeoutMs: 100, fetchFn });
    expect(result).toMatchObject({ kind: "network", error });
  });

  it("returns timeout when the request is aborted by the timer", async () => {
    const fetchFn = vi.fn().mockImplementation(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () => {
            const abort = new Error("This operation was aborted");
            abort.name = "AbortError";
            reject(abort);
          });
        })
    );
    const result = await probeJwks("https://x/jwks", { timeoutMs: 10, fetchFn });
    expect(result.kind).toBe("timeout");
  });

  it("clears its timer on every outcome", async () => {
    const clearSpy = vi.spyOn(globalThis, "clearTimeout");
    await probeJwks("https://x/jwks", {
      timeoutMs: 100,
      fetchFn: vi.fn().mockRejectedValue(new Error("x")),
    });
    expect(clearSpy).toHaveBeenCalledTimes(1);
  });
});

describe("resolveJwksUrl / buildJwksUrl", () => {
  const originalEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("builds from an authority, stripping one trailing slash", () => {
    expect(buildJwksUrl("https://a.example.com/")).toBe(
      "https://a.example.com/.well-known/jwks.json"
    );
    expect(buildJwksUrl("")).toBeUndefined();
  });

  it("prefers explicit, then AUTH0_JWKS_URL, then AUTH_AUTHORITY", () => {
    process.env.AUTH0_JWKS_URL = "https://env/jwks";
    process.env.AUTH_AUTHORITY = "https://auth";
    expect(resolveJwksUrl("https://explicit/jwks")).toBe("https://explicit/jwks");
    expect(resolveJwksUrl()).toBe("https://env/jwks");
    delete process.env.AUTH0_JWKS_URL;
    expect(resolveJwksUrl()).toBe("https://auth/.well-known/jwks.json");
  });

  it("falls back to the dev tenant, except in production where it is null", () => {
    delete process.env.AUTH0_JWKS_URL;
    delete process.env.AUTH_AUTHORITY;
    process.env.NODE_ENV = "test";
    expect(resolveJwksUrl()).toMatch(/^https:\/\/[^/]+\.auth0\.com\/\.well-known\/jwks\.json$/);
    process.env.NODE_ENV = "production";
    expect(resolveJwksUrl()).toBeNull();
  });
});
