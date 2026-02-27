import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const QUALITY_CHECKLIST = [
  "Write clean, readable code that follows existing project patterns",
  "Use TypeScript strict mode — no `any` types unless absolutely necessary",
  "Handle errors explicitly; do not silently swallow exceptions",
  "Write small, focused functions (<50 lines)",
  "Use immutable data patterns — create new objects, never mutate",
  "Add tests for new functionality (vitest)",
  "Run lint and typecheck before marking work complete",
  "Use consistent type imports (`import type { ... }`)",
  "Use double quotes, semicolons, 2-space indentation (Prettier)",
  "Follow conventional commit message format for any commits",
].map((item, i) => `${i + 1}. ${item}`).join("\n");

export function buildSystemPrompt(taskDescription: string): string {
  return [
    "You are an autonomous coding agent. Complete the following task in a single session.",
    "",
    "## Task",
    "",
    taskDescription,
    "",
    "## Quality Checklist",
    "",
    QUALITY_CHECKLIST,
    "",
    "## Rules",
    "",
    "- Work within the current worktree only",
    "- Do not push to remote or create PRs — the orchestrator handles that",
    "- If the task is ambiguous, make reasonable assumptions and document them",
    "- If you encounter a blocker you cannot resolve, explain it clearly and stop",
    "- Commit your changes with a descriptive message when done",
  ].join("\n");
}

export async function loadProjectContext(repoPath: string): Promise<string | null> {
  const claudeMdPath = join(repoPath, "CLAUDE.md");
  if (!existsSync(claudeMdPath)) {
    return null;
  }
  const content = await readFile(claudeMdPath, "utf-8");
  return content;
}
