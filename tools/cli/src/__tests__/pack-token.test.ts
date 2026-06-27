/**
 * Token-aware context pack tests.
 *
 * Covers:
 * 1. countTokens() — fast approximation (chars / 4), documented behavior
 * 2. Under-budget — no warning emitted, token weight logged
 * 3. Over-budget — warning with package name + overage
 * 4. Weight reporting at generation time
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

vi.mocked(execSync);

describe("countTokens", () => {
  it("returns 0 for empty string", async () => {
    const { countTokens } = await import("../token-counter.js");
    expect(countTokens("")).toBe(0);
  });

  it("approximates token count as ceil(length / 4)", async () => {
    const { countTokens } = await import("../token-counter.js");
    // 8 chars → 2 tokens
    expect(countTokens("hello wo")).toBe(2);
    // 9 chars → ceil(9/4) = 3 tokens
    expect(countTokens("hello wor")).toBe(3);
    // 4 chars → 1 token
    expect(countTokens("word")).toBe(1);
    // 1 char → 1 token
    expect(countTokens("a")).toBe(1);
  });

  it("handles multi-line text", async () => {
    const { countTokens } = await import("../token-counter.js");
    const text = "line one\nline two\n";
    expect(countTokens(text)).toBe(Math.ceil(text.length / 4));
  });
});

describe("pack token weight reporting", () => {
  vi.setConfig({ testTimeout: 30_000 });
  let tmpDir: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);

    tmpDir = mkdtempSync(join(tmpdir(), "pack-token-"));
    writeFileSync(join(tmpDir, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");
    vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  async function runPack(targetPath: string, extraArgs: string[] = []): Promise<void> {
    const { packCommand } = await import("../commands/pack.js");
    await packCommand.parseAsync([targetPath, ...extraArgs], { from: "user" });
  }

  it("reports token weight at generation time (under-budget path)", async () => {
    const pkgDir = join(tmpDir, "packages/token-pkg");
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(
      join(pkgDir, "types.ts"),
      `export interface Config { apiUrl: string; timeout: number; }`
    );

    await runPack("packages/token-pkg");

    expect(exitSpy).not.toHaveBeenCalled();
    const logOutput = logSpy.mock.calls.flat().join("\n");
    // Token weight must appear in the generation log
    expect(logOutput).toMatch(/~\d+ tokens/);
  });

  it("does NOT warn when llms-full.txt is under the token budget", async () => {
    const pkgDir = join(tmpDir, "packages/under-budget");
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(join(pkgDir, "types.ts"), `export interface Small { id: string; }`);

    await runPack("packages/under-budget");

    expect(exitSpy).not.toHaveBeenCalled();
    const warnOutput = warnSpy.mock.calls.flat().join("\n");
    expect(warnOutput).not.toMatch(/token budget/i);
  });

  it("warns with package name and overage when llms-full.txt is over budget", async () => {
    // Create a large-ish TypeScript file that will exceed a tiny test budget.
    // We control the budget via the TOKEN_BUDGET_FULL_TXT export and override it.
    const pkgDir = join(tmpDir, "packages/over-budget");
    mkdirSync(pkgDir, { recursive: true });

    // Generate content large enough to exceed token budget=1
    const content = `export interface BigType { ${"a: string; ".repeat(20)} }`;
    writeFileSync(join(pkgDir, "types.ts"), content);

    // Import pack internals with a minimal budget to force the over-budget path.
    // packDirectory is not exported, so we test via the command with mocked budget.
    // We override TOKEN_BUDGET_FULL_TXT by setting the env variable.
    const origEnv = process.env["MBE_TOKEN_BUDGET"];
    process.env["MBE_TOKEN_BUDGET"] = "1";
    try {
      await runPack("packages/over-budget");
    } finally {
      if (origEnv === undefined) {
        delete process.env["MBE_TOKEN_BUDGET"];
      } else {
        process.env["MBE_TOKEN_BUDGET"] = origEnv;
      }
    }

    expect(exitSpy).not.toHaveBeenCalled();
    const warnOutput = warnSpy.mock.calls.flat().join("\n");
    // Warning must mention the package path and token overage
    expect(warnOutput).toMatch(/token budget/i);
    expect(warnOutput).toMatch(/over-budget/);
    expect(warnOutput).toMatch(/overage/i);
  });

  it("does not alter generated file content when over-budget (warn-only)", async () => {
    const pkgDir = join(tmpDir, "packages/warn-only");
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(
      join(pkgDir, "types.ts"),
      `export interface WarnOnly { id: string; name: string; }`
    );

    // First run: normal budget (generate baseline)
    await runPack("packages/warn-only");
    vi.resetModules();
    const { readFileSync } = await import("node:fs");
    const baseline = readFileSync(join(pkgDir, "llms-full.txt"), "utf-8");

    // Second run: tiny budget (should warn but NOT truncate)
    vi.resetModules();
    const origEnv = process.env["MBE_TOKEN_BUDGET"];
    process.env["MBE_TOKEN_BUDGET"] = "1";
    try {
      logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
      await runPack("packages/warn-only");
    } finally {
      if (origEnv === undefined) {
        delete process.env["MBE_TOKEN_BUDGET"];
      } else {
        process.env["MBE_TOKEN_BUDGET"] = origEnv;
      }
    }

    vi.resetModules();
    const { readFileSync: rfs2 } = await import("node:fs");
    const afterBudget = rfs2(join(pkgDir, "llms-full.txt"), "utf-8");

    // Content must be byte-identical regardless of token budget (warn-only)
    expect(afterBudget).toBe(baseline);
  });
});
