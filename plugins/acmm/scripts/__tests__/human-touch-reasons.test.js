/**
 * Tests for the human-touch reason breakdown CLI/report formatter
 * (issue #4395, part 5/5 of the human-touch-reason classifier widening —
 * proposal #4324, following #4391-#4394).
 *
 * `computeReasonBreakdown`/`loadReasonBreakdown` are covered indirectly via
 * `report-human-touch-reasons.test.js`; this file covers
 * `formatReasonBreakdownReport` — the pure text formatter the CLI entry
 * point prints — including that the three widened categories
 * (`lint-fixup`, `generated-artifact-regen`, `ci-rerun`) render, and that
 * the "actionable" framing reflects `other`'s share rather than assuming
 * it dominates.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { computeReasonBreakdown, formatReasonBreakdownReport } from "../human-touch-reasons.js";

function daysAgo(n) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

test("formatReasonBreakdownReport: renders the three widened categories alongside the existing ones", () => {
  const breakdown = computeReasonBreakdown([
    { human_touch_reason: "review-fix", merged_at: daysAgo(1) },
    { human_touch_reason: "lint-fixup", merged_at: daysAgo(1) },
    { human_touch_reason: "generated-artifact-regen", merged_at: daysAgo(1) },
    { human_touch_reason: "ci-rerun", merged_at: daysAgo(1) },
    { human_touch_reason: "other", merged_at: daysAgo(1) },
  ]);

  const report = formatReasonBreakdownReport(breakdown);

  assert.match(report, /review-fix: 1/);
  assert.match(report, /lint-fixup: 1/);
  assert.match(report, /generated-artifact-regen: 1/);
  assert.match(report, /ci-rerun: 1/);
  assert.match(report, /other: 1/);
});

test("formatReasonBreakdownReport: mostly-diagnosed breakdown (other a minority) reads as actionable", () => {
  const breakdown = computeReasonBreakdown([
    { human_touch_reason: "review-fix", merged_at: daysAgo(1) },
    { human_touch_reason: "lint-fixup", merged_at: daysAgo(1) },
    { human_touch_reason: "generated-artifact-regen", merged_at: daysAgo(1) },
    { human_touch_reason: "ci-rerun", merged_at: daysAgo(1) },
    { human_touch_reason: "other", merged_at: daysAgo(1) },
  ]);

  const report = formatReasonBreakdownReport(breakdown);

  assert.match(report, /actionable/i);
  assert.doesNotMatch(report, /not actionable/i);
});

test("formatReasonBreakdownReport: other-dominated breakdown still reads as not-yet-actionable", () => {
  const breakdown = computeReasonBreakdown([
    { human_touch_reason: "other", merged_at: daysAgo(1) },
    { human_touch_reason: "other", merged_at: daysAgo(1) },
    { human_touch_reason: "other", merged_at: daysAgo(1) },
    { human_touch_reason: "review-fix", merged_at: daysAgo(1) },
  ]);

  const report = formatReasonBreakdownReport(breakdown);

  assert.match(report, /not (yet )?actionable/i);
});

test("formatReasonBreakdownReport: null breakdown (no data) renders a no-data message, not a crash", () => {
  const report = formatReasonBreakdownReport(null);

  assert.match(report, /no.*data/i);
});

test("formatReasonBreakdownReport: omits zero-count categories", () => {
  const breakdown = computeReasonBreakdown([
    { human_touch_reason: "review-fix", merged_at: daysAgo(1) },
  ]);

  const report = formatReasonBreakdownReport(breakdown);

  assert.doesNotMatch(report, /merge-conflict/);
  assert.doesNotMatch(report, /scope-change/);
});
