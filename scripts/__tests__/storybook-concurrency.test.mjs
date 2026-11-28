// #10204: `storybook.yml` builds on PRs and deploys to GitHub Pages on main. Its
// group was the constant `pages` with `cancel-in-progress: true`, so every run
// shared it: a PR build could cancel a main run mid-deploy, and two PRs
// cancelled each other. A concurrency group holds one running and one pending
// run; a newer run always replaces the pending one, and replaces the running
// one too when `cancel-in-progress` is true.
import { describe, expect, it } from "vitest";
import { loadWorkflow } from "../lib/workflow.mjs";
import { evaluateTemplate } from "../lib/workflow-expression.mjs";

const storybook = loadWorkflow("storybook.yml");
const evaluate = (value, github) => evaluateTemplate(String(value), github);

const pr = (number) => ({
  workflow: storybook.name,
  event_name: "pull_request",
  ref: `refs/pull/${number}/merge`,
  run_id: 1000 + number,
  event: { pull_request: { number } },
});
const nonPr = (event_name, ref, run_id) => ({
  workflow: storybook.name,
  event_name,
  ref,
  run_id,
  event: { pull_request: {} },
});
const mainPush = (run_id = 1) => nonPr("push", "refs/heads/main", run_id);
const dispatch = (ref) => nonPr("workflow_dispatch", ref, 3);

/** Every run that reaches the deploy job: the job is gated only on "not a PR". */
const deployingRuns = [
  ["a push to main", mainPush()],
  ["a dispatch on main", dispatch("refs/heads/main")],
  ["a dispatch on another branch", dispatch("refs/heads/some-branch")],
];

const deployJobs = Object.values(storybook.jobs).filter((job) =>
  job.steps.some((step) => (step.uses ?? "").startsWith("actions/deploy-pages@"))
);

/** Each `concurrency` block a deploying job is subject to: the workflow's and its own. */
const deployLevels = [
  ["workflow", storybook.concurrency],
  ...deployJobs.map((job) => ["deploy job", job.concurrency]),
].filter(([, concurrency]) => concurrency);

describe("storybook.yml concurrency (#10204)", () => {
  it("finds the deploy job and at least one concurrency level to check", () => {
    // Guards the predicates: an empty list would pass every `each` below.
    expect(deployJobs).toHaveLength(1);
    expect(deployJobs[0].if).toBe("github.event_name != 'pull_request'");
    expect(storybook.concurrency?.group).toBeTruthy();
    expect(deployLevels.length).toBeGreaterThan(0);
  });

  describe.each(deployLevels)("%s level", (_level, concurrency) => {
    const group = (github) => evaluate(concurrency.group, github);
    const cancels = (github) => evaluate(concurrency["cancel-in-progress"] ?? false, github);

    it.each(deployingRuns)("a PR run never shares a group with %s", (_name, run) => {
      expect(group(pr(1))).not.toBe(group(run));
    });

    it("two different PRs never share a group", () => {
      expect(group(pr(1))).not.toBe(group(pr(2)));
    });

    it.each(deployingRuns)("%s is never cancelled while in progress", (_name, run) => {
      expect(cancels(run)).toBe("false");
    });
  });

  it("every run that deploys shares the one `pages` group, so deploys serialize", () => {
    const groups = deployingRuns.map(([, run]) => evaluate(storybook.concurrency.group, run));
    expect(new Set(groups)).toEqual(new Set(["pages"]));
    expect(evaluate(storybook.concurrency.group, mainPush(1))).toBe(
      evaluate(storybook.concurrency.group, mainPush(2))
    );
  });

  it("a PR's newer push still cancels that PR's superseded build", () => {
    const { group, "cancel-in-progress": cancel } = storybook.concurrency;
    expect(evaluate(group, pr(1))).toBe(evaluate(group, { ...pr(1), run_id: 9999 }));
    expect(evaluate(cancel, pr(1))).toBe("true");
  });

  it("no job overrides the deploy serialization with a group of its own that cancels", () => {
    for (const job of Object.values(storybook.jobs)) {
      if (!job.concurrency) continue;
      for (const [, run] of deployingRuns) {
        expect(evaluate(job.concurrency["cancel-in-progress"] ?? false, run)).toBe("false");
      }
    }
  });
});
