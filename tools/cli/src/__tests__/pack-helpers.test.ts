/**
 * Tests for pack.ts helper functions using real ts-morph.
 * These tests don't mock ts-morph, so they exercise the AST skeleton
 * generator functions (truncateType, getSkeleton, detectPriority, getSectionName)
 * that are otherwise unreachable through CLI-level tests.
 *
 * We test packDirectory indirectly by writing a real .ts file to a temp dir
 * and calling the packCommand with that path.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";

// Only mock child_process (used by pack-changed) and keep fs real
vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

const mockExecSync = vi.mocked(execSync);

describe("pack command (real ts-morph skeleton generation)", () => {
  vi.setConfig({ testTimeout: 30_000 });
  let tmpDir: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    mockExecSync.mockReturnValue("" as never);

    // Create a temp directory structure simulating a monorepo package
    tmpDir = mkdtempSync(join(tmpdir(), "pack-test-"));
    // Create pnpm-workspace.yaml so findMonorepoRoot returns tmpDir
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

  it("generates llms.txt from a package with TypeScript interfaces", async () => {
    // Create a real TypeScript file in the temp package dir
    const pkgDir = join(tmpDir, "packages/my-pkg");
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(
      join(pkgDir, "index.ts"),
      `
export interface User {
  id: string;
  email: string;
  name?: string;
}

export type Status = "active" | "inactive";

export enum Role {
  Admin = "admin",
  User = "user",
}

export function greet(name: string): string {
  return \`Hello, \${name}!\`;
}

export const VERSION = "1.0.0";
`.trim()
    );

    await runPack("packages/my-pkg");

    // Should have written the llms.txt
    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("llms.txt");
    expect(exitSpy).not.toHaveBeenCalled();
  }, 30_000);

  it("generates llms.txt from a package with class declarations", async () => {
    const pkgDir = join(tmpDir, "packages/class-pkg");
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(
      join(pkgDir, "service.ts"),
      `
export class UserService {
  private db: unknown;

  async findAll(): Promise<unknown[]> {
    return [];
  }

  async findById(id: string): Promise<unknown | null> {
    return null;
  }

  create(data: Record<string, unknown>): Promise<unknown> {
    return Promise.resolve(data);
  }
}
`.trim()
    );

    await runPack("packages/class-pkg");

    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("llms.txt");
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("generates full output with --full flag", async () => {
    const pkgDir = join(tmpDir, "packages/full-pkg");
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(
      join(pkgDir, "types.ts"),
      `
export interface Config {
  apiUrl: string;
  timeout: number;
}
`.trim()
    );

    await runPack("packages/full-pkg", ["--full"]);

    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("full context");
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("handles --check mode when llms.txt is in sync", async () => {
    const pkgDir = join(tmpDir, "packages/sync-pkg");
    mkdirSync(pkgDir, { recursive: true });
    // Empty package (no .ts files) → skeleton = `<codebase ...>\n</codebase>\n`
    writeFileSync(join(pkgDir, "pnpm-empty.txt"), "");

    // First pack to generate the files
    await runPack("packages/sync-pkg");

    // Reset module cache so the next import gets a fresh instance
    vi.resetModules();

    // Second check should pass (already in sync)
    const { packCommand } = await import("../commands/pack.js");
    await packCommand.parseAsync(["packages/sync-pkg", "--check"], { from: "user" });

    expect(exitSpy).not.toHaveBeenCalled();
    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("in sync");
  });

  it("generates skeletons for arrow function exported variables", async () => {
    const pkgDir = join(tmpDir, "packages/arrow-pkg");
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(
      join(pkgDir, "handlers.ts"),
      `
export const handleRequest = async (req: unknown): Promise<string> => {
  const data = req as Record<string, unknown>;
  return JSON.stringify(data);
};

export const config = {
  timeout: 5000,
  retries: 3,
};
`.trim()
    );

    await runPack("packages/arrow-pkg");

    expect(exitSpy).not.toHaveBeenCalled();
    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("llms.txt");
  });

  it("handles type aliases with union types", async () => {
    const pkgDir = join(tmpDir, "packages/union-pkg");
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(
      join(pkgDir, "types.ts"),
      `
export type Theme = "light" | "dark" | "system";
export type Size = "sm" | "md" | "lg" | "xl";
export type Status = "pending" | "active" | "inactive" | "deleted";
`.trim()
    );

    await runPack("packages/union-pkg");

    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("handles a type alias with a long complex type (triggers truncation)", async () => {
    const pkgDir = join(tmpDir, "packages/complex-pkg");
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(
      join(pkgDir, "types.ts"),
      `
export type ComplexType = Record<string, Map<string, Array<Set<WeakMap<object, Promise<unknown>>>>>>;
`.trim()
    );

    await runPack("packages/complex-pkg");

    expect(exitSpy).not.toHaveBeenCalled();
  });
});
