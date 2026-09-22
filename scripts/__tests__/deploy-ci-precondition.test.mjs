import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyCiRun,
  shouldRerun,
  rerunTarget,
  shouldFailFast,
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

describe("shouldFailFast", () => {
  it("fails fast on a manually dispatched recovery run whose commit has no CI run at all — #5663", () => {
    // A `workflow_dispatch` (the documented deploys-unhealthy.md recovery
    // path) typically fires well after the triggering push, most often on a
    // docs-only/metrics-only commit that ci.yml's paths-ignore skipped
    // entirely. No run for that SHA will ever appear — the 30-minute
    // discovery wait would burn its whole timeout for nothing.
    expect(shouldFailFast("absent", "workflow_dispatch")).toBe(true);
  });

  it("does NOT fail fast on a push-triggered run — absent there is the normal first-few-seconds state", () => {
    // A `push`-triggered deploy fires from the same push that starts CI, so
    // this is the case the module header already covers: the wait step's
    // own 30-minute discovery timeout is the correct behaviour here, not a
    // bug to route around.
    expect(shouldFailFast("absent", "push")).toBe(false);
  });

  it("does not fail fast on any other trigger event, even when the state is absent", () => {
    for (const triggerEvent of ["schedule", "workflow_run", "", undefined, null]) {
      expect(shouldFailFast("absent", triggerEvent)).toBe(false);
    }
  });

  it("never fails fast on a state other than absent, no matter the trigger — narrowing the wait must never widen what deploys", () => {
    for (const state of ["running", "success", "failed", "cancelled"]) {
      expect(shouldFailFast(state, "workflow_dispatch")).toBe(false);
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
  const cli = (runs, triggerEvent) =>
    JSON.parse(
      execFileSync(
        "node",
        triggerEvent === undefined
          ? [SCRIPT, JSON.stringify(runs)]
          : [SCRIPT, JSON.stringify(runs), triggerEvent],
        { encoding: "utf8" }
      )
    );

  it("emits the verdict the workflow step consumes", () => {
    expect(cli([done("cancelled", 32674454760)])).toEqual({
      state: "cancelled",
      rerun: true,
      runId: 32674454760,
      failFast: false,
    });
  });

  it("emits rerun:false for a healthy ref", () => {
    expect(cli([done("success", 5)])).toEqual({
      state: "success",
      rerun: false,
      runId: null,
      failFast: false,
    });
  });

  it("emits failFast:true only for a manually dispatched run with no CI history — #5663", () => {
    expect(cli([], "workflow_dispatch")).toEqual({
      state: "absent",
      rerun: false,
      runId: null,
      failFast: true,
    });
  });

  it("defaults failFast:false when no trigger event is passed, so an old caller keeps today's behaviour", () => {
    expect(cli([])).toEqual({ state: "absent", rerun: false, runId: null, failFast: false });
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

  it("passes github.event_name to the precondition script, so it can tell a dispatch from a push", () => {
    const scriptCall = DEPLOY_WORKFLOW_CODE.match(
      /node scripts\/deploy-ci-precondition\.mjs[^\n]*/
    )?.[0];
    expect(scriptCall).toMatch(/GITHUB_EVENT_NAME/);
  });

  it("fails the job — not just the step — before the 30-minute wait when the precondition says failFast", () => {
    // This is the #5663 fix: a dispatch on a commit with zero ci.yml runs
    // must stop `ci-gate` (and therefore `deploy`, which needs: [ci-gate])
    // within about a minute, instead of falling through to
    // `lewagon/wait-on-check-action`'s 1800s discovery timeout.
    const failFastStep = DEPLOY_WORKFLOW_CODE.match(/Fail fast[\s\S]*?run: \|[\s\S]*?exit 1/)?.[0];
    expect(failFastStep).toBeTruthy();
    expect(failFastStep).toMatch(/\.failFast/);

    const failFastIdx = DEPLOY_WORKFLOW_CODE.indexOf("Fail fast");
    const waitIdx = DEPLOY_WORKFLOW_CODE.indexOf("lewagon/wait-on-check-action");
    expect(failFastIdx).toBeGreaterThan(-1);
    expect(failFastIdx).toBeLessThan(waitIdx);
  });

  it("is NOT continue-on-error — this is the one outcome that must actually stop the job", () => {
    const failFastBlock = DEPLOY_WORKFLOW_CODE.slice(
      DEPLOY_WORKFLOW_CODE.indexOf("Fail fast"),
      DEPLOY_WORKFLOW_CODE.indexOf("lewagon/wait-on-check-action")
    );
    expect(failFastBlock).not.toContain("continue-on-error");
  });

  it("names the SHA and the real reason in the fail-fast message, instead of a generic timeout", () => {
    const failFastBlock = DEPLOY_WORKFLOW_CODE.slice(
      DEPLOY_WORKFLOW_CODE.indexOf("Fail fast"),
      DEPLOY_WORKFLOW_CODE.indexOf("lewagon/wait-on-check-action")
    );
    expect(failFastBlock).toMatch(/No CI run exists for.*GITHUB_SHA/);
  });

  it("documents that a fail-fast here does not re-trip the circuit breaker (#5662 narrowed it to the deploy job's own conclusion)", () => {
    // A timed-out `Wait for CI` used to count as a deploy failure, which
    // made the documented recovery path self-amplifying — attempting it
    // twice was enough to trip the breaker on its own. #5662 fixed that by
    // reading `Deploy API Services`' own conclusion (skipped here, not
    // failure) instead of the run's. This test pins that the fact is
    // recorded where a future editor of either file will see it.
    expect(readFileSync(SCRIPT, "utf8")).toMatch(/circuit breaker/i);
  });
});
