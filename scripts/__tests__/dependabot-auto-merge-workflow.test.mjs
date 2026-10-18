/**
 * Pins the security invariants and policy wiring of dependabot-auto-merge.yml
 * (#6650) by reading the real workflow. The workflow runs on
 * `pull_request_target` with a write token, so the guards matter more than the
 * features: Dependabot-only actor, no PR-head checkout, no `${{ }}`
 * interpolation of PR-derived values into a script body.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { load as loadYaml } from "js-yaml";
import { getJob, getStep, loadWorkflow } from "../lib/workflow.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const WORKFLOW = "dependabot-auto-merge.yml";
const job = () => getJob(loadWorkflow(WORKFLOW), "auto-merge");
const disarmJob = () => getJob(loadWorkflow(WORKFLOW), "disarm-foreign-push");
const allJobs = () => [job(), disarmJob()];

describe("dependabot-auto-merge.yml", () => {
  it("keeps pull_request_target and the dependabot actor gate", () => {
    const wf = loadWorkflow(WORKFLOW);
    expect(Object.keys(wf.on)).toEqual(["pull_request_target"]);
  });

  it("re-evaluates on every push to the PR, not only when it opens (M1)", () => {
    const wf = loadWorkflow(WORKFLOW);
    expect(wf.on.pull_request_target.types).toEqual(["opened", "synchronize", "reopened"]);
  });

  it("arming job requires both the dependabot actor and a dependabot-opened PR (m4)", () => {
    expect(job().if).toBe(
      "github.actor == 'dependabot[bot]' && github.event.pull_request.user.login == 'dependabot[bot]'"
    );
  });

  it("disarm job runs for any other actor pushing to a Dependabot PR (M1)", () => {
    expect(disarmJob().if).toBe(
      "github.event.pull_request.user.login == 'dependabot[bot]' && github.actor != 'dependabot[bot]'"
    );
  });

  it("serialises runs per PR so an arm cannot land after a later disarm", () => {
    // scripts/lib/workflow.mjs does not surface `concurrency`; read it raw.
    const wf = loadYaml(readFileSync(resolve(ROOT, ".github/workflows", WORKFLOW), "utf8"));
    expect(wf.concurrency.group).toBe(
      "dependabot-auto-merge-${{ github.event.pull_request.number }}"
    );
    expect(wf.concurrency["cancel-in-progress"]).toBe(false);
  });

  it("never checks out PR head code (no ref/repository on checkout)", () => {
    for (const j of allJobs()) {
      const checkouts = j.steps.filter((s) => (s.uses ?? "").startsWith("actions/checkout@"));
      expect(checkouts).toHaveLength(1);
      expect(checkouts[0].with ?? {}).not.toHaveProperty("ref");
      expect(checkouts[0].with ?? {}).not.toHaveProperty("repository");
      expect(checkouts[0].with?.["persist-credentials"]).toBe(false);
    }
  });

  it("both jobs read live PR commits + auto-merge state and decide via arm-state", () => {
    for (const j of allJobs()) {
      const read = getStep(j, "Read PR state");
      expect(read.run).toContain("set -o pipefail");
      expect(read.run).toMatch(
        /gh api --paginate --slurp "repos\/\$REPO\/pulls\/\$PR_NUMBER\/commits"/
      );
      expect(read.run).toContain(".auto_merge != null");
      const decide = getStep(j, "Decide arm state");
      expect(decide.run).toContain("set -o pipefail");
      expect(decide.run).toContain("scripts/dependabot-auto-merge-policy.mjs arm-state");
    }
    expect(getStep(job(), "Decide arm state").env.DECISION).toBe(
      "${{ steps.decide.outputs.action }}"
    );
    expect(getStep(disarmJob(), "Decide arm state").run).toContain("--decision none");
  });

  it("disarms with --disable-auto only when the arm-state says disarm, in both jobs", () => {
    for (const j of allJobs()) {
      const step = getStep(j, "Disable auto-merge");
      expect(step.if).toBe("steps.arm.outputs.state == 'disarm'");
      expect(step.run).toContain("gh pr merge --disable-auto");
    }
  });

  it("the disarm job can never arm", () => {
    for (const step of disarmJob().steps.filter((s) => s.run)) {
      expect(step.run).not.toContain("--auto --squash");
    }
  });

  it("decides via the policy CLI with pipefail, metadata passed through env", () => {
    const step = getStep(job(), "Decide");
    expect(step.run).toContain("set -o pipefail");
    expect(step.run).toContain("scripts/dependabot-auto-merge-policy.mjs decide");
    expect(step.run).not.toContain("${{");
    expect(Object.keys(step.env).sort()).toEqual([
      "DEPENDENCY_NAMES",
      "ECOSYSTEM",
      "GROUP",
      "UPDATE_TYPE",
    ]);
  });

  it("arms only on an arm state and comments the policy reason otherwise", () => {
    const mergeStep = getStep(job(), "Auto-merge");
    expect(mergeStep.if).toBe("steps.arm.outputs.state == 'arm'");
    expect(mergeStep.run).toContain("gh pr merge --auto --squash");

    const commentStep = getStep(job(), /manual review/);
    expect(commentStep.if).toBe("steps.decide.outputs.action == 'manual'");
    expect(commentStep.env.REASON).toBe("${{ steps.decide.outputs.reason }}");
    expect(commentStep.run).not.toContain("${{");
    expect(commentStep.run).not.toMatch(/production dependency/);
  });

  it("no run: block interpolates expressions directly", () => {
    for (const j of allJobs()) {
      for (const step of j.steps.filter((s) => s.run)) {
        expect(step.run).not.toContain("${{");
      }
    }
  });
});

describe("dependabot.yml grouping (#6650)", () => {
  const text = readFileSync(resolve(ROOT, ".github/dependabot.yml"), "utf8");

  it("declares official-actions for actions/* and github/*", () => {
    expect(text).toMatch(/official-actions:\s*\n\s*patterns: \["actions\/\*", "github\/\*"\]/);
  });

  it("declares a types group with no dependency-type restriction", () => {
    expect(text).toMatch(/\n {6}types:\n {8}patterns: \["@types\/\*"\]\n(?! {8}dependency-type)/);
  });

  it("playwright and @playwright/* bump together in dev-deps, not production-deps", () => {
    const devDeps = text.match(/dev-deps:\n(?: {8}.*\n)+/)[0];
    expect(devDeps).toContain('"playwright*"');
    expect(devDeps).toContain('"@playwright/*"');
    const exclude = text.match(/exclude-patterns:\n([\s\S]*?\])/)[1];
    expect(exclude).toContain('"@playwright/*"');
  });

  it("dev-deps no longer lists @types/*", () => {
    const devDeps = text.match(/dev-deps:\n(?: {8}.*\n)+/)[0];
    expect(devDeps).not.toContain("@types/*");
  });
});
