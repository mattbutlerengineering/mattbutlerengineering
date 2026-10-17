import { describe, it, expect } from "vitest";
import { reconcileTelemetryRow } from "../reconcile-telemetry-row.mjs";

function deepFreeze(o) {
  Object.values(o).forEach((v) => typeof v === "object" && v !== null && deepFreeze(v));
  return Object.freeze(o);
}

const makeRow = (overrides = {}) => ({
  issue_number: 1,
  pr_number: 101,
  model_tier: null,
  merged: null,
  merged_at: null,
  ci_first_pass: null,
  reviewer_verdict: null,
  cost_usd: null,
  ...overrides,
});

const MERGED_PR = {
  state: "MERGED",
  mergedAt: "2026-10-17T09:00:00.000Z",
  ciGateFirstPass: true,
  reviewerVerdict: "pass",
};
const COST = { costUsd: 0.42, modelTier: "sonnet" };

describe("reconcileTelemetryRow — filled", () => {
  it("fills every field from a merged PR and a cost row", () => {
    const out = reconcileTelemetryRow(makeRow(), { pr: MERGED_PR, cost: COST });
    expect(out).toMatchObject({
      merged: true,
      merged_at: "2026-10-17T09:00:00.000Z",
      ci_first_pass: true,
      reviewer_verdict: "pass",
      cost_usd: 0.42,
      model_tier: "sonnet",
    });
    expect(out.unknown_reasons).toBeUndefined();
  });

  it("fills merged=false for a closed PR", () => {
    const out = reconcileTelemetryRow(makeRow(), { pr: { state: "CLOSED" }, cost: COST });
    expect(out.merged).toBe(false);
  });
});

describe("reconcileTelemetryRow — kept", () => {
  it("never overwrites an in-session reviewer_verdict or model_tier", () => {
    const row = makeRow({ reviewer_verdict: "flag", model_tier: "opus" });
    const out = reconcileTelemetryRow(row, {
      pr: { ...MERGED_PR, reviewerVerdict: "pass" },
      cost: COST,
    });
    expect(out.reviewer_verdict).toBe("flag");
    expect(out.model_tier).toBe("opus");
  });

  it("keeps existing merged/ci_first_pass/cost_usd values", () => {
    const row = makeRow({ merged: true, ci_first_pass: false, cost_usd: 9 });
    const out = reconcileTelemetryRow(row, { pr: MERGED_PR, cost: COST });
    expect(out).toMatchObject({ merged: true, ci_first_pass: false, cost_usd: 9 });
  });

  it("clears a stale unknown_reasons entry once the field is filled", () => {
    const row = makeRow({ unknown_reasons: { cost_usd: "no-ledger-row", merged: "pr-open" } });
    const out = reconcileTelemetryRow(row, { pr: MERGED_PR, cost: COST });
    expect(out.unknown_reasons).toBeUndefined();
  });
});

describe("reconcileTelemetryRow — unknown with reason", () => {
  it("records pr-open and leaves outcome fields null for an OPEN PR", () => {
    const out = reconcileTelemetryRow(makeRow(), { pr: { state: "OPEN" }, cost: COST });
    expect(out.merged).toBeNull();
    expect(out.merged_at).toBeNull();
    expect(out.unknown_reasons).toMatchObject({
      merged: "pr-open",
      merged_at: "pr-open",
      ci_first_pass: "pr-open",
      reviewer_verdict: "pr-open",
    });
  });

  it("records no-pr when the row has no PR and no source", () => {
    const out = reconcileTelemetryRow(makeRow({ pr_number: null }), { pr: null, cost: COST });
    expect(out.unknown_reasons.merged).toBe("no-pr");
  });

  it("records pr-not-found when the row has a PR but the source has none", () => {
    const out = reconcileTelemetryRow(makeRow(), { pr: null, cost: COST });
    expect(out.unknown_reasons.merged).toBe("pr-not-found");
  });

  it("records source-error when the PR source errored", () => {
    const out = reconcileTelemetryRow(makeRow(), { pr: { error: "boom" }, cost: COST });
    expect(out.unknown_reasons.ci_first_pass).toBe("source-error");
  });

  it("records no-ci-gate-run and no-verdict-comment for a merged PR missing them", () => {
    const pr = { state: "MERGED", mergedAt: "2026-10-17T09:00:00.000Z" };
    const out = reconcileTelemetryRow(makeRow(), { pr, cost: COST });
    expect(out.unknown_reasons).toMatchObject({
      ci_first_pass: "no-ci-gate-run",
      reviewer_verdict: "no-verdict-comment",
    });
  });

  it("records no-ledger-row when there is no cost source", () => {
    const out = reconcileTelemetryRow(makeRow(), { pr: MERGED_PR, cost: null });
    expect(out.unknown_reasons).toMatchObject({
      cost_usd: "no-ledger-row",
      model_tier: "no-ledger-row",
    });
  });

  it("records unmapped-model when cost is known but the tier is not", () => {
    const out = reconcileTelemetryRow(makeRow(), {
      pr: MERGED_PR,
      cost: { costUsd: 1, modelTier: null },
    });
    expect(out.cost_usd).toBe(1);
    expect(out.unknown_reasons).toEqual({ model_tier: "unmapped-model" });
  });

  it("leaves no reconcilable field silently null after a definitive pass", () => {
    const out = reconcileTelemetryRow(makeRow(), { pr: { state: "CLOSED" }, cost: null });
    for (const f of [
      "merged",
      "merged_at",
      "ci_first_pass",
      "reviewer_verdict",
      "cost_usd",
      "model_tier",
    ]) {
      expect(out[f] !== null || out.unknown_reasons?.[f]).toBeTruthy();
    }
  });
});

describe("reconcileTelemetryRow — purity", () => {
  it("does not mutate a deep-frozen input", () => {
    const row = deepFreeze(makeRow({ unknown_reasons: { cost_usd: "no-ledger-row" } }));
    expect(() => reconcileTelemetryRow(row, { pr: MERGED_PR, cost: COST })).not.toThrow();
    expect(row.unknown_reasons).toEqual({ cost_usd: "no-ledger-row" });
    expect(row.merged).toBeNull();
  });
});
