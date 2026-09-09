/**
 * Regression tests for the PR-acceptance metric (#5012).
 *
 * `pr-metrics.mjs` used to carry its own four-branch-regex `isAiPr` copy that
 * was missing the `agent-authored` label leg checked by both
 * `collect-queue-efficiency.mjs` and `.github/workflows/ai-audit.yml`. It now
 * imports the shared, exported `isAiPr` from `collect-queue-efficiency.mjs` —
 * these tests exercise the real imported predicate, not a re-implementation,
 * so a future divergence breaks here first.
 */

import { describe, it, expect } from "vitest";
import { filterDecidedInWindow, computeAcceptanceEntry } from "../pr-metrics.mjs";

/**
 * @typedef {{
 *   number: number,
 *   state: string,
 *   headRefName: string,
 *   mergedAt: string | null,
 *   closedAt: string | null,
 *   labels: Array<{ name: string }>
 * }} PR
 */

/** @param {Partial<PR>} overrides */
function pr(overrides = {}) {
  return {
    number: 1,
    state: "MERGED",
    headRefName: "fix/some-human-thing",
    mergedAt: "2026-06-10T10:00:00Z",
    closedAt: "2026-06-10T10:00:00Z",
    labels: [],
    ...overrides,
  };
}

describe("computeAcceptanceEntry — AI-PR classification", () => {
  it("counts a PR carrying only the agent-authored label as an AI PR", () => {
    const decided = [pr({ number: 1, labels: [{ name: "agent-authored" }] })];
    const entry = computeAcceptanceEntry(decided, { days: 30 });
    expect(entry.total_ai_prs).toBe(1);
    expect(entry.merged).toBe(1);
  });

  it("counts a PR matching a worker branch prefix with no labels as an AI PR", () => {
    const decided = [pr({ number: 2, headRefName: "worktree-agent-abc123", labels: [] })];
    const entry = computeAcceptanceEntry(decided, { days: 30 });
    expect(entry.total_ai_prs).toBe(1);
    expect(entry.merged).toBe(1);
  });

  it("classifies a has-pr-labeled PR the same way the shared predicate does", () => {
    // `has-pr` is an issue-state coordination label that mostly lands on
    // metrics-commit automation (gotchas.md § Build/pnpm/turbo) — asserted
    // explicitly here rather than assumed, per the shared `isAiPr` behavior.
    const decided = [
      pr({ number: 3, headRefName: "chore/queue-telemetry", labels: [{ name: "has-pr" }] }),
    ];
    const entry = computeAcceptanceEntry(decided, { days: 30 });
    expect(entry.total_ai_prs).toBe(1);
    expect(entry.merged).toBe(1);
  });

  it("excludes a human PR with no AI label and no worker branch", () => {
    const decided = [pr({ number: 4, labels: [{ name: "feature" }] })];
    const entry = computeAcceptanceEntry(decided, { days: 30 });
    expect(entry.total_ai_prs).toBe(0);
    expect(entry.acceptance_rate).toBeNull();
  });
});

describe("computeAcceptanceEntry — acceptance rate", () => {
  it("computes acceptance_rate over merged vs. rejected AI PRs", () => {
    const decided = [
      pr({ number: 1, labels: [{ name: "agent-authored" }], state: "MERGED", mergedAt: "d" }),
      pr({ number: 2, labels: [{ name: "agent-authored" }], state: "MERGED", mergedAt: "d" }),
      pr({
        number: 3,
        labels: [{ name: "agent-authored" }],
        state: "CLOSED",
        mergedAt: null,
      }),
    ];
    const entry = computeAcceptanceEntry(decided, { days: 30, date: "2026-06-11" });
    expect(entry).toEqual({
      date: "2026-06-11",
      window_days: 30,
      total_ai_prs: 3,
      merged: 2,
      rejected: 1,
      acceptance_rate: 0.67,
    });
  });

  it("returns acceptance_rate: null when there are no AI PRs in the window", () => {
    const decided = [pr({ labels: [{ name: "feature" }] })];
    const entry = computeAcceptanceEntry(decided, { days: 30 });
    expect(entry.acceptance_rate).toBeNull();
  });
});

describe("filterDecidedInWindow", () => {
  const sinceMs = new Date("2026-06-01T00:00:00Z").getTime();

  it("keeps a PR merged inside the window", () => {
    const prs = [pr({ mergedAt: "2026-06-05T00:00:00Z", closedAt: "2026-06-05T00:00:00Z" })];
    expect(filterDecidedInWindow(prs, sinceMs)).toHaveLength(1);
  });

  it("drops a PR whose terminal event is before the window", () => {
    const prs = [pr({ mergedAt: "2026-05-01T00:00:00Z", closedAt: "2026-05-01T00:00:00Z" })];
    expect(filterDecidedInWindow(prs, sinceMs)).toHaveLength(0);
  });

  it("drops an open PR (no terminal event yet)", () => {
    const prs = [pr({ state: "OPEN", mergedAt: null, closedAt: null })];
    expect(filterDecidedInWindow(prs, sinceMs)).toHaveLength(0);
  });
});
