import { describe, it, expect } from "vitest";
import { defaultSyncHttp, createSyncHttp } from "./sync-http.js";

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

// #4044: Node's global `fetch` ignores HTTP_PROXY/HTTPS_PROXY by default, so
// the subprocess bridge used to open a direct connection even inside a
// Claude Code Remote/scheduled session that routes outbound HTTPS through a
// pre-configured agent proxy — reaching GitHub with a credential that's
// valid for git-over-HTTPS but rejected by the raw REST API. Verified live
// against the real GitHub API (not reproducible in CI, so not asserted
// here): adding NODE_USE_ENV_PROXY=1 took the exact same request from a
// hard 401 to a real 200. This test asserts the wiring deterministically,
// without a live network call, via the injectable exec seam.
describe("createSyncHttp — proxy env wiring", () => {
  it("spawns the bridge with NODE_USE_ENV_PROXY=1 and --no-warnings", () => {
    let capturedArgs;
    let capturedOpts;
    const fakeExec = (_cmd, args, opts) => {
      capturedArgs = args;
      capturedOpts = opts;
      return JSON.stringify({ status: 200, body: "ok" });
    };

    const http = createSyncHttp({ exec: fakeExec });
    const result = http({ method: "GET", url: "https://api.github.com", headers: {} });

    expect(capturedArgs).toContain("--no-warnings");
    expect(capturedOpts.env.NODE_USE_ENV_PROXY).toBe("1");
    expect(result).toEqual({ status: 200, body: "ok" });
  });

  it("still passes through the caller's existing environment (e.g. HTTPS_PROXY, GITHUB_TOKEN)", () => {
    let capturedOpts;
    const fakeExec = (_cmd, _args, opts) => {
      capturedOpts = opts;
      return JSON.stringify({ status: 200, body: "ok" });
    };

    createSyncHttp({ exec: fakeExec })({
      method: "GET",
      url: "https://api.github.com",
      headers: {},
    });

    expect(capturedOpts.env).toMatchObject(process.env);
  });
});
