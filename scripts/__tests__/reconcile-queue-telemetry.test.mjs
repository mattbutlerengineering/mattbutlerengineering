import { describe, it, expect, vi } from "vitest";
import { reconcileTelemetry } from "../reconcile-queue-telemetry.mjs";

// ── Helpers ──────────────────────────────────────────────

const NOW = new Date("2026-07-28T12:00:00.000Z");

function makeRow(overrides = {}) {
  return {
    issue_number: 1,
    labels: ["feature", "ready"],
    model_tier: "sonnet",
    duration_ms: 45000,
    pr_number: 101,
    merged: null,
    ci_first_pass: null,
    rework_cycles: null,
    reviewer_verdict: "pass",
    claimed_at: "2026-07-20T10:00:00.000Z",
    merged_at: null,
    ...overrides,
  };
}

// ── Reconciling PR-backed rows ───────────────────────────

describe("reconcileTelemetry — PR-backed rows", () => {
  it("fills outcome fields for a merged PR", () => {
    const fetchPr = vi.fn().mockReturnValue({
      state: "MERGED",
      mergedAt: "2026-07-21T09:00:00.000Z",
      commitCount: 3,
    });
    const { rows, reconciled } = reconcileTelemetry([makeRow()], { fetchPr, now: NOW });

    expect(reconciled).toBe(1);
    expect(rows[0]).toMatchObject({
      merged: true,
      merged_at: "2026-07-21T09:00:00.000Z",
      rework_cycles: 2,
      ci_first_pass: false,
    });
  });

  it("marks single-commit merged PRs as ci_first_pass", () => {
    const fetchPr = vi
      .fn()
      .mockReturnValue({ state: "MERGED", mergedAt: "2026-07-21T09:00:00.000Z", commitCount: 1 });
    const { rows } = reconcileTelemetry([makeRow()], { fetchPr, now: NOW });

    expect(rows[0].rework_cycles).toBe(0);
    expect(rows[0].ci_first_pass).toBe(true);
  });

  it("marks closed-unmerged PRs merged=false and leaves other outcome fields null", () => {
    const fetchPr = vi.fn().mockReturnValue({ state: "CLOSED", mergedAt: null, commitCount: 2 });
    const { rows } = reconcileTelemetry([makeRow()], { fetchPr, now: NOW });

    expect(rows[0]).toMatchObject({
      merged: false,
      merged_at: null,
      rework_cycles: null,
      ci_first_pass: null,
    });
  });

  it("leaves still-open PRs pending", () => {
    const fetchPr = vi.fn().mockReturnValue({ state: "OPEN", mergedAt: null, commitCount: 2 });
    const { rows, reconciled } = reconcileTelemetry([makeRow()], { fetchPr, now: NOW });

    expect(reconciled).toBe(0);
    expect(rows[0].merged).toBeNull();
  });

  it("skips rows that are already reconciled", () => {
    const fetchPr = vi.fn();
    const { rows } = reconcileTelemetry([makeRow({ merged: true })], { fetchPr, now: NOW });

    expect(fetchPr).not.toHaveBeenCalled();
    expect(rows[0].merged).toBe(true);
  });

  it("leaves a row untouched when the PR lookup fails, and continues with the rest", () => {
    const fetchPr = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error("gh: connection reset");
      })
      .mockReturnValueOnce({ state: "MERGED", mergedAt: "2026-07-21T09:00:00.000Z", commitCount: 1 });
    const input = [makeRow({ pr_number: 101 }), makeRow({ issue_number: 2, pr_number: 102 })];
    const { rows, reconciled } = reconcileTelemetry(input, { fetchPr, now: NOW });

    expect(reconciled).toBe(1);
    expect(rows[0].merged).toBeNull();
    expect(rows[1].merged).toBe(true);
  });

  it("caps GitHub lookups at maxCalls per run", () => {
    const fetchPr = vi
      .fn()
      .mockReturnValue({ state: "MERGED", mergedAt: "2026-07-21T09:00:00.000Z", commitCount: 1 });
    const input = Array.from({ length: 5 }, (_, i) =>
      makeRow({ issue_number: i + 1, pr_number: 200 + i })
    );
    const { reconciled } = reconcileTelemetry(input, { fetchPr, now: NOW, maxCalls: 3 });

    expect(fetchPr).toHaveBeenCalledTimes(3);
    expect(reconciled).toBe(3);
  });
});

// ── Rows without a PR ────────────────────────────────────

describe("reconcileTelemetry — PR-less rows", () => {
  it("leaves recent PR-less rows pending", () => {
    const row = makeRow({ pr_number: null, claimed_at: "2026-07-27T10:00:00.000Z" });
    const { rows } = reconcileTelemetry([row], { fetchPr: vi.fn(), now: NOW });

    expect(rows[0].merged).toBeNull();
  });

  it("marks PR-less rows older than 30 days merged=false so they stop pending forever", () => {
    const row = makeRow({ pr_number: null, claimed_at: "2026-06-01T10:00:00.000Z" });
    const { rows, reconciled } = reconcileTelemetry([row], { fetchPr: vi.fn(), now: NOW });

    expect(rows[0].merged).toBe(false);
    expect(reconciled).toBe(1);
  });
});

// ── Purity ───────────────────────────────────────────────

describe("reconcileTelemetry — purity", () => {
  it("returns new row objects and never mutates the input", () => {
    const input = [makeRow()];
    const snapshot = JSON.parse(JSON.stringify(input));
    const fetchPr = vi
      .fn()
      .mockReturnValue({ state: "MERGED", mergedAt: "2026-07-21T09:00:00.000Z", commitCount: 1 });

    const { rows } = reconcileTelemetry(input, { fetchPr, now: NOW });

    expect(input).toEqual(snapshot);
    expect(rows[0]).not.toBe(input[0]);
  });
});
