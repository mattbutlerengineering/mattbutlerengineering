import { describe, expect, it } from "vitest";
import { isBotBranch, isPhantomRun, partitionPhantomRuns } from "../phantom-runs.mjs";

// Shape copied from the live API for run 39042996808 (Secret Scan) and its
// /jobs response ({ total_count: 0, jobs: [] }): a pull_request run on a
// GITHUB_TOKEN-authored branch, parked for approval, concluded failure.
const PHANTOM = {
  id: 39042996808,
  name: "Secret Scan",
  event: "pull_request",
  status: "completed",
  conclusion: "failure",
  headBranch: "automation/production-feedback",
  actor: "github-actions[bot]",
  jobCount: 0,
};
const REAL_FAILURE = { ...PHANTOM, id: 1, jobCount: 3 };

describe("isBotBranch", () => {
  it.each([
    "automation/production-feedback",
    "changeset-release/main",
    "revert-broken-main/abc",
    "chore/acmm-regression",
  ])("matches %s", (b) => expect(isBotBranch(b)).toBe(true));
  it.each(["main", "feat/x", "", undefined])("rejects %s", (b) =>
    expect(isBotBranch(b)).toBe(false)
  );
});

describe("isPhantomRun", () => {
  it("flags a zero-job failure on a bot branch", () => {
    expect(isPhantomRun(PHANTOM)).toBe(true);
  });
  it("does not flag a failure that executed jobs", () => {
    expect(isPhantomRun(REAL_FAILURE)).toBe(false);
  });
  it("does not flag a zero-job failure on a human branch", () => {
    expect(isPhantomRun({ ...PHANTOM, headBranch: "feat/x" })).toBe(false);
  });
  it("never decides from branch name alone: unknown job count is not phantom", () => {
    expect(isPhantomRun({ ...PHANTOM, jobCount: undefined })).toBe(false);
    expect(isPhantomRun({ ...PHANTOM, jobCount: null })).toBe(false);
  });
  it("only applies to failures", () => {
    expect(isPhantomRun({ ...PHANTOM, conclusion: "success" })).toBe(false);
  });
});

describe("partitionPhantomRuns", () => {
  it("separates phantoms from countable runs", () => {
    const ok = { conclusion: "success", headBranch: "main" };
    const { counted, phantom } = partitionPhantomRuns([PHANTOM, REAL_FAILURE, ok]);
    expect(phantom).toEqual([PHANTOM]);
    expect(counted).toEqual([REAL_FAILURE, ok]);
  });
});
