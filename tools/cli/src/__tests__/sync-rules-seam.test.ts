/**
 * Tests for the migrated sync-rules command using the defineCommand seam.
 * Asserts returned CommandResult values directly — no console/process.exit spies.
 */
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

describe("sync-rules command (value-asserted via seam)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(process, "cwd").mockReturnValue("/repo");
  });

  it("returns an error result when AGENTS.md is missing", async () => {
    mockExistsSync.mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.endsWith("pnpm-workspace.yaml")) return true;
      return false;
    });

    const { syncRulesRun } = await import("../commands/sync-rules.js");
    const result = await syncRulesRun({});

    expect(result.kind).toBe("error");
    const err = result as Extract<typeof result, { kind: "error" }>;
    expect(err.message).toContain("AGENTS.md not found");
    expect(err.exitCode).toBe(1);
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  it("returns rows naming .cursorrules as updated when GEMINI.md is absent", async () => {
    mockExistsSync.mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.endsWith("pnpm-workspace.yaml")) return true;
      if (path.endsWith("AGENTS.md")) return true;
      return false; // no GEMINI.md
    });
    mockReadFileSync.mockReturnValue("# Agents content" as never);

    const { syncRulesRun } = await import("../commands/sync-rules.js");
    const result = await syncRulesRun({});

    expect(result.kind).toBe("rows");
    const rows = result as Extract<typeof result, { kind: "rows" }>;
    const flat = JSON.stringify(rows.rows);
    expect(flat).toContain(".cursorrules");
    expect(flat).not.toContain("GEMINI.md");

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining(".cursorrules"),
      expect.stringContaining("# Agents content")
    );
  });

  it("returns rows naming GEMINI.md as updated when it lacks an AGENTS.md reference", async () => {
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

    const { syncRulesRun } = await import("../commands/sync-rules.js");
    const result = await syncRulesRun({});

    expect(result.kind).toBe("rows");
    const rows = result as Extract<typeof result, { kind: "rows" }>;
    const flat = JSON.stringify(rows.rows);
    expect(flat).toContain(".cursorrules");
    expect(flat).toContain("GEMINI.md");

    const geminiWrite = mockWriteFileSync.mock.calls.find(([path]) =>
      String(path).endsWith("GEMINI.md")
    );
    expect(geminiWrite).toBeDefined();
    expect(String(geminiWrite![1])).toContain("AGENTS.md");
  });

  it("omits GEMINI.md from rows when it already references AGENTS.md", async () => {
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

    const { syncRulesRun } = await import("../commands/sync-rules.js");
    const result = await syncRulesRun({});

    expect(result.kind).toBe("rows");
    const rows = result as Extract<typeof result, { kind: "rows" }>;
    const flat = JSON.stringify(rows.rows);
    expect(flat).toContain(".cursorrules");
    expect(flat).not.toContain("GEMINI.md");

    const geminiWrite = mockWriteFileSync.mock.calls.find(([path]) =>
      String(path).endsWith("GEMINI.md")
    );
    expect(geminiWrite).toBeUndefined();
  });
});
