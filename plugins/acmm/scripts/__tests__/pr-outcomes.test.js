import { test } from "node:test";
import assert from "node:assert/strict";

import {
  computePrOutcomes,
  isAgentPr,
  extractRevertedPrNumbers,
} from "../pr-outcomes.js";

const NOW = new Date("2026-04-26T12:00:00Z");
const WITHIN_WINDOW = "2026-04-25T12:00:00Z";
const OUTSIDE_WINDOW = "2026-03-20T12:00:00Z";

function pr(overrides = {}) {
  return {
    number: 1,
    title: "test",
    headRefName: "agent-foo",
    state: "MERGED",
    createdAt: WITHIN_WINDOW,
    mergedAt: "2026-04-26T00:00:00Z",
    labels: [],
    author: "agent-bot",
    reverted_within_7d: false,
    human_touched: false,
    ...overrides,
  };
}

test("isAgentPr: branch prefix matches", () => {
  assert.equal(isAgentPr({ headRefName: "agent-fix-login", labels: [] }), true);
  assert.equal(isAgentPr({ headRefName: "worktree-agent-abc", labels: [] }), true);
  assert.equal(isAgentPr({ headRefName: "fix/agent-cleanup", labels: [] }), true);
  assert.equal(isAgentPr({ headRefName: "feat/agent-search", labels: [] }), true);
});

test("isAgentPr: has-pr label matches even without prefix", () => {
  assert.equal(isAgentPr({ headRefName: "random-branch", labels: ["has-pr"] }), true);
});

test("isAgentPr: human branch with no label is excluded", () => {
  assert.equal(isAgentPr({ headRefName: "feat/manual-thing", labels: ["feature"] }), false);
});

test("computePrOutcomes: zero PRs → insufficient_data, all zeros", () => {
  const r = computePrOutcomes([], { now: NOW });
  assert.equal(r.sample_size, 0);
  assert.equal(r.merged_count, 0);
  assert.equal(r.acceptance_rate_30d, 0);
  assert.equal(r.revert_rate_30d, 0);
  assert.equal(r.median_time_to_merge_hours, 0);
  assert.equal(r.human_touch_ratio, 0);
  assert.equal(r.insufficient_data, true);
});

test("computePrOutcomes: all-merged → 100% acceptance", () => {
  const prs = [
    pr({ number: 1 }),
    pr({ number: 2 }),
    pr({ number: 3 }),
    pr({ number: 4 }),
    pr({ number: 5 }),
  ];
  const r = computePrOutcomes(prs, { now: NOW });
  assert.equal(r.sample_size, 5);
  assert.equal(r.merged_count, 5);
  assert.equal(r.acceptance_rate_30d, 1);
  assert.equal(r.insufficient_data, false);
});

test("computePrOutcomes: all-closed-unmerged → 0% acceptance", () => {
  const prs = Array.from({ length: 5 }, (_, i) =>
    pr({ number: i + 1, state: "CLOSED", mergedAt: null }),
  );
  const r = computePrOutcomes(prs, { now: NOW });
  assert.equal(r.merged_count, 0);
  assert.equal(r.closed_unmerged_count, 5);
  assert.equal(r.acceptance_rate_30d, 0);
});

test("computePrOutcomes: open PRs excluded from acceptance denominator", () => {
  const prs = [
    pr({ number: 1, state: "MERGED" }),
    pr({ number: 2, state: "OPEN", mergedAt: null }),
    pr({ number: 3, state: "OPEN", mergedAt: null }),
    pr({ number: 4, state: "CLOSED", mergedAt: null }),
    pr({ number: 5, state: "MERGED" }),
  ];
  const r = computePrOutcomes(prs, { now: NOW });
  // 2 merged + 1 closed-unmerged = 3 decided; acceptance = 2/3
  assert.equal(r.acceptance_rate_30d, 2 / 3);
  assert.equal(r.open_count, 2);
});

test("computePrOutcomes: revert flag inflates revert_rate_30d", () => {
  const prs = [
    pr({ number: 1, reverted_within_7d: true }),
    pr({ number: 2 }),
    pr({ number: 3 }),
    pr({ number: 4 }),
  ];
  const r = computePrOutcomes(prs, { now: NOW });
  assert.equal(r.merged_count, 4);
  assert.equal(r.revert_rate_30d, 0.25);
});

test("computePrOutcomes: median time to merge — odd count picks middle", () => {
  const prs = [
    pr({ number: 1, createdAt: "2026-04-25T00:00:00Z", mergedAt: "2026-04-25T01:00:00Z" }), // 1h
    pr({ number: 2, createdAt: "2026-04-25T00:00:00Z", mergedAt: "2026-04-25T03:00:00Z" }), // 3h
    pr({ number: 3, createdAt: "2026-04-25T00:00:00Z", mergedAt: "2026-04-25T05:00:00Z" }), // 5h
  ];
  const r = computePrOutcomes(prs, { now: NOW });
  assert.equal(r.median_time_to_merge_hours, 3);
});

test("computePrOutcomes: median time to merge — even count averages", () => {
  const prs = [
    pr({ number: 1, createdAt: "2026-04-25T00:00:00Z", mergedAt: "2026-04-25T02:00:00Z" }), // 2h
    pr({ number: 2, createdAt: "2026-04-25T00:00:00Z", mergedAt: "2026-04-25T04:00:00Z" }), // 4h
  ];
  const r = computePrOutcomes(prs, { now: NOW });
  assert.equal(r.median_time_to_merge_hours, 3);
});

test("computePrOutcomes: human_touched merged PRs raise the ratio", () => {
  const prs = [
    pr({ number: 1, human_touched: true }),
    pr({ number: 2 }),
    pr({ number: 3 }),
    pr({ number: 4 }),
  ];
  const r = computePrOutcomes(prs, { now: NOW });
  assert.equal(r.human_touch_ratio, 0.25);
});

test("computePrOutcomes: out-of-window PRs excluded", () => {
  const prs = [
    pr({ number: 1, createdAt: OUTSIDE_WINDOW, mergedAt: OUTSIDE_WINDOW }),
    pr({ number: 2 }),
  ];
  const r = computePrOutcomes(prs, { now: NOW });
  assert.equal(r.sample_size, 1);
});

test("computePrOutcomes: non-agent PRs excluded", () => {
  const prs = [
    pr({ number: 1, headRefName: "feat/manual" }), // not agent
    pr({ number: 2 }),
  ];
  const r = computePrOutcomes(prs, { now: NOW });
  assert.equal(r.sample_size, 1);
});

test("computePrOutcomes: minSample threshold honored", () => {
  const prs = Array.from({ length: 4 }, (_, i) => pr({ number: i + 1 }));
  const r = computePrOutcomes(prs, { now: NOW, minSample: 5 });
  assert.equal(r.insufficient_data, true);

  const r2 = computePrOutcomes(prs, { now: NOW, minSample: 3 });
  assert.equal(r2.insufficient_data, false);
});

test("extractRevertedPrNumbers: parses standard revert title", () => {
  const msg = 'Revert "feat: add foo (#42)"\n\nThis reverts commit abc123.';
  assert.deepEqual(extractRevertedPrNumbers(msg), [42]);
});

test("extractRevertedPrNumbers: returns empty for non-revert messages", () => {
  assert.deepEqual(extractRevertedPrNumbers("feat: add bar (#10)"), []);
  assert.deepEqual(extractRevertedPrNumbers(""), []);
  assert.deepEqual(extractRevertedPrNumbers(null), []);
});

test("extractRevertedPrNumbers: multiple PR mentions all captured", () => {
  const msg = 'Revert "merge bundle (#1, #2, #3)"';
  assert.deepEqual(extractRevertedPrNumbers(msg), [1, 2, 3]);
});
