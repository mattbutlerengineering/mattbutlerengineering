/**
 * #8882: /local-ci-precheck is mandated before every push but listed only
 * `pnpm lint` for CI's lint job and never ran knip (`pnpm check:knip`), so a
 * knip failure cost a full CI round. Pin the mirror: every `pnpm` command in
 * the `run:` steps of the static-checks job (lint, knip, typecheck, architecture audit) must
 * appear in the skill, and those jobs must still gate merges.
 *
 * The skill spells CI's commands verbatim (no normalisation), so a CI command
 * change fails here until the skill is updated too.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getJob, jobRunText, loadWorkflow } from "../lib/workflow.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SKILL = readFileSync(
  join(REPO_ROOT, ".claude", "skills", "local-ci-precheck", "SKILL.md"),
  "utf8"
);
const MIRRORED_JOBS = ["static-checks"];
const CI = loadWorkflow("ci.yml");

function pnpmCommands(jobId) {
  return jobRunText(getJob(CI, jobId))
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("pnpm "));
}

describe("local-ci-precheck mirrors CI's blocking jobs (#8882)", () => {
  it.each(MIRRORED_JOBS)("%s job still gates ci-gate", (jobId) => {
    expect(CI.jobs["ci-gate"].needs).toContain(jobId);
  });

  it.each(MIRRORED_JOBS)("%s job has pnpm commands to mirror", (jobId) => {
    expect(pnpmCommands(jobId).length).toBeGreaterThan(0);
  });

  it.each(MIRRORED_JOBS.flatMap((jobId) => pnpmCommands(jobId).map((cmd) => [jobId, cmd])))(
    "%s: SKILL.md contains `%s`",
    (_jobId, cmd) => {
      expect(SKILL).toContain(cmd);
    }
  );

  it("runs knip as its own lane and honours --skip-knip", () => {
    expect(SKILL).toMatch(/knip_pid=\$!/);
    expect(SKILL).toMatch(/wait \$knip_pid \|\| fail=1/);
    expect(SKILL).toContain('*" --skip-knip "*');
  });
});
