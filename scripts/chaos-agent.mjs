#!/usr/bin/env node

/**
 * Chaos Agent — Seeds detectable non-breaking bugs (#1191, #2927).
 *
 * This script injects synthetic bugs into the codebase to verify that
 * site-audit and lint loops are functioning correctly.
 *
 * The bug catalog (which types exist, and how each is injected) lives in
 * `@mbe/agent-core`'s `BUG_CATALOG`/`injectBug` (packages/agent-core/src/synthetic-bug-seeder.ts)
 * — this script is a thin I/O shell around that single source of truth:
 * 1. console-error: Adds a console.error in a useEffect (caught by site-audit Playwright)
 * 2. lighthouse-perf: Adds a large invisible image (caught by Lighthouse)
 * 3. accessibility: Removes an aria-label (caught by Lighthouse a11y)
 * 4. scout-todo: Adds a FIXME comment (caught by site-audit scout)
 *
 * Usage:
 *   node scripts/chaos-agent.mjs --type <type> [--file <path>]
 *   node scripts/chaos-agent.mjs --random
 *   node scripts/chaos-agent.mjs --type <type> --file <path> --dry-run  # no git/PR side effects
 *
 * `--random` retries: most random (type, file) pairings have no injection
 * point (e.g. lighthouse-perf against a file with no <Image>), so a single
 * attempt missed on ~15/15 lifetime scheduled runs (#4503). `--random` now
 * draws up to `RANDOM_RETRY_CAP` candidates and picks the first injectable
 * one via the pure `selectInjectableCandidate`, bounded so it always
 * terminates. `--type <t>` is unchanged: one file, exit 1 on a miss.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGhClient, COORDINATION_LABELS } from "@mbe/gh-client";
import { BUG_CATALOG, injectBug } from "@mbe/agent-core";

// Re-exported for tests: proves this script delegates to the agent-core
// catalog rather than reimplementing its own (#2927).
export { BUG_CATALOG };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const ghClient = createGhClient();

const TARGET_APPS = ["apps/marketing", "apps/hospitality", "apps/rialto-web"];

// `_type` is accepted for call-site symmetry but unused: target selection is
// currently type-independent (a random .tsx under a random target app).
export function findTargetFile(_type) {
  const app = TARGET_APPS[Math.floor(Math.random() * TARGET_APPS.length)];
  const files = execFileSync("find", [path.join(ROOT, app, "src"), "-name", "*.tsx"], {
    encoding: "utf-8",
  })
    .split("\n")
    .filter((f) => f && !f.includes(".test.") && !f.includes("layout.tsx"));

  return files[Math.floor(Math.random() * files.length)];
}

/**
 * Pure: builds the `gh pr create` args for a pushed chaos-bug PR. The `ready`
 * label is sourced from `@mbe/gh-client`'s coordination-label machine (#2933)
 * rather than a re-typed string literal, so it can never drift from the
 * canonical label name.
 */
export function buildChaosPrArgs(type, targetFile, relativePath) {
  const prBody = `## Chaos Agent Synthetic Bug Audit

      This PR contains a synthetic **${type}** bug injected by the Chaos Agent.

      **File:** ${relativePath}
      **Goal:** Verify that site-audit and lint loops detect this issue and file a corresponding GitHub issue.

      This PR is designed to be detectable but non-breaking for the build.

      Labels: \`chaos-audit\`, \`${COORDINATION_LABELS.READY}\`, \`audit\``;

  return [
    "--title",
    `chaos: synthetic ${type} bug in ${path.basename(targetFile)}`,
    "--body",
    prBody,
    "--label",
    "chaos-audit",
    "--label",
    COORDINATION_LABELS.READY,
    "--label",
    "audit",
  ];
}

/** Reads `filePath` and delegates to the pure `injectBug` catalog transform. */
function computeInjection(type, filePath) {
  return injectBug(type, fs.readFileSync(filePath, "utf-8"));
}

/** Upper bound on how many random (type, file) candidates `--random` will try. */
export const RANDOM_RETRY_CAP = 8;

/**
 * Pure: returns the first candidate for which `isInjectable(candidate)` is
 * true, or `null` if none of them are. This is the entire candidate-
 * selection/retry decision for `--random` mode — no I/O, no randomness — so
 * it can be unit-tested without touching the filesystem or the bug catalog.
 */
export function selectInjectableCandidate(candidates, isInjectable) {
  for (const candidate of candidates) {
    if (isInjectable(candidate)) return candidate;
  }
  return null;
}

/**
 * Creates the chaos branch and commits the injected bug, via an injectable
 * `exec(cmd, args)` so this can be tested without touching git state.
 *
 * Sets a local (not --global) git identity before committing — CI runners
 * have none configured for this job, which crashes `git commit` with
 * "Author identity unknown" (#4287). Matches the convention already used in
 * `.github/workflows/post-merge.yml`.
 */
export function commitChaosBug(exec, { branchName, targetFile, type, relativePath }) {
  exec("git", ["checkout", "-b", branchName]);
  exec("git", ["config", "user.name", "github-actions[bot]"]);
  exec("git", ["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"]);
  exec("git", ["add", targetFile]);
  exec("git", ["commit", "-m", `chore(chaos): seed synthetic ${type} in ${relativePath}`]);
}

/**
 * Applies a catalog bug to the file at `filePath` (writes the transformed
 * content back). Returns whether an injection actually happened.
 */
export function injectBugIntoFile(type, filePath) {
  const result = computeInjection(type, filePath);

  if (!result.injected) {
    console.log(`No injection point found for ${type} in ${filePath}, skipping...`);
    return false;
  }

  fs.writeFileSync(filePath, result.content);
  return true;
}

/**
 * Draws up to `RANDOM_RETRY_CAP` random (type, file) candidates and returns
 * the first one with an actual injection point, via the pure
 * `selectInjectableCandidate`. Returns `null` if every candidate in the
 * bounded search misses.
 */
function pickRandomInjectableCandidate() {
  const types = Object.keys(BUG_CATALOG);
  const candidates = Array.from({ length: RANDOM_RETRY_CAP }, () => {
    const candidateType = types[Math.floor(Math.random() * types.length)];
    return { type: candidateType, file: findTargetFile(candidateType) };
  });

  return selectInjectableCandidate(candidates, (c) => computeInjection(c.type, c.file).injected);
}

function main() {
  const args = process.argv.slice(2);
  const explicitType = args.includes("--type") ? args[args.indexOf("--type") + 1] : null;
  const randomMode = args.includes("--random");
  const dryRun = args.includes("--dry-run");

  if (!randomMode && (!explicitType || !BUG_CATALOG[explicitType])) {
    console.error(`Invalid bug type. Available: ${Object.keys(BUG_CATALOG).join(", ")}`);
    process.exit(1);
  }

  let type;
  let targetFile;

  if (randomMode) {
    const picked = pickRandomInjectableCandidate();

    if (!picked) {
      console.error(
        `Failed to inject bug: no injection point found in ${RANDOM_RETRY_CAP} random (type, file) candidates.`
      );
      process.exit(1);
    }

    type = picked.type;
    targetFile = picked.file;
  } else {
    const fileIdx = args.indexOf("--file");
    type = explicitType;
    targetFile = fileIdx !== -1 ? args[fileIdx + 1] : findTargetFile(type);
  }

  console.log(`Targeting file: ${targetFile} with bug type: ${type}${dryRun ? " (dry run)" : ""}`);

  if (dryRun) {
    const result = computeInjection(type, targetFile);
    console.log(
      result.injected
        ? `Dry run: would inject ${type} into ${targetFile} (no files or git state changed).`
        : `Dry run: no injection point found for ${type} in ${targetFile}.`
    );
    process.exit(result.injected ? 0 : 1);
  }

  if (injectBugIntoFile(type, targetFile)) {
    const relativePath = path.relative(ROOT, targetFile);
    const branchName = `chaos/synthetic-bug-${Date.now()}`;

    console.log(`Bug injected. Creating branch ${branchName}...`);

    commitChaosBug(execFileSync, { branchName, targetFile, type, relativePath });

    if (args.includes("--push")) {
      console.log("Pushing and creating PR...");
      execFileSync("git", ["push", "origin", branchName]);

      try {
        ghClient.pr.create(buildChaosPrArgs(type, targetFile, relativePath));
      } catch (e) {
        // #4287: this used to log and fall through, so the workflow reported
        // success while producing no PR. The 2026-08-25 run did exactly that
        // — `chaos-audit` did not exist as a repo label, `gh pr create`
        // refused, and the job went green with a pushed branch and nothing
        // for the audit loops to detect. A chaos run whose whole output is
        // the PR has not succeeded if the PR was never created.
        console.error(`gh command failed: ${e.message}`);
        process.exit(1);
      }
    }
  } else {
    console.error("Failed to inject bug.");
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
