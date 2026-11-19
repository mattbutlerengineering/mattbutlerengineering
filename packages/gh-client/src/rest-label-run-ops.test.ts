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
    expect(http.mock.calls[0]![0].url).toContain("/actions/runs?per_page=30&page=1");
  });

  it("falls back to client-side name filtering when no workflow matches", () => {
    const http = vi.fn().mockImplementation((req: { url: string }) => ({
      status: 200,
      body: JSON.stringify(
        req.url.includes("/actions/workflows")
          ? { workflows: [{ id: 7, name: "Other", path: ".github/workflows/other.yml" }] }
          : {
              workflow_runs: [
                { name: "CI", conclusion: "success" },
                { name: "Deploy", conclusion: "success" },
              ],
            }
      ),
    }));
    const result = workflowRuns(
      makeCtx(http),
      parseArgs(["--commit", "abc123", "--workflow", "CI", "--json", "conclusion"])
    );
    expect(result).toEqual([expect.objectContaining({ conclusion: "success" })]);
    expect(result).toHaveLength(1);
    const urls = http.mock.calls.map((c) => c[0].url as string);
    expect(urls.some((u) => u.includes("/actions/runs?head_sha=abc123"))).toBe(true);
  });

  it("scopes to the workflow id when the named workflow exists (#9173)", () => {
    const http = vi.fn().mockImplementation((req: { url: string }) => ({
      status: 200,
      body: JSON.stringify(
        req.url.includes("/actions/workflows/42/runs")
          ? { workflow_runs: [{ name: "E2E Tests", conclusion: "success" }] }
          : req.url.includes("/actions/workflows")
            ? {
                workflows: [
                  { id: 1, name: "CI", path: ".github/workflows/ci.yml" },
                  { id: 42, name: "E2E Tests", path: ".github/workflows/e2e.yml" },
                ],
              }
            : { workflow_runs: [{ name: "CI", conclusion: "success" }] }
      ),
    }));
    const result = workflowRuns(
      makeCtx(http),
      parseArgs([
        "--limit",
        "30",
        "--workflow",
        "E2E Tests",
        "--branch",
        "main",
        "--json",
        "conclusion",
      ])
    );
    expect(result).toEqual([expect.objectContaining({ name: "E2E Tests" })]);
    const urls = http.mock.calls.map((c) => c[0].url as string);
    const scoped = urls.find((u) => u.includes("/actions/workflows/42/runs"));
    expect(scoped).toContain("branch=main");
    expect(scoped).toContain("per_page=30");
    expect(urls.some((u) => u.includes("/actions/runs?"))).toBe(false);
  });

  it("matches the workflow by file basename", () => {
    const http = vi.fn().mockImplementation((req: { url: string }) => ({
      status: 200,
      body: JSON.stringify(
        req.url.includes("/actions/workflows/42/runs")
          ? { workflow_runs: [{ name: "E2E Tests" }] }
          : { workflows: [{ id: 42, name: "E2E Tests", path: ".github/workflows/e2e.yml" }] }
      ),
    }));
    const result = workflowRuns(makeCtx(http), parseArgs(["--workflow", "e2e.yml"]));
    expect(result).toHaveLength(1);
  });
});
