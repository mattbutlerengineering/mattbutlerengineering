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

export interface SourceFileEntry {
  readonly path: string;
  readonly content: string;
}

export async function loadSourceFiles(
  paths: readonly string[]
): Promise<readonly SourceFileEntry[]> {
  const entries: SourceFileEntry[] = [];
  for (const filePath of paths) {
    if (!existsSync(filePath)) {
      entries.push({ path: filePath, content: "<!-- file not found, skipped -->" });
      continue;
    }
    try {
      const content = await readFile(filePath, "utf-8");
      entries.push({ path: filePath, content });
    } catch {
      entries.push({ path: filePath, content: "<!-- read error, skipped -->" });
    }
  }
  return entries;
}

function formatSourceFileSection(entries: readonly SourceFileEntry[]): string {
  if (entries.length === 0) return "";
  const blocks = entries.map(
    (e) => `### \`${e.path}\`\n\n\`\`\`\n${e.content}\n\`\`\``
  );
  return [
    "",
    "",
    "## Source File Context",
    "",
    "The following files are relevant to this task. Use them as reference — you do not need to re-read them.",
    "",
    ...blocks,
  ].join("\n");
}

export function buildSystemPrompt(
  taskDescription: string,
  sourceFileEntries?: readonly SourceFileEntry[]
): string {
  const base = [
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

  const sourceSection = sourceFileEntries
    ? formatSourceFileSection(sourceFileEntries)
    : "";

  return base + sourceSection;
}

export async function loadProjectContext(repoPath: string): Promise<string | null> {
  const claudeMdPath = join(repoPath, "CLAUDE.md");
  if (!existsSync(claudeMdPath)) {
    return null;
  }
  const content = await readFile(claudeMdPath, "utf-8");
  return content;
}
