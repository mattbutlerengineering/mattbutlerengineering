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
 * Job-level `if:` is asserted on the parsed workflow (scripts/lib/workflow.mjs,
 * #6393). The "records why" check is about a YAML comment, which a parser
 * drops, so it stays a raw-text check on the file.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getJob, loadWorkflow } from "../lib/workflow.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const read = (workflow) => readFileSync(resolve(ROOT, ".github/workflows", workflow), "utf8");

function jobOf(workflow, jobName) {
  const job = getJob(loadWorkflow(workflow), jobName);
  if (!job) throw new Error(`${workflow} has no top-level \`${jobName}:\` job`);
  return job;
}

/** How far above a job's `if:` line the explanatory comment may sit. */
const COMMENT_WINDOW_LINES = 15;

/** Jobs that consume Actions-scope secrets and so cannot run on a Dependabot PR. */
const GUARDED = [
  ["preview-deploy.yml", "deploy-preview"],
  ["e2e.yml", "hospitality-e2e"],
  ["e2e.yml", "marketing-e2e"],
  ["e2e-screenshots.yml", "screenshots"],
];

describe("jobs needing repository secrets skip Dependabot PRs", () => {
  for (const [workflow, job] of GUARDED) {
    it(`${workflow} :: ${job} is guarded at the job level`, () => {
      // Job-level `if:` (not a step's): a job that runs and does nothing
      // reports a false pass. The rialto-web leg of deploy-preview already
      // demonstrates the hazard: it reported SUCCESS on #5599 purely because
      // its paths filter was false and the step exited 0 early, so "one
      // passed, two failed" read like a real regression in the other two
      // apps. Nothing was deployed in any of them.
      expect(jobOf(workflow, job).if).toMatch(/github\.actor != 'dependabot\[bot\]'/);
    });

    it(`${workflow} :: ${job} records why, so the guard is not "fixed" by adding secrets`, () => {
      // A bare condition reads like an oversight and invites someone to delete
      // it, or to copy the credentials into the Dependabot scope — which is the
      // supply-chain-exposing repair this guard exists to avoid.
      const lines = read(workflow).split("\n");
      const guardIdx = lines.findIndex(
        (l) => l.includes(jobOf(workflow, job).if) && /^\s*if:/.test(l)
      );
      expect(guardIdx, `${workflow}::${job} guard line`).toBeGreaterThan(-1);
      const above = lines.slice(Math.max(0, guardIdx - COMMENT_WINDOW_LINES), guardIdx);
      expect(above.join("\n")).toContain("Dependabot secret scope");
    });
  }
});
