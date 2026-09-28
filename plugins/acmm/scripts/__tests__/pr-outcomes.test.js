import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  computePrOutcomes,
  isAgentPr,
  isBookkeepingPr,
  extractRevertedPrNumbers,
  selectRecentChanges,
  isNonHumanAuthor,
  isMergeCommit,
  commitsShowHumanTouch,
  buildPrListArgs,
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

test("isAgentPr: agent-authored label matches even without prefix", () => {
  assert.equal(isAgentPr({ headRefName: "random-branch", labels: ["agent-authored"] }), true);
});

test("isAgentPr: has-pr label alone no longer counts (#5852 — undercounted fix/issue-* PRs)", () => {
  assert.equal(isAgentPr({ headRefName: "fix/issue-5807-guest-cap", labels: ["has-pr"] }), false);
});

test("isAgentPr: human branch with no label is excluded", () => {
  assert.equal(isAgentPr({ headRefName: "feat/manual-thing", labels: ["feature"] }), false);
});

// ── bookkeeping/automation exclusion (#5852 AC5) ─────────────────────────────

describe("isBookkeepingPr / isAgentPr: bookkeeping exclusions", () => {
  test("chore/acmm-* daily-audit PRs are excluded even though agent-authored in practice", () => {
    const pr = { headRefName: "chore/acmm-daily-audit-2026-09-28", labels: ["agent-authored"] };
    assert.equal(isBookkeepingPr(pr), true);
    assert.equal(isAgentPr(pr), false);
  });

  test("metrics/* snapshot PRs are excluded", () => {
    assert.equal(isBookkeepingPr({ headRefName: "metrics/progress-tracker-2026-09-28" }), true);
  });

  test("chore/queue-telemetry-* PRs are excluded", () => {
    assert.equal(isBookkeepingPr({ headRefName: "chore/queue-telemetry-2026-09-28" }), true);
  });

  test("automation/* producer PRs are excluded", () => {
    assert.equal(isBookkeepingPr({ headRefName: "automation/production-feedback" }), true);
  });

  test("dependabot/* branch is excluded even with agent-authored label", () => {
    const pr = { headRefName: "dependabot/npm_and_yarn/dev-deps-abc", labels: ["agent-authored"] };
    assert.equal(isAgentPr(pr), false);
  });

  test("known automation-bot author logins are excluded (both [bot] and app/ formats)", () => {
    assert.equal(isBookkeepingPr({ headRefName: "some-branch", author: "app/dependabot" }), true);
    assert.equal(isBookkeepingPr({ headRefName: "some-branch", author: "dependabot[bot]" }), true);
    assert.equal(
      isBookkeepingPr({ headRefName: "some-branch", author: "app/github-actions" }),
      true
    );
  });

  test("app/claude author is NOT bookkeeping — it's the agent itself", () => {
    assert.equal(isBookkeepingPr({ headRefName: "some-branch", author: "app/claude" }), false);
  });

  test("a genuine fix/issue-* agent PR with the agent-authored label counts", () => {
    const pr = { headRefName: "fix/issue-5807-guest-cap", labels: ["agent-authored"] };
    assert.equal(isAgentPr(pr), true);
  });
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
    pr({ number: i + 1, state: "CLOSED", mergedAt: null })
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

// ── this repo's real revert shapes (#5852 AC4) ───────────────────────────────
// Literal subjects from `6c0a54c51` and `2ccf9959e` on origin/main.

describe("extractRevertedPrNumbers: this repo's revert: convention", () => {
  test("revert: #<N> ... (#<revertPR>) — extracts only the reverted PR, not the revert's own PR", () => {
    const msg =
      "revert: #4924 brand Auth0 universal login (tenant name, logo, dark palette) (#5165)";
    assert.deepEqual(extractRevertedPrNumbers(msg), [4924]);
  });

  test("revert: auto-rollback agent commit <sha> (#<revertPR>) — resolves via the sha's own subject", () => {
    const msg = "revert: auto-rollback agent commit 1437560 (#5196)";
    const execFn = (bin, args) => {
      assert.equal(bin, "git");
      assert.deepEqual(args, ["log", "-1", "--format=%s", "1437560"]);
      return "fix(rialto): re-query focusable elements at Tab-keydown time in useFocusTrap (#5188)";
    };
    assert.deepEqual(extractRevertedPrNumbers(msg, { execFn }), [5188]);
  });

  test("auto-rollback resolution returns [] when git lookup fails", () => {
    const msg = "revert: auto-rollback agent commit deadbee (#9999)";
    const execFn = () => {
      throw new Error("unknown revision");
    };
    assert.deepEqual(extractRevertedPrNumbers(msg, { execFn }), []);
  });

  test("colon-revert is matched case-insensitively", () => {
    assert.deepEqual(extractRevertedPrNumbers("Revert: #100 fix thing (#101)"), [100]);
  });
});

test("selectRecentChanges: merged agent PRs, newest first, public fields only", () => {
  const prs = [
    pr({
      number: 1,
      title: "fix: older",
      url: "https://github.com/o/r/pull/1",
      mergedAt: "2026-04-20T00:00:00Z",
    }),
    pr({
      number: 2,
      title: "feat: newer",
      url: "https://github.com/o/r/pull/2",
      mergedAt: "2026-04-25T00:00:00Z",
    }),
  ];

  assert.deepEqual(selectRecentChanges(prs, { now: NOW }), [
    {
      number: 2,
      title: "feat: newer",
      url: "https://github.com/o/r/pull/2",
      mergedAt: "2026-04-25T00:00:00Z",
    },
    {
      number: 1,
      title: "fix: older",
      url: "https://github.com/o/r/pull/1",
      mergedAt: "2026-04-20T00:00:00Z",
    },
  ]);
});

test("selectRecentChanges: excludes unmerged, non-agent, and out-of-window PRs", () => {
  const prs = [
    pr({ number: 1, state: "OPEN", mergedAt: null }),
    pr({ number: 2, state: "CLOSED", mergedAt: null }),
    pr({ number: 3, headRefName: "feat/manual" }),
    pr({ number: 4, createdAt: OUTSIDE_WINDOW, mergedAt: OUTSIDE_WINDOW }),
    pr({ number: 5, url: "https://github.com/o/r/pull/5" }),
  ];

  assert.deepEqual(
    selectRecentChanges(prs, { now: NOW }).map((c) => c.number),
    [5]
  );
});

test("selectRecentChanges: caps the list at the requested limit", () => {
  const prs = Array.from({ length: 25 }, (_, i) =>
    pr({
      number: i + 1,
      mergedAt: new Date(Date.parse(WITHIN_WINDOW) + i * 60_000).toISOString(),
    })
  );

  assert.equal(selectRecentChanges(prs, { now: NOW }).length, 20);
  assert.equal(selectRecentChanges(prs, { now: NOW, recentLimit: 3 }).length, 3);
  assert.deepEqual(
    selectRecentChanges(prs, { now: NOW, recentLimit: 3 }).map((c) => c.number),
    [25, 24, 23]
  );
});

// ── human-touch detection (#5613) ────────────────────────────────────────────
//
// The L6 human-touch-ratio gate caps the repo's ACMM level. Before this fix it
// read 97.5% across the last 40 merged agent PRs in the 30-day window, because
// `Co-Authored-By: Claude <noreply@anthropic.com>` resolves to the GitHub login
// `claude` — so every commit carrying the repo's own attribution trailer was
// counted as a human stepping in, which is the opposite of what it means.

const HUMAN = "mattbutlerengineering";

test("isNonHumanAuthor: the claude co-author login is not a human", () => {
  assert.equal(isNonHumanAuthor("claude"), true);
  assert.equal(isNonHumanAuthor("Claude"), true);
});

test("isNonHumanAuthor: any [bot] suffix is non-human, including unlisted ones", () => {
  assert.equal(isNonHumanAuthor("dependabot[bot]"), true);
  assert.equal(isNonHumanAuthor("github-actions[bot]"), true);
  assert.equal(isNonHumanAuthor("some-future-thing[bot]"), true);
});

test("isNonHumanAuthor: a real login is human", () => {
  assert.equal(isNonHumanAuthor(HUMAN), false);
  assert.equal(isNonHumanAuthor("octocat"), false);
});

test("isNonHumanAuthor: a missing login is not counted as a human touch", () => {
  assert.equal(isNonHumanAuthor(""), true);
  assert.equal(isNonHumanAuthor(undefined), true);
});

// ── #5852 AC6: check the commit's own author set, not "vs the PR author" ────
//
// The `a.login !== prAuthor` rule made Matt invisible whenever he was also the
// PR's opener — the normal case for every worktree-agent PR he runs under his
// own account. The fix drops the PR-author comparison entirely: a commit is
// human-touched iff its own authors are ≥1 human and 0 bot/agent identities.

test("commitsShowHumanTouch: [claude] -> no", () => {
  // PR #5615's real shape: one commit, sole author `claude`. No human
  // involvement of any kind — and counted as human-touched before the fix.
  const commits = [{ authors: [{ login: "claude", email: "noreply@anthropic.com" }] }];
  assert.equal(commitsShowHumanTouch(commits), false);
});

test("commitsShowHumanTouch: [mattbutlerengineering, claude] -> no (co-authored trailer is agent evidence)", () => {
  const commits = [{ authors: [{ login: HUMAN }, { login: "claude" }] }];
  assert.equal(commitsShowHumanTouch(commits), false);
});

test("commitsShowHumanTouch: [mattbutlerengineering] -> yes (no agent trailer — genuinely hand-written)", () => {
  assert.equal(commitsShowHumanTouch([{ authors: [{ login: HUMAN }] }]), true);
});

test("commitsShowHumanTouch: merge commit by mattbutlerengineering -> no", () => {
  const commits = [
    { authors: [{ login: HUMAN }], messageHeadline: "Merge branch 'main' into feature" },
  ];
  assert.equal(commitsShowHumanTouch(commits), false);
});

test("commitsShowHumanTouch: a dependabot commit is not human-touched", () => {
  assert.equal(commitsShowHumanTouch([{ authors: [{ login: "dependabot[bot]" }] }]), false);
});

test("commitsShowHumanTouch: a genuinely different human's commit still counts", () => {
  const commits = [{ authors: [{ login: "a-reviewer" }] }];
  assert.equal(commitsShowHumanTouch(commits), true);
});

test("commitsShowHumanTouch: tolerates missing or malformed commit data", () => {
  assert.equal(commitsShowHumanTouch(undefined), false);
  assert.equal(commitsShowHumanTouch([]), false);
  assert.equal(commitsShowHumanTouch([{}]), false);
  assert.equal(commitsShowHumanTouch([{ authors: null }]), false);
});

describe("isMergeCommit", () => {
  test("matches the three merge-commit shapes", () => {
    assert.equal(isMergeCommit("Merge branch 'main' into feature"), true);
    assert.equal(isMergeCommit("Merge remote-tracking branch 'origin/main'"), true);
    assert.equal(isMergeCommit("Merge pull request #42 from foo/bar"), true);
  });

  test("does not match a normal commit or missing headline", () => {
    assert.equal(isMergeCommit("fix: merge conflicting state (#42)"), false);
    assert.equal(isMergeCommit(undefined), false);
  });
});

// ── date-bounded fetch args (#5852 AC7) ──────────────────────────────────────

describe("buildPrListArgs: real 30-day (+revert lookback) window, not a --limit page", () => {
  test("includes a --search created:>=<cutoff> bound derived from windowDays + REVERT_WINDOW_DAYS", () => {
    const args = buildPrListArgs({ now: NOW, windowDays: 30 });
    // 30 + 7 (REVERT_WINDOW_DAYS) = 37 days back from NOW (2026-04-26)
    const idx = args.indexOf("--search");
    assert.ok(idx >= 0, "expected a --search flag");
    assert.equal(args[idx + 1], "created:>=2026-03-20");
  });

  test("honors a custom limit", () => {
    const args = buildPrListArgs({ now: NOW, limit: 42 });
    const idx = args.indexOf("--limit");
    assert.equal(args[idx + 1], "42");
  });
});

// ── oldest_record_at: truncation visibility (#5852 AC7) ──────────────────────

test("computePrOutcomes: oldest_record_at reflects the full fetched list, not just inWindow", () => {
  const prs = [pr({ number: 1, createdAt: OUTSIDE_WINDOW }), pr({ number: 2 })];
  const r = computePrOutcomes(prs, { now: NOW });
  assert.equal(r.oldest_record_at, new Date(OUTSIDE_WINDOW).toISOString());
});

test("computePrOutcomes: oldest_record_at is null for an empty list", () => {
  const r = computePrOutcomes([], { now: NOW });
  assert.equal(r.oldest_record_at, null);
});
