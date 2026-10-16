/**
 * Pins the `.github/workflows/dependabot-auto-merge.yml` rewire
 * (#6650, architecture.md § 3): the workflow now branches on
 * `scripts/dependabot-auto-merge-policy.mjs`'s printed decision instead of
 * inlining the merge rule in step `if:` conditions.
 *
 * `pull_request_target` runs with write permissions against the base repo's
 * workflow file, so two properties are asserted directly against the raw
 * text (not just "it still works"): no `ref:` ever points checkout at the
 * PR head, and fetch-metadata's outputs reach the policy script only via
 * `env:` — never interpolated inline into the `run:` shell text, which is
 * the command-injection hygiene architecture.md calls out for this trigger.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getJob, getStep, loadWorkflow } from "../lib/workflow.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const WORKFLOW_PATH = resolve(ROOT, ".github/workflows/dependabot-auto-merge.yml");
const WORKFLOW_TEXT = readFileSync(WORKFLOW_PATH, "utf8");

function job() {
  return getJob(loadWorkflow(WORKFLOW_PATH), "auto-merge");
}

describe("dependabot-auto-merge.yml (#6650 rewire)", () => {
  it("still triggers on pull_request_target with the dependabot actor gate", () => {
    const workflow = loadWorkflow(WORKFLOW_PATH);
    expect(Object.keys(workflow.on)).toEqual(["pull_request_target"]);
    expect(job().if).toMatch(/github\.actor == 'dependabot\[bot\]'/);
  });

  it("checks out the base ref — no `ref:` input on checkout, ever", () => {
    const checkout = job().steps.find((s) => (s.uses ?? "").startsWith("actions/checkout@"));
    expect(checkout, "an actions/checkout step").toBeTruthy();
    expect(checkout.with.ref).toBeUndefined();
  });

  it("keeps the fetch-metadata pin and step id", () => {
    const metadata = job().steps.find((s) =>
      (s.uses ?? "").startsWith("dependabot/fetch-metadata@")
    );
    expect(metadata, "a dependabot/fetch-metadata step").toBeTruthy();
    expect(metadata.id).toBe("metadata");
  });

  it("decide step reads fetch-metadata outputs via env, not inline ${{ }} in run text", () => {
    const decide = getStep(job(), /^Decide$/);
    expect(decide, "a step named Decide").toBeTruthy();
    expect(Object.keys(decide.env).length).toBeGreaterThan(0);
    for (const value of Object.values(decide.env)) {
      expect(String(value)).toMatch(/steps\.metadata\.outputs\./);
    }
    // The run text invokes the policy CLI using shell variables sourced from
    // env — never a raw `${{ steps.metadata.outputs... }}` substitution,
    // which would land dependabot-controlled text directly in the script.
    expect(decide.run).toMatch(/node scripts\/dependabot-auto-merge-policy\.mjs decide/);
    expect(decide.run).not.toMatch(/\$\{\{\s*steps\.metadata/);
  });

  it("decide step sets pipefail before piping the CLI's JSON through jq", () => {
    const decide = getStep(job(), /^Decide$/);
    expect(decide.run).toMatch(/^\s*set -o pipefail/m);
    expect(decide.run).toMatch(/jq -r '\.action'/);
    expect(decide.run).toMatch(/jq -r '\.reason'/);
    expect(decide.run).toMatch(/action=\$ACTION" >> "\$GITHUB_OUTPUT"/);
    expect(decide.run).toMatch(/reason=\$REASON" >> "\$GITHUB_OUTPUT"/);
  });

  it("merge and comment steps branch on the decide step's printed action", () => {
    const steps = job().steps;
    const merge = steps.find((s) => (s.run ?? "").includes("gh pr merge --auto --squash"));
    const comment = steps.find((s) => (s.run ?? "").includes("gh pr comment"));
    expect(merge, "the merge step").toBeTruthy();
    expect(comment, "the comment step").toBeTruthy();
    expect(merge.if).toBe("steps.decide.outputs.action == 'merge'");
    expect(comment.if).toBe("steps.decide.outputs.action == 'manual'");
  });

  it("comment step posts the policy's reason, not a fixed sentence", () => {
    const comment = job().steps.find((s) => (s.run ?? "").includes("gh pr comment"));
    expect(
      Object.values(comment.env).some((v) => String(v).includes("steps.decide.outputs.reason"))
    ).toBe(true);
    expect(WORKFLOW_TEXT).not.toContain("This is a production dependency update");
  });
});
