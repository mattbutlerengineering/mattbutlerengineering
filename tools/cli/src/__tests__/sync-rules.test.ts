import { describe, it, expect, vi, beforeEach } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);

describe("sync-rules command", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    vi.spyOn(process, "cwd").mockReturnValue("/repo");
  });

  async function runSyncRules(): Promise<void> {
    const { syncRulesCommand } = await import("../commands/sync-rules.js");
    await syncRulesCommand.parseAsync([], { from: "user" });
  }

  it("exits with error when AGENTS.md not found", async () => {
    mockExistsSync.mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.endsWith("pnpm-workspace.yaml")) return true;
      return false;
    });

    await runSyncRules();

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errOutput).toContain("AGENTS.md not found");
  });

  it("writes .cursorrules when AGENTS.md exists (no GEMINI.md)", async () => {
    mockExistsSync.mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.endsWith("pnpm-workspace.yaml")) return true;
      if (path.endsWith("AGENTS.md")) return true;
      return false; // no GEMINI.md
    });

    mockReadFileSync.mockReturnValue("# Agents content" as never);

    await runSyncRules();

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining(".cursorrules"),
      expect.stringContaining("# Agents content")
    );

    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("Updated .cursorrules");
    expect(output).toContain("Successfully synchronized");
  });

  it("updates GEMINI.md when it exists and lacks AGENTS.md reference", async () => {
    mockExistsSync.mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.endsWith("pnpm-workspace.yaml")) return true;
      if (path.endsWith("AGENTS.md")) return true;
      if (path.endsWith("GEMINI.md")) return true;
      return false;
    });

    mockReadFileSync.mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.endsWith("GEMINI.md")) return "# Gemini specific content" as never;
      return "# Agents content" as never;
    });

    await runSyncRules();

    // Should write to GEMINI.md since it doesn't contain AGENTS.md reference
    const geminiWrite = mockWriteFileSync.mock.calls.find(
      ([path]) => String(path).endsWith("GEMINI.md")
    );
    expect(geminiWrite).toBeDefined();
    expect(String(geminiWrite![1])).toContain("AGENTS.md");

    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("Verified GEMINI.md reference");
  });

  it("skips GEMINI.md update when AGENTS.md reference already present", async () => {
    mockExistsSync.mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.endsWith("pnpm-workspace.yaml")) return true;
      if (path.endsWith("AGENTS.md")) return true;
      if (path.endsWith("GEMINI.md")) return true;
      return false;
    });

    mockReadFileSync.mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.endsWith("GEMINI.md"))
        return "# Gemini specific content\nSee AGENTS.md for details" as never;
      return "# Agents content" as never;
    });

    await runSyncRules();

    // GEMINI.md should NOT be rewritten since it already has the reference
    const geminiWrite = mockWriteFileSync.mock.calls.find(
      ([path]) => String(path).endsWith("GEMINI.md")
    );
    expect(geminiWrite).toBeUndefined();
  });
});
