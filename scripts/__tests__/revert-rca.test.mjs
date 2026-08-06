import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, vi } from "vitest";
import { COORDINATION_LABELS } from "@mbe/gh-client";
import {
  buildRcaCreateArgs,
  buildRevertPrListArgs,
  buildRevertPrSearchArgs,
  mergeRevertCandidates,
  findRevertPr,
  classifyRevertState,
  buildRcaBody,
  extractRcaPrNumber,
  findPriorRcaIssue,
  runRevertRca,
} from "../revert-rca.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("buildRcaCreateArgs", () => {
  it("uses the shared ready label constant instead of a re-typed literal (#2933)", () => {
    const argsArr = buildRcaCreateArgs("title", "body");

    const readyIdx = argsArr.indexOf(COORDINATION_LABELS.READY);
    expect(readyIdx).toBeGreaterThan(-1);
    expect(argsArr[readyIdx - 1]).toBe("--label");
  });

  it("includes title and body verbatim alongside the non-state labels", () => {
    const argsArr = buildRcaCreateArgs("My RCA Title", "My RCA Body");

    expect(argsArr).toEqual([
      "--title",
      "My RCA Title",
      "--body",
      "My RCA Body",
      "--label",
      "meta-improvement",
      "--label",
      "ready",
      "--label",
      "critical",
    ]);
  });
});

// ---------------------------------------------------------------------------
// findRevertPr / classifyRevertState — the real fix for #3583. A revert PR is
// identified by its `revert:` title referencing the original PR number, never
// by assuming the original PR's own merge commit is "the revert."
// ---------------------------------------------------------------------------

describe("findRevertPr", () => {
  it("matches a PR titled 'revert: #<N> ...' referencing the original PR", () => {
    const prs = [
      { number: 3559, title: "revert: #3545 (fixes broken main)", state: "OPEN" },
      { number: 1, title: "unrelated PR", state: "MERGED" },
    ];

    expect(findRevertPr(prs, 3545)).toEqual(prs[0]);
  });

  it("does not match a PR that merely mentions the number without a revert: title", () => {
    const prs = [{ number: 10, title: "fix: follow-up to #3545", state: "MERGED" }];

    expect(findRevertPr(prs, 3545)).toBeNull();
  });

  it("returns null for empty or nullish input", () => {
    expect(findRevertPr([], 3545)).toBeNull();
    expect(findRevertPr(null, 3545)).toBeNull();
    expect(findRevertPr(undefined, 3545)).toBeNull();
  });

  // ---------------------------------------------------------------------
  // #3613 gap 2: ordering must never decide the winner when multiple
  // revert: PRs exist for the same original PR — a MERGED candidate must
  // win over a stale closed/abandoned one, regardless of which sorts first
  // in the candidate list.
  // ---------------------------------------------------------------------
  it("prefers a MERGED revert PR even when a closed/abandoned attempt sorts first (#3613)", () => {
    const prs = [
      { number: 3559, title: "revert: #3545 (fixes broken main)", state: "CLOSED" },
      {
        number: 3600,
        title: "revert: #3545 (fixes broken main, take 2)",
        state: "MERGED",
        mergedAt: "2026-01-02T00:00:00Z",
        mergeCommit: { oid: "realrevertsha" },
      },
    ];

    expect(findRevertPr(prs, 3545)).toEqual(prs[1]);
  });

  it("prefers a MERGED revert PR even when it sorts first (order-independence)", () => {
    const prs = [
      {
        number: 3600,
        title: "revert: #3545 (fixes broken main, take 2)",
        state: "MERGED",
        mergedAt: "2026-01-02T00:00:00Z",
        mergeCommit: { oid: "realrevertsha" },
      },
      { number: 3559, title: "revert: #3545 (fixes broken main)", state: "CLOSED" },
    ];

    expect(findRevertPr(prs, 3545)).toEqual(prs[0]);
  });

  it("falls back to the first match when no candidate is MERGED (unchanged behavior)", () => {
    const prs = [
      { number: 3559, title: "revert: #3545 (fixes broken main)", state: "OPEN" },
      { number: 3560, title: "revert: #3545 (fixes broken main, take 2)", state: "CLOSED" },
    ];

    expect(findRevertPr(prs, 3545)).toEqual(prs[0]);
  });
});

// ---------------------------------------------------------------------------
// #3613 gap 1: `searchRevertPrs` must not depend on GitHub's Search API,
// which lags minutes-to-hours behind reality — a revert PR merged seconds
// before the merge-triggered workflow runs can be invisible to Search but
// must still be visible to a direct PR list.
// ---------------------------------------------------------------------------
describe("buildRevertPrListArgs", () => {
  it("does not use --search (Search API is index-lagged, #3613)", () => {
    const argsArr = buildRevertPrListArgs();
    expect(argsArr).not.toContain("--search");
  });

  it("lists across all PR states so a just-merged revert is included", () => {
    const argsArr = buildRevertPrListArgs();
    const stateIdx = argsArr.indexOf("--state");
    expect(argsArr[stateIdx + 1]).toBe("all");
  });

  it("requests the fields classifyRevertState/findRevertPr need", () => {
    const argsArr = buildRevertPrListArgs();
    const jsonIdx = argsArr.indexOf("--json");
    expect(argsArr[jsonIdx + 1]).toBe("number,title,state,mergedAt,mergeCommit");
  });

  it("defaults to a substantially raised limit, not the original 100 (#3873)", () => {
    const argsArr = buildRevertPrListArgs();
    const limitIdx = argsArr.indexOf("--limit");
    expect(Number(argsArr[limitIdx + 1])).toBeGreaterThanOrEqual(300);
  });
});

// ---------------------------------------------------------------------------
// #3873: `--limit 100` on the createdAt-desc direct list can miss a revert PR
// that sat open for days (e.g. #3691, open 2.5 days) once 100+ newer PRs
// pushed it out of the window. `buildRevertPrSearchArgs` + `mergeRevertCandidates`
// add back a relevance-ranked search source (not sorted by recency) as a
// second, unioned source — closing the window gap without reintroducing
// search as the *sole* source (which is what caused #3613's index-lag gap).
// ---------------------------------------------------------------------------
describe("buildRevertPrSearchArgs", () => {
  it("searches by title for a revert of the given PR number", () => {
    const argsArr = buildRevertPrSearchArgs(3600);
    const searchIdx = argsArr.indexOf("--search");
    expect(argsArr[searchIdx + 1]).toBe("revert: #3600 in:title");
  });

  it("requests the same fields the direct list does, across all states", () => {
    const argsArr = buildRevertPrSearchArgs(3600);
    const stateIdx = argsArr.indexOf("--state");
    expect(argsArr[stateIdx + 1]).toBe("all");
    const jsonIdx = argsArr.indexOf("--json");
    expect(argsArr[jsonIdx + 1]).toBe("number,title,state,mergedAt,mergeCommit");
  });
});

describe("mergeRevertCandidates", () => {
  it("unions two candidate lists, deduped by PR number", () => {
    const a = [{ number: 1, title: "x" }];
    const b = [
      { number: 1, title: "x" },
      { number: 2, title: "y" },
    ];

    expect(mergeRevertCandidates(a, b)).toEqual([
      { number: 1, title: "x" },
      { number: 2, title: "y" },
    ]);
  });

  it("returns candidates from either list when the other is empty", () => {
    expect(mergeRevertCandidates([], [{ number: 1, title: "x" }])).toEqual([
      { number: 1, title: "x" },
    ]);
    expect(mergeRevertCandidates([{ number: 1, title: "x" }], [])).toEqual([
      { number: 1, title: "x" },
    ]);
  });

  it("finds a revert PR outside the direct-list window via the search-sourced list (#3873)", () => {
    // Simulate the real failure: 300+ newer PRs (createdAt-desc) fill the
    // direct list's window, pushing out a revert PR that sat open 2.5 days
    // (like #3691) before merging. The search-sourced list ranks by title
    // relevance, not recency, so it still surfaces the old candidate.
    const directList = Array.from({ length: 300 }, (_, i) => ({
      number: 4000 + i,
      title: `chore: unrelated PR ${i}`,
      state: "MERGED",
    }));
    const searchList = [
      {
        number: 3691,
        title: "revert: #3600 (sat open 2.5 days)",
        state: "MERGED",
        mergedAt: "2026-01-05T00:00:00Z",
        mergeCommit: { oid: "outofwindowsha" },
      },
    ];

    const merged = mergeRevertCandidates(directList, searchList);

    expect(findRevertPr(merged, 3600)).toEqual(searchList[0]);
  });
});

describe("classifyRevertState", () => {
  it("state 1: no revert exists — null revertPr classifies as 'none'", () => {
    expect(classifyRevertState(null)).toEqual({
      state: "none",
      revertSha: null,
      revertPrNumber: null,
    });
  });

  it("state 2: revert proposed but PR still open — does NOT report a revertSha", () => {
    const revertPr = { number: 3559, title: "revert: #3545 (fixes broken main)", state: "OPEN" };

    expect(classifyRevertState(revertPr)).toEqual({
      state: "proposed",
      revertSha: null,
      revertPrNumber: 3559,
    });
  });

  it("state 3: revert PR merged — reports the revert PR's own merge commit as the revertSha", () => {
    const revertPr = {
      number: 3559,
      title: "revert: #3545 (fixes broken main)",
      state: "MERGED",
      mergedAt: "2026-01-01T00:00:00Z",
      mergeCommit: { oid: "revertsha1234567890" },
    };

    expect(classifyRevertState(revertPr)).toEqual({
      state: "merged",
      revertSha: "revertsha1234567890",
      revertPrNumber: 3559,
    });
  });
});

describe("buildRcaBody", () => {
  it("links both the original merge PR and the revert PR/commit", () => {
    const body = buildRcaBody({
      prNumber: 3545,
      pr: {
        title: "feat: factory floor section",
        author: { login: "bot" },
        headRefName: "agent-x",
      },
      revertPrNumber: 3559,
      revertSha: "revertsha1234567890",
    });

    expect(body).toContain("#3545");
    expect(body).toContain("#3559");
    expect(body).toContain("revertsha1234567890");
    expect(body).toContain("was reverted");
  });
});

// ---------------------------------------------------------------------------
// extractRcaPrNumber / findPriorRcaIssue — the #3775 dedup ledger lookup.
// ---------------------------------------------------------------------------

describe("extractRcaPrNumber", () => {
  it("extracts the reverted PR number from an RCA issue title", () => {
    const issue = { title: "[RCA] Reflection: Reverted PR #3545 — feat: something" };
    expect(extractRcaPrNumber(issue)).toBe(3545);
  });

  it("returns null for a title that isn't an RCA issue title", () => {
    expect(extractRcaPrNumber({ title: "unrelated issue" })).toBeNull();
  });

  it("returns null for missing/nullish input", () => {
    expect(extractRcaPrNumber(null)).toBeNull();
    expect(extractRcaPrNumber({})).toBeNull();
  });
});

describe("findPriorRcaIssue", () => {
  it("finds a prior RCA issue (any state) for the given PR number", () => {
    const candidates = [
      { number: 10, title: "[RCA] Reflection: Reverted PR #3545 — feat: something" },
      { number: 11, title: "[RCA] Reflection: Reverted PR #9999 — other" },
    ];
    expect(findPriorRcaIssue(candidates, 3545)).toBe(10);
  });

  it("returns null when no candidate matches", () => {
    const candidates = [{ number: 11, title: "[RCA] Reflection: Reverted PR #9999 — other" }];
    expect(findPriorRcaIssue(candidates, 3545)).toBeNull();
  });

  it("returns null for empty or nullish input", () => {
    expect(findPriorRcaIssue([], 3545)).toBeNull();
    expect(findPriorRcaIssue(null, 3545)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// runRevertRca — end-to-end orchestration with injected gh calls. Covers the
// 3 states from the issue, including the exact #3545/#3559 false-positive.
// ---------------------------------------------------------------------------

describe("runRevertRca", () => {
  const originalPr = {
    title: "feat(marketing): WebGL factory-floor section (#3545)",
    author: { login: "claude-bot" },
    headRefName: "worktree-agent-abc123",
    labels: [],
  };

  it("state 1 (no revert exists): does not create an RCA issue", () => {
    const createIssue = vi.fn();

    const result = runRevertRca({
      prNumber: 3545,
      fetchPr: () => originalPr,
      searchRevertPrs: () => [],
      createIssue,
    });

    expect(result.action).toBe("skipped");
    expect(result.state).toBe("none");
    expect(createIssue).not.toHaveBeenCalled();
  });

  it("state 2 (revert proposed, PR open — the real #3545/#3559 case): does not claim a revert happened", () => {
    const createIssue = vi.fn();

    const result = runRevertRca({
      prNumber: 3545,
      fetchPr: () => originalPr,
      searchRevertPrs: () => [
        { number: 3559, title: "revert: #3545 (fixes broken main)", state: "OPEN" },
      ],
      createIssue,
    });

    expect(result.action).toBe("skipped");
    expect(result.state).toBe("proposed");
    expect(createIssue).not.toHaveBeenCalled();
  });

  it("state 3 (revert PR merged): creates the RCA issue reporting the actual revert commit", () => {
    const createIssue = vi.fn(() => 1);

    const result = runRevertRca({
      prNumber: 3545,
      fetchPr: () => originalPr,
      searchRevertPrs: () => [
        {
          number: 3559,
          title: "revert: #3545 (fixes broken main)",
          state: "MERGED",
          mergedAt: "2026-01-01T00:00:00Z",
          mergeCommit: { oid: "revertsha1234567890" },
        },
      ],
      createIssue,
    });

    expect(result.action).toBe("created");
    expect(result.issueNumber).toBe(1);
    expect(createIssue).toHaveBeenCalledTimes(1);
    const [title, body] = createIssue.mock.calls[0];
    expect(title).toContain("#3545");
    expect(body).toContain("revertsha1234567890");
    expect(body).toContain("#3559");
    expect(body).not.toContain("6908c3c05915954642136c11b3a7d4cc03abe8cd");
  });

  it("skips filing a duplicate when an open RCA issue already tracks this PR (#3775 dedup)", () => {
    const createIssue = vi.fn(() => 1);
    const getIssueState = vi.fn(() => "open");

    const result = runRevertRca({
      prNumber: 3545,
      fetchPr: () => originalPr,
      searchRevertPrs: () => [
        {
          number: 3559,
          title: "revert: #3545 (fixes broken main)",
          state: "MERGED",
          mergedAt: "2026-01-01T00:00:00Z",
          mergeCommit: { oid: "revertsha1234567890" },
        },
      ],
      searchRcaIssues: () => [
        { number: 42, title: "[RCA] Reflection: Reverted PR #3545 — feat: something" },
      ],
      getIssueState,
      createIssue,
    });

    expect(result.action).toBe("skipped");
    expect(result.issueNumber).toBe(42);
    expect(createIssue).not.toHaveBeenCalled();
  });

  it("reopens a previously-closed RCA issue for this PR instead of filing a duplicate", () => {
    const createIssue = vi.fn(() => 1);
    const reopenIssue = vi.fn();
    const getIssueState = vi.fn(() => "closed");

    const result = runRevertRca({
      prNumber: 3545,
      fetchPr: () => originalPr,
      searchRevertPrs: () => [
        {
          number: 3559,
          title: "revert: #3545 (fixes broken main)",
          state: "MERGED",
          mergedAt: "2026-01-01T00:00:00Z",
          mergeCommit: { oid: "revertsha1234567890" },
        },
      ],
      searchRcaIssues: () => [
        { number: 42, title: "[RCA] Reflection: Reverted PR #3545 — feat: something" },
      ],
      getIssueState,
      createIssue,
      reopenIssue,
    });

    expect(result.action).toBe("reopened");
    expect(result.issueNumber).toBe(42);
    expect(reopenIssue).toHaveBeenCalledWith(42);
    expect(createIssue).not.toHaveBeenCalled();
  });

  it("real-history regression (#3545/#3559): produces no false RCA for the PR's own merge commit", () => {
    // #3545's own squash-merge sha — the value the old buggy code reported as
    // "the revert commit." #3559 (the actual proposed revert) was never
    // merged, so no RCA should be filed for this pair at all.
    const createIssue = vi.fn();
    const ownMergeSha = "6908c3c05915954642136c11b3a7d4cc03abe8cd";

    const result = runRevertRca({
      prNumber: 3545,
      fetchPr: () => originalPr,
      searchRevertPrs: () => [
        { number: 3559, title: "revert: #3545 (fixes broken main)", state: "OPEN" },
      ],
      createIssue,
    });

    expect(result.action).toBe("skipped");
    expect(createIssue).not.toHaveBeenCalled();
    // Sanity: the sha that produced the false #3560 RCA never appears anywhere.
    expect(JSON.stringify(result)).not.toContain(ownMergeSha);
  });

  // ---------------------------------------------------------------------
  // #3613 gap (a): a merged revert must be detected even when the source
  // that produced `searchRevertPrs`'s candidates hasn't (yet) indexed it —
  // simulated here by candidates that include noise (unrelated PRs) mixed
  // with the real merged revert, i.e. exactly what a direct PR-list source
  // returns, as opposed to a Search-API result that could still be empty.
  // ---------------------------------------------------------------------
  it("detects a merged revert from a list-shaped source that includes unrelated PRs (search-index-lag simulation, #3613)", () => {
    const createIssue = vi.fn(() => 1);

    const result = runRevertRca({
      prNumber: 3545,
      fetchPr: () => originalPr,
      searchRevertPrs: () => [
        { number: 1, title: "unrelated PR", state: "MERGED" },
        {
          number: 3559,
          title: "revert: #3545 (fixes broken main)",
          state: "MERGED",
          mergedAt: "2026-01-01T00:00:00Z",
          mergeCommit: { oid: "revertsha1234567890" },
        },
        { number: 2, title: "chore: something else", state: "OPEN" },
      ],
      createIssue,
    });

    expect(result.action).toBe("created");
    expect(createIssue).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------
  // #3613 gap (b): two revert PRs exist for the same original PR — the
  // merged one must win regardless of which sorts first in the source list.
  // ---------------------------------------------------------------------
  it("picks the MERGED revert over an earlier-sorted closed attempt (#3613)", () => {
    const createIssue = vi.fn(() => 1);

    const result = runRevertRca({
      prNumber: 3545,
      fetchPr: () => originalPr,
      searchRevertPrs: () => [
        { number: 3559, title: "revert: #3545 (fixes broken main)", state: "CLOSED" },
        {
          number: 3600,
          title: "revert: #3545 (fixes broken main, take 2)",
          state: "MERGED",
          mergedAt: "2026-01-02T00:00:00Z",
          mergeCommit: { oid: "realrevertsha" },
        },
      ],
      createIssue,
    });

    expect(result.action).toBe("created");
    const [, body] = createIssue.mock.calls[0];
    expect(body).toContain("realrevertsha");
    expect(body).toContain("#3600");
  });
});

// ---------------------------------------------------------------------------
// #3613 gap 3: the propose-time "Trigger RCA" step in revert-watchdog.yml is
// vestigial — #3590 already guarantees it can only ever resolve to
// "proposed" or "none" seconds after a revert PR is opened. It must be
// removed (or gated so it cannot run before a revert could exist), leaving
// revert-rca-loop.yml (the merge-triggered path) as the sole caller.
// ---------------------------------------------------------------------------
describe("revert-watchdog.yml does not invoke revert-rca.mjs at propose time (#3613)", () => {
  it("no longer runs `node scripts/revert-rca.mjs` in the on-failure job", () => {
    const content = readFileSync(join(ROOT, ".github/workflows/revert-watchdog.yml"), "utf8");
    expect(content).not.toContain("scripts/revert-rca.mjs");
  });

  it("revert-rca-loop.yml (the merge-triggered path) still invokes it", () => {
    const content = readFileSync(join(ROOT, ".github/workflows/revert-rca-loop.yml"), "utf8");
    expect(content).toContain("scripts/revert-rca.mjs");
  });
});
