/**
 * Field-coverage summary for the queue-telemetry sink (#6943). The load-bearing
 * distinction is `unknown` (null WITH a reason: honest) vs `silent` (null with
 * no reason: the reconciler did not run or did not finish).
 */
import { describe, it, expect } from "vitest";
import {
  summarizeFieldCoverage,
  formatCoverageMarkdown,
  silentRowCount,
} from "../queue-telemetry-coverage.mjs";

const FULL = {
  merged: true,
  merged_at: "2026-10-10T00:00:00Z",
  ci_first_pass: true,
  reviewer_verdict: "pass",
  cost_usd: 0.5,
  model_tier: "sonnet",
};
const row = (over = {}) => ({ claimed_at: "2026-10-10T00:00:00Z", ...FULL, ...over });

describe("summarizeFieldCoverage", () => {
  it("counts known, unknown-with-reason and silent per field", () => {
    const rows = [
      row(),
      row({ cost_usd: null, unknown_reasons: { cost_usd: "no-ledger-row" } }),
      row({ cost_usd: null }),
    ];
    const s = summarizeFieldCoverage(rows);
    expect(s.rows_n).toBe(3);
    expect(s.fields.cost_usd).toEqual({
      known: 1,
      unknown: 1,
      silent: 1,
      unknown_by_reason: { "no-ledger-row": 1 },
    });
    expect(s.fields.merged).toEqual({ known: 3, unknown: 0, silent: 0, unknown_by_reason: {} });
  });

  it("covers exactly the reconcilable fields", () => {
    expect(Object.keys(summarizeFieldCoverage([row()]).fields).sort()).toEqual(
      ["ci_first_pass", "cost_usd", "merged", "merged_at", "model_tier", "reviewer_verdict"].sort()
    );
  });

  it("treats merged:false as known", () => {
    expect(summarizeFieldCoverage([row({ merged: false })]).fields.merged.known).toBe(1);
  });

  it("windows by claimed_at with since", () => {
    const rows = [row({ claimed_at: "2026-10-01T00:00:00Z" }), row()];
    const s = summarizeFieldCoverage(rows, { since: new Date("2026-10-05T00:00:00Z") });
    expect(s.rows_n).toBe(1);
  });

  it("silentRowCount counts rows with at least one silent null", () => {
    const rows = [row(), row({ merged: null }), row({ merged: null, cost_usd: null })];
    expect(silentRowCount(rows)).toBe(2);
  });
});

describe("formatCoverageMarkdown", () => {
  it("prints one table row per reconcilable field", () => {
    const md = formatCoverageMarkdown(summarizeFieldCoverage([row()]));
    const dataRows = md
      .split("\n")
      .filter((l) =>
        /^\| (merged|merged_at|ci_first_pass|reviewer_verdict|cost_usd|model_tier) /.test(l)
      );
    expect(dataRows).toHaveLength(6);
  });
});
