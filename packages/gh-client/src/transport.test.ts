import { describe, it, expect, vi } from "vitest";
import { createTransportRunner, GhGraphqlUnavailableError } from "./transport.js";
import type { ExecRunner } from "./exec-runner.js";
import type { SyncHttp } from "./sync-http.js";

describe("createTransportRunner", () => {
  it("uses the exec transport when the probe reports gh available", () => {
    const execRunner: ExecRunner = vi.fn().mockReturnValue("exec output");
    const http: SyncHttp = vi.fn();
    const run = createTransportRunner({ probe: () => true, runner: execRunner, http });

    expect(run("gh", ["issue", "list"])).toBe("exec output");
    expect(execRunner).toHaveBeenCalledTimes(1);
    expect(http).not.toHaveBeenCalled();
  });

  it("uses the REST transport when the probe reports gh unavailable", () => {
    const execRunner: ExecRunner = vi.fn();
    const http: SyncHttp = vi.fn().mockReturnValue({ status: 200, body: "[]" });
    const run = createTransportRunner({
      probe: () => false,
      runner: execRunner,
      http,
      token: "gho_test",
      owner: "owner",
      repoName: "repo",
    });

    expect(run("gh", ["issue", "list", "--json", "number"])).toBe("[]");
    expect(execRunner).not.toHaveBeenCalled();
    expect(http).toHaveBeenCalledTimes(1);
  });

  describe("GraphQL-unavailable fallback (#6039)", () => {
    // Verbatim shape of the error execFileSync raises in a Claude Code Remote session.
    const GRAPHQL_403 =
      "Command failed: gh pr list --json number\n" +
      "HTTP 403: GitHub GraphQL is not available from Claude Code sessions; " +
      "use the REST API (gh api repos/{owner}/{repo}/...) (https://api.github.com/graphql)";

    function execError(message: string): Error {
      return Object.assign(new Error(message), { stderr: message });
    }

    function restOpts(http: SyncHttp) {
      return { token: "gho_test", owner: "owner", repoName: "repo", http, warn: () => {} };
    }

    it("retries the same call through REST when gh is present but GraphQL returns 403", () => {
      const probe = vi.fn().mockReturnValue(true);
      const execRunner: ExecRunner = vi.fn().mockImplementation(() => {
        throw execError(GRAPHQL_403);
      });
      const http: SyncHttp = vi.fn().mockReturnValue({ status: 200, body: "[]" });
      const run = createTransportRunner({ probe, runner: execRunner, ...restOpts(http) });

      expect(run("gh", ["pr", "list", "--json", "number"])).toBe("[]");
      expect(execRunner).toHaveBeenCalledTimes(1);
      expect(http).toHaveBeenCalledTimes(1);
      expect(probe).toHaveReturnedWith(true);
    });

    it("latches REST for the rest of the session — no flapping back to exec", () => {
      const execRunner: ExecRunner = vi.fn().mockImplementation(() => {
        throw execError(GRAPHQL_403);
      });
      const http: SyncHttp = vi.fn().mockReturnValue({ status: 200, body: "[]" });
      const run = createTransportRunner({
        probe: () => true,
        runner: execRunner,
        ...restOpts(http),
      });

      run("gh", ["pr", "list", "--json", "number"]);
      run("gh", ["issue", "list", "--json", "number"]);
      run("gh", ["pr", "list", "--json", "number"]);

      expect(execRunner).toHaveBeenCalledTimes(1);
      expect(http).toHaveBeenCalledTimes(3);
    });

    it("does not mask a non-auth exec failure as a REST fallback", () => {
      const execRunner: ExecRunner = vi.fn().mockImplementation(() => {
        throw execError("Command failed: gh pr view 9\nno pull requests found for branch");
      });
      const http: SyncHttp = vi.fn();
      const run = createTransportRunner({
        probe: () => true,
        runner: execRunner,
        ...restOpts(http),
      });

      expect(() => run("gh", ["pr", "view", "9"])).toThrow(/no pull requests found/);
      expect(http).not.toHaveBeenCalled();
      // And the transport is not latched: the next call still goes through exec.
      expect(() => run("gh", ["pr", "view", "9"])).toThrow();
      expect(execRunner).toHaveBeenCalledTimes(2);
    });

    it("does not launder a genuine GraphQL credential failure into REST", () => {
      const execRunner: ExecRunner = vi.fn().mockImplementation(() => {
        throw execError("HTTP 401: Bad credentials (https://api.github.com/graphql)");
      });
      const http: SyncHttp = vi.fn();
      const run = createTransportRunner({
        probe: () => true,
        runner: execRunner,
        ...restOpts(http),
      });

      expect(() => run("gh", ["pr", "list"])).toThrow(/Bad credentials/);
      expect(http).not.toHaveBeenCalled();
    });

    it("throws GhGraphqlUnavailableError when GraphQL is blocked and REST has no token", () => {
      const execRunner: ExecRunner = vi.fn().mockImplementation(() => {
        throw execError(GRAPHQL_403);
      });
      const run = createTransportRunner({
        probe: () => true,
        runner: execRunner,
        http: vi.fn(),
        owner: "owner",
        repoName: "repo",
        env: {},
      });

      expect(() => run("gh", ["pr", "list"])).toThrow(GhGraphqlUnavailableError);
    });
  });
});
