import { readFileSync } from "node:fs";
import { describe, it, expect, vi } from "vitest";
import {
  ensureWorkspaceBuild,
  RIALTO_DIST_MARKER,
  RIALTO_BUILD_ARGS,
} from "../lib/ensure-workspace-build.mjs";

/**
 * e2e-hospitality-shards.test.mjs lists Playwright specs that import rialto,
 * which resolves to dist/. In a fresh cloud session dist/ is absent and the
 * listing fails with a module-resolution error (#10179). The test builds what
 * it needs when it is missing, and never when it is present (CI builds first).
 */
describe("ensureWorkspaceBuild", () => {
  const root = "/repo";

  it("does nothing when the marker file exists, so CI pays no build", () => {
    const run = vi.fn();
    const result = ensureWorkspaceBuild({ root, exists: () => true, run });
    expect(run).not.toHaveBeenCalled();
    expect(result).toBe("present");
  });

  it("builds the rialto closure when the marker file is missing", () => {
    const run = vi.fn(() => ({ status: 0 }));
    const exists = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    const result = ensureWorkspaceBuild({ root, exists, run });
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(
      "pnpm",
      RIALTO_BUILD_ARGS,
      expect.objectContaining({ cwd: root })
    );
    expect(result).toBe("built");
  });

  it("builds rialto and its dependencies, not rialto alone", () => {
    expect(RIALTO_BUILD_ARGS).toEqual([
      "build",
      "--filter",
      "@mattbutlerengineering/rialto^...",
      "--filter",
      "@mattbutlerengineering/rialto",
    ]);
    expect(RIALTO_DIST_MARKER).toBe("packages/rialto/dist/lib/providers/index.js");
  });

  it("throws, naming the dist path and the command, when the build fails", () => {
    const run = () => ({ status: 1 });
    expect(() => ensureWorkspaceBuild({ root, exists: () => false, run })).toThrow(
      /packages\/rialto\/dist.*pnpm build --filter/s
    );
  });

  it("is wired into the shards test, so an unbuilt tree cannot rediscover #10179", () => {
    const source = readFileSync(
      new URL("./e2e-hospitality-shards.test.mjs", import.meta.url),
      "utf8"
    );
    expect(source).toMatch(/beforeAll\(\(\) => \{\s*ensureWorkspaceBuild\(/);
    // The listing must still assert no load errors, so it can never pass silently.
    expect(source).toContain("expect(json.errors).toEqual([]);");
  });

  it("throws when the build exits 0 but the marker is still absent", () => {
    const run = () => ({ status: 0 });
    expect(() => ensureWorkspaceBuild({ root, exists: () => false, run })).toThrow(
      /packages\/rialto\/dist/
    );
  });
});
