import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  isAutomationPrApprovable,
  selectActionRequiredRuns,
  decidePollStep,
  approvePendingRuns,
} from "../approve-automation-runs.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

// A fake clock for approvePendingRuns' injected now()/sleep(): time only
// advances when sleep() is awaited, so polling tests run instantly instead
// of waiting on real timers, while still exercising the real elapsed-time
// math against DEFAULT_TIMEOUT_MS/DEFAULT_POLL_INTERVAL_MS.
const makeFakeClock = (startAt = 0) => {
  let time = startAt;
  return {
    now: () => time,
    sleep: async (ms) => {
      time += ms;
    },
  };
};

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
// decidePollStep — pure poll/timeout decision core (#4712). Given a sequence
// of action_required run-ID snapshots (oldest first) and the poll clock,
// decides poll-again / settled / timed-out.
// ---------------------------------------------------------------------------

describe("decidePollStep", () => {
  it("polls again on the very first snapshot, even if non-empty (needs a second poll to confirm settling)", () => {
    const result = decidePollStep({ snapshots: [[101, 103]], elapsedMs: 0, timeoutMs: 60000 });
    expect(result).toBe("poll-again");
  });

  it("settles once a non-empty snapshot repeats with no new IDs — runs appear immediately", () => {
    const result = decidePollStep({
      snapshots: [
        [101, 103],
        [101, 103],
      ],
      elapsedMs: 5000,
      timeoutMs: 60000,
    });
    expect(result).toBe("settled");
  });

  it("keeps polling while new run IDs are still arriving — runs appear after N polls", () => {
    const growing = decidePollStep({
      snapshots: [[], [], [201, 203]],
      elapsedMs: 10000,
      timeoutMs: 60000,
    });
    expect(growing).toBe("poll-again");

    const settled = decidePollStep({
      snapshots: [[], [], [201, 203], [201, 203]],
      elapsedMs: 15000,
      timeoutMs: 60000,
    });
    expect(settled).toBe("settled");
  });

  it("settles even if the latest snapshot shrank from a prior one (an approved run left action_required)", () => {
    const result = decidePollStep({
      snapshots: [[1, 2], [1, 2], []],
      elapsedMs: 10000,
      timeoutMs: 60000,
    });
    expect(result).toBe("settled");
  });

  it("times out once elapsed reaches the ceiling with nothing ever seen — runs never appear", () => {
    const result = decidePollStep({
      snapshots: [[], [], []],
      elapsedMs: 60000,
      timeoutMs: 60000,
    });
    expect(result).toBe("timed-out");
  });

  it("times out rather than settling when elapsed reaches the ceiling on a still-growing set", () => {
    const result = decidePollStep({
      snapshots: [[], [1], [1, 2, 3]],
      elapsedMs: 60000,
      timeoutMs: 60000,
    });
    expect(result).toBe("timed-out");
  });
});

// ---------------------------------------------------------------------------
// approvePendingRuns — orchestration over the pure gates above
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
      ...makeFakeClock(),
    });

    expect(listRuns).toHaveBeenCalledWith("automation/production-feedback");
    expect(approveRun).toHaveBeenCalledWith(101);
    expect(approveRun).toHaveBeenCalledWith(103);
    expect(approveRun).not.toHaveBeenCalledWith(102);
    expect(approved).toEqual([101, 103]);
  });

  it("approves runs that only show up after a few polls (the #4712 race)", async () => {
    // The first two listRuns() calls simulate the observed race: GitHub
    // hasn't finished creating the nine parked runs yet, so nothing is
    // action_required. The third call is the first to see them.
    const approveRun = vi.fn().mockResolvedValue(undefined);
    const listRuns = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValue([
        { databaseId: 201, status: "action_required" },
        { databaseId: 203, status: "action_required" },
      ]);

    const approved = await approvePendingRuns({
      getPr: async () => makePr(),
      listRuns,
      approveRun,
      ...makeFakeClock(),
    });

    expect(approveRun).toHaveBeenCalledWith(201);
    expect(approveRun).toHaveBeenCalledWith(203);
    expect(approved.sort()).toEqual([201, 203]);
    expect(listRuns.mock.calls.length).toBeGreaterThanOrEqual(4);
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

  it("polls to the timeout, then no-ops with a warning when nothing ever appears", async () => {
    // #4712: "runs never appear" — action_required never shows up across the
    // whole poll window, so the loop must not hang forever; it bails at the
    // timeout, warns, and returns an empty approved list without throwing.
    const approveRun = vi.fn();
    const listRuns = vi.fn().mockResolvedValue([{ databaseId: 1, status: "completed" }]);
    const log = vi.fn();

    const approved = await approvePendingRuns({
      getPr: async () => makePr(),
      listRuns,
      approveRun,
      log,
      ...makeFakeClock(),
    });

    expect(approved).toEqual([]);
    expect(approveRun).not.toHaveBeenCalled();
    expect(listRuns.mock.calls.length).toBeGreaterThan(1);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("timed out"));
  });

  it("dry-run reports what it would approve without calling approveRun", async () => {
    const approveRun = vi.fn();

    const approved = await approvePendingRuns({
      getPr: async () => makePr(),
      listRuns: async () => [{ databaseId: 7, status: "action_required" }],
      approveRun,
      dryRun: true,
      ...makeFakeClock(),
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
      ...makeFakeClock(),
    });

    expect(approveRun).toHaveBeenCalledWith(1);
    expect(approveRun).toHaveBeenCalledWith(2);
    expect(approveRun).toHaveBeenCalledTimes(2);
    expect(approved).toEqual([2]);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("approve transient failure"));
  });

  it("names still-parked runs in the timeout warning when approval keeps failing", async () => {
    // A run that's seen but whose approveRun() attempt always throws stays
    // action_required forever in this mock, and a fresh run ID shows up
    // every poll (simulating runs still trickling in) so the loop never
    // settles and instead rides out to the timeout with #1 unapproved.
    const approveRun = vi.fn(async (id) => {
      if (id === 1) throw new Error("approve transient failure");
    });
    const log = vi.fn();
    let call = 0;
    const listRuns = vi.fn(async () => {
      call += 1;
      return [
        { databaseId: 1, status: "action_required" },
        { databaseId: 1000 + call, status: "action_required" },
      ];
    });

    const approved = await approvePendingRuns({
      getPr: async () => makePr(),
      listRuns,
      approveRun,
      log,
      ...makeFakeClock(),
    });

    expect(approved).not.toContain(1);
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/timed out.*still parked.*#1\b/s));
  });

  // #4009: getPr()/listRuns() were not wrapped in the same fail-open
  // try/catch as approveRun(), so a transient gh-CLI error (5xx, rate limit,
  // auth hiccup) propagated uncaught out of approvePendingRuns, failing the
  // workflow step and skipping "Enable auto-merge" entirely.
  it("degrades gracefully (returns [] and logs) instead of throwing when getPr throws", async () => {
    const listRuns = vi.fn();
    const approveRun = vi.fn();
    const log = vi.fn();

    const approved = await approvePendingRuns({
      getPr: async () => {
        throw new Error("gh pr view: transient 5xx");
      },
      listRuns,
      approveRun,
      log,
    });

    expect(approved).toEqual([]);
    expect(listRuns).not.toHaveBeenCalled();
    expect(approveRun).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("gh pr view: transient 5xx"));
  });

  it("degrades gracefully (returns [] and logs) instead of throwing when listRuns throws", async () => {
    const approveRun = vi.fn();
    const log = vi.fn();

    const approved = await approvePendingRuns({
      getPr: async () => makePr(),
      listRuns: async () => {
        throw new Error("gh run list: rate limited");
      },
      approveRun,
      log,
    });

    expect(approved).toEqual([]);
    expect(approveRun).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("gh run list: rate limited"));
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
