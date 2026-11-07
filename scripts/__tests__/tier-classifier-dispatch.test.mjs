import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
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
    ).slice(0, 1500);
    expect(inputsBlock).toMatch(/required:\s*true/);
  });

  it("triggers on pull_request_target (base-side workflow file), same types", () => {
    expect(TIER_CLASSIFIER_WORKFLOW).toMatch(
      /pull_request_target:\s*\n\s*types:\s*\[opened, synchronize, reopened\]/
    );
  });
});

const PRODUCERS = [
  "acmm-regression",
  "docs-audit",
  "drift-fix",
  "metrics-collectors",
  "pr-metrics",
  "production-feedback",
  "record-summary-rows",
  "shipped-features-snapshot",
  "stale-human-blocked",
  "visual-baseline-regen",
].map((name) => ({ file: `.github/workflows/${name}.yml` }));

/**
 * A dispatch runs the workflow file as it exists at the dispatched ref, so a
 * `--ref <PR branch>` would run a PR-authored classifier. The classifier fails
 * closed off the default branch; every producer must therefore dispatch it
 * with no `--ref`.
 */
describe("every workflow dispatches tier-classifier from the default branch", () => {
  const workflowDir = resolve(ROOT, ".github/workflows");
  const dispatchLines = (text) =>
    text.split("\n").filter((l) => /gh workflow run tier-classifier\.yml/.test(l));

  it("no `gh workflow run tier-classifier.yml` line passes --ref", () => {
    const offenders = readdirSync(workflowDir)
      .filter((f) => f.endsWith(".yml"))
      .filter((f) =>
        dispatchLines(readFileSync(resolve(workflowDir, f), "utf8")).some((l) => /--ref\b/.test(l))
      );
    expect(offenders).toEqual([]);
  });

  it("each of the ten producers still contains a dispatch (cannot pass by finding nothing)", () => {
    const missing = PRODUCERS.filter(
      ({ file }) => dispatchLines(readFileSync(resolve(ROOT, file), "utf8")).length === 0
    ).map(({ file }) => file);
    expect(missing).toEqual([]);
  });
});

// The four `auto-merge`-labeled producers also wait for the label and then arm
// auto-merge; the other six only dispatch (covered above).
const AUTO_MERGE_PRODUCERS = PRODUCERS.filter(({ file }) =>
  /\/(production-feedback|drift-fix|pr-metrics|acmm-regression)\.yml$/.test(file)
);

describe.each(AUTO_MERGE_PRODUCERS)("$file dispatches tier-classifier", ({ file }) => {
  const workflow = readFileSync(resolve(ROOT, file), "utf8");

  it("waits for the tier label before the Enable auto-merge step reads it", () => {
    expect(workflow).toMatch(/node scripts\/wait-for-tier-label\.mjs --pr/);
  });

  it("orders: Dispatch CI -> Dispatch tier-classifier -> Wait for tier label -> Enable auto-merge", () => {
    const ciDispatchAt = workflow.indexOf("gh workflow run ci.yml --ref");
    const tierDispatchAt = workflow.indexOf("gh workflow run tier-classifier.yml");
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
