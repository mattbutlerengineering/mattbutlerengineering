import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyCiRun,
  shouldRerun,
  rerunTarget,
  CI_RUN_STATES,
} from "../deploy-ci-precondition.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const SCRIPT = resolve(ROOT, "scripts/deploy-ci-precondition.mjs");
const DEPLOY_WORKFLOW = readFileSync(
  resolve(ROOT, ".github/workflows/deploy-services.yml"),
  "utf8"
);

/**
 * The workflow with whole-line `#` comments removed.
 *
 * Wiring assertions must read this, never the raw file. The comment above
 * the recovery step names this module by path, so an `indexOf` over the raw
 * text stays green after the actual `node scripts/...` invocation is deleted
 * — the assertion would then be pinning prose, which is the exact shape of
 * "looks guarded, is not" that the recovery step itself exists to prevent.
 */
const DEPLOY_WORKFLOW_CODE = DEPLOY_WORKFLOW.split("\n")
  .filter((line) => !/^\s*#/.test(line))
  .join("\n");

const run = (status, conclusion, databaseId = 1) => ({ status, conclusion, databaseId });
const done = (conclusion, id) => run("completed", conclusion, id);

describe("classifyCiRun", () => {
  it("reports absent when the ref has no CI run", () => {
    expect(classifyCiRun([])).toBe("absent");
  });

  it("reports cancelled for the pending-run cancellation this module exists for", () => {
    expect(classifyCiRun([done("cancelled", 32674454760)])).toBe("cancelled");
  });

  it("reports running while CI is queued or in progress", () => {
    expect(classifyCiRun([run("queued", null)])).toBe("running");
    expect(classifyCiRun([run("in_progress", null)])).toBe("running");
    expect(classifyCiRun([run("waiting", null)])).toBe("running");
  });

  it("reports success and failed for concluded runs", () => {
    expect(classifyCiRun([done("success")])).toBe("success");
    expect(classifyCiRun([done("failure")])).toBe("failed");
    expect(classifyCiRun([done("timed_out")])).toBe("failed");
  });

  it("prefers a later success over an earlier cancellation, so a rerun is never repeated", () => {
    expect(classifyCiRun([done("success", 2), done("cancelled", 1)])).toBe("success");
    expect(classifyCiRun([done("cancelled", 1), done("success", 2)])).toBe("success");
  });

  it("does not let a cancellation mask a run still in flight", () => {
    expect(classifyCiRun([run("in_progress", null, 2), done("cancelled", 1)])).toBe("running");
  });

  it("does not let a cancellation mask a genuine failure", () => {
    expect(classifyCiRun([done("cancelled", 2), done("failure", 1)])).toBe("failed");
  });

  it("treats a malformed or missing run list as absent rather than throwing", () => {
    expect(classifyCiRun(undefined)).toBe("absent");
    expect(classifyCiRun(null)).toBe("absent");
    expect(classifyCiRun([{}])).toBe("absent");
  });

  it("only ever returns a declared state", () => {
    const inputs = [[], [done("success")], [done("cancelled")], [done("failure")], [run("queued")]];
    for (const input of inputs) expect(CI_RUN_STATES).toContain(classifyCiRun(input));
  });
});

describe("shouldRerun", () => {
  it("recovers a cancelled run", () => {
    expect(shouldRerun("cancelled")).toBe(true);
  });

  it("leaves every other state alone", () => {
    // `absent` in particular: a deploy starts on the same push as CI, so
    // "no run yet" is the normal opening state and re-dispatching into it
    // would race the real run.
    for (const state of ["absent", "running", "success", "failed"]) {
      expect(shouldRerun(state)).toBe(false);
    }
  });
});

describe("rerunTarget", () => {
  it("names the cancelled run", () => {
    expect(rerunTarget([done("cancelled", 42)])).toBe(42);
  });

  it("picks the most recent cancellation when there are several", () => {
    expect(rerunTarget([done("cancelled", 99), done("cancelled", 7)])).toBe(99);
  });

  it("returns null when nothing was cancelled", () => {
    expect(rerunTarget([done("success", 1)])).toBeNull();
    expect(rerunTarget([])).toBeNull();
    expect(rerunTarget(undefined)).toBeNull();
  });
});

describe("CLI", () => {
  const cli = (runs) =>
    JSON.parse(execFileSync("node", [SCRIPT, JSON.stringify(runs)], { encoding: "utf8" }));

  it("emits the verdict the workflow step consumes", () => {
    expect(cli([done("cancelled", 32674454760)])).toEqual({
      state: "cancelled",
      rerun: true,
      runId: 32674454760,
    });
  });

  it("emits rerun:false for a healthy ref", () => {
    expect(cli([done("success", 5)])).toEqual({ state: "success", rerun: false, runId: null });
  });
});

describe("deploy-services workflow wiring", () => {
  it("runs the precondition before the wait, not after", () => {
    const recover = DEPLOY_WORKFLOW_CODE.indexOf("node scripts/deploy-ci-precondition.mjs");
    const wait = DEPLOY_WORKFLOW_CODE.indexOf("lewagon/wait-on-check-action");
    expect(recover).toBeGreaterThan(-1);
    expect(wait).toBeGreaterThan(-1);
    expect(recover).toBeLessThan(wait);
  });

  it("grants the actions:write that `gh run rerun` needs", () => {
    // The workflow's top-level permissions block is read-only; without a
    // job-level grant the rerun 403s and the recovery silently no-ops.
    expect(DEPLOY_WORKFLOW_CODE).toContain("actions: write");
  });

  it("sets pipefail, so a failing gh call cannot be masked by the pipe", () => {
    // GitHub's default shell is `bash -e {0}` — no pipefail. The verdict is
    // consumed through `echo … | jq`, so without this an empty verdict would
    // read as rerun:false and the recovery would quietly never fire.
    expect(DEPLOY_WORKFLOW_CODE).toContain("set -euo pipefail");
  });

  it("cannot itself block a deploy", () => {
    // The recovery is best-effort. Without continue-on-error, `set -e` plus
    // a transient gh failure would block a deploy that would otherwise have
    // proceeded — trading a rare stall for a new common one.
    expect(DEPLOY_WORKFLOW_CODE).toContain("continue-on-error: true");
  });

  it("checks out the repo, since the step executes a file from it", () => {
    expect(DEPLOY_WORKFLOW_CODE).toMatch(/uses: actions\/checkout@[0-9a-f]{40}/);
  });
});
