import { describe, it, expect } from "vitest";
import {
  extractClosedIssue,
  isAgentPr,
  deriveTelemetryRows,
} from "../collect-queue-telemetry-from-github.mjs";

const pr = (over = {}) => ({
  number: 100,
  headRefName: "worktree-agent-abc",
  body: "Closes #55\n\nstuff",
  labels: [{ name: "agent-authored" }],
  createdAt: "2026-10-09T10:00:00Z",
  mergedAt: "2026-10-09T11:00:00Z",
  ...over,
});

describe("extractClosedIssue", () => {
  it("parses Closes/Fixes/Resolves case-insensitively", () => {
    expect(extractClosedIssue("closes #12")).toBe(12);
    expect(extractClosedIssue("Fixes #7 and more")).toBe(7);
    expect(extractClosedIssue("Resolved #3")).toBe(3);
  });
  it("returns null with no closing keyword or a non-string", () => {
    expect(extractClosedIssue("see #12")).toBeNull();
    expect(extractClosedIssue(null)).toBeNull();
  });
});

describe("isAgentPr", () => {
  it("matches the worktree-agent branch prefix or the agent-authored label", () => {
    expect(isAgentPr(pr({ labels: [] }))).toBe(true);
    expect(isAgentPr(pr({ headRefName: "fix/x" }))).toBe(true);
    expect(isAgentPr(pr({ headRefName: "fix/x", labels: [] }))).toBe(false);
  });
});

describe("deriveTelemetryRows", () => {
  it("derives a pending row with honest nulls for in-session-only fields", () => {
    const { rows } = deriveTelemetryRows([pr()], []);
    expect(rows).toEqual([
      {
        issue_number: 55,
        labels: [],
        model_tier: null,
        subagent_tokens: null,
        tool_uses: null,
        duration_ms: null,
        pr_number: 100,
        merged: null,
        ci_first_pass: null,
        rework_cycles: null,
        reviewer_verdict: null,
        claimed_at: "2026-10-09T10:00:00Z",
        merged_at: null,
        cost_usd: null,
      },
    ]);
  });

  it("skips PRs already present by pr_number, non-agent PRs, and PRs with no closed issue", () => {
    const { rows, skipped } = deriveTelemetryRows(
      [
        pr({ number: 1 }),
        pr({ number: 2, headRefName: "fix/x", labels: [] }),
        pr({ number: 3, body: "no link" }),
        pr({ number: 4 }),
      ],
      [{ issue_number: 55, pr_number: 1 }]
    );
    expect(rows.map((r) => r.pr_number)).toEqual([4]);
    expect(skipped).toEqual({ existing: 1, notAgent: 1, noIssue: 1 });
  });

  it("orders rows oldest first and does not mutate inputs", () => {
    const prs = [
      pr({ number: 9, createdAt: "2026-10-09T12:00:00Z" }),
      pr({ number: 8, createdAt: "2026-10-09T09:00:00Z" }),
    ];
    const snapshot = JSON.stringify(prs);
    const { rows } = deriveTelemetryRows(prs, []);
    expect(rows.map((r) => r.pr_number)).toEqual([8, 9]);
    expect(JSON.stringify(prs)).toBe(snapshot);
  });
});
