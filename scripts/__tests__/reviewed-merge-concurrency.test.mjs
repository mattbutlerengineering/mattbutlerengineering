// #10192: GitHub cancels the PENDING run of a concurrency group when a newer run
// queues, even with `cancel-in-progress: false`, and a run the job `if:` skips
// still counts. reviewed-merge.yml lost 82% of its runs that way. These tests
// evaluate the real `concurrency.group` expression.
import { readFileSync } from "node:fs";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";
import { evaluateTemplate } from "../lib/workflow-expression.mjs";

const wf = load(
  readFileSync(new URL("../../.github/workflows/reviewed-merge.yml", import.meta.url), "utf8")
);
const group = (github) => evaluateTemplate(wf.concurrency.group, github);

const sweep = {
  event_name: "workflow_run",
  event: { workflow_run: { conclusion: "success" } },
  run_id: 1,
};
const labeled = (label, n, run_id) => ({
  event_name: "pull_request_target",
  event: { label: { name: label }, pull_request: { number: n } },
  run_id,
});

describe("reviewed-merge.yml concurrency (#10192)", () => {
  it("never uses cancel-in-progress: true (would kill an executing merge)", () => {
    expect(wf.concurrency["cancel-in-progress"]).toBe(false);
  });

  it("keeps the CI-completion arm", () => {
    expect(wf.on.workflow_run.workflows).toEqual(["CI"]);
  });

  it("a cancelled CI completion cannot displace a queued sweep", () => {
    const cancelled = { ...sweep, run_id: 2, event: { workflow_run: { conclusion: "cancelled" } } };
    expect(group(cancelled)).not.toBe(group(sweep));
    expect(group(cancelled)).toContain("2");
  });

  it("the job is skipped for non-success CI completions", () => {
    expect(wf.jobs.merge.if).toContain("workflow_run.conclusion == 'success'");
  });

  it("a non-reviewed label event gets its own group", () => {
    expect(group(labeled("needs-review", 7, 3))).not.toBe(group(sweep));
    expect(group(labeled("needs-review", 7, 3))).toContain("3");
  });

  it("a reviewed label event is grouped per PR, apart from the sweeps", () => {
    expect(group(labeled("reviewed", 7, 4))).toBe(group(labeled("reviewed", 7, 5)));
    expect(group(labeled("reviewed", 7, 4))).not.toBe(group(labeled("reviewed", 8, 4)));
    expect(group(labeled("reviewed", 7, 4))).not.toBe(group(sweep));
  });

  it("the cron arm cannot be starved by the event-driven arm", () => {
    const cron = { event_name: "schedule", event: {}, run_id: 6 };
    expect(group(cron)).not.toBe(group(sweep));
    expect(group(cron)).toBe(group({ ...cron, run_id: 9 }));
  });

  it("successful CI completions still share one latest-wins sweep group", () => {
    expect(group(sweep)).toBe(group({ ...sweep, run_id: 99 }));
  });
});
