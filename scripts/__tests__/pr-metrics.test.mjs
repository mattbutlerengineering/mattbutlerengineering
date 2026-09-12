import { describe, it, expect } from "vitest";
import { buildAcceptanceEntry, filterPrsInWindow } from "../pr-metrics.mjs";
import { isAiPr } from "../collect-queue-efficiency.mjs";

/**
 * Regression tests for #5012: `pr-metrics.mjs` carried its own four-branch-
 * regex-plus-has-pr copy of "is this an AI-authored PR" that omitted the
 * `agent-authored` label leg entirely — the repo's canonical predicate lives
 * in `collect-queue-efficiency.mjs`'s `isAiPr` (also mirrored, with a comment
 * pointing back here, in `.github/workflows/ai-audit.yml`'s inline jq). This
 * file pins `pr-metrics.mjs` to that shared predicate rather than a
 * hand-maintained third copy.
 */

/** @typedef {{ number: number, state: string, headRefName: string, mergedAt: string|null, closedAt: string|null, labels: Array<{ name: string }> }} PR */

/**
 * @param {number} number
 * @param {Partial<Omit<PR, "number" | "labels">> & { labels?: string[] }} [opts]
 * @returns {PR}
 */
const pr = (
  number,
  {
    labels = [],
    headRefName = "some/branch",
    mergedAt = null,
    state = "OPEN",
    closedAt = null,
  } = {}
) => ({
  number,
  state,
  headRefName,
  mergedAt,
  closedAt,
  labels: labels.map((name) => ({ name })),
});

describe("buildAcceptanceEntry AI-PR identification", () => {
  it("counts a PR carrying only the agent-authored label as AI-authored", () => {
    const prs = [
      pr(1, {
        labels: ["agent-authored"],
        headRefName: "fix/something",
        mergedAt: "2026-06-01T00:00:00Z",
        state: "MERGED",
        closedAt: "2026-06-01T00:00:00Z",
      }),
    ];
    const entry = buildAcceptanceEntry(prs, 30, "2026-06-10");
    expect(entry.total_ai_prs).toBe(1);
    expect(entry.merged).toBe(1);
  });

  it("counts a PR matching a known worker branch prefix as AI-authored", () => {
    const prs = [
      pr(2, {
        headRefName: "worktree-agent-abc123",
        mergedAt: "2026-06-01T00:00:00Z",
        state: "MERGED",
        closedAt: "2026-06-01T00:00:00Z",
      }),
    ];
    const entry = buildAcceptanceEntry(prs, 30, "2026-06-10");
    expect(entry.total_ai_prs).toBe(1);
    expect(entry.merged).toBe(1);
  });

  it("agrees with the canonical isAiPr predicate on the has-pr metrics-commit automation shape", () => {
    const metricsPr = pr(3, {
      labels: ["has-pr"],
      headRefName: "automation/pr-acceptance-metrics",
      mergedAt: "2026-06-01T00:00:00Z",
      state: "MERGED",
      closedAt: "2026-06-01T00:00:00Z",
    });
    // Assert explicitly against the canonical predicate rather than assuming
    // an answer — whatever isAiPr says for this shape, buildAcceptanceEntry
    // must agree.
    expect(isAiPr(metricsPr)).toBe(true);
    const entry = buildAcceptanceEntry([metricsPr], 30, "2026-06-10");
    expect(entry.total_ai_prs).toBe(1);
    expect(entry.merged).toBe(1);
  });

  it("excludes a human PR with no agent-authored/has-pr label and no worker branch", () => {
    const prs = [
      pr(4, {
        headRefName: "fix/typo",
        mergedAt: "2026-06-01T00:00:00Z",
        state: "MERGED",
        closedAt: "2026-06-01T00:00:00Z",
      }),
    ];
    const entry = buildAcceptanceEntry(prs, 30, "2026-06-10");
    expect(entry.total_ai_prs).toBe(0);
    expect(entry.acceptance_rate).toBeNull();
  });

  it("computes acceptance_rate from merged vs. closed-without-merge AI PRs", () => {
    const prs = [
      pr(5, {
        labels: ["agent-authored"],
        mergedAt: "2026-06-01T00:00:00Z",
        state: "MERGED",
        closedAt: "2026-06-01T00:00:00Z",
      }),
      pr(6, {
        labels: ["agent-authored"],
        mergedAt: null,
        state: "CLOSED",
        closedAt: "2026-06-02T00:00:00Z",
      }),
    ];
    const entry = buildAcceptanceEntry(prs, 30, "2026-06-10");
    expect(entry.total_ai_prs).toBe(2);
    expect(entry.merged).toBe(1);
    expect(entry.rejected).toBe(1);
    expect(entry.acceptance_rate).toBe(0.5);
  });

  it("carries window_days and date through unchanged", () => {
    const entry = buildAcceptanceEntry([], 90, "2026-06-10");
    expect(entry.window_days).toBe(90);
    expect(entry.date).toBe("2026-06-10");
  });
});

describe("filterPrsInWindow", () => {
  it("keeps only PRs whose terminal event falls within the window", () => {
    const sinceMs = new Date("2026-06-01T00:00:00Z").getTime();
    const prs = [
      pr(1, { mergedAt: "2026-06-05T00:00:00Z", state: "MERGED" }),
      pr(2, { mergedAt: "2026-05-01T00:00:00Z", state: "MERGED" }), // before window
      pr(3, { state: "OPEN" }), // no terminal event — excluded
    ];
    expect(filterPrsInWindow(prs, sinceMs).map((p) => p.number)).toEqual([1]);
  });
});
