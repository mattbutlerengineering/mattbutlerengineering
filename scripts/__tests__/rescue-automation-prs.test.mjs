import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  selectPrsToRescue,
  selectConductorConflictPrs,
  selectConductorBehindPrs,
  runRescue,
  runConductorPass,
  conductorConflictComment,
  AUTOMATION_BRANCH_PREFIX,
  AUTOMATION_LABEL,
  CONDUCTOR_BRANCH_PREFIX,
  CONFLICT_COMMENT_MARKER,
  PR_JSON_FIELDS,
  selectGateMissingAgentPrs,
  runGateMissingPass,
  gateMissingDispatchComment,
  AGENT_AUTHORED_LABEL,
  AGENT_PR_JSON_FIELDS,
  GATE_MISSING_COMMENT_MARKER,
} from "../rescue-automation-prs.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(resolve(__dirname, "../rescue-automation-prs.mjs"), "utf8");

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makePr = (overrides = {}) => ({
  number: 1,
  headRefName: "automation/production-feedback",
  mergeStateStatus: "BEHIND",
  isDraft: false,
  labels: [{ name: "auto-merge" }],
  ...overrides,
});

// ---------------------------------------------------------------------------
// selectPrsToRescue — pure selection logic (#3966)
// ---------------------------------------------------------------------------

describe("selectPrsToRescue", () => {
  it("selects an automation/* PR carrying auto-merge that has gone BEHIND", () => {
    const prs = [makePr({ number: 42 })];
    expect(selectPrsToRescue(prs).map((pr) => pr.number)).toEqual([42]);
  });

  it("does not mutate the input array", () => {
    const prs = Object.freeze([makePr({ number: 42 })]);
    expect(() => selectPrsToRescue(prs)).not.toThrow();
  });

  it("excludes a PR whose head branch is not under automation/", () => {
    const prs = [makePr({ number: 42, headRefName: "feature/some-branch" })];
    expect(selectPrsToRescue(prs)).toEqual([]);
  });

  it("excludes a PR without the auto-merge label (e.g. automation/auto-qa-tuning)", () => {
    const prs = [makePr({ number: 42, headRefName: "automation/auto-qa-tuning", labels: [] })];
    expect(selectPrsToRescue(prs)).toEqual([]);
  });

  it("excludes a draft PR", () => {
    const prs = [makePr({ number: 42, isDraft: true })];
    expect(selectPrsToRescue(prs)).toEqual([]);
  });

  for (const status of ["CLEAN", "BLOCKED", "DIRTY", "UNSTABLE", "UNKNOWN"]) {
    it(`excludes a PR with mergeStateStatus ${status} (not behind)`, () => {
      const prs = [makePr({ number: 42, mergeStateStatus: status })];
      expect(selectPrsToRescue(prs)).toEqual([]);
    });
  }

  it("accepts a plain-string label array, not just {name} objects", () => {
    const prs = [makePr({ number: 42, labels: ["auto-merge"] })];
    expect(selectPrsToRescue(prs).map((pr) => pr.number)).toEqual([42]);
  });

  it("returns an empty array for an empty or missing PR list", () => {
    expect(selectPrsToRescue([])).toEqual([]);
    expect(selectPrsToRescue(undefined)).toEqual([]);
  });

  it("selects only the qualifying PRs out of a mixed list", () => {
    const prs = [
      makePr({ number: 1 }), // qualifies
      makePr({ number: 2, mergeStateStatus: "CLEAN" }), // up to date already
      makePr({ number: 3, headRefName: "automation/drift-fix" }), // qualifies
      makePr({ number: 4, headRefName: "chore/manual-branch" }), // not automation
    ];
    expect(selectPrsToRescue(prs).map((pr) => pr.number)).toEqual([1, 3]);
  });
});

// ---------------------------------------------------------------------------
// runRescue — orchestration over the pure selection
// ---------------------------------------------------------------------------

describe("runRescue", () => {
  it("update-branches, re-dispatches CI, and re-asserts auto-merge for each selected PR", async () => {
    const prs = [
      makePr({ number: 1, headRefName: "automation/production-feedback" }),
      makePr({ number: 2, headRefName: "automation/drift-fix" }),
    ];
    const updateBranch = vi.fn().mockResolvedValue(undefined);
    const dispatchCi = vi.fn().mockResolvedValue(undefined);
    const ensureAutoMerge = vi.fn().mockResolvedValue(undefined);

    const rescued = await runRescue({
      listPrs: async () => prs,
      updateBranch,
      dispatchCi,
      ensureAutoMerge,
    });

    expect(rescued).toEqual([1, 2]);
    expect(updateBranch).toHaveBeenCalledWith(1);
    expect(updateBranch).toHaveBeenCalledWith(2);
    expect(dispatchCi).toHaveBeenCalledWith("automation/production-feedback");
    expect(dispatchCi).toHaveBeenCalledWith("automation/drift-fix");
    expect(ensureAutoMerge).toHaveBeenCalledWith(1);
    expect(ensureAutoMerge).toHaveBeenCalledWith(2);
  });

  it("is a silent no-op when nothing needs rescuing (no PRs, or none BEHIND)", async () => {
    const updateBranch = vi.fn();
    const dispatchCi = vi.fn();
    const ensureAutoMerge = vi.fn();

    const rescued = await runRescue({
      listPrs: async () => [makePr({ mergeStateStatus: "CLEAN" })],
      updateBranch,
      dispatchCi,
      ensureAutoMerge,
    });

    expect(rescued).toEqual([]);
    expect(updateBranch).not.toHaveBeenCalled();
    expect(dispatchCi).not.toHaveBeenCalled();
    expect(ensureAutoMerge).not.toHaveBeenCalled();
  });

  it("dry-run reports what it would rescue without calling any mutation", async () => {
    const updateBranch = vi.fn();
    const dispatchCi = vi.fn();
    const ensureAutoMerge = vi.fn();

    const rescued = await runRescue({
      listPrs: async () => [makePr({ number: 7 })],
      updateBranch,
      dispatchCi,
      ensureAutoMerge,
      dryRun: true,
    });

    expect(rescued).toEqual([7]);
    expect(updateBranch).not.toHaveBeenCalled();
    expect(dispatchCi).not.toHaveBeenCalled();
    expect(ensureAutoMerge).not.toHaveBeenCalled();
  });

  it("logs and continues to the next PR when one PR's rescue steps throw", async () => {
    const prs = [
      makePr({ number: 1, headRefName: "automation/production-feedback" }),
      makePr({ number: 2, headRefName: "automation/drift-fix" }),
    ];
    // #1's updateBranch fails transiently; #2 must still be processed in full.
    const updateBranch = vi.fn(async (number) => {
      if (number === 1) throw new Error("update-branch transient failure");
    });
    const dispatchCi = vi.fn().mockResolvedValue(undefined);
    const ensureAutoMerge = vi.fn().mockResolvedValue(undefined);
    const log = vi.fn();

    const rescued = await runRescue({
      listPrs: async () => prs,
      updateBranch,
      dispatchCi,
      ensureAutoMerge,
      log,
    });

    expect(updateBranch).toHaveBeenCalledWith(1);
    expect(updateBranch).toHaveBeenCalledWith(2);
    expect(dispatchCi).not.toHaveBeenCalledWith("automation/production-feedback");
    expect(dispatchCi).toHaveBeenCalledWith("automation/drift-fix");
    expect(ensureAutoMerge).not.toHaveBeenCalledWith(1);
    expect(ensureAutoMerge).toHaveBeenCalledWith(2);
    expect(rescued).toEqual([2]);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("#1"));
    expect(log).toHaveBeenCalledWith(expect.stringContaining("update-branch transient failure"));
  });

  it("a throwing dispatchCi does not block ensureAutoMerge from running on later PRs", async () => {
    const prs = [
      makePr({ number: 1, headRefName: "automation/pr-metrics" }),
      makePr({ number: 2, headRefName: "automation/acmm-regression" }),
    ];
    const updateBranch = vi.fn().mockResolvedValue(undefined);
    const dispatchCi = vi.fn(async (headRefName) => {
      if (headRefName === "automation/pr-metrics") throw new Error("dispatch failed");
    });
    const ensureAutoMerge = vi.fn().mockResolvedValue(undefined);

    const rescued = await runRescue({
      listPrs: async () => prs,
      updateBranch,
      dispatchCi,
      ensureAutoMerge,
    });

    expect(ensureAutoMerge).not.toHaveBeenCalledWith(1);
    expect(ensureAutoMerge).toHaveBeenCalledWith(2);
    expect(rescued).toEqual([2]);
  });

  // -------------------------------------------------------------------------
  // approveRuns — #3982 AC2: update-branch pushes a new merge commit, which
  // itself parks at action_required (#3684) exactly like the PR's original
  // commit did. Without re-approving after update-branch, the re-dispatched
  // CI run's own required CI Gate check never appears either.
  // -------------------------------------------------------------------------

  it("calls approveRuns for a selected PR after updateBranch and before dispatchCi", async () => {
    const calls = [];
    const updateBranch = vi.fn(async (number) => calls.push(`updateBranch:${number}`));
    const approveRuns = vi.fn(async (number) => calls.push(`approveRuns:${number}`));
    const dispatchCi = vi.fn(async (headRefName) => calls.push(`dispatchCi:${headRefName}`));
    const ensureAutoMerge = vi.fn(async (number) => calls.push(`ensureAutoMerge:${number}`));

    const rescued = await runRescue({
      listPrs: async () => [makePr({ number: 1 })],
      updateBranch,
      approveRuns,
      dispatchCi,
      ensureAutoMerge,
    });

    expect(rescued).toEqual([1]);
    expect(calls).toEqual([
      "updateBranch:1",
      "approveRuns:1",
      "dispatchCi:automation/production-feedback",
      "ensureAutoMerge:1",
    ]);
  });

  it("defaults approveRuns to a no-op when the caller omits it (backward compatible)", async () => {
    const rescued = await runRescue({
      listPrs: async () => [makePr({ number: 1 })],
      updateBranch: vi.fn().mockResolvedValue(undefined),
      dispatchCi: vi.fn().mockResolvedValue(undefined),
      ensureAutoMerge: vi.fn().mockResolvedValue(undefined),
    });

    expect(rescued).toEqual([1]);
  });

  it("a throwing approveRuns is isolated like the other per-PR steps", async () => {
    const approveRuns = vi.fn().mockRejectedValue(new Error("approve failed"));
    const dispatchCi = vi.fn().mockResolvedValue(undefined);
    const ensureAutoMerge = vi.fn().mockResolvedValue(undefined);
    const log = vi.fn();

    const rescued = await runRescue({
      listPrs: async () => [makePr({ number: 1 })],
      updateBranch: vi.fn().mockResolvedValue(undefined),
      approveRuns,
      dispatchCi,
      ensureAutoMerge,
      log,
    });

    expect(rescued).toEqual([]);
    expect(dispatchCi).not.toHaveBeenCalled();
    expect(ensureAutoMerge).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("approve failed"));
  });
});

// ---------------------------------------------------------------------------
// ensureAutoMerge CLI wiring (#3982 AC4) — the callback the CLI wires to
// runRescue must route through the same eligibility + trusted-author gate
// the four producer workflows consult (scripts/merge-queue-eligibility.mjs),
// not call `gh pr merge --auto` unconditionally. An ungated call here is a
// permanent bypass of the tier gate hardened after #3787/#3871/#3972: it
// would apply to every PR the BEHIND filter ever selects, including a
// future widening of that filter beyond BEHIND.
// ---------------------------------------------------------------------------

describe("ensureAutoMerge CLI wiring (#3982 AC4)", () => {
  it("routes the CLI's ensureAutoMerge callback through the shared eligibility gate", () => {
    expect(SOURCE).toMatch(/isAutomationMergeAllowed/);
    expect(SOURCE).toMatch(/from ["']\.\/merge-queue-eligibility\.mjs["']/);
  });

  it("no longer calls gh pr merge unconditionally inside ensureAutoMerge", () => {
    const ensureAutoMergeAt = SOURCE.indexOf("ensureAutoMerge: async (number)");
    const nextCallbackAt = SOURCE.indexOf("\n    dryRun,", ensureAutoMergeAt);
    const callback = SOURCE.slice(
      ensureAutoMergeAt,
      nextCallbackAt === -1 ? undefined : nextCallbackAt
    );
    const mergeAt = callback.indexOf('"pr", "merge", String(number)');
    const decisionAt = callback.indexOf("isAutomationMergeAllowed");
    expect(decisionAt).toBeGreaterThan(-1);
    expect(mergeAt).toBeGreaterThan(decisionAt);
  });
});

// ---------------------------------------------------------------------------
// approveRuns CLI wiring (#4009) — the CLI's approveRuns callback delegates
// entirely to approvePendingRuns (scripts/approve-automation-runs.mjs), so
// that function's fail-open getPr()/listRuns() handling is inherited here
// too; this asserts the delegation stays intact rather than being replaced
// by an inline, unprotected duplicate of the gh calls.
// ---------------------------------------------------------------------------

describe("approveRuns CLI wiring (#4009)", () => {
  it("the CLI's approveRuns callback delegates to the shared, fail-open approvePendingRuns", () => {
    expect(SOURCE).toMatch(/from ["']\.\/approve-automation-runs\.mjs["']/);
    const approveRunsAt = SOURCE.indexOf("approveRuns: async (number)");
    const nextCallbackAt = SOURCE.indexOf("\n    dispatchCi:", approveRunsAt);
    const callback = SOURCE.slice(
      approveRunsAt,
      nextCallbackAt === -1 ? undefined : nextCallbackAt
    );
    expect(callback).toMatch(/approvePendingRuns\(/);
  });
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe("selectConductorConflictPrs", () => {
  const conductor = (overrides = {}) =>
    makePr({
      headRefName: "conductor/batch-12",
      mergeStateStatus: "DIRTY",
      labels: [],
      ...overrides,
    });

  it("selects a DIRTY conductor PR that has not been noted", () => {
    expect(selectConductorConflictPrs([conductor({ number: 9 })]).map((pr) => pr.number)).toEqual([
      9,
    ]);
  });

  it("does not require the auto-merge label", () => {
    expect(selectConductorConflictPrs([conductor({ labels: [] })])).toHaveLength(1);
  });

  it("skips a PR that already carries the conflict note", () => {
    expect(selectConductorConflictPrs([conductor({ conflictNoted: true })])).toEqual([]);
  });

  it("skips drafts, non-conductor branches, and non-DIRTY states", () => {
    expect(
      selectConductorConflictPrs([
        conductor({ isDraft: true }),
        conductor({ headRefName: "automation/drift-fix" }),
        conductor({ mergeStateStatus: "BEHIND" }),
        conductor({ mergeStateStatus: "CLEAN" }),
      ])
    ).toEqual([]);
  });
});

describe("selectConductorBehindPrs", () => {
  it("selects a BEHIND conductor PR with no auto-merge label", () => {
    const prs = [
      makePr({
        number: 4,
        headRefName: "conductor/batch-4",
        mergeStateStatus: "BEHIND",
        labels: [],
      }),
    ];
    expect(selectConductorBehindPrs(prs).map((pr) => pr.number)).toEqual([4]);
  });

  it("skips DIRTY, draft, and automation PRs", () => {
    expect(
      selectConductorBehindPrs([
        makePr({ headRefName: "conductor/batch", mergeStateStatus: "DIRTY", labels: [] }),
        makePr({ headRefName: "conductor/batch", mergeStateStatus: "BEHIND", isDraft: true }),
        makePr({ number: 3 }),
      ])
    ).toEqual([]);
  });
});

describe("runConductorPass", () => {
  const conductor = (overrides = {}) =>
    makePr({
      headRefName: "conductor/batch-1",
      labels: [],
      ...overrides,
    });

  it("comments once on a DIRTY conductor PR and does not update it", async () => {
    const comment = vi.fn();
    const updateBranch = vi.fn();
    const dispatchCi = vi.fn();
    const result = await runConductorPass({
      listPrs: async () => [conductor({ number: 8, mergeStateStatus: "DIRTY" })],
      updateBranch,
      dispatchCi,
      comment,
      commentsFor: async () => [],
    });

    expect(comment).toHaveBeenCalledWith(8, conductorConflictComment());
    expect(conductorConflictComment()).toContain(CONFLICT_COMMENT_MARKER);
    expect(conductorConflictComment()).toContain("already closed");
    expect(conductorConflictComment()).toContain("pnpm regen");
    expect(updateBranch).not.toHaveBeenCalled();
    expect(dispatchCi).not.toHaveBeenCalled();
    expect(result).toEqual({ commented: [8], updated: [] });
  });

  it("does not comment again when the marker is already present", async () => {
    const comment = vi.fn();
    const result = await runConductorPass({
      listPrs: async () => [conductor({ number: 8, mergeStateStatus: "DIRTY" })],
      updateBranch: vi.fn(),
      dispatchCi: vi.fn(),
      comment,
      commentsFor: async () => [{ body: conductorConflictComment() }],
    });
    expect(comment).not.toHaveBeenCalled();
    expect(result.commented).toEqual([]);
  });

  it("update-branches a clean BEHIND conductor PR and dispatches CI without auto-merge", async () => {
    const updateBranch = vi.fn();
    const dispatchCi = vi.fn();
    const comment = vi.fn();
    const result = await runConductorPass({
      listPrs: async () => [
        conductor({ number: 5, headRefName: "conductor/batch-5", mergeStateStatus: "BEHIND" }),
      ],
      updateBranch,
      dispatchCi,
      comment,
      commentsFor: async () => [],
    });
    expect(updateBranch).toHaveBeenCalledWith(5);
    expect(dispatchCi).toHaveBeenCalledWith("conductor/batch-5");
    expect(comment).not.toHaveBeenCalled();
    expect(result).toEqual({ commented: [], updated: [5] });
  });

  it("comments when update-branch fails with a conflict and stays quiet on a network error", async () => {
    const comment = vi.fn();
    const updateBranch = vi.fn(async (number) => {
      throw new Error(number === 1 ? "merge conflict between base and head" : "connect ETIMEDOUT");
    });
    const log = vi.fn();
    const result = await runConductorPass({
      listPrs: async () => [
        conductor({ number: 1, headRefName: "conductor/a", mergeStateStatus: "BEHIND" }),
        conductor({ number: 2, headRefName: "conductor/b", mergeStateStatus: "BEHIND" }),
      ],
      updateBranch,
      dispatchCi: vi.fn(),
      comment,
      commentsFor: async () => [],
      log,
    });
    expect(comment).toHaveBeenCalledTimes(1);
    expect(comment).toHaveBeenCalledWith(1, conductorConflictComment());
    expect(result.commented).toEqual([1]);
    expect(result.updated).toEqual([]);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("ETIMEDOUT"));
  });

  it("does not stamp a second conflict comment when the race already noted the PR", async () => {
    const comment = vi.fn();
    await runConductorPass({
      listPrs: async () => [conductor({ number: 1, mergeStateStatus: "BEHIND" })],
      updateBranch: vi.fn(async () => {
        throw new Error("pull request is not mergeable");
      }),
      dispatchCi: vi.fn(),
      comment,
      commentsFor: async () => [{ body: CONFLICT_COMMENT_MARKER }],
    });
    expect(comment).not.toHaveBeenCalled();
  });

  it("dry-run reports both kinds of conductor PR without mutating", async () => {
    const updateBranch = vi.fn();
    const comment = vi.fn();
    const result = await runConductorPass({
      listPrs: async () => [
        conductor({ number: 1, mergeStateStatus: "DIRTY" }),
        conductor({ number: 2, headRefName: "conductor/behind", mergeStateStatus: "BEHIND" }),
      ],
      updateBranch,
      dispatchCi: vi.fn(),
      comment,
      commentsFor: async () => [],
      dryRun: true,
    });
    expect(result).toEqual({ commented: [1], updated: [2] });
    expect(updateBranch).not.toHaveBeenCalled();
    expect(comment).not.toHaveBeenCalled();
  });
});

describe("conductor CLI wiring", () => {
  it("comments through the issues REST route and runs the conductor pass", () => {
    expect(CONDUCTOR_BRANCH_PREFIX).toBe("conductor/");
    expect(SOURCE).toContain("runConductorPass(");
    expect(SOURCE).toContain("repos/{owner}/{repo}/issues/${number}/comments");
    expect(SOURCE).toContain(CONFLICT_COMMENT_MARKER);
    const passAt = SOURCE.indexOf("export async function runConductorPass");
    const nextDocAt = SOURCE.indexOf("\n/**", passAt + 10);
    const pass = SOURCE.slice(passAt, nextDocAt === -1 ? undefined : nextDocAt);
    expect(pass).not.toContain("pr merge");
    expect(pass).not.toContain("ensureAutoMerge");
  });
});

describe("constants", () => {
  it("AUTOMATION_BRANCH_PREFIX matches the branch every producer opens PRs from", () => {
    expect(AUTOMATION_BRANCH_PREFIX).toBe("automation/");
  });

  it("AUTOMATION_LABEL matches the label the four opt-in producers apply", () => {
    expect(AUTOMATION_LABEL).toBe("auto-merge");
  });

  it("PR_JSON_FIELDS requests every field selectPrsToRescue reads", () => {
    for (const field of ["number", "headRefName", "mergeStateStatus", "isDraft", "labels"]) {
      expect(PR_JSON_FIELDS.split(",")).toContain(field);
    }
  });
});

// ---------------------------------------------------------------------------
// Gate-missing agent PRs (#8011, #8157, #9758): GITHUB_TOKEN-pushed PRs never
// fire ci.yml, so CI Gate never appears and nothing dispatches it.
// ---------------------------------------------------------------------------

const agentPr = (overrides = {}) => ({
  number: 9758,
  headRefName: "feat/drain-9724",
  headRefOid: "abc123",
  isDraft: false,
  isCrossRepository: false,
  labels: [{ name: "agent-authored" }, { name: "needs-review" }],
  statusCheckRollup: [],
  headShaCheckRuns: [],
  ciDispatchRuns: [],
  ...overrides,
});

describe("selectGateMissingAgentPrs", () => {
  it("selects an agent-authored PR whose head SHA has no CI Gate anywhere", () => {
    expect(selectGateMissingAgentPrs([agentPr()]).map((pr) => pr.number)).toEqual([9758]);
  });

  it("does not mutate the input array", () => {
    expect(() => selectGateMissingAgentPrs(Object.freeze([agentPr()]))).not.toThrow();
  });

  it("skips a green PR (CI Gate commit status SUCCESS, #4025)", () => {
    const pr = agentPr({
      statusCheckRollup: [{ __typename: "StatusContext", context: "CI Gate", state: "SUCCESS" }],
    });
    expect(selectGateMissingAgentPrs([pr])).toEqual([]);
  });

  it("skips a PR whose CI is still running", () => {
    const pr = agentPr({ statusCheckRollup: [{ name: "Lint", status: "IN_PROGRESS" }] });
    expect(selectGateMissingAgentPrs([pr])).toEqual([]);
  });

  it("skips a PR whose CI Gate failed", () => {
    const pr = agentPr({
      statusCheckRollup: [{ name: "CI Gate", status: "COMPLETED", conclusion: "FAILURE" }],
    });
    expect(selectGateMissingAgentPrs([pr])).toEqual([]);
  });

  it("skips a PR whose dispatched CI Gate is visible only in head-SHA check-runs (#4023)", () => {
    const pr = agentPr({
      headShaCheckRuns: [{ name: "CI Gate", status: "completed", conclusion: "success" }],
    });
    expect(selectGateMissingAgentPrs([pr])).toEqual([]);
  });

  it("skips a PR whose head-SHA check-runs could not be fetched (unknown, not gate-missing)", () => {
    expect(selectGateMissingAgentPrs([agentPr({ headShaCheckRuns: null })])).toEqual([]);
  });

  it("skips a head SHA that already has a dispatched ci.yml run, in progress or completed", () => {
    const prs = [
      agentPr({ number: 1, ciDispatchRuns: [{ id: 10, status: "in_progress" }] }),
      agentPr({ number: 2, ciDispatchRuns: [{ id: 11, status: "completed" }] }),
    ];
    expect(selectGateMissingAgentPrs(prs)).toEqual([]);
  });

  it("skips when the dispatched-run lookup failed, so it can never dispatch twice", () => {
    expect(selectGateMissingAgentPrs([agentPr({ ciDispatchRuns: null })])).toEqual([]);
  });

  it("skips drafts, forks and PRs without agent-authored", () => {
    const prs = [
      agentPr({ number: 1, isDraft: true }),
      agentPr({ number: 2, isCrossRepository: true }),
      agentPr({ number: 3, labels: [{ name: "needs-review" }] }),
    ];
    expect(selectGateMissingAgentPrs(prs)).toEqual([]);
  });
});

describe("runGateMissingPass", () => {
  const deps = (overrides = {}) => ({
    listPrs: async () => [agentPr()],
    fetchCheckRuns: vi.fn(async () => []),
    listCiDispatchRuns: vi.fn(async () => []),
    dispatchCi: vi.fn(),
    comment: vi.fn(),
    commentsFor: vi.fn(async () => []),
    ...overrides,
  });

  it("dispatches ci.yml once on the head branch and comments with the marker", async () => {
    const d = deps();
    const result = await runGateMissingPass(d);
    expect(d.dispatchCi).toHaveBeenCalledTimes(1);
    expect(d.dispatchCi).toHaveBeenCalledWith("feat/drain-9724");
    expect(d.fetchCheckRuns).toHaveBeenCalledWith("abc123");
    expect(d.listCiDispatchRuns).toHaveBeenCalledWith("abc123");
    expect(d.comment).toHaveBeenCalledWith(9758, gateMissingDispatchComment(agentPr()));
    expect(gateMissingDispatchComment(agentPr())).toContain(GATE_MISSING_COMMENT_MARKER);
    expect(gateMissingDispatchComment(agentPr())).toContain("abc123");
    expect(result).toEqual({ dispatched: [9758] });
  });

  it("dispatches but does not comment again when the marker is already present", async () => {
    const d = deps({ commentsFor: async () => [{ body: `x ${GATE_MISSING_COMMENT_MARKER}` }] });
    await runGateMissingPass(d);
    expect(d.dispatchCi).toHaveBeenCalledTimes(1);
    expect(d.comment).not.toHaveBeenCalled();
  });

  it("does not dispatch for a SHA that already has a dispatched ci.yml run", async () => {
    const d = deps({ listCiDispatchRuns: vi.fn(async () => [{ id: 1, status: "queued" }]) });
    const result = await runGateMissingPass(d);
    expect(d.dispatchCi).not.toHaveBeenCalled();
    expect(result).toEqual({ dispatched: [] });
  });

  it("never fetches for PRs it would skip anyway (draft, fork, unlabelled)", async () => {
    const d = deps({
      listPrs: async () => [
        agentPr({ number: 1, isDraft: true }),
        agentPr({ number: 2, isCrossRepository: true }),
        agentPr({ number: 3, labels: [] }),
      ],
    });
    await runGateMissingPass(d);
    expect(d.fetchCheckRuns).not.toHaveBeenCalled();
    expect(d.listCiDispatchRuns).not.toHaveBeenCalled();
  });

  it("isolates a failure on one PR from the rest of the batch", async () => {
    const log = vi.fn();
    const d = deps({
      listPrs: async () => [
        agentPr({ number: 1, headRefName: "a" }),
        agentPr({ number: 2, headRefName: "b" }),
      ],
      dispatchCi: vi.fn(async (ref) => {
        if (ref === "a") throw new Error("HTTP 500");
      }),
      log,
    });
    const result = await runGateMissingPass(d);
    expect(result).toEqual({ dispatched: [2] });
    expect(log).toHaveBeenCalledWith(expect.stringContaining("HTTP 500"));
  });

  it("dry-run reports without dispatching or commenting", async () => {
    const d = deps({ dryRun: true });
    const result = await runGateMissingPass(d);
    expect(result).toEqual({ dispatched: [9758] });
    expect(d.dispatchCi).not.toHaveBeenCalled();
    expect(d.comment).not.toHaveBeenCalled();
  });
});

describe("gate-missing CLI wiring", () => {
  it("runs the pass and looks up dispatched ci.yml runs by head SHA", () => {
    expect(AGENT_AUTHORED_LABEL).toBe("agent-authored");
    expect(SOURCE).toContain("runGateMissingPass(");
    expect(SOURCE).toContain("actions/workflows/ci.yml/runs?event=workflow_dispatch&head_sha=");
    for (const field of [
      "number",
      "headRefName",
      "headRefOid",
      "isDraft",
      "isCrossRepository",
      "labels",
      "statusCheckRollup",
    ]) {
      expect(AGENT_PR_JSON_FIELDS.split(",")).toContain(field);
    }
  });
});
