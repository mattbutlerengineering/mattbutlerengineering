/**
 * Telemetry writers persist to the orphan metrics-data branch by direct push
 * (scripts/metrics-data.mjs), not through an auto-merged PR on main. Each PR
 * used to run paid CI, and the fixed automation branch it reset on every run
 * dropped any row whose PR had not merged yet (production health lost whole
 * days). These tests keep a writer from drifting back to the PR path.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadWorkflow } from "../lib/workflow.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const workflowPath = (name) => resolve(ROOT, `.github/workflows/${name}.yml`);

/** Writers whose only output is telemetry: no PR at all. */
const DATA_ONLY_WRITERS = [
  "production-feedback",
  "metrics-collectors",
  "record-summary-rows",
  "routine-liveness",
  "stale-human-blocked",
  "acmm-cold-start",
  "pr-metrics",
];
/** Also commits a main-located file through a PR (none today). */
const MIXED_WRITERS = [];
/** Read telemetry without writing it. */
const READERS = ["acmm-regression", "nightly-compliance", "auto-qa-tune"];

const stepsOf = (name) =>
  Object.values(loadWorkflow(workflowPath(name)).jobs).flatMap((j) => j.steps);
const indexOfRun = (steps, re) => steps.findIndex((s) => re.test(s.run ?? ""));
const PULL = /node scripts\/metrics-data\.mjs pull/;
const PUSH = /node scripts\/metrics-data\.mjs push -m "chore\(metrics\): [^"]+"/;

describe.each([...DATA_ONLY_WRITERS, ...MIXED_WRITERS])("%s writes to metrics-data", (name) => {
  const steps = stepsOf(name);

  it("checks out metrics-data before it pushes", () => {
    const pullAt = indexOfRun(steps, PULL);
    const pushAt = indexOfRun(steps, PUSH);
    expect(pullAt).toBeGreaterThan(-1);
    expect(pushAt).toBeGreaterThan(pullAt);
  });

  it("commits as the Actions bot, which a bare runner has no identity for", () => {
    const push = steps[indexOfRun(steps, PUSH)];
    expect(push.env.GIT_AUTHOR_NAME).toBe("github-actions[bot]");
    expect(push.env.GIT_COMMITTER_EMAIL).toMatch(/github-actions\[bot\]@users\.noreply/);
  });

  it("can push: contents is write", () => {
    expect(loadWorkflow(workflowPath(name)).permissions.contents).toBe("write");
  });

  it("no longer commits telemetry under metrics/ on main", () => {
    expect(readFileSync(workflowPath(name), "utf8")).not.toMatch(/^\s+metrics\/[\w./*-]+$/m);
  });
});

describe.each(DATA_ONLY_WRITERS)("%s opens no PR", (name) => {
  it("has no create-pull-request, CI dispatch or auto-merge step", () => {
    const text = readFileSync(workflowPath(name), "utf8");
    expect(text).not.toMatch(/peter-evans\/create-pull-request/);
    expect(text).not.toMatch(/gh pr create/);
    expect(text).not.toMatch(/gh workflow run ci\.yml/);
    expect(text).not.toMatch(/gh pr merge/);
  });
});

describe.each(READERS)("%s reads telemetry from metrics-data", (name) => {
  it("checks out metrics-data", () => {
    expect(indexOfRun(stepsOf(name), PULL)).toBeGreaterThan(-1);
  });
});
