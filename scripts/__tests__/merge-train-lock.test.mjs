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

  // ── zone derivation ─────────────────────────────────────────────────────────

  describe("zoneForPaths", () => {
    test("derives apps/<x> zone from a changed path", async () => {
      const { zoneForPaths } = await import("../merge-train-lock.mjs");
      expect(zoneForPaths(["apps/hospitality/src/foo.ts"])).toBe("apps/hospitality");
    });

    test("derives packages/<x> and services/<x> zones", async () => {
      const { zoneForPaths } = await import("../merge-train-lock.mjs");
      expect(zoneForPaths(["packages/rialto/src/Button.tsx"])).toBe("packages/rialto");
      expect(zoneForPaths(["services/reservations/src/app.ts"])).toBe("services/reservations");
    });

    test("maps top-level / non-workspace files to the 'root' zone", async () => {
      const { zoneForPaths } = await import("../merge-train-lock.mjs");
      expect(zoneForPaths(["package.json"])).toBe("root");
      expect(zoneForPaths(["docs/architecture/x.md", "scripts/foo.mjs"])).toBe("root");
    });

    test("returns null (→ global lock) when files span multiple zones", async () => {
      const { zoneForPaths } = await import("../merge-train-lock.mjs");
      expect(zoneForPaths(["apps/hospitality/src/a.ts", "packages/rialto/src/b.ts"])).toBeNull();
    });

    test("returns null for an empty changeset", async () => {
      const { zoneForPaths } = await import("../merge-train-lock.mjs");
      expect(zoneForPaths([])).toBeNull();
    });
  });

  // ── frontend-tree predicate ──────────────────────────────────────────────
  // A DIFFERENT question from zoneForPath: "which workspace zone owns this
  // path" vs. "is this path front-end code". Every apps/packages/services
  // path has a zone, but only apps/** and packages/rialto/** are frontend.

  describe("isFrontendPath", () => {
    test("apps/** paths are frontend", async () => {
      const { isFrontendPath } = await import("../merge-train-lock.mjs");
      expect(isFrontendPath("apps/hospitality/src/App.tsx")).toBe(true);
    });

    test("packages/rialto/** paths are frontend", async () => {
      const { isFrontendPath } = await import("../merge-train-lock.mjs");
      expect(isFrontendPath("packages/rialto/src/Button.tsx")).toBe(true);
    });

    test("other packages/** paths are NOT frontend", async () => {
      const { isFrontendPath } = await import("../merge-train-lock.mjs");
      expect(isFrontendPath("packages/api-client/src/index.ts")).toBe(false);
    });

    test("services/** paths are NOT frontend", async () => {
      const { isFrontendPath } = await import("../merge-train-lock.mjs");
      expect(isFrontendPath("services/reservations/src/app.ts")).toBe(false);
    });
  });

  describe("zoneForPath vs isFrontendPath — genuinely different questions", () => {
    test("a path can own a real (non-root) zone without being a frontend path", async () => {
      const { zoneForPath, isFrontendPath } = await import("../merge-train-lock.mjs");
      const filePath = "services/reservations/src/app.ts";

      // Has a real, non-root zone...
      expect(zoneForPath(filePath)).toBe("services/reservations");
      // ...yet is not a frontend path. If these two predicates were ever
      // merged into one (e.g. "isFrontendPath = zoneForPath(p) !== 'root'"),
      // this path would flip to `true` and this assertion would fail.
      expect(isFrontendPath(filePath)).toBe(false);
    });
  });

  describe("lockNameForZone", () => {
    test("uses the global lock name when zone is null/undefined (backward compat)", async () => {
      const { lockNameForZone } = await import("../merge-train-lock.mjs");
      expect(lockNameForZone()).toBe("mbe-merge-train.lock");
      expect(lockNameForZone(null)).toBe("mbe-merge-train.lock");
    });

    test("derives a filesystem-safe per-zone lock name", async () => {
      const { lockNameForZone } = await import("../merge-train-lock.mjs");
      expect(lockNameForZone("apps/hospitality")).toBe("mbe-merge-train.apps__hospitality.lock");
    });
  });

  // ── per-zone locking ────────────────────────────────────────────────────────

  describe("per-zone locking", () => {
    test("two different zones acquire concurrently (both succeed)", async () => {
      const { acquireMergeTrainLock } = await import("../merge-train-lock.mjs");

      const a = acquireMergeTrainLock({ lockDir: tmpDir, zone: "apps/hospitality" });
      const b = acquireMergeTrainLock({ lockDir: tmpDir, zone: "packages/rialto" });

      expect(a.acquired).toBe(true);
      expect(b.acquired).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, "mbe-merge-train.apps__hospitality.lock"))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, "mbe-merge-train.packages__rialto.lock"))).toBe(true);
    });

    test("same zone serializes — second acquire is blocked while first holds", async () => {
      const { acquireMergeTrainLock } = await import("../merge-train-lock.mjs");

      const first = acquireMergeTrainLock({ lockDir: tmpDir, zone: "apps/hospitality" });
      const second = acquireMergeTrainLock({
        lockDir: tmpDir,
        zone: "apps/hospitality",
        isPidAlive: () => true,
      });

      expect(first.acquired).toBe(true);
      expect(second.acquired).toBe(false);
      expect(second.owner).toBe(process.pid);
    });

    test("zoned lock does not collide with the global lock", async () => {
      const { acquireMergeTrainLock } = await import("../merge-train-lock.mjs");

      const global = acquireMergeTrainLock({ lockDir: tmpDir });
      const zoned = acquireMergeTrainLock({
        lockDir: tmpDir,
        zone: "apps/hospitality",
        isPidAlive: () => true,
      });

      expect(global.acquired).toBe(true);
      expect(zoned.acquired).toBe(true);
    });

    test("stale reclaim works per zone (dead owner)", async () => {
      const { acquireMergeTrainLock } = await import("../merge-train-lock.mjs");

      const lockPath = path.join(tmpDir, "mbe-merge-train.apps__hospitality.lock");
      fs.mkdirSync(lockPath);
      fs.writeFileSync(path.join(lockPath, "pid"), "999999999");

      const result = acquireMergeTrainLock({
        lockDir: tmpDir,
        zone: "apps/hospitality",
        isPidAlive: () => false,
      });

      expect(result.acquired).toBe(true);
      expect(parseInt(fs.readFileSync(path.join(lockPath, "pid"), "utf8").trim(), 10)).toBe(
        process.pid
      );
    });

    test("PID-aware release removes only the zone's lock", async () => {
      const { acquireMergeTrainLock, releaseMergeTrainLock } =
        await import("../merge-train-lock.mjs");

      acquireMergeTrainLock({ lockDir: tmpDir, zone: "apps/hospitality" });
      acquireMergeTrainLock({ lockDir: tmpDir, zone: "packages/rialto" });

      releaseMergeTrainLock({ lockDir: tmpDir, zone: "apps/hospitality" });

      expect(fs.existsSync(path.join(tmpDir, "mbe-merge-train.apps__hospitality.lock"))).toBe(
        false
      );
      expect(fs.existsSync(path.join(tmpDir, "mbe-merge-train.packages__rialto.lock"))).toBe(true);
    });

    test("heartbeat refreshes only the zone's lock mtime", async () => {
      const { acquireMergeTrainLock, heartbeatMergeTrainLock } =
        await import("../merge-train-lock.mjs");

      acquireMergeTrainLock({ lockDir: tmpDir, zone: "apps/hospitality" });
      const lockPath = path.join(tmpDir, "mbe-merge-train.apps__hospitality.lock");
      const oldTime = new Date(Date.now() - 50 * 60 * 1000);
      fs.utimesSync(lockPath, oldTime, oldTime);

      heartbeatMergeTrainLock({ lockDir: tmpDir, zone: "apps/hospitality" });

      expect(Date.now() - fs.statSync(lockPath).mtimeMs).toBeLessThan(5000);
    });
  });
});
