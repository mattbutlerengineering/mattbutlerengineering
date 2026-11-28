import { describe, it, expect } from "vitest";
import {
  jobTimes,
  criticalChain,
  summarizeJobs,
  attributeWall,
  backlogNow,
  summarizeDeploys,
  verdictRows,
  renderMarkdown,
} from "../dev-speed-report.mjs";
import { selectGateSample } from "../collect-sdlc-speed.mjs";

const at = (min) => new Date(Date.UTC(2026, 10, 27, 12, 0, 0) + min * 60_000).toISOString();

// Shape of one `actions/runs/<id>/jobs` entry.
const job = (name, created, started, completed, over = {}) => ({
  name,
  conclusion: "success",
  created_at: at(created),
  started_at: started === null ? null : at(started),
  completed_at: completed === null ? null : at(completed),
  ...over,
});

// Build waits 2 min for a runner and runs 3; Test starts when Build ends, waits
// 4 and runs 5; Lint is off the critical path; CI Gate closes the run at 15 min.
const runA = {
  run: { id: 1, created_at: at(0) },
  jobs: [
    job("Build", 0, 2, 5),
    job("Lint", 0, 1, 2),
    job("Test", 5, 9, 14),
    job("CI Gate", 14, 14.5, 15),
  ],
};

describe("jobTimes", () => {
  it("splits a job into queue wait and run time in minutes", () => {
    expect(jobTimes(job("Build", 0, 2, 5))).toEqual({ name: "Build", runMin: 3, queueMin: 2 });
  });

  it("returns null for a job that did not run to success or failure", () => {
    expect(jobTimes(job("E2E", 0, 1, 2, { conclusion: "skipped" }))).toBeNull();
    expect(jobTimes(job("E2E", 0, 1, 2, { conclusion: "cancelled" }))).toBeNull();
    expect(jobTimes(job("E2E", 0, null, null))).toBeNull();
  });
});

describe("criticalChain", () => {
  it("walks back from CI Gate through the job that released each start", () => {
    expect(criticalChain(runA.jobs).map((j) => j.name)).toEqual(["Build", "Test", "CI Gate"]);
  });

  it("is empty when CI Gate never completed", () => {
    expect(criticalChain([job("Build", 0, 2, 5)])).toEqual([]);
  });
});

describe("summarizeJobs", () => {
  it("reports median and p90 run time and queue wait per job, slowest first", () => {
    const rows = summarizeJobs([runA]);
    expect(rows.map((r) => r.name)).toEqual(["Test", "Build", "Lint", "CI Gate"]);
    expect(rows[0]).toEqual({
      name: "Test",
      n: 1,
      runP50: 5,
      runP90: 5,
      queueP50: 4,
      queueP90: 4,
      criticalShare: 1,
    });
    expect(rows.find((r) => r.name === "Lint").criticalShare).toBe(0);
  });

  it("exposes a cache-miss tail as a p90 far above the median", () => {
    const fast = (id) => ({
      run: { id, created_at: at(0) },
      jobs: [job("Test", 0, 0, 1), job("CI Gate", 1, 1, 1.5)],
    });
    const slow = {
      run: { id: 99, created_at: at(0) },
      jobs: [job("Test", 0, 0, 14), job("CI Gate", 14, 14, 14.5)],
    };
    const [test] = summarizeJobs([...[1, 2, 3, 4, 5, 6, 7, 8].map(fast), slow, slow]);
    expect(test).toMatchObject({ name: "Test", n: 10, runP50: 1, runP90: 14 });
  });
});

describe("attributeWall", () => {
  it("splits push to CI Gate into critical-path run time and waiting", () => {
    // 15 min wall; Build 3 + Test 5 + Gate 0.5 = 8.5 min of work on the chain.
    expect(attributeWall([runA])).toEqual({
      runs: 1,
      p50: 15,
      p90: 15,
      queueShare: 0.43,
      queueShareSlowest: 0.43,
    });
  });

  it("skips a run whose CI Gate never completed", () => {
    const noGate = { run: { id: 2, created_at: at(0) }, jobs: [job("Build", 0, 2, 5)] };
    expect(attributeWall([runA, noGate]).runs).toBe(1);
  });

  it("returns zeros, never NaN, for no runs", () => {
    expect(attributeWall([])).toEqual({
      runs: 0,
      p50: 0,
      p90: 0,
      queueShare: 0,
      queueShareSlowest: 0,
    });
  });
});

describe("selectGateSample (reused for sampling)", () => {
  it("drops action_required, cancelled and skipped runs", () => {
    const runs = ["action_required", "success", "cancelled", "failure", "skipped"].map(
      (conclusion, id) => ({ id, conclusion })
    );
    expect(selectGateSample(runs, 60).map((r) => r.conclusion)).toEqual(["success", "failure"]);
  });
});

describe("backlogNow", () => {
  it("is the median wait of jobs created in the last hour, counting still-queued jobs", () => {
    const now = new Date(at(60));
    const jobs = [
      job("old", -30, -20, -10), // created before the window
      job("a", 10, 12, 20), // waited 2
      job("b", 20, 30, 40), // waited 10
      job("c", 40, null, null, { conclusion: null }), // still queued: 20 so far
    ];
    expect(backlogNow(jobs, now)).toEqual({ jobs: 3, medianQueueMin: 10 });
  });

  it("ignores skipped and cancelled jobs, which never waited for a runner", () => {
    const now = new Date(at(60));
    const jobs = [
      job("skipped", 10, 10, 10, { conclusion: "skipped" }),
      job("cancelled", 10, null, 12, { conclusion: "cancelled" }),
      job("a", 20, 36, 40),
    ];
    expect(backlogNow(jobs, now)).toEqual({ jobs: 1, medianQueueMin: 16 });
  });
});

describe("summarizeDeploys", () => {
  const deployJob = (conclusion, completed, steps = []) => ({
    name: "Deploy API Services",
    conclusion,
    completed_at: at(completed),
    steps,
  });
  const waitFailed = {
    name: "Wait for CI",
    conclusion: "failure",
    completed_at: at(0),
    steps: [{ name: "Wait for CI workflow", conclusion: "failure" }],
  };

  it("measures lead time to the first successful deploy job at or after each push", () => {
    const runs = [
      // Push at 0 fails in Wait for CI; the push at 30 deploys both at 50.
      { id: 1, created_at: at(0), conclusion: "failure", jobs: [waitFailed] },
      { id: 2, created_at: at(30), conclusion: "success", jobs: [deployJob("success", 50)] },
    ];
    expect(summarizeDeploys(runs, new Date(at(60)))).toEqual({
      runs: 2,
      deployed: 1,
      leadP50: 20,
      leadP90: 50,
      failuresByStep: { "Wait for CI / Wait for CI workflow": 1 },
      undeployed: 0,
      oldestUndeployedMin: 0,
    });
  });

  it("does not count a workflow-level success whose deploy job was skipped", () => {
    const runs = [
      { id: 1, created_at: at(0), conclusion: "success", jobs: [deployJob("skipped", 5)] },
      { id: 2, created_at: at(10), conclusion: "failure", jobs: [waitFailed] },
    ];
    expect(summarizeDeploys(runs, new Date(at(100)))).toMatchObject({
      deployed: 0,
      leadP50: 0,
      undeployed: 2,
      oldestUndeployedMin: 100,
    });
  });
});

describe("verdictRows", () => {
  it("returns the target and control rows for runs created after the merge", () => {
    const later = {
      run: { id: 3, created_at: at(120) },
      jobs: [job("Test", 120, 120, 122), job("Lint", 120, 120, 121), job("CI Gate", 122, 122, 123)],
    };
    expect(verdictRows([runA, later], { since: at(60), job: "Test", control: "Lint" })).toEqual({
      since: at(60),
      runs: 1,
      target: expect.objectContaining({ name: "Test", n: 1, runP50: 2 }),
      control: expect.objectContaining({ name: "Lint", n: 1, runP50: 1 }),
    });
  });

  it("returns null rows when no run after the merge has the job", () => {
    expect(verdictRows([runA], { since: at(60), job: "Test", control: "Lint" })).toEqual({
      since: at(60),
      runs: 0,
      target: null,
      control: null,
    });
  });
});

describe("renderMarkdown", () => {
  it("renders the header line and one bottleneck row per job", () => {
    const md = renderMarkdown({
      days: 7,
      wall: attributeWall([runA]),
      jobs: summarizeJobs([runA]),
      backlog: { jobs: 0, medianQueueMin: 0 },
      deploys: null,
    });
    expect(md).toContain("window 7d · 1 PR runs · CI wall p50 15m p90 15m (queue 43% at p90)");
    expect(md).toContain("| 1 | Test | 5 | 5 | 4 | 4 | 100% |");
    expect(md).toContain("merge→deploy: not measured");
  });
});
