/**
 * Regression test for #5089: pack.ts's `statementsPerFile = 2` cap silently
 * dropped a file's top-level declarations past the 2nd from llms.txt and
 * llms-full.txt, with no warning and no CI failure. #4449 fixed one instance
 * of this class by reordering declarations in a single source file, but the
 * underlying flat per-file cap remained and re-triggered the moment any file
 * gained a 3rd top-level exported statement (packages/rialto's
 * useFocusTrap.ts, via #5087).
 *
 * This test packs a synthetic fixture with 4 top-level exported statements
 * and asserts all of them — not just the first 2 — appear in the generated
 * llms.txt output.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

const mockExecSync = vi.mocked(execSync);

describe("pack statement cap (#5089)", () => {
  vi.setConfig({ testTimeout: 30_000 });
  let tmpDir: string;

  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    mockExecSync.mockReturnValue("" as never);

    tmpDir = mkdtempSync(join(tmpdir(), "pack-statement-cap-"));
    writeFileSync(join(tmpDir, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");
    vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("includes every top-level exported statement, not just the first 2", async () => {
    const pkgDir = join(tmpDir, "packages/statement-cap-fixture");
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(
      join(pkgDir, "many-exports.ts"),
      `
export const FIRST_CONST = "first";
export const SECOND_CONST = "second";
export interface ThirdInterface {
  id: string;
}
export function fourthFunction(): void {
  return;
}
`.trim()
    );

    const { packCommand } = await import("../commands/pack.js");
    await packCommand.parseAsync(["packages/statement-cap-fixture"], { from: "user" });

    const output = readFileSync(join(pkgDir, "llms.txt"), "utf-8");

    expect(output).toContain("FIRST_CONST");
    expect(output).toContain("SECOND_CONST");
    expect(output).toContain("ThirdInterface");
    expect(output).toContain("export function fourthFunction(");
  });
});
