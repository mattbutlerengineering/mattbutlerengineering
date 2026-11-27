#!/usr/bin/env node

/**
 * e2e-changed-suites.mjs - which advisory E2E suites a branch's diff un-skips
 * (#10025).
 *
 * `e2e.yml` no longer runs on `pull_request` (it starts after `CI Gate` passes,
 * via `e2e-after-ci.yml`), so the `changes` job has no PR event for
 * `dorny/paths-filter` to read. It diffs the dispatched ref against `main`
 * instead, three-dot like a PR's "Files changed" tab, and a pure matcher here
 * turns the paths into per-suite booleans. Keeps #9834's reasoning: a suite
 * outside the diff is skipped, never left unreported (the workflow publishes a
 * `success: skipped` commit status for it).
 *
 * An entry ending in "/" is a directory prefix; any other entry is an exact file.
 *
 * Usage (prints `<suite>=true|false` lines for $GITHUB_OUTPUT):
 *   node scripts/e2e-changed-suites.mjs diff
 *   node scripts/e2e-changed-suites.mjs all
 */

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SELF_WORKFLOWS = [".github/workflows/e2e.yml", ".github/workflows/e2e-after-ci.yml"];

/**
 * Per-suite path sets. Helper scripts run inside the hospitality job, so a
 * change to them must un-skip that suite.
 */
export const E2E_SUITE_FILTERS = Object.freeze({
  hospitality: Object.freeze([
    "apps/hospitality/",
    "packages/rialto/",
    "services/reservations/",
    "services/users/",
    "packages/database/",
    ...SELF_WORKFLOWS,
    "scripts/e2e-auth-preflight.mjs",
    "scripts/e2e-failure-rate.mjs",
    "scripts/e2e-cross-branch-red.mjs",
    "scripts/e2e-changed-suites.mjs",
    "scripts/e2e-commit-status.mjs",
    "scripts/check-endpoint.mjs",
  ]),
  marketing: Object.freeze(["apps/marketing/", "packages/rialto/", ...SELF_WORKFLOWS]),
  gen: Object.freeze([
    "apps/gen/",
    "packages/rialto/",
    "packages/rialto-catalog/",
    "packages/api-client/",
    "packages/auth/",
    ...SELF_WORKFLOWS,
  ]),
});

const SUITES = Object.keys(E2E_SUITE_FILTERS);

function matches(path, entry) {
  return entry.endsWith("/") ? path.startsWith(entry) : path === entry;
}

/**
 * @param {string[]} changedPaths
 * @returns {{ hospitality: boolean, marketing: boolean, gen: boolean }}
 */
export function suitesForPaths(changedPaths) {
  return Object.fromEntries(
    SUITES.map((suite) => [
      suite,
      changedPaths.some((path) => E2E_SUITE_FILTERS[suite].some((e) => matches(path, e))),
    ])
  );
}

function formatOutputs(result) {
  return SUITES.map((suite) => `${suite}=${result[suite]}`).join("\n");
}

function changedPathsAgainstMain() {
  return execFileSync("git", ["diff", "--name-only", "origin/main...HEAD"], {
    encoding: "utf-8",
  })
    .split("\n")
    .filter(Boolean);
}

function main() {
  const [subcommand] = process.argv.slice(2);
  if (subcommand === "all") {
    process.stdout.write(`${formatOutputs(Object.fromEntries(SUITES.map((s) => [s, true])))}\n`);
    return;
  }
  if (subcommand === "diff") {
    process.stdout.write(`${formatOutputs(suitesForPaths(changedPathsAgainstMain()))}\n`);
    return;
  }
  console.error("Usage: e2e-changed-suites.mjs diff | all");
  process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
