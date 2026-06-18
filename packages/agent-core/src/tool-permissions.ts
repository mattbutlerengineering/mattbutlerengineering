import { resolve } from "node:path";
import type { PermissionResult } from "@anthropic-ai/claude-agent-sdk";
import {
  BLOCKED_TOOLS,
  isBashCommandBlocked,
  normalizeBashCommand as normalizeBashCommandShared,
} from "./gen-permissions.js";

export { normalizeBashCommandShared as normalizeBashCommand };

function isPathWithinWorktree(filePath: string, worktreePath: string): boolean {
  const resolvedFile = resolve(filePath);
  const resolvedWorktree = resolve(worktreePath);
  return resolvedFile === resolvedWorktree || resolvedFile.startsWith(resolvedWorktree + "/");
}

export function createToolPermissionHandler(worktreePath: string) {
  return async (toolName: string, input: Record<string, unknown>): Promise<PermissionResult> => {
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
