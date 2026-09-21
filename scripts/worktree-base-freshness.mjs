#!/usr/bin/env node

/**
 * worktree-base-freshness.mjs — verify an `isolation: "worktree"` agent's base
 * actually descends from a recent `origin/main` before it does any work
 * (#5296).
 *
 * Claude Code provisions a worktree from whatever the owning checkout's object
 * store happens to hold, which can be arbitrarily old — and in the observed
 * 2026-09-12 case, not connected to `main` at all. Two of three
 * `implement-queue-worker` agents that session produced branches where
 * `git merge-base HEAD origin/main` exited 1: `git merge` answered
 * `fatal: refusing to merge unrelated histories` at the merge train, hours
 * after the PR was opened, and both PRs had to be rebuilt by hand. The
 * GitHub API's `base.sha` showed a current `main` tip the whole time, so
 * nothing in the PR's own metadata disagreed. Measured again 2026-09-20: the
 * main checkout was 368 commits behind `origin/main` with a divergent local
 * commit, so every worktree cut from it started on a badly stale base.
 *
 * `classifyWorktreeBase` is the pure decision over four states, and the two
 * bad ones must never be conflated: `unrelated` (no common ancestor — not
 * fixable by `gh pr update-branch` or a merge commit) and `stale` (a real
 * ancestor, but beyond a commit-count/age threshold). It fails closed on
 * `unrelated`, `stale`, AND `unknown` — an undeterminable base is never
 * reported fresh just because staleness could not be proven, matching
 * `classifyBuildFreshness` in `agent-core-build-freshness.mjs`.
 *
 * `assessWorktreeBase` is the thin wrapper that runs the real git commands and
 * never throws. It does NOT self-remediate: the fix is destructive
 * (`git reset --hard`) and would silently discard a worker's in-progress
 * commits, so it is reported for the caller to run, not performed.
 *
 * Usage (worker step 0 / implement-queue Phase 2):
 *   node scripts/worktree-base-freshness.mjs check
 *   # exit 0 + {"fresh":true,"state":"fresh",...}  -> base is sound, proceed
 *   # exit 1 + {"fresh":false,"state":"unrelated"|"stale"|"unknown",...}
 *   #   -> fail closed. For a worker starting fresh work, remediate with:
 *   #      git fetch origin && git reset --hard origin/main
 */

import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const DEFAULT_UPSTREAM = "origin/main";
/** Commits `origin/main` may be ahead of the base before it counts as stale. */
export const DEFAULT_MAX_COMMITS_BEHIND = 20;
/** Age the base commit may reach before it counts as stale (24h). */
export const DEFAULT_MAX_BASE_AGE_MS = 24 * 60 * 60 * 1000;
/** The only remediation, quoted verbatim by both callers' protocols. */
export const REMEDIATION = "git fetch origin && git reset --hard origin/main";

// ---------------------------------------------------------------------------
// Pure logic — no side effects below this section boundary comment.
// ---------------------------------------------------------------------------

const failClosed = (state, reason) => ({ fresh: false, state, reason, remediation: REMEDIATION });
const isCount = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
const hours = (ms) => Math.round(ms / (60 * 60 * 1000));

/**
 * Pure: decide whether a worktree's base is safe to build a PR on.
 *
 * Precedence is deliberate. `unrelated` wins outright — it is the only state
 * a merge cannot repair, so it must never be softened into `stale`. A
 * determinate staleness signal then beats `unknown`: if the commit count
 * proves the base is 368 behind, saying "unknown" would read as a broken
 * check rather than a stale base, and both verdicts fail closed anyway.
 * `unknown` is last and absorbs every remaining undeterminable input,
 * including an `origin/main` that could not be refreshed — a stale
 * remote-tracking ref makes a stale base measure as current, which is the
 * dangerous direction.
 *
 * Thresholds are inclusive: exactly `maxCommitsBehind` behind is fresh, since
 * `main` legitimately advances while a worker is being dispatched.
 *
 * @param {{
 *   mergeBaseFound?: boolean|null,
 *   commitsBehind?: number|null,
 *   baseAgeMs?: number|null,
 *   remoteRefFetched?: boolean,
 *   maxCommitsBehind?: number,
 *   maxBaseAgeMs?: number,
 * }} [input]
 * @returns {{fresh: boolean, state: "fresh"|"stale"|"unrelated"|"unknown", reason: string, remediation: string|null}}
 */
export function classifyWorktreeBase({
  mergeBaseFound,
  commitsBehind,
  baseAgeMs,
  remoteRefFetched = true,
  maxCommitsBehind = DEFAULT_MAX_COMMITS_BEHIND,
  maxBaseAgeMs = DEFAULT_MAX_BASE_AGE_MS,
} = {}) {
  if (mergeBaseFound === false) {
    return failClosed(
      "unrelated",
      "no common ancestor with origin/main — this history is disconnected, so `git merge` will refuse to merge unrelated histories and `gh pr update-branch` cannot fix it"
    );
  }
  if (mergeBaseFound !== true) {
    return failClosed("unknown", "could not determine ancestry against origin/main");
  }
  if (isCount(commitsBehind) && commitsBehind > maxCommitsBehind) {
    return failClosed(
      "stale",
      `base is ${commitsBehind} commits behind origin/main (threshold ${maxCommitsBehind})`
    );
  }
  if (isCount(baseAgeMs) && baseAgeMs > maxBaseAgeMs) {
    return failClosed(
      "stale",
      `base commit is ~${hours(baseAgeMs)}h old (threshold ~${hours(maxBaseAgeMs)}h)`
    );
  }
  if (!remoteRefFetched) {
    return failClosed(
      "unknown",
      "origin/main could not be refreshed from the remote — a stale remote-tracking ref makes a stale base measure as current"
    );
  }
  if (!isCount(commitsBehind)) {
    return failClosed("unknown", "could not count commits between the base and origin/main");
  }
  if (!isCount(baseAgeMs)) {
    return failClosed("unknown", "could not determine the age of the base commit");
  }
  return {
    fresh: true,
    state: "fresh",
    reason: `base shares history with origin/main, is ${commitsBehind} commits behind (max ${maxCommitsBehind}) and ~${hours(baseAgeMs)}h old (max ~${hours(maxBaseAgeMs)}h)`,
    remediation: null,
  };
}

// ---------------------------------------------------------------------------
// Side-effecting layer — every git call goes through `gitOut`, which swallows
// non-zero exits into `null`, so nothing here throws.
// ---------------------------------------------------------------------------

/**
 * Side effect: trimmed stdout of a git invocation, or `null` if it failed.
 *
 * @param {Function} exec
 * @param {string} cwd
 * @param {string[]} args
 * @returns {string|null}
 */
function gitOut(exec, cwd, args) {
  try {
    const out = exec("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return String(out ?? "").trim();
  } catch {
    return null;
  }
}

/** Pure-ish: parse git's integer output, or `null` when it isn't one. */
function parseCount(raw) {
  if (raw === null) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Side effect: runs the real git commands and classifies the result. Never
 * throws — a missing repo, missing remote, or failed fetch all surface as a
 * non-fresh verdict.
 *
 * `fetch: false` means "the caller already fetched"; the CLI always fetches,
 * because an unrefreshed `origin/main` cannot prove freshness.
 *
 * @param {{upstream?: string, cwd?: string, fetch?: boolean, exec?: Function, now?: Function, maxCommitsBehind?: number, maxBaseAgeMs?: number}} [opts]
 * @returns {{fresh: boolean, state: string, reason: string, remediation: string|null, upstream: string, mergeBase: string|null, commitsBehind: number|null, baseAgeMs: number|null}}
 */
export function assessWorktreeBase({
  upstream = DEFAULT_UPSTREAM,
  cwd = ROOT,
  fetch = true,
  exec = execFileSync,
  now = Date.now,
  maxCommitsBehind,
  maxBaseAgeMs,
} = {}) {
  const git = (args) => gitOut(exec, cwd, args);
  const remoteRefFetched = fetch ? git(["fetch", "origin"]) !== null : true;

  const upstreamSha = git(["rev-parse", "--verify", upstream]);
  const headSha = git(["rev-parse", "--verify", "HEAD"]);
  // Both revs must resolve before a merge-base failure can be read as
  // "unrelated" rather than "one of the two refs doesn't exist".
  const resolvable = upstreamSha !== null && headSha !== null;
  const mergeBase = resolvable ? git(["merge-base", "HEAD", upstream]) : null;
  const mergeBaseFound = resolvable ? Boolean(mergeBase) : null;

  const commitsBehind = mergeBaseFound
    ? parseCount(git(["rev-list", "--count", `HEAD..${upstream}`]))
    : null;
  const baseCommittedAtS = mergeBaseFound
    ? parseCount(git(["log", "-1", "--format=%ct", mergeBase]))
    : null;
  const baseAgeMs = baseCommittedAtS === null ? null : now() - baseCommittedAtS * 1000;

  return {
    ...classifyWorktreeBase({
      mergeBaseFound,
      commitsBehind,
      baseAgeMs,
      remoteRefFetched,
      maxCommitsBehind,
      maxBaseAgeMs,
    }),
    upstream,
    mergeBase: mergeBase || null,
    commitsBehind,
    baseAgeMs,
  };
}

// ---------------------------------------------------------------------------
// CLI entry point.
// ---------------------------------------------------------------------------

function run() {
  if (process.argv[2] !== "check") {
    console.error("Usage: worktree-base-freshness.mjs check");
    process.exit(1);
  }
  const result = assessWorktreeBase({ cwd: process.cwd() });
  // stdout is the machine-readable verdict a prompt or hook parses; the
  // human-facing remediation goes to stderr below so it can't corrupt it.
  process.stdout.write(JSON.stringify(result) + "\n");
  if (!result.fresh) console.error(`worktree base not usable (${result.state}): ${REMEDIATION}`);
  process.exit(result.fresh ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run();
}
