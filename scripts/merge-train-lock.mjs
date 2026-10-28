#!/usr/bin/env node
/**
 * merge-train-lock.mjs — owner-token merge-train lock.
 *
 * Prevents concurrent merge-train sessions from racing and duplicate-fixing the
 * same branch. The lock lives inside the git common dir so it is shared across
 * all worktrees of the same repo.
 *
 * WHY AN OWNER TOKEN, NOT A PID: the only callers are short-lived `node`
 * invocations from the queue profile, so any PID recorded is dead the moment the
 * call returns. The owner is therefore a caller-supplied durable session id
 * (`--owner`), and staleness is mtime-only (45 min without a heartbeat).
 *
 * CLI:
 *   node scripts/merge-train-lock.mjs acquire|heartbeat|release [--zone <z>] --owner <session-id>
 *   Prints one JSON object. Exit 0 = success, 1 = refused (held by another owner /
 *   not the owner), 2 = usage error. Omit --zone for the global lock.
 *   `MBE_MERGE_TRAIN_LOCK_DIR` overrides the lock directory (tests).
 *
 * Zone vocabulary (zoneForPaths etc.) lives in scripts/zone-vocabulary.mjs.
 *
 * Lock layout: <lockDir>/mbe-merge-train[.<zone>].lock/ (atomic mkdir) holding an
 * `owner` file; the directory mtime is the heartbeat.
 *
 * @module merge-train-lock
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const LOCK_NAME = "mbe-merge-train.lock";
const OWNER_FILE = "owner";
const DEFAULT_STALE_MS = 45 * 60 * 1000; // 45 minutes

/**
 * Returns the lockfile directory name for a zone.
 * No zone (null/undefined) → the historical global name.
 *
 * @param {string | null} [zone]
 * @returns {string}
 */
function lockNameForZone(zone) {
  if (!zone) {
    return LOCK_NAME;
  }
  const safe = zone.replace(/[^a-zA-Z0-9._-]/g, "__");
  return `mbe-merge-train.${safe}.lock`;
}

/** Git common dir for the current repository (cwd if git is unavailable). */
function defaultLockDir() {
  try {
    const result = execFileSync("git", ["rev-parse", "--git-common-dir"], {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return result.trim();
  } catch {
    return process.cwd();
  }
}

function resolveLockPath(opts) {
  return path.join(opts.lockDir ?? defaultLockDir(), lockNameForZone(opts.zone));
}

function requireOwner(owner) {
  if (typeof owner !== "string" || owner.trim() === "") {
    throw new Error("merge-train-lock: a non-empty owner (session id) is required");
  }
  return owner.trim();
}

/** Owner recorded in the lock, or null when the file is missing/empty. */
function readOwner(lockPath) {
  try {
    return fs.readFileSync(path.join(lockPath, OWNER_FILE), "utf8").trim() || null;
  } catch {
    return null;
  }
}

function isStaleByTime(lockPath, staleMs) {
  try {
    return Date.now() - fs.statSync(lockPath).mtimeMs > staleMs;
  } catch {
    return false;
  }
}

function touch(lockPath) {
  const now = new Date();
  fs.utimesSync(lockPath, now, now);
}

function claim(lockPath, owner) {
  fs.mkdirSync(lockPath);
  fs.writeFileSync(path.join(lockPath, OWNER_FILE), owner);
}

/**
 * Attempts to acquire the lock for `opts.owner`.
 * Idempotent for the current owner (refreshes the heartbeat).
 *
 * @param {object} opts
 * @param {string} opts.owner      — durable session id (required)
 * @param {string} [opts.lockDir]  — default: git common dir
 * @param {string} [opts.zone]     — default: global lock
 * @param {number} [opts.staleMs]  — default: 45 min
 * @returns {{ acquired: true, owner: string } | { acquired: false, owner: string | null }}
 */
function acquireMergeTrainLock(opts) {
  const owner = requireOwner(opts?.owner);
  const lockPath = resolveLockPath(opts);
  const staleMs = opts.staleMs ?? DEFAULT_STALE_MS;

  try {
    claim(lockPath, owner);
    return { acquired: true, owner };
  } catch (err) {
    if (err.code !== "EEXIST") {
      throw err;
    }
  }

  const holder = readOwner(lockPath);
  if (holder === owner) {
    touch(lockPath);
    return { acquired: true, owner };
  }
  if (!isStaleByTime(lockPath, staleMs)) {
    return { acquired: false, owner: holder };
  }

  fs.rmSync(lockPath, { recursive: true, force: true });
  try {
    claim(lockPath, owner);
    return { acquired: true, owner };
  } catch (err) {
    if (err.code !== "EEXIST") {
      throw err;
    }
    // Lost the reclaim race to another session.
    return { acquired: false, owner: readOwner(lockPath) };
  }
}

/**
 * Releases the lock, only if `opts.owner` holds it. No lock → ok (no-op).
 *
 * @returns {{ ok: boolean, owner: string | null }} — `owner` is the actual holder
 */
function releaseMergeTrainLock(opts) {
  const owner = requireOwner(opts?.owner);
  const lockPath = resolveLockPath(opts);
  if (!fs.existsSync(lockPath)) {
    return { ok: true, owner: null };
  }
  const holder = readOwner(lockPath);
  if (holder !== owner) {
    return { ok: false, owner: holder };
  }
  fs.rmSync(lockPath, { recursive: true, force: true });
  return { ok: true, owner };
}

/**
 * Refreshes the lock mtime, only if `opts.owner` holds it. No lock → not ok.
 *
 * @returns {{ ok: boolean, owner: string | null }}
 */
function heartbeatMergeTrainLock(opts) {
  const owner = requireOwner(opts?.owner);
  const lockPath = resolveLockPath(opts);
  const holder = readOwner(lockPath);
  if (holder !== owner) {
    return { ok: false, owner: holder };
  }
  touch(lockPath);
  return { ok: true, owner };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const COMMANDS = {
  acquire: (o) => {
    const r = acquireMergeTrainLock(o);
    return { exit: r.acquired ? 0 : 1, body: r };
  },
  heartbeat: (o) => {
    const r = heartbeatMergeTrainLock(o);
    return { exit: r.ok ? 0 : 1, body: r };
  },
  release: (o) => {
    const r = releaseMergeTrainLock(o);
    return { exit: r.ok ? 0 : 1, body: r };
  },
};

function parseFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith("--") || argv[i + 1] === undefined) {
      return null;
    }
    flags[argv[i].slice(2)] = argv[i + 1];
  }
  return flags;
}

function main(argv, env) {
  const [command, ...rest] = argv;
  const flags = parseFlags(rest);
  const usage = (error) => {
    process.stdout.write(`${JSON.stringify({ error })}\n`);
    return 2;
  };
  if (!COMMANDS[command]) {
    return usage("usage: merge-train-lock.mjs acquire|heartbeat|release [--zone <z>] --owner <id>");
  }
  if (!flags?.owner?.trim()) {
    return usage("--owner <session-id> is required");
  }
  const { exit, body } = COMMANDS[command]({
    owner: flags.owner,
    zone: flags.zone,
    lockDir: env.MBE_MERGE_TRAIN_LOCK_DIR,
  });
  process.stdout.write(`${JSON.stringify(body)}\n`);
  return exit;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exitCode = main(process.argv.slice(2), process.env);
}

export { lockNameForZone };
