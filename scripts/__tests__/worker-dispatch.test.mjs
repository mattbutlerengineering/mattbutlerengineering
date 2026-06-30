import { describe, test, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("worker-dispatch", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "worker-dispatch-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("canDispatchWorkers", () => {
    test("allows dispatch when under the worker capacity ceiling", async () => {
      const { canDispatchWorkers } = await import("../worker-dispatch.mjs");
      const result = canDispatchWorkers({ activeWorkers: 0, maxWorkers: 3 });
      expect(result.allowed).toBe(true);
    });

    test("blocks dispatch only when at/over the worker capacity ceiling", async () => {
      const { canDispatchWorkers } = await import("../worker-dispatch.mjs");
      const result = canDispatchWorkers({ activeWorkers: 3, maxWorkers: 3 });
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("worker-capacity");
    });

    test("dispatch is INDEPENDENT of the merge train — a held merge-train lock does not block it", async () => {
      const { acquireMergeTrainLock } = await import("../merge-train-lock.mjs");
      const { canDispatchWorkers } = await import("../worker-dispatch.mjs");

      // A merge train is actively running (lock held) in this repo.
      const lock = acquireMergeTrainLock({ lockDir: tmpDir });
      expect(lock.acquired).toBe(true);

      // Worker dispatch must still be allowed — it never consults the lock.
      const result = canDispatchWorkers({ activeWorkers: 0, maxWorkers: 3 });
      expect(result.allowed).toBe(true);
    });

    test("uses the default capacity ceiling when maxWorkers is omitted", async () => {
      const { canDispatchWorkers, MAX_CONCURRENT_WORKERS } = await import("../worker-dispatch.mjs");
      const atCeiling = canDispatchWorkers({ activeWorkers: MAX_CONCURRENT_WORKERS });
      expect(atCeiling.allowed).toBe(false);
      const underCeiling = canDispatchWorkers({ activeWorkers: MAX_CONCURRENT_WORKERS - 1 });
      expect(underCeiling.allowed).toBe(true);
    });

    test("treats a missing activeWorkers as zero (allows dispatch)", async () => {
      const { canDispatchWorkers } = await import("../worker-dispatch.mjs");
      expect(canDispatchWorkers().allowed).toBe(true);
    });
  });
});
