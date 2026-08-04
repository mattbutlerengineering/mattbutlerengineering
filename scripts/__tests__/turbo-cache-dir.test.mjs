import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const turboJsonPath = join(import.meta.dirname, "..", "..", "turbo.json");

describe("turbo.json cacheDir", () => {
  it("explicitly sets a relative cacheDir", () => {
    // Turbo silently shares its local filesystem cache across git worktrees
    // of the same repo (a "shared worktree cache", keyed by content hash but
    // resolved to whichever worktree turbo detects as "main") *unless*
    // `cacheDir` is explicitly configured in turbo.json. That auto-sharing
    // caused a race between concurrent implement-queue worktree builds and
    // the main checkout's build, producing a stale `dist/` output (#3593).
    // Declaring `cacheDir` explicitly (even at turbo's own default path)
    // makes every checkout — main or any worktree — use its own local cache
    // directory instead of turbo's auto-detected shared one.
    const turboConfig = JSON.parse(readFileSync(turboJsonPath, "utf8"));

    expect(turboConfig.cacheDir).toBeTruthy();
    expect(turboConfig.cacheDir.startsWith("/")).toBe(false);
  });
});
