/**
 * GeminiCliAdapter — spawns the Gemini CLI as a subprocess in an isolated worktree.
 *
 * Used as a failover adapter when Claude is rate-limited.
 * The adapter does NOT create worktrees — the router/caller handles that.
 */

import { CliAdapterBase } from "./cli-adapter-base.js";
import type { AdapterConfig } from "../cli-adapter.js";

export class GeminiCliAdapter extends CliAdapterBase {
  readonly name = "gemini";
  readonly cliBinary = "gemini";
  protected override get displayName(): string {
    return "Gemini";
  }

  protected buildArgs(config: AdapterConfig): string[] {
    return ["-p", config.taskDescription, "--yolo"];
  }

  protected parseOutput(
    _stdout: string,
    stderr: string
  ): { hasChanges: boolean; summary?: string } {
    return { hasChanges: false, summary: stderr || undefined };
  }
}
