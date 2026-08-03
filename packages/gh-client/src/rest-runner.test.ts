import { describe, it, expect, vi } from "vitest";
import { createRestRunner } from "./rest-runner.js";
import { MissingGithubTokenError } from "./rest-args.js";
import type { SyncHttp } from "./sync-http.js";

function makeRunner(http: SyncHttp) {
  return createRestRunner({ token: "gho_test", owner: "owner", repoName: "repo", http });
}

describe("createRestRunner", () => {
  it("dispatches every gh-backed resource/action pair without a real network call", () => {
    const http = vi.fn().mockImplementation(({ method, url }: { method: string; url: string }) => {
      if (url.includes("/pulls/") && !url.includes("/files") && !url.includes("/commits")) {
        return { status: 200, body: JSON.stringify({ number: 1, title: "pr", state: "open" }) };
      }
      if (url.includes("/issues/") && url.endsWith("/1")) {
        return { status: 200, body: JSON.stringify({ number: 1, title: "issue", state: "open" }) };
      }
      if (method === "GET") return { status: 200, body: JSON.stringify([]) };
      return {
        status: 200,
        body: JSON.stringify({ html_url: "https://github.com/owner/repo/issues/1" }),
      };
    });
    const run = makeRunner(http);

    expect(() =>
      JSON.parse(run("gh", ["issue", "list", "--state", "open", "--json", "number"]))
    ).not.toThrow();
    expect(() => JSON.parse(run("gh", ["issue", "view", "1", "--json", "title"]))).not.toThrow();
    expect(typeof run("gh", ["issue", "create", "--title", "t", "--body", "b"])).toBe("string");
    expect(run("gh", ["issue", "comment", "1", "--body", "hi"])).toBe("");
    expect(run("gh", ["issue", "reopen", "1"])).toBe("");
    expect(run("gh", ["issue", "close", "1"])).toBe("");
    expect(run("gh", ["issue", "edit", "1", "--add-label", "ready"])).toBe("");
    expect(() =>
      JSON.parse(run("gh", ["pr", "list", "--state", "all", "--json", "number"]))
    ).not.toThrow();
    expect(() => JSON.parse(run("gh", ["pr", "view", "1", "--json", "title"]))).not.toThrow();
    expect(() => JSON.parse(run("gh", ["label", "list", "--json", "name"]))).not.toThrow();
    expect(() => JSON.parse(run("gh", ["run", "list", "--json", "status"]))).not.toThrow();
  });

  it("throws a clear, named-credential error when no token is available", () => {
    const http = vi.fn();
    const run = createRestRunner({ owner: "owner", repoName: "repo", http, env: {} });
    expect(() => run("gh", ["issue", "list", "--json", "number"])).toThrow(MissingGithubTokenError);
    expect(() => run("gh", ["issue", "list", "--json", "number"])).toThrow(/GITHUB_TOKEN/);
    expect(http).not.toHaveBeenCalled();
  });

  it("throws for a resource/action pair outside the supported gh-client surface", () => {
    const http = vi.fn();
    const run = makeRunner(http);
    expect(() => run("gh", ["repo", "clone"])).toThrow(/unsupported command/);
  });
});
