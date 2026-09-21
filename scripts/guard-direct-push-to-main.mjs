#!/usr/bin/env node

/**
 * guard-direct-push-to-main.mjs — refuse a push whose destination ref is a
 * protected branch, from `.husky/pre-push` (#4664).
 *
 * Commit `7d259272a` landed on `main` carrying a prettier violation in
 * `docs/backlog.md`, with NO `push` or `pull_request` workflow run recorded
 * against its SHA. It was authored by the personal `mattbutlerengineering`
 * identity, so this is explicitly NOT the documented `GITHUB_TOKEN`
 * anti-recursion trap (`.claude/rules/gotchas.md` § CI), which requires a
 * `github-actions[bot]` author. The consistent explanation is a session that
 * ran `git push origin HEAD:main` instead of opening a PR. `pnpm
 * check:prettier` — the first step of `pnpm repo-audit`, which the CI Build
 * job runs — then failed on `main` for 4+ hours, reddening the Build job of
 * every PR opened or updated in that window (three of that evening's worker
 * PRs each needed an extra `update-branch` cycle, plus a whole ci-fix PR to
 * recover).
 *
 * The decision is pure and testable without git: git's pre-push hook hands
 * the refs being pushed on STDIN as
 *
 *     <local ref> SP <local sha> SP <remote ref> SP <remote sha> LF
 *
 * one line per ref. The destination therefore lives in field 2 — parsing the
 * push *command line* would be both unreliable and unnecessary, and would
 * miss `git push` with an upstream configured (no ref named at all).
 *
 * Two consequences of reading the destination rather than the flags:
 *   - A force push presents an identical stdin shape (no flag is passed to
 *     the hook), so `--force`/`--force-with-lease` to main is caught for free.
 *   - A deletion arrives as `(delete) <zeros> refs/heads/main <sha>`, so
 *     `git push origin :main` is caught for free too.
 *
 * Measured against git 2.50.1 by capturing the hook's real stdin:
 *   - `git push <remote> HEAD:main` delivers exactly
 *     `HEAD <sha> refs/heads/main 0000…0\n`.
 *   - `git push --dry-run` runs the hook with EMPTY stdin. A dry run pushes
 *     nothing, so empty stdin allows — refusing it would block a no-op. It
 *     also means a dry run is not a valid way to exercise this guard.
 *
 * Direction of failure, deliberately asymmetric:
 *   - Unparseable line  -> BLOCK. Git's format is fixed; a line with fewer
 *     than four fields means the destination cannot be proven, and refusing
 *     an anomaly costs nothing on the normal path (which is always parseable).
 *   - Destination is clearly not a protected branch -> ALLOW. Ordinary
 *     feature-branch pushes must never be blocked, or the guard gets
 *     `--no-verify`'d into irrelevance.
 *
 * Repo policy explicitly authorizes security fixes pushed straight to main,
 * so the refusal is overridable — deliberately, greppably, and per-command:
 *
 *     ALLOW_DIRECT_MAIN_PUSH=1 git push origin main
 *
 * Usage (reads the pre-push payload on stdin):
 *   node scripts/guard-direct-push-to-main.mjs check
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Branches a push may not target without an explicit override. */
export const PROTECTED_BRANCHES = ["main"];

/** The documented, greppable escape hatch named in every refusal. */
export const OVERRIDE_ENV_VAR = "ALLOW_DIRECT_MAIN_PUSH";

/** Local ref git substitutes when the push deletes the remote ref. */
const DELETE_LOCAL_REF = "(delete)";

/**
 * Values that read as "not set". Anything else enables the override — the
 * variable exists to be opted into, so an unrecognized value means the user
 * typed it on purpose.
 *
 * @param {string} [value]
 * @returns {boolean}
 */
export function isOverrideEnabled(value) {
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized !== "" && normalized !== "0" && normalized !== "false";
}

/**
 * Resolve a remote ref to the branch it writes, or `null` when it is not a
 * branch at all (a tag, a note, any other `refs/*` namespace).
 *
 * A bare `main` with no `refs/` prefix counts as a branch: git normally
 * fully qualifies the remote ref, but accepting the short form costs nothing
 * and closes a guess about when it might not.
 *
 * @param {string} remoteRef
 * @returns {string|null}
 */
function branchFromRemoteRef(remoteRef) {
  if (remoteRef.startsWith("refs/heads/")) return remoteRef.slice("refs/heads/".length);
  if (remoteRef.startsWith("refs/")) return null;
  return remoteRef;
}

/**
 * Pure classifier: given the raw pre-push stdin payload, decide whether the
 * push may proceed.
 *
 * Never throws — a non-string payload degrades to "nothing to push", which
 * is the correct reading (git only invokes the hook when there is something
 * to push, and an unreadable stdin proves no protected destination).
 *
 * @param {string} [stdin] - raw pre-push payload.
 * @param {{ override?: string }} [opts] - `override` is the raw env value.
 * @returns {{ decision: "allow"|"block", reason: string, blockedRefs: string[] }}
 */
export function classifyPushTarget(stdin, opts = {}) {
  if (isOverrideEnabled(opts.override)) {
    return {
      decision: "allow",
      reason: `${OVERRIDE_ENV_VAR} is set — direct push to a protected branch explicitly authorized`,
      blockedRefs: [],
    };
  }

  const lines = (typeof stdin === "string" ? stdin : "")
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);

  const unparseable = [];
  const blockedRefs = [];
  let deleting = false;

  for (const entry of lines) {
    const fields = entry.split(/\s+/);
    // Ref names cannot contain whitespace, so field 2 is the remote ref even
    // if a future git appends fields. Only a short line is truly unreadable.
    if (fields.length < 4) {
      unparseable.push(entry);
      continue;
    }

    const [localRef, , remoteRef] = fields;
    const branch = branchFromRemoteRef(remoteRef);
    if (branch !== null && PROTECTED_BRANCHES.includes(branch)) {
      blockedRefs.push(remoteRef);
      if (localRef === DELETE_LOCAL_REF) deleting = true;
    }
  }

  if (blockedRefs.length > 0) {
    const verb = deleting ? "delete" : "update";
    return {
      decision: "block",
      reason: `this push would ${verb} ${blockedRefs.join(", ")} directly, bypassing PR review and pull_request CI`,
      blockedRefs,
    };
  }

  if (unparseable.length > 0) {
    return {
      decision: "block",
      reason:
        `could not parse the pre-push payload, so the destination cannot be proven ` +
        `not to be a protected branch: ${JSON.stringify(unparseable[0])}`,
      blockedRefs: [],
    };
  }

  return {
    decision: "allow",
    reason: "no protected branch among the push destinations",
    blockedRefs: [],
  };
}

/**
 * The operator-facing refusal. Says what was refused, why it matters, and
 * how to proceed anyway — a guard whose message omits the override just
 * teaches people to reach for `--no-verify`, which disables every other
 * pre-push gate too.
 *
 * @param {{ reason: string }} result
 * @returns {string}
 */
export function formatRefusal(result) {
  return [
    "",
    "BLOCKED: direct push to a protected branch.",
    "",
    `  ${result.reason}`,
    "",
    "Why this is refused (#4664):",
    "  - A commit pushed straight to main never runs pull_request CI, so nothing",
    "    checks it before it becomes the base every other branch builds on.",
    "  - A formatting or lint violation that lands this way fails the Build job of",
    "    every subsequent PR until someone notices and fixes main (last time: 4+",
    "    hours, three branch-update cycles, and a dedicated ci-fix PR).",
    "",
    "Open a PR instead:",
    "  git push origin HEAD:refs/heads/<your-branch> && gh pr create --base main",
    "",
    "Deliberate exception (repo policy allows security fixes straight to main):",
    `  ${OVERRIDE_ENV_VAR}=1 git push origin main`,
    "",
  ].join("\n");
}

/** Reads the whole pre-push payload; returns "" if stdin is unavailable. */
function readStdin() {
  try {
    return readFileSync(0, "utf-8");
  } catch {
    return "";
  }
}

function main() {
  if (process.argv[2] !== "check") {
    console.error("Usage: guard-direct-push-to-main.mjs check  (pre-push payload on stdin)");
    process.exit(1);
  }

  const result = classifyPushTarget(readStdin(), { override: process.env[OVERRIDE_ENV_VAR] });

  if (result.decision === "block") {
    console.error(formatRefusal(result));
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
