/**
 * `mbe pack` must stay syntax-only. ts-morph's `isExported()` falls back to
 * `getSymbol()` when a node has no `export` keyword, and the first symbol
 * lookup builds a type-checker Program over every file in the Project,
 * resolving every import. For the root `.` pack that was ~82s of ~94s CPU
 * (profiled 2026-10-06), and the root pack is the long pole of `pnpm regen`
 * in CI's Build job. Both call sites were on VariableStatements, which have
 * no symbol, so the semantic fallback could only ever return false.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { Node } from "ts-morph";

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

const mockExecSync = vi.mocked(execSync);

describe("pack is syntax-only", () => {
  vi.setConfig({ testTimeout: 30_000 });
  let tmpDir: string;

  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    mockExecSync.mockReturnValue("" as never);

    tmpDir = mkdtempSync(join(tmpdir(), "pack-syntax-only-"));
    writeFileSync(join(tmpDir, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");
    vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("never resolves symbols, and still keeps exported consts and drops local ones", async () => {
    const pkgDir = join(tmpDir, "packages/syntax-only-fixture");
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(
      join(pkgDir, "consts.ts"),
      `
const LOCAL_CONST = "local";
export const EXPORTED_CONST: string = LOCAL_CONST;
`.trim()
    );
    const getSymbol = vi.spyOn(Node.prototype, "getSymbol");

    const { packCommand } = await import("../commands/pack.js");
    await packCommand.parseAsync(["packages/syntax-only-fixture"], { from: "user" });

    expect(getSymbol).not.toHaveBeenCalled();
    const output = readFileSync(join(pkgDir, "llms.txt"), "utf-8");
    expect(output).toContain("export const EXPORTED_CONST: string;");
    expect(output).not.toContain("LOCAL_CONST:");
  });
});
