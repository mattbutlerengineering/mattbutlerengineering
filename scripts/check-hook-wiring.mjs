#!/usr/bin/env node

/**
 * Architecture fitness test: every file in .claude/hooks/ must be reachable
 * from somewhere that actually executes it, or be explicitly allowlisted.
 *
 * A hook that sits in the tree unreferenced is worse than a missing one —
 * reviewers and agents read the file, see it exists, and assume the
 * protection is active. #3607 found `.claude/hooks/verify-push-sha.sh` in
 * exactly this state: complete, executable, and self-describing as "Wired
 * via .claude/settings.json PostToolUse Bash matcher", while never once
 * appearing in settings.json (fixed in #3605). This check makes that class
 * of bug fail CI instead of sitting silent.
 *
 * A hook counts as wired if it is referenced (by filename) in:
 *   1. .claude/settings.json — the normal case (a hooks.<Event> entry runs it)
 *   2. Any .github/workflows/*.yml file — some hooks are invoked from CI
 *      instead of the Claude Code harness
 *   3. Another .claude/hooks/* script — helper modules imported by a wired hook
 *   4. ALLOWLIST below — for hooks intentionally not wired anywhere, with a
 *      one-line reason
 *
 * Matching is path-bounded: a hook counts as wired only if its haystack
 * contains the literal `.claude/hooks/<filename>` (the prefix every real
 * invocation uses — `bash "$CLAUDE_PROJECT_DIR/.claude/hooks/foo.sh"`,
 * `bash .claude/hooks/foo.sh`, `import ... from ".claude/hooks/foo.mjs"`),
 * not a bare filename substring search. Bare substring search produces false
 * negatives: `"archive.sh"` is a substring of the wired `"session-archive.sh"`,
 * so an actually-orphaned `archive.sh` would silently pass. `#`/`//`
 * comment-only lines are stripped first so a workflow or sibling hook that
 * merely *mentions* a hook's filename in prose (explaining what it does
 * elsewhere, e.g. documenting a failure mode) doesn't count as "wiring" —
 * which is exactly the false confidence this check exists to remove. Real
 * invocations are never comment-only lines, so stripping them costs no true
 * positives.
 *
 * Usage: node scripts/check-hook-wiring.mjs
 * Exit code: 0 if every hook is referenced somewhere, 1 otherwise
 */

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runCheck } from "./lib/fitness-check.mjs";

const DEFAULT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Hooks intentionally not referenced from settings.json, a workflow, or
 * another hook script. Key: hook filename. Value: one-line reason.
 */
export const ALLOWLIST = {};

const REMEDIES = [
  "Be wired in .claude/settings.json (a hooks.<Event> entry that runs it)",
  "Be invoked from a .github/workflows/*.yml file or another .claude/hooks/* script",
  "Be listed in ALLOWLIST (scripts/check-hook-wiring.mjs) with a one-line reason",
];

function readSafe(path) {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return "";
  }
}

/** Drops comment-only lines so a prose mention doesn't count as wiring. */
function stripCommentLines(text) {
  return text
    .split("\n")
    .filter((line) => {
      const trimmed = line.trimStart();
      return !(trimmed.startsWith("#") || trimmed.startsWith("//"));
    })
    .join("\n");
}

function workflowsText(root) {
  const dir = join(root, ".github", "workflows");
  if (!existsSync(dir)) return "";
  return readdirSync(dir)
    .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
    .map((f) => stripCommentLines(readSafe(join(dir, f))))
    .join("\n");
}

/**
 * True if `text` contains a real reference to hook `file` — the literal
 * `.claude/hooks/<file>` path, not a bare filename substring. Bare substring
 * search false-passes e.g. "archive.sh" against the wired "session-archive.sh".
 */
function references(text, file) {
  return text.includes(`.claude/hooks/${file}`);
}

/** Pure check — returns filenames of orphaned hooks, never logs or exits. */
export function findOrphanedHooks(root = DEFAULT_ROOT, allowlist = ALLOWLIST) {
  const hooksDir = join(root, ".claude", "hooks");
  if (!existsSync(hooksDir)) return [];

  const hookFiles = readdirSync(hooksDir).filter((f) => statSync(join(hooksDir, f)).isFile());
  const settingsText = readSafe(join(root, ".claude", "settings.json"));
  const workflowsHaystack = workflowsText(root);
  const hookTexts = new Map(
    hookFiles.map((f) => [f, stripCommentLines(readSafe(join(hooksDir, f)))])
  );

  return hookFiles.filter((file) => {
    if (file in allowlist) return false;
    if (references(settingsText, file)) return false;
    if (references(workflowsHaystack, file)) return false;

    return ![...hookTexts.entries()].some(
      ([other, text]) => other !== file && references(text, file)
    );
  });
}

export const formatOrphanFinding = (file) => `.claude/hooks/${file}`;

export function buildFailMessage(findings) {
  return [
    `FAIL: ${findings.length} hook(s) in .claude/hooks/ are never referenced anywhere. Each one must satisfy ONE of:`,
    ...REMEDIES.map((remedy, i) => `  ${i + 1}. ${remedy}`),
    "Offending hook(s):",
  ].join("\n");
}

const isMain = process.argv[1] && process.argv[1].endsWith("check-hook-wiring.mjs");

if (isMain) {
  const findings = findOrphanedHooks();

  const exitCode = runCheck({
    name: "Hook wiring",
    findings,
    formatFinding: formatOrphanFinding,
    passMessage:
      "PASS: Every file in .claude/hooks/ is referenced from settings.json, a workflow, another hook, or the allowlist.",
    failMessage: buildFailMessage(findings),
  });
  process.exit(exitCode);
}
