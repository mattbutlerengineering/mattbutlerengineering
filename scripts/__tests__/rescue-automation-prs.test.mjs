import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  selectPrsToRescue,
  runRescue,
  AUTOMATION_BRANCH_PREFIX,
  AUTOMATION_LABEL,
  PR_JSON_FIELDS,
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
// Constants
// ---------------------------------------------------------------------------

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
