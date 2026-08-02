import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const WORKFLOW = readFileSync(resolve(ROOT, ".github/workflows/auto-qa-tune.yml"), "utf8");

describe("auto-qa-tune workflow", () => {
  it("dispatches CI, because GITHUB_TOKEN PRs do not trigger it", () => {
    // GitHub's anti-recursion rule means a GITHUB_TOKEN-authored PR never fires
    // `pull_request` workflows, so the required CI Gate check never appears and
    // the PR sits BLOCKED forever. workflow_dispatch is the documented exception.
    expect(WORKFLOW).toMatch(/gh workflow run ci\.yml --ref automation\/auto-qa-tuning/);
    expect(WORKFLOW).toMatch(/actions:\s*write/);
  });

  it("writes the tuning proposal to the job summary before attempting the PR step", () => {
    // A credential failure at the PR step must not discard the week's
    // analysis: the proposal has to be persisted (job summary, at minimum)
    // before the PR-opening step runs.
    const summaryAt = WORKFLOW.indexOf("GITHUB_STEP_SUMMARY");
    const prStepAt = WORKFLOW.indexOf("peter-evans/create-pull-request");

    expect(summaryAt, "workflow must write GITHUB_STEP_SUMMARY").toBeGreaterThan(-1);
    expect(prStepAt, "workflow must open a PR via peter-evans/create-pull-request").toBeGreaterThan(
      -1
    );
    expect(summaryAt).toBeLessThan(prStepAt);
  });

  it("never swallows a credential failure", () => {
    // `|| true` (or any exit-code swallowing) on the PR step would turn a real
    // "GitHub Actions is not permitted to create or approve pull requests"
    // failure into a silent green run.
    expect(WORKFLOW).not.toMatch(/\|\|\s*true/);
    expect(WORKFLOW).not.toMatch(/continue-on-error:\s*true/);
  });

  it("reports whether a PR was opened, so a no-op run says so explicitly", () => {
    expect(WORKFLOW).toMatch(/steps\.create-pr\.outputs\.pull-request-number/);
  });
});
