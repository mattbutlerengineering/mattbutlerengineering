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
import { parseOpenCodeUsage, type CliUsage } from "./cli-usage-parser.js";

export class OpenCodeAdapter extends CliAdapterBase {
  readonly name = "opencode";
  readonly cliBinary = "opencode";
  protected override get displayName(): string {
    return "OpenCode";
  }

  protected buildArgs(config: AdapterConfig): string[] {
    return ["run", config.taskDescription];
  }

  /**
   * OpenCode CLI's default text output carries no usage data — this only
   * yields real cost/tokenUsage if stdout happens to be the `--format json`
   * NDJSON event stream (not currently requested by buildArgs; see
   * cli-usage-parser.ts).
   */
  protected override parseUsage(stdout: string): CliUsage {
    return parseOpenCodeUsage(stdout);
  }
}
