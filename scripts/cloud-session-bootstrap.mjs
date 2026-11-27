#!/usr/bin/env node

/**
 * cloud-session-bootstrap.mjs — SessionStart hook body (#8169). Cloud/CCR
 * sessions start with no `node_modules` and no built workspace `dist/`, so
 * `@mbe/*` imports fail until `pnpm install --frozen-lockfile` +
 * `pnpm build --filter @mbe/cli...` are run by hand. This runs them once,
 * only when `CLAUDE_CODE_REMOTE=true` AND `node_modules` is absent; local
 * sessions and already-installed cloud sessions are a no-op that spawns
 * nothing. Never fails the session: errors are logged and exit is 0.
 *
 * Linked worktrees are handled separately (`pnpm bootstrap:worktree`).
 */

import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRunGit, dataDir, pullDataBranch, pushDataBranch } from "./metrics-data.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export const CLOUD_BOOTSTRAP_COMMANDS = Object.freeze([
  Object.freeze({ cmd: "pnpm", args: Object.freeze(["install", "--frozen-lockfile"]) }),
  Object.freeze({ cmd: "pnpm", args: Object.freeze(["build", "--filter", "@mbe/cli..."]) }),
]);

/** True only for a cloud session (`CLAUDE_CODE_REMOTE=true`) lacking `node_modules`. */
export function shouldBootstrapCloudSession({ env, hasNodeModules }) {
  if (typeof hasNodeModules !== "boolean") {
    throw new TypeError("shouldBootstrapCloudSession: hasNodeModules must be a boolean");
  }
  return env?.CLAUDE_CODE_REMOTE === "true" && !hasNodeModules;
}

/**
 * Runs the decision and, when due, the install + build. Returns
 * `{ ran, ok }`; never throws (a failed step is logged to stderr).
 */
export function runCloudSessionBootstrap({
  env = process.env,
  repoRoot = REPO_ROOT,
  exists = existsSync,
  exec = execFileSync,
  log = (msg) => process.stderr.write(`${msg}\n`),
} = {}) {
  const hasNodeModules = exists(join(repoRoot, "node_modules"));
  if (!shouldBootstrapCloudSession({ env, hasNodeModules })) return { ran: false, ok: true };

  log("cloud-session-bootstrap: no node_modules — installing and building @mbe/cli...");
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
