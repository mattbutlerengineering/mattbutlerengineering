import { describe, it, expect, vi } from "vitest";
import { labelList, workflowRuns } from "./rest-label-run-ops.js";
import { parseArgs } from "./rest-args.js";
import type { RestContext } from "./rest-http.js";
import type { SyncHttp } from "./sync-http.js";

function makeCtx(http: SyncHttp): RestContext {
  return { token: "t", owner: "owner", repo: "repo", http };
}

describe("labelList", () => {
  it("maps label names", () => {
    const http = vi.fn().mockReturnValue({
      status: 200,
      body: JSON.stringify([{ name: "security" }, { name: "ready" }]),
    });
    const result = labelList(makeCtx(http), parseArgs(["--json", "name", "--limit", "200"]));
    expect(result).toEqual([
      expect.objectContaining({ name: "security" }),
      expect.objectContaining({ name: "ready" }),
    ]);
  });
});

describe("workflowRuns", () => {
  it("maps workflow_runs envelope fields", () => {
    const http = vi.fn().mockReturnValue({
      status: 200,
      body: JSON.stringify({
        workflow_runs: [
          { status: "completed", conclusion: "success", created_at: "2026-01-01", name: "CI" },
        ],
      }),
    });
    const result = workflowRuns(
      makeCtx(http),
      parseArgs(["--limit", "30", "--json", "status,conclusion,createdAt,name"])
    );
    expect(result).toEqual([
      expect.objectContaining({ status: "completed", conclusion: "success", name: "CI" }),
    ]);
    expect(http.mock.calls[0][0].url).toContain("/actions/runs?per_page=30&page=1");
  });

  it("filters by --branch and --commit via query params, and --workflow client-side", () => {
    const http = vi.fn().mockReturnValue({
      status: 200,
      body: JSON.stringify({
        workflow_runs: [
          { name: "CI", conclusion: "success" },
          { name: "Deploy", conclusion: "success" },
        ],
      }),
    });
    const result = workflowRuns(
      makeCtx(http),
      parseArgs(["--commit", "abc123", "--workflow", "CI", "--json", "conclusion"])
    );
    expect(result).toEqual([expect.objectContaining({ conclusion: "success" })]);
    expect(result).toHaveLength(1);
    expect(http.mock.calls[0][0].url).toContain("head_sha=abc123");
  });
});
