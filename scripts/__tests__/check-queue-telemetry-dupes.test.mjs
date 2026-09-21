/**
 * One row per (issue, PR) is `metrics/queue-telemetry.jsonl`'s invariant —
 * `appendTelemetryRow` has enforced it on the append path since it was
 * written. Both readers count rows and treat each as one merged PR, so a
 * doubled row inflates numerator and denominator alike.
 *
 * 32 duplicates got in anyway, via #4223, #4572 and #4719 — all
 * `chore(metrics): optimize-implement-queue` commits, because
 * `reconcile-queue-telemetry.mjs` rewrites the sink rather than appending,
 * and a rewrite landing on a main that has since gained rows reconciles as
 * "keep both". The append-path guard structurally cannot see that.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { evaluateTelemetryDuplicates } from "../check-queue-telemetry-dupes.mjs";
import { telemetryRowKey, dedupeTelemetryRows } from "../collect-queue-telemetry.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const row = (issue, pr, extra = {}) => ({ issue_number: issue, pr_number: pr, ...extra });

describe("telemetryRowKey", () => {
  it("identifies a row by issue and PR", () => {
    expect(telemetryRowKey(row(1, 2))).toBe("1::2");
  });

  it("gives a PR-less row no identity, so such rows are never merged", () => {
    // A worker that failed before opening a PR produces these; two of them
    // are two real events, not a duplicate.
    expect(telemetryRowKey(row(1, null))).toBeNull();
    expect(telemetryRowKey({ issue_number: 1 })).toBeNull();
  });
});

describe("dedupeTelemetryRows", () => {
  it("leaves a clean file untouched", () => {
    const rows = [row(1, 10), row(2, 11), row(3, null), row(4, null)];
    const result = dedupeTelemetryRows(rows);
    expect(result.removed).toBe(0);
    expect(result.rows).toHaveLength(4);
  });

  it("collapses a repeated identity, keeping the first", () => {
    const result = dedupeTelemetryRows([
      row(1, 10, { merged: true }),
      row(1, 10, { merged: true }),
    ]);
    expect(result.removed).toBe(1);
    expect(result.rows).toEqual([row(1, 10, { merged: true })]);
  });

  it("folds in a field the later copy carries and the first is missing", () => {
    const result = dedupeTelemetryRows([row(1, 10), row(1, 10, { human_touch_reason: "other" })]);
    expect(result.rows).toEqual([row(1, 10, { human_touch_reason: "other" })]);
  });

  it("promotes a null to a real value — the two real cases (#4168, #4202)", () => {
    const result = dedupeTelemetryRows([
      row(1, 10, { human_touch_reason: null }),
      row(1, 10, { human_touch_reason: "other" }),
    ]);
    expect(result.rows[0].human_touch_reason).toBe("other");
  });

  it("never overwrites a value the first row already holds", () => {
    const result = dedupeTelemetryRows([
      row(1, 10, { human_touch_reason: "ci-failure" }),
      row(1, 10, { human_touch_reason: "other" }),
    ]);
    expect(result.rows[0].human_touch_reason).toBe("ci-failure");
  });

  it("keeps every PR-less row, however many", () => {
    const result = dedupeTelemetryRows([row(1, null), row(1, null), row(2, null)]);
    expect(result.removed).toBe(0);
    expect(result.rows).toHaveLength(3);
  });

  it("is idempotent — running it twice changes nothing further", () => {
    const once = dedupeTelemetryRows([row(1, 10), row(1, 10), row(2, 11)]);
    const twice = dedupeTelemetryRows(once.rows);
    expect(twice.removed).toBe(0);
    expect(twice.rows).toEqual(once.rows);
  });
});

describe("evaluateTelemetryDuplicates", () => {
  it("passes a file with one row per identity", () => {
    expect(evaluateTelemetryDuplicates([row(1, 10), row(2, 11)]).findings).toEqual([]);
  });

  it("reports a duplicate identity with its 1-indexed line numbers", () => {
    expect(evaluateTelemetryDuplicates([row(1, 10), row(2, 11), row(1, 10)]).findings).toEqual([
      "issue #1 / PR #10 — 2 rows (lines 1, 3)",
    ]);
  });

  it("does not report rows without a PR", () => {
    expect(evaluateTelemetryDuplicates([row(1, null), row(1, null)]).findings).toEqual([]);
  });

  it("passes an empty file", () => {
    expect(evaluateTelemetryDuplicates([]).findings).toEqual([]);
  });
});

describe("the committed sink", () => {
  it("has exactly one row per (issue, PR)", () => {
    const rows = readFileSync(resolve(ROOT, "metrics/queue-telemetry.jsonl"), "utf-8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));

    expect(evaluateTelemetryDuplicates(rows).findings).toEqual([]);
  });
});
