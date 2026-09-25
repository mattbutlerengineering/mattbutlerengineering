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
 * as inert as everything else `.husky/_` would run. The caller that
 * actually runs in the broken state is `.claude/hooks/pre-bash-guard.sh`, a
 * Claude Code PreToolUse hook wired via `.claude/settings.json` — a
 * mechanism that runs through the harness itself, entirely independent of
 * git's `core.hooksPath`, and therefore fires whether or not `pnpm install`
 * has ever run.
 *
 * This is also wired into `pnpm repo-audit` (REPO_AUDIT_CHECKS), but that
 * wiring is NOT a second line of coverage for the same gap: CI always runs
 * a normal `pnpm install` (which creates `.husky/_`) before `repo-audit`
 * runs, so in a CI job this check can only ever report healthy. The only
 * way the repo-audit caller observes the inert state at all is a local
 * `pnpm install --ignore-scripts` (skips husky's `prepare` step) followed
 * by `pnpm repo-audit` in that same checkout — it documents that one
 * narrower case, not a general backstop for #5766.
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
 * Two output modes, both exit 0 always:
 *
 *   node scripts/check-hooks-active.mjs
 *     Plain text: "PASS: ..." to stdout when healthy, a "⚠️ ..." warning to
 *     stderr when inert. Used by `pnpm repo-audit`.
 *
 *   node scripts/check-hooks-active.mjs --hook-json
 *     Silent (no stdout) when healthy. When inert, writes ONE line of JSON
 *     to stdout and nothing else — the Claude Code PreToolUse output
 *     contract — built with `JSON.stringify`, never hand-escaped:
 *       {"systemMessage":"<msg>","hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":"<msg>"}}
 *     `additionalContext` reaches the model, `systemMessage` reaches the
 *     user. This mode exists because a PreToolUse hook that exits 0 shows
 *     NEITHER stdout nor stderr to the user in Claude Code (2.1.282) — the
 *     plain-text stderr warning above is invisible there, which was exactly
 *     #5766's original failure mode reproduced one layer up. Used by
 *     .claude/hooks/pre-bash-guard.sh's Check 3.
 */

import { existsSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { isAbsolute, join } from "node:path";

/**
 * Hook filenames husky writes for a git hook it actually installed. A
 * directory can be non-empty and still fire nothing — husky's shared `h`
 * helper and its own `.gitignore` are always written, hook or no hook — so
 * "populated" requires at least one of these, not just a non-empty listing.
 */
const REAL_HOOK_FILES = ["pre-commit", "pre-push"];

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
 * @returns {{ status: "unset"|"missing"|"empty"|"no-hook-files"|"populated", inert: boolean }}
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
  if (!entries.some((entry) => REAL_HOOK_FILES.includes(entry))) {
    return { status: "no-hook-files", inert: true };
  }
  return { status: "populated", inert: false };
}

const REASONS = {
  unset: "git config core.hooksPath is not set — this checkout has never run `pnpm install`",
  missing: "git config core.hooksPath points at a directory that does not exist",
  empty: "git config core.hooksPath points at an empty directory",
  "no-hook-files":
    "git config core.hooksPath points at a directory with no pre-commit or pre-push hook file (only husky's own internal files are present)",
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

/**
 * Builds the Claude Code PreToolUse JSON output for an inert-hooks warning
 * — pure, no serialization. The CLI entry point is the only thing that
 * calls `JSON.stringify` on it, so escaping is never hand-rolled.
 *
 * `additionalContext` reaches the model; `systemMessage` reaches the user
 * (Claude Code 2.1.282 shows neither stdout nor stderr for a PreToolUse
 * hook that exits 0, so this is the only way the warning becomes visible).
 *
 * @param {string} message
 * @returns {{ systemMessage: string, hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: string } }}
 */
export function buildHookJsonOutput(message) {
  return {
    systemMessage: message,
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      additionalContext: message,
    },
  };
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
  const hookJsonMode = process.argv.includes("--hook-json");
  const root = resolveRepoRoot();
  const hooksPath = resolveHooksPath(root);
  const { dirExists, entries } = readHooksDirState(root, hooksPath);
  const classification = classifyHooksActivation({ hooksPath, dirExists, entries });
  const message = formatHooksStatusMessage(classification);

  if (hookJsonMode) {
    // Healthy: write nothing to stdout. Inert: exactly one line of JSON,
    // the only stdout this mode ever produces — see the file header for
    // why (the Claude Code PreToolUse output contract).
    if (message) {
      process.stdout.write(`${JSON.stringify(buildHookJsonOutput(message))}\n`);
    }
    process.exit(0);
  }

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
