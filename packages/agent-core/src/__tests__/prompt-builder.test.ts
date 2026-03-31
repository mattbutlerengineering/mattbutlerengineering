import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildSystemPrompt, loadProjectContext, loadSourceFiles } from "../prompt-builder.js";
import type { SourceFileEntry } from "../prompt-builder.js";

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
  it("includes the task description", () => {
    const prompt = buildSystemPrompt("Fix the login bug");
    expect(prompt).toContain("Fix the login bug");
  });

  it("includes quality checklist items", () => {
    const prompt = buildSystemPrompt("Any task");
    expect(prompt).toContain("Write clean, readable code");
    expect(prompt).toContain("Handle errors explicitly");
    expect(prompt).toContain("Use immutable data patterns");
  });

  it("includes rules about worktree restrictions", () => {
    const prompt = buildSystemPrompt("Any task");
    expect(prompt).toContain("Work within the current worktree only");
    expect(prompt).toContain("Do not push to remote or create PRs");
  });

  it("includes instruction about committing changes", () => {
    const prompt = buildSystemPrompt("Any task");
    expect(prompt).toContain("Commit your changes");
  });

  it("appends source file context when entries are provided", () => {
    const entries: readonly SourceFileEntry[] = [
      { path: "src/app.ts", content: "const x = 1;" },
      { path: "src/utils.ts", content: "export function add(a: number, b: number) { return a + b; }" },
    ];
    const prompt = buildSystemPrompt("Fix bug", entries);
    expect(prompt).toContain("## Source File Context");
    expect(prompt).toContain("### `src/app.ts`");
    expect(prompt).toContain("const x = 1;");
    expect(prompt).toContain("### `src/utils.ts`");
    expect(prompt).toContain("export function add");
  });

  it("does not include source file section when no entries provided", () => {
    const prompt = buildSystemPrompt("Fix bug");
    expect(prompt).not.toContain("## Source File Context");
  });

  it("does not include source file section when entries array is empty", () => {
    const prompt = buildSystemPrompt("Fix bug", []);
    expect(prompt).not.toContain("## Source File Context");
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
    expect(entries).toEqual([
      { path: "src/broken.ts", content: "<!-- read error, skipped -->" },
    ]);
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
