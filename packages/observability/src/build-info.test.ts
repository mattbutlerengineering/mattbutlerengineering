import { describe, it, expect } from "vitest";
import { resolveBuildInfo, UNKNOWN_BUILD } from "./build-info.js";

describe("resolveBuildInfo", () => {
  it("uses DEPLOY_SHA as the build identity", () => {
    expect(resolveBuildInfo({ DEPLOY_SHA: "abc123" })).toEqual({
      sha: "abc123",
      version: "abc123",
    });
  });

  it("trims whitespace around DEPLOY_SHA", () => {
    expect(resolveBuildInfo({ DEPLOY_SHA: " abc123\n" }).version).toBe("abc123");
  });

  it("falls back to a clearly-marked unknown, never a fake version", () => {
    expect(UNKNOWN_BUILD).toBe("unknown");
    expect(resolveBuildInfo({})).toEqual({ sha: "unknown", version: "unknown" });
    expect(resolveBuildInfo({ DEPLOY_SHA: "  " }).version).toBe("unknown");
  });
});
