import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

const TIER_CLASSIFIER_WORKFLOW = readFileSync(
  resolve(ROOT, ".github/workflows/tier-classifier.yml"),
  "utf8"
);

/**
 * Regression test for #4070: every `auto-merge`-labeled automation PR was
 * permanently ineligible for auto-merge because `tier-classifier.yml` only
 * triggers on `pull_request`, which GitHub's anti-recursion rule (and/or the
 * approval park — see .claude/rules/gotchas.md § CI) never reliably fires
 * for GITHUB_TOKEN/AUTOMATION_PAT-authored automation PRs. The fix mirrors
 * `ci.yml`'s own dispatch pattern: `tier-classifier.yml` accepts
 * `workflow_dispatch` with a PR number, and each of the four
 * `auto-merge`-labeled producers dispatches it (and waits for the resulting
 * label) before checking eligibility.
 *
 * Parsed textually rather than with a YAML library, matching the existing
 * precedent in drift-fix-workflow.test.mjs / tier-classifier-workflow.test.mjs.
 */
describe("tier-classifier.yml workflow_dispatch", () => {
  it("accepts workflow_dispatch with a required pr input", () => {
    expect(TIER_CLASSIFIER_WORKFLOW).toMatch(/workflow_dispatch:\s*\n\s*inputs:\s*\n\s*pr:/);
    const inputsBlock = TIER_CLASSIFIER_WORKFLOW.slice(
      TIER_CLASSIFIER_WORKFLOW.indexOf("workflow_dispatch:")
    ).slice(0, 600);
    expect(inputsBlock).toMatch(/required:\s*true/);
  });

  it("still declares the original pull_request trigger", () => {
    expect(TIER_CLASSIFIER_WORKFLOW).toMatch(
      /pull_request:\s*\n\s*types:\s*\[opened, synchronize, reopened\]/
    );
  });
});

const PRODUCERS = [
  { file: ".github/workflows/production-feedback.yml", branch: "automation/production-feedback" },
  { file: ".github/workflows/drift-fix.yml", branch: "automation/drift-fix" },
  { file: ".github/workflows/pr-metrics.yml", branch: "automation/pr-acceptance-metrics" },
  { file: ".github/workflows/acmm-regression.yml", branch: "automation/acmm-regression" },
];

describe.each(PRODUCERS)("$file dispatches tier-classifier", ({ file, branch }) => {
  const workflow = readFileSync(resolve(ROOT, file), "utf8");

  it("dispatches tier-classifier.yml on its own automation branch, gated on the PR having been created", () => {
    const dispatchRe = new RegExp(
      `gh workflow run tier-classifier\\.yml --ref ${branch.replace("/", "\\/")} -f pr=`
    );
    expect(workflow).toMatch(dispatchRe);
  });

  it("waits for the tier label before the Enable auto-merge step reads it", () => {
    expect(workflow).toMatch(/node scripts\/wait-for-tier-label\.mjs --pr/);
  });

  it("orders: Dispatch CI -> Dispatch tier-classifier -> Wait for tier label -> Enable auto-merge", () => {
    const ciDispatchAt = workflow.indexOf("gh workflow run ci.yml --ref");
    const tierDispatchAt = workflow.indexOf("gh workflow run tier-classifier.yml --ref");
    const waitAt = workflow.indexOf("node scripts/wait-for-tier-label.mjs");
    const enableAutoMergeAt = workflow.indexOf("name: Enable auto-merge");

    expect(ciDispatchAt).toBeGreaterThan(-1);
    expect(tierDispatchAt).toBeGreaterThan(-1);
    expect(waitAt).toBeGreaterThan(-1);
    expect(enableAutoMergeAt).toBeGreaterThan(-1);

    expect(ciDispatchAt).toBeLessThan(tierDispatchAt);
    expect(tierDispatchAt).toBeLessThan(waitAt);
    expect(waitAt).toBeLessThan(enableAutoMergeAt);
  });

  it("gates the dispatch on the PR having actually been created (a no-op day stays a no-op)", () => {
    const tierDispatchStepStart = workflow.indexOf("name: Dispatch tier-classifier");
    expect(tierDispatchStepStart).toBeGreaterThan(-1);
    const stepBlock = workflow.slice(tierDispatchStepStart, tierDispatchStepStart + 800);
    expect(stepBlock).toMatch(/if:\s*steps\.create-pr\.outputs\.pull-request-number/);
  });
});
