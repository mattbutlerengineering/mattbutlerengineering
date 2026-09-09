#!/usr/bin/env node

/**
 * Fails when `updateSurfaceScore()` / `saveInventory()` go back to having
 * zero real callers.
 *
 * `packages/agent-core/src/audit-{regression-detector,inventory-store}.ts`
 * shipped both functions fully implemented and fully unit-tested — but for
 * the whole life of the `/site-audit` loop, the only things that ever
 * referenced them were the library itself and its own test files. No
 * workflow, script, or scheduled job actually called them, so
 * `.audit-state/inventory.json` was rebuilt from the static registry on
 * every run (fresh `null`/`0`/`[]` fields), and `findStalestZone()` / the
 * 3+-degrading detector never had real data to work with (#4899).
 *
 * This is a *function-level* reachability check, deliberately narrower than
 * `check-orphaned-collectors.mjs`'s whole-module reachability graph. That
 * generic check drops bare package specifiers (like `@mbe/agent-core`) from
 * its import graph on purpose — a package import can't participate in
 * in-repo edges — which is exactly the shape of this gap: the real callers
 * live in `scripts/`, one workspace package away from the library that
 * defines these functions, connected only by a bare specifier. A grep for a
 * real call expression, scoped to non-test files, is the smallest check that
 * closes it.
 *
 * Known limitation: this is a call-expression grep, not static analysis — a
 * call inside an `if (false)` branch or a shadowed local of the same name
 * would still count as "found". Acceptable here: GUARDED_CALLS is a short,
 * hand-picked allowlist, not a general dead-code detector.
 */

import { readFileSync } from "node:fs";
import { relative, sep, posix } from "node:path";

import { walkFiles, DEFAULT_IGNORE_DIRS } from "./lib/repo-scan.mjs";
import { runCheck } from "./lib/fitness-check.mjs";
import { root } from "./dep-graph-discovery.mjs";

/**
 * Functions that must have at least one real (non-test) call site under
 * `scripts/`. Each entry needs a reason naming what the function persists —
 * an allowlist entry without one is just an orphan with paperwork.
 */
export const GUARDED_CALLS = [
  {
    name: "updateSurfaceScore",
    reason: "appends a live Lighthouse/curl score into a surface's checkHistory",
  },
  {
    name: "saveInventory",
    reason: "writes the merged inventory back to .audit-state/inventory.json",
  },
];

/** Directory scanned for real call sites — the automation surface, not the library. */
export const SCAN_DIR = "scripts";

const CALLER_FILE_RE = /\.(mjs|cjs|js)$/;
const IGNORE_DIRS = new Set([...DEFAULT_IGNORE_DIRS, "build", ".next", "graphify-out"]);

/**
 * True for files the test runner owns. A test calling a guarded function
 * says nothing about whether that function runs for real — the whole point
 * of this check is to catch a function that is fully exercised by its own
 * tests and nothing else.
 *
 * @param {string} path - POSIX repo-relative path.
 */
export function isTestPath(path) {
  return path.includes("/__tests__/") || /\.test\.(js|mjs|cjs|ts|tsx)$/.test(path);
}

/**
 * Strips block and line comments so prose mentions (including this very
 * check's own JSDoc, which documents the guarded functions as
 * `updateSurfaceScore()` / `saveInventory()`) can't masquerade as call sites.
 *
 * @param {string} source
 * @returns {string}
 */
export function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

/**
 * True when `source` contains a real call expression for `fnName` — i.e.
 * `fnName(` — as opposed to merely naming it in a comment or an import
 * specifier list.
 *
 * @param {string} source
 * @param {string} fnName
 * @returns {boolean}
 */
export function callsFunction(source, fnName) {
  return new RegExp(`\\b${fnName}\\s*\\(`).test(stripComments(source));
}

/**
 * Guarded functions with no real call site among `filePaths`.
 *
 * @param {object} input
 * @param {{ name: string, reason: string }[]} input.guarded
 * @param {string[]} input.filePaths - POSIX repo-relative paths.
 * @param {(path: string) => string} input.readFile
 * @returns {{ findings: { name: string, reason: string }[] }}
 */
export function findMissingCallers({ guarded, filePaths, readFile }) {
  const candidates = filePaths.filter((p) => !isTestPath(p));

  const findings = guarded.filter(({ name }) => {
    return !candidates.some((path) => {
      let source;
      try {
        source = readFile(path);
      } catch {
        return false;
      }
      return callsFunction(source, name);
    });
  });

  return { findings: findings.map(({ name, reason }) => ({ name, reason })) };
}

export const FAIL_MESSAGE =
  "FAIL: a guarded audit-inventory persistence function has no real caller.\n" +
  "It may still have tests — but nothing under scripts/ actually invokes it,\n" +
  "so it produces nothing live. Either wire a real caller in (see\n" +
  "scripts/record-audit-check.mjs), or drop its GUARDED_CALLS entry in\n" +
  "scripts/check-audit-persistence-caller.mjs.";

/**
 * @param {{ name: string, reason: string }} finding
 * @returns {string}
 */
export function formatFinding(finding) {
  return `${finding.name} — no real caller found under ${SCAN_DIR}/ (${finding.reason})`;
}

/* c8 ignore start -- CLI entrypoint, exercised via repo-audit not unit tests */
const isMain = process.argv[1] && process.argv[1].endsWith("check-audit-persistence-caller.mjs");

if (isMain) {
  const filePaths = walkFiles(posix.join(root, SCAN_DIR), {
    ignoreDirs: IGNORE_DIRS,
    match: (name) => CALLER_FILE_RE.test(name),
  }).map((file) => relative(root, file).split(sep).join("/"));

  const { findings } = findMissingCallers({
    guarded: GUARDED_CALLS,
    filePaths,
    readFile: (p) => readFileSync(posix.join(root, p), "utf-8"),
  });

  process.exit(
    runCheck({
      name: "audit-inventory persistence callers",
      findings,
      formatFinding,
      passMessage: `PASS: all ${GUARDED_CALLS.length} guarded persistence function(s) have a real caller`,
      failMessage: FAIL_MESSAGE,
    })
  );
}
/* c8 ignore stop */
