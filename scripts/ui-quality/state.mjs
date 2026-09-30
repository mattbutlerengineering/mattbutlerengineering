#!/usr/bin/env node
/**
 * state.mjs — the ui-quality loop's state channel
 * (docs/features/ui-quality-loop/architecture.md § Components "Loop state
 * channel", § Interfaces `state.mjs checkout`; Architect re-entry 5, Review C1).
 *
 * The branch `ui-quality/ledger` on `origin` is the one authority for every
 * routine-written state file (`metrics/ui-quality-*`, the routine's
 * `docs/backlog.md` seeds, its `log.md` entries). `main` only ever holds an
 * earlier snapshot of it, so a fire that read state from `main` would refile
 * yesterday's findings and re-run yesterday's calibration.
 *
 * `checkout` (routine step (0), after install, before any state read):
 *   git fetch --unshallow origin  (only in a shallow clone)
 *   git fetch origin
 *   git fetch origin +refs/heads/ui-quality/ledger:refs/remotes/origin/ui-quality/ledger
 *     (explicit, so a --single-branch clone sees it; "couldn't find remote
 *     ref" means absent, any other failure is state-unavailable)
 *   origin/ui-quality/ledger exists → check it out as local ui-quality/ledger,
 *     `git merge --no-edit origin/main` into it (source "branch")
 *   otherwise → create ui-quality/ledger from origin/main (source "main")
 * Conflicts are resolved by rule, never by the model:
 *   metrics/ui-quality-ledger.jsonl (-merge) → the branch side, then
 *     `ledger.mjs generate` re-derives identity columns from the merged router
 *     source keeping the branch's audit columns, then `ledger.mjs check` must pass
 *   metrics/ui-quality-findings.json → the branch side (only the routine writes it)
 *   docs/backlog.md → line union of both sides (`git merge-file --union`)
 * Any other conflicted path, a failed generate/check, or a failed fetch →
 * `git merge --abort`, the branch left at its own clean tip, exit 2
 * (`state-unavailable`). It never pushes, never touches `main`, and never
 * resolves a conflict by taking `main`'s side of a routine-owned file.
 *
 * Exit 0 prints `{ source, branch, head, merged_main, resolved }` on stdout;
 * `merged_main` is the origin/main sha merged in (null for source "main").
 *
 * Pure core `checkoutState(deps)`: every effect goes through the injected
 * `git`, `ledger`, `mergeUnion` and `writeFile`. `createDeps(root)` binds them
 * to the real repo. Git runs with hooks off (`core.hooksPath=/dev/null`): the
 * repo's post-checkout/post-commit hooks regenerate llms files, which would
 * dirty the tree this command must leave clean, and the merge brings in
 * nothing but `main` (already gated) plus rule-resolved state files.
 *
 * Usage: node scripts/ui-quality/state.mjs checkout [--root <dir>]
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { main as ledgerMain } from "./ledger.mjs";

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const STATE_BRANCH = "ui-quality/ledger";
const REMOTE_BRANCH = `origin/${STATE_BRANCH}`;
const MAIN = "origin/main";
export const LEDGER_PATH = "metrics/ui-quality-ledger.jsonl";
export const FINDINGS_PATH = "metrics/ui-quality-findings.json";
export const BACKLOG_PATH = "docs/backlog.md";

class StateUnavailable extends Error {}

/** Run git; a non-zero exit throws StateUnavailable naming `what`. */
function must(git, args, what) {
  const r = git(args);
  if (!r.ok) throw new StateUnavailable(`${what} failed: ${(r.stderr || r.stdout).trim()}`);
  return r.stdout.trim();
}

const unmergedPaths = (git) =>
  must(git, ["diff", "--name-only", "--diff-filter=U"], "listing conflicts")
    .split("\n")
    .filter(Boolean)
    .sort();

/** The branch side of a routine-owned file — never main's. */
function takeBranchSide(git, path) {
  must(git, ["checkout", "--ours", "--", path], `taking the branch side of ${path}`);
}

function resolveBacklog(deps) {
  const stage = (n) => deps.git(["show", `:${n}:${BACKLOG_PATH}`]);
  const [base, ours, theirs] = [stage(1), stage(2), stage(3)];
  if (!ours.ok || !theirs.ok) {
    throw new StateUnavailable(`${BACKLOG_PATH} is not a both-sides edit — cannot union it`);
  }
  const merged = deps.mergeUnion({
    ours: ours.stdout,
    base: base.ok ? base.stdout : "",
    theirs: theirs.stdout,
  });
  if (typeof merged !== "string") throw new StateUnavailable(`union of ${BACKLOG_PATH} failed`);
  deps.writeFile(BACKLOG_PATH, merged);
}

function resolveLedger(deps) {
  takeBranchSide(deps.git, LEDGER_PATH);
  for (const command of ["generate", "check"]) {
    const code = deps.ledger(command);
    if (code !== 0) {
      throw new StateUnavailable(`ledger.mjs ${command} exited ${code} after a ledger conflict`);
    }
  }
}

const RESOLVERS = {
  [BACKLOG_PATH]: resolveBacklog,
  [FINDINGS_PATH]: (deps) => takeBranchSide(deps.git, FINDINGS_PATH),
  // Last: `generate` reads the merged router source, so everything else settles first.
  [LEDGER_PATH]: resolveLedger,
};

/** Resolve every conflict by rule and conclude the merge; throws StateUnavailable otherwise. */
function concludeMerge(deps) {
  const conflicted = unmergedPaths(deps.git);
  if (conflicted.length === 0) {
    throw new StateUnavailable("merging origin/main failed without a conflict to resolve");
  }
  const unruled = conflicted.filter((p) => !(p in RESOLVERS));
  if (unruled.length > 0) {
    throw new StateUnavailable(`conflict outside the rule-resolved paths: ${unruled.join(", ")}`);
  }
  const ordered = Object.keys(RESOLVERS).filter((p) => conflicted.includes(p));
  for (const path of ordered) {
    RESOLVERS[path](deps);
    must(deps.git, ["add", "--", path], `staging ${path}`);
  }
  if (unmergedPaths(deps.git).length > 0) throw new StateUnavailable("conflicts remain");
  must(deps.git, ["commit", "--no-edit", "--quiet"], "concluding the merge");
  return ordered;
}

const REMOTE_MISSING = /couldn't find remote ref/i;
const failure = (r) => (r.stderr || r.stdout).trim();

/**
 * Fetch what `checkout` reads, in any clone mode (re-review N4). A
 * `--single-branch` or `--depth` clone's refspec names `main` only, so a bare
 * `git fetch origin` never creates the ledger's remote-tracking ref: the
 * branch is fetched by explicit refspec. A shallow clone is unshallowed
 * first, or merging `origin/main` can lack a merge base.
 *
 * @returns {{ error: string|null, branchMissing: boolean }} `branchMissing`
 *   only when origin answered that the branch does not exist; any other
 *   failure is an `error` (`state-unavailable`), never a fall back to main.
 */
function fetchState(git) {
  const shallow = git(["rev-parse", "--is-shallow-repository"]);
  if (shallow.ok && shallow.stdout.trim() === "true") {
    const unshallow = git(["fetch", "--unshallow", "origin"]);
    if (!unshallow.ok)
      return { error: `unshallow failed: ${failure(unshallow)}`, branchMissing: false };
  }
  const main = git(["fetch", "origin"]);
  if (!main.ok) return { error: `fetch failed: ${failure(main)}`, branchMissing: false };
  const branch = git([
    "fetch",
    "origin",
    `+refs/heads/${STATE_BRANCH}:refs/remotes/${REMOTE_BRANCH}`,
  ]);
  if (branch.ok) return { error: null, branchMissing: false };
  if (REMOTE_MISSING.test(failure(branch))) return { error: null, branchMissing: true };
  return { error: `fetching ${STATE_BRANCH} failed: ${failure(branch)}`, branchMissing: false };
}

/**
 * The pure core of `state.mjs checkout`.
 *
 * @param {object} deps
 * @param {(args: string[]) => { ok: boolean, stdout: string, stderr: string }} deps.git
 * @param {(command: "generate"|"check") => number} deps.ledger  ledger.mjs exit code
 * @param {(sides: { ours: string, base: string, theirs: string }) => string|null} deps.mergeUnion
 * @param {(relPath: string, content: string) => void} deps.writeFile
 * @returns {{ code: 0, result: object } | { code: 2, reason: string }}
 */
export function checkoutState(deps) {
  const { git } = deps;
  const fetched = fetchState(git);
  const hasBranch =
    !fetched.branchMissing &&
    git(["rev-parse", "--verify", "--quiet", `refs/remotes/${REMOTE_BRANCH}`]).ok;
  const start = hasBranch ? REMOTE_BRANCH : MAIN;
  try {
    must(git, ["checkout", "--quiet", "-B", STATE_BRANCH, start], `checking out ${start}`);
  } catch (err) {
    return { code: 2, reason: err.message };
  }
  if (fetched.error) return { code: 2, reason: fetched.error };
  const head = () => git(["rev-parse", "HEAD"]).stdout.trim();
  if (!hasBranch) {
    return {
      code: 0,
      result: {
        source: "main",
        branch: STATE_BRANCH,
        head: head(),
        merged_main: null,
        resolved: [],
      },
    };
  }
  const mainSha = git(["rev-parse", MAIN]).stdout.trim();
  let resolved = [];
  try {
    if (!git(["merge", "--no-edit", "--quiet", MAIN]).ok) resolved = concludeMerge(deps);
  } catch (err) {
    git(["merge", "--abort"]);
    return { code: 2, reason: err.message };
  }
  return {
    code: 0,
    result: {
      source: "branch",
      branch: STATE_BRANCH,
      head: head(),
      merged_main: mainSha,
      resolved,
    },
  };
}

// ---------------------------------------------------------------------------
// Real bindings
// ---------------------------------------------------------------------------

/** @returns {(args: string[]) => { ok: boolean, stdout: string, stderr: string }} */
function createGit(root) {
  return (args) => {
    const r = spawnSync("git", ["-c", "core.hooksPath=/dev/null", ...args], {
      cwd: root,
      encoding: "utf8",
    });
    return {
      ok: r.status === 0,
      stdout: r.stdout ?? "",
      stderr: r.stderr ?? r.error?.message ?? "",
    };
  };
}

/** `git merge-file -p --union` over three temp files; null on failure. */
function createMergeUnion(root) {
  return ({ ours, base, theirs }) => {
    const dir = mkdtempSync(join(tmpdir(), "ui-quality-union-"));
    try {
      const files = { ours, base, theirs };
      for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
      const r = spawnSync(
        "git",
        ["merge-file", "-p", "--union", join(dir, "ours"), join(dir, "base"), join(dir, "theirs")],
        { cwd: root, encoding: "utf8" }
      );
      return r.status === 0 ? r.stdout : null;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
}

/** The real repo's deps for `checkoutState`; ledger.mjs output goes to stderr. */
export function createDeps(root) {
  const toStderr = (s) => process.stderr.write(s);
  return {
    git: createGit(root),
    ledger: (command) =>
      ledgerMain([command, "--root", root], { stdout: toStderr, stderr: toStderr }),
    mergeUnion: createMergeUnion(root),
    writeFile: (rel, content) => writeFileSync(join(root, rel), content),
  };
}

/**
 * @param {string[]} argv
 * @param {object} [deps] root, git, ledger, mergeUnion, writeFile, stdout, stderr
 * @returns {number} exit code
 */
export function main(argv, deps = {}) {
  const rootFlag = argv.indexOf("--root");
  const root = rootFlag !== -1 ? resolve(argv[rootFlag + 1]) : (deps.root ?? DEFAULT_ROOT);
  const stdout = deps.stdout ?? ((s) => process.stdout.write(s));
  const stderr = deps.stderr ?? ((s) => process.stderr.write(s));
  if (argv[0] !== "checkout") {
    stderr("Usage: state.mjs checkout [--root <dir>]\n");
    return 2;
  }
  const outcome = checkoutState({ ...createDeps(root), ...deps });
  if (outcome.code !== 0) {
    stderr(`state.mjs checkout: state-unavailable — ${outcome.reason}\n`);
    return outcome.code;
  }
  stdout(`${JSON.stringify(outcome.result)}\n`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
