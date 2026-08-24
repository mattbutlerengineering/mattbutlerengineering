import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { COORDINATION_LABELS } from "@mbe/gh-client";
import {
  DEFAULT_THRESHOLD,
  classifyScheduledWorkflowHealth,
  hasScheduleTrigger,
  findScheduledWorkflows,
  buildScheduledFailureTitle,
  extractWorkflowNameFromIssueTitle,
  findPriorScheduledFailureIssue,
  buildScheduledFailureBody,
  buildScheduledFailureCreateArgs,
  runScheduledWorkflowHealthCheck,
  resolveWorkflowModifiedAt,
} from "../scheduled-workflow-health.mjs";

describe("classifyScheduledWorkflowHealth", () => {
  it("reports healthy when the most recent runs are not all failures", () => {
    const runs = [
      { conclusion: "success", url: "u1" },
      { conclusion: "failure", url: "u2" },
      { conclusion: "success", url: "u3" },
    ];
    expect(classifyScheduledWorkflowHealth({ runs, threshold: 3 })).toEqual({
      status: "healthy",
      streak: 0,
      failingRuns: [],
    });
  });

  it("reports failing-streak when exactly threshold runs are all failures", () => {
    const runs = [
      { conclusion: "failure", url: "u1" },
      { conclusion: "failure", url: "u2" },
      { conclusion: "failure", url: "u3" },
    ];
    const result = classifyScheduledWorkflowHealth({ runs, threshold: 3 });
    expect(result.status).toBe("failing-streak");
    expect(result.streak).toBe(3);
    expect(result.failingRuns).toEqual(runs);
  });

  it("reports healthy when a failing streak is broken by an older success", () => {
    const runs = [
      { conclusion: "failure", url: "u1" },
      { conclusion: "failure", url: "u2" },
      { conclusion: "success", url: "u3" },
      { conclusion: "failure", url: "u4" },
    ];
    expect(classifyScheduledWorkflowHealth({ runs, threshold: 3 }).status).toBe("healthy");
  });

  it("excludes cancelled/skipped runs entirely rather than counting them as failures", () => {
    const runs = [
      { conclusion: "skipped", url: "u1" },
      { conclusion: "skipped", url: "u2" },
      { conclusion: "skipped", url: "u3" },
      { conclusion: "skipped", url: "u4" },
    ];
    expect(classifyScheduledWorkflowHealth({ runs, threshold: 3 })).toEqual({
      status: "insufficient-history",
      streak: 0,
      failingRuns: [],
    });
  });

  it("reports insufficient-history when fewer than threshold completed runs exist", () => {
    const runs = [
      { conclusion: "failure", url: "u1" },
      { conclusion: "failure", url: "u2" },
    ];
    const result = classifyScheduledWorkflowHealth({ runs, threshold: 3 });
    expect(result.status).toBe("insufficient-history");
    expect(result.streak).toBe(2);
  });

  it("excludes cancelled runs from the streak without treating them as breaking it", () => {
    const runs = [
      { conclusion: "failure", url: "u1" },
      { conclusion: "cancelled", url: "u2" },
      { conclusion: "failure", url: "u3" },
      { conclusion: "failure", url: "u4" },
    ];
    const result = classifyScheduledWorkflowHealth({ runs, threshold: 3 });
    expect(result.status).toBe("failing-streak");
    expect(result.failingRuns.map((r) => r.url)).toEqual(["u1", "u3", "u4"]);
  });

  it("defaults threshold to DEFAULT_THRESHOLD when omitted", () => {
    expect(DEFAULT_THRESHOLD).toBe(3);
    const runs = [
      { conclusion: "failure", url: "u1" },
      { conclusion: "failure", url: "u2" },
      { conclusion: "failure", url: "u3" },
    ];
    expect(classifyScheduledWorkflowHealth({ runs }).status).toBe("failing-streak");
  });

  // A non-numeric --threshold reaches this function as NaN, and every
  // comparison against NaN is false: `relevant.length < NaN` does not
  // short-circuit to insufficient-history, `slice(0, NaN)` yields [], and
  // `[].every(...)` is vacuously true — so an unguarded NaN classifies EVERY
  // scheduled workflow as failing and files a ci-fix issue for each of them.
  // Threshold 0 reaches the same vacuous-truth path by a different route.
  it.each([
    ["NaN (a non-numeric --threshold)", Number.NaN],
    ["zero", 0],
    ["negative", -1],
    ["fractional", 2.5],
  ])("never reports failing-streak on a vacuous window: threshold %s", (_label, threshold) => {
    const runs = [
      { conclusion: "success", url: "u1" },
      { conclusion: "success", url: "u2" },
      { conclusion: "success", url: "u3" },
      { conclusion: "success", url: "u4" },
    ];
    expect(classifyScheduledWorkflowHealth({ runs, threshold }).status).not.toBe("failing-streak");
  });

  // #4291: the classifier read run history with no reference to when the
  // workflow was last changed, so a workflow that was broken, fixed, and not
  // yet re-run was indistinguishable from a chronically broken one. On the
  // detector's first live run that was 2 of 5 findings (#4287 chaos-agent,
  // #4290 resource-audit — the latter by 1h39m).
  describe("workflowModifiedAt (fix-vs-failure ordering)", () => {
    const FAILURES_AUG_10 = [
      { conclusion: "failure", url: "u1", createdAt: "2026-08-10T09:00:00Z" },
      { conclusion: "failure", url: "u2", createdAt: "2026-08-03T09:00:00Z" },
      { conclusion: "failure", url: "u3", createdAt: "2026-07-27T09:00:00Z" },
    ];

    it("reports awaiting-rerun when every failing run predates the workflow's last change", () => {
      const result = classifyScheduledWorkflowHealth({
        runs: FAILURES_AUG_10,
        threshold: 3,
        workflowModifiedAt: "2026-08-15T05:56:20Z",
      });
      expect(result.status).toBe("awaiting-rerun");
    });

    it("never reports failing-streak for an awaiting-rerun workflow", () => {
      const result = classifyScheduledWorkflowHealth({
        runs: FAILURES_AUG_10,
        threshold: 3,
        workflowModifiedAt: "2026-08-15T05:56:20Z",
      });
      expect(result.status).not.toBe("failing-streak");
    });

    it("still reports failing-streak when a failing run postdates the change (#4286/#4289 must survive)", () => {
      const runs = [
        { conclusion: "failure", url: "u1", createdAt: "2026-08-14T09:00:00Z" },
        { conclusion: "failure", url: "u2", createdAt: "2026-08-07T09:00:00Z" },
        { conclusion: "failure", url: "u3", createdAt: "2026-07-31T09:00:00Z" },
      ];
      const result = classifyScheduledWorkflowHealth({
        runs,
        threshold: 3,
        workflowModifiedAt: "2026-08-03T00:00:00Z",
      });
      expect(result.status).toBe("failing-streak");
      expect(result.streak).toBe(3);
    });

    // The exact #4290 margin: last failing run 1h39m BEFORE the fix landed.
    it("does not flag a failing run 99 minutes before the modification timestamp", () => {
      const runs = [
        { conclusion: "failure", url: "u1", createdAt: "2026-08-15T04:17:27Z" },
        { conclusion: "failure", url: "u2", createdAt: "2026-08-08T04:43:46Z" },
        { conclusion: "failure", url: "u3", createdAt: "2026-08-01T06:18:22Z" },
      ];
      const result = classifyScheduledWorkflowHealth({
        runs,
        threshold: 3,
        workflowModifiedAt: "2026-08-15T05:56:20Z",
      });
      expect(result.status).toBe("awaiting-rerun");
    });

    it("keeps current behavior when workflowModifiedAt is absent", () => {
      expect(classifyScheduledWorkflowHealth({ runs: FAILURES_AUG_10, threshold: 3 }).status).toBe(
        "failing-streak"
      );
    });

    it("keeps current behavior when workflowModifiedAt is unparseable", () => {
      const result = classifyScheduledWorkflowHealth({
        runs: FAILURES_AUG_10,
        threshold: 3,
        workflowModifiedAt: "not-a-date",
      });
      expect(result.status).toBe("failing-streak");
    });

    it("keeps current behavior when runs carry no createdAt to compare", () => {
      const runs = [
        { conclusion: "failure", url: "u1" },
        { conclusion: "failure", url: "u2" },
        { conclusion: "failure", url: "u3" },
      ];
      const result = classifyScheduledWorkflowHealth({
        runs,
        threshold: 3,
        workflowModifiedAt: "2026-08-15T05:56:20Z",
      });
      expect(result.status).toBe("failing-streak");
    });
  });

  it("falls back to DEFAULT_THRESHOLD when threshold is not a positive integer", () => {
    const runs = [
      { conclusion: "failure", url: "u1" },
      { conclusion: "failure", url: "u2" },
    ];
    // Two failures is below DEFAULT_THRESHOLD (3), so the fallback must read
    // as insufficient-history rather than as a streak of length NaN/0.
    expect(classifyScheduledWorkflowHealth({ runs, threshold: Number.NaN })).toEqual({
      status: "insufficient-history",
      streak: 2,
      failingRuns: [],
    });
  });
});

describe("hasScheduleTrigger", () => {
  it("detects a schedule trigger nested under a bare on: key", () => {
    const source = `name: Foo\n\non:\n  schedule:\n    - cron: "0 8 * * *"\n  workflow_dispatch:\n\njobs:\n  x:\n    runs-on: ubuntu-latest\n`;
    expect(hasScheduleTrigger(source)).toBe(true);
  });

  it("returns false when there is no schedule trigger", () => {
    const source = `name: Foo\n\non:\n  push:\n    branches: [main]\n\njobs:\n  x:\n    runs-on: ubuntu-latest\n`;
    expect(hasScheduleTrigger(source)).toBe(false);
  });

  it("returns false when there is no on: block at all", () => {
    expect(hasScheduleTrigger("name: Foo\njobs:\n  x:\n    runs-on: ubuntu-latest\n")).toBe(false);
  });
});

describe("findScheduledWorkflows", () => {
  let dir;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "scheduled-workflows-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("finds only workflow files with a schedule trigger, sorted by file name", () => {
    writeFileSync(
      join(dir, "b-scheduled.yml"),
      `name: B Scheduled\non:\n  schedule:\n    - cron: "0 9 * * *"\n`
    );
    writeFileSync(
      join(dir, "a-scheduled.yml"),
      `name: A Scheduled\non:\n  schedule:\n    - cron: "0 8 * * *"\n`
    );
    writeFileSync(
      join(dir, "not-scheduled.yml"),
      `name: Not Scheduled\non:\n  push:\n    branches: [main]\n`
    );

    const result = findScheduledWorkflows(dir);
    expect(result).toEqual([
      { name: "A Scheduled", file: "a-scheduled.yml", path: ".github/workflows/a-scheduled.yml" },
      { name: "B Scheduled", file: "b-scheduled.yml", path: ".github/workflows/b-scheduled.yml" },
    ]);
  });

  it("falls back to the file name when a workflow has no name: field", () => {
    writeFileSync(join(dir, "unnamed.yml"), `on:\n  schedule:\n    - cron: "0 8 * * *"\n`);
    const result = findScheduledWorkflows(dir);
    expect(result).toEqual([
      { name: "unnamed.yml", file: "unnamed.yml", path: ".github/workflows/unnamed.yml" },
    ]);
  });
});

describe("buildScheduledFailureTitle / extractWorkflowNameFromIssueTitle", () => {
  it("round-trips the workflow name through the deterministic title", () => {
    const title = buildScheduledFailureTitle("release.yml", 3);
    expect(title).toBe("ci-fix: release.yml has failed 3 consecutive scheduled runs");
    expect(extractWorkflowNameFromIssueTitle({ title })).toBe("release.yml");
  });

  it("returns null for a title that doesn't match the pattern", () => {
    expect(extractWorkflowNameFromIssueTitle({ title: "unrelated issue" })).toBeNull();
  });
});

describe("findPriorScheduledFailureIssue", () => {
  it("finds the issue tracking the same workflow's failing streak", () => {
    const candidates = [
      { number: 1, title: "ci-fix: release.yml has failed 3 consecutive scheduled runs" },
      { number: 2, title: "ci-fix: chaos-agent.yml has failed 6 consecutive scheduled runs" },
    ];
    expect(findPriorScheduledFailureIssue(candidates, "release.yml")).toBe(1);
    expect(findPriorScheduledFailureIssue(candidates, "unrelated.yml")).toBeNull();
  });
});

describe("buildScheduledFailureBody", () => {
  it("includes the workflow path, streak length, and failing run URLs", () => {
    const body = buildScheduledFailureBody({
      workflowPath: ".github/workflows/release.yml",
      streak: 3,
      runs: [
        { url: "https://github.com/x/y/actions/runs/1" },
        { url: "https://github.com/x/y/actions/runs/2" },
      ],
    });
    expect(body).toContain(".github/workflows/release.yml");
    expect(body).toContain("3 consecutive");
    expect(body).toContain("https://github.com/x/y/actions/runs/1");
    expect(body).toContain("https://github.com/x/y/actions/runs/2");
  });
});

describe("buildScheduledFailureCreateArgs", () => {
  it("carries the ci-fix and ready labels", () => {
    const args = buildScheduledFailureCreateArgs("title", "body");
    expect(args).toEqual([
      "--title",
      "title",
      "--body",
      "body",
      "--label",
      "ci-fix",
      "--label",
      COORDINATION_LABELS.READY,
    ]);
  });
});

describe("runScheduledWorkflowHealthCheck", () => {
  it("files one ci-fix issue for a failing-streak workflow and skips a healthy one", () => {
    const workflows = [
      { name: "release.yml", path: ".github/workflows/release.yml" },
      { name: "healthy.yml", path: ".github/workflows/healthy.yml" },
    ];
    const runsByWorkflow = {
      "release.yml": [
        { conclusion: "failure", url: "u1" },
        { conclusion: "failure", url: "u2" },
        { conclusion: "failure", url: "u3" },
      ],
      "healthy.yml": [
        { conclusion: "success", url: "u1" },
        { conclusion: "success", url: "u2" },
        { conclusion: "success", url: "u3" },
      ],
    };
    const created = [];

    const results = runScheduledWorkflowHealthCheck({
      workflows,
      threshold: 3,
      getRuns: (name) => runsByWorkflow[name],
      searchCiFixIssues: () => [],
      getIssueState: () => "missing",
      createIssue: (title, body) => {
        created.push({ title, body });
        return 42;
      },
    });

    expect(created).toHaveLength(1);
    expect(created[0].title).toBe("ci-fix: release.yml has failed 3 consecutive scheduled runs");
    expect(results).toEqual([
      { workflow: "release.yml", status: "failing-streak", action: "create", issueNumber: 42 },
      { workflow: "healthy.yml", status: "healthy" },
    ]);
  });

  it("skips filing a duplicate when an open issue already tracks the streak", () => {
    const workflows = [{ name: "release.yml", path: ".github/workflows/release.yml" }];
    const runs = [
      { conclusion: "failure", url: "u1" },
      { conclusion: "failure", url: "u2" },
      { conclusion: "failure", url: "u3" },
    ];
    let createCalled = false;

    const results = runScheduledWorkflowHealthCheck({
      workflows,
      threshold: 3,
      getRuns: () => runs,
      searchCiFixIssues: () => [
        { number: 7, title: "ci-fix: release.yml has failed 3 consecutive scheduled runs" },
      ],
      getIssueState: () => "open",
      createIssue: () => {
        createCalled = true;
        return 999;
      },
    });

    expect(createCalled).toBe(false);
    expect(results).toEqual([
      { workflow: "release.yml", status: "failing-streak", action: "skip", issueNumber: 7 },
    ]);
  });

  it("does not report insufficient-history as failing and never creates an issue for it", () => {
    const workflows = [{ name: "new.yml", path: ".github/workflows/new.yml" }];
    let createCalled = false;

    const results = runScheduledWorkflowHealthCheck({
      workflows,
      threshold: 3,
      getRuns: () => [{ conclusion: "failure", url: "u1" }],
      searchCiFixIssues: () => [],
      getIssueState: () => "missing",
      createIssue: () => {
        createCalled = true;
        return 1;
      },
    });

    expect(createCalled).toBe(false);
    expect(results).toEqual([{ workflow: "new.yml", status: "insufficient-history" }]);
  });
});

describe("runScheduledWorkflowHealthCheck — awaiting-rerun", () => {
  const STALE_FAILURES = [
    { conclusion: "failure", url: "u1", createdAt: "2026-08-10T09:00:00Z" },
    { conclusion: "failure", url: "u2", createdAt: "2026-08-03T09:00:00Z" },
    { conclusion: "failure", url: "u3", createdAt: "2026-07-27T09:00:00Z" },
  ];
  const WORKFLOW = { name: "chaos-agent.yml", path: ".github/workflows/chaos-agent.yml" };

  it("files no issue for a workflow whose failures all predate its last change", () => {
    const created = [];
    const results = runScheduledWorkflowHealthCheck({
      workflows: [WORKFLOW],
      getRuns: () => STALE_FAILURES,
      threshold: 3,
      createIssue: (title) => {
        created.push(title);
        return 1;
      },
      getWorkflowModifiedAt: () => "2026-08-15T05:56:20Z",
    });

    expect(created).toEqual([]);
    expect(results).toEqual([{ workflow: "chaos-agent.yml", status: "awaiting-rerun" }]);
  });

  it("logs the suppression rather than dropping it silently", () => {
    const logs = [];
    runScheduledWorkflowHealthCheck({
      workflows: [WORKFLOW],
      getRuns: () => STALE_FAILURES,
      threshold: 3,
      createIssue: () => 1,
      getWorkflowModifiedAt: () => "2026-08-15T05:56:20Z",
      log: (msg) => logs.push(msg),
    });

    expect(logs.some((m) => m.includes("awaiting a post-change run"))).toBe(true);
  });

  it("still files when a failing run postdates the change", () => {
    const created = [];
    runScheduledWorkflowHealthCheck({
      workflows: [WORKFLOW],
      getRuns: () => [
        { conclusion: "failure", url: "u1", createdAt: "2026-08-20T09:00:00Z" },
        { conclusion: "failure", url: "u2", createdAt: "2026-08-13T09:00:00Z" },
        { conclusion: "failure", url: "u3", createdAt: "2026-08-06T09:00:00Z" },
      ],
      threshold: 3,
      createIssue: (title) => {
        created.push(title);
        return 7;
      },
      getWorkflowModifiedAt: () => "2026-08-15T05:56:20Z",
    });

    expect(created).toHaveLength(1);
  });
});

// resolveWorkflowModifiedAt — injectable exec, fails open (undefined) on a
// shallow clone so a depth-1 checkout can never masquerade as a real
// per-file timestamp (#4502).
describe("resolveWorkflowModifiedAt", () => {
  it("returns undefined without consulting git log when the repo is shallow", () => {
    const exec = (_cmd, args) => {
      if (args.includes("--is-shallow-repository")) return "true\n";
      throw new Error("git log should never be called on a shallow repo");
    };
    expect(
      resolveWorkflowModifiedAt(".github/workflows/chaos-agent.yml", { exec })
    ).toBeUndefined();
  });

  it("returns the per-file committer date when the repo is not shallow", () => {
    const exec = (_cmd, args) => {
      if (args.includes("--is-shallow-repository")) return "false\n";
      return "2026-08-01T00:00:00+00:00\n";
    };
    expect(resolveWorkflowModifiedAt(".github/workflows/chaos-agent.yml", { exec })).toBe(
      "2026-08-01T00:00:00+00:00"
    );
  });

  it("returns undefined when the shallow check itself fails", () => {
    const exec = () => {
      throw new Error("git not available");
    };
    expect(
      resolveWorkflowModifiedAt(".github/workflows/chaos-agent.yml", { exec })
    ).toBeUndefined();
  });
});
