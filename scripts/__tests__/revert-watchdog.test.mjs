import { describe, it, expect, vi } from "vitest";
import { COORDINATION_LABELS } from "@mbe/gh-client";
import {
  buildBrokenMainCreateArgs,
  buildBrokenMainTitle,
  buildBrokenMainBody,
  extractCulpritSha,
  buildRecoveryComment,
  selectIssuesToClose,
  runAutoCloseWatchdog,
  BASELINE_WALK_CAP,
  classifyConclusion,
  extractFailingTestPaths,
  pathsAreDisjoint,
  decideBaselineAction,
  walkToBaseline,
  resolveRevertAction,
  buildRevertPrBody,
  extractBreakageIssueNumber,
  isRevertWatchdogPr,
  hasNeedsReviewLabel,
  buildRevertClosedComment,
  shouldCloseRevertPr,
  selectRevertPrsToClose,
  runCloseStaleRevertPrs,
} from "../revert-watchdog.mjs";

const SHA = "abc1234def5678901234567890123456789abcd";
const OTHER_SHA = "def5678901234567890123456789abcd1234abc";

// ---------------------------------------------------------------------------
// buildBrokenMainTitle / buildBrokenMainBody — unchanged issue format (#2958)
// ---------------------------------------------------------------------------

describe("buildBrokenMainTitle", () => {
  it("matches the original watchdog title format", () => {
    expect(buildBrokenMainTitle(SHA)).toBe(`🚨 CRITICAL: Broken Main at commit ${SHA}`);
  });
});

describe("buildBrokenMainBody", () => {
  it("includes the culprit sha and PR number", () => {
    const body = buildBrokenMainBody(SHA, "42");
    expect(body).toContain(SHA);
    expect(body).toContain("#42");
  });
});

// ---------------------------------------------------------------------------
// buildBrokenMainCreateArgs — label vocabulary fix (#2958)
// ---------------------------------------------------------------------------

describe("buildBrokenMainCreateArgs", () => {
  it("carries ci-fix, ready, and priority:critical labels", () => {
    const args = buildBrokenMainCreateArgs("title", "body");

    expect(args).toEqual([
      "--title",
      "title",
      "--body",
      "body",
      "--label",
      "ci-fix",
      "--label",
      COORDINATION_LABELS.READY,
      "--label",
      "priority:critical",
    ]);
  });

  it("uses the shared ready label constant instead of a re-typed literal", () => {
    const args = buildBrokenMainCreateArgs("title", "body");
    const readyIdx = args.indexOf(COORDINATION_LABELS.READY);
    expect(readyIdx).toBeGreaterThan(-1);
    expect(args[readyIdx - 1]).toBe("--label");
  });
});

// ---------------------------------------------------------------------------
// extractCulpritSha — pure parsing of the watchdog issue title
// ---------------------------------------------------------------------------

describe("extractCulpritSha", () => {
  it("extracts the sha from a well-formed watchdog title", () => {
    expect(extractCulpritSha({ title: buildBrokenMainTitle(SHA) })).toBe(SHA);
  });

  it("returns null for a title that does not match the watchdog format", () => {
    expect(extractCulpritSha({ title: "some unrelated issue" })).toBeNull();
  });

  it("returns null for a missing title", () => {
    expect(extractCulpritSha({})).toBeNull();
    expect(extractCulpritSha(null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildRecoveryComment
// ---------------------------------------------------------------------------

describe("buildRecoveryComment", () => {
  it("mentions the recovering green sha", () => {
    expect(buildRecoveryComment(SHA)).toContain(SHA);
  });
});

// ---------------------------------------------------------------------------
// selectIssuesToClose — pure close-decision logic
// ---------------------------------------------------------------------------

describe("selectIssuesToClose", () => {
  it("selects an issue whose culprit sha is a known ancestor", () => {
    const issues = [{ number: 1, title: buildBrokenMainTitle(SHA) }];
    const closed = selectIssuesToClose(issues, { [SHA]: true });
    expect(closed.map((i) => i.number)).toEqual([1]);
  });

  it("excludes an issue whose culprit sha is not an ancestor", () => {
    const issues = [{ number: 1, title: buildBrokenMainTitle(SHA) }];
    const closed = selectIssuesToClose(issues, { [SHA]: false });
    expect(closed).toEqual([]);
  });

  it("excludes an issue with no ancestry data yet", () => {
    const issues = [{ number: 1, title: buildBrokenMainTitle(SHA) }];
    expect(selectIssuesToClose(issues, {})).toEqual([]);
  });

  it("excludes issues whose title does not carry a culprit sha", () => {
    const issues = [{ number: 1, title: "unrelated issue" }];
    expect(selectIssuesToClose(issues, { [SHA]: true })).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const issues = [{ number: 1, title: buildBrokenMainTitle(SHA) }];
    const snapshot = JSON.stringify(issues);
    selectIssuesToClose(issues, { [SHA]: true });
    expect(JSON.stringify(issues)).toBe(snapshot);
  });

  it("returns [] for empty or nullish input", () => {
    expect(selectIssuesToClose([], {})).toEqual([]);
    expect(selectIssuesToClose(null, {})).toEqual([]);
    expect(selectIssuesToClose(undefined, {})).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// runAutoCloseWatchdog — side-effecting orchestration with injected git/gh ops
// ---------------------------------------------------------------------------

describe("runAutoCloseWatchdog", () => {
  it("closes issues whose culprit is an ancestor of the green sha, with a comment", async () => {
    const issues = [{ number: 1, title: buildBrokenMainTitle(SHA) }];
    const isAncestor = vi.fn(async () => true);
    const closeIssue = vi.fn(async () => {});

    const closed = await runAutoCloseWatchdog({
      listOpenIssues: async () => issues,
      isAncestor,
      closeIssue,
      greenSha: "green-sha",
    });

    expect(closed).toEqual([1]);
    expect(isAncestor).toHaveBeenCalledWith(SHA, "green-sha");
    expect(closeIssue).toHaveBeenCalledWith(1, buildRecoveryComment("green-sha"));
  });

  it("leaves issues open when the culprit is not yet an ancestor", async () => {
    const issues = [{ number: 1, title: buildBrokenMainTitle(SHA) }];
    const closeIssue = vi.fn(async () => {});

    const closed = await runAutoCloseWatchdog({
      listOpenIssues: async () => issues,
      isAncestor: async () => false,
      closeIssue,
      greenSha: "green-sha",
    });

    expect(closed).toEqual([]);
    expect(closeIssue).not.toHaveBeenCalled();
  });

  it("does nothing when there are no open watchdog issues", async () => {
    const closeIssue = vi.fn(async () => {});
    const isAncestor = vi.fn(async () => true);

    const closed = await runAutoCloseWatchdog({
      listOpenIssues: async () => [],
      isAncestor,
      closeIssue,
      greenSha: "green-sha",
    });

    expect(closed).toEqual([]);
    expect(isAncestor).not.toHaveBeenCalled();
    expect(closeIssue).not.toHaveBeenCalled();
  });

  it("checks ancestry once per unique culprit sha, even with multiple issues", async () => {
    const issues = [
      { number: 1, title: buildBrokenMainTitle(SHA) },
      { number: 2, title: buildBrokenMainTitle(SHA) },
      { number: 3, title: buildBrokenMainTitle(OTHER_SHA) },
    ];
    const isAncestor = vi.fn(async () => true);

    const closed = await runAutoCloseWatchdog({
      listOpenIssues: async () => issues,
      isAncestor,
      closeIssue: async () => {},
      greenSha: "green-sha",
    });

    expect(closed.sort()).toEqual([1, 2, 3]);
    expect(isAncestor).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// classifyConclusion — pure three-state classification of a CI conclusion (#3622)
// ---------------------------------------------------------------------------

describe("classifyConclusion", () => {
  it("classifies a failure parent as conclusive 'failure'", () => {
    expect(classifyConclusion("failure")).toBe("failure");
  });

  it("classifies a cancelled parent as 'inconclusive'", () => {
    expect(classifyConclusion("cancelled")).toBe("inconclusive");
  });

  it("classifies a null parent (no runs found) as 'inconclusive'", () => {
    expect(classifyConclusion(null)).toBe("inconclusive");
  });

  it("classifies a success parent as conclusive 'success'", () => {
    expect(classifyConclusion("success")).toBe("success");
  });

  it("classifies undefined (no-runs-found) as 'inconclusive'", () => {
    expect(classifyConclusion(undefined)).toBe("inconclusive");
  });

  it("classifies skipped/unknown as 'inconclusive'", () => {
    expect(classifyConclusion("skipped")).toBe("inconclusive");
    expect(classifyConclusion("unknown")).toBe("inconclusive");
    expect(classifyConclusion("")).toBe("inconclusive");
  });
});

// ---------------------------------------------------------------------------
// extractFailingTestPaths — pure parsing of `gh run view --log-failed` output
// ---------------------------------------------------------------------------

describe("extractFailingTestPaths", () => {
  it("extracts the file path from a vitest FAIL line", () => {
    const log = `FAIL src/__tests__/agent.test.ts > agent command > check-model subcommand
     > prints model routing information for a directive
Error: Test timed out in 5000ms.        (Test — Node 20)
Test Files  1 failed | 40 passed (41)
Tests       1 failed | 352 passed (353)`;

    expect(extractFailingTestPaths(log)).toEqual(["src/__tests__/agent.test.ts"]);
  });

  it("dedupes repeated FAIL lines for the same file", () => {
    const log = "FAIL a/b.test.ts > one\nFAIL a/b.test.ts > two";
    expect(extractFailingTestPaths(log)).toEqual(["a/b.test.ts"]);
  });

  it("extracts multiple distinct failing files", () => {
    const log = "FAIL a/b.test.ts > one\nFAIL c/d.test.ts > two";
    expect(extractFailingTestPaths(log)).toEqual(["a/b.test.ts", "c/d.test.ts"]);
  });

  it("ignores lines with lowercase 'failed' that are not a FAIL header", () => {
    const log = "Tests       1 failed | 352 passed (353)";
    expect(extractFailingTestPaths(log)).toEqual([]);
  });

  it("returns [] for empty or nullish input", () => {
    expect(extractFailingTestPaths("")).toEqual([]);
    expect(extractFailingTestPaths(null)).toEqual([]);
    expect(extractFailingTestPaths(undefined)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// pathsAreDisjoint — pure area-overlap check between failing tests and diff
// ---------------------------------------------------------------------------

describe("pathsAreDisjoint", () => {
  it("is disjoint when the failing package area shares no changed file (#3620 reproduction)", () => {
    const failing = ["tools/cli/src/__tests__/agent.test.ts"];
    const changed = ["scripts/eval-aggregate.mjs"];
    expect(pathsAreDisjoint(failing, changed)).toBe(true);
  });

  it("is not disjoint when a changed file shares the failing test's package area", () => {
    const failing = ["services/users/src/__tests__/health.test.ts"];
    const changed = ["services/users/src/routes/health.ts"];
    expect(pathsAreDisjoint(failing, changed)).toBe(false);
  });

  it("is not disjoint (conservative default) when either list is empty", () => {
    expect(pathsAreDisjoint([], ["a/b.ts"])).toBe(false);
    expect(pathsAreDisjoint(["a/b.test.ts"], [])).toBe(false);
    expect(pathsAreDisjoint([], [])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// decideBaselineAction — pure combinator: baseline + path-overlap -> action
// ---------------------------------------------------------------------------

describe("decideBaselineAction", () => {
  it("skips (no issue, no revert) when the baseline is a pre-existing failure", () => {
    const result = decideBaselineAction({ baseline: { sha: SHA, conclusion: "failure" } });
    expect(result.action).toBe("skip");
  });

  it("opens an issue only, without proposing a revert, when no conclusive baseline was found", () => {
    const result = decideBaselineAction({ baseline: null });
    expect(result.action).toBe("issue-only");
  });

  it("downgrades to issue-only when the green baseline's failing tests are disjoint from the diff", () => {
    const result = decideBaselineAction({
      baseline: { sha: SHA, conclusion: "success" },
      failingTestPaths: ["tools/cli/src/__tests__/agent.test.ts"],
      changedFiles: ["scripts/eval-aggregate.mjs"],
    });
    expect(result.action).toBe("issue-only");
  });

  it("proposes issue-and-revert for a genuine break on a green baseline (true positive preserved)", () => {
    const result = decideBaselineAction({
      baseline: { sha: SHA, conclusion: "success" },
      failingTestPaths: ["services/users/src/__tests__/health.test.ts"],
      changedFiles: ["services/users/src/routes/health.ts"],
    });
    expect(result.action).toBe("issue-and-revert");
  });

  it("proposes issue-and-revert when a green baseline has no test-path data to compare (fail-safe)", () => {
    const result = decideBaselineAction({ baseline: { sha: SHA, conclusion: "success" } });
    expect(result.action).toBe("issue-and-revert");
  });
});

// ---------------------------------------------------------------------------
// walkToBaseline — async orchestration: walk ancestors past inconclusive runs
// ---------------------------------------------------------------------------

describe("walkToBaseline", () => {
  it("resolves immediately on a conclusive (failure) parent", async () => {
    const getConclusionForSha = vi.fn(async () => "failure");
    const getParentSha = vi.fn(async () => OTHER_SHA);

    const baseline = await walkToBaseline({
      parentSha: SHA,
      getConclusionForSha,
      getParentSha,
    });

    expect(baseline).toEqual({ sha: SHA, conclusion: "failure" });
    expect(getParentSha).not.toHaveBeenCalled();
  });

  it("resolves immediately on a conclusive (success) parent", async () => {
    const baseline = await walkToBaseline({
      parentSha: SHA,
      getConclusionForSha: async () => "success",
      getParentSha: async () => OTHER_SHA,
    });

    expect(baseline).toEqual({ sha: SHA, conclusion: "success" });
  });

  it("walks back past a cancelled parent to the nearest conclusive ancestor", async () => {
    const conclusionsBySha = { [SHA]: "cancelled", [OTHER_SHA]: "success" };

    const baseline = await walkToBaseline({
      parentSha: SHA,
      getConclusionForSha: async (sha) => conclusionsBySha[sha],
      getParentSha: async (sha) => (sha === SHA ? OTHER_SHA : null),
    });

    expect(baseline).toEqual({ sha: OTHER_SHA, conclusion: "success" });
  });

  it("gives up after the cap and returns null (no-runs-found within the walk)", async () => {
    const getConclusionForSha = vi.fn(async () => "cancelled");
    const getParentSha = vi.fn(async (sha) => `${sha}-p`);

    const baseline = await walkToBaseline({
      parentSha: "root",
      getConclusionForSha,
      getParentSha,
      cap: BASELINE_WALK_CAP,
    });

    expect(baseline).toBeNull();
    expect(getConclusionForSha).toHaveBeenCalledTimes(BASELINE_WALK_CAP);
  });

  it("stops walking early if history runs out before the cap", async () => {
    const baseline = await walkToBaseline({
      parentSha: "root",
      getConclusionForSha: async () => "unknown",
      getParentSha: async () => null,
    });

    expect(baseline).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resolveRevertAction — top-level orchestrator wiring walk + decision
// ---------------------------------------------------------------------------

describe("resolveRevertAction", () => {
  it("reproduces #3620: cancelled parent + green grandparent + disjoint diff -> issue-only, no revert", async () => {
    const conclusionsBySha = { [SHA]: "cancelled", [OTHER_SHA]: "success" };

    const result = await resolveRevertAction({
      parentSha: SHA,
      prNumber: 3591,
      getConclusionForSha: async (sha) => conclusionsBySha[sha],
      getParentSha: async (sha) => (sha === SHA ? OTHER_SHA : null),
      getFailingTestPaths: async () => ["tools/cli/src/__tests__/agent.test.ts"],
      getChangedFiles: async () => ["scripts/eval-aggregate.mjs"],
    });

    expect(result.action).toBe("issue-only");
  });

  it("preserves the true positive: cancelled parent + green grandparent + overlapping diff -> revert", async () => {
    const conclusionsBySha = { [SHA]: "cancelled", [OTHER_SHA]: "success" };

    const result = await resolveRevertAction({
      parentSha: SHA,
      prNumber: 42,
      getConclusionForSha: async (sha) => conclusionsBySha[sha],
      getParentSha: async (sha) => (sha === SHA ? OTHER_SHA : null),
      getFailingTestPaths: async () => ["services/users/src/__tests__/health.test.ts"],
      getChangedFiles: async () => ["services/users/src/routes/health.ts"],
    });

    expect(result.action).toBe("issue-and-revert");
  });

  it("skips entirely when the resolved baseline is itself a pre-existing failure", async () => {
    const getFailingTestPaths = vi.fn(async () => []);
    const getChangedFiles = vi.fn(async () => []);

    const result = await resolveRevertAction({
      parentSha: SHA,
      prNumber: 42,
      getConclusionForSha: async () => "failure",
      getParentSha: async () => OTHER_SHA,
      getFailingTestPaths,
      getChangedFiles,
    });

    expect(result.action).toBe("skip");
    expect(getFailingTestPaths).not.toHaveBeenCalled();
    expect(getChangedFiles).not.toHaveBeenCalled();
  });

  it("opens an issue without a revert when no conclusive baseline exists within the cap", async () => {
    const getFailingTestPaths = vi.fn(async () => []);
    const getChangedFiles = vi.fn(async () => []);

    const result = await resolveRevertAction({
      parentSha: "root",
      prNumber: 42,
      getConclusionForSha: async () => "cancelled",
      getParentSha: async (sha) => `${sha}-p`,
      getFailingTestPaths,
      getChangedFiles,
    });

    expect(result.action).toBe("issue-only");
    expect(getFailingTestPaths).not.toHaveBeenCalled();
    expect(getChangedFiles).not.toHaveBeenCalled();
  });

  it("#3641: a throwing getChangedFiles collaborator (e.g. a transient `gh pr view` failure) does not propagate — degrades to issue-and-revert on a green baseline, not a crash", async () => {
    const result = await resolveRevertAction({
      parentSha: SHA,
      prNumber: 42,
      getConclusionForSha: async () => "success",
      getParentSha: async () => null,
      getFailingTestPaths: async () => ["services/users/src/__tests__/health.test.ts"],
      getChangedFiles: async () => {
        throw new Error("gh pr view: transient failure");
      },
    });

    expect(result.action).toBe("issue-and-revert");
  });
});

// ---------------------------------------------------------------------------
// Revert PR lifecycle (#3691) — record + parse the breakage-issue link, and
// auto-close a revert PR once its breakage issue is closed and main is green.
// ---------------------------------------------------------------------------

describe("buildRevertPrBody", () => {
  it("carries the culprit PR and a machine-readable breakage-issue link", () => {
    const body = buildRevertPrBody(3545, 3559);
    expect(body).toContain("#3545");
    expect(body).toContain("Opened for #3559");
  });
});

describe("extractBreakageIssueNumber", () => {
  it("parses the issue number out of a well-formed revert PR body", () => {
    const body = buildRevertPrBody(3545, 3559);
    expect(extractBreakageIssueNumber(body)).toBe(3559);
  });

  it("returns null when the body has no breakage-issue link", () => {
    expect(extractBreakageIssueNumber("Automatically proposed revert of #3545.")).toBeNull();
  });

  it("returns null for nullish/empty bodies", () => {
    expect(extractBreakageIssueNumber(null)).toBeNull();
    expect(extractBreakageIssueNumber(undefined)).toBeNull();
    expect(extractBreakageIssueNumber("")).toBeNull();
  });
});

describe("isRevertWatchdogPr", () => {
  it("matches the revert-watchdog title format", () => {
    expect(isRevertWatchdogPr({ title: "revert: #3545 (fixes broken main)" })).toBe(true);
  });

  it("does not match the unrelated auto-rollback revert PR format", () => {
    expect(isRevertWatchdogPr({ title: "revert: auto-rollback agent commit 9241626" })).toBe(false);
  });

  it("does not match an arbitrary PR title", () => {
    expect(isRevertWatchdogPr({ title: "fix: something unrelated" })).toBe(false);
  });

  it("returns false for a missing title", () => {
    expect(isRevertWatchdogPr({})).toBe(false);
    expect(isRevertWatchdogPr(null)).toBe(false);
  });
});

describe("hasNeedsReviewLabel", () => {
  it("is true when the needs-review label is present", () => {
    expect(hasNeedsReviewLabel({ labels: [{ name: "needs-review" }] })).toBe(true);
  });

  it("is false when the label is absent", () => {
    expect(hasNeedsReviewLabel({ labels: [{ name: "priority:critical" }] })).toBe(false);
  });

  it("is false when labels are missing entirely", () => {
    expect(hasNeedsReviewLabel({})).toBe(false);
    expect(hasNeedsReviewLabel(null)).toBe(false);
  });
});

describe("buildRevertClosedComment", () => {
  it("names the commit that made main green and says it was fixed forward", () => {
    const comment = buildRevertClosedComment(SHA);
    expect(comment).toContain(SHA);
    expect(comment.toLowerCase()).toContain("fixed forward");
  });
});

describe("shouldCloseRevertPr", () => {
  it("closes when the breakage issue is closed and main is green", () => {
    expect(
      shouldCloseRevertPr({
        issueState: "closed",
        mainConclusion: "success",
        hasNeedsReview: false,
      })
    ).toBe(true);
  });

  it("does not close while the breakage issue is still open", () => {
    expect(
      shouldCloseRevertPr({ issueState: "open", mainConclusion: "success", hasNeedsReview: false })
    ).toBe(false);
  });

  it("does not close when main is red, even if the issue is closed", () => {
    expect(
      shouldCloseRevertPr({
        issueState: "closed",
        mainConclusion: "failure",
        hasNeedsReview: false,
      })
    ).toBe(false);
  });

  it("does not close when main's conclusion is inconclusive", () => {
    expect(
      shouldCloseRevertPr({ issueState: "closed", mainConclusion: null, hasNeedsReview: false })
    ).toBe(false);
  });

  it("does not close when needs-review is present, even if issue closed and main green", () => {
    expect(
      shouldCloseRevertPr({ issueState: "closed", mainConclusion: "success", hasNeedsReview: true })
    ).toBe(false);
  });
});

describe("selectRevertPrsToClose", () => {
  it("selects a revert PR whose breakage issue is closed and main is green", () => {
    const prs = [{ number: 1, body: buildRevertPrBody(3545, 3559), labels: [] }];
    const selected = selectRevertPrsToClose(prs, {
      issueStateByNumber: { 3559: "closed" },
      mainConclusion: "success",
    });
    expect(selected.map((pr) => pr.number)).toEqual([1]);
  });

  it("excludes a revert PR whose breakage issue is still open", () => {
    const prs = [{ number: 1, body: buildRevertPrBody(3545, 3559), labels: [] }];
    const selected = selectRevertPrsToClose(prs, {
      issueStateByNumber: { 3559: "open" },
      mainConclusion: "success",
    });
    expect(selected).toEqual([]);
  });

  it("excludes a revert PR carrying the needs-review label", () => {
    const prs = [
      { number: 1, body: buildRevertPrBody(3545, 3559), labels: [{ name: "needs-review" }] },
    ];
    const selected = selectRevertPrsToClose(prs, {
      issueStateByNumber: { 3559: "closed" },
      mainConclusion: "success",
    });
    expect(selected).toEqual([]);
  });

  it("excludes a revert PR with no parseable breakage-issue link", () => {
    const prs = [{ number: 1, body: "Automatically proposed revert of #3545.", labels: [] }];
    const selected = selectRevertPrsToClose(prs, {
      issueStateByNumber: {},
      mainConclusion: "success",
    });
    expect(selected).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const prs = [{ number: 1, body: buildRevertPrBody(3545, 3559), labels: [] }];
    const snapshot = JSON.stringify(prs);
    selectRevertPrsToClose(prs, {
      issueStateByNumber: { 3559: "closed" },
      mainConclusion: "success",
    });
    expect(JSON.stringify(prs)).toBe(snapshot);
  });
});

describe("runCloseStaleRevertPrs", () => {
  it("closes an eligible revert PR with a fixed-forward comment", async () => {
    const prs = [
      {
        number: 1,
        title: "revert: #3545 (fixes broken main)",
        body: buildRevertPrBody(3545, 3559),
        labels: [],
      },
    ];
    const closePr = vi.fn(async () => {});

    const closed = await runCloseStaleRevertPrs({
      listOpenRevertPrs: async () => prs,
      getIssueState: async () => "closed",
      getMainConclusion: async () => "success",
      closePr,
      mainSha: "green-sha",
    });

    expect(closed).toEqual([1]);
    expect(closePr).toHaveBeenCalledWith(1, buildRevertClosedComment("green-sha"));
  });

  it("leaves the revert PR open while its breakage issue is still open", async () => {
    const prs = [
      {
        number: 1,
        title: "revert: #3545 (fixes broken main)",
        body: buildRevertPrBody(3545, 3559),
        labels: [],
      },
    ];
    const closePr = vi.fn(async () => {});

    const closed = await runCloseStaleRevertPrs({
      listOpenRevertPrs: async () => prs,
      getIssueState: async () => "open",
      getMainConclusion: async () => "success",
      closePr,
      mainSha: "green-sha",
    });

    expect(closed).toEqual([]);
    expect(closePr).not.toHaveBeenCalled();
  });

  it("leaves the revert PR open while main is red, even if the issue is closed", async () => {
    const prs = [
      {
        number: 1,
        title: "revert: #3545 (fixes broken main)",
        body: buildRevertPrBody(3545, 3559),
        labels: [],
      },
    ];
    const closePr = vi.fn(async () => {});

    const closed = await runCloseStaleRevertPrs({
      listOpenRevertPrs: async () => prs,
      getIssueState: async () => "closed",
      getMainConclusion: async () => "failure",
      closePr,
      mainSha: "green-sha",
    });

    expect(closed).toEqual([]);
    expect(closePr).not.toHaveBeenCalled();
  });

  it("leaves the revert PR open when needs-review is present", async () => {
    const prs = [
      {
        number: 1,
        title: "revert: #3545 (fixes broken main)",
        body: buildRevertPrBody(3545, 3559),
        labels: [{ name: "needs-review" }],
      },
    ];
    const closePr = vi.fn(async () => {});
    const getIssueState = vi.fn(async () => "closed");

    const closed = await runCloseStaleRevertPrs({
      listOpenRevertPrs: async () => prs,
      getIssueState,
      getMainConclusion: async () => "success",
      closePr,
      mainSha: "green-sha",
    });

    expect(closed).toEqual([]);
    expect(closePr).not.toHaveBeenCalled();
  });

  it("ignores PRs that are not revert-watchdog PRs (e.g. the auto-rollback format)", async () => {
    const prs = [
      {
        number: 1,
        title: "revert: auto-rollback agent commit 9241626",
        body: "## Auto-Rollback\n\nOpened for #999.",
        labels: [],
      },
    ];
    const getIssueState = vi.fn(async () => "closed");
    const closePr = vi.fn(async () => {});

    const closed = await runCloseStaleRevertPrs({
      listOpenRevertPrs: async () => prs,
      getIssueState,
      getMainConclusion: async () => "success",
      closePr,
      mainSha: "green-sha",
    });

    expect(closed).toEqual([]);
    expect(getIssueState).not.toHaveBeenCalled();
    expect(closePr).not.toHaveBeenCalled();
  });

  it("does nothing when there are no open revert PRs", async () => {
    const getMainConclusion = vi.fn(async () => "success");
    const closePr = vi.fn(async () => {});

    const closed = await runCloseStaleRevertPrs({
      listOpenRevertPrs: async () => [],
      getIssueState: async () => "closed",
      getMainConclusion,
      closePr,
      mainSha: "green-sha",
    });

    expect(closed).toEqual([]);
    expect(getMainConclusion).not.toHaveBeenCalled();
    expect(closePr).not.toHaveBeenCalled();
  });

  it("dedupes issue-state lookups when multiple revert PRs share the same breakage issue", async () => {
    const prs = [
      {
        number: 1,
        title: "revert: #3545 (fixes broken main)",
        body: buildRevertPrBody(3545, 3559),
        labels: [],
      },
      {
        number: 2,
        title: "revert: #3546 (fixes broken main)",
        body: buildRevertPrBody(3546, 3559),
        labels: [],
      },
    ];
    const getIssueState = vi.fn(async () => "closed");

    const closed = await runCloseStaleRevertPrs({
      listOpenRevertPrs: async () => prs,
      getIssueState,
      getMainConclusion: async () => "success",
      closePr: async () => {},
      mainSha: "green-sha",
    });

    expect(closed.sort()).toEqual([1, 2]);
    expect(getIssueState).toHaveBeenCalledTimes(1);
  });
});
