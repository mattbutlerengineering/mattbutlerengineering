#!/usr/bin/env node

/**
 * agent-core-build-freshness.mjs — detect a stale `packages/agent-core/dist`
 * before trusting `isLowRiskPR`/`reviewersForDiff` for PR-risk classification
 * (#3989).
 *
 * `/implement-queue` Phase 2 imports both functions from the **built**
 * `packages/agent-core/dist/`, which is gitignored — whatever a session
 * finds on disk is whatever the last build in that checkout produced,
 * arbitrarily old. On PR #3988, `reviewersForDiff([...])` returned `[]`
 * from a dist that predated the `e2e-selector-drift-reviewer` mapping in
 * `pr-risk-classifier.ts` by 77 minutes — no error, no log line, just a
 * confident, wrong answer. That is distinct from the documented `mbe pack` /
 * `ERR_MODULE_NOT_FOUND` gotcha, which fails LOUDLY on a *missing* dist;
 * this fails SILENTLY on a *stale* one.
 *
 * `classifyBuildFreshness` is the pure decision: given the newest mtime
 * under `packages/agent-core/src/**` and the newest mtime under
 * `packages/agent-core/dist/**`, decide whether the dist can be trusted.
 * `ensureFreshAgentCoreBuild` is the thin wrapper the orchestrator calls —
 * it rebuilds once when the dist looks untrustworthy and re-checks, but
 * NEVER reports `trusted: true` on a hunch; if the dist still can't be
 * proven fresh after a rebuild attempt, the caller must treat the PR as
 * needing full review (never the low-risk fast path).
 *
 * Usage (implement-queue Phase 2, before the first classifier call):
 *   node scripts/agent-core-build-freshness.mjs check
 *   # exit 0 + {"trusted":true,...}  -> safe to call isLowRiskPR/reviewersForDiff
 *   # exit 1 + {"trusted":false,...} -> fail closed: full review, do not
 *   #                                   trust a "low risk" or "[]" result
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

export const DEFAULT_SRC_DIR = path.join(ROOT, "packages/agent-core/src");
export const DEFAULT_DIST_DIR = path.join(ROOT, "packages/agent-core/dist");

// ---------------------------------------------------------------------------
// Pure logic — no side effects below this section boundary comment.
// ---------------------------------------------------------------------------

/**
 * Pure: given the newest mtime (ms since epoch) under `packages/agent-core/
 * src/**` and under `packages/agent-core/dist/**`, decide whether the dist
 * is trustworthy for PR-risk classification.
 *
 * Fails closed (`trusted: false`) in every case that isn't a clean "dist is
 * at least as new as every src file": a missing dist (fresh worktree, never
 * built — `state: "missing"`), a stale dist (`state: "stale"`), or an
 * undeterminable src mtime (`state: "unknown"` — never trust an existing
 * dist just because we couldn't prove it stale). Equal mtimes count as
 * fresh, not stale — a build that ran in the same tick as the last source
 * edit is not evidence of drift.
 *
 * @param {{newestSrcMtimeMs: number|null, newestDistMtimeMs: number|null}} input
 * @returns {{trusted: boolean, state: "fresh"|"stale"|"missing"|"unknown", reason: string}}
 */
export function classifyBuildFreshness({ newestSrcMtimeMs, newestDistMtimeMs }) {
  if (newestDistMtimeMs == null) {
    return {
      trusted: false,
      state: "missing",
      reason:
        "packages/agent-core/dist has no build output (fresh worktree or never built) — build before classifying",
    };
  }

  if (newestSrcMtimeMs == null) {
    return {
      trusted: false,
      state: "unknown",
      reason: "could not determine newest packages/agent-core/src mtime — failing closed",
    };
  }

  if (newestSrcMtimeMs > newestDistMtimeMs) {
    return {
      trusted: false,
      state: "stale",
      reason: `src/** modified at ${new Date(newestSrcMtimeMs).toISOString()}, after dist was built at ${new Date(newestDistMtimeMs).toISOString()} — rebuild before classifying`,
    };
  }

  return {
    trusted: true,
    state: "fresh",
    reason: "dist is newer than or equal to every src file",
  };
}

// ---------------------------------------------------------------------------
// Side-effecting helpers — take injectable fs functions (default to real
// `node:fs`) so the logic above stays testable without real files.
// ---------------------------------------------------------------------------

/**
 * Side effect: the newest mtime (ms since epoch) of any file under
 * `dirPath`, or `null` if the directory doesn't exist, is unreadable, or is
 * empty. Depth-first walk, mirroring `hasRecentFileActivity` in
 * `reap-worktrees.mjs`. Never throws — an unreadable subtree is skipped,
 * not treated as a signal either way.
 *
 * @param {string} dirPath
 * @param {{readdirSync?: Function, statSync?: Function}} [opts]
 * @returns {number|null}
 */
export function newestMtimeMsUnder(
  dirPath,
  { readdirSync = fs.readdirSync, statSync = fs.statSync } = {}
) {
  let rootEntries;
  try {
    rootEntries = readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return null;
  }

  let newest = null;
  const stack = [{ dir: dirPath, entries: rootEntries }];
  while (stack.length > 0) {
    const { dir, entries } = stack.pop();
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        try {
          stack.push({ dir: full, entries: readdirSync(full, { withFileTypes: true }) });
        } catch {
          // Subtree vanished or unreadable mid-scan — no signal either way.
        }
      } else if (entry.isFile()) {
        try {
          const { mtimeMs } = statSync(full);
          if (newest === null || mtimeMs > newest) newest = mtimeMs;
        } catch {
          // File vanished mid-scan — no signal either way.
        }
      }
    }
  }
  return newest;
}

/**
 * Side effect: computes `classifyBuildFreshness` for real (or injected)
 * source/dist directories.
 *
 * @param {{srcDir?: string, distDir?: string, readdirSync?: Function, statSync?: Function}} [opts]
 * @returns {{trusted: boolean, state: string, reason: string, newestSrcMtimeMs: number|null, newestDistMtimeMs: number|null}}
 */
export function assessAgentCoreBuildFreshness({
  srcDir = DEFAULT_SRC_DIR,
  distDir = DEFAULT_DIST_DIR,
  readdirSync,
  statSync,
} = {}) {
  const newestSrcMtimeMs = newestMtimeMsUnder(srcDir, { readdirSync, statSync });
  const newestDistMtimeMs = newestMtimeMsUnder(distDir, { readdirSync, statSync });
  return {
    ...classifyBuildFreshness({ newestSrcMtimeMs, newestDistMtimeMs }),
    newestSrcMtimeMs,
    newestDistMtimeMs,
  };
}

/**
 * Side effect: the thin wrapper the orchestrator calls. Assesses freshness;
 * if untrustworthy, attempts exactly one rebuild (`pnpm build --filter
 * @mbe/agent-core...`) and re-assesses. Never throws — a failed rebuild
 * (build error, missing pnpm, etc.) is reported as `trusted: false` with
 * `rebuildSucceeded: false`, not propagated as an exception, so a caller
 * that forgets a try/catch still fails closed instead of crashing.
 *
 * @param {{srcDir?: string, distDir?: string, exec?: Function}} [opts]
 * @returns {{trusted: boolean, state: string, reason: string, rebuildAttempted: boolean, rebuildSucceeded: boolean|null}}
 */
export function ensureFreshAgentCoreBuild({
  srcDir = DEFAULT_SRC_DIR,
  distDir = DEFAULT_DIST_DIR,
  exec = execFileSync,
} = {}) {
  const initial = assessAgentCoreBuildFreshness({ srcDir, distDir });
  if (initial.trusted) {
    return { ...initial, rebuildAttempted: false, rebuildSucceeded: null };
  }

  let rebuildSucceeded;
  try {
    exec("pnpm", ["build", "--filter", "@mbe/agent-core..."], { cwd: ROOT, stdio: "inherit" });
    rebuildSucceeded = true;
  } catch {
    rebuildSucceeded = false;
  }

  if (!rebuildSucceeded) {
    return { ...initial, rebuildAttempted: true, rebuildSucceeded: false };
  }

  const rechecked = assessAgentCoreBuildFreshness({ srcDir, distDir });
  return { ...rechecked, rebuildAttempted: true, rebuildSucceeded: true };
}

// ---------------------------------------------------------------------------
// CLI entry point.
// ---------------------------------------------------------------------------

function run() {
  if (process.argv[2] !== "check") {
    console.error("Usage: agent-core-build-freshness.mjs check");
    process.exit(1);
  }
  const result = ensureFreshAgentCoreBuild();
  console.log(JSON.stringify(result));
  process.exit(result.trusted ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run();
}
