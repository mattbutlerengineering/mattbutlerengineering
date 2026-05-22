import { join } from "node:path";
import { writeFile, mkdir } from "node:fs/promises";
import type { SessionEvent, SessionEventCallback } from "./types.js";

/**
 * Emit a session event to the provided callback.
 */
export function emitEvent(
  onEvent: SessionEventCallback | undefined,
  type: SessionEvent["type"],
  data: SessionEvent["data"]
): void {
  if (!onEvent) return;
  onEvent({
    type,
    timestamp: new Date().toISOString(),
    data,
  });
}

/**
 * Sanitize text for use in a git commit message.
 * Truncates to 72 characters and replaces newlines with spaces.
 */
export function sanitizeForCommitMessage(text: string): string {
  return text.replace(/[\n\r]/g, " ").slice(0, 72);
}

/**
 * Store full verification output to a file so debugging failures
 * is not limited to truncated snippets.
 */
export async function storeVerificationLog(
  worktreePath: string,
  sections: readonly { readonly label: string; readonly output: string }[]
): Promise<string> {
  const logDir = join(worktreePath, ".agent-work");
  const logPath = join(logDir, "verification.log");
  const content = sections.map((s) => `=== ${s.label} ===\n${s.output}\n`).join("\n");

  try {
    await mkdir(logDir, { recursive: true });
    await writeFile(logPath, content, "utf-8");
  } catch {
    // Best-effort — don't fail the session over logging
  }

  return logPath;
}
