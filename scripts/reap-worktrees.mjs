#!/usr/bin/env node

/**
 * reap-worktrees.mjs — decision logic + CLI runner that reclaims leaked
 * implement-queue agent worktrees (#3950) AND hand-created worktrees
 * (#4122) living in the same `.claude/worktrees/` directory.
 *
 * Claude Code `isolation: "worktree"` only auto-removes a worktree that is
 * *unchanged*. Every successful implement-queue worker commits, so its
 * worktree is never unchanged — nothing ever auto-removes it, and nothing
 * in `/implement-queue` reclaimed it either. 132 worktrees accumulated in
 * six days (2026-08-01 → 2026-08-07), none with an open PR.
 *
 * #4122: the original agent-only filter left hand-created worktrees (a
 * human running `git worktree add` directly, outside implement-queue)
 * PERMANENTLY invisible to this script, regardless of age or merge state —
 * observed live at `Considered: 3` of 15 (later 22) real worktrees. Fixing
 * that is NOT simply widening the glob: `removeWorktree`'s throw-on-unsafe
 * guard exists because a hand-created worktree may hold uncommitted human
 * work that is not reconstructible from any PR, unlike an agent worktree.
 * The decided policy (Matt, 2026-08-12): a hand-created worktree is only
 * ever removable on POSITIVE merged-branch evidence — `gh pr list --head
 * <branch> --state all` reporting a non-null `mergedAt` (`hasMergedPr`,
 * see `hasMergedPrForBranch`) — never on git ancestry (see below) and never
 * assumed when that evidence is simply absent. No evidence ⇒ retained,
 * fail closed. `classifyWorktreeCategory` is the named-state mechanism that
 * keeps this straight: "agent" (original rules, unchanged), "hand-created"
 * (original rules PLUS the merge-evidence requirement), and "out-of-tree"
 * (registered somewhere other than this repo's `.claude/worktrees/` — never
 * examined at all, always refused unconditionally). Separately, a directory
 * can exist on disk under `.claude/worktrees/` without being a REGISTERED
 * git worktree at all (observed live: `agent-ac0d717e0bdebd347`, on branch
 * `main`, absent from `git worktree list`) — `findUnregisteredOnDiskWorktrees`
 * surfaces that case distinctly; `git worktree remove` is never attempted
 * against it, only `git worktree prune` is suggested (never auto-run).
 *
 * This script enumerates every worktree registered under this repo's
 * `.claude/worktrees/` ("agent" + "hand-created") and applies the shared
 * safety rails before ANY of them is eligible for removal: no live owning
 * process, no open PR on its branch, no recent filesystem activity — and,
 * since 2026-08-28, positive merged-PR evidence for BOTH categories. The
 * decision logic (`decideWorktreeReap`/`planReap`/`buildReapReport`) is
 * pure and unit-tested; only the CLI helpers below it shell out to
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
 *     `hasMergedPr` for the same lesson applied to branch cleanup). "Has a
 *     merged PR reported by `gh`" is the correct, server-side signal
 *     instead — used as a REFUSAL signal for "agent" (open PR) and as the
 *     REQUIRED positive-eligibility signal for "hand-created" (merged PR).
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
 * 2026-08-28 REVISITS #3986's compensation, because it was measured failing
 * too: worktree `agent-a9aebed17bbbd1388`, whose agent was verifiably still
 * running, read `isLive: false` (0 open fds), `hasOpenPr: false` (not yet
 * pushed), AND `isRecentlyActive: false` — its newest non-excluded mtime was
 * 72.6 min old, past the 45-min window, because workers spend long
 * uninterrupted stretches in `pnpm install`/build/model round-trips where
 * only excluded dirs (node_modules) churn. The dry run listed the live
 * worker under "Would remove". A better process-table probe cannot close
 * this either — measured against a live worker's worktree, the only
 * PERSISTENT owning process (the `claude` harness itself) keeps its cwd at
 * the MAIN checkout, not the worktree, so a cwd-scan (`lsof -a -d cwd +D`)
 * reads zero between tool calls exactly like the fd-scan; only transient
 * per-tool-call children ever appear under the worktree. No observation of
 * the process table or the filesystem can distinguish "quiet but alive"
 * from "dead", so eligibility must not rest on absence of evidence of life.
 * Fix: "agent" worktrees now require the SAME positive evidence of death
 * "hand-created" ones always did — `hasMergedPr === true`. The asymmetry
 * this encodes: deleting a live worker's uncommitted work is catastrophic
 * and unrecoverable; retaining a dead worktree costs disk. A merged PR is
 * the one signal under which nothing unrecoverable can be destroyed — the
 * work already landed on the server — so it is the only ticket to
 * eligibility. Known cost, accepted deliberately: worktrees whose worker
 * failed before pushing, or whose PR closed unmerged, are never auto-reaped
 * and need a manual sweep. `isLive`/`isRecentlyActive`/`hasOpenPr` remain
 * as refusal-only signals (they still shield a just-merged worker that is
 * wrapping up).
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
 * Pure (#4122): true when `worktreePath` IS a direct leaf directory under
 * `.claude/worktrees/` — agent-prefixed OR hand-created, never a nested
 * file, never the main checkout, never a worktree registered somewhere else
 * entirely (a sibling checkout, a tmp dir). This is the widened predicate
 * that makes hand-created worktrees visible to the reaper's inventory at
 * all; `isAgentWorktreePath` (above) stays narrower and still gates what
 * `removeWorktree` may touch without further evidence.
 *
 * @param {string} worktreePath
 * @returns {boolean}
 */
export function isInTreeWorktreePath(worktreePath) {
  const resolved = path.resolve(worktreePath).split(path.sep).join("/");
  const segments = resolved.split("/").filter(Boolean);
  const idx = segments.lastIndexOf("worktrees");
  if (idx < 1 || segments[idx - 1] !== ".claude") return false;
  const leaf = segments[idx + 1];
  return typeof leaf === "string" && idx + 2 === segments.length;
}

/**
 * Pure (#4122): classifies a worktree path into the three non-overlapping
 * categories the reaper reasons about:
 *
 *   - "agent": `.claude/worktrees/agent-*` — implement-queue-spawned.
 *     Since 2026-08-28, subject to the same positive-evidence rule as
 *     "hand-created" (see module header): the refusals (no live process,
 *     no open PR, no recent activity) still apply, and eligibility
 *     additionally requires a merged PR.
 *   - "hand-created": `.claude/worktrees/<anything else>` — may hold
 *     uncommitted human work. Only removable on POSITIVE merged-branch
 *     evidence (a merged PR reported by `gh`), never on ancestry or
 *     dirtiness (see module header). No evidence ⇒ retained, fail closed.
 *   - "out-of-tree": registered somewhere other than this repo's
 *     `.claude/worktrees/` (a sibling checkout, a tmp dir, etc.) — reported
 *     for visibility only. Never examined (no isLive/hasOpenPr/hasMergedPr
 *     lookups are performed for these) and never eligible for removal.
 *
 * @param {string} worktreePath
 * @returns {"agent"|"hand-created"|"out-of-tree"}
 */
export function classifyWorktreeCategory(worktreePath) {
  if (isAgentWorktreePath(worktreePath)) return "agent";
  if (isInTreeWorktreePath(worktreePath)) return "hand-created";
  return "out-of-tree";
}

/**
 * Pure (#4122): the entire safety gate for one worktree, now category-aware
 * via `classifyWorktreeCategory`. Refuses ANY worktree with a live owning
 * process, an open PR, or recent filesystem activity — checked in that
 * order, for BOTH the "agent" and "hand-created" categories.
 * `isRecentlyActive` (#3986) exists because `isLive` and `hasOpenPr` can
 * BOTH read false simultaneously while a worker is unambiguously
 * mid-implementation (see module header); it is the independent third
 * signal that catches that window.
 *
 * Beyond those three shared refusals:
 *   - BOTH "agent" and "hand-created" worktrees need ONE more thing:
 *     `hasMergedPr === true` — positive, server-side evidence that the
 *     branch's PR merged. Missing or `false` evidence retains the worktree
 *     (`no-merge-evidence`); this never falls back to inferring "probably
 *     fine" from any other signal. Until 2026-08-28 "agent" worktrees were
 *     eligible on clearing the three refusals alone — an absence-of-evidence
 *     default that was measured reaping a live worker (see module header).
 *   - "out-of-tree" worktrees are refused unconditionally, before any of
 *     the above checks even run — they are never examined, by design, so a
 *     never-examined worktree can never read as "eligible".
 *
 * @param {{path: string, branch: string|null, isLive: boolean, hasOpenPr: boolean, isRecentlyActive?: boolean, hasMergedPr?: boolean}} worktree
 * @returns {{eligible: boolean, reason: string}}
 */
export function decideWorktreeReap(worktree) {
  const category = classifyWorktreeCategory(worktree.path);
  if (category === "out-of-tree") {
    return { eligible: false, reason: "out-of-tree" };
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
  // 2026-08-28: BOTH in-tree categories now require positive merged-PR
  // evidence. The asymmetry that forces this default: deleting a live
  // worker's uncommitted work is catastrophic and unrecoverable, while
  // retaining a dead worktree merely costs disk — so eligibility can never
  // rest on an absence of evidence of life (all three refusals above were
  // measured false simultaneously on a live worker; see module header).
  // A merged PR means the work is preserved server-side, bounding even a
  // mistimed removal to inconvenience, never loss.
  return worktree.hasMergedPr === true
    ? { eligible: true, reason: "eligible-merged" }
    : { eligible: false, reason: "no-merge-evidence" };
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

/**
 * Pure (#4122): given the registered worktree paths (from `git worktree
 * list`) and the leaf directory names actually present on disk under
 * `.claude/worktrees/`, returns the leaf names that exist on disk but are
 * NOT registered — a state distinct from "hand-created but unmerged": there
 * is no branch or PR to reason about at all (observed live:
 * `agent-ac0d717e0bdebd347`, on branch `main`, absent from `git worktree
 * list`). `git worktree remove` is never the right tool here — only
 * `git worktree prune` is — and this script never runs either automatically
 * for this category; it only surfaces it in the summary.
 *
 * @param {string[]} registeredPaths - `worktree` paths from `git worktree list --porcelain`
 * @param {string[]} onDiskLeafNames - leaf directory names under `.claude/worktrees`
 * @param {string} worktreesRootAbsPath - absolute path to `.claude/worktrees`
 * @returns {string[]}
 */
export function findUnregisteredOnDiskWorktrees(
  registeredPaths,
  onDiskLeafNames,
  worktreesRootAbsPath
) {
  const registeredSet = new Set(
    (registeredPaths ?? []).map((p) => path.resolve(p).split(path.sep).join("/"))
  );
  const root = path.resolve(worktreesRootAbsPath).split(path.sep).join("/");
  return (onDiskLeafNames ?? []).filter((leaf) => !registeredSet.has(`${root}/${leaf}`));
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
 * Side effect (#4122): true only when GitHub reports at least one PR for
 * `branch` with a non-null `mergedAt` — positive, server-side evidence,
 * chosen specifically because this repo squash-merges (a branch tip is
 * never literally an ancestor of `main`, so `git merge-base --is-ancestor`
 * would false-negative every real merge; see `branch-cleanup.mjs`'s
 * `hasMergedPr` for the same lesson applied to branch cleanup). Fails safe
 * to `false` — no evidence, including on error or a missing/null branch
 * name — because absence of proof of a merge is not proof of absence of
 * one; the caller (`decideWorktreeReap`) treats `false` as "retain".
 *
 * @param {string|null} branch
 * @param {{exec?: Function}} [opts]
 * @returns {boolean}
 */
export function hasMergedPrForBranch(branch, { exec = execFileSync } = {}) {
  if (!branch) return false;
  try {
    const raw = exec(
      "gh",
      ["pr", "list", "--head", branch, "--state", "all", "--json", "number,mergedAt"],
      { encoding: "utf8" }
    );
    const prs = JSON.parse(raw);
    return Array.isArray(prs) && prs.some((pr) => pr.mergedAt != null);
  } catch {
    return false;
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
 * Side effect (#4122): builds the reap inventory over BOTH "agent" and
 * "hand-created" in-tree worktrees (widened from the old agent-only
 * filter), each paired with its `isLive`/`hasOpenPr`/`isRecentlyActive`
 * signals plus its category, ready to hand to `planReap`. "out-of-tree"
 * worktrees never enter this inventory at all — they are reported
 * separately by the caller, never queried here.
 *
 * `hasMergedPr` is fetched (one `gh` call) ONLY for a worktree that has
 * already cleared the live/open-pr/recent-activity refusals — those
 * refusals decide the outcome regardless of merge evidence, so fetching it
 * earlier would just be a wasted API call. Since 2026-08-28 BOTH in-tree
 * categories require it (see `decideWorktreeReap`), so it is fetched for
 * "agent" candidates too, not just "hand-created" ones.
 *
 * @param {{cwd?: string, exec?: Function}} [opts]
 * @returns {Array<{path:string, branch:string|null, category:string, isLive:boolean, hasOpenPr:boolean, isRecentlyActive:boolean, hasMergedPr?:boolean}>}
 */
export function buildReapInventory({ cwd = process.cwd(), exec = execFileSync } = {}) {
  return listWorktrees({ cwd, exec })
    .filter((w) => isInTreeWorktreePath(w.path))
    .map((w) => {
      const category = classifyWorktreeCategory(w.path);
      const isLive = isWorktreeLive(w.path, { exec });
      const hasOpenPr = hasOpenPrForBranch(w.branch, { exec });
      const isRecentlyActive = hasRecentFileActivity(w.path);
      const needsMergeEvidence = !isLive && !hasOpenPr && !isRecentlyActive;
      const hasMergedPr = needsMergeEvidence ? hasMergedPrForBranch(w.branch, { exec }) : undefined;
      return {
        path: w.path,
        branch: w.branch,
        category,
        isLive,
        hasOpenPr,
        isRecentlyActive,
        hasMergedPr,
      };
    });
}

/**
 * Guard used independently of `decideWorktreeReap` — `removeWorktree` never
 * shells a destructive git call without re-validating the worktree itself,
 * even if a caller bypassed the plan. #4122 widened this to "hand-created"
 * paths carrying `hasMergedPr === true`; 2026-08-28 tightens the "agent"
 * side to the SAME requirement — path shape alone no longer authorizes
 * removal, because an agent path can belong to a live worker whose
 * uncommitted work is unrecoverable (see module header). The exact call
 * must carry `hasMergedPr === true` — never inferred from the path, and
 * never satisfied by any other field on `worktree`. Everything else
 * ("out-of-tree", or any in-tree path without that exact evidence) throws,
 * hard, with no override.
 *
 * @param {{path:string, hasMergedPr?: boolean}} worktree
 */
function assertSafeWorktreeRemoval(worktree) {
  if (isInTreeWorktreePath(worktree.path) && worktree.hasMergedPr === true) {
    return;
  }
  throw new Error(
    `refusing to remove worktree path without positive merge evidence: ${worktree.path}`
  );
}

/**
 * Side effect: removes a worktree (`git worktree remove --force`) and
 * deletes its local branch (`git branch -D`). Always force-removes: see the
 * module header for why dirtiness/ancestry are not blockers here. Re-checks
 * safety via `assertSafeWorktreeRemoval` as a defense-in-depth guard.
 *
 * @param {{path:string, branch:string|null, hasMergedPr?: boolean}} worktree
 * @param {{cwd?: string, exec?: Function}} [opts]
 */
export function removeWorktree(worktree, { cwd = process.cwd(), exec = execFileSync } = {}) {
  assertSafeWorktreeRemoval(worktree);
  exec("git", ["worktree", "remove", "--force", worktree.path], { cwd, stdio: "inherit" });
  if (worktree.branch) {
    try {
      exec("git", ["branch", "-D", worktree.branch], { cwd, stdio: "inherit" });
    } catch (err) {
      console.error(`[reap-worktrees] Failed to delete branch ${worktree.branch}: ${err.message}`);
    }
  }
}

/**
 * Pure (#4122): the anti-conflation report AC1 requires. `plan.considered`
 * only ever reflects worktrees `decideWorktreeReap` actually examined
 * (agent + hand-created, in-tree); this combines it with the two counts
 * that are deliberately NEVER examined by this script at all — registered
 * "out-of-tree" worktrees, and directories that exist on disk under
 * `.claude/worktrees/` but never registered with git — so `examined: N`
 * can never be misread as "everything on disk was looked at".
 *
 * @param {{considered:number, toReap:Array, retained:Array}} plan
 * @param {{outOfTreeCount?:number, unregisteredOnDisk?:string[]}} [context]
 * @returns {{examined:number, eligible:number, retained:number, outOfTree:number, unregisteredOnDisk:string[]}}
 */
export function buildReapReport(plan, { outOfTreeCount = 0, unregisteredOnDisk = [] } = {}) {
  return {
    examined: plan.considered,
    eligible: plan.toReap.length,
    retained: plan.retained.length,
    outOfTree: outOfTreeCount,
    unregisteredOnDisk: [...unregisteredOnDisk],
  };
}

function formatSummary(plan, report, dryRun) {
  const lines = [
    "=== Worktree Reap ===",
    `Mode: ${dryRun ? "DRY RUN" : "LIVE"}`,
    `Examined (agent + hand-created, in .claude/worktrees/): ${report.examined}`,
    `  Eligible for removal: ${report.eligible}`,
    `  Retained: ${report.retained}`,
    `Out-of-tree (registered elsewhere — reported only, never examined): ${report.outOfTree}`,
    `On-disk but unregistered (run \`git worktree prune\` — never auto-run): ${report.unregisteredOnDisk.length}`,
  ];
  for (const leaf of report.unregisteredOnDisk) {
    lines.push(`  - ${leaf}`);
  }
  lines.push("");
  for (const worktree of plan.toReap) {
    lines.push(
      `${dryRun ? "[DRY RUN] Would remove" : "Removing"}: ${worktree.path} (${worktree.branch}, ${worktree.category})`
    );
  }
  return lines.join("\n");
}

/**
 * Side effect: leaf directory names present on disk directly under
 * `<cwd>/.claude/worktrees/`. Returns an empty array if the directory
 * doesn't exist at all — not every checkout has ever had a worktree.
 */
function listOnDiskWorktreeLeafNames(worktreesRootAbsPath) {
  try {
    return fs
      .readdirSync(worktreesRootAbsPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

async function main() {
  const dryRun = (process.env.DRY_RUN ?? "true") === "true";
  const cwd = process.cwd();

  const allRegistered = listWorktrees({ cwd });
  const outOfTreeCount = allRegistered.filter(
    (w) => classifyWorktreeCategory(w.path) === "out-of-tree"
  ).length;

  const worktreesRoot = path.join(cwd, ".claude", "worktrees");
  const onDiskLeafNames = listOnDiskWorktreeLeafNames(worktreesRoot);
  const inTreeRegisteredPaths = allRegistered
    .filter((w) => isInTreeWorktreePath(w.path))
    .map((w) => w.path);
  const unregisteredOnDisk = findUnregisteredOnDiskWorktrees(
    inTreeRegisteredPaths,
    onDiskLeafNames,
    worktreesRoot
  );

  const worktrees = buildReapInventory({ cwd });
  const plan = planReap(worktrees);
  const report = buildReapReport(plan, { outOfTreeCount, unregisteredOnDisk });

  console.log(formatSummary(plan, report, dryRun));

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
    appendFileSync(summaryPath, `\n${formatSummary(plan, report, dryRun)}\n`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`[reap-worktrees] Error: ${err.message}`);
    process.exit(1);
  });
}
