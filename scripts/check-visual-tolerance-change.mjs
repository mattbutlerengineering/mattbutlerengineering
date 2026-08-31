#!/usr/bin/env node

/**
 * check-visual-tolerance-change.mjs — block a PR that changes visual
 * regression tolerance/snapshot configuration without also updating the
 * baselines that surface now measures against (#4711).
 *
 * #4496 ("fix(rialto-web): tighten visual-regression tolerance to an
 * absolute pixel budget") tightened apps/rialto-web/playwright.config.ts's
 * toHaveScreenshot budget without regenerating any of the 49 Linux-runner
 * baselines, and merged anyway with `Visual Regression (rialto-web)` red on
 * its own head SHA — that check is advisory, not part of `CI Gate`'s
 * `needs:`, so `gh pr merge --auto` saw a green gate. `main` failed the
 * visual suite for three days (#4560, #4584) until #4613 cleaned it up 34
 * files later.
 *
 * This is a narrow fitness check, not a promotion of the whole visual suite
 * to required: it only fails when a PR's diff BOTH (a) touches a known
 * visual-tolerance surface and (b) touches none of the baseline snapshot
 * directories those surfaces measure against. A PR that changes tolerance
 * AND regenerates baselines passes; a PR that never touches tolerance passes
 * trivially, with no snapshot changes required.
 *
 * classifyVisualToleranceChange() is the pure decision, unit-tested without
 * any GitHub/git access. The CLI entry point below is the thin `git diff`
 * wiring layer, following the pattern in scripts/ci-gate-commit-status.mjs.
 *
 * Usage:
 *   node scripts/check-visual-tolerance-change.mjs
 *   (reads `git diff --name-only origin/main...HEAD`, exits 1 on failure)
 */

import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

/**
 * Whole-file surfaces: touching these always counts as a tolerance change
 * regardless of which lines changed — each file's sole purpose is to
 * configure the visual-diff budget.
 */
const TOLERANCE_CONFIG_FILE_PATTERNS = [
  // apps/rialto-web/playwright.config.* — the enforced E2E visual gate.
  /^apps\/rialto-web\/playwright\.config\.[cm]?[jt]s$/,
  // packages/rialto/playwright.visual.config.* — the Storybook visual gate.
  /^packages\/rialto\/playwright\.visual\.config\.[cm]?[jt]s$/,
];

/**
 * Directories where a threshold-OPTION edit (not just any edit) counts as a
 * tolerance change. Broad edits to these directories (a selector fix, a new
 * assertion) must NOT trip this check — only edits that add/remove one of
 * the option keys below.
 */
const TOLERANCE_CONTENT_DIR_PREFIXES = ["apps/rialto-web/e2e/", "packages/rialto/"];

/** The literal toHaveScreenshot/toMatchSnapshot threshold options this check watches for. */
const THRESHOLD_OPTION_PATTERN = /\b(maxDiffPixels|maxDiffPixelRatio|threshold)\s*:/;

/** Baseline snapshot directories those tolerance surfaces measure against. */
const SNAPSHOT_DIR_PATTERNS = [/\/screenshots\//, /\/__screenshots__\//, /-snapshots\//];

function isToleranceConfigFile(path) {
  return TOLERANCE_CONFIG_FILE_PATTERNS.some((pattern) => pattern.test(path));
}

function isSnapshotFile(path) {
  return SNAPSHOT_DIR_PATTERNS.some((pattern) => pattern.test(path));
}

function isContentCandidate(path) {
  return (
    TOLERANCE_CONTENT_DIR_PREFIXES.some((prefix) => path.startsWith(prefix)) &&
    !isSnapshotFile(path)
  );
}

/** Normalizes a changed-file entry to `{ path, patch }`. */
function normalize(entry) {
  if (typeof entry === "string") return { path: entry, patch: "" };
  return { path: entry.path, patch: entry.patch ?? "" };
}

function isToleranceFile({ path, patch }) {
  if (isToleranceConfigFile(path)) return true;
  if (isContentCandidate(path) && THRESHOLD_OPTION_PATTERN.test(patch)) return true;
  return false;
}

/**
 * Pure decision: does this PR's diff modify visual tolerance/snapshot
 * configuration without also updating the baselines it measures against?
 *
 * @param {Array<string|{path: string, patch?: string}>} changedFiles
 * @returns {{ pass: boolean, reason: string }}
 */
export function classifyVisualToleranceChange(changedFiles) {
  const files = (changedFiles ?? []).map(normalize);
  const toleranceFiles = files.filter(isToleranceFile);

  if (toleranceFiles.length === 0) {
    return { pass: true, reason: "No visual-tolerance surface changed." };
  }

  const toleranceFileList = toleranceFiles.map((f) => f.path).join(", ");
  const baselinesUpdated = files.some((f) => isSnapshotFile(f.path));

  if (baselinesUpdated) {
    return {
      pass: true,
      reason: `Visual tolerance changed (${toleranceFileList}) and baseline snapshots were updated alongside it.`,
    };
  }

  return {
    pass: false,
    reason:
      `Visual tolerance changed (${toleranceFileList}) but no baseline snapshot files were ` +
      "updated in the same diff. A PR that tightens or loosens the visual-diff budget without " +
      "regenerating baselines can merge with its own visual check red and start a cascading red " +
      "streak on main (#4496 -> #4560/#4584 -> #4613). Update the baselines in this PR (or split " +
      "the tolerance change into its own PR that also regenerates them) before merging.",
  };
}

// ── CLI entry point ─────────────────────────────────────────────────────────

function gitDiffNames() {
  const output = execFileSync("git", ["diff", "--name-only", "origin/main...HEAD"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  return output.trim().split("\n").filter(Boolean);
}

function gitDiffPatch(path) {
  return execFileSync("git", ["diff", "origin/main...HEAD", "--", path], {
    cwd: ROOT,
    encoding: "utf8",
  });
}

/**
 * Builds the changed-file list the pure decision needs. Only fetches patch
 * content for files that require content-level inspection (a content
 * candidate that isn't already a whole-file config match) — the ~95% of PRs
 * that touch neither surface pay for a single `--name-only` diff only.
 */
function getChangedFiles() {
  return gitDiffNames().map((path) => {
    if (isToleranceConfigFile(path) || !isContentCandidate(path)) {
      return path;
    }
    return { path, patch: gitDiffPatch(path) };
  });
}

function main() {
  const { pass, reason } = classifyVisualToleranceChange(getChangedFiles());
  process.stdout.write(reason + "\n");
  process.exit(pass ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
