import { test } from "node:test";
import assert from "node:assert/strict";
import { closeIssuesForPasses, applyIssuesForFailures } from "../issues.js";

/**
 * Unit tests for the issue lifecycle helpers — exercise pure logic via the
 * dryRun escape hatch so no `gh` calls are made.
 *
 * applyIssuesForFailures(dryRun): walks failing criteria, returns an updated
 *   issuesCreated map with a placeholder (-1) for what *would* be created.
 *
 * closeIssuesForPasses(dryRun): walks the prior issuesCreated map and prunes
 *   entries whose criterion id is now in detectedIds.
 */

const FAILING_CRITERION = {
  id: "acmm:fake-gap",
  source: "acmm",
  level: 5,
  category: "test",
  name: "Fake gap",
  description: "Just a fixture for unit tests.",
  rationale: "Exercise issue lifecycle without touching gh.",
  detection: { type: "any-of", pattern: ["nope-1.md", "nope-2.md"] },
};

test("applyIssuesForFailures dry-run records placeholder for new gaps", () => {
  const result = applyIssuesForFailures([FAILING_CRITERION], {}, { dryRun: true });
  assert.equal(result.createdCount, 1);
  assert.equal(result.skippedOpen, 0);
  assert.equal(result.issuesCreated["acmm:fake-gap"], -1);
});

test("applyIssuesForFailures preserves existing entries unchanged when criterion not in failing list", () => {
  const existing = { "acmm:other-gap": 42 };
  const result = applyIssuesForFailures([FAILING_CRITERION], existing, { dryRun: true });
  assert.equal(result.issuesCreated["acmm:other-gap"], 42, "untouched entries survive");
  assert.equal(result.issuesCreated["acmm:fake-gap"], -1, "new entry added");
});

test("closeIssuesForPasses dry-run removes entries whose criterion is now detected", () => {
  const existing = { "acmm:fake-gap": 100, "acmm:still-failing": 200 };
  const detected = new Set(["acmm:fake-gap"]); // only one passes now
  const result = closeIssuesForPasses(detected, existing, { dryRun: true });
  assert.equal(result.closedCount, 1);
  assert.equal(result.skipped, 0);
  assert.equal(result.issuesCreated["acmm:fake-gap"], undefined, "passing criterion's issue dropped");
  assert.equal(result.issuesCreated["acmm:still-failing"], 200, "still-failing entry preserved");
});

test("closeIssuesForPasses with empty detected set leaves map unchanged", () => {
  const existing = { "acmm:gap-a": 1, "acmm:gap-b": 2 };
  const result = closeIssuesForPasses(new Set(), existing, { dryRun: true });
  assert.equal(result.closedCount, 0);
  assert.deepEqual(result.issuesCreated, existing);
});

test("closeIssuesForPasses with empty existing map is a no-op", () => {
  const result = closeIssuesForPasses(new Set(["acmm:anything"]), {}, { dryRun: true });
  assert.equal(result.closedCount, 0);
  assert.equal(result.skipped, 0);
  assert.deepEqual(result.issuesCreated, {});
});

test("closeIssuesForPasses returns a new object — does not mutate input", () => {
  const existing = { "acmm:gap-a": 1 };
  const detected = new Set(["acmm:gap-a"]);
  const result = closeIssuesForPasses(detected, existing, { dryRun: true });
  assert.notEqual(result.issuesCreated, existing, "returns fresh reference");
  assert.equal(existing["acmm:gap-a"], 1, "input untouched");
});

test("close + apply compose correctly: passing criterion is closed, new gap is filed", () => {
  // Initial state: one issue exists for acmm:closed-gap (which now passes)
  const existing = { "acmm:closed-gap": 50 };
  const detected = new Set(["acmm:closed-gap"]);

  // 1. closeIssuesForPasses removes the passing one
  const closed = closeIssuesForPasses(detected, existing, { dryRun: true });
  assert.equal(closed.closedCount, 1);
  assert.equal(closed.issuesCreated["acmm:closed-gap"], undefined);

  // 2. applyIssuesForFailures adds new gap (uses pruned map)
  const applied = applyIssuesForFailures([FAILING_CRITERION], closed.issuesCreated, { dryRun: true });
  assert.equal(applied.createdCount, 1);
  assert.equal(applied.issuesCreated["acmm:fake-gap"], -1);
  assert.equal(applied.issuesCreated["acmm:closed-gap"], undefined, "closed entry stays gone");
});
