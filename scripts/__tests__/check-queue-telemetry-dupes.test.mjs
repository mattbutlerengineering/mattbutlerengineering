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

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const row = (issue, pr, extra = {}) => ({ issue_number: issue, pr_number: pr, ...extra });

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
