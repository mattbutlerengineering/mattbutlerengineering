import { describe, test, expect } from "vitest";

// Locking behaviour is covered end to end, with real separate processes, in
// merge-train-lock-cli.test.mjs. Zone derivation lives in zone-vocabulary.test.mjs.
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
