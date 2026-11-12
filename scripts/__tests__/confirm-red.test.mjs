import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { decideRedConfirmation, MAX_CONFIRMATION_RERUNS } from "../confirm-red.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const WORKFLOW = readFileSync(resolve(ROOT, ".github/workflows/revert-watchdog.yml"), "utf8");

describe("decideRedConfirmation", () => {
  it("reruns the failed jobs when the red run is a first attempt", () => {
    expect(decideRedConfirmation({ runAttempt: 1 }).action).toBe("rerun");
  });

  it("proceeds once the run has failed again on the rerun", () => {
    expect(decideRedConfirmation({ runAttempt: 2 }).action).toBe("proceed");
    expect(decideRedConfirmation({ runAttempt: 3 }).action).toBe("proceed");
  });

  it("accepts the attempt as the string GitHub Actions passes", () => {
    expect(decideRedConfirmation({ runAttempt: "1" }).action).toBe("rerun");
    expect(decideRedConfirmation({ runAttempt: "2" }).action).toBe("proceed");
  });

  it("proceeds when the attempt is unknown, so a real break is never silenced", () => {
    for (const runAttempt of [undefined, null, "", "abc", 0, -1, 1.5]) {
      expect(decideRedConfirmation({ runAttempt }).action).toBe("proceed");
    }
  });

  it("gives a reason for every decision", () => {
    expect(decideRedConfirmation({ runAttempt: 1 }).reason).toMatch(/attempt 1/);
    expect(decideRedConfirmation({ runAttempt: 2 }).reason).toMatch(/attempt 2/);
  });

  it("confirms with exactly one rerun", () => {
    expect(MAX_CONFIRMATION_RERUNS).toBe(1);
  });
});

describe("revert-watchdog.yml confirms a red run before blaming a commit", () => {
  /** The text of one top-level job, from its `  <name>:` line to the next job. */
  const jobText = (name) => {
    const start = WORKFLOW.indexOf(`\n  ${name}:\n`);
    if (start === -1) return "";
    const rest = WORKFLOW.slice(start + 1);
    const next = rest.slice(1).search(/\n {2}[a-z][a-z-]*:\n/);
    return next === -1 ? rest : rest.slice(0, next + 1);
  };
  const confirm = jobText("confirm-red");
  const onFailure = jobText("on-failure");

  it("has a confirm-red job that runs only for a failed CI run", () => {
    expect(confirm).toContain("github.event.workflow_run.conclusion == 'failure'");
    expect(confirm).toMatch(/outputs:\n\s+confirmed:/);
  });

  it("feeds the run attempt to confirm-red.mjs and reruns only the failed jobs", () => {
    expect(confirm).toContain("${{ github.event.workflow_run.run_attempt }}");
    expect(confirm).toContain("node scripts/confirm-red.mjs");
    expect(confirm).toContain('gh run rerun "$RUN_ID" --failed');
  });

  it("gates the issue-and-revert job on the confirmation", () => {
    expect(onFailure).toMatch(/needs: confirm-red\n/);
    expect(onFailure).toContain("needs.confirm-red.outputs.confirmed == 'true'");
  });
});
