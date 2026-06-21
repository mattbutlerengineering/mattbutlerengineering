import { describe, test, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("merge-train-lock", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "merge-train-lock-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── acquireMergeTrainLock ──────────────────────────────────────────────────

  describe("acquireMergeTrainLock", () => {
    test("acquires the lock when none exists and writes current PID", async () => {
      const { acquireMergeTrainLock } = await import("../merge-train-lock.mjs");
      const result = acquireMergeTrainLock({ lockDir: tmpDir });

      expect(result.acquired).toBe(true);
      const pidFile = path.join(tmpDir, "mbe-merge-train.lock", "pid");
      expect(fs.existsSync(pidFile)).toBe(true);
      expect(parseInt(fs.readFileSync(pidFile, "utf8").trim(), 10)).toBe(process.pid);
    });

    test("returns {acquired:false, owner} when lock is held by a live PID", async () => {
      const { acquireMergeTrainLock } = await import("../merge-train-lock.mjs");

      // Simulate a live owner by using our own PID (definitely alive)
      const livePid = process.pid;
      const isAlive = () => true; // injectable: always alive

      // First acquire
      acquireMergeTrainLock({ lockDir: tmpDir });

      // Second acquire (contended) — override isPidAlive so it thinks the owner is live
      const result = acquireMergeTrainLock({ lockDir: tmpDir, isPidAlive: isAlive });

      expect(result.acquired).toBe(false);
      expect(typeof result.owner).toBe("number");
      expect(result.owner).toBe(livePid);
    });

    test("reclaims stale lock when owner PID is dead", async () => {
      const { acquireMergeTrainLock } = await import("../merge-train-lock.mjs");

      // Set up a stale lock with a dead PID
      const lockPath = path.join(tmpDir, "mbe-merge-train.lock");
      fs.mkdirSync(lockPath);
      fs.writeFileSync(path.join(lockPath, "pid"), "999999999"); // non-existent PID

      const deadPid = () => false; // injectable: always dead

      const result = acquireMergeTrainLock({ lockDir: tmpDir, isPidAlive: deadPid });

      expect(result.acquired).toBe(true);
      // PID file should now contain current process PID
      const pidFile = path.join(lockPath, "pid");
      expect(parseInt(fs.readFileSync(pidFile, "utf8").trim(), 10)).toBe(process.pid);
    });

    test("reclaims stale lock when mtime is older than staleness window", async () => {
      const { acquireMergeTrainLock } = await import("../merge-train-lock.mjs");

      // Set up an old lock with our own PID (so isPidAlive would say true normally)
      const lockPath = path.join(tmpDir, "mbe-merge-train.lock");
      fs.mkdirSync(lockPath);
      fs.writeFileSync(path.join(lockPath, "pid"), String(process.pid));

      // Backdate mtime by 50 minutes (past the 45-min window)
      const oldTime = new Date(Date.now() - 50 * 60 * 1000);
      fs.utimesSync(lockPath, oldTime, oldTime);

      const result = acquireMergeTrainLock({ lockDir: tmpDir });

      expect(result.acquired).toBe(true);
    });

    test("does not crash on corrupt/empty pid file — treats as reclaimable", async () => {
      const { acquireMergeTrainLock } = await import("../merge-train-lock.mjs");

      const lockPath = path.join(tmpDir, "mbe-merge-train.lock");
      fs.mkdirSync(lockPath);
      fs.writeFileSync(path.join(lockPath, "pid"), ""); // empty / corrupt

      const result = acquireMergeTrainLock({ lockDir: tmpDir });

      expect(result.acquired).toBe(true);
    });
  });

  // ── releaseMergeTrainLock ──────────────────────────────────────────────────

  describe("releaseMergeTrainLock", () => {
    test("removes the lock directory on release", async () => {
      const { acquireMergeTrainLock, releaseMergeTrainLock } =
        await import("../merge-train-lock.mjs");

      acquireMergeTrainLock({ lockDir: tmpDir });
      const lockPath = path.join(tmpDir, "mbe-merge-train.lock");
      expect(fs.existsSync(lockPath)).toBe(true);

      releaseMergeTrainLock({ lockDir: tmpDir });
      expect(fs.existsSync(lockPath)).toBe(false);
    });

    test("is a no-op when lock does not exist", async () => {
      const { releaseMergeTrainLock } = await import("../merge-train-lock.mjs");

      // Should not throw when called without a prior acquire
      expect(() => releaseMergeTrainLock({ lockDir: tmpDir })).not.toThrow();
    });
  });

  // ── heartbeat ─────────────────────────────────────────────────────────────

  describe("heartbeatMergeTrainLock", () => {
    test("touches the lock directory mtime so it is not reclaimed as stale", async () => {
      const { acquireMergeTrainLock, heartbeatMergeTrainLock } =
        await import("../merge-train-lock.mjs");

      acquireMergeTrainLock({ lockDir: tmpDir });
      const lockPath = path.join(tmpDir, "mbe-merge-train.lock");

      // Backdate mtime so it looks stale
      const oldTime = new Date(Date.now() - 50 * 60 * 1000);
      fs.utimesSync(lockPath, oldTime, oldTime);

      heartbeatMergeTrainLock({ lockDir: tmpDir });

      const newMtime = fs.statSync(lockPath).mtimeMs;
      // After heartbeat, mtime should be recent (within last 5 seconds)
      expect(Date.now() - newMtime).toBeLessThan(5000);
    });

    test("is a no-op when lock does not exist", async () => {
      const { heartbeatMergeTrainLock } = await import("../merge-train-lock.mjs");

      expect(() => heartbeatMergeTrainLock({ lockDir: tmpDir })).not.toThrow();
    });
  });
});
