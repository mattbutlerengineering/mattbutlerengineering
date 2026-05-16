import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const QUALITY_CHECKLIST = [
  "Write clean, readable code that follows existing project patterns",
  "Use TypeScript strict mode — no `any` types unless absolutely necessary",
  "Handle errors explicitly; do not silently swallow exceptions",
  "Write small, focused functions (<50 lines)",
  "Use immutable data patterns — create new objects, never mutate",
  "Add tests for new functionality (vitest) — your work will be rejected if tests fail",
  "Run `pnpm turbo lint typecheck test --filter=...[HEAD~1]` before committing — the orchestrator will verify this and reject your PR if any fail",
  "Use consistent type imports (`import type { ... }`)",
  "Use double quotes, semicolons, 2-space indentation (Prettier)",
  "Follow conventional commit message format for any commits",
  "If the issue includes a verification command (curl, test assertion), run it to confirm your fix works",
]
  .map((item, i) => `${i + 1}. ${item}`)
  .join("\n");

export interface SourceFileEntry {
  readonly path: string;
  readonly content: string;
}

export interface PromptBuilderConfig {
  sourceFileEntries?: readonly SourceFileEntry[];
  relevantLlmsFiles?: readonly string[];
  relevantIssueContext?: string;
  failureContext?: string;
  model?: string;
  verificationSteps?: readonly string[];
  prExamplesSection?: string;
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
  const blocks = entries.map((e) => `### \`${e.path}\`\n\n\`\`\`\n${e.content}\n\`\`\``);
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

function formatLlmsContext(filePaths: readonly string[]): string {
  if (filePaths.length === 0) return "";
  const sections = filePaths
    .map((filePath) => {
      if (!existsSync(filePath)) return null;
      try {
        const content = readFile(filePath, "utf-8");
        return `### ${filePath}\n\n${content}\n`;
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  if (sections.length === 0) return "";
  return [
    "",
    "",
    "## Package Context (llms.txt)",
    "",
    "Key types and signatures from relevant packages:",
    "",
    ...sections,
  ].join("\n");
}

function formatIssueContext(issueContext: string): string {
  if (!issueContext) return "";
  return ["", "", "## GitHub Issue Context", "", issueContext].join("\n");
}

function formatFailureContext(failureContext: string): string {
  if (!failureContext) return "";
  return ["", "", "## Past Failure Context", "", failureContext].join("\n");
}

function formatModelConstraints(model?: string): string {
  if (!model) return "";

  const isHaiku = model.includes("haiku");
  const isOpus = model.includes("opus");

  if (isHaiku) {
    return [
      "",
      "",
      "## Constraints (Haiku)",
      "",
      "- Max 15 turns — stay focused",
      "- Single focused change only",
      "- Avoid complex refactors",
      "- Use existing patterns from codebase",
    ].join("\n");
  }

  if (isOpus) {
    return [
      "",
      "",
      "## Focus (Opus)",
      "",
      "- Consider system-wide impact",
      "- Document trade-offs in PR",
      "- Think through edge cases",
      "- Ensure backward compatibility",
    ].join("\n");
  }

  return "";
}

function formatVerificationSteps(steps: readonly string[]): string {
  if (steps.length === 0) return "";
  return [
    "",
    "",
    "## Verification Steps",
    "",
    "Run these to confirm your solution works:",
    ...steps.map((s, i) => `${i + 1}. ${s}`),
  ].join("\n");
}

export async function buildSystemPrompt(
  taskDescription: string,
  config?: PromptBuilderConfig
): Promise<string> {
  const {
    sourceFileEntries,
    relevantLlmsFiles = [],
    relevantIssueContext,
    failureContext,
    model,
    verificationSteps = [],
    prExamplesSection,
  } = config ?? {};

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
    "- IMPORTANT: After committing, the orchestrator runs lint, typecheck, and tests. If they fail, your PR is created as a draft and marked as failed. Fix issues before committing.",
    "- IMPORTANT: A security reviewer scans your diff for hardcoded secrets, XSS, SQL injection, and accessibility issues. Any finding blocks the PR.",
  ].join("\n");

  const sourceSection = sourceFileEntries ? formatSourceFileSection(sourceFileEntries) : "";
  const llmsSection = formatLlmsContext(relevantLlmsFiles);
  const issueSection = formatIssueContext(relevantIssueContext ?? "");
  const failureSection = formatFailureContext(failureContext ?? "");
  const modelSection = formatModelConstraints(model);
  const verificationSection = formatVerificationSteps(verificationSteps);

  return [
    base,
    issueSection,
    failureSection,
    modelSection,
    verificationSection,
    sourceSection,
    llmsSection,
    prExamplesSection ?? "",
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
