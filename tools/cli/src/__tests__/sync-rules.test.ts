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

  it("writes .cursorrules when AGENTS.md exists ", async () => {
    mockExistsSync.mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.endsWith("pnpm-workspace.yaml")) return true;
      if (path.endsWith("AGENTS.md")) return true;
      return false;
    });

    mockReadFileSync.mockReturnValue("# Agents content" as never);

    await runSyncRules();

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining(".cursorrules"),
      expect.stringContaining("# Agents content")
    );

    // Success is now routed through runCommand → console.log (tab-separated rows)
    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain(".cursorrules");
  });

  it("never touches GEMINI.md, even when it exists", async () => {
    mockExistsSync.mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.endsWith("pnpm-workspace.yaml")) return true;
      if (path.endsWith("AGENTS.md")) return true;
      if (path.endsWith("GEMINI.md")) return true;
      return false;
    });
    mockReadFileSync.mockReturnValue("# Agents content" as never);

    await runSyncRules();

    const geminiWrite = mockWriteFileSync.mock.calls.find(([path]) =>
      String(path).endsWith("GEMINI.md")
    );
    expect(geminiWrite).toBeUndefined();
  });
});
