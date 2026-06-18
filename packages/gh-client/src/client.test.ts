import { describe, it, expect, vi } from "vitest";
import { createGhClient } from "./client.js";
import type { ExecRunner } from "./exec-runner.js";

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
  });

  describe("pr facet", () => {
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
});
