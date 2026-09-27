#!/usr/bin/env node

/**
 * Fails when a real pnpm workspace package directory is not covered by
 * `check:boundaries`'s depcruise scan args in package.json.
 *
 * `check:boundaries` (`.dependency-cruiser.cjs`) is the CI-enforced import
 * layering gate, but its scan args are a hand-maintained list of directories
 * rather than something derived from pnpm-workspace.yaml. #5491 found
 * `infrastructure/worker` missing from that list; this check exists so the
 * next new/renamed workspace package (or the three already missing —
 * `plugins/`, `scripts/`, `infrastructure/pulumi`, closed by #5790) can't
 * silently reopen the same gap a third time. A workspace package outside the
 * scan args passes CI's Architecture Audit job with zero boundary
 * enforcement and is indistinguishable from a covered one — not a diff, not
 * a lint rule, nothing else catches it.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { discoverWorkspaceGlobs, resolveGlob, root } from "./dep-graph-discovery.mjs";
import { runCheck } from "./lib/fitness-check.mjs";

export const BOUNDARIES_SCRIPT_NAME = "check:boundaries";

/**
 * Parse the positional depcruise path args out of package.json's
 * `check:boundaries` script — everything between `depcruise` and the first
 * flag (e.g. `--config`).
 *
 * @param {{ scripts?: Record<string, string> }} pkg
 * @returns {string[]}
 */
export function parseBoundariesScanArgs(pkg) {
  const script = pkg.scripts?.[BOUNDARIES_SCRIPT_NAME];
  if (!script) {
    throw new Error(`package.json has no "${BOUNDARIES_SCRIPT_NAME}" script`);
  }

  const tokens = script.trim().split(/\s+/);
  const depcruiseIdx = tokens.indexOf("depcruise");
  if (depcruiseIdx === -1) {
    throw new Error(`"${BOUNDARIES_SCRIPT_NAME}" script does not invoke depcruise`);
  }

  const args = [];
  for (const token of tokens.slice(depcruiseIdx + 1)) {
    if (token.startsWith("-")) break;
    args.push(token);
  }
  return args;
}

/** True when `scanArg` covers `dir` — an exact match or a real path prefix. */
function isCovered(dir, scanArg) {
  return dir === scanArg || dir.startsWith(`${scanArg}/`);
}

/**
 * @param {{ workspaceDirs: string[]; scanArgs: string[] }} input
 * @returns {string[]} workspace dirs covered by no scan arg, sorted
 */
export function findUncoveredWorkspaceDirs({ workspaceDirs, scanArgs }) {
  return workspaceDirs.filter((dir) => !scanArgs.some((arg) => isCovered(dir, arg))).sort();
}

/** @param {string} dir @returns {string} */
export function formatFinding(dir) {
  return `${dir} — not scanned by check:boundaries' depcruise args`;
}

export const FAIL_MESSAGE =
  "FAIL: check:boundaries' depcruise scan args don't cover every workspace package.\n" +
  "Add the missing path(s) to the check:boundaries script in package.json — see\n" +
  "scripts/check-boundaries-coverage.mjs.";

/* c8 ignore start -- CLI entrypoint, exercised via repo-audit not unit tests */
const isMain = process.argv[1] && process.argv[1].endsWith("check-boundaries-coverage.mjs");

if (isMain) {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf-8"));
  const scanArgs = parseBoundariesScanArgs(pkg);
  const workspaceDirs = discoverWorkspaceGlobs(root).flatMap((glob) =>
    resolveGlob(glob, root).map(({ wsDir }) => wsDir)
  );

  const findings = findUncoveredWorkspaceDirs({ workspaceDirs, scanArgs });

  process.exit(
    runCheck({
      name: "boundaries scan coverage",
      findings,
      formatFinding,
      passMessage: "PASS: Every workspace package directory is covered by check:boundaries.",
      failMessage: FAIL_MESSAGE,
    })
  );
}
/* c8 ignore stop */
