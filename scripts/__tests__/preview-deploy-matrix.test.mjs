/**
 * `deploy-preview` in `.github/workflows/preview-deploy.yml` used a static
 * three-entry matrix (marketing, hospitality, rialto-web) and gated every
 * *step* on that app's `detect-changes` filter. GitHub still started a runner
 * for each entry, so a PR touching one app booted three jobs: one that
 * deployed and two that checked out and exited.
 *
 * Measured on two single-app PR runs (2026-11-28): run 46108332395
 * (`apps/hospitality` only) spent 7s and 8s in the rialto-web and marketing
 * jobs after 5.1m and 3.6m of queue wait, and run 46106631247 spent 7s and
 * 13s after 1.6m and 3.6m. Those two slots count against the account's
 * concurrent-job cap, which is what sets `ci.yml`'s queue wait (#10009).
 *
 * So pin the matrix to `detect-changes`'s own list of changed apps: a job is
 * started only for an app that will actually be deployed.
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getJob, loadWorkflow } from "../lib/workflow.mjs";

const WORKFLOW = loadWorkflow("preview-deploy.yml");
const APPS = ["marketing", "hospitality", "rialto-web"];

describe("preview-deploy only starts a runner for a changed app", () => {
  it("detect-changes exports the changed apps as a matrix list", () => {
    const job = getJob(WORKFLOW, "detect-changes");
    expect(job.outputs.apps).toBeDefined();
  });

  it("deploy-preview builds its matrix from that list, not a static app list", () => {
    const job = getJob(WORKFLOW, "deploy-preview");
    const include = job.strategy.matrix.include;
    expect(typeof include).toBe("string");
    expect(include).toContain("fromJSON(needs.detect-changes.outputs.apps)");
  });

  it("no deploy-preview step is gated on a per-app filter any more", () => {
    // A `matrix.filter` guard is the tell of the static matrix: it is how a
    // job that should never have started used to no-op its way to success.
    const job = getJob(WORKFLOW, "deploy-preview");
    const text = JSON.stringify(job.steps);
    expect(text).not.toContain("matrix.filter");
    for (const step of job.steps) {
      expect(step.if ?? "", `${step.name ?? step.uses} is gated on a filter output`).not.toMatch(
        /detect-changes\.outputs\[/
      );
    }
  });

  it("keeps the gates that stop an empty matrix and a credential-less run", () => {
    // `fromJSON('[]')` is not a startable matrix, and Dependabot's secret
    // scope cannot authenticate the deploy (#5623) — both must still skip.
    const job = getJob(WORKFLOW, "deploy-preview");
    expect(job.if).toContain("needs.detect-changes.outputs.any_changed == 'true'");
    expect(job.if).toContain("dependabot[bot]");
  });

  it("still covers every previewable app", () => {
    const detect = getJob(WORKFLOW, "detect-changes");
    const text = JSON.stringify(detect.steps);
    for (const app of APPS) {
      expect(text, `${app} is no longer detected`).toContain(app);
    }
  });

  describe("the step that builds the list", () => {
    // Run the real `run:` script, because the failure modes are shell ones:
    // GitHub's default shell is `bash -e`, so an `&&` chain over a false test
    // aborts the step, and a missing separator emits invalid JSON that fails
    // the matrix instead of the deploy.
    const check = getJob(WORKFLOW, "detect-changes").steps.find((step) => step.id === "check");

    const emit = (marketing, hospitality, rialto) => {
      const outFile = join(mkdtempSync(join(tmpdir(), "preview-matrix-")), "out");
      writeFileSync(outFile, "");
      execFileSync("bash", ["-e", "-c", check.run], {
        encoding: "utf8",
        env: {
          ...process.env,
          MARKETING: String(marketing),
          HOSPITALITY: String(hospitality),
          RIALTO: String(rialto),
          GITHUB_OUTPUT: outFile,
        },
      });
      const out = readFileSync(outFile, "utf8");
      return {
        apps: JSON.parse(/^apps=(.*)$/m.exec(out)[1]),
        any: /^any=(.*)$/m.exec(out)[1],
      };
    };

    it("reads the three filter outputs from env", () => {
      expect(check).toBeDefined();
      expect(Object.keys(check.env).sort()).toEqual(["HOSPITALITY", "MARKETING", "RIALTO"]);
    });

    it.each([
      [
        [true, true, true],
        ["marketing", "hospitality", "rialto-web"],
      ],
      [[false, true, false], ["hospitality"]],
      [[true, false, false], ["marketing"]],
      [[false, false, true], ["rialto-web"]],
      [
        [true, false, true],
        ["marketing", "rialto-web"],
      ],
      [[false, false, false], []],
    ])("%j yields one entry per changed app", ([m, h, r], expected) => {
      const { apps, any } = emit(m, h, r);
      expect(apps.map((entry) => entry.app)).toEqual(expected);
      expect(apps.every((entry) => typeof entry.package === "string" && entry.package)).toBe(true);
      expect(any).toBe(expected.length > 0 ? "true" : "false");
    });
  });

  it("comment-preview still reads each app's own filter output", () => {
    // The sticky comment lists only the apps that changed; it must keep its
    // per-app outputs even though the matrix no longer uses them.
    const detect = getJob(WORKFLOW, "detect-changes");
    for (const key of ["marketing", "hospitality", "rialto"]) {
      expect(detect.outputs[key]).toBeDefined();
    }
  });
});
