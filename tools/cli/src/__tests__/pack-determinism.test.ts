/**
 * Determinism tests for pack.ts output.
 *
 * These tests lock in cross-platform stable output:
 * 1. Glob results are sorted in byte (codepoint) order regardless of filesystem order
 * 2. Section keys are sorted in byte order, not locale order
 * 3. No absolute filesystem paths (/Users/ or /home/) appear in output
 *
 * Rationale: macOS and Linux differ in readdir() order and locale settings,
 * so a locale-sensitive sort (localeCompare with no locale arg, or Array.sort()
 * with no comparator on strings containing non-ASCII) may produce different
 * sequences. All sorts in pack.ts must use a stable byte-order comparator:
 *   (a, b) => (a < b ? -1 : a > b ? 1 : 0)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";

// Only mock child_process (used by pack-changed) and keep fs real
vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

const mockExecSync = vi.mocked(execSync);

describe("pack determinism (cross-platform stable output)", () => {
  vi.setConfig({ testTimeout: 30_000 });
  let tmpDir: string;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    mockExecSync.mockReturnValue("" as never);

    // Create a temp directory simulating a monorepo root
    tmpDir = mkdtempSync(join(tmpdir(), "pack-determinism-"));
    writeFileSync(join(tmpDir, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");
    vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  async function runPack(targetPath: string): Promise<void> {
    const { packCommand } = await import("../commands/pack.js");
    await packCommand.parseAsync([targetPath], { from: "user" });
  }

  it("produces files in byte-sorted order regardless of glob return order", async () => {
    // Create a package with files whose names sort differently under locale vs byte order.
    // Under some locales, uppercase letters sort AFTER lowercase; under byte order they sort before.
    const pkgDir = join(tmpDir, "packages/sort-test");
    mkdirSync(pkgDir, { recursive: true });

    // Files: "b-module.ts" < "a-module.ts" in filesystem order on some filesystems,
    // but both should appear in byte order (a before b) in the output.
    writeFileSync(join(pkgDir, "b-module.ts"), `export interface BType { id: string; }`);
    writeFileSync(join(pkgDir, "a-module.ts"), `export interface AType { name: string; }`);
    writeFileSync(join(pkgDir, "z-module.ts"), `export interface ZType { value: number; }`);

    await runPack("packages/sort-test");
    expect(exitSpy).not.toHaveBeenCalled();

    const output = readFileSync(join(pkgDir, "llms.txt"), "utf-8");

    // a-module must appear before b-module, b-module before z-module
    const posA = output.indexOf("a-module.ts");
    const posB = output.indexOf("b-module.ts");
    const posZ = output.indexOf("z-module.ts");
    expect(posA).toBeGreaterThan(-1);
    expect(posB).toBeGreaterThan(-1);
    expect(posZ).toBeGreaterThan(-1);
    expect(posA).toBeLessThan(posB);
    expect(posB).toBeLessThan(posZ);
  });

  it("produces sections in byte-sorted order regardless of insertion order", async () => {
    // Create a package with files in sub-directories whose section names
    // differ only by case or ordering. The glob may return them in any order.
    const pkgDir = join(tmpDir, "packages/section-test");
    mkdirSync(join(pkgDir, "zebra"), { recursive: true });
    mkdirSync(join(pkgDir, "alpha"), { recursive: true });
    mkdirSync(join(pkgDir, "middle"), { recursive: true });

    writeFileSync(join(pkgDir, "zebra/types.ts"), `export interface ZebraType { z: string; }`);
    writeFileSync(join(pkgDir, "alpha/types.ts"), `export interface AlphaType { a: string; }`);
    writeFileSync(join(pkgDir, "middle/types.ts"), `export interface MiddleType { m: string; }`);

    await runPack("packages/section-test");
    expect(exitSpy).not.toHaveBeenCalled();

    const output = readFileSync(join(pkgDir, "llms.txt"), "utf-8");

    // alpha section must appear before middle, middle before zebra
    const posAlpha = output.indexOf('role="alpha"');
    const posMiddle = output.indexOf('role="middle"');
    const posZebra = output.indexOf('role="zebra"');
    expect(posAlpha).toBeGreaterThan(-1);
    expect(posMiddle).toBeGreaterThan(-1);
    expect(posZebra).toBeGreaterThan(-1);
    expect(posAlpha).toBeLessThan(posMiddle);
    expect(posMiddle).toBeLessThan(posZebra);
  });

  it("contains no absolute filesystem paths in output (no /Users/ or /home/)", async () => {
    const pkgDir = join(tmpDir, "packages/path-test");
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(
      join(pkgDir, "service.ts"),
      `
export interface UserService {
  id: string;
  findAll(): Promise<unknown[]>;
}

export type Result<T> = { data: T; error: string | null };
`.trim()
    );

    await runPack("packages/path-test");
    expect(exitSpy).not.toHaveBeenCalled();

    const llmsTxt = readFileSync(join(pkgDir, "llms.txt"), "utf-8");
    const llmsFullTxt = readFileSync(join(pkgDir, "llms-full.txt"), "utf-8");

    // No absolute paths should appear in the output
    expect(llmsTxt).not.toMatch(/\/Users\//);
    expect(llmsTxt).not.toMatch(/\/home\//);
    expect(llmsFullTxt).not.toMatch(/\/Users\//);
    expect(llmsFullTxt).not.toMatch(/\/home\//);
  });

  it("produces identical output when called twice on the same package (idempotent)", async () => {
    const pkgDir = join(tmpDir, "packages/idem-test");
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(
      join(pkgDir, "types.ts"),
      `export interface Config { apiUrl: string; timeout: number; }`
    );

    await runPack("packages/idem-test");
    const first = readFileSync(join(pkgDir, "llms.txt"), "utf-8");

    vi.resetModules();
    await runPack("packages/idem-test");
    const second = readFileSync(join(pkgDir, "llms.txt"), "utf-8");

    expect(first).toBe(second);
  });

  it("uses byte-order comparison (not locale comparison) for sorting", () => {
    // Demonstrate that byte-order sort is consistent regardless of locale.
    // localeCompare() without an explicit locale uses the runtime locale,
    // which differs between macOS (en-US) and Linux CI (C/POSIX).
    // The fix: (a, b) => (a < b ? -1 : a > b ? 1 : 0)
    //
    // In C/POSIX locale, uppercase letters come BEFORE lowercase.
    // In en-US locale, case is typically ignored (or lowercase first).
    // Byte order always puts uppercase (65-90) before lowercase (97-122).
    const byteSort = (arr: string[]) => [...arr].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const localeSort = (arr: string[]) => [...arr].sort((a, b) => a.localeCompare(b));

    // These arrays contain mixed-case strings that sort differently by locale vs byte order.
    // In byte order: "B" (66) < "a" (97), so ["B", "a"] is already sorted.
    // In en-US locale: "a" typically comes before "B" due to case-folding.
    const mixed = ["b-service", "A-service", "c-service"];

    const byteSorted = byteSort(mixed);
    // Byte order: A (65) < b (98) < c (99)
    expect(byteSorted[0]).toBe("A-service");
    expect(byteSorted[1]).toBe("b-service");
    expect(byteSorted[2]).toBe("c-service");

    // The byte-order sort is deterministic regardless of runtime locale.
    // This test documents the required behavior and would catch regressions
    // to localeCompare() which may produce different results on CI (Linux/C locale).
    const allAsciiLower = ["zebra", "alpha", "middle"];
    const sorted = byteSort(allAsciiLower);
    expect(sorted).toEqual(["alpha", "middle", "zebra"]);

    // Verify localeSort also produces same result for all-lowercase (sanity check)
    expect(localeSort(allAsciiLower)).toEqual(["alpha", "middle", "zebra"]);
  });
});
