import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { reconcileTelemetry, defaultFetchPr } from "../reconcile-queue-telemetry.mjs";
import { fetchPrFacts } from "../lib/queue-telemetry-github-source.mjs";
import { buildCostIndex } from "../lib/queue-telemetry-cost-source.mjs";

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

const COMPLETE = {
  merged_at: "2026-07-21T09:00:00.000Z",
  ci_first_pass: true,
  reviewer_verdict: "pass",
  cost_usd: 1,
  model_tier: "sonnet",
};

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

  it("skips rows that are fully reconciled", () => {
    // Changed deliberately (#6924): `merged != null` alone no longer means done.
    // A row is done when every reconcilable field is known or carries a reason.
    const fetchPr = vi.fn();
    const { rows } = reconcileTelemetry([makeRow({ merged: true, ...COMPLETE })], {
      fetchPr,
      now: NOW,
    });

    expect(fetchPr).not.toHaveBeenCalled();
    expect(rows[0].merged).toBe(true);
  });

  it("leaves a row untouched when the PR lookup fails, and continues with the rest", () => {
    const fetchPr = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error("gh: connection reset");
      })
      .mockReturnValueOnce({
        state: "MERGED",
        mergedAt: "2026-07-21T09:00:00.000Z",
        commitCount: 1,
      });
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

// ── human_touch_reason on the finalization pass (#4239) ───

describe("reconcileTelemetry — human_touch_reason", () => {
  // `worktree-agent-` is one of pr-outcomes.js's AGENT_BRANCH_PREFIXES —
  // matching the fixtures in backfill-human-touch-reasons.test.mjs.
  const AGENT_PR = { headRefName: "worktree-agent-abc", labels: ["ready"] };

  function mergedPr(commitCount) {
    return { state: "MERGED", mergedAt: "2026-07-21T09:00:00.000Z", commitCount };
  }

  it("classifies a newly-merged row that has a genuine human commit", () => {
    const fetchPr = vi.fn().mockReturnValue(mergedPr(3));
    const fetchPrDetails = vi.fn().mockReturnValue({
      pr: AGENT_PR,
      humanCommit: {
        message: "fix: resolve merge conflicts in the router",
        ciConclusion: "success",
        reviewCommentsBefore: 0,
      },
    });

    const { rows } = reconcileTelemetry([makeRow()], { fetchPr, fetchPrDetails, now: NOW });

    expect(fetchPrDetails).toHaveBeenCalledWith(101);
    expect(rows[0].human_touch_reason).toBe("merge-conflict");
    expect(rows[0]).toMatchObject({ merged: true, rework_cycles: 2 });
  });

  it("does not classify when rework_cycles is 0", () => {
    const fetchPr = vi.fn().mockReturnValue(mergedPr(1));
    const fetchPrDetails = vi.fn();

    const { rows } = reconcileTelemetry([makeRow()], { fetchPr, fetchPrDetails, now: NOW });

    expect(fetchPrDetails).not.toHaveBeenCalled();
    expect(rows[0]).not.toHaveProperty("human_touch_reason");
    expect(rows[0].ci_first_pass).toBe(true);
  });

  it("writes no field when no human commit is discriminable", () => {
    // backfill-human-touch-reasons.mjs's documented "unmatchable" case:
    // every commit shares the PR author, or all the rest are mechanical.
    const fetchPr = vi.fn().mockReturnValue(mergedPr(4));
    const fetchPrDetails = vi.fn().mockReturnValue({ pr: AGENT_PR, humanCommit: null });

    const { rows, reconciled } = reconcileTelemetry([makeRow()], {
      fetchPr,
      fetchPrDetails,
      now: NOW,
    });

    expect(reconciled).toBe(1);
    expect(rows[0]).not.toHaveProperty("human_touch_reason");
    expect(rows[0].merged).toBe(true);
  });

  it("writes no field for a non-agent PR", () => {
    const fetchPr = vi.fn().mockReturnValue(mergedPr(3));
    const fetchPrDetails = vi.fn().mockReturnValue({
      pr: { headRefName: "matt/hand-written", labels: [] },
      humanCommit: { message: "fix: typo", ciConclusion: null, reviewCommentsBefore: 0 },
    });

    const { rows } = reconcileTelemetry([makeRow()], { fetchPr, fetchPrDetails, now: NOW });

    expect(rows[0]).not.toHaveProperty("human_touch_reason");
  });

  it("leaves the row reconciled when the details fetch throws", () => {
    // A failed classification must never cost the row its outcome fields —
    // merged/rework_cycles are what the queueEfficiency sensor consumes.
    const fetchPr = vi.fn().mockReturnValue(mergedPr(3));
    const fetchPrDetails = vi.fn().mockImplementation(() => {
      throw new Error("gh exploded");
    });

    const { rows, reconciled } = reconcileTelemetry([makeRow()], {
      fetchPr,
      fetchPrDetails,
      now: NOW,
    });

    expect(reconciled).toBe(1);
    expect(rows[0].merged).toBe(true);
    expect(rows[0]).not.toHaveProperty("human_touch_reason");
  });

  it("is idempotent: an already-merged row is never re-fetched or overwritten", () => {
    const fetchPr = vi.fn();
    const fetchPrDetails = vi.fn();
    const already = makeRow({
      ...COMPLETE,
      merged: true,
      rework_cycles: 2,
      ci_first_pass: false,
      human_touch_reason: "scope-change",
    });

    const { rows } = reconcileTelemetry([already], { fetchPr, fetchPrDetails, now: NOW });

    expect(fetchPr).not.toHaveBeenCalled();
    expect(fetchPrDetails).not.toHaveBeenCalled();
    expect(rows[0].human_touch_reason).toBe("scope-change");
  });

  it("classifies nothing when no fetchPrDetails is injected", () => {
    // Callers that only want outcome reconciliation keep today's behavior.
    const fetchPr = vi.fn().mockReturnValue(mergedPr(3));

    const { rows } = reconcileTelemetry([makeRow()], { fetchPr, now: NOW });

    expect(rows[0]).not.toHaveProperty("human_touch_reason");
    expect(rows[0].rework_cycles).toBe(2);
  });
});

// ── Revisiting incomplete rows (#6924) ───────────────────

describe("reconcileTelemetry — incomplete rows", () => {
  const facts = (over = {}) => ({
    state: "MERGED",
    mergedAt: "2026-07-21T09:00:00.000Z",
    commitCount: 1,
    ciGateFirstPass: true,
    reviewerVerdict: "pass",
    ...over,
  });
  const gap = (over = {}) =>
    makeRow({ merged: true, ...COMPLETE, reviewer_verdict: null, rework_cycles: 0, ...over });

  it("fetches a merged row missing its verdict once and fills it", () => {
    const fetchPr = vi.fn().mockReturnValue(facts({ reviewerVerdict: "flag" }));
    const { rows } = reconcileTelemetry([gap()], { fetchPr, now: NOW });

    expect(fetchPr).toHaveBeenCalledTimes(1);
    expect(rows[0].reviewer_verdict).toBe("flag");
  });

  it("records a reason when the verdict cannot be found", () => {
    const fetchPr = vi.fn().mockReturnValue(facts({ reviewerVerdict: null }));
    const { rows } = reconcileTelemetry([gap()], { fetchPr, now: NOW });

    expect(rows[0].reviewer_verdict).toBeNull();
    expect(rows[0].unknown_reasons).toEqual({ reviewer_verdict: "no-verdict-comment" });
  });

  it("is idempotent: the second run makes zero fetch calls", () => {
    const fetchPr = vi.fn().mockReturnValue(facts({ reviewerVerdict: null }));
    const input = [gap(), makeRow({ issue_number: 2, pr_number: 102 })];
    const first = reconcileTelemetry(input, { fetchPr, now: NOW });
    fetchPr.mockClear();
    const second = reconcileTelemetry(first.rows, { fetchPr, now: NOW });

    expect(fetchPr).not.toHaveBeenCalled();
    expect(second.rows).toEqual(first.rows);
  });

  it("uses the REST source and no longer shells out to gh pr view", () => {
    expect(defaultFetchPr).toBe(fetchPrFacts);
    const src = readFileSync(new URL("../reconcile-queue-telemetry.mjs", import.meta.url), "utf-8");
    expect(src).not.toMatch(/gh-client|pr\.view|"pr", "view"/);
  });

  it("does not add unknown_reasons when the source returns an error", () => {
    const fetchPr = vi.fn().mockReturnValue({ error: "boom" });
    const { rows, reconciled } = reconcileTelemetry([makeRow()], { fetchPr, now: NOW });

    expect(reconciled).toBe(0);
    expect(rows[0]).not.toHaveProperty("unknown_reasons");
    expect(rows[0].merged).toBeNull();
  });

  it("fills cost_usd from the ledger and records no-ledger-row otherwise", () => {
    const costIndex = buildCostIndex({
      factoryCosts: [{ wo: "#1", model: "claude-sonnet-5", cost: 2.5 }],
    });
    const fetchPr = vi.fn().mockReturnValue(facts());
    const input = [
      makeRow({ model_tier: null }),
      makeRow({ issue_number: 2, pr_number: 102, model_tier: null }),
    ];
    const { rows } = reconcileTelemetry(input, { fetchPr, costIndex, now: NOW });

    expect(rows[0]).toMatchObject({ cost_usd: 2.5, model_tier: "sonnet" });
    expect(rows[1].cost_usd).toBeNull();
    expect(rows[1].unknown_reasons).toMatchObject({ cost_usd: "no-ledger-row" });
  });

  it("fills only cost without a GitHub call when the PR fields are known", () => {
    const costIndex = buildCostIndex({
      factoryCosts: [{ wo: "#1", model: "claude-sonnet-5", cost: 2.5 }],
    });
    const fetchPr = vi.fn();
    const row = makeRow({ merged: true, ...COMPLETE, cost_usd: null, rework_cycles: 0 });
    const { rows } = reconcileTelemetry([row], { fetchPr, costIndex, now: NOW });

    expect(fetchPr).not.toHaveBeenCalled();
    expect(rows[0].cost_usd).toBe(2.5);
  });

  it("keeps existing PR-field reasons on the cost-only path", () => {
    const row = makeRow({
      merged: true,
      ...COMPLETE,
      ci_first_pass: null,
      cost_usd: null,
      model_tier: null,
      rework_cycles: 0,
      unknown_reasons: { ci_first_pass: "no-ci-gate-run" },
    });
    const { rows } = reconcileTelemetry([row], { fetchPr: vi.fn(), now: NOW });

    expect(rows[0].unknown_reasons).toEqual({
      ci_first_pass: "no-ci-gate-run",
      cost_usd: "no-ledger-row",
      model_tier: "no-ledger-row",
    });
  });

  it("prefers the CI Gate result over the commit-count heuristic", () => {
    const fetchPr = vi.fn().mockReturnValue(facts({ commitCount: 1, ciGateFirstPass: false }));
    const { rows } = reconcileTelemetry([makeRow()], { fetchPr, now: NOW });

    expect(rows[0].ci_first_pass).toBe(false);
  });

  it("falls back to the heuristic when GitHub has no CI Gate result", () => {
    const fetchPr = vi.fn().mockReturnValue(facts({ commitCount: 1, ciGateFirstPass: null }));
    const { rows } = reconcileTelemetry([makeRow()], { fetchPr, now: NOW });

    expect(rows[0].ci_first_pass).toBe(true);
  });

  it("gives stale PR-less rows no-pr reasons on fields that can never be known", () => {
    const row = makeRow({
      pr_number: null,
      claimed_at: "2026-06-01T10:00:00.000Z",
      reviewer_verdict: null,
    });
    const { rows } = reconcileTelemetry([row], { fetchPr: vi.fn(), now: NOW });

    expect(rows[0].merged).toBe(false);
    expect(rows[0].unknown_reasons).toMatchObject({
      merged_at: "no-pr",
      ci_first_pass: "no-pr",
      reviewer_verdict: "no-pr",
    });
  });

  it.each([null, undefined, "not-a-date"])(
    "gives a PR-less row with claimed_at %s an explicit no-claimed-at reason, not a silent null",
    (claimed_at) => {
      const row = makeRow({ pr_number: null, claimed_at, reviewer_verdict: null });
      const { rows } = reconcileTelemetry([row], { fetchPr: vi.fn(), now: NOW });

      expect(rows[0].merged).toBeNull();
      expect(rows[0].unknown_reasons).toMatchObject({
        merged: "no-claimed-at",
        merged_at: "no-claimed-at",
        ci_first_pass: "no-claimed-at",
        reviewer_verdict: "no-claimed-at",
      });
    }
  );
});
