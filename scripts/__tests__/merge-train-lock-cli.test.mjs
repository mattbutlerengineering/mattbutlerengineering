import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../merge-train-lock.mjs"
);

// Each call is a REAL, separate, short-lived node process — exactly how the
// queue profile invokes the lock. No injection: the owner process is dead by
// the time the next call starts, so exclusion must not depend on PID liveness.
function run(args, lockDir) {
  const res = spawnSync("node", [SCRIPT, ...args], {
    encoding: "utf8",
    env: { ...process.env, MBE_MERGE_TRAIN_LOCK_DIR: lockDir },
  });
  return { code: res.status, out: res.stdout.trim() ? JSON.parse(res.stdout) : null };
}

describe("merge-train-lock CLI", () => {
  let lockDir;
  beforeEach(() => {
    lockDir = fs.mkdtempSync(path.join(os.tmpdir(), "mtl-cli-"));
  });
  afterEach(() => {
    fs.rmSync(lockDir, { recursive: true, force: true });
  });

  test("second session is told 'held' after the first acquirer process has exited", () => {
    const first = run(["acquire", "--zone", "apps/x", "--owner", "session-a"], lockDir);
    expect(first.code).toBe(0);
    expect(first.out).toMatchObject({ acquired: true, owner: "session-a" });

    const second = run(["acquire", "--zone", "apps/x", "--owner", "session-b"], lockDir);
    expect(second.code).toBe(1);
    expect(second.out).toMatchObject({ acquired: false, owner: "session-a" });
  });

  test("re-acquire by the same owner is idempotent", () => {
    run(["acquire", "--zone", "apps/x", "--owner", "session-a"], lockDir);
    const again = run(["acquire", "--zone", "apps/x", "--owner", "session-a"], lockDir);
    expect(again.code).toBe(0);
  });

  test("different zones do not exclude each other; omitted zone is the global lock", () => {
    expect(run(["acquire", "--zone", "apps/x", "--owner", "a"], lockDir).code).toBe(0);
    expect(run(["acquire", "--zone", "apps/y", "--owner", "b"], lockDir).code).toBe(0);
    expect(run(["acquire", "--owner", "c"], lockDir).code).toBe(0);
    expect(run(["acquire", "--owner", "d"], lockDir).code).toBe(1);
  });

  test("release by a non-owner is refused and the lock stays held", () => {
    run(["acquire", "--zone", "apps/x", "--owner", "session-a"], lockDir);
    const bad = run(["release", "--zone", "apps/x", "--owner", "session-b"], lockDir);
    expect(bad.code).toBe(1);
    expect(run(["acquire", "--zone", "apps/x", "--owner", "session-b"], lockDir).code).toBe(1);
  });

  test("release by the owner frees the zone for the next session", () => {
    run(["acquire", "--zone", "apps/x", "--owner", "session-a"], lockDir);
    expect(run(["release", "--zone", "apps/x", "--owner", "session-a"], lockDir).code).toBe(0);
    expect(run(["acquire", "--zone", "apps/x", "--owner", "session-b"], lockDir).code).toBe(0);
  });

  test("release with no lock held is a successful no-op", () => {
    expect(run(["release", "--zone", "apps/x", "--owner", "a"], lockDir).code).toBe(0);
  });

  test("heartbeat refreshes mtime for the owner and is refused for a non-owner", () => {
    run(["acquire", "--zone", "apps/x", "--owner", "session-a"], lockDir);
    const lockPath = path.join(lockDir, "mbe-merge-train.apps__x.lock");
    const old = new Date(Date.now() - 50 * 60 * 1000);
    fs.utimesSync(lockPath, old, old);

    expect(run(["heartbeat", "--zone", "apps/x", "--owner", "session-b"], lockDir).code).toBe(1);
    expect(Date.now() - fs.statSync(lockPath).mtimeMs).toBeGreaterThan(40 * 60 * 1000);

    expect(run(["heartbeat", "--zone", "apps/x", "--owner", "session-a"], lockDir).code).toBe(0);
    expect(Date.now() - fs.statSync(lockPath).mtimeMs).toBeLessThan(5000);
  });

  test("a lock whose mtime is past the 45-min window is reclaimed by another session", () => {
    run(["acquire", "--zone", "apps/x", "--owner", "session-a"], lockDir);
    const lockPath = path.join(lockDir, "mbe-merge-train.apps__x.lock");
    const old = new Date(Date.now() - 50 * 60 * 1000);
    fs.utimesSync(lockPath, old, old);

    const taken = run(["acquire", "--zone", "apps/x", "--owner", "session-b"], lockDir);
    expect(taken.code).toBe(0);
    expect(taken.out.owner).toBe("session-b");
  });

  test("missing --owner is a usage error (exit 2)", () => {
    expect(run(["acquire", "--zone", "apps/x"], lockDir).code).toBe(2);
  });
});
