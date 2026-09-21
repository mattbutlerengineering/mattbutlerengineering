/**
 * Regression test for #5623: a CI job that consumes repository secrets cannot
 * run on a Dependabot PR, because Dependabot PRs get the Dependabot secret
 * scope — which is empty in this repo — rather than the Actions scope.
 *
 * Measured 2026-09-21:
 *   gh api repos/.../dependabot/secrets --jq .total_count   -> 0
 *   gh api repos/.../actions/secrets                        -> CLOUDFLARE_*, E2E_AUTH0_*, ...
 *
 * So `preview-deploy.yml` reached wrangler with an empty CLOUDFLARE_API_TOKEN
 * and died on every Dependabot PR ("In a non-interactive environment, it's
 * necessary to set a CLOUDFLARE_API_TOKEN"), and the two E2E workflows failed
 * the same way on E2E_AUTH0_*. That is 4-5 permanently red checks on every
 * dependency PR, for reasons unrelated to the dependency — which trains
 * readers to treat red on a Dependabot PR as normal. #5599 is the cost: a
 * real `Test (Node 22)` failure sat in the same list as four structural ones.
 *
 * These jobs are skipped on Dependabot rather than left to fail. The guard
 * must NOT be "fixed" by putting the secrets into the Dependabot scope — see
 * the comment on each job.
 *
 * Parsed textually, matching ci-docs-format-gate.test.mjs and the other
 * workflow tests in this directory: nothing in scripts/ depends on a YAML
 * parser.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const read = (workflow) => readFileSync(resolve(ROOT, ".github/workflows", workflow), "utf8");

/** The lines of one top-level job block, excluding its own header. */
function jobBlock(source, jobName) {
  const lines = source.split("\n");
  const start = lines.findIndex((l) => new RegExp(`^ {2}${jobName}:\\s*$`).test(l));
  if (start === -1) throw new Error(`no top-level \`${jobName}:\` job`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^ {2}\S/.test(l));
  return (end === -1 ? rest : rest.slice(0, end)).join("\n");
}

/** Jobs that consume Actions-scope secrets and so cannot run on a Dependabot PR. */
const GUARDED = [
  ["preview-deploy.yml", "deploy-preview"],
  ["e2e.yml", "hospitality-e2e"],
  ["e2e.yml", "marketing-e2e"],
  ["e2e-screenshots.yml", "screenshots"],
];

describe("jobs needing repository secrets skip Dependabot PRs", () => {
  for (const [workflow, job] of GUARDED) {
    it(`${workflow} :: ${job} is guarded`, () => {
      const block = jobBlock(read(workflow), job);
      expect(block).toMatch(/if:.*github\.actor != 'dependabot\[bot\]'/);
    });

    it(`${workflow} :: ${job} records why, so the guard is not "fixed" by adding secrets`, () => {
      // A bare condition reads like an oversight and invites someone to delete
      // it, or to copy the credentials into the Dependabot scope — which is the
      // supply-chain-exposing repair this guard exists to avoid.
      expect(jobBlock(read(workflow), job)).toContain("Dependabot secret scope");
    });
  }

  it("guards the job, not a step — a job that runs and does nothing reports a false pass", () => {
    // The rialto-web leg of deploy-preview already demonstrates the hazard: it
    // reported SUCCESS on #5599 purely because its paths filter was false and
    // the step exited 0 early, so "one passed, two failed" read like a real
    // regression in the other two apps. Nothing was deployed in any of them.
    for (const [workflow, job] of GUARDED) {
      const block = jobBlock(read(workflow), job);
      const guardLine = block
        .split("\n")
        .find((l) => l.includes("dependabot[bot]") && !l.trim().startsWith("#"));
      expect(guardLine, `${workflow}::${job} guard line`).toBeDefined();
      // Job-level `if:` sits at 4 spaces; a step-level one is indented deeper.
      expect(guardLine).toMatch(/^ {4}if:/);
    }
  });
});
