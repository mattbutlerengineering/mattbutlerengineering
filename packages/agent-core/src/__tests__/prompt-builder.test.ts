import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildSystemPrompt, loadProjectContext, loadSourceFiles } from "../prompt-builder.js";
import type { SourceFileEntry, PromptBuilderConfig } from "../prompt-builder.js";

// Mock fs modules
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
}));

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("buildSystemPrompt", () => {
  it("includes the task description", async () => {
    const prompt = await buildSystemPrompt("Fix the login bug");
    expect(prompt).toContain("Fix the login bug");
  });

  it("includes quality checklist items", async () => {
    const prompt = await buildSystemPrompt("Any task");
    expect(prompt).toContain("Write clean, readable code");
    expect(prompt).toContain("Handle errors explicitly");
    expect(prompt).toContain("Use immutable data patterns");
  });

  it("includes rules about worktree restrictions", async () => {
    const prompt = await buildSystemPrompt("Any task");
    expect(prompt).toContain("Work within the current worktree only");
    expect(prompt).toContain("Do not push to remote or create PRs");
  });

  it("includes instruction about committing changes", async () => {
    const prompt = await buildSystemPrompt("Any task");
    expect(prompt).toContain("Commit your changes");
  });

  it("appends source file context when entries are provided", async () => {
    const entries: readonly SourceFileEntry[] = [
      { path: "src/app.ts", content: "const x = 1;" },
      {
        path: "src/utils.ts",
        content: "export function add(a: number, b: number) { return a + b; }",
      },
    ];
    const config: PromptBuilderConfig = { sourceFileEntries: entries };
    const prompt = await buildSystemPrompt("Fix bug", config);
    expect(prompt).toContain("## Source File Context");
    expect(prompt).toContain("### `src/app.ts`");
    expect(prompt).toContain("const x = 1;");
    expect(prompt).toContain("### `src/utils.ts`");
    expect(prompt).toContain("export function add");
  });

  it("does not include source file section when no entries provided", async () => {
    const prompt = await buildSystemPrompt("Fix bug");
    expect(prompt).not.toContain("## Source File Context");
  });

  it("does not include source file section when entries array is empty", async () => {
    const config: PromptBuilderConfig = { sourceFileEntries: [] };
    const prompt = await buildSystemPrompt("Fix bug", config);
    expect(prompt).not.toContain("## Source File Context");
  });

  it("includes issue context when provided", async () => {
    const config: PromptBuilderConfig = {
      relevantIssueContext: "This bug affects the login flow",
    };
    const prompt = await buildSystemPrompt("Fix bug", config);
    expect(prompt).toContain("## GitHub Issue Context");
    expect(prompt).toContain("This bug affects the login flow");
  });

  it("includes failure context when provided", async () => {
    const config: PromptBuilderConfig = {
      failureContext: "Previous attempt failed with max_turns",
    };
    const prompt = await buildSystemPrompt("Fix bug", config);
    expect(prompt).toContain("## Past Failure Context");
    expect(prompt).toContain("Previous attempt failed");
  });

  it("includes Haiku-specific constraints", async () => {
    const config: PromptBuilderConfig = { model: "claude-haiku-4-5" };
    const prompt = await buildSystemPrompt("Fix bug", config);
    expect(prompt).toContain("## Constraints (Haiku)");
    expect(prompt).toContain("Max 15 turns");
  });

  it("includes Opus-specific focus", async () => {
    const config: PromptBuilderConfig = { model: "claude-opus-4-6" };
    const prompt = await buildSystemPrompt("Fix bug", config);
    expect(prompt).toContain("## Focus (Opus)");
    expect(prompt).toContain("system-wide impact");
  });

  it("includes verification steps when provided", async () => {
    const config: PromptBuilderConfig = {
      verificationSteps: ["Run npm test", "Check lint passes"],
    };
    const prompt = await buildSystemPrompt("Fix bug", config);
    expect(prompt).toContain("## Verification Steps");
    expect(prompt).toContain("Run npm test");
    expect(prompt).toContain("Check lint passes");
  });
});

describe("loadSourceFiles", () => {
  it("reads existing files and returns entries", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFile)
      .mockResolvedValueOnce("file one content")
      .mockResolvedValueOnce("file two content");

    const entries = await loadSourceFiles(["src/a.ts", "src/b.ts"]);
    expect(entries).toEqual([
      { path: "src/a.ts", content: "file one content" },
      { path: "src/b.ts", content: "file two content" },
    ]);
  });

  it("handles missing files gracefully", async () => {
    vi.mocked(existsSync).mockReturnValueOnce(true).mockReturnValueOnce(false);
    vi.mocked(readFile).mockResolvedValueOnce("exists");

    const entries = await loadSourceFiles(["src/exists.ts", "src/missing.ts"]);
    expect(entries).toEqual([
      { path: "src/exists.ts", content: "exists" },
      { path: "src/missing.ts", content: "<!-- file not found, skipped -->" },
    ]);
  });

  it("handles read errors gracefully", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFile).mockRejectedValueOnce(new Error("permission denied"));

    const entries = await loadSourceFiles(["src/broken.ts"]);
    expect(entries).toEqual([{ path: "src/broken.ts", content: "<!-- read error, skipped -->" }]);
  });

  it("returns empty array for empty input", async () => {
    const entries = await loadSourceFiles([]);
    expect(entries).toEqual([]);
  });
});

describe("loadProjectContext", () => {
  it("returns file content when CLAUDE.md exists", async () => {
    vi.mocked(existsSync).mockReturnValueOnce(true);
    vi.mocked(readFile).mockResolvedValueOnce("# Project Context\nSome rules");

    const result = await loadProjectContext("/repo");
    expect(result).toBe("# Project Context\nSome rules");
    expect(readFile).toHaveBeenCalledWith("/repo/CLAUDE.md", "utf-8");
  });

  it("returns null when CLAUDE.md does not exist", async () => {
    vi.mocked(existsSync).mockReturnValueOnce(false);

    const result = await loadProjectContext("/repo");
    expect(result).toBeNull();
  });
});
