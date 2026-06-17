/**
 * GeminiCliAdapter — spawns the Gemini CLI as a subprocess in an isolated worktree.
 *
 * Used as a failover adapter when Claude is rate-limited.
 * Extends SpawnAndCommitBase for spawn, change detection, and auto-commit.
 */

import { SpawnAndCommitBase } from "./spawn-and-commit-base.js";

export class GeminiCliAdapter extends SpawnAndCommitBase {
  readonly name = "gemini";
  protected readonly binary = "gemini";
  protected readonly defaultError = "Gemini CLI exited with non-zero status";

  /**
   * Gemini CLI args: `-p <task> --yolo` for non-interactive execution.
   */
  protected buildArgs(task: string): string[] {
    return ["-p", task, "--yolo"];
  }
}
