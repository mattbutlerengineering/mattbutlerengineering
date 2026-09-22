import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEPLOY_JOB_NAME,
  classifyDeployRun,
  countConsecutiveDeployFailures,
} from "../circuit-breaker-deploy-failures.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const WORKFLOW = readFileSync(resolve(ROOT, ".github/workflows/circuit-breaker.yml"), "utf8");

describe("classifyDeployRun", () => {
  it("treats a failed or timed-out deploy job as a deploy failure", () => {
    expect(classifyDeployRun({ deployJobConclusion: "failure" })).toBe("deploy-failure");
    expect(classifyDeployRun({ deployJobConclusion: "timed_out" })).toBe("deploy-failure");
    expect(classifyDeployRun({ deployJobConclusion: "FAILURE" })).toBe("deploy-failure");
  });

  it("treats a successful deploy job as a deploy success", () => {
    expect(classifyDeployRun({ deployJobConclusion: "success" })).toBe("deploy-success");
  });

  it("treats a run that never deployed as carrying no signal", () => {
    // `skipped` is what the deploy job reports when `Wait for CI` failed or
    // the breaker had already blocked the run — neither says anything about
    // whether deploying works.
    expect(classifyDeployRun({ deployJobConclusion: "skipped" })).toBe("not-a-deploy");
    expect(classifyDeployRun({ deployJobConclusion: null })).toBe("not-a-deploy");
    expect(classifyDeployRun({ deployJobConclusion: "" })).toBe("not-a-deploy");
    expect(classifyDeployRun({})).toBe("not-a-deploy");
    expect(classifyDeployRun(undefined)).toBe("not-a-deploy");
    // A cancelled deploy produced no outcome either.
    expect(classifyDeployRun({ deployJobConclusion: "cancelled" })).toBe("not-a-deploy");
  });
});

describe("countConsecutiveDeployFailures", () => {
  it("counts a genuine streak of failed deploys", () => {
    expect(
      countConsecutiveDeployFailures([
        { deployJobConclusion: "failure" },
        { deployJobConclusion: "failure" },
        { deployJobConclusion: "success" },
      ])
    ).toBe(2);
  });

  it("stops at the first genuine deploy success", () => {
    expect(
      countConsecutiveDeployFailures([
        { deployJobConclusion: "failure" },
        { deployJobConclusion: "success" },
        { deployJobConclusion: "failure" },
        { deployJobConclusion: "failure" },
      ])
    ).toBe(1);
  });

  it("does not trip on the 2026-09-22 false-positive shape (#5659)", () => {
    // Replays the exact runs the breaker counted in run 35674731430:
    //   35672268342 — Deploy API Services: failure   (DO BuildJobTerminated)
    //   35654241232 — Deploy API Services: skipped   (died at `Wait for CI`)
    // The old run-level count saw "2 consecutive failures" and blocked
    // production deploys. Only one deploy actually failed.
    const runs = [
      { deployJobConclusion: "failure" },
      { deployJobConclusion: "skipped" },
      { deployJobConclusion: "success" },
    ];

    expect(countConsecutiveDeployFailures(runs)).toBe(1);
    expect(countConsecutiveDeployFailures(runs)).toBeLessThan(2);
  });

  it("skips a non-deploy run without resetting a real streak", () => {
    // A pre-deploy gate failure on top of two failed deploys must not read
    // as recovery — nothing has deployed successfully since.
    expect(
      countConsecutiveDeployFailures([
        { deployJobConclusion: "skipped" },
        { deployJobConclusion: "failure" },
        { deployJobConclusion: "failure" },
      ])
    ).toBe(2);
  });

  it("returns 0 for no runs, and for runs that never deployed", () => {
    expect(countConsecutiveDeployFailures([])).toBe(0);
    expect(countConsecutiveDeployFailures()).toBe(0);
    expect(countConsecutiveDeployFailures([{ deployJobConclusion: "skipped" }])).toBe(0);
  });
});

describe("circuit-breaker.yml wiring", () => {
  it("names only workflows that actually exist", () => {
    // The name `Deploy Static` matched no workflow in this repo for the
    // breaker's entire life — the real one is `Deploy Static Sites`, which is
    // what post-deploy-check.yml and pulumi-up.yml both use. A workflow_run
    // trigger naming a non-existent workflow fires silently never.
    //
    // Asserted against the `workflows:` VALUE, not the surrounding text: the
    // comment above that line necessarily quotes the dead name in order to
    // explain it, and a looser match just reads the explanation back.
    const declared = WORKFLOW.match(/^\s*workflows:\s*(\[.*\])\s*$/m)?.[1];

    expect(declared).toBe('["Deploy Services"]');
  });

  it("decides the failure count through the tested classifier, not inline bash", () => {
    expect(WORKFLOW).toContain("circuit-breaker-deploy-failures.mjs");
    // The old inline loop counted `gh run list --json conclusion` directly.
    expect(WORKFLOW).not.toMatch(/FAIL_COUNT=\$\(\(FAIL_COUNT \+ 1\)\)/);
  });

  it("reads the deploy job's own conclusion, which is the only real signal", () => {
    expect(WORKFLOW).toContain(DEPLOY_JOB_NAME);
    expect(WORKFLOW).toContain("deployJobConclusion");
  });

  it("makes the classifier available to the sparse-checkout job", () => {
    // The breaker job checks out the `circuit-breaker-state` branch with a
    // sparse-checkout of just the state file, so repo scripts are NOT on
    // disk unless explicitly checked out — same pattern as the existing
    // issue-filing module step.
    expect(WORKFLOW).toMatch(/path:\s*_breaker-lib/);
    expect(WORKFLOW).toContain("node _breaker-lib/scripts/circuit-breaker-deploy-failures.mjs");
  });

  it("sets pipefail where a gate command's exit code is the point", () => {
    // GitHub's default shell is `bash -e` with no pipefail.
    const analyze = WORKFLOW.slice(
      WORKFLOW.indexOf("Analyze deploy results"),
      WORKFLOW.indexOf("Persist state to git")
    );
    expect(analyze).toContain("set -o pipefail");
  });
});
