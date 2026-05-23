/**
 * OpenCodeAdapter — spawns the OpenCode CLI as a subprocess in an isolated worktree.
 *
 * Used as a failover adapter when Claude and Gemini are rate-limited.
 * The adapter does NOT create worktrees — the router/caller handles that.
 *
 * OpenCode uses `run` subcommand for non-interactive mode (no --yolo
 * equivalent needed — `opencode run` is non-interactive by default).
 */

import { CliAdapterBase } from "./cli-adapter-base.js";
import type { AdapterConfig } from "../cli-adapter.js";

export class OpenCodeAdapter extends CliAdapterBase {
  readonly name = "opencode";
  readonly cliBinary = "opencode";
  protected override get displayName(): string {
    return "OpenCode";
  }

  protected buildArgs(config: AdapterConfig): string[] {
    return ["run", config.taskDescription];
  }

  protected parseOutput(
    _stdout: string,
    stderr: string
  ): { hasChanges: boolean; summary?: string } {
    return { hasChanges: false, summary: stderr || undefined };
  }
}
