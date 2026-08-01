import { describe, it, expect, vi } from "vitest";
import { COORDINATION_LABELS } from "@mbe/gh-client";
import {
  buildRcaCreateArgs,
  findRevertPr,
  classifyRevertState,
  buildRcaBody,
  runRevertRca,
} from "../revert-rca.mjs";

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
    const createIssue = vi.fn(() => "https://github.com/x/y/issues/1");

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
    expect(createIssue).toHaveBeenCalledTimes(1);
    const [args] = createIssue.mock.calls[0];
    const bodyIdx = args.indexOf("--body") + 1;
    expect(args[bodyIdx]).toContain("revertsha1234567890");
    expect(args[bodyIdx]).toContain("#3559");
    expect(args[bodyIdx]).not.toContain("6908c3c05915954642136c11b3a7d4cc03abe8cd");
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
});
