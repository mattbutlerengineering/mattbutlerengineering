import { describe, it, expect } from "vitest";
import { resolveTarget, resolveSession, TARGET_ENV } from "./target.js";

describe("resolveTarget", () => {
  it("fails with a clear message when BASE_URL is absent, never defaulting to a local stand-in", () => {
    expect(() => resolveTarget({})).toThrow(/BASE_URL/);
    expect(() => resolveTarget({})).toThrow(/no default/i);
  });

  it("treats an empty or whitespace BASE_URL as absent", () => {
    expect(() => resolveTarget({ [TARGET_ENV]: "   " })).toThrow(/BASE_URL/);
  });

  it("rejects a value that is not an http(s) URL", () => {
    expect(() => resolveTarget({ [TARGET_ENV]: "localhost:4801" })).toThrow(/http/);
    expect(() => resolveTarget({ [TARGET_ENV]: "ftp://example.test" })).toThrow(/http/);
  });

  it("returns the origin without a trailing slash or path", () => {
    expect(resolveTarget({ [TARGET_ENV]: "http://localhost:8787/" })).toBe("http://localhost:8787");
    expect(resolveTarget({ [TARGET_ENV]: "https://example.test/hospitality/x" })).toBe(
      "https://example.test"
    );
  });
});

describe("resolveSession", () => {
  it("is absent unless both authority and client id are given", () => {
    expect(resolveSession({})).toBeNull();
    expect(resolveSession({ HARNESS_AUTH_AUTHORITY: "https://a.test" })).toBeNull();
    expect(resolveSession({ HARNESS_AUTH_CLIENT_ID: "c" })).toBeNull();
  });

  it("returns both values when both are given", () => {
    expect(
      resolveSession({ HARNESS_AUTH_AUTHORITY: "https://a.test", HARNESS_AUTH_CLIENT_ID: "c" })
    ).toEqual({ authority: "https://a.test", clientId: "c" });
  });
});
