/**
 * OpenCodeAdapter — spawns the OpenCode CLI as a subprocess in an isolated worktree.
 *
 * Used as a failover adapter when Claude and Gemini are rate-limited.
 * Extends SpawnAndCommitBase for spawn, change detection, and auto-commit.
 *
 * OpenCode uses `run` subcommand for non-interactive mode (no --yolo
 * equivalent needed — `opencode run` is non-interactive by default).
 */

import { SpawnAndCommitBase } from "./spawn-and-commit-base.js";

export class OpenCodeAdapter extends SpawnAndCommitBase {
  readonly name = "opencode";
  protected readonly binary = "opencode";
  protected readonly defaultError = "OpenCode CLI exited with non-zero status";

  protected buildArgs(task: string): string[] {
    return ["run", task];
  }
}
