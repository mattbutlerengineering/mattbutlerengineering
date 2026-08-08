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
 * exactly two non-negotiable safety rails before a worktree is ever eligible
 * for removal: no live owning process, and no open PR on its branch. The
 * decision logic (`decideWorktreeReap`/`planReap`) is pure and unit-tested;
 * only the CLI helpers below it shell out to `git`/`gh`/`lsof`, always via
 * `execFileSync` with argv arrays (never string interpolation into a shell).
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
 * file handle (including cwd) under the worktree path counts as live. This
 * reuses `merge-train-lock.mjs`'s *spirit* (a liveness check gates reclaim,
 * and any ambiguous state fails safe toward refusal) rather than inventing
 * a second, divergent notion of liveness from scratch.
 *
 * Both liveness and open-PR checks fail SAFE: any error (missing `lsof`,
 * `gh` auth failure, network blip) is treated as "refuse to reap", never
 * as "safe to remove". A reaper that removes too little is an annoyance;
 * one that removes too much destroys in-flight work.
 *
 * Usage:
 *   node scripts/reap-worktrees.mjs                # honors env DRY_RUN (default "true")
 *   DRY_RUN=false node scripts/reap-worktrees.mjs  # actually removes eligible worktrees
 */

import { execFileSync } from "node:child_process";
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
 * a live owning process or an open PR — checked in that order, since
 * removing an in-flight worker is the worse failure mode of the two.
 *
 * @param {{path: string, branch: string|null, isLive: boolean, hasOpenPr: boolean}} worktree
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

/**
 * Side effect: builds the reap inventory — every agent worktree paired with
 * its live `isLive`/`hasOpenPr` signals — ready to hand to `planReap`.
 *
 * @param {{cwd?: string, exec?: Function}} [opts]
 * @returns {Array<{path:string, branch:string|null, isLive:boolean, hasOpenPr:boolean}>}
 */
export function buildReapInventory({ cwd = process.cwd(), exec = execFileSync } = {}) {
  return listWorktrees({ cwd, exec })
    .filter((w) => isAgentWorktreePath(w.path))
    .map((w) => ({
      path: w.path,
      branch: w.branch,
      isLive: isWorktreeLive(w.path, { exec }),
      hasOpenPr: hasOpenPrForBranch(w.branch, { exec }),
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
