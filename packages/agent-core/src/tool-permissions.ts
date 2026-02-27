import { resolve } from "node:path";
import type { PermissionResult } from "@anthropic-ai/claude-agent-sdk";

/** Patterns that should never be executed by an agent session. */
const BLOCKED_BASH_PATTERNS: readonly RegExp[] = [
  /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*\s+(-[a-zA-Z]*f[a-zA-Z]*\s+)?|(-[a-zA-Z]*f[a-zA-Z]*\s+)?-[a-zA-Z]*r[a-zA-Z]*\s+|--recursive\s+).*\//,
  /\brm\s+.*\/\*/,              // rm ... /*
  /\bsudo\b/,                    // sudo anything
  /\bcurl\b.*\|\s*\bbash\b/,    // curl | bash (pipe to shell)
  /\bwget\b.*\|\s*\bbash\b/,    // wget | bash
  /\bgit\s+push\b/,             // git push (orchestrator handles this)
  /\bnpm\s+publish\b/,          // npm publish
  /\bpnpm\s+publish\b/,         // pnpm publish
];

/** Tools that are always blocked in agent sessions. */
const BLOCKED_TOOLS: ReadonlySet<string> = new Set([
  "WebSearch",
  "WebFetch",
  "AskUserQuestion",
  "EnterPlanMode",
  "EnterWorktree",
]);

function isBashCommandBlocked(command: string): string | null {
  for (const pattern of BLOCKED_BASH_PATTERNS) {
    if (pattern.test(command)) {
      return `Blocked: command matches dangerous pattern ${pattern.source}`;
    }
  }
  return null;
}

function isPathWithinWorktree(filePath: string, worktreePath: string): boolean {
  const resolvedFile = resolve(filePath);
  const resolvedWorktree = resolve(worktreePath);
  return resolvedFile === resolvedWorktree || resolvedFile.startsWith(resolvedWorktree + "/");
}

export function createToolPermissionHandler(worktreePath: string) {
  return async (
    toolName: string,
    input: Record<string, unknown>
  ): Promise<PermissionResult> => {
    // Block explicitly disallowed tools
    if (BLOCKED_TOOLS.has(toolName)) {
      return {
        behavior: "deny",
        message: `Tool "${toolName}" is not allowed in agent sessions`,
      };
    }

    // Check bash commands against blocked patterns
    if (toolName === "Bash") {
      const command = input.command as string | undefined;
      if (command) {
        const blockReason = isBashCommandBlocked(command);
        if (blockReason) {
          return { behavior: "deny", message: blockReason };
        }
      }
    }

    // Block file writes outside the worktree (resolve to prevent path traversal)
    if (toolName === "Write" || toolName === "Edit") {
      const filePath = (input.file_path ?? input.filePath) as string | undefined;
      if (filePath && !isPathWithinWorktree(filePath, worktreePath)) {
        return {
          behavior: "deny",
          message: `File operations are restricted to the worktree: ${worktreePath}`,
        };
      }
    }

    return { behavior: "allow", updatedInput: input };
  };
}
