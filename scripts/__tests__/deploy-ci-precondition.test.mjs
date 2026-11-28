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
  shouldFailFastAfterRerun,
  classifyRerun,
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
  it("fails fast on a manually dispatched recovery run whose commit has no CI run at all, once check-runs are verified empty too — #5663", () => {
    // A `workflow_dispatch` (the documented deploys-unhealthy.md recovery
    // path) typically fires well after the triggering push, most often on a
    // commit that reached `main` via a `GITHUB_TOKEN`-authored merge —
    // GitHub's anti-recursion rule never delivers that merge's `push` event
    // to any workflow, so no run for this SHA will ever appear. `hasCheckRuns:
    // false` is the positive, independently-verified confirmation of that
    // (see the next describe block below) — the 30-minute discovery wait
    // would otherwise burn its whole timeout for nothing.
    expect(shouldFailFast("absent", "workflow_dispatch", false)).toBe(true);
  });

  it("does NOT fail fast when the run-list query is empty but check-runs exist for the SHA — the run-list `--commit` filter lags", () => {
    // `gh run list --commit <sha>` is documented-unreliable: it has returned
    // `[]` for over an hour on real squash-merge commits while the checks
    // API already reported `Build: success` on the same SHA. Failing fast
    // here would refuse a deploy that `lewagon/wait-on-check-action` (which
    // reads checks, not `gh run list`) would have found and completed.
    expect(shouldFailFast("absent", "workflow_dispatch", true)).toBe(false);
  });

  it("does NOT fail fast when check-run existence could not be verified (the cross-check itself failed or was skipped)", () => {
    // Fail open on uncertainty, same as every other best-effort step in this
    // module: an unknown answer must never be treated as "verified empty".
    for (const hasCheckRuns of [undefined, null, ""]) {
      expect(shouldFailFast("absent", "workflow_dispatch", hasCheckRuns)).toBe(false);
    }
  });

  it("does NOT fail fast on a push-triggered run — absent there is the normal first-few-seconds state", () => {
    // A `push`-triggered deploy fires from the same push that starts CI, so
    // this is the case the module header already covers: the wait step's
    // own 30-minute discovery timeout is the correct behaviour here, not a
    // bug to route around.
    expect(shouldFailFast("absent", "push", false)).toBe(false);
  });

  it("does not fail fast on any other trigger event, even when the state is absent and check-runs are verified empty", () => {
    for (const triggerEvent of ["schedule", "workflow_run", "", undefined, null]) {
      expect(shouldFailFast("absent", triggerEvent, false)).toBe(false);
    }
  });

  it("never fails fast on a state other than absent, no matter the trigger or check-run evidence — narrowing the wait must never widen what deploys", () => {
    for (const state of ["running", "success", "failed", "cancelled"]) {
      expect(shouldFailFast(state, "workflow_dispatch", false)).toBe(false);
    }
  });
});

describe("shouldFailFastAfterRerun", () => {
  // Measured 2026-11-28 on three consecutive `Wait for CI` failures
  // (deploy runs 46108205257, 46106352375, 46098634745). Each one
  // classified its CI run `cancelled`, issued `gh run rerun`, and logged
  // "Re-ran the cancelled CI run; the wait step can now resolve." The
  // rerun then entered the SAME single-pending-slot `CI-refs/heads/main`
  // concurrency group and was cancelled again by the next merge in the
  // burst -- run 46108205241 attempt 2 started 04:54:04Z and was cancelled
  // 04:54:55Z having run zero jobs. All three then burned the full 1800s
  // `checks-discovery-timeout` waiting for a `Build` check that could
  // never appear, and failed at ~30.5 minutes each.
  it("fails fast when the rerun was itself cancelled, so Build can never appear", () => {
    expect(shouldFailFastAfterRerun("cancelled")).toBe(true);
  });

  it("does not fail fast while the rerun is queued or running", () => {
    // Under the runner-concurrency cap a legitimately recovering rerun can
    // sit `queued` for ~20 minutes (measured queue p90 across CI jobs), so
    // "not yet started" must keep today's waiting behaviour.
    expect(shouldFailFastAfterRerun("running")).toBe(false);
  });

  it("does not fail fast when the rerun already succeeded or failed on its own merits", () => {
    expect(shouldFailFastAfterRerun("success")).toBe(false);
    expect(shouldFailFastAfterRerun("failed")).toBe(false);
  });

  it("fails open on an unverifiable rerun, never treating absent as re-cancelled", () => {
    // Same rule as shouldFailFast: a query that was skipped or itself
    // errored must not become a hard deploy failure.
    expect(shouldFailFastAfterRerun("absent")).toBe(false);
    expect(shouldFailFastAfterRerun(undefined)).toBe(false);
    expect(shouldFailFastAfterRerun(null)).toBe(false);
    expect(shouldFailFastAfterRerun("")).toBe(false);
  });

  it("decides on exactly one of the states classifyCiRun can produce", () => {
    const failing = CI_RUN_STATES.filter((state) => shouldFailFastAfterRerun(state));
    expect(failing).toEqual(["cancelled"]);
  });
});

describe("CLI --after-rerun", () => {
  const cli = (args) => JSON.parse(execFileSync("node", [SCRIPT, ...args], { encoding: "utf8" }));

  it("reports failFast for a rerun that was cancelled again", () => {
    expect(
      cli(["--after-rerun", JSON.stringify([{ status: "completed", conclusion: "cancelled" }])])
    ).toEqual({ state: "cancelled", failFast: true });
  });

  it("reports no failFast for a rerun that is still queued", () => {
    expect(
      cli(["--after-rerun", JSON.stringify([{ status: "queued", conclusion: null }])])
    ).toEqual({ state: "running", failFast: false });
  });

  it("keeps polling a concurrency-held rerun instead of breaking on the first poll", () => {
    // Verbatim shape of the REST payload the workflow pipes in for a run
    // `ci.yml`'s concurrency group is holding.
    expect(
      cli(["--after-rerun", JSON.stringify([{ status: "pending", conclusion: null }])])
    ).toEqual({ state: "running", failFast: false });
  });

  it("reports no failFast for an empty or unparseable rerun query", () => {
    expect(cli(["--after-rerun", "[]"])).toEqual({ state: "absent", failFast: false });
  });
});

describe("classifyRerun", () => {
  // The `--after-rerun` query reads the REST run object directly, whose
  // `status` vocabulary is wider than `gh run list`'s. A run held by
  // `ci.yml`'s concurrency group reports `pending` or `requested`, neither of
  // which `classifyCiRun` knows -- it would call them `absent`, the verify
  // loop would read that as "settled", break on its first poll, and fall
  // straight through to the 1800s wait the loop exists to avoid.
  it("treats a concurrency-held run as still running, not absent", () => {
    expect(classifyRerun([{ status: "pending", conclusion: null }])).toBe("running");
    expect(classifyRerun([{ status: "requested", conclusion: null }])).toBe("running");
  });

  it("agrees with classifyCiRun on every status it already knew", () => {
    expect(classifyRerun([{ status: "queued", conclusion: null }])).toBe("running");
    expect(classifyRerun([{ status: "in_progress", conclusion: null }])).toBe("running");
    expect(classifyRerun([{ status: "waiting", conclusion: null }])).toBe("running");
    expect(classifyRerun([done("cancelled")])).toBe("cancelled");
    expect(classifyRerun([done("success")])).toBe("success");
    expect(classifyRerun([done("failure")])).toBe("failed");
  });

  it("still reports absent for an empty query, so an unanswered read fails open", () => {
    expect(classifyRerun([])).toBe("absent");
  });

  it("does not widen classifyCiRun itself, which would break the #5663 fail-fast", () => {
    // shouldFailFast fires on `absent` + workflow_dispatch. If `pending`
    // became `running` there, a dispatch on a commit with no CI run would
    // stop failing fast and burn the full discovery timeout again.
    expect(classifyCiRun([{ status: "pending", conclusion: null }])).toBe("absent");
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
  const cli = (runs, triggerEvent, hasCheckRuns) => {
    const args = [SCRIPT, JSON.stringify(runs)];
    if (triggerEvent !== undefined) args.push(triggerEvent);
    if (hasCheckRuns !== undefined) args.push(hasCheckRuns);
    return JSON.parse(execFileSync("node", args, { encoding: "utf8" }));
  };

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

  it("emits failFast:true for a manually dispatched run with no CI history, once check-runs are passed as verified empty — #5663", () => {
    expect(cli([], "workflow_dispatch", "false")).toEqual({
      state: "absent",
      rerun: false,
      runId: null,
      failFast: true,
    });
  });

  it("emits failFast:false when check-runs were verified to exist, even for an absent+dispatch run list", () => {
    // The run-list `--commit` filter lag case: `gh run list` says absent,
    // but the checks API disagrees — trust the checks API.
    expect(cli([], "workflow_dispatch", "true")).toEqual({
      state: "absent",
      rerun: false,
      runId: null,
      failFast: false,
    });
  });

  it("defaults failFast:false when no check-run evidence is passed, so an old or best-effort-failed caller fails open", () => {
    expect(cli([], "workflow_dispatch")).toEqual({
      state: "absent",
      rerun: false,
      runId: null,
      failFast: false,
    });
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

  it("verifies the rerun actually started instead of trusting it, then fails fast when it was cancelled again", () => {
    // The rerun re-enters the same concurrency group it was cancelled in,
    // so "I issued a rerun" is not evidence that `Build` will appear.
    const assess = DEPLOY_WORKFLOW_CODE.slice(
      DEPLOY_WORKFLOW_CODE.indexOf("gh run rerun"),
      DEPLOY_WORKFLOW_CODE.indexOf("lewagon/wait-on-check-action")
    );
    expect(assess).toContain("--after-rerun");
    expect(assess).toMatch(/rerunVerdict=/);
  });

  it("stops the job on a re-cancelled rerun, before the 1800s wait", () => {
    // Slice from the step NAME, not from the `RERUN_VERDICT` env key: the
    // conventional position for `continue-on-error` is the line right after
    // `- name:`, which precedes the env block, so a slice starting at the env
    // key would stay green with this step made non-blocking.
    const start = DEPLOY_WORKFLOW_CODE.indexOf(
      "Fail fast when the re-run CI run was cancelled again"
    );
    const end = DEPLOY_WORKFLOW_CODE.indexOf("lewagon/wait-on-check-action");
    expect(start).toBeGreaterThan(-1);
    expect(start).toBeLessThan(end);
    const block = DEPLOY_WORKFLOW_CODE.slice(start, end);
    expect(block).toContain("RERUN_VERDICT");
    expect(block).toMatch(/exit 1/);
    expect(block).not.toContain("continue-on-error");
  });

  it("bounds the rerun verification so it cannot become a new stall", () => {
    const assess = DEPLOY_WORKFLOW_CODE.slice(
      DEPLOY_WORKFLOW_CODE.indexOf("gh run rerun"),
      DEPLOY_WORKFLOW_CODE.indexOf("lewagon/wait-on-check-action")
    );
    expect(assess).toMatch(/RERUN_VERIFY_SECONDS=\d+/);
    const budget = Number(assess.match(/RERUN_VERIFY_SECONDS=(\d+)/)[1]);
    // Measured attempt-2 eviction latencies on main, 2026-11-28 (run id:
    // seconds from the rerun being created to it being cancelled):
    // 46108205241 50s, 46083667306 121s, 46106352432 174s, 46112197323 261s,
    // 46098634732 537s. A budget under the slowest of those expires with
    // verdict `running` and burns the full 1800s wait anyway, so it must
    // cover the distribution. Waiting here is near-free: the job is already
    // willing to wait 1800s, and this budget is spent instead of, not on top
    // of, that wait.
    expect(budget).toBeGreaterThanOrEqual(537);
    // Still well inside the wait step's own 1800s discovery timeout.
    expect(budget).toBeLessThanOrEqual(900);
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
