#!/usr/bin/env node
/**
 * merge-train-lock.mjs — PID-aware merge-train lockfile guard.
 *
 * Prevents concurrent merge-train /loop sessions from racing and
 * duplicate-fixing the same branch. The lock lives inside the git
 * common dir so it is shared across all worktrees of the same repo.
 *
 * Public API:
 *   acquireMergeTrainLock(opts?)  → { acquired: true } | { acquired: false, owner: number }
 *   releaseMergeTrainLock(opts?)  → void
 *   heartbeatMergeTrainLock(opts?) → void
 *   defaultLockDir()               → string  (git common dir path)
 *
 * Options (all optional, primarily for testing):
 *   lockDir   {string}   — directory that contains the lock sub-dir (default: git common dir)
 *   isPidAlive {fn}      — (pid: number) => boolean  injectable liveness check
 *   staleMs   {number}   — staleness window in ms (default: 45 minutes)
 *
 * Lock layout:
 *   <lockDir>/mbe-merge-train.lock/   ← atomic mkdir creates this
 *   <lockDir>/mbe-merge-train.lock/pid  ← owner PID as a decimal string
 *
 * Staleness reclaim: if the lock directory mtime is older than staleMs
 * OR the PID recorded in the pid file is no longer alive, the lock is
 * treated as crashed and reclaimed.
 *
 * @module merge-train-lock
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LOCK_NAME = "mbe-merge-train.lock";
const DEFAULT_STALE_MS = 45 * 60 * 1000; // 45 minutes

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the git common dir for the current repository.
 * Falls back to the current working directory if git is unavailable.
 */
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

/**
 * Default liveness check using process.kill(pid, 0).
 * Returns true if the process exists (signal 0 does not kill it).
 */
function defaultIsPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Reads the PID from the lock's pid file.
 * Returns null if the file is missing or contains non-numeric content.
 */
function readLockPid(lockPath) {
  const pidFile = path.join(lockPath, "pid");
  try {
    const raw = fs.readFileSync(pidFile, "utf8").trim();
    const pid = parseInt(raw, 10);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

/**
 * Writes the current process PID into the lock directory.
 */
function writeLockPid(lockPath) {
  fs.writeFileSync(path.join(lockPath, "pid"), String(process.pid));
}

/**
 * Returns true if the lock's mtime is older than staleMs.
 */
function isStaleByTime(lockPath, staleMs) {
  try {
    const { mtimeMs } = fs.statSync(lockPath);
    return Date.now() - mtimeMs > staleMs;
  } catch {
    return false;
  }
}

/**
 * Removes the lock directory unconditionally.
 */
function removeLock(lockPath) {
  fs.rmSync(lockPath, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Attempts to acquire the merge-train lock.
 *
 * @param {object} [opts]
 * @param {string} [opts.lockDir]      — directory containing the lock (default: git common dir)
 * @param {function} [opts.isPidAlive] — (pid: number) => boolean  (default: signal-0 check)
 * @param {number} [opts.staleMs]      — staleness window in ms (default: 45 min)
 * @returns {{ acquired: true } | { acquired: false, owner: number }}
 */
function acquireMergeTrainLock(opts = {}) {
  const lockDir = opts.lockDir ?? defaultLockDir();
  const isPidAlive = opts.isPidAlive ?? defaultIsPidAlive;
  const staleMs = opts.staleMs ?? DEFAULT_STALE_MS;

  const lockPath = path.join(lockDir, LOCK_NAME);

  // Fast path: atomic mkdir succeeds → we own the lock.
  try {
    fs.mkdirSync(lockPath);
    writeLockPid(lockPath);
    return { acquired: true };
  } catch (err) {
    if (err.code !== "EEXIST") {
      throw err;
    }
  }

  // Lock already exists — check if it should be reclaimed.
  const ownerPid = readLockPid(lockPath);
  const stale = isStaleByTime(lockPath, staleMs) || ownerPid === null || !isPidAlive(ownerPid);

  if (stale) {
    removeLock(lockPath);
    fs.mkdirSync(lockPath);
    writeLockPid(lockPath);
    return { acquired: true };
  }

  // Lock is held by a live owner — fall back to monitor-only.
  return { acquired: false, owner: ownerPid };
}

/**
 * Releases the merge-train lock.
 * Safe to call when no lock is held (no-op).
 *
 * @param {object} [opts]
 * @param {string} [opts.lockDir] — directory containing the lock (default: git common dir)
 */
function releaseMergeTrainLock(opts = {}) {
  const lockDir = opts.lockDir ?? defaultLockDir();
  const lockPath = path.join(lockDir, LOCK_NAME);
  removeLock(lockPath);
}

/**
 * Touches the lock directory mtime to prevent stale-reclaim during a
 * long-running merge train. Call once per PR iteration.
 * Safe to call when no lock is held (no-op).
 *
 * @param {object} [opts]
 * @param {string} [opts.lockDir] — directory containing the lock (default: git common dir)
 */
function heartbeatMergeTrainLock(opts = {}) {
  const lockDir = opts.lockDir ?? defaultLockDir();
  const lockPath = path.join(lockDir, LOCK_NAME);
  try {
    const now = new Date();
    fs.utimesSync(lockPath, now, now);
  } catch {
    // Lock does not exist — no-op.
  }
}

export { acquireMergeTrainLock, releaseMergeTrainLock, heartbeatMergeTrainLock, defaultLockDir };
