import { test } from "node:test";
import assert from "node:assert/strict";

import { computeFlakeRate } from "../flake-rate.js";

const NOW = new Date("2026-04-26T12:00:00Z");
const WITHIN_WINDOW = "2026-04-25T12:00:00Z"; // 1 day ago
const OUTSIDE_WINDOW = "2026-03-20T12:00:00Z"; // ~37 days ago

test("computeFlakeRate: empty input → zero rate, zero sample, no flakes", () => {
  const r = computeFlakeRate([], { now: NOW });
  assert.equal(r.flake_rate_30d, 0);
  assert.equal(r.flake_sample_size, 0);
  assert.deepEqual(r.flaky_shas, []);
});

test("computeFlakeRate: all-success → zero rate", () => {
  const runs = [
    { headSha: "aaa", conclusion: "success", createdAt: WITHIN_WINDOW },
    { headSha: "bbb", conclusion: "success", createdAt: WITHIN_WINDOW },
    { headSha: "ccc", conclusion: "success", createdAt: WITHIN_WINDOW },
  ];
  const r = computeFlakeRate(runs, { now: NOW });
  assert.equal(r.flake_rate_30d, 0);
  assert.equal(r.flake_sample_size, 3);
  assert.deepEqual(r.flaky_shas, []);
});

test("computeFlakeRate: all-failure (no flips) → zero rate, sample counted", () => {
  const runs = [
    { headSha: "aaa", conclusion: "failure", createdAt: WITHIN_WINDOW },
    { headSha: "bbb", conclusion: "failure", createdAt: WITHIN_WINDOW },
  ];
  const r = computeFlakeRate(runs, { now: NOW });
  assert.equal(r.flake_rate_30d, 0);
  assert.equal(r.flake_sample_size, 2);
  assert.deepEqual(r.flaky_shas, []);
});

test("computeFlakeRate: SHA with both success and failure → flake", () => {
  const runs = [
    { headSha: "aaa", conclusion: "failure", createdAt: WITHIN_WINDOW },
    { headSha: "aaa", conclusion: "success", createdAt: WITHIN_WINDOW },
    { headSha: "bbb", conclusion: "success", createdAt: WITHIN_WINDOW },
  ];
  const r = computeFlakeRate(runs, { now: NOW });
  assert.equal(r.flake_sample_size, 2);
  assert.equal(r.flake_rate_30d, 0.5); // 1 flake out of 2 SHAs
  assert.deepEqual(r.flaky_shas, ["aaa"]);
});

test("computeFlakeRate: multiple flips on same SHA collapse to one flake", () => {
  const runs = [
    { headSha: "aaa", conclusion: "failure", createdAt: WITHIN_WINDOW },
    { headSha: "aaa", conclusion: "success", createdAt: WITHIN_WINDOW },
    { headSha: "aaa", conclusion: "failure", createdAt: WITHIN_WINDOW },
    { headSha: "aaa", conclusion: "success", createdAt: WITHIN_WINDOW },
  ];
  const r = computeFlakeRate(runs, { now: NOW });
  assert.equal(r.flake_sample_size, 1);
  assert.equal(r.flake_rate_30d, 1); // 1 flaky SHA / 1 SHA
  assert.deepEqual(r.flaky_shas, ["aaa"]);
});

test("computeFlakeRate: outside-window runs are excluded", () => {
  const runs = [
    { headSha: "old1", conclusion: "failure", createdAt: OUTSIDE_WINDOW },
    { headSha: "old1", conclusion: "success", createdAt: OUTSIDE_WINDOW },
    { headSha: "new1", conclusion: "success", createdAt: WITHIN_WINDOW },
  ];
  const r = computeFlakeRate(runs, { now: NOW });
  assert.equal(r.flake_sample_size, 1);
  assert.equal(r.flake_rate_30d, 0);
  assert.deepEqual(r.flaky_shas, []); // old flake outside window doesn't count
});

test("computeFlakeRate: malformed records (missing fields) are skipped silently", () => {
  const runs = [
    { headSha: "", conclusion: "success", createdAt: WITHIN_WINDOW },
    { headSha: "aaa", conclusion: "", createdAt: WITHIN_WINDOW },
    { headSha: "bbb", conclusion: "success", createdAt: "not-a-date" },
    { headSha: "ccc", conclusion: "success", createdAt: WITHIN_WINDOW },
  ];
  const r = computeFlakeRate(runs, { now: NOW });
  assert.equal(r.flake_sample_size, 1); // only ccc survives
  assert.equal(r.flake_rate_30d, 0);
});

test("computeFlakeRate: cancelled/skipped conclusions don't count as flips", () => {
  // Only success-vs-failure flips count; cancelled is noise, not a signal
  const runs = [
    { headSha: "aaa", conclusion: "cancelled", createdAt: WITHIN_WINDOW },
    { headSha: "aaa", conclusion: "success", createdAt: WITHIN_WINDOW },
    { headSha: "bbb", conclusion: "skipped", createdAt: WITHIN_WINDOW },
    { headSha: "bbb", conclusion: "failure", createdAt: WITHIN_WINDOW },
  ];
  const r = computeFlakeRate(runs, { now: NOW });
  assert.equal(r.flake_sample_size, 2);
  assert.equal(r.flake_rate_30d, 0);
  assert.deepEqual(r.flaky_shas, []);
});

test("computeFlakeRate: custom window honored", () => {
  const runs = [
    // 3 days ago: would be in default 30d window, out of custom 1d window
    {
      headSha: "aaa",
      conclusion: "success",
      createdAt: new Date(NOW.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    },
    // 1 hour ago: in any reasonable window
    {
      headSha: "bbb",
      conclusion: "success",
      createdAt: new Date(NOW.getTime() - 60 * 60 * 1000).toISOString(),
    },
  ];
  const r = computeFlakeRate(runs, { now: NOW, windowDays: 1 });
  assert.equal(r.flake_sample_size, 1);
});
