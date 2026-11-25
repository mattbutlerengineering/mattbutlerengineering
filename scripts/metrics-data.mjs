#!/usr/bin/env node

/**
 * metrics-data.mjs — read and write telemetry on the orphan `metrics-data`
 * branch instead of `main`.
 *
 * Every telemetry write used to land on `main` through its own auto-merged PR,
 * which ran paid CI each time (about 150 PRs in 13 days, 2026-11). The writer
 * workflows also rebuilt a fixed branch from `main` on each run, so a run that
 * fired before the previous PR merged dropped the earlier row: production
 * health has whole days missing. A direct push to a data branch fixes both:
 * no workflow triggers on it (every `push:` trigger is scoped to `main`), and
 * a rejected push rebases and retries instead of resetting.
 *
 * Files that gate CI (the antipattern baselines, the ui-quality ledger) stay
 * on `main`; see `REPO_LOCATED` in metrics-store.mjs.
 *
 * Layout: the branch holds today's `metrics/` tree at its root, checked out
 * at `<root>/.metrics-data/` as a git worktree. metrics-store.mjs resolves
 * data metrics there when the checkout exists.
 *
 * Usage:
 *   node scripts/metrics-data.mjs pull
 *   node scripts/metrics-data.mjs push -m "chore(metrics): production health"
 *   node scripts/metrics-data.mjs bootstrap      # one time, creates the branch
 *
 * Design: git runs behind an injected `runGit(args) => stdout` callback, the
 * persist-metrics.mjs pattern; the CLI wires it to execFileSync with argv
 * arrays, never a shell string.
 */

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DATA_DIRNAME, dataManifest } from "./metrics-store.mjs";

export { DATA_DIRNAME };
export const DATA_BRANCH = "metrics-data";
const DEFAULT_MAX_ATTEMPTS = 5;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REMOTE_REF = `origin/${DATA_BRANCH}`;
const METRICS_PREFIX = "metrics/";

/**
 * `*.jsonl` rows are appends, so a union merge is always right for them.
 * JSON files are whole-file rewrites; the rebase in pushDataBranch keeps the
 * newer write (`-X theirs`), the same last-writer-wins they had on `main`.
 */
const GITATTRIBUTES = "*.jsonl merge=union\n";

const emit = (msg) => process.stdout.write(`${msg}\n`);

/**
 * Absolute path of the data branch checkout under `root`.
 * @param {string} [root]
 */
export function dataDir(root = ROOT) {
  return join(root, DATA_DIRNAME);
}

/**
 * Wire `runGit` to real git. Returns stdout; throws with stderr on failure.
 * @param {string} cwd
 * @returns {(args: string[]) => string}
 */
export function createRunGit(cwd) {
  return (args) =>
    execFileSync("git", args, { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] });
}

function checkoutExists(root) {
  return existsSync(join(dataDir(root), ".git"));
}

function assertCheckout(root) {
  if (!checkoutExists(root)) {
    throw new Error(
      `No metrics-data checkout at ${dataDir(root)}. Run \`node scripts/metrics-data.mjs pull\` first.`
    );
  }
}

/**
 * Create the orphan data branch from the working tree's current data files and
 * push it. One time only: refuses when the branch already exists on origin.
 *
 * @param {{ root?: string, paths?: string[], runGit: (args: string[]) => string, log?: (m: string) => void }} opts
 *   `paths` are repo-relative `metrics/...` entries; a trailing `/` is a directory.
 */
export function bootstrapDataBranch({ root = ROOT, paths = dataManifest(), runGit, log = emit }) {
  if (runGit(["ls-remote", "--heads", "origin", DATA_BRANCH]).trim() !== "") {
    throw new Error(`Branch ${DATA_BRANCH} already exists on origin; use pull instead.`);
  }
  const dir = dataDir(root);
  runGit(["worktree", "add", "--detach", dir]);
  runGit(["-C", dir, "checkout", "-q", "--orphan", DATA_BRANCH]);
  runGit(["-C", dir, "rm", "-rfq", "."]);

  for (const path of paths) {
    if (!path.startsWith(METRICS_PREFIX)) {
      throw new Error(`Data path ${path} is outside ${METRICS_PREFIX}.`);
    }
    const from = join(root, path);
    if (!existsSync(from)) continue;
    const to = join(dir, path.slice(METRICS_PREFIX.length));
    mkdirSync(dirname(to), { recursive: true });
    cpSync(from, to, { recursive: true });
  }
  writeFileSync(join(dir, ".gitattributes"), GITATTRIBUTES);

  runGit(["-C", dir, "add", "-A"]);
  commit(runGit, dir, `chore(metrics): bootstrap ${DATA_BRANCH} from main`);
  runGit(["-C", dir, "push", "--no-verify", "-q", "-u", "origin", DATA_BRANCH]);
  log(`[metrics-data] Created ${DATA_BRANCH} with ${paths.length} data path(s).`);
}

/**
 * Check out (or update) the data branch at `<root>/.metrics-data`. Refuses to
 * run over uncommitted writes, which a pull would otherwise silently discard.
 *
 * @param {{ root?: string, runGit: (args: string[]) => string, log?: (m: string) => void }} opts
 */
export function pullDataBranch({ root = ROOT, runGit, log = emit }) {
  const dir = dataDir(root);
  if (checkoutExists(root)) {
    if (runGit(["-C", dir, "status", "--porcelain"]).trim() !== "") {
      throw new Error(
        `Uncommitted metric writes in ${dir}. Run \`node scripts/metrics-data.mjs push\` first.`
      );
    }
    runGit(["-C", dir, "fetch", "-q", "origin", DATA_BRANCH]);
    // Rebase, not reset: a commit left by a failed push must survive the pull.
    runGit(["-C", dir, "rebase", "-q", "-X", "theirs", REMOTE_REF]);
  } else {
    runGit(["fetch", "-q", "origin", DATA_BRANCH]);
    // Drop a registration left behind when someone deleted the directory.
    runGit(["worktree", "prune"]);
    // Detached: a branch can be checked out in only one worktree, and local
    // sessions run in many worktrees of one clone. Push targets the branch by
    // refspec (HEAD:metrics-data), so no local branch is needed.
    runGit(["worktree", "add", "-q", "--detach", dir, REMOTE_REF]);
  }
  log(`[metrics-data] ${dir} is at ${REMOTE_REF}.`);
}

/**
 * Commit every change in the checkout and push it. A rejected push fetches,
 * rebases and retries, up to `maxAttempts` pushes in all.
 *
 * @param {{ root?: string, message: string, runGit: (args: string[]) => string, maxAttempts?: number, log?: (m: string) => void }} opts
 * @returns {{ pushed: boolean, attempts: number }}
 */
export function pushDataBranch({
  root = ROOT,
  message,
  runGit,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  log = emit,
}) {
  if (!message) throw new Error("push needs a commit message (-m).");
  assertCheckout(root);
  const dir = dataDir(root);

  if (runGit(["-C", dir, "status", "--porcelain"]).trim() !== "") {
    runGit(["-C", dir, "add", "-A"]);
    commit(runGit, dir, message);
  }
  const ahead = Number(runGit(["-C", dir, "rev-list", "--count", `${REMOTE_REF}..HEAD`]).trim());
  if (ahead === 0) {
    log("[metrics-data] Nothing to push.");
    return { pushed: false, attempts: 0 };
  }

  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // --no-verify: the repo's pre-push hook checks code on main (ratchet,
      // regen drift). This branch holds only data, so those checks do not apply.
      runGit(["-C", dir, "push", "--no-verify", "-q", "origin", `HEAD:${DATA_BRANCH}`]);
      log(`[metrics-data] Pushed to ${DATA_BRANCH} (attempt ${attempt}).`);
      return { pushed: true, attempts: attempt };
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts) break;
      log(`[metrics-data] Push rejected (attempt ${attempt}); rebasing on ${REMOTE_REF}.`);
      runGit(["-C", dir, "fetch", "-q", "origin", DATA_BRANCH]);
      runGit(["-C", dir, "rebase", "-q", "-X", "theirs", REMOTE_REF]);
    }
  }
  throw new Error(
    `Could not push to ${DATA_BRANCH} after ${maxAttempts} attempts: ${lastError?.message ?? lastError}`
  );
}

/**
 * --no-verify: the repo's pre-commit hook runs lint-staged and check-adr over
 * code. A data-only commit has nothing for them to check.
 */
function commit(runGit, dir, message) {
  runGit(["-C", dir, "commit", "--no-verify", "-q", "-m", message]);
}

// ── CLI ───────────────────────────────────────────────

function main() {
  const [command, ...rest] = process.argv.slice(2);
  const runGit = createRunGit(ROOT);
  if (command === "pull") return pullDataBranch({ runGit });
  if (command === "bootstrap") return bootstrapDataBranch({ runGit });
  if (command === "push") {
    const index = rest.indexOf("-m");
    const message = index >= 0 ? rest[index + 1] : undefined;
    return pushDataBranch({ message, runGit });
  }
  throw new Error(`Usage: metrics-data.mjs <pull|push -m "msg"|bootstrap>, got "${command ?? ""}"`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`[metrics-data] ${error.message}\n`);
    process.exit(1);
  }
}
