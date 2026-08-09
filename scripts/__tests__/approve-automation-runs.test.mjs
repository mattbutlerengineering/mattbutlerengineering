import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  isAutomationPrApprovable,
  selectActionRequiredRuns,
  approvePendingRuns,
} from "../approve-automation-runs.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

// The four opt-in automation-PR producers (#3966) plus the rescue cron
// (#3982) — every one of them must approve pending action_required runs
// before dispatching/enabling auto-merge, or tier-classifier (and CI Gate
// itself) never actually runs on their PR (#3684).
const PRODUCER_WORKFLOWS = {
  "production-feedback.yml": readFileSync(
    resolve(ROOT, ".github/workflows/production-feedback.yml"),
    "utf8"
  ),
  "drift-fix.yml": readFileSync(resolve(ROOT, ".github/workflows/drift-fix.yml"), "utf8"),
  "pr-metrics.yml": readFileSync(resolve(ROOT, ".github/workflows/pr-metrics.yml"), "utf8"),
  "acmm-regression.yml": readFileSync(
    resolve(ROOT, ".github/workflows/acmm-regression.yml"),
    "utf8"
  ),
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makePr = (overrides = {}) => ({
  headRefName: "automation/production-feedback",
  labels: [{ name: "auto-merge" }],
  author: { login: "app/github-actions" },
  ...overrides,
});

// ---------------------------------------------------------------------------
// isAutomationPrApprovable — pure gate on which PRs this script may touch
// (#3982). Deliberately conservative: never approve arbitrary pending runs,
// only runs on an automation/* PR carrying auto-merge from the one identity
// merge-queue-eligibility.mjs already trusts.
// ---------------------------------------------------------------------------

describe("isAutomationPrApprovable", () => {
  it("approves a PR on an automation/* branch, carrying auto-merge, from the trusted author", () => {
    expect(isAutomationPrApprovable(makePr()).approvable).toBe(true);
  });

  it("rejects a PR whose head branch is not under automation/", () => {
    const result = isAutomationPrApprovable(makePr({ headRefName: "feature/some-branch" }));
    expect(result.approvable).toBe(false);
    expect(result.reason).toMatch(/automation\//);
  });

  it("rejects a PR without the auto-merge label (e.g. automation/auto-qa-tuning)", () => {
    const result = isAutomationPrApprovable(
      makePr({ headRefName: "automation/auto-qa-tuning", labels: [] })
    );
    expect(result.approvable).toBe(false);
    expect(result.reason).toMatch(/auto-merge/);
  });

  it("rejects an untrusted author even on an automation/* branch with auto-merge", () => {
    // Defense in depth: an automation/* branch + auto-merge label alone is
    // not proof of trust — only the verified bot identity is.
    const result = isAutomationPrApprovable(makePr({ author: { login: "mattbutlerengineering" } }));
    expect(result.approvable).toBe(false);
    expect(result.reason).toMatch(/not in TRUSTED_AUTOMATION_AUTHORS/);
  });

  it("accepts a plain-string label array, not just {name} objects", () => {
    expect(isAutomationPrApprovable(makePr({ labels: ["auto-merge"] })).approvable).toBe(true);
  });

  it("rejects a missing author", () => {
    const result = isAutomationPrApprovable(makePr({ author: undefined }));
    expect(result.approvable).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// selectActionRequiredRuns — pure filter over `gh run list --json` output
// ---------------------------------------------------------------------------

describe("selectActionRequiredRuns", () => {
  it("selects only runs parked at action_required", () => {
    const runs = [
      { databaseId: 1, status: "action_required", name: "CI" },
      { databaseId: 2, status: "completed", name: "CodeQL" },
      { databaseId: 3, status: "action_required", name: "tier-classifier" },
    ];
    expect(selectActionRequiredRuns(runs).map((run) => run.databaseId)).toEqual([1, 3]);
  });

  it("returns an empty array for an empty or missing run list", () => {
    expect(selectActionRequiredRuns([])).toEqual([]);
    expect(selectActionRequiredRuns(undefined)).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const runs = Object.freeze([{ databaseId: 1, status: "action_required" }]);
    expect(() => selectActionRequiredRuns(runs)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// approvePendingRuns — orchestration over the two pure gates above
// ---------------------------------------------------------------------------

describe("approvePendingRuns", () => {
  it("approves every action_required run on an approvable PR's branch", async () => {
    const approveRun = vi.fn().mockResolvedValue(undefined);
    const listRuns = vi.fn().mockResolvedValue([
      { databaseId: 101, status: "action_required" },
      { databaseId: 102, status: "completed" },
      { databaseId: 103, status: "action_required" },
    ]);

    const approved = await approvePendingRuns({
      getPr: async () => makePr(),
      listRuns,
      approveRun,
    });

    expect(listRuns).toHaveBeenCalledWith("automation/production-feedback");
    expect(approveRun).toHaveBeenCalledWith(101);
    expect(approveRun).toHaveBeenCalledWith(103);
    expect(approveRun).not.toHaveBeenCalledWith(102);
    expect(approved).toEqual([101, 103]);
  });

  it("does not list or approve runs when the PR is not approvable", async () => {
    const listRuns = vi.fn();
    const approveRun = vi.fn();
    const log = vi.fn();

    const approved = await approvePendingRuns({
      getPr: async () => makePr({ headRefName: "chore/manual-branch" }),
      listRuns,
      approveRun,
      log,
    });

    expect(approved).toEqual([]);
    expect(listRuns).not.toHaveBeenCalled();
    expect(approveRun).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("skipping"));
  });

  it("is a silent no-op when nothing is action_required", async () => {
    const approveRun = vi.fn();

    const approved = await approvePendingRuns({
      getPr: async () => makePr(),
      listRuns: async () => [{ databaseId: 1, status: "completed" }],
      approveRun,
    });

    expect(approved).toEqual([]);
    expect(approveRun).not.toHaveBeenCalled();
  });

  it("dry-run reports what it would approve without calling approveRun", async () => {
    const approveRun = vi.fn();

    const approved = await approvePendingRuns({
      getPr: async () => makePr(),
      listRuns: async () => [{ databaseId: 7, status: "action_required" }],
      approveRun,
      dryRun: true,
    });

    expect(approved).toEqual([7]);
    expect(approveRun).not.toHaveBeenCalled();
  });

  it("logs and continues to the next run when one run's approval throws", async () => {
    const approveRun = vi.fn(async (id) => {
      if (id === 1) throw new Error("approve transient failure");
    });
    const log = vi.fn();

    const approved = await approvePendingRuns({
      getPr: async () => makePr(),
      listRuns: async () => [
        { databaseId: 1, status: "action_required" },
        { databaseId: 2, status: "action_required" },
      ],
      approveRun,
      log,
    });

    expect(approveRun).toHaveBeenCalledWith(1);
    expect(approveRun).toHaveBeenCalledWith(2);
    expect(approved).toEqual([2]);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("approve transient failure"));
  });
});

// ---------------------------------------------------------------------------
// Producer + rescue-cron wiring — each must call approve-automation-runs.mjs
// before dispatching CI / enabling auto-merge, or the action_required park
// blocks tier-classifier (and CI Gate) forever regardless of the eligibility
// gate (#3982).
// ---------------------------------------------------------------------------

describe.each(Object.entries(PRODUCER_WORKFLOWS))(
  "%s approve-pending-runs wiring (#3982)",
  (name, content) => {
    it("invokes approve-automation-runs.mjs before the Enable auto-merge step", () => {
      const approveAt = content.indexOf("scripts/approve-automation-runs.mjs");
      const enableAt = content.indexOf("- name: Enable auto-merge");
      expect(approveAt).toBeGreaterThan(-1);
      expect(enableAt).toBeGreaterThan(approveAt);
    });

    it("only runs the approval step when a PR was actually created", () => {
      const approveStepAt = content.indexOf("scripts/approve-automation-runs.mjs");
      const stepStart = content.lastIndexOf("- name:", approveStepAt);
      const nextStepAt = content.indexOf("\n      - name:", stepStart + 1);
      const step = content.slice(stepStart, nextStepAt === -1 ? undefined : nextStepAt);
      expect(step).toMatch(/if: steps\.create-pr\.outputs\.pull-request-number/);
    });
  }
);

describe("automation-pr-rescue.yml wiring (#3982)", () => {
  const workflow = readFileSync(
    resolve(ROOT, ".github/workflows/automation-pr-rescue.yml"),
    "utf8"
  );

  it("still runs the rescue script (approval is wired inside rescue-automation-prs.mjs itself)", () => {
    expect(workflow).toMatch(/node scripts\/rescue-automation-prs\.mjs/);
  });
});
