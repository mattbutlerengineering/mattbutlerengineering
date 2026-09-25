#!/usr/bin/env node

/**
 * Detects when git hooks are silently inert because `pnpm install` has
 * never run (#5766).
 *
 * `core.hooksPath` is `.husky/_`, a husky-generated, gitignored directory
 * created only by the root `prepare: husky` script — i.e. only by `pnpm
 * install`. Git treats a missing (or empty) hooks directory as "no hooks",
 * not as an error, and prints nothing. A checkout that skipped `pnpm
 * install` therefore has every local gate (pre-commit lint/check-adr,
 * pre-push migration/antipattern/regen checks, post-commit llms regen)
 * disabled with zero signal — a commit made in that state is
 * indistinguishable from one where every gate passed.
 *
 * A git hook cannot report this itself: in the broken state it is exactly
 * as inert as everything else `.husky/_` would run. So this check is
 * invoked from `.claude/hooks/pre-bash-guard.sh`, a Claude Code PreToolUse
 * hook wired via `.claude/settings.json` — a mechanism that runs through
 * the harness itself, entirely independent of git's `core.hooksPath`, and
 * therefore fires whether or not `pnpm install` has ever run. It is also
 * wired into `pnpm repo-audit` (REPO_AUDIT_CHECKS) so CI documents the
 * state of its own checkout, even though CI always installs first.
 *
 * Severity is a deliberate WARN, never a hard failure: `process.exit(0)`
 * unconditionally, in both the CLI entry point and the pre-bash-guard
 * caller. A hard block would break legitimate no-install flows (shallow CI
 * checkouts, docs-only edits, a first command run before step 0 of the
 * implement-queue-worker protocol) — see the acceptance criteria on #5766.
 * CI's own independent jobs (lint, check-adr, antipattern ratchet, regen)
 * remain the real backstop regardless of local hook state; this only makes
 * the otherwise-silent gap visible before push, cheaper than a CI round trip.
 *
 * Usage: node scripts/check-hooks-active.mjs
 * Exit code: always 0 (warning-only, see above).
 */

import { existsSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { isAbsolute, join } from "node:path";

/**
 * Pure classification of git hook activation state — no I/O.
 *
 * @param {object} input
 * @param {string|null|undefined} input.hooksPath - `git config core.hooksPath`
 *   value, or a falsy value when unset.
 * @param {boolean} input.dirExists - whether the resolved hooksPath
 *   directory exists on disk. Ignored when hooksPath is falsy.
 * @param {string[]} input.entries - directory listing of hooksPath. Ignored
 *   when dirExists is false.
 * @returns {{ status: "unset"|"missing"|"empty"|"populated", inert: boolean }}
 */
export function classifyHooksActivation({ hooksPath, dirExists, entries }) {
  if (!hooksPath) {
    return { status: "unset", inert: true };
  }
  if (!dirExists) {
    return { status: "missing", inert: true };
  }
  if (!entries || entries.length === 0) {
    return { status: "empty", inert: true };
  }
  return { status: "populated", inert: false };
}

const REASONS = {
  unset: "git config core.hooksPath is not set — this checkout has never run `pnpm install`",
  missing: "git config core.hooksPath points at a directory that does not exist",
  empty: "git config core.hooksPath points at an empty directory",
};

/**
 * Renders a classification as a human-facing warning naming the fix, or
 * `null` when the classification is healthy (nothing to say).
 *
 * @param {{ status: string, inert: boolean }} classification
 * @returns {string|null}
 */
export function formatHooksStatusMessage(classification) {
  if (!classification.inert) return null;
  return (
    `⚠️  Git hooks are inert — ${REASONS[classification.status]}. ` +
    "Run 'pnpm install' to activate pre-commit/pre-push checks (lint, check-adr, " +
    "antipattern ratchet, regen). Until then, commits and pushes will NOT run local " +
    "gates — CI is the only backstop."
  );
}

/* c8 ignore start -- CLI entrypoint, exercised by running the script itself */
function resolveHooksPath(root) {
  const result = spawnSync("git", ["config", "core.hooksPath"], {
    cwd: root,
    encoding: "utf-8",
  });
  const raw = result.status === 0 ? result.stdout.trim() : "";
  return raw || null;
}

function readHooksDirState(root, hooksPath) {
  if (!hooksPath) return { dirExists: false, entries: [] };
  const resolved = isAbsolute(hooksPath) ? hooksPath : join(root, hooksPath);
  if (!existsSync(resolved)) return { dirExists: false, entries: [] };
  try {
    return { dirExists: true, entries: readdirSync(resolved) };
  } catch {
    return { dirExists: true, entries: [] };
  }
}

function resolveRepoRoot() {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf-8" });
  return result.status === 0 ? result.stdout.trim() : process.cwd();
}

// `.endsWith(...)` rather than a strict `fileURLToPath(import.meta.url)`
// comparison: this script is invoked through a symlinked `scripts/` dir in
// the .claude/hooks/pre-bash-guard.sh seam tests, and Node's ESM loader
// realpaths `import.meta.url` while `process.argv[1]` keeps the invoked
// (symlinked) path — a strict equality check silently never matches there.
const isMain = process.argv[1] && process.argv[1].endsWith("check-hooks-active.mjs");

if (isMain) {
  const root = resolveRepoRoot();
  const hooksPath = resolveHooksPath(root);
  const { dirExists, entries } = readHooksDirState(root, hooksPath);
  const classification = classifyHooksActivation({ hooksPath, dirExists, entries });
  const message = formatHooksStatusMessage(classification);

  if (message) {
    console.warn(message);
  } else {
    // process.stdout.write, not console.log — keeps this script off the
    // consoleLogs antipattern ratchet's baseline (scripts/check-ai-antipatterns.mjs),
    // matching scripts/run-repo-audit.mjs's own PASS/summary output.
    process.stdout.write(`PASS: git hooks are active (${classification.status}).\n`);
  }
  // Always 0 — see the severity note in the file header.
  process.exit(0);
}
/* c8 ignore stop */
