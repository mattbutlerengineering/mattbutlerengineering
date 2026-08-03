import { describe, it, expect, vi } from "vitest";
import { createGhClient } from "./client.js";
import type { ExecRunner } from "./exec-runner.js";
import { MissingGithubTokenError } from "./rest-args.js";
import type { SyncHttp } from "./sync-http.js";

function makeMockRunner(responses: Record<string, string> = {}): ExecRunner {
  return vi.fn().mockImplementation((_cmd: string, args: string[]) => {
    const key = args.join(" ");
    if (key in responses) return responses[key];
    return "";
  });
}

describe("createGhClient", () => {
  describe("issue facet", () => {
    it("issue.list returns parsed JSON array", () => {
      const items = [{ number: 1, title: "test" }];
      const runner = makeMockRunner({
        "issue list --json number,title": JSON.stringify(items),
      });
      const client = createGhClient({ runner });
      const result = client.issue.list(["--json", "number,title"]);
      expect(result).toEqual(items);
    });

    it("issue.view returns parsed JSON object", () => {
      const prData = { number: 5, title: "my pr" };
      const runner = makeMockRunner({
        "issue view 5 --json title": JSON.stringify(prData),
      });
      const client = createGhClient({ runner });
      expect(client.issue.view(5, ["--json", "title"])).toEqual(prData);
    });

    it("issue.create returns the created issue URL string", () => {
      const runner = makeMockRunner({
        "issue create --title New issue --body Body": "https://github.com/owner/repo/issues/99",
      });
      const client = createGhClient({ runner });
      const result = client.issue.create(["--title", "New issue", "--body", "Body"]);
      expect(result).toBe("https://github.com/owner/repo/issues/99");
    });

    it("issue.comment runs gh issue comment", () => {
      const runner = makeMockRunner({ "issue comment 7 --body hello": "" });
      const client = createGhClient({ runner });
      client.issue.comment(7, "hello");
      expect(runner).toHaveBeenCalledWith("gh", ["issue", "comment", "7", "--body", "hello"], {
        encoding: "utf-8",
        timeout: 15_000,
      });
    });

    it("issue.reopen runs gh issue reopen", () => {
      const runner = makeMockRunner({ "issue reopen 3": "" });
      const client = createGhClient({ runner });
      client.issue.reopen(3);
      expect(runner).toHaveBeenCalledWith("gh", ["issue", "reopen", "3"], expect.any(Object));
    });

    it("issue.close runs gh issue close with extra args", () => {
      const runner = makeMockRunner({ "issue close 9 --comment done": "" });
      const client = createGhClient({ runner });
      client.issue.close(9, ["--comment", "done"]);
      expect(runner).toHaveBeenCalledWith(
        "gh",
        ["issue", "close", "9", "--comment", "done"],
        expect.any(Object)
      );
    });
  });

  describe("pr facet", () => {
    it("pr.list returns parsed JSON array", () => {
      const prs = [{ number: 1, state: "MERGED" }];
      const runner = makeMockRunner({
        "pr list --state all --json number,state": JSON.stringify(prs),
      });
      const client = createGhClient({ runner });
      const result = client.pr.list(["--state", "all", "--json", "number,state"]);
      expect(result).toEqual(prs);
    });

    it("pr.view returns parsed JSON object", () => {
      const prData = { number: 1, title: "fix: something" };
      const runner = makeMockRunner({
        "pr view 1 --json title": JSON.stringify(prData),
      });
      const client = createGhClient({ runner });
      expect(client.pr.view(1, ["--json", "title"])).toEqual(prData);
    });

    it("pr.create returns the PR URL", () => {
      const runner = makeMockRunner({
        "pr create --title My PR --body Body": "https://github.com/owner/repo/pull/42",
      });
      const client = createGhClient({ runner });
      const url = client.pr.create(["--title", "My PR", "--body", "Body"]);
      expect(url).toBe("https://github.com/owner/repo/pull/42");
    });

    it("pr.close runs gh pr close with extra args", () => {
      const runner = makeMockRunner({ "pr close 9 --comment done": "" });
      const client = createGhClient({ runner });
      client.pr.close(9, ["--comment", "done"]);
      expect(runner).toHaveBeenCalledWith(
        "gh",
        ["pr", "close", "9", "--comment", "done"],
        expect.any(Object)
      );
    });
  });

  describe("label facet", () => {
    it("label.apply applies add/remove transitions", () => {
      const runner = makeMockRunner({
        "issue edit 10 --add-label has-pr --remove-label in-progress --remove-label ready": "",
      });
      const client = createGhClient({ runner });
      client.label.apply({ issueNumber: 10, add: ["has-pr"], remove: ["in-progress", "ready"] });
      expect(runner).toHaveBeenCalledWith(
        "gh",
        [
          "issue",
          "edit",
          "10",
          "--add-label",
          "has-pr",
          "--remove-label",
          "in-progress",
          "--remove-label",
          "ready",
        ],
        expect.any(Object)
      );
    });

    it("label.apply handles add-only transition", () => {
      const runner = makeMockRunner({ "issue edit 2 --add-label ready": "" });
      const client = createGhClient({ runner });
      client.label.apply({ issueNumber: 2, add: ["ready"], remove: [] });
      expect(runner).toHaveBeenCalledWith(
        "gh",
        ["issue", "edit", "2", "--add-label", "ready"],
        expect.any(Object)
      );
    });

    it("label.list returns parsed JSON array", () => {
      const labels = [{ name: "security" }, { name: "ready" }];
      const runner = makeMockRunner({
        "label list --json name": JSON.stringify(labels),
      });
      const client = createGhClient({ runner });
      const result = client.label.list(["--json", "name"]);
      expect(result).toEqual(labels);
    });
  });

  describe("workflow facet", () => {
    it("workflow.runs returns parsed JSON array", () => {
      const runs = [{ status: "completed", conclusion: "success" }];
      const runner = makeMockRunner({
        "run list --limit 10 --json status,conclusion": JSON.stringify(runs),
      });
      const client = createGhClient({ runner });
      expect(client.workflow.runs(["--limit", "10", "--json", "status,conclusion"])).toEqual(runs);
    });
  });

  // #3689 — non-gh-binary transport seam. These prove the three ACs that must
  // hold at the public createGhClient() surface, not just inside the
  // transport-internal unit tests.
  describe("transport selection (#3689)", () => {
    it("stays on the exec path — byte-identical to today — when the probe reports gh available", () => {
      const runner = makeMockRunner({
        "issue list --json number": JSON.stringify([{ number: 1 }]),
      });
      const http: SyncHttp = vi.fn();
      const client = createGhClient({ probe: () => true, runner, http });

      expect(client.issue.list(["--json", "number"])).toEqual([{ number: 1 }]);
      expect(runner).toHaveBeenCalledTimes(1);
      expect(http).not.toHaveBeenCalled();
    });

    it("falls back to REST — mocked HTTP, no gh — when the probe reports gh unavailable", () => {
      const runner: ExecRunner = vi.fn();
      const http: SyncHttp = vi
        .fn()
        .mockReturnValue({ status: 200, body: JSON.stringify([{ number: 2 }]) });
      const client = createGhClient({
        probe: () => false,
        runner,
        http,
        token: "gho_test",
        owner: "owner",
        repoName: "repo",
      });

      expect(client.issue.list(["--json", "number"])).toEqual([
        expect.objectContaining({ number: 2 }),
      ]);
      expect(runner).not.toHaveBeenCalled();
      expect(http).toHaveBeenCalledTimes(1);
    });

    it("fails with one clear, actionable error naming the missing credential when gh is absent and no token is set", () => {
      const client = createGhClient({ probe: () => false, env: {} });
      expect(() => client.issue.list(["--json", "number"])).toThrow(MissingGithubTokenError);
      expect(() => client.issue.list(["--json", "number"])).toThrow(/GITHUB_TOKEN/);
    });
  });
});
