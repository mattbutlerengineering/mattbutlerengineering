import { describe, it, expect } from "vitest";
import { defaultSyncHttp } from "./sync-http.js";

describe("defaultSyncHttp", () => {
  // Uses a malformed URL so `fetch` rejects during URL-parsing, before any
  // socket is opened — this exercises the real subprocess bridge (argv-free
  // stdin handoff, JSON envelope on stdout) with zero network I/O.
  it("round-trips a request through the subprocess bridge and reports failures as status 0", () => {
    const result = defaultSyncHttp({
      method: "GET",
      url: "not-a-valid-url",
      headers: { accept: "application/vnd.github+json" },
    });

    expect(result.status).toBe(0);
    expect(result.body.length).toBeGreaterThan(0);
  });
});
