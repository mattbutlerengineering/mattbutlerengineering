#!/usr/bin/env node

/**
 * reap-worktrees.mjs — decision logic + CLI runner that reclaims leaked
 * implement-queue agent worktrees (#3950).
 *
 * Claude Code `isolation: "worktree"` only auto-removes a worktree that is
 * *unchanged*. Every successful implement-queue worker commits, so its
 * worktree is never unchanged — nothing ever auto-removes it, and nothing
 * in `/implement-queue` reclaimed it either. 132 worktrees accumulated in
 * six days (2026-08-01 → 2026-08-07), none with an open PR.
 *
 * This script enumerates `.claude/worktrees/agent-*` worktrees and applies
 * three non-negotiable safety rails before a worktree is ever eligible for
 * removal: no live owning process, no open PR on its branch, and no recent
 * filesystem activity. The decision logic (`decideWorktreeReap`/`planReap`)
 * is pure and unit-tested; only the CLI helpers below it shell out to
 * `git`/`gh`/`lsof`, always via `execFileSync` with argv arrays (never
 * string interpolation into a shell).
 *
 * What this deliberately does NOT check, and why:
 *
 *   - Working-tree dirtiness. The PostToolUse prettier hook reformats the
 *     whole tree on every edit, so every worktree is permanently "dirty"
 *     (~171 files). Dirtiness cannot distinguish real unpushed work from
 *     that expected noise, so it is not a safety signal here — removal
 *     always uses `git worktree remove --force`.
 *   - Git ancestry ("merged into main"). PRs in this repo are squash-merged,
 *     so a worker branch's tip commit is never literally an ancestor of
 *     `main` even after a real merge (see `branch-cleanup.mjs`'s
 *     `hasMergedPr` for the same lesson applied to branch cleanup). "No
 *     open PR" is the correct, server-side signal instead.
 *
 * "Live owning process" definition: unlike `merge-train-lock.mjs`, no lock
 * file is ever written for a worktree (the harness doesn't create one), so
 * there is no PID file to read. Liveness is instead derived directly from
 * the OS process table via `lsof -t +D <path>` — any process with an open
 * file handle (including cwd) under the worktree path counts as live.
 *
 * #3986 REVISITS this "no lock file" choice, because `lsof -t +D` turned out
 * NOT to measure what it needs to: a Claude Code subagent is never itself a
 * process with a handle under its worktree path — only the transient
 * `git`/`pnpm`/`node` children it spawns per tool call are, and between tool
 * calls (thinking, awaiting an API response, streaming a reply) that count
 * is genuinely zero. Sampled live against a mid-implementation worker, 5 of
 * 12 five-second samples read `isLive: false` — close to a coin flip. Worse,
 * a worker has no PR until it finishes and pushes, so `hasOpenPr` is also
 * false for the entire pre-PR implementation phase: the two "independent"
 * gates fail together precisely in the window with the most unpushed work
 * to lose. A PID-file-based lock (adopting `merge-train-lock.mjs`'s actual
 * mechanism) would fix this too, but needs the harness to write one when it
 * spawns a worker — a change to how workers are dispatched, not just to this
 * script. Instead: `isLive` is kept strictly as a *positive-only* signal
 * (handles-present means live; handles-absent is never treated as dead on
 * its own), and `isRecentlyActive` (`hasRecentFileActivity`) is added as an
 * independent companion gate — true when any file under the worktree has an
 * mtime within the last `ACTIVITY_STALE_MS` (45 min, matching
 * `merge-train-lock.mjs`'s own staleness convention for "is the thing that
 * owns this still working"). No lock file, no change to worker dispatch —
 * just a second way to observe the same underlying fact `lsof` was trying
 * (and failing) to observe on its own.
 *
 * All three checks fail SAFE: any error (missing `lsof`, `gh` auth failure,
 * network blip, an unreadable worktree directory) is treated as "refuse to
 * reap", never as "safe to remove". A reaper that removes too little is an
 * annoyance; one that removes too much destroys in-flight work.
 *
 * Usage:
 *   node scripts/reap-worktrees.mjs                # honors env DRY_RUN (default "true")
 *   DRY_RUN=false node scripts/reap-worktrees.mjs  # actually removes eligible worktrees
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Pure logic — no side effects below this section boundary comment.
// ---------------------------------------------------------------------------

/**
 * Pure: true when `worktreePath` IS an agent worktree root directly under
 * `.claude/worktrees/` — never a nested file inside one, never a
 * differently-named worktree (e.g. a manually created `3169-node20-eslint`
 * feature worktree), never the main checkout. Normalizes `..`/`.` segments
 * first so a maliciously or accidentally constructed path can't slip past
 * the check via traversal.
 *
 * @param {string} worktreePath
 * @returns {boolean}
 */
export function isAgentWorktreePath(worktreePath) {
  const resolved = path.resolve(worktreePath).split(path.sep).join("/");
  const segments = resolved.split("/").filter(Boolean);
  const idx = segments.lastIndexOf("worktrees");
  if (idx < 1 || segments[idx - 1] !== ".claude") return false;
  const leaf = segments[idx + 1];
  return typeof leaf === "string" && leaf.startsWith("agent-") && idx + 2 === segments.length;
}

/**
 * Pure: the entire safety gate for one worktree. Refuses ANY worktree with
 * a live owning process, an open PR, or recent filesystem activity —
 * checked in that order. `isRecentlyActive` (#3986) exists because `isLive`
 * and `hasOpenPr` can BOTH read false simultaneously while a worker is
 * unambiguously mid-implementation (see module header); it is the
 * independent third signal that catches that window.
 *
 * @param {{path: string, branch: string|null, isLive: boolean, hasOpenPr: boolean, isRecentlyActive?: boolean}} worktree
 * @returns {{eligible: boolean, reason: string}}
 */
export function decideWorktreeReap(worktree) {
  if (!isAgentWorktreePath(worktree.path)) {
    return { eligible: false, reason: "not-agent-worktree" };
  }
  if (worktree.isLive) {
    return { eligible: false, reason: "live-session" };
  }
  if (worktree.hasOpenPr) {
    return { eligible: false, reason: "open-pr" };
  }
  if (worktree.isRecentlyActive) {
    return { eligible: false, reason: "recent-activity" };
  }
  return { eligible: true, reason: "eligible" };
}

/**
 * Pure: applies `decideWorktreeReap` to a batch of worktrees (each already
 * carrying its pre-computed `isLive`/`hasOpenPr` signals) and splits them
 * into `toReap` / `retained`. Does not mutate the input.
 *
 * @param {Array<{path:string, branch:string|null, isLive:boolean, hasOpenPr:boolean}>} worktrees
 * @returns {{considered:number, toReap:Array, retained:Array}}
 */
export function planReap(worktrees) {
  const decided = (worktrees ?? []).map((worktree) => ({
    ...worktree,
    decision: decideWorktreeReap(worktree),
  }));
  return {
    considered: decided.length,
    toReap: decided.filter((w) => w.decision.eligible),
    retained: decided.filter((w) => !w.decision.eligible),
  };
}

/**
 * Pure: parses `git worktree list --porcelain` output into
 * `{ path, branch }` records. `branch` is `null` for a detached worktree.
 *
 * @param {string} raw
 * @returns {Array<{path:string, branch:string|null}>}
 */
export function parseWorktreeListPorcelain(raw) {
  const entries = [];
  let current = null;
  for (const line of raw.split("\n")) {
    if (line.startsWith("worktree ")) {
      if (current) entries.push(current);
      current = { path: line.slice("worktree ".length).trim(), branch: null };
    } else if (line.startsWith("branch refs/heads/") && current) {
      current.branch = line.slice("branch refs/heads/".length).trim();
    } else if (line.trim() === "" && current) {
      entries.push(current);
      current = null;
    }
  }
  if (current) entries.push(current);
  return entries;
}

// ---------------------------------------------------------------------------
// Side-effecting helpers — every git/gh/lsof call takes an injectable
// `exec` (defaults to `execFileSync`) so the logic above stays testable
// without real worktrees, and so tests can exercise real git against a
// throwaway fixture repo without ever going near a live subprocess.
// ---------------------------------------------------------------------------

/**
 * Side effect: lists all worktrees of the repo at `cwd`.
 *
 * @param {{cwd?: string, exec?: Function}} [opts]
 * @returns {Array<{path:string, branch:string|null}>}
 */
function listWorktrees({ cwd = process.cwd(), exec = execFileSync } = {}) {
  const raw = exec("git", ["worktree", "list", "--porcelain"], { encoding: "utf8", cwd });
  return parseWorktreeListPorcelain(raw);
}

/**
 * Side effect: true if `branch` has at least one open PR on GitHub. Fails
 * safe to `true` (refuse to reap) on any error, including a missing/null
 * branch name, which can never be queried.
 *
 * @param {string|null} branch
 * @param {{exec?: Function}} [opts]
 * @returns {boolean}
 */
export function hasOpenPrForBranch(branch, { exec = execFileSync } = {}) {
  if (!branch) return true;
  try {
    const raw = exec(
      "gh",
      ["pr", "list", "--head", branch, "--state", "open", "--json", "number"],
      {
        encoding: "utf8",
      }
    );
    const prs = JSON.parse(raw);
    return Array.isArray(prs) && prs.length > 0;
  } catch {
    return true;
  }
}

/**
 * Side effect: true if any live process has an open file handle (including
 * cwd) under `worktreePath`, via `lsof -t +D <path>`. Fails safe to `true`
 * (refuse to reap) on any error other than lsof's normal "nothing matched"
 * exit (status 1, empty stdout).
 *
 * @param {string} worktreePath
 * @param {{exec?: Function}} [opts]
 * @returns {boolean}
 */
export function isWorktreeLive(worktreePath, { exec = execFileSync } = {}) {
  try {
    const raw = exec("lsof", ["-t", "+D", worktreePath], {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    });
    return raw.trim().length > 0;
  } catch (err) {
    if (err.status === 1 && !err.stdout?.trim()) {
      return false;
    }
    return true;
  }
}

// #3986: staleness window for `hasRecentFileActivity`, matching the 45-min
// convention `merge-train-lock.mjs`'s `DEFAULT_STALE_MS` already uses for
// the same class of question ("is the thing that owns this still working").
const ACTIVITY_STALE_MS = 45 * 60 * 1000;

// Directories a worker never hand-edits, so activity inside them is not a
// liveness signal — walking them would only cost time (node_modules can be
// tens of thousands of files) without adding information.
const ACTIVITY_SCAN_SKIP_DIRS = new Set([".git", "node_modules", ".turbo", "dist", "coverage"]);

/**
 * Side effect: true if any file under `worktreePath` (excluding
 * `ACTIVITY_SCAN_SKIP_DIRS`) has an mtime within `staleMs` of `nowMs`
 * (#3986). This is deliberately a filesystem signal, not a git-log one:
 * during the pre-first-commit stretch of an implementation — exactly the
 * window the flicker bug hits hardest — a worker's branch tip is still the
 * worktree's initial commit, so `git log` has nothing recent to show even
 * though the worker is actively editing. Depth-first with an early return on
 * the first qualifying file, so the common "still active" case resolves
 * without walking the whole tree; a genuinely abandoned worktree pays the
 * full walk once per reaper run.
 *
 * Fails safe to `true` (refuse to reap) if `worktreePath` itself can't be
 * read at all; a subtree that vanishes or is unreadable mid-scan is simply
 * skipped, since that's not a liveness signal either way.
 *
 * @param {string} worktreePath
 * @param {{nowMs?: number, staleMs?: number, readdirSync?: Function, statSync?: Function}} [opts]
 * @returns {boolean}
 */
export function hasRecentFileActivity(
  worktreePath,
  {
    nowMs = Date.now(),
    staleMs = ACTIVITY_STALE_MS,
    readdirSync = fs.readdirSync,
    statSync = fs.statSync,
  } = {}
) {
  const cutoff = nowMs - staleMs;
  let rootEntries;
  try {
    rootEntries = readdirSync(worktreePath, { withFileTypes: true });
  } catch {
    return true;
  }

  const stack = [{ dir: worktreePath, entries: rootEntries }];
  while (stack.length > 0) {
    const { dir, entries } = stack.pop();
    for (const entry of entries) {
      if (ACTIVITY_SCAN_SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        try {
          stack.push({ dir: full, entries: readdirSync(full, { withFileTypes: true }) });
        } catch {
          // Subtree vanished or unreadable mid-scan — no signal either way.
        }
        continue;
      }
      try {
        if (statSync(full).mtimeMs >= cutoff) return true;
      } catch {
        // File vanished between readdir and stat (e.g. a tool mid-write) —
        // not a reliable signal, keep scanning.
      }
    }
  }
  return false;
}

/**
 * Side effect: builds the reap inventory — every agent worktree paired with
 * its live `isLive`/`hasOpenPr`/`isRecentlyActive` signals — ready to hand
 * to `planReap`.
 *
 * @param {{cwd?: string, exec?: Function}} [opts]
 * @returns {Array<{path:string, branch:string|null, isLive:boolean, hasOpenPr:boolean, isRecentlyActive:boolean}>}
 */
export function buildReapInventory({ cwd = process.cwd(), exec = execFileSync } = {}) {
  return listWorktrees({ cwd, exec })
    .filter((w) => isAgentWorktreePath(w.path))
    .map((w) => ({
      path: w.path,
      branch: w.branch,
      isLive: isWorktreeLive(w.path, { exec }),
      hasOpenPr: hasOpenPrForBranch(w.branch, { exec }),
      isRecentlyActive: hasRecentFileActivity(w.path),
    }));
}

/**
 * Guard used independently of `decideWorktreeReap` — `removeWorktree` never
 * shells a destructive git call without re-validating the path itself,
 * even if a caller bypassed the plan.
 */
function assertSafeWorktreePath(worktreePath) {
  if (!isAgentWorktreePath(worktreePath)) {
    throw new Error(`refusing to remove non-agent-worktree path: ${worktreePath}`);
  }
}

/**
 * Side effect: removes a worktree (`git worktree remove --force`) and
 * deletes its local branch (`git branch -D`). Always force-removes: see the
 * module header for why dirtiness/ancestry are not blockers here. Re-checks
 * `isAgentWorktreePath` itself as a defense-in-depth guard.
 *
 * @param {{path:string, branch:string|null}} worktree
 * @param {{cwd?: string, exec?: Function}} [opts]
 */
export function removeWorktree(worktree, { cwd = process.cwd(), exec = execFileSync } = {}) {
  assertSafeWorktreePath(worktree.path);
  exec("git", ["worktree", "remove", "--force", worktree.path], { cwd, stdio: "inherit" });
  if (worktree.branch) {
    try {
      exec("git", ["branch", "-D", worktree.branch], { cwd, stdio: "inherit" });
    } catch (err) {
      console.error(`[reap-worktrees] Failed to delete branch ${worktree.branch}: ${err.message}`);
    }
  }
}

function formatSummary(plan, dryRun) {
  const lines = [
    "=== Worktree Reap ===",
    `Mode: ${dryRun ? "DRY RUN" : "LIVE"}`,
    `Considered: ${plan.considered}`,
    `Eligible for removal: ${plan.toReap.length}`,
    "",
  ];
  for (const worktree of plan.toReap) {
    lines.push(
      `${dryRun ? "[DRY RUN] Would remove" : "Removing"}: ${worktree.path} (${worktree.branch})`
    );
  }
  return lines.join("\n");
}

async function main() {
  const dryRun = (process.env.DRY_RUN ?? "true") === "true";
  const cwd = process.cwd();

  const worktrees = buildReapInventory({ cwd });
  const plan = planReap(worktrees);

  console.log(formatSummary(plan, dryRun));

  if (!dryRun) {
    for (const worktree of plan.toReap) {
      try {
        removeWorktree(worktree, { cwd });
      } catch (err) {
        console.error(`[reap-worktrees] Failed to remove ${worktree.path}: ${err.message}`);
      }
    }
  }

  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    const { appendFileSync } = await import("node:fs");
    appendFileSync(summaryPath, `\n${formatSummary(plan, dryRun)}\n`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`[reap-worktrees] Error: ${err.message}`);
    process.exit(1);
  });
}
