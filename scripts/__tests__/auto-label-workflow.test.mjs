import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const WORKFLOW = readFileSync(resolve(ROOT, ".github/workflows/auto-label.yml"), "utf8");

/**
 * `auto-label.yml` ran 200+ times, always green, and never applied a single
 * label — measured 2026-09-21.
 *
 * The job has no `actions/checkout`, so there is no `.git` in the runner's
 * working directory. `gh issue edit` resolves its target repository from the
 * git remote, so every call died with:
 *
 *   failed to run git: fatal: not a git repository (or any of the parent
 *   directories): .git
 *
 * Both calls were suffixed `|| true`, so the step exited 0 and the run showed
 * success with "Computed labels: docs" right above the silent failure. Across
 * five sampled runs the error appears in every one that had labels to apply;
 * the only clean run computed `(none)` and skipped the step. Confirmed against
 * data: the rule computes `docs` for 27 of the last 80 issues and **zero**
 * issues carry it. `git log -S"GH_REPO"` on this file returns nothing, so it
 * has been broken since it was introduced on 2026-04-25 (#628).
 *
 * Textual parsing, matching the precedent in ci-node-matrix.test.mjs and
 * drift-fix-workflow.test.mjs — nothing in `scripts/` depends on a YAML parser.
 */
describe("auto-label.yml", () => {
  it("can resolve the repository for `gh` without a checkout", () => {
    // Either give the job a git context, or tell `gh` the repo explicitly.
    // GH_REPO is the cheaper of the two and is what this workflow uses.
    const hasRepoContext =
      /GH_REPO:\s*\$\{\{\s*github\.repository\s*\}\}/.test(WORKFLOW) ||
      /actions\/checkout/.test(WORKFLOW);
    expect(hasRepoContext).toBe(true);
  });

  it("does not swallow a failed label application", () => {
    // `gh label create ... || true` is fine — the label usually already exists.
    // `gh issue edit --add-label ... || true` is what hid this bug for five
    // months: it is the call that does the actual work, and its failure was
    // indistinguishable from success.
    // Skip comment lines: the step's own comment mentions `gh issue edit`, and
    // matching it instead of the command made this assertion pass vacuously.
    const editLine = WORKFLOW.split("\n").find(
      (l) => l.includes("gh issue edit") && !l.trim().startsWith("#")
    );
    expect(editLine, "auto-label.yml no longer calls `gh issue edit`").toBeDefined();
    expect(editLine).not.toMatch(/\|\|\s*true/);
  });

  it("routes the `docs` label on a title prefix, not a body keyword", () => {
    // The body-keyword form `/\b(documentation|README|docs?)\b/i` matched 27 of
    // the last 80 issues, because `docs/...` path citations are routine in this
    // repo's issue bodies. Repairing the workflow without narrowing this would
    // have turned a dead rule straight into a noisy one. The clean case is
    // already covered without the workflow: .github/ISSUE_TEMPLATE/documentation.yml
    // declares `labels: ["documentation"]`, which GitHub applies on its own.
    expect(WORKFLOW).not.toMatch(/\\b\(documentation\|README\|docs\?\)\\b/);
    expect(WORKFLOW).toMatch(/\^docs\[\(:\]/);
  });
});
