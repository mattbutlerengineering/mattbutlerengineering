/**
 * Regression test for #4449: pack.ts's `statementsPerFile = 2` cap takes a
 * file's top-level declarations in source order. If module-private helpers
 * are declared above a file's exported surface, they evict that surface from
 * the generated llms.txt/llms-full.txt bundles with no error, no drift, and
 * no failing check anywhere else — the bundle just silently stops describing
 * the file's public API.
 *
 * This test packs the real useTapeChartLayout.ts source (not a synthetic
 * fixture) so a future edit that re-introduces private helpers above the
 * exported `useTapeChartLayout` hook fails here instead of going unnoticed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { findMonorepoRoot } from "../monorepo-root.js";

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

const mockExecSync = vi.mocked(execSync);

const REPO_ROOT = findMonorepoRoot(dirname(new URL(import.meta.url).pathname));
const SOURCE_FILE = join(
  REPO_ROOT,
  "packages/rialto/src/components/TapeChart/useTapeChartLayout.ts"
);

describe("pack declaration order — useTapeChartLayout.ts (#4449)", () => {
  let tmpDir: string;

  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    mockExecSync.mockReturnValue("" as never);

    tmpDir = mkdtempSync(join(tmpdir(), "pack-tapechart-"));
    writeFileSync(join(tmpDir, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");
    vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("includes the exported useTapeChartLayout hook within the 2-statement-per-file cap", async () => {
    const pkgDir = join(tmpDir, "packages/tape-chart-fixture");
    mkdirSync(pkgDir, { recursive: true });
    copyFileSync(SOURCE_FILE, join(pkgDir, "useTapeChartLayout.ts"));

    const { packCommand } = await import("../commands/pack.js");
    await packCommand.parseAsync(["packages/tape-chart-fixture"], { from: "user" });

    const output = readFileSync(join(pkgDir, "llms.txt"), "utf-8");

    // Assert on the hook's actual signature text, not just its filename —
    // `<file path="useTapeChartLayout.ts">` would satisfy a bare substring
    // match on the name even when the hook itself was evicted by the cap.
    expect(output).toContain("export function useTapeChartLayout(");
  });
});
