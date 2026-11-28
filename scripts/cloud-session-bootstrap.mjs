#!/usr/bin/env node

/**
 * cloud-session-bootstrap.mjs — SessionStart hook body (#8169). Cloud/CCR
 * sessions start with no built workspace `dist/` and often no `node_modules`,
 * so `@mbe/*` imports fail until `pnpm install --frozen-lockfile` +
 * `pnpm build --filter @mbe/cli...` are run by hand. This runs them once, only
 * when `CLAUDE_CODE_REMOTE=true`; local sessions and cloud sessions already
 * installed from this checkout's lockfile are a no-op that spawns nothing.
 * Never fails the session: errors are logged and exit is 0.
 *
 * `node_modules` existing is NOT evidence that the checkout's dependencies are
 * installed. The container image ships a pre-baked `node_modules`, so a
 * session whose checkout has moved past the image gated the install on a
 * directory that was already there and ran its gates against a stale tree.
 * Measured 2026-11-28: an image baked on 11-23 22:34 against a session on
 * 11-28. `services/agent` had no link for `@modelcontextprotocol/sdk` even
 * though the store held it, so `pnpm lint` and `pnpm typecheck` both failed
 * with 13 `TS2307`s that had nothing to do with the session's own work.
 * `01373cd` (11-25, #9734) added that dependency and changed the lockfile, so
 * any image older than it ships a tree that cannot resolve it.
 *
 * So the decision reads provenance, not presence: pnpm records the lockfile it
 * last installed from at `node_modules/.pnpm/lock.yaml`, and a tree installed
 * from a different one (or one whose provenance cannot be read) is repaired.
 * `pnpm install --frozen-lockfile` is idempotent and took 4.6 s on an
 * already-current tree, so the cost of being wrong in this direction is small
 * and the cost of being wrong in the other is a spuriously red gate.
 *
 * Linked worktrees are handled separately (`pnpm bootstrap:worktree`).
 */

import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRunGit, dataDir, pullDataBranch, pushDataBranch } from "./metrics-data.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export const CLOUD_BOOTSTRAP_COMMANDS = Object.freeze([
  Object.freeze({ cmd: "pnpm", args: Object.freeze(["install", "--frozen-lockfile"]) }),
  Object.freeze({ cmd: "pnpm", args: Object.freeze(["build", "--filter", "@mbe/cli..."]) }),
]);

/** Where pnpm records the lockfile it last installed from, relative to the repo root. */
export const LAST_INSTALL_LOCKFILE = join("node_modules", ".pnpm", "lock.yaml");

/**
 * True for a cloud session (`CLAUDE_CODE_REMOTE=true`) whose `node_modules` is
 * absent, was installed from a different lockfile than this checkout carries,
 * or cannot be traced to one.
 *
 * `installedLockfileMatches` is `undefined` when the provenance is unreadable;
 * that repairs rather than trusts the tree, because a pre-baked `node_modules`
 * is indistinguishable from a current one by presence alone.
 *
 * @param {{env?: Record<string,string|undefined>, hasNodeModules: boolean, installedLockfileMatches?: boolean}} args
 */
export function shouldBootstrapCloudSession({ env, hasNodeModules, installedLockfileMatches }) {
  if (typeof hasNodeModules !== "boolean") {
    throw new TypeError("shouldBootstrapCloudSession: hasNodeModules must be a boolean");
  }
  if (env?.CLAUDE_CODE_REMOTE !== "true") return false;
  if (!hasNodeModules) return true;
  return installedLockfileMatches !== true;
}

/**
 * Whether `node_modules` was installed from the lockfile this checkout
 * carries. `undefined` when either file cannot be read -- provenance unknown.
 *
 * @returns {boolean|undefined}
 */
function installedFromThisLockfile({ repoRoot, readText }) {
  try {
    return (
      readText(join(repoRoot, LAST_INSTALL_LOCKFILE)) === readText(join(repoRoot, "pnpm-lock.yaml"))
    );
  } catch {
    return undefined;
  }
}

/**
 * Runs the decision and, when due, the install + build. Returns
 * `{ ran, ok }`; never throws (a failed step is logged to stderr).
 */
export function runCloudSessionBootstrap({
  env = process.env,
  repoRoot = REPO_ROOT,
  exists = existsSync,
  readText = (path) => readFileSync(path, "utf8"),
  exec = execFileSync,
  log = (msg) => process.stderr.write(`${msg}\n`),
} = {}) {
  const hasNodeModules = exists(join(repoRoot, "node_modules"));
  // Only a cloud session can act on the answer, and the comparison reads two
  // ~669 KB lockfiles, so a local session never pays for it.
  const installedLockfileMatches =
    hasNodeModules && env?.CLAUDE_CODE_REMOTE === "true"
      ? installedFromThisLockfile({ repoRoot, readText })
      : undefined;
  if (!shouldBootstrapCloudSession({ env, hasNodeModules, installedLockfileMatches })) {
    return { ran: false, ok: true };
  }

  log(
    hasNodeModules
      ? "cloud-session-bootstrap: node_modules was not installed from this checkout's lockfile — installing and building @mbe/cli..."
      : "cloud-session-bootstrap: no node_modules — installing and building @mbe/cli..."
  );
  try {
    for (const { cmd, args } of CLOUD_BOOTSTRAP_COMMANDS) {
      exec(cmd, args, { cwd: repoRoot, stdio: ["ignore", 2, 2] });
    }
  } catch (err) {
    log(
      `cloud-session-bootstrap: failed (${err.message}); run \`pnpm bootstrap:worktree\` manually.`
    );
    return { ran: true, ok: false };
  }
  return { ran: true, ok: true };
}

/**
 * Check out the metrics-data branch (scripts/metrics-data.mjs) in a cloud
 * session, so routines read and write telemetry there with no prompt change.
 * Local sessions are a no-op. Never throws: a failed pull is logged, and any
 * later metrics-store call fails loudly with the pull command (no fallback to
 * main, which no longer carries telemetry, #9815).
 */
export function runMetricsDataPull({
  env = process.env,
  pull = () => pullDataBranch({ root: REPO_ROOT, runGit: createRunGit(REPO_ROOT) }),
  log = (msg) => process.stderr.write(`${msg}\n`),
} = {}) {
  if (env?.CLAUDE_CODE_REMOTE !== "true") return { ran: false, ok: true };
  try {
    pull();
    return { ran: true, ok: true };
  } catch (err) {
    log(
      `cloud-session-bootstrap: metrics-data pull failed (${err.message}); run \`node scripts/metrics-data.mjs pull\` manually.`
    );
    return { ran: true, ok: false };
  }
}

/**
 * Stop-hook safety net: push any metric rows a cloud session wrote to
 * .metrics-data/ but never pushed, so a routine that skips its persist step
 * does not lose them with the ephemeral checkout. A no-op when nothing
 * changed. Local sessions and sessions without a checkout do nothing. Never
 * throws.
 */
export function runMetricsDataPush({
  env = process.env,
  hasCheckout = existsSync(join(dataDir(REPO_ROOT), ".git")),
  push = (message) => pushDataBranch({ root: REPO_ROOT, message, runGit: createRunGit(REPO_ROOT) }),
  log = (msg) => process.stderr.write(`${msg}\n`),
} = {}) {
  if (env?.CLAUDE_CODE_REMOTE !== "true" || !hasCheckout) return { ran: false, ok: true };
  try {
    push(`chore(metrics): cloud session ${new Date().toISOString().slice(0, 10)}`);
    return { ran: true, ok: true };
  } catch (err) {
    log(`cloud-session-bootstrap: metrics-data push failed (${err.message}).`);
    return { ran: true, ok: false };
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.includes("--push-metrics")) {
      runMetricsDataPush();
    } else {
      runCloudSessionBootstrap();
      runMetricsDataPull();
    }
  } catch (err) {
    console.error(`[cloud-session-bootstrap] ${err.message}`);
  }
  process.exit(0);
}
