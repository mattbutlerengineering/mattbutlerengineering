#!/usr/bin/env node

/**
 * persist-metrics.mjs — commit a routine's durable metrics and open its PR.
 *
 * Scheduled routines run in ephemeral checkouts, so anything a run appends and
 * does not commit dies with the checkout. Each routine prompt used to carry its
 * own enumerated `git add` list — and those prompts are RemoteTriggers on
 * claude.ai, outside version control, so adding a durable metric meant a manual
 * prompt edit that nobody remembered to make (#3645).
 *
 * The path list now comes from `durableManifest()` in metrics-store.mjs. Adding
 * `durable: true` to a metric is the whole change; this script and the routine
 * prompt both stay put.
 *
 * Usage:
 *   node scripts/persist-metrics.mjs --routine learning-loop
 *   node scripts/persist-metrics.mjs --routine learning-loop --dry-run
 *
 * Exits 0 with no commit when nothing durable changed.
 *
 * Design: path selection and naming are pure functions; git/gh live behind
 * injected `runGit`/`runGh` callbacks (the revert-watchdog.mjs /
 * queue-telemetry-store.mjs pattern), so the selection logic is unit-tested
 * without touching a repo. The CLI wires `runGit` to execFileSync with argv
 * arrays — never a shell string — and `runGh` to `createRunGh()` below.
 *
 * `runGh` used to shell straight to `execFileSync("gh", ...)`. In a Claude
 * Code Remote session `gh` isn't installed, so that hard-failed with ENOENT
 * right after the git push succeeded (#3985). `createRunGh()` instead wires
 * to `@mbe/gh-client`'s `pr.create()` facet, which already probes for `gh`
 * and falls back to a direct REST call when it's missing — no second,
 * divergent fallback implementation here.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createGhClient } from "@mbe/gh-client";
import { durableManifest } from "./metrics-store.mjs";
import { createRunGit, dataDir, pushDataBranch } from "./metrics-data.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** A routine name is interpolated into a branch name — keep it a plain slug. */
const ROUTINE_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/** Default output sink — one place, so tests can silence the whole script. */
const emit = (msg) => process.stdout.write(`${msg}\n`);

// ── Pure functions ────────────────────────────────────

/**
 * Validate the one piece of external input this script takes. argv arrays
 * already rule out shell injection; this rules out a name that would produce a
 * nonsense ref (`../`, spaces, a leading dash read as a flag).
 *
 * @param {string} routine
 * @returns {string}
 */
export function assertRoutineName(routine) {
  if (typeof routine !== "string" || !ROUTINE_PATTERN.test(routine)) {
    throw new Error(
      `Invalid --routine "${routine}" — expected a lowercase slug like "learning-loop".`
    );
  }
  return routine;
}

/**
 * Changed paths that the manifest declares durable. A manifest entry ending in
 * `/` is a directory: every changed file beneath it counts.
 *
 * @param {string[]} durablePaths
 * @param {string[]} changedPaths
 * @returns {string[]} sorted, de-duplicated
 */
export function selectDurableDiffs(durablePaths, changedPaths) {
  const matches = changedPaths.filter((changed) =>
    durablePaths.some((durable) =>
      durable.endsWith("/") ? changed.startsWith(durable) : changed === durable
    )
  );
  return [...new Set(matches)].sort();
}

/**
 * Extract paths from `git status --porcelain` output. Each line is a two-char
 * status, a space, then the path — or `old -> new` for a rename, where the
 * destination is what needs staging.
 *
 * @param {string} porcelain
 * @returns {string[]}
 */
export function parseChangedPaths(porcelain) {
  return porcelain
    .split("\n")
    .map((line) => line.slice(3).trim())
    .filter(Boolean)
    .map((path) => (path.includes(" -> ") ? path.split(" -> ")[1] : path));
}

/**
 * @param {string} routine
 * @param {string} today — ISO date (YYYY-MM-DD)
 * @returns {string}
 */
export function buildBranchName(routine, today) {
  return `metrics/${routine}-${today}`;
}

/**
 * @param {string} routine
 * @param {string} today — ISO date (YYYY-MM-DD)
 * @returns {string}
 */
export function buildCommitMessage(routine, today) {
  return `chore(metrics): ${routine} ${today}`;
}

/**
 * @param {string} routine
 * @param {string[]} paths
 * @returns {string}
 */
export function buildPrBody(routine, paths) {
  return [
    `Durable metrics written by the \`${routine}\` routine.`,
    "",
    "Paths are selected from `durableManifest()` in `scripts/metrics-store.mjs`,",
    "not enumerated in the routine prompt.",
    "",
    ...paths.map((p) => `- \`${p}\``),
    "",
  ].join("\n");
}

// ── Orchestration ─────────────────────────────────────

/**
 * Stage the durable paths with a diff, commit them, and open the PR.
 *
 * @param {{
 *   routine: string,
 *   today: string,
 *   paths?: string[],
 *   listChanged: () => string[],
 *   branchExists?: (branch: string) => boolean,
 *   runGit: (args: string[]) => void,
 *   runGh: (args: string[]) => void,
 *   pushData?: (message: string) => { pushed: boolean },
 *   log?: (msg: string) => void,
 * }} options
 *   `pushData` commits and pushes the metrics-data checkout (telemetry). It
 *   runs first; whatever durable files remain on main still go through a PR.
 * @returns {{ committed: boolean, paths: string[], branch?: string, message?: string, dataPushed?: boolean }}
 */
export function persistMetrics({
  routine,
  today,
  paths = durableManifest(),
  listChanged,
  branchExists = () => false,
  runGit,
  runGh,
  pushData,
  log = emit,
}) {
  assertRoutineName(routine);
  const message = buildCommitMessage(routine, today);
  // A failed data push must not also strand main-located files: carry on to
  // the PR path, then report the push failure at the end.
  let dataError;
  let data = {};
  if (pushData) {
    try {
      data = { dataPushed: pushData(message).pushed };
    } catch (error) {
      dataError = error;
      data = { dataPushed: false };
    }
  }
  const finish = (result) => {
    if (dataError) throw dataError;
    return result;
  };

  const changed = selectDurableDiffs(paths, listChanged());
  if (changed.length === 0) {
    log(`[persist-metrics] No durable files on main changed for ${routine}; no PR needed.`);
    return finish({ committed: false, paths: [], ...data });
  }

  const branch = buildBranchName(routine, today);

  // A prior partial run (e.g. commit failed after the branch was already
  // created — #3985) leaves the branch behind. Reuse it instead of
  // hard-crashing on "branch already exists".
  runGit(branchExists(branch) ? ["checkout", branch] : ["checkout", "-b", branch]);
  runGit(["add", "--", ...changed]);
  runGit(["commit", "-m", message]);
  runGit(["push", "--set-upstream", "origin", branch]);
  runGh([
    "pr",
    "create",
    "--base",
    "main",
    "--title",
    message,
    "--body",
    buildPrBody(routine, changed),
    "--label",
    "has-pr",
  ]);

  log(`[persist-metrics] Committed ${changed.length} durable path(s) on ${branch}:`);
  for (const path of changed) log(`  ${path}`);

  return finish({ committed: true, paths: changed, branch, message, ...data });
}

/**
 * Wires `persistMetrics()`'s `runGh` callback to `@mbe/gh-client`'s
 * `pr.create()` facet — it already probes for the `gh` binary and falls
 * back to a direct REST call when it's missing (see
 * `packages/gh-client/src/transport.ts`), which is what makes this work
 * in a Claude Code Remote session with no `gh` installed (#3985).
 *
 * `persistMetrics()` only ever calls `runGh(["pr", "create", ...])`, so
 * this strips the leading `"pr", "create"` and forwards the rest straight
 * to the facet.
 *
 * @param {import("@mbe/gh-client").GhClientOptions} [opts] — forwarded to
 *   createGhClient(); tests inject `probe`/`runner`/`http` to force a path.
 * @returns {(argv: string[]) => string}
 */
export function createRunGh(opts = {}) {
  const { pr } = createGhClient(opts);
  return (argv) => {
    if (argv[0] !== "pr" || argv[1] !== "create") {
      throw new Error(`createRunGh only supports "gh pr create", got: gh ${argv.join(" ")}`);
    }
    return pr.create(argv.slice(2));
  };
}

// ── CLI ───────────────────────────────────────────────

/** @param {string[]} args */
function readFlag(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function exec(file, args) {
  execFileSync(file, args, { cwd: ROOT, stdio: "inherit" });
}

/** @param {string} branch */
function localBranchExists(branch) {
  try {
    execFileSync("git", ["rev-parse", "--verify", "--quiet", branch], {
      cwd: ROOT,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function main() {
  const args = process.argv.slice(2);
  const routine = assertRoutineName(readFlag(args, "--routine"));
  const dryRun = args.includes("--dry-run");
  const paths = durableManifest();

  const listChanged = () =>
    parseChangedPaths(
      execFileSync("git", ["status", "--porcelain", "--untracked-files=all", "--", ...paths], {
        cwd: ROOT,
        encoding: "utf-8",
      })
    );

  // A no-op run is a success, not a failure — most runs change nothing.
  const announce = (argv) => emit(`[persist-metrics] DRY RUN — would run: ${argv.join(" ")}`);

  persistMetrics({
    routine,
    today: new Date().toISOString().slice(0, 10),
    paths,
    listChanged,
    branchExists: localBranchExists,
    // Telemetry lives on the metrics-data branch (scripts/metrics-data.mjs).
    // Without a checkout no telemetry could have been written (metrics-store
    // throws), so there is nothing to push; main-located gate inputs still ride
    // the PR below.
    pushData:
      existsSync(dataDir(ROOT)) && !dryRun
        ? (message) => pushDataBranch({ root: ROOT, message, runGit: createRunGit(ROOT) })
        : undefined,
    runGit: dryRun ? announce : (argv) => exec("git", argv),
    runGh: dryRun ? announce : createRunGh(),
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
