import { describe, it, expect, vi } from "vitest";
import { buildSystemPrompt, loadProjectContext } from "../prompt-builder.js";

// Mock fs modules
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
}));

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

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
