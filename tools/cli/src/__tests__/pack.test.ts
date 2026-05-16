import { describe, it, expect, vi, beforeEach } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { glob } from "glob";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

// ts-morph is complex - mock it entirely
vi.mock("ts-morph", () => ({
  Project: class {
    addSourceFileAtPath() {
      return {
        getStatements: () => [],
      };
    }
  },
  Node: {
    isFunctionDeclaration: () => false,
    isMethodDeclaration: () => false,
    isConstructorDeclaration: () => false,
    isArrowFunction: () => false,
    isClassDeclaration: () => false,
    isInterfaceDeclaration: () => false,
    isTypeAliasDeclaration: () => false,
    isEnumDeclaration: () => false,
    isVariableStatement: () => false,
    isUnionTypeNode: () => false,
    isObjectLiteralExpression: () => false,
    isArrayLiteralExpression: () => false,
  },
}));

vi.mock("glob", () => ({
  glob: vi.fn(),
}));

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);
const mockExecSync = vi.mocked(execSync);
const mockGlob = vi.mocked(glob);

describe("pack command", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    vi.spyOn(process, "cwd").mockReturnValue("/repo");
    // Default glob mock: return empty array (no .ts files found)
    mockGlob.mockResolvedValue([]);
  });

  async function runPack(args: string[]): Promise<void> {
    const { packCommand } = await import("../commands/pack.js");
    await packCommand.parseAsync(args, { from: "user" });
  }

  async function runPackChanged(args: string[] = []): Promise<void> {
    const { packChangedCommand } = await import("../commands/pack.js");
    await packChangedCommand.parseAsync(args, { from: "user" });
  }

  describe("pack", () => {
    it("warns when target path does not exist", async () => {
      mockExistsSync.mockImplementation((p: unknown) => {
        const path = String(p);
        return path.endsWith("pnpm-workspace.yaml");
        // target path does not exist
      });

      await runPack(["services/missing"]);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Path not found")
      );
    });

    it("writes llms.txt and llms-full.txt when target path exists", async () => {
      mockExistsSync.mockImplementation(() => {
        return true; // everything exists
      });

      await runPack(["services/users"]);

      // Should have written files
      expect(mockWriteFileSync).toHaveBeenCalled();
      const output = logSpy.mock.calls.flat().join("\n");
      expect(output).toContain("Packing context");
    });

    it("runs in check mode and exits when llms.txt content is out of sync", async () => {
      mockExistsSync.mockImplementation(() => true);
      // Return content that differs from what the code would generate
      mockReadFileSync.mockReturnValue("outdated content" as never);

      await runPack(["services/users", "--check"]);

      // In check mode with mismatched content, it should exit with error
      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(mockWriteFileSync).not.toHaveBeenCalled();
    });

    it("exits in check mode when llms.txt is missing", async () => {
      mockExistsSync.mockImplementation((p: unknown) => {
        const path = String(p);
        if (path.endsWith("pnpm-workspace.yaml")) return true;
        if (path.includes("services/users") && !path.endsWith("llms.txt")) return true;
        return false; // llms.txt does not exist
      });

      await runPack(["services/users", "--check"]);

      expect(exitSpy).toHaveBeenCalledWith(1);
      const errOutput = errorSpy.mock.calls.flat().join("\n");
      expect(errOutput).toContain("does not exist");
    });
  });

  describe("pack-changed", () => {
    it("logs message when no relevant changes detected", async () => {
      mockExistsSync.mockImplementation((p: unknown) =>
        String(p).endsWith("pnpm-workspace.yaml")
      );
      mockExecSync.mockReturnValue("README.md\nsome-file.json\n" as never);

      await runPackChanged();

      const output = logSpy.mock.calls.flat().join("\n");
      expect(output).toContain("No relevant code changes detected");
    });

    it("packs changed packages for .ts files in recognized dirs", async () => {
      mockExistsSync.mockImplementation(() => true);
      mockExecSync.mockImplementation((cmd: unknown) => {
        if (String(cmd).includes("git diff")) {
          return "services/users/src/index.ts\npackages/rialto/src/Button.ts\n" as never;
        }
        return "" as never;
      });

      await runPackChanged();

      const output = logSpy.mock.calls.flat().join("\n");
      expect(output).toContain("Detected changes");
    });

    it("handles git diff errors gracefully", async () => {
      mockExistsSync.mockImplementation((p: unknown) =>
        String(p).endsWith("pnpm-workspace.yaml")
      );
      mockExecSync.mockImplementation(() => {
        throw new Error("git error");
      });

      await runPackChanged();

      const errOutput = errorSpy.mock.calls.flat().join("\n");
      expect(errOutput).toContain("Error detecting changed files");
    });

    it("uses checkout mode diff when --mode checkout is passed", async () => {
      mockExistsSync.mockImplementation((p: unknown) =>
        String(p).endsWith("pnpm-workspace.yaml")
      );
      mockExecSync.mockReturnValue("" as never);

      await runPackChanged(["--mode", "checkout"]);

      const calls = mockExecSync.mock.calls.map(([cmd]) => String(cmd));
      expect(calls.some((cmd) => cmd.includes("@{1}"))).toBe(true);
    });
  });
});
