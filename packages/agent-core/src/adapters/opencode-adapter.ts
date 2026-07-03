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
import { parseOpenCodeUsage, extractOpenCodeError, type CliUsage } from "./cli-usage-parser.js";

export class OpenCodeAdapter extends CliAdapterBase {
  readonly name = "opencode";
  readonly cliBinary = "opencode";
  protected override get displayName(): string {
    return "OpenCode";
  }

  protected buildArgs(config: AdapterConfig): string[] {
    return ["run", config.taskDescription, "--format", "json"];
  }

  /**
   * Parses real cost/tokenUsage from the `--format json` NDJSON event
   * stream requested by buildArgs (#3019).
   */
  protected override parseUsage(stdout: string): CliUsage {
    return parseOpenCodeUsage(stdout);
  }

  /**
   * Recovers OpenCode's structured `type: "error"` event message from the
   * same NDJSON stdout stream on failure, falling back to raw stderr in
   * CliAdapterBase.run() when stdout isn't JSON (ADR-017 failure-PR-body
   * contract, #3019).
   */
  protected override parseErrorFromStdout(stdout: string): string | undefined {
    return extractOpenCodeError(stdout);
  }
}
